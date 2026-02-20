export interface ReferenceRow {
    estado: string;
    fecha: string;
    dia: number;
    mes: number;
    anio: number;
    hora: number;
    minuto: number;
    tipoDia: string;
    transaccion: string;
    tipoCanal: string;
    promTrxXMinuto: number;
}

export interface RealtimeRow {
    fechaTrx: string;
    dia: number;
    mes: number;
    hora: number;
    minuto: number;
    trxPorMinuto: number;
    transaccion: string;
    tipoCanal: string;
}

export interface DashboardPayload {
    chart: {
        labels: string[];
        historicalSeries: number[];
        realtimeSeries: number[];
    };
    tables: {
        reference: ReferenceRow[];
        realtime: RealtimeRow[];
    };
    meta: {
        generatedAt: string;
        source: string;
    };
}

type ToleranceBand = 'ok' | 'warning' | 'critical';

const transactionCatalog = ['RETIRO', 'DEPOSITO', 'PAGO TC', 'AVANCE'];
const channelCatalog = ['ATM PRINCIPAL', 'CLIENTES ATM RED', 'ATM TERCERIZADO'];

const bandRanges: Record<ToleranceBand, { min: number; max: number }> = {
    ok: { min: -0.25, max: 0.10 },
    warning: { min: 0.11, max: 0.25 },
    critical: { min: 0.26, max: 0.55 }
};

type LivePoint = {
    timestamp: Date;
    historical: number;
    realtime: number;
    transaccion: string;
    tipoCanal: string;
};

const WINDOW_SIZE = 90;

const liveState: {
    points: LivePoint[];
    step: number;
    lastTickAt: number;
    activeBand: ToleranceBand;
    bandTicksLeft: number;
    previousRealtime: number;
} = {
    points: [],
    step: 0,
    lastTickAt: 0,
    activeBand: 'ok',
    bandTicksLeft: 0,
    previousRealtime: 0
};

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function pickRandom<T>(items: T[]): T {
    return items[randomInt(0, items.length - 1)];
}

function pickWeightedBand(): ToleranceBand {
    const roll = Math.random() * 100;
    if (roll < 62) return 'ok';
    if (roll < 88) return 'warning';
    return 'critical';
}

function toDateLabel(now: Date): string {
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function toTimeLabel(now: Date): string {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function computeHistorical(step: number): number {
    const base = 18;
    const waveFast = Math.sin(step / 5) * 6;
    const waveSlow = Math.sin(step / 19) * 4;
    const trend = Math.cos(step / 45) * 2;
    return Math.max(2, Math.round(base + waveFast + waveSlow + trend));
}

function nextBandDuration(band: ToleranceBand): number {
    if (band === 'ok') return randomInt(8, 20);
    if (band === 'warning') return randomInt(6, 14);
    return randomInt(4, 10);
}

function ensureBandCycle(): void {
    if (liveState.bandTicksLeft > 0) {
        liveState.bandTicksLeft -= 1;
        return;
    }

    liveState.activeBand = pickWeightedBand();
    liveState.bandTicksLeft = nextBandDuration(liveState.activeBand);
}

function buildRealtimeFromHistorical(historical: number): number {
    ensureBandCycle();

    const range = bandRanges[liveState.activeBand];
    const deviation = randomFloat(range.min, range.max);
    const noise = randomFloat(-0.03, 0.03);
    const target = Math.max(0, historical * (1 + deviation + noise));
    const smoothed = liveState.previousRealtime === 0
        ? target
        : (liveState.previousRealtime * 0.42) + (target * 0.58);

    const value = Math.max(0, Math.round(smoothed));
    liveState.previousRealtime = value;
    return value;
}

function pushTick(timestamp: Date): void {
    const historical = computeHistorical(liveState.step);
    const realtime = buildRealtimeFromHistorical(historical);

    liveState.points.push({
        timestamp,
        historical,
        realtime,
        transaccion: pickRandom(transactionCatalog),
        tipoCanal: pickRandom(channelCatalog)
    });

    while (liveState.points.length > WINDOW_SIZE) {
        liveState.points.shift();
    }

    liveState.step += 1;
}

function hydrateIfNeeded(now: Date): void {
    if (liveState.points.length > 0) return;

    const start = new Date(now.getTime() - ((WINDOW_SIZE - 1) * 1000));
    for (let index = 0; index < WINDOW_SIZE; index += 1) {
        const tickDate = new Date(start.getTime() + (index * 1000));
        pushTick(tickDate);
    }

    liveState.lastTickAt = now.getTime();
}

function updateLiveState(): void {
    const now = new Date();
    hydrateIfNeeded(now);

    const elapsedSeconds = Math.max(1, Math.floor((now.getTime() - liveState.lastTickAt) / 1000));

    for (let step = 0; step < elapsedSeconds; step += 1) {
        const tickDate = new Date(liveState.lastTickAt + ((step + 1) * 1000));
        pushTick(tickDate);
    }

    liveState.lastTickAt = now.getTime();
}

function buildReferenceRows(points: LivePoint[]): ReferenceRow[] {
    return points.map((point) => ({
        estado: 'DIA NORMAL',
        fecha: point.timestamp.toISOString().slice(0, 10),
        dia: point.timestamp.getDate(),
        mes: point.timestamp.getMonth() + 1,
        anio: point.timestamp.getFullYear(),
        hora: point.timestamp.getHours(),
        minuto: point.timestamp.getMinutes(),
        tipoDia: 'DIA NORMAL',
        transaccion: 'RETIRO',
        tipoCanal: 'ATM PRINCIPAL',
        promTrxXMinuto: point.historical
    }));
}

function buildRealtimeRows(points: LivePoint[]): RealtimeRow[] {
    return points.map((point) => ({
        fechaTrx: toDateLabel(point.timestamp),
        dia: point.timestamp.getDate(),
        mes: point.timestamp.getMonth() + 1,
        hora: point.timestamp.getHours(),
        minuto: point.timestamp.getMinutes(),
        trxPorMinuto: point.realtime,
        transaccion: point.transaccion,
        tipoCanal: point.tipoCanal
    }));
}

export function getDashboardData(): DashboardPayload {
    updateLiveState();

    const points = [...liveState.points];
    const labels = points.map((point) => toTimeLabel(point.timestamp));
    const historicalSeries = points.map((point) => point.historical);
    const realtimeSeries = points.map((point) => point.realtime);
    const referenceRows = buildReferenceRows(points).slice(-30);
    const realtimeRows = buildRealtimeRows(points).slice(-30);

    return {
        chart: {
            labels,
            historicalSeries,
            realtimeSeries
        },
        tables: {
            reference: referenceRows,
            realtime: realtimeRows
        },
        meta: {
            generatedAt: new Date().toISOString(),
            source: 'mock-repository-live-monitor'
        }
    };
}
