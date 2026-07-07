// ============================================================
// TreeBuilder — Genera nodos del tree dinámicamente
// Diseño idéntico al mockup CAD: chevrons, 4-slot grid, Phosphor Icons
// ============================================================

import * as THREE from 'three';
import { createStruct } from '../theatre/StructureBuilder.js';
import { History } from '../core/History.js';
import { State } from '../core/State.js';
import { Registry } from '../core/Registry.js';
import { contextMenu } from './ContextMenuAPI.js';
import { createIcons } from '../utils/dom.js';
import { PersonasEngine } from '../engine/PersonasEngine.js';
import { scene } from '../engine/SceneManager.js';
import { THEATRES_CATALOG, DEFAULT_CONTAINER } from '../data/catalogs/theatres.catalog.js';
import { ProjectManager } from '../core/ProjectManager.js';
import { EventBus } from '../core/EventBus.js';
import { applyGroupProperty } from './PropertiesPanel.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';

// =====================================================================
// RENDER TREE — Recursivo, idéntico al mockup
// =====================================================================

/**
 * Render a tree from a nodes array into a container DOM element.
 * @param {Array} nodes — array of node objects from userProject
 * @param {HTMLElement} container — parent DOM element
 * @param {number} level — nesting level (0 = root)
 */
export function renderTree(nodes, container, level = 0) {
    const ul = document.createElement('div');
    const startOpen = level <= 1; // Only root (0) and first children (1) start open
    ul.classList.add('tree-children');
    if (startOpen) ul.classList.add('open');
    if (level > 0) {
        const allLeaves = nodes.every(n => !n.children);
        if (allLeaves) ul.classList.add('leaf-group');
    }

    nodes.forEach(node => {
        const itemDiv = document.createElement('div');

        // === ROW ===
        const row = document.createElement('div');
        row.className = 'tree-node';
        if (node.id) row.dataset.id = node.id;
        if (node.type) row.dataset.type = node.type === 'folder' ? 'grupo' : 'elemento';

        // --- LEFT PART (chevron + icon + name) ---
        const leftPart = document.createElement('div');
        leftPart.style.cssText = 'display:flex; align-items:center; flex:1; min-width:0; padding-right:2px;';

        if (node.children && node.children.length > 0) {
            // Chevron — open if this node's children container will start open
            const childrenOpen = level + 1 <= 1;
            const chevron = document.createElement('i');
            chevron.className = `ph ph-caret-right chevron${childrenOpen ? ' open' : ''}`;
            leftPart.appendChild(chevron);

            // Toggle open/close
            row.addEventListener('click', (e) => {
                // Don't toggle if clicking controls
                if (e.target.closest('.tree-node-controls')) return;
                e.stopPropagation();
                chevron.classList.toggle('open');
                const childrenDiv = itemDiv.querySelector(':scope > .tree-children');
                if (childrenDiv) childrenDiv.classList.toggle('open');
            });
        } else {
            const spacer = document.createElement('div');
            spacer.className = 'chevron-spacer';
            leftPart.appendChild(spacer);
        }

        // Type icon
        const typeIcon = document.createElement('i');
        const iconClass = node.icon || (node.type === 'folder' ? 'ph-folder' : 'ph-cube');
        typeIcon.className = `ph ${iconClass} node-icon`;
        leftPart.appendChild(typeIcon);

        // Name
        const textSpan = document.createElement('span');
        textSpan.className = 'node-name';
        textSpan.textContent = node.name;
        leftPart.appendChild(textSpan);

        row.appendChild(leftPart);

        // --- RIGHT PART (4 control slots) ---
        const rightPart = document.createElement('div');
        rightPart.className = 'tree-node-controls';
        const isArquitectura = State.get('activeCategory') === 'arquitectura';
        const isEscena = State.get('activeCategory') === 'escena';
        const isNinguno = isArquitectura && node.name === "Ninguno";
        const isRealTheatreRoot = isArquitectura && level === 0 && !isNinguno;
        const isEscenaRoot = isEscena && node.name === "ESPACIO ESCÉNICO";
        
        const hasContainer = ProjectManager.currentProject.theatre.hasContainer;
        const isNoTheaterActive = ProjectManager.getActiveTheatreId() === 'ninguno' && !hasContainer;
        const shouldBlockSceneChild = isEscena && !isEscenaRoot && isNoTheaterActive;

        // Apply disabled state styling to the row if it's a blocked child
        if (shouldBlockSceneChild) {
            row.style.cssText = 'opacity: 0.3; pointer-events: none;';
        }

        // Always visible if this node has a color dot or is root/ninguno
        if (node.color || isNinguno || isRealTheatreRoot || isEscenaRoot || node.id === 'personas') rightPart.classList.add('always-visible');

        // Helper: create fixed-width slot
        const createSlot = () => {
            const slot = document.createElement('div');
            slot.className = 'ctrl-slot';
            return slot;
        };

        // SLOT 1: Add (+) / Edit (pencil)
        const addSlot = createSlot();
        if (isNinguno) {
            const addBtn = document.createElement('i');
            addBtn.className = 'ph ph-plus ctrl-btn';
            addBtn.title = `Seleccionar teatro`;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window._openCatalog) window._openCatalog();
            });
            addSlot.appendChild(addBtn);
        } else if (isRealTheatreRoot) {
            const editBtn = document.createElement('i');
            editBtn.className = 'ph ph-pencil ctrl-btn';
            editBtn.title = `Editar / Cambiar teatro`;
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window._openCatalog) window._openCatalog();
            });
            addSlot.appendChild(editBtn);
        } else if (isEscenaRoot) {
            // ESPACIO ESCÉNICO root does not have a plus button!
        } else if (node.type === 'folder') {
            const addBtn = document.createElement('i');
            addBtn.className = 'ph ph-plus ctrl-btn ctrl-add';
            addBtn.title = `Añadir a ${node.name}`;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const category = State.get('activeCategory');
                if (category === 'escena') {
                    contextMenu.show(e.clientX, e.clientY, [
                        {
                            label: "Nuevo Grupo",
                            icon: "folder-plus",
                            isInput: true,
                            placeholder: "Nombre del grupo...",
                            onConfirm: (val) => addTreeElement(val, "folder", "grupo", node.id)
                        },
                        { isSeparator: true },
                        {
                            label: "Volúmenes Simples",
                            icon: "cube",
                            children: [
                                { label: "Cubo", icon: "cube", action: () => addTreeElement("Cubo", "cube", "box", node.id) },
                                { label: "Esfera", icon: "circle", action: () => addTreeElement("Esfera", "circle", "sphere", node.id) },
                                { label: "Cilindro", icon: "cylinder", action: () => addTreeElement("Cilindro", "cylinder", "cylinder", node.id) },
                                { label: "Cono", icon: "triangle", action: () => addTreeElement("Cono", "triangle", "cone", node.id) }
                            ]
                        }
                    ]);
                } else if (category === 'personas') {
                    contextMenu.show(e.clientX, e.clientY, [
                        {
                            label: "Nuevo Grupo",
                            icon: "folder-plus",
                            isInput: true,
                            placeholder: "Nombre del grupo...",
                            onConfirm: (val) => addTreeElement(val, "folder", "grupo", node.id)
                        },
                        { isSeparator: true },
                        { label: "Mujer Adulta", icon: "user", action: () => addPersonaElement("female", node.id) },
                        { label: "Hombre Adulto", icon: "user", action: () => addPersonaElement("male", node.id) }
                    ]);
                } else {
                    console.log(`[systemCatalog] Abrir catálogo para añadir a: ${node.name}`);
                }
            });
            addSlot.appendChild(addBtn);
        }
        rightPart.appendChild(addSlot);

        // SLOT 2: Visibility (Eye)
        const eyeSlot = createSlot();
        const eyeBtn = document.createElement('i');
        eyeBtn.className = 'ph ph-eye ctrl-btn visibility-btn';
        if (isNinguno || isEscenaRoot) {
            eyeBtn.style.cssText = 'opacity:0.3; pointer-events:none;';
        } else if (node.id) {
            eyeBtn.dataset.target = node.id;
            eyeBtn.dataset.isGroup = node.type === 'folder' ? 'true' : 'false';
        }
        eyeSlot.appendChild(eyeBtn);
        rightPart.appendChild(eyeSlot);

        // SLOT 3: Lock (Padlock)
        const lockSlot = createSlot();
        const lockBtn = document.createElement('i');
        
        if (isNinguno || isEscenaRoot) {
            lockBtn.className = 'ph ph-lock-key ctrl-btn';
            lockBtn.style.cssText = 'opacity:0.3; pointer-events:none;';
        } else {
            const isLocked = isArquitectura || node.locked;
            lockBtn.className = isLocked 
                ? 'ph ph-lock-key ctrl-btn lock-btn is-locked' 
                : 'ph ph-lock-key-open ctrl-btn lock-btn';
                
            if (node.id) {
                lockBtn.dataset.target = node.id;
                lockBtn.dataset.isGroup = node.type === 'folder' ? 'true' : 'false';
            }
        }
        lockSlot.appendChild(lockBtn);
        rightPart.appendChild(lockSlot);

        // SLOT 4: Color dot
        const colorSlot = createSlot();
        if (node.color) {
            const colorDot = document.createElement('div');
            colorDot.className = 'color-dot';
            colorDot.style.backgroundColor = node.color;
            colorDot.style.cursor = 'pointer';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.style.display = 'none';

            let hex = node.color;
            if (hex.startsWith('rgb')) {
                const parts = hex.match(/\d+/g);
                if (parts && parts.length >= 3) {
                    const r = parseInt(parts[0]).toString(16).padStart(2, '0');
                    const g = parseInt(parts[1]).toString(16).padStart(2, '0');
                    const b = parseInt(parts[2]).toString(16).padStart(2, '0');
                    hex = `#${r}${g}${b}`;
                }
            } else if (hex === 'gray') {
                hex = '#808080';
            }
            colorInput.value = hex;

            colorInput.addEventListener('input', (e) => {
                const val = e.target.value;
                colorDot.style.backgroundColor = val;
                if (node.type === 'grupo') {
                    applyGroupProperty(node.id, 'color', val);
                } else {
                    const mesh = Registry.findStructureById(node.id);
                    const wire = Registry.findWireById(node.id);
                    if (wire) {
                        wire.userData.baseColor.set(val);
                        syncSelectionEdges(mesh);
                    }
                }
                History.save();
            });

            colorDot.addEventListener('click', (e) => {
                e.stopPropagation();
                colorInput.click();
            });

            colorSlot.appendChild(colorDot);
            colorSlot.appendChild(colorInput);
        }
        rightPart.appendChild(colorSlot);

        row.appendChild(rightPart);

        // Double click shortcut to open catalog for Ninguno or Real Theatre Root
        if (isNinguno || isRealTheatreRoot) {
            row.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (window._openCatalog) window._openCatalog();
            });
        }

        itemDiv.appendChild(row);

        // === RECURSE if children ===
        if (node.children) {
            renderTree(node.children, itemDiv, level + 1);
        }

        ul.appendChild(itemDiv);
    });

    container.appendChild(ul);
}


// =====================================================================
// SWITCH CATEGORY — Cambia la pestaña activa y renderiza el árbol
// =====================================================================

function getArquitecturaTree() {
    const activeTheaterId = ProjectManager.getActiveTheatreId();

    if (activeTheaterId === 'ninguno') {
        return [{
            name: "Ninguno",
            type: "item",
            icon: "ph-bank",
            color: "gray"
        }];
    }
    
    const t = THEATRES_CATALOG.find(x => x.id === activeTheaterId);
    if (!t) return [];
    
    return [{
        name: `${t.name} - ${t.city}`,
        type: "folder",
        icon: "ph-bank",
        children: [
            { name: `Caja Escénica`, type: "folder", icon: "ph-package", children: [
                { name: `Boca de escenario (${t.stage.width}m x ${t.stage.height}m)`, type: "item", color: "#22d3ee" },
                { name: `Fondo (prof. ${t.stage.depth}m)`, type: "item", color: "#22d3ee" },
                { name: "Izquierda", type: "item", color: "#22d3ee" },
                { name: "Derecha", type: "item", color: "#22d3ee" },
                { name: "Piso", type: "item", color: "#4ade80" },
                { name: `Parrilla (${t.stage.grid}m)`, type: "item", color: "#facc15" }
            ]},
            { name: "Platea", type: "folder", icon: "ph-stairs", children: [
                { name: "Gradería Inferior", type: "item", color: "#888" },
                { name: "Pasillos", type: "item", color: "#888" }
            ]},
            { name: "Escenotecnia", type: "folder", icon: "ph-wrench", children: [
                { name: "Tramoya / Barras", type: "folder", icon: "ph-minus", children: [
                    { name: "Barra 1", type: "item", color: "magenta" },
                    { name: "Barra 2", type: "item", color: "magenta" },
                    { name: "Barra 3", type: "item", color: "magenta" },
                    { name: "Barra 4", type: "item", color: "magenta" },
                    { name: "Barra 5", type: "item", color: "magenta" }
                ]},
                { name: "Vestiduras", type: "folder", icon: "ph-flag-banner", children: [
                    { name: "Telón de Boca", type: "item", color: "red" },
                    { name: "Cámara Negra", type: "item", color: "black" }
                ]}
            ]}
        ]
    }];
}

function generateTreeFromInstances(categoryId) {
    const structures = Registry.getStructures();

    if (categoryId === 'escena') {
        const root = {
            name: "ESPACIO ESCÉNICO",
            type: "folder",
            icon: "ph-cube",
            children: [
                { name: "Escenografía", type: "folder", icon: "ph-cube", id: "escenografia", children: [] },
                { name: "Utilería", type: "folder", icon: "ph-armchair", id: "utileria", children: [] },
                { name: "Volúmenes Técnicos", type: "folder", icon: "ph-speaker-hifi", id: "tecnicos", children: [] }
            ]
        };

        const folders = structures.filter(m => {
            if (!m.userData.isFolder) return false;
            let gId = m.userData.group;
            while (gId && gId !== 'personas' && gId !== 'escenografia' && gId !== 'utileria' && gId !== 'tecnicos') {
                const parentFolder = structures.find(x => x.userData.id === gId);
                gId = parentFolder ? parentFolder.userData.group : null;
            }
            return gId !== 'personas';
        });

        const elements = structures.filter(m => !m.userData.isFolder && !m.userData.isPersona && 
                                                m.userData.id !== 'piso' && 
                                                m.userData.id !== 'contenedor-escenico' &&
                                                m.userData.group !== 'paredes' && 
                                                m.userData.group !== 'barras');

        const nodeMap = {};
        nodeMap["escenografia"] = root.children[0];
        nodeMap["utileria"] = root.children[1];
        nodeMap["tecnicos"] = root.children[2];

        // Add custom folders to nodeMap
        folders.forEach(f => {
            nodeMap[f.userData.id] = {
                id: f.userData.id,
                name: f.userData.name,
                type: "folder",
                icon: "ph-folder",
                color: f.userData.locked ? "gray" : (f.userData.color || "#5b9bff"),
                locked: f.userData.locked,
                children: []
            };
        });

        // Link custom folders to parents
        folders.forEach(f => {
            const node = nodeMap[f.userData.id];
            const parentNode = nodeMap[f.userData.group];
            if (parentNode) {
                parentNode.children.push(node);
            } else {
                nodeMap["escenografia"].children.push(node);
            }
        });

        // Link elements to parents
        elements.forEach(el => {
            const wire = Registry.findWireById(el.userData.id);
            const colorHex = wire ? `#${wire.userData.baseColor.getHexString()}` : '#007acc';
            const node = {
                id: el.userData.id,
                name: el.userData.name || (el.userData.geoType ? el.userData.geoType.toUpperCase() : "Elemento"),
                type: "item",
                color: el.userData.locked ? "gray" : colorHex,
                locked: el.userData.locked
            };
            const parentNode = nodeMap[el.userData.group];
            if (parentNode) {
                parentNode.children.push(node);
            } else {
                nodeMap["escenografia"].children.push(node);
            }
        });

        return [root];
    }
    
    if (categoryId === 'iluminacion') {
         return [
            { name: "Luminarias", type: "folder", icon: "ph-headlights", id: "luminarias", children: [] },
            { name: "Video y Mapping", type: "folder", icon: "ph-projector-screen", id: "video", children: [] },
            { name: "Atmósfera", type: "folder", icon: "ph-cloud", id: "atmosfera", children: [] }
        ];
    }
    
    if (categoryId === 'personas') {
        const root = { name: "Personas", type: "folder", icon: "ph-users", id: "personas", children: [] };
        
        const folders = structures.filter(m => {
            if (!m.userData.isFolder) return false;
            let gId = m.userData.group;
            while (gId && gId !== 'personas' && gId !== 'escenografia' && gId !== 'utileria' && gId !== 'tecnicos') {
                const parentFolder = structures.find(x => x.userData.id === gId);
                gId = parentFolder ? parentFolder.userData.group : null;
            }
            return gId === 'personas';
        });

        const personas = structures.filter(m => m.userData.isPersona);
        
        const nodeMap = {};
        nodeMap["personas"] = root;

        // Add custom folders to nodeMap
        folders.forEach(f => {
            nodeMap[f.userData.id] = {
                id: f.userData.id,
                name: f.userData.name,
                type: "folder",
                icon: "ph-folder",
                color: f.userData.locked ? "gray" : (f.userData.color || "#ffaa00"),
                locked: f.userData.locked,
                children: []
            };
        });

        // Link custom folders to parents
        folders.forEach(f => {
            const node = nodeMap[f.userData.id];
            const parentNode = nodeMap[f.userData.group];
            if (parentNode) {
                parentNode.children.push(node);
            } else {
                nodeMap["personas"].children.push(node);
            }
        });

        // Link personas to parents
        personas.forEach(p => {
            const wire = Registry.findWireById(p.userData.id);
            const colorHex = wire ? `#${wire.userData.baseColor.getHexString()}` : '#ffaa00';
            const node = {
                id: p.userData.id,
                name: p.userData.name,
                type: "item",
                color: p.userData.locked ? "gray" : colorHex,
                locked: p.userData.locked
            };
            const parentNode = nodeMap[p.userData.group];
            if (parentNode) {
                parentNode.children.push(node);
            } else {
                nodeMap["personas"].children.push(node);
            }
        });
        
        return [root];
    }
    
    return [];
}

/**
 * Switch the active category tab and re-render the tree.
 * @param {string} categoryId — 'arquitectura' | 'escena' | 'iluminacion' | 'personas'
 */
export function switchCategory(categoryId) {
    // 1. Update tab visual state
    document.querySelectorAll('.sidebar-tab-grid .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeTab = document.getElementById('tab-' + categoryId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // 1.b Toggle panels
    const contPanel = document.getElementById('contenedor-panel');
    if (contPanel) contPanel.classList.toggle('visible', categoryId === 'escena');

    // 2. Store active category in State
    State.set('activeCategory', categoryId);

    // 3. Clear and render tree
    const container = document.getElementById('tree-container');
    if (!container) return;
    container.innerHTML = '';

    const treeData = categoryId === 'arquitectura' 
        ? getArquitecturaTree() 
        : generateTreeFromInstances(categoryId);
        
    renderTree(treeData, container);
}

// Make switchCategory available globally for onclick handlers in HTML
window._switchCategory = switchCategory;

// =====================================================================
// INIT — Initialize tree system
// =====================================================================

export function initTreeBuilder() {
    // Initial render — tree starts fully expanded
    switchCategory('arquitectura');

    // Initialize add buttons for Escenografía and Personas (context menu)
    initAddButtons();
    initDragAndDrop();
}

function initAddButtons() {
    // Escuchar clics globales en los botones de "Añadir" del árbol
    const treeContainer = document.getElementById('tree-container');
    if (!treeContainer) return;
    
    treeContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('ctrl-add')) {
            e.stopPropagation();
            const nodeRow = e.target.closest('.tree-node');
            if (!nodeRow) return;
            
            const category = State.get('activeCategory');
            
            if (category === 'personas') {
                // Alternar tipo de persona
                const type = Math.random() > 0.5 ? 'male' : 'female';
                addPersonaElement(type);
            } else if (category === 'escena') {
                // Agregar un cubo por defecto para probar
                addTreeElement('Nuevo Volumen', 'cube', 'box');
            } else {
                console.log(`[systemCatalog] Añadir en categoría: ${category}`);
            }
        }
    });
}

// =====================================================================
// DRAG AND DROP — Preserved from original
// =====================================================================

function initDragAndDrop() {
    let draggedNode = null;

    // Apply draggable to tree nodes with IDs
    const applyDraggable = () => {
        document.querySelectorAll('.tree-node[data-id]').forEach(node => {
            node.setAttribute('draggable', 'true');
        });
    };

    // MutationObserver to make new nodes draggable automatically
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const treeNodes = node.querySelectorAll ? node.querySelectorAll('.tree-node[data-id]') : [];
                    treeNodes.forEach(tn => tn.setAttribute('draggable', 'true'));
                    if (node.classList && node.classList.contains('tree-node') && node.dataset.id) {
                        node.setAttribute('draggable', 'true');
                    }
                }
            });
        });
    });
    const treeContainer = document.getElementById('tree-container');
    if (treeContainer) {
        observer.observe(treeContainer, { childList: true, subtree: true });
    }

    applyDraggable();

    document.addEventListener('dragstart', e => {
        const node = e.target.closest('.tree-node[data-id]');
        if (node) {
            draggedNode = node.parentElement; // The wrapper div containing the row + children
            e.dataTransfer.effectAllowed = 'move';
            node.classList.add('dragging');
        }
    });

    document.addEventListener('dragend', e => {
        if (draggedNode) {
            const row = draggedNode.querySelector('.tree-node');
            if (row) row.classList.remove('dragging');
            draggedNode = null;
        }
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    document.addEventListener('dragover', e => {
        if (!draggedNode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const targetNode = e.target.closest('.tree-node[data-type="grupo"]');
        if (targetNode && targetNode !== draggedNode.querySelector('.tree-node') && !draggedNode.contains(targetNode)) {
            targetNode.classList.add('drag-over');
        }
    });

    document.addEventListener('dragleave', e => {
        const targetNode = e.target.closest('.tree-node[data-type="grupo"]');
        if (targetNode && !targetNode.contains(e.relatedTarget)) {
            targetNode.classList.remove('drag-over');
        }
    });

    document.addEventListener('drop', e => {
        if (!draggedNode) return;
        e.preventDefault();

        const targetNode = e.target.closest('.tree-node[data-type="grupo"]');
        if (targetNode && targetNode !== draggedNode.querySelector('.tree-node') && !draggedNode.contains(targetNode)) {
            targetNode.classList.remove('drag-over');

            // Find or create children container
            const targetWrapper = targetNode.parentElement;
            let targetChildren = targetWrapper.querySelector(':scope > .tree-children');
            if (!targetChildren) {
                targetChildren = document.createElement('div');
                targetChildren.className = 'tree-children open';
                targetWrapper.appendChild(targetChildren);
            }
            targetChildren.appendChild(draggedNode);

            // Update 3D data
            const newGroupId = targetNode.dataset.id;
            const draggedRow = draggedNode.querySelector('.tree-node');
            if (draggedRow && draggedRow.dataset.id && newGroupId) {
                const mesh = Registry.findStructureById(draggedRow.dataset.id);
                if (mesh) mesh.userData.group = newGroupId;
            }

            History.save();
        }
    });
}

// =====================================================================
// ADD ELEMENT — Creates new tree nodes + 3D objects (Escenografía tab)
// =====================================================================

import { PlacementEngine } from '../engine/PlacementEngine.js';

export function addTreeElement(name, icon, type, targetParentId) {
    const id = `item-${Date.now()}`;
    const isGroup = type === 'grupo';
    const parentGroupId = targetParentId || 'escenografia';

    if (isGroup) {
        // Create a dummy Object3D representing the folder
        const folder = new THREE.Object3D();
        folder.userData = {
            id,
            name,
            group: parentGroupId,
            isFolder: true,
            layerVisible: true,
            locked: false
        };
        Registry.addStructure(folder);
    } else {
        let geo, params;
        switch (type) {
            case 'box': geo = new THREE.BoxGeometry(1, 1, 1); params = { w: 1, h: 1, d: 1 }; break;
            case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); params = { r: 0.5, h: 1 }; break;
            case 'sphere': geo = new THREE.SphereGeometry(0.5, 16, 16); params = { r: 0.5 }; break;
            case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 16); params = { r: 0.5, h: 1 }; break;
        }
        const mat = new THREE.MeshStandardMaterial({ color: 0x6a7b8e, transparent: true });
        
        // createStruct creates the mesh, adds to scene & Registry
        createStruct(geo, mat, '#007acc', id, parentGroupId, 0, 0.5, 0, 0, type, params);
    }

    History.save();
    
    // Refresh the tree view dynamically
    switchCategory(State.get('activeCategory') || 'escena');
    
    // Programmatically select and expand the newly created node
    selectNodeProgrammatically(id, false);
}

/**
 * Programmatically expands parent groups and selects a specific tree node by ID
 */
export function selectNodeProgrammatically(id, showProps = false) {
    const row = document.querySelector(`#tree-container .tree-node[data-id="${id}"]`);
    if (!row) return;
    
    // 1. Expand all parent containers up to the tree root
    let parent = row.parentElement;
    while (parent && parent.id !== 'tree-container') {
        if (parent.classList.contains('tree-children')) {
            parent.classList.add('open');
            const parentWrapper = parent.parentElement;
            if (parentWrapper) {
                const parentRow = parentWrapper.querySelector(':scope > .tree-node');
                if (parentRow) {
                    const chevron = parentRow.querySelector('.chevron');
                    if (chevron) chevron.classList.add('open');
                }
            }
        }
        parent = parent.parentElement;
    }
    
    // 2. Deselect currently selected nodes
    document.querySelectorAll('.tree-node.selected').forEach(n => n.classList.remove('selected'));
    
    // 3. Select the new node row
    row.classList.add('selected');
    
    // 4. Select in Three.js Registry & notify PropertiesPanel
    let mesh = null;
    if (row.dataset.type === 'elemento') {
        mesh = Registry.findStructureById(id);
    }
    
    EventBus.emit('selection:select', { mesh, li: row, showProps });
}

// =====================================================================
// ADD PERSONA — Creates persona tree node + 3D model
// =====================================================================

export async function addPersonaElement(type, targetParentId) {
    if (PersonasEngine.isSpawningAny()) return;

    if (!PlacementEngine.canSpawnPersona()) {
        alert('Límite máximo alcanzado: No puedes agregar más de ' + PlacementEngine.MAX_PERSONAS + ' personas para no sobrecargar el navegador.');
        return;
    }

    let parentNode = null;
    if (targetParentId) {
        parentNode = document.querySelector(`#tree-container .tree-node[data-id="${targetParentId}"]`);
    } else {
        parentNode = document.querySelector('#tree-container .tree-node.selected[data-type="grupo"]');
    }
    let parentWrapper = parentNode ? parentNode.parentElement : null;

    const id = `item-${Date.now()}`;
    const name = type === 'male' ? 'Adult Male' : 'Adult Female';
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const parentGroupId = parentNode ? (parentNode.dataset.id || 'personas') : 'personas';

    // Create tree node
    const wrapperDiv = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'tree-node';
    row.dataset.id = id;
    row.dataset.type = 'elemento';
    row.setAttribute('draggable', 'true');

    const leftPart = document.createElement('div');
    leftPart.style.cssText = 'display:flex; align-items:center; flex:1; min-width:0; padding-right:2px;';

    const spacer = document.createElement('div');
    spacer.className = 'chevron-spacer';
    leftPart.appendChild(spacer);

    const typeIcon = document.createElement('i');
    typeIcon.className = 'ph ph-user-focus node-icon';
    leftPart.appendChild(typeIcon);

    const textSpan = document.createElement('span');
    textSpan.className = 'node-name';
    textSpan.textContent = name;
    leftPart.appendChild(textSpan);

    row.appendChild(leftPart);

    // Right controls
    const rightPart = document.createElement('div');
    rightPart.className = 'tree-node-controls always-visible';

    const createSlot = () => { const s = document.createElement('div'); s.className = 'ctrl-slot'; return s; };

    rightPart.appendChild(createSlot()); // empty add slot

    const eyeSlot = createSlot();
    const eyeBtn = document.createElement('i');
    eyeBtn.className = 'ph ph-eye ctrl-btn visibility-btn';
    eyeBtn.dataset.target = id;
    eyeBtn.dataset.parent = parentGroupId;
    eyeSlot.appendChild(eyeBtn);
    rightPart.appendChild(eyeSlot);

    const lockSlot = createSlot();
    const lockBtn = document.createElement('i');
    lockBtn.className = 'ph ph-lock-key-open ctrl-btn lock-btn';
    lockBtn.dataset.target = id;
    lockBtn.dataset.parent = parentGroupId;
    lockSlot.appendChild(lockBtn);
    rightPart.appendChild(lockSlot);

    const colorSlot = createSlot();
    const colorDot = document.createElement('div');
    colorDot.className = 'color-dot';
    colorDot.style.backgroundColor = randomColor;
    colorSlot.appendChild(colorDot);
    rightPart.appendChild(colorSlot);

    row.appendChild(rightPart);
    wrapperDiv.appendChild(row);

    // Insert into tree
    let targetContainer;
    if (parentWrapper) {
        let childrenDiv = parentWrapper.querySelector(':scope > .tree-children');
        if (!childrenDiv) {
            childrenDiv = document.createElement('div');
            childrenDiv.className = 'tree-children open';
            parentWrapper.appendChild(childrenDiv);
        }
        targetContainer = childrenDiv;
    } else {
        const rootChildren = document.querySelector('#tree-container > .tree-children');
        targetContainer = rootChildren || document.getElementById('tree-container');
    }
    targetContainer.appendChild(wrapperDiv);

    // Load Persona 3D model
    try {
        const mesh = await PersonasEngine.createPersona(type, name);
        mesh.userData.id = id;
        mesh.userData.group = parentGroupId;

        const spawnPos = PlacementEngine.getValidSpawnPosition(0.4);
        const spawnHeight = (ProjectManager.currentProject.theatre.height || DEFAULT_CONTAINER.height) + 6.0;
        
        mesh.position.set(spawnPos.x, spawnHeight, spawnPos.z);
        mesh.updateMatrixWorld(true);

        const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 1.7, 0.5));
        const wireMat = new THREE.LineBasicMaterial({ color: randomColor });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        wire.userData = { id, group: parentGroupId, baseColor: new THREE.Color(randomColor), layerVisible: true, isPersonaWire: true };
        wire.visible = false;

        const container = Registry.findStructureById('contenedor-escenico');
        if (container) {
            container.add(mesh);
            const localPos = container.worldToLocal(new THREE.Vector3(spawnPos.x, spawnHeight, spawnPos.z));
            mesh.position.copy(localPos);
            
            const containerWorldQuat = new THREE.Quaternion();
            container.getWorldQuaternion(containerWorldQuat);
            mesh.quaternion.copy(containerWorldQuat.clone().invert());
            
            wire.position.copy(mesh.position);
            wire.position.y += 0.85;
            wire.quaternion.copy(mesh.quaternion);
            container.add(wire);
        } else {
            scene.add(mesh);
            wire.position.copy(mesh.position);
            wire.position.y += 0.85;
            scene.add(wire);
        }
        Registry.addStructure(mesh);
        Registry.addWire(wire);

        PersonasEngine.playRandomSpawnSequence(mesh);
        History.save();
        selectNodeProgrammatically(id, false);
    } catch (e) {
        console.error('Failed to add persona', e);
        wrapperDiv.remove();
    }
}
