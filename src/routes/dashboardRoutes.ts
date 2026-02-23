import { Request, Response, Router } from 'express';
import { z } from 'zod';

import { getDashboardData } from '../data/dashboardData';

const router = Router();

const querySchema = z.object({
    includeTables: z.enum(['true', 'false']).optional()
});

router.get('/data', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const parsedQuery = querySchema.safeParse(req.query);

    if (!parsedQuery.success) {
        return res.status(400).json({
            error: 'Parámetros inválidos',
            details: parsedQuery.error.flatten()
        });
    }

    const includeTables = parsedQuery.data.includeTables !== 'false';
    const data = getDashboardData();

    return res.json({
        charts: data.charts,
        hourlyCharts: data.hourlyCharts,
        tables: includeTables ? data.tables : undefined,
        meta: data.meta
    });
});

export default router;
