// ============================================================
// ToolManager — Máquina de estados de herramientas
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { AXIS_LABELS, TOOL_KEYS } from '../utils/constants.js';
import { $ } from '../utils/dom.js';
import { ctrl3D, allControls } from '../engine/CameraManager.js';
import { DeleteEngine } from '../engine/DeleteEngine.js';
import { DuplicateEngine } from '../engine/DuplicateEngine.js';

/**
 * Set the active tool and update UI/controls accordingly
 * @param {string} tool — 'select'|'move'|'orbit'|'pan'
 */
export function setActiveTool(tool) {
    State.set('activeTool', tool);

    const btnSelect = $('btn-select');
    const btnMove = $('btn-move');
    const btnRotate = $('btn-rotate');
    const btnOrbit = $('btn-orbit');
    const btnPan = $('btn-pan');
    const movePlanes = $('move-planes');
    const canvasWrapper = $('canvas-wrapper');

    btnSelect.classList.toggle('active', tool === 'select');
    btnMove.classList.toggle('active', tool === 'move');
    btnRotate.classList.toggle('active', tool === 'rotate');
    btnOrbit.classList.toggle('active', tool === 'orbit');
    btnPan.classList.toggle('active', tool === 'pan');

    const is3DMode = State.get('is3DMode');
    movePlanes.classList.toggle('visible', is3DMode);
    // Remove all existing tool-* classes safely
    const classesToRemove = [];
    canvasWrapper.classList.forEach(cls => {
        if (cls.startsWith('tool-')) {
            classesToRemove.push(cls);
        }
    });
    classesToRemove.forEach(cls => canvasWrapper.classList.remove(cls));
    // Add the new tool class
    canvasWrapper.classList.add('tool-' + tool);

    ctrl3D.enabled = is3DMode;

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
        // Any other move tool setup if needed
    }


    EventBus.emit('tool:changed', { tool });
}

/**
 * Initialize tool keyboard shortcuts
 */
export function initToolShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.key === 'Delete' || e.key === 'Backspace') {
            DeleteEngine.execute();
            return;
        }

        if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            DuplicateEngine.execute();
            return;
        }

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
    $('btn-rotate').addEventListener('click', () => setActiveTool('rotate'));
    $('btn-orbit').addEventListener('click', () => setActiveTool('orbit'));
    $('btn-pan').addEventListener('click', () => setActiveTool('pan'));
}
