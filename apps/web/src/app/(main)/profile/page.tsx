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
    })
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-2xl">←</button>
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="p-4">
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-4 text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-3">
            {profile?.profile_photo_url ? (
              <img src={profile.profile_photo_url} className="w-20 h-20 rounded-full object-cover" alt="Profile" />
            ) : '👤'}
          </div>
          {editing ? (
            <>
              <input className="w-full border rounded-xl px-4 py-3 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              <input className="w-full border rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 border rounded-2xl py-3 text-sm font-medium">Cancel</button>
                <button onClick={save} disabled={saving} className="flex-1 bg-orange-500 text-white rounded-2xl py-3 text-sm font-bold disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">{profile?.name ?? 'Add your name'}</h2>
              <p className="text-gray-500 text-sm">{user?.phone}</p>
              <button onClick={() => setEditing(true)} className="mt-3 text-orange-500 text-sm font-medium">Edit Profile</button>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          {[
            { label: 'Ride History', icon: '📋', action: () => router.push('/history') },
            { label: 'Wallet', icon: '💳', action: () => router.push('/wallet') },
          ].map(({ label, icon, action }) => (
            <button key={label} onClick={action}
              className="w-full flex items-center gap-4 px-4 py-4 border-b last:border-0 text-left hover:bg-gray-50">
              <span className="text-2xl">{icon}</span>
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-gray-400">›</span>
            </button>
          ))}
        </div>

        <button onClick={logout}
          className="w-full border-2 border-red-400 text-red-500 rounded-2xl py-4 font-bold">
          Sign Out
        </button>
      </div>
    </div>
  )
}
