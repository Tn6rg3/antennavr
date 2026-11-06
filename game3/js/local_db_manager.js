// js/local_db_manager.js - Gestore Database Locale (IndexedDB) & Telegram CloudStorage
// Mantiene lo storico ed i dettagli delle partite in locale sul dispositivo con consumo dati Firebase = 0.

window.localDb = null;
window.isLocalDbReady = false;

// 1. INIZIALIZZAZIONE INDEXEDDB
window.initLocalDatabase = function() {
    return new Promise((resolve) => {
        if (!('indexedDB' in window)) {
            console.warn("LocalDB: IndexedDB non supportato, uso fallback memoria.");
            resolve(false);
            return;
        }

        const request = indexedDB.open('cwgame_local_db', 1);

        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('matchHistory')) {
                const store = db.createObjectStore('matchHistory', { keyPath: 'id', autoIncrement: true });
                store.createIndex('ts', 'ts', { unique: false });
                store.createIndex('mode', 'mode', { unique: false });
            }
            if (!db.objectStoreNames.contains('userStats')) {
                db.createObjectStore('userStats', { keyPath: 'id' });
            }
        };

        request.onsuccess = function(e) {
            window.localDb = e.target.result;
            window.isLocalDbReady = true;
            console.log("LocalDB: IndexedDB pronto.");
            // Al caricamento, tenta il ripristino silenzioso da Telegram CloudStorage se IndexedDB è vuoto
            window.syncFromTelegramCloudStorage().then(() => resolve(true)).catch(() => resolve(true));
        };

        request.onerror = function(err) {
            console.error("LocalDB: Errore apertura IndexedDB", err);
            resolve(false);
        };
    });
};

// 2. SALVATAGGIO LOCALE DI UNA PARTITA (INDEXEDDB + TELEGRAM CLOUDSTORAGE)
window.saveLocalMatchRecord = async function(matchRecord) {
    if (!matchRecord || typeof matchRecord !== 'object') return;

    const record = {
        ts: matchRecord.ts || Date.now(),
        date: matchRecord.date || (typeof window.getLocalDateString === 'function' ? window.getLocalDateString() : new Date().toISOString().split('T')[0]),
        mode: matchRecord.mode || 'standard',
        score: Number(matchRecord.score) || 0,
        wpm: Number(matchRecord.wpm) || 20,
        wordCount: Number(matchRecord.wordCount) || 10,
        details: matchRecord.details || matchRecord.matchDetailsFull || []
    };

    // a) Salvataggio in IndexedDB
    if (window.isLocalDbReady && window.localDb) {
        try {
            const tx = window.localDb.transaction(['matchHistory'], 'readwrite');
            const store = tx.objectStore('matchHistory');
            store.add(record);
        } catch(e) {
            console.error("LocalDB: Errore aggiunta record", e);
        }
    }

    // b) Sincronizzazione Automatica in Background con Telegram CloudStorage (Zero Costo Firebase)
    window.autoSyncToTelegramCloudStorage().catch(() => {});
};

// 3. LETTURA STORICO PARTITE LOCALE (PER GRAFICI E PROFILO IN 0MS)
window.loadLocalMatchHistory = function(limit = 50) {
    return new Promise((resolve) => {
        if (!window.isLocalDbReady || !window.localDb) {
            resolve([]);
            return;
        }

        try {
            const tx = window.localDb.transaction(['matchHistory'], 'readonly');
            const store = tx.objectStore('matchHistory');
            const index = store.index('ts');
            const request = index.openCursor(null, 'prev'); // Ordinamento decrescente dal più recente

            const results = [];
            request.onsuccess = function(e) {
                const cursor = e.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = function() {
                resolve([]);
            };
        } catch(e) {
            console.error("LocalDB: Errore lettura storico", e);
            resolve([]);
        }
    });
};

// 4. TELEGRAM CLOUDSTORAGE API - AUTOMATICO REAL-TIME
window.autoSyncToTelegramCloudStorage = async function() {
    const tg = window.Telegram?.WebApp;
    if (!tg || !tg.CloudStorage || typeof tg.CloudStorage.setItem !== 'function') return;

    try {
        const history = await window.loadLocalMatchHistory(30); // Sincronizza le ultime 30 partite in formato compatto
        if (!history || history.length === 0) return;

        const compactData = history.map(h => ({
            ts: h.ts,
            date: h.date,
            mode: h.mode,
            score: h.score,
            wpm: h.wpm,
            wc: h.wordCount,
            detCount: Array.isArray(h.details) ? h.details.length : 0
        }));

        const jsonStr = JSON.stringify(compactData);
        tg.CloudStorage.setItem('cwgame_history_cloud', jsonStr, (err, success) => {
            if (success) console.log("Telegram CloudStorage: Sincronizzazione automatica completata.");
        });
    } catch(e) {
        console.warn("Telegram CloudStorage Sync Warn:", e);
    }
};

window.syncFromTelegramCloudStorage = function() {
    return new Promise((resolve) => {
        const tg = window.Telegram?.WebApp;
        if (!tg || !tg.CloudStorage || typeof tg.CloudStorage.getItem !== 'function') {
            resolve(false);
            return;
        }

        // Verifichiamo prima se il database locale è vuoto
        window.loadLocalMatchHistory(1).then(existing => {
            if (existing && existing.length > 0) {
                resolve(true); // Abbiamo già dati locali sul dispositivo
                return;
            }

            tg.CloudStorage.getItem('cwgame_history_cloud', (err, value) => {
                if (!err && value) {
                    try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed) && window.isLocalDbReady && window.localDb) {
                            const tx = window.localDb.transaction(['matchHistory'], 'readwrite');
                            const store = tx.objectStore('matchHistory');
                            parsed.forEach(item => {
                                store.add({
                                    ts: item.ts,
                                    date: item.date,
                                    mode: item.mode,
                                    score: item.score,
                                    wpm: item.wpm,
                                    wordCount: item.wc,
                                    details: []
                                });
                            });
                            console.log(`Telegram CloudStorage: Ripristinate ${parsed.length} partite dal Cloud personale Telegram!`);
                        }
                    } catch(e) {}
                }
                resolve(true);
            });
        });
    });
};

// 5. ESPORTAZIONE BACKUP MANUALE IN CHAT BOT TELEGRAM (.JSON)
window.exportLocalBackupToTelegramChat = async function() {
    try {
        let history = await window.loadLocalMatchHistory(100);

        if (!history || history.length === 0) {
            if (Array.isArray(window.userMatchHistory) && window.userMatchHistory.length > 0) {
                history = window.userMatchHistory;
            } else if (db && window.myId) {
                const snap = await db.ref(`users/${window.myId}/history`).limitToLast(50).once('value');
                if (snap.exists()) {
                    history = [];
                    snap.forEach(child => {
                        history.push({ key: child.key, ...child.val() });
                    });
                }
            }
        }

        if (!history || history.length === 0) {
            return alert("⚠️ Nessun dato locale o storico trovato da esportare.\n\nGioca almeno 1 partita per generare lo storico!");
        }

        const backupObj = {
            exportDate: new Date().toISOString(),
            userId: window.myId,
            userName: window.myName,
            matchCount: history.length,
            history: history
        };

        const jsonStr = JSON.stringify(backupObj, null, 2);

        const modal = document.getElementById('backupModal');
        const textarea = document.getElementById('backupJsonTextarea');

        if (modal && textarea) {
            textarea.value = jsonStr;
            modal.style.display = 'flex';
            if (typeof showToast === 'function') showToast("💾 Finestra di Backup aperta!");
        } else {
            window.copyBackupToClipboardWithText(jsonStr);
        }
    } catch(e) {
        alert("Errore generazione backup: " + e.message);
    }
};

window.copyBackupToClipboard = function() {
    const textarea = document.getElementById('backupJsonTextarea');
    if (!textarea || !textarea.value) return;

    window.copyBackupToClipboardWithText(textarea.value);
};

window.copyBackupToClipboardWithText = function(text) {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            alert("📋 TESTO BACKUP COPIATO NEGLI APPUNTI!\n\nI browser interni di Telegram bloccano il download diretto di file dentro le WebApp. Il testo del tuo backup è stato copiato negli appunti: puoi incollarlo nelle tue Note, in Chat o in un file di testo!");
        }).catch(() => {
            window.selectAndCopyTextarea();
        });
    } else {
        window.selectAndCopyTextarea();
    }
};

window.selectAndCopyTextarea = function() {
    const textarea = document.getElementById('backupJsonTextarea');
    if (textarea) {
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            alert("📋 TESTO BACKUP COPIATO NEGLI APPUNTI!\n\nPuoi incollarlo dove vuoi (Note o Chat).");
        } catch(e) {
            alert("📋 Seleziona il testo nella casella e copialo manualmente.");
        }
    }
};

window.deleteLocalMatchRecord = function(keyOrTs) {
    return new Promise((resolve) => {
        if (!window.isLocalDbReady || !window.localDb || !keyOrTs) {
            resolve(false);
            return;
        }

        try {
            const tx = window.localDb.transaction(['matchHistory'], 'readwrite');
            const store = tx.objectStore('matchHistory');

            if (!isNaN(keyOrTs)) {
                try { store.delete(Number(keyOrTs)); } catch(e){}
            }

            const request = store.openCursor();
            request.onsuccess = function(e) {
                const cursor = e.target.result;
                if (cursor) {
                    const val = cursor.value;
                    if (String(val.id) === String(keyOrTs) || String(val.ts) === String(keyOrTs) || String(val.key) === String(keyOrTs)) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve(true);
                }
            };
            request.onerror = function() { resolve(false); };
        } catch(e) {
            resolve(false);
        }
    });
};

window.downloadBackupFileDirectly = async function() {
    const textarea = document.getElementById('backupJsonTextarea');
    if (!textarea || !textarea.value) return;

    const jsonStr = textarea.value;
    const fileName = `cwgame_backup_${window.myId || 'user'}_${new Date().toISOString().split('T')[0]}.json`;

    const isInsideTelegramIframe = (window.self !== window.top);

    // Se siamo all'interno dell'iframe di Telegram, bypassiamo la chiamata a showSaveFilePicker evitando avvisi in console
    if (!isInsideTelegramIframe && typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'File Backup JSON (.json)',
                    accept: { 'application/json': ['.json', '.txt'], 'text/plain': ['.txt'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(jsonStr);
            await writable.close();
            if (typeof showToast === 'function') showToast("💾 File salvato con successo!");
            alert("✅ FILE DI BACKUP SALVATO CON SUCCESSO!\n\nIl file è stato salvato nella cartella che hai scelto.");
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }

    // FALLBACK SILENZIOSO PER TELEGRAM WEBAPP: Copia direttamente negli appunti
    window.copyBackupToClipboardWithText(jsonStr);
};

// 6. IMPORTAZIONE BACKUP MANUALE DA FILE .JSON
window.importLocalBackupFromJson = function(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || (!data.history && !Array.isArray(data))) {
                throw new Error("Formato backup non valido.");
            }

            const items = Array.isArray(data) ? data : data.history;

            if (window.isLocalDbReady && window.localDb) {
                const tx = window.localDb.transaction(['matchHistory'], 'readwrite');
                const store = tx.objectStore('matchHistory');
                items.forEach(item => {
                    store.add({
                        ts: item.ts || Date.now(),
                        date: item.date || new Date().toISOString().split('T')[0],
                        mode: item.mode || 'standard',
                        score: item.score || 0,
                        wpm: item.wpm || 20,
                        wordCount: item.wordCount || 10,
                        details: item.details || []
                    });
                });
            }

            alert(`✅ Ripristino completato!\n\nImportate ${items.length} partite nel tuo database locale.`);
            if (typeof window.loadProfileInfo === 'function') window.loadProfileInfo();
            if (typeof window.loadAdvancedStats === 'function') window.loadAdvancedStats();
        } catch(err) {
            alert("❌ Errore durante l'importazione del backup: " + err.message);
        }
    };
    reader.readAsText(file);
};

// Inizializza subito il database locale al caricamento dello script
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.initLocalDatabase();
} else {
    document.addEventListener('DOMContentLoaded', window.initLocalDatabase);
}
