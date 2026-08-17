'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import { useAdminStore } from '@/stores/adminStore'
import { Sidebar } from '@/components/Sidebar'

const AdminMap = dynamic(() => import('@/components/map/AdminMap'), { ssr: false })

export default function DashboardPage() {
  const router = useRouter()
  const { token } = useAdminStore()
  const [activeRides, setActiveRides] = useState<any[]>([])

  useEffect(() => {
    if (!token) router.replace('/login')
  }, [token])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/api/v1/admin/rides', { params: { limit: 50 } })
        setActiveRides((res.data.data ?? []).filter((r: any) =>
          ['searching', 'driver_assigned', 'en_route', 'driver_arrived', 'in_progress'].includes(r.status)
        ))
      } catch {}
    }
    fetchData()
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />

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
