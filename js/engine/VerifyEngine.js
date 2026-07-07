// ============================================================
// VerifyEngine — Verifica si los elementos de la escena caben 
// dentro de las dimensiones del teatro seleccionado.
// ============================================================

import * as THREE from 'three';
import { Registry } from '../core/Registry.js';

/**
 * Ejecuta la verificación de todos los elementos del usuario
 * contra las dimensiones de un teatro.
 * @param {Object} theater - Datos del teatro (ancho, profundidad, alto, parrilla)
 * @returns {Array} Resultados por cada elemento verificado
 */
export function runVerification(theater) {
    const results = [];
    
    // Obtenemos solo los elementos del usuario (escenografía, luces, etc.)
    // Ignoramos la arquitectura porque el diseño es independiente
    const structures = Registry.getStructures().filter(mesh => {
        // Ignoramos paredes, piso, barras, y ayudantes
        const group = mesh.userData.group;
        if (!group) return false;
        if (['paredes', 'barras', 'arquitectura'].includes(group) || mesh.userData.id === 'piso') return false;
        if (mesh.userData.isHelper || mesh.userData.isLine) return false;
        return true;
    });

    const box3 = new THREE.Box3();

    structures.forEach(mesh => {
        // Calcular el bounding box global del elemento
        box3.setFromObject(mesh);
        
        // Dimensiones del bounding box
        const size = box3.getSize(new THREE.Vector3());
        
        // Posiciones absolutas (asumiendo que el centro (0,0,0) es el centro del proscenio a nivel del piso)
        // El teatro va de X: -ancho/2 a +ancho/2
        // El teatro va de Z: -profundidad/2 a +profundidad/2 (o 0 a -prof, dependiendo del sistema, asumimos centrado)
        // El teatro va de Y: 0 a alto
        
        const halfWidth = theater.ancho / 2;
        const halfDepth = theater.profundidad / 2;
        
        const issues = [];
        
        // Verificación de Ancho (X)
        if (box3.max.x > halfWidth || box3.min.x < -halfWidth) {
            issues.push(`Excede el ancho (Límites: ±${halfWidth.toFixed(1)}m)`);
        }
        
        // Verificación de Profundidad (Z)
        if (box3.max.z > halfDepth || box3.min.z < -halfDepth) {
            issues.push(`Excede la profundidad (Límites: ±${halfDepth.toFixed(1)}m)`);
        }
        
        // Verificación de Altura (Y)
        if (box3.max.y > theater.alto) {
            // Chequear si es un elemento colgado que necesita parrilla
            if (mesh.position.y > theater.alto && box3.max.y <= theater.parrilla) {
                // Está en la parrilla, es válido
            } else if (box3.max.y > theater.parrilla) {
                issues.push(`Excede altura de parrilla (${theater.parrilla}m)`);
            } else {
                issues.push(`Excede altura del arco (${theater.alto}m)`);
            }
        }
        
        // Check colisiones debajo del piso
        if (box3.min.y < 0) {
            issues.push('Atraviesa el piso del escenario');
        }

        // Obtener el nombre del nodo del árbol usando el ID
        let nodeName = mesh.userData.name || mesh.userData.id;
        const treeNode = document.querySelector(`.tree-node[data-id="${mesh.userData.id}"] .node-name`);
        if (treeNode) {
            nodeName = treeNode.textContent;
        }

        results.push({
            name: nodeName,
            ok: issues.length === 0,
            issues: issues
        });
    });

    // Si no hay elementos, devolvemos un mensaje de éxito genérico
    if (results.length === 0) {
        results.push({
            name: "El escenario está vacío",
            ok: true,
            issues: []
        });
    }

    return results;
}
