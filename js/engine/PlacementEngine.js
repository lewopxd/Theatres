import * as THREE from 'three';
import { Registry } from '../core/Registry.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';

export const PlacementEngine = {
    MAX_PERSONAS: 50,

    /**
     * Verifica si se alcanzó el límite máximo de personas en escena.
     */
    canSpawnPersona() {
        let count = 0;
        for (const mesh of Registry.getStructures()) {
            if (mesh.userData && mesh.userData.isPersona) {
                count++;
            }
        }
        return count < this.MAX_PERSONAS;
    },

    /**
     * Encuentra una coordenada libre en el plano XZ usando búsqueda radial orgánica.
     * @param {number} personaRadius El radio de colisión de una persona.
     * @param {number} attempt Intento actual (para reducción progresiva).
     */
    getValidSpawnPosition(personaRadius = 0.4, attempt = 1) {
        const meshes = Registry.getStructures();
        
        // Query container local dimensions and position to restrict spawn area inside the container
        const w = ProjectManager.currentProject.theatre.width || DEFAULT_CONTAINER.width;
        const d = ProjectManager.currentProject.theatre.depth || DEFAULT_CONTAINER.depth;
        const limitX = w / 2 - 0.4;
        const limitZ = d / 2 - 0.4;

        const cg = Registry.findStructureById('contenedor-escenico');
        const centerX = cg ? cg.position.x : 0;
        const centerZ = cg ? cg.position.z : 0;

        // Perform concentric search around the container center
        for (let r = 0; r <= 5.0; r += 0.5) {
            const numAttempts = r === 0 ? 1 : Math.ceil(r * 12);
            
            for (let i = 0; i < numAttempts; i++) {
                let x = centerX;
                let z = centerZ;
                
                if (r > 0) {
                    const angle = Math.random() * Math.PI * 2;
                    const currentRadius = r + (Math.random() * 0.5);
                    x = centerX + Math.cos(angle) * currentRadius;
                    z = centerZ + Math.sin(angle) * currentRadius;
                }
                
                // Verify if candidate coordinate is within container boundaries
                if (x < centerX - limitX || x > centerX + limitX || z < centerZ - limitZ || z > centerZ + limitZ) {
                    continue;
                }
                
                let collision = false;
                for (const mesh of meshes) {
                    // Ignore main floor and scenic container in collision check
                    if (mesh.userData && (mesh.userData.id === 'piso' || mesh.userData.id === 'contenedor-escenico')) continue;
                    
                    if (mesh.userData && mesh.userData.isPersona) {
                        const dx = x - mesh.position.x;
                        const dz = z - mesh.position.z;
                        const dist = Math.sqrt(dx*dx + dz*dz);
                        if (dist < personaRadius * 2) {
                            collision = true;
                            break;
                        }
                    } else {
                        // Skip meshes without geometry (such as groups)
                        if (!mesh.geometry) continue;

                        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                        const box = mesh.geometry.boundingBox.clone();
                        box.applyMatrix4(mesh.matrixWorld);
                        
                        box.min.x -= personaRadius;
                        box.max.x += personaRadius;
                        box.min.z -= personaRadius;
                        box.max.z += personaRadius;
                        
                        if (x > box.min.x && x < box.max.x && z > box.min.z && z < box.max.z) {
                            collision = true;
                            break;
                        }
                    }
                }
                
                if (!collision) {
                    return new THREE.Vector3(x, 0, z);
                }
            }
        }
        
        // Fallback random position within container limits
        if (attempt > 3) {
            return new THREE.Vector3(
                centerX + (Math.random() * 2 - 1) * limitX,
                0,
                centerZ + (Math.random() * 2 - 1) * limitZ
            );
        }
        
        return this.getValidSpawnPosition(personaRadius * 0.6, attempt + 1);
    }
};