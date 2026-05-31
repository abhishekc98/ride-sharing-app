'use client'
import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'

const PING_INTERVAL_MS = process.env.NEXT_PUBLIC_DEV_BYPASS_OTP === 'true' ? 10000 : 30000

export function useGPSPing() {
  const { isOnline } = useDriverStore()
  const watchIdRef = useRef<number | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastPos = useRef<GeolocationPosition | null>(null)

  useEffect(() => {
    if (!isOnline || typeof navigator === 'undefined') return

    // Watch position continuously
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => { lastPos.current = pos },
        (err) => console.warn('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }

    // Ping server on interval
    const ping = () => {
      if (!lastPos.current) return
      const { coords } = lastPos.current
      api.post('/api/v1/location/ping', {
        lat: coords.latitude,
        lng: coords.longitude,
        heading: (coords as any).heading ?? undefined,
        speed: coords.speed ?? undefined,
      }).catch(() => {})
    }

    ping()
    pingIntervalRef.current = setInterval(ping, PING_INTERVAL_MS)

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    }
  }, [isOnline])
}
