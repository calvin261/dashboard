declare const Chart: any;

// ================================================================
// TYPES
// ================================================================

type ComboKey =
    | 'atm_avance'
    | 'atm_deposito'
    | 'atm_pago_tc'
    | 'atm_retiro'
    | 'atm_transferencias'
    | 'servipagos_avance'
    | 'servipagos_retiro'
    | 'clientes_red_retiro';

type ToleranceLevel = 'ok' | 'warning' | 'critical';

interface ChartSeries {
    labels: string[];
    totalSeries: number[];
    meanSeries: number[];
    ratio5Series: number[];
    stdSeries?: number[];
    upperBandSeries?: number[];
    lowerBandSeries?: number[];
    ema9Series?: number[];
}

interface RealtimeRow {
    fechaTrx: string;
    tipoCanal: string;
    transaccion: string;
    total: number;
    rollingSd5: number;
    ratio5: number;
    estado: ToleranceLevel;
}

interface HistoricalRow {
    fecha: string;
    estado: string;
    tipoDia: string;
    tipoCanal: string;
    transaccion: string;
    total: number;
    lag1: number | null;
    lag5: number | null;
    lag15: number | null;
    rollingMean5: number | null;
    rollingMean15: number | null;
    rollingSd5: number | null;
    ratio5: number | null;
    target: number;
}

interface DashboardResponse {
    charts: Record<ComboKey, ChartSeries>;
    hourlyCharts?: Record<ComboKey, ChartSeries>;
    tables?: {
        realtime: Record<ComboKey, RealtimeRow[]>;
        historical: Record<ComboKey, HistoricalRow[]>;
    };
    meta?: { generatedAt?: string };
}

interface DashboardSocketMessage {
    type: 'dashboard-data';
    payload: DashboardResponse;
}

// ================================================================
// COMBO META
// ================================================================

const COMBO_META: { key: ComboKey; label: string }[] = [
    { key: 'atm_avance',         label: 'ATM - Avance'         },
    { key: 'atm_deposito',        label: 'ATM - Deposito'       },
    { key: 'atm_pago_tc',         label: 'ATM - Pago TC'        },
    { key: 'atm_retiro',          label: 'ATM - Retiro'         },
    { key: 'atm_transferencias',  label: 'ATM - Transferencias' },
    { key: 'servipagos_avance',          label: 'ATM SERVIPAGOS - Avance'         },
    { key: 'servipagos_retiro',          label: 'ATM SERVIPAGOS - Retiro'         },
    { key: 'clientes_red_retiro',        label: 'CLIENTES ATM RED - Retiro' },
];

// ================================================================
// TOLERANCE HELPERS
// ================================================================

const PALETTE = {
    ok:       { stroke: '#5a9e00', fill: 'rgba(90,158,0,0.40)',   areafill: 'rgba(90,158,0,0.18)',  chartbg: 'rgba(90,158,0,0.10)',  row: '' },
    warning:  { stroke: '#c41a00', fill: 'rgba(196,26,0,0.52)',   areafill: 'rgba(196,26,0,0.26)',  chartbg: 'rgba(196,26,0,0.13)',  row: 'row-warning' },
    critical: { stroke: '#6b0000', fill: 'rgba(107,0,0,0.58)',    areafill: 'rgba(107,0,0,0.30)',   chartbg: 'rgba(107,0,0,0.16)',   row: 'row-critical' },
};

function toleranceFromRatio5(ratio5: number): ToleranceLevel {
    if (ratio5 <= 1.25) return 'ok';
    if (ratio5 <= 1.5)  return 'warning';
    return 'critical';
}

function fmt(n: number | null | undefined, digits = 4): string {
    if (n === null || n === undefined) return 'NULL';
    return Number(n).toFixed(digits);
}

// ================================================================
// API
// ================================================================

class DashboardApi {
    constructor(private readonly baseUrl = '/api/dashboard') {}

    async getData(): Promise<DashboardResponse> {
        const url = new URL(`${this.baseUrl}/data`, window.location.origin);
        url.searchParams.set('_t', Date.now().toString());
        const res = await fetch(url.toString(), {
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        return res.json() as Promise<DashboardResponse>;
    }
}

// ================================================================
// DASHBOARD MANAGER
// ================================================================

class DashboardManager {
    private readonly api = new DashboardApi();
    private charts: Partial<Record<ComboKey, any>> = {};
    private hourlyCharts: Partial<Record<ComboKey, any>> = {};
    private socket: WebSocket | null = null;
    private isSocketConnected = false;
    private reconnectTimer: number | null = null;
    private readonly wsReconnectMs = 3000;
    private readonly refreshIntervalMs = 10000;

    // -- Chart rendering ------------------------------------------

    private buildSegmentColorFn(ratio5Series: number[]) {
        return (ctx: any): string => {
            const i = ctx.p0DataIndex ?? 0;
            const ratio = ratio5Series[i] ?? 1;
            return PALETTE[toleranceFromRatio5(ratio)].stroke;
        };
    }

    private renderChart(canvasId: string, comboKey: ComboKey, series: ChartSeries): void {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
        if (!canvas) return;
        const { labels, totalSeries, meanSeries, ratio5Series } = series;
        const stdSeries = series.stdSeries ?? meanSeries.map(() => 0);
        const ema9Series = series.ema9Series ?? totalSeries;

        const lastRatio = ratio5Series[ratio5Series.length - 1] ?? 1;
        const level = toleranceFromRatio5(lastRatio);

        const isUpAt = (idx: number): boolean => (totalSeries[idx] ?? 0) >= (meanSeries[idx] ?? 0);
        
        const getDeltaColor = (delta: number) => {
            if (delta >= 0) return '#64a800'; // Verde
            if (delta >= -10) return '#f97316'; // Tomate intenso (Naranja)
            return '#d41414'; // Rojo
        };

        const lineColor = {
            neutral: '#94a3b8'
        };

        const segColorFn = (ctx: any): string => {
            const i = ctx.p0DataIndex ?? 0;
            const delta = (totalSeries[i] ?? 0) - (meanSeries[i] ?? 0);
            return getDeltaColor(delta);
        };

        const realtimeBgPlugin = {
            id: `realtimeBg_${comboKey}`,
            beforeDatasetsDraw(chart: any) {
                const ctx2 = chart.ctx as CanvasRenderingContext2D;
                const ca = chart.chartArea;
                const meanMeta = chart.getDatasetMeta(0);
                const totalMeta = chart.getDatasetMeta(2);
                if (!meanMeta?.data?.length || !totalMeta?.data?.length) return;

                ctx2.save();
                ctx2.beginPath();
                ctx2.rect(ca.left, ca.top, ca.width, ca.height);
                ctx2.clip();

                for (let seg = 0; seg < totalMeta.data.length - 1; seg++) {
                    const delta = totalSeries[seg] - meanSeries[seg];
                    let band, between;
                    
                    if (delta >= 0) {
                        band = 'rgba(100,168,0,0.12)';
                        between = 'rgba(100,168,0,0.28)';
                    } else if (delta >= -10) {
                        band = 'rgba(249,115,22,0.25)'; // Tomate más intenso
                        between = 'rgba(249,115,22,0.45)'; // Tomate más intenso
                    } else {
                        band = 'rgba(212,20,20,0.11)';
                        between = 'rgba(212,20,20,0.30)';
                    }

                    const x0 = totalMeta.data[seg].x;
                    const x1 = totalMeta.data[seg + 1].x;

                    // Fondo del tramo completo (solo dentro de ejes)
                    ctx2.fillStyle = band;
                    ctx2.fillRect(x0, ca.top, Math.max(1, x1 - x0), ca.bottom - ca.top);

                    // Relleno entre histórico y actual
                    ctx2.beginPath();
                    ctx2.moveTo(meanMeta.data[seg].x, meanMeta.data[seg].y);
                    ctx2.lineTo(meanMeta.data[seg + 1].x, meanMeta.data[seg + 1].y);
                    ctx2.lineTo(totalMeta.data[seg + 1].x, totalMeta.data[seg + 1].y);
                    ctx2.lineTo(totalMeta.data[seg].x, totalMeta.data[seg].y);
                    ctx2.closePath();
                    ctx2.fillStyle = between;
                    ctx2.fill();
                }

                ctx2.restore();
            }
        };

        const data = {
            labels,
            datasets: [
                {
                    label: 'Promedio Historico (Referencia)',
                    data: meanSeries,
                    borderColor: lineColor.neutral,
                    borderDash: [5, 3],
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25,
                    fill: false,
                    order: 1
                },
                {
                    label: 'EMA 9',
                    data: ema9Series,
                    borderColor: '#f59e0b',
                    borderWidth: 1.6,
                    pointRadius: 0,
                    tension: 0.25,
                    fill: false,
                    order: 2
                },
                {
                    label: 'Transacciones Actuales (TRX/MIN)',
                    data: totalSeries,
                    borderColor: getDeltaColor((totalSeries[totalSeries.length - 1] ?? 0) - (meanSeries[meanSeries.length - 1] ?? 0)),
                    borderWidth: 3,
                    pointRadius: (ctx: any) => (ctx.dataIndex === totalSeries.length - 1 ? 5 : 0),
                    pointBackgroundColor: (ctx: any) => {
                        const i = ctx.dataIndex ?? 0;
                        return getDeltaColor((totalSeries[i] ?? 0) - (meanSeries[i] ?? 0));
                    },
                    tension: 0.2,
                    fill: false,
                    segment: { borderColor: segColorFn },
                    order: 3
                }
            ]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 220, easing: 'linear' },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top' as const,
                    labels: {
                        boxWidth: 11,
                        usePointStyle: true,
                        pointStyle: 'line',
                        padding: 12,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context: any) => {
                            // Ocultar las etiquetas por defecto de los datasets para personalizar el afterBody
                            return null;
                        },
                        afterBody: (items: any[]) => {
                            const i = items[0]?.dataIndex ?? 0;
                            const total = totalSeries[i] ?? 0;
                            const hist = meanSeries[i] ?? 0;
                            const delta = total - hist;
                            const isUp = delta >= 0;
                            const r = ratio5Series[i] ?? 1;
                            const tol = toleranceFromRatio5(r);
                            const std = stdSeries[i] ?? 0;
                            const ema = ema9Series[i] ?? 0;
                            
                            return [
                                `📊 TRX Actuales: ${total}`,
                                `📈 Promedio Histórico: ${hist}`,
                                `----------------------------------------`,
                                `${isUp ? '🟢' : '🔴'} Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (${isUp ? 'SUBE' : 'BAJA'})`,
                                `📉 EMA 9: ${ema.toFixed(2)}`,
                                `⚖️ Ratio 5: ${r.toFixed(4)} [${tol.toUpperCase()}]`,
                                `⚡ STD 5: ${std.toFixed(4)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 10, font: { size: 10 }, color: '#64748b' },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                y: {
                    ticks: { font: { size: 10 }, color: '#64748b' },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                }
            }
        };

        // Preserva estado de leyenda entre updates (ocultar/mostrar datasets)
        const chart = this.charts[comboKey];
        if (chart) {
            const hiddenByLabel = new Map<string, boolean>();
            for (const ds of chart.data.datasets ?? []) {
                hiddenByLabel.set(ds.label, !!ds.hidden);
            }

            // Evita estado roto de tooltip/hover al refrescar mientras hay mouseover
            try {
                // Guardar el estado del tooltip activo
                const activeElements = chart.getActiveElements();
                const tooltipActive = chart.tooltip?._active;

                chart.data.labels = data.labels as any;
                chart.data.datasets = data.datasets as any;
                for (const ds of chart.data.datasets ?? []) {
                    if (hiddenByLabel.has(ds.label)) {
                        ds.hidden = hiddenByLabel.get(ds.label) ?? false;
                    }
                }
                chart.options = options as any;
                chart.update('none');

                // Restaurar el estado del tooltip si estaba activo
                if (activeElements && activeElements.length > 0) {
                    chart.setActiveElements(activeElements);
                    if (tooltipActive && tooltipActive.length > 0) {
                        chart.tooltip.setActiveElements(tooltipActive, { x: 0, y: 0 });
                    }
                    chart.update('none');
                }
            } catch (_) {}
        } else {
            this.charts[comboKey] = new Chart(canvas, {
                type: 'line',
                plugins: [realtimeBgPlugin],
                data,
                options
            });
        }

        // Update badge
        const badge = document.getElementById(`badge_${comboKey}`);
        if (badge) {
            badge.textContent = level.toUpperCase();
            badge.className = `status-badge badge-${level}`;
        }

        // Simple STD5 trend badge for quick glance (UP / BAJO)
        const cardHeader = canvas.closest('.card')?.querySelector('.card-header') as HTMLElement | null;
        if (cardHeader) {
            const stdNow = stdSeries[stdSeries.length - 1] ?? 0;
            const prevStdWindow = stdSeries.slice(Math.max(0, stdSeries.length - 11), stdSeries.length - 1);
            const prevStdAvg = prevStdWindow.length > 0
                ? prevStdWindow.reduce((a, b) => a + b, 0) / prevStdWindow.length
                : stdNow;
            const stdUp = stdNow >= prevStdAvg;

            const stdBadgeId = `std5_badge_${comboKey}`;
            let stdBadge = document.getElementById(stdBadgeId) as HTMLElement | null;
            if (!stdBadge) {
                stdBadge = document.createElement('span');
                stdBadge.id = stdBadgeId;
                stdBadge.className = 'status-badge std-badge std-low';
                cardHeader.appendChild(stdBadge);
            }

            stdBadge.innerHTML = `STD5 ${stdUp ? '&#9650; SUBE' : '&#9660; BAJA'} ${stdNow.toFixed(2)}`;
            stdBadge.className = `status-badge std-badge ${stdUp ? 'std-up' : 'std-low'}`;
        }
    }

    // -- Hourly chart rendering ------------------------------------------

    private renderHourlyChart(canvasId: string, comboKey: ComboKey, series: ChartSeries): void {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
        if (!canvas) return;

        const { labels, totalSeries, meanSeries, ratio5Series } = series;

        const getDeltaColor = (delta: number) => {
            if (delta >= 0) return '#64a800'; // Verde
            if (delta >= -10) return '#f97316'; // Tomate intenso (Naranja)
            return '#d41414'; // Rojo
        };

        const getDeltaColors = (delta: number) => {
            if (delta >= 0) return { stroke: '#64a800', band: 'rgba(100,168,0,0.14)', between: 'rgba(100,168,0,0.32)' };
            if (delta >= -10) return { stroke: '#f97316', band: 'rgba(249,115,22,0.25)', between: 'rgba(249,115,22,0.45)' }; // Tomate más intenso
            return { stroke: '#d41414', band: 'rgba(212,20,20,0.13)', between: 'rgba(212,20,20,0.34)' };
        };

        const segColorFn = (ctx: any): string => {
            const i = ctx.p0DataIndex ?? 0;
            const delta = (totalSeries[i] ?? 0) - (meanSeries[i] ?? 0);
            return getDeltaColor(delta);
        };

        const hourlyBgPlugin = {
            id: `hourlyBg_${comboKey}`,
            beforeDatasetsDraw(chart: any) {
                const ctx2 = chart.ctx as CanvasRenderingContext2D;
                const ca = chart.chartArea;
                const totalMeta = chart.getDatasetMeta(1);
                const meanMeta = chart.getDatasetMeta(0);
                if (!totalMeta?.data?.length || !meanMeta?.data?.length) return;

                ctx2.save();
                ctx2.beginPath();
                ctx2.rect(ca.left, ca.top, ca.width, ca.height);
                ctx2.clip();

                for (let seg = 0; seg < totalMeta.data.length - 1; seg++) {
                    const delta = totalSeries[seg] - meanSeries[seg];
                    const colors = getDeltaColors(delta);
                    const x0 = totalMeta.data[seg].x;
                    const x1 = totalMeta.data[seg + 1].x;

                    // Full-height band by segment (inside XY axes only)
                    ctx2.fillStyle = colors.band;
                    ctx2.fillRect(x0, ca.top, Math.max(1, x1 - x0), ca.bottom - ca.top);

                    // Fill between total and historical lines for the segment
                    ctx2.beginPath();
                    ctx2.moveTo(meanMeta.data[seg].x, meanMeta.data[seg].y);
                    ctx2.lineTo(meanMeta.data[seg + 1].x, meanMeta.data[seg + 1].y);
                    ctx2.lineTo(totalMeta.data[seg + 1].x, totalMeta.data[seg + 1].y);
                    ctx2.lineTo(totalMeta.data[seg].x, totalMeta.data[seg].y);
                    ctx2.closePath();
                    ctx2.fillStyle = colors.between;
                    ctx2.fill();
                }

                ctx2.restore();
            }
        };

        const data = {
            labels,
            datasets: [
                {
                    label: 'Promedio Historico (Referencia)',
                    data: meanSeries,
                    borderColor: '#94a3b8',
                    borderDash: [5, 3],
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25,
                    fill: false,
                    order: 1
                },
                {
                    label: 'Transacciones Actuales (TRX/H)',
                    data: totalSeries,
                    borderColor: getDeltaColor((totalSeries[totalSeries.length - 1] ?? 0) - (meanSeries[meanSeries.length - 1] ?? 0)),
                    borderWidth: 3,
                    pointRadius: (ctx: any) => (ctx.dataIndex === totalSeries.length - 1 ? 5 : 0),
                    pointBackgroundColor: (ctx: any) => {
                        const i = ctx.dataIndex ?? 0;
                        return getDeltaColor((totalSeries[i] ?? 0) - (meanSeries[i] ?? 0));
                    },
                    tension: 0.25,
                    fill: false,
                    segment: { borderColor: segColorFn },
                    order: 2
                }
            ]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 350 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (context: any) => {
                            // Ocultar las etiquetas por defecto de los datasets para personalizar el afterBody
                            return null;
                        },
                        afterBody: (items: any[]) => {
                            const i = items[0]?.dataIndex ?? 0;
                            const total = totalSeries[i] ?? 0;
                            const mean = meanSeries[i] ?? 0;
                            const diff = total - mean;
                            const isUp = diff >= 0;
                            const r = ratio5Series[i] ?? 1;
                            const tol = toleranceFromRatio5(r);
                            
                            return [
                                `📊 TRX Actuales: ${total}`,
                                `📈 Promedio Histórico: ${mean}`,
                                `----------------------------------------`,
                                `${isUp ? '🟢' : '🔴'} Delta: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${isUp ? 'SUBE' : 'BAJA'})`,
                                `⚖️ Ratio 5: ${r.toFixed(4)} [${tol.toUpperCase()}]`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { maxTicksLimit: 24, font: { size: 10 }, color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { ticks: { font: { size: 10 }, color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.06)' } }
            }
        };

        const chart = this.hourlyCharts[comboKey];
        if (chart) {
            const hiddenByLabel = new Map<string, boolean>();
            for (const ds of chart.data.datasets ?? []) {
                hiddenByLabel.set(ds.label, !!ds.hidden);
            }

            try {
                const activeElements = chart.getActiveElements();
                const tooltipActive = chart.tooltip?._active;

                chart.data.labels = data.labels as any;
                chart.data.datasets = data.datasets as any;
                for (const ds of chart.data.datasets ?? []) {
                    if (hiddenByLabel.has(ds.label)) {
                        ds.hidden = hiddenByLabel.get(ds.label) ?? false;
                    }
                }
                chart.options = options as any;
                chart.update('none');

                if (activeElements && activeElements.length > 0) {
                    chart.setActiveElements(activeElements);
                    if (tooltipActive && tooltipActive.length > 0) {
                        chart.tooltip.setActiveElements(tooltipActive, { x: 0, y: 0 });
                    }
                    chart.update('none');
                }
            } catch (_) {}
        } else {
            this.hourlyCharts[comboKey] = new Chart(canvas, {
                type: 'line',
                plugins: [hourlyBgPlugin],
                data,
                options
            });
        }

        const badge = document.getElementById(`hbadge_${comboKey}`);
        if (badge) {
            const lastIdx = Math.max(0, totalSeries.length - 1);
            const delta = (totalSeries[lastIdx] ?? 0) - (meanSeries[lastIdx] ?? 0);
            const isUp = delta >= 0;
            badge.textContent = isUp ? 'SUBE' : 'BAJA';
            badge.className = `status-badge ${isUp ? 'badge-ok' : 'badge-critical'}`;
        }
    }

    // -- Table rendering ------------------------------------------

    private parseFechaTrx(fecha: string): number {
        const parts = fecha.split(' ');
        if (parts.length !== 2) return 0;
        const dateParts = parts[0].split('-');
        const timeParts = parts[1].split(':');
        if (dateParts.length !== 3 || timeParts.length !== 2) return 0;
        const [dd, mm, yyyy] = dateParts;
        const [hh, min] = timeParts;
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)).getTime();
    }

    private renderRealtimeTables(data: Record<ComboKey, RealtimeRow[]>): void {
        const tbody = document.getElementById('rt_body_all');
        if (!tbody) return;

        let allRows: RealtimeRow[] = [];
        for (const { key } of COMBO_META) {
            const rows = data[key] ?? [];
            allRows = allRows.concat(rows);
        }

        allRows.sort((a, b) => this.parseFechaTrx(b.fechaTrx) - this.parseFechaTrx(a.fechaTrx));

        tbody.innerHTML = allRows.map(row => {
            const tol = row.estado ?? toleranceFromRatio5(row.ratio5);
            const cls = PALETTE[tol as ToleranceLevel]?.row ?? '';
            return `<tr class="${cls}">
                <td>${row.fechaTrx}</td>
                <td>${row.tipoCanal}</td>
                <td>${row.transaccion}</td>
                <td>${row.total}</td>
                <td>${fmt(row.rollingSd5, 6)}</td>
                <td><span class="ratio-chip chip-${tol}">${fmt(row.ratio5, 4)}</span></td>
                <td><span class="estado-pill pill-${tol}">${tol.toUpperCase()}</span></td>
            </tr>`;
        }).join('');
    }

    private renderHistoricalTables(data: Record<ComboKey, HistoricalRow[]>): void {
        const tbody = document.getElementById('hist_body_all');
        if (!tbody) return;

        let allRows: HistoricalRow[] = [];
        for (const { key } of COMBO_META) {
            const rows = data[key] ?? [];
            allRows = allRows.concat(rows);
        }

        allRows.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        tbody.innerHTML = allRows.map(row => {
            const ratio = row.ratio5 ?? 1;
            const tol   = toleranceFromRatio5(ratio);
            const cls   = PALETTE[tol].row;
            return `<tr class="${cls}">
                <td>${row.fecha}</td>
                <td>${row.tipoDia}</td>
                <td>${row.tipoCanal}</td>
                <td>${row.transaccion}</td>
                <td>${row.total}</td>
                <td>${row.lag1 ?? 'NULL'}</td>
                <td>${row.lag5 ?? 'NULL'}</td>
                <td>${row.lag15 ?? 'NULL'}</td>
                <td>${fmt(row.rollingMean5, 4)}</td>
                <td>${fmt(row.rollingMean15, 4)}</td>
                <td>${fmt(row.rollingSd5, 6)}</td>
                <td><span class="ratio-chip chip-${tol}">${row.ratio5 !== null ? fmt(row.ratio5, 4) : 'NULL'}</span></td>
                <td>${row.target}</td>
            </tr>`;
        }).join('');
    }

    // -- Apply payload --------------------------------------------

    private applyPayload(payload: DashboardResponse): void {
        // Render 8 individual combo charts
        if (payload.charts) {
            for (const { key } of COMBO_META) {
                const series = payload.charts[key];
                if (series) {
                    this.renderChart(`chart_${key}`, key, series);
                }
            }
        }

        // Render hourly charts
        if (payload.hourlyCharts) {
            for (const { key } of COMBO_META) {
                const series = payload.hourlyCharts[key];
                if (series) {
                    this.renderHourlyChart(`hchart_${key}`, key, series);
                }
            }
        }

        // Render tables
        if (payload.tables?.realtime)   this.renderRealtimeTables(payload.tables.realtime);
        if (payload.tables?.historical) this.renderHistoricalTables(payload.tables.historical);

        // Update timestamp
        const ts = payload.meta?.generatedAt ?? new Date().toISOString();
        const el = document.getElementById('lastUpdate');
        if (el) el.textContent = `Ultima actualizacion: ${new Date(ts).toLocaleTimeString('es-EC')}`;
    }

    // -- Loading state --------------------------------------------

    private setLoadingState(loading: boolean): void {
        const dot = document.querySelector('.status-indicator') as HTMLElement | null;
        if (dot) dot.style.opacity = loading ? '0.3' : '1';
    }

    // -- WebSocket ------------------------------------------------

    private connectRealtimeStream(): void {
        const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl  = `${scheme}://${window.location.host}/ws/dashboard`;

        try {
            this.socket = new WebSocket(wsUrl);
        } catch (_) {
            this.scheduleReconnect();
            return;
        }

        this.socket.addEventListener('open', () => {
            this.isSocketConnected = true;
        });

        this.socket.addEventListener('message', (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data as string) as DashboardSocketMessage;
                if (msg.type === 'dashboard-data') {
                    this.applyPayload(msg.payload);
                }
            } catch (_) {}
        });

        this.socket.addEventListener('close', () => {
            this.isSocketConnected = false;
            this.scheduleReconnect();
        });

        this.socket.addEventListener('error', () => {
            this.isSocketConnected = false;
            this.socket?.close();
        });
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer !== null) return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connectRealtimeStream();
        }, this.wsReconnectMs);
    }

    // -- Initial HTTP load ----------------------------------------

    private async loadDashboardData(): Promise<void> {
        try {
            const data = await this.api.getData();
            this.applyPayload(data);
        } catch (err) {
            console.error('Dashboard load error:', err);
        }
    }

    // -- HTTP fallback polling ------------------------------------

    private startAutoRefresh(): void {
        window.setInterval(() => {
            if (this.isSocketConnected) return;
            this.loadDashboardData();
        }, this.refreshIntervalMs);
    }

    // -- Entry point ----------------------------------------------

    async init(): Promise<void> {
        this.setLoadingState(true);
        this.connectRealtimeStream();
        await this.loadDashboardData();
        this.setLoadingState(false);
        this.startAutoRefresh();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const manager = new DashboardManager();
    (window as Window & { dashboardManager?: DashboardManager }).dashboardManager = manager;
    await manager.init();
});