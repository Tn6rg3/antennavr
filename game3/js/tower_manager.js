// js/tower_manager.js - Motore della Modalità "LA TORRE: OLTRE L'ETERE"

window.towerState = {
    active: false,
    floor: 1,
    sector: 1,
    stability: 100,
    wordsSolved: 0,
    currentWords: [],
    wordIndex: 0,
    wpm: 12,

    // Missione TX (Tasto)
    txMode: false,
    txTarget: "",
    txCurrent: "",
    txSequence: [],
    txLastTime: 0,
    txTimeout: null,

    // Audio DSP
    qrnLevel: 0, // Rumore bianco
    qsbDepth: 0, // Fading (LFO)
    qrmActive: false,

    // UI & Rendering
    oscCanvas: null,
    oscCtx: null,
    climbCanvas: null,
    climbCtx: null,
    animationId: null,

    // Social
    nearbyPlayers: [], // { uid, alias, floor }

    // Inventory
    gadget1: 0, // Filtro DSP
    gadget2: 0, // Amplificatore
    valvole: 0,

    // Audio Nodes
    noiseNode: null,
    noiseGain: null
};

window.TOWER_LORE = [
    "Sintonizzazione... Segnale debole rilevato dalla base della torre.",
    "Frammento 01: '...abbiamo trovato l'ingresso, ma l'aria è pesante qui sotto...'",
    "Frammento 02: '...i ripetitori del Settore 1 sono ancora attivi. Qualcuno ci ascolta?'",
    "Frammento 03: COORDINATE RILEVATE: 45.12N, 12.45E. Messaggio interrotto.",
    "Frammento 04: '...non siamo soli. Le frequenze sono sature di echi del passato...'",
    "Frammento 05: '...la stabilità cala mentre saliamo. La torre sembra reagire alla nostra presenza...'",
    "Frammento 06: AVVISO: Il prossimo ripetitore richiede una sintonizzazione manuale (TX).",
    "Frammento 07: '...abbiamo visto le ombre di altri operatori. Non siamo i primi a provare...'",
    "Frammento 08: '...il rumore di fondo aumenta. Il segnale è quasi sepolto dallo statico...'",
    "Frammento 09: SOS EMERGENCY: ...visto fumo dal decimo piano... inviate soccorsi..."
];

window.initTowerManager = function() {
    console.log("Tower: Initializing components...");

    window.towerState.oscCanvas = document.getElementById('towerOscilloscope');
    if (window.towerState.oscCanvas) {
        window.towerState.oscCanvas.width = window.towerState.oscCanvas.clientWidth;
        window.towerState.oscCanvas.height = window.towerState.oscCanvas.clientHeight;
        window.towerState.oscCtx = window.towerState.oscCanvas.getContext('2d');
    }

    window.towerState.climbCanvas = document.getElementById('towerClimbCanvas');
    if (window.towerState.climbCanvas) {
        window.towerState.climbCanvas.width = window.towerState.climbCanvas.clientWidth;
        window.towerState.climbCanvas.height = window.towerState.climbCanvas.clientHeight;
        window.towerState.climbCtx = window.towerState.climbCanvas.getContext('2d');
    }

    // Input Listener (Live Reveal)
    const input = document.getElementById('towerInput');
    if (input) {
        input.oninput = () => {
            if (!window.towerState.active) return;
            const typed = input.value.trim().toUpperCase();
            const target = window.towerState.currentWords[window.towerState.wordIndex];
            if (target) {
                // Rivelazione parziale dei caratteri
                for (let i = 0; i < target.length; i++) {
                    const el = document.getElementById('tower_char_' + i);
                    if (el) {
                        if (typed[i] === target[i]) {
                            el.textContent = target[i];
                            el.classList.add('active');
                            el.classList.remove('error');
                        } else if (typed[i] !== undefined) {
                            el.classList.add('error');
                        } else {
                            el.textContent = '•';
                            el.classList.remove('active', 'error');
                        }
                    }
                }

                if (typed === target) {
                    window.checkTowerWord(typed);
                    input.value = "";
                }
            }
        };
    }

    // Bottoni Gadget
    document.getElementById('btnTowerGadget1')?.addEventListener('click', () => window.useTowerGadget(1));
    document.getElementById('btnTowerGadget2')?.addEventListener('click', () => window.useTowerGadget(2));
    document.getElementById('btnTowerSOS')?.addEventListener('click', () => window.useTowerSOS());
    document.getElementById('quitTowerBtn')?.addEventListener('click', () => window.quitTowerClimb());

    // Tasto Virtuale (Boss)
    const vKey = document.getElementById('towerVirtualKey');
    if (vKey) {
        vKey.addEventListener('mousedown', () => window.handleTowerKey(true));
        vKey.addEventListener('mouseup', () => window.handleTowerKey(false));
        vKey.addEventListener('touchstart', (e) => { e.preventDefault(); window.handleTowerKey(true); });
        vKey.addEventListener('touchend', (e) => { e.preventDefault(); window.handleTowerKey(false); });
    }
};

window.startTowerSequence = function() {
    console.log("Tower: Starting climb...");
    window.resetGameState();

    window.towerState.active = true;
    gameRunning = true;
    currentMode = 'la_torre';

    // Caricamento Checkpoint (Mockup per ora, poi Firebase)
    window.towerState.floor = 1;
    window.towerState.stability = 100;
    window.towerState.wpm = 12;

    showScreen('towerArea');
    window.initTowerManager();
    window.renderTowerUI();

    // Inizializzazione Audio Noise
    window.initTowerAudio();

    // Avvio loop grafico
    if (window.towerState.animationId) cancelAnimationFrame(window.towerState.animationId);
    window.towerState.animationId = requestAnimationFrame(window.towerRenderLoop);

    // Inizio primo piano
    setTimeout(window.generateTowerFloor, 1000);
    window.fetchNearbyPlayers();
};

window.initTowerAudio = function() {
    if (!window.audioCtx) window.resumeAudioContext();
    const ctx = window.audioCtx;
    if (!ctx) return;

    // Generatore Rumore Bianco (QRN)
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    window.towerState.noiseNode = ctx.createBufferSource();
    window.towerState.noiseNode.buffer = noiseBuffer;
    window.towerState.noiseNode.loop = true;

    window.towerState.noiseGain = ctx.createGain();
    window.towerState.noiseGain.gain.value = 0; // Parte muto

    window.towerState.noiseNode.connect(window.towerState.noiseGain);
    window.towerState.noiseGain.connect(ctx.destination);
    window.towerState.noiseNode.start();
};

window.generateTowerFloor = function() {
    if (!window.towerState.active) return;

    const floor = window.towerState.floor;
    const isBoss = (floor % 10 === 0);

    window.towerState.wordsSolved = 0;

    if (isBoss) {
        window.startTowerBossFight();
    } else {
        // Modalità RX (Standard)
        window.towerState.txMode = false;
        document.getElementById('towerInputArea').style.display = 'flex';
        document.getElementById('towerBossControls').style.display = 'none';

        // Generazione parole basata sul piano
        const numWords = 3;
        window.towerState.currentWords = window.getGameWords(numWords, 'standard');
        window.towerState.wordIndex = 0;

        const lore = window.TOWER_LORE[((floor-1) % 10)] || "Segnale perso nell'etere...";
        document.getElementById('towerLoreText').textContent = lore;

        window.playNextTowerWord();
    }

    window.updateTowerDifficulty();
};

window.playMorseWithDisturbance = function(text) {
    const state = window.towerState;
    if (!state.active) return;

    const wpm = state.wpm;
    // Implementazione QSB (Fading) tramite modulazione dinamica del guadagno se supportato,
    // altrimenti usiamo il sidetone standard.
    if (typeof playMorseAudio === 'function') {
        playMorseAudio(text, wpm, true); // forcePlay = true per la torre
    }

    // Mostriamo i puntini nel nastro (effetto caricamento)
    const tape = document.getElementById('towerTapeContent');
    if (tape) {
        tape.innerHTML = '';
        for (let i = 0; i < text.length; i++) {
            const span = document.createElement('span');
            span.className = 'tower-character';
            span.textContent = '•';
            span.id = 'tower_char_' + i;
            tape.appendChild(span);
        }
    }
};

window.playNextTowerWord = function() {
    if (!window.towerState.active) return;
    const word = window.towerState.currentWords[window.towerState.wordIndex];
    if (word) {
        // Se siamo in un piano standard, resettiamo l'input UI
        const input = document.getElementById('towerInput');
        if (input) {
            input.value = "";
            input.focus();
        }
        window.playMorseWithDisturbance(word);
    }
};

window.checkTowerWord = function(typed) {
    if (!window.towerState.active) return;
    const target = window.towerState.currentWords[window.towerState.wordIndex];

    if (typed === target) {
        window.towerState.wordsSolved++;
        window.towerState.wordIndex++;
        if (typeof playBeep === 'function') playBeep(880, 0.1);

        if (window.towerState.wordsSolved >= 3) {
            window.advanceTowerFloor();
        } else {
            setTimeout(window.playNextTowerWord, 800);
        }
    } else {
        // Se arriviamo qui tramite un tasto INVIO o altro metodo di sottomissione
        window.damageTowerStability(10);
        if (typeof playBeep === 'function') playBeep(200, 0.3);
        window.triggerTowerGlitch();
        setTimeout(window.playNextTowerWord, 800);
    }
    window.renderTowerUI();
};

window.advanceTowerFloor = function() {
    window.towerState.floor++;

    // Salvataggio record in classifica
    if (db && myId) {
        const rpgLevel = window.userProgression?.level || 1;
        db.ref(`leaderboard/la_torre/all/${myId}`).transaction(current => {
            // Per la torre, il punteggio è il piano massimo raggiunto
            if (!current || window.towerState.floor > (current.score || 0)) {
                return {
                    name: myName,
                    username: myPrivacy ? "" : tgUsername,
                    score: window.towerState.floor,
                    wpm: window.towerState.wpm,
                    level: rpgLevel,
                    date: new Date().toLocaleDateString('it-IT'),
                    ts: firebase.database.ServerValue.TIMESTAMP
                };
            }
            if (current && rpgLevel > (current.level || 0)) current.level = rpgLevel;
            return current;
        });
    }

    const overlay = document.getElementById('towerLevelOverlay');
    const num = document.getElementById('towerLevelNumber');
    if (overlay && num) {
        num.textContent = window.towerState.floor;
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.style.display = 'none';
            window.generateTowerFloor();
            window.fetchNearbyPlayers();
        }, 2000);
    }

    // Aggiornamento WPM
    if (window.towerState.floor % 5 === 0) window.towerState.wpm += 1;

    // Premio Valvole
    window.towerState.valvole += 5;
};

window.damageTowerStability = function(amount) {
    window.towerState.stability -= amount;
    if (window.towerState.stability <= 0) {
        window.towerState.stability = 0;
        window.gameOverTower();
    }
};

window.triggerTowerGlitch = function() {
    const area = document.getElementById('towerArea');
    const overlay = document.getElementById('towerGlitchOverlay');
    if (area) area.classList.add('glitch-shake');
    if (overlay) overlay.style.display = 'block';

    setTimeout(() => {
        if (area) area.classList.remove('glitch-shake');
        if (overlay) overlay.style.display = 'none';
    }, 500);
};

window.towerRenderLoop = function(timestamp) {
    if (!window.towerState.active) return;

    window.renderTowerOscilloscope();
    window.renderTowerClimbBar();

    window.towerState.animationId = requestAnimationFrame(window.towerRenderLoop);
};

window.renderTowerOscilloscope = function() {
    const canvas = window.towerState.oscCanvas;
    const ctx = window.towerState.oscCtx;
    if (!canvas || !ctx) return;

    // Effetto scia (trail) per look radar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#00ff41';

    const midY = canvas.height / 2;
    const time = performance.now() * 0.005;

    for (let x = 0; x < canvas.width; x += 2) {
        const stabilityFactor = window.towerState.stability / 100;
        // Rumore visivo basato sulla stabilità
        const noise = (Math.random() - 0.5) * (1 - stabilityFactor) * 30;
        // Onda sinusoidale complessa (somma di due frequenze)
        const wave = Math.sin(x * 0.05 + time) * 15 + Math.sin(x * 0.02 - time * 0.5) * 5;
        const y = midY + (wave * stabilityFactor) + noise;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
};

window.renderTowerClimbBar = function() {
    const canvas = window.towerState.climbCanvas;
    const ctx = window.towerState.climbCtx;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Disegno asse torre
    ctx.strokeStyle = 'rgba(0,255,65,0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    // Disegno mia posizione (Icona centrale)
    const myY = canvas.height * 0.8;
    ctx.fillStyle = '#00ff41';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, myY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ff41';
    ctx.stroke();

    // Disegno altri giocatori (Prossimità)
    window.towerState.nearbyPlayers.forEach(p => {
        const diff = p.floor - window.towerState.floor;
        const otherY = myY - (diff * 20); // Scala: 20px per piano
        if (otherY > 0 && otherY < canvas.height) {
            ctx.fillStyle = p.isFriend ? '#3390ec' : 'rgba(0,255,65,0.5)';
            ctx.beginPath();
            ctx.arc(canvas.width / 2, otherY, 4, 0, Math.PI * 2);
            ctx.fill();
            // Nome piccolo
            ctx.font = '8px Arial';
            ctx.fillText(p.alias.substring(0, 5), canvas.width / 2 + 8, otherY + 3);
        }
    });
};

window.fetchNearbyPlayers = function() {
    if (!db || !myId) return;
    // Fetch asincrono da Firebase (Mockup per ora con dati casuali)
    window.towerState.nearbyPlayers = [
        { alias: "Mario", floor: window.towerState.floor + 2, isFriend: true },
        { alias: "Simo", floor: window.towerState.floor - 1, isFriend: false }
    ];
};

window.renderTowerUI = function() {
    document.getElementById('towerFloorDisplay').textContent = "PIANO: " + window.towerState.floor;
    document.getElementById('towerStabilityDisplay').textContent = "STABILITÀ: " + window.towerState.stability + "%";
    document.getElementById('towerStabilityDisplay').style.color = window.towerState.stability < 30 ? "#ff3d00" : "#00ff41";
};

window.updateTowerDifficulty = function() {
    const floor = window.towerState.floor;
    // Logica DSP disturbi
    if (floor > 10) window.towerState.qrnLevel = Math.min(0.05, (floor - 10) * 0.005);
    if (floor > 20) window.towerState.qsbDepth = 0.5;

    // Applichiamo il rumore al guadagno audio
    if (window.towerState.noiseGain) {
        window.towerState.noiseGain.gain.setTargetAtTime(window.towerState.qrnLevel, window.audioCtx.currentTime, 0.5);
    }
};

window.useTowerGadget = function(id) {
    showToast("Gadget " + id + " attivato!");
    // Logica temporanea DSP
};

window.useTowerSOS = function() {
    if (confirm("Usare SOS per dimezzare velocità?")) {
        window.towerState.wpm = Math.max(5, Math.round(window.towerState.wpm / 2));
        window.renderTowerUI();
    }
};

window.startTowerBossFight = function() {
    console.log("Tower: BOSS FLOOR reached!");
    window.towerState.txMode = true;
    window.towerState.txTarget = "SOS";
    window.towerState.txCurrent = "";

    document.getElementById('towerInputArea').style.display = 'none';
    document.getElementById('towerBossControls').style.display = 'flex';
    document.getElementById('towerTxPrompt').textContent = "RIPRISTINA SEGNALE - TRASMETTI:";
    document.getElementById('towerTxTarget').textContent = "[" + window.towerState.txTarget + "]";
    document.getElementById('towerTxCurrent').textContent = "";

    document.getElementById('towerLoreText').textContent = "--- EMERGENZA --- SETTORE INSTABILE ---";
};

window.handleTowerKey = function(isDown) {
    if (!window.towerState.active) return;
    const now = Date.now();

    if (isDown) {
        if (typeof startTone === 'function') startTone(600);

        if (window.towerState.txLastTime > 0) {
            const gap = now - window.towerState.txLastTime;
            const unit = 1200 / window.towerState.wpm;
            if (gap > unit * 2) {
                window.finalizeTowerTxChar();
            }
        }
        window.towerState.txLastTime = now;
    } else {
        if (typeof stopTone === 'function') stopTone();

        const duration = now - window.towerState.txLastTime;
        const unit = 1200 / window.towerState.wpm;

        const symbol = (duration > unit * 1.8) ? "-" : ".";
        window.towerState.txSequence.push(symbol);
        window.towerState.txLastTime = now;

        document.getElementById('towerTxCurrent').textContent = window.towerState.txCurrent + " " + window.towerState.txSequence.join("");

        if (window.towerState.txTimeout) clearTimeout(window.towerState.txTimeout);
        window.towerState.txTimeout = setTimeout(() => {
            if (window.towerState.active && window.towerState.txMode) {
                window.finalizeTowerTxChar();
            }
        }, unit * 3);
    }
};

window.finalizeTowerTxChar = function() {
    if (window.towerState.txSequence.length === 0) return;

    const code = window.towerState.txSequence.join("");
    window.towerState.txSequence = [];

    let foundChar = "";
    for (let char in window.morseDict) {
        if (window.morseDict[char] === code) { foundChar = char; break; }
    }

    window.towerState.txCurrent += (foundChar || "?");
    document.getElementById('towerTxCurrent').textContent = window.towerState.txCurrent;

    if (window.towerState.txCurrent === window.towerState.txTarget) {
        if (typeof playBeep === 'function') playBeep(1200, 0.2);
        showToast("✅ TRASMISSIONE COMPLETATA!");
        setTimeout(() => {
            if (window.towerState.active) window.advanceTowerFloor();
        }, 1000);
    } else if (!window.towerState.txTarget.startsWith(window.towerState.txCurrent)) {
        if (typeof playBeep === 'function') playBeep(200, 0.4);
        window.damageTowerStability(10);
        window.triggerTowerGlitch();
        window.towerState.txCurrent = "";
        document.getElementById('towerTxCurrent').textContent = "";
    }
};

window.gameOverTower = function() {
    window.towerState.active = false;
    alert("COMUNICAZIONE INTERROTTA! Sei arrivato al piano " + window.towerState.floor);
    window.quitTowerClimb();
};

window.stopTowerClimb = function() {
    console.log("Tower: Cleaning up resources...");
    window.towerState.active = false;
    gameRunning = false;

    if (window.towerState.noiseNode) {
        try {
            window.towerState.noiseNode.stop();
            window.towerState.noiseNode.disconnect();
        } catch(e) {}
        window.towerState.noiseNode = null;
    }

    if (window.towerState.animationId) {
        cancelAnimationFrame(window.towerState.animationId);
        window.towerState.animationId = null;
    }

    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
};

window.quitTowerClimb = function() {
    window.stopTowerClimb();
    goBackToMenu();
};
