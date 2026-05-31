'use client'
import { useEffect, useRef, useState } from 'react'
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
  className?: string
}

export default function RiderMap({
  center = [12.9716, 77.5946],
  drivers = [],
  pickupMarker,
  dropMarker,
  route,
  driverLivePos,
  className = 'h-full w-full',
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkersRef = useRef<Map<string, Marker>>(new Map())
  const routeLineRef = useRef<Polyline | null>(null)
  const pickupMarkerRef = useRef<Marker | null>(null)
  const dropMarkerRef = useRef<Marker | null>(null)
  const liveDriverRef = useRef<Marker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return

      // Fix default icon
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current, { zoomControl: false }).setView(center, 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Nearby drivers
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then((L) => {
      const map = mapRef.current!
      const existing = driverMarkersRef.current
      const currentIds = new Set(drivers.map((d) => d.driverId))

      // Remove old
      existing.forEach((marker, id) => {
        if (!currentIds.has(id)) { marker.remove(); existing.delete(id) }
      })

      // Add/update
      const bikeIcon = L.divIcon({
        html: '🛵',
        className: 'text-2xl',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })

      drivers.forEach((d) => {
        if (existing.has(d.driverId)) {
          existing.get(d.driverId)!.setLatLng([d.lat, d.lng])
        } else {
          const marker = L.marker([d.lat, d.lng], { icon: bikeIcon })
            .addTo(map)
            .bindTooltip(`${d.distanceKm?.toFixed(1) ?? '?'} km`)
          existing.set(d.driverId, marker)
        }
      })
    })
  }, [drivers])

  // Route polyline
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then((L) => {
      routeLineRef.current?.remove()
      if (route && route.length > 0) {
        routeLineRef.current = L.polyline(route, { color: '#FF6B35', weight: 4 }).addTo(mapRef.current!)
        mapRef.current!.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] })
      }
    })
  }, [route])

  // Pickup + drop markers
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then((L) => {
      pickupMarkerRef.current?.remove()
      if (pickupMarker) {
        const icon = L.divIcon({ html: '📍', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 30] })
        pickupMarkerRef.current = L.marker(pickupMarker, { icon }).addTo(mapRef.current!).bindPopup('Pickup')
      }
      dropMarkerRef.current?.remove()
      if (dropMarker) {
        const icon = L.divIcon({ html: '🏁', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 30] })
        dropMarkerRef.current = L.marker(dropMarker, { icon }).addTo(mapRef.current!).bindPopup('Drop')
      }
    })
  }, [pickupMarker, dropMarker])

  // Live driver position (during ride)
  useEffect(() => {
    if (!mapRef.current || !driverLivePos) return
    import('leaflet').then((L) => {
      if (liveDriverRef.current) {
        liveDriverRef.current.setLatLng(driverLivePos)
      } else {
        const icon = L.divIcon({ html: '🛵', className: 'text-3xl', iconSize: [36, 36], iconAnchor: [18, 18] })
        liveDriverRef.current = L.marker(driverLivePos, { icon }).addTo(mapRef.current!)
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
