'use client'
import { useState, useEffect, useRef } from 'react'
import { useRideStore } from '@/stores/rideStore'
import { geocode, reverseGeocode } from '@/lib/osrm'

interface Props {
  onClose?: () => void
  currentPosition?: { lat: number; lng: number } | null
}

const SEARCH_DEBOUNCE_MS = 350

// Purely the "pick two points" step. Once both pickup and drop are set it
// closes itself and hands off to RideConfirmBar — Rapido/Uber only take the
// screen over like this while you're actively searching; the confirm step
// (vehicle + fare + book) stays compact with the map and route visible.
export function BookingSheet({ onClose, currentPosition }: Props) {
  const { pickup, drop, setPickup, setDrop } = useRideStore()

  // Local query state is the single source of truth for what the inputs show
  // while editing — it only syncs FROM the store (selection, map drag,
  // "current location") via the effects below, never falls back to
  // pickup/drop.address in the value itself. That fallback (`pickupQuery ||
  // pickup?.address`) was the original bug: backspacing to '' is falsy, so
  // it kept snapping back to the last selected address.
  const [pickupQuery, setPickupQuery] = useState(pickup?.address ?? '')
  const [dropQuery, setDropQuery] = useState(drop?.address ?? '')
  const [pickupResults, setPickupResults] = useState<any[]>([])
  const [dropResults, setDropResults] = useState<any[]>([])
  const [locatingPickup, setLocatingPickup] = useState(false)

  useEffect(() => { setPickupQuery(pickup?.address ?? '') }, [pickup?.address])
  useEffect(() => { setDropQuery(drop?.address ?? '') }, [drop?.address])

  const pickupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced — Nominatim's usage policy caps free requests at 1/sec.
  // Searching on every keystroke blew past that and got rate-limited, which
  // is what was showing up as raw lat/lng in the address field.
  const searchPickup = (q: string) => {
    setPickupQuery(q)
    if (pickupDebounce.current) clearTimeout(pickupDebounce.current)
    if (q.length < 3) { setPickupResults([]); return }
    pickupDebounce.current = setTimeout(async () => {
      setPickupResults(await geocode(q).then(r => r.slice(0, 4)).catch(() => []))
    }, SEARCH_DEBOUNCE_MS)
  }

  const searchDrop = (q: string) => {
    setDropQuery(q)
    if (dropDebounce.current) clearTimeout(dropDebounce.current)
    if (q.length < 3) { setDropResults([]); return }
    dropDebounce.current = setTimeout(async () => {
      setDropResults(await geocode(q).then(r => r.slice(0, 4)).catch(() => []))
    }, SEARCH_DEBOUNCE_MS)
  }

  const clearPickup = () => { setPickup(null); setPickupQuery(''); setPickupResults([]) }
  const clearDrop = () => { setDrop(null); setDropQuery(''); setDropResults([]) }

  // Selecting the field that completes the pair closes the sheet — editing a
  // single field when the other was already set (tapped "EDIT" from the
  // confirm bar) closes right back to it too, which is the desired outcome.
  const selectPickup = (p: { address: string; lat: number; lng: number }) => {
    setPickup(p)
    setPickupResults([])
    if (drop) onClose?.()
  }
  const selectDrop = (d: { address: string; lat: number; lng: number }) => {
    setDrop(d)
    setDropResults([])
    if (pickup) onClose?.()
  }

  const useCurrentLocationForPickup = async () => {
    if (!currentPosition) return
    setPickupResults([])
    setLocatingPickup(true)
    const address = await reverseGeocode(currentPosition.lat, currentPosition.lng).catch(() => 'Current location')
    setLocatingPickup(false)
    selectPickup({ lat: currentPosition.lat, lng: currentPosition.lng, address })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] z-[9999] max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between pt-3 pb-1 px-5">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
      </div>
      <div className="flex items-center justify-between px-5 pb-2">
        <h2 className="text-lg font-bold text-gray-900">Plan your ride</h2>
        {onClose && (
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold transition-colors">
            ✕
          </button>
        )}
      </div>

      <div className="px-5 pb-8">

        {/* Pickup */}
        <div className="mb-3 relative">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Pickup</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500">📍</span>
            <input
              className="w-full border-2 border-gray-200 focus:border-orange-500 rounded-xl pl-9 pr-9 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none transition-colors"
              placeholder="Where are you?"
              value={pickupQuery}
              onChange={(e) => searchPickup(e.target.value)}
            />
            {pickupQuery && (
              <button type="button" onClick={clearPickup}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-bold">
                ✕
              </button>
            )}
          </div>
          {currentPosition && !pickupQuery && (
            <button type="button" onClick={useCurrentLocationForPickup} disabled={locatingPickup}
              className="flex items-center gap-1.5 text-xs font-bold text-orange-600 mt-1.5 px-1 disabled:opacity-50">
              {locatingPickup ? (
                <span className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              ) : '🎯'}
              Use current location
            </button>
          )}
          {pickupResults.length > 0 && (
            <div className="absolute z-10 w-full bg-white border-2 border-gray-100 rounded-xl mt-1 shadow-xl max-h-48 overflow-y-auto">
              {pickupResults.map((r, i) => (
                <button key={i} className="w-full text-left px-4 py-3 text-sm text-gray-800 font-medium hover:bg-orange-50 border-b border-gray-100 last:border-0"
                  onClick={() => selectPickup({ address: r.address, lat: r.lat, lng: r.lng })}>
                  📍 {r.address.slice(0, 55)}{r.address.length > 55 ? '…' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drop */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Drop</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🏁</span>
            <input
              className="w-full border-2 border-gray-200 focus:border-orange-500 rounded-xl pl-9 pr-9 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none transition-colors"
              placeholder="Where to?"
              value={dropQuery}
              onChange={(e) => searchDrop(e.target.value)}
            />
            {dropQuery && (
              <button type="button" onClick={clearDrop}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-bold">
                ✕
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 font-medium mt-1.5 px-1">or tap anywhere on the map to drop a pin</p>
          {dropResults.length > 0 && (
            <div className="absolute z-10 w-full bg-white border-2 border-gray-100 rounded-xl mt-1 shadow-xl max-h-48 overflow-y-auto">
              {dropResults.map((r, i) => (
                <button key={i} className="w-full text-left px-4 py-3 text-sm text-gray-800 font-medium hover:bg-orange-50 border-b border-gray-100 last:border-0"
                  onClick={() => selectDrop({ address: r.address, lat: r.lat, lng: r.lng })}>
                  🏁 {r.address.slice(0, 55)}{r.address.length > 55 ? '…' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
