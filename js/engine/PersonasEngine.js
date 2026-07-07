// ============================================================
// PersonasEngine — Lógica de Alometría Continua y Animaciones
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';

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
const spawningMeshes = [];
let spawnManifest = null;

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
    
    isSpawningAny() {
        return spawningMeshes.length > 0;
    },

    /**
     * Llama esto en el loop principal
     * @param {number} delta 
     */
    update(delta) {
        if (!State.get('is3DMode')) return; // Pausar animaciones en modo 2D
        
        for (let i = spawningMeshes.length - 1; i >= 0; i--) {
            const mesh = spawningMeshes[i];
            
            // Procesar Tween de Root Motion
            if (mesh.userData.pendingRootMotion) {
                const rm = mesh.userData.pendingRootMotion;
                if (rm.time < rm.duration) {
                    rm.time += delta;
                    let t = rm.duration > 0 ? rm.time / rm.duration : 1;
                    if (t > 1) t = 1;
                    
                    mesh.position.x = rm.startX + rm.dx * t;
                    mesh.position.z = rm.startZ + rm.dz * t;
                    mesh.updateMatrixWorld(true);
                    
                    if (t === 1) {
                        mesh.userData.pendingRootMotion = null;
                        if (State.get('selectedMesh') === mesh) {
                            EventBus.emit('selection:restored', { mesh });
                        }
                    }
                }
            }
            
            if (mesh.userData.spawnState === 'falling') {
                // Físicas de aceleración (Gravedad tipo juego: 15 m/s^2)
                mesh.userData.fallVelocity += 15.0 * delta;
                mesh.position.y -= mesh.userData.fallVelocity * delta;
                
                mesh.updateMatrixWorld(true);
                
                // Grace period: evitar falsos positivos de posturas altas iniciales
                if (Date.now() - mesh.userData.fallStartTime > 250) {
                    const lowestY = this.getLowestBoneY(mesh);
                    if (lowestY <= 0.02) { // 2cm de padding para la piel/ropa
                        const diff = 0.02 - lowestY;
                        mesh.position.y += diff;
                        mesh.updateMatrixWorld(true);
                        
                        mesh.userData.spawnState = 'impact';
                        
                        const impactAnim = mesh.userData.spawnImpactAnim || 'landing.glb';
                        
                        const playRecovery = () => {
                            if (mesh.userData.spawnState !== 'recovery') return; // Cancelado
                            
                            const recoveryAnim = mesh.userData.spawnRecoveryAnim || 'landing.glb';
                            if (recoveryAnim === 'none') {
                                if (mesh.userData.spawnUseFinalPose) {
                                    this.calculateRootMotion(mesh);
                                    this.stopAnimation(mesh, 0.5);
                                    this.consumeRootMotion(mesh, 0.5);
                                }
                                mesh.userData.spawnState = 'done';
                                return;
                            }
                            
                            this.calculateRootMotion(mesh);
                            const fadeToRecovery = mesh.userData.spawnFadeToRecovery !== undefined ? mesh.userData.spawnFadeToRecovery : 0.3;
                            this.loadAsset(mesh, `assets/modelos3d/personas/spawn/${recoveryAnim}`, true, true, false, fadeToRecovery).then(() => {
                                this.consumeRootMotion(mesh, fadeToRecovery);
                                const recAction = activeActions.get(mesh.uuid);
                                const recDuration = recAction ? recAction.getClip().duration * 1000 : 1500;
                                
                                this.recordHipStart(mesh);

                                setTimeout(() => {
                                    if (mesh.userData.spawnState !== 'recovery') return; // Cancelado
                                    
                                    if (mesh.userData.spawnUseFinalPose) {
                                        this.calculateRootMotion(mesh);
                                        this.stopAnimation(mesh, 0.5);
                                        this.consumeRootMotion(mesh, 0.5);
                                    }
                                    
                                    mesh.userData.spawnState = 'done';
                                }, Math.max(recDuration - (mesh.userData.spawnCutMs || 500), 300));
                            }).catch(e => {
                                if (mesh.userData.spawnUseFinalPose) {
                                    this.stopAnimation(mesh, 0.5);
                                }
                                mesh.userData.spawnState = 'done';
                            });
                        };

                        if (impactAnim === 'none') {
                            this.calculateRootMotion(mesh);
                            // No llamar stopAnimation aquí, dejar que playRecovery haga crossfade natural
                            this.consumeRootMotion(mesh, 0); // Consumo instantáneo porque la caída casi no tiene XZ delta
                            mesh.userData.spawnState = 'recovery';
                            playRecovery();
                        } else {
                            // Disparar animación de impacto
                            this.calculateRootMotion(mesh);
                            const fadeToImpact = mesh.userData.spawnFadeToImpact !== undefined ? mesh.userData.spawnFadeToImpact : 0.3;
                            this.loadAsset(mesh, `assets/modelos3d/personas/spawn/${impactAnim}`, true, true, false, fadeToImpact).then(() => {
                                this.consumeRootMotion(mesh, fadeToImpact);
                                const action = activeActions.get(mesh.uuid);
                                const duration = action ? action.getClip().duration * 1000 : 1500;
                                
                                this.recordHipStart(mesh);
                                
                                setTimeout(() => {
                                    if (mesh.userData.spawnState !== 'impact') return; // Cancelado
                                    
                                    mesh.userData.spawnState = 'recovery';
                                    playRecovery();
                                }, Math.max(duration - 200, 500));
                            }).catch(e => {
                                console.warn(`[PersonasEngine] Error cargando impacto en spawn/.`);
                                if (mesh.userData.spawnUseFinalPose) {
                                    this.stopAnimation(mesh, 0.5);
                                }
                                mesh.userData.spawnState = 'done';
                            });
                        }
                    }
                }
                
                // Si el objeto cayendo es el seleccionado, actualizamos UI live
                if (State.get('selectedMesh') === mesh && mesh.userData.spawnState === 'falling') {
                    EventBus.emit('statusbar:coords', { mesh });
                    EventBus.emit('properties:refreshLive');
                }
            } else if (mesh.userData.spawnState === 'impact' || mesh.userData.spawnState === 'recovery' || (mesh.userData.spawnState === 'done' && mesh.userData.pendingRootMotion)) {
                // --- CONTINUOUS DYNAMIC GROUNDING ---
                // Evita que las animaciones atraviesen el piso (lo empuja hacia arriba)
                const lowestY = this.getLowestBoneY(mesh);
                if (lowestY < 0.02) {
                    mesh.position.y += (0.02 - lowestY);
                    mesh.updateMatrixWorld(true);
                } else if (lowestY > 0.05) {
                    // Si quedó flotando por el empuje de la animación anterior, lo baja suavemente al piso
                    mesh.position.y -= 4.0 * delta; 
                    mesh.updateMatrixWorld(true);
                    
                    const newLowestY = this.getLowestBoneY(mesh);
                    if (newLowestY < 0.02) {
                        mesh.position.y += (0.02 - newLowestY);
                        mesh.updateMatrixWorld(true);
                    }
                }
                
                if (State.get('selectedMesh') === mesh) {
                    EventBus.emit('statusbar:coords', { mesh });
                }
            }
        }
        
        // Limpieza de objetos que ya terminaron la secuencia y no tienen tweens pendientes
        for (let i = spawningMeshes.length - 1; i >= 0; i--) {
            const mesh = spawningMeshes[i];
            if (mesh.userData.spawnState === 'done' && !mesh.userData.pendingRootMotion) {
                mesh.userData.spawnComplete = true;
                if (!mesh.userData.hasBeenMoved) {
                    if (mesh.parent && !mesh.parent.isScene) {
                        const h = ProjectManager.currentProject.theatre.height || DEFAULT_CONTAINER.height;
                        mesh.position.y = -h / 2;
                    } else {
                        mesh.position.y = 0;
                    }
                    mesh.updateMatrixWorld(true);
                }
                spawningMeshes.splice(i, 1);
            }
        }

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

    async loadAsset(model, url, isAnimation, loopOnce = false, skipCrossfade = false, fadeTime = 0.3) {
        if (!mixers.has(model.uuid)) return;
        
        return new Promise((resolve, reject) => {
            // Cache buster temporal para desarrollo
            const bypassUrl = `${url}?t=${Date.now()}`;
            loader.load(bypassUrl, (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                    const newAction = mixers.get(model.uuid).clipAction(gltf.animations[0]);
                    const oldAction = activeActions.get(model.uuid);
                    
                    if (loopOnce) {
                        newAction.setLoop(THREE.LoopOnce, 1);
                        newAction.clampWhenFinished = true;
                    } else {
                        newAction.setLoop(THREE.LoopRepeat);
                        newAction.clampWhenFinished = false;
                    }
                    
                    if (oldAction && oldAction !== newAction) {
                        if (skipCrossfade) {
                            oldAction.stop();
                            newAction.reset();
                            newAction.setEffectiveTimeScale(1);
                            newAction.setEffectiveWeight(1);
                            newAction.play();
                        } else {
                            newAction.reset();
                            newAction.setEffectiveTimeScale(1);
                            newAction.setEffectiveWeight(1);
                            newAction.play();
                            newAction.crossFadeFrom(oldAction, fadeTime, true);
                        }
                    } else {
                        if (oldAction) oldAction.stop();
                        newAction.reset();
                        newAction.setEffectiveTimeScale(1);
                        newAction.play();
                        newAction.fadeIn(fadeTime); // Interpolamos suavemente
                    }
                    
                    activeActions.set(model.uuid, newAction);
                    
                    if (!isAnimation) {
                        model.userData.currentPose = url;
                    }
                    resolve();
                } else {
                    console.warn('[PersonasEngine] No se encontraron animaciones en', url);
                    resolve();
                }
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

    stopAnimation(model, fadeDuration = 0) {
        if (mixers.has(model.uuid)) {
            const mixer = mixers.get(model.uuid);
            
            // Cancelar timeout previo si existe para no matar animaciones nuevas
            if (model.userData.stopAnimTimeout) {
                clearTimeout(model.userData.stopAnimTimeout);
                model.userData.stopAnimTimeout = null;
            }
            
            if (fadeDuration > 0) {
                const action = activeActions.get(model.uuid);
                if (action) {
                    action.fadeOut(fadeDuration);
                    model.userData.stopAnimTimeout = setTimeout(() => {
                        mixer.stopAllAction();
                        activeActions.delete(model.uuid);
                        model.userData.stopAnimTimeout = null;
                    }, fadeDuration * 1000);
                } else {
                    mixer.stopAllAction();
                    activeActions.delete(model.uuid);
                }
            } else {
                mixer.stopAllAction();
                activeActions.delete(model.uuid);
            }
        }
    },

    recordHipStart(mesh) {
        if (!mesh) return;
        const hips = mesh.getObjectByName('mixamorigHips') || mesh.getObjectByName('Hips') || mesh.getObjectByName('Cadera') || mesh.getObjectByName('hip');
        if (hips) {
            mesh.updateMatrixWorld(true);
            const startHips = new THREE.Vector3();
            hips.getWorldPosition(startHips);
            mesh.userData.spawnStartHips = startHips;
        }
    },

    calculateRootMotion(mesh) {
        if (!mesh || !mesh.userData.spawnStartHips) return;
        const hips = mesh.getObjectByName('mixamorigHips') || mesh.getObjectByName('Hips') || mesh.getObjectByName('Cadera') || mesh.getObjectByName('hip');
        if (hips) {
            mesh.updateMatrixWorld(true);
            const endHips = new THREE.Vector3();
            hips.getWorldPosition(endHips);
            
            const dx = endHips.x - mesh.userData.spawnStartHips.x;
            const dz = endHips.z - mesh.userData.spawnStartHips.z;
            
            mesh.userData.pendingRootMotion = { dx, dz };
        }
    },

    getLowestBoneY(mesh) {
        let lowestY = Infinity;
        const helper = new THREE.Vector3();
        mesh.traverse(child => {
            if (child.isBone) {
                child.getWorldPosition(helper);
                if (helper.y < lowestY) lowestY = helper.y;
            }
        });
        return lowestY;
    },

    consumeRootMotion(mesh, duration = 0.3) {
        if (!mesh || !mesh.userData.pendingRootMotion) return;
        
        if (duration <= 0) {
            mesh.position.x += mesh.userData.pendingRootMotion.dx;
            mesh.position.z += mesh.userData.pendingRootMotion.dz;
            mesh.updateMatrixWorld(true);
            mesh.userData.pendingRootMotion = null;
            mesh.userData.spawnStartHips = null;
            
            if (State.get('selectedMesh') === mesh) {
                EventBus.emit('selection:restored', { mesh });
                EventBus.emit('statusbar:coords', { mesh });
                EventBus.emit('properties:refreshLive');
            }
        } else {
            mesh.userData.pendingRootMotion.duration = duration;
            mesh.userData.pendingRootMotion.time = 0;
            mesh.userData.pendingRootMotion.startX = mesh.position.x;
            mesh.userData.pendingRootMotion.startZ = mesh.position.z;
            mesh.userData.spawnStartHips = null; // Limpiar para el siguiente
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
    },

    async playRandomSpawnSequence(mesh) {
        if (!mesh || !mesh.userData.isPersona) return;
        try {
            const res = await fetch(`assets/modelos3d/personas/spawn/sequences.json?t=${Date.now()}`);
            if (res.ok) {
                const sequences = await res.json();
                if (sequences && sequences.length > 0) {
                    const seq = sequences[Math.floor(Math.random() * sequences.length)];
                    this.playSpawnSequence(mesh, seq.fall, seq.impact, seq.recovery, seq.cutMs, seq.useFinalPose, seq.fadeToImpact, seq.fadeToRecovery);
                } else {
                    this.playSpawnSequence(mesh);
                }
            } else {
                this.playSpawnSequence(mesh);
            }
        } catch (e) {
            console.error('[PersonasEngine] Error loading sequences for random spawn:', e);
            this.playSpawnSequence(mesh);
        }
    },

    async playSpawnSequence(mesh, forceFall = null, forceImpact = null, forceRecovery = null, cutMs = 500, useFinalPose = true, fadeImpact = 0.3, fadeRecovery = 0.3) {
        if (!mesh || !mesh.userData.isPersona) return;
        
        // Limpiar cualquier estado previo o animación en curso
        this.stopAnimation(mesh); 
        mesh.userData.pendingRootMotion = null;
        mesh.userData.spawnStartHips = null;
        mesh.userData.spawnCutMs = cutMs;
        mesh.userData.spawnUseFinalPose = useFinalPose;
        mesh.userData.spawnFadeToImpact = fadeImpact;
        mesh.userData.spawnFadeToRecovery = fadeRecovery;
        mesh.userData.fallStartTime = Date.now();
        mesh.userData.fallVelocity = 0;
        
        mesh.userData.spawnState = 'preparing_fall'; // Pausamos físicas hasta que cargue la animación
        if (mesh.position.y <= 0.05) {
            mesh.position.y = 6.0; // Default fallback height
        }
        mesh.updateMatrixWorld(true);
        
        if (State.get('selectedMesh') === mesh) {
            EventBus.emit('statusbar:coords', { mesh });
            EventBus.emit('properties:refreshLive');
        }
        
        if (!spawningMeshes.includes(mesh)) {
            spawningMeshes.push(mesh);
        }
        
        if (!spawnManifest) {
            try {
                const res = await fetch(`assets/modelos3d/personas/spawn/index.json?t=${Date.now()}`);
                if (res.ok) spawnManifest = await res.json();
            } catch (e) {
                console.warn('[PersonasEngine] No se pudo cargar spawn manifest.', e);
                spawnManifest = { falling: [], impact: [], recovery: [] };
            }
        }
        
        let fallingAnim = forceFall || 'falling.glb';
        let impactAnim = forceImpact || 'landing.glb';
        let recoveryAnim = forceRecovery || 'landing.glb';
        
        if (!forceFall && spawnManifest && spawnManifest.falling && spawnManifest.falling.length > 0) {
            fallingAnim = spawnManifest.falling[Math.floor(Math.random() * spawnManifest.falling.length)];
        }
        if (!forceImpact && spawnManifest && spawnManifest.impact && spawnManifest.impact.length > 0) {
            impactAnim = spawnManifest.impact[Math.floor(Math.random() * spawnManifest.impact.length)];
        }
        if (!forceRecovery && spawnManifest && spawnManifest.recovery && spawnManifest.recovery.length > 0) {
            recoveryAnim = spawnManifest.recovery[Math.floor(Math.random() * spawnManifest.recovery.length)];
        }
        
        mesh.userData.spawnImpactAnim = impactAnim;
        mesh.userData.spawnRecoveryAnim = recoveryAnim;
        
        try {
            await this.loadAsset(mesh, `assets/modelos3d/personas/spawn/${fallingAnim}`, true, false);
            mesh.userData.spawnState = 'falling'; // Habilitar física de caída ahora que la animación corre
            this.recordHipStart(mesh); // Iniciar seguimiento de caída
        } catch(e) {
            console.warn(`[PersonasEngine] ${fallingAnim} no encontrado. El personaje caerá en T-Pose.`);
            mesh.userData.spawnState = 'falling'; // Habilitar física de todos modos
        }
    },

    /**
     * Limpia un personaje de la memoria de animaciones
     * @param {THREE.Object3D} mesh 
     */
    removePersona(mesh) {
        if (!mesh) return;
        const uuid = mesh.uuid;
        if (mixers.has(uuid)) {
            mixers.get(uuid).stopAllAction();
            mixers.delete(uuid);
        }
        if (activeActions.has(uuid)) {
            activeActions.delete(uuid);
        }
        const idx = spawningMeshes.indexOf(mesh);
        if (idx > -1) spawningMeshes.splice(idx, 1);
    }
};
