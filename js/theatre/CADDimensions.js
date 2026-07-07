// ============================================================
// CADDimensions — Acotaciones CAD (líneas + texto + flechas)
// ============================================================

import * as THREE from 'three';

export class CADDimension {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} p1 — start point
     * @param {THREE.Vector3} p2 — end point
     * @param {string} text — dimension label (e.g. "8.00 m")
     * @param {THREE.Vector3} offsetDir — direction of extension lines
     * @param {number} offsetDist — distance of dimension line from object
     * @param {number} [color=0x858585]
     * @param {THREE.Vector3[]|null} [contourPoints=null] — optional contour outline
     */
    constructor(scene, p1, p2, text, offsetDir, offsetDist, color = 0x858585, contourPoints = null) {
        this.group = new THREE.Group();
        const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 });
        const dir = offsetDir.clone().normalize().multiplyScalar(offsetDist);
        const s = p1.clone().add(dir);
        const e = p2.clone().add(dir);

        // Extension lines (dashed and semi-transparent)
        const dashMat = new THREE.LineDashedMaterial({ 
            color: 0x858585, 
            depthTest: false, 
            transparent: true, 
            opacity: 0.4,
            dashSize: 0.1,
            gapSize: 0.1
        });

        const extLine1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, s]), dashMat);
        extLine1.computeLineDistances();
        this.group.add(extLine1);

        const extLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p2, e]), dashMat);
        extLine2.computeLineDistances();
        this.group.add(extLine2);

        const lineDir = new THREE.Vector3().subVectors(e, s).normalize();

        // Text sprite
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#cccccc';
        ctx.font = 'normal 22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);

        const spriteMat = new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(canvas),
            depthTest: false,
            sizeAttenuation: true
        });
        const sprite = new THREE.Sprite(spriteMat);
        const textWorldWidth = 1.0;
        sprite.scale.set(textWorldWidth * 2.5, textWorldWidth * 0.6, 1);
        sprite.renderOrder = 999;

        const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
        sprite.position.copy(mid);
        this.group.add(sprite);

        // Dimension line segments (with gap for text)
        const gap = lineDir.clone().multiplyScalar(textWorldWidth / 2);
        this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([s, mid.clone().sub(gap)]), mat));
        this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([mid.clone().add(gap), e]), mat));

        // Arrows
        const up = new THREE.Vector3().crossVectors(lineDir, offsetDir).normalize();
        if (up.lengthSq() < 0.001) up.set(0, 1, 0).cross(lineDir).normalize();
        const arrL = 0.2, arrW = 0.06;

        const createArrow = (pos, d) => {
            const pA = pos.clone().add(d.clone().multiplyScalar(arrL)).add(up.clone().multiplyScalar(arrW));
            const pB = pos.clone().add(d.clone().multiplyScalar(arrL)).sub(up.clone().multiplyScalar(arrW));
            this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pA, pos, pB]), mat));
        };

        createArrow(s, lineDir.clone());
        createArrow(e, lineDir.clone().negate());

        this.group.renderOrder = 998;
        scene.add(this.group);

        // Optional contour
        if (contourPoints && contourPoints.length > 0) {
            const cGeo = new THREE.BufferGeometry().setFromPoints([...contourPoints, contourPoints[0]]);
            const cMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthTest: false });
            this.contourMesh = new THREE.Line(cGeo, cMat);
            this.contourMesh.renderOrder = 997;
            this.contourMesh.visible = false;
            this.group.add(this.contourMesh);
        }
    }

    setVisibility(v, mode3D) {
        this.group.visible = v;
        if (this.contourMesh) this.contourMesh.visible = v && mode3D;
    }

    updateContourVisibility(mode3D) {
        if (this.contourMesh) this.contourMesh.visible = this.group.visible && mode3D;
    }

    dispose() {
        if (this.group) {
            this.group.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            if (this.group.parent) {
                this.group.parent.remove(this.group);
            }
        }
    }
}
