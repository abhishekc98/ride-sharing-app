'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function AnalyticsPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalRides: 0, completedRides: 0, cancelledRides: 0,
    totalRevenue: 0, avgFare: 0, activeDrivers: 0,
  })

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
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Rides', value: stats.totalRides, icon: '🛵', color: 'text-blue-400' },
            { label: 'Completed', value: stats.completedRides, icon: '✅', color: 'text-green-400' },
            { label: 'Cancelled', value: stats.cancelledRides, icon: '❌', color: 'text-red-400' },
            { label: 'Revenue', value: `₹${stats.totalRevenue.toFixed(0)}`, icon: '💰', color: 'text-yellow-400' },
            { label: 'Avg Fare', value: `₹${stats.avgFare.toFixed(0)}`, icon: '📊', color: 'text-purple-400' },
            { label: 'Online Drivers', value: stats.activeDrivers, icon: '🟢', color: 'text-green-400' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-gray-900 rounded-2xl p-5">
              <div className="text-2xl mb-2">{icon}</div>
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-gray-400 text-sm mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="bg-gray-900 rounded-2xl p-6 text-center text-gray-400">
          <p>Charts powered by ClickHouse OLAP</p>
          <p className="text-sm mt-1">Connect analytics service to see real-time graphs</p>
        </div>
      </div>
    </div>
  )
}
