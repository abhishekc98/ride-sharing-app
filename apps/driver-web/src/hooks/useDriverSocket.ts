'use client'
import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { useDriverStore } from '@/stores/driverStore'

export function useDriverSocket() {
  const { setPendingRequest, setRideStatus, setCurrentRide } = useDriverStore()
  const socketRef = useRef(getSocket())

  useEffect(() => {
    const socket = socketRef.current

    socket.on('ride_request', (data) => {
      setPendingRequest(data)
    })

    socket.on('ride_request_cancelled', ({ rideId }) => {
      const { pendingRequest } = useDriverStore.getState()
      if (pendingRequest?.rideId === rideId) setPendingRequest(null)
    })

    socket.on('ride_state', (data) => {
      setRideStatus(data.status)
      if (data.status === 'completed' || data.status === 'cancelled') {
        setCurrentRide(null)
      }
    })

    return () => {
      socket.off('ride_request')
      socket.off('ride_request_cancelled')
      socket.off('ride_state')
    }
  }, [setPendingRequest, setRideStatus, setCurrentRide])

  return socketRef.current
}
