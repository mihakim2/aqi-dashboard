# AQI Dashboard - West Roseville

A beautiful, real-time air quality monitoring dashboard for your PurpleAir sensor.

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green.svg)

## Features

- **Real-time AQI Display** - Large, color-coded AQI gauge with health recommendations
- **EPA Corrected Values** - Uses EPA correction formula for more accurate outdoor readings
- **Detailed Readings** - PM2.5, PM10, Temperature, Humidity, Pressure
- **Interactive Charts** - 24-hour, 7-day, and 30-day trend analysis
- **Nearby Sensors** - Compare with other sensors in your area
- **Auto-refresh** - Data updates automatically every 2 minutes
- **Responsive Design** - Works on desktop and mobile

## Quick Start

### Prerequisites
- Python 3.8+
- PurpleAir API Key
- Your PurpleAir Sensor ID

### Installation

1. **Clone and enter the directory**
   ```bash
   cd aqi-dashboard
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure your sensor** (already set up for West Roseville sensor)
   ```bash
   # Edit .env file with your credentials
   PURPLEAIR_API_KEY=your_api_key_here
   SENSOR_ID=your_sensor_id
   ```

5. **Run the server**
   ```bash
   python run.py
   ```

6. **Open your browser**
   Navigate to [http://localhost:8001](http://localhost:8001)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Dashboard UI |
| GET | `/api/current` | Current sensor readings + AQI |
| GET | `/api/history/{period}` | Historical data (24h, 7d, 30d) |
| GET | `/api/nearby` | Nearby sensors comparison |

## AQI Scale

| AQI | Category | Health Implications |
|-----|----------|---------------------|
| 0-50 | Good | Air quality is satisfactory |
| 51-100 | Moderate | Acceptable; sensitive individuals may experience effects |
| 101-150 | Unhealthy for Sensitive Groups | Sensitive groups may experience health effects |
| 151-200 | Unhealthy | Everyone may begin to experience health effects |
| 201-300 | Very Unhealthy | Health alert; increased risk for everyone |
| 301+ | Hazardous | Health warning of emergency conditions |

## EPA Correction

This dashboard applies the EPA correction formula for more accurate outdoor readings:

```
PM2.5 corrected = 0.534 × PM2.5cf1 − 0.0844 × RH + 5.604
```

## Project Structure

```
aqi-dashboard/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI application
│   ├── aqi.py           # AQI calculations
│   ├── purpleair.py     # PurpleAir API client
│   └── static/
│       ├── index.html   # Dashboard UI
│       ├── style.css    # Styles
│       └── app.js       # Frontend logic
├── .env                 # Configuration (API key, sensor ID)
├── requirements.txt
├── run.py
└── README.md
```

## Configuration

The sensor is pre-configured for:
- **Sensor Name**: Winding Creek
- **Location**: West Roseville, CA
- **Sensor ID**: 133437

To use a different sensor, update the `.env` file.

## License

MIT License

---

Built with ❤️ using PurpleAir data and FastAPI
