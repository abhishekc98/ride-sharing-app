'use client'
import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { useRideStore } from '@/stores/rideStore'

export function useSocket() {
  const { setStatus, setDriver, setDriverLocation, rideId, driver } = useRideStore()
  const socketRef = useRef(getSocket())

  useEffect(() => {
    const socket = socketRef.current

    socket.on('ride_state', (data) => {
      setStatus(data.status)
      if (data.driverId) {
        setDriver({
          id: data.driverId,
          name: data.driverName ?? '',
          phone: data.driverPhone ?? '',
          rating: data.driverRating ?? 5,
          vehicle: {
            type: data.vehicleType ?? 'bike',
            make: '',
            model: '',
            color: '',
            plateNo: data.vehiclePlate ?? '',
          },
        })
      }
    })

    socket.on('driver_location', (data) => {
      setDriverLocation(data.lat, data.lng)
    })

    return () => {
      socket.off('ride_state')
      socket.off('driver_location')
    }
  }, [setStatus, setDriver, setDriverLocation])

  useEffect(() => {
    const socket = socketRef.current
    if (rideId) socket.emit('join_ride', { rideId })
    return () => {
      if (rideId) socket.emit('leave_ride', { rideId })
    }
  }, [rideId])

  // The driver's live location only reaches driver_tracking:{driverId} —
  // has to be explicitly joined once we know who's assigned, same as the
  // ride room above, or driver_location events have nowhere to land.
  useEffect(() => {
    const socket = socketRef.current
    if (driver?.id) socket.emit('track_driver', { driverId: driver.id })
    return () => {
      if (driver?.id) socket.emit('untrack_driver', { driverId: driver.id })
    }
  }, [driver?.id])

  return socketRef.current
}
