import type { VehicleType } from './driver.js'

export type RideStatus =
  | 'requested'
  | 'searching'
  | 'driver_assigned'
  | 'en_route'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type CancelledBy = 'rider' | 'driver' | 'system'

export interface LatLng {
  lat: number
  lng: number
}

export interface Ride {
  id: string
  riderId: string
  driverId?: string
  status: RideStatus
  vehicleType: VehicleType
  pickup: Location
  drop: Location
  routePolyline?: string
  fareEstimate: number
  fareFinal?: number
  surgeMultiplier: number
  promoCode?: string
  promoDiscount?: number
  paymentMethod?: PaymentMethod
  paymentStatus?: PaymentStatus
  cancelledBy?: CancelledBy
  cancelReason?: string
  requestedAt: string
  assignedAt?: string
  startedAt?: string
  endedAt?: string
  cancelledAt?: string
  driver?: RideDriver
  durationMinutes?: number
  distanceKm?: number
}

export interface Location {
  address: string
  lat: number
  lng: number
}

export interface RideDriver {
  id: string
  name: string
  phone: string
  rating: number
  profilePhotoUrl?: string
  vehicle: {
    type: VehicleType
    make: string
    model: string
    color: string
    plateNo: string
  }
}

export type PaymentMethod = 'wallet' | 'upi' | 'card' | 'cash'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface FareEstimate {
  vehicleType: VehicleType
  distanceKm: number
  durationMinutes: number
  baseFare: number
  perKmRate: number
  perMinRate: number
  surgeMultiplier: number
  surgeZone?: string
  total: number
  breakdown: {
    base: number
    distance: number
    time: number
    surge: number
  }
}

export interface RideEvent {
  rideId: string
  event: string
  timestamp: string
  actorId: string
  payload?: Record<string, unknown>
}
