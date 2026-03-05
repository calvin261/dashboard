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
        this.refreshIntervalMs = 60000; // 1 minuto — coincide con la granularidad de los datos
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
        // ============================================================
        // BAR COLOR CONFIGURATION — edita estos valores para cambiar
        // el color de las barras según el nivel de tolerancia (ratio5)
        // ============================================================
        const BAR_COLORS = {
            ok: { bg: 'rgba(90,158,0,0.78)', border: '#5a9e00' }, // Verde
            warning: { bg: 'rgba(249,115,22,0.82)', border: '#f97316' }, // Naranja
            critical: { bg: 'rgba(196,26,0,0.87)', border: '#c41a00' }, // Rojo
        };
        const getBarColors = (idx) => {
            const r = ratio5Series[idx] ?? 1;
            return BAR_COLORS[toleranceFromRatio5(r)];
        };
        const data = {
            labels,
            datasets: [
                {
                    label: 'Promedio Historico (Referencia)',
                    type: 'line',
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
                    label: 'EMA 9',
                    type: 'line',
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
                    type: 'bar',
                    data: totalSeries,
                    backgroundColor: (ctx) => getBarColors(ctx.dataIndex).bg,
                    borderColor: (ctx) => getBarColors(ctx.dataIndex).border,
                    borderWidth: 1,
                    borderRadius: 2,
                    borderSkipped: false,
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
                        padding: 12,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (_context) => null,
                        afterBody: (items) => {
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
                    // Con datos por minuto mostramos una marca cada ~5 min
                    ticks: { maxTicksLimit: 12, maxRotation: 0, font: { size: 10 }, color: '#64748b' },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                y: {
                    ticks: { font: { size: 10 }, color: '#64748b' },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                }
            }
        };
        // Crea o recrea el chart como tipo 'bar' (mixed con líneas overlay)
        const chart = this.charts[comboKey];
        if (chart) {
            // Si el chart existente no es bar, destruir y recrear
            if (chart.config?.type !== 'bar') {
                chart.destroy();
                this.charts[comboKey] = new Chart(canvas, { type: 'bar', data: data, options: options });
            }
            else {
                try {
                    const hiddenByLabel = new Map();
                    for (const ds of chart.data.datasets ?? []) {
                        hiddenByLabel.set(ds.label, !!ds.hidden);
                    }
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
                catch (_) { }
            }
        }
        else {
            this.charts[comboKey] = new Chart(canvas, { type: 'bar', data: data, options: options });
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
            stdBadge.innerHTML = `STD5 ${stdUp ? '&#9650; SUBE' : '&#9660; BAJA'} ${stdNow.toFixed(2)}`;
            stdBadge.className = `status-badge std-badge ${stdUp ? 'std-up' : 'std-low'}`;
        }
    }
    // -- Hourly chart rendering ------------------------------------------
    renderHourlyChart(canvasId, comboKey, series) {
        const canvas = document.getElementById(canvasId);
        if (!canvas)
            return;
        const { labels, totalSeries, meanSeries, ratio5Series } = series;
        const getDeltaColor = (delta) => {
            if (delta >= 0)
                return '#64a800'; // Verde
            if (delta >= -10)
                return '#f97316'; // Tomate intenso (Naranja)
            return '#d41414'; // Rojo
        };
        const getDeltaColors = (delta) => {
            if (delta >= 0)
                return { stroke: '#64a800', band: 'rgba(100,168,0,0.14)', between: 'rgba(100,168,0,0.32)' };
            if (delta >= -10)
                return { stroke: '#f97316', band: 'rgba(249,115,22,0.25)', between: 'rgba(249,115,22,0.45)' }; // Tomate más intenso
            return { stroke: '#d41414', band: 'rgba(212,20,20,0.13)', between: 'rgba(212,20,20,0.34)' };
        };
        const segColorFn = (ctx) => {
            const i = ctx.p0DataIndex ?? 0;
            const delta = (totalSeries[i] ?? 0) - (meanSeries[i] ?? 0);
            return getDeltaColor(delta);
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
                    pointRadius: (ctx) => (ctx.dataIndex === totalSeries.length - 1 ? 5 : 0),
                    pointBackgroundColor: (ctx) => {
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
                legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            // Ocultar las etiquetas por defecto de los datasets para personalizar el afterBody
                            return null;
                        },
                        afterBody: (items) => {
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
            const hiddenByLabel = new Map();
            for (const ds of chart.data.datasets ?? []) {
                hiddenByLabel.set(ds.label, !!ds.hidden);
            }
            try {
                const activeElements = chart.getActiveElements();
                const tooltipActive = chart.tooltip?._active;
                chart.data.labels = data.labels;
                chart.data.datasets = data.datasets;
                for (const ds of chart.data.datasets ?? []) {
                    if (hiddenByLabel.has(ds.label)) {
                        ds.hidden = hiddenByLabel.get(ds.label) ?? false;
                    }
                }
                chart.options = options;
                chart.update('none');
                if (activeElements && activeElements.length > 0) {
                    chart.setActiveElements(activeElements);
                    if (tooltipActive && tooltipActive.length > 0) {
                        chart.tooltip.setActiveElements(tooltipActive, { x: 0, y: 0 });
                    }
                    chart.update('none');
                }
            }
            catch (_) { }
        }
        else {
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
    parseFechaTrx(fecha) {
        const parts = fecha.split(' ');
        if (parts.length !== 2)
            return 0;
        const dateParts = parts[0].split('-');
        const timeParts = parts[1].split(':');
        if (dateParts.length !== 3 || timeParts.length !== 2)
            return 0;
        const [dd, mm, yyyy] = dateParts;
        const [hh, min] = timeParts;
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)).getTime();
    }
    renderRealtimeTables(data) {
        const tbody = document.getElementById('rt_body_all');
        if (!tbody)
            return;
        let allRows = [];
        for (const { key } of COMBO_META) {
            const rows = data[key] ?? [];
            allRows = allRows.concat(rows);
        }
        allRows.sort((a, b) => this.parseFechaTrx(b.fechaTrx) - this.parseFechaTrx(a.fechaTrx));
        tbody.innerHTML = allRows.map(row => {
            const tol = row.estado ?? toleranceFromRatio5(row.ratio5);
            const cls = PALETTE[tol]?.row ?? '';
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
    renderHistoricalTables(data) {
        const tbody = document.getElementById('hist_body_all');
        if (!tbody)
            return;
        let allRows = [];
        for (const { key } of COMBO_META) {
            const rows = data[key] ?? [];
            allRows = allRows.concat(rows);
        }
        allRows.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        tbody.innerHTML = allRows.map(row => {
            const ratio = row.ratio5 ?? 1;
            const tol = toleranceFromRatio5(ratio);
            const cls = PALETTE[tol].row;
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
