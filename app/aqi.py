"""AQI calculation, health categories, and statistical utilities."""

from typing import Tuple, List, Optional
import statistics

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


def pm25_to_cigarettes(pm25: float) -> float:
    """Convert PM2.5 exposure to equivalent cigarettes per day.
    
    Based on Berkeley Earth research: 22 µg/m³ PM2.5 ≈ 1 cigarette/day
    https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/
    """
    return pm25 / 22.0


def aqi_to_cigarettes(aqi: int) -> float:
    """Approximate cigarettes/day from AQI.
    
    Uses rough conversion: AQI 50 ≈ 12 µg/m³ PM2.5
    """
    # Rough inverse of AQI calculation for PM2.5
    if aqi <= 50:
        pm25 = aqi * 12.0 / 50.0
    elif aqi <= 100:
        pm25 = 12.0 + (aqi - 50) * (35.4 - 12.0) / 50.0
    elif aqi <= 150:
        pm25 = 35.4 + (aqi - 100) * (55.4 - 35.4) / 50.0
    elif aqi <= 200:
        pm25 = 55.4 + (aqi - 150) * (150.4 - 55.4) / 50.0
    elif aqi <= 300:
        pm25 = 150.4 + (aqi - 200) * (250.4 - 150.4) / 100.0
    else:
        pm25 = 250.4 + (aqi - 300) * (500.4 - 250.4) / 200.0
    
    return pm25_to_cigarettes(pm25)


def detect_outliers_iqr(values: List[float], multiplier: float = 2.5) -> Tuple[float, float, List[bool]]:
    """Detect outliers using IQR method.
    
    Returns: (lower_bound, upper_bound, list of booleans marking outliers)
    """
    if len(values) < 4:
        return float('-inf'), float('inf'), [False] * len(values)
    
    sorted_vals = sorted([v for v in values if v is not None and v >= 0])
    if len(sorted_vals) < 4:
        return float('-inf'), float('inf'), [False] * len(values)
    
    q1_idx = len(sorted_vals) // 4
    q3_idx = (3 * len(sorted_vals)) // 4
    
    q1 = sorted_vals[q1_idx]
    q3 = sorted_vals[q3_idx]
    iqr = q3 - q1
    
    lower_bound = q1 - multiplier * iqr
    upper_bound = q3 + multiplier * iqr
    
    # Ensure lower bound is at least 0 for AQI
    lower_bound = max(0, lower_bound)
    
    outliers = []
    for v in values:
        if v is None or v < 0:
            outliers.append(True)
        elif v < lower_bound or v > upper_bound:
            outliers.append(True)
        else:
            outliers.append(False)
    
    return lower_bound, upper_bound, outliers


def calculate_iqr_bands(values: List[float]) -> dict:
    """Calculate IQR statistics for plotting bands.
    
    Returns dict with q1, median, q3, lower_whisker, upper_whisker
    """
    clean_values = [v for v in values if v is not None and v >= 0]
    
    if len(clean_values) < 4:
        return None
    
    sorted_vals = sorted(clean_values)
    n = len(sorted_vals)
    
    q1 = sorted_vals[n // 4]
    median = sorted_vals[n // 2]
    q3 = sorted_vals[(3 * n) // 4]
    iqr = q3 - q1
    
    # Whiskers at 1.5 * IQR
    lower_whisker = max(0, q1 - 1.5 * iqr)
    upper_whisker = q3 + 1.5 * iqr
    
    return {
        "q1": round(q1, 1),
        "median": round(median, 1),
        "q3": round(q3, 1),
        "iqr": round(iqr, 1),
        "lower_whisker": round(lower_whisker, 1),
        "upper_whisker": round(upper_whisker, 1),
        "mean": round(statistics.mean(clean_values), 1),
        "std": round(statistics.stdev(clean_values), 1) if len(clean_values) > 1 else 0
    }


def interpolate_outliers(data: List[dict], value_key: str = 'aqi') -> List[dict]:
    """Replace outlier values with interpolated estimates.
    
    Uses linear interpolation from neighboring valid values.
    """
    if not data:
        return data
    
    values = [d.get(value_key) for d in data]
    _, _, outlier_flags = detect_outliers_iqr(values)
    
    result = []
    for i, (d, is_outlier) in enumerate(zip(data, outlier_flags)):
        new_d = d.copy()
        
        if is_outlier:
            # Find previous valid value
            prev_val = None
            for j in range(i - 1, -1, -1):
                if not outlier_flags[j] and values[j] is not None:
                    prev_val = values[j]
                    break
            
            # Find next valid value
            next_val = None
            for j in range(i + 1, len(values)):
                if not outlier_flags[j] and values[j] is not None:
                    next_val = values[j]
                    break
            
            # Interpolate
            if prev_val is not None and next_val is not None:
                new_d[value_key] = round((prev_val + next_val) / 2, 1)
                new_d['interpolated'] = True
            elif prev_val is not None:
                new_d[value_key] = prev_val
                new_d['interpolated'] = True
            elif next_val is not None:
                new_d[value_key] = next_val
                new_d['interpolated'] = True
            else:
                new_d[value_key] = 0
                new_d['interpolated'] = True
            
            # Recalculate category for interpolated AQI
            if value_key == 'aqi':
                cat, color, _ = get_aqi_category(int(new_d[value_key]))
                new_d['category'] = cat
                new_d['color'] = color
        
        result.append(new_d)
    
    return result


def filter_valid_sensor_data(sensors: List[dict]) -> List[dict]:
    """Filter out sensors with invalid/outlier readings."""
    if not sensors:
        return []
    
    # Get all PM2.5 values
    pm25_values = [s.get('pm25', 0) for s in sensors if s.get('pm25') is not None]
    
    if not pm25_values:
        return []
    
    # Calculate bounds
    _, upper_bound, _ = detect_outliers_iqr(pm25_values, multiplier=2.0)
    
    valid_sensors = []
    for s in sensors:
        pm25 = s.get('pm25')
        aqi = s.get('aqi')
        
        # Skip if no data, zero, negative, or outlier
        if pm25 is None or pm25 <= 0:
            continue
        if aqi is None or aqi <= 0:
            continue
        if pm25 > upper_bound:
            continue
        if aqi > 400:  # Reasonable upper bound for comparison
            continue
        
        valid_sensors.append(s)
    
    return valid_sensors
