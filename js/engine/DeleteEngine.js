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
        scene.remove(mesh);
        
        // Limpiar motores auxiliares
        if (mesh.userData.isPersona) {
            PersonasEngine.removePersona(mesh);
        }

        // Buscar y eliminar wire
        const wire = Registry.findWireById(id);
        if (wire) {
            if (wire.geometry) wire.geometry.dispose();
            if (wire.material) wire.material.dispose();
            scene.remove(wire);
        }

        // Quitar del registro central
        Registry.removeById(id);

        // Remover del DOM
        const li = document.querySelector(`li[data-id="${id}"]`);
        if (li) {
            li.remove();
        }
    },

    /**
     * Elimina un grupo y todos sus descendientes de forma recursiva
     */
    deleteGroup(groupLi) {
        if (!groupLi) return;
        
        // Buscar todos los hijos que tengan data-id (meshes o subgrupos)
        const descendants = groupLi.querySelectorAll('li[data-id]');
        descendants.forEach(li => {
            if (li.dataset.type === 'elemento') {
                const mesh = Registry.findStructureById(li.dataset.id);
                if (mesh) {
                    this.deleteMesh(mesh);
                }
            }
        });

        // Eliminar el nodo padre final
        groupLi.remove();
    }
};
