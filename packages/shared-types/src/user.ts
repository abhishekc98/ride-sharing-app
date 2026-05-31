export type UserRole = 'rider' | 'driver' | 'admin'

export interface User {
  id: string
  phone: string
  name: string
  email?: string
  profilePhotoUrl?: string
  walletBalance: number
  role: UserRole
  referralCode: string
  createdAt: string
  updatedAt: string
}

export interface SavedAddress {
  id: string
  userId: string
  label: string
  address: string
  lat: number
  lng: number
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  phone: string
  role: UserRole
  profileComplete: boolean
}
