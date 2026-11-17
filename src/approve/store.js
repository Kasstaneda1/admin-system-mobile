// The phone's signature queue (queue.js) on the real store (storeQueue.js) and the API
import { approveAPI } from '../services/api';
import { approveQueueStore } from './storeQueue';
import { makeApproveQueue } from './queue.js';

export const approvals = makeApproveQueue({
  queue: approveQueueStore,
  api: { sign: (visitId, body) => approveAPI.sign(visitId, body) },
});
