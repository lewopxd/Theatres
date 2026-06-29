// ============================================================
// TopBarController — Top bar buttons and mode toggles
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { History } from '../core/History.js';
import { Registry } from '../core/Registry.js';
import { applyLayerVisibility, updateBrightness } from '../engine/SceneManager.js';
import {
    resizeCameras, setupCamPos, camOrthoMain, ctrlOrthoMain, autoFitTheatres
} from '../engine/CameraManager.js';
import { generateGrid } from '../engine/GridGenerator.js';
import { ModalAPI } from './ModalAPI.js';
import { createIcons, $ } from '../utils/dom.js';
import { setActiveTool } from '../tools/ToolManager.js';

let gizmoRef = null;

/**
 * Initialize top bar controller
 * @param {Object} gizmo — the MinimalGizmo instance
 */
export function initTopBar(gizmo) {
    gizmoRef = gizmo;
    initToggleView();
    initWireframe();
    initDimensions();
    initGizmoToggle();
    initBrightness();
    initGrid();
    initUndoRedo();
    init2DToolbar();
    initClampToggle();
}

function initClampToggle() {
    const btnClamp = $('btn-clamp');
    if (btnClamp) {
        btnClamp.addEventListener('click', function () {
            const isClamped = !State.get('isMoveClamped');
            State.set('isMoveClamped', isClamped);
            this.classList.toggle('active', isClamped);
        });
    }
}

function initToggleView() {
    const btnToggleView = $('btn-toggle-view');
    const toolbar2d = $('toolbar-2d');
    const statusCam = $('status-cam');
    const btnWireframe = $('btn-wireframe');
    const btnGizmo = $('btn-gizmo');
    const gizmoEl = $('gizmo-container');
    const container = $('canvas-wrapper');

    btnToggleView.addEventListener('click', () => {
        const is3DMode = !State.get('is3DMode');
        State.set('is3DMode', is3DMode);

        if (is3DMode) {
            btnToggleView.innerHTML = '<i data-lucide="box"></i>';
            toolbar2d.classList.remove('active');
            State.set('isSplit', false);
            container.classList.remove('split-active');
            statusCam.innerText = 'Perspectiva (3D)';
            State.set('isWireframe', State.get('previousWireframeState'));
            btnWireframe.classList.toggle('active', State.get('isWireframe'));
            btnWireframe.classList.remove('disabled');
            btnGizmo.classList.remove('disabled');
            gizmoEl.style.display = gizmoRef.visible ? 'block' : 'none';
            $('btn-select').style.display = '';
            $('btn-move').style.display = '';
            $('btn-orbit').style.display = '';
            $('btn-pan').style.display = '';
            
            document.querySelectorAll('.btn-plane[data-plane]').forEach(b => b.style.display = '');
            const sep = document.querySelector('#move-planes .tb-sep');
            if (sep) sep.style.display = 'inline-block';

            setActiveTool(State.get('activeTool'));
        } else {
            btnToggleView.innerHTML = '<i data-lucide="square"></i>';
            toolbar2d.classList.add('active');
            document.querySelector(`[data-mode="${State.get('active2DMode')}"]`)?.click();
            State.set('previousWireframeState', State.get('isWireframe'));
            btnWireframe.classList.add('active', 'disabled');
            btnGizmo.classList.add('disabled');
            gizmoEl.style.display = 'none';

            document.querySelectorAll('.btn-plane[data-plane]').forEach(b => b.style.display = 'none');
            const sep = document.querySelector('#move-planes .tb-sep');
            if (sep) sep.style.display = 'none';
            $('btn-select').style.display = '';
            $('btn-move').style.display = '';
            $('btn-orbit').style.display = 'none';
            $('btn-pan').style.display = '';
            setActiveTool('select');
        }

        applyLayerVisibility(is3DMode, State.get('isWireframe'));
        Registry.getDimensions().forEach(d => d.updateContourVisibility(is3DMode));
        createIcons();
        resizeCameras(container, is3DMode, State.get('isSplit'));
    });
}

function initWireframe() {
    const btnWireframe = $('btn-wireframe');
    btnWireframe.addEventListener('click', function () {
        if (!State.get('is3DMode')) return;
        const newWire = !State.get('isWireframe');
        State.set('isWireframe', newWire);
        this.classList.toggle('active', newWire);
        applyLayerVisibility(State.get('is3DMode'), newWire);
    });
}

function initDimensions() {
    $('btn-dimensions').addEventListener('click', function () {
        const newVis = !State.get('dimsVisible');
        State.set('dimsVisible', newVis);
        this.classList.toggle('active', newVis);
        Registry.getDimensions().forEach(d => d.setVisibility(newVis, State.get('is3DMode')));
    });
}

function initGizmoToggle() {
    $('btn-gizmo').addEventListener('click', function () {
        if (!State.get('is3DMode')) return;
        gizmoRef.visible = !gizmoRef.visible;
        $('gizmo-container').style.display = gizmoRef.visible ? 'block' : 'none';
        this.classList.toggle('active', gizmoRef.visible);
    });
}

function initBrightness() {
    const btnBright = $('btn-brightness');
    const brightCont = $('brightness-container');
    const btnClose = $('btn-close-brightness');

    const toggleBrightness = (show) => {
        if (show === undefined) show = brightCont.style.display !== 'flex';
        brightCont.style.display = show ? 'flex' : 'none';
        btnBright.classList.toggle('active', show);
    };

    btnBright.addEventListener('click', e => {
        e.stopPropagation();
        toggleBrightness();
    });

    if (btnClose) {
        btnClose.addEventListener('click', e => {
            e.stopPropagation();
            toggleBrightness(false);
        });
    }

    $('brightness-slider').addEventListener('change', () => {
        updateBrightness(parseFloat($('brightness-slider').value));
        History.save();
    });

    brightCont.addEventListener('pointerdown', e => {
        e.stopPropagation();
    });
}

function initGrid() {
    const gridConfig = State.getGridConfig();
    const gridModalHTML = `
        <label class="switch-wrapper"><input type="checkbox" id="cfg-grid-visible" checked> Mostrar Grid</label>
        <label class="switch-wrapper" style="margin-top:5px;"><input type="checkbox" id="cfg-grid-below"> Grid bajo el piso</label>
        <div class="form-group" style="margin-top:10px;">
            <label>Tipo</label>
            <select id="cfg-grid-type" class="form-control">
                <option value="dots">Puntos</option>
                <option value="lines" selected>Líneas</option>
                <option value="dashed">Punteadas</option>
                <option value="crosses">Cruces</option>
            </select>
        </div>
        <div class="form-group"><label>Grosor/Tamaño</label><input type="range" id="cfg-grid-size" min="1" max="5" step="0.5" value="1"></div>
        <div class="form-group"><label>Color</label><input type="color" id="cfg-grid-color" class="form-control" value="#6a7b8e"></div>
        <div class="form-group"><label>Transparencia</label><input type="range" id="cfg-grid-opacity" min="0.1" max="1" step="0.1" value="0.3"></div>
    `;
    const gridModal = new ModalAPI('modal-grid', 'Config. Grid', gridModalHTML, 260);

    const keyMap = { visible: 'visible', belowFloor: 'below', type: 'type', size: 'size', color: 'color', opacity: 'opacity' };
    Object.entries(keyMap).forEach(([k, inputId]) => {
        const el = $(`cfg-grid-${inputId}`);
        if (el) {
            el.addEventListener('change', e => {
                gridConfig[k] = (k === 'visible' || k === 'belowFloor')
                    ? e.target.checked
                    : (k === 'type' || k === 'color' ? e.target.value : parseFloat(e.target.value));
                generateGrid(gridConfig);
                const slider = $('brightness-slider');
                updateBrightness(slider ? parseFloat(slider.value) : 1);
            });
        }
    });

    $('btn-grid').addEventListener('click', () => gridModal.toggle());
}

function initUndoRedo() {
    $('btn-undo').addEventListener('click', () => History.undo());
    $('btn-redo').addEventListener('click', () => History.redo());

    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { History.undo(); e.preventDefault(); }
        if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { History.redo(); e.preventDefault(); }
    });
}

function init2DToolbar() {
    const container = $('canvas-wrapper');
    const statusCam = $('status-cam');

    document.querySelectorAll('.btn-cam-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-cam-mode').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;

            if (mode === 'split') {
                State.set('isSplit', true);
                container.classList.add('split-active');
                statusCam.innerText = 'Vista Dividida (2D)';
            } else {
                State.set('isSplit', false);
                container.classList.remove('split-active');
                State.set('active2DMode', mode);
                setupCamPos(camOrthoMain, mode, ctrlOrthoMain);
                statusCam.innerText = `Ortográfica — ${btn.title}`;
            }

            resizeCameras(container, State.get('is3DMode'), State.get('isSplit'));
        });
    });

    // Fit view button
    const btnFit = $('btn-fit-view');
    if (btnFit) {
        btnFit.addEventListener('click', () => {
            const isSplit = State.get('isSplit');
            autoFitTheatres(container, isSplit, true);
        });
    }
}
