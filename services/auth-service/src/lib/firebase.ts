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
    // Dev token format: "dev_token_+919999999999" — strip prefix to get phone
    const phone = idToken.startsWith('dev_token_') ? idToken.slice('dev_token_'.length) : idToken
    return { phone }
  }
  const decoded = await admin.auth().verifyIdToken(idToken)
  if (!decoded.phone_number) throw new Error('No phone number in token')
  return { phone: decoded.phone_number }
}
