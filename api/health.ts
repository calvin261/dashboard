export default function handler(_req: any, res: any): void {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        status: 'ok',
        service: 'dashboard-api-vercel',
        timestamp: new Date().toISOString()
    });
}
