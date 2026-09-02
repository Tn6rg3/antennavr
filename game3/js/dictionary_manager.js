// js/dictionary_manager.js

window.loadDictionaries = async function() {
    await Promise.all([
        window.fetchDictionary("parole.txt", 'it'),
        window.fetchDictionary("words.txt", 'en'),
        window.fetchDictionary("parole2.txt", 'arcade')
    ]);
    window.updateDictionary();
};

window.fetchDictionary = async function(url, lang) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Offline o file non trovato");
        const text = await resp.text();
        // Supporta sia separazione per riga che per virgola
        const words = text.split(/[\n,]+/)
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length > 2);

        if (words.length > 10) {
            if (lang === 'it') window.itDictionary = words;
            else if (lang === 'en') window.enDictionary = words;
            else if (lang === 'arcade') window.arcadeDictionary = words;
            return;
        }
        throw new Error("Dizionario troppo corto");
    } catch(e) {
        if (lang === 'it') window.itDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
        else if (lang === 'en') window.enDictionary = FALLBACK_WORDS_EN.map(w => w.toLowerCase());
        else if (lang === 'arcade') window.arcadeDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
    }
};

window.updateDictionary = function() {
    window.masterDictionary = (currentLang === 'en' && window.enDictionary.length > 0) ? window.enDictionary : window.itDictionary;
};

window.getDailyWords = function(num) {
    let todayStr = new Date().toISOString().split('T')[0];
    let seed = parseInt(todayStr.replace(/-/g, ''));
    let prng = mulberry32(seed);
    let dict = [...window.masterDictionary];
    for (let i = dict.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [dict[i], dict[j]] = [dict[j], dict[i]];
    }
    return dict.slice(0, num).map(w => w.toUpperCase());
};

window.getGameWords = function(num, mode, options = {}) {
    if (mode === 'daily_challenge') return window.getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: window.masterDictionary, custom: window.customDictionary }, options);
    }
    // Se siamo in modalità standard ma c'è un dizionario personalizzato carico, usalo
    if (mode === 'standard' && window.customDictionary && window.customDictionary.length > 0) {
        let list = window.customDictionary;
        const targetLen = parseInt(options?.wordLength) || 0;
        if (targetLen > 0) {
            const filtered = list.filter(w => w.length === targetLen);
            if (filtered.length > 0) list = filtered;
        }
        return fisherYatesShuffle(list).slice(0, num).map(w => w.toUpperCase());
    }
    return fisherYatesShuffle(window.masterDictionary).slice(0, num).map(w => w.toUpperCase());
};

window.updateCustomDictStatus = function() {
    const statusEl = document.getElementById('customDictStatus');
    if (!statusEl) return;
    if (window.customDictionary && window.customDictionary.length > 0) {
        statusEl.textContent = `✅ Caricate ${window.customDictionary.length} parole personalizzate.`;
        statusEl.style.color = 'var(--link-color)';
    } else {
        statusEl.textContent = "Nessun file caricato.";
        statusEl.style.color = 'var(--hint-color)';
    }
};

window.handleCustomDictUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        // Divide per spazi, virgole o nuove righe
        const words = text.split(/[\s,]+/)
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length >= 3);

        if (words.length > 0) {
            window.customDictionary = words;
            localStorage.setItem("cwgame_custom_dict", JSON.stringify(words));
            window.updateCustomDictStatus();
            showToast(`Dizionario caricato: ${words.length} parole.`);
        } else {
            showToast("Il file non contiene parole valide (min. 3 caratteri).");
        }
    };
    reader.onerror = function() {
        showToast("Errore durante la lettura del file.");
    };
    reader.readAsText(file);
};

// Inizializzazione listener caricamento file
setTimeout(() => {
    const fileInput = document.getElementById('customDictFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', window.handleCustomDictUpload);
    }
}, 2000);

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
