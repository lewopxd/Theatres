// ============================================================
// Settings — Manejador de configuraciones de la aplicación
// ============================================================

import { State } from './State.js';

export const Settings = {
    config: {
        visualZUp: true // true = Y acts as Z visually for the user
    },

    init() {
        // Here we could fetch from settings.json or localStorage
        const stored = localStorage.getItem('tecal_settings');
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
        localStorage.setItem('tecal_settings', JSON.stringify(this.config));
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
