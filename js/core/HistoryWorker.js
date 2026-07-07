// HistoryWorker.js
// Exports an inline Web Worker to compress/decompress history steps and write to IndexedDB

const workerCode = `
const DB_NAME = 'SkeneCAD_DB';
const STORE_NAME = 'history_store';
let db = null;

// LZW Unicode-safe Compress
function compress(uncompressed) {
    let dictionary = {};
    for (let i = 0; i < 256; i++) {
        dictionary[String.fromCharCode(i)] = i;
    }
    let word = "";
    let result = [];
    let dictSize = 256;
    for (let i = 0; i < uncompressed.length; i++) {
        let c = uncompressed[i];
        let wc = word + c;
        if (dictionary.hasOwnProperty(wc)) {
            word = wc;
        } else {
            result.push(dictionary[word]);
            dictionary[wc] = dictSize++;
            word = String(c);
        }
    }
    if (word !== "") {
        result.push(dictionary[word]);
    }
    return result.map(code => String.fromCharCode(code)).join("");
}

// LZW Unicode-safe Decompress
function decompress(compressed) {
    let dictionary = {};
    for (let i = 0; i < 256; i++) {
        dictionary[i] = String.fromCharCode(i);
    }
    let codes = [];
    for (let i = 0; i < compressed.length; i++) {
        codes.push(compressed.charCodeAt(i));
    }
    let word = String.fromCharCode(codes[0]);
    let result = [word];
    let dictSize = 256;
    for (let i = 1; i < codes.length; i++) {
        let k = codes[i];
        let entry = "";
        if (dictionary.hasOwnProperty(k)) {
            entry = dictionary[k];
        } else if (k === dictSize) {
            entry = word + word.charAt(0);
        } else {
            throw new Error("Corrupted compressed data");
        }
        result.push(entry);
        dictionary[dictSize++] = word + entry.charAt(0);
        word = entry;
    }
    return result.join("");
}

function getDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const request = indexedDB.open(DB_NAME, 3);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('project_states')) {
                database.createObjectStore('project_states');
            }
            if (!database.objectStoreNames.contains('history_store')) {
                database.createObjectStore('history_store');
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

self.onmessage = async function(e) {
    const { id, type, key, data } = e.data;
    try {
        const database = await getDB();
        
        if (type === 'write') {
            const compressed = compress(data);
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(compressed, key);
            request.onsuccess = () => {
                self.postMessage({ id, success: true });
            };
            request.onerror = () => {
                self.postMessage({ id, success: false, error: request.error.message });
            };
        } else if (type === 'read') {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => {
                if (request.result) {
                    try {
                        const decompressed = decompress(request.result);
                        self.postMessage({ id, success: true, data: decompressed });
                    } catch(err) {
                        self.postMessage({ id, success: false, error: 'Decompression failed: ' + err.message });
                    }
                } else {
                    self.postMessage({ id, success: false, error: 'Key not found: ' + key });
                }
            };
            request.onerror = () => {
                self.postMessage({ id, success: false, error: request.error.message });
            };
        } else if (type === 'delete') {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => {
                self.postMessage({ id, success: true });
            };
            request.onerror = () => {
                self.postMessage({ id, success: false, error: request.error.message });
            };
        } else if (type === 'clear') {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => {
                self.postMessage({ id, success: true });
            };
            request.onerror = () => {
                self.postMessage({ id, success: false, error: request.error.message });
            };
        }
    } catch (err) {
        self.postMessage({ id, success: false, error: err.message });
    }
};
`;

export function createHistoryWorker() {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    return new Worker(url);
}
