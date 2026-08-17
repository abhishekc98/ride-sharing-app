import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DriverUser {
  id: string
  phone: string
  role: string
  name?: string
  kycStatus?: string
}

interface RideRequest {
  rideId: string
  pickupAddress: string
  dropAddress: string
  pickupLat: number
  pickupLng: number
  dropLat: number
  dropLng: number
  fareEstimate: number
  vehicleType: string
  distanceKm: number
  timeoutSeconds: number
}

interface DriverState {
  user: DriverUser | null
  accessToken: string | null
  refreshToken: string | null
  isOnline: boolean
  currentRide: {
    id: string
    status: string
    riderId?: string
    pickupLat?: number
    pickupLng?: number
    dropLat?: number
    dropLng?: number
  } | null
  pendingRequest: RideRequest | null
  _hasHydrated: boolean
  setAuth: (user: DriverUser, accessToken: string, refreshToken: string) => void
  clearAuth: () => void
  setOnline: (online: boolean) => void
  setCurrentRide: (ride: DriverState['currentRide']) => void
  setRideStatus: (status: string) => void
  setPendingRequest: (req: RideRequest | null) => void
  setHasHydrated: (v: boolean) => void
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isOnline: false,
      currentRide: null,
      pendingRequest: null,
      _hasHydrated: false,
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('driverAccessToken', accessToken)
        localStorage.setItem('driverRefreshToken', refreshToken)
        set({ user, accessToken, refreshToken })
      },
      clearAuth: () => {
        localStorage.removeItem('driverAccessToken')
        localStorage.removeItem('driverRefreshToken')
        set({ user: null, accessToken: null, refreshToken: null })
      },
      setOnline: (isOnline) => set({ isOnline }),
      setCurrentRide: (currentRide) => set({ currentRide }),
      setRideStatus: (status) =>
        set((s) => ({ currentRide: s.currentRide ? { ...s.currentRide, status } : null })),
      setPendingRequest: (pendingRequest) => set({ pendingRequest }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'ride-driver',
      onRehydrateStorage: () => (state) => { state?.setHasHydrated(true) },
    }
  )
)
