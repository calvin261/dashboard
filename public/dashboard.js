"use strict";
class DashboardApi {
    constructor(baseUrl = '/api/dashboard') {
        this.baseUrl = baseUrl;
    }
    async getDashboardData() {
        const response = await fetch(`${this.baseUrl}/data`, {
            headers: {
                Accept: 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`API error ${response.status}`);
        }
        return response.json();
    }
}
class DashboardManager {
    constructor() {
        this.chart = null;
        this.api = new DashboardApi();
        this.referenceData = [];
        this.realTimeData = [];
        this.chartData = {
            labels: [],
            historicalSeries: [],
            realtimeSeries: []
        };
        this.refreshIntervalMs = 30000;
    }
    async init() {
        this.setLoadingState(true);
        await this.loadDashboardData();
        this.setLoadingState(false);
        this.startAutoRefresh();
    }
    async loadDashboardData() {
        try {
            const payload = await this.api.getDashboardData();
            this.chartData = payload.chart || this.chartData;
            this.referenceData = payload.tables?.reference || [];
            this.realTimeData = payload.tables?.realtime || [];
            this.renderChart();
            this.renderTables();
            this.updateTimestamp(payload.meta?.generatedAt);
            this.renderError(null);
        }
        catch (error) {
            console.error('No se pudo cargar la data del dashboard:', error);
            this.renderError('No se pudo conectar con la API. Mostrando último estado disponible.');
            this.updateTimestamp();
        }
    }
    setLoadingState(isLoading) {
        const badge = document.querySelector('.update-badge');
        if (!badge)
            return;
        badge.textContent = isLoading ? 'Cargando datos...' : 'Análisis de Tendencia';
    }
    renderError(message) {
        const headerInfo = document.querySelector('.header-info');
        if (!headerInfo)
            return;
        let errorEl = document.getElementById('apiError');
        if (!message) {
            errorEl?.remove();
            return;
        }
        if (!errorEl) {
            errorEl = document.createElement('span');
            errorEl.id = 'apiError';
            errorEl.style.color = '#ef4444';
            errorEl.style.fontWeight = '600';
            headerInfo.appendChild(errorEl);
        }
        errorEl.textContent = message;
    }
    renderChart() {
        const ctx = document.getElementById('mainChart');
        if (!ctx)
            return;
        if (this.chart) {
            this.chart.destroy();
        }
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.labels,
                datasets: [
                    {
                        label: 'Promedio Histórico (Referencia)',
                        data: this.chartData.historicalSeries,
                        borderColor: '#9ca3af',
                        backgroundColor: 'rgba(156, 163, 175, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.35,
                        fill: true,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Transacciones Actuales (TRX/MIN)',
                        data: this.chartData.realtimeSeries,
                        borderColor: '#84bd00',
                        backgroundColor: 'rgba(132, 189, 0, 0.1)',
                        borderWidth: 3,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Transacciones'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Hora del día'
                        }
                    }
                }
            }
        });
    }
    renderTables() {
        this.renderReferenceTable();
        this.renderRealtimeTable();
    }
    renderReferenceTable() {
        const tbody = document.getElementById('tableReferenceBody');
        if (!tbody)
            return;
        tbody.innerHTML = '';
        this.referenceData.forEach((row) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.estado}</td>
                <td>${row.fecha}</td>
                <td>${row.tipoDia}</td>
                <td>${row.dia}</td>
                <td>${row.mes}</td>
                <td>${row.anio}</td>
                <td>${row.transaccion}</td>
                <td>${row.canal}</td>
                <td>${row.hora}</td>
                <td><strong>${row.promedio}</strong></td>
            `;
            tbody.appendChild(tr);
        });
    }
    renderRealtimeTable() {
        const tbody = document.getElementById('tableRealTimeBody');
        if (!tbody)
            return;
        tbody.innerHTML = '';
        this.realTimeData.forEach((row) => {
            const tr = document.createElement('tr');
            const highlight = row.trxMin > 50 ? 'style="color:#ef4444;font-weight:700;"' : '';
            tr.innerHTML = `
                <td>${row.fecha}</td>
                <td>${row.dia}</td>
                <td>${row.mes}</td>
                <td>${row.hora}</td>
                <td ${highlight}>${row.trxMin}</td>
                <td>${row.transaccion}</td>
                <td>${row.canal}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    updateTimestamp(serverTime) {
        const date = serverTime ? new Date(serverTime) : new Date();
        const timestamp = date.toLocaleTimeString('es-ES');
        const el = document.getElementById('lastUpdate');
        if (el) {
            el.textContent = `Última actualización: ${timestamp}`;
        }
    }
    startAutoRefresh() {
        window.setInterval(() => {
            this.loadDashboardData();
        }, this.refreshIntervalMs);
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    const manager = new DashboardManager();
    window.dashboardManager = manager;
    await manager.init();
});
