// ============================================================
// personas.catalog.js — Metadatos del catálogo de Personas
// INMUTABLE: solo lectura.
// Los archivos físicos (.glb) viven en:
//   assets/modelos3d/personas/modelos/
//   assets/modelos3d/personas/poses/
//   assets/modelos3d/personas/animaciones/
//   assets/modelos3d/personas/spawn/
// Los índices JSON en esas carpetas son la fuente de verdad
// de los archivos disponibles. Este catálogo agrega metadatos
// de UI encima (iconos, labels, defaults).
// ============================================================

/**
 * Tipos de persona disponibles (modelos base .glb).
 * @type {Array<{id:string, name:string, file:string, icon:string, defaultHeight:number}>}
 */
export const PERSONA_TYPES = [
    {
        id: 'male',
        name: 'Hombre',
        file: 'male.glb',
        icon: 'user-focus',
        defaultHeight: 1.75,
        group: 'personas'
    },
    {
        id: 'female',
        name: 'Mujer',
        file: 'female.glb',
        icon: 'user-focus',
        defaultHeight: 1.65,
        group: 'personas'
    }
];

/**
 * Rutas base de los assets de personas.
 * Centralizado aquí para que cambiar la ruta de assets solo requiera
 * editar este archivo.
 */
export const PERSONA_ASSET_PATHS = {
    models:      'assets/modelos3d/personas/modelos/',
    poses:       'assets/modelos3d/personas/poses/',
    animations:  'assets/modelos3d/personas/animaciones/',
    spawn:       'assets/modelos3d/personas/spawn/'
};

/**
 * Manifiesto de índices (cargados vía fetch() en PersonasEngine).
 */
export const PERSONA_MANIFESTS = {
    poses:      `${PERSONA_ASSET_PATHS.poses}index.json`,
    animations: `${PERSONA_ASSET_PATHS.animations}index.json`,
    spawn:      `${PERSONA_ASSET_PATHS.spawn}index.json`,
    spawnSeqs:  `${PERSONA_ASSET_PATHS.spawn}sequences.json`
};

/**
 * Encuentra un tipo de persona por ID.
 * @param {string} id - 'male' | 'female'
 * @returns {Object|undefined}
 */
export function findPersonaType(id) {
    return PERSONA_TYPES.find(p => p.id === id);
}
