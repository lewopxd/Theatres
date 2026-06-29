// ============================================================
// ToolManager — Máquina de estados de herramientas
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { AXIS_LABELS, TOOL_KEYS } from '../utils/constants.js';
import { $ } from '../utils/dom.js';
import { ctrl3D, allControls } from '../engine/CameraManager.js';

/**
 * Set the active tool and update UI/controls accordingly
 * @param {string} tool — 'select'|'move'|'orbit'|'pan'
 */
export function setActiveTool(tool) {
    State.set('activeTool', tool);

    const btnSelect = $('btn-select');
    const btnMove = $('btn-move');
    const btnOrbit = $('btn-orbit');
    const btnPan = $('btn-pan');
    const movePlanes = $('move-planes');
    const canvasWrapper = $('canvas-wrapper');
    const axisIndicator = $('axis-indicator');

    btnSelect.classList.toggle('active', tool === 'select');
    btnMove.classList.toggle('active', tool === 'move');
    btnOrbit.classList.toggle('active', tool === 'orbit');
    btnPan.classList.toggle('active', tool === 'pan');

    movePlanes.classList.toggle('visible', tool === 'move');
    canvasWrapper.className = 'tool-' + tool;

    const is3DMode = State.get('is3DMode');
    ctrl3D.enabled = is3DMode;
    ctrl3D.enableZoom = true;

    if (tool === 'orbit') {
        ctrl3D.enableRotate = true;
        allControls.forEach(c => c.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        });
    } else if (tool === 'pan') {
        ctrl3D.enableRotate = false;
        allControls.forEach(c => c.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        });
    } else {
        ctrl3D.enableRotate = false;
        allControls.forEach(c => c.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        });
    }

    if (tool === 'move') {
        const activePlane = State.get('activePlane');
        axisIndicator.textContent = AXIS_LABELS[activePlane];
        axisIndicator.classList.add('visible');
        setTimeout(() => axisIndicator.classList.remove('visible'), 1800);
    } else {
        axisIndicator.classList.remove('visible');
    }

    EventBus.emit('tool:changed', { tool });
}

/**
 * Initialize tool keyboard shortcuts
 */
export function initToolShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        const tool = TOOL_KEYS[e.key];
        if (tool) setActiveTool(tool);
        if (e.key === 'Escape') EventBus.emit('selection:clear');
    });
}

/**
 * Initialize plane buttons
 */
export function initPlaneButtons() {
    const axisIndicator = $('axis-indicator');
    document.querySelectorAll('.btn-plane').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-plane').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.set('activePlane', btn.dataset.plane);
            axisIndicator.textContent = AXIS_LABELS[btn.dataset.plane];
            axisIndicator.classList.add('visible');
            setTimeout(() => axisIndicator.classList.remove('visible'), 1500);
        });
    });
}

/**
 * Initialize main tool buttons (Select, Move, Orbit, Pan)
 */
export function initToolButtons() {
    $('btn-select').addEventListener('click', () => setActiveTool('select'));
    $('btn-move').addEventListener('click', () => setActiveTool('move'));
    $('btn-orbit').addEventListener('click', () => setActiveTool('orbit'));
    $('btn-pan').addEventListener('click', () => setActiveTool('pan'));
}
