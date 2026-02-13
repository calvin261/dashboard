import path from 'path';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import dashboardRoutes from './src/routes/dashboardRoutes';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const APP_ROOT = process.cwd();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' }
});

app.use('/api', apiLimiter);

app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        service: 'dashboard-api',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/dashboard', dashboardRoutes);

app.use(express.static(APP_ROOT));

app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Dashboard corriendo en http://localhost:${PORT}`);
});
