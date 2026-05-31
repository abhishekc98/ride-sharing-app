import jwt from 'jsonwebtoken'
import type { UserRole } from '@ride/shared-types'

interface AccessPayload {
  sub: string
  role: UserRole
  phone: string
}

interface RefreshPayload {
  sub: string
  jti: string
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn']) ?? '15m',
  })
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn']) ?? '30d',
  })
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AccessPayload
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as RefreshPayload
}
