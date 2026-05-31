export type RaterRole = 'rider' | 'driver'

export interface Rating {
  id: string
  rideId: string
  fromUserId: string
  toUserId: string
  role: RaterRole
  score: number
  comment?: string
  createdAt: string
}
