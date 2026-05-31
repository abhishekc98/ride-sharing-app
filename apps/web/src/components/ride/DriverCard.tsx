'use client'
import { useRideStore } from '@/stores/rideStore'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  searching: { label: 'Finding your driver...', color: 'text-orange-500' },
  driver_assigned: { label: 'Driver assigned!', color: 'text-green-600' },
  en_route: { label: 'Driver is on the way', color: 'text-blue-600' },
  driver_arrived: { label: 'Driver has arrived!', color: 'text-green-600' },
  in_progress: { label: 'Ride in progress', color: 'text-purple-600' },
  completed: { label: 'Ride completed', color: 'text-green-700' },
  cancelled: { label: 'Ride cancelled', color: 'text-red-500' },
}

export function DriverCard() {
  const { status, driver, rideId } = useRideStore()

  const statusInfo = STATUS_LABELS[status] ?? { label: status, color: 'text-gray-600' }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50">
      <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-4" />

      {/* Status */}
      <div className="flex items-center gap-2 mb-4">
        {status === 'searching' && (
          <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        )}
        <span className={`font-bold text-lg ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      {/* Driver info */}
      {driver && (
        <div className="flex items-center gap-4 mb-4 p-4 bg-gray-50 rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl">
            {driver.profilePhotoUrl
              ? <img src={driver.profilePhotoUrl} className="w-16 h-16 rounded-full object-cover" alt={driver.name} />
              : '👤'}
          </div>
          <div className="flex-1">
            <div className="font-bold text-lg">{driver.name}</div>
            <div className="flex items-center gap-1 text-sm text-yellow-600">
              ⭐ <span>{driver.rating.toFixed(1)}</span>
            </div>
            <div className="text-sm text-gray-500">{driver.vehicle.color} {driver.vehicle.make} {driver.vehicle.model}</div>
            <div className="text-sm font-mono font-bold text-gray-700">{driver.vehicle.plateNo}</div>
          </div>
          <a href={`tel:${driver.phone}`}
            className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white text-xl">
            📞
          </a>
        </div>
      )}

      {/* SOS */}
      {(status === 'in_progress' || status === 'en_route') && (
        <button
          onClick={() => {
            if (confirm('Send SOS alert to emergency services?')) {
              import('@/lib/api').then(({ api }) => api.post(`/api/v1/rides/${rideId}/sos`))
            }
          }}
          className="w-full border-2 border-red-500 text-red-500 rounded-2xl py-3 font-bold">
          🆘 SOS — Emergency
        </button>
      )}
    </div>
  )
}
