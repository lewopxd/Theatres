// ============================================================
// State — Estado global reactivo de la aplicación
// Emite eventos via EventBus cuando cambian valores
// ============================================================

import { EventBus } from './EventBus.js';

const state = {
    is3DMode: true,
    active2DMode: 'top',
    isSplit: false,
    isWireframe: false,
    previousWireframeState: false,
    dimsVisible: false,
    activeTool: 'orbit',
    activePlane: 'xz',
    isMoveClamped: true,
    zoomToCursor: true,

    // Selection
    selectedMesh: null,
    selectedLi: null,

    // Drag
    isDragging: false,
    dragObject: null,

    // Grid config
    gridConfig: {
        visible: true,
        type: 'lines',
        color: '#6a7b8e',
        size: 1,
        opacity: 0.3,
        belowFloor: false,
        showCenter: true,
        centerColor: '#007acc',
        centerShape: 'full',
        centerStyle: 'solid',
        centerOpacity: 0.5
    },

    // Z-index tracker for floating UI
    highestZ: 205,
};

export const State = {
    /**
     * Get a state value
     * @param {string} key
     */
    get(key) {
        if (key.includes('.')) {
            const parts = key.split('.');
            let val = state;
            for (const p of parts) val = val?.[p];
            return val;
        }
        return state[key];
    },

    /**
     * Set a state value and emit change event
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        if (key.includes('.')) {
            const parts = key.split('.');
            let target = state;
            for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
            const old = target[parts[parts.length - 1]];
            target[parts[parts.length - 1]] = value;
            EventBus.emit(`state:${key}`, { value, old });
        } else {
            const old = state[key];
            state[key] = value;
            EventBus.emit(`state:${key}`, { value, old });
        }
    },

    /**
     * Get a z-index bump (for floating panels)
     */
    bumpZ() {
        state.highestZ++;
        return state.highestZ;
    },

    /**
     * Get gridConfig object (mutable reference for backward compat)
     */
    getGridConfig() {
        return state.gridConfig;
    }
};
