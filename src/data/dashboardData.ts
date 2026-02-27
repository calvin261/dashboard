// ─── TYPES ──────────────────────────────────────────────────────────────────

export type ComboKey =
    | 'atm_avance'
    | 'atm_deposito'
    | 'atm_pago_tc'
    | 'atm_retiro'
    | 'atm_transferencias'
    | 'servipagos_avance'
    | 'servipagos_retiro'
    | 'clientes_red_retiro';

export type ToleranceLevel = 'ok' | 'warning' | 'critical';

export interface RealtimeRow {
    fechaTrx: string;
    tipoCanal: string;
    transaccion: string;
    total: number;
    rollingSd5: number;
    ratio5: number;
    estado: ToleranceLevel;
}

export interface HistoricalRow {
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

export interface ChartSeries {
    labels: string[];
    totalSeries: number[];
    meanSeries: number[];
    ratio5Series: number[];
    stdSeries?: number[];
    upperBandSeries?: number[];
    lowerBandSeries?: number[];
    ema9Series?: number[];
}

export interface DashboardPayload {
    charts: Record<ComboKey, ChartSeries>;
    hourlyCharts: Record<ComboKey, ChartSeries>;
    tables: {
        realtime: Record<ComboKey, RealtimeRow[]>;
        historical: Record<ComboKey, HistoricalRow[]>;
    };
    meta: {
        generatedAt: string;
        source: string;
    };
}

// ─── COMBO DEFINITIONS ──────────────────────────────────────────────────────

interface ComboConfig {
    key: ComboKey;
    canal: string;
    transaccion: string;
    chartGroup: 'atm' | 'servipagos' | 'clientesRed';
    baseMin: number;
    baseMax: number;
}

const COMBOS: ComboConfig[] = [
    { key: 'atm_avance',         canal: 'ATM',                         transaccion: 'AVANCE',         chartGroup: 'atm',  baseMin: 1,  baseMax: 3   },
    { key: 'atm_deposito',       canal: 'ATM',                         transaccion: 'DEPOSITO',       chartGroup: 'atm',  baseMin: 3,  baseMax: 14  },
    { key: 'atm_pago_tc',        canal: 'ATM',                         transaccion: 'PAGO TC',        chartGroup: 'atm',  baseMin: 1,  baseMax: 3   },
    { key: 'atm_retiro',         canal: 'ATM',                         transaccion: 'RETIRO',         chartGroup: 'atm',  baseMin: 50, baseMax: 146 },
    { key: 'atm_transferencias', canal: 'ATM',                         transaccion: 'TRANSFERENCIAS', chartGroup: 'atm',  baseMin: 1,  baseMax: 2   },
    { key: 'servipagos_avance',         canal: 'ATM SERVIPAGOS',              transaccion: 'AVANCE',         chartGroup: 'servipagos',  baseMin: 1,  baseMax: 6   },
    { key: 'servipagos_retiro',         canal: 'ATM SERVIPAGOS',              transaccion: 'RETIRO',         chartGroup: 'servipagos',  baseMin: 1,  baseMax: 4   },
    { key: 'clientes_red_retiro',       canal: 'CLIENTES ATM RED',            transaccion: 'RETIRO',         chartGroup: 'clientesRed', baseMin: 10, baseMax: 35  },
];

// ─── UTILITIES ──────────────────────────────────────────────────────────────

function toTimeLabel(d: Date): string {
    return [d.getHours(), d.getMinutes()]
        .map(n => String(n).padStart(2, '0'))
        .join(':');
}

function toDateTimeLabel(d: Date): string {
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, '0');
    const min  = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function toHistoricalDateLabel(d: Date): string {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    const hh   = String(d.getHours()).padStart(2, '0');
    const min  = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:00`;
}

function getToleranceLevel(ratio5: number): ToleranceLevel {
    if (ratio5 <= 1.25) return 'ok';
    if (ratio5 <= 1.5)  return 'warning';
    return 'critical';
}

// ─── COMBO TICK STATE ───────────────────────────────────────────────────────

interface ComboTick {
    timestamp: Date;
    total: number;
    rollingMean5: number | null;
    rollingMean15: number | null;
    rollingSd5: number | null;
    ratio5: number;
}

interface ComboState {
    config: ComboConfig;
    ticks: ComboTick[];
    step: number;
    prevTotal: number;
}

const WINDOW_SIZE = 60; // Volvemos a 60 puntos para tener una curva suave

function computeRawTotal(cfg: ComboConfig, step: number): number {
    const mid   = (cfg.baseMin + cfg.baseMax) / 2;
    const wave  = Math.sin(step / 8) * (mid * 0.3);
    const noise = (Math.random() - 0.5) * (mid * 0.2);
    return Math.max(cfg.baseMin, Math.round(mid + wave + noise));
}

function pushComboTick(state: ComboState, timestamp: Date): void {
    const raw   = computeRawTotal(state.config, state.step);
    const total = state.prevTotal === 0
        ? raw
        : Math.round(state.prevTotal * 0.35 + raw * 0.65);
    state.prevTotal = total;

    const recent5  = state.ticks.slice(-5).map(t => t.total);
    const recent15 = state.ticks.slice(-15).map(t => t.total);

    const rollingMean5: number | null = recent5.length >= 5
        ? +(recent5.reduce((a, b) => a + b, 0) / recent5.length).toFixed(4)
        : null;
    const rollingMean15: number | null = recent15.length >= 15
        ? +(recent15.reduce((a, b) => a + b, 0) / recent15.length).toFixed(4)
        : null;
    const rollingSd5: number | null = (recent5.length >= 5 && rollingMean5 !== null)
        ? +(Math.sqrt(recent5.reduce((a, b) => a + Math.pow(b - rollingMean5, 2), 0) / recent5.length)).toFixed(13)
        : null;
    const ratio5 = (rollingMean5 !== null && rollingMean5 > 0)
        ? +(total / rollingMean5).toFixed(13)
        : 1.0;

    state.ticks.push({ timestamp, total, rollingMean5, rollingMean15, rollingSd5, ratio5 });
    if (state.ticks.length > WINDOW_SIZE) state.ticks.shift();
    state.step += 1;
}

// ─── GLOBAL STATE ───────────────────────────────────────────────────────────

const comboStates: Map<ComboKey, ComboState> = new Map(
    COMBOS.map(cfg => [cfg.key, { config: cfg, ticks: [], step: 0, prevTotal: 0 }])
);

let lastTickAt = 0;

// ─── HOURLY STATE ────────────────────────────────────────────────────────────

interface HourlyBucket {
    label: string;     // 'HH:00'
    total: number;
    rollingMean5: number | null;
    ratio5: number;
}

interface HourlyComboState {
    buckets: HourlyBucket[];
    accumTotal: number;
    currentHour: number;
}

const HOURLY_WINDOW = 24;

const hourlyStates: Map<ComboKey, HourlyComboState> = new Map(
    COMBOS.map(cfg => [cfg.key, { buckets: [], accumTotal: 0, currentHour: -1 }])
);

function computeHourlySynthetic(cfg: ComboConfig, hour: number, seed: number): number {
    const curve = Math.max(0.2, Math.sin((hour - 5) * Math.PI / 15)); // Aumentado el mínimo de la curva
    const mid   = (cfg.baseMin + cfg.baseMax) / 2;
    const noise = Math.sin(seed * 7.3 + hour * 1.9) * 0.3; // Aumentado el ruido
    // Asegurar que nunca sea 0, multiplicador ajustado para que tenga sentido con los datos por minuto
    return Math.max(Math.round(cfg.baseMin * 30), Math.round(mid * 60 * curve * (1 + noise))); 
}

function hydrateHourly(now: Date): void {
    for (const cfg of COMBOS) {
        const hstate = hourlyStates.get(cfg.key)!;
        if (hstate.buckets.length > 0) continue;
        const currentHour = now.getHours();
        for (let i = HOURLY_WINDOW - 1; i >= 0; i--) {
            const h     = (currentHour - i + 24) % 24;
            const label = `${String(h).padStart(2, '0')}:00`;
            const total = computeHourlySynthetic(cfg, h, i);
            const recent5 = hstate.buckets.slice(-5).map(b => b.total);
            const rollingMean5: number | null = recent5.length >= 5
                ? +(recent5.reduce((a, b) => a + b, 0) / 5).toFixed(2) : null;
            const ratio5 = (rollingMean5 !== null && rollingMean5 > 0)
                ? +(total / rollingMean5).toFixed(4) : 1.0;
            hstate.buckets.push({ label, total, rollingMean5, ratio5 });
        }
        hstate.currentHour = currentHour;
    }
}

function updateHourlyTick(key: ComboKey, tick: ComboTick): void {
    const hstate = hourlyStates.get(key)!;
    const h      = tick.timestamp.getHours();
    if (hstate.currentHour === -1) hstate.currentHour = h;
    if (h !== hstate.currentHour) {
        const total    = hstate.accumTotal;
        const recent5  = hstate.buckets.slice(-5).map(b => b.total);
        const rollingMean5: number | null = recent5.length >= 5
            ? +(recent5.reduce((a, b) => a + b, 0) / 5).toFixed(2) : null;
        const ratio5 = (rollingMean5 !== null && rollingMean5 > 0)
            ? +(total / rollingMean5).toFixed(4) : 1.0;
        hstate.buckets.push({ label: `${String(hstate.currentHour).padStart(2, '0')}:00`, total, rollingMean5, ratio5 });
        if (hstate.buckets.length > HOURLY_WINDOW) hstate.buckets.shift();
        hstate.accumTotal   = 0;
        hstate.currentHour  = h;
    }
    hstate.accumTotal += tick.total;
}

function buildHourlyChartSeries(key: ComboKey, cfg: ComboConfig): ChartSeries {
    const hstate = hourlyStates.get(key)!;
    const all    = [...hstate.buckets];
    if (hstate.accumTotal > 0) {
        const h     = hstate.currentHour >= 0 ? hstate.currentHour : new Date().getHours();
        const label = `${String(h).padStart(2, '0')}:00*`;
        const recent5 = hstate.buckets.slice(-5).map(b => b.total);
        const rollingMean5: number | null = recent5.length >= 5
            ? +(recent5.reduce((a, b) => a + b, 0) / 5).toFixed(2) : null;
        const ratio5 = (rollingMean5 !== null && rollingMean5 > 0)
            ? +(hstate.accumTotal / rollingMean5).toFixed(4) : 1.0;
        all.push({ label, total: hstate.accumTotal, rollingMean5, ratio5 });
    }
    return {
        labels:       all.map(b => b.label),
        totalSeries:  all.map(b => b.total),
        meanSeries:   all.map(b => b.rollingMean5 ?? b.total),
        ratio5Series: all.map(b => b.ratio5)
    };
}

function hydrateIfNeeded(now: Date): void {
    if (comboStates.get('atm_retiro')!.ticks.length > 0) return;
    
    // Inicializar con los últimos 60 puntos (1 punto cada 10 segundos para cubrir 10 minutos)
    const start = new Date(now.getTime() - ((WINDOW_SIZE - 1) * 10000));
    
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const tickDate = new Date(start.getTime() + (i * 10000));
        for (const state of comboStates.values()) {
            pushComboTick(state, tickDate);
        }
    }
    hydrateHourly(now);
    lastTickAt = now.getTime();
}

function updateAllStates(): void {
    const now = new Date();
    hydrateIfNeeded(now);
    
    // Actualizar cada 10 segundos en lugar de cada minuto
    const elapsed = Math.max(1, Math.floor((now.getTime() - lastTickAt) / 10000));
    
    if (elapsed > 0) {
        for (let s = 0; s < elapsed; s++) {
            const td = new Date(lastTickAt + ((s + 1) * 10000));
            for (const state of comboStates.values()) {
                pushComboTick(state, td);
                updateHourlyTick(state.config.key, state.ticks[state.ticks.length - 1]);
            }
        }
        lastTickAt = now.getTime();
    }
}

// ─── ROW BUILDERS ────────────────────────────────────────────────────────────

function buildRealtimeRows(state: ComboState): RealtimeRow[] {
    return state.ticks.slice(-20).map(tick => ({
        fechaTrx:    toDateTimeLabel(tick.timestamp),
        tipoCanal:   state.config.canal,
        transaccion: state.config.transaccion,
        total:       tick.total,
        rollingSd5:  tick.rollingSd5 ?? 0,
        ratio5:      tick.ratio5,
        estado:      getToleranceLevel(tick.ratio5)
    }));
}

function buildHistoricalRows(state: ComboState): HistoricalRow[] {
    const ticks = state.ticks.slice(-20);
    return ticks.map((tick, idx, arr) => {
        const lag1  = idx >= 1  ? arr[idx - 1].total : null;
        const lag5  = idx >= 5  ? arr[idx - 5].total : null;
        const lag15 = idx >= 15 ? arr[idx - 15].total : null;

        const histBase  = new Date('2025-10-01T00:00:00');
        const offsetMin = (state.step - (arr.length - idx)) * 2;
        histBase.setMinutes(histBase.getMinutes() + Math.max(0, offsetMin));

        return {
            fecha:         toHistoricalDateLabel(histBase),
            estado:        'DIA NORMAL',
            tipoDia:       'DIA NORMAL',
            tipoCanal:     state.config.canal,
            transaccion:   state.config.transaccion,
            total:         tick.total,
            lag1,
            lag5,
            lag15,
            rollingMean5:  tick.rollingMean5,
            rollingMean15: tick.rollingMean15,
            rollingSd5:    tick.rollingSd5,
            ratio5:        tick.rollingSd5 !== null ? tick.ratio5 : null,
            target:        tick.total
        };
    });
}

function computeEma(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const out: number[] = [];
    let ema = values[0];
    out.push(+ema.toFixed(4));
    for (let i = 1; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
        out.push(+ema.toFixed(4));
    }
    return out;
}

function buildComboChartSeries(state: ComboState): ChartSeries {
    if (state.ticks.length === 0) return { labels: [], totalSeries: [], meanSeries: [], ratio5Series: [] };

    const totalSeries = state.ticks.map(t => t.total);
    const meanSeries  = state.ticks.map(t => t.rollingMean5 ?? t.total);
    const stdSeries   = state.ticks.map(t => +(t.rollingSd5 ?? 0));
    const upperBandSeries = meanSeries.map((m, i) => +(m + (stdSeries[i] * 2)).toFixed(4));
    const lowerBandSeries = meanSeries.map((m, i) => +(Math.max(0, m - (stdSeries[i] * 2))).toFixed(4));
    const ema9Series = computeEma(totalSeries, 9);

    return {
        labels:       state.ticks.map(t => toTimeLabel(t.timestamp)),
        totalSeries,
        meanSeries,
        ratio5Series: state.ticks.map(t => t.ratio5),
        stdSeries,
        upperBandSeries,
        lowerBandSeries,
        ema9Series
    };
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

export function getDashboardData(): DashboardPayload {
    updateAllStates();

    const realtime   = {} as Record<ComboKey, RealtimeRow[]>;
    const historical = {} as Record<ComboKey, HistoricalRow[]>;

    for (const cfg of COMBOS) {
        const state        = comboStates.get(cfg.key)!;
        realtime[cfg.key]  = buildRealtimeRows(state);
        historical[cfg.key] = buildHistoricalRows(state);
    }

    const charts = {} as Record<ComboKey, ChartSeries>;
    for (const cfg of COMBOS) {
        charts[cfg.key] = buildComboChartSeries(comboStates.get(cfg.key)!);
    }

    const hourlyCharts = {} as Record<ComboKey, ChartSeries>;
    for (const cfg of COMBOS) {
        hourlyCharts[cfg.key] = buildHourlyChartSeries(cfg.key, cfg);
    }

    return {
        charts,
        hourlyCharts,
        tables: { realtime, historical },

        meta: {
            generatedAt: new Date().toISOString(),
            source: 'mock-repository-live-monitor'
        }
    };
}
