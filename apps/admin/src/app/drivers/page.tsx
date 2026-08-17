'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Sidebar } from '@/components/Sidebar'

const FILTERS = ['all', 'submitted', 'approved', 'rejected', 'pending'] as const

const KYC_BADGE: Record<string, string> = {
  approved: 'bg-green-900 text-green-400',
  submitted: 'bg-amber-900 text-amber-400',
  rejected: 'bg-red-900 text-red-400',
  pending: 'bg-gray-800 text-gray-400',
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<typeof FILTERS[number]>('submitted')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/api/v1/admin/drivers', { params: { kycStatus: filter === 'all' ? undefined : filter, limit: 50 } })
      .then((r) => setDrivers(r.data.data ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id)
    try {
      await api.post(`/api/v1/admin/drivers/${id}/kyc`, { status })
      load()
    } catch {
      alert('Could not update driver')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Driver Management</h1>
            <p className="text-gray-400 text-sm">Review KYC submissions and manage the driver roster</p>
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${filter === f ? 'bg-orange-500' : 'bg-gray-800 hover:bg-gray-700'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">🛵</div>
              <p>No drivers in this filter</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl">
              {drivers.map((d) => (
                <div key={d.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg">
                        {d.profile_photo_url ? <img src={d.profile_photo_url} className="w-10 h-10 rounded-full object-cover" alt="" /> : '👤'}
                      </div>
                      <div>
                        <p className="font-bold">{d.name ?? 'Unnamed driver'}</p>
                        <p className="text-xs text-gray-500">{d.phone}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${KYC_BADGE[d.kyc_status] ?? 'bg-gray-800 text-gray-400'}`}>
                      {d.kyc_status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                    <span>⭐ {Number(d.rating ?? 5).toFixed(1)}</span>
                    <span>{d.total_rides ?? 0} rides</span>
                    <span className="capitalize">{d.vehicle_type ? `${d.vehicle_type} · ${d.make} ${d.model} · ${d.plate_no}` : 'No vehicle on file'}</span>
                  </div>

                  {d.kyc_docs && Object.keys(d.kyc_docs).length > 0 && (
                    <div className="flex gap-2 mb-3">
                      {Object.entries(d.kyc_docs as Record<string, string>).map(([key, url]) => (
                        <a key={key} href={url} target="_blank" rel="noreferrer"
                          className="text-[11px] font-bold text-orange-400 border border-orange-900/60 rounded-lg px-2.5 py-1.5">
                          {key.replace('Url', '')}
                        </a>
                      ))}
                    </div>
                  )}

                  {d.kyc_status === 'submitted' && (
                    <div className="flex gap-2">
                      <button onClick={() => decide(d.id, 'rejected')} disabled={busyId === d.id}
                        className="flex-1 text-xs font-bold text-red-400 border border-red-900 rounded-lg py-2 disabled:opacity-50">
                        Reject
                      </button>
                      <button onClick={() => decide(d.id, 'approved')} disabled={busyId === d.id}
                        className="flex-1 text-xs font-bold bg-green-600 hover:bg-green-500 rounded-lg py-2 disabled:opacity-50">
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
