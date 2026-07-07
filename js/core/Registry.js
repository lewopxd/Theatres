// ============================================================
// Registry — Registro central de meshes, wires, dimensions
// Reemplaza los arrays globales sueltos (structures, wires, dimensions)
// ============================================================

const structures = [];
const wires = [];
const dimensions = [];

export const Registry = {
    // ---- Structures (solid meshes) ----
    addStructure(mesh) {
        structures.push(mesh);
    },

    removeStructure(mesh) {
        const idx = structures.indexOf(mesh);
        if (idx !== -1) structures.splice(idx, 1);
    },

    getStructures() {
        return structures;
    },

    findStructureById(id) {
        return structures.find(m => m.userData.id === id);
    },

    // ---- Wires (wireframe edges) ----
    addWire(wire) {
        wires.push(wire);
    },

    removeWire(wire) {
        const idx = wires.indexOf(wire);
        if (idx !== -1) wires.splice(idx, 1);
    },

    getWires() {
        return wires;
    },

    findWireById(id) {
        return wires.find(w => w.userData.id === id);
    },

    // ---- Dimensions (CAD annotations) ----
    addDimension(dim) {
        dimensions.push(dim);
    },

    removeDimension(dim) {
        const idx = dimensions.indexOf(dim);
        if (idx !== -1) dimensions.splice(idx, 1);
    },

    getDimensions() {
        return dimensions;
    },

    // ---- Bulk operations ----
    /**
     * Remove structure and its associated wire by id
     */
    removeById(id) {
        const sIdx = structures.findIndex(m => m.userData.id === id);
        if (sIdx !== -1) structures.splice(sIdx, 1);
        const wIdx = wires.findIndex(w => w.userData.id === id);
        if (wIdx !== -1) wires.splice(wIdx, 1);
    },

    /**
     * Clear all registries (for loading new theatre)
     */
    clear() {
        structures.length = 0;
        wires.length = 0;
        dimensions.length = 0;
    },

    /**
     * Get structure at index (for History compat)
     */
    getStructureAt(index) {
        return structures[index];
    },

    getWireAt(index) {
        return wires[index];
    },

    structureCount() {
        return structures.length;
    }
};
