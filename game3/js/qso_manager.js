// js/qso_manager.js

window.qsoState = {
    peer: null,
    conn: null,
    partnerId: null,
    partnerName: '---',
    status: 'DISCONNESSO',
    timeOffset: 0,
    playbackDelay: 150,
    syncInterval: null,
    rxIsTx: false,
    remoteWatchdog: null,
    decodedText: '',
    isInitialized: false,
    isRelayMode: false,
    decoder: {
        lastEdgeTime: 0,
        sequence: [],
        wordTimeout: null
    },
    canvas: {
        ctx: null,
        animationId: null
    }
};

window.initQsoManager = function() {
    if (window.qsoState.isInitialized) return;
    console.log("QSO: Initializing Manager...");

    const quitBtn = document.getElementById('quitQsoBtn');
    if (quitBtn) {
        quitBtn.onclick = () => {
            if (confirm("Vuoi chiudere il collegamento QSO?")) window.exitQsoMode();
        };
    }

    const clearLogBtn = document.getElementById('btnClearQsoLog');
    if (clearLogBtn) {
        clearLogBtn.onclick = () => {
            window.qsoState.decodedText = "";
            const logEl = document.getElementById('qsoDecodedText');
            if (logEl) logEl.textContent = "...";
        };
    }

    const canvas = document.getElementById('qsoOscilloscope');
    if (canvas) {
        window.qsoState.canvas.ctx = canvas.getContext('2d');
        window.startQsoVisualizer();
    }

    const wpmIn = document.getElementById('qsoWpmInput');
    const toneIn = document.getElementById('qsoToneInput');

    if (wpmIn) {
        wpmIn.value = window.keyerState.wpm;
        wpmIn.onchange = (e) => {
            const val = parseInt(e.target.value) || 20;
            window.keyerState.wpm = val;
            const mainWpm = document.getElementById('keyerWpmInput');
            if (mainWpm) mainWpm.value = val;
            window.saveKeyerSettings();
        };
    }
    if (toneIn) {
        toneIn.value = window.keyerState.tone;
        toneIn.onchange = (e) => {
            const val = parseInt(e.target.value) || 600;
            window.keyerState.tone = val;
            window.currentTone = val;
            const mainTone = document.getElementById('keyerToneInput');
            if (mainTone) mainTone.value = val;
            window.saveKeyerSettings();
        };
    }

    window.qsoState.isInitialized = true;
};

window.toggleQsoLog = function() {
    const box = document.getElementById('qsoDecoderBox');
    const btn = document.getElementById('btnToggleQsoLog');
    if (box && btn) {
        const isHidden = box.style.display === 'none';
        box.style.display = isHidden ? 'flex' : 'none';
        btn.textContent = isHidden ? "Nascondi 🔼" : "Mostra Log 🔽";
    }
};

window.startQsoVisualizer = function() {
    const ctx = window.qsoState.canvas.ctx;
    if (!ctx) return;
    const canvas = ctx.canvas;
    const draw = () => {
        if (!window.qsoState.isInitialized) return;
        const imageData = ctx.getImageData(1, 0, canvas.width - 1, canvas.height);
        ctx.putImageData(imageData, 0, 0);
        ctx.fillStyle = "#000";
        ctx.fillRect(canvas.width - 1, 0, 1, canvas.height);
        if (window.qsoState.rxIsTx) {
            ctx.fillStyle = "var(--champ-color)";
            ctx.fillRect(canvas.width - 1, canvas.height/2 - 12, 1, 24);
        } else if (window.transmissionState.isDown || (window.keyerState && window.keyerState.currentSymbol)) {
            ctx.fillStyle = "var(--link-color)";
            ctx.fillRect(canvas.width - 1, canvas.height/2 - 6, 1, 12);
        }
        window.qsoState.canvas.animationId = requestAnimationFrame(draw);
    };
    draw();
};

window.startQsoMode = function() {
    console.log("QSO: Starting Mode...");
    window.initQsoManager();
    window.showScreen('qsoArea');

    const myPeerId = "CWGAME_" + window.myId;
    if (window.qsoState.peer) window.qsoState.peer.destroy();

    window.qsoState.peer = new Peer(myPeerId, {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' }
            ]
        }
    });

    window.qsoState.peer.on('open', (id) => {
        window.updateQsoStatus("IN ATTESA P2P...", "#f39c12");
        if (window.roomCode) {
            db.ref(`rooms/${window.roomCode}/players/${window.myId}/peerId`).set(id);
            window.listenForQsoPartner();
        }
    });

    window.qsoState.peer.on('connection', (incoming) => window.setupQsoDataChannel(incoming));

    window.qsoState.peer.on('error', (err) => {
        console.warn("QSO P2P Error, switching to Relay...");
        window.activateQsoRelayMode();
    });

    // Sincronizzazione Relay Globale
    if (window.roomCode) {
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).on('value', snap => {
            if (snap.val() === true && !window.qsoState.conn && !window.qsoState.isRelayMode) {
                window.activateQsoRelayMode();
            }
        });
    }

    // Fallback automatico se non connessi entro 10s
    setTimeout(() => {
        if (!window.qsoState.conn && window.currentMode === 'qso' && !window.qsoState.isRelayMode) {
            window.activateQsoRelayMode();
        }
    }, 10000);
};

window.activateQsoRelayMode = function() {
    if (window.qsoState.isRelayMode) return;
    window.qsoState.isRelayMode = true;
    window.updateQsoStatus("MODALITÀ RELAY 🛰️", "#ff9800");
    showToast("Uso Server Firebase (Relay)");

    if (window.roomCode) {
        // Segnaliamo il nostro stato relay
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).set(true);

        // Ascoltiamo i segnali di TUTTI i partecipanti nella stanza
        db.ref(`rooms/${window.roomCode}/qso_relay`).on('value', snap => {
            const allRelays = snap.val() || {};
            for (let senderId in allRelays) {
                if (senderId === window.myId) continue; // Salta se sono io

                const data = allRelays[senderId];
                // Usiamo un timestamp per evitare di rieseguire lo stesso segnale
                if (data.ts > (window.qsoState.lastRelayTs || 0)) {
                    window.qsoState.lastRelayTs = data.ts;
                    if (data.type === 'DN') window.playQsoRemoteTone(data.f, 0);
                    else if (data.type === 'UP') window.stopQsoRemoteTone(0);
                }
            }
        });
    }
};

window.listenForQsoPartner = function() {
    if (!window.roomCode) return;
    db.ref(`rooms/${window.roomCode}/players`).on('value', snap => {
        const players = snap.val() || {};
        for (let pId in players) {
            if (pId !== window.myId && players[pId].peerId && !window.qsoState.conn) {
                const connection = window.qsoState.peer.connect(players[pId].peerId, { reliable: false, metadata: { name: window.myName } });
                window.setupQsoDataChannel(connection);
            }
        }
    });
};

window.setupQsoDataChannel = function(c) {
    window.qsoState.conn = c;
    c.on('open', () => {
        window.updateQsoStatus("CONNESSO ✅", "#2ecc71");
        document.getElementById('qsoPartnerName').textContent = "Connesso con: " + (c.metadata?.name || "Partner");
        window.qsoState.conn.send({ type: 'PING', ts: Date.now() });
        window.qsoState.syncInterval = setInterval(() => {
            if (window.qsoState.conn?.open) window.qsoState.conn.send({ type: 'PING', ts: Date.now() });
        }, 5000);
    });
    c.on('data', d => {
        if (d.type === 'PING') c.send({ type: 'PONG', origTs: d.ts, remoteTs: Date.now() });
        else if (d.type === 'PONG') {
            const rtt = Date.now() - d.origTs;
            window.qsoState.timeOffset = Date.now() - (d.remoteTs + (rtt / 2));
        }
        else if (d.type === 'DN') {
            const target = d.ts + window.qsoState.timeOffset + window.qsoState.playbackDelay;
            window.playQsoRemoteTone(d.f, Math.max(0.005, (target - Date.now()) / 1000));
        }
        else if (d.type === 'UP') {
            const target = d.ts + window.qsoState.timeOffset + window.qsoState.playbackDelay;
            window.stopQsoRemoteTone(Math.max(0.005, (target - Date.now()) / 1000));
        }
    });
    c.on('close', () => { window.updateQsoStatus("DISCONNESSO", "#e74c3c"); window.qsoState.conn = null; });
};

window.playQsoRemoteTone = function(freq, delaySec) {
    if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
    window.qsoState.rxIsTx = true;
    if (!window.audioCtx) return;
    const now = Date.now();
    const scheduleTime = window.audioCtx.currentTime + delaySec;
    const unit = 1200 / window.keyerState.wpm;

    if (!window.preOscRemote) {
        window.preOscRemote = window.audioCtx.createOscillator();
        window.preGainRemote = window.audioCtx.createGain();
        window.preOscRemote.connect(window.preGainRemote).connect(window.audioCtx.destination);
        window.preGainRemote.gain.value = 0;
        window.preOscRemote.start();
    }
    window.preOscRemote.frequency.setTargetAtTime(freq, scheduleTime, 0.002);
    window.preGainRemote.gain.cancelScheduledValues(scheduleTime);
    window.preGainRemote.gain.setTargetAtTime(0.5, scheduleTime, 0.012); // Rampa dolce

    if (window.qsoState.decoder.wordTimeout) clearTimeout(window.qsoState.decoder.wordTimeout);
    const gap = now - window.qsoState.decoder.lastEdgeTime;
    if (gap > unit * 2.5 && window.qsoState.decoder.sequence.length > 0) {
        window.finalizeQsoChar();
        if (gap > unit * 6) window.appendQsoText(" ");
    }
    window.qsoState.decoder.lastEdgeTime = now;
    document.getElementById('qsoRxIndicator').style.backgroundColor = "var(--champ-color)";
    if (window.qsoState.remoteWatchdog) clearTimeout(window.qsoState.remoteWatchdog);
    window.qsoState.remoteWatchdog = setTimeout(() => { if (window.qsoState.rxIsTx) window.stopQsoRemoteTone(0); }, 2000);
};

window.stopQsoRemoteTone = function(delaySec) {
    const now = Date.now();
    const duration = now - window.qsoState.decoder.lastEdgeTime;
    const scheduleTime = window.audioCtx.currentTime + delaySec;
    const unit = 1200 / window.keyerState.wpm;

    if (window.preGainRemote) {
        window.preGainRemote.gain.cancelScheduledValues(scheduleTime);
        window.preGainRemote.gain.setTargetAtTime(0, scheduleTime, 0.012); // Rampa dolce
    }
    window.qsoState.rxIsTx = false;
    document.getElementById('qsoRxIndicator').style.backgroundColor = "#333";
    window.qsoState.decoder.sequence.push(duration > unit * 2.0 ? "-" : ".");
    window.qsoState.decoder.lastEdgeTime = now;
    window.qsoState.decoder.wordTimeout = setTimeout(() => window.finalizeQsoChar(), unit * 4);
};

window.finalizeQsoChar = function() {
    const code = window.qsoState.decoder.sequence.join("");
    if (!code) return;
    let char = "?";
    for (let c in window.morseDict) { if (window.morseDict[c] === code) { char = c; break; } }
    window.appendQsoText(char);
    window.qsoState.decoder.sequence = [];
};

window.appendQsoText = function(t) {
    window.qsoState.decodedText += t;
    const el = document.getElementById('qsoDecodedText');
    if (el) { el.textContent = window.qsoState.decodedText; el.scrollTop = el.scrollHeight; }
};

window.sendQsoEvent = function(type, freq) {
    if (window.qsoState.conn?.open) window.qsoState.conn.send({ type, f: freq, ts: Date.now() });
    if (window.qsoState.isRelayMode && window.roomCode) {
        db.ref(`rooms/${window.roomCode}/qso_relay/${window.myId}`).set({ type, f: freq, ts: Date.now() });
    }
};

window.updateQsoStatus = function(msg, color) {
    const el = document.getElementById('qsoStatusText');
    if (el) { el.textContent = "P2P: " + msg; el.style.color = color; }
};

window.exitQsoMode = function() {
    if (window.roomCode) {
        db.ref(`rooms/${window.roomCode}/players`).off('value');
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).off('value');
        db.ref(`rooms/${window.roomCode}/qso_relay`).off('value');
    }
    if (window.qsoState.syncInterval) clearInterval(window.qsoState.syncInterval);
    window.qsoState.conn?.close();
    window.qsoState.peer?.destroy();
    if (window.qsoState.canvas.animationId) cancelAnimationFrame(window.qsoState.canvas.animationId);
    window.qsoState.conn = null;
    window.qsoState.peer = null;
    window.qsoState.isInitialized = false;
    window.stopTone();
    if (window.preGainRemote) window.preGainRemote.gain.value = 0;
    window.exitRoomCleanly(false, true);
};
