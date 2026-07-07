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
import { PersonasEngine } from '../engine/PersonasEngine.js';
import { HISTORY_MAX, STORAGE_KEY } from '../utils/constants.js';
import { State } from './State.js';
import { EventBus } from './EventBus.js';
import { switchCategory } from '../ui/TreeBuilder.js';
import { ProjectManager } from './ProjectManager.js';
import { THEATRES_CATALOG, DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';
import { Storage } from './Storage.js';
import { createHistoryWorker } from './HistoryWorker.js';

let worker = null;
const pendingMessages = new Map();
let messageIdCounter = 0;

function initWorker() {
    if (worker) return worker;
    worker = createHistoryWorker();
    worker.onmessage = (e) => {
        const { id, success, data, error } = e.data;
        if (pendingMessages.has(id)) {
            const { resolve, reject } = pendingMessages.get(id);
            pendingMessages.delete(id);
            if (success) resolve(data);
            else reject(new Error(error));
        }
    };
    return worker;
}

function sendWorkerMessage(type, key, data = null) {
    const w = initWorker();
    const id = messageIdCounter++;
    return new Promise((resolve, reject) => {
        pendingMessages.set(id, { resolve, reject });
        w.postMessage({ id, type, key, data });
    });
}

function compress(uncompressed) {
    let dictionary = {};
    for (let i = 0; i < 256; i++) {
        dictionary[String.fromCharCode(i)] = i;
    }
    let word = "";
    let result = [];
    let dictSize = 256;
    for (let i = 0; i < uncompressed.length; i++) {
        let c = uncompressed[i];
        let wc = word + c;
        if (dictionary.hasOwnProperty(wc)) {
            word = wc;
        } else {
            result.push(dictionary[word]);
            dictionary[wc] = dictSize++;
            word = String(c);
        }
    }
    if (word !== "") {
        result.push(dictionary[word]);
    }
    return result.map(code => String.fromCharCode(code)).join("");
}

function decompress(compressed) {
    let dictionary = {};
    for (let i = 0; i < 256; i++) {
        dictionary[i] = String.fromCharCode(i);
    }
    let codes = [];
    for (let i = 0; i < compressed.length; i++) {
        codes.push(compressed.charCodeAt(i));
    }
    let word = String.fromCharCode(codes[0]);
    let result = [word];
    let dictSize = 256;
    for (let i = 1; i < codes.length; i++) {
        let k = codes[i];
        let entry = "";
        if (dictionary.hasOwnProperty(k)) {
            entry = dictionary[k];
        } else if (k === dictSize) {
            entry = word + word.charAt(0);
        } else {
            throw new Error("Corrupted compressed data");
        }
        result.push(entry);
        dictionary[dictSize++] = word + entry.charAt(0);
        word = entry;
    }
    return result.join("");
}

export const History = {
    undoStack: [],
    redoStack: [],

    async save() {
        const state = serializeState();
        const stateStr = JSON.stringify(state);

        // Check if top state is same
        if (this.undoStack.length > 0) {
            const top = this.undoStack[this.undoStack.length - 1];
            let topStr = "";
            if (top.inRAM) {
                topStr = decompress(top.data);
            } else {
                try {
                    topStr = await sendWorkerMessage('read', `undo_${top.id}`);
                } catch(e) {
                    topStr = "";
                }
            }
            if (topStr === stateStr) return;
        }

        // Create new history descriptor
        const nextId = messageIdCounter++;
        const compressed = compress(stateStr);
        const item = { id: nextId, inRAM: true, data: compressed };
        
        this.undoStack.push(item);
        
        // Evict L1 (RAM) to L2 (IndexedDB via worker) if limit exceeded
        const ramItems = this.undoStack.filter(x => x.inRAM);
        if (ramItems.length > 5) {
            const oldestRAM = ramItems[0];
            oldestRAM.inRAM = false;
            sendWorkerMessage('write', `undo_${oldestRAM.id}`, decompress(oldestRAM.data))
                .catch(err => console.error('[History] Failed to write undo step to DB:', err));
            oldestRAM.data = null; // Free RAM memory
        }

        // Truncate total history
        if (this.undoStack.length > HISTORY_MAX) {
            const discarded = this.undoStack.shift();
            if (!discarded.inRAM) {
                sendWorkerMessage('delete', `undo_${discarded.id}`)
                    .catch(err => console.error('[History] Failed to delete undo step from DB:', err));
            }
        }

        // Clear Redo steps from DB and RAM
        this.redoStack.forEach(item => {
            if (!item.inRAM) {
                sendWorkerMessage('delete', `redo_${item.id}`).catch(() => {});
            }
        });
        this.redoStack = [];
        
        this.updateBtns();
        
        // Persist active state to Storage (IndexedDB)
        Storage.setItem(STORAGE_KEY, stateStr)
            .catch(err => console.error('[History] Failed to persist active state:', err));
    },

    async load(stateStr) {
        if (!stateStr) return;
        const state = JSON.parse(stateStr);
        baseBgColor.setHex(state.bg);

        // Restore active theater select and state in memory
        const theaterId = state.activeTheaterId || 'ninguno';
        const select = $('teatro-select');
        if (select) select.value = theaterId;
        ProjectManager.setActiveTheatreId(theaterId);
        ProjectManager.currentProject.theatre.hasContainer = state.hasContainer || false;

        // Restore custom container dimensions if present
        const cDims = state.containerDims || { w: 10, h: 5.5, d: 8, g: 9 };
        DEFAULT_CONTAINER.width = cDims.w;
        DEFAULT_CONTAINER.height = cDims.h;
        DEFAULT_CONTAINER.depth = cDims.d;
        DEFAULT_CONTAINER.grid = cDims.g;
        
        ProjectManager.currentProject.theatre.width = cDims.w;
        ProjectManager.currentProject.theatre.height = cDims.h;
        ProjectManager.currentProject.theatre.depth = cDims.d;
        ProjectManager.currentProject.theatre.grid = cDims.g;

        // Populate the UI input fields
        const inputW = $('c-ancho');
        const inputD = $('c-profundidad');
        const inputH = $('c-alto');
        const inputG = $('c-parrilla');
        if (inputW) inputW.value = cDims.w;
        if (inputD) inputD.value = cDims.d;
        if (inputH) inputH.value = cDims.h;
        if (inputG) inputG.value = cDims.g;
        
        if (window._initContainerUI) {
            window._initContainerUI(true);
        }

        // Rebuild theatre geometry dynamically
        const { rebuildTheatre } = await import('../theatre/TheatreFactory.js');
        if (theaterId === 'ninguno') {
            rebuildTheatre({ isEmpty: true });
        } else {
            const t = THEATRES_CATALOG.find(x => x.id === theaterId);
            if (t) {
                rebuildTheatre({
                    width: t.stage.width,
                    depth: t.stage.depth,
                    height: t.stage.height,
                    wallThickness: t.stage.wallThickness || 0.2,
                    barCount: t.stage.barCount || 5,
                    barRadius: t.stage.barRadius || 0.05
                });
            }
        }

        // Restore container custom translation and rotation if saved
        const containerGroup = Registry.findStructureById('contenedor-escenico');
        if (containerGroup && cDims.p) {
            containerGroup.position.fromArray(cDims.p);
            if (cDims.rot) {
                containerGroup.rotation.fromArray(cDims.rot);
            } else {
                containerGroup.rotation.set(0, 0, cDims.rz || 0);
            }
        }

        const banner = $('sync-banner');
        const boundIndicator = $('bound-indicator');
        const brandTitle = $('brand-title');
        
        if (theaterId === 'ninguno') {
            if (banner) banner.style.display = 'none';
            if (boundIndicator) {
                boundIndicator.innerHTML = `
                    <i class="ph ph-bounding-box" style="font-size:14px; margin-right:4px; vertical-align:middle;"></i>
                    <span style="font-size:11px;">Sin teatro activo <span class="dim">(solo contenedor)</span></span>`;
            }
            if (brandTitle) {
                brandTitle.innerHTML = 'SkeneCAD';
            }
        } else {
            const t = THEATRES_CATALOG.find(x => x.id === theaterId);
            if (t) {
                const nameEl = $('sync-theater-name');
                if (nameEl) nameEl.textContent = t.name;
                if (banner) banner.style.display = 'block';
                if (boundIndicator) {
                    boundIndicator.innerHTML = `
                        <i class="ph ph-bank" style="color:#5b9bff; font-size:14px; margin-right:4px; vertical-align:middle;"></i>
                        <span style="font-size:11px;">Teatro activo: <span class="accent">${t.name}</span> <span class="dim">(contenedor sin cambios)</span></span>`;
                }
                if (brandTitle) {
                    brandTitle.innerHTML = `SkeneCAD <span style="color:var(--text-dim); margin-left:4px;">| ${t.name}</span>`;
                }
            }
        }

        const brightnessSlider = $('brightness-slider');
        const v = brightnessSlider ? parseFloat(brightnessSlider.value) : 1;
        updateBrightness(v);

        const structures = Registry.getStructures();
        const wires = Registry.getWires();
        const stateIds = state.m.map(x => x.id);

        // Remove structures not in saved state
        for (let i = structures.length - 1; i >= 0; i--) {
            const m = structures[i];
            if (m.userData.id === 'piso' || m.userData.group === 'paredes' || m.userData.group === 'barras') {
                continue;
            }
            if (!stateIds.includes(m.userData.id)) {
                if (m.userData.isPersona) {
                    PersonasEngine.removePersona(m);
                }
                if (m.parent) {
                    m.parent.remove(m);
                } else {
                    scene.remove(m);
                }
                if (m.geometry) m.geometry.dispose();
                
                const wire = Registry.findWireById(m.userData.id);
                if (wire) {
                    if (wire.parent) {
                        wire.parent.remove(wire);
                    } else {
                        scene.remove(wire);
                    }
                    if (wire.geometry) wire.geometry.dispose();
                    Registry.removeWire(wire);
                }
                
                Registry.removeStructure(m);
            }
        }

        // Restore/create structures
        for (const sm of state.m) {
            if (sm.id === 'contenedor-escenico') continue; // Skip legacy solid container meshes
            let m = Registry.findStructureById(sm.id);
            if (!m) {
                if (sm.isFolder) {
                    m = new THREE.Object3D();
                    m.userData = {
                        id: sm.id,
                        group: sm.g,
                        name: sm.name,
                        isFolder: true,
                        layerVisible: sm.vis,
                        locked: sm.lock
                    };
                    Registry.addStructure(m);
                } else if (sm.isP) {
                    m = await PersonasEngine.createPersona(sm.pT, sm.name);
                    m.userData.id = sm.id;
                    m.userData.group = sm.g;
                    m.userData.useCustomSkin = sm.cSkin;
                    m.userData.customSkinColor = sm.cColor;
                    m.userData.spawnComplete = true; // Mark as finished since it is restored from history
                    PersonasEngine.updatePersonaMaterial(m);
                    
                    const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 1.7, 0.5));
                    const wireMat = new THREE.LineBasicMaterial({ color: sm.wire });
                    const wire = new THREE.LineSegments(wireGeo, wireMat);
                    wire.userData = { id: sm.id, group: sm.g, baseColor: new THREE.Color(sm.wire), layerVisible: sm.vis, isPersonaWire: true };
                    wire.position.y = 0.85;

                    m.position.fromArray(sm.p);
                    if (sm.rot) {
                        m.rotation.fromArray(sm.rot);
                    } else {
                        m.rotation.set(0, 0, sm.rz || 0);
                    }
                    wire.position.copy(m.position);
                    wire.rotation.copy(m.rotation);
                    wire.visible = false; // Never show the static fallback wire for Personas
                    
                    const container = Registry.findStructureById('contenedor-escenico');
                    if (container) {
                        container.add(m);
                        container.add(wire);
                    } else {
                        scene.add(m);
                        scene.add(wire);
                    }
                    Registry.addStructure(m);
                    Registry.addWire(wire);
                } else {
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
                        sm.id, sm.g, sm.p[0], sm.p[1], sm.p[2], 0, sm.type, sm.geo,
                        true // isLocal = true
                    );
                    if (sm.rot) {
                        m.rotation.fromArray(sm.rot);
                    } else {
                        m.rotation.set(0, 0, sm.rz || 0);
                    }
                    const wire = Registry.findWireById(sm.id);
                    if (wire) {
                        wire.rotation.copy(m.rotation);
                    }
                    m.userData.editable = sm.edit;
                }
            } else {
                m.position.fromArray(sm.p);
                if (sm.rot) {
                    m.rotation.fromArray(sm.rot);
                } else {
                    m.rotation.set(0, 0, sm.rz || 0);
                }
                m.userData.group = sm.g;
                if (sm.name) m.userData.name = sm.name;

                const container = Registry.findStructureById('contenedor-escenico');
                const isUserElement = (sm.g !== 'paredes' && sm.g !== 'barras' && sm.id !== 'piso');

                if (container && isUserElement) {
                    if (m.parent !== container) {
                        container.add(m);
                    }
                } else {
                    if (m.parent !== scene) {
                        scene.add(m);
                    }
                }
                
                if (sm.isP) {
                    m.userData.layerVisible = sm.vis;
                    m.userData.locked = sm.lock;
                    m.userData.useCustomSkin = sm.cSkin;
                    m.userData.customSkinColor = sm.cColor;
                    m.userData.spawnComplete = true; // Ensure it is marked as finished when loading history
                    PersonasEngine.updatePersonaMaterial(m);
                    PersonasEngine.updateAllometry(m, sm.h || 1.7);
                    const w = Registry.findWireById(sm.id);
                    if (w) {
                        w.userData.group = sm.g;
                        if (container && isUserElement) {
                            if (w.parent !== container) container.add(w);
                        } else {
                            if (w.parent !== scene) scene.add(w);
                        }
                        w.position.copy(m.position);
                        w.rotation.copy(m.rotation);
                        w.userData.baseColor.setHex(sm.wire);
                        w.userData.layerVisible = sm.vis;
                    }
                } else {
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
                        w.userData.group = sm.g;
                        if (container && isUserElement) {
                            if (w.parent !== container) container.add(w);
                        } else {
                            if (w.parent !== scene) scene.add(w);
                        }
                        w.geometry.dispose();
                        w.geometry = new THREE.EdgesGeometry(newGeo);
                        w.position.copy(m.position);
                        w.rotation.copy(m.rotation);
                        w.userData.baseColor.setHex(sm.wire);
                        w.userData.layerVisible = sm.vis;
                    }
                }
            }
        }

        // Re-render the tree from userProject state based on active category
        if (state.activeCategory) {
            switchCategory(state.activeCategory);
        }

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

    async undo() {
        if (this.undoStack.length <= 1) return;
        const top = this.undoStack.pop();
        this.redoStack.push(top);

        // Limit redo stack size too
        if (this.redoStack.length > HISTORY_MAX) {
            const discarded = this.redoStack.shift();
            if (!discarded.inRAM) {
                sendWorkerMessage('delete', `redo_${discarded.id}`).catch(() => {});
            }
        }

        // Evict redo RAM if needed (keep 5 in RAM)
        const redoRamItems = this.redoStack.filter(x => x.inRAM);
        if (redoRamItems.length > 5) {
            const oldestRedoRAM = redoRamItems[0];
            oldestRedoRAM.inRAM = false;
            sendWorkerMessage('write', `redo_${oldestRedoRAM.id}`, decompress(oldestRedoRAM.data))
                .catch(err => console.error('[History] Failed to write redo step to DB:', err));
            oldestRedoRAM.data = null;
        }

        // Load new top of undoStack
        const newTop = this.undoStack[this.undoStack.length - 1];
        let stateStr = "";
        if (newTop.inRAM) {
            stateStr = decompress(newTop.data);
        } else {
            stateStr = await sendWorkerMessage('read', `undo_${newTop.id}`);
            // Bring it back to RAM for fast toggling, and move another to DB
            newTop.inRAM = true;
            newTop.data = compress(stateStr);
            sendWorkerMessage('delete', `undo_${newTop.id}`).catch(() => {});
            
            // Re-evict if needed
            const ramItems = this.undoStack.filter(x => x.inRAM);
            if (ramItems.length > 5) {
                const oldestRAM = ramItems[0];
                oldestRAM.inRAM = false;
                sendWorkerMessage('write', `undo_${oldestRAM.id}`, decompress(oldestRAM.data)).catch(() => {});
                oldestRAM.data = null;
            }
        }

        await this.load(stateStr);
        this.updateBtns();
        
        // Persist active state
        Storage.setItem(STORAGE_KEY, stateStr).catch(() => {});
    },

    async redo() {
        if (this.redoStack.length === 0) return;
        const top = this.redoStack.pop();
        this.undoStack.push(top);

        // Evict undo RAM if needed
        const ramItems = this.undoStack.filter(x => x.inRAM);
        if (ramItems.length > 5) {
            const oldestRAM = ramItems[0];
            oldestRAM.inRAM = false;
            sendWorkerMessage('write', `undo_${oldestRAM.id}`, decompress(oldestRAM.data)).catch(() => {});
            oldestRAM.data = null;
        }

        // Load stateStr from top
        let stateStr = "";
        if (top.inRAM) {
            stateStr = decompress(top.data);
        } else {
            stateStr = await sendWorkerMessage('read', `redo_${top.id}`);
            // Bring back to RAM
            top.inRAM = true;
            top.data = compress(stateStr);
            sendWorkerMessage('delete', `redo_${top.id}`).catch(() => {});
            
            // Re-evict redo if needed
            const redoRamItems = this.redoStack.filter(x => x.inRAM);
            if (redoRamItems.length > 5) {
                const oldestRedoRAM = redoRamItems[0];
                oldestRedoRAM.inRAM = false;
                sendWorkerMessage('write', `redo_${oldestRedoRAM.id}`, decompress(oldestRedoRAM.data)).catch(() => {});
                oldestRedoRAM.data = null;
            }
        }

        await this.load(stateStr);
        this.updateBtns();
        
        // Persist active state
        Storage.setItem(STORAGE_KEY, stateStr).catch(() => {});
    },

    updateBtns() {
        const btnUndo = $('btn-undo');
        const btnRedo = $('btn-redo');
        if (btnUndo) btnUndo.classList.toggle('disabled', this.undoStack.length <= 1);
        if (btnRedo) btnRedo.classList.toggle('disabled', this.redoStack.length === 0);
    },

    /**
     * Restore from Storage
     */
    async restoreFromStorage() {
        const savedState = await Storage.getItem(STORAGE_KEY);
        if (savedState) {
            try {
                const nextId = messageIdCounter++;
                this.undoStack.push({ id: nextId, inRAM: true, data: compress(savedState) });
                await this.load(savedState);
            } catch (e) {
                console.warn('Estado guardado inválido, reiniciando.', e);
                await Storage.removeItem(STORAGE_KEY);
                await this.save();
            }
        } else {
            await this.save();
        }
    }
};
