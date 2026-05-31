import type { VehicleType } from '@ride/shared-types'

export const PRICING_CONFIG: Record<
  VehicleType,
  { baseFare: number; perKm: number; perMin: number }
> = {
  bike: { baseFare: 20, perKm: 8, perMin: 1 },
  auto: { baseFare: 30, perKm: 12, perMin: 1.5 },
  cab: { baseFare: 50, perKm: 15, perMin: 2 },
}

export function calculateFare(
  vehicleType: VehicleType,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier = 1
): number {
  const config = PRICING_CONFIG[vehicleType]
  const base =
    config.baseFare + config.perKm * distanceKm + config.perMin * durationMinutes
  return Math.round(base * surgeMultiplier)
}
