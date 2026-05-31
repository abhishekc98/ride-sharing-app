'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import { useAdminStore } from '@/stores/adminStore'

const AdminMap = dynamic(() => import('@/components/map/AdminMap'), { ssr: false })

export default function DashboardPage() {
  const router = useRouter()
  const { token, clearAuth } = useAdminStore()
  const [stats, setStats] = useState<any>(null)
  const [activeRides, setActiveRides] = useState<any[]>([])
  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([])

  useEffect(() => {
    if (!token) router.replace('/login')
  }, [token])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ridesRes] = await Promise.all([
          api.get('/api/v1/rides/history?limit=5'),
        ])
        setActiveRides(ridesRes.data.data?.filter((r: any) =>
          ['searching', 'driver_assigned', 'en_route', 'in_progress'].includes(r.status)
        ) ?? [])
      } catch {}
    }
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [])

  const NAV = [
    { label: 'Dashboard', href: '/dashboard', icon: '📊' },
    { label: 'Drivers', href: '/drivers', icon: '🛵' },
    { label: 'Rides', href: '/rides', icon: '📋' },
    { label: 'Analytics', href: '/analytics', icon: '📈' },
  ]

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="w-56 bg-gray-900 flex flex-col p-4">
        <div className="text-orange-500 font-bold text-xl mb-8 mt-2">🛵 Ops</div>
        {NAV.map((n) => (
          <button key={n.href} onClick={() => router.push(n.href)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl mb-1 hover:bg-gray-800 text-left text-sm font-medium">
            <span>{n.icon}</span> {n.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => { clearAuth(); router.replace('/login') }}
          className="text-red-400 text-sm px-3 py-3">Sign Out</button>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-bold">Live Operations</h1>
          <p className="text-gray-400 text-sm">Real-time platform overview</p>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Map */}
          <div className="flex-1 relative">
            <AdminMap className="absolute inset-0 h-full w-full" />
          </div>

          {/* Active rides panel */}
          <div className="w-80 bg-gray-900 p-4 overflow-y-auto">
            <h2 className="font-bold mb-4 text-sm text-gray-400 uppercase tracking-wider">Active Rides ({activeRides.length})</h2>
            {activeRides.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No active rides</p>
            ) : (
              <div className="space-y-3">
                {activeRides.map((ride) => (
                  <div key={ride.id} className="bg-gray-800 rounded-xl p-3 cursor-pointer hover:bg-gray-700"
                    onClick={() => router.push(`/rides?id=${ride.id}`)}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs text-orange-400 font-medium">{ride.status?.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-400">{ride.vehicle_type}</span>
                    </div>
                    <p className="text-xs text-gray-300 truncate">📍 {ride.pickup_address}</p>
                    <p className="text-xs text-gray-300 truncate">🏁 {ride.drop_address}</p>
                    <p className="text-xs text-green-400 mt-1">₹{ride.fare_estimate}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
