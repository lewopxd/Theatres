// ============================================================
// Settings — Manejador de configuraciones de la aplicación
// ============================================================

import { State } from './State.js';
import { Storage } from './Storage.js';

export const Settings = {
    config: {
        visualZUp: true // true = Y acts as Z visually for the user
    },

    async init() {
        // Here we fetch from Settings storage asynchronously
        const stored = await Storage.getItem('tecal_settings');
        if (stored) {
            try {
                this.config = { ...this.config, ...JSON.parse(stored) };
            } catch (e) {
                console.error("Error parsing settings", e);
            }
        }
        State.set('visualZUp', this.config.visualZUp);
    },

    save() {
        Storage.setItem('tecal_settings', JSON.stringify(this.config)).catch(e => console.error("Error saving settings", e));
    },
    
    get(key) {
        return this.config[key];
    },
    
    set(key, value) {
        this.config[key] = value;
        State.set(key, value);
        this.save();
    }
};
