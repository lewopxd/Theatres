// ============================================================
// DuplicateEngine — Duplica elementos seleccionados
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';
import { scene } from './SceneManager.js';
import { History } from '../core/History.js';
import { PersonasEngine } from './PersonasEngine.js';
import { createIcons } from '../utils/dom.js';
import { EventBus } from '../core/EventBus.js';

export const DuplicateEngine = {
    /**
     * Ejecuta la duplicación del elemento seleccionado
     */
    async execute() {
        const mesh = State.get('selectedMesh');
        const li = State.get('selectedLi');

        if (!mesh) {
            console.warn('[DuplicateEngine] No hay mesh seleccionado para duplicar.');
            return;
        }

        if (mesh.userData.isPersona) {
            await this.duplicatePersona(mesh, li);
        } else {
            this.duplicateStructure(mesh, li);
        }

        History.save();
    },

    duplicateStructure(originalMesh, originalLi) {
        const newId = `item-${Date.now()}`;
        
        // Clone Geometry and Material for independence
        const newGeo = originalMesh.geometry.clone();
        let newMat;
        if (Array.isArray(originalMesh.material)) {
            newMat = originalMesh.material.map(m => m.clone());
        } else {
            newMat = originalMesh.material.clone();
        }

        const newMesh = new THREE.Mesh(newGeo, newMat);
        
        // Copy UserData
        newMesh.userData = JSON.parse(JSON.stringify(originalMesh.userData));
        newMesh.userData.id = newId;
        newMesh.userData.name = originalMesh.userData.name + ' (Copia)';
        
        // Offset Position to avoid Z-fighting/overlapping
        newMesh.position.copy(originalMesh.position);
        newMesh.position.x += 0.5;
        newMesh.position.z += 0.5;
        newMesh.rotation.copy(originalMesh.rotation);
        newMesh.scale.copy(originalMesh.scale);

        // Copy shadow props
        newMesh.castShadow = originalMesh.castShadow;
        newMesh.receiveShadow = originalMesh.receiveShadow;

        // Clone Wire
        const originalWire = Registry.findWireById(originalMesh.userData.id);
        let newWire = null;
        if (originalWire) {
            const wireGeo = originalWire.geometry.clone();
            const wireMat = originalWire.material.clone();
            newWire = new THREE.LineSegments(wireGeo, wireMat);
            newWire.userData = JSON.parse(JSON.stringify(originalWire.userData));
            newWire.userData.id = newId;
            newWire.position.copy(newMesh.position);
            newWire.rotation.copy(newMesh.rotation);
            newWire.scale.copy(newMesh.scale);
            newWire.visible = originalWire.visible;
            if (originalMesh.parent && originalMesh.parent !== scene) {
                originalMesh.parent.add(newWire);
            } else {
                scene.add(newWire);
            }
            Registry.addWire(newWire);
        }

        if (originalMesh.parent && originalMesh.parent !== scene) {
            originalMesh.parent.add(newMesh);
        } else {
            scene.add(newMesh);
        }
        Registry.addStructure(newMesh);

        this.duplicateDOM(originalLi, newId, newMesh.userData.name);
        
        // Auto-select duplicate
        EventBus.emit('selection:clear');
        setTimeout(() => EventBus.emit('selection:restored', { mesh: newMesh }), 50);
    },

    async duplicatePersona(originalMesh, originalLi) {
        const newId = `item-${Date.now()}`;
        const pType = originalMesh.userData.personaType;
        const newName = originalMesh.userData.name + ' (Copia)';

        try {
            const newMesh = await PersonasEngine.createPersona(pType, newName);
            newMesh.userData.id = newId;
            newMesh.userData.group = originalMesh.userData.group;
            
            // Clone exact specific properties
            newMesh.userData.height = originalMesh.userData.height;
            newMesh.userData.useCustomSkin = originalMesh.userData.useCustomSkin;
            newMesh.userData.customSkinColor = originalMesh.userData.customSkinColor;
            
            // Apply scale and materials
            PersonasEngine.updateAllometry(newMesh, newMesh.userData.height);
            PersonasEngine.updatePersonaMaterial(newMesh);

            // Offset Position
            newMesh.position.copy(originalMesh.position);
            newMesh.position.x += 0.5;
            newMesh.position.z += 0.5;
            newMesh.rotation.copy(originalMesh.rotation);
            
            // Clone Wire fallback
            const originalWire = Registry.findWireById(originalMesh.userData.id);
            let randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            if (originalWire) {
                randomColor = '#' + originalWire.userData.baseColor.getHexString();
            }
            
            const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 1.7, 0.5));
            const wireMat = new THREE.LineBasicMaterial({ color: randomColor });
            const newWire = new THREE.LineSegments(wireGeo, wireMat);
            newWire.userData = { id: newId, group: newMesh.userData.group, baseColor: new THREE.Color(randomColor), layerVisible: true, isPersonaWire: true };
            newWire.position.copy(newMesh.position);
            newWire.position.y += 0.85;
            newWire.visible = false; 

            if (originalMesh.parent && originalMesh.parent !== scene) {
                originalMesh.parent.add(newMesh);
                originalMesh.parent.add(newWire);
            } else {
                scene.add(newMesh);
                scene.add(newWire);
            }
            Registry.addStructure(newMesh);
            Registry.addWire(newWire);

            this.duplicateDOM(originalLi, newId, newName);

            // Select
            EventBus.emit('selection:clear');
            setTimeout(() => EventBus.emit('selection:restored', { mesh: newMesh }), 50);

        } catch (e) {
            console.error('[DuplicateEngine] Fallo al duplicar persona', e);
        }
    },

    duplicateDOM(originalLi, newId, newName) {
        if (!originalLi) return;
        
        // originalLi is a .tree-node div. Its parent is the wrapper div containing the row + children.
        const originalWrapper = originalLi.parentElement;
        if (!originalWrapper) return;

        const newWrapper = originalWrapper.cloneNode(true);
        const newRow = newWrapper.querySelector('.tree-node');
        if (newRow) newRow.dataset.id = newId;
        
        // Update all specific targets inside the cloned node
        newWrapper.querySelectorAll('[data-target]').forEach(el => {
            el.dataset.target = newId;
        });

        // Update name
        const nameSpan = newWrapper.querySelector('.node-name');
        if (nameSpan) {
            nameSpan.textContent = newName;
        }

        // Insert after original wrapper
        originalWrapper.parentNode.insertBefore(newWrapper, originalWrapper.nextSibling);
    }
};
