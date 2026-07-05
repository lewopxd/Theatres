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
import { userProject } from '../data/userProject.js';
import { systemCatalog } from '../data/systemCatalog.js';

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
    if (level > 0) {
        ul.classList.add('tree-children');
    } else {
        ul.classList.add('tree-children', 'open'); // Root always open
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

        if (node.children) {
            // Chevron for folders
            const chevron = document.createElement('i');
            chevron.className = 'ph ph-caret-right chevron';
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
            // Spacer for leaf nodes (align with chevron)
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

        // --- RIGHT PART (4 control slots, 16px each) ---
        const rightPart = document.createElement('div');
        rightPart.className = 'tree-node-controls';
        // Always visible if this node has a color dot
        if (node.color) rightPart.classList.add('always-visible');

        // Helper: create fixed-width slot
        const createSlot = () => {
            const slot = document.createElement('div');
            slot.className = 'ctrl-slot';
            return slot;
        };

        // SLOT 1: Add (+) — only for folders
        const addSlot = createSlot();
        if (node.type === 'folder') {
            const addBtn = document.createElement('i');
            addBtn.className = 'ph ph-plus ctrl-btn ctrl-add';
            addBtn.title = `Añadir a ${node.name}`;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log(`[systemCatalog] Abrir catálogo para añadir a: ${node.name}`);
            });
            addSlot.appendChild(addBtn);
        }
        rightPart.appendChild(addSlot);

        // SLOT 2: Visibility (Eye)
        const eyeSlot = createSlot();
        const eyeBtn = document.createElement('i');
        eyeBtn.className = 'ph ph-eye ctrl-btn visibility-btn';
        if (node.id) {
            eyeBtn.dataset.target = node.id;
            eyeBtn.dataset.isGroup = node.type === 'folder' ? 'true' : 'false';
        }
        eyeSlot.appendChild(eyeBtn);
        rightPart.appendChild(eyeSlot);

        // SLOT 3: Lock (Padlock)
        const lockSlot = createSlot();
        const lockBtn = document.createElement('i');
        lockBtn.className = 'ph ph-lock-key ctrl-btn lock-btn is-locked';
        if (node.id) {
            lockBtn.dataset.target = node.id;
            lockBtn.dataset.isGroup = node.type === 'folder' ? 'true' : 'false';
        }
        lockSlot.appendChild(lockBtn);
        rightPart.appendChild(lockSlot);

        // SLOT 4: Color dot
        const colorSlot = createSlot();
        if (node.color) {
            const colorDot = document.createElement('div');
            colorDot.className = 'color-dot';
            colorDot.style.backgroundColor = node.color;
            colorSlot.appendChild(colorDot);
        }
        rightPart.appendChild(colorSlot);

        row.appendChild(rightPart);
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

    // 2. Store active category in State
    State.set('activeCategory', categoryId);

    // 3. Clear and render tree from userProject
    const container = document.getElementById('tree-container');
    if (!container) return;
    container.innerHTML = '';

    const categoryData = userProject[categoryId];
    if (categoryData && categoryData.tree) {
        renderTree(categoryData.tree, container);
    }
}

// Make switchCategory available globally for onclick handlers in HTML
window._switchCategory = switchCategory;

// =====================================================================
// INIT — Initialize tree system
// =====================================================================

export function initTreeBuilder() {
    // Initial render
    switchCategory('arquitectura');

    // Expand the first folder by default for the demo
    setTimeout(() => {
        const firstChevron = document.querySelector('#tree-container .chevron');
        if (firstChevron) firstChevron.click();
    }, 100);

    // Initialize add buttons for Escenografía and Personas (context menu)
    initAddButtons();
    initDragAndDrop();
}

function initAddButtons() {
    // These will work when the respective category is active
    // For now, the (+) buttons on folder nodes log to console
    // In the future, they'll open the systemCatalog context menu
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

function addTreeElement(name, icon, type) {
    // Find parent folder if selected
    let parentNode = document.querySelector('#tree-container .tree-node.selected[data-type="grupo"]');
    let parentWrapper = parentNode ? parentNode.parentElement : null;

    const id = `item-${Date.now()}`;
    const isGroup = type === 'grupo';

    // Create the wrapper div
    const wrapperDiv = document.createElement('div');

    // Create the row
    const row = document.createElement('div');
    row.className = 'tree-node';
    row.dataset.id = id;
    row.dataset.type = isGroup ? 'grupo' : 'elemento';
    row.setAttribute('draggable', 'true');

    // Left part
    const leftPart = document.createElement('div');
    leftPart.style.cssText = 'display:flex; align-items:center; flex:1; min-width:0; padding-right:2px;';

    if (isGroup) {
        const chevron = document.createElement('i');
        chevron.className = 'ph ph-caret-right chevron';
        leftPart.appendChild(chevron);
        row.addEventListener('click', (e) => {
            if (e.target.closest('.tree-node-controls')) return;
            e.stopPropagation();
            chevron.classList.toggle('open');
            const childrenDiv = wrapperDiv.querySelector(':scope > .tree-children');
            if (childrenDiv) childrenDiv.classList.toggle('open');
        });
    } else {
        const spacer = document.createElement('div');
        spacer.className = 'chevron-spacer';
        leftPart.appendChild(spacer);
    }

    const typeIcon = document.createElement('i');
    typeIcon.className = `ph ph-${icon} node-icon`;
    leftPart.appendChild(typeIcon);

    const textSpan = document.createElement('span');
    textSpan.className = 'node-name';
    textSpan.textContent = name;
    leftPart.appendChild(textSpan);

    row.appendChild(leftPart);

    // Right controls
    const parentGroupId = parentNode ? (parentNode.dataset.id || 'root') : 'escenografia';
    const rightPart = document.createElement('div');
    rightPart.className = 'tree-node-controls always-visible';

    const createSlot = () => { const s = document.createElement('div'); s.className = 'ctrl-slot'; return s; };

    // Add slot
    const addSlot = createSlot();
    if (isGroup) {
        const addBtn = document.createElement('i');
        addBtn.className = 'ph ph-plus ctrl-btn ctrl-add';
        addSlot.appendChild(addBtn);
    }
    rightPart.appendChild(addSlot);

    // Eye
    const eyeSlot = createSlot();
    const eyeBtn = document.createElement('i');
    eyeBtn.className = 'ph ph-eye ctrl-btn visibility-btn';
    eyeBtn.dataset.target = id;
    eyeBtn.dataset.parent = parentGroupId;
    if (isGroup) eyeBtn.dataset.isGroup = 'true';
    eyeSlot.appendChild(eyeBtn);
    rightPart.appendChild(eyeSlot);

    // Lock
    const lockSlot = createSlot();
    const lockBtn = document.createElement('i');
    lockBtn.className = 'ph ph-lock-key-open ctrl-btn lock-btn';
    lockBtn.dataset.target = id;
    lockBtn.dataset.parent = parentGroupId;
    if (isGroup) lockBtn.dataset.isGroup = 'true';
    lockSlot.appendChild(lockBtn);
    rightPart.appendChild(lockSlot);

    // Color
    const colorSlot = createSlot();
    const colorDot = document.createElement('div');
    colorDot.className = 'color-dot';
    colorDot.style.backgroundColor = '#007acc';
    colorSlot.appendChild(colorDot);
    rightPart.appendChild(colorSlot);

    row.appendChild(rightPart);
    wrapperDiv.appendChild(row);

    if (isGroup) {
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tree-children open';
        wrapperDiv.appendChild(childrenDiv);
    }

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
        // Append at root of tree-container
        const rootChildren = document.querySelector('#tree-container > .tree-children');
        targetContainer = rootChildren || document.getElementById('tree-container');
    }
    targetContainer.appendChild(wrapperDiv);

    // Create 3D object for non-groups
    if (!isGroup) {
        let geo, params;
        switch (type) {
            case 'box': geo = new THREE.BoxGeometry(1, 1, 1); params = { w: 1, h: 1, d: 1 }; break;
            case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); params = { r: 0.5, h: 1 }; break;
            case 'sphere': geo = new THREE.SphereGeometry(0.5, 16, 16); params = { r: 0.5 }; break;
            case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 16); params = { r: 0.5, h: 1 }; break;
        }
        const mat = new THREE.MeshStandardMaterial({ color: 0x6a7b8e, transparent: true });
        createStruct(geo, mat, '#007acc', id, parentGroupId, 0, 0.5, 0, 0, type, params);
    }
}

// =====================================================================
// ADD PERSONA — Creates persona tree node + 3D model
// =====================================================================

export async function addPersonaElement(type) {
    if (PersonasEngine.isSpawningAny()) return;

    if (!PlacementEngine.canSpawnPersona()) {
        alert('Límite máximo alcanzado: No puedes agregar más de ' + PlacementEngine.MAX_PERSONAS + ' personas para no sobrecargar el navegador.');
        return;
    }

    let parentNode = document.querySelector('#tree-container .tree-node.selected[data-type="grupo"]');
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
        mesh.position.set(spawnPos.x, 6.0, spawnPos.z);
        mesh.updateMatrixWorld(true);

        const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 1.7, 0.5));
        const wireMat = new THREE.LineBasicMaterial({ color: randomColor });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        wire.userData = { id, group: parentGroupId, baseColor: new THREE.Color(randomColor), layerVisible: true, isPersonaWire: true };
        wire.position.copy(mesh.position);
        wire.position.y += 0.85;
        wire.visible = false;

        scene.add(mesh);
        scene.add(wire);
        Registry.addStructure(mesh);
        Registry.addWire(wire);

        PersonasEngine.playRandomSpawnSequence(mesh);
        History.save();
    } catch (e) {
        console.error('Failed to add persona', e);
        wrapperDiv.remove();
    }
}
