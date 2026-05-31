'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function DriversPage() {
  const router = useRouter()
  const [drivers, setDrivers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')

  useEffect(() => {
    // In production: admin endpoint for driver list
    setLoading(false)
  }, [])

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <div className="w-56 bg-gray-900 p-4">
        <div className="text-orange-500 font-bold text-xl mb-8">🛵 Ops</div>
        {[['Dashboard', '/dashboard', '📊'], ['Drivers', '/drivers', '🛵'], ['Rides', '/rides', '📋'], ['Analytics', '/analytics', '📈']].map(([l, h, i]) => (
          <button key={h} onClick={() => router.push(h as string)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl mb-1 hover:bg-gray-800 w-full text-left text-sm">
            <span>{i}</span> {l}
          </button>
        ))}
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Driver Management</h1>
          <div className="flex gap-2">
            {(['all', 'pending', 'approved'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium ${filter === f ? 'bg-orange-500' : 'bg-gray-800 hover:bg-gray-700'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 rounded-2xl p-6 text-center text-gray-400">
          <div className="text-4xl mb-3">🛵</div>
          <p>Driver list loads from database.</p>
          <p className="text-sm mt-1">Connect to Neon PostgreSQL to see real data.</p>
        </div>
      </div>
    </div>
  )
}
