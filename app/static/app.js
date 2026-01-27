// AQI Dashboard Frontend

class AQIDashboard {
    constructor() {
        this.chart = null;
        this.currentPeriod = '24h';
        this.init();
    }

    async init() {
        await this.loadCurrentData();
        await this.loadHistory(this.currentPeriod);
        await this.loadNearbySensors();
        
        this.setupEventListeners();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refresh();
        });

        // Chart period tabs
        document.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentPeriod = e.target.dataset.period;
                this.loadHistory(this.currentPeriod);
            });
        });
    }

    startAutoRefresh() {
        // Refresh current data every 2 minutes
        setInterval(() => this.loadCurrentData(), 120000);
        // Refresh chart every 5 minutes
        setInterval(() => this.loadHistory(this.currentPeriod), 300000);
    }

    async refresh() {
        const btn = document.getElementById('refreshBtn');
        btn.style.transform = 'rotate(360deg)';
        btn.style.transition = 'transform 0.5s';
        
        await Promise.all([
            this.loadCurrentData(),
            this.loadHistory(this.currentPeriod),
            this.loadNearbySensors()
        ]);
        
        setTimeout(() => {
            btn.style.transform = 'rotate(0deg)';
        }, 500);
    }

    async loadCurrentData() {
        try {
            const response = await fetch('/api/current');
            const data = await response.json();
            this.updateCurrentDisplay(data);
        } catch (error) {
            console.error('Error loading current data:', error);
        }
    }

    updateCurrentDisplay(data) {
        // Update sensor info
        document.getElementById('sensorName').textContent = data.name;
        document.getElementById('sensorModel').textContent = data.model || 'Unknown';
        document.getElementById('firmware').textContent = data.firmware || 'Unknown';
        document.getElementById('sensorId').textContent = data.sensor_id;
        document.getElementById('lastUpdate').textContent = data.last_seen_formatted;

        // Update AQI display
        const aqi = data.aqi;
        document.getElementById('aqiValue').textContent = aqi.value;
        document.getElementById('aqiCategory').textContent = aqi.category;
        document.getElementById('aqiCategory').style.backgroundColor = aqi.color;
        document.getElementById('aqiCategory').style.color = this.getTextColor(aqi.color);
        document.getElementById('aqiMessage').textContent = aqi.message;

        // Update readings
        const readings = data.readings;
        document.getElementById('pm25').textContent = readings.pm25_corrected;
        document.getElementById('pm10').textContent = readings.pm10;
        document.getElementById('temperature').textContent = readings.temperature_f;
        document.getElementById('humidity').textContent = readings.humidity;
        document.getElementById('pressure').textContent = readings.pressure;
        document.getElementById('confidence').textContent = data.confidence;
    }

    async loadHistory(period) {
        try {
            const response = await fetch(`/api/history/${period}`);
            const data = await response.json();
            this.updateChart(data);
            this.updateStats(data);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    updateChart(data) {
        const ctx = document.getElementById('trendChart').getContext('2d');
        
        // Prepare data for chart
        const chartData = data.data.map(d => ({
            x: new Date(d.timestamp * 1000),
            y: d.aqi,
            pm25: d.pm25,
            color: d.color
        }));

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(29, 161, 242, 0.5)');
        gradient.addColorStop(1, 'rgba(29, 161, 242, 0.0)');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'AQI',
                    data: chartData,
                    borderColor: '#1da1f2',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#1da1f2',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#232f3e',
                        titleColor: '#fff',
                        bodyColor: '#8899a6',
                        borderColor: '#1da1f2',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                return new Date(context[0].parsed.x).toLocaleString();
                            },
                            label: function(context) {
                                const point = context.raw;
                                return [
                                    `AQI: ${point.y}`,
                                    `PM2.5: ${point.pm25} µg/m³`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: this.currentPeriod === '24h' ? 'hour' : 'day',
                            displayFormats: {
                                hour: 'HH:mm',
                                day: 'MMM d'
                            }
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.05)'
                        },
                        ticks: {
                            color: '#8899a6'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255,255,255,0.05)'
                        },
                        ticks: {
                            color: '#8899a6'
                        }
                    }
                }
            }
        });
    }

    updateStats(data) {
        const aqiValues = data.data.map(d => d.aqi).filter(v => v > 0);
        
        if (aqiValues.length > 0) {
            const avg = Math.round(aqiValues.reduce((a, b) => a + b, 0) / aqiValues.length);
            const max = Math.max(...aqiValues);
            const min = Math.min(...aqiValues);
            
            document.getElementById('avgAqi').textContent = avg;
            document.getElementById('maxAqi').textContent = max;
            document.getElementById('minAqi').textContent = min;
        }
    }

    async loadNearbySensors() {
        try {
            const response = await fetch('/api/nearby');
            const data = await response.json();
            this.updateNearbySensors(data);
        } catch (error) {
            console.error('Error loading nearby sensors:', error);
            document.getElementById('nearbySensors').innerHTML = 
                '<div class="nearby-loading">Unable to load nearby sensors</div>';
        }
    }

    updateNearbySensors(data) {
        const container = document.getElementById('nearbySensors');
        
        if (!data.sensors || data.sensors.length === 0) {
            container.innerHTML = '<div class="nearby-loading">No nearby sensors found</div>';
            return;
        }

        container.innerHTML = data.sensors.slice(0, 6).map(sensor => `
            <div class="nearby-card">
                <div class="nearby-aqi" style="background-color: ${sensor.color}; color: ${this.getTextColor(sensor.color)}">
                    ${sensor.aqi}
                </div>
                <div class="nearby-info">
                    <h4>${this.truncate(sensor.name, 20)}</h4>
                    <p>${sensor.category}</p>
                </div>
            </div>
        `).join('');
    }

    getTextColor(bgColor) {
        // Return white or black text based on background brightness
        const darkBgs = ['#ff0000', '#8f3f97', '#7e0023'];
        return darkBgs.includes(bgColor.toLowerCase()) ? '#fff' : '#000';
    }

    truncate(str, len) {
        return str.length > len ? str.substring(0, len) + '...' : str;
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AQIDashboard();
});
