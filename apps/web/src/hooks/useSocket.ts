'use client'
import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { useRideStore } from '@/stores/rideStore'

export function useSocket() {
  const { setStatus, setDriver, setDriverLocation, rideId } = useRideStore()
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

  return socketRef.current
}
