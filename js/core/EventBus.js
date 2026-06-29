// ============================================================
// EventBus — Pub/Sub global para comunicación desacoplada
// ============================================================

const listeners = {};

export const EventBus = {
    /**
     * Subscribe to an event
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    on(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
        return () => this.off(event, callback);
    },

    /**
     * Unsubscribe from an event
     */
    off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    },

    /**
     * Emit an event with optional data
     */
    emit(event, data) {
        if (!listeners[event]) return;
        listeners[event].forEach(cb => {
            try { cb(data); }
            catch (err) { console.error(`[EventBus] Error in handler for "${event}":`, err); }
        });
    },

    /**
     * Subscribe once — auto-unsubscribe after first call
     */
    once(event, callback) {
        const wrapper = (data) => {
            callback(data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }
};
