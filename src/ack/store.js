// The phone's queue of signatures «after the work» (queue.js) on the real store (storeQueue.js) and the API
import { ackAPI } from '../services/api';
import { ackQueueStore } from './storeQueue';
import { makeAckQueue } from './queue.js';

export const acks = makeAckQueue({
  queue: ackQueueStore,
  api: { sign: (visitId, body) => ackAPI.sign(visitId, body) },
});
