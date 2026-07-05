import * as THREE from 'three';
import { $ } from '../utils/dom.js';
import { RotationGizmo } from '../engine/RotationGizmo.js';

let container = null;
let checkbox = null;
let angleXLabel = null;
let angleYLabel = null;
let angleZLabel = null;

let _isRotateMode = false;

export const GizmoDebugWindow = {
    init() {
        if (container) return;

        container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.display = 'none'; // HIDDEN
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.width = '200px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        container.style.color = '#fff';
        container.style.fontFamily = 'monospace';
        container.style.fontSize = '12px';
        container.style.padding = '10px';
        container.style.borderRadius = '5px';
        container.style.zIndex = '9999';
        container.style.border = '1px solid #444';
        container.style.pointerEvents = 'auto'; // allow clicking inside
        container.style.userSelect = 'none';

        const title = document.createElement('div');
        title.innerText = 'GIZMO DEBUG';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '10px';
        title.style.borderBottom = '1px solid #555';
        title.style.paddingBottom = '5px';
        container.appendChild(title);

        const checkLabel = document.createElement('label');
        checkLabel.style.display = 'flex';
        checkLabel.style.alignItems = 'center';
        checkLabel.style.cursor = 'pointer';
        checkLabel.style.marginBottom = '10px';
        
        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.marginRight = '8px';
        checkbox.addEventListener('change', (e) => {
            _isRotateMode = e.target.checked;
        });

        checkLabel.appendChild(checkbox);
        checkLabel.appendChild(document.createTextNode('Rotar Gizmo (Debug)'));
        container.appendChild(checkLabel);

        const anglesContainer = document.createElement('div');
        anglesContainer.style.display = 'flex';
        anglesContainer.style.flexDirection = 'column';
        anglesContainer.style.gap = '4px';

        angleXLabel = document.createElement('div');
        angleYLabel = document.createElement('div');
        angleZLabel = document.createElement('div');

        anglesContainer.appendChild(angleXLabel);
        anglesContainer.appendChild(angleYLabel);
        anglesContainer.appendChild(angleZLabel);

        container.appendChild(anglesContainer);

        const sliderContainer = document.createElement('div');
        sliderContainer.style.marginTop = '15px';
        sliderContainer.style.borderTop = '1px solid #555';
        sliderContainer.style.paddingTop = '10px';
        
        const sliderLabel = document.createElement('div');
        sliderLabel.innerText = 'Grosor de Aro (0.04)';
        sliderLabel.style.marginBottom = '5px';
        sliderContainer.appendChild(sliderLabel);

        const widthSlider = document.createElement('input');
        widthSlider.type = 'range';
        widthSlider.min = '0.01';
        widthSlider.max = '0.20';
        widthSlider.step = '0.005';
        widthSlider.value = '0.04'; 
        widthSlider.style.width = '100%';

        widthSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            sliderLabel.innerText = `Grosor de Aro (${val.toFixed(3)})`;
            RotationGizmo.setRibbonWidth(val);
        });

        sliderContainer.appendChild(widthSlider);
        container.appendChild(sliderContainer);

        document.body.appendChild(container);

        this.updateAngles(new THREE.Euler());
    },

    isGizmoRotateMode() {
        return _isRotateMode;
    },

    updateAngles(euler) {
        if (!angleXLabel) return;
        
        const degX = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
        const degY = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
        const degZ = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

        angleXLabel.innerHTML = `<span style="color:#ff6666">X:</span> ${degX}°`;
        angleYLabel.innerHTML = `<span style="color:#66ff66">Y:</span> ${degY}°`;
        angleZLabel.innerHTML = `<span style="color:#6666ff">Z:</span> ${degZ}°`;
    }
};
