from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
import os
import redis as Redis
import json
import math
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Pricing Service")

redis_client = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

PRICING = {
    "bike": {"base": 20, "per_km": 8, "per_min": 1.0},
    "auto": {"base": 30, "per_km": 12, "per_min": 1.5},
    "cab": {"base": 50, "per_km": 15, "per_min": 2.0},
}

SURGE_ZONES = {
    # zone_id -> (center_lat, center_lng, radius_km)
    "mumbai_central": (19.0760, 72.8777, 5),
    "delhi_cp": (28.6328, 77.2197, 5),
    "bangalore_mg": (12.9716, 77.5946, 5),
}

def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def get_surge_multiplier(lat: float, lng: float) -> tuple[float, str | None]:
    for zone_id, (zlat, zlng, radius) in SURGE_ZONES.items():
        dist = haversine(lat, lng, zlat, zlng)
        if dist <= radius:
            cached = redis_client.get(f"surge:{zone_id}")
            if cached:
                return float(cached), zone_id
    return 1.0, None

def estimate_duration_minutes(distance_km: float) -> float:
    # Approximate 20 km/h avg speed in Indian cities
    return (distance_km / 20) * 60

@app.get("/api/v1/pricing/estimate")
async def get_estimate(
    pickupLat: float = Query(...),
    pickupLng: float = Query(...),
    dropLat: float = Query(...),
    dropLng: float = Query(...),
    vehicleType: str = Query(...),
):
    if vehicleType not in PRICING:
        raise HTTPException(400, "Invalid vehicle type")

    distance_km = haversine(pickupLat, pickupLng, dropLat, dropLng)
    duration_min = estimate_duration_minutes(distance_km)
    config = PRICING[vehicleType]
    surge, surge_zone = get_surge_multiplier(pickupLat, pickupLng)

    base = config["base"]
    dist_charge = config["per_km"] * distance_km
    time_charge = config["per_min"] * duration_min
    subtotal = (base + dist_charge + time_charge) * surge

    return {
        "data": {
            "vehicleType": vehicleType,
            "distanceKm": round(distance_km, 2),
            "durationMinutes": round(duration_min, 1),
            "baseFare": base,
            "perKmRate": config["per_km"],
            "perMinRate": config["per_min"],
            "surgeMultiplier": surge,
            "surgeZone": surge_zone,
            "total": round(subtotal),
            "breakdown": {
                "base": base,
                "distance": round(dist_charge, 2),
                "time": round(time_charge, 2),
                "surge": round(subtotal - (base + dist_charge + time_charge), 2),
            }
        }
    }

@app.post("/api/v1/pricing/surge/{zone_id}")
async def set_surge(zone_id: str, multiplier: float):
    """Admin endpoint to manually set surge for a zone"""
    redis_client.setex(f"surge:{zone_id}", 120, str(multiplier))
    return {"data": {"zone_id": zone_id, "multiplier": multiplier}}

@app.post("/api/v1/pricing/promo/validate")
async def validate_promo(body: dict):
    """Validate promo code — stub (DB query in production)"""
    code = body.get("code", "").upper()
    if code == "FIRST50":
        return {"data": {"valid": True, "discountType": "percent", "discountValue": 50, "maxDiscount": 100}}
    if code == "FLAT30":
        return {"data": {"valid": True, "discountType": "flat", "discountValue": 30}}
    return {"data": {"valid": False, "reason": "Invalid or expired promo code"}}

@app.get("/api/v1/pricing/health")
async def health():
    return {"status": "ok"}
