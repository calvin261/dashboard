"use strict";
class DashboardApi {
    constructor(baseUrl = '/api/dashboard') {
        this.baseUrl = baseUrl;
    }
    async getDashboardData() {
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
        return response.json();
    }
}
class DashboardManager {
    constructor() {
        this.charts = {
            main: null,
            hourly: null
        };
        this.api = new DashboardApi();
        this.referenceData = [];
        this.realTimeData = [];
        this.chartData = {
            labels: [],
            historicalSeries: [],
            realtimeSeries: []
        };
        this.cachedHourlyChartData = null;
        this.hourlyRefreshKey = '';
        this.refreshIntervalMs = 5000;
        this.wsReconnectMs = 3000;
        this.isPolling = false;
        this.socket = null;
        this.isSocketConnected = false;
        this.reconnectTimer = null;
        this.hourlySessionStorageKey = 'dashboard-hourly-projection-v1';
        this.tolerancePalette = {
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
        };
    }
    getField(row, ...keys) {
        for (const key of keys) {
            const value = row[key];
            if (value !== undefined && value !== null) {
                return value;
            }
        }
        return undefined;
    }
    toNumber(value, fallback = 0) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
    }
    toString(value, fallback = '') {
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number') {
            return String(value);
        }
        return fallback;
    }
    normalizeHour(rawHour) {
        const hour = this.toString(rawHour).trim();
        if (!hour)
            return '00:00';
        if (hour.includes(':')) {
            const [h = '0', m = '0'] = hour.split(':');
            const hh = this.toNumber(h, 0).toString().padStart(2, '0');
            const mm = this.toNumber(m, 0).toString().padStart(2, '0');
            return `${hh}:${mm}`;
        }
        const hh = this.toNumber(hour, 0).toString().padStart(2, '0');
        return `${hh}:00`;
    }
    normalizeMinute(rawMinute, hourText) {
        if (rawMinute !== undefined && rawMinute !== null) {
            return this.toNumber(rawMinute, 0);
        }
        if (hourText && hourText.includes(':')) {
            const minutePart = hourText.split(':')[1] || '0';
            return this.toNumber(minutePart, 0);
        }
        return 0;
    }
    buildTimeLabel(rawHour, rawMinute) {
        const hourText = this.normalizeHour(rawHour);
        if (hourText.includes(':')) {
            const [h = '00', m = '00'] = hourText.split(':');
            const minute = rawMinute === undefined || rawMinute === null ? this.toNumber(m, 0) : this.toNumber(rawMinute, 0);
            return `${h.padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
        return `${hourText}:00`;
    }
    normalizeReferenceRows(rows) {
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
    normalizeRealtimeRows(rows) {
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
                trxDetalle: this.toNumber(this.getField(row, 'trxDetalle', 'trx_detalle', 'TRX_DETALLE')),
                transaccion: this.toString(this.getField(row, 'transaccion', 'TRANSACCION')),
                canal: this.toString(this.getField(row, 'canal', 'tipoCanal', 'tipo_canal', 'TIPO_CANAL'))
            };
        });
    }
    async init() {
        this.setLoadingState(true);
        await this.loadDashboardData();
        this.setLoadingState(false);
        this.connectRealtimeStream();
        this.startAutoRefresh();
    }
    applyDashboardPayload(payload) {
        this.chartData = payload.chart || this.chartData;
        const rawReference = (payload.tables?.reference || []);
        const rawRealtime = (payload.tables?.realtime || []);
        this.referenceData = this.normalizeReferenceRows(rawReference);
        this.realTimeData = this.normalizeRealtimeRows(rawRealtime);
        this.renderChart();
        this.renderTables();
        this.updateTimestamp(payload.meta?.generatedAt);
        this.renderError(null);
    }
    connectRealtimeStream() {
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
        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'dashboard-data' && message.payload) {
                    this.applyDashboardPayload(message.payload);
                }
            }
            catch (error) {
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
    scheduleReconnect() {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = window.setTimeout(() => {
            this.connectRealtimeStream();
        }, this.wsReconnectMs);
    }
    async loadDashboardData() {
        if (this.isPolling)
            return;
        this.isPolling = true;
        try {
            const payload = await this.api.getDashboardData();
            this.applyDashboardPayload(payload);
        }
        catch (error) {
            console.error('No se pudo cargar la data del dashboard:', error);
            this.renderError('No se pudo conectar con la API. Mostrando último estado disponible.');
            this.updateTimestamp();
        }
        finally {
            this.isPolling = false;
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
    getToleranceLevel(historical, current) {
        if (historical <= 0) {
            return current <= 0 ? 'ok' : 'critical';
        }
        const diffPercent = ((current - historical) / historical) * 100;
        if (diffPercent <= 10)
            return 'ok';
        if (diffPercent <= 25)
            return 'warning';
        return 'critical';
    }
    getLocalDateKey(date) {
        const yyyy = String(date.getFullYear());
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    getRealtimeAnchor(source) {
        if (source.realtimeSeries.length === 0)
            return 0;
        const window = source.realtimeSeries.slice(-12);
        const sum = window.reduce((acc, value) => acc + value, 0);
        return sum / Math.max(1, window.length);
    }
    pseudoRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }
    getSyntheticHistorical(hour, dateSeed) {
        const waveA = Math.sin((hour + dateSeed) * 0.42) * 7;
        const waveB = Math.cos((hour + dateSeed) * 0.18) * 4;
        const base = 16 + waveA + waveB;
        return Math.max(2, Math.round(base));
    }
    getBandDeviationTarget(band, hour, dateSeed) {
        const jitter = (this.pseudoRandom((hour + 1) * (dateSeed + 1)) - 0.5) * 0.04;
        if (band === 'ok')
            return 0.05 + jitter;
        if (band === 'warning')
            return 0.18 + jitter;
        return 0.33 + jitter;
    }
    buildBandSequence(size) {
        if (size <= 0)
            return [];
        const bands = Array.from({ length: size }, () => {
            const roll = Math.random() * 100;
            if (roll < 50)
                return 'ok';
            if (roll < 80)
                return 'warning';
            return 'critical';
        });
        if (size >= 3) {
            if (!bands.includes('ok'))
                bands[0] = 'ok';
            if (!bands.includes('warning'))
                bands[Math.floor(size / 2)] = 'warning';
            if (!bands.includes('critical'))
                bands[size - 1] = 'critical';
        }
        return bands;
    }
    saveHourlySession(state) {
        try {
            sessionStorage.setItem(this.hourlySessionStorageKey, JSON.stringify(state));
        }
        catch {
            // Ignore session storage errors silently.
        }
    }
    loadHourlySession() {
        try {
            const raw = sessionStorage.getItem(this.hourlySessionStorageKey);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    createHourlySession(source, now) {
        const dateKey = this.getLocalDateKey(now);
        const dateSeed = Number(dateKey.replace(/-/g, ''));
        const labels = [];
        const historicalSeries = [];
        for (let hour = 0; hour <= 23; hour += 1) {
            labels.push(`${String(hour).padStart(2, '0')}:00`);
            historicalSeries.push(this.getSyntheticHistorical(hour, dateSeed));
        }
        const bands = this.buildBandSequence(labels.length);
        const realtimeSeries = [];
        const anchor = this.getRealtimeAnchor(source);
        for (let index = 0; index < labels.length; index += 1) {
            const hour = index;
            const deviationTarget = this.getBandDeviationTarget(bands[index] || 'ok', hour, dateSeed);
            const projected = historicalSeries[index] * (1 + deviationTarget);
            if (index === 0) {
                const blended = anchor > 0 ? (anchor * 0.65) + (projected * 0.35) : projected;
                realtimeSeries.push(Math.max(0, Math.round(blended)));
            }
            else {
                const blended = (realtimeSeries[index - 1] * 0.35) + (projected * 0.65);
                realtimeSeries.push(Math.max(0, Math.round(blended)));
            }
        }
        return {
            dateKey,
            labels,
            historicalSeries,
            realtimeSeries,
            bands
        };
    }
    updateHourlyProjection(state, source, now) {
        const dateSeed = Number(state.dateKey.replace(/-/g, ''));
        const anchor = this.getRealtimeAnchor(source);
        const currentHour = now.getHours();
        if (state.realtimeSeries.length === 0)
            return state;
        const currentTarget = state.historicalSeries[currentHour] * (1 + this.getBandDeviationTarget(state.bands[currentHour] || 'ok', currentHour, dateSeed));
        const currentValue = anchor > 0 ? (state.realtimeSeries[currentHour] * 0.45) + (anchor * 0.55) : currentTarget;
        state.realtimeSeries[currentHour] = Math.max(0, Math.round(currentValue));
        // Horas pasadas: mantener consistencia con leve estabilización.
        for (let index = 0; index < currentHour; index += 1) {
            const band = state.bands[index] || 'ok';
            const target = state.historicalSeries[index] * (1 + this.getBandDeviationTarget(band, index, dateSeed));
            const stable = (state.realtimeSeries[index] * 0.7) + (target * 0.3);
            state.realtimeSeries[index] = Math.max(0, Math.round(stable));
        }
        // Hora actual en adelante: proyección encadenada.
        for (let index = currentHour + 1; index < state.realtimeSeries.length; index += 1) {
            const hour = index;
            const band = state.bands[index] || 'ok';
            const target = state.historicalSeries[index] * (1 + this.getBandDeviationTarget(band, hour, dateSeed));
            const nextValue = (state.realtimeSeries[index - 1] * 0.35) + (target * 0.65);
            state.realtimeSeries[index] = Math.max(0, Math.round(nextValue));
        }
        return state;
    }
    getHourlyChartData(source) {
        const now = new Date();
        const currentDateKey = this.getLocalDateKey(now);
        const loadedState = this.loadHourlySession();
        const needsNewSession = !loadedState
            || loadedState.dateKey !== currentDateKey
            || loadedState.labels.length !== 24;
        let state;
        if (needsNewSession || !loadedState) {
            state = this.createHourlySession(source, now);
        }
        else {
            state = this.updateHourlyProjection(loadedState, source, now);
        }
        this.saveHourlySession(state);
        return {
            labels: state.labels,
            historicalSeries: state.historicalSeries,
            realtimeSeries: state.realtimeSeries
        };
    }
    renderComparisonChart(chartKey, canvasId, chartSeries, xAxisTitle, isHourlyView) {
        const ctx = document.getElementById(canvasId);
        if (!ctx)
            return;
        if (this.charts[chartKey]) {
            this.charts[chartKey].destroy();
        }
        const toleranceLevels = chartSeries.realtimeSeries.map((current, index) => {
            const historical = chartSeries.historicalSeries[index] || 0;
            return this.getToleranceLevel(historical, current);
        });
        const pointColors = toleranceLevels.map((level) => this.tolerancePalette[level].stroke);
        const segmentLevels = chartSeries.realtimeSeries.slice(0, -1).map((_value, index) => {
            const historicalAvg = ((chartSeries.historicalSeries[index] || 0) + (chartSeries.historicalSeries[index + 1] || 0)) / 2;
            const realtimeAvg = ((chartSeries.realtimeSeries[index] || 0) + (chartSeries.realtimeSeries[index + 1] || 0)) / 2;
            return this.getToleranceLevel(historicalAvg, realtimeAvg);
        });
        const segmentAreaPlugin = {
            id: 'segmentAreaFill',
            beforeDatasetsDraw: (chart, _args, pluginOptions) => {
                const levels = pluginOptions?.levels || [];
                const realtimeMeta = chart.getDatasetMeta(1);
                const historicalMeta = chart.getDatasetMeta(0);
                if (!realtimeMeta || !historicalMeta)
                    return;
                const realtimePoints = realtimeMeta.data || [];
                const historicalPoints = historicalMeta.data || [];
                const segmentCount = Math.min(realtimePoints.length, historicalPoints.length) - 1;
                if (segmentCount <= 0)
                    return;
                const ctx = chart.ctx;
                const chartTop = chart.chartArea.top;
                const chartBottom = chart.chartArea.bottom;
                ctx.save();
                for (let index = 0; index < segmentCount; index += 1) {
                    const rt0 = realtimePoints[index];
                    const rt1 = realtimePoints[index + 1];
                    const hs0 = historicalPoints[index];
                    const hs1 = historicalPoints[index + 1];
                    if (!rt0 || !rt1 || !hs0 || !hs1)
                        continue;
                    const level = levels[index] || 'ok';
                    const fillColor = this.tolerancePalette[level].fill;
                    // Fondo por segmento (detrás del área), sutil para no saturar el gráfico.
                    const left = Math.min(rt0.x, hs0.x);
                    const right = Math.max(rt1.x, hs1.x);
                    const width = Math.max(0, right - left);
                    if (width > 0) {
                        ctx.fillStyle = fillColor.replace(/0\.[0-9]+\)/, '0.08)');
                        ctx.fillRect(left, chartTop, width, chartBottom - chartTop);
                    }
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
        this.charts[chartKey] = new Chart(ctx, {
            type: 'line',
            plugins: [segmentAreaPlugin],
            data: {
                labels: chartSeries.labels,
                datasets: [
                    {
                        label: 'Promedio Histórico (Referencia)',
                        data: chartSeries.historicalSeries,
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
                        data: chartSeries.realtimeSeries,
                        borderColor: '#84bd00',
                        backgroundColor: 'rgba(132, 189, 0, 0.16)',
                        borderWidth: 3.2,
                        tension: 0.28,
                        fill: false,
                        segment: {
                            borderColor: (segmentCtx) => {
                                const level = segmentLevels[segmentCtx.p0DataIndex] || 'ok';
                                return this.tolerancePalette[level].stroke;
                            }
                        },
                        pointBackgroundColor: pointColors,
                        pointBorderColor: pointColors,
                        pointRadius: (ctx) => {
                            const lastIndex = chartSeries.realtimeSeries.length - 1;
                            const label = chartSeries.labels[ctx.dataIndex] || '';
                            const isHourlyMark = isHourlyView || label.endsWith(':00:00');
                            if (ctx.dataIndex === lastIndex)
                                return 5;
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
                            text: xAxisTitle,
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
    renderChart() {
        this.renderComparisonChart('main', 'mainChart', this.chartData, 'Tiempo real (HH:mm:ss)', false);
        const now = new Date();
        const refreshKey = `${this.getLocalDateKey(now)}-${String(now.getHours()).padStart(2, '0')}`;
        if (!this.cachedHourlyChartData || this.hourlyRefreshKey !== refreshKey) {
            this.cachedHourlyChartData = this.getHourlyChartData(this.chartData);
            this.hourlyRefreshKey = refreshKey;
        }
        this.renderComparisonChart('hourly', 'hourlyChart', this.cachedHourlyChartData, 'Franja horaria (HH:00)', true);
    }
    renderTables() {
        this.renderRealtimeTable();
        this.renderReferenceTable();
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
    renderRealtimeTable() {
        const tbody = document.getElementById('tableRealTimeBody');
        if (!tbody)
            return;
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
            if (this.isSocketConnected)
                return;
            this.loadDashboardData();
        }, this.refreshIntervalMs);
    }
}
document.addEventListener('DOMContentLoaded', async () => {
    const manager = new DashboardManager();
    window.dashboardManager = manager;
    await manager.init();
});
