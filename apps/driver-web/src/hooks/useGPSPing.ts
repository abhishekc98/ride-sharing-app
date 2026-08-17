'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'
import { getRoute } from '@/lib/osrm'

const PING_INTERVAL_MS = process.env.NEXT_PUBLIC_DEV_BYPASS_OTP === 'true' ? 10000 : 30000

// Dev-only: a stationary laptop's real GPS never moves, so there's nothing to
// watch on the rider's map during local testing. When on, this walks a
// simulated position along the real road route toward pickup, then drop,
// over the same ping path real GPS would use — see tests/manual-ride-flow.md.
export const SIMULATE_GPS = process.env.NEXT_PUBLIC_SIMULATE_GPS === 'true'
const SIM_TICK_MS = 2000
const SIM_STEP_FRACTION = 0.35 // fraction of remaining distance to the next waypoint covered per tick
const SIM_SNAP_EPSILON_DEG = 0.00015 // ~15m — waypoints sit close together on a real route, so this is tighter than the old single-target version
// MG Road, Bangalore — matches the pickup .e2e-test.mjs uses, so a simulated
// driver going online is always within matching radius of that test's ride.
// Also used by home/page.tsx to seed "Go Online" when simulating.
export const SIM_DEFAULT_SEED = { lat: 12.9716, lng: 77.5946 }

type Pos = { lat: number; lng: number; heading?: number; speed?: number }

function bearing(from: Pos, to: Pos) {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Live position (real or simulated) AND the route to the current leg's
// target, both owned here so they can never drift apart — the previous
// version fetched a route in the page component and walked a straight line
// toward the raw target in the hook, two independent systems that visibly
// diverged (the marker cut through blocks while the drawn line followed
// roads) and left the line stale once the driver had moved past where it
// was computed from. Only populated while online.
export function useGPSPing() {
  const { isOnline, currentRide } = useDriverStore()
  const [position, setPosition] = useState<Pos | null>(null)
  const [route, setRoute] = useState<[number, number][] | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastPos = useRef<Pos | null>(null)
  const currentRideRef = useRef(currentRide)
  currentRideRef.current = currentRide

  useEffect(() => {
    if (!isOnline || typeof navigator === 'undefined') {
      setPosition(null)
      setRoute(null)
      return
    }

    // legKey identifies "which leg of which ride" — pickup or drop — so a
    // route is only (re-)fetched on an actual phase change, not every tick.
    let legKey: string | null = null
    let waypoints: Pos[] | null = null
    let waypointIndex = 0
    let fetchingLegKey: string | null = null

    const currentTarget = (): { target: Pos | null; key: string | null } => {
      const ride = currentRideRef.current
      if (ride?.status === 'in_progress' && ride.dropLat != null && ride.dropLng != null) {
        return { target: { lat: ride.dropLat, lng: ride.dropLng }, key: `${ride.id}:drop` }
      }
      if ((ride?.status === 'driver_assigned' || ride?.status === 'en_route') && ride.pickupLat != null && ride.pickupLng != null) {
        return { target: { lat: ride.pickupLat, lng: ride.pickupLng }, key: `${ride.id}:pickup` }
      }
      return { target: null, key: null }
    }

    const fetchRoute = (from: Pos, target: Pos, key: string) => {
      if (fetchingLegKey === key) return
      fetchingLegKey = key
      getRoute(from, target)
        .then((r) => {
          if (fetchingLegKey !== key) return // a newer leg started while this was in flight
          waypoints = r.polyline.map(([lat, lng]) => ({ lat, lng }))
          waypointIndex = 0
          legKey = key
          setRoute(r.polyline)
        })
        .catch(() => {
          if (fetchingLegKey === key) fetchingLegKey = null
        })
    }

    const ping = () => {
      if (!lastPos.current) return
      const { lat, lng, heading, speed } = lastPos.current
      api.post('/api/v1/location/ping', { lat, lng, heading, speed }).catch(() => {})
    }

    if (SIMULATE_GPS) {
      const tick = () => {
        const { target, key } = currentTarget()

        if (!key) {
          // No active leg (idle, holding at pickup, or ride over) — stay put.
          if (legKey) { legKey = null; waypoints = null; setRoute(null) }
          if (!lastPos.current) lastPos.current = { ...SIM_DEFAULT_SEED, heading: 0, speed: 0 }
          setPosition(lastPos.current)
          return
        }

        if (!lastPos.current) {
          // Start a short distance off so movement toward the route is visible.
          lastPos.current = { lat: target!.lat - 0.01, lng: target!.lng - 0.01, heading: 0, speed: 8 }
        }

        if (key !== legKey) fetchRoute(lastPos.current, target!, key)

        // Walk the fetched route's waypoints in order; until it resolves (or
        // if it failed), fall back to a straight line at the same easing so
        // the driver still moves rather than freezing for a tick or two.
        const onRoute = legKey === key && waypoints && waypoints.length > 0
        const stepTarget = onRoute ? waypoints![Math.min(waypointIndex, waypoints!.length - 1)] : target!
        const isFinalPoint = !onRoute || waypointIndex >= waypoints!.length - 1

        const dLat = stepTarget.lat - lastPos.current.lat
        const dLng = stepTarget.lng - lastPos.current.lng
        const dist = Math.hypot(dLat, dLng)

        if (dist < SIM_SNAP_EPSILON_DEG) {
          if (onRoute && !isFinalPoint) {
            waypointIndex++
          } else {
            lastPos.current = { ...lastPos.current, lat: stepTarget.lat, lng: stepTarget.lng, speed: 0 }
          }
        } else {
          lastPos.current = {
            lat: lastPos.current.lat + dLat * SIM_STEP_FRACTION,
            lng: lastPos.current.lng + dLng * SIM_STEP_FRACTION,
            heading: bearing(lastPos.current, stepTarget),
            speed: 8,
          }
        }
        setPosition(lastPos.current)
      }
      tick()
      simIntervalRef.current = setInterval(tick, SIM_TICK_MS)
    } else if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          lastPos.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
          }
          setPosition(lastPos.current)

          const { target, key } = currentTarget()
          if (!key) {
            if (legKey) { legKey = null; setRoute(null) }
          } else if (key !== legKey) {
            fetchRoute(lastPos.current, target!, key)
          }
        },
        (err) => console.warn('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }

    ping()
    pingIntervalRef.current = setInterval(ping, PING_INTERVAL_MS)

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
    }
  }, [isOnline])

  return { position, route }
}
