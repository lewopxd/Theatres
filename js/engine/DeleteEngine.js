// ============================================================
// DeleteEngine — Elimina elementos/grupos de forma segura
// ============================================================

import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';
import { scene } from './SceneManager.js';
import { History } from '../core/History.js';
import { EventBus } from '../core/EventBus.js';
import { PersonasEngine } from './PersonasEngine.js';

export const DeleteEngine = {
    /**
     * Elimina el elemento actualmente seleccionado.
     */
    execute() {
        const mesh = State.get('selectedMesh');
        const li = State.get('selectedLi');

        if (!mesh && (!li || li.dataset.type !== 'grupo')) {
            console.warn('[DeleteEngine] Nada seleccionado para borrar.');
            return;
        }

        if (mesh) {
            this.deleteMesh(mesh);
        } else if (li && li.dataset.type === 'grupo') {
            this.deleteGroup(li);
        }

        EventBus.emit('selection:clear');
        History.save();
    },

    /**
     * Elimina un mesh, su wire y limpia memoria
     */
    deleteMesh(mesh) {
        if (!mesh) return;

        const id = mesh.userData.id;

        // Limpiar recursos de WebGL
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            } else {
                mesh.material.dispose();
            }
        }

        // Remover de la escena
        if (mesh.parent) {
            mesh.parent.remove(mesh);
        } else {
            scene.remove(mesh);
        }
        
        // Limpiar motores auxiliares
        if (mesh.userData.isPersona) {
            PersonasEngine.removePersona(mesh);
        }

        // Buscar y eliminar wire
        const wire = Registry.findWireById(id);
        if (wire) {
            if (wire.geometry) wire.geometry.dispose();
            if (wire.material) wire.material.dispose();
            if (wire.parent) {
                wire.parent.remove(wire);
            } else {
                scene.remove(wire);
            }
        }

        // Quitar del registro central
        Registry.removeById(id);

        // Remover del DOM
        const treeNode = document.querySelector(`.tree-node[data-id="${id}"]`);
        if (treeNode) {
            // Remove the wrapper div (parent of .tree-node)
            const wrapper = treeNode.parentElement;
            if (wrapper) wrapper.remove();
            else treeNode.remove();
        }
    },

    /**
     * Elimina un grupo y todos sus descendientes de forma recursiva
     */
    deleteGroup(groupLi) {
        if (!groupLi) return;
        
        // groupLi is a .tree-node div; its parent is the wrapper containing .tree-children
        const wrapper = groupLi.parentElement;
        const descendants = wrapper ? wrapper.querySelectorAll('.tree-node[data-id]') : [];
        descendants.forEach(node => {
            if (node.dataset.type === 'elemento') {
                const mesh = Registry.findStructureById(node.dataset.id);
                if (mesh) {
                    this.deleteMesh(mesh);
                }
            }
        });

        // Eliminar el nodo padre final (wrapper)
        if (wrapper) wrapper.remove();
        else groupLi.remove();
    }
};
