// ============================================================
// PropertiesPanel — Panel de propiedades inferior
// ============================================================

import * as THREE from 'three';
import { State } from '../core/State.js';
import { EventBus } from '../core/EventBus.js';
import { Registry } from '../core/Registry.js';
import { History } from '../core/History.js';
import { syncSelectionEdges } from '../engine/SelectionRenderer.js';
import { baseBgColor, updateBrightness } from '../engine/SceneManager.js';
import { updateMeshPos, updateGeometry } from '../tools/MoveTool.js';
import { MoveHandle } from '../engine/MoveHandle.js';
import { createIcons, $ } from '../utils/dom.js';
import { Settings } from '../core/Settings.js';
import { applyLayerVisibility } from '../engine/SceneManager.js';
import { PersonasEngine } from '../engine/PersonasEngine.js';
import { DeleteEngine } from '../engine/DeleteEngine.js';
import { DuplicateEngine } from '../engine/DuplicateEngine.js';

const propPanel = () => $('properties-panel');
const propHeader = () => $('prop-header');
const propContent = () => $('prop-content');

let currentActiveTabIndex = 0;

let animManifest = null;
let posesManifest = null;

/**
 * Initialize properties panel
 */
export function initPropertiesPanel() {
    const toggleProperties = () => {
        const p = $('properties-panel');
        const willOpen = p.classList.contains('collapsed');
        p.classList.toggle('collapsed');
        
        const topBtn = $('btn-top-properties');
        if (topBtn) topBtn.classList.toggle('active', willOpen);
        
        const railBtn = $('nav-properties');
        if (railBtn) railBtn.classList.toggle('active', willOpen);
        
        if (willOpen) EventBus.emit('ui:closeOthers', 'properties');
    };

    $('prop-header').addEventListener('click', toggleProperties);
    window._toggleProperties = toggleProperties;

    // Preload personas manifests
    PersonasEngine.fetchManifest('animaciones').then(d => animManifest = d);
    PersonasEngine.fetchManifest('poses').then(d => posesManifest = d);

    EventBus.on('ui:closeOthers', (source) => {
        if (source !== 'properties') {
            $('properties-panel').classList.add('collapsed');
            const topBtn = $('btn-top-properties');
            const railBtn = $('nav-properties');
            if (topBtn) topBtn.classList.remove('active');
            if (railBtn) railBtn.classList.remove('active');
        }
    });

    // Listen for selection events
    EventBus.on('selection:select', ({ mesh, li, showProps }) => {
        selectObject(mesh, li, showProps);
    });

    EventBus.on('selection:clear', () => {
        deselectAll();
    });

    EventBus.on('selection:restored', ({ mesh }) => {
        const li = document.querySelector(`.tree-node[data-id="${mesh.userData.id}"]`);
        selectObject(mesh, li, !propPanel().classList.contains('collapsed'));
    });

    EventBus.on('properties:refresh', () => {
        const mesh = State.get('selectedMesh');
        if (mesh && !propPanel().classList.contains('collapsed')) {
            const wire = Registry.findWireById(mesh.userData.id);
            renderMeshProperties(mesh, `#${wire?.userData.baseColor.getHexString() || 'ffffff'}`);
        }
    });

    EventBus.on('properties:refreshLive', () => {
        const mesh = State.get('selectedMesh');
        if (mesh && !propPanel().classList.contains('collapsed')) {
            const wire = Registry.findWireById(mesh.userData.id);
            renderMeshProperties(mesh, `#${wire?.userData.baseColor.getHexString() || 'ffffff'}`);
        }
    });
}

/**
 * Select an object and update UI
 */
export function selectObject(mesh, li, showProps = false) {
    State.set('selectedMesh', mesh);
    State.set('selectedLi', li);

    document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('selected'));
    if (li) {
        li.classList.add('selected');
        // Expand parent tree-children containers
        let p = li.parentElement;
        while (p) {
            if (p.classList.contains('tree-children')) {
                p.classList.add('open');
                const chevron = p.parentElement?.querySelector(':scope > .tree-node .chevron');
                if (chevron) chevron.classList.add('open');
            }
            p = p.parentElement;
        }
    }

    syncSelectionEdges(mesh);
    MoveHandle.hide();
    EventBus.emit('statusbar:coords', { mesh });
    updatePropertiesContent(mesh, li);
    if (showProps && propPanel().classList.contains('collapsed')) {
        propPanel().classList.remove('collapsed');
        const btnTop = $('btn-top-properties');
        if (btnTop) btnTop.classList.add('active');
        const railBtn = $('nav-properties');
        if (railBtn) railBtn.classList.add('active');
        EventBus.emit('ui:closeOthers', 'properties');
    }
}

/**
 * Deselect all
 */
function getNodeColorHex(li) {
    if (!li) return '#ffffff';
    const dot = li.querySelector('.color-dot');
    if (dot) {
        const bg = dot.style.backgroundColor;
        if (bg) {
            if (bg.startsWith('rgb')) {
                const parts = bg.match(/\d+/g);
                if (parts && parts.length >= 3) {
                    const r = parseInt(parts[0]).toString(16).padStart(2, '0');
                    const g = parseInt(parts[1]).toString(16).padStart(2, '0');
                    const b = parseInt(parts[2]).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                }
            }
            return bg;
        }
    }
    const struct = Registry.findStructureById(li.dataset.id);
    if (struct) {
        if (struct.userData.color) return struct.userData.color;
        const wire = Registry.findWireById(struct.userData.id);
        if (wire) return `#${wire.userData.baseColor.getHexString()}`;
    }
    return '#ffffff';
}

export function deselectAll() {
    selectObject(null, null);
}

function updatePropertiesContent(mesh, li) {
    if (!mesh && (!li || li.dataset.type !== 'grupo')) {
        renderContainerProperties();
        insertDesktopBreadcrumb();
        return;
    }
    
    if (li && li.dataset.type === 'grupo') {
        const groupColorHex = getNodeColorHex(li);
        $('prop-title-path').innerHTML = getBreadcrumbPathHTML(li, groupColorHex);
        createIcons({ root: $('prop-title-path') });
        renderGroupProperties(li, groupColorHex);
        insertDesktopBreadcrumb();
        return;
    }

    const wire = Registry.findWireById(mesh.userData.id);
    const wireColorHex = wire ? `#${wire.userData.baseColor.getHexString()}` : '#ffffff';
    $('prop-title-path').innerHTML = getBreadcrumbPathHTML(li, wireColorHex);
    createIcons({ root: $('prop-title-path') });
    renderMeshProperties(mesh, wireColorHex, li);
    insertDesktopBreadcrumb();
}

function insertDesktopBreadcrumb() {
    const content = $('prop-content');
    const bc = document.createElement('div');
    bc.className = 'desktop-breadcrumb';
    bc.innerHTML = $('prop-title-path').innerHTML;
    content.insertBefore(bc, content.firstChild);
}

function renderContainerProperties() {
    $('prop-title-path').innerHTML = `<span>Contenedor</span>`;
    const content = $('prop-content');
    content.innerHTML = '';
    const secBg = document.createElement('div');
    secBg.className = 'prop-section';
    secBg.innerHTML = `<div class="prop-section-title">Entorno</div>`;
    secBg.appendChild(createPropRow('Fondo', 'color', `#${baseBgColor.getHexString()}`, v => {
        baseBgColor.set(v);
        const slider = $('brightness-slider');
        updateBrightness(slider ? parseFloat(slider.value) : 1);
        History.save();
    }));
    content.appendChild(secBg);
}

function createPropRow(label, type, value, onChange, min = 0.1, step = 0.1, disabled = false) {
    const div = document.createElement('div');
    div.className = 'prop-row';
    const disAttr = disabled ? 'disabled' : '';
    div.innerHTML = `<label>${label}</label><input type="${type}" class="prop-input" value="${value}" ${type === 'number' ? `min="${min}" step="${step}"` : ''} ${disAttr}>`;
    div.querySelector('input').addEventListener('change', e => {
        onChange(e.target.value);
        History.save();
    });
    return div;
}

function createPropSelect(label, optionsObj, value, onChange, disabled = false) {
    const div = document.createElement('div');
    div.className = 'prop-row';
    const disAttr = disabled ? 'disabled' : '';
    let opts = Object.entries(optionsObj).map(([k, v]) =>
        `<option value="${k}" ${k === value ? 'selected' : ''}>${v}</option>`
    ).join('');
    div.innerHTML = `<label>${label}</label><select class="prop-input" ${disAttr}>${opts}</select>`;
    div.querySelector('select').addEventListener('change', e => {
        onChange(e.target.value);
        History.save();
    });
    return div;
}

function createPropCheckbox(label, value, onChange, disabled = false) {
    const div = document.createElement('div');
    div.className = 'prop-row checkbox-row';
    const disAttr = disabled ? 'disabled' : '';
    const checkedAttr = value ? 'checked' : '';
    div.innerHTML = `<label>${label}</label><input type="checkbox" class="prop-checkbox" ${checkedAttr} ${disAttr} style="width:auto; margin:0 0 0 auto;">`;
    div.querySelector('input').addEventListener('change', e => {
        onChange(e.target.checked);
        History.save();
    });
    return div;
}


export function applyGroupProperty(groupId, property, value) {
    const groupLi = document.querySelector(`.tree-node[data-id="${groupId}"]`);
    if (!groupLi) return;

    // Apply to DOM elements in this group (including nested)
    // Navigate up to wrapper, then search all descendant .tree-node[data-id]
    const wrapper = groupLi.parentElement;
    const descendants = wrapper ? wrapper.querySelectorAll('.tree-node[data-id]') : [];
    descendants.forEach(li => {
        const id = li.dataset.id;
        const mesh = Registry.findStructureById(id);
        const wire = Registry.findWireById(id);

        if (property === 'color') {
            const picker = li.querySelector('.layer-picker');
            if (picker) picker.value = value;
            const dot = li.querySelector('.color-dot');
            if (dot) dot.style.backgroundColor = value;
            if (wire) {
                wire.userData.baseColor.set(value);
                syncSelectionEdges(mesh);
            }
            // Save color on the folder itself if it is a folder
            const struct = Registry.findStructureById(id);
            if (struct && struct.userData.isFolder) {
                struct.userData.color = value;
            }
        } else if (property === 'lock') {
            const btn = li.querySelector('.lock-btn');
            if (btn) {
                if (value) btn.classList.add('is-locked');
                else btn.classList.remove('is-locked');
                btn.className = `ph ${value ? 'ph-lock-key' : 'ph-lock-key-open'} ctrl-btn lock-btn${value ? ' is-locked' : ''}`;
            }
            if (mesh) mesh.userData.locked = value;
        } else if (property === 'visibility') {
            const btn = li.querySelector('.visibility-btn');
            if (btn) {
                btn.classList.toggle('hidden-layer', !value);
                btn.className = `ph ${value ? 'ph-eye' : 'ph-eye-slash'} ctrl-btn visibility-btn${!value ? ' hidden-layer' : ''}`;
            }
            if (mesh) mesh.userData.layerVisible = value;
            applyLayerVisibility(State.get('is3DMode'), State.get('isWireframe'));
        }
    });

    // Also apply property directly to the group folder itself
    const folder = Registry.findStructureById(groupId);
    if (folder) {
        if (property === 'color') folder.userData.color = value;
        else if (property === 'lock') folder.userData.locked = value;
        else if (property === 'visibility') folder.userData.layerVisible = value;
    }

    createIcons({ root: groupLi });
}

function renderGroupProperties(li, groupColorHex) {
    const content = $('prop-content');
    content.innerHTML = '';
    
    const groupId = li.dataset.id;
    const lockEl = li.querySelector('.lock-btn');
    const eyeEl = li.querySelector('.visibility-btn');
    
    const isLocked = lockEl ? lockEl.classList.contains('is-locked') : false;
    const isVisible = eyeEl ? !eyeEl.classList.contains('hidden-layer') : true;
    
    // Wrap in prop-tab-content and accordion so it matches desktop styles
    const tab1 = document.createElement('div');
    tab1.className = 'prop-tab-content active';

    const accHead1 = document.createElement('button');
    accHead1.className = 'accordion-header';
    accHead1.innerHTML = `General <i class="ph ph-caret-down"></i>`;
    tab1.appendChild(accHead1);

    const accBody1 = document.createElement('div');
    accBody1.className = 'accordion-body';
    
    // Group general section
    const secGeneral = document.createElement('div');
    secGeneral.className = 'prop-section';
    secGeneral.innerHTML = `
        <div class="prop-section-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Grupo</span>
            <div class="quick-actions" style="display:flex; gap:8px;">
                <button class="quick-action-btn btn-delete" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:4px;" title="Eliminar"><i class="ph ph-trash" style="font-size:16px;"></i></button>
            </div>
        </div>
    `;

    secGeneral.querySelector('.btn-delete').addEventListener('click', () => DeleteEngine.execute());
    
    // Name input
    const currentName = li.querySelector('.node-name')?.textContent?.trim() || 'Grupo';
    const nameRow = createPropRow('Nombre', 'text', currentName, v => {
        updateNodeName(li, v);
    });
    secGeneral.appendChild(nameRow);
    
    // Layer color
    secGeneral.appendChild(createPropRow('Color Capa', 'color', groupColorHex, v => {
        const picker = li.querySelector('.layer-picker');
        if (picker) picker.value = v;
        applyGroupProperty(groupId, 'color', v);
    }));

    accBody1.appendChild(secGeneral);
    tab1.appendChild(accBody1);
    content.appendChild(tab1);

    // Accordion interaction
    accHead1.addEventListener('click', () => {
        accHead1.classList.toggle('collapsed');
        accBody1.classList.toggle('collapsed');
    });
    createIcons({ root: content });
}

function updateNodeName(li, newName) {
    if (!li) return;
    const nameSpan = li.querySelector('.node-name');
    if (nameSpan) {
        nameSpan.textContent = newName;
    }
    
    // If it's a mesh, update its userData.name too (although right now we just rely on DOM)
    if (li.dataset.type === 'elemento') {
        const mesh = Registry.findStructureById(li.dataset.id);
        if (mesh) mesh.userData.name = newName;
    }
    
    History.save();
    
    // Refresh breadcrumb if needed
    const propPath = $('prop-title-path');
    if (propPath) {
        propPath.innerHTML = getBreadcrumbPathHTML(li, getNodeColorHex(li));
        createIcons({ root: propPath });
    }
}

function renderMeshProperties(mesh, wireColorHex, li) {
    const content = $('prop-content');
    content.innerHTML = '';
    if (!mesh) return;
    const data = mesh.userData;
    const isLocked = data.locked;

    const tabsHeader = document.createElement('div');
    tabsHeader.className = 'prop-tabs-header';
    content.appendChild(tabsHeader);

    const tabDefs = [];

    // Tab: General
    tabDefs.push({
        title: 'General',
        build: (body) => {
            const secName = document.createElement('div');
            secName.className = 'prop-section';
            
            const actionsHeader = document.createElement('div');
            actionsHeader.className = 'prop-section-title';
            actionsHeader.style.display = 'flex';
            actionsHeader.style.justifyContent = 'space-between';
            actionsHeader.style.alignItems = 'center';
            actionsHeader.innerHTML = `
                <span>Propiedades</span>
                <div class="quick-actions" style="display:flex; gap:8px;">
                    <button class="quick-action-btn btn-duplicate" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:4px;" title="Duplicar"><i class="ph ph-copy" style="font-size:16px;"></i></button>
                    <button class="quick-action-btn btn-delete" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; padding:4px;" title="Eliminar"><i class="ph ph-trash" style="font-size:16px;"></i></button>
                </div>
            `;
            secName.appendChild(actionsHeader);
            
            actionsHeader.querySelector('.btn-duplicate').addEventListener('click', () => DuplicateEngine.execute());
            actionsHeader.querySelector('.btn-delete').addEventListener('click', () => DeleteEngine.execute());

            const currentName = li ? (li.querySelector('.node-name')?.textContent?.trim() || data.name || 'Elemento') : (data.name || 'Elemento');
            secName.appendChild(createPropRow('Nombre', 'text', currentName, v => updateNodeName(li, v)));
            
            const wire = Registry.findWireById(data.id);
            secName.appendChild(createPropRow('Color Capa', 'color', wireColorHex, v => {
                if (wire) wire.userData.baseColor.set(v);
                const treeDot = document.querySelector(`.tree-node[data-id="${data.id}"] .color-dot`);
                if (treeDot) treeDot.style.backgroundColor = v;
                syncSelectionEdges(mesh);
                const chevron = document.querySelector('.breadcrumb-chevron:last-of-type');
                if (chevron) chevron.style.color = v;
            }, undefined, undefined, isLocked));
            
            body.appendChild(secName);

            if (data.editable && !data.isPersona) {
                const secGeo = document.createElement('div');
                secGeo.className = 'prop-section';
                secGeo.innerHTML = `<div class="prop-section-title">Geometría</div>`;
                const p = data.geoParams;
                if (data.geoType === 'box') {
                    secGeo.appendChild(createPropRow('Ancho (X)', 'number', p.w, v => updateGeometry('w', v), undefined, undefined, isLocked));
                    if (Settings.get('visualZUp')) {
                        secGeo.appendChild(createPropRow('Prof (Y)', 'number', p.d, v => updateGeometry('d', v), undefined, undefined, isLocked));
                        secGeo.appendChild(createPropRow('Alto (Z)', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
                    } else {
                        secGeo.appendChild(createPropRow('Alto (Y)', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
                        secGeo.appendChild(createPropRow('Prof (Z)', 'number', p.d, v => updateGeometry('d', v), undefined, undefined, isLocked));
                    }
                } else if (data.geoType === 'cylinder' || data.geoType === 'cone') {
                    secGeo.appendChild(createPropRow('Radio', 'number', p.r, v => updateGeometry('r', v), undefined, undefined, isLocked));
                    secGeo.appendChild(createPropRow('Alto', 'number', p.h, v => updateGeometry('h', v), undefined, undefined, isLocked));
                } else if (data.geoType === 'sphere') {
                    secGeo.appendChild(createPropRow('Radio', 'number', p.r, v => updateGeometry('r', v), undefined, undefined, isLocked));
                }
                body.appendChild(secGeo);
            }
        }
    });

    // Tab: Anatomía (Personas only)
    if (data.editable && data.isPersona) {
        tabDefs.push({
            title: 'Anatomía',
            build: (body) => {
                const secAna = document.createElement('div');
                secAna.className = 'prop-section';
                secAna.innerHTML = `<div class="prop-section-title">Alometría</div>`;
                secAna.appendChild(createPropRow('Altura (m)', 'number', data.height.toFixed(2), v => {
                    PersonasEngine.updateAllometry(mesh, parseFloat(v));
                    syncSelectionEdges(mesh);
                }, 1.0, 0.01, isLocked));
                body.appendChild(secAna);
            }
        });
    }

    // Tab: Ubicación
    tabDefs.push({
        title: 'Ubicación',
        build: (body) => {
            const secPos = document.createElement('div');
            secPos.className = 'prop-section';
            secPos.appendChild(createPropRow('X', 'number', mesh.position.x.toFixed(2), v => updateMeshPos('x', parseFloat(v)), undefined, undefined, isLocked));
            if (Settings.get('visualZUp')) {
                secPos.appendChild(createPropRow('Y', 'number', mesh.position.z.toFixed(2), v => updateMeshPos('z', parseFloat(v)), undefined, undefined, isLocked));
                secPos.appendChild(createPropRow('Z', 'number', mesh.position.y.toFixed(2), v => updateMeshPos('y', parseFloat(v)), undefined, undefined, isLocked));
            } else {
                secPos.appendChild(createPropRow('Y', 'number', mesh.position.y.toFixed(2), v => updateMeshPos('y', parseFloat(v)), undefined, undefined, isLocked));
                secPos.appendChild(createPropRow('Z', 'number', mesh.position.z.toFixed(2), v => updateMeshPos('z', parseFloat(v)), undefined, undefined, isLocked));
            }
            body.appendChild(secPos);
        }
    });

    // Tab: Rotación
    tabDefs.push({
        title: 'Rotación',
        build: (body) => {
            const secRot = document.createElement('div');
            secRot.className = 'prop-section';
            
            const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'YXZ');
            const initRx = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
            const initRy = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
            const initRz = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

            let rowX, rowY, rowZ;
            
            const updateMeshRot = () => {
                if (mesh.userData.locked) return;
                
                const rx = parseFloat(rowX.querySelector('input').value) || 0;
                const ry = parseFloat(rowY.querySelector('input').value) || 0;
                const rz = parseFloat(rowZ.querySelector('input').value) || 0;
                
                const newEuler = new THREE.Euler(0, 0, 0, 'YXZ');
                if (Settings.get('visualZUp')) {
                    newEuler.x = THREE.MathUtils.degToRad(rx);
                    newEuler.z = THREE.MathUtils.degToRad(ry);
                    newEuler.y = THREE.MathUtils.degToRad(rz);
                } else {
                    newEuler.x = THREE.MathUtils.degToRad(rx);
                    newEuler.y = THREE.MathUtils.degToRad(ry);
                    newEuler.z = THREE.MathUtils.degToRad(rz);
                }
                
                mesh.quaternion.setFromEuler(newEuler);
                
                const wire = Registry.findWireById(mesh.userData.id);
                if (wire) wire.quaternion.copy(mesh.quaternion);
                
                mesh.updateMatrixWorld();
                syncSelectionEdges(mesh);
                EventBus.emit('statusbar:coords', { mesh });
                History.save();
                
                if (window.RotationGizmo && window.RotationGizmo.getGroup().visible) {
                    window.RotationGizmo.update();
                }
            };

            if (Settings.get('visualZUp')) {
                rowX = createPropRow('X (°)', 'number', initRx, updateMeshRot, undefined, undefined, isLocked);
                rowY = createPropRow('Y (°)', 'number', initRz, updateMeshRot, undefined, undefined, isLocked);
                rowZ = createPropRow('Z (°)', 'number', initRy, updateMeshRot, undefined, undefined, isLocked);
            } else {
                rowX = createPropRow('X (°)', 'number', initRx, updateMeshRot, undefined, undefined, isLocked);
                rowY = createPropRow('Y (°)', 'number', initRy, updateMeshRot, undefined, undefined, isLocked);
                rowZ = createPropRow('Z (°)', 'number', initRz, updateMeshRot, undefined, undefined, isLocked);
            }
            
            secRot.appendChild(rowX);
            secRot.appendChild(rowY);
            secRot.appendChild(rowZ);
            body.appendChild(secRot);
        }
    });

    // Tab: Poses (Personas only)
    if (data.isPersona) {
        tabDefs.push({
            title: 'Poses',
            build: (body) => {
                const secAnim = document.createElement('div');
                secAnim.className = 'prop-section';
                if (animManifest) {
                    const animOptions = { '': 'Ninguna' };
                    animManifest.forEach(a => animOptions[a.file] = a.name);
                    secAnim.appendChild(createPropSelect('Animación', animOptions, data.currentAction || '', async v => {
                        data.currentAction = v;
                        if (v) {
                            await PersonasEngine.loadAsset(mesh, `assets/modelos3d/personas/animaciones/${v}`, true);
                        } else {
                            PersonasEngine.stopAnimation(mesh);
                        }
                        syncSelectionEdges(mesh);
                    }, isLocked));
                }
                if (posesManifest) {
                    const posesOptions = { '': 'Ninguna' };
                    posesManifest.forEach(p => posesOptions[p.file] = p.name);
                    secAnim.appendChild(createPropSelect('Pose', posesOptions, data.currentAction || '', async v => {
                        data.currentAction = v;
                        if (v) {
                            await PersonasEngine.loadAsset(mesh, `assets/modelos3d/personas/poses/${v}`, false);
                        } else {
                            PersonasEngine.stopAnimation(mesh);
                        }
                        syncSelectionEdges(mesh);
                    }, isLocked));
                }
                body.appendChild(secAnim);
            }
        });
    }

    // Tab: Apariencia / Color
    tabDefs.push({
        title: data.isPersona ? 'Apariencia' : 'Color',
        build: (body) => {
            const secColor = document.createElement('div');
            secColor.className = 'prop-section';
            
            if (data.isPersona) {
                const skinOptions = { 'original': 'Skin Original', 'solid': 'Color Sólido' };
                const currentSkin = data.useCustomSkin ? 'solid' : 'original';
                secColor.appendChild(createPropSelect('Piel', skinOptions, currentSkin, v => {
                    data.useCustomSkin = (v === 'solid');
                    if (data.useCustomSkin && !data.customSkinColor) data.customSkinColor = '#ffffff';
                    PersonasEngine.updatePersonaMaterial(mesh);
                    renderMeshProperties(mesh, wireColorHex, li);
                }, isLocked));

                if (data.useCustomSkin) {
                    secColor.appendChild(createPropRow('Tono', 'color', data.customSkinColor, v => {
                        data.customSkinColor = v;
                        PersonasEngine.updatePersonaMaterial(mesh);
                    }, undefined, undefined, isLocked));
                }
            } else if (mesh.material) {
                secColor.appendChild(createPropRow('Relleno', 'color', `#${mesh.material.color.getHexString()}`, v => {
                    mesh.material.color.set(v); data.materialPreset = 'custom';
                    const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
                }, undefined, undefined, isLocked));

                secColor.appendChild(createPropRow('Opacidad', 'number', mesh.material.opacity, v => {
                    mesh.material.opacity = parseFloat(v); data.materialPreset = 'custom';
                    const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
                }, 0, 0.1, isLocked));
            }
            body.appendChild(secColor);
        }
    });

    // Tab: Material (Standard meshes only)
    if (mesh.material && mesh.material.isMeshStandardMaterial && !data.isPersona) {
        tabDefs.push({
            title: 'Material',
            build: (body) => {
                const secMat = document.createElement('div');
                secMat.className = 'prop-section';

                const presets = { 'custom': 'Personalizado', 'madera': 'Madera', 'metal': 'Metal', 'plastico': 'Plástico', 'cristal': 'Cristal' };
                const presetRow = createPropSelect('Preset', presets, data.materialPreset || 'custom', v => {
                    data.materialPreset = v;
                    if (v !== 'custom') {
                        mesh.material.transparent = true;
                        if (v === 'madera') { mesh.material.color.set('#8b5a2b'); mesh.material.roughness = 0.9; mesh.material.metalness = 0.0; mesh.material.opacity = 1.0; }
                        if (v === 'metal') { mesh.material.color.set('#cccccc'); mesh.material.roughness = 0.2; mesh.material.metalness = 0.9; mesh.material.opacity = 1.0; }
                        if (v === 'plastico') { mesh.material.color.set('#007acc'); mesh.material.roughness = 0.4; mesh.material.metalness = 0.1; mesh.material.opacity = 1.0; }
                        if (v === 'cristal') { mesh.material.color.set('#e0ffff'); mesh.material.roughness = 0.05; mesh.material.metalness = 0.1; mesh.material.opacity = 0.4; }
                        renderMeshProperties(mesh, wireColorHex, li);
                    }
                }, isLocked);
                presetRow.querySelector('select').classList.add('material-preset-select');
                secMat.appendChild(presetRow);

                secMat.appendChild(createPropRow('Rugoso', 'number', mesh.material.roughness, v => {
                    mesh.material.roughness = parseFloat(v); data.materialPreset = 'custom';
                    const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
                }, 0, 0.1, isLocked));
                
                secMat.appendChild(createPropRow('Metal', 'number', mesh.material.metalness, v => {
                    mesh.material.metalness = parseFloat(v); data.materialPreset = 'custom';
                    const sel = document.querySelector('.material-preset-select'); if (sel) sel.value = 'custom';
                }, 0, 0.1, isLocked));
                
                body.appendChild(secMat);
            }
        });
    }

    // Build DOM from definitions
    const tabs = [];
    if (currentActiveTabIndex >= tabDefs.length) currentActiveTabIndex = 0;

    tabDefs.forEach((def, index) => {
        const isActive = index === currentActiveTabIndex;

        // Button
        const btn = document.createElement('button');
        btn.className = `prop-tab-btn ${isActive ? 'active' : ''}`;
        btn.textContent = def.title;
        tabsHeader.appendChild(btn);

        // Content
        const tabContent = document.createElement('div');
        tabContent.className = `prop-tab-content ${isActive ? 'active' : ''}`;
        
        const accHead = document.createElement('button');
        accHead.className = 'accordion-header';
        accHead.innerHTML = `${def.title} <i class="ph ph-caret-down"></i>`;
        tabContent.appendChild(accHead);

        const accBody = document.createElement('div');
        accBody.className = 'accordion-body';
        
        def.build(accBody);

        tabContent.appendChild(accBody);
        content.appendChild(tabContent);

        // Interaction logic
        accHead.addEventListener('click', () => {
            accHead.classList.toggle('collapsed');
            accBody.classList.toggle('collapsed');
        });

        // Tab switching logic
        btn.addEventListener('click', () => {
            currentActiveTabIndex = index;
            tabs.forEach(x => {
                x.btn.classList.remove('active');
                x.content.classList.remove('active');
            });
            btn.classList.add('active');
            tabContent.classList.add('active');
        });

        tabs.push({ btn, content: tabContent });
    });

    createIcons({ root: content });
}

function getBreadcrumbPathHTML(li, colorHex) {
    if (!li) return `<span>Contenedor</span>`;
    const path = [];
    let current = li;
    while (current) {
        // li is now a .tree-node div
        const nameSpan = current.querySelector?.(':scope > div .node-name') || current.querySelector?.('.node-name');
        if (nameSpan) {
            path.unshift(nameSpan.textContent.trim());
        } else if (current.classList?.contains('tree-node')) {
            const name = current.querySelector('.node-name');
            if (name) path.unshift(name.textContent.trim());
        }
        // Traverse up: wrapper div > tree-children > wrapper div > tree-node
        const wrapper = current.closest ? current.parentElement : null;
        if (!wrapper) break;
        const parentChildren = wrapper.parentElement;
        if (!parentChildren || !parentChildren.classList?.contains('tree-children')) break;
        const parentWrapper = parentChildren.parentElement;
        if (!parentWrapper) break;
        current = parentWrapper.querySelector(':scope > .tree-node');
        if (current === li) break; // prevent infinite loop
    }
    let html = '';
    for (let i = 0; i < path.length; i++) {
        if (i > 0) {
            const isLast = (i === path.length - 1);
            const colorStyle = isLast && colorHex ? `style="color: ${colorHex}; opacity: 1;"` : 'style="opacity: 0.5;"';
            html += `<i class="ph ph-caret-right breadcrumb-chevron" ${colorStyle}></i>`;
        }
        html += `<span>${path[i]}</span>`;
    }
    return html;
}
