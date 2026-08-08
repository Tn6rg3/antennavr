// ============================================================================
// DICTIONARIES.JS - GESTIONE DIZIONARI E PAROLE
// ============================================================================

const FALLBACK_WORDS_IT = [
    "RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA", "BATTAGLIA", "STAZIONE",
    "AMICIZIA", "FREQUENZA", "MESSAGGIO", "ASCOLTO", "TRASMISSIONE", "CIRCUITO", "OPERATORE"
];
const FALLBACK_WORDS_EN = [
    "RADIO", "MORSE", "TELEGRAPH", "SIGNAL", "ANTENNA", "BATTLE", "STATION",
    "FRIENDSHIP", "FREQUENCY", "MESSAGE", "LISTENING", "TRANSMISSION", "CIRCUIT", "OPERATOR"
];

async function loadDictionaries() {
    await Promise.all([
        fetchDictionary("parole.txt", 'it'),
        fetchDictionary("words.txt", 'en')
    ]);
    updateDictionary();
}

async function fetchDictionary(url, lang) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Offline o file non trovato");
        const text = await resp.text();
        const lines = text.split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 2);

        if (lines.length > 10) {
            if (lang === 'it') itDictionary = lines;
            else enDictionary = lines;
            return;
        }
        throw new Error("Dizionario troppo corto");
    } catch(e) {
        if (lang === 'it') itDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
        else enDictionary = FALLBACK_WORDS_EN.map(w => w.toLowerCase());
    }
}

function updateDictionary() {
    masterDictionary = (currentLang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary;
}

// --- PRNG E SHUFFLE PER SFIDA GIORNALIERA ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function getDailyWords(num) {
    let todayStr = new Date().toISOString().split('T')[0];
    let seed = parseInt(todayStr.replace(/-/g, ''));
    let prng = mulberry32(seed);
    let dict = [...masterDictionary];
    for (let i = dict.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [dict[i], dict[j]] = [dict[j], dict[i]];
    }
    return dict.slice(0, num).map(w => w.toUpperCase());
}

function getGameWords(num, mode) {
    if (mode === 'daily_challenge') return getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: masterDictionary, custom: customDictionary });
    }
    return fisherYatesShuffle(masterDictionary).slice(0, num).map(w => w.toUpperCase());
}
