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
    attemptCount: 0,
    tempNoiseBoost: 0,
    isAdvancingFloor: false, // Protezione bug avanzamento

    // Missione TX (Tasto)
    txMode: false,
    txTarget: "",
    txCurrent: "",
    txSequence: [],
    txLastTime: 0,
    txTimeout: null,

    // Audio DSP
    qrnLevel: 0,
    isDspActive: false,
    isAmpActive: false,

    // UI & Rendering
    oscCanvas: null,
    oscCtx: null,
    climbCanvas: null,
    climbCtx: null,
    animationId: null,
    resizeHandler: null,
    nearbyPlayers: [],

    // Inventory
    gadget1: 3,
    gadget2: 2,
    valvole: 0,

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
    window.towerState.oscCanvas = document.getElementById('towerOscilloscope');
    window.towerState.climbCanvas = document.getElementById('towerClimbCanvas');

    if (window.towerState.resizeHandler) window.removeEventListener('resize', window.towerState.resizeHandler);

    const resizeCanvases = () => {
        const osc = window.towerState.oscCanvas;
        const clm = window.towerState.climbCanvas;
        if (osc) { osc.width = osc.clientWidth; osc.height = osc.clientHeight; window.towerState.oscCtx = osc.getContext('2d'); }
        if (clm) { clm.width = clm.clientWidth; clm.height = clm.clientHeight; window.towerState.climbCtx = clm.getContext('2d'); }
    };

    resizeCanvases();
    window.towerState.resizeHandler = resizeCanvases;
    window.addEventListener('resize', window.towerState.resizeHandler);

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
                if (typed === target) { window.checkTowerWord(typed); input.value = ""; }
            }
        };
        input.onkeypress = (e) => { if (e.key === 'Enter') { window.checkTowerWord(input.value.trim().toUpperCase()); input.value = ""; } };
    }

    const elsTower = {
        g1: document.getElementById('btnTowerGadget1'),
        g2: document.getElementById('btnTowerGadget2'),
        sos: document.getElementById('btnTowerSOS'),
        rep: document.getElementById('btnTowerReplay'),
        quit: document.getElementById('quitTowerBtn')
    };

    if (elsTower.g1) elsTower.g1.onclick = () => window.useTowerGadget(1);
    if (elsTower.g2) elsTower.g2.onclick = () => window.useTowerGadget(2);
    if (elsTower.sos) elsTower.sos.onclick = () => window.useTowerSOS();
    if (elsTower.rep) elsTower.rep.onclick = () => window.requestTowerReplay();
    if (elsTower.quit) elsTower.quit.onclick = () => window.quitTowerClimb();

    const vKey = document.getElementById('towerVirtualKey');
    if (vKey) {
        vKey.onmousedown = () => window.handleTowerKey(true);
        vKey.onmouseup = () => window.handleTowerKey(false);
        vKey.ontouchstart = (e) => { e.preventDefault(); window.handleTowerKey(true); };
        vKey.ontouchend = (e) => { e.preventDefault(); window.handleTowerKey(false); };
    }
};

window.startTowerSequence = function() {
    console.log("Tower: Starting climb sequence...");
    if (typeof window.resetGameState === 'function') window.resetGameState();

    window.towerState.active = true;
    window.gameRunning = true;
    window.currentMode = 'la_torre';

    let startFloor = 1;
    const loadProgress = () => {
        window.towerState.floor = startFloor;
        window.towerState.stability = 100;
        window.towerState.wpm = 12 + Math.floor(startFloor / 5);
        window.towerState.attemptCount = 0;
        window.towerState.tempNoiseBoost = 0;

        if (typeof window.showScreen === 'function') window.showScreen('towerArea');
        window.initTowerManager();
        window.renderTowerUI();
        window.initTowerAudio();

        if (window.towerState.animationId) cancelAnimationFrame(window.towerState.animationId);
        window.towerState.animationId = requestAnimationFrame(window.towerRenderLoop);

        setTimeout(window.generateTowerFloor, 1000);
        window.fetchNearbyPlayers();
    };

    if (window.db && window.myId) {
        window.db.ref(`users/${window.myId}/towerProgress`).once('value').then(snap => {
            if (snap.exists()) {
                startFloor = snap.val().checkpoint || 1;
                window.towerState.valvole = snap.val().valvole || 0;
                showToast(`🚀 Riprendo dal piano ${startFloor}`);
            }
            loadProgress();
        }).catch(() => loadProgress());
    } else {
        loadProgress();
    }
};

window.initTowerAudio = function() {
    if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
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
    window.towerState.attemptCount = 0;
    window.towerState.tempNoiseBoost = 0;

    if (isBoss) {
        window.startTowerBossFight();
    } else {
        window.towerState.txMode = false;
        const areaRX = document.getElementById('towerInputArea');
        const areaTX = document.getElementById('towerBossControls');
        if (areaRX) areaRX.style.display = 'flex';
        if (areaTX) areaTX.style.display = 'none';

        if (typeof window.getGameWords === 'function') {
            window.towerState.currentWords = window.getGameWords(3, 'standard');
        } else {
            window.towerState.currentWords = ["RADIO", "TORRE", "ETERE"];
        }
        window.towerState.wordIndex = 0;
        const loreEl = document.getElementById('towerLoreText');
        if (loreEl) loreEl.textContent = window.TOWER_LORE[((floor-1) % 10)] || "Segnale perso...";
        window.playNextTowerWord();
    }
    window.updateTowerDifficulty();
};

window.requestTowerReplay = function() {
    if (!window.towerState.active || window.towerState.txMode) return;
    window.towerState.attemptCount++;
    if (window.towerState.attemptCount < 3) {
        showToast(`⚠️ RIPETIZIONE (${window.towerState.attemptCount}/3)`);
        window.towerState.tempNoiseBoost += 0.05;
        window.updateTowerDifficulty();
        window.playNextTowerWord();
    } else {
        showToast("📡 SEGNALE TROPPO DISTURBATO... PROSEGUO");
        window.damageTowerStability(10);
        window.triggerTowerGlitch();
        window.towerState.attemptCount = 0;
        window.towerState.tempNoiseBoost = 0;
        window.towerState.wordIndex++;
        if (window.towerState.wordIndex >= window.towerState.currentWords.length) window.advanceTowerFloor();
        else { window.updateTowerDifficulty(); setTimeout(window.playNextTowerWord, 800); }
    }
    window.renderTowerUI();
};

window.playNextTowerWord = function() {
    if (!window.towerState.active) return;
    const word = window.towerState.currentWords[window.towerState.wordIndex];
    if (word) {
        const input = document.getElementById('towerInput');
        if (input && !window.towerState.txMode) { input.value = ""; input.focus(); }
        window.playMorseWithDisturbance(word);
    }
};

window.playMorseWithDisturbance = function(text) {
    if (!window.towerState.active) return;
    if (typeof playMorseAudio === 'function') {
        if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
        window.updateTowerDifficulty();
        setTimeout(() => { if (window.towerState.active) playMorseAudio(text, window.towerState.wpm, true); }, 50);
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
        window.towerState.attemptCount = 0;
        window.towerState.tempNoiseBoost = 0;
        if (typeof playBeep === 'function') playBeep(880, 0.1);
        if (window.towerState.wordsSolved >= 3) window.advanceTowerFloor();
        else {
            if (Math.random() < 0.25) window.startTowerSintonia();
            else setTimeout(window.playNextTowerWord, 600);
        }
    } else {
        window.towerState.attemptCount++;
        window.damageTowerStability(10);
        window.triggerTowerGlitch();
        if (window.towerState.attemptCount < 3) {
            showToast(`⚠️ ERRORE RICEZIONE (${window.towerState.attemptCount}/3)`);
            window.towerState.tempNoiseBoost += 0.05;
            window.updateTowerDifficulty();
            setTimeout(window.playNextTowerWord, 800);
        } else {
            showToast("📡 SEGNALE PERSO... PROSEGUO");
            window.towerState.attemptCount = 0;
            window.towerState.tempNoiseBoost = 0;
            window.towerState.wordIndex++;
            if (window.towerState.wordIndex >= window.towerState.currentWords.length) window.advanceTowerFloor();
            else setTimeout(window.playNextTowerWord, 800);
        }
    }
    window.renderTowerUI();
};

window.advanceTowerFloor = function() {
    if (window.towerState.isAdvancingFloor) return;
    window.towerState.isAdvancingFloor = true;

    window.towerState.floor++;
    if (window.db && window.myId) {
        window.db.ref(`leaderboard/la_torre/all/${window.myId}`).set({
            name: window.myName, score: window.towerState.floor, wpm: window.towerState.wpm,
            date: new Date().toLocaleDateString('it-IT'), ts: firebase.database.ServerValue.TIMESTAMP
        });
        const updateData = { valvole: (window.towerState.valvole || 0) + 5 };
        if (window.towerState.floor % 10 === 1) { updateData.checkpoint = window.towerState.floor; showToast("🚩 CHECKPOINT!"); }
        window.db.ref(`users/${window.myId}/towerProgress`).update(updateData);
    }
    const overlay = document.getElementById('towerLevelOverlay');
    const num = document.getElementById('towerLevelNumber');

    const nextStep = () => {
        if (overlay) overlay.style.display = 'none';
        window.towerState.isAdvancingFloor = false; // Sblocca protezione
        window.generateTowerFloor();
        window.fetchNearbyPlayers();
    };

    if (overlay && num) {
        num.textContent = window.towerState.floor;
        overlay.style.display = 'flex';
        setTimeout(nextStep, 1500);
    } else {
        nextStep();
    }

    if (window.towerState.floor % 5 === 0) window.towerState.wpm += 1;
    // Recupero parziale stabilità ogni piano (Limitato a 5 per non annullare 1 errore intero)
    window.towerState.stability = Math.min(100, window.towerState.stability + 5);
    window.renderTowerUI();
};

window.damageTowerStability = function(amount) {
    if (window.towerState.isAmpActive) amount = Math.floor(amount / 2);
    window.towerState.stability -= amount;
    if (window.towerState.stability <= 0) {
        window.towerState.stability = 0;
        window.renderTowerUI(); // Ultimo aggiornamento prima del game over
        window.gameOverTower();
    } else {
        window.renderTowerUI();
    }
};

window.useTowerGadget = function(id) {
    const state = window.towerState;
    if (id === 1 && state.gadget1 > 0 && !state.isDspActive) {
        state.gadget1--; state.isDspActive = true; showToast("🛡️ FILTRO DSP (20s)");
        const oldQrn = state.qrnLevel; state.qrnLevel = 0; state.tempNoiseBoost = 0; window.updateTowerDifficulty();
        setTimeout(() => { state.isDspActive = false; window.updateTowerDifficulty(); }, 20000);
    } else if (id === 2 && state.gadget2 > 0 && !state.isAmpActive) {
        state.gadget2--; state.isAmpActive = true; showToast("🚀 AMPLIFICATORE (20s)");
        setTimeout(() => { state.isAmpActive = false; }, 20000);
    }
    window.renderTowerUI();
};

window.useTowerSOS = function() {
    if (confirm("Dimezzare velocità per questo piano?")) {
        window.towerState.wpm = Math.max(8, Math.round(window.towerState.wpm / 1.5));
        window.renderTowerUI(); if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio(); window.playNextTowerWord();
    }
};

window.startTowerBossFight = function() {
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
    window.towerState.txMode = true;
    window.towerState.txTarget = "SOS";
    window.towerState.txCurrent = "";
    window.towerState.txSequence = [];
    window.towerState.txLastTime = 0;
    window.towerState.attemptCount = 0;
    window.towerState.tempNoiseBoost = 0.08;
    window.updateTowerDifficulty();
    const areaRX = document.getElementById('towerInputArea');
    const areaTX = document.getElementById('towerBossControls');
    if (areaRX) areaRX.style.display = 'none';
    if (areaTX) areaTX.style.display = 'flex';
    const prompt = document.getElementById('towerTxPrompt');
    if (prompt) prompt.textContent = "RIPRISTINA SEGNALE - TRASMETTI:";
    const target = document.getElementById('towerTxTarget');
    if (target) target.textContent = "[SOS]";
    const curr = document.getElementById('towerTxCurrent');
    if (curr) curr.textContent = "";
};

window.startTowerSintonia = function() {
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
    window.towerState.txMode = true;
    window.towerState.attemptCount = 0;
    const floor = window.towerState.floor;
    const len = 2 + Math.floor(floor / 15);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let targetStr = "";
    for(let i=0; i<len; i++) targetStr += chars[Math.floor(Math.random() * chars.length)];
    window.towerState.txTarget = targetStr;
    window.towerState.txCurrent = "";
    window.towerState.txSequence = [];
    window.towerState.txLastTime = 0;
    window.towerState.tempNoiseBoost = 0.12;
    window.updateTowerDifficulty();
    const areaRX = document.getElementById('towerInputArea');
    const areaTX = document.getElementById('towerBossControls');
    if (areaRX) areaRX.style.display = 'none';
    if (areaTX) areaTX.style.display = 'flex';
    const prompt = document.getElementById('towerTxPrompt');
    if (prompt) prompt.textContent = "PERDITA FREQUENZA! SINTONIZZA:";
    const targetEl = document.getElementById('towerTxTarget');
    if (targetEl) targetEl.textContent = "[" + targetStr + "]";
    const currEl = document.getElementById('towerTxCurrent');
    if (currEl) currEl.textContent = "";
    window.triggerTowerGlitch();
};

window.handleTowerKey = function(isDown) {
    if (!window.towerState.active || !window.towerState.txMode) return;
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
    const now = Date.now();
    const unit = 1200 / window.towerState.wpm;
    if (isDown) {
        if (typeof startTone === 'function') startTone(600);
        if (window.towerState.txLastTime > 0 && (now - window.towerState.txLastTime) > unit * 2.5) window.finalizeTowerTxChar();
        window.towerState.txLastTime = now;
    } else {
        if (typeof stopTone === 'function') stopTone();
        const dur = now - window.towerState.txLastTime;
        window.towerState.txSequence.push(dur > unit * 1.8 ? "-" : ".");
        window.towerState.txLastTime = now;
        const currEl = document.getElementById('towerTxCurrent');
        if (currEl) currEl.textContent = window.towerState.txCurrent + " " + window.towerState.txSequence.join("");
        if (window.towerState.txTimeout) clearTimeout(window.towerState.txTimeout);
        window.towerState.txTimeout = setTimeout(() => { if (window.towerState.txMode) window.finalizeTowerTxChar(); }, unit * 3.5);
    }
};

window.finalizeTowerTxChar = function() {
    if (window.towerState.txSequence.length === 0) return;

    // Cancella timeout decodifica per evitare doppie chiamate/errori
    if (window.towerState.txTimeout) {
        clearTimeout(window.towerState.txTimeout);
        window.towerState.txTimeout = null;
    }

    const code = window.towerState.txSequence.join("");
    window.towerState.txSequence = [];
    let found = "";
    for (let c in window.morseDict) { if (window.morseDict[c] === code) { found = c; break; } }

    // Se la sequenza non è valida, non dare errore subito, svuota e aspetta
    if (!found) {
        document.getElementById('towerTxCurrent').textContent = window.towerState.txCurrent;
        return;
    }

    if (window.towerState.txTarget.startsWith(window.towerState.txCurrent + found)) {
        window.towerState.txCurrent += found;
        const currEl = document.getElementById('towerTxCurrent');
        if (currEl) currEl.textContent = window.towerState.txCurrent;
        if (window.towerState.txCurrent === window.towerState.txTarget) {
            showToast("✅ SINTONIZZATO!");
            setTimeout(() => {
                window.towerState.txMode = false;
                const areaRX = document.getElementById('towerInputArea');
                const areaTX = document.getElementById('towerBossControls');
                if (areaRX) areaRX.style.display = 'flex';
                if (areaTX) areaTX.style.display = 'none';
                window.towerState.tempNoiseBoost = 0;
                window.updateTowerDifficulty();
                if (window.towerState.floor % 10 === 0) window.advanceTowerFloor();
                else window.playNextTowerWord();
            }, 1000);
        }
    } else {
        window.towerState.attemptCount++;
        window.damageTowerStability(10);
        window.triggerTowerGlitch();
        if (window.towerState.attemptCount < 3) {
            showToast(`❌ ERRORE TX (${window.towerState.attemptCount}/3)`);
            window.towerState.tempNoiseBoost += 0.12;
            window.updateTowerDifficulty();
            window.towerState.txCurrent = "";
            const currEl = document.getElementById('towerTxCurrent');
            if (currEl) currEl.textContent = "";
        } else {
            showToast("📡 SINTONIA DI FORTUNA...");
            setTimeout(() => {
                window.towerState.txMode = false;
                const areaRX = document.getElementById('towerInputArea');
                const areaTX = document.getElementById('towerBossControls');
                if (areaRX) areaRX.style.display = 'flex';
                if (areaTX) areaTX.style.display = 'none';
                window.towerState.tempNoiseBoost = 0;
                window.updateTowerDifficulty();
                if (window.towerState.floor % 10 === 0) window.advanceTowerFloor();
                else window.playNextTowerWord();
            }, 1000);
        }
    }
};

window.renderTowerUI = function() {
    const fEl = document.getElementById('towerFloorDisplay');
    const sEl = document.getElementById('towerStabilityDisplay');
    if (fEl) fEl.textContent = "PIANO: " + window.towerState.floor;
    if (sEl) {
        sEl.textContent = "STABILITÀ: " + window.towerState.stability + "%";
        sEl.style.color = window.towerState.stability < 30 ? "#ff3d00" : "#00ff41";
    }
    const b1 = document.getElementById('btnTowerGadget1');
    const b2 = document.getElementById('btnTowerGadget2');
    if (b1) b1.textContent = `FILTRO DSP (${window.towerState.gadget1})`;
    if (b2) b2.textContent = `AMPLIFICA (${window.towerState.gadget2})`;
};

window.fetchNearbyPlayers = function() {
    if (!window.db) return;
    window.db.ref('leaderboard/la_torre/all').limitToLast(20).once('value').then(snap => {
        const players = [];
        snap.forEach(c => { if(c.key !== window.myId) players.push({ alias: c.val().name, floor: c.val().score }); });
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
        const totalNoise = (window.towerState.qrnLevel || 0) + (window.towerState.tempNoiseBoost || 0);
        const noise = (Math.random() - 0.5) * totalNoise * 500;
        const y = midY + (Math.sin(x * 0.05 + time) * 15 * sf) + noise;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
};

window.updateTowerDifficulty = function() {
    const floor = window.towerState.floor;
    if (!window.towerState.isDspActive) {
        window.towerState.qrnLevel = floor > 10 ? Math.min(0.12, (floor - 10) * 0.006) : 0;
    }
    const totalQrn = window.towerState.qrnLevel + window.towerState.tempNoiseBoost;
    if (window.towerState.noiseGain && window.audioCtx) {
        window.towerState.noiseGain.gain.setTargetAtTime(Math.min(0.4, totalQrn), window.audioCtx.currentTime, 0.3);
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
    window.gameRunning = false;
    if (window.towerState.noiseNode) {
        try { window.towerState.noiseNode.stop(); window.towerState.noiseNode.disconnect(); } catch(e) {}
        window.towerState.noiseNode = null;
    }
    if (window.towerState.animationId) cancelAnimationFrame(window.towerState.animationId);
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
};

window.quitTowerClimb = function() {
    window.stopTowerClimb();
    if (typeof window.goBackToMenu === 'function') window.goBackToMenu();
};
