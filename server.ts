import path from 'path';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { WebSocket, WebSocketServer } from 'ws';

import dashboardRoutes from './src/routes/dashboardRoutes';
import { getDashboardData } from './src/data/dashboardData';

dotenv.config();

const app = express();
const server = http.createServer(app);
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

const dashboardWs = new WebSocketServer({ server, path: '/ws/dashboard' });

dashboardWs.on('connection', (socket) => {
    const pushData = (): void => {
        if (socket.readyState !== WebSocket.OPEN) return;

        const payload = getDashboardData();
        socket.send(
            JSON.stringify({
                type: 'dashboard-data',
                payload
            })
        );
    };

    pushData();
    const interval = setInterval(pushData, 1000);

    socket.on('close', () => {
        clearInterval(interval);
    });

    socket.on('error', () => {
        clearInterval(interval);
    });
});

server.listen(PORT, () => {
    console.log(`Dashboard corriendo en http://localhost:${PORT}`);
    console.log(`WebSocket activo en ws://localhost:${PORT}/ws/dashboard`);
});
