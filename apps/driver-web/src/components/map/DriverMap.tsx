'use client'
import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker, LatLngTuple } from 'leaflet'

interface Props {
  center?: LatLngTuple
  driverPos?: LatLngTuple
  pickupPos?: LatLngTuple
  dropPos?: LatLngTuple
  route?: LatLngTuple[]
  className?: string
}

export default function DriverMap({ center = [12.9716, 77.5946], driverPos, pickupPos, dropPos, route, className = 'h-full w-full' }: Props) {
  const mapRef = useRef<LeafletMap | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const driverMarkerRef = useRef<Marker | null>(null)

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

  useEffect(() => {
    if (!mapRef.current || !driverPos) return
    import('leaflet').then((L) => {
      const icon = L.divIcon({ html: '🛵', className: 'text-3xl', iconSize: [36, 36], iconAnchor: [18, 18] })
      if (driverMarkerRef.current) driverMarkerRef.current.setLatLng(driverPos)
      else driverMarkerRef.current = L.marker(driverPos, { icon }).addTo(mapRef.current!)
      mapRef.current!.panTo(driverPos)
    })
  }, [driverPos])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} className={className} />
    </>
  )
}
