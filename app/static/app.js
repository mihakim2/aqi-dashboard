// How's the Air? Dashboard - Frontend with IQR bands, outlier handling, and dad jokes

class AQIDashboard {
    constructor() {
        this.chart = null;
        this.currentPeriod = '24h';
        this.currentMetric = 'aqi';
        this.historyData = null; // Cache history data
        this.init();
    }

    async init() {
        await this.loadCurrentData();
        await this.loadHistory(this.currentPeriod);
        await this.loadNearbySensors();
        await this.loadJoke();
        
        this.setupEventListeners();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refresh();
        });

        // Metric toggle buttons (AQI/Temp/Humidity)
        document.querySelectorAll('.metric-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentMetric = e.target.dataset.metric;
                // Re-render chart with cached data (no refetch needed)
                if (this.historyData) {
                    this.updateChart(this.historyData, this.currentPeriod);
                    this.updateStats(this.historyData);
                }
            });
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

        // New joke button
        document.getElementById('newJokeBtn').addEventListener('click', () => {
            this.loadJoke();
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
            this.loadNearbySensors(),
            this.loadJoke()
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
        document.getElementById('sensorId').textContent = data.sensor_id;
        document.getElementById('lastUpdate').textContent = this.formatTime(data.last_seen_formatted);

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
        // Convert pressure from hPa to bar (1 bar = 1000 hPa)
        const pressureBar = (readings.pressure / 1000).toFixed(3);
        document.getElementById('pressure').textContent = pressureBar;
        document.getElementById('confidence').textContent = data.confidence;
    }

    formatTime(timeStr) {
        // Make time more friendly
        const date = new Date(timeStr.replace(' ', 'T'));
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    async loadHistory(period) {
        try {
            const response = await fetch(`/api/history/${period}`);
            const data = await response.json();
            this.historyData = data; // Cache the data
            this.updateChart(data, period);
            this.updateStats(data);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    updateChart(data, period) {
        const ctx = document.getElementById('trendChart').getContext('2d');
        const metric = this.currentMetric;
        
        // Metric configuration
        const metricConfig = {
            aqi: {
                label: 'AQI',
                color: '#1da1f2',
                unit: '',
                getValue: d => d.aqi,
                suggestedMax: 150,
                beginAtZero: true
            },
            temperature: {
                label: 'Temperature',
                color: '#ff6b6b',
                unit: '°F',
                getValue: d => d.temperature,
                suggestedMax: null,
                beginAtZero: false
            },
            humidity: {
                label: 'Humidity',
                color: '#4ecdc4',
                unit: '%',
                getValue: d => d.humidity,
                suggestedMax: 100,
                beginAtZero: true
            }
        };
        
        const config = metricConfig[metric];
        
        // Update legend label
        document.getElementById('legendLabel').textContent = config.label;
        
        // Prepare main data for chart
        const chartData = data.data.map(d => ({
            x: new Date(d.timestamp * 1000),
            y: config.getValue(d),
            pm25: d.pm25,
            aqi: d.aqi,
            temperature: d.temperature,
            humidity: d.humidity,
            color: d.color,
            interpolated: d.interpolated
        })).filter(d => d.y !== null && d.y !== undefined);

        // Prepare IQR band data for 7d and 30d (for all metrics)
        let iqrBandsData = null;
        if (period === '7d' || period === '30d') {
            if (metric === 'aqi' && data.iqr_bands && data.iqr_bands.length > 0) {
                iqrBandsData = data.iqr_bands;
            } else if (metric === 'temperature' && data.temp_iqr_bands && data.temp_iqr_bands.length > 0) {
                iqrBandsData = data.temp_iqr_bands;
            } else if (metric === 'humidity' && data.humidity_iqr_bands && data.humidity_iqr_bands.length > 0) {
                iqrBandsData = data.humidity_iqr_bands;
            }
        }
        
        const showIQR = iqrBandsData !== null;
        
        let iqrUpperData = [];
        let iqrLowerData = [];
        
        if (showIQR) {
            iqrUpperData = iqrBandsData.map(d => ({
                x: new Date(d.timestamp * 1000),
                y: d.q3
            }));
            iqrLowerData = iqrBandsData.map(d => ({
                x: new Date(d.timestamp * 1000),
                y: d.q1
            }));
        }

        // Show/hide IQR legend (only for AQI)
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
        gradient.addColorStop(0, this.hexToRgba(config.color, 0.4));
        gradient.addColorStop(1, this.hexToRgba(config.color, 0.0));

        // Build datasets
        const datasets = [];
        
        // IQR bands (if applicable, only for AQI)
        if (showIQR && iqrUpperData.length > 0) {
            datasets.push({
                label: 'Q3',
                data: iqrUpperData,
                borderColor: this.hexToRgba(config.color, 0.3),
                backgroundColor: this.hexToRgba(config.color, 0.1),
                fill: '+1',
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 1,
                borderDash: [5, 5]
            });
            
            datasets.push({
                label: 'Q1',
                data: iqrLowerData,
                borderColor: this.hexToRgba(config.color, 0.3),
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 1,
                borderDash: [5, 5]
            });
        }
        
        // Main data line
        datasets.push({
            label: config.label,
            data: chartData,
            borderColor: config.color,
            backgroundColor: gradient,
            fill: true,
            tension: 0.4,
            pointRadius: (ctx) => {
                const point = chartData[ctx.dataIndex];
                return point && point.interpolated ? 4 : 0;
            },
            pointBackgroundColor: (ctx) => {
                const point = chartData[ctx.dataIndex];
                return point && point.interpolated ? '#ffa726' : config.color;
            },
            pointBorderColor: (ctx) => {
                const point = chartData[ctx.dataIndex];
                return point && point.interpolated ? '#ff9800' : config.color;
            },
            pointHoverRadius: 6,
            pointHoverBackgroundColor: config.color,
            borderWidth: 2,
            order: 0
        });

        const self = this;
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
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#1a365d',
                        bodyColor: '#4a6fa5',
                        borderColor: config.color,
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        filter: function(tooltipItem) {
                            return tooltipItem.dataset.label === config.label;
                        },
                        callbacks: {
                            title: function(context) {
                                return new Date(context[0].parsed.x).toLocaleString();
                            },
                            label: function(context) {
                                const point = context.raw;
                                const labels = [];
                                
                                if (metric === 'aqi') {
                                    labels.push(`AQI: ${point.y}${point.interpolated ? ' (estimated)' : ''}`);
                                    labels.push(`PM2.5: ${point.pm25} µg/m³`);
                                } else if (metric === 'temperature') {
                                    labels.push(`Temp: ${point.y}°F`);
                                    labels.push(`AQI: ${point.aqi}`);
                                } else if (metric === 'humidity') {
                                    labels.push(`Humidity: ${point.y}%`);
                                    labels.push(`AQI: ${point.aqi}`);
                                }
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
                            color: 'rgba(59, 130, 246, 0.08)'
                        },
                        ticks: {
                            color: '#4a6fa5',
                            maxTicksLimit: period === '24h' ? 12 : 7
                        }
                    },
                    y: {
                        beginAtZero: config.beginAtZero,
                        suggestedMax: config.suggestedMax,
                        grid: {
                            color: 'rgba(59, 130, 246, 0.08)'
                        },
                        ticks: {
                            color: '#4a6fa5',
                            callback: function(value) {
                                return value + config.unit;
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Helper to convert hex to rgba
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    updateStats(data) {
        const metric = this.currentMetric;
        
        // Metric configuration
        const metricConfig = {
            aqi: {
                getValue: d => d.aqi,
                unit: '',
                highLabel: 'Worst',
                lowLabel: 'Best',
                decimals: 0,
                showCigs: true
            },
            temperature: {
                getValue: d => d.temperature,
                unit: '°F',
                highLabel: 'High',
                lowLabel: 'Low',
                decimals: 0,
                showCigs: false
            },
            humidity: {
                getValue: d => d.humidity,
                unit: '%',
                highLabel: 'High',
                lowLabel: 'Low',
                decimals: 0,
                showCigs: false
            }
        };
        
        const config = metricConfig[metric];
        
        // Get values for the selected metric
        const values = data.data.map(d => config.getValue(d)).filter(v => v !== null && v !== undefined && v > 0);
        
        if (values.length > 0) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const max = Math.max(...values);
            const min = Math.min(...values);
            
            // Update stat labels
            document.getElementById('statHighLabel').textContent = config.highLabel;
            document.getElementById('statLowLabel').textContent = config.lowLabel;
            
            // Update values
            document.getElementById('statAvg').textContent = avg.toFixed(config.decimals);
            document.getElementById('statHigh').textContent = max.toFixed(config.decimals);
            document.getElementById('statLow').textContent = min.toFixed(config.decimals);
            
            // Update units
            document.getElementById('statAvgUnit').textContent = config.unit;
            document.getElementById('statHighUnit').textContent = config.unit;
            document.getElementById('statLowUnit').textContent = config.unit;
            
            // IQR range - use backend data when available
            let iqrData = null;
            if (metric === 'aqi' && data.statistics) {
                iqrData = data.statistics;
            } else if (metric === 'temperature' && data.temp_iqr_bands && data.temp_iqr_bands.length > 0) {
                // Calculate overall IQR from temp bands
                const allQ1 = data.temp_iqr_bands.map(b => b.q1);
                const allQ3 = data.temp_iqr_bands.map(b => b.q3);
                iqrData = {
                    q1: Math.round(allQ1.reduce((a,b) => a+b, 0) / allQ1.length),
                    q3: Math.round(allQ3.reduce((a,b) => a+b, 0) / allQ3.length)
                };
            } else if (metric === 'humidity' && data.humidity_iqr_bands && data.humidity_iqr_bands.length > 0) {
                const allQ1 = data.humidity_iqr_bands.map(b => b.q1);
                const allQ3 = data.humidity_iqr_bands.map(b => b.q3);
                iqrData = {
                    q1: Math.round(allQ1.reduce((a,b) => a+b, 0) / allQ1.length),
                    q3: Math.round(allQ3.reduce((a,b) => a+b, 0) / allQ3.length)
                };
            }
            
            if (iqrData) {
                document.getElementById('iqrRange').textContent = `${iqrData.q1}-${iqrData.q3}`;
                document.getElementById('iqrUnit').textContent = config.unit;
            } else {
                // Fallback: calculate from current values
                const sorted = [...values].sort((a, b) => a - b);
                const n = sorted.length;
                if (n >= 4) {
                    const q1 = sorted[Math.floor(n * 0.25)];
                    const q3 = sorted[Math.floor(n * 0.75)];
                    document.getElementById('iqrRange').textContent = `${q1.toFixed(config.decimals)}-${q3.toFixed(config.decimals)}`;
                    document.getElementById('iqrUnit').textContent = config.unit;
                } else {
                    document.getElementById('iqrRange').textContent = '--';
                    document.getElementById('iqrUnit').textContent = '';
                }
            }
            
            // Show/hide cigarettes stat
            const cigsStat = document.getElementById('cigsStat');
            if (cigsStat) {
                cigsStat.style.display = config.showCigs ? 'block' : 'none';
            }
            
            // Cigarettes average (only for AQI)
            if (config.showCigs && data.cigarettes_per_day_avg !== undefined) {
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
                '<div class="nearby-loading">Couldn\'t find nearby sensors</div>';
        }
    }

    updateNearbySensors(data) {
        const container = document.getElementById('nearbySensors');
        
        if (!data.sensors || data.sensors.length === 0) {
            container.innerHTML = '<div class="nearby-loading">No valid nearby sensors right now</div>';
            return;
        }

        container.innerHTML = data.sensors.slice(0, 6).map(sensor => `
            <div class="nearby-card">
                <div class="nearby-aqi" style="background-color: ${sensor.color}; color: ${this.getTextColor(sensor.color)}">
                    ${sensor.aqi}
                </div>
                <div class="nearby-info">
                    <h4>${this.truncate(sensor.name, 18)}</h4>
                    <p>${sensor.category}</p>
                </div>
            </div>
        `).join('');
    }

    async loadJoke() {
        const jokeEl = document.getElementById('dadJoke');
        jokeEl.classList.remove('fade-in');
        
        try {
            const response = await fetch('/api/joke');
            const data = await response.json();
            
            // Small delay for animation effect
            setTimeout(() => {
                jokeEl.textContent = `"${data.joke}"`;
                jokeEl.classList.add('fade-in');
            }, 100);
        } catch (error) {
            jokeEl.textContent = '"Why did the air quality sensor go to therapy? It had too many issues with its readings!"';
        }
    }

    getTextColor(bgColor) {
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
