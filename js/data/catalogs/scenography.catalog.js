// ============================================================
// scenography.catalog.js — Catálogo de elementos de escenografía
// INMUTABLE: solo lectura.
// Define QUÉ puede agregar el usuario desde el botón (+) en
// la pestaña "Espacio Escénico".
//
// Categorías:
//   - volumes:   Formas geométricas paramétricas (Three.js)
//   - props:     Utilería y mobiliario (futuro: archivos .glb)
//   - technical: Volúmenes técnicos (PA, racks, etc.)
// ============================================================

/**
 * @typedef {Object} ScenographyItem
 * @property {string} id           - Identificador único
 * @property {string} name         - Nombre para mostrar en UI
 * @property {string} icon         - Clase Phosphor icon (sin 'ph-')
 * @property {string} category     - 'volumes' | 'props' | 'technical'
 * @property {string} group        - Grupo en el árbol (userData.group del mesh)
 * @property {string} geoType      - 'box' | 'sphere' | 'cylinder' | 'cone'
 * @property {Object} defaultGeo   - Parámetros por defecto de geometría
 * @property {Object} defaultMat   - Material por defecto
 */

/** @type {ScenographyItem[]} */
export const SCENOGRAPHY_CATALOG = [
    // ── VOLÚMENES SIMPLES ──────────────────────────────────────────
    {
        id: 'vol_cubo',
        name: 'Cubo / Practicable',
        icon: 'cube',
        category: 'volumes',
        group: 'escenografia',
        geoType: 'box',
        defaultGeo: { w: 1.0, h: 0.4, d: 1.0 },
        defaultMat: { color: '#cc8844', opacity: 1.0 }
    },
    {
        id: 'vol_esfera',
        name: 'Esfera',
        icon: 'circle',
        category: 'volumes',
        group: 'escenografia',
        geoType: 'sphere',
        defaultGeo: { r: 0.5 },
        defaultMat: { color: '#cc8844', opacity: 1.0 }
    },
    {
        id: 'vol_cilindro',
        name: 'Cilindro / Columna',
        icon: 'cylinder',
        category: 'volumes',
        group: 'escenografia',
        geoType: 'cylinder',
        defaultGeo: { r: 0.3, h: 1.0 },
        defaultMat: { color: '#cc8844', opacity: 1.0 }
    },
    {
        id: 'vol_cono',
        name: 'Cono',
        icon: 'triangle',
        category: 'volumes',
        group: 'escenografia',
        geoType: 'cone',
        defaultGeo: { r: 0.4, h: 1.0 },
        defaultMat: { color: '#cc8844', opacity: 1.0 }
    },
    // ── UTILERÍA (futuro: .glb) ────────────────────────────────────
    {
        id: 'prop_silla',
        name: 'Silla (volumen)',
        icon: 'armchair',
        category: 'props',
        group: 'utileria',
        geoType: 'box',
        defaultGeo: { w: 0.5, h: 0.9, d: 0.5 },
        defaultMat: { color: '#887766', opacity: 1.0 }
    },
    {
        id: 'prop_mesa',
        name: 'Mesa (volumen)',
        icon: 'table',
        category: 'props',
        group: 'utileria',
        geoType: 'box',
        defaultGeo: { w: 1.2, h: 0.75, d: 0.6 },
        defaultMat: { color: '#887766', opacity: 1.0 }
    },
    // ── VOLÚMENES TÉCNICOS ─────────────────────────────────────────
    {
        id: 'tech_speaker',
        name: 'Altavoz PA (volumen)',
        icon: 'speaker-hifi',
        category: 'technical',
        group: 'tecnicos',
        geoType: 'box',
        defaultGeo: { w: 0.4, h: 0.8, d: 0.4 },
        defaultMat: { color: '#555566', opacity: 1.0 }
    },
    {
        id: 'tech_rack',
        name: 'Rack de Escenario',
        icon: 'stack',
        category: 'technical',
        group: 'tecnicos',
        geoType: 'box',
        defaultGeo: { w: 0.6, h: 1.2, d: 0.5 },
        defaultMat: { color: '#333344', opacity: 1.0 }
    }
];

/** Organización para mostrar en la UI (orden de categorías) */
export const SCENOGRAPHY_CATEGORIES = [
    { id: 'volumes',   label: 'Volúmenes',      icon: 'cube' },
    { id: 'props',     label: 'Utilería',        icon: 'armchair' },
    { id: 'technical', label: 'Vol. Técnicos',   icon: 'speaker-hifi' }
];

/**
 * Retorna items de una categoría específica.
 * @param {string} category
 * @returns {ScenographyItem[]}
 */
export function getScenographyByCategory(category) {
    return SCENOGRAPHY_CATALOG.filter(i => i.category === category);
}
