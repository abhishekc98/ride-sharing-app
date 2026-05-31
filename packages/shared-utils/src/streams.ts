/**
 * Redis Streams wrapper — drop-in replacement for Kafka.
 * Uses Upstash Redis (same instance, no extra service needed).
 *
 * Producer: publishEvent(stream, key, data)
 * Consumer: consumeStream(stream, groupId, handler)
 *
 * Stream names mirror previous Kafka topics:
 *   ride.state_changed
 *   payment.processed
 */
import Redis from 'ioredis'

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })
}

// ── Producer ─────────────────────────────────────────────────────────────────

export async function publishEvent(
  redis: Redis,
  stream: string,
  key: string,
  data: object
): Promise<void> {
  try {
    // XADD stream * key value  — '*' auto-generates message ID
    await redis.xadd(stream, '*', 'key', key, 'data', JSON.stringify(data))
  } catch (err) {
    console.error(`[streams] publish error on ${stream}:`, err)
  }
}

// ── Consumer ─────────────────────────────────────────────────────────────────

export async function ensureConsumerGroup(
  redis: Redis,
  stream: string,
  groupId: string
): Promise<void> {
  try {
    // MKSTREAM creates the stream if it doesn't exist yet
    await (redis as any).xgroup('CREATE', stream, groupId, '$', 'MKSTREAM')
  } catch (err: any) {
    // BUSYGROUP = group already exists — safe to ignore
    if (!err.message?.includes('BUSYGROUP')) throw err
  }
}

export async function consumeStream(
  redis: Redis,
  stream: string,
  groupId: string,
  consumerId: string,
  handler: (data: any) => Promise<void>
): Promise<void> {
  await ensureConsumerGroup(redis, stream, groupId)

  console.log(`[streams] Consumer ${consumerId} listening on ${stream} (group: ${groupId})`)

  // First, re-process any unacknowledged messages from previous runs (PEL)
  await drainPending(redis, stream, groupId, consumerId, handler)

  // Main consume loop
  while (true) {
    try {
      // XREADGROUP blocks up to 5s waiting for new messages
      const results = await (redis as any).xreadgroup(
        'GROUP', groupId, consumerId,
        'COUNT', 10,
        'BLOCK', 5000,
        'STREAMS', stream, '>'
      ) as Array<[string, Array<[string, string[]]>]> | null

      if (!results) continue

      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          try {
            const dataStr = fields[fields.indexOf('data') + 1]
            const data = JSON.parse(dataStr)
            await handler(data)
            // Acknowledge only after successful processing
            await redis.xack(stream, groupId, id)
          } catch (err) {
            console.error(`[streams] handler error on ${stream} id=${id}:`, err)
            // Leave un-acked — will be retried on next PEL drain
          }
        }
      }
    } catch (err: any) {
      if (err.message?.includes('NOGROUP')) {
        await ensureConsumerGroup(redis, stream, groupId)
      } else {
        console.error(`[streams] read error on ${stream}:`, err)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }
}

async function drainPending(
  redis: Redis,
  stream: string,
  groupId: string,
  consumerId: string,
  handler: (data: any) => Promise<void>
): Promise<void> {
  // Read pending messages (id '0' = all unacknowledged from this consumer)
  const results = await (redis as any).xreadgroup(
    'GROUP', groupId, consumerId,
    'COUNT', 100,
    'STREAMS', stream, '0'
  ) as Array<[string, Array<[string, string[]]>]> | null

  if (!results) return

  for (const [, messages] of results) {
    for (const [id, fields] of messages) {
      try {
        const dataStr = fields[fields.indexOf('data') + 1]
        if (!dataStr) { await redis.xack(stream, groupId, id); continue }
        await handler(JSON.parse(dataStr))
        await redis.xack(stream, groupId, id)
      } catch (err) {
        console.error(`[streams] pending reprocess error id=${id}:`, err)
      }
    }
  }
}
