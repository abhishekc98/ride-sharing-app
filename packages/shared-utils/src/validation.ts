export function isValidPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone)
}

export function isValidOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp)
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export function maskPhone(phone: string): string {
  return phone.replace(/(\+\d{2})(\d+)(\d{4})/, '$1******$3')
}
