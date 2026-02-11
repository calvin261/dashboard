// Dashboard Data Management
class DashboardManager {
    constructor() {
        this.chart = null;
        this.dataHistory = {
            labels: [],
            ventas: [],
            produccion: [],
            logistica: []
        };
        this.maxDataPoints = 10;
        this.updateInterval = 60000; // 60 seconds (1 minute)
        this.init();
    }

    init() {
        this.initializeData();
        this.createChart();
        this.updateTables();
        this.startAutoUpdate();
        this.updateTimestamp();
    }

    // Initialize with historical data
    initializeData() {
        const now = new Date();
        for (let i = 9; i >= 0; i--) {
            const time = new Date(now - i * 60000);
            const timeLabel = time.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            this.dataHistory.labels.push(timeLabel);
            this.dataHistory.ventas.push(Math.floor(Math.random() * 50) + 50);
            this.dataHistory.produccion.push(Math.floor(Math.random() * 50) + 40);
            this.dataHistory.logistica.push(Math.floor(Math.random() * 50) + 45);
        }
    }

    // Create the main line chart
    createChart() {
        const ctx = document.getElementById('mainChart');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.dataHistory.labels,
                datasets: [
                    {
                        label: 'Ventas',
                        data: this.dataHistory.ventas,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Producción',
                        data: this.dataHistory.produccion,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Logística',
                        data: this.dataHistory.logistica,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#f8fafc',
                            font: {
                                size: 14,
                                weight: '600'
                            },
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f8fafc',
                        bodyColor: '#cbd5e1',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y + ' unidades';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(51, 65, 85, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#cbd5e1',
                            font: {
                                size: 12
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(51, 65, 85, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#cbd5e1',
                            font: {
                                size: 12
                            },
                            callback: function(value) {
                                return value + ' unidades';
                            }
                        }
                    }
                }
            }
        });
    }

    // Update chart with new data
    updateChart() {
        // Generate new data
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const newVentas = Math.floor(Math.random() * 50) + 50;
        const newProduccion = Math.floor(Math.random() * 50) + 40;
        const newLogistica = Math.floor(Math.random() * 50) + 45;

        // Add new data
        this.dataHistory.labels.push(timeLabel);
        this.dataHistory.ventas.push(newVentas);
        this.dataHistory.produccion.push(newProduccion);
        this.dataHistory.logistica.push(newLogistica);

        // Keep only last maxDataPoints
        if (this.dataHistory.labels.length > this.maxDataPoints) {
            this.dataHistory.labels.shift();
            this.dataHistory.ventas.shift();
            this.dataHistory.produccion.shift();
            this.dataHistory.logistica.shift();
        }

        // Update chart
        this.chart.data.labels = this.dataHistory.labels;
        this.chart.data.datasets[0].data = this.dataHistory.ventas;
        this.chart.data.datasets[1].data = this.dataHistory.produccion;
        this.chart.data.datasets[2].data = this.dataHistory.logistica;
        this.chart.update('active');

        // Update tables
        this.updateTables();
        
        // Update timestamp
        this.updateTimestamp();
    }

    // Update all three tables
    updateTables() {
        this.updateTable('table1Body', this.dataHistory.ventas, this.dataHistory.labels);
        this.updateTable('table2Body', this.dataHistory.produccion, this.dataHistory.labels);
        this.updateTable('table3Body', this.dataHistory.logistica, this.dataHistory.labels);
    }

    // Update individual table
    updateTable(tableId, data, labels) {
        const tbody = document.getElementById(tableId);
        tbody.innerHTML = '';

        // Show last 5 entries in reverse order (most recent first)
        const recentData = data.slice(-5).reverse();
        const recentLabels = labels.slice(-5).reverse();

        recentData.forEach((value, index) => {
            const row = document.createElement('tr');
            row.className = 'fade-in';
            
            // Calculate variation
            let variation = 0;
            let variationClass = 'variation-neutral';
            let variationSymbol = '—';
            
            if (index < recentData.length - 1) {
                variation = value - recentData[index + 1];
                if (variation > 0) {
                    variationClass = 'variation-positive';
                    variationSymbol = '↑ +' + variation;
                } else if (variation < 0) {
                    variationClass = 'variation-negative';
                    variationSymbol = '↓ ' + variation;
                } else {
                    variationSymbol = '— 0';
                }
            }

            row.innerHTML = `
                <td>${recentLabels[index]}</td>
                <td><strong>${value}</strong> unidades</td>
                <td class="${variationClass}">${variationSymbol}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    // Update timestamp
    updateTimestamp() {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('es-ES');
        document.getElementById('lastUpdate').textContent = `Última actualización: ${timestamp}`;
    }

    // Start automatic updates every minute
    startAutoUpdate() {
        setInterval(() => {
            this.updateChart();
            console.log('Dashboard actualizado automáticamente');
        }, this.updateInterval);
        
        console.log(`Auto-actualización configurada: cada ${this.updateInterval / 1000} segundos`);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Inicializando Dashboard Corporativo...');
    const dashboard = new DashboardManager();
    console.log('Dashboard inicializado correctamente');
    
    // Make dashboard available globally for testing
    window.dashboardManager = dashboard;
});
