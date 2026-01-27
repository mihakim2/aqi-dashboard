// AQI Dashboard Frontend with IQR bands and outlier handling

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
        
        // Update cigarettes equivalent
        document.getElementById('cigarettes').textContent = aqi.cigarettes_per_day.toFixed(1);

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
            this.updateChart(data, period);
            this.updateStats(data);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    updateChart(data, period) {
        const ctx = document.getElementById('trendChart').getContext('2d');
        
        // Prepare main data for chart
        const chartData = data.data.map(d => ({
            x: new Date(d.timestamp * 1000),
            y: d.aqi,
            pm25: d.pm25,
            color: d.color,
            interpolated: d.interpolated
        }));

        // Prepare IQR band data for 7d and 30d
        const showIQR = (period === '7d' || period === '30d') && data.iqr_bands && data.iqr_bands.length > 0;
        
        let iqrUpperData = [];
        let iqrLowerData = [];
        
        if (showIQR) {
            iqrUpperData = data.iqr_bands.map(d => ({
                x: new Date(d.timestamp * 1000),
                y: d.q3
            }));
            iqrLowerData = data.iqr_bands.map(d => ({
                x: new Date(d.timestamp * 1000),
                y: d.q1
            }));
        }

        // Show/hide IQR legend
        const iqrLegend = document.querySelector('.iqr-legend');
        if (iqrLegend) {
            iqrLegend.style.display = showIQR ? 'flex' : 'none';
        }

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        // Create gradient for main line
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(29, 161, 242, 0.4)');
        gradient.addColorStop(1, 'rgba(29, 161, 242, 0.0)');

        // Build datasets
        const datasets = [];
        
        // IQR upper band (if applicable)
        if (showIQR && iqrUpperData.length > 0) {
            datasets.push({
                label: 'Q3 (75th percentile)',
                data: iqrUpperData,
                borderColor: 'rgba(29, 161, 242, 0.3)',
                backgroundColor: 'rgba(29, 161, 242, 0.1)',
                fill: '+1',
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 1,
                borderDash: [5, 5]
            });
            
            datasets.push({
                label: 'Q1 (25th percentile)',
                data: iqrLowerData,
                borderColor: 'rgba(29, 161, 242, 0.3)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 1,
                borderDash: [5, 5]
            });
        }
        
        // Main AQI line
        datasets.push({
            label: 'AQI',
            data: chartData,
            borderColor: '#1da1f2',
            backgroundColor: gradient,
            fill: true,
            tension: 0.4,
            pointRadius: (ctx) => {
                const point = chartData[ctx.dataIndex];
                return point && point.interpolated ? 4 : 0;
            },
            pointBackgroundColor: (ctx) => {
                const point = chartData[ctx.dataIndex];
                return point && point.interpolated ? '#ffa726' : '#1da1f2';
            },
            pointBorderColor: (ctx) => {
                const point = chartData[ctx.dataIndex];
                return point && point.interpolated ? '#ff9800' : '#1da1f2';
            },
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#1da1f2',
            borderWidth: 2,
            order: 0
        });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
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
                        filter: function(tooltipItem) {
                            return tooltipItem.dataset.label === 'AQI';
                        },
                        callbacks: {
                            title: function(context) {
                                return new Date(context[0].parsed.x).toLocaleString();
                            },
                            label: function(context) {
                                const point = context.raw;
                                const labels = [
                                    `AQI: ${point.y}${point.interpolated ? ' (interpolated)' : ''}`,
                                    `PM2.5: ${point.pm25} µg/m³`
                                ];
                                return labels;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: period === '24h' ? 'hour' : 'day',
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
                        suggestedMax: 200,
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
            
            // IQR range
            if (data.statistics) {
                const stats = data.statistics;
                document.getElementById('iqrRange').textContent = `${stats.q1}-${stats.q3}`;
            } else {
                document.getElementById('iqrRange').textContent = '--';
            }
            
            // Cigarettes average
            if (data.cigarettes_per_day_avg !== undefined) {
                document.getElementById('avgCigarettes').textContent = data.cigarettes_per_day_avg.toFixed(1);
            }
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
            container.innerHTML = '<div class="nearby-loading">No nearby sensors with valid data</div>';
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
