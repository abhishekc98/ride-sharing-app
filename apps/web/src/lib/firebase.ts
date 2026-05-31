'use client'

let firebaseApp: any = null
let firebaseAuth: any = null

function getFirebaseApp() {
  if (typeof window === 'undefined') throw new Error('Firebase client-only')
  if (firebaseApp) return firebaseApp

  const { initializeApp, getApps } = require('firebase/app')
  if (getApps().length > 0) {
    firebaseApp = getApps()[0]
  } else {
    firebaseApp = initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'placeholder',
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  }
  return firebaseApp
}

function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth
  const { getAuth } = require('firebase/auth')
  firebaseAuth = getAuth(getFirebaseApp())
  return firebaseAuth
}

export async function sendOTP(phone: string): Promise<any> {
  if (process.env.NEXT_PUBLIC_DEV_BYPASS_OTP === 'true') {
    return { phone, _dev: true }
  }
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth')
  const auth = getFirebaseAuth()
  const recaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
  return signInWithPhoneNumber(auth, phone, recaptcha)
}

export async function verifyOTP(confirmationResult: any, otp: string, phone: string): Promise<string> {
  if (confirmationResult?._dev) {
    const devOtp = process.env.NEXT_PUBLIC_DEV_OTP ?? '000000'
    if (otp === devOtp) return `dev_token_${phone}`
    throw new Error('Invalid OTP')
  }
  const result = await confirmationResult.confirm(otp)
  return result.user.getIdToken()
}
