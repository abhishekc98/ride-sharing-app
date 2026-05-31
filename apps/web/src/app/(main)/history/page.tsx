'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HistoryPage() {
  const router = useRouter()
  const [rides, setRides] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/v1/rides/history')
      .then((r) => setRides(r.data.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-2xl">←</button>
        <h1 className="text-xl font-bold">Ride History</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rides.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🛵</div>
          <p>No rides yet</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {rides.map((ride) => (
            <div key={ride.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  ride.status === 'completed' ? 'bg-green-100 text-green-700' :
                  ride.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {ride.status}
                </span>
                <span className="font-bold text-gray-900">₹{ride.fare_final ?? ride.fare_estimate}</span>
              </div>
              <div className="flex gap-2 text-sm text-gray-600 mb-1">
                <span>📍</span>
                <span className="truncate">{ride.pickup_address}</span>
              </div>
              <div className="flex gap-2 text-sm text-gray-600 mb-2">
                <span>🏁</span>
                <span className="truncate">{ride.drop_address}</span>
              </div>
              <p className="text-xs text-gray-400">{formatDate(ride.requested_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
