// ============================================================
// CatalogController — Maneja la vista del catálogo, selección de 
// teatro, reconstrucción del 3D y motor de verificación.
// ============================================================
import * as THREE from 'three';
import { THEATRES_CATALOG, DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { rebuildTheatre } from '../theatre/TheatreFactory.js';
import { runVerification } from '../engine/VerifyEngine.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { History } from '../core/History.js';

let activeTheaterId = 'ninguno';

/**
 * Llena el dropdown de selección de teatros
 */
export function populateTeatroSelect() {
    const select = document.getElementById('teatro-select');
    if (!select) return;
    
    // Evitar duplicados
    select.innerHTML = '<option value="ninguno">Ninguno</option>';
    
    THEATRES_CATALOG.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.city})`;
        select.appendChild(opt);
    });

    initContainerUI(true);
}

/**
 * Maneja el cambio de teatro desde el dropdown
 */
export function onTeatroChange(theaterId) {
    activeTheaterId = theaterId;
    ProjectManager.setActiveTheatreId(theaterId);
    
    // Forzar actualización del árbol (cambia de genérico a específico o viceversa)
    if (window._switchCategory) {
        window._switchCategory('arquitectura');
    }

    const banner = document.getElementById('sync-banner');
    const boundIndicator = document.getElementById('bound-indicator');
    const brandTitle = document.getElementById('brand-title');
    
    if (theaterId === 'ninguno') {
        banner.style.display = 'none';
        if (boundIndicator) {
            boundIndicator.innerHTML = `
                <i class="ph ph-bounding-box" style="font-size:14px; margin-right:4px; vertical-align:middle;"></i>
                <span style="font-size:11px;">Sin teatro activo <span class="dim">(solo contenedor)</span></span>`;
        }
        if (brandTitle) {
            brandTitle.innerHTML = 'SkeneCAD';
        }
        rebuildTheatre({ isEmpty: true });
    } else {
        const t = THEATRES_CATALOG.find(x => x.id === theaterId);
        document.getElementById('sync-theater-name').textContent = t.name;
        banner.style.display = 'block';
        if (boundIndicator) {
            boundIndicator.innerHTML = `
                <i class="ph ph-bank" style="color:#5b9bff; font-size:14px; margin-right:4px; vertical-align:middle;"></i>
                <span style="font-size:11px;">Teatro activo: <span class="accent">${t.name}</span> <span class="dim">(contenedor sin cambios)</span></span>`;
        }
        if (brandTitle) {
            brandTitle.innerHTML = `SkeneCAD <span style="color:var(--text-dim); margin-left:4px;">| ${t.name}</span>`;
        }
        
        // FIX #1: Mapear propiedades de stage al formato de buildTheatre
        rebuildTheatre({
            width: t.stage.width,
            depth: t.stage.depth,
            height: t.stage.height,
            wallThickness: t.stage.wallThickness || 0.2,
            barCount: t.stage.barCount || 5,
            barRadius: t.stage.barRadius || 0.05
        });
    }
    History.save();
}

/**
 * Sincroniza las medidas del contenedor escénico con el teatro activo
 */
export function syncContainerFromActive(shouldSync) {
    const banner = document.getElementById('sync-banner');
    
    if (shouldSync && activeTheaterId !== 'ninguno') {
        const t = THEATRES_CATALOG.find(x => x.id === activeTheaterId);
        document.getElementById('c-ancho').value = t.stage.width;
        document.getElementById('c-profundidad').value = t.stage.depth;
        document.getElementById('c-alto').value = t.stage.height;
        document.getElementById('c-parrilla').value = t.stage.grid;
        applyContainer();
        
        const boundIndicator = document.getElementById('bound-indicator');
        if (boundIndicator) {
            boundIndicator.innerHTML = `
                <i class="ph ph-bank" style="color:#5b9bff; font-size:14px; margin-right:4px; vertical-align:middle;"></i>
                <span style="font-size:11px;">Teatro activo: <span class="accent">${t.name}</span> <span class="dim">(contenedor sincronizado)</span></span>`;
        }
    }
    banner.style.display = 'none';
}

export function applyContainer() {
    DEFAULT_CONTAINER.width = parseFloat(document.getElementById('c-ancho').value) || DEFAULT_CONTAINER.width;
    DEFAULT_CONTAINER.depth = parseFloat(document.getElementById('c-profundidad').value) || DEFAULT_CONTAINER.depth;
    DEFAULT_CONTAINER.height = parseFloat(document.getElementById('c-alto').value) || DEFAULT_CONTAINER.height;
    DEFAULT_CONTAINER.grid = parseFloat(document.getElementById('c-parrilla').value) || DEFAULT_CONTAINER.grid;
    
    // Sincronizar en ProjectManager
    ProjectManager.currentProject.theatre.width = DEFAULT_CONTAINER.width;
    ProjectManager.currentProject.theatre.depth = DEFAULT_CONTAINER.depth;
    ProjectManager.currentProject.theatre.height = DEFAULT_CONTAINER.height;
    ProjectManager.currentProject.theatre.grid = DEFAULT_CONTAINER.grid;
    ProjectManager.currentProject.theatre.hasContainer = true;
    
    // Actualizar UI del contenedor (sin colapsar la pestaña)
    initContainerUI(false);

    // Reconstruimos la escena. Si hay un teatro activo, se dibuja este más el contenedor. Si no, solo el contenedor.
    if (activeTheaterId === 'ninguno') {
        rebuildTheatre(DEFAULT_CONTAINER);
    } else {
        const t = THEATRES_CATALOG.find(x => x.id === activeTheaterId);
        if (t) {
            rebuildTheatre({
                width: t.stage.width,
                depth: t.stage.depth,
                height: t.stage.height,
                wallThickness: t.stage.wallThickness || 0.2,
                barCount: t.stage.barCount || 5,
                barRadius: t.stage.barRadius || 0.05
            });
        }
    }

    // Actualizar el árbol de nodos
    if (window._switchCategory) {
        window._switchCategory(State.get('activeCategory') || 'arquitectura');
    }
    History.save();
}

/**
 * Renderiza la lista de tarjetas en la vista de Catálogo
 */
export function renderCatalog() {
    const wrap = document.getElementById('catalog-container');
    if (!wrap) return;
    wrap.innerHTML = '';
    
    THEATRES_CATALOG.forEach(theater => {
        const card = document.createElement('div');
        card.className = 'theater-card';
        card.innerHTML = `
            <div class="tc-top">
                <div>
                    <div class="tc-name">${theater.name}</div>
                    <div class="tc-city">${theater.city}</div>
                </div>
                <i class="ph ph-bank" style="color:#777; font-size: 20px;"></i>
            </div>
            <div class="tc-dims">
                <span>Boca: ${theater.stage.width}m</span><span>Prof: ${theater.stage.depth}m</span>
                <span>Alto: ${theater.stage.height}m</span><span>Parrilla: ${theater.stage.grid}m</span>
            </div>
            <div class="tc-actions">
                <button class="btn-verify" data-theater-id="${theater.id}">Verificar diseño</button>
            </div>`;
        wrap.appendChild(card);
    });
    
    // Agregar event listeners a botones Verify
    wrap.querySelectorAll('.btn-verify').forEach(btn => {
        btn.addEventListener('click', () => {
            verifyAgainst(btn.dataset.theaterId);
        });
    });
}

/**
 * Inicia el proceso de verificación contra un teatro
 */
function verifyAgainst(theaterId) {
    const theater = THEATRES_CATALOG.find(t => t.id === theaterId);
    if (!theater) return;
    
    const results = runVerification({
        ancho: theater.stage.width,
        profundidad: theater.stage.depth,
        alto: theater.stage.height,
        parrilla: theater.stage.grid
    });
    const okCount = results.filter(r => r.ok).length;

    document.getElementById('verify-theater-name').textContent = `${theater.name} · ${theater.city}`;
    
    const statusClass = okCount === results.length ? 'status-ok' : 'status-fail';
    
    document.getElementById('verify-summary').innerHTML = `
        <span class="${statusClass}" style="font-weight:600">${okCount} de ${results.length} elementos caben</span>
        <span style="color:var(--text-muted)"> · el contenedor no se modifica</span>`;

    const list = document.getElementById('verify-list');
    list.innerHTML = '';
    
    results.forEach(r => {
        const row = document.createElement('div');
        row.className = 'vitem';
        
        const iconHtml = r.ok 
            ? '<i class="ph ph-check-circle status-ok" style="font-size:16px;"></i>'
            : '<i class="ph ph-warning-circle status-fail" style="font-size:16px;"></i>';
            
        let htmlStr = `
            <div class="row">
                ${iconHtml}
                <span class="name">${r.name}</span>
            </div>
        `;
        if (!r.ok) {
            htmlStr += `<div class="detail">${r.issues.join(' · ')}</div>`;
        }
        row.innerHTML = htmlStr;
        list.appendChild(row);
    });

    // Abrir Drawer y superponer UI en canvas
    document.getElementById('verify-drawer').classList.add('open');
    
    const canvasIcon = document.getElementById('canvas-icon');
    canvasIcon.className = `ph ${okCount === results.length ? 'ph-check-circle status-ok' : 'ph-warning-circle status-fail'}`;
    canvasIcon.style.fontSize = '56px';
    canvasIcon.style.marginBottom = '10px';
    
    document.getElementById('canvas-overlay-center').style.display = 'block';
    document.getElementById('canvas-text').textContent = 'MODO VERIFICACIÓN';
    document.getElementById('canvas-subtext').textContent = `Contenedor superpuesto sobre ${theater.name}`;
    
    const modeIndicator = document.getElementById('mode-indicator');
    modeIndicator.style.display = 'flex';
    modeIndicator.innerHTML = `<i class="ph ph-magnifying-glass"></i> Verificando: ${theater.name}`;

    // Si estamos en Arquitectura, pasar a Escena temporalmente para que se vea el diseño
    if (State.get('activeCategory') === 'arquitectura' && window._switchCategory) {
        window._switchCategory('escena');
    }
}

/**
 * Cierra la vista de verificación
 */
export function closeVerify() {
    document.getElementById('verify-drawer').classList.remove('open');
    document.getElementById('canvas-overlay-center').style.display = 'none';
    document.getElementById('mode-indicator').style.display = 'none';
}

/**
 * Muestra u oculta los campos del contenedor escénico
 */
export function toggleContenedor() {
    const body = document.getElementById('contenedor-body');
    const chev = document.getElementById('contenedor-chevron');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        chev.classList.remove('collapsed');
    } else {
        body.style.display = 'none';
        chev.classList.add('collapsed');
    }
}

/**
 * Alterna el panel de catálogo
 */
export function toggleCatalog() {
    const catalogoEl = document.getElementById('catalogo-panel');
    if (!catalogoEl) return;
    
    const willOpen = !catalogoEl.classList.contains('open');
    catalogoEl.classList.toggle('open');
    
    const railBtn = document.getElementById('nav-catalogo');
    if (railBtn) railBtn.classList.toggle('active', willOpen);
    
    if (willOpen) EventBus.emit('ui:closeOthers', 'catalogo');
}

/**
 * Abre el panel de catálogo explícitamente
 */
export function openCatalog() {
    const catalogoEl = document.getElementById('catalogo-panel');
    if (!catalogoEl) return;
    
    if (!catalogoEl.classList.contains('open')) {
        catalogoEl.classList.add('open');
        const railBtn = document.getElementById('nav-catalogo');
        if (railBtn) railBtn.classList.add('active');
        EventBus.emit('ui:closeOthers', 'catalogo');
    }
}

/**
 * Inicializa el panel colapsable del contenedor escénico según si existe o no
 */
export function initContainerUI(collapse = false) {
    const hasContainer = ProjectManager.currentProject.theatre.hasContainer;
    const body = document.getElementById('contenedor-body');
    const chev = document.getElementById('contenedor-chevron');
    const btn = document.getElementById('btn-apply-container');
    
    if (body && chev && btn) {
        if (hasContainer) {
            if (collapse) {
                body.style.display = 'none';
                chev.classList.add('collapsed');
            }
            btn.textContent = 'Actualizar contenedor';
        } else {
            body.style.display = 'block';
            chev.classList.remove('collapsed');
            btn.textContent = 'Crear contenedor';
        }
    }
}

// Global functions for inline HTML onclick handlers
window._onTeatroChange = onTeatroChange;
window._syncContainerFromActive = syncContainerFromActive;
window._applyContainer = applyContainer;
window._closeVerify = closeVerify;
window._toggleContenedor = toggleContenedor;
window._toggleCatalog = toggleCatalog;
window._openCatalog = openCatalog;
window._initContainerUI = initContainerUI;

// Listen to closeOthers
EventBus.on('ui:closeOthers', (source) => {
    if (source !== 'catalogo') {
        const catalogoEl = document.getElementById('catalogo-panel');
        if (catalogoEl) catalogoEl.classList.remove('open');
        const railBtn = document.getElementById('nav-catalogo');
        if (railBtn) railBtn.classList.remove('active');
    }
});
