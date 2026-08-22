// game4/common/logic.js
// Logica di gioco comune condivisa tra tutti i moduli

window.MORSE_DICT = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    '=': '-...-', '.': '.-.-.-', ',': '--..--', '?': '..--..',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--'
};
window.morseDict = window.MORSE_DICT;

window.XP_PER_WORD = 10;
window.XP_BONUS_STREAK = 5;
window.XP_PER_LEVEL_BASE = 500;
window.XP_GROWTH_FACTOR = 1.2;

window.OPERATOR_TITLES = [
    { level: 1, it: "Recluta Morse", en: "Morse Recruit" },
    { level: 5, it: "Apprendista Segnalatore", en: "Signal Apprentice" },
    { level: 10, it: "Operatore Radio Junior", en: "Junior Radio Operator" },
    { level: 20, it: "Telegrafista Navale", en: "Naval Telegraphist" },
    { level: 30, it: "Telegrafista Militare", en: "Military Telegrapher" },
    { level: 35, it: "Esperto d'Intercettazione", en: "Interception Expert" },
    { level: 50, it: "Maestro del Tasto", en: "Key Master" },
    { level: 75, it: "Leggenda dell'Etere", en: "Legend of the Ether" },
    { level: 100, it: "Gran Maestro Telegrafista", en: "Grand Morse Master" }
];

window.KOCH_SEQUENCE = "KMRSUAPTLOWI.NJEF0YV,,G5/Q9ZH38B?427C1D6X".split("");

window.getXPForNextLevel = function(level) {
    return Math.floor(XP_PER_LEVEL_BASE * Math.pow(XP_GROWTH_FACTOR, level - 1));
};

window.FALLBACK_WORDS_IT = ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA", "BATTAGLIA", "STAZIONE"];
window.FALLBACK_WORDS_EN = ["RADIO", "MORSE", "TELEGRAPH", "SIGNAL", "ANTENNA", "BATTLE", "STATION"];

window.itDictionary = [];
window.enDictionary = [];
window.arcadeDictionary = [];
window.masterDictionary = [];
window.customDictionary = JSON.parse(localStorage.getItem("cwgame_custom_dict") || "[]");

window.loadDictionaries = async function() {
    const prefix = (typeof window.ROOT_PATH !== 'undefined') ? window.ROOT_PATH : '';
    const dataPrefix = prefix + "data/";
    await Promise.all([
        window.fetchDictionary(dataPrefix + "parole.txt", 'it'),
        window.fetchDictionary(dataPrefix + "words.txt", 'en'),
        window.fetchDictionary(dataPrefix + "parole2.txt", 'arcade')
    ]);
    window.updateDictionary();
};

window.fetchDictionary = async function(url, lang) {
    try {
        const resp = await fetch(url + "?v=" + Date.now());
        if (!resp.ok) throw new Error();
        const text = await resp.text();
        const words = text.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 2);
        if (words.length > 10) {
            if (lang === 'it') window.itDictionary = words;
            else if (lang === 'en') window.enDictionary = words;
            else if (lang === 'arcade') window.arcadeDictionary = words;
            return;
        }
    } catch(e) {
        if (lang === 'it') window.itDictionary = window.FALLBACK_WORDS_IT.map(w => w.toLowerCase());
        else if (lang === 'en') window.enDictionary = window.FALLBACK_WORDS_EN.map(w => w.toLowerCase());
        else if (lang === 'arcade') window.arcadeDictionary = window.FALLBACK_WORDS_IT.map(w => w.toLowerCase());
    }
};

window.updateDictionary = function() {
    const lang = (window.currentLang) ? window.currentLang : 'it';
    window.masterDictionary = (lang === 'en' && window.enDictionary.length > 0) ? window.enDictionary : window.itDictionary;
};

function mulberry32(seed) {
    return function() {
        var t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

window.getDailyWords = function(num) {
    let todayStr = new Date().toISOString().split('T')[0];
    let seed = parseInt(todayStr.replace(/-/g, ''));
    let prng = mulberry32(seed);
    let dict = (window.masterDictionary.length > 0) ? [...window.masterDictionary] : [...window.FALLBACK_WORDS_IT];
    for (let i = dict.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [dict[i], dict[j]] = [dict[j], dict[i]];
    }
    return dict.slice(0, num).map(w => w.toUpperCase());
};

window.getGameWords = function(num, mode) {
    if (mode === 'daily_challenge') return window.getDailyWords(num);
    const baseDict = (window.masterDictionary.length > 0) ? window.masterDictionary : window.FALLBACK_WORDS_IT;
    if (mode === 'custom' && window.customDictionary.length > 0) {
        return window.fisherYatesShuffle(window.customDictionary).slice(0, num).map(w => w.toUpperCase());
    }
    return window.fisherYatesShuffle(baseDict).slice(0, num).map(w => w.toUpperCase());
};

window.fisherYatesShuffle = function(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

window.getLevenshteinDistance = function(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
};

window.calculateGamePoints = function(currentMode, currentWord, userWord, wpm, reactionMs, levDist, usedReplay) {
    let points = 0, scoreColor = "#999999";
    const realStr = String(currentWord || "").toUpperCase();
    const typedStr = String(userWord || "").toUpperCase();
    const safeWpm = Math.max(5, Number(wpm) || 20);
    const safeReactionMs = Math.max(0, Number(reactionMs) || 0);
    const safeLevDist = Math.max(0, Number(levDist) || 0);
    if (currentMode === 'chars') {
        if (typedStr === realStr && realStr.length > 0) { points = Math.max(100, Math.floor(1000 - (safeReactionMs / 2))); scoreColor = "#4caf50"; }
        else { points = 0; scoreColor = "#d32f2f"; }
    } else {
        const basePoints = (Math.pow(safeWpm, 2) * realStr.length) / (10 * Math.pow(safeLevDist + 1, 2));
        const estimatedAudioMs = (realStr.length * 60 / safeWpm) * 1000;
        let timeMultiplier = 1.0;
        if (safeReactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((safeReactionMs - (estimatedAudioMs + 2000)) / 20000));
        else if (safeReactionMs < estimatedAudioMs && safeLevDist === 0) timeMultiplier = 1.1;
        points = Math.round(basePoints * timeMultiplier);
        if (safeLevDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50";
        else if (safeLevDist === 1) scoreColor = "#ff9800";
        else scoreColor = "#d32f2f";
        if (usedReplay) points = 0;
    }
    return { points, scoreColor };
};

window.addXP = function(amount, reason = "") {
    if (!window.db || !window.myId) return;
    window.db.ref(`users/${window.myId}/progression`).transaction(curr => {
        if (!curr) curr = { xp: 0, level: 1 };
        curr.xp = (curr.xp || 0) + amount;
        let needed = window.getXPForNextLevel(curr.level);
        while (curr.xp >= needed && curr.level < 100) { curr.xp -= needed; curr.level++; needed = window.getXPForNextLevel(curr.level); }
        return curr;
    }).then(() => { if (reason) console.log(`XP Added: ${amount} for ${reason}`); });
};

window.updateActivity = function(won = false) {
    if (!window.db || !window.myId) return;
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    ['daily/'+dKey, 'weekly/'+wKey, 'monthly/'+mKey].forEach(path => {
        window.db.ref(`activity/${path}/${window.myId}`).transaction(data => {
            if (!data) return { name: window.myName, games: 1, wins: won ? 1 : 0, lastPlayed: firebase.database.ServerValue.TIMESTAMP };
            data.games = (data.games || 0) + 1;
            if (won) data.wins = (data.wins || 0) + 1;
            data.name = window.myName;
            data.lastPlayed = firebase.database.ServerValue.TIMESTAMP;
            return data;
        });
    });
};

window.getWeekNumber = function(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return d.getUTCFullYear() + "-W" + weekNo.toString().padStart(2, '0');
};

window.syncUserNameEverywhere = async function(userId, newName, newUsername) {
    if (!window.db) return;
    const db = window.db;

    // 1. Presenza
    await db.ref(`presence/${userId}`).update({ name: newName, username: newUsername });

    // 2. Attività
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) {
        try {
            const snap = await db.ref(`${path}/${userId}`).once('value');
            if (snap.exists()) await db.ref(`${path}/${userId}`).update({ name: newName });
        } catch(e) {}
    }

    // 3. Corso CW
    try {
        const courseRef = db.ref(`courseActiveEnrollments/${userId}`);
        const snap = await courseRef.once('value');
        if (snap.exists()) await courseRef.update({ name: newName });
    } catch(e) {}

    // 4. Leaderboards
    await window.updateUserInAllLeaderboards(userId, newName, newUsername);
};

window.updateUserInAllLeaderboards = async function(userId, newName, newUsername) {
    if (!window.db) return;
    const db = window.db;
    const fixedPaths = [
        `leaderboard/callsign/global/${userId}`,
        `leaderboard/arcade/all/${userId}`,
        `leaderboard/arcade/global/${userId}`
    ];
    for (const path of fixedPaths) {
        try {
            const snap = await db.ref(path).once('value');
            if (snap.exists()) await db.ref(path).update({ name: newName, username: newUsername });
        } catch(e) {}
    }
    const categories = ['standard', 'chars', 'quiz', 'pingpong'];
    for (const cat of categories) {
        try {
            const catSnap = await db.ref(`leaderboard/${cat}`).once('value');
            if (catSnap.exists()) {
                catSnap.forEach(subNode => {
                    if (subNode.hasChild(userId)) {
                        subNode.child(userId).ref.update({ name: newName, username: newUsername });
                    }
                });
            }
        } catch(e) {}
    }
};
