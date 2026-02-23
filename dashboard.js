"use strict";
// ================================================================
// COMBO META
// ================================================================
const COMBO_META = [
    { key: 'atm_avance', label: 'ATM - Avance' },
    { key: 'atm_deposito', label: 'ATM - Deposito' },
    { key: 'atm_pago_tc', label: 'ATM - Pago TC' },
    { key: 'atm_retiro', label: 'ATM - Retiro' },
    { key: 'atm_transferencias', label: 'ATM - Transferencias' },
    { key: 'servipagos_avance', label: 'ATM SERVIPAGOS - Avance' },
    { key: 'servipagos_retiro', label: 'ATM SERVIPAGOS - Retiro' },
    { key: 'clientes_red_retiro', label: 'CLIENTES ATM RED - Retiro' },
];
// ================================================================
// TOLERANCE HELPERS
// ================================================================
const PALETTE = {
    ok: { stroke: '#5a9e00', fill: 'rgba(90,158,0,0.40)', areafill: 'rgba(90,158,0,0.18)', chartbg: 'rgba(90,158,0,0.10)', row: '' },
    warning: { stroke: '#c41a00', fill: 'rgba(196,26,0,0.52)', areafill: 'rgba(196,26,0,0.26)', chartbg: 'rgba(196,26,0,0.13)', row: 'row-warning' },
    critical: { stroke: '#6b0000', fill: 'rgba(107,0,0,0.58)', areafill: 'rgba(107,0,0,0.30)', chartbg: 'rgba(107,0,0,0.16)', row: 'row-critical' },
};
function toleranceFromRatio5(ratio5) {
    if (ratio5 <= 1.25)
        return 'ok';
    if (ratio5 <= 1.5)
        return 'warning';
    return 'critical';
}
function fmt(n, digits = 4) {
    if (n === null || n === undefined)
        return 'NULL';
    return Number(n).toFixed(digits);
}
// ================================================================
// API
// ================================================================
class DashboardApi {
    constructor(baseUrl = '/api/dashboard') {
        this.baseUrl = baseUrl;
    }
    async getData() {
        const url = new URL(`${this.baseUrl}/data`, window.location.origin);
        url.searchParams.set('_t', Date.now().toString());
        const res = await fetch(url.toString(), {
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
        });
        if (!res.ok)
            throw new Error(`API ${res.status}`);
        return res.json();
    }
}
// ================================================================
// DASHBOARD MANAGER
// ================================================================
class DashboardManager {
    constructor() {
        this.api = new DashboardApi();
        this.charts = {};
        this.hourlyCharts = {};
        this.socket = null;
        this.isSocketConnected = false;
        this.reconnectTimer = null;
        this.wsReconnectMs = 3000;
        this.refreshIntervalMs = 5000;
    }
    // -- Chart rendering ------------------------------------------
    buildSegmentColorFn(ratio5Series) {
        return (ctx) => {
            const i = ctx.p0DataIndex ?? 0;
            const ratio = ratio5Series[i] ?? 1;
            return PALETTE[toleranceFromRatio5(ratio)].stroke;
        };
    }
    renderChart(canvasId, comboKey, series) {
        const canvas = document.getElementById(canvasId);
        if (!canvas)
            return;
        const { labels, totalSeries, meanSeries, ratio5Series } = series;
        const stdSeries = series.stdSeries ?? meanSeries.map(() => 0);
        const ema9Series = series.ema9Series ?? totalSeries;
        const lastRatio = ratio5Series[ratio5Series.length - 1] ?? 1;
        const level = toleranceFromRatio5(lastRatio);
        const isUpAt = (idx) => (totalSeries[idx] ?? 0) >= (meanSeries[idx] ?? 0);
        const lineColor = {
            up: '#64a800',
            down: '#d41414',
            neutral: '#94a3b8'
        };
        const segColorFn = (ctx) => {
            const i = ctx.p0DataIndex ?? 0;
            return isUpAt(i) ? lineColor.up : lineColor.down;
        };
        const realtimeBgPlugin = {
            id: `realtimeBg_${comboKey}`,
            beforeDatasetsDraw(chart) {
                const ctx2 = chart.ctx;
                const ca = chart.chartArea;
                const meanMeta = chart.getDatasetMeta(0);
                const totalMeta = chart.getDatasetMeta(2);
                if (!meanMeta?.data?.length || !totalMeta?.data?.length)
                    return;
                ctx2.save();
                ctx2.beginPath();
                ctx2.rect(ca.left, ca.top, ca.width, ca.height);
                ctx2.clip();
                for (let seg = 0; seg < totalMeta.data.length - 1; seg++) {
                    const up = totalMeta.data[seg].y <= meanMeta.data[seg].y;
                    const band = up ? 'rgba(100,168,0,0.12)' : 'rgba(212,20,20,0.11)';
                    const between = up ? 'rgba(100,168,0,0.28)' : 'rgba(212,20,20,0.30)';
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
                    borderColor: isUpAt(totalSeries.length - 1) ? lineColor.up : lineColor.down,
                    borderWidth: 3,
                    pointRadius: (ctx) => (ctx.dataIndex === totalSeries.length - 1 ? 5 : 0),
                    pointBackgroundColor: (ctx) => {
                        const i = ctx.dataIndex ?? 0;
                        return isUpAt(i) ? lineColor.up : lineColor.down;
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
                    position: 'top',
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
                        afterBody: (items) => {
                            const i = items[0]?.dataIndex ?? 0;
                            const r = ratio5Series[i] ?? 1;
                            const tol = toleranceFromRatio5(r);
                            const std = stdSeries[i] ?? 0;
                            const total = totalSeries[i] ?? 0;
                            const hist = meanSeries[i] ?? 0;
                            const delta = total - hist;
                            const ema = ema9Series[i] ?? 0;
                            return [
                                `Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (${delta >= 0 ? 'UP' : 'DOWN'})`,
                                `Ratio5: ${r.toFixed(4)} [${tol.toUpperCase()}]`,
                                `STD5: ${std.toFixed(4)} | EMA9: ${ema.toFixed(2)}`
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
            const hiddenByLabel = new Map();
            for (const ds of chart.data.datasets ?? []) {
                hiddenByLabel.set(ds.label, !!ds.hidden);
            }
            // Evita estado roto de tooltip/hover al refrescar mientras hay mouseover
            try {
                chart.stop();
                chart.setActiveElements([]);
                chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
            }
            catch (_) { }
            chart.data.labels = data.labels;
            chart.data.datasets = data.datasets;
            for (const ds of chart.data.datasets ?? []) {
                if (hiddenByLabel.has(ds.label)) {
                    ds.hidden = hiddenByLabel.get(ds.label) ?? false;
                }
            }
            chart.options = options;
            chart.update('none');
        }
        else {
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
        const cardHeader = canvas.closest('.card')?.querySelector('.card-header');
        if (cardHeader) {
            const stdNow = stdSeries[stdSeries.length - 1] ?? 0;
            const prevStdWindow = stdSeries.slice(Math.max(0, stdSeries.length - 11), stdSeries.length - 1);
            const prevStdAvg = prevStdWindow.length > 0
                ? prevStdWindow.reduce((a, b) => a + b, 0) / prevStdWindow.length
                : stdNow;
            const stdUp = stdNow >= prevStdAvg;
            const stdBadgeId = `std5_badge_${comboKey}`;
            let stdBadge = document.getElementById(stdBadgeId);
            if (!stdBadge) {
                stdBadge = document.createElement('span');
                stdBadge.id = stdBadgeId;
                stdBadge.className = 'status-badge std-badge std-low';
                cardHeader.appendChild(stdBadge);
            }
            stdBadge.textContent = `STD5 ${stdUp ? 'UP' : 'BAJO'} ${stdNow.toFixed(2)}`;
            stdBadge.className = `status-badge std-badge ${stdUp ? 'std-up' : 'std-low'}`;
        }
    }
    // -- Hourly chart rendering ------------------------------------------
    renderHourlyChart(canvasId, comboKey, series) {
        const canvas = document.getElementById(canvasId);
        if (!canvas)
            return;
        if (this.hourlyCharts[comboKey]) {
            try {
                this.hourlyCharts[comboKey].destroy();
            }
            catch (_) { }
            this.hourlyCharts[comboKey] = null;
        }
        const { labels, totalSeries, meanSeries, ratio5Series } = series;
        const HOURLY_COLORS = {
            up: {
                stroke: '#64a800',
                band: 'rgba(100,168,0,0.14)',
                between: 'rgba(100,168,0,0.32)'
            },
            down: {
                stroke: '#d41414',
                band: 'rgba(212,20,20,0.13)',
                between: 'rgba(212,20,20,0.34)'
            }
        };
        const isUpAt = (idx) => (totalSeries[idx] ?? 0) >= (meanSeries[idx] ?? 0);
        const segColorFn = (ctx) => {
            const i = ctx.p0DataIndex ?? 0;
            return isUpAt(i) ? HOURLY_COLORS.up.stroke : HOURLY_COLORS.down.stroke;
        };
        const hourlyBgPlugin = {
            id: `hourlyBg_${comboKey}`,
            beforeDatasetsDraw(chart) {
                const ctx2 = chart.ctx;
                const ca = chart.chartArea;
                const totalMeta = chart.getDatasetMeta(1);
                const meanMeta = chart.getDatasetMeta(0);
                if (!totalMeta?.data?.length || !meanMeta?.data?.length)
                    return;
                ctx2.save();
                ctx2.beginPath();
                ctx2.rect(ca.left, ca.top, ca.width, ca.height);
                ctx2.clip();
                for (let seg = 0; seg < totalMeta.data.length - 1; seg++) {
                    const up = isUpAt(seg);
                    const colors = up ? HOURLY_COLORS.up : HOURLY_COLORS.down;
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
        this.hourlyCharts[comboKey] = new Chart(canvas, {
            type: 'line',
            plugins: [hourlyBgPlugin],
            data: {
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
                        borderColor: HOURLY_COLORS.up.stroke,
                        borderWidth: 3,
                        pointRadius: (ctx) => (ctx.dataIndex === totalSeries.length - 1 ? 5 : 0),
                        pointBackgroundColor: (ctx) => {
                            const i = ctx.dataIndex ?? 0;
                            return isUpAt(i) ? HOURLY_COLORS.up.stroke : HOURLY_COLORS.down.stroke;
                        },
                        tension: 0.25,
                        fill: false,
                        segment: { borderColor: segColorFn },
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 350 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            afterBody: (items) => {
                                const i = items[0]?.dataIndex ?? 0;
                                const total = totalSeries[i] ?? 0;
                                const mean = meanSeries[i] ?? 0;
                                const up = total >= mean;
                                const diff = total - mean;
                                const r = ratio5Series[i] ?? 1;
                                return [
                                    `Delta: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${up ? 'TOTAL > HISTORICO' : 'HISTORICO > TOTAL'})`,
                                    `Ratio5: ${r.toFixed(4)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { maxTicksLimit: 12, font: { size: 10 }, color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.04)' } },
                    y: { ticks: { font: { size: 10 }, color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.06)' } }
                }
            }
        });
        const badge = document.getElementById(`hbadge_${comboKey}`);
        if (badge) {
            const lastIdx = Math.max(0, totalSeries.length - 1);
            const isUp = isUpAt(lastIdx);
            badge.textContent = isUp ? 'UP' : 'DOWN';
            badge.className = `status-badge ${isUp ? 'badge-ok' : 'badge-critical'}`;
        }
    }
    // -- Table rendering ------------------------------------------
    renderRealtimeTables(data) {
        for (const { key } of COMBO_META) {
            const tbody = document.getElementById(`rt_body_${key}`);
            if (!tbody)
                continue;
            const rows = data[key] ?? [];
            const lastRow = rows[rows.length - 1];
            const lastRatio = lastRow?.ratio5 ?? 1;
            const badge = document.getElementById(`rt_badge_${key}`);
            if (badge) {
                const tol = toleranceFromRatio5(lastRatio);
                badge.textContent = tol.toUpperCase();
                badge.className = `status-badge badge-${tol}`;
            }
            tbody.innerHTML = [...rows].reverse().map(row => {
                const tol = row.estado ?? toleranceFromRatio5(row.ratio5);
                const cls = PALETTE[tol]?.row ?? '';
                return `<tr class="${cls}">
                    <td>${row.fechaTrx}</td>
                    <td>${row.transaccion}</td>
                    <td>${row.total}</td>
                    <td>${fmt(row.rollingSd5, 6)}</td>
                    <td><span class="ratio-chip chip-${tol}">${fmt(row.ratio5, 4)}</span></td>
                    <td><span class="estado-pill pill-${tol}">${tol.toUpperCase()}</span></td>
                </tr>`;
            }).join('');
        }
    }
    renderHistoricalTables(data) {
        for (const { key } of COMBO_META) {
            const tbody = document.getElementById(`hist_body_${key}`);
            if (!tbody)
                continue;
            const rows = data[key] ?? [];
            tbody.innerHTML = [...rows].reverse().map(row => {
                const ratio = row.ratio5 ?? 1;
                const tol = toleranceFromRatio5(ratio);
                const cls = PALETTE[tol].row;
                return `<tr class="${cls}">
                    <td>${row.fecha}</td>
                    <td>${row.tipoDia}</td>
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
    }
    // -- Apply payload --------------------------------------------
    applyPayload(payload) {
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
        if (payload.tables?.realtime)
            this.renderRealtimeTables(payload.tables.realtime);
        if (payload.tables?.historical)
            this.renderHistoricalTables(payload.tables.historical);
        // Update timestamp
        const ts = payload.meta?.generatedAt ?? new Date().toISOString();
        const el = document.getElementById('lastUpdate');
        if (el)
            el.textContent = `Ultima actualizacion: ${new Date(ts).toLocaleTimeString('es-EC')}`;
    }
    // -- Loading state --------------------------------------------
    setLoadingState(loading) {
        const dot = document.querySelector('.status-indicator');
        if (dot)
            dot.style.opacity = loading ? '0.3' : '1';
    }
    // -- WebSocket ------------------------------------------------
    connectRealtimeStream() {
        const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${scheme}://${window.location.host}/ws/dashboard`;
        try {
            this.socket = new WebSocket(wsUrl);
        }
        catch (_) {
            this.scheduleReconnect();
            return;
        }
        this.socket.addEventListener('open', () => {
            this.isSocketConnected = true;
        });
        this.socket.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'dashboard-data') {
                    this.applyPayload(msg.payload);
                }
            }
            catch (_) { }
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
    scheduleReconnect() {
        if (this.reconnectTimer !== null)
            return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connectRealtimeStream();
        }, this.wsReconnectMs);
    }
    // -- Initial HTTP load ----------------------------------------
    async loadDashboardData() {
        try {
            const data = await this.api.getData();
            this.applyPayload(data);
        }
        catch (err) {
            console.error('Dashboard load error:', err);
        }
    }
    // -- HTTP fallback polling ------------------------------------
    startAutoRefresh() {
        window.setInterval(() => {
            if (this.isSocketConnected)
                return;
            this.loadDashboardData();
        }, this.refreshIntervalMs);
    }
    // -- Entry point ----------------------------------------------
    async init() {
        this.setLoadingState(true);
        this.connectRealtimeStream();
        await this.loadDashboardData();
        this.setLoadingState(false);
        this.startAutoRefresh();
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    const manager = new DashboardManager();
    window.dashboardManager = manager;
    await manager.init();
});
