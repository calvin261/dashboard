declare const Chart: any;

interface ReferenceRow {
    estado: string;
    fecha: string;
    dia: number;
    mes: number;
    anio: number;
    hora: string;
    minuto: number;
    tipoDia: string;
    transaccion: string;
    canal: string;
    promedio: number;
}

interface RealtimeRow {
    fechaTrx: string;
    dia: number;
    mes: number;
    hora: string;
    minuto: number;
    trxMin: number;
    transaccion: string;
    canal: string;
}

type RawRow = Record<string, unknown>;

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

interface DashboardSocketMessage {
    type: 'dashboard-data';
    payload: DashboardResponse;
}

class DashboardApi {
    constructor(private readonly baseUrl = '/api/dashboard') {}

    async getDashboardData(): Promise<DashboardResponse> {
        const url = new URL(`${this.baseUrl}/data`, window.location.origin);
        url.searchParams.set('_t', Date.now().toString());

        const response = await fetch(url.toString(), {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-cache'
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
    private readonly refreshIntervalMs = 5000;
    private readonly wsReconnectMs = 3000;
    private isPolling = false;
    private socket: WebSocket | null = null;
    private isSocketConnected = false;
    private reconnectTimer: number | null = null;

    private readonly tolerancePalette = {
        ok: {
            stroke: '#84bd00',
            fill: 'rgba(132, 189, 0, 0.16)'
        },
        warning: {
            stroke: '#ff6347',
            fill: 'rgba(255, 99, 71, 0.18)'
        },
        critical: {
            stroke: '#dc2626',
            fill: 'rgba(220, 38, 38, 0.20)'
        }
    } as const;

    private getField<T = unknown>(row: RawRow, ...keys: string[]): T | undefined {
        for (const key of keys) {
            const value = row[key];
            if (value !== undefined && value !== null) {
                return value as T;
            }
        }

        return undefined;
    }

    private toNumber(value: unknown, fallback = 0): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        return fallback;
    }

    private toString(value: unknown, fallback = ''): string {
        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'number') {
            return String(value);
        }

        return fallback;
    }

    private normalizeHour(rawHour: unknown): string {
        const hour = this.toString(rawHour).trim();
        if (!hour) return '00:00';

        if (hour.includes(':')) {
            const [h = '0', m = '0'] = hour.split(':');
            const hh = this.toNumber(h, 0).toString().padStart(2, '0');
            const mm = this.toNumber(m, 0).toString().padStart(2, '0');
            return `${hh}:${mm}`;
        }

        const hh = this.toNumber(hour, 0).toString().padStart(2, '0');
        return `${hh}:00`;
    }

    private normalizeMinute(rawMinute: unknown, hourText?: string): number {
        if (rawMinute !== undefined && rawMinute !== null) {
            return this.toNumber(rawMinute, 0);
        }

        if (hourText && hourText.includes(':')) {
            const minutePart = hourText.split(':')[1] || '0';
            return this.toNumber(minutePart, 0);
        }

        return 0;
    }

    private buildTimeLabel(rawHour: unknown, rawMinute: unknown): string {
        const hourText = this.normalizeHour(rawHour);
        if (hourText.includes(':')) {
            const [h = '00', m = '00'] = hourText.split(':');
            const minute = rawMinute === undefined || rawMinute === null ? this.toNumber(m, 0) : this.toNumber(rawMinute, 0);
            return `${h.padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }

        return `${hourText}:00`;
    }

    private normalizeReferenceRows(rows: RawRow[]): ReferenceRow[] {
        return rows.map((row) => {
            const rawHour = this.getField(row, 'hora', 'HORA');
            const rawMinute = this.getField(row, 'minuto', 'MINUTO');
            const timeLabel = this.buildTimeLabel(rawHour, rawMinute);

            return {
                estado: this.toString(this.getField(row, 'estado', 'ESTADO'), 'DIA NORMAL'),
                fecha: this.toString(this.getField(row, 'fecha', 'FECHA')),
                dia: this.toNumber(this.getField(row, 'dia', 'DIA')),
                mes: this.toNumber(this.getField(row, 'mes', 'MES')),
                anio: this.toNumber(this.getField(row, 'anio', 'AÑO', 'ANIO', 'year')),
                hora: timeLabel,
                minuto: this.normalizeMinute(rawMinute, this.toString(rawHour)),
                tipoDia: this.toString(this.getField(row, 'tipoDia', 'tipo_dia', 'TIPO_DIA')),
                transaccion: this.toString(this.getField(row, 'transaccion', 'TRANSACCION')),
                canal: this.toString(this.getField(row, 'canal', 'tipoCanal', 'tipo_canal', 'TIPO_CANAL')),
                promedio: this.toNumber(this.getField(row, 'promedio', 'prom_trx_x_minuto', 'PROM_TRX_X_MINUTO'))
            };
        });
    }

    private normalizeRealtimeRows(rows: RawRow[]): RealtimeRow[] {
        return rows.map((row) => {
            const fechaTrx = this.toString(this.getField(row, 'fechaTrx', 'fecha_trx', 'FECHA_TRX', 'fecha', 'FECHA'));
            const rawHour = this.getField(row, 'hora', 'HORA');
            const rawMinute = this.getField(row, 'minuto', 'MINUTO');
            const timeLabel = this.buildTimeLabel(rawHour, rawMinute);

            return {
                fechaTrx,
                dia: this.toNumber(this.getField(row, 'dia', 'DIA')),
                mes: this.toNumber(this.getField(row, 'mes', 'MES')),
                hora: timeLabel,
                minuto: this.normalizeMinute(rawMinute, this.toString(rawHour)),
                trxMin: this.toNumber(this.getField(row, 'trxMin', 'trx_min', 'trx_por_minuto', 'TRX_POR_MINUTO')),
                transaccion: this.toString(this.getField(row, 'transaccion', 'TRANSACCION')),
                canal: this.toString(this.getField(row, 'canal', 'tipoCanal', 'tipo_canal', 'TIPO_CANAL'))
            };
        });
    }

    async init(): Promise<void> {
        this.setLoadingState(true);
        await this.loadDashboardData();
        this.setLoadingState(false);
        this.connectRealtimeStream();
        this.startAutoRefresh();
    }

    private applyDashboardPayload(payload: DashboardResponse): void {
        this.chartData = payload.chart || this.chartData;
        const rawReference = ((payload.tables?.reference || []) as unknown[]) as RawRow[];
        const rawRealtime = ((payload.tables?.realtime || []) as unknown[]) as RawRow[];
        this.referenceData = this.normalizeReferenceRows(rawReference);
        this.realTimeData = this.normalizeRealtimeRows(rawRealtime);

        this.renderChart();
        this.renderTables();
        this.updateTimestamp(payload.meta?.generatedAt);
        this.renderError(null);
    }

    private connectRealtimeStream(): void {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const socketUrl = `${protocol}://${window.location.host}/ws/dashboard`;
        this.socket = new WebSocket(socketUrl);

        this.socket.onopen = () => {
            this.isSocketConnected = true;
            this.setLoadingState(false);
        };

        this.socket.onmessage = (event: MessageEvent<string>) => {
            try {
                const message = JSON.parse(event.data) as DashboardSocketMessage;
                if (message.type === 'dashboard-data' && message.payload) {
                    this.applyDashboardPayload(message.payload);
                }
            } catch (error) {
                console.error('Mensaje WebSocket inválido:', error);
            }
        };

        this.socket.onerror = () => {
            this.isSocketConnected = false;
        };

        this.socket.onclose = () => {
            this.isSocketConnected = false;
            this.scheduleReconnect();
        };
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = window.setTimeout(() => {
            this.connectRealtimeStream();
        }, this.wsReconnectMs);
    }

    private async loadDashboardData(): Promise<void> {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            const payload = await this.api.getDashboardData();
            this.applyDashboardPayload(payload);
        } catch (error) {
            console.error('No se pudo cargar la data del dashboard:', error);
            this.renderError('No se pudo conectar con la API. Mostrando último estado disponible.');
            this.updateTimestamp();
        } finally {
            this.isPolling = false;
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

    private getToleranceLevel(historical: number, current: number): keyof DashboardManager['tolerancePalette'] {
        if (historical <= 0) {
            return current <= 0 ? 'ok' : 'critical';
        }

        const diffPercent = ((current - historical) / historical) * 100;

        if (diffPercent <= 10) return 'ok';
        if (diffPercent <= 25) return 'warning';
        return 'critical';
    }

    private renderChart(): void {
        const ctx = document.getElementById('mainChart') as HTMLCanvasElement | null;
        if (!ctx) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const toleranceLevels = this.chartData.realtimeSeries.map((current, index) => {
            const historical = this.chartData.historicalSeries[index] || 0;
            return this.getToleranceLevel(historical, current);
        });

        const pointColors = toleranceLevels.map((level) => this.tolerancePalette[level].stroke);
        const segmentLevels = this.chartData.realtimeSeries.slice(0, -1).map((_value, index) => {
            const historicalAvg = ((this.chartData.historicalSeries[index] || 0) + (this.chartData.historicalSeries[index + 1] || 0)) / 2;
            const realtimeAvg = ((this.chartData.realtimeSeries[index] || 0) + (this.chartData.realtimeSeries[index + 1] || 0)) / 2;
            return this.getToleranceLevel(historicalAvg, realtimeAvg);
        });

        const segmentAreaPlugin = {
            id: 'segmentAreaFill',
            beforeDatasetsDraw: (chart: any, _args: unknown, pluginOptions: { levels?: Array<keyof DashboardManager['tolerancePalette']> }) => {
                const levels = pluginOptions?.levels || [];
                const realtimeMeta = chart.getDatasetMeta(1);
                const historicalMeta = chart.getDatasetMeta(0);

                if (!realtimeMeta || !historicalMeta) return;

                const realtimePoints = realtimeMeta.data || [];
                const historicalPoints = historicalMeta.data || [];
                const segmentCount = Math.min(realtimePoints.length, historicalPoints.length) - 1;
                if (segmentCount <= 0) return;

                const ctx: CanvasRenderingContext2D = chart.ctx;

                ctx.save();
                for (let index = 0; index < segmentCount; index += 1) {
                    const rt0 = realtimePoints[index];
                    const rt1 = realtimePoints[index + 1];
                    const hs0 = historicalPoints[index];
                    const hs1 = historicalPoints[index + 1];

                    if (!rt0 || !rt1 || !hs0 || !hs1) continue;

                    const level = levels[index] || 'ok';
                    const fillColor = this.tolerancePalette[level].fill;

                    ctx.beginPath();
                    ctx.moveTo(rt0.x, rt0.y);
                    ctx.lineTo(rt1.x, rt1.y);
                    ctx.lineTo(hs1.x, hs1.y);
                    ctx.lineTo(hs0.x, hs0.y);
                    ctx.closePath();
                    ctx.fillStyle = fillColor;
                    ctx.fill();
                }
                ctx.restore();
            }
        };

        this.chart = new Chart(ctx, {
            type: 'line',
            plugins: [segmentAreaPlugin],
            data: {
                labels: this.chartData.labels,
                datasets: [
                    {
                        label: 'Promedio Histórico (Referencia)',
                        data: this.chartData.historicalSeries,
                        borderColor: '#9ca3af',
                        backgroundColor: 'rgba(148, 163, 184, 0.08)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.22,
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Transacciones Actuales (TRX/MIN)',
                        data: this.chartData.realtimeSeries,
                        borderColor: '#84bd00',
                        backgroundColor: 'rgba(132, 189, 0, 0.16)',
                        borderWidth: 3.2,
                        tension: 0.28,
                        fill: false,
                        segment: {
                            borderColor: (segmentCtx: { p0DataIndex: number }) => {
                                const level = segmentLevels[segmentCtx.p0DataIndex] || 'ok';
                                return this.tolerancePalette[level].stroke;
                            }
                        },
                        pointBackgroundColor: pointColors,
                        pointBorderColor: pointColors,
                        pointRadius: (ctx: { dataIndex: number }) => {
                            const lastIndex = this.chartData.realtimeSeries.length - 1;
                            const label = this.chartData.labels[ctx.dataIndex] || '';
                            const isHourlyMark = label.endsWith(':00:00');
                            if (ctx.dataIndex === lastIndex) return 5;
                            return isHourlyMark ? 3 : 0;
                        },
                        pointHoverRadius: 7,
                        pointHitRadius: 10
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 420,
                    easing: 'linear'
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    segmentAreaFill: {
                        levels: segmentLevels
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: '#374151',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(17, 24, 39, 0.92)',
                        borderColor: '#374151',
                        borderWidth: 1,
                        titleColor: '#f9fafb',
                        bodyColor: '#e5e7eb',
                        padding: 10,
                        displayColors: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(148, 163, 184, 0.22)'
                        },
                        ticks: {
                            color: '#475569'
                        },
                        title: {
                            display: true,
                            text: 'Transacciones',
                            color: '#334155',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(148, 163, 184, 0.12)'
                        },
                        ticks: {
                            color: '#475569',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12
                        },
                        title: {
                            display: true,
                            text: 'Tiempo real (HH:mm:ss)',
                            color: '#334155',
                            font: {
                                size: 12,
                                weight: '600'
                            }
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
                <td>${row.dia}</td>
                <td>${row.mes}</td>
                <td>${row.anio}</td>
                <td>${row.hora}</td>
                <td>${row.minuto}</td>
                <td>${row.tipoDia}</td>
                <td>${row.transaccion}</td>
                <td>${row.canal}</td>
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
                <td>${row.fechaTrx}</td>
                <td>${row.dia}</td>
                <td>${row.mes}</td>
                <td>${row.hora}</td>
                <td>${row.minuto}</td>
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
            if (this.isSocketConnected) return;
            this.loadDashboardData();
        }, this.refreshIntervalMs);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const manager = new DashboardManager();
    (window as Window & { dashboardManager?: DashboardManager }).dashboardManager = manager;
    await manager.init();
});
