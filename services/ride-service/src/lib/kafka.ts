import { Kafka } from 'kafkajs'

let kafka: Kafka | null = null
let producerInstance: any = null

export function getKafka() {
  if (kafka) return kafka
  kafka = new Kafka({
    clientId: 'ride-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    ssl: process.env.KAFKA_SSL === 'true',
    sasl: process.env.KAFKA_USERNAME
      ? { mechanism: 'scram-sha-256', username: process.env.KAFKA_USERNAME, password: process.env.KAFKA_PASSWORD! }
      : undefined,
  })
  return kafka
}

export async function getProducer() {
  if (!producerInstance) {
    producerInstance = getKafka().producer()
    await producerInstance.connect()
  }
  return producerInstance
}

export async function publishEvent(topic: string, key: string, value: object) {
  try {
    const producer = await getProducer()
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value) }],
    })
  } catch (err) {
    console.error('Kafka publish error:', err)
  }
}
