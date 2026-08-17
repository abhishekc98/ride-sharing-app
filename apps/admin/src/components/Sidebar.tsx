'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useAdminStore } from '@/stores/adminStore'

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Drivers', href: '/drivers', icon: '🛵' },
  { label: 'Rides', href: '/rides', icon: '📋' },
  { label: 'Payouts', href: '/payouts', icon: '💸' },
  { label: 'Analytics', href: '/analytics', icon: '📈' },
]

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { clearAuth } = useAdminStore()

  return (
    <div className="w-56 shrink-0 bg-gray-900 flex flex-col p-4">
      <div className="text-orange-500 font-bold text-xl mb-8 mt-2">🛵 Ops</div>
      {NAV.map((n) => (
        <button key={n.href} onClick={() => router.push(n.href)}
          className={`flex items-center gap-3 px-3 py-3 rounded-xl mb-1 text-left text-sm font-medium transition-colors ${
            pathname?.startsWith(n.href) ? 'bg-orange-500/15 text-orange-400' : 'hover:bg-gray-800 text-gray-300'
          }`}>
          <span>{n.icon}</span> {n.label}
        </button>
      ))}
      <div className="flex-1" />
      <button onClick={() => { clearAuth(); router.replace('/login') }}
        className="text-red-400 text-sm px-3 py-3 text-left">Sign Out</button>
    </div>
  )
}
