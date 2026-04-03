import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/emailQueue.js';
import { inappQueue } from '../queues/inappQueue.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/dashboard');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(inappQueue)],
  serverAdapter,
});

export default serverAdapter.getRouter();
