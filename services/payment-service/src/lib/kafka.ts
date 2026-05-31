import { Kafka } from 'kafkajs'

let producer: any = null

export async function getProducer() {
  if (!producer) {
    const kafka = new Kafka({
      clientId: 'payment-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      ssl: process.env.KAFKA_SSL === 'true',
      sasl: process.env.KAFKA_USERNAME
        ? { mechanism: 'scram-sha-256', username: process.env.KAFKA_USERNAME, password: process.env.KAFKA_PASSWORD! }
        : undefined,
    })
    producer = kafka.producer()
    await producer.connect()
  }
  return producer
}

export async function publishEvent(topic: string, key: string, value: object) {
  try {
    const p = await getProducer()
    await p.send({ topic, messages: [{ key, value: JSON.stringify(value) }] })
  } catch (err) {
    console.error('Kafka error:', err)
  }
}
