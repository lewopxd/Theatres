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
    tickColor: '#007acc',
    textColor: 'rgba(180, 180, 180, 0.85)',
    cornerBgColor: 'rgba(37, 37, 38, 0.95)',

    // Indicador de cursor (usando el color de énfasis de la app)
    cursorIndicatorColor: '#007acc',
    cursorIndicatorWidth: 1,
    cursorIndicatorOpacity: 0.85,
    cursorLabelBg: 'rgba(0, 122, 204, 0.9)',
    cursorLabelTextColor: '#ffffff',
    cursorLabelFontSize: 9,
    cursorLabelPaddingH: 4,
    cursorLabelPaddingV: 2,

    // Unidad de medida
    unit: 'm',
    decimals: 2,
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
    for (let i = 0; i < NICE_STEPS.length; i++) {
        const pxPerStep = NICE_STEPS[i] / worldPerPx;
        if (pxPerStep >= minPx && pxPerStep <= maxPx) {
            return NICE_STEPS[i];
        }
    }
    for (let i = NICE_STEPS.length - 1; i >= 0; i--) {
        const pxPerStep = NICE_STEPS[i] / worldPerPx;
        if (pxPerStep >= minPx) return NICE_STEPS[i];
    }
    return 1;
}

function getSubdivisions(majorStep) {
    let m = majorStep;
    while (m >= 10) m /= 10;
    while (m < 1) m *= 10;
    if (Math.abs(m - 1) < 0.01) return 10;
    if (Math.abs(m - 2) < 0.01) return 4;
    if (Math.abs(m - 2.5) < 0.01) return 5;
    if (Math.abs(m - 5) < 0.01) return 5;
    return 5;
}

function formatValue(val, decimals) {
    if (Math.abs(val) < 1e-10) val = 0;
    const fixed = val.toFixed(decimals);
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

let canvasW = 0;
let canvasH = 0;
let dpr = 1;

let visible = false;
let dirty = true;
let rafId = null;

// Datos recibidos vía setCameraData o setSplitData
let singleData = null; 
let splitData = null;

// Posición del mouse
let mouseX = -1;
let mouseY = -1;
let mouseInside = false;

// ────────────────────────────────────────────────────────────
// CONVERSIÓN PÍXEL <-> MUNDO
// ────────────────────────────────────────────────────────────
function worldToPx(worldVal, worldMin, worldMax, vpSize, offset) {
    const range = worldMax - worldMin;
    if (Math.abs(range) < 1e-12) return offset;
    return offset + ((worldVal - worldMin) / range) * vpSize;
}

function pxToWorld(px, worldMin, worldMax, vpSize) {
    if (vpSize < 1) return worldMin;
    return worldMin + (px / vpSize) * (worldMax - worldMin);
}

// ────────────────────────────────────────────────────────────
// DRAWING HELPERS
// ────────────────────────────────────────────────────────────

function drawRulerH(x0, y0, vpW, vpH, data) {
    const cfg = RULER_CONFIG;
    const t = cfg.rulerThickness;
    const cs = cfg.cornerSize;

    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(x0 + cs, y0, vpW - cs, t);

    ctx.fillStyle = cfg.borderColor;
    ctx.fillRect(x0 + cs, y0 + t - 1, vpW - cs, 1);

    const wMin = data.worldMinH;
    const wMax = data.worldMaxH;
    const range = Math.abs(wMax - wMin);
    if (range === 0) return;

    const worldPerPx = range / vpW;
    const majorStep = pickNiceStep(worldPerPx, cfg.minTickSpacing, cfg.maxTickSpacing);
    const minorStep = majorStep / getSubdivisions(majorStep);

    // Ajustar para que el grid coincida en múltiplos de minorStep
    const firstTick = Math.floor(Math.min(wMin, wMax) / majorStep) * majorStep;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + cs, y0, vpW - cs, t);
    ctx.clip();

    const iterMin = Math.min(wMin, wMax);
    const iterMax = Math.max(wMin, wMax);

    for (let w = firstTick - minorStep; w <= iterMax + minorStep; w += minorStep) {
        const px = worldToPx(w, wMin, wMax, vpW, x0);
        if (px < x0 + cs || px > x0 + vpW) continue;

        const isMajor = Math.abs(w / majorStep - Math.round(w / majorStep)) < 1e-9;
        const len = isMajor ? cfg.majorTickLength : cfg.microTickLength;

        ctx.fillStyle = cfg.tickColor;
        ctx.fillRect(Math.round(px), y0 + t - len, cfg.tickWidth, len);

        if (isMajor) {
            ctx.fillStyle = cfg.textColor;
            ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${cfg.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(formatValue(w, cfg.decimals), Math.round(px), y0 + 2);
        }
    }
    ctx.restore();
}

function drawRulerV(x0, y0, vpW, vpH, data) {
    const cfg = RULER_CONFIG;
    const t = cfg.rulerThickness;
    const cs = cfg.cornerSize;

    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(x0, y0 + cs, t, vpH - cs);

    ctx.fillStyle = cfg.borderColor;
    ctx.fillRect(x0 + t - 1, y0 + cs, 1, vpH - cs);

    const wMin = data.worldMinV;
    const wMax = data.worldMaxV;
    const range = Math.abs(wMax - wMin);
    if (range === 0) return;

    const worldPerPx = range / vpH;
    const majorStep = pickNiceStep(worldPerPx, cfg.minTickSpacing, cfg.maxTickSpacing);
    const minorStep = majorStep / getSubdivisions(majorStep);

    const firstTick = Math.floor(Math.min(wMin, wMax) / majorStep) * majorStep;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0 + cs, t, vpH - cs);
    ctx.clip();

    const iterMin = Math.min(wMin, wMax);
    const iterMax = Math.max(wMin, wMax);

    for (let w = firstTick - minorStep; w <= iterMax + minorStep; w += minorStep) {
        const py = worldToPx(w, wMin, wMax, vpH, y0);
        if (py < y0 + cs || py > y0 + vpH) continue;

        const isMajor = Math.abs(w / majorStep - Math.round(w / majorStep)) < 1e-9;
        const len = isMajor ? cfg.majorTickLength : cfg.microTickLength;

        ctx.fillStyle = cfg.tickColor;
        ctx.fillRect(x0 + t - len, Math.round(py), len, cfg.tickWidth);

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

function drawCorner(x0, y0) {
    const cfg = RULER_CONFIG;
    const cs = cfg.cornerSize;

    ctx.fillStyle = cfg.cornerBgColor;
    ctx.fillRect(x0, y0, cs, cs);

    ctx.fillStyle = cfg.borderColor;
    ctx.fillRect(x0 + cs - 1, y0, 1, cs);
    ctx.fillRect(x0, y0 + cs - 1, cs, 1);

    ctx.fillStyle = cfg.textColor;
    ctx.font = `${cfg.fontWeight} ${cfg.fontSize - 1}px ${cfg.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.unit, x0 + cs / 2, y0 + cs / 2);
}

function drawCursorIndicator(x0, y0, vpW, vpH, data, localMouseX, localMouseY) {
    const cfg = RULER_CONFIG;
    const t = cfg.rulerThickness;
    const cs = cfg.cornerSize;

    if (localMouseX < 0 || localMouseY < 0 || localMouseX > vpW || localMouseY > vpH) return;

    ctx.save();
    ctx.globalAlpha = cfg.cursorIndicatorOpacity;

    // Horizontal
    if (localMouseX > cs) {
        const worldValH = pxToWorld(localMouseX, data.worldMinH, data.worldMaxH, vpW);
        const textH = worldValH.toFixed(2) + 'm';
        const px = x0 + localMouseX;

        ctx.fillStyle = cfg.cursorIndicatorColor;
        ctx.fillRect(Math.round(px), y0, cfg.cursorIndicatorWidth, t);

        const triSize = 4;
        ctx.beginPath();
        ctx.moveTo(Math.round(px), y0 + t);
        ctx.lineTo(Math.round(px) - triSize, y0 + t - triSize);
        ctx.lineTo(Math.round(px) + triSize, y0 + t - triSize);
        ctx.fill();

        ctx.font = `${cfg.fontWeight} ${cfg.cursorLabelFontSize}px ${cfg.fontFamily}`;
        const w = ctx.measureText(textH).width + cfg.cursorLabelPaddingH * 2;
        const h = cfg.cursorLabelFontSize + cfg.cursorLabelPaddingV * 2;
        let lx = Math.round(px) - w / 2;
        lx = Math.max(x0 + cs + 1, Math.min(lx, x0 + vpW - w - 1));
        const ly = y0 + t - h - triSize - 1;

        ctx.fillStyle = cfg.cursorLabelBg;
        roundRect(ctx, lx, ly, w, h, 3);
        ctx.fill();

        ctx.fillStyle = cfg.cursorLabelTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textH, lx + w / 2, ly + h / 2);
    }

    // Vertical
    if (localMouseY > cs) {
        const worldValV = pxToWorld(localMouseY, data.worldMinV, data.worldMaxV, vpH);
        const textV = worldValV.toFixed(2) + 'm';
        const py = y0 + localMouseY;

        ctx.fillStyle = cfg.cursorIndicatorColor;
        ctx.fillRect(x0, Math.round(py), t, cfg.cursorIndicatorWidth);

        const triSize = 4;
        ctx.beginPath();
        ctx.moveTo(x0 + t, Math.round(py));
        ctx.lineTo(x0 + t - triSize, Math.round(py) - triSize);
        ctx.lineTo(x0 + t - triSize, Math.round(py) + triSize);
        ctx.fill();

        ctx.font = `${cfg.fontWeight} ${cfg.cursorLabelFontSize}px ${cfg.fontFamily}`;
        const w = ctx.measureText(textV).width + cfg.cursorLabelPaddingH * 2;
        const h = cfg.cursorLabelFontSize + cfg.cursorLabelPaddingV * 2;
        let ly = Math.round(py) - w / 2;
        ly = Math.max(y0 + cs + 1, Math.min(ly, y0 + vpH - w - 1));
        const lx = x0 + 1;

        ctx.save();
        ctx.translate(lx + h / 2, ly + w / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = cfg.cursorLabelBg;
        roundRect(ctx, -w / 2, -h / 2, w, h, 3);
        ctx.fill();

        ctx.fillStyle = cfg.cursorLabelTextColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textV, 0, 0);
        ctx.restore();
    }

    ctx.restore();
}

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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!visible) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    if (splitData && splitData.length > 0) {
        for (const quad of splitData) {
            if (!quad.data) continue; // Si es ortho 3d, no dibujar
            
            const qx = quad.left;
            const qy = quad.top;
            const qw = quad.width;
            const qh = quad.height;

            const localMX = mouseInside ? mouseX - qx : -1;
            const localMY = mouseInside ? mouseY - qy : -1;
            const mouseInQuad = localMX >= 0 && localMY >= 0 && localMX <= qw && localMY <= qh;

            drawRulerH(qx, qy, qw, qh, quad.data);
            drawRulerV(qx, qy, qw, qh, quad.data);
            drawCorner(qx, qy);

            if (mouseInQuad) {
                drawCursorIndicator(qx, qy, qw, qh, quad.data, localMX, localMY);
            }
        }
    } else if (singleData) {
        drawRulerH(0, 0, canvasW, canvasH, singleData);
        drawRulerV(0, 0, canvasW, canvasH, singleData);
        drawCorner(0, 0);

        if (mouseInside) {
            drawCursorIndicator(0, 0, canvasW, canvasH, singleData, mouseX, mouseY);
        }
    }

    ctx.restore();
}

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
    if (dprMediaQuery) dprMediaQuery.removeEventListener('change', dprListener);
    dpr = window.devicePixelRatio || 1;
    dprMediaQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    dprListener = handleDprChange;
    dprMediaQuery.addEventListener('change', dprListener);
    handleResize();
}

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
    markDirty();
}

// ────────────────────────────────────────────────────────────
// API PÚBLICA
// ────────────────────────────────────────────────────────────
export const RulerOverlay = {
    init(container) {
        if (canvas) this.dispose();

        containerRef = container;
        canvas = container.querySelector('#ruler-overlay');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'ruler-overlay';
            container.appendChild(canvas);
        }
        ctx = canvas.getContext('2d');

        handleResize();
        resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(container);
        handleDprChange();

        container.addEventListener('pointermove', onMouseMove);
        container.addEventListener('pointerleave', onMouseLeave);

        startLoop();
    },

    configure(overrides) {
        if (!overrides) return;
        Object.assign(RULER_CONFIG, overrides);
        markDirty();
    },

    setCameraData(boundsData) {
        singleData = boundsData;
        splitData = null;
        markDirty();
    },

    setSplitData(quadrants) {
        splitData = quadrants;
        singleData = null;
        markDirty();
    },

    setVisible(show) {
        if (visible === show) return;
        visible = show;
        if (canvas) canvas.style.display = show ? 'block' : 'none';
        
        if (show) {
            startLoop();
        } else {
            if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
            stopLoop();
        }
        markDirty();
    },

    forceRedraw() {
        handleResize();
        markDirty();
    },

    dispose() {
        stopLoop();
        if (resizeObserver) resizeObserver.disconnect();
        if (dprMediaQuery) dprMediaQuery.removeEventListener('change', dprListener);
        if (containerRef) {
            containerRef.removeEventListener('pointermove', onMouseMove);
            containerRef.removeEventListener('pointerleave', onMouseLeave);
        }
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        
        canvas = null; ctx = null; containerRef = null;
        singleData = null; splitData = null;
        mouseInside = false; dirty = false;
    }
};
