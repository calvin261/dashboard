import { z } from 'zod';

import { getDashboardData } from '../../src/data/dashboardData';

const querySchema = z.object({
    includeTables: z.enum(['true', 'false']).optional()
});

export default function handler(req: any, res: any): void {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método no permitido' });
        return;
    }

    const parsedQuery = querySchema.safeParse(req.query ?? {});

    if (!parsedQuery.success) {
        res.status(400).json({
            error: 'Parámetros inválidos',
            details: parsedQuery.error.flatten()
        });
        return;
    }

    const includeTables = parsedQuery.data.includeTables !== 'false';
    const data = getDashboardData();

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        charts: data.charts,
        hourlyCharts: data.hourlyCharts,
        tables: includeTables ? data.tables : undefined,
        meta: data.meta
    });
}
