'use client'
import { useState, useEffect } from 'react'

interface Position {
  lat: number
  lng: number
}

const SIMULATE_GPS = process.env.NEXT_PUBLIC_SIMULATE_GPS === 'true'
// MG Road, Bangalore — must match SIM_DEFAULT_SEED in
// apps/driver-web/src/hooks/useGPSPing.ts so a simulated rider's pickup
// and a simulated driver's "Go Online" position land within matching
// radius of each other during local testing. See tests/manual-ride-flow.md.
const SIM_DEFAULT_SEED: Position = { lat: 12.9716, lng: 77.5946 }

export function useGeolocation() {
  const [position, setPosition] = useState<Position | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (SIMULATE_GPS) {
      setPosition(SIM_DEFAULT_SEED)
      return
    }
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  return { position, error }
}
