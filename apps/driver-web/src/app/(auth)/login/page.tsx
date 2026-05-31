'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendOTP } from '@/lib/firebase'

export default function DriverLoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const formatted = phone.startsWith('+91') ? phone : `+91${phone}`
    if (!/^\+91[6-9]\d{9}$/.test(formatted)) return setError('Enter a valid 10-digit Indian mobile number')
    setLoading(true)
    try {
      const confirmation = await sendOTP(formatted)
      sessionStorage.setItem('driver_otp_confirmation', JSON.stringify({ phone: formatted, _dev: confirmation?._dev }))
      router.push(`/verify-otp?phone=${encodeURIComponent(formatted)}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 px-6">
      <div id="recaptcha-container" />
      <div className="text-6xl mb-6">🛵</div>
      <h1 className="text-3xl font-bold text-white mb-2">Driver Login</h1>
      <p className="text-gray-400 mb-10">Start earning today</p>
      <form onSubmit={handleSendOTP} className="w-full max-w-sm">
        <label className="block text-sm font-medium text-gray-300 mb-2">Mobile Number</label>
        <div className="flex gap-2 mb-4">
          <span className="flex items-center px-4 bg-gray-700 border border-gray-600 border-r-0 rounded-l-xl text-gray-300 text-sm">
            🇮🇳 +91
          </span>
          <input
            type="tel" inputMode="numeric" maxLength={10}
            placeholder="9876543210" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-r-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={loading || phone.length !== 10}
          className="w-full bg-orange-500 text-white rounded-2xl py-4 font-bold text-lg disabled:opacity-50">
          {loading ? 'Sending OTP...' : 'Get OTP'}
        </button>
      </form>
    </div>
  )
}
