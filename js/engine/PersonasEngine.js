// ============================================================
// PersonasEngine — Lógica de Alometría Continua y Animaciones
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { State } from '../core/State.js';

const loader = new GLTFLoader();

// Constantes de alometría proporcionadas (Huxley)
const EXP = {
    width:     0.94,
    torso:     0.96,
    neck:      0.80,
    head:      0.52,
    hand:      0.66,
    foot:      0.66,
    upperLimb: 1.08,
    lowerLimb: 1.00,
    limbGirth: 0.95
};

const EXPECTED_BONES = [
    'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
    'mixamorigNeck', 'mixamorigHead',
    'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand',
    'mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand',
    'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot',
    'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot'
];

// Registro de mixers de animaciones
const mixers = new Map();
const activeActions = new Map();

function uniform(f) { return { x: f, y: f, z: f }; }

function applyBoneWorld(bones, boneName, desiredWorld, inheritedFromParent) {
    const b = bones[boneName];
    if (!b) return inheritedFromParent;
    b.scale.set(
        desiredWorld.x / inheritedFromParent.x,
        desiredWorld.y / inheritedFromParent.y,
        desiredWorld.z / inheritedFromParent.z
    );
    return desiredWorld;
}

export const PersonasEngine = {
    
    /**
     * Llama esto en el loop principal
     * @param {number} delta 
     */
    update(delta) {
        if (!State.get('is3DMode')) return; // Pausar animaciones en modo 2D
        const isDragging = State.get('isDragging');
        mixers.forEach(mixer => {
            if (isDragging) return;
            mixer.update(delta);
        });
    },

    updatePersonaMaterial(mesh) {
        if (!mesh || !mesh.userData.isPersona) return;
        const data = mesh.userData;
        
        mesh.traverse(child => {
            if (child.isSkinnedMesh || child.isMesh) {
                // Do not override if it's the selection wireframe
                if (child.material && child.material.wireframe) return;

                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material;
                }
                
                if (data.useCustomSkin) {
                    if (!child.userData.customMaterial) {
                        child.userData.customMaterial = new THREE.MeshStandardMaterial({
                            color: new THREE.Color(data.customSkinColor || '#ffffff'),
                            roughness: 0.7,
                            metalness: 0.1
                        });
                    } else {
                        child.userData.customMaterial.color.set(data.customSkinColor || '#ffffff');
                    }
                    child.material = child.userData.customMaterial;
                } else {
                    if (child.userData.originalMaterial) {
                        child.material = child.userData.originalMaterial;
                    }
                }
            }
        });
    },

    async createPersona(type, name) {
        const file = type === 'male' ? 'male.glb' : 'female.glb';
        const url = `assets/modelos3d/personas/modelos/${file}`;
        
        return new Promise((resolve, reject) => {
            loader.load(url, (gltf) => {
                const model = gltf.scene;
                
                // Inicializar userData
                model.userData = {
                    isPersona: true,
                    personaType: type,
                    name: name || (type === 'male' ? 'Adult Male' : 'Adult Female'),
                    height: 1.70, // Base height
                    editable: true,
                    locked: false,
                    layerVisible: true,
                    baseScale: 1.0,
                    bones: {},
                    currentAction: null,
                    boundingBox: new THREE.Box3()
                };

                // Indexar huesos
                model.traverse((node) => {
                    if (node.isBone) model.userData.bones[node.name] = node;
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });

                model.updateMatrixWorld(true);
                const box = this.computeSkinnedBoundingBox(model);
                const originalHeight = box.max.y - box.min.y;
                
                // Si el originalHeight es muy cercano a 0 (ej. error de carga), proteger
                if (originalHeight > 0.01) {
                    model.userData.baseScale = 1.70 / originalHeight;
                }
                
                // Aplicar alometría base (1.70m)
                this.updateAllometry(model, 1.70);
                
                // Registrar mixer
                const mixer = new THREE.AnimationMixer(model);
                mixers.set(model.uuid, mixer);
                
                resolve(model);
            }, undefined, (err) => {
                console.error(`[PersonasEngine] Error cargando persona ${url}:`, err);
                
                // Fallback visual si no se encuentra el GLB
                const geo = new THREE.BoxGeometry(0.5, 1.7, 0.5);
                const mat = new THREE.MeshStandardMaterial({ color: type === 'male' ? 0x2288ff : 0xff33aa });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.y = 0.85;
                
                const group = new THREE.Group();
                group.add(mesh);
                
                group.userData = {
                    isPersona: true,
                    personaType: type,
                    name: name || (type === 'male' ? 'Adult Male' : 'Adult Female'),
                    height: 1.70,
                    editable: true,
                    locked: false,
                    layerVisible: true,
                    baseScale: 1.0,
                    bones: {},
                };
                
                resolve(group);
            });
        });
    },

    updateAllometry(model, targetH) {
        if (!model.userData.bones || Object.keys(model.userData.bones).length === 0) {
            // Es un modelo de fallback sin huesos
            const scaleY = targetH / 1.70;
            model.scale.set(1, scaleY, 1);
            return;
        }

        model.userData.height = targetH;
        const bones = model.userData.bones;
        const baseScale = model.userData.baseScale;
        const baseH = 1.70;
        const R = targetH / baseH;

        // Reset
        model.scale.set(1, 1, 1);
        Object.values(bones).forEach(b => b.scale.set(1, 1, 1));

        // 1. Escala portante global
        const factorY  = R;
        const factorXZ = Math.pow(R, EXP.width);
        model.scale.set(factorXZ * baseScale, factorY * baseScale, factorXZ * baseScale);

        const top = { x: factorXZ * baseScale, y: factorY * baseScale, z: factorXZ * baseScale };
        const wXZ = baseScale * Math.pow(R, EXP.width); 

        // 2. Correcciones por segmento
        let acc = top;
        acc = applyBoneWorld(bones, 'mixamorigSpine',  { x: wXZ, y: baseScale * Math.pow(R, EXP.torso * 1/3), z: wXZ }, acc);
        acc = applyBoneWorld(bones, 'mixamorigSpine1', { x: wXZ, y: baseScale * Math.pow(R, EXP.torso * 2/3), z: wXZ }, acc);
        const accSpine2 = applyBoneWorld(bones, 'mixamorigSpine2', { x: wXZ, y: baseScale * Math.pow(R, EXP.torso), z: wXZ }, acc);

        const accNeck = applyBoneWorld(bones, 'mixamorigNeck', uniform(baseScale * Math.pow(R, EXP.neck)), accSpine2);
        applyBoneWorld(bones, 'mixamorigHead', uniform(baseScale * Math.pow(R, EXP.head)), accNeck);

        ['Left', 'Right'].forEach(side => {
            const accArm = applyBoneWorld(bones, `mixamorig${side}Arm`, {
                x: baseScale * Math.pow(R, EXP.limbGirth), y: baseScale * Math.pow(R, EXP.upperLimb), z: baseScale * Math.pow(R, EXP.limbGirth)
            }, accSpine2);
            const accForeArm = applyBoneWorld(bones, `mixamorig${side}ForeArm`, {
                x: baseScale * Math.pow(R, EXP.limbGirth), y: baseScale * Math.pow(R, EXP.lowerLimb), z: baseScale * Math.pow(R, EXP.limbGirth)
            }, accArm);
            applyBoneWorld(bones, `mixamorig${side}Hand`, uniform(baseScale * Math.pow(R, EXP.hand)), accForeArm);
        });

        ['Left', 'Right'].forEach(side => {
            const accUpLeg = applyBoneWorld(bones, `mixamorig${side}UpLeg`, {
                x: baseScale * Math.pow(R, EXP.limbGirth), y: baseScale * Math.pow(R, EXP.upperLimb), z: baseScale * Math.pow(R, EXP.limbGirth)
            }, top);
            const accLeg = applyBoneWorld(bones, `mixamorig${side}Leg`, {
                x: baseScale * Math.pow(R, EXP.limbGirth), y: baseScale * Math.pow(R, EXP.lowerLimb), z: baseScale * Math.pow(R, EXP.limbGirth)
            }, accUpLeg);
            applyBoneWorld(bones, `mixamorig${side}Foot`, uniform(baseScale * Math.pow(R, EXP.foot)), accLeg);
        });

        // 3. Bloqueo de altura exacta
        model.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(model);
        let measuredHeight = box.max.y - box.min.y;
        if (measuredHeight > 0.0001) {
            const correction = targetH / measuredHeight;
            model.scale.y *= correction;
            model.updateMatrixWorld(true);
        }
        
        // No anclamos a Y=0 aquí porque el usuario puede moverlo. 
        // El movimiento (MoveTool) ya maneja la posición de todo el grupo.
    },

    async loadAsset(model, url, isAnimation) {
        if (!mixers.has(model.uuid)) return;
        
        return new Promise((resolve, reject) => {
            // Cache buster temporal para desarrollo
            const bypassUrl = `${url}?t=${Date.now()}`;
            loader.load(bypassUrl, (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                    const clip = gltf.animations[0];
                    clip.name = url + '_' + Date.now(); // FORZAR nombre único para evitar que el mixer reutilice la acción vieja
                    const mixer = mixers.get(model.uuid);
                    
                    const oldAction = activeActions.get(model.uuid);
                    const newAction = mixer.clipAction(clip);
                    
                    if (oldAction && oldAction !== newAction) {
                        newAction.reset();
                        newAction.setEffectiveTimeScale(1);
                        newAction.setEffectiveWeight(1);
                        newAction.play();
                        newAction.crossFadeFrom(oldAction, 0.3, true);
                    } else {
                        if (oldAction) oldAction.stop();
                        newAction.reset();
                        newAction.setEffectiveTimeScale(1);
                        newAction.play();
                        newAction.fadeIn(0.3); // Interpolamos suavemente
                    }
                    
                    activeActions.set(model.uuid, newAction);
                    
                    if (!isAnimation) {
                        // Es una pose, lo pausamos en el frame 0 o algo así
                        // o simplemente se corre pero es una animación estática
                    }
                    resolve();
                } else {
                    console.warn('[PersonasEngine] No se encontraron animaciones en', url);
                    resolve();
                }
            }, undefined, (err) => {
                console.error('[PersonasEngine] Error cargando asset', url, err);
                reject(err);
            });
        });
    },

    async fetchManifest(type) {
        try {
            const res = await fetch(`assets/modelos3d/personas/${type}/index.json?t=${Date.now()}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.error('Error fetching manifest for', type, e);
        }
        return [];
    },

    removePersona(model) {
        if (mixers.has(model.uuid)) {
            mixers.delete(model.uuid);
        }
        if (activeActions.has(model.uuid)) {
            activeActions.delete(model.uuid);
        }
    },

    stopAnimation(model) {
        if (mixers.has(model.uuid)) {
            const mixer = mixers.get(model.uuid);
            const oldAction = activeActions.get(model.uuid);
            if (oldAction) {
                oldAction.fadeOut(0.3);
            }
            setTimeout(() => {
                mixer.stopAllAction();
                activeActions.delete(model.uuid);
            }, 300);
        }
    },

    computeSkinnedBoundingBox(group) {
        const box = new THREE.Box3();
        group.updateMatrixWorld(true);
        const inverseGroupMatrix = group.matrixWorld.clone().invert();

        let hasSkinnedMesh = false;
        group.traverse((child) => {
            if (child.isSkinnedMesh && child.geometry && child.geometry.attributes.position) {
                hasSkinnedMesh = true;
                const pos = child.geometry.attributes.position;
                const vector = new THREE.Vector3();
                for (let i = 0; i < pos.count; i++) {
                    vector.fromBufferAttribute(pos, i);
                    child.applyBoneTransform(i, vector);
                    vector.applyMatrix4(child.matrixWorld);
                    vector.applyMatrix4(inverseGroupMatrix);
                    box.expandByPoint(vector);
                }
            } else if (child.isMesh && child.geometry && child.geometry.attributes.position) {
                const pos = child.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const vec = new THREE.Vector3().fromBufferAttribute(pos, i);
                    vec.applyMatrix4(child.matrixWorld);
                    vec.applyMatrix4(inverseGroupMatrix);
                    box.expandByPoint(vec);
                }
            }
        });

        if (box.isEmpty()) {
            // fallback local bounds
            box.set(new THREE.Vector3(-0.25, 0, -0.25), new THREE.Vector3(0.25, 1.7, 0.25));
        }

        return box;
    }
};
