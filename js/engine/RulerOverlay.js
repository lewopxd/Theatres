// ============================================================
// RulerOverlay — Motor autónomo de reglas CAD para vistas 2D
// 100% independiente: no importa State, EventBus, CameraManager
// ni ningún otro módulo del proyecto.
// ============================================================

// ────────────────────────────────────────────────────────────
// CONFIGURACIÓN INTERNA (editable aquí o vía configure())
// ────────────────────────────────────────────────────────────
const RULER_CONFIG = {
    // Dimensiones
    rulerThickness: 24,
    cornerSize: 24,

    // Texto
    fontSize: 10,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontWeight: '400',

    // Ticks
    majorTickLength: 10,
    minorTickLength: 5,
    microTickLength: 3,
    tickWidth: 1,

    // Espaciado adaptativo
    minTickSpacing: 50,
    maxTickSpacing: 150,

    // Colores (tema oscuro minimalista)
    bgColor: 'rgba(30, 30, 30, 0.95)',
    borderColor: 'rgba(60, 60, 60, 0.8)',
    tickColor: 'rgba(160, 160, 160, 0.7)',
    textColor: 'rgba(180, 180, 180, 0.85)',
    cornerBgColor: 'rgba(37, 37, 38, 0.95)',

    // Indicador de cursor (complementario de --accent #007acc)
    cursorIndicatorColor: '#cc4d00',
    cursorIndicatorWidth: 1,
    cursorIndicatorOpacity: 0.85,
    cursorLabelBg: 'rgba(204, 77, 0, 0.9)',
    cursorLabelTextColor: '#ffffff',
    cursorLabelFontSize: 9,
    cursorLabelPaddingH: 4,
    cursorLabelPaddingV: 2,

    // Unidad de medida
    unit: 'm',
    decimals: 2,
};

// ────────────────────────────────────────────────────────────
// MAPEO DE EJES POR VISTA
// ────────────────────────────────────────────────────────────
// Para cada vista ortográfica, la regla horizontal y vertical
// representan ejes del mundo 3D diferentes.
// hAxis / vAxis: qué eje del mundo corresponde
// hFlip / vFlip: si el eje va invertido en pantalla
//
// Cámara ortográfica: left/right → eje horizontal mundo,
// bottom/top → eje vertical mundo.
// El mapeo depende de la orientación de la cámara.
const VIEW_AXIS_MAP = {
    top: { hLabel: 'X', vLabel: 'Z', vFlip: false },
    bottom: { hLabel: 'X', vLabel: 'Z', vFlip: true },
    front: { hLabel: 'X', vLabel: 'Y', vFlip: false },
    left: { hLabel: 'Z', vLabel: 'Y', vFlip: false },
    right: { hLabel: 'Z', vLabel: 'Y', vFlip: true },
};

// ────────────────────────────────────────────────────────────
// NICE-STEP: secuencia de intervalos "bonitos" para ticks
// ────────────────────────────────────────────────────────────
const NICE_STEPS = [
    0.001, 0.002, 0.005,
    0.01, 0.02, 0.05,
    0.1, 0.2, 0.25, 0.5,
    1, 2, 2.5, 5,
    10, 20, 25, 50,
    100, 200, 250, 500,
    1000,
];

function pickNiceStep(worldPerPx, minPx, maxPx) {
    // worldPerPx: cuántas unidades mundo cubre 1 pixel
    // Queremos que el step en mundo sea tal que step / worldPerPx ∈ [minPx, maxPx]
    for (let i = 0; i < NICE_STEPS.length; i++) {
        const pxPerStep = NICE_STEPS[i] / worldPerPx;
        if (pxPerStep >= minPx && pxPerStep <= maxPx) {
            return NICE_STEPS[i];
        }
    }
    // Fallback: el más grande que quepa
    for (let i = NICE_STEPS.length - 1; i >= 0; i--) {
        const pxPerStep = NICE_STEPS[i] / worldPerPx;
        if (pxPerStep >= minPx) return NICE_STEPS[i];
    }
    return 1;
}

/**
 * Elige cuántas subdivisiones usar para un major step.
 * Devuelve la cantidad de subdivisiones menores.
 */
function getSubdivisions(majorStep) {
    // Normaliza a la mantisa (e.g., 0.25 → 2.5, 50 → 5)
    let m = majorStep;
    while (m >= 10) m /= 10;
    while (m < 1) m *= 10;
    // 1 → 10 subs, 2 → 4 subs, 2.5 → 5 subs, 5 → 5 subs
    if (Math.abs(m - 1) < 0.01) return 10;
    if (Math.abs(m - 2) < 0.01) return 4;
    if (Math.abs(m - 2.5) < 0.01) return 5;
    if (Math.abs(m - 5) < 0.01) return 5;
    return 5;
}

// ────────────────────────────────────────────────────────────
// FORMATO NUMÉRICO
// ────────────────────────────────────────────────────────────
function formatValue(val, decimals) {
    // Evitar -0
    if (Math.abs(val) < 1e-10) val = 0;
    // Usar la menor cantidad de decimales necesaria
    const fixed = val.toFixed(decimals);
    // Quitar trailing zeros innecesarios
    if (fixed.includes('.')) {
        return fixed.replace(/\.?0+$/, '');
    }
    return fixed;
}

// ────────────────────────────────────────────────────────────
// ESTADO INTERNO DEL MOTOR
// ────────────────────────────────────────────────────────────
let canvas = null;
let ctx = null;
let containerRef = null;
let resizeObserver = null;
let dprMediaQuery = null;
let dprListener = null;

let canvasW = 0;   // CSS logical pixels
let canvasH = 0;
let dpr = 1;

let visible = false;
let dirty = true;
let rafId = null;

// Datos de cámara (modo single)
let cameraData = null;  // { left, right, top, bottom, zoom }
let viewMode = null;     // 'top' | 'bottom' | 'left' | 'right' | 'front'

// Datos de cámara (modo split)
let splitData = null;    // array de quadrants

// Posición del mouse
let mouseX = -1;
let mouseY = -1;
let mouseInside = false;

// ────────────────────────────────────────────────────────────
// DRAWING HELPERS
// ────────────────────────────────────────────────────────────

/**
 * Dibuja una regla horizontal (borde superior del viewport).
 * @param {number} x0 — pixel x inicio de la zona del viewport
 * @param {number} y0 — pixel y inicio del viewport (top)
 * @param {number} vpW — ancho del viewport en px
 * @param {number} vpH — alto del viewport en px
 * @param {Object} cam — { left, right, top, bottom, zoom }
 * @param {string} mode — view mode
 */
function drawRulerH(x0, y0, vpW, vpH, cam, mode) {
    const cfg = RULER_CONFIG;
    const t = cfg.rulerThickness;
    const cs = cfg.cornerSize;

    // Fondo de la regla horizontal
    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(x0 + cs, y0, vpW - cs, t);

    // Borde inferior
    ctx.fillStyle = cfg.borderColor;
    ctx.fillRect(x0 + cs, y0 + t - 1, vpW - cs, 1);

    // Calcular rango mundo visible
    const worldLeft = cam.left / cam.zoom;
    const worldRight = cam.right / cam.zoom;
    const worldRange = worldRight - worldLeft;
    if (worldRange <= 0 || !isFinite(worldRange)) return;

    const viewportW = vpW - cs; // ancho usable (sin esquina)
    const worldPerPx = worldRange / viewportW;

    // Elegir step
    const majorStep = pickNiceStep(worldPerPx, cfg.minTickSpacing, cfg.maxTickSpacing);
    const subs = getSubdivisions(majorStep);
    const minorStep = majorStep / subs;

    // Obtener mapeo de ejes
    const axisInfo = VIEW_AXIS_MAP[mode];
    if (!axisInfo) return;

    // Dibujar ticks
    const firstMajor = Math.floor(worldLeft / majorStep) * majorStep;
    const lastWorld = worldRight;

    ctx.save();
    // Clip a la zona de la regla (sin esquina)
    ctx.beginPath();
    ctx.rect(x0 + cs, y0, viewportW, t);
    ctx.clip();

    // Ticks menores y mayores
    for (let w = firstMajor - majorStep; w <= lastWorld + majorStep; w += minorStep) {
        // Posición pixel
        const frac = (w - worldLeft) / worldRange;
        const px = x0 + cs + frac * viewportW;

        if (px < x0 + cs || px > x0 + cs + viewportW) continue;

        // ¿Es un tick mayor?
        const isMajor = Math.abs(w / majorStep - Math.round(w / majorStep)) < 1e-9;

        const tickLen = isMajor ? cfg.majorTickLength : cfg.microTickLength;
        ctx.fillStyle = cfg.tickColor;
        ctx.fillRect(Math.round(px), y0 + t - tickLen, cfg.tickWidth, tickLen);

        // Etiqueta en ticks mayores
        if (isMajor) {
            const label = formatValue(w, cfg.decimals);
            ctx.fillStyle = cfg.textColor;
            ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${cfg.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, Math.round(px), y0 + 2);
        }
    }

    ctx.restore();
}

/**
 * Dibuja una regla vertical (borde izquierdo del viewport).
 */
function drawRulerV(x0, y0, vpW, vpH, cam, mode) {
    const cfg = RULER_CONFIG;
    const t = cfg.rulerThickness;
    const cs = cfg.cornerSize;

    // Fondo
    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(x0, y0 + cs, t, vpH - cs);

    // Borde derecho
    ctx.fillStyle = cfg.borderColor;
    ctx.fillRect(x0 + t - 1, y0 + cs, 1, vpH - cs);

    // Rango mundo vertical
    const worldTop = cam.top / cam.zoom;
    const worldBottom = cam.bottom / cam.zoom;
    const worldRange = worldTop - worldBottom; // positivo hacia arriba
    if (worldRange <= 0 || !isFinite(worldRange)) return;

    const axisInfo = VIEW_AXIS_MAP[mode];
    if (!axisInfo) return;

    const viewportH = vpH - cs;
    const worldPerPx = worldRange / viewportH;

    const majorStep = pickNiceStep(worldPerPx, cfg.minTickSpacing, cfg.maxTickSpacing);
    const subs = getSubdivisions(majorStep);
    const minorStep = majorStep / subs;

    // vFlip: si es true, el eje mundo crece en dirección opuesta
    const vFlip = axisInfo.vFlip;

    const firstMajor = Math.floor(worldBottom / majorStep) * majorStep;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0 + cs, t, viewportH);
    ctx.clip();

    for (let w = firstMajor - majorStep; w <= worldTop + majorStep; w += minorStep) {
        // Fracción: 0 = worldTop (pantalla arriba), 1 = worldBottom (pantalla abajo)
        let frac = (worldTop - w) / worldRange;
        if (vFlip) frac = 1 - frac;

        const py = y0 + cs + frac * viewportH;

        if (py < y0 + cs || py > y0 + cs + viewportH) continue;

        const isMajor = Math.abs(w / majorStep - Math.round(w / majorStep)) < 1e-9;
        const tickLen = isMajor ? cfg.majorTickLength : cfg.microTickLength;

        ctx.fillStyle = cfg.tickColor;
        ctx.fillRect(x0 + t - tickLen, Math.round(py), tickLen, cfg.tickWidth);

        if (isMajor) {
            const label = formatValue(w, cfg.decimals);
            ctx.save();
            ctx.fillStyle = cfg.textColor;
            ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${cfg.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.translate(x0 + t / 2, Math.round(py));
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(label, 0, -2);
            ctx.restore();
        }
    }

    ctx.restore();
}

/**
 * Dibuja el cuadrado de esquina (unidad de medida).
 */
function drawCorner(x0, y0) {
    const cfg = RULER_CONFIG;
    const cs = cfg.cornerSize;

    ctx.fillStyle = cfg.cornerBgColor;
    ctx.fillRect(x0, y0, cs, cs);

    // Bordes
    ctx.fillStyle = cfg.borderColor;
    ctx.fillRect(x0 + cs - 1, y0, 1, cs); // derecho
    ctx.fillRect(x0, y0 + cs - 1, cs, 1); // inferior

    // Unidad
    ctx.fillStyle = cfg.textColor;
    ctx.font = `${cfg.fontWeight} ${cfg.fontSize - 1}px ${cfg.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.unit, x0 + cs / 2, y0 + cs / 2);
}

/**
 * Dibuja el indicador de cursor en las reglas.
 */
function drawCursorIndicator(x0, y0, vpW, vpH, cam, mode, localMouseX, localMouseY) {
    const cfg = RULER_CONFIG;
    const t = cfg.rulerThickness;
    const cs = cfg.cornerSize;

    if (localMouseX < 0 || localMouseY < 0) return;
    if (localMouseX > vpW || localMouseY > vpH) return;

    const axisInfo = VIEW_AXIS_MAP[mode];
    if (!axisInfo) return;

    const worldLeft = cam.left / cam.zoom;
    const worldRight = cam.right / cam.zoom;
    const worldTop = cam.top / cam.zoom;
    const worldBottom = cam.bottom / cam.zoom;
    const worldRangeH = worldRight - worldLeft;
    const worldRangeV = worldTop - worldBottom;

    if (worldRangeH <= 0 || worldRangeV <= 0) return;

    ctx.save();
    ctx.globalAlpha = cfg.cursorIndicatorOpacity;

    // ── Indicador horizontal ──
    if (localMouseX > cs) {
        const viewportW = vpW - cs;
        const fracH = (localMouseX - cs) / viewportW;
        const worldValH = worldLeft + fracH * worldRangeH;
        const px = x0 + localMouseX;

        // Línea vertical en la regla horizontal
        ctx.fillStyle = cfg.cursorIndicatorColor;
        ctx.fillRect(Math.round(px), y0, cfg.cursorIndicatorWidth, t);

        // Triángulo indicador
        const triSize = 4;
        ctx.beginPath();
        ctx.moveTo(Math.round(px), y0 + t);
        ctx.lineTo(Math.round(px) - triSize, y0 + t - triSize);
        ctx.lineTo(Math.round(px) + triSize, y0 + t - triSize);
        ctx.closePath();
        ctx.fill();

        // Label con coordenada
        const labelText = formatValue(worldValH, cfg.decimals);
        ctx.font = `${cfg.fontWeight} ${cfg.cursorLabelFontSize}px ${cfg.fontFamily}`;
        const metrics = ctx.measureText(labelText);
        const labelW = metrics.width + cfg.cursorLabelPaddingH * 2;
        const labelH = cfg.cursorLabelFontSize + cfg.cursorLabelPaddingV * 2;

        // Posicionar label centrado sobre el indicador, clamped a los bordes
        let labelX = Math.round(px) - labelW / 2;
        labelX = Math.max(x0 + cs + 1, Math.min(labelX, x0 + vpW - labelW - 1));
        const labelY = y0 + t - labelH - triSize - 1;

        ctx.fillStyle = cfg.cursorLabelBg;
        roundRect(ctx, labelX, labelY, labelW, labelH, 3);
        ctx.fill();

        ctx.fillStyle = cfg.cursorLabelTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelX + labelW / 2, labelY + labelH / 2);
    }

    // ── Indicador vertical ──
    if (localMouseY > cs) {
        const viewportH = vpH - cs;
        const fracV = (localMouseY - cs) / viewportH;
        // Convertir fracción de pantalla a valor mundo
        // frac=0 → worldTop, frac=1 → worldBottom (si no hay flip)
        const vFlip = axisInfo.vFlip;
        let worldValV;
        if (vFlip) {
            worldValV = worldBottom + fracV * worldRangeV;
        } else {
            worldValV = worldTop - fracV * worldRangeV;
        }

        const py = y0 + localMouseY;

        // Línea horizontal en la regla vertical
        ctx.fillStyle = cfg.cursorIndicatorColor;
        ctx.fillRect(x0, Math.round(py), t, cfg.cursorIndicatorWidth);

        // Triángulo indicador
        const triSize = 4;
        ctx.beginPath();
        ctx.moveTo(x0 + t, Math.round(py));
        ctx.lineTo(x0 + t - triSize, Math.round(py) - triSize);
        ctx.lineTo(x0 + t - triSize, Math.round(py) + triSize);
        ctx.closePath();
        ctx.fill();

        // Label
        const labelText = formatValue(worldValV, cfg.decimals);
        ctx.font = `${cfg.fontWeight} ${cfg.cursorLabelFontSize}px ${cfg.fontFamily}`;
        const metrics = ctx.measureText(labelText);
        const labelW = metrics.width + cfg.cursorLabelPaddingH * 2;
        const labelH = cfg.cursorLabelFontSize + cfg.cursorLabelPaddingV * 2;

        // Rotado para la regla vertical
        let labelY = Math.round(py) - labelW / 2;
        labelY = Math.max(y0 + cs + 1, Math.min(labelY, y0 + vpH - labelW - 1));
        const labelX = x0 + 1;

        ctx.save();
        ctx.translate(labelX + labelH / 2, labelY + labelW / 2);
        ctx.rotate(-Math.PI / 2);

        ctx.fillStyle = cfg.cursorLabelBg;
        roundRect(ctx, -labelW / 2, -labelH / 2, labelW, labelH, 3);
        ctx.fill();

        ctx.fillStyle = cfg.cursorLabelTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
    }

    ctx.restore();
}

/**
 * Helper: rectángulo redondeado.
 */
function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
}

// ────────────────────────────────────────────────────────────
// RENDER COMPLETO
// ────────────────────────────────────────────────────────────
function render() {
    if (!ctx || !canvas) return;

    // Limpiar todo el canvas overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!visible) return;

    // Aplicar DPR scaling
    ctx.save();
    ctx.scale(dpr, dpr);

    if (splitData && splitData.length > 0) {
        // Modo split: dibujar reglas para cada cuadrante (excepto ortho)
        for (const quad of splitData) {
            if (quad.viewMode === 'ortho') continue;
            if (!quad.cameraData) continue;

            const qx = quad.left;
            const qy = quad.top;
            const qw = quad.width;
            const qh = quad.height;

            // Mouse local al cuadrante
            const localMX = mouseInside ? mouseX - qx : -1;
            const localMY = mouseInside ? mouseY - qy : -1;
            const mouseInQuad = localMX >= 0 && localMY >= 0 && localMX <= qw && localMY <= qh;

            drawRulerH(qx, qy, qw, qh, quad.cameraData, quad.viewMode);
            drawRulerV(qx, qy, qw, qh, quad.cameraData, quad.viewMode);
            drawCorner(qx, qy);

            if (mouseInQuad) {
                drawCursorIndicator(qx, qy, qw, qh, quad.cameraData, quad.viewMode, localMX, localMY);
            }
        }
    } else if (cameraData && viewMode && viewMode !== 'ortho') {
        // Modo single
        drawRulerH(0, 0, canvasW, canvasH, cameraData, viewMode);
        drawRulerV(0, 0, canvasW, canvasH, cameraData, viewMode);
        drawCorner(0, 0);

        if (mouseInside) {
            drawCursorIndicator(0, 0, canvasW, canvasH, cameraData, viewMode, mouseX, mouseY);
        }
    }

    ctx.restore();
}

// ────────────────────────────────────────────────────────────
// RAF LOOP CON DIRTY FLAG
// ────────────────────────────────────────────────────────────
function rafLoop() {
    if (dirty) {
        dirty = false;
        render();
    }
    rafId = requestAnimationFrame(rafLoop);
}

function startLoop() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(rafLoop);
}

function stopLoop() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

function markDirty() {
    dirty = true;
}

// ────────────────────────────────────────────────────────────
// RESIZE HANDLING
// ────────────────────────────────────────────────────────────
function handleResize() {
    if (!containerRef || !canvas) return;

    const rect = containerRef.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w === canvasW && h === canvasH && dpr === (window.devicePixelRatio || 1)) return;

    dpr = window.devicePixelRatio || 1;
    canvasW = w;
    canvasH = h;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    markDirty();
}

function handleDprChange() {
    // DPR changed (e.g., moved window between monitors)
    if (dprMediaQuery) {
        dprMediaQuery.removeEventListener('change', dprListener);
    }
    dpr = window.devicePixelRatio || 1;
    dprMediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    dprListener = handleDprChange;
    dprMediaQuery.addEventListener('change', dprListener);

    handleResize();
}

// ────────────────────────────────────────────────────────────
// MOUSE EVENT HANDLERS (registrados en el container)
// ────────────────────────────────────────────────────────────
function onMouseMove(e) {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    mouseInside = true;
    markDirty();
}

function onMouseLeave() {
    mouseInside = false;
    mouseX = -1;
    mouseY = -1;
    markDirty();
}

// ────────────────────────────────────────────────────────────
// API PÚBLICA
// ────────────────────────────────────────────────────────────
export const RulerOverlay = {
    /**
     * Inicializa el motor de reglas. Crea el canvas overlay dentro del container.
     * @param {HTMLElement} container — el wrapper que contiene el canvas 3D
     */
    init(container) {
        if (canvas) this.dispose(); // Limpiar si ya existe

        containerRef = container;

        // Buscar canvas existente o crear uno nuevo
        canvas = container.querySelector('#ruler-overlay');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'ruler-overlay';
            container.appendChild(canvas);
        }

        ctx = canvas.getContext('2d');

        // Tamaño inicial
        handleResize();

        // ResizeObserver
        resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(container);

        // DPR change detection
        handleDprChange();

        // Mouse events en el container (no en el canvas overlay porque es pointer-events:none)
        container.addEventListener('pointermove', onMouseMove);
        container.addEventListener('pointerleave', onMouseLeave);

        // Iniciar loop
        startLoop();
    },

    /**
     * Actualiza parcialmente la configuración.
     * @param {Object} overrides — subset de RULER_CONFIG
     */
    configure(overrides) {
        if (!overrides) return;
        Object.assign(RULER_CONFIG, overrides);
        markDirty();
    },

    /**
     * Actualiza datos de la cámara ortográfica (modo single view).
     * @param {{ left: number, right: number, top: number, bottom: number, zoom: number }} data
     * @param {string} mode — 'top'|'bottom'|'left'|'right'|'front'
     */
    setCameraData(data, mode) {
        cameraData = data;
        viewMode = mode;
        splitData = null; // Limpiar split
        markDirty();
    },

    /**
     * Actualiza datos para vista dividida (split mode).
     * @param {Array<{left:number, top:number, width:number, height:number, cameraData:Object, viewMode:string}>} quadrants
     *   Cada quadrant tiene: left, top, width, height en px del container; cameraData; viewMode
     */
    setSplitData(quadrants) {
        splitData = quadrants;
        cameraData = null;
        viewMode = null;
        markDirty();
    },

    /**
     * Actualiza la posición del mouse (en coordenadas del container).
     * @param {number} x — px desde izquierda
     * @param {number} y — px desde arriba
     */
    setMousePosition(x, y) {
        mouseX = x;
        mouseY = y;
        mouseInside = true;
        markDirty();
    },

    /**
     * Muestra/oculta las reglas.
     * @param {boolean} show
     */
    setVisible(show) {
        if (visible === show) return;
        visible = show;

        if (canvas) {
            canvas.style.display = show ? 'block' : 'none';
        }

        if (show) {
            startLoop();
        } else {
            // Limpiar el canvas cuando se oculta
            if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            stopLoop();
        }
        markDirty();
    },

    /**
     * Fuerza un redibujado completo.
     */
    forceRedraw() {
        handleResize();
        markDirty();
    },

    /**
     * Limpia y destruye el motor.
     */
    dispose() {
        stopLoop();

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        if (dprMediaQuery && dprListener) {
            dprMediaQuery.removeEventListener('change', dprListener);
            dprMediaQuery = null;
            dprListener = null;
        }

        if (containerRef) {
            containerRef.removeEventListener('pointermove', onMouseMove);
            containerRef.removeEventListener('pointerleave', onMouseLeave);
        }

        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }

        canvas = null;
        ctx = null;
        containerRef = null;
        cameraData = null;
        viewMode = null;
        splitData = null;
        mouseX = -1;
        mouseY = -1;
        mouseInside = false;
        dirty = false;
    },

    /**
     * Devuelve la configuración actual (lectura).
     * @returns {Object}
     */
    getConfig() {
        return { ...RULER_CONFIG };
    },
};
