import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { State } from '../core/State.js';
import { PersonasEngine } from './PersonasEngine.js';
import { getObjectBounds } from './MoveHandle.js';
import appConfig from '../data/config.json' with { type: 'json' };
import { GizmoDebugWindow } from '../ui/GizmoDebugWindow.js';

/**
 * SISTEMA DE COORDENADAS (APP vs THREE.JS):
 * - Z (Azul): El eje apunta hacia arriba (corresponde al eje Y en Three.js).
 * - Y (Verde): El eje apunta hacia la cámara/pantalla del observador (corresponde al eje Z en Three.js).
 * - X (Morado/Rojo): El eje apunta hacia el lado derecho (corresponde al eje X en Three.js).
 * 
 * ROTACIÓN Y SEGMENTOS:
 * - Morado ('x'): offsetRibbon = Math.PI / 2. Nos da segmentos Frontal y Trasero (Atrás/Adelante).
 * - Azul ('y'): offsetRibbon = Math.PI / 2. Nos da segmentos Frontal y Trasero (Atrás/Adelante).
 * - Verde ('z'): offsetRibbon = 0. Nos da segmentos separados Izquierda/Derecha.
 * 
 * EL STICKER (FLECHA):
 * Se dibuja en el CENTRO absoluto de cada segmento. 
 * Para el Azul y el Morado, el centro de sus segmentos Frontal/Trasero recae exactamente
 * sobre el eje Y CAD (Z de Three.js), que es su punto de intersección físico.
 *
 * RECORTE DE FLECHA EN EL ARO (RIBBON):
 * Usa la MISMA técnica que el disco: se calcula la distancia angular (convertida a
 * longitud de arco) desde los extremos del segmento (uStartAngle y uStartAngle + PI).
 * La diferencia es puramente geométrica:
 * - En el DISCO (plano, visto desde arriba) el ángulo sale de vLocalPos.xy y el ancho
 *   de la flecha se mide sobre el RADIO (distFromCenter = r - uRadius).
 * - En el ARO (cilindro visto de perfil) el ángulo sale de vLocalPos.xz (el plano de
 *   la circunferencia del cilindro) y el ancho de la flecha se mide sobre el EJE Y
 *   local del cilindro (distFromAxis = vLocalPos.y), que es donde vive el espesor
 *   de la cinta.
 */

// Gizmo configuration
const RADIUS = 0.4;
let RIBBON_WIDTH = appConfig.rotationGizmo.ribbonWidth || 0.04;
const HIT_TUBE = 0.15;

const ARROW_SEGMENT_ARC_LENGTH = RADIUS * Math.PI;
// Distancias desde el centro del segmento (512 en el canvas de 1024)
const ARROW_TIP_DIST_WORLD = (120 / 1024) * ARROW_SEGMENT_ARC_LENGTH; // Donde termina la punta (ancho 0)
const ARROW_BASE_DIST_WORLD = (70 / 1024) * ARROW_SEGMENT_ARC_LENGTH; // Donde empieza la cabeza (ancho máximo)
const ARROW_HEAD_HALF_WIDTH_RATIO = (116 / 128) / 2;

// renderOrder base (orden normal, igual para todos los ejes) y el "boost"
// que se aplica temporalmente al eje activo/hovereado para que sus mallas
// (ribbon, disco y sticker) se dibujen por encima de las de los demás ejes,
// sin importar el orden en que se crearon los grupos (y, x, z).
const RENDER_ORDER_BASE = { ribbon: 301, disk: 301, arrow: 302 };
const RENDER_ORDER_BOOST = 50;

// HISTÉRESIS DE HOVER: cerca de la intersección visual entre dos segmentos
// (aro+disco de ejes distintos, o incluso entre las dos mitades del mismo
// aro), sus zonas de detección infladas (HIT_TUBE >> RIBBON_WIDTH) se
// superponen. Sin esto, el raycaster puede alternar frame a frame cuál
// objeto está "más cerca" por diferencias de subpíxel del mouse, causando
// parpadeo de hover. Con esta tolerancia, si el segmento que YA estaba en
// hover sigue entre los candidatos y su distancia es casi igual a la del
// más cercano, nos quedamos con el que ya teníamos.
const HOVER_HYSTERESIS = 0.015;

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
    varying vec3 vLocalPos;
    
    void main() {
        vLocalPos = position;
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

    // Uniforms para el recorte de flecha (misma técnica que el disco, pero
    // CONVERGIENDO al ancho existente de la cinta en vez de ensancharlo,
    // porque el aro no tiene geometría extra como el disco).
    uniform float uIsActive;
    uniform float uHasArrow;
    uniform float uStartAngle;
    uniform float uRibbonWidth;
    uniform float uArrowTipDist;
    uniform float uArrowBaseDist;

    varying float vFactor;
    varying float vLocalY;
    varying vec3 vLocalPos;

    void main() {
        const float TAU = 6.28318530718;
        const float PI = 3.14159265359;

        // El aro es un cilindro: su circunferencia vive en el plano X-Z local
        // (el eje del cilindro es Y). OJO: CylinderGeometry en three.js genera
        // sus vértices como x = r*sin(theta), z = r*cos(theta) — la convención
        // INVERSA a RingGeometry (que usa x = r*cos(theta), y = r*sin(theta),
        // por eso el disco usa atan(y,x)). Aquí el ángulo real de la malla es
        // atan2(x, z), no atan2(z, x); si se invierte, el "extremo" calculado
        // queda desfasado 90° y el recorte aparece en medio del segmento
        // en vez de en las puntas.
        float theta = atan(vLocalPos.x, vLocalPos.z);

        // Las puntas de la flecha van en los EXTREMOS del segmento, igual que en el disco:
        // en uStartAngle y en uStartAngle + PI.
        float endAngleA = uStartAngle;
        float endAngleB = uStartAngle + PI;

        float dA = mod(abs(theta - endAngleA), TAU);
        dA = min(dA, TAU - dA);
        float dB = mod(abs(theta - endAngleB), TAU);
        dB = min(dB, TAU - dB);

        float distToEnd = min(dA, dB);

        // Radio real del punto sobre el cilindro (≈ RADIUS constante)
        float r = length(vLocalPos.xz);

        // Distancia física a lo largo del arco desde el extremo (corte)
        float arcLengthFromEnd = distToEnd * r;

        // Ancho base de la cinta (medido en el eje Y local del cilindro, NO en el radio)
        float currentHalfWidth = uRibbonWidth / 2.0;

        float headLengthPhysical = uArrowTipDist - uArrowBaseDist;

        if (uIsActive > 0.5 && uHasArrow > 0.5) {
            if (arcLengthFromEnd < headLengthPhysical) {
                // A diferencia del disco (que ensancha hacia un uHeadWidth mayor
                // porque tiene geometría extra), el aro CONVERGE desde su propio
                // ancho de cinta (uRibbonWidth/2) hasta 0 en la punta exacta.
                // Esto produce el mismo perfil de punta triangular pero sin
                // exceder el grosor físico real de la malla del aro.
                float maxHalfW = uRibbonWidth / 2.0;
                float arrowHalfWidth = (arcLengthFromEnd / headLengthPhysical) * maxHalfW;
                currentHalfWidth = arrowHalfWidth;
            }
        }

        // Distancia al eje del cilindro = espesor de la cinta en este punto
        float distFromAxis = vLocalPos.y;

        float aa = fwidth(distFromAxis) * 1.5 + 0.0005;
        float mask = 1.0 - smoothstep(currentHalfWidth - aa, currentHalfWidth + aa, abs(distFromAxis));

        if (mask < 0.5) discard;

        float edge = abs(distFromAxis) / max(currentHalfWidth, 0.0001);
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
        // CORRECCIÓN ESPECÍFICA DE CORTES LÓGICOS:
        // El Verde ('z') recibe offset 0 para separarlo Izquierda/Derecha.
        // Morado ('x') y Azul ('y') mantienen Math.PI/2 para separarlos Adelante/Atrás.
        let offsetRibbon = (axis === 'z') ? 0 : (Math.PI / 2);
        let offsetDisk = offsetRibbon - (Math.PI / 2); // Alineado con su ribbon

        const startAngleRibbon = (i * Math.PI) + offsetRibbon;
        const startAngleDisk = (i * Math.PI) + offsetDisk;
        const thetaLength = Math.PI;

        const geoRibbon = new THREE.CylinderGeometry(RADIUS, RADIUS, RIBBON_WIDTH, 64, 1, true, startAngleRibbon, thetaLength);
        const hitGeoRibbon = new THREE.CylinderGeometry(RADIUS, RADIUS, HIT_TUBE, 16, 1, true, startAngleRibbon, thetaLength);

        // Geometría ensanchada para darle espacio al shader de pintar la flecha
        const geoDisk = new THREE.RingGeometry(RADIUS - RIBBON_WIDTH, RADIUS + RIBBON_WIDTH, 64, 1, startAngleDisk, thetaLength);
        const hitGeoDisk = new THREE.RingGeometry(RADIUS - HIT_TUBE / 2, RADIUS + HIT_TUBE / 2, 16, 1, startAngleDisk, thetaLength);

        const geoArrow = new THREE.CylinderGeometry(RADIUS + 0.0005, RADIUS + 0.0005, RIBBON_WIDTH * 2, 64, 1, true, startAngleRibbon, thetaLength);

        partsList.push({
            geoRibbon, geoDisk, geoArrow, hitGeoRibbon, hitGeoDisk,
            id: `${axis}_${i}`,
            startAngleRibbon,
            startAngleDisk
        });
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
                uCameraPos: { value: new THREE.Vector3() },

                // Uniforms para el recorte de flecha (misma técnica que el disco,
                // pero con el ángulo de inicio propio del ribbon y convergiendo
                // a su propio ancho en vez de a un uHeadWidth externo).
                uIsActive: { value: 0.0 },
                uHasArrow: { value: 1.0 },
                uStartAngle: { value: half.startAngleRibbon },
                uRibbonWidth: { value: RIBBON_WIDTH },
                uArrowTipDist: { value: ARROW_TIP_DIST_WORLD },
                uArrowBaseDist: { value: ARROW_BASE_DIST_WORLD }
            },
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: false
        });
        const meshRibbon = new THREE.Mesh(half.geoRibbon, matRibbon);
        meshRibbon.renderOrder = RENDER_ORDER_BASE.ribbon;
        group.add(meshRibbon);

        const matDisk = new THREE.ShaderMaterial({
            vertexShader: diskVertexShader,
            fragmentShader: diskFragmentShader,
            uniforms: {
                uColor: { value: AXIS_COLORS[axis].clone() },
                uBorderColor: { value: AXIS_COLORS[axis].clone().multiplyScalar(0.4) },
                uOpacity: { value: 0.9 },
                uIsActive: { value: 0.0 },

                // LA SOLUCIÓN: Fijar esto en 1.0 para que TODO disco forme flecha geométrica al arrastrar, 
                // incluso el Verde (que antes quedaba en 0.0 porque no tiene textura sticker).
                uHasArrow: { value: 1.0 },

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
        meshDisk.renderOrder = RENDER_ORDER_BASE.disk;
        group.add(meshDisk);

        let matArrow = null;
        let meshArrow = null;
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
            meshArrow = new THREE.Mesh(half.geoArrow, matArrow);
            meshArrow.renderOrder = RENDER_ORDER_BASE.arrow;
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

        halves.push({
            matRibbon, matDisk, matArrow,
            meshRibbon, meshDisk, meshArrow,
            hitMeshRibbon, hitMeshDisk,
            id: half.id, axis
        });
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

// === DEBUG: contadores para medir el costo de update() a lo largo del tiempo ===
let __debugUpdateCallCount = 0;
let __debugUpdateTotal = 0;
let __debugUpdateMax = 0;

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

        // === DEBUG: medir el costo de getObjectBounds en cada llamada ===
        const __t = performance.now();
        const { center } = getObjectBounds(attachedMesh);
        const __boundsTime = performance.now() - __t;

        __debugUpdateCallCount++;
        __debugUpdateTotal += __boundsTime;
        if (__boundsTime > __debugUpdateMax) __debugUpdateMax = __boundsTime;

        if (__boundsTime > 1 && typeof window !== 'undefined' && window.__TECAL_DEBUG_ROTATE === true) {
            console.warn(
                `[GIZMO DEBUG] getObjectBounds: ${__boundsTime.toFixed(2)}ms | ` +
                `mesh: "${attachedMesh.userData.id || attachedMesh.name}" | ` +
                `isPersona: ${!!attachedMesh.userData.isPersona} | ` +
                `llamada #${__debugUpdateCallCount} | promedio histórico: ${(__debugUpdateTotal / __debugUpdateCallCount).toFixed(2)}ms | máximo: ${__debugUpdateMax.toFixed(2)}ms`
            );
        }

        gizmoGroup.position.copy(center);
        
        if (typeof GizmoDebugWindow !== 'undefined' && GizmoDebugWindow.isGizmoRotateMode()) {
            // Keep current rotation for debugging
        } else {
            gizmoGroup.quaternion.identity();
        }
    },

    getGroup() {
        return gizmoGroup;
    },

    syncCamera(camera, windowHeight) {
        if (!gizmoGroup.visible || !camera || !camera.isPerspectiveCamera) return;
        
        const targetPixelSize = appConfig.rotationGizmo.targetPixelSize || 180;
        
        const distance = camera.position.distanceTo(gizmoGroup.position);
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const vFovHeight = 2 * Math.tan(fov / 2) * distance;
        
        // Gizmo's natural diameter in world units is RADIUS * 2
        const currentDiameter = RADIUS * 2;
        const scale = (targetPixelSize / windowHeight) * (vFovHeight / currentDiameter);
        
        gizmoGroup.scale.setScalar(scale);
    },

    setRibbonWidth(newWidth) {
        RIBBON_WIDTH = newWidth;
        
        // Clean up old rings
        ['x', 'y', 'z'].forEach(a => {
            if (rings[a]) {
                const { group, halves } = rings[a];
                gizmoGroup.remove(group);
                
                halves.forEach(half => {
                    half.meshRibbon.geometry.dispose();
                    half.meshRibbon.material.dispose();
                    half.meshDisk.geometry.dispose();
                    half.meshDisk.material.dispose();
                    if (half.meshArrow) {
                        half.meshArrow.geometry.dispose();
                        half.meshArrow.material.dispose();
                    }
                    half.hitMeshRibbon.geometry.dispose();
                    half.hitMeshRibbon.material.dispose();
                    half.hitMeshDisk.geometry.dispose();
                    half.hitMeshDisk.material.dispose();
                });
                
                delete rings[a];
            }
        });
        
        // Recreate with new width
        createRing('y', new THREE.Euler(0, 0, 0));             // Azul (Eje Z CAD)
        createRing('x', new THREE.Euler(0, 0, Math.PI / 2));   // Morado (Eje X CAD)
        createRing('z', new THREE.Euler(Math.PI / 2, 0, 0));   // Verde (Eje Y CAD)
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

        if (intersects.length === 0) return null;

        // intersectObjects ya devuelve los resultados ordenados por distancia
        // ascendente, pero lo dejamos explícito por claridad.
        intersects.sort((a, b) => a.distance - b.distance);

        const closest = intersects[0];

        // HISTÉRESIS: si el segmento que ya estaba en hover sigue siendo un
        // candidato válido (el mouse sigue dentro de su zona de detección
        // inflada) y su distancia es casi igual a la del más cercano, nos
        // quedamos con el que ya teníamos en vez de saltar al nuevo. Esto
        // evita el parpadeo cerca de las intersecciones entre segmentos.
        if (currentHover) {
            const stickyMatch = intersects.find(i => i.object.userData.halfId === currentHover);
            if (stickyMatch && (stickyMatch.distance - closest.distance) < HOVER_HYSTERESIS) {
                return {
                    axis: stickyMatch.object.userData.axis,
                    halfId: stickyMatch.object.userData.halfId,
                    point: stickyMatch.point
                };
            }
        }

        return {
            axis: closest.object.userData.axis,
            halfId: closest.object.userData.halfId,
            point: closest.point
        };
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
        // Determina qué EJE completo está resaltado (por drag activo o por hover),
        // para poder subir el renderOrder de TODAS sus mallas (ribbon, disco y
        // sticker, en ambas mitades) por encima de los demás ejes. Sin esto, el
        // orden de dibujo depende del orden de creación de los grupos (y, x, z)
        // y un sticker de otro eje puede tapar el hover/drag del eje actual.
        const highlightedId = currentActive || currentHover;
        const highlightedAxis = highlightedId ? highlightedId.split('_')[0] : null;

        ['x', 'y', 'z'].forEach(a => {
            if (!rings[a]) return;
            const isAxisActive = currentActive && currentActive.startsWith(a);
            const axisBoost = (highlightedAxis === a) ? RENDER_ORDER_BOOST : 0;

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

                half.meshRibbon.renderOrder = RENDER_ORDER_BASE.ribbon + axisBoost;
                half.meshDisk.renderOrder = RENDER_ORDER_BASE.disk + axisBoost;
                if (half.meshArrow) {
                    half.meshArrow.renderOrder = RENDER_ORDER_BASE.arrow + axisBoost;
                }

                half.matRibbon.uniforms.uColor.value.copy(targetColor);
                half.matRibbon.uniforms.uBorderColor.value.copy(targetBorderColor);
                half.matRibbon.uniforms.uOpacity.value = targetOpacity;
                // Igual que en el disco: solo el aro activo muestra la punta de flecha recortada.
                half.matRibbon.uniforms.uIsActive.value = targetShowArrowHead ? 1.0 : 0.0;

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

    /**
     * Lightweight position sync — copies the mesh's world-space center
     * to the gizmo WITHOUT recalculating getObjectBounds.
     * Use during drag operations (the center doesn't change relative to the mesh).
     */
    syncPositionOnly(mesh) {
        if (!mesh || !gizmoGroup.visible) return;
        // The cached _localCenter is set once during the first getObjectBounds call.
        // During rotation, the local center doesn't change — we just need to
        // transform it to world space using the mesh's current matrixWorld.
        if (mesh.userData._localCenter) {
            gizmoGroup.position.copy(mesh.userData._localCenter).applyMatrix4(mesh.matrixWorld);
        } else {
            // Fallback: use mesh position directly (shouldn't happen if show() was called)
            gizmoGroup.position.copy(mesh.position);
        }
        gizmoGroup.quaternion.identity();
    },

    getPosition() { return gizmoGroup.position; },
    get isVisible() { return gizmoGroup.visible; },
    get hoveredAxis() { return currentHover; }
};