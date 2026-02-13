# Dashboard ATM moderno, seguro y escalable 📈

Este proyecto ahora usa una arquitectura lista para base de datos real:

- **Frontend desacoplado** (HTML/CSS/JS + Chart.js)
- **API backend segura** con Express
- **Capa de datos aislada** para migrar fácil a SQL Server
- **Gráfico de líneas comparativo** en un mismo eje de tiempo:
  - `promedio` (histórico)
  - `trxMin` (diario / real-time)

## ✨ Qué se mejoró

- Seguridad de API con `helmet`
- Control de tráfico con `express-rate-limit`
- CORS configurable por entorno
- Validación de parámetros con `zod`
- Logging de requests con `morgan`
- Variables de entorno con `.env`
- Frontend con estados de carga/error para mejor UX
- Auto-refresh del dashboard cada 30 segundos

## 🧱 Estructura actual

`src/data/dashboardData.js` contiene hoy un repositorio mock. Ahí mismo está el punto de extensión para DB real.

```
dashboard/
├── server.js
├── index.html
├── styles.css
├── dashboard.js
├── chart.js
├── .env
├── src/
│   ├── data/
│   │   └── dashboardData.js
│   └── routes/
│       └── dashboardRoutes.js
├── package.json
└── README.md
```

## 🚀 Ejecutar

1) Instalar dependencias

2) Levantar servidor

- Modo normal: `npm start`
- Modo desarrollo: `npm run dev`

Abrir: `http://localhost:3000`

## 🔌 API disponible

- `GET /api/health`
- `GET /api/dashboard/data`
  - Query opcional: `includeTables=true|false`

Respuesta principal:

- `chart.labels`
- `chart.historicalSeries`
- `chart.realtimeSeries`
- `tables.reference`
- `tables.realtime`

## 🗃️ Cómo migrar a base de datos real (SQL Server)

1. Crear tabla histórica y tabla diaria (o una tabla particionada por tipo)
2. Mantener el contrato de salida del endpoint (`chart`, `tables`, `meta`)
3. Reemplazar en `src/data/dashboardData.js`:
   - `getDashboardData()` mock
   - por consultas SQL + agregaciones por minuto
4. Conservar `dashboard.js` en frontend sin cambios (ya está desacoplado)

### Contrato mínimo esperado por el frontend

```json
{
  "chart": {
    "labels": ["00:00", "00:01"],
    "historicalSeries": [4, 3],
    "realtimeSeries": [0, 12]
  },
  "tables": {
    "reference": [],
    "realtime": []
  },
  "meta": {
    "generatedAt": "2026-02-13T00:00:00.000Z"
  }
}
```

## 🔐 Variables de entorno

Archivo `.env`:

- `PORT=3000`
- `CORS_ORIGIN=*`
- `USE_SQL_SERVER=false`
- `SQLSERVER_HOST=localhost`
- `SQLSERVER_PORT=1433`
- `SQLSERVER_DATABASE=dashboard`
- `SQLSERVER_USER=sa`
- `SQLSERVER_PASSWORD=TU_PASSWORD_AQUI`
- `SQLSERVER_ENCRYPT=false`
- `SQLSERVER_TRUST_CERT=true`

Para producción, reemplaza `*` por el dominio frontend permitido.

Si quieres verificar conexión SQL Server rápido, define `USE_SQL_SERVER=true` y consulta:

- `GET /api/health`

La respuesta incluye un objeto `db` con `enabled`, `connected` y `message`.

## 📄 Licencia

ISC