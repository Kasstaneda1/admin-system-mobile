// node --test: what the app writes to its log about a failure (logError.js). A real axios with a
// fake server (an axios adapter), no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inspect } from 'node:util';
import { fileURLToPath } from 'node:url';
import axios, { AxiosError } from 'axios';
import { errorSummary, logError } from './logError.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-access-token.sig';
const PASSWORD = 'secret-password-123';

// An API client like the app's: the token in the Authorization header, the server answers `status`
// (0: no answer at all)
function client(status) {
  const adapter = async (config) => {
    if (status === 0) throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    const response = { status, statusText: String(status), data: { error: 'Refused' }, headers: {}, config, request: {} };
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
  };
  return axios.create({ baseURL: 'http://stand.test', adapter, headers: { Authorization: `Bearer ${TOKEN}` } });
}

async function failure(status, send = (api) => api.get('/api/warehouse/warehouses')) {
  try {
    await send(client(status));
  } catch (error) {
    return error;
  }
  throw new Error('the request did not fail');
}

// What console.error is given while `run` runs
function logged(t, run) {
  const calls = [];
  t.mock.method(console, 'error', (...args) => { calls.push(args); });
  run();
  return calls;
}

test('the error object itself carries the token and the password: that is why it is never logged', async () => {
  const error = await failure(401, (api) => api.post('/api/login', { username: 'tech', password: PASSWORD }));
  const printed = inspect(error, { depth: 6 });
  assert.ok(printed.includes(TOKEN));
  assert.ok(printed.includes(PASSWORD));
});

test('a server refusal: the label, the message and the status, nothing of the request', async (t) => {
  const error = await failure(500);
  const calls = logged(t, () => logError('Failed to load warehouse:', error));
  assert.deepEqual(calls, [['Failed to load warehouse:', 'Request failed with status code 500 (status 500)']]);
});

test('a failed login logs neither the password nor the token', async (t) => {
  const error = await failure(403, (api) => api.post('/api/login', { username: 'tech', password: PASSWORD }));
  const calls = logged(t, () => logError('Login error:', error));
  assert.equal(calls.length, 1);
  for (const arg of calls[0]) {
    assert.equal(typeof arg, 'string');
    assert.ok(!arg.includes(PASSWORD) && !arg.includes(TOKEN), arg);
  }
  assert.deepEqual(calls[0], ['Login error:', 'Request failed with status code 403 (status 403)']);
});

test('no answer from the server: the message alone', async () => {
  assert.equal(errorSummary(await failure(0)), 'Network Error');
});

test('whatever else was thrown', () => {
  assert.equal(errorSummary(new Error('Bad date')), 'Bad date');
  assert.equal(errorSummary('Something broke'), 'Something broke');
  assert.equal(errorSummary(null), 'Unknown error');
  assert.equal(errorSummary(undefined), 'Unknown error');
  assert.equal(errorSummary({ config: { headers: { Authorization: `Bearer ${TOKEN}` } } }), 'Unknown error');
  assert.equal(errorSummary({ message: '', response: { status: 404 } }), 'Unknown error (status 404)');
  assert.equal(errorSummary({ message: 'Odd', response: { status: '500' } }), 'Odd');
});

// The app's code (src/ and App.js) writes to the log only through logError
test('no console call in the app outside logError.js', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = [join(root, 'App.js')];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|jsx|ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(path);
    }
  };
  walk(join(root, 'src'));
  const found = [];
  for (const file of files) {
    const name = relative(root, file);
    if (name === join('src', 'utils', 'logError.js')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\bconsole\s*\.\s*\w+/.test(line)) found.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.ok(files.length > 20, `only ${files.length} files read`);
  assert.deepEqual(found, []);
});
