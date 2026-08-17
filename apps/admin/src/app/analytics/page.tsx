'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Sidebar } from '@/components/Sidebar'

export default function AnalyticsPage() {
  const [stats, setStats] = useState({
    totalRides: 0, completedRides: 0, cancelledRides: 0,
    totalRevenue: 0, avgFare: 0, activeDrivers: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/v1/admin/stats').then((r) => setStats(r.data.data)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <div className="flex-1 p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-1">Analytics</h1>
        <p className="text-gray-400 text-sm mb-6">Platform-wide totals, computed live from Postgres</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Rides', value: stats.totalRides, icon: '🛵', color: 'text-blue-400' },
              { label: 'Completed', value: stats.completedRides, icon: '✅', color: 'text-green-400' },
              { label: 'Cancelled', value: stats.cancelledRides, icon: '❌', color: 'text-red-400' },
              { label: 'Revenue', value: `₹${stats.totalRevenue.toFixed(0)}`, icon: '💰', color: 'text-yellow-400' },
              { label: 'Avg Fare', value: `₹${stats.avgFare.toFixed(0)}`, icon: '📊', color: 'text-purple-400' },
              { label: 'Online Drivers', value: stats.activeDrivers, icon: '🟢', color: 'text-green-400' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <div className="text-2xl mb-2">{icon}</div>
                <div className={`text-3xl font-bold ${color}`}>{value}</div>
                <div className="text-gray-400 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
