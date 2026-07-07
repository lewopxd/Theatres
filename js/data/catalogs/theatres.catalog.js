// ============================================================
// theatres.catalog.js — Catálogo de recintos reales
// INMUTABLE: solo lectura. El usuario NO puede editar esto.
// Sus ediciones van en userProject.theatre.overrides (ProjectManager).
// Unidades: metros.
// ============================================================

/**
 * @typedef {Object} TheatreCatalogEntry
 * @property {string}  id           - Identificador único (snake_case)
 * @property {string}  name         - Nombre del recinto
 * @property {string}  city         - Ciudad
 * @property {Object}  stage        - Dimensiones de la caja escénica
 * @property {number}  stage.width  - Ancho de boca (m)
 * @property {number}  stage.depth  - Profundidad (m)
 * @property {number}  stage.height - Altura de caja (m)
 * @property {number}  stage.grid   - Altura de parrilla (m)
 * @property {number}  stage.wallThickness - Grosor de muros (m)
 * @property {number}  stage.barCount     - Número de barras
 * @property {number}  stage.barRadius    - Radio de barras (m)
 * @property {Object}  [meta]       - Información adicional (opcional)
 */

/** @type {TheatreCatalogEntry[]} */
export const THEATRES_CATALOG = [
    {
        id: 'generico_pequeño',
        name: 'Sala Pequeña Estándar',
        city: '(Estándar)',
        stage: {
            width: 10.0,
            depth: 8.5,
            height: 5.5,
            grid: 6.0,
            wallThickness: 0.2,
            barCount: 5,
            barRadius: 0.05
        },
        meta: { type: 'generic', capacity: null }
    },
    {
        id: 'tecal',
        name: 'Teatro Tecal',
        city: 'Bogotá',
        stage: {
            width: 8.0,
            depth: 7.5,
            height: 4.5,
            grid: 4.5,
            wallThickness: 0.2,
            barCount: 5,
            barRadius: 0.05
        },
        meta: { type: 'blackbox', capacity: 150 }
    }
];

/**
 * Encuentra un teatro por ID.
 * @param {string} id
 * @returns {TheatreCatalogEntry|undefined}
 */
export function findTheatreById(id) {
    return THEATRES_CATALOG.find(t => t.id === id);
}

/**
 * Contenedor escénico por defecto (abstracto, sin teatro real).
 * Es el estado inicial cuando el usuario NO ha seleccionado ningún teatro.
 * @type {Object}
 */
export const DEFAULT_CONTAINER = {
    width: 10,
    depth: 8,
    height: 5.5,
    grid: 9,
    wallThickness: 0.2,
    barCount: 5,
    barRadius: 0.05
};
