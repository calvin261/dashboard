# Dashboard Corporativo Profesional 📊

Dashboard de nivel profesional corporativo con gráfico de líneas en tiempo real que se actualiza automáticamente cada minuto, alimentado por tres tablas de datos de diferentes departamentos.

![Dashboard Preview](https://github.com/user-attachments/assets/ed29a40d-368d-4c0a-ba03-2e125aff37c3)

## 🌟 Características

- **Gráfico de Líneas en Tiempo Real**: Visualización prominente de tendencias de 3 fuentes de datos
- **Actualización Automática**: Los datos se actualizan cada 60 segundos
- **Tres Tablas de Datos**: 
  - Departamento de Ventas
  - Departamento de Producción
  - Departamento de Logística
- **Indicadores de Variación**: Muestra aumentos (↑), disminuciones (↓) y sin cambios (—) con código de colores
- **Diseño Responsivo**: Funciona perfectamente en desktop, tablet y móvil
- **Tema Profesional**: Diseño moderno con tema oscuro y degradados azules

## 🚀 Inicio Rápido

### Opción 1: Abrir directamente
Simplemente abre el archivo `index.html` en tu navegador web.

### Opción 2: Usar un servidor HTTP
```bash
# Con Python 3
python3 -m http.server 8080

# Con Node.js (si tienes http-server instalado)
npx http-server -p 8080
```

Luego abre `http://localhost:8080/index.html` en tu navegador.

## 📁 Estructura del Proyecto

```
dashboard/
├── index.html        # Estructura HTML del dashboard
├── styles.css        # Estilos CSS profesionales
├── dashboard.js      # Lógica de actualización y gestión de datos
├── chart.js          # Librería Chart.js para gráficos
├── package.json      # Configuración de npm
└── README.md         # Este archivo
```

## 🔧 Tecnologías Utilizadas

- **HTML5**: Estructura semántica
- **CSS3**: Estilos modernos con variables CSS y animaciones
- **JavaScript (ES6+)**: Lógica de aplicación orientada a objetos
- **Chart.js**: Librería de gráficos profesional

## 📊 Cómo Funciona

1. **Inicialización**: Al cargar la página, se generan 10 puntos de datos históricos
2. **Visualización**: El gráfico de líneas muestra las tendencias de los 3 departamentos
3. **Tablas**: Cada tabla muestra los últimos 5 registros con variaciones
4. **Actualización Automática**: Cada 60 segundos:
   - Se genera un nuevo punto de datos para cada departamento
   - El gráfico se actualiza con los nuevos valores
   - Las tablas se actualizan mostrando las variaciones
   - El timestamp se actualiza

## 🎨 Personalización

### Cambiar el Intervalo de Actualización
En `dashboard.js`, modifica la línea:
```javascript
this.updateInterval = 60000; // 60 segundos (1 minuto)
```

### Cambiar Colores
En `styles.css`, modifica las variables CSS:
```css
:root {
    --primary-color: #1e40af;
    --secondary-color: #3b82f6;
    /* ... más colores ... */
}
```

### Cambiar Número de Puntos en el Gráfico
En `dashboard.js`, modifica:
```javascript
this.maxDataPoints = 10; // Número de puntos visibles
```

## 📱 Compatibilidad

- ✅ Chrome/Edge (últimas versiones)
- ✅ Firefox (últimas versiones)
- ✅ Safari (últimas versiones)
- ✅ Dispositivos móviles (responsive design)

## 🔮 Próximas Mejoras

- Conexión a APIs reales para datos en vivo
- Exportación de datos a CSV/Excel
- Más tipos de gráficos (barras, pastel, etc.)
- Dashboard de configuración
- Filtros de fecha/hora
- Notificaciones de alertas

## 📄 Licencia

ISC

## 👨‍💻 Desarrollo

Para instalar las dependencias de desarrollo:
```bash
npm install
```

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request para sugerencias o mejoras.

---

Desarrollado con ❤️ para crear dashboards corporativos de nivel profesional