// ============================================================
// ContextMenuAPI — Menú contextual posicional (SkeneCAD Style)
// Soporta submenús dinámicos en una misma ventana e inputs interactivos
// ============================================================

import { createIcons, $ } from '../utils/dom.js';

class ContextMenuController {
    constructor() {
        this.el = document.createElement('div');
        this.el.className = 'context-menu';
        document.body.appendChild(this.el);
        
        // Listeners
        this._outsideClick = this._outsideClick.bind(this);
        
        // Blindaje contra eventos de mouse de Three.js
        this.el.addEventListener('pointerdown', e => e.stopPropagation());
        this.el.addEventListener('mousedown', e => e.stopPropagation());
        this.el.addEventListener('mouseup', e => e.stopPropagation());
        this.el.addEventListener('click', e => e.stopPropagation());
        this.el.addEventListener('dblclick', e => e.stopPropagation());
        this.el.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        this.history = [];
        this.currentTitle = "Menú";
        this.currentItems = [];
    }

    /**
     * Muestra el menú contextual en la posición indicada
     * @param {number} x
     * @param {number} y
     * @param {{ label: string, icon: string, action?: Function, children?: Object[], isInput?: boolean, placeholder?: string, onConfirm?: Function }[]} items
     * @param {string} [title="Menú"]
     */
    show(x, y, items, title = "Menú") {
        this.history = [];
        this.currentTitle = title;
        this.currentItems = items;
        
        // Reset states of inputs
        items.forEach(item => {
            if (item.isInput) {
                item._editing = false;
                item._value = "";
            }
            if (item.children) {
                item.children.forEach(sub => {
                    if (sub.isInput) {
                        sub._editing = false;
                        sub._value = "";
                    }
                });
            }
        });

        this.render(items, title);
        this.el.classList.add('active');
        
        // Clamping y posicionamiento
        this.positionMenu(x, y);

        // Desactivar listener previo si existe y añadir el nuevo con retraso
        document.removeEventListener('pointerdown', this._outsideClick);
        setTimeout(() => {
            document.addEventListener('pointerdown', this._outsideClick);
        }, 10);
    }
    
    positionMenu(x, y) {
        // Reset transitorio para calcular dimensiones reales
        this.el.style.left = '0px';
        this.el.style.top = '0px';
        
        const rect = this.el.getBoundingClientRect();
        let fx = x;
        let fy = y;
        
        // Evitar que se desborde por la derecha o abajo
        if (x + rect.width > window.innerWidth) {
            fx = window.innerWidth - rect.width - 12;
        }
        if (y + rect.height > window.innerHeight) {
            fy = window.innerHeight - rect.height - 12;
        }
        
        if (fx < 12) fx = 12;
        if (fy < 12) fy = 12;
        
        this.el.style.left = `${fx}px`;
        this.el.style.top = `${fy}px`;
        
        // Animación suave de entrada
        requestAnimationFrame(() => {
            this.el.style.transform = 'scale(1)';
            this.el.style.opacity = '1';
        });
    }

    render(items, title) {
        this.el.innerHTML = '';
        
        // Cabecera (Header) — Slim version
        const header = document.createElement('div');
        header.className = 'context-menu-header';
        
        // Botón de atrás (Back)
        const backBtn = document.createElement('button');
        backBtn.className = 'cm-back-btn';
        backBtn.innerHTML = '<i class="ph ph-arrow-left"></i>';
        backBtn.style.display = this.history.length > 0 ? 'inline-block' : 'none';
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.goBack();
        });
        header.appendChild(backBtn);
        
        // Título del nivel actual
        const titleSpan = document.createElement('span');
        titleSpan.className = 'cm-title';
        titleSpan.textContent = title;
        header.appendChild(titleSpan);
        
        // Botón de cerrar (X)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'cm-close-btn';
        closeBtn.innerHTML = '<i class="ph ph-x"></i>';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
        header.appendChild(closeBtn);
        
        this.el.appendChild(header);
        
        // Listado de opciones
        const list = document.createElement('div');
        list.className = 'context-menu-list';
        
        items.forEach(item => {
            if (item.isSeparator) {
                const sep = document.createElement('div');
                sep.className = 'context-menu-separator';
                list.appendChild(sep);
                return;
            }
            const div = document.createElement('div');
            div.className = 'context-menu-item';
            
            if (item.isInput && item._editing) {
                div.className = 'editing-input-row';
                div.innerHTML = `
                    <input type="text" class="cm-input" placeholder="${item.placeholder || 'Nombre...'}" value="${item._value || ''}" />
                    <button class="cm-confirm-btn" title="Aceptar"><i class="ph ph-check"></i></button>
                    <button class="cm-cancel-btn" title="Cancelar"><i class="ph ph-x"></i></button>
                `;
                
                const input = div.querySelector('.cm-input');
                const confirmBtn = div.querySelector('.cm-confirm-btn');
                const cancelBtn = div.querySelector('.cm-cancel-btn');
                
                // Focus input immediately
                setTimeout(() => input.focus(), 50);
                
                // Event shielding for input box
                const stopEvent = (e) => e.stopPropagation();
                input.addEventListener('pointerdown', stopEvent);
                input.addEventListener('mousedown', stopEvent);
                input.addEventListener('mouseup', stopEvent);
                input.addEventListener('click', stopEvent);
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        const val = input.value.trim();
                        if (val) {
                            item._editing = false;
                            item._value = "";
                            if (item.onConfirm) item.onConfirm(val);
                            this.hide();
                        }
                    } else if (e.key === 'Escape') {
                        item._editing = false;
                        this.render(items, title);
                    }
                });
                
                confirmBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = input.value.trim();
                    if (val) {
                        item._editing = false;
                        item._value = "";
                        if (item.onConfirm) item.onConfirm(val);
                        this.hide();
                    }
                });
                
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    item._editing = false;
                    this.render(items, title);
                });
                
            } else {
                const hasSub = item.children && item.children.length > 0;
                
                div.innerHTML = `
                    <div class="cm-item-left">
                        <i class="ph ph-${item.icon || 'tag'}"></i>
                        <span>${item.label}</span>
                    </div>
                    ${hasSub ? '<i class="ph ph-caret-right cm-item-arrow"></i>' : ''}
                `;
                
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.isInput) {
                        item._editing = true;
                        this.render(items, title);
                    } else if (hasSub) {
                        this.openSubmenu(item.label, item.children);
                    } else if (item.action) {
                        item.action();
                        this.hide();
                    }
                });
            }
            list.appendChild(div);
        });
        
        this.el.appendChild(list);
        createIcons(); // Crear los iconos de Phosphor insertados
    }
    
    openSubmenu(label, children) {
        this.history.push({ title: this.currentTitle, items: this.currentItems });
        this.currentTitle = label;
        this.currentItems = children;
        this.render(children, label);
        
        // Reajustar coordenadas de posicionamiento basándose en el tamaño del submenú
        const rect = this.el.getBoundingClientRect();
        this.positionMenu(rect.left, rect.top);
    }
    
    goBack() {
        if (this.history.length === 0) return;
        const parent = this.history.pop();
        this.currentTitle = parent.title;
        this.currentItems = parent.items;
        this.render(parent.items, parent.title);
        
        const rect = this.el.getBoundingClientRect();
        this.positionMenu(rect.left, rect.top);
    }

    hide() {
        this.el.classList.remove('active');
        this.el.style.opacity = '0';
        this.el.style.transform = 'scale(0.9)';
        document.removeEventListener('pointerdown', this._outsideClick);
    }

    _outsideClick(e) {
        if (!this.el.contains(e.target)) this.hide();
    }
}

export const contextMenu = new ContextMenuController();
