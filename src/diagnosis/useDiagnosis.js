// Writing the diagnosis from a screen (the visit, the bill): the sheet's state and the
// requests, one at a time. What a request is and how a failure reads is model.js.
//   id — the visit; current — diagnosisOf() of what the screen shows now (or null);
//   onAnswer({ visit, diagnosis }, mark) — the server's visit and diagnosis after a save, a
//     conflict or a refusal (raw, either may be null): the screen shows and keeps them;
//   onGone(mark) — 404: not the technician's visit any more;
//   begin() — taken before each request and handed back (VisitScreen: myDayMark(), so an
//     answer after sign out is not kept).
// The text typed stays while the screen is open: a sheet closed by mistake, or a save without
// an answer, loses nothing; Try again sends the same request (the same id).
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { myDayAPI } from '../services/api';
import { logError } from '../utils/logError';
import { conflictOf, diagnosisBody, diagnosisError, diagnosisRequest } from './model';

export function useDiagnosis({ id, current, onAnswer, onGone, begin = () => null, nowMs = () => Date.now() }) {
  const [mode, setMode] = useState(null);                 // the open sheet: 'write' | 'edit' | 'add'
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [theirs, setTheirs] = useState(null);             // «Someone changed it before you»
  const held = useRef(null);                              // { mode, text } not sent when the sheet closed
  const base = useRef(0);                                 // the version the text is written on
  const last = useRef(null);                              // the last request, for Try again
  const busy = useRef(false);

  const open = useCallback((next) => {
    if (!current || !next) return;
    const kind = next === 'add' ? 'add' : 'edit';
    const kept = held.current && (held.current.mode === 'add' ? 'add' : 'edit') === kind ? held.current.text : null;
    setText(kept !== null ? kept : kind === 'add' ? '' : current.text || '');
    if (kept === null) base.current = current.version;
    setFailure(null);
    setTheirs(null);
    setMode(next);
  }, [current]);

  const close = useCallback(() => {
    if (busy.current) return;
    held.current = mode ? { mode, text } : held.current;
    setMode(null);
    setTheirs(null);
  }, [mode, text]);

  // One save: { ok } or { ok: false, kind, text } (offline, failed, conflict, locked, gone,
  // refused). sheet: the sheet is open and shows what happened (the Finish sheet shows it itself)
  const run = useCallback(async (kind, typed, { sheet = true } = {}) => {
    if (busy.current) return { ok: false, kind: 'busy' };
    busy.current = true;
    const mark = begin();
    const request = diagnosisRequest(last.current, { mode: kind, text: typed, baseVersion: base.current }, nowMs());
    last.current = request;
    setSending(true);
    setFailure(null);
    try {
      const body = diagnosisBody(request);
      const data = kind === 'add' ? await myDayAPI.addToDiagnosis(id, body) : await myDayAPI.diagnosis(id, body);
      last.current = null;
      held.current = null;
      if (sheet) { setMode(null); setTheirs(null); setText(''); }
      await onAnswer({ visit: data && data.visit ? data.visit : null, diagnosis: data && data.diagnosis ? data.diagnosis : null }, mark);
      return { ok: true };
    } catch (error) {
      const failed = diagnosisError(error);
      if (failed.kind === 'gone') {
        if (sheet) setMode(null);
        onGone(mark);
      } else if (failed.kind === 'conflict') {
        // their text to choose from; the visit as it is now under the sheet
        last.current = null;
        setTheirs(failed.theirs);
        await onAnswer({ visit: failed.visit, diagnosis: failed.diagnosis }, mark);
      } else if (failed.kind === 'locked') {
        // the bill went out meanwhile: the same text, now as an addition
        last.current = null;
        held.current = { mode: 'add', text: typed };
        if (sheet) { setMode('add'); setFailure(failed.text); }
        await onAnswer({ visit: failed.visit, diagnosis: failed.diagnosis }, mark);
      } else if (failed.kind === 'refused') {
        last.current = null;
        if (failed.visit || failed.diagnosis) await onAnswer({ visit: failed.visit, diagnosis: failed.diagnosis }, mark);
        if (sheet && failed.visit) setMode(null);
        Alert.alert(failed.text);
      } else {
        if (failed.kind === 'failed') logError('Error saving the diagnosis:', error);
        if (sheet) setFailure(failed.text);
      }
      return { ok: false, kind: failed.kind, text: failed.text };
    } finally {
      busy.current = false;
      setSending(false);
    }
  }, [id, onAnswer, onGone, begin, nowMs]);

  const save = useCallback(() => run(mode === 'add' ? 'add' : 'edit', text), [run, mode, text]);
  // «Keep their text»: nothing sent, the sheet closes; the screen already shows theirs
  const keepTheirs = useCallback(() => {
    held.current = null;
    last.current = null;
    setTheirs(null);
    setMode(null);
  }, []);
  // «Save mine instead»: this text written on their version
  const saveMine = useCallback(() => {
    if (!theirs) return Promise.resolve({ ok: false });
    base.current = theirs.version;
    setTheirs(null);
    return run('edit', text);
  }, [run, theirs, text]);

  // The Finish sheet saves its field before the finish: the text written on the version the
  // sheet opened with (startFinish), its failure shown by the sheet. A conflict opens this
  // sheet with the text and theirs (openConflict).
  const startFinish = useCallback(() => {
    if (current) base.current = current.version;
    last.current = null;
  }, [current]);
  const saveForFinish = useCallback((typed) => run('edit', typed, { sheet: false }), [run]);
  // After a conflict in the Finish sheet, once that sheet has gone (iOS shows one sheet at a
  // time): this sheet with the typed text and theirs
  const openConflict = useCallback((typed) => {
    held.current = null;
    setText(typed);
    setFailure(null);
    setMode('edit');
  }, []);

  return {
    sheet: { visible: !!mode, mode, text, sending, failure, conflict: conflictOf(theirs), current: current ? current.text : null },
    open, close, save, setText, keepTheirs, saveMine, startFinish, saveForFinish, openConflict,
  };
}
