// ============================================================
// DOM Utilities — helpers para manipulación del DOM
// ============================================================

/**
 * No-op: Phosphor Icons son CSS-based (clases en <i>), se renderizan automáticamente.
 * Mantenemos la función para no romper imports existentes que la llaman.
 * @param {Object} [opts] — ignorado (era para lucide.createIcons)
 */
export function createIcons(opts) {
    // Phosphor Icons no necesita inicialización JS.
    // Los íconos se renderizan vía web font con clases CSS: <i class="ph ph-icon-name"></i>
}

/**
 * Shortcut para document.getElementById
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function $(id) {
    return document.getElementById(id);
}

/**
 * Shortcut para document.querySelectorAll
 * @param {string} selector
 * @param {HTMLElement} [root=document]
 * @returns {NodeListOf<HTMLElement>}
 */
export function $$(selector, root = document) {
    return root.querySelectorAll(selector);
}

/**
 * Detecta si el evento de puntero está sobre un elemento de UI
 * (sidebar, panel, topbar, modals, etc.)
 * @param {PointerEvent|MouseEvent} e
 * @returns {boolean}
 */
export function isOverUI(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && (
        el.closest('#sidebar') ||
        el.closest('#properties-panel') ||
        el.closest('#top-bar') ||
        el.closest('#toolbar-2d') ||
        el.closest('#bottom-bar') ||
        el.closest('.window-modal') ||
        el.closest('#brightness-container') ||
        el.closest('.context-menu') ||
        el.closest('#gizmo-container') ||
        el.closest('#btn-clear-all')
    );
}

/**
 * Micro-delay helper (para yields visuales del loader)
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
