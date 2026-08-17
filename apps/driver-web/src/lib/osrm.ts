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
