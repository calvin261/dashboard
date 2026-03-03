import sql, { config as SqlConfig, ConnectionPool } from 'mssql';

let poolPromise: Promise<ConnectionPool> | undefined;

function toBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
}

export function isSqlServerEnabled(): boolean {
    return String(process.env.USE_SQL_SERVER || 'false').toLowerCase() === 'true';
}

function getSqlServerConfigFromEnv(): SqlConfig {
    const server = process.env.SQLSERVER_HOST;
    const database = process.env.SQLSERVER_DATABASE;
    const user = process.env.SQLSERVER_USER;
    const password = process.env.SQLSERVER_PASSWORD;

    if (!server || !database || !user || !password) {
        throw new Error(
            'Faltan variables de entorno de SQL Server. Revisa SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USER y SQLSERVER_PASSWORD.'
        );
    }

    return {
        server,
        database,
        user,
        password,
        port: Number(process.env.SQLSERVER_PORT || 1433),
        options: {
            encrypt: toBoolean(process.env.SQLSERVER_ENCRYPT, false),
            trustServerCertificate: toBoolean(process.env.SQLSERVER_TRUST_CERT, true)
        },
        pool: {
            min: 0,
            max: 10,
            idleTimeoutMillis: 30000
        }
    };
}

export async function getSqlServerPool(): Promise<ConnectionPool | null> {
    if (!isSqlServerEnabled()) {
        return null;
    }

    if (!poolPromise) {
        const config = getSqlServerConfigFromEnv();
        poolPromise = new sql.ConnectionPool(config)
            .connect()
            .catch((error: unknown) => {
                poolPromise = undefined;
                throw error;
            });
    }

    return poolPromise;
}

// ─── REAL-TIME QUERY ────────────────────────────────────────────────────────

export interface RealtimeTotalRow {
    tipoCanal: string;
    transaccion: string;
    total: number;
}

/**
 * Fetches the transaction totals for the last 10 seconds from the given table/view.
 * Groups by TIPO_CANAL + TRANSACCION and sums TOTAL.
 * Returns an empty array if SQL Server is disabled or unreachable.
 */
export async function fetchRealtimeTotals(
    tableName: string = process.env.SQLSERVER_REALTIME_TABLE ?? 'V_TIEMPO_REAL'
): Promise<RealtimeTotalRow[]> {
    const pool = await getSqlServerPool();
    if (!pool) return [];

    const result = await pool.request().query(`
        SELECT
            TIPO_CANAL    AS tipoCanal,
            TRANSACCION   AS transaccion,
            SUM(TOTAL)    AS total
        FROM ${tableName}
        WHERE FECHA_TRX >= DATEADD(SECOND, -10, GETDATE())
          AND MODELO = 'TIEMPO REAL'
        GROUP BY TIPO_CANAL, TRANSACCION
    `);

    return (result.recordset as any[]).map(row => ({
        tipoCanal:   String(row.tipoCanal   ?? '').trim(),
        transaccion: String(row.transaccion ?? '').trim(),
        total:       Number(row.total       ?? 0)
    }));
}

export async function testSqlServerConnection(): Promise<{
    enabled: boolean;
    connected: boolean;
    message: string;
}> {
    if (!isSqlServerEnabled()) {
        return {
            enabled: false,
            connected: false,
            message: 'SQL Server deshabilitado (USE_SQL_SERVER=false).'
        };
    }

    try {
        const pool = await getSqlServerPool();

        if (!pool) {
            return {
                enabled: true,
                connected: false,
                message: 'No se pudo inicializar el pool SQL Server.'
            };
        }

        await pool.request().query('SELECT 1 AS ok');

        return {
            enabled: true,
            connected: true,
            message: 'Conexión SQL Server exitosa.'
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido al conectar SQL Server.';

        return {
            enabled: true,
            connected: false,
            message: `Error de conexión SQL Server: ${message}`
        };
    }
}
