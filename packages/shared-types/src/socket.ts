import type { LatLng } from './ride.js'
import type { RideStatus } from './ride.js'
import type { VehicleType } from './driver.js'

export interface DriverLocationPayload {
  driverId: string
  lat: number
  lng: number
  heading?: number
  speed?: number
  timestamp: number
}

export interface RideStatePayload {
  rideId: string
  status: RideStatus
  driverId?: string
  driverName?: string
  driverPhone?: string
  driverRating?: number
  vehicleType?: VehicleType
  vehiclePlate?: string
  eta?: number
}

export interface RideRequestPayload {
  rideId: string
  pickupAddress: string
  dropAddress: string
  pickupLat: number
  pickupLng: number
  dropLat: number
  dropLng: number
  fareEstimate: number
  vehicleType: VehicleType
  distanceKm: number
  timeoutSeconds: number
}

export interface ServerToClientEvents {
  driver_location: (data: DriverLocationPayload) => void
  ride_state: (data: RideStatePayload) => void
  ride_request: (data: RideRequestPayload) => void
  ride_request_cancelled: (data: { rideId: string }) => void
  ping: () => void
}

export interface ClientToServerEvents {
  join_ride: (data: { rideId: string }) => void
  leave_ride: (data: { rideId: string }) => void
  pong: () => void
}
