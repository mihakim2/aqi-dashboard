"""AQI calculation and health categories."""

from typing import Tuple

# AQI breakpoints for PM2.5 (µg/m³)
PM25_BREAKPOINTS = [
    (0.0, 12.0, 0, 50, "Good", "#00e400", "Air quality is satisfactory, and air pollution poses little or no risk."),
    (12.1, 35.4, 51, 100, "Moderate", "#ffff00", "Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution."),
    (35.5, 55.4, 101, 150, "Unhealthy for Sensitive Groups", "#ff7e00", "Members of sensitive groups may experience health effects. The general public is less likely to be affected."),
    (55.5, 150.4, 151, 200, "Unhealthy", "#ff0000", "Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects."),
    (150.5, 250.4, 201, 300, "Very Unhealthy", "#8f3f97", "Health alert: The risk of health effects is increased for everyone."),
    (250.5, 500.4, 301, 500, "Hazardous", "#7e0023", "Health warning of emergency conditions: everyone is more likely to be affected."),
]


def calculate_aqi(pm25: float) -> Tuple[int, str, str, str]:
    """Calculate AQI from PM2.5 concentration.
    
    Returns: (aqi_value, category, color, health_message)
    """
    if pm25 < 0:
        pm25 = 0
    
    for c_low, c_high, i_low, i_high, category, color, message in PM25_BREAKPOINTS:
        if c_low <= pm25 <= c_high:
            # Linear interpolation
            aqi = ((i_high - i_low) / (c_high - c_low)) * (pm25 - c_low) + i_low
            return int(round(aqi)), category, color, message
    
    # Above 500.4 - Hazardous
    return 500, "Hazardous", "#7e0023", "Health warning of emergency conditions: everyone is more likely to be affected."


def get_aqi_category(aqi: int) -> Tuple[str, str, str]:
    """Get category info from AQI value."""
    if aqi <= 50:
        return "Good", "#00e400", PM25_BREAKPOINTS[0][6]
    elif aqi <= 100:
        return "Moderate", "#ffff00", PM25_BREAKPOINTS[1][6]
    elif aqi <= 150:
        return "Unhealthy for Sensitive Groups", "#ff7e00", PM25_BREAKPOINTS[2][6]
    elif aqi <= 200:
        return "Unhealthy", "#ff0000", PM25_BREAKPOINTS[3][6]
    elif aqi <= 300:
        return "Very Unhealthy", "#8f3f97", PM25_BREAKPOINTS[4][6]
    else:
        return "Hazardous", "#7e0023", PM25_BREAKPOINTS[5][6]


def apply_epa_correction(pm25_cf1: float, humidity: float) -> float:
    """Apply EPA correction factor for more accurate outdoor readings.
    
    EPA formula: PM2.5 corrected = 0.534 × PM2.5cf1 − 0.0844 × RH + 5.604
    """
    if humidity is None or humidity < 0:
        humidity = 50  # Default
    
    corrected = 0.534 * pm25_cf1 - 0.0844 * humidity + 5.604
    return max(0, corrected)
