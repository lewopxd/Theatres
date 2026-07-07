// ============================================================
// ProjectManager — Gestiona el estado completo del proyecto del usuario
// ============================================================

import { History } from './History.js';
import { State } from './State.js';

export const ProjectManager = {
    // Estado en memoria del proyecto actual
    currentProject: {
        meta: {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            name: "Nuevo Proyecto",
            version: "3.0"
        },
        theatre: {
            catalogId: "ninguno", // ID del recinto en el catálogo ('tecal', 'generico_pequeño', etc.)
            overrides: {}         // Modificaciones del usuario al recinto base
        },
        scene: {
            meshInstances: []     // El arreglo con todos los objetos que el usuario ha agregado
        }
    },

    /**
     * Inicializa un proyecto nuevo o carga uno existente.
     * Esto debería llamarse durante el proceso de arranque (boot).
     */
    init() {
        // En el futuro, aquí se buscaría si hay un ID guardado o se pasaría por URL.
        // Por ahora, simplemente intentamos cargar del History (localStorage)
        // Ojo: History.restoreFromStorage() se llamará desde main.js, 
        // así que el ProjectManager solo necesita estar listo para actualizar su estado.
    },

    /**
     * Devuelve el ID del teatro activo.
     */
    getActiveTheatreId() {
        return this.currentProject.theatre.catalogId;
    },

    /**
     * Cambia el teatro activo.
     * @param {string} id - ID del teatro del catálogo.
     */
    setActiveTheatreId(id) {
        this.currentProject.theatre.catalogId = id;
        // Si cambia el teatro, usualmente se limpian los overrides para empezar de cero con el nuevo.
        this.currentProject.theatre.overrides = {};
        // TODO: Notificar a UI (CatalogController y render)
    },

    /**
     * Obtiene los parámetros finales del teatro, fusionando el catálogo con los overrides del usuario.
     * @param {Object} catalogTheatre - El teatro tal como viene de theatres.catalog.js
     * @returns {Object} Los parámetros a usar por TheatreFactory.buildTheatre
     */
    getResolvedTheatreParams(catalogTheatre) {
        if (!catalogTheatre) return null;
        
        // Copiar los defaults del catálogo (asume que ya viene mapeado o se extraen las propiedades necesarias)
        const baseStage = { ...catalogTheatre.stage };
        const overrides = this.currentProject.theatre.overrides;

        // Fusionar: si el usuario cambió el width, se usa el del usuario
        return {
            ...baseStage,
            ...overrides
        };
    },
    
    /**
     * Guarda un override de las propiedades del teatro.
     */
    setTheatreOverride(key, value) {
        this.currentProject.theatre.overrides[key] = value;
    },
    
    /**
     * Actualiza la lista de meshes (llamado por TheatreSerializer antes de guardar).
     */
    updateMeshInstances(instances) {
        this.currentProject.scene.meshInstances = instances;
    }
};
