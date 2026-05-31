'use client'
import { Suspense } from 'react'
import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyOTP } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

function VerifyOTPContent() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = params.get('phone') ?? ''
  const { setAuth } = useAuthStore()
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...otp]
    next[index] = value
    setOtp(next)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
    if (!value && index > 0) inputRefs.current[index - 1]?.focus()
  }

  const handleVerify = async () => {
    const code = otp.join('')
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const stored = sessionStorage.getItem('otp_confirmation')
      const confirmation = stored ? JSON.parse(stored) : null

      let firebaseToken: string
      if (confirmation?._dev) {
        firebaseToken = `dev_token_${phone}`
      } else {
        firebaseToken = await verifyOTP(confirmation, code, phone)
      }

      const res = await api.post('/api/v1/auth/verify-firebase', { firebaseToken, role: 'rider' })
      const { accessToken, refreshToken, user } = res.data.data
      setAuth(user, accessToken, refreshToken)
      router.replace('/home')
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Invalid OTP')
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (otp.join('').length === 6) handleVerify()
  }, [otp])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="text-5xl mb-6">📱</div>
      <h1 className="text-2xl font-bold mb-2">Verify OTP</h1>
      <p className="text-gray-500 text-sm mb-8">Enter the 6-digit code sent to {phone}</p>

      <div className="flex gap-3 mb-6">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInput(i, e.target.value)}
            className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:border-orange-500"
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button
        onClick={handleVerify}
        disabled={loading || otp.join('').length !== 6}
        className="w-full max-w-xs bg-orange-500 text-white rounded-2xl py-4 font-bold text-lg disabled:opacity-50">
        {loading ? 'Verifying...' : 'Verify'}
      </button>

      <button onClick={() => router.back()} className="mt-4 text-orange-500 text-sm">
        Change number
      </button>
    </div>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <VerifyOTPContent />
    </Suspense>
  )
}
