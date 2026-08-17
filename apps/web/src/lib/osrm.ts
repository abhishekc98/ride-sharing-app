export interface RouteResult {
  polyline: [number, number][]
  distanceKm: number
  durationMinutes: number
}

export async function getRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Routing failed')
  const data = await res.json()
  const route = data.routes[0]
  return {
    polyline: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
  }
}

export async function geocode(query: string): Promise<{ lat: number; lng: number; address: string }[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`
  const res = await fetch(url, { headers: { 'User-Agent': 'RideApp/1.0' } })
  const data = await res.json()
  return data.map((item: any) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    address: item.display_name,
  }))
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': 'RideApp/1.0' } })
  const data = await res.json()
  return data.display_name ?? 'Pinned location'
}
