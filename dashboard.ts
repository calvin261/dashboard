declare const Chart: any;

interface ReferenceRow {
    estado: string;
    fecha: string;
    tipoDia: string;
    dia: number;
    mes: number;
    anio: number;
    transaccion: string;
    canal: string;
    hora: string;
    promedio: number;
}

interface RealtimeRow {
    fecha: string;
    dia: number;
    mes: number;
    hora: string;
    trxMin: number;
    transaccion: string;
    canal: string;
}

interface DashboardResponse {
    chart: {
        labels: string[];
        historicalSeries: number[];
        realtimeSeries: number[];
    };
    tables?: {
        reference: ReferenceRow[];
        realtime: RealtimeRow[];
    };
    meta?: {
        generatedAt?: string;
    };
}

class DashboardApi {
    constructor(private readonly baseUrl = '/api/dashboard') {}

    async getDashboardData(): Promise<DashboardResponse> {
        const response = await fetch(`${this.baseUrl}/data`, {
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API error ${response.status}`);
        }

        return response.json() as Promise<DashboardResponse>;
    }
}

class DashboardManager {
    private chart: any = null;
    private readonly api = new DashboardApi();
    private referenceData: ReferenceRow[] = [];
    private realTimeData: RealtimeRow[] = [];
    private chartData = {
        labels: [] as string[],
        historicalSeries: [] as number[],
        realtimeSeries: [] as number[]
    };
    private readonly refreshIntervalMs = 30000;

    async init(): Promise<void> {
        this.setLoadingState(true);
        await this.loadDashboardData();
        this.setLoadingState(false);
        this.startAutoRefresh();
    }

    private async loadDashboardData(): Promise<void> {
        try {
            const payload = await this.api.getDashboardData();
            this.chartData = payload.chart || this.chartData;
            this.referenceData = payload.tables?.reference || [];
            this.realTimeData = payload.tables?.realtime || [];

            this.renderChart();
            this.renderTables();
            this.updateTimestamp(payload.meta?.generatedAt);
            this.renderError(null);
        } catch (error) {
            console.error('No se pudo cargar la data del dashboard:', error);
            this.renderError('No se pudo conectar con la API. Mostrando último estado disponible.');
            this.updateTimestamp();
        }
    }

    private setLoadingState(isLoading: boolean): void {
        const badge = document.querySelector('.update-badge') as HTMLElement | null;
        if (!badge) return;
        badge.textContent = isLoading ? 'Cargando datos...' : 'Análisis de Tendencia';
    }

    private renderError(message: string | null): void {
        const headerInfo = document.querySelector('.header-info') as HTMLElement | null;
        if (!headerInfo) return;

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

    private renderChart(): void {
        const ctx = document.getElementById('mainChart') as HTMLCanvasElement | null;
        if (!ctx) return;

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

    private renderTables(): void {
        this.renderReferenceTable();
        this.renderRealtimeTable();
    }

    private renderReferenceTable(): void {
        const tbody = document.getElementById('tableReferenceBody') as HTMLTableSectionElement | null;
        if (!tbody) return;
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

    private renderRealtimeTable(): void {
        const tbody = document.getElementById('tableRealTimeBody') as HTMLTableSectionElement | null;
        if (!tbody) return;
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

    private updateTimestamp(serverTime?: string): void {
        const date = serverTime ? new Date(serverTime) : new Date();
        const timestamp = date.toLocaleTimeString('es-ES');
        const el = document.getElementById('lastUpdate');
        if (el) {
            el.textContent = `Última actualización: ${timestamp}`;
        }
    }

    private startAutoRefresh(): void {
        window.setInterval(() => {
            this.loadDashboardData();
        }, this.refreshIntervalMs);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const manager = new DashboardManager();
    (window as Window & { dashboardManager?: DashboardManager }).dashboardManager = manager;
    await manager.init();
});
