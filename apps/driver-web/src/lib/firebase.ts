'use client'

let firebaseApp: any = null

function getFirebaseApp() {
  if (typeof window === 'undefined') throw new Error('Firebase client-only')
  if (firebaseApp) return firebaseApp
  const { initializeApp, getApps } = require('firebase/app')
  if (getApps().length > 0) return (firebaseApp = getApps()[0])
  return (firebaseApp = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'placeholder',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }))
}

export async function sendOTP(phone: string): Promise<any> {
  if (process.env.NEXT_PUBLIC_DEV_BYPASS_OTP === 'true') return { phone, _dev: true }
  const { RecaptchaVerifier, signInWithPhoneNumber, getAuth } = await import('firebase/auth')
  const auth = getAuth(getFirebaseApp())
  const recaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
  return signInWithPhoneNumber(auth, phone, recaptcha)
}

export async function verifyOTP(confirmation: any, otp: string, phone: string): Promise<string> {
  if (confirmation?._dev) {
    if (otp === (process.env.NEXT_PUBLIC_DEV_OTP ?? '000000')) return `dev_token_${phone}`
    throw new Error('Invalid OTP')
  }
  const result = await confirmation.confirm(otp)
  return result.user.getIdToken()
}
