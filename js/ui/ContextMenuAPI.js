// ============================================================
// ContextMenuAPI — Menú contextual posicional
// ============================================================

import { createIcons } from '../utils/dom.js';
import { State } from '../core/State.js';

class ContextMenuController {
    constructor() {
        this.el = document.createElement('div');
        this.el.className = 'context-menu';
        document.body.appendChild(this.el);
        this.timeout = null;
        this._outsideClick = this._outsideClick.bind(this);
        this._resetTimer = this._resetTimer.bind(this);
    }

    /**
     * Show context menu at position
     * @param {number} x
     * @param {number} y
     * @param {{ icon: string, label: string, action: Function }[]} items
     */
    show(x, y, items) {
        this.el.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'context-menu-item';
            div.innerHTML = `<i data-lucide="${item.icon}"></i> <span>${item.label}</span>`;
            div.addEventListener('click', e => {
                e.stopPropagation();
                item.action();
                this.hide();
            });
            this.el.appendChild(div);
        });
        createIcons({ root: this.el });
        this.el.classList.add('active');
        this.el.style.zIndex = State.bumpZ() + 1000;

        // Position clamping
        const rect = this.el.getBoundingClientRect();
        let fx = x, fy = y;
        if (x + rect.width > window.innerWidth) fx = window.innerWidth - rect.width - 5;
        if (y + rect.height > window.innerHeight) {
            fy = y - rect.height - 35;
            if (fy < 0) fy = 5;
        }
        this.el.style.left = `${fx}px`;
        this.el.style.top = `${fy}px`;

        document.addEventListener('pointerdown', this._outsideClick);
        document.addEventListener('mousemove', this._resetTimer);
        this._resetTimer();
    }

    hide() {
        this.el.classList.remove('active');
        document.removeEventListener('pointerdown', this._outsideClick);
        document.removeEventListener('mousemove', this._resetTimer);
        clearTimeout(this.timeout);
    }

    _outsideClick(e) {
        if (!this.el.contains(e.target)) this.hide();
    }

    _resetTimer() {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.hide(), 3000);
    }
}

// Singleton
export const contextMenu = new ContextMenuController();
