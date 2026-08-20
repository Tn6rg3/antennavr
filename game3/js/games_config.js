// js/games_config.js

// --- ALGORITMO SHUFFLE ROBUSTO (FISHER-YATES) ---
function fisherYatesShuffle(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

window.GAME_MODES = {
    "standard": {
        id: "standard",
        titleIt: "Parole Comuni",
        titleEn: "Common Words",
        icon: "🔤",
        defaultWpm: 20,
        defaultWordCount: 10,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: true,
        spacingConfigurable: true,
        generateWords: function(num, dicts) {
            const master = (dicts && Array.isArray(dicts.master) && dicts.master.length > 0)
                ? dicts.master
                : ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA"];
            return fisherYatesShuffle(master).slice(0, num).map(w => String(w).toUpperCase());
        }
    },
    "perfection": {
        id: "perfection",
        titleIt: "Perfezione (Zero Errori)",
        titleEn: "Perfection (Zero Errors)",
        icon: "🎯",
        defaultWpm: 20,
        defaultWordCount: 20,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: false,
        spacingConfigurable: true,
        generateWords: function(num, dicts) {
            const master = (dicts && Array.isArray(dicts.master) && dicts.master.length > 0)
                ? dicts.master
                : ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA"];
            return fisherYatesShuffle(master).slice(0, num).map(w => String(w).toUpperCase());
        }
    },
    "conquest": {
        id: "conquest",
        titleIt: "Conquista (Tiro alla Fune)",
        titleEn: "Conquest (Tug of War)",
        icon: "⚔️",
        defaultWpm: 20,
        defaultWordCount: 50,
        wpmConfigurable: true,
        wordCountConfigurable: false,
        fixedSpeedAllowed: false,
        spacingConfigurable: true,
        generateWords: function(num, dicts) {
            const master = (dicts && Array.isArray(dicts.master) && dicts.master.length > 0) 
                ? dicts.master 
                : ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA"];
            return fisherYatesShuffle(master).slice(0, num).map(w => String(w).toUpperCase());
        }
    },
    "callsign": {
        id: "callsign",
        titleIt: "Nominativi (CW Freak)",
        titleEn: "Callsigns (CW Freak)",
        icon: "🎙️",
        defaultWpm: 25,
        defaultWordCount: 25,
        wpmConfigurable: false,
        wordCountConfigurable: false,
        fixedSpeedAllowed: false,
        spacingConfigurable: false,
        generateWords: function(num, dicts) {
            const prefixes = ["I", "IK", "IZ", "IN", "IT", "IS", "IU", "IW", "W", "K", "N", "A", "WA", "WB", "DL", "DJ", "DK", "DO", "EA", "EB", "EC", "F", "G", "M", "GW", "GM", "9A", "S5", "OK", "OM", "SP", "SQ", "UA", "UR", "EW", "ER", "YO", "YU", "HA", "LZ", "OE", "HB", "PA", "PB", "ON", "VE", "VK", "ZL", "JA", "PY", "LU", "CX"];
            let words = [];
            for (let j = 0; j < num; j++) {
                let callsign = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(Math.random() * 10);
                let suffixLen = (Math.random() > 0.9) ? 1 : (Math.random() > 0.7) ? 2 : 3;
                for (let i = 0; i < suffixLen; i++) {
                    callsign += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
                }
                if (Math.random() > 0.90) {
                    callsign += ["/QRP", "/P", "/M", "/AM", "/MM"][Math.floor(Math.random() * 5)];
                }
                words.push(callsign);
            }
            return words;
        }
    },
    "pingpong": {
        id: "pingpong",
        titleIt: "Ping Pong",
        titleEn: "Ping Pong",
        icon: "🏓",
        defaultWpm: 20,
        defaultWordCount: 10,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: false,
        spacingConfigurable: false,
        generateWords: function(num, dicts) {
            return []; // In Ping Pong le parole vengono scelte e decodificate tra i giocatori
        }
    },
    "chars": {
        id: "chars",
        titleIt: "Caratteri Singoli",
        titleEn: "Single Characters",
        icon: "⌨️",
        defaultWpm: 20,
        defaultWordCount: 20,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: false,
        spacingConfigurable: false,
        generateWords: function(num, dicts) {
            return Array.from({length: num}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]);
        }
    },
    "quiz": {
        id: "quiz",
        titleIt: "Quiz",
        titleEn: "Quiz",
        icon: "❓",
        defaultWpm: 20,
        defaultWordCount: 10,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: false,
        spacingConfigurable: true,
        generateWords: function(num, dicts) {
            return []; // Generato separatamente dalla logica del quiz
        }
    },
    "custom": {
        id: "custom",
        titleIt: "Personale",
        titleEn: "Personal",
        icon: "📖",
        defaultWpm: 20,
        defaultWordCount: 10,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: true,
        spacingConfigurable: true,
        generateWords: function(num, dicts) {
            if (dicts && Array.isArray(dicts.custom) && dicts.custom.length > 0) {
                return fisherYatesShuffle(dicts.custom).slice(0, num).map(w => String(w).toUpperCase());
            }
            return ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA"];
        }
    },
    "arcade": {
        id: "arcade",
        titleIt: "Arcade (Pioggia) 🕹️",
        titleEn: "Arcade (Rain) 🕹️",
        icon: "🕹️",
        defaultWpm: 20,
        defaultWordCount: 0, // Illimitato
        wpmConfigurable: false,
        wordCountConfigurable: false,
        fixedSpeedAllowed: false,
        spacingConfigurable: false,
        generateWords: function(num, dicts) {
            return []; // Gestito internamente da arcade_manager
        }
    },
    "groups_tx": {
        id: "groups_tx",
        titleIt: "Trasmissione Gruppi",
        titleEn: "Groups Transmission",
        icon: "📻",
        defaultWpm: 20,
        defaultWordCount: 4,
        wpmConfigurable: true,
        wordCountConfigurable: true,
        fixedSpeedAllowed: false,
        spacingConfigurable: false,
        generateWords: function(num, dicts) { return []; }
    }
};

// --- LOGICA GLOBALE E CENTRALE PER IL CALCOLO PUNTEGGI ---
window.calculateGamePoints = function(currentMode, currentWord, userWord, wpm, reactionMs, levDist, usedReplay) {
    let points = 0;
    let scoreColor = "#999999";
    
    // Guardie di sicurezza sui parametri in ingresso
    const realStr = String(currentWord || "").toUpperCase();
    const typedStr = String(userWord || "").toUpperCase();
    const safeWpm = Math.max(5, Number(wpm) || 20);
    const safeReactionMs = Math.max(0, Number(reactionMs) || 0);
    const safeLevDist = Math.max(0, Number(levDist) || 0);

    if (currentMode === 'chars') {
        if (typedStr === realStr && realStr.length > 0) { 
            points = Math.max(100, Math.floor(1000 - (safeReactionMs / 2))); 
            scoreColor = "#4caf50"; 
        } else { 
            points = 0; 
            scoreColor = "#d32f2f"; 
        }
    } else {
        const basePoints = (Math.pow(safeWpm, 2) * realStr.length) / (10 * Math.pow(safeLevDist + 1, 2)); 
        const estimatedAudioMs = (realStr.length * 60 / safeWpm) * 1000; 
        let timeMultiplier = 1.0;
        
        if (safeReactionMs > (estimatedAudioMs + 2000)) {
            timeMultiplier = Math.max(0.5, 1.0 - ((safeReactionMs - (estimatedAudioMs + 2000)) / 20000)); 
        } else if (safeReactionMs < estimatedAudioMs && safeLevDist === 0) {
            timeMultiplier = 1.1;
        }
        
        points = Math.round(basePoints * timeMultiplier); 
        
        if (safeLevDist === 0) {
            scoreColor = usedReplay ? "#999999" : "#4caf50";
        } else if (safeLevDist === 1) {
            scoreColor = "#ff9800";
        } else {
            scoreColor = "#d32f2f";
        }
        
        if (usedReplay) {
            points = 0;
        }
    }
    
    return { points, scoreColor };
};
