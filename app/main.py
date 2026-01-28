"""AQI Dashboard - FastAPI Backend."""

import os
from datetime import datetime, timedelta
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from .purpleair import PurpleAirClient
from .aqi import (
    calculate_aqi, apply_epa_correction, aqi_to_cigarettes,
    interpolate_outliers, calculate_iqr_bands, filter_valid_sensor_data
)
from .jokes import get_random_joke, get_total_jokes

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
        
        # Calculate cigarettes equivalent
        cigarettes = aqi_to_cigarettes(aqi)
        
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
                "message": message,
                "cigarettes_per_day": round(cigarettes, 2)
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
        # Calculate exact timestamps for the period
        now = datetime.utcnow()
        
        if period == "24h":
            start_time = now - timedelta(hours=24)
            average = 10  # 10-minute averages
        elif period == "7d":
            start_time = now - timedelta(days=7)
            average = 60  # Hourly averages
        elif period == "30d":
            start_time = now - timedelta(days=30)
            average = 360  # 6-hour averages
        else:
            raise HTTPException(status_code=400, detail="Invalid period. Use 24h, 7d, or 30d")
        
        start_timestamp = int(start_time.timestamp())
        end_timestamp = int(now.timestamp())
        
        # Fetch data with explicit timestamps
        data = await client.get_sensor_history(
            SENSOR_ID,
            ["pm2.5_atm", "pm2.5_cf_1", "humidity", "temperature"],
            start_timestamp=start_timestamp,
            end_timestamp=end_timestamp,
            average=average
        )
        
        # Process the data
        fields = data.get("fields", [])
        raw_data = data.get("data", [])
        
        # Convert to list of dicts with calculated AQI
        processed = []
        for row in raw_data:
            entry = dict(zip(fields, row))
            timestamp = entry.get("time_stamp", 0)
            
            # Skip data outside our window
            if timestamp < start_timestamp or timestamp > end_timestamp:
                continue
                
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
                "color": color,
                "interpolated": False
            })
        
        # Sort by timestamp
        processed.sort(key=lambda x: x["timestamp"])
        
        # Apply outlier detection and interpolation
        processed = interpolate_outliers(processed, 'aqi')
        
        # Calculate IQR bands (especially useful for 7d and 30d)
        aqi_values = [d['aqi'] for d in processed if not d.get('interpolated', False)]
        iqr_stats = calculate_iqr_bands(aqi_values)
        
        # Calculate rolling IQR for chart bands (group by time windows)
        iqr_bands = []
        if period in ['7d', '30d'] and len(processed) > 10:
            window_size = 6 if period == '7d' else 12  # 6 hours for 7d, 12 hours for 30d
            for i in range(0, len(processed), window_size):
                window = processed[i:i + window_size]
                if window:
                    window_values = [d['aqi'] for d in window if d['aqi'] > 0]
                    if len(window_values) >= 3:
                        sorted_vals = sorted(window_values)
                        n = len(sorted_vals)
                        q1 = sorted_vals[n // 4] if n >= 4 else sorted_vals[0]
                        q3 = sorted_vals[(3 * n) // 4] if n >= 4 else sorted_vals[-1]
                        median = sorted_vals[n // 2]
                        
                        iqr_bands.append({
                            "timestamp": window[len(window)//2]['timestamp'],
                            "q1": q1,
                            "median": median,
                            "q3": q3
                        })
        
        # Calculate cigarettes stats
        avg_aqi = sum(aqi_values) / len(aqi_values) if aqi_values else 0
        cigarettes_avg = aqi_to_cigarettes(int(avg_aqi))
        
        return {
            "sensor_id": SENSOR_ID,
            "period": period,
            "average_minutes": average,
            "data_points": len(processed),
            "start_time": start_time.isoformat(),
            "end_time": now.isoformat(),
            "data": processed,
            "statistics": iqr_stats,
            "iqr_bands": iqr_bands,
            "cigarettes_per_day_avg": round(cigarettes_avg, 2)
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
        
        # Filter out invalid/outlier sensors
        nearby_sensors = filter_valid_sensor_data(nearby_sensors)
        
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


@app.get("/api/joke")
async def get_joke() -> Dict[str, Any]:
    """Get a random dad joke."""
    return {
        "joke": get_random_joke(),
        "total_jokes": get_total_jokes()
    }


# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
