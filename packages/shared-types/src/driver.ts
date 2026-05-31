export type KycStatus = 'pending' | 'submitted' | 'approved' | 'rejected'
export type DriverStatus = 'offline' | 'online' | 'on_ride'
export type VehicleType = 'bike' | 'auto' | 'cab'

export interface Driver {
  id: string
  userId: string
  name: string
  phone: string
  profilePhotoUrl?: string
  licenseNo: string
  kycStatus: KycStatus
  status: DriverStatus
  rating: number
  totalRides: number
  acceptanceRate: number
  vehicle: Vehicle
  earnings: DriverEarnings
  createdAt: string
}

export interface Vehicle {
  id: string
  driverId: string
  type: VehicleType
  make: string
  model: string
  year: number
  plateNo: string
  color: string
  rcDocUrl?: string
  insuranceDocUrl?: string
}

export interface DriverEarnings {
  today: number
  thisWeek: number
  thisMonth: number
  total: number
  pendingPayout: number
}

export interface KycDocuments {
  selfieUrl?: string
  licenseUrl?: string
  rcUrl?: string
  insuranceUrl?: string
}

export interface NearbyDriver {
  driverId: string
  lat: number
  lng: number
  distanceKm: number
  vehicle: Pick<Vehicle, 'type' | 'make' | 'model' | 'color' | 'plateNo'>
  rating: number
  name: string
  profilePhotoUrl?: string
}
