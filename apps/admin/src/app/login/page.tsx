'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAdminStore } from '@/stores/adminStore'

export default function AdminLoginPage() {
  const router = useRouter()
  const { setAuth } = useAdminStore()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // In production: admin has a PIN-based auth separate from Firebase OTP
      // For dev: use special admin phone + dev bypass
      const formatted = phone.startsWith('+91') ? phone : `+91${phone}`
      const res = await api.post('/api/v1/auth/verify-firebase', {
        firebaseToken: `dev_token_${formatted}`, role: 'admin',
      })
      const { accessToken, user } = res.data.data
      setAuth(accessToken, user)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🛵</div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">RideApp Operations</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Phone</label>
            <input
              type="tel" inputMode="numeric" placeholder="9876543210"
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} maxLength={10}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-1">PIN (dev: any value)</label>
            <input
              type="password" placeholder="••••••"
              value={pin} onChange={(e) => setPin(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button type="submit" disabled={loading || phone.length !== 10}
            className="w-full bg-orange-500 text-white rounded-2xl py-3 font-bold disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
