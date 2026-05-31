export type TransactionType = 'credit' | 'debit'
export type TransactionReason =
  | 'ride_payment'
  | 'wallet_topup'
  | 'refund'
  | 'cashback'
  | 'referral_bonus'
  | 'promo'

export interface Payment {
  id: string
  rideId: string
  userId: string
  amount: number
  method: string
  gatewayRef?: string
  status: 'pending' | 'captured' | 'failed' | 'refunded'
  createdAt: string
}

export interface WalletTransaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  balanceAfter: number
  reason: TransactionReason
  refId?: string
  description: string
  createdAt: string
}

export interface PromoCode {
  id: string
  code: string
  discountType: 'flat' | 'percent'
  discountValue: number
  maxDiscount?: number
  minRideAmount?: number
  maxUses: number
  usedCount: number
  expiresAt: string
  isActive: boolean
}
