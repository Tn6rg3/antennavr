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
    isDspActive: false, // Gadget 1
    isAmpActive: false, // Gadget 2

    // UI & Rendering
    oscCanvas: null,
    oscCtx: null,
    climbCanvas: null,
    climbCtx: null,
    animationId: null,

    // Social
    nearbyPlayers: [], // { uid, alias, floor }

    // Inventory (Valori iniziali)
    gadget1: 3, // Filtri DSP
    gadget2: 2, // Amplificatori
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

    // Input Listener con Live Reveal
    const input = document.getElementById('towerInput');
    if (input) {
        input.oninput = () => {
            if (!window.towerState.active || window.towerState.txMode) return;
            const typed = input.value.trim().toUpperCase();
            const target = window.towerState.currentWords[window.towerState.wordIndex];
            if (target) {
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
        // Gestione INVIO per forzare sottomissione (in caso di errore)
        input.onkeypress = (e) => {
            if (e.key === 'Enter') {
                window.checkTowerWord(input.value.trim().toUpperCase());
                input.value = "";
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
        vKey.onmousedown = () => window.handleTowerKey(true);
        vKey.onmouseup = () => window.handleTowerKey(false);
        vKey.ontouchstart = (e) => { e.preventDefault(); window.handleTowerKey(true); };
        vKey.ontouchend = (e) => { e.preventDefault(); window.handleTowerKey(false); };
    }
};

window.startTowerSequence = function() {
    console.log("Tower: Starting climb...");
    window.resetGameState();

    window.towerState.active = true;
    gameRunning = true;
    currentMode = 'la_torre';

    // Reset stato sessione
    window.towerState.floor = 1;
    window.towerState.stability = 100;
    window.towerState.wpm = 12;
    window.towerState.gadget1 = 3;
    window.towerState.gadget2 = 2;

    showScreen('towerArea');
    window.initTowerManager();
    window.renderTowerUI();
    window.initTowerAudio();

    if (window.towerState.animationId) cancelAnimationFrame(window.towerState.animationId);
    window.towerState.animationId = requestAnimationFrame(window.towerRenderLoop);

    setTimeout(window.generateTowerFloor, 1000);
    window.fetchNearbyPlayers();
};

window.initTowerAudio = function() {
    if (!window.audioCtx) window.resumeAudioContext();
    const ctx = window.audioCtx;
    if (!ctx) return;

    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    window.towerState.noiseNode = ctx.createBufferSource();
    window.towerState.noiseNode.buffer = noiseBuffer;
    window.towerState.noiseNode.loop = true;
    window.towerState.noiseGain = ctx.createGain();
    window.towerState.noiseGain.gain.value = 0;

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
        window.towerState.txMode = false;
        document.getElementById('towerInputArea').style.display = 'flex';
        document.getElementById('towerBossControls').style.display = 'none';

        window.towerState.currentWords = window.getGameWords(3, 'standard');
        window.towerState.wordIndex = 0;

        const lore = window.TOWER_LORE[((floor-1) % 10)] || "Segnale perso nell'etere...";
        document.getElementById('towerLoreText').textContent = lore;

        window.playNextTowerWord();
    }
    window.updateTowerDifficulty();
};

window.playNextTowerWord = function() {
    if (!window.towerState.active) return;
    const word = window.towerState.currentWords[window.towerState.wordIndex];
    if (word) {
        const input = document.getElementById('towerInput');
        if (input) { input.value = ""; input.focus(); }
        window.playMorseWithDisturbance(word);
    }
};

window.playMorseWithDisturbance = function(text) {
    if (!window.towerState.active) return;

    // In modalità Torre, forziamo il volume a fluttuare se QSB è attivo
    // (Nota: implementazione semplificata, usiamo playMorseAudio standard)
    if (typeof playMorseAudio === 'function') {
        playMorseAudio(text, window.towerState.wpm, true);
    }

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

window.checkTowerWord = function(typed) {
    if (!window.towerState.active) return;
    const target = window.towerState.currentWords[window.towerState.wordIndex];

    if (typed === target) {
        window.towerState.wordsSolved++;
        window.towerState.wordIndex++;
        if (typeof playBeep === 'function') playBeep(880, 0.1);
        if (window.towerState.wordsSolved >= 3) window.advanceTowerFloor();
        else setTimeout(window.playNextTowerWord, 600);
    } else {
        // ERRORE: Sottragga vita e rigenera parola per evitare blocchi
        window.damageTowerStability(12);
        if (typeof playBeep === 'function') playBeep(200, 0.3);
        window.triggerTowerGlitch();

        // Saltiamo la parola per non bloccare il giocatore
        window.towerState.wordIndex++;
        if (window.towerState.wordIndex >= window.towerState.currentWords.length) {
            if (window.towerState.wordsSolved > 0) window.advanceTowerFloor();
            else window.generateTowerFloor();
        } else {
            setTimeout(window.playNextTowerWord, 800);
        }
    }
    window.renderTowerUI();
};

window.advanceTowerFloor = function() {
    window.towerState.floor++;

    if (db && myId) {
        const rpgLevel = window.userProgression?.level || 1;
        db.ref(`leaderboard/la_torre/all/${myId}`).set({
            name: myName, score: window.towerState.floor, wpm: window.towerState.wpm,
            level: rpgLevel, date: new Date().toLocaleDateString('it-IT'), ts: firebase.database.ServerValue.TIMESTAMP
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
        }, 1500);
    }

    if (window.towerState.floor % 5 === 0) window.towerState.wpm += 1;
    window.towerState.valvole += 5;
    // Recupero parziale stabilità ogni piano
    window.towerState.stability = Math.min(100, window.towerState.stability + 10);
};

window.damageTowerStability = function(amount) {
    // Se l'amplificatore è attivo, i danni sono dimezzati
    if (window.towerState.isAmpActive) amount = Math.floor(amount / 2);
    window.towerState.stability -= amount;
    if (window.towerState.stability <= 0) {
        window.towerState.stability = 0;
        window.gameOverTower();
    }
};

window.useTowerGadget = function(id) {
    const state = window.towerState;
    if (id === 1 && state.gadget1 > 0 && !state.isDspActive) {
        state.gadget1--;
        state.isDspActive = true;
        showToast("🛡️ FILTRO DSP ATTIVATO (20s)");
        const oldQrn = state.qrnLevel;
        state.qrnLevel = 0;
        window.updateTowerDifficulty();
        setTimeout(() => {
            state.isDspActive = false;
            state.qrnLevel = oldQrn;
            window.updateTowerDifficulty();
            showToast("⚠️ Filtro DSP Esaurito");
        }, 20000);
    } else if (id === 2 && state.gadget2 > 0 && !state.isAmpActive) {
        state.gadget2--;
        state.isAmpActive = true;
        showToast("🚀 AMPLIFICATORE ATTIVO (20s)");
        setTimeout(() => {
            state.isAmpActive = false;
            showToast("⚠️ Amplificatore Esaurito");
        }, 20000);
    } else if (state[`gadget${id}`] <= 0) {
        showToast("❌ Gadget esauriti!");
    }
    window.renderTowerUI();
};

window.useTowerSOS = function() {
    if (confirm("Usare SOS per dimezzare velocità in questo piano?")) {
        window.towerState.wpm = Math.max(8, Math.round(window.towerState.wpm / 1.5));
        window.renderTowerUI();
        stopAllMorseAudio();
        window.playNextTowerWord();
    }
};

window.startTowerBossFight = function() {
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
    if (!window.towerState.active || !window.towerState.txMode) return;
    const now = Date.now();
    if (isDown) {
        if (typeof startTone === 'function') startTone(600);
        if (window.towerState.txLastTime > 0 && (now - window.towerState.txLastTime) > (1200/window.towerState.wpm)*2) {
            window.finalizeTowerTxChar();
        }
        window.towerState.txLastTime = now;
    } else {
        if (typeof stopTone === 'function') stopTone();
        const dur = now - window.towerState.txLastTime;
        const unit = 1200 / window.towerState.wpm;
        window.towerState.txSequence.push(dur > unit * 1.8 ? "-" : ".");
        window.towerState.txLastTime = now;
        document.getElementById('towerTxCurrent').textContent = window.towerState.txCurrent + " " + window.towerState.txSequence.join("");
        if (window.towerState.txTimeout) clearTimeout(window.towerState.txTimeout);
        window.towerState.txTimeout = setTimeout(() => { if (window.towerState.txMode) window.finalizeTowerTxChar(); }, unit * 3);
    }
};

window.finalizeTowerTxChar = function() {
    if (window.towerState.txSequence.length === 0) return;
    const code = window.towerState.txSequence.join("");
    window.towerState.txSequence = [];
    let found = "?";
    for (let c in window.morseDict) { if (window.morseDict[c] === code) { found = c; break; } }
    window.towerState.txCurrent += found;
    document.getElementById('towerTxCurrent').textContent = window.towerState.txCurrent;
    if (window.towerState.txCurrent === window.towerState.txTarget) {
        showToast("✅ TRASMISSIONE OK!");
        setTimeout(() => window.advanceTowerFloor(), 1000);
    } else if (!window.towerState.txTarget.startsWith(window.towerState.txCurrent)) {
        window.damageTowerStability(10); window.triggerTowerGlitch();
        window.towerState.txCurrent = "";
    }
};

window.renderTowerUI = function() {
    document.getElementById('towerFloorDisplay').textContent = "PIANO: " + window.towerState.floor;
    document.getElementById('towerStabilityDisplay').textContent = "STABILITÀ: " + window.towerState.stability + "%";
    document.getElementById('towerStabilityDisplay').style.color = window.towerState.stability < 30 ? "#ff3d00" : "#00ff41";
    document.getElementById('btnTowerGadget1').textContent = `FILTRO DSP (${window.towerState.gadget1})`;
    document.getElementById('btnTowerGadget2').textContent = `AMPLIFICA (${window.towerState.gadget2})`;
};

window.fetchNearbyPlayers = function() {
    if (!db) return;
    db.ref('leaderboard/la_torre/all').limitToLast(20).once('value', snap => {
        const players = [];
        snap.forEach(c => { if(c.key !== myId) players.push({ alias: c.val().name, floor: c.val().score }); });
        window.towerState.nearbyPlayers = players;
    });
};

window.renderTowerClimbBar = function() {
    const canvas = window.towerState.climbCanvas;
    const ctx = window.towerState.climbCtx;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const myY = canvas.height * 0.7;
    ctx.strokeStyle = 'rgba(0,255,65,0.2)'; ctx.lineWidth = 2;
    for(let i=0; i<10; i++) {
        let y = (canvas.height / 10) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.fillStyle = '#00ff41'; ctx.beginPath(); ctx.arc(canvas.width/2, myY, 6, 0, Math.PI*2); ctx.fill();
    window.towerState.nearbyPlayers.forEach(p => {
        const diff = p.floor - window.towerState.floor;
        const otherY = myY - (diff * 30);
        if (otherY > 0 && otherY < canvas.height) {
            ctx.fillStyle = 'rgba(0,255,65,0.5)'; ctx.beginPath(); ctx.arc(canvas.width/2, otherY, 4, 0, Math.PI*2); ctx.fill();
            ctx.font = '9px monospace'; ctx.fillText(p.alias.substring(0,4), 5, otherY + 3);
        }
    });
};

window.towerRenderLoop = function() {
    if (!window.towerState.active) return;
    window.renderTowerOscilloscope();
    window.renderTowerClimbBar();
    window.towerState.animationId = requestAnimationFrame(window.towerRenderLoop);
};

window.renderTowerOscilloscope = function() {
    const canvas = window.towerState.oscCanvas;
    const ctx = window.towerState.oscCtx;
    if (!canvas || !ctx) return;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#00ff41'; ctx.lineWidth = 2;
    const midY = canvas.height / 2;
    const time = performance.now() * 0.005;
    for (let x = 0; x < canvas.width; x += 2) {
        const sf = window.towerState.stability / 100;
        const noise = (Math.random() - 0.5) * (1 - sf) * 30;
        const y = midY + (Math.sin(x * 0.05 + time) * 15 * sf) + noise;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
};

window.updateTowerDifficulty = function() {
    const floor = window.towerState.floor;
    if (!window.towerState.isDspActive) {
        window.towerState.qrnLevel = floor > 10 ? Math.min(0.08, (floor - 10) * 0.005) : 0;
    }
    if (window.towerState.noiseGain) {
        window.towerState.noiseGain.gain.setTargetAtTime(window.towerState.qrnLevel, window.audioCtx.currentTime, 0.5);
    }
};

window.triggerTowerGlitch = function() {
    const area = document.getElementById('towerArea');
    const overlay = document.getElementById('towerGlitchOverlay');
    if (area) area.classList.add('glitch-shake');
    if (overlay) overlay.style.display = 'block';
    setTimeout(() => { if (area) area.classList.remove('glitch-shake'); if (overlay) overlay.style.display = 'none'; }, 400);
};

window.gameOverTower = function() {
    window.towerState.active = false;
    alert("COMUNICAZIONE INTERROTTA AL PIANO " + window.towerState.floor);
    window.quitTowerClimb();
};

window.stopTowerClimb = function() {
    window.towerState.active = false;
    if (window.towerState.noiseNode) {
        try { window.towerState.noiseNode.stop(); window.towerState.noiseNode.disconnect(); } catch(e) {}
        window.towerState.noiseNode = null;
    }
    if (window.towerState.animationId) cancelAnimationFrame(window.towerState.animationId);
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
};

window.quitTowerClimb = function() {
    window.stopTowerClimb();
    goBackToMenu();
};
