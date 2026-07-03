import * as THREE from 'three';
import { Registry } from '../core/Registry.js';

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
        
        // Limites del escenario (asumiendo DEFAULT_STAGE aprox 8x7.5)
        // Restamos un poco para no pegarlos exactamente a la pared
        const limitX = 3.4; 
        const limitZ = 3.2;

        // Hacemos círculos concéntricos crecientes hasta el límite del escenario
        for (let r = 0; r <= 5.0; r += 0.5) {
            // Intentar N veces aleatorias dentro de este anillo
            const numAttempts = r === 0 ? 1 : Math.ceil(r * 12);
            
            for (let i = 0; i < numAttempts; i++) {
                let x = 0;
                let z = 0;
                
                if (r > 0) {
                    const angle = Math.random() * Math.PI * 2;
                    const currentRadius = r + (Math.random() * 0.5);
                    x = Math.cos(angle) * currentRadius;
                    z = Math.sin(angle) * currentRadius;
                }
                
                // Verificar si se salió del escenario
                if (x < -limitX || x > limitX || z < -limitZ || z > limitZ) {
                    continue; // Intentar otro punto
                }
                
                let collision = false;
                for (const mesh of meshes) {
                    // Ignorar el piso principal para las colisiones XZ
                    if (mesh.userData && mesh.userData.id === 'piso') continue;
                    
                    if (mesh.userData && mesh.userData.isPersona) {
                        const dx = x - mesh.position.x;
                        const dz = z - mesh.position.z;
                        const dist = Math.sqrt(dx*dx + dz*dz);
                        if (dist < personaRadius * 2) {
                            collision = true;
                            break;
                        }
                    } else {
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
        
        // Si no encontró nada y ya redujo mucho, lo pone en un lugar aleatorio dentro del límite
        if (attempt > 3) {
            return new THREE.Vector3(
                (Math.random() * 2 - 1) * limitX,
                0,
                (Math.random() * 2 - 1) * limitZ
            );
        }
        
        // Si no encontró nada, reduce el radio de separación un 40% y vuelve a intentar
        return this.getValidSpawnPosition(personaRadius * 0.6, attempt + 1);
    }
};