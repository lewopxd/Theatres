// ============================================================
// MessageDialog — Ventana modal de mensajes y confirmaciones
// Soporta arrastre con límites de pantalla y blindaje anti-Three.js
// ============================================================

import { createIcons } from '../utils/dom.js';

export const MessageDialog = {
    overlay: null,
    box: null,

    init() {
        if (this.overlay) return;

        // 1. Create overlay container
        this.overlay = document.createElement('div');
        this.overlay.className = 'dialog-overlay';
        this.overlay.id = '__messageDialogOverlay__';

        this.overlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-header">
                    <div class="dialog-icon-wrapper">
                        <i class="ph" id="dialog-icon"></i>
                    </div>
                    <span class="dialog-title" id="dialog-title">Mensaje</span>
                </div>
                <div class="dialog-body" id="dialog-message">Contenido del mensaje...</div>
                <div class="dialog-footer" id="dialog-buttons">
                    <!-- Buttons are inserted dynamically -->
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.box = this.overlay.querySelector('.dialog-box');

        // 2. Event Shielding: block pointer/mouse/touch/scroll events from reaching Three.js canvas
        const stopEvents = [
            'pointerdown', 'pointerup', 'pointermove',
            'mousedown', 'mouseup', 'mousemove',
            'click', 'dblclick', 'contextmenu',
            'touchstart', 'touchmove', 'touchend', 'wheel'
        ];
        stopEvents.forEach(evt => {
            this.box.addEventListener(evt, e => e.stopPropagation(), { capture: true });
        });

        // 3. Initialize Drag Physics
        this._initDrag();
    },

    /**
     * Dragging system with screen bounds clamping
     */
    _initDrag() {
        let dragging = false;
        let sx, sy, il, it;

        const onMove = (e) => {
            if (!dragging) return;
            e.preventDefault();
            e.stopPropagation();

            const bodyRect = document.body.getBoundingClientRect();
            const boxWidth = this.box.offsetWidth;
            const boxHeight = this.box.offsetHeight;

            // Compute target coordinates
            let left = il + (e.clientX - sx);
            let top = it + (e.clientY - sy);

            // Clamp coordinates to remain fully inside the viewport boundaries
            left = Math.max(0, Math.min(left, bodyRect.width - boxWidth));
            top = Math.max(0, Math.min(top, bodyRect.height - boxHeight));

            this.box.style.left = `${left}px`;
            this.box.style.top = `${top}px`;
        };

        const onUp = (e) => {
            if (dragging) {
                e.stopPropagation();
                dragging = false;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', onUp, true);
            }
        };

        const dragArea = this.box.querySelector('.dialog-header');
        dragArea.style.cursor = 'move';
        
        dragArea.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            dragging = true;
            sx = e.clientX;
            sy = e.clientY;

            // Read starting coordinates (initialize to bounding client rect values if first drag)
            const boxRect = this.box.getBoundingClientRect();
            il = this.box.offsetLeft || boxRect.left;
            it = this.box.offsetTop || boxRect.top;

            // Override flex centering styles with absolute values
            this.box.style.position = 'absolute';
            this.box.style.margin = '0';
            this.box.style.transform = 'none'; // remove flex alignment scaling transform
            this.box.style.left = `${il}px`;
            this.box.style.top = `${it}px`;

            document.addEventListener('pointermove', onMove, { capture: true, passive: false });
            document.addEventListener('pointerup', onUp, { capture: true });
        });
    },

    /**
     * Show a message popup
     * @param {Object} options
     * @param {string} options.title - Header title
     * @param {string} options.message - Body text (HTML allowed)
     * @param {string} [options.icon='info'] - 'info' | 'warning' | 'error' | 'question' | 'success' | custom phosphor class
     * @param {Array<{text: string, value: any, type?: string}>} [options.buttons] - Up to 3 custom button options
     * @returns {Promise<any>} Resolves with the value of the clicked button
     */
    show(options) {
        this.init();

        const {
            title,
            message,
            icon = 'info',
            buttons = [{ text: 'Aceptar', value: true, type: 'primary' }]
        } = options;

        // Reset dialog box styles back to CSS centering defaults
        this.box.style.position = '';
        this.box.style.left = '';
        this.box.style.top = '';
        this.box.style.margin = '';
        this.box.style.transform = '';

        // Assign contents
        const titleEl = this.overlay.querySelector('#dialog-title');
        const msgEl = this.overlay.querySelector('#dialog-message');
        titleEl.textContent = title;
        msgEl.innerHTML = message;

        // Configure Icon & Styling Theme
        const iconEl = this.overlay.querySelector('#dialog-icon');
        const iconWrapper = this.overlay.querySelector('.dialog-icon-wrapper');
        
        iconWrapper.className = 'dialog-icon-wrapper';
        iconEl.className = 'ph';

        let iconName = '';
        if (icon === 'info') {
            iconWrapper.classList.add('type-info');
            iconName = 'ph-info';
        } else if (icon === 'warning') {
            iconWrapper.classList.add('type-warning');
            iconName = 'ph-warning';
        } else if (icon === 'error') {
            iconWrapper.classList.add('type-error');
            iconName = 'ph-x-circle';
        } else if (icon === 'question') {
            iconWrapper.classList.add('type-question');
            iconName = 'ph-question';
        } else if (icon === 'success') {
            iconWrapper.classList.add('type-success');
            iconName = 'ph-check-circle';
        } else {
            iconWrapper.classList.add('type-custom');
            iconName = icon.startsWith('ph-') ? icon : `ph-${icon}`;
        }
        iconEl.classList.add(iconName);

        // Build button row (up to 3 buttons)
        const footer = this.overlay.querySelector('#dialog-buttons');
        footer.innerHTML = '';

        return new Promise((resolve) => {
            const cleanUpAndClose = (val) => {
                this.overlay.classList.remove('active');
                setTimeout(() => {
                    resolve(val);
                }, 200); // match transition out animation duration
            };

            const activeButtons = buttons.slice(0, 3);
            activeButtons.forEach(btnOpt => {
                const btn = document.createElement('button');
                btn.className = `dialog-btn btn-${btnOpt.type || 'secondary'}`;
                btn.textContent = btnOpt.text;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    cleanUpAndClose(btnOpt.value);
                });
                footer.appendChild(btn);
            });

            // Activate modal and render icons
            createIcons();
            this.overlay.classList.add('active');
        });
    }
};
