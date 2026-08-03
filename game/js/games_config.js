// js/games_config.js

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
            return dicts.master.sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
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
            return dicts.master.sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
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
            for(let j=0; j<num; j++) {
                let callsign = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(Math.random() * 10);
                let suffixLen = (Math.random() > 0.9) ? 1 : (Math.random() > 0.7) ? 2 : 3;
                for(let i = 0; i < suffixLen; i++) callsign += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
                if (Math.random() > 0.90) callsign += ["/QRP", "/P", "/M", "/AM", "/MM"][Math.floor(Math.random() * 5)];
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
            return []; // In Ping Pong le parole vengono scelte dai giocatori
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
            return []; // Generato separatamente dalla logica quiz
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
            if (dicts.custom.length > 0) {
                return [...dicts.custom].sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
            }
            return [];
        }
    }
};

// Logica globale calcolo punti (isolata qui per pulire app.js)
window.calculateGamePoints = function(currentMode, currentWord, userWord, wpm, reactionMs, levDist, usedReplay) {
    let points = 0, scoreColor = "";
    
    if (currentMode === 'chars') {
        if (userWord === currentWord) { 
            points = Math.max(100, Math.floor(1000 - (reactionMs / 2))); 
            scoreColor = "#4caf50"; 
        } else { 
            points = 0; 
            scoreColor = "#d32f2f"; 
        }
    } else {
        const basePoints = (Math.pow(wpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2)); 
        const estimatedAudioMs = (currentWord.length * 60 / wpm) * 1000; 
        let timeMultiplier = 1.0;
        
        if (reactionMs > (estimatedAudioMs + 2000)) {
            timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000)); 
        } else if (reactionMs < estimatedAudioMs && levDist === 0) {
            timeMultiplier = 1.1;
        }
        
        points = Math.round(basePoints * timeMultiplier); 
        
        if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50"; 
        else if (levDist === 1) scoreColor = "#ff9800"; 
        else scoreColor = "#d32f2f"; 
        
        if (usedReplay) points = Math.round(points * 0.2);
    }
    
    return { points, scoreColor };
};
