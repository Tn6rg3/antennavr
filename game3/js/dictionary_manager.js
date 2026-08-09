// js/dictionary_manager.js

window.loadDictionaries = async function() {
    await Promise.all([
        window.fetchDictionary("parole.txt", 'it'),
        window.fetchDictionary("words.txt", 'en')
    ]);
    window.updateDictionary();
};

window.fetchDictionary = async function(url, lang) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Offline o file non trovato");
        const text = await resp.text();
        const lines = text.split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 2);

        if (lines.length > 10) {
            if (lang === 'it') window.itDictionary = lines;
            else window.enDictionary = lines;
            return;
        }
        throw new Error("Dizionario troppo corto");
    } catch(e) {
        if (lang === 'it') window.itDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
        else window.enDictionary = FALLBACK_WORDS_EN.map(w => w.toLowerCase());
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

window.getGameWords = function(num, mode) {
    if (mode === 'daily_challenge') return window.getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: window.masterDictionary, custom: window.customDictionary });
    }
    return fisherYatesShuffle(window.masterDictionary).slice(0, num).map(w => w.toUpperCase());
};

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
