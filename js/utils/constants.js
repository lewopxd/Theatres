// ============================================================
// Constants — Valores constantes reutilizados en toda la app
// ============================================================

/** Distancia mínima en px para considerar un drag (vs click) */
export const DRAG_THRESHOLD = 4;

/** Intervalo en ms para detectar doble-clic */
export const DBL_CLICK_MS = 500;

/** Labels de los planos de movimiento */
export const AXIS_LABELS = {
    xz: 'Mover: plano XZ (horizontal)',
    xy: 'Mover: plano XY (frontal)',
    yz: 'Mover: plano YZ (lateral)'
};

/** Atajos de teclado para herramientas */
export const TOOL_KEYS = {
    'q': 'select',
    'w': 'move',
    'r': 'rotate',
    'e': 'orbit',
    'h': 'pan',
    'Q': 'select',
    'W': 'move',
    'R': 'rotate',
    'E': 'orbit',
    'H': 'pan'
};

/** Frustum size para cámaras ortográficas (menor valor = vista inicial más cercana) */
export const FRUSTUM_SIZE = 10;

/** Máximo de estados undo */
export const HISTORY_MAX = 30;

/** localStorage key para persistencia */
export const STORAGE_KEY = 'tecal-save-v3';

/** Background base color */
export const BASE_BG_COLOR = 0x1e262f;
