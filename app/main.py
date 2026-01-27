"""AQI Dashboard - FastAPI Backend."""

import os
from datetime import datetime
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from .purpleair import PurpleAirClient
from .aqi import calculate_aqi, apply_epa_correction

load_dotenv()

API_KEY = os.getenv("PURPLEAIR_API_KEY")
SENSOR_ID = int(os.getenv("SENSOR_ID", "133437"))

if not API_KEY:
    raise ValueError("PURPLEAIR_API_KEY not set in environment")

app = FastAPI(
    title="AQI Dashboard",
    description="Real-time air quality monitoring for your PurpleAir sensor",
    version="1.0.0"
)

client = PurpleAirClient(API_KEY)

# Get the directory where this file is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


@app.get("/", response_class=FileResponse)
async def root():
    """Serve the dashboard."""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/current")
async def get_current_data() -> Dict[str, Any]:
    """Get current sensor readings with AQI calculation."""
    try:
        data = await client.get_sensor(SENSOR_ID)
        sensor = data.get("sensor", {})
        
        # Get PM2.5 values
        pm25_atm = sensor.get("pm2.5_atm", sensor.get("pm2.5", 0))
        pm25_cf1 = sensor.get("pm2.5_cf_1", pm25_atm)
        humidity = sensor.get("humidity", 50)
        
        # Apply EPA correction for more accurate reading
        pm25_corrected = apply_epa_correction(pm25_cf1, humidity)
        
        # Calculate AQI
        aqi, category, color, message = calculate_aqi(pm25_corrected)
        
        return {
            "sensor_id": SENSOR_ID,
            "name": sensor.get("name", "Unknown"),
            "location": {
                "latitude": sensor.get("latitude"),
                "longitude": sensor.get("longitude"),
                "altitude": sensor.get("altitude")
            },
            "model": sensor.get("model"),
            "firmware": sensor.get("firmware_version"),
            "last_seen": sensor.get("last_seen"),
            "last_seen_formatted": datetime.fromtimestamp(sensor.get("last_seen", 0)).strftime("%Y-%m-%d %H:%M:%S"),
            "readings": {
                "pm25_raw": round(pm25_atm, 1),
                "pm25_corrected": round(pm25_corrected, 1),
                "pm1": round(sensor.get("pm1.0", 0), 1),
                "pm10": round(sensor.get("pm10.0", 0), 1),
                "temperature_f": sensor.get("temperature"),
                "temperature_c": round((sensor.get("temperature", 70) - 32) * 5/9, 1),
                "humidity": sensor.get("humidity"),
                "pressure": round(sensor.get("pressure", 0), 1)
            },
            "aqi": {
                "value": aqi,
                "category": category,
                "color": color,
                "message": message
            },
            "confidence": sensor.get("confidence", 100),
            "channel_state": sensor.get("channel_state"),
            "timestamp": data.get("data_time_stamp")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/{period}")
async def get_history(period: str) -> Dict[str, Any]:
    """Get historical data for specified period (24h, 7d, 30d)."""
    try:
        if period == "24h":
            data = await client.get_history_24h(SENSOR_ID)
        elif period == "7d":
            data = await client.get_history_7d(SENSOR_ID)
        elif period == "30d":
            data = await client.get_history_30d(SENSOR_ID)
        else:
            raise HTTPException(status_code=400, detail="Invalid period. Use 24h, 7d, or 30d")
        
        # Process the data
        fields = data.get("fields", [])
        raw_data = data.get("data", [])
        
        # Convert to list of dicts with calculated AQI
        processed = []
        for row in raw_data:
            entry = dict(zip(fields, row))
            timestamp = entry.get("time_stamp", 0)
            pm25_cf1 = entry.get("pm2.5_cf_1", entry.get("pm2.5_atm", 0))
            humidity = entry.get("humidity", 50)
            
            pm25_corrected = apply_epa_correction(pm25_cf1, humidity) if pm25_cf1 else 0
            aqi, category, color, _ = calculate_aqi(pm25_corrected)
            
            processed.append({
                "timestamp": timestamp,
                "datetime": datetime.fromtimestamp(timestamp).isoformat() if timestamp else None,
                "pm25": round(pm25_corrected, 1),
                "pm25_raw": entry.get("pm2.5_atm", 0),
                "humidity": entry.get("humidity"),
                "temperature": entry.get("temperature"),
                "aqi": aqi,
                "category": category,
                "color": color
            })
        
        # Sort by timestamp
        processed.sort(key=lambda x: x["timestamp"])
        
        return {
            "sensor_id": SENSOR_ID,
            "period": period,
            "average_minutes": data.get("average"),
            "data_points": len(processed),
            "data": processed
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/nearby")
async def get_nearby_sensors() -> Dict[str, Any]:
    """Get nearby sensors for comparison."""
    try:
        # First get our sensor's location
        sensor_data = await client.get_sensor(SENSOR_ID)
        sensor = sensor_data.get("sensor", {})
        lat = sensor.get("latitude")
        lon = sensor.get("longitude")
        
        if not lat or not lon:
            raise HTTPException(status_code=400, detail="Sensor location not available")
        
        # Get nearby sensors
        nearby = await client.get_nearby_sensors(lat, lon, distance_km=15)
        
        fields = nearby.get("fields", [])
        sensors_data = nearby.get("data", [])
        
        # Process nearby sensors
        nearby_sensors = []
        for row in sensors_data:
            s = dict(zip(fields, row))
            sensor_id = s.get("sensor_index")
            
            # Skip our own sensor
            if sensor_id == SENSOR_ID:
                continue
            
            pm25 = s.get("pm2.5", 0) or 0
            aqi, category, color, _ = calculate_aqi(pm25)
            
            nearby_sensors.append({
                "sensor_id": sensor_id,
                "name": s.get("name", "Unknown"),
                "latitude": s.get("latitude"),
                "longitude": s.get("longitude"),
                "pm25": round(pm25, 1),
                "aqi": aqi,
                "category": category,
                "color": color,
                "humidity": s.get("humidity"),
                "temperature": s.get("temperature")
            })
        
        # Sort by AQI
        nearby_sensors.sort(key=lambda x: x["aqi"])
        
        return {
            "reference_sensor": SENSOR_ID,
            "reference_location": {"latitude": lat, "longitude": lon},
            "nearby_count": len(nearby_sensors),
            "sensors": nearby_sensors[:10]  # Limit to 10
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
