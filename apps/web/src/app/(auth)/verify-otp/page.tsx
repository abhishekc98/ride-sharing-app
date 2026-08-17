'use client'
import { Suspense, useState, useRef, useEffect } from 'react'
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
      const firebaseToken = confirmation?._dev ? `dev_token_${phone}` : await verifyOTP(confirmation, code, phone)
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

  // Format phone for display
  const displayPhone = phone.replace('+91', '+91 ').replace(/(\d{5})(\d{5})/, '$1 $2')

  return (
    <div className="min-h-screen flex flex-col bg-white px-6">

      {/* Back */}
      <button onClick={() => router.back()} className="mt-12 self-start text-gray-500 hover:text-gray-800 transition-colors">
        ← Back
      </button>

      <div className="flex-1 flex flex-col justify-center -mt-8">
        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-6">
          <span className="text-4xl">📱</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Verify your number</h1>
        <p className="text-sm text-gray-500 mb-8">
          6-digit OTP sent to{' '}
          <span className="font-semibold text-gray-800">{displayPhone}</span>
        </p>

        {/* OTP boxes */}
        <div className="grid grid-cols-6 gap-2 mb-6">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !digit && i > 0) inputRefs.current[i - 1]?.focus() }}
              className={`w-full aspect-square text-center text-xl font-bold rounded-xl border-2 transition-all focus:outline-none
                ${digit ? 'border-orange-500 bg-orange-50 text-gray-900' : 'border-gray-200 bg-gray-50 text-gray-900'}
                focus:border-orange-500 focus:bg-orange-50`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-700 font-medium">⚠ {error}</p>
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || otp.join('').length !== 6}
          className="w-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-xl py-4 font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">
          {loading ? 'Verifying…' : 'Verify OTP'}
        </button>
      </div>
    </div>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyOTPContent />
    </Suspense>
  )
}
