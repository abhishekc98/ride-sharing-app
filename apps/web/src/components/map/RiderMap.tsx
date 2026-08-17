'use client'
import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker, Polyline, LatLngTuple } from 'leaflet'

interface Driver {
  driverId: string
  lat: number
  lng: number
  distanceKm?: number
}

interface Props {
  center?: LatLngTuple
  drivers?: Driver[]
  pickupMarker?: LatLngTuple
  dropMarker?: LatLngTuple
  route?: LatLngTuple[]
  driverLivePos?: LatLngTuple
  driverRoute?: LatLngTuple[]
  onPickupDrag?: (lat: number, lng: number) => void
  onDropDrag?: (lat: number, lng: number) => void
  onMapTap?: (lat: number, lng: number) => void
  className?: string
}

const makePickupIcon = (L: any) => L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#ea580c;border:3px solid white;box-shadow:0 2px 10px rgba(234,92,12,0.5);display:flex;align-items:center;justify-content:center;cursor:grab;">
    <div style="width:8px;height:8px;border-radius:50%;background:white;"></div>
  </div>`,
})

const makeDropIcon = (L: any) => L.divIcon({
  className: '',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  html: `<svg viewBox="0 0 32 42" width="32" height="42" xmlns="http://www.w3.org/2000/svg" style="cursor:grab;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3))">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 5.5 2.7 10.4 6.8 13.4L16 42l9.2-12.6C29.3 26.4 32 21.5 32 16 32 7.16 24.84 0 16 0z" fill="#1a1a2e"/>
    <circle cx="16" cy="16" r="7" fill="white"/>
    <circle cx="16" cy="16" r="4" fill="#ea580c"/>
  </svg>`,
})

const makeNearbyDriverIcon = (L: any) => L.divIcon({
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  html: `<div style="width:32px;height:32px;border-radius:50%;background:rgba(234,92,12,0.08);border:1.5px solid #ea580c;display:flex;align-items:center;justify-content:center;font-size:16px;">🛵</div>`,
})

const makeLiveDriverIcon = (L: any) => L.divIcon({
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `<div style="width:40px;height:40px;border-radius:50%;background:#1a1a2e;border:2.5px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>`,
})

export default function RiderMap({
  center = [12.9716, 77.5946],
  drivers = [],
  pickupMarker,
  dropMarker,
  route,
  driverLivePos,
  driverRoute,
  onPickupDrag,
  onDropDrag,
  onMapTap,
  className = 'h-full w-full',
}: Props) {
  const mapRef        = useRef<LeafletMap | null>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const driverMarkersRef = useRef<Map<string, Marker>>(new Map())
  const routeLineRef  = useRef<Polyline | null>(null)
  const routeShadowRef = useRef<Polyline | null>(null)
  const driverRouteLineRef = useRef<Polyline | null>(null)
  const pickupRef     = useRef<Marker | null>(null)
  const dropRef       = useRef<Marker | null>(null)
  const liveDriverRef = useRef<Marker | null>(null)
  const initialCenter = useRef(center)

  // Every callback below re-checks mapRef.current right before use instead of
  // trusting the synchronous check at effect-start — import('leaflet') is
  // async, and with driverLivePos now updating live (fixed room subscription
  // — it used to never actually reach the rider at all), there's a real
  // window for the init effect's cleanup to have torn the map down (dev Fast
  // Refresh remount, fast unmount) between that check and the promise
  // resolving. Same bug, same fix as DriverMap.tsx.

  // ── Init map ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return
    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return
      const map = L.map(containerRef.current, { zoomControl: false })
        .setView(initialCenter.current, 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
    })
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // ── Pan to center (when geolocation arrives, no route shown) ─
  useEffect(() => {
    if (!mapRef.current || !center || route) return
    mapRef.current.panTo(center, { animate: true, duration: 0.8 })
  }, [center[0], center[1]])

  // ── Tap map to set destination ───────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    const fn = (e: any) => onMapTap?.(e.latlng.lat, e.latlng.lng)
    map.on('click', fn)
    return () => { map.off('click', fn) }
  }, [onMapTap])

  // ── Nearby drivers ───────────────────────────────────────────
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      const existing = driverMarkersRef.current
      const currentIds = new Set(drivers.map(d => d.driverId))
      const icon = makeNearbyDriverIcon(L)

      existing.forEach((m, id) => { if (!currentIds.has(id)) { m.remove(); existing.delete(id) } })
      drivers.forEach(d => {
        if (existing.has(d.driverId)) {
          existing.get(d.driverId)!.setLatLng([d.lat, d.lng])
        } else {
          const m = L.marker([d.lat, d.lng], { icon })
            .addTo(map)
            .bindTooltip(`${d.distanceKm?.toFixed(1) ?? '?'} km`, { direction: 'top' })
          existing.set(d.driverId, m)
        }
      })
    })
  }, [drivers])

  // ── Route polyline (rider's own trip: pickup → drop) ──────────
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      routeShadowRef.current?.remove(); routeShadowRef.current = null
      routeLineRef.current?.remove();  routeLineRef.current = null

      if (!route || route.length === 0) return

      // Shadow (depth effect)
      routeShadowRef.current = L.polyline(route, {
        color: '#1a1a2e', weight: 7, opacity: 0.1,
      }).addTo(map)

      // Main route
      routeLineRef.current = L.polyline(route, {
        color: '#ea580c', weight: 4, opacity: 0.95,
        lineCap: 'round', lineJoin: 'round',
        dashArray: undefined,
      }).addTo(map)

      // Fit bounds — extra bottom padding so route isn't hidden behind booking sheet
      map.fitBounds(routeLineRef.current.getBounds(), {
        paddingTopLeft: [40, 100],
        paddingBottomRight: [40, 260],
        animate: true, duration: 0.7,
      })
    })
  }, [route])  // `route` is only ever replaced with a new array on a real route change (never mutated
              // in place), so reference identity is exact here — no need to deep-compare or fingerprint it.
              // The previous fingerprint (first 2 points only) missed drop-marker drags: dragging the
              // destination usually leaves the route's starting vertices near pickup unchanged, so the
              // effect never re-ran and the stale polyline stuck around.

  // ── Driver's incoming route (their live position → pickup) ────
  // Deliberately styled distinct from the rider's own trip route (blue,
  // dashed) — this is "where your driver is coming from," not part of your
  // trip. Never touches fitBounds; the rider's own route/pickup/drop framing
  // already owns the camera.
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      driverRouteLineRef.current?.remove(); driverRouteLineRef.current = null
      if (!driverRoute || driverRoute.length === 0) return
      driverRouteLineRef.current = L.polyline(driverRoute, {
        color: '#2563eb', weight: 3.5, opacity: 0.85,
        lineCap: 'round', lineJoin: 'round', dashArray: '1,10',
      }).addTo(map)
    })
  }, [driverRoute])

  // ── Pickup marker ────────────────────────────────────────────
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      pickupRef.current?.remove(); pickupRef.current = null
      if (!pickupMarker) return

      const m = L.marker(pickupMarker, {
        icon: makePickupIcon(L),
        draggable: !!onPickupDrag,
        zIndexOffset: 1000,
      }).addTo(map)

      if (onPickupDrag) {
        m.on('dragend', () => {
          const { lat, lng } = m.getLatLng()
          onPickupDrag(lat, lng)
        })
      }

      pickupRef.current = m
    })
  }, [pickupMarker?.[0], pickupMarker?.[1]])

  // ── Drop marker ──────────────────────────────────────────────
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      dropRef.current?.remove(); dropRef.current = null
      if (!dropMarker) return

      const m = L.marker(dropMarker, {
        icon: makeDropIcon(L),
        draggable: !!onDropDrag,
        zIndexOffset: 900,
      }).addTo(map)

      if (onDropDrag) {
        m.on('dragend', () => {
          const { lat, lng } = m.getLatLng()
          onDropDrag(lat, lng)
        })
      }

      dropRef.current = m
    })
  }, [dropMarker?.[0], dropMarker?.[1]])

  // ── Live driver (during active ride) ────────────────────────
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      if (!driverLivePos) { liveDriverRef.current?.remove(); liveDriverRef.current = null; return }
      if (liveDriverRef.current) {
        liveDriverRef.current.setLatLng(driverLivePos)
      } else {
        liveDriverRef.current = L.marker(driverLivePos, { icon: makeLiveDriverIcon(L) }).addTo(map)
      }
    })
  }, [driverLivePos])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} className={className} />
    </>
  )
}
