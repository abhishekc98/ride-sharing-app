import { create } from 'zustand'

export type RideStatus =
  | 'idle'
  | 'requested'
  | 'searching'
  | 'driver_assigned'
  | 'en_route'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

interface DriverInfo {
  id: string
  name: string
  phone: string
  rating: number
  profilePhotoUrl?: string
  vehicle: { type: string; make: string; model: string; color: string; plateNo: string }
  lat?: number
  lng?: number
}

interface RideState {
  rideId: string | null
  status: RideStatus
  fareEstimate: number | null
  driver: DriverInfo | null
  pickup: { address: string; lat: number; lng: number } | null
  drop: { address: string; lat: number; lng: number } | null
  vehicleType: 'bike' | 'auto' | 'cab'
  paymentPreference: 'wallet' | 'card' | 'cash'
  setRide: (rideId: string, status: RideStatus) => void
  setStatus: (status: RideStatus) => void
  setDriver: (driver: DriverInfo) => void
  setDriverLocation: (lat: number, lng: number) => void
  setPickup: (pickup: RideState['pickup']) => void
  setDrop: (drop: RideState['drop']) => void
  setFareEstimate: (fare: number) => void
  setVehicleType: (type: RideState['vehicleType']) => void
  setPaymentPreference: (pref: RideState['paymentPreference']) => void
  reset: () => void
}

export const useRideStore = create<RideState>((set) => ({
  rideId: null,
  status: 'idle',
  fareEstimate: null,
  driver: null,
  pickup: null,
  drop: null,
  vehicleType: 'bike',
  paymentPreference: 'wallet',
  setRide: (rideId, status) => set({ rideId, status }),
  setStatus: (status) => set({ status }),
  setDriver: (driver) => set({ driver }),
  setDriverLocation: (lat, lng) =>
    set((s) => ({ driver: s.driver ? { ...s.driver, lat, lng } : null })),
  setPickup: (pickup) => set({ pickup }),
  setDrop: (drop) => set({ drop }),
  setFareEstimate: (fare) => set({ fareEstimate: fare }),
  setVehicleType: (vehicleType) => set({ vehicleType }),
  setPaymentPreference: (paymentPreference) => set({ paymentPreference }),
  // pickup/drop are deliberately cleared too — leaving them set meant
  // cancelling a ride dropped straight back into RideConfirmBar with the
  // exact same stale trip and a live "Book Ride" button sitting right where
  // "Cancel Ride" had just been, one tap away from silently re-booking it.
  reset: () =>
    set({ rideId: null, status: 'idle', fareEstimate: null, driver: null, pickup: null, drop: null }),
}))
