'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendOTP } from '@/lib/firebase'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const formatted = phone.startsWith('+91') ? phone : `+91${phone}`
    if (!/^\+91[6-9]\d{9}$/.test(formatted)) {
      return setError('Enter a valid 10-digit Indian mobile number')
    }
    setLoading(true)
    try {
      const confirmation = await sendOTP(formatted)
      sessionStorage.setItem('otp_confirmation', JSON.stringify({ phone: formatted, _dev: confirmation?._dev }))
      router.push(`/verify-otp?phone=${encodeURIComponent(formatted)}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white px-6">
      <div id="recaptcha-container" />

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center pb-4">
        <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-6">
          <span className="text-5xl">🛵</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-1">RideApp</h1>
        <p className="text-base text-gray-500 font-medium">Fast, reliable rides across the city</p>
      </div>

      {/* Form */}
      <div className="pb-10">
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-800 mb-2">Mobile Number</label>
          <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-orange-500 transition-colors bg-white">
            <span className="flex items-center px-4 bg-gray-50 border-r-2 border-gray-200 text-gray-700 text-sm font-semibold shrink-0">
              🇮🇳 +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="flex-1 px-4 py-3.5 text-gray-900 text-base font-medium placeholder:text-gray-400 focus:outline-none bg-white"
            />
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 font-medium">⚠ {error}</p>
          )}
        </div>

        <button
          onClick={handleSendOTP}
          disabled={loading || phone.length !== 10}
          className="w-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-xl py-4 font-bold text-base tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">
          {loading ? 'Sending OTP…' : 'Get OTP'}
        </button>

        <p className="mt-5 text-center text-xs text-gray-400 leading-relaxed">
          By continuing, you agree to our{' '}
          <span className="text-gray-600 underline cursor-pointer">Terms of Service</span>
          {' & '}
          <span className="text-gray-600 underline cursor-pointer">Privacy Policy</span>
        </p>
      </div>
    </div>
  )
}
