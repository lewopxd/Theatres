// ============================================================
// LoaderUI — Orquestador del loader de inicio
// ============================================================

import { delay, $ } from '../utils/dom.js';

const STEPS = [
    { id: 'dom', label: 'Interfaz HTML lista' },
    { id: 'icons', label: 'Íconos cargados' },
    { id: 'three', label: 'Motor 3D inicializado' },
    { id: 'scene', label: 'Escena y geometrías' },
    { id: 'viewport', label: 'Viewport calculado' },
    { id: 'render', label: 'Primer frame renderizado' },
    { id: 'state', label: 'Estado restaurado' },
];

let completedSteps = 0;
let stepEls = {};

/**
 * Build loader step elements in DOM
 */
export function initLoader() {
    const stepsEl = $('loader-steps');
    STEPS.forEach(s => {
        const div = document.createElement('div');
        div.className = 'loader-step';
        div.id = `lstep-${s.id}`;
        div.innerHTML = `<div class="step-icon"></div><span>${s.label}</span>`;
        stepsEl.appendChild(div);
        stepEls[s.id] = div;
    });
}

/**
 * Activate a step (mark previous as done, current as active)
 * @param {string} stepId
 * @param {string} [statusText]
 */
export function loaderActivate(stepId, statusText) {
    const loaderBar = $('loader-bar');
    const loaderStatus = $('loader-status');
    const idx = STEPS.findIndex(s => s.id === stepId);
    STEPS.forEach((s, i) => {
        const el = stepEls[s.id];
        el.classList.remove('active', 'done');
        if (i < idx) el.classList.add('done');
        if (i === idx) el.classList.add('active');
    });
    if (statusText) loaderStatus.textContent = statusText;
    loaderBar.style.width = `${Math.round((idx / (STEPS.length - 1)) * 100)}%`;
}

/**
 * Mark a step as complete
 * @param {string} stepId
 */
export function loaderComplete(stepId) {
    const loaderBar = $('loader-bar');
    const el = stepEls[stepId];
    el.classList.remove('active');
    el.classList.add('done');
    completedSteps++;
    const pct = Math.round((completedSteps / STEPS.length) * 100);
    loaderBar.style.width = `${pct}%`;
}

/**
 * Dismiss the loader and reveal the app
 */
export async function loaderDismiss() {
    const loaderEl = $('tecal-loader');
    const loaderBar = $('loader-bar');
    const loaderStatus = $('loader-status');

    loaderBar.style.width = '100%';
    loaderStatus.textContent = '¡Listo!';
    await delay(280);
    loaderEl.classList.add('fade-out');
    $('app-shell').classList.add('ready');
    setTimeout(() => loaderEl.remove(), 600);
}
