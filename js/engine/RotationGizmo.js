import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { State } from '../core/State.js';
import { PersonasEngine } from './PersonasEngine.js';
import { getObjectBounds } from './MoveHandle.js';

/**
 * SISTEMA DE COORDENADAS (APP vs THREE.JS):
 * - Z (Azul): El eje apunta hacia arriba (corresponde al eje Y en Three.js).
 * - Y (Verde): El eje apunta hacia la cámara/pantalla del observador (corresponde al eje Z en Three.js).
 * - X (Morado/Rojo): El eje apunta hacia el lado derecho (corresponde al eje X en Three.js).
 * 
 * ROTACIÓN Y SEGMENTOS:
 * Al fijar offsetRibbon = Math.PI / 2 para todos, logramos los cortes lógicos correctos:
 * - Morado ('x'): Se corta Arriba/Abajo. Nos da segmentos Frontal y Trasero (Atrás/Adelante).
 * - Azul ('y'): Se corta Izquierda/Derecha. Nos da segmentos Frontal y Trasero (Atrás/Adelante).
 * - Verde ('z'): Se corta Izquierda/Derecha. Nos da segmentos Arriba y Abajo.
 * 
 * EL STICKER (FLECHA):
 * Se dibuja en el CENTRO absoluto de cada segmento. 
 * Para el Azul y el Morado, el centro de sus segmentos Frontal/Trasero recae exactamente
 * sobre el eje Y CAD (Z de Three.js), que es su punto de intersección físico.
 */

// Gizmo configuration
const RADIUS = 0.4;
const RIBBON_WIDTH = 0.04;
const HIT_TUBE = 0.15;

const ARROW_SEGMENT_ARC_LENGTH = RADIUS * Math.PI;
// Distancias desde el centro del segmento (512 en el canvas de 1024)
const ARROW_TIP_DIST_WORLD = (120 / 1024) * ARROW_SEGMENT_ARC_LENGTH; // Donde termina la punta (ancho 0)
const ARROW_BASE_DIST_WORLD = (70 / 1024) * ARROW_SEGMENT_ARC_LENGTH; // Donde empieza la cabeza (ancho máximo)
const ARROW_HEAD_HALF_WIDTH_RATIO = (116 / 128) / 2;

const AXIS_COLORS = {
    x: new THREE.Color(0x9966ff), // Morado (Eje X CAD)
    y: new THREE.Color(0x33ccff), // Azul (Eje Z CAD)
    z: new THREE.Color(0x33e6cc)  // Verde (Eje Y CAD)
};
const COLOR_HOVER = new THREE.Color(0xffffff);

const ringVertexShader = `
    uniform vec3 uCameraPos;
    varying float vFactor;
    varying float vLocalY;
    
    void main() {
        vLocalY = position.y / 0.02;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 viewDir = normalize(uCameraPos - worldPos.xyz);
        
        vec3 localNormal = normalize(vec3(position.x, 0.0, position.z));
        vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
        
        vFactor = max(0.0, dot(viewDir, worldNormal));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const ringFragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uBorderColor;
    uniform float uOpacity;
    varying float vFactor;
    varying float vLocalY;

    void main() {
        float edge = abs(vLocalY);
        float borderFactor = smoothstep(0.15, 0.95, edge);
        vec3 finalColor = mix(uColor, uBorderColor, borderFactor);

        float alphaScale = mix(0.2, 0.95, vFactor);
        float finalOpacity = mix(uOpacity * alphaScale, uOpacity * mix(0.4, 1.0, vFactor), borderFactor);
        
        gl_FragColor = vec4(finalColor, finalOpacity);
    }
`;

const diskVertexShader = `
    varying vec3 vLocalPos;
    void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const diskFragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uBorderColor;
    uniform float uOpacity;
    
    uniform float uIsActive;
    uniform float uHasArrow; 
    uniform float uStartAngle;
    uniform float uRadius;
    uniform float uRibbonWidth;
    uniform float uHeadWidth;
    uniform float uArrowTipDist;
    uniform float uArrowBaseDist;
    uniform float uHeadHalfWidthRatio;
    
    varying vec3 vLocalPos;
    
    void main() {
        float theta = atan(vLocalPos.y, vLocalPos.x);
        
        const float TAU = 6.28318530718;
        const float PI = 3.14159265359;
        
        // Las puntas de la flecha de arrastre deben ir en los EXTREMOS del segmento.
        // Es decir, en uStartAngle y en uStartAngle + PI
        float endAngleA = uStartAngle;
        float endAngleB = uStartAngle + PI;
        
        float dA = mod(abs(theta - endAngleA), TAU);
        dA = min(dA, TAU - dA);
        float dB = mod(abs(theta - endAngleB), TAU);
        dB = min(dB, TAU - dB);
        
        // Distancia angular al extremo (corte) más cercano
        float distToEnd = min(dA, dB);
        
        float r = length(vLocalPos.xy);
        float distFromCenter = r - uRadius;
        
        // Distancia física a lo largo del arco desde el extremo (corte)
        float arcLengthFromEnd = distToEnd * uRadius; 
        
        float currentHalfWidth = uRibbonWidth / 2.0;
        
        // uArrowTipDist y uArrowBaseDist están medidas desde el centro (512)
        // Para calcular desde los extremos (0 y 1024), convertimos la longitud física total de la flecha:
        float headLengthPhysical = uArrowTipDist - uArrowBaseDist; // 50 unidades de canvas a world
        
        if (uIsActive > 0.5 && uHasArrow > 0.5) {
            // Si estamos a una distancia desde el extremo MENOR a la longitud de la cabeza,
            // entonces estamos dentro de la punta de flecha.
            if (arcLengthFromEnd < headLengthPhysical) {
                float maxHeadHalfW = uHeadWidth * uHeadHalfWidthRatio;
                // En el extremo exacto (arcLengthFromEnd == 0), el ancho es 0.
                // A medida que nos alejamos del extremo, el ancho crece hasta maxHeadHalfW.
                float arrowHalfWidth = (arcLengthFromEnd / headLengthPhysical) * maxHeadHalfW;
                
                // Forzamos a que el ancho converja a la punta sin límite mínimo
                currentHalfWidth = arrowHalfWidth;
            }
        }
        
        float aa = fwidth(distFromCenter) * 1.5 + 0.0005;
        float mask = 1.0 - smoothstep(currentHalfWidth - aa, currentHalfWidth + aa, abs(distFromCenter));
        
        if (mask < 0.5) discard;
        
        float edge = abs(distFromCenter) / max(currentHalfWidth, 0.0001);
        float borderFactor = smoothstep(0.15, 0.95, edge);
        
        vec3 finalColor = mix(uColor, uBorderColor, borderFactor);
        
        gl_FragColor = vec4(finalColor, uOpacity);
    }
`;

const arrowVertexShader = `
    uniform vec3 uCameraPos;
    varying vec2 vUv;
    varying float vFactor;
    
    void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 viewDir = normalize(uCameraPos - worldPos.xyz);
        
        vec3 localNormal = normalize(vec3(position.x, 0.0, position.z));
        vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
        
        vFactor = max(0.0, dot(viewDir, worldNormal));
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const arrowFragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uBorderColor;
    uniform float uOpacity;
    uniform sampler2D uTexture;
    
    varying vec2 vUv;
    varying float vFactor;
    
    void main() {
        vec4 texColor = texture2D(uTexture, vUv);
        if (texColor.a < 0.05) discard;
        
        float fillFactor = clamp((texColor.r - 0.4) / 0.6, 0.0, 1.0);
        vec3 finalColor = mix(uBorderColor, uColor, fillFactor);
        
        gl_FragColor = vec4(finalColor, uOpacity * vFactor * texColor.a);
    }
`;

let sharedArrowTexture = null;
function getArrowTexture() {
    if (sharedArrowTexture) return sharedArrowTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawDoubleArrow = (centerX) => {
        const arrowLength = 120;
        const shaftWidth = 64;
        const headWidth = 116;
        const headLength = 50;

        ctx.beginPath();
        ctx.moveTo(centerX - arrowLength, 64);
        ctx.lineTo(centerX - arrowLength + headLength, 64 - headWidth / 2);
        ctx.lineTo(centerX - arrowLength + headLength, 64 - shaftWidth / 2);
        ctx.lineTo(centerX + arrowLength - headLength, 64 - shaftWidth / 2);
        ctx.lineTo(centerX + arrowLength - headLength, 64 - headWidth / 2);
        ctx.lineTo(centerX + arrowLength, 64);
        ctx.lineTo(centerX + arrowLength - headLength, 64 + headWidth / 2);
        ctx.lineTo(centerX + arrowLength - headLength, 64 + shaftWidth / 2);
        ctx.lineTo(centerX - arrowLength + headLength, 64 + shaftWidth / 2);
        ctx.lineTo(centerX - arrowLength + headLength, 64 + headWidth / 2);
        ctx.closePath();
    };

    // Al dibujarlo solo en 512, la flecha queda exactamente en el centro de la geometría,
    // garantizando que las puntas se formen de manera natural sin cortar el aro base.
    drawDoubleArrow(512);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 4;
    ctx.stroke();

    sharedArrowTexture = new THREE.CanvasTexture(canvas);
    sharedArrowTexture.anisotropy = 4;
    return sharedArrowTexture;
}

const gizmoGroup = new THREE.Group();
gizmoGroup.name = '__rotationGizmo__';
gizmoGroup.visible = false;
gizmoGroup.renderOrder = 300;

const rings = {};

function createRing(axis, eulerRotation) {
    const group = new THREE.Group();
    const partsCount = 2;
    const hasSticker = (axis === 'x' || axis === 'y'); // Solo Morado y Azul

    const partsList = [];
    for (let i = 0; i < partsCount; i++) {
        // Al aplicar PI/2 a TODOS, logramos las divisiones lógicas perfectas:
        // Morado/Azul = Atrás/Adelante. Verde = Arriba/Abajo.
        let offsetRibbon = Math.PI / 2;
        let offsetDisk = offsetRibbon - (Math.PI / 2); // Queda en 0

        const startAngleRibbon = (i * Math.PI) + offsetRibbon;
        const startAngleDisk = (i * Math.PI) + offsetDisk;
        const thetaLength = Math.PI;

        const geoRibbon = new THREE.CylinderGeometry(RADIUS, RADIUS, RIBBON_WIDTH, 64, 1, true, startAngleRibbon, thetaLength);
        const hitGeoRibbon = new THREE.CylinderGeometry(RADIUS, RADIUS, HIT_TUBE, 16, 1, true, startAngleRibbon, thetaLength);

        // Se necesita margen extra en la geometría para que el shader pueda pintar la flecha ancha
        const geoDisk = new THREE.RingGeometry(RADIUS - RIBBON_WIDTH, RADIUS + RIBBON_WIDTH, 64, 1, startAngleDisk, thetaLength);
        const hitGeoDisk = new THREE.RingGeometry(RADIUS - HIT_TUBE / 2, RADIUS + HIT_TUBE / 2, 16, 1, startAngleDisk, thetaLength);

        const geoArrow = new THREE.CylinderGeometry(RADIUS + 0.0005, RADIUS + 0.0005, RIBBON_WIDTH * 2, 64, 1, true, startAngleRibbon, thetaLength);

        partsList.push({ geoRibbon, geoDisk, geoArrow, hitGeoRibbon, hitGeoDisk, id: `${axis}_${i}`, startAngleDisk });
    }

    const halves = [];

    partsList.forEach((half) => {
        const matRibbon = new THREE.ShaderMaterial({
            vertexShader: ringVertexShader,
            fragmentShader: ringFragmentShader,
            uniforms: {
                uColor: { value: AXIS_COLORS[axis].clone() },
                uBorderColor: { value: AXIS_COLORS[axis].clone().multiplyScalar(0.4) },
                uOpacity: { value: 0.9 },
                uCameraPos: { value: new THREE.Vector3() }
            },
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: false
        });
        const meshRibbon = new THREE.Mesh(half.geoRibbon, matRibbon);
        meshRibbon.renderOrder = 301;
        group.add(meshRibbon);

        const matDisk = new THREE.ShaderMaterial({
            vertexShader: diskVertexShader,
            fragmentShader: diskFragmentShader,
            uniforms: {
                uColor: { value: AXIS_COLORS[axis].clone() },
                uBorderColor: { value: AXIS_COLORS[axis].clone().multiplyScalar(0.4) },
                uOpacity: { value: 0.9 },
                uIsActive: { value: 0.0 },
                uHasArrow: { value: hasSticker ? 1.0 : 0.0 }, // Define si este disco se deforma
                uStartAngle: { value: half.startAngleDisk },
                uRadius: { value: RADIUS },
                uRibbonWidth: { value: RIBBON_WIDTH },
                uHeadWidth: { value: RIBBON_WIDTH * 2 },
                uArrowTipDist: { value: ARROW_TIP_DIST_WORLD },
                uArrowBaseDist: { value: ARROW_BASE_DIST_WORLD },
                uHeadHalfWidthRatio: { value: ARROW_HEAD_HALF_WIDTH_RATIO }
            },
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: false
        });
        const meshDisk = new THREE.Mesh(half.geoDisk, matDisk);
        meshDisk.rotation.x = -Math.PI / 2;
        meshDisk.renderOrder = 301;
        group.add(meshDisk);

        let matArrow = null;
        if (hasSticker) {
            matArrow = new THREE.ShaderMaterial({
                vertexShader: arrowVertexShader,
                fragmentShader: arrowFragmentShader,
                uniforms: {
                    uColor: { value: AXIS_COLORS[axis].clone() },
                    uBorderColor: { value: AXIS_COLORS[axis].clone().multiplyScalar(0.4) },
                    uOpacity: { value: 0.9 },
                    uCameraPos: { value: new THREE.Vector3() },
                    uTexture: { value: getArrowTexture() }
                },
                side: THREE.DoubleSide,
                transparent: true,
                depthTest: false
            });
            const meshArrow = new THREE.Mesh(half.geoArrow, matArrow);
            meshArrow.renderOrder = 302;
            group.add(meshArrow);
        }

        const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

        const hitMeshRibbon = new THREE.Mesh(half.hitGeoRibbon, hitMat);
        hitMeshRibbon.name = '__rotationHit_' + half.id + '_ribbon';
        hitMeshRibbon.userData.axis = axis;
        hitMeshRibbon.userData.halfId = half.id;
        group.add(hitMeshRibbon);

        const hitMeshDisk = new THREE.Mesh(half.hitGeoDisk, hitMat);
        hitMeshDisk.name = '__rotationHit_' + half.id + '_disk';
        hitMeshDisk.userData.axis = axis;
        hitMeshDisk.userData.halfId = half.id;
        hitMeshDisk.rotation.x = -Math.PI / 2;
        group.add(hitMeshDisk);

        halves.push({ matRibbon, matDisk, matArrow, hitMeshRibbon, hitMeshDisk, id: half.id, axis });
    });

    group.rotation.copy(eulerRotation);
    gizmoGroup.add(group);

    rings[axis] = { group, halves };
    return group;
}

createRing('y', new THREE.Euler(0, 0, 0));             // Azul (Eje Z CAD)
createRing('x', new THREE.Euler(0, 0, Math.PI / 2));   // Morado (Eje X CAD)
createRing('z', new THREE.Euler(Math.PI / 2, 0, 0));   // Verde (Eje Y CAD)

scene.add(gizmoGroup);

let currentHover = null;
let currentActive = null;
let attachedMesh = null;

export const RotationGizmo = {
    show(mesh) {
        if (!mesh || !mesh.userData.editable || mesh.userData.locked || !State.get('is3DMode')) {
            this.hide();
            return;
        }
        attachedMesh = mesh;

        gizmoGroup.visible = true;
        this.update();
        this.setHover(null);
    },

    hide() {
        gizmoGroup.visible = false;
        attachedMesh = null;
        currentHover = null;
    },

    update() {
        if (!attachedMesh || !gizmoGroup.visible) return;

        const { center } = getObjectBounds(attachedMesh);
        gizmoGroup.position.copy(center);
        gizmoGroup.quaternion.identity();
    },

    hitTest(raycaster) {
        if (!gizmoGroup.visible) return null;

        let allHitMeshes = [];
        ['x', 'y', 'z'].forEach(a => {
            if (!rings[a]) return;
            rings[a].halves.forEach(half => {
                if (half.hitMeshRibbon) allHitMeshes.push(half.hitMeshRibbon);
                if (half.hitMeshDisk) allHitMeshes.push(half.hitMeshDisk);
            });
        });

        const intersects = raycaster.intersectObjects(allHitMeshes, false);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            return {
                axis: hit.userData.axis,
                halfId: hit.userData.halfId,
                point: intersects[0].point
            };
        }
        return null;
    },

    setActiveAxis(halfId) {
        if (currentActive === halfId) return;
        currentActive = halfId;
        this._updateVisuals();
    },

    setHover(halfId) {
        if (currentHover === halfId) return;
        currentHover = halfId;
        this._updateVisuals();
    },

    _updateVisuals() {
        ['x', 'y', 'z'].forEach(a => {
            if (!rings[a]) return;
            const isAxisActive = currentActive && currentActive.startsWith(a);

            rings[a].halves.forEach(half => {
                const baseColor = AXIS_COLORS[a];
                const hoverColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.6);
                const normalBorder = baseColor.clone().multiplyScalar(0.4);

                let targetColor, targetBorderColor, targetOpacity, targetShowArrowHead;

                if (currentActive) {
                    const isActiveHalf = (half.id === currentActive);
                    targetColor = isActiveHalf ? hoverColor : baseColor;
                    targetBorderColor = isActiveHalf ? baseColor : normalBorder;
                    targetOpacity = isActiveHalf ? 1.0 : 0.15;
                    targetShowArrowHead = isActiveHalf;
                } else {
                    const isHoveredHalf = (half.id === currentHover);
                    targetColor = isHoveredHalf ? hoverColor : baseColor;
                    targetBorderColor = isHoveredHalf ? baseColor : normalBorder;
                    targetOpacity = isHoveredHalf ? 1.0 : 0.96;
                    targetShowArrowHead = false;
                }

                half.matRibbon.uniforms.uColor.value.copy(targetColor);
                half.matRibbon.uniforms.uBorderColor.value.copy(targetBorderColor);
                half.matRibbon.uniforms.uOpacity.value = targetOpacity;

                half.matDisk.uniforms.uColor.value.copy(targetColor);
                half.matDisk.uniforms.uBorderColor.value.copy(targetBorderColor);
                half.matDisk.uniforms.uOpacity.value = targetOpacity;
                half.matDisk.uniforms.uIsActive.value = targetShowArrowHead ? 1.0 : 0.0;

                if (half.matArrow) {
                    half.matArrow.uniforms.uColor.value.copy(targetColor);
                    half.matArrow.uniforms.uBorderColor.value.copy(targetBorderColor);
                    half.matArrow.uniforms.uOpacity.value = targetOpacity;
                }
            });
        });
    },

    updateCamera(camera) {
        if (!gizmoGroup.visible) return;

        ['x', 'y', 'z'].forEach(a => {
            if (!rings[a]) return;
            rings[a].halves.forEach(half => {
                half.matRibbon.uniforms.uCameraPos.value.copy(camera.position);
                if (half.matArrow) {
                    half.matArrow.uniforms.uCameraPos.value.copy(camera.position);
                }
            });
        });
    },

    getPosition() { return gizmoGroup.position; },
    get isVisible() { return gizmoGroup.visible; },
    get hoveredAxis() { return currentHover; }
};