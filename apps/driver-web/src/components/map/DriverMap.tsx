'use client'
import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker, Polyline, LatLngTuple } from 'leaflet'

interface Props {
  center?: LatLngTuple
  driverPos?: LatLngTuple
  pickupPos?: LatLngTuple
  dropPos?: LatLngTuple
  route?: LatLngTuple[]
  className?: string
}

const makePickupIcon = (L: any) => L.divIcon({
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:50%;background:#ea580c;border:3px solid white;box-shadow:0 2px 8px rgba(234,92,12,0.5);"></div>`,
})

const makeDropIcon = (L: any) => L.divIcon({
  className: '',
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  html: `<svg viewBox="0 0 32 42" width="28" height="36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.3))">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 5.5 2.7 10.4 6.8 13.4L16 42l9.2-12.6C29.3 26.4 32 21.5 32 16 32 7.16 24.84 0 16 0z" fill="#1a1a2e"/>
    <circle cx="16" cy="16" r="6" fill="white"/>
  </svg>`,
})

export default function DriverMap({ center = [12.9716, 77.5946], driverPos, pickupPos, dropPos, route, className = 'h-full w-full' }: Props) {
  const mapRef = useRef<LeafletMap | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<Marker | null>(null)
  const pickupMarkerRef = useRef<Marker | null>(null)
  const dropMarkerRef = useRef<Marker | null>(null)
  const routeLineRef = useRef<Polyline | null>(null)
  const routeShadowRef = useRef<Polyline | null>(null)
  const hasFitRouteRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return
    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      const map = L.map(containerRef.current, { zoomControl: false }).setView(center, 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
    })
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Driver marker — chase-cam: always keep the driver centered as their
  // position (real or simulated) updates.
  //
  // Every callback below re-checks mapRef.current right before use instead
  // of trusting the synchronous check at effect-start — `import('leaflet')`
  // is async, and with driverPos now updating every ~2s (simulator) instead
  // of once, there's a real window for the init effect's cleanup to have
  // torn the map down (dev Fast Refresh remount, or a fast unmount) between
  // that check and the promise resolving. Skipping the re-check was throwing
  // "Cannot read properties of null" on addTo/panTo and silently dropping
  // whichever marker/polyline was mid-flight when it happened.
  useEffect(() => {
    if (!driverPos) return
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      const icon = L.divIcon({ html: '🛵', className: 'text-3xl', iconSize: [36, 36], iconAnchor: [18, 18] })
      if (driverMarkerRef.current) driverMarkerRef.current.setLatLng(driverPos)
      else driverMarkerRef.current = L.marker(driverPos, { icon }).addTo(map)
      map.panTo(driverPos)
    })
  }, [driverPos])

  // Pickup / drop pins — same context the rider sees, so the driver knows
  // where they're headed without needing a separate screen.
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null
      if (pickupPos) pickupMarkerRef.current = L.marker(pickupPos, { icon: makePickupIcon(L) }).addTo(map)
    })
  }, [pickupPos?.[0], pickupPos?.[1]])

  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      dropMarkerRef.current?.remove(); dropMarkerRef.current = null
      if (dropPos) dropMarkerRef.current = L.marker(dropPos, { icon: makeDropIcon(L) }).addTo(map)
    })
  }, [dropPos?.[0], dropPos?.[1]])

  // Route polyline — fit the map to it once when a route first appears (or
  // changes leg, e.g. pickup-leg → drop-leg), then let the driver-marker
  // effect's panTo take back over so the view follows the driver, not a
  // fixed frame.
  useEffect(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      routeShadowRef.current?.remove(); routeShadowRef.current = null
      routeLineRef.current?.remove(); routeLineRef.current = null
      hasFitRouteRef.current = false

      if (!route || route.length === 0) return

      routeShadowRef.current = L.polyline(route, { color: '#1a1a2e', weight: 7, opacity: 0.1 }).addTo(map)
      routeLineRef.current = L.polyline(route, {
        color: '#ea580c', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
      }).addTo(map)

      if (!hasFitRouteRef.current) {
        map.fitBounds(routeLineRef.current.getBounds(), {
          paddingTopLeft: [40, 100], paddingBottomRight: [40, 220], animate: true, duration: 0.7,
        })
        hasFitRouteRef.current = true
      }
    })
  }, [route])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} className={className} />
    </>
  )
}
