export interface ReferenceRow {
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

export interface RealtimeRow {
    fecha: string;
    dia: number;
    mes: number;
    hora: string;
    trxMin: number;
    transaccion: string;
    canal: string;
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

const referenceData: ReferenceRow[] = [
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:00', promedio: 1 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:00', promedio: 3 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:01', promedio: 2 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'CLIENTES PRODUBANCO ATM RED', hora: '00:01', promedio: 1 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'CLIENTES PRODUBANCO ATM RED', hora: '00:02', promedio: 1 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'CLIENTES PRODUBANCO ATM RED', hora: '00:03', promedio: 1 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'PAGO TC', canal: 'ATM PRODUBANCO', hora: '00:03', promedio: 1 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:04', promedio: 5 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'CLIENTES PRODUBANCO ATM RED', hora: '00:04', promedio: 2 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:04', promedio: 1 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:05', promedio: 2 },
    { estado: 'DIA NORMAL', fecha: '2025-10-01', tipoDia: 'DIA NORMAL', dia: 1, mes: 10, anio: 2025, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO', hora: '00:06', promedio: 5 }
];

const realTimeData: RealtimeRow[] = [
    { fecha: '12-02-2026 08:54', dia: 12, mes: 2, hora: '08:54', trxMin: 2, transaccion: 'DEPOSITO', canal: 'ATM PRODUBANCO' },
    { fecha: '12-02-2026 08:54', dia: 12, mes: 2, hora: '08:54', trxMin: 35, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO' },
    { fecha: '12-02-2026 08:54', dia: 12, mes: 2, hora: '08:54', trxMin: 12, transaccion: 'RETIRO', canal: 'CLIENTES PRODUBANCO ATM RED' },
    { fecha: '10-02-2026 16:41', dia: 10, mes: 2, hora: '16:41', trxMin: 1, transaccion: 'AVANCE', canal: 'ATM PRODUBANCO' },
    { fecha: '10-02-2026 16:41', dia: 10, mes: 2, hora: '16:41', trxMin: 7, transaccion: 'DEPOSITO', canal: 'ATM PRODUBANCO' },
    { fecha: '10-02-2026 16:41', dia: 10, mes: 2, hora: '16:41', trxMin: 71, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO' },
    { fecha: '10-02-2026 16:41', dia: 10, mes: 2, hora: '16:41', trxMin: 2, transaccion: 'RETIRO', canal: 'ATM SERVIPAGOS' },
    { fecha: '10-02-2026 16:41', dia: 10, mes: 2, hora: '16:41', trxMin: 16, transaccion: 'RETIRO', canal: 'CLIENTES PRODUBANCO ATM RED' },
    { fecha: '09-02-2026 17:16', dia: 9, mes: 2, hora: '17:16', trxMin: 1, transaccion: 'AVANCE', canal: 'ATM PRODUBANCO' },
    { fecha: '09-02-2026 17:16', dia: 9, mes: 2, hora: '17:16', trxMin: 6, transaccion: 'DEPOSITO', canal: 'ATM PRODUBANCO' },
    { fecha: '09-02-2026 17:16', dia: 9, mes: 2, hora: '17:16', trxMin: 1, transaccion: 'PAGO TC', canal: 'ATM PRODUBANCO' },
    { fecha: '09-02-2026 17:16', dia: 9, mes: 2, hora: '17:16', trxMin: 94, transaccion: 'RETIRO', canal: 'ATM PRODUBANCO' }
];

function aggregateByTime<T extends { hora: string }>(data: T[], valueSelector: (item: T) => number): Record<string, number> {
    const byTime: Record<string, number> = {};

    for (const item of data) {
        const time = item.hora;
        byTime[time] = (byTime[time] || 0) + valueSelector(item);
    }

    return byTime;
}

export function getDashboardData(): DashboardPayload {
    const historicalByTime = aggregateByTime(referenceData, (item) => item.promedio);
    const realTimeByTime = aggregateByTime(realTimeData, (item) => item.trxMin);

    const labels = Array.from(new Set([...Object.keys(historicalByTime), ...Object.keys(realTimeByTime)])).sort();

    return {
        chart: {
            labels,
            historicalSeries: labels.map((time) => historicalByTime[time] || 0),
            realtimeSeries: labels.map((time) => realTimeByTime[time] || 0)
        },
        tables: {
            reference: referenceData,
            realtime: realTimeData
        },
        meta: {
            generatedAt: new Date().toISOString(),
            source: 'mock-repository'
        }
    };
}
