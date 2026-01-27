"""PurpleAir API client."""

import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import os

API_BASE = "https://api.purpleair.com/v1"


class PurpleAirClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {"X-API-Key": api_key}
    
    async def get_sensor(self, sensor_id: int) -> Dict[str, Any]:
        """Get current sensor data."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE}/sensors/{sensor_id}",
                headers=self.headers,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    
    async def get_sensor_history(
        self,
        sensor_id: int,
        fields: List[str],
        start_timestamp: Optional[int] = None,
        end_timestamp: Optional[int] = None,
        average: int = 60  # Minutes: 10, 30, 60, 360, 1440
    ) -> Dict[str, Any]:
        """Get historical sensor data."""
        params = {
            "fields": ",".join(fields),
            "average": average
        }
        
        if start_timestamp:
            params["start_timestamp"] = start_timestamp
        if end_timestamp:
            params["end_timestamp"] = end_timestamp
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE}/sensors/{sensor_id}/history",
                headers=self.headers,
                params=params,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    
    async def get_nearby_sensors(
        self,
        lat: float,
        lon: float,
        distance_km: float = 10,
        limit: int = 5
    ) -> Dict[str, Any]:
        """Get nearby sensors."""
        # Convert km to meters (API uses meters)
        distance_m = distance_km * 1000
        
        params = {
            "fields": "name,latitude,longitude,pm2.5,humidity,temperature",
            "location_type": 0,  # Outdoor
            "nwlat": lat + 0.1,
            "nwlng": lon - 0.1,
            "selat": lat - 0.1,
            "selng": lon + 0.1,
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE}/sensors",
                headers=self.headers,
                params=params,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    
    async def get_history_24h(self, sensor_id: int) -> Dict[str, Any]:
        """Get 24-hour history with 10-minute averages."""
        start = int((datetime.utcnow() - timedelta(hours=24)).timestamp())
        return await self.get_sensor_history(
            sensor_id,
            ["pm2.5_atm", "pm2.5_cf_1", "humidity", "temperature"],
            start_timestamp=start,
            average=10
        )
    
    async def get_history_7d(self, sensor_id: int) -> Dict[str, Any]:
        """Get 7-day history with hourly averages."""
        start = int((datetime.utcnow() - timedelta(days=7)).timestamp())
        return await self.get_sensor_history(
            sensor_id,
            ["pm2.5_atm", "pm2.5_cf_1", "humidity", "temperature"],
            start_timestamp=start,
            average=60
        )
    
    async def get_history_30d(self, sensor_id: int) -> Dict[str, Any]:
        """Get 30-day history with 6-hour averages."""
        start = int((datetime.utcnow() - timedelta(days=30)).timestamp())
        return await self.get_sensor_history(
            sensor_id,
            ["pm2.5_atm", "pm2.5_cf_1", "humidity", "temperature"],
            start_timestamp=start,
            average=360
        )
