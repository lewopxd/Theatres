// ============================================================
// History — Undo/Redo + persistencia localStorage
// ============================================================

import * as THREE from 'three';
import { Registry } from './Registry.js';
import { scene, baseBgColor, updateBrightness, applyLayerVisibility } from '../engine/SceneManager.js';
import { serializeState, createGeoFromParams } from '../theatre/TheatreSerializer.js';
import { createStruct } from '../theatre/StructureBuilder.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { createIcons, $ } from '../utils/dom.js';
import { HISTORY_MAX, STORAGE_KEY } from '../utils/constants.js';
import { State } from './State.js';
import { EventBus } from './EventBus.js';

export const History = {
    undoStack: [],
    redoStack: [],

    save() {
        const state = serializeState();
        const stateStr = JSON.stringify(state);

        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === stateStr) return;

        this.undoStack.push(stateStr);
        if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
        this.redoStack = [];
        this.updateBtns();
        localStorage.setItem(STORAGE_KEY, stateStr);
    },

    load(stateStr) {
        if (!stateStr) return;
        const state = JSON.parse(stateStr);
        baseBgColor.setHex(state.bg);

        const brightnessSlider = $('brightness-slider');
        const v = brightnessSlider ? parseFloat(brightnessSlider.value) : 1;
        updateBrightness(v);

        const structures = Registry.getStructures();
        const wires = Registry.getWires();
        const stateIds = state.m.map(x => x.id);

        // Remove structures not in saved state
        for (let i = structures.length - 1; i >= 0; i--) {
            if (!stateIds.includes(structures[i].userData.id)) {
                scene.remove(structures[i]);
                structures[i].geometry.dispose();
                scene.remove(wires[i]);
                wires[i].geometry.dispose();
                structures.splice(i, 1);
                wires.splice(i, 1);
            }
        }

        // Restore/create structures
        state.m.forEach(sm => {
            let m = Registry.findStructureById(sm.id);
            if (!m) {
                const mat = new THREE.MeshStandardMaterial({
                    color: sm.mat.c,
                    opacity: (sm.g === 'paredes' || sm.id === 'piso') ? 1.0 : sm.mat.o,
                    roughness: sm.mat.r,
                    metalness: sm.mat.met,
                    transparent: ((sm.g === 'paredes' || sm.id === 'piso') ? 1.0 : sm.mat.o) < 1.0
                });
                const geo = createGeoFromParams(sm.type, sm.geo);
                m = createStruct(
                    geo, mat,
                    '#' + sm.wire.toString(16).padStart(6, '0'),
                    sm.id, sm.g, sm.p[0], sm.p[1], sm.p[2], sm.rz, sm.type, sm.geo
                );
                m.userData.editable = sm.edit;
            } else {
                m.position.fromArray(sm.p);
                m.rotation.z = sm.rz;
                m.material.color.setHex(sm.mat.c);
                m.material.opacity = (sm.g === 'paredes' || sm.id === 'piso') ? 1.0 : sm.mat.o;
                m.material.transparent = m.material.opacity < 1.0;
                if (m.material.isMeshStandardMaterial) {
                    m.material.roughness = sm.mat.r;
                    m.material.metalness = sm.mat.met;
                }
                m.userData.geoParams = sm.geo;
                m.userData.materialPreset = sm.mat.pre;
                m.userData.layerVisible = sm.vis;
                m.userData.locked = sm.lock;

                const newGeo = createGeoFromParams(sm.type, sm.geo);
                m.geometry.dispose();
                m.geometry = newGeo;

                const w = Registry.findWireById(sm.id);
                if (w) {
                    w.geometry.dispose();
                    w.geometry = new THREE.EdgesGeometry(newGeo);
                    w.position.copy(m.position);
                    w.rotation.copy(m.rotation);
                    w.userData.baseColor.setHex(sm.wire);
                    w.userData.layerVisible = sm.vis;
                }
            }
        });

        // Restore trees
        const treeArq = $('tree-arq');
        const treeEsc = $('tree-esc');
        const treeEq = $('tree-eq');
        if (state.tArq && treeArq) treeArq.innerHTML = state.tArq;
        if (state.tEsc && treeEsc) treeEsc.innerHTML = state.tEsc;
        if (state.tEq && treeEq) treeEq.innerHTML = state.tEq;

        createIcons();
        applyLayerVisibility(State.get('is3DMode'), State.get('isWireframe'));

        const selectedMesh = State.get('selectedMesh');
        syncSelectionEdges(selectedMesh);

        if (selectedMesh) {
            const stillExists = Registry.findStructureById(selectedMesh.userData.id);
            if (!stillExists) {
                EventBus.emit('selection:clear');
            } else {
                EventBus.emit('selection:restored', { mesh: stillExists });
            }
        }
    },

    undo() {
        if (this.undoStack.length <= 1) return;
        this.redoStack.push(this.undoStack.pop());
        this.load(this.undoStack[this.undoStack.length - 1]);
        this.updateBtns();
    },

    redo() {
        if (this.redoStack.length === 0) return;
        const stateStr = this.redoStack.pop();
        this.undoStack.push(stateStr);
        this.load(stateStr);
        this.updateBtns();
    },

    updateBtns() {
        const btnUndo = $('btn-undo');
        const btnRedo = $('btn-redo');
        if (btnUndo) btnUndo.classList.toggle('disabled', this.undoStack.length <= 1);
        if (btnRedo) btnRedo.classList.toggle('disabled', this.redoStack.length === 0);
    },

    /**
     * Restore from localStorage
     */
    restoreFromStorage() {
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (savedState) {
            try {
                this.undoStack.push(savedState);
                this.load(savedState);
            } catch (e) {
                console.warn('Estado guardado inválido, reiniciando.', e);
                localStorage.removeItem(STORAGE_KEY);
                this.save();
            }
        } else {
            this.save();
        }
    }
};
