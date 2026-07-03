import * as THREE from 'three';
import { scene } from './SceneManager.js';
import { State } from '../core/State.js';
import { PersonasEngine } from './PersonasEngine.js';
import { getObjectBounds } from './MoveHandle.js';

// Gizmo configuration
const RADIUS = 0.8;
const RIBBON_WIDTH = 0.04;
const HIT_TUBE = 0.15;

const AXIS_COLORS = {
    x: new THREE.Color(0x9966ff), // Más púrpura para que se note la diferencia (Su eje X)
    y: new THREE.Color(0x33ccff), // Cian base (Su eje Z - vertical)
    z: new THREE.Color(0x33e6cc)  // Cian sutilmente hacia verde (Su eje Y - profundidad)
};
const COLOR_HOVER = new THREE.Color(0xffffff); // Temporary white for hover

// Custom Shader for Dynamic Thickness and Opacity
const ringVertexShader = `
    uniform vec3 uCameraPos;
    varying float vFactor; // 0.0 for back, 1.0 for front
    varying float vLocalY; // -1.0 to 1.0 based on ribbon width
    
    void main() {
        // RIBBON_WIDTH is 0.04, so position.y goes from -0.02 to 0.02
        vLocalY = position.y / 0.02; 
        
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 viewDir = normalize(uCameraPos - worldPos.xyz);
        
        // cylinder normal in world space (ignoring Y since cylinder is along Y)
        vec3 localNormal = normalize(vec3(position.x, 0.0, position.z));
        vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
        
        float d = dot(worldNormal, viewDir);
        // Map d from [-1, 1] (back to front) into a smooth 0..1 curve
        vFactor = smoothstep(-1.0, 1.0, d); 
        
        // Scale local Y (thickness) based on front/back
        // Minimum width in back is 0.8 (still a ribbon, not a line), max in front is 1.3
        float widthScale = mix(0.8, 1.3, vFactor); 
        vec3 newPos = position;
        newPos.y *= widthScale;
        
        gl_Position = projectionMatrix * viewMatrix * worldPos;
        // Fix: we altered local position, so recalculate worldPos for correct projection
        vec4 modifiedWorldPos = modelMatrix * vec4(newPos, 1.0);
        gl_Position = projectionMatrix * viewMatrix * modifiedWorldPos;
    }
`;

const ringFragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uHoverColor;
    uniform float uOpacity;
    varying float vFactor;
    varying float vLocalY;

    void main() {
        // Calculate border based on local Y (-1 to 1)
        float edge = abs(vLocalY);
        // Create a sharp, smooth border on the outer 15% of the ribbon
        float borderFactor = smoothstep(0.75, 0.9, edge);
        
        // Use a darkened version of the base color for the border
        vec3 borderColor = uColor * 0.4; // 60% darker
        vec3 finalColor = mix(uColor, borderColor, borderFactor);

        // Opacity: front = 1.0, back = 0.2
        float alphaScale = mix(0.2, 1.0, vFactor);
        
        // Optional: make the border slightly more opaque in the back to maintain visibility
        float finalOpacity = mix(uOpacity * alphaScale, uOpacity * mix(0.4, 1.0, vFactor), borderFactor);
        
        gl_FragColor = vec4(finalColor, finalOpacity);
    }
`;

// Shaders for flat disk rings (like Y axis)
const diskVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const diskFragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;

    void main() {
        // vUv.y goes from 0 at inner radius to 1 at outer radius
        float edge = abs(vUv.y - 0.5) * 2.0;
        float borderFactor = smoothstep(0.75, 0.9, edge);
        
        vec3 borderColor = uColor * 0.4; // 60% darker
        vec3 finalColor = mix(uColor, borderColor, borderFactor);
        
        gl_FragColor = vec4(finalColor, uOpacity);
    }
`;

const gizmoGroup = new THREE.Group();
gizmoGroup.name = '__rotationGizmo__';
gizmoGroup.visible = false;
gizmoGroup.renderOrder = 300;

const rings = {};

function createRing(axis, eulerRotation) {
    const group = new THREE.Group();
    
    // 2 Half Ribbons (No gap)
    const partsCount = 2;
    const gapAngle = 0; // 0 degrees gap
    const thetaLength = (Math.PI * 2 / partsCount) - gapAngle; // 180 degrees
    
    const partsList = [];
    for (let i = 0; i < partsCount; i++) {
        // Para mantener los cortes exactamente iguales en el espacio 3D para ambas geometrías:
        let offsetRibbon = (axis === 'x' || axis === 'y') ? (Math.PI / 2) : 0;
        
        // El desfase de la arandela debe ajustarse para que i=0 coincida físicamente con el i=0 del listón
        let offsetDisk = (axis === 'z') ? (-Math.PI / 2) : 0;
        
        const startAngleRibbon = (i * Math.PI * 2 / partsCount) + (gapAngle / 2) + offsetRibbon;
        const startAngleDisk = (i * Math.PI * 2 / partsCount) + (gapAngle / 2) + offsetDisk;
        
        // Ribbon (CylinderGeometry)
        const geoRibbon = new THREE.CylinderGeometry(RADIUS, RADIUS, RIBBON_WIDTH, 64, 1, true, startAngleRibbon, thetaLength);
        const hitGeoRibbon = new THREE.CylinderGeometry(RADIUS, RADIUS, HIT_TUBE, 16, 1, true, startAngleRibbon, thetaLength);
        
        // Disk (RingGeometry)
        const geoDisk = new THREE.RingGeometry(RADIUS - RIBBON_WIDTH / 2, RADIUS + RIBBON_WIDTH / 2, 64, 1, startAngleDisk, thetaLength);
        const hitGeoDisk = new THREE.RingGeometry(RADIUS - HIT_TUBE / 2, RADIUS + HIT_TUBE / 2, 16, 1, startAngleDisk, thetaLength);
        
        partsList.push({ geoRibbon, geoDisk, hitGeoRibbon, hitGeoDisk, id: `${axis}_${i}` });
    }

    const halves = []; // We keep the array name "halves"
    
    partsList.forEach((half) => {
        // MATERIAL 1: Ribbon
        const matRibbon = new THREE.ShaderMaterial({
            vertexShader: ringVertexShader,
            fragmentShader: ringFragmentShader,
            uniforms: {
                uColor: { value: AXIS_COLORS[axis].clone() },
                uHoverColor: { value: COLOR_HOVER.clone() },
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

        // MATERIAL 2: Disk
        const matDisk = new THREE.ShaderMaterial({
            vertexShader: diskVertexShader,
            fragmentShader: diskFragmentShader,
            uniforms: {
                uColor: { value: AXIS_COLORS[axis].clone() },
                uOpacity: { value: 0.9 }
            },
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: false
        });
        const meshDisk = new THREE.Mesh(half.geoDisk, matDisk);
        // Rotate disk so its normal is Local Y (same axis as Ribbon)
        meshDisk.rotation.x = -Math.PI / 2;
        meshDisk.renderOrder = 301;
        group.add(meshDisk);

        // HIT MESHES (Invisible)
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

        halves.push({ matRibbon, matDisk, hitMeshRibbon, hitMeshDisk, id: half.id, axis });
    });

    group.rotation.copy(eulerRotation);
    gizmoGroup.add(group);
    
    rings[axis] = { group, halves };
    return group;
}

createRing('y', new THREE.Euler(0, 0, 0)); // Y axis (default)
createRing('x', new THREE.Euler(0, 0, Math.PI / 2)); // X axis (rotated around Z)
createRing('z', new THREE.Euler(Math.PI / 2, 0, 0)); // Z axis (rotated around X)

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
        gizmoGroup.quaternion.identity(); // Global orientation
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
                
                let targetColor = baseColor;
                let targetOpacity = 0.7;
                
                if (currentActive) {
                    // Dragging mode
                    const isActiveHalf = (half.id === currentActive);
                    targetColor = baseColor;
                    targetOpacity = isActiveHalf ? 1.0 : 0.15;
                } else {
                    // Normal hover mode
                    const isHoveredHalf = (half.id === currentHover);
                    targetColor = isHoveredHalf ? COLOR_HOVER : baseColor;
                    targetOpacity = isHoveredHalf ? 1.0 : 1.0;
                }
                
                half.matRibbon.uniforms.uColor.value.copy(targetColor);
                half.matRibbon.uniforms.uOpacity.value = targetOpacity;
                
                half.matDisk.uniforms.uColor.value.copy(targetColor);
                half.matDisk.uniforms.uOpacity.value = targetOpacity;
            });
        });
    },
    
    updateCamera(camera) {
        if (!gizmoGroup.visible) return;
        
        ['x', 'y', 'z'].forEach(a => {
            if (!rings[a]) return;
            rings[a].halves.forEach(half => {
                half.matRibbon.uniforms.uCameraPos.value.copy(camera.position);
            });
        });
    },

    getPosition() { return gizmoGroup.position; },
    get isVisible() { return gizmoGroup.visible; },
    get hoveredAxis() { return currentHover; }
};