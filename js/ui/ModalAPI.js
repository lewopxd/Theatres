// ============================================================
// ModalAPI — Ventanas flotantes draggables reutilizables
// Migrated to Phosphor Icons
// ============================================================

import { createIcons } from '../utils/dom.js';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';

export class ModalAPI {
    /**
     * @param {string} id — unique DOM id
     * @param {string} title — window title
     * @param {string} contentHTML — body HTML
     * @param {number} [width=300]
     */
    constructor(id, title, contentHTML, width = 300) {
        this.element = document.createElement('div');
        this.element.className = 'window-modal';
        this.element.id = id;
        this.element.style.width = `${width}px`;
        this.element.innerHTML = `
            <div class="window-header">
                <span class="window-title">${title}</span>
                <button class="window-close">
                    <i class="ph ph-x" style="font-size:14px;"></i>
                </button>
            </div>
            <div class="window-body">${contentHTML}</div>
        `;
        document.body.appendChild(this.element);

        this.header = this.element.querySelector('.window-header');
        this.btnClose = this.element.querySelector('.window-close');

        this._initDrag();
        this.btnClose.addEventListener('click', () => this.close());
        this.element.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.element.style.zIndex = State.bumpZ() + 100;
        });

        EventBus.on('ui:closeOthers', (source) => {
            if (source !== this.element.id) {
                this.close();
            }
        });
    }

    _initDrag() {
        let dragging = false, sx, sy, il, it;
        const onMove = e => {
            if (!dragging) return;
            e.preventDefault();
            const b = document.body.getBoundingClientRect();
            this.element.style.left = `${Math.max(0, Math.min(il + (e.clientX - sx), b.width - this.element.offsetWidth))}px`;
            this.element.style.top = `${Math.max(0, Math.min(it + (e.clientY - sy), b.height - this.element.offsetHeight))}px`;
        };
        const onUp = () => {
            dragging = false;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        this.header.addEventListener('pointerdown', e => {
            if (e.target.closest('.window-close')) return;
            e.stopPropagation(); // prevent escaping
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            il = this.element.offsetLeft; it = this.element.offsetTop;
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
    }

    open() {
        this.element.style.zIndex = State.bumpZ() + 100;
        this.element.classList.add('open');
        EventBus.emit('ui:closeOthers', this.element.id);
    }

    close() {
        this.element.classList.remove('open');
    }

    toggle() {
        this.element.classList.contains('open') ? this.close() : this.open();
    }

    /**
     * Get a DOM element inside the modal body
     * @param {string} selector
     */
    query(selector) {
        return this.element.querySelector(selector);
    }
}
