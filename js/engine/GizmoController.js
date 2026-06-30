// ============================================================
// GizmoController — Gizmo de orientación 3D arrastrable
// ============================================================

import * as THREE from 'three';
import { Settings } from '../core/Settings.js';

export class MinimalGizmo {
    constructor(mainCamera, renderer, domElement) {
        this.mainCamera = mainCamera;
        this.renderer = renderer;
        this.domElement = domElement;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 100);
        this.visible = true;

        const createAxis = (dir, colorHex, label) => {
            const mat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2, depthTest: false });
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir]);
            this.scene.add(new THREE.Line(geo, mat));
            const negMat = mat.clone(); negMat.transparent = true; negMat.opacity = 0.2;
            const negGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().negate()]);
            this.scene.add(new THREE.Line(negGeo, negMat));
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, 32, 32);
            const spriteMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.copy(dir).multiplyScalar(1.25);
            sprite.scale.set(0.6, 0.6, 0.6);
            this.scene.add(sprite);
        };

        createAxis(new THREE.Vector3(1, 0, 0), 0xff3333, 'X');
        if (Settings.get('visualZUp')) {
            createAxis(new THREE.Vector3(0, 1, 0), 0x3333ff, 'Z');
            createAxis(new THREE.Vector3(0, 0, 1), 0x33ff33, 'Y');
        } else {
            createAxis(new THREE.Vector3(0, 1, 0), 0x33ff33, 'Y');
            createAxis(new THREE.Vector3(0, 0, 1), 0x3333ff, 'Z');
        }
        this._initDrag();
    }

    _initDrag() {
        let dragging = false, startX, startY, initLeft, initTop;
        const onMove = e => {
            if (!dragging) return;
            const wrapper = this.domElement.parentElement;
            let nx = initLeft + (e.clientX - startX);
            let ny = initTop + (e.clientY - startY);
            nx = Math.max(0, Math.min(nx, wrapper.clientWidth - this.domElement.offsetWidth));
            ny = Math.max(0, Math.min(ny, wrapper.clientHeight - this.domElement.offsetHeight));
            this.domElement.style.left = nx + 'px';
            this.domElement.style.top = ny + 'px';
            this.domElement.style.right = 'auto';
        };
        const onUp = () => {
            dragging = false;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        this.domElement.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            dragging = true; startX = e.clientX; startY = e.clientY;
            initLeft = this.domElement.offsetLeft; initTop = this.domElement.offsetTop;
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            e.stopPropagation();
        });
    }

    render() {
        if (!this.visible || this.domElement.style.display === 'none') return;
        this.camera.quaternion.copy(this.mainCamera.quaternion);
        this.camera.position.set(0, 0, 5).applyQuaternion(this.camera.quaternion);
        this.camera.lookAt(0, 0, 0);
        const rect = this.domElement.getBoundingClientRect();
        const canvasRect = this.renderer.domElement.getBoundingClientRect();
        const x = rect.left - canvasRect.left;
        const y = canvasRect.bottom - rect.bottom;
        const currentViewport = this.renderer.getViewport(new THREE.Vector4());
        this.renderer.clearDepth();
        this.renderer.setViewport(x, y, rect.width, rect.height);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setViewport(currentViewport);
    }

    setVisible(v) {
        this.visible = v;
        this.domElement.style.display = v ? 'block' : 'none';
    }
}
