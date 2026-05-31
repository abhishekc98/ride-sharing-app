import admin from 'firebase-admin'

let initialized = false

export function initFirebase() {
  if (initialized) return
  if (process.env.DEV_BYPASS_OTP === 'true') {
    initialized = true
    return
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
  initialized = true
}

export async function verifyFirebaseToken(idToken: string): Promise<{ phone: string }> {
  if (process.env.DEV_BYPASS_OTP === 'true') {
    // Dev mode: token is phone number directly
    return { phone: idToken }
  }
  const decoded = await admin.auth().verifyIdToken(idToken)
  if (!decoded.phone_number) throw new Error('No phone number in token')
  return { phone: decoded.phone_number }
}
