import kafka from './client.js';

const producer = kafka.producer();

export async function connectProducer() {
  await producer.connect();
  console.log('Kafka producer connected');
}

export async function publishNotification(notification) {
  const result = await producer.send({
    topic: 'notifications',
    messages: [
      {
        key: notification.userId,
        value: JSON.stringify(notification),
      },
    ],
  });

  console.log(
    `Published notification ${notification.id} to partition ${result[0].partition}`
  );
}

export async function disconnectProducer() {
  await producer.disconnect();
  console.log('Kafka producer disconnected');
}

process.on('SIGTERM', async () => {
  await disconnectProducer();
  process.exit(0);
});
