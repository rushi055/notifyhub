import { Kafka } from 'kafkajs';
import { config } from '../config/index.js';

const kafka = new Kafka({
  clientId: 'notifyhub',
  brokers: config.kafkaBrokers,
  retry: { retries: 5 },
});

export default kafka;
