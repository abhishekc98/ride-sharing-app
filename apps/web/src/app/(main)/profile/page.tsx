'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export default function ProfilePage() {
  const router = useRouter()
  const { user, clearAuth } = useAuthStore()
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/v1/users/me').then((r) => {
      setProfile(r.data.data)
      setName(r.data.data.name ?? '')
      setEmail(r.data.data.email ?? '')
    }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.put('/api/v1/users/me', { name, email })
      setProfile(res.data.data)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    clearAuth()
    router.replace('/login')
  }

  const menuItems = [
    { label: 'Ride History', icon: '📋', action: () => router.push('/history') },
    { label: 'Wallet', icon: '💳', action: () => router.push('/wallet') },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-700 transition-colors font-bold text-lg">
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">Profile</h1>
      </div>

      <div className="p-4 space-y-3">
        {/* Profile card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-4">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-4xl mb-3 overflow-hidden">
              {profile?.profile_photo_url
                ? <img src={profile.profile_photo_url} className="w-full h-full object-cover" alt="Profile" />
                : '👤'}
            </div>
            {!editing ? (
              <>
                <h2 className="text-xl font-bold text-gray-900">
                  {profile?.name || 'Add your name'}
                </h2>
                <p className="text-sm text-gray-600 font-medium mt-0.5">{user?.phone}</p>
                <button onClick={() => setEditing(true)}
                  className="mt-3 text-sm text-orange-600 font-semibold hover:text-orange-700">
                  Edit Profile
                </button>
              </>
            ) : (
              <div className="w-full mt-2 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Full Name</label>
                  <input
                    className="w-full border-2 border-gray-200 focus:border-orange-500 rounded-xl px-4 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none transition-colors"
                    value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    className="w-full border-2 border-gray-200 focus:border-orange-500 rounded-xl px-4 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none transition-colors"
                    value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" type="email"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)}
                    className="flex-1 border-2 border-gray-200 rounded-xl py-3 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={save} disabled={saving}
                    className="flex-1 bg-orange-600 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 hover:bg-orange-700">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Menu */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {menuItems.map(({ label, icon, action }, i) => (
            <button key={label} onClick={action}
              className={`w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors ${i < menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <span className="text-2xl">{icon}</span>
              <span className="font-semibold text-gray-800 flex-1">{label}</span>
              <span className="text-gray-400 text-lg font-light">›</span>
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button onClick={logout}
          className="w-full bg-white border-2 border-red-200 text-red-600 rounded-2xl py-4 font-bold text-sm hover:bg-red-50 transition-colors">
          Sign Out
        </button>
      </div>
    </div>
  )
}
