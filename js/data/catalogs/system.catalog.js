// ============================================================
// system.catalog.js — Catálogo de elementos técnicos del teatro
// INMUTABLE: solo lectura.
// Cubre: Escenotecnia (varas, vestiduras) e Iluminación.
// Por ahora son solo metadatos de UI (sin geometría 3D real).
// Cuando se creen los modelos, agregar: geoType o assetFile.
// ============================================================

/**
 * @typedef {Object} SystemItem
 * @property {string}  id       - Identificador único
 * @property {string}  name     - Nombre para mostrar en UI
 * @property {string}  icon     - Clase Phosphor icon (sin 'ph-')
 * @property {string}  category - 'escenotecnia' | 'iluminacion'
 * @property {string}  group    - Grupo del árbol en la pestaña
 * @property {string}  [color]  - Color por defecto del dot en el árbol
 * @property {string}  [geoType]    - Si ya tiene geometría (futuro)
 * @property {Object}  [defaultGeo] - Parámetros geo por defecto (futuro)
 */

/** @type {SystemItem[]} */
export const SYSTEM_CATALOG = [

    // ── ESCENOTECNIA ───────────────────────────────────────────────
    {
        id: 'vara_motorizada',
        name: 'Vara Motorizada',
        icon: 'minus',
        category: 'escenotecnia',
        group: 'tramoya',
        color: 'magenta',
        // futuro: geoType: 'cylinder', defaultGeo: { r: 0.03, h: 8 }
    },
    {
        id: 'vara_manual',
        name: 'Vara Manual',
        icon: 'minus',
        category: 'escenotecnia',
        group: 'tramoya',
        color: 'magenta'
    },
    {
        id: 'telon_boca',
        name: 'Telón de Boca',
        icon: 'flag-banner',
        category: 'escenotecnia',
        group: 'vestiduras',
        color: 'red'
    },
    {
        id: 'camara_negra',
        name: 'Cámara Negra',
        icon: 'flag-banner',
        category: 'escenotecnia',
        group: 'vestiduras',
        color: '#111'
    },
    {
        id: 'pata_aforo',
        name: 'Pata (Aforo)',
        icon: 'flag-banner',
        category: 'escenotecnia',
        group: 'vestiduras',
        color: '#444'
    },

    // ── ILUMINACIÓN ────────────────────────────────────────────────
    {
        id: 'pc_1000w',
        name: 'PC 1000w',
        icon: 'headlights',
        category: 'iluminacion',
        group: 'luminarias',
        color: 'yellow'
    },
    {
        id: 'fresnel_650w',
        name: 'Fresnel 650w',
        icon: 'headlights',
        category: 'iluminacion',
        group: 'luminarias',
        color: 'yellow'
    },
    {
        id: 'led_wash',
        name: 'Cabeza Móvil Wash',
        icon: 'lightbulb',
        category: 'iluminacion',
        group: 'luminarias',
        color: 'cyan'
    },
    {
        id: 'led_spot',
        name: 'Cabeza Móvil Spot',
        icon: 'lightbulb',
        category: 'iluminacion',
        group: 'luminarias',
        color: 'cyan'
    },
    {
        id: 'proyector_frontal',
        name: 'Proyector Frontal',
        icon: 'projector-screen',
        category: 'iluminacion',
        group: 'video',
        color: 'blue'
    },
    {
        id: 'maquina_humo',
        name: 'Máquina de Humo',
        icon: 'cloud',
        category: 'iluminacion',
        group: 'atmosfera',
        color: 'white'
    }
];

/** Organización de categorías para mostrar en la UI */
export const SYSTEM_CATEGORIES = [
    { id: 'escenotecnia', label: 'Escenotecnia', icon: 'wrench' },
    { id: 'iluminacion',  label: 'Iluminación',  icon: 'headlights' }
];

/**
 * Retorna items de una categoría específica.
 * @param {string} category
 * @returns {SystemItem[]}
 */
export function getSystemByCategory(category) {
    return SYSTEM_CATALOG.filter(i => i.category === category);
}
