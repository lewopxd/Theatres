import { State } from '../core/State.js';
import * as THREE from 'three';

class ScrollbarManager {
    constructor() {
        this.scrollbars = [];
        this.isDragging = false;
        this.onDragChange = null; // Callback when user drags a scrollbar
    }

    init() {
        const vpScrolls = document.querySelectorAll('.vp-scroll');
        vpScrolls.forEach(track => {
            const thumb = track.querySelector('.vp-thumb');
            if (!thumb) return;

            const isVertical = track.classList.contains('v-scroll');
            const modeClass = Array.from(track.classList).find(c => c.startsWith('split-') || c === 'single-scroll');
            
            const scrollbar = { track, thumb, isVertical, modeClass, targetVal: 0, viewSize: 1, limit: 10 };
            this.scrollbars.push(scrollbar);

            // Dragging mechanics
            let startPos = 0;
            let startTargetVal = 0;

            const onPointerMove = (e) => {
                if (!this.isDragging) return;
                const deltaPx = isVertical ? (e.clientY - startPos) : (e.clientX - startPos);
                const trackSize = isVertical ? track.clientHeight : track.clientWidth;
                
                // deltaPx / trackSize = deltaVal / scrollbar.limit
                // Wait: the track represents [-limit/2, limit/2], so total value range is `limit`.
                // However, the thumb's movement is constrained to (trackSize - thumbSize).
                const thumbSize = isVertical ? thumb.clientHeight : thumb.clientWidth;
                const availablePx = trackSize - thumbSize;
                if (availablePx <= 0) return;

                const deltaPct = deltaPx / availablePx;
                const deltaVal = deltaPct * scrollbar.limit;
                
                let newVal = startTargetVal + deltaVal;

                if (this.onDragChange) {
                    this.onDragChange(scrollbar, newVal);
                }
            };

            const onPointerUp = () => {
                this.isDragging = false;
                document.body.style.cursor = 'default';
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            };

            thumb.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.isDragging = true;
                startPos = isVertical ? e.clientY : e.clientX;
                startTargetVal = scrollbar.targetVal;
                
                document.body.style.cursor = 'default';
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
            });
        });

        this.onDragChange = (scrollbar, newVal) => {
            this.applyDrag(scrollbar, newVal);
        };
    }

    /**
     * Updates the scrollbar UI based on the active camera controls
     * @param {Array} activeConfigs - Array of { ctrl, modeClass, modeName }
     */
    update(activeConfigs) {
        const stageW = (State.get('stageWidth') || 8);
        const stageD = (State.get('stageDepth') || 7.5);
        const stageH = (State.get('stageHeight') || 4.5);

        activeConfigs.forEach(config => {
            const { ctrl, modeClass, modeName } = config;
            const cam = ctrl.object;
            const target = ctrl.target;

            // Find matching scrollbars
            const bars = this.scrollbars.filter(b => b.modeClass === modeClass);
            
            // Calculate dynamic limits and mapped values based on mode
            let xVal = 0, yVal = 0;
            let limitX = stageW * 3;
            let limitY = stageD * 3;
            let viewW = 10, viewH = 10;

            if (cam.isOrthographicCamera) {
                viewW = (cam.right - cam.left) / cam.zoom;
                viewH = (cam.top - cam.bottom) / cam.zoom;
            } else {
                const dist = cam.position.distanceTo(target);
                viewH = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * dist;
                viewW = viewH * cam.aspect;
            }

            if (modeName === 'top' || modeName === 'bottom') {
                xVal = target.x; yVal = target.z;
                limitX = Math.max(stageW * 3, Math.abs(xVal) * 2 + viewW);
                limitY = Math.max(stageD * 3, Math.abs(yVal) * 2 + viewH);
            } else if (modeName === 'left' || modeName === 'right') {
                xVal = target.z; yVal = target.y;
                limitX = Math.max(stageD * 3, Math.abs(xVal) * 2 + viewW);
                limitY = Math.max(stageH * 3, Math.abs(yVal) * 2 + viewH);
            } else if (modeName === 'front') {
                xVal = target.x; yVal = target.y;
                limitX = Math.max(stageW * 3, Math.abs(xVal) * 2 + viewW);
                limitY = Math.max(stageH * 3, Math.abs(yVal) * 2 + viewH);
            } else {
                // Ortho Iso or 3D Perspective
                xVal = target.x; yVal = target.z;
                limitX = Math.max(stageW * 3, Math.abs(xVal) * 2 + viewW);
                limitY = Math.max(stageD * 3, Math.abs(yVal) * 2 + viewH);
            }

            bars.forEach(b => {
                const isV = b.isVertical;
                const val = isV ? yVal : xVal;
                const limit = isV ? limitY : limitX;
                const viewSize = isV ? viewH : viewW;

                // ONLY update logical target if not dragging to prevent damping feedback loop
                if (!this.isDragging) {
                    b.targetVal = val;
                }
                
                b.limit = limit;
                b.viewSize = viewSize;
                b.modeName = modeName;
                b.ctrl = ctrl;

                // Render thumb (always update visually)
                const thumbSizePct = THREE.MathUtils.clamp(viewSize / limit, 0.05, 1);
                
                // Position 0 is at 50%
                const valPct = b.targetVal / limit; 
                const posPct = valPct + 0.5 - (thumbSizePct / 2);
                
                if (isV) {
                    b.thumb.style.height = `${thumbSizePct * 100}%`;
                    b.thumb.style.top = `${THREE.MathUtils.clamp(posPct, 0, 1 - thumbSizePct) * 100}%`;
                } else {
                    b.thumb.style.width = `${thumbSizePct * 100}%`;
                    b.thumb.style.left = `${THREE.MathUtils.clamp(posPct, 0, 1 - thumbSizePct) * 100}%`;
                }
            });
        });
    }

    applyDrag(scrollbar, newVal) {
        const ctrl = scrollbar.ctrl;
        const mode = scrollbar.modeName;
        if (!ctrl) return;

        const delta = newVal - scrollbar.targetVal;
        scrollbar.targetVal = newVal;

        const panVec = new THREE.Vector3();

        if (mode === 'top' || mode === 'bottom') {
            if (scrollbar.isVertical) panVec.z = delta;
            else panVec.x = delta;
        } else if (mode === 'left' || mode === 'right') {
            if (scrollbar.isVertical) panVec.y = delta;
            else panVec.z = delta;
        } else if (mode === 'front') {
            if (scrollbar.isVertical) panVec.y = delta;
            else panVec.x = delta;
        } else {
            if (scrollbar.isVertical) panVec.z = delta;
            else panVec.x = delta;
        }

        ctrl.target.add(panVec);
        ctrl.object.position.add(panVec);
        ctrl.update();
        
        // Broadcast custom event so other ortho cams can sync if needed
        ctrl.dispatchEvent({ type: 'change' });
    }
}

export const scrollbarManager = new ScrollbarManager();
