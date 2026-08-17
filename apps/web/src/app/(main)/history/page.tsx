'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  in_progress: 'bg-blue-100 text-blue-800',
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
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-700 transition-colors font-bold text-lg">
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">Ride History</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rides.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="text-6xl mb-4">🛵</div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No rides yet</h3>
          <p className="text-sm text-gray-500">Your ride history will appear here</p>
          <button onClick={() => router.push('/home')}
            className="mt-6 bg-orange-600 text-white rounded-xl px-6 py-3 text-sm font-bold">
            Book your first ride
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {rides.map((ride) => (
            <button key={ride.id}
              onClick={() => ride.status === 'completed' && router.push(`/ride/${ride.id}/receipt`)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[ride.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {ride.status?.replace(/_/g, ' ')}
                </span>
                <span className="font-bold text-gray-900 text-lg">₹{ride.fare_final ?? ride.fare_estimate}</span>
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5 shrink-0 text-sm">📍</span>
                  <span className="text-sm text-gray-800 font-medium line-clamp-1">{ride.pickup_address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-400 mt-0.5 shrink-0 text-sm">🏁</span>
                  <span className="text-sm text-gray-800 font-medium line-clamp-1">{ride.drop_address}</span>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs text-gray-500 font-medium">{formatDate(ride.requested_at)}</span>
                <span className="text-xs text-gray-500 capitalize font-medium">{ride.vehicle_type}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
