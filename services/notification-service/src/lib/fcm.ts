import admin from 'firebase-admin'

let initialized = false

export function initFCM() {
  if (initialized || !process.env.FIREBASE_PROJECT_ID) { initialized = true; return }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
  initialized = true
}

export async function sendPush(token: string, title: string, body: string, data?: Record<string, string>) {
  if (!initialized || !process.env.FIREBASE_PROJECT_ID) {
    console.log(`[DEV] Push: ${title} - ${body}`)
    return
  }
  try {
    await admin.messaging().send({ token, notification: { title, body }, data })
  } catch (err: any) {
    console.error('FCM send error:', err.message)
  }
}

export async function sendToTopic(topic: string, title: string, body: string, data?: Record<string, string>) {
  if (!initialized || !process.env.FIREBASE_PROJECT_ID) {
    console.log(`[DEV] Push to topic ${topic}: ${title} - ${body}`)
    return
  }
  try {
    await admin.messaging().send({ topic, notification: { title, body }, data })
  } catch (err: any) {
    console.error('FCM topic error:', err.message)
  }
}
