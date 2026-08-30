// js/qso_manager.js

window.qsoState = {
    peer: null,
    conn: null,
    partnerId: null,
    partnerName: '---',
    status: 'DISCONNESSO',
    lastReceivedChar: '',
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
        sequence: [], // Memorizza impulsi ON/OFF per analisi precisa
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
            if (confirm("Vuoi chiudere il collegamento QSO?")) {
                window.exitQsoMode();
            }
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

    // --- OSCILLOSCOPE INIT ---
    const canvas = document.getElementById('qsoOscilloscope');
    if (canvas) {
        window.qsoState.canvas.ctx = canvas.getContext('2d');
        window.startQsoVisualizer();
    }

    // Sincronizzazione automatica degli input WPM e Tono con lo stato del keyer globale
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
    if (!box || !btn) return;

    if (box.style.display !== 'none') {
        box.style.display = 'none';
        btn.textContent = "Mostra Log 🔽";
    } else {
        box.style.display = 'flex';
        btn.textContent = "Nascondi 🔼";
    }
};

window.startQsoVisualizer = function() {
    const ctx = window.qsoState.canvas.ctx;
    if (!ctx) return;

    const canvas = ctx.canvas;
    const draw = () => {
        if (!window.qsoState.isInitialized) return;

        // Effetto scorrimento Waterfall
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
    showToast("Ricerca partner P2P...");
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
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' },
                { urls: 'stun:stun.services.mozilla.com' }
            ]
        }
    });

    window.qsoState.peer.on('open', (id) => {
        window.updateQsoStatus("IN ATTESA...", "#f39c12");
        if (window.roomCode) {
            db.ref(`rooms/${window.roomCode}/players/${window.myId}/peerId`).set(id);
            window.listenForQsoPartner();
        }
    });

    window.qsoState.peer.on('connection', (incoming) => {
        window.setupQsoDataChannel(incoming);
    });

    window.qsoState.peer.on('error', (err) => {
        console.error("QSO: PeerJS Error:", err);
        window.updateQsoStatus("ERRORE P2P", "#e74c3c");
        window.activateQsoRelayMode();
    });

    // Fallback automatico Relay
    setTimeout(() => {
        if (!window.qsoState.conn && window.currentMode === 'qso' && !window.qsoState.isRelayMode) {
            window.activateQsoRelayMode();
        }
    }, 12000);
};

window.activateQsoRelayMode = function() {
    if (window.qsoState.conn || window.qsoState.isRelayMode) return;

    window.qsoState.isRelayMode = true;
    window.updateQsoStatus("MODALITÀ RELAY (Server) 🛰️", "#ff9800");
    showToast("P2P non disponibile. Uso Relay Firebase.");

    if (window.roomCode) {
        // Comunichiamo agli altri che siamo in modalità Relay
        db.ref(`rooms/${window.roomCode}/qso_state`).update({ relayActive: true });

        db.ref(`rooms/${window.roomCode}/qso_relay`).on('value', snap => {
            const data = snap.val();
            if (!data || data.senderId === window.myId) return;
            if (data.type === 'DN') window.playQsoRemoteTone(data.f, 0);
            else if (data.type === 'UP') window.stopQsoRemoteTone(0);
        });
    }
};

window.listenForQsoPartner = function() {
    if (!window.roomCode) return;
    db.ref(`rooms/${window.roomCode}/players`).off('value');
    db.ref(`rooms/${window.roomCode}/players`).on('value', (snap) => {
        const players = snap.val() || {};
        for (let pId in players) {
            if (pId !== window.myId && players[pId].peerId && !window.qsoState.conn) {
                const name = players[pId].name || "Partner";
                document.getElementById('qsoPartnerName').textContent = "Connessione a: " + name;
                const connection = window.qsoState.peer.connect(players[pId].peerId, {
                    reliable: false, metadata: { name: window.myName }
                });

                connection.on('error', (err) => {
                    console.log("QSO: Connection error, switching to Relay.");
                    window.activateQsoRelayMode();
                });

                window.setupQsoDataChannel(connection);
            }
        }
    });

    // Ascoltiamo se l'altro ha già attivato il relay
    db.ref(`rooms/${window.roomCode}/qso_state/relayActive`).on('value', snap => {
        if (snap.val() === true && !window.qsoState.conn && !window.qsoState.isRelayMode) {
            window.activateQsoRelayMode();
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

    c.on('data', (d) => {
        if (d.type === 'PING') c.send({ type: 'PONG', origTs: d.ts, remoteTs: Date.now() });
        else if (d.type === 'PONG') {
            const rtt = Date.now() - d.origTs;
            window.qsoState.timeOffset = Date.now() - (d.remoteTs + (rtt / 2));
        }
        else if (d.type === 'DN') {
            cowindow.activateQsoRelayMode = function() {
    if (window.qsoState.isRelayMode) return;

    window.qsoState.isRelayMode = true;
    window.updateQsoStatus("MODALITÀ RELAY (Server) 🛰️", "#ff9800");
    console.log("QSO: Relay Mode Activated.");

    if (window.roomCode) {
        // Comunichiamo agli altri che siamo in modalità Relay
        db.ref(`rooms/${window.roomCode}/qso_state`).update({ relayActive: true });

        db.ref(`rooms/${window.roomCode}/qso_relay`).on('value', snap => {
            const data = snap.val();
            if (!data || data.senderId === window.myId) return;

            // Forziamo il relay anche su di noi se riceviamo traffico relay
            if (!window.qsoState.isRelayMode) window.activateQsoRelayMode();

            if (data.type === 'DN') window.playQsoRemoteTone(data.f, 0);
            else if (data.type === 'UP') window.stopQsoRemoteTone(0);
        });
    }
};

window.playQsoRemoteTone = function(freq, delaySec) {
    if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
    window.qsoState.rxIsTx = true;
    if (!window.audioCtx) return;

    const now = Date.now();
    const scheduleTime = window.audioCtx.currentTime + delaySec;
    const wpm = window.keyerState.wpm;
    const unit = 1200 / wpm;

    if (!window.preOscRemote) {
        window.preOscRemote = window.audioCtx.createOscillator();
        window.preGainRemote = window.audioCtx.createGain();
        window.preOscRemote.connect(window.preGainRemote).connect(window.audioCtx.destination);
        window.preGainRemote.gain.value = 0;
        window.preOscRemote.start();
    }

    // --- AUDIO ANTI-CLICK (15ms Exponential Attack) ---
    window.preOscRemote.frequency.setTargetAtTime(freq, scheduleTime, 0.002);
    window.preGainRemote.gain.cancelScheduledValues(scheduleTime);
    window.preGainRemote.gain.setTargetAtTime(0.5, scheduleTime, 0.008);

    // --- DECODER LOGIC ---
    if (window.qsoState.decoder.wordTimeout) clearTimeout(window.qsoState.decoder.wordTimeout);
    const gap = now - window.qsoState.decoder.lastEdgeTime;

    if (gap > unit * 2.5 && window.qsoState.decoder.sequence.length > 0) {
        window.finalizeQsoChar();
        if (gap > unit * 6) window.appendQsoText(" ");
    }
    window.qsoState.decoder.lastEdgeTime = now;

    const indicator = document.getElementById('qsoRxIndicator');
    if (indicator) indicator.style.backgroundColor = "var(--champ-color)";

    if (window.qsoState.remoteWatchdog) clearTimeout(window.qsoState.remoteWatchdog);
    window.qsoState.remoteWatchdog = setTimeout(() => { if (window.qsoState.rxIsTx) window.stopQsoRemoteTone(0); }, 2000);
};

window.stopQsoRemoteTone = function(delaySec) {
    const now = Date.now();
    const duration = now - window.qsoState.decoder.lastEdgeTime;
    const scheduleTime = window.audioCtx.currentTime + delaySec;
    const wpm = window.keyerState.wpm;
    const unit = 1200 / wpm;

    if (window.preGainRemote) {
        window.preGainRemote.gain.cancelScheduledValues(scheduleTime);
        window.preGainRemote.gain.setTargetAtTime(0, scheduleTime, 0.008);
    }
    window.qsoState.rxIsTx = false;
    const indicator = document.getElementById('qsoRxIndicator');
    if (indicator) indicator.style.backgroundColor = "#333";

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
        db.ref(`rooms/${window.roomCode}/qso_relay`).set({ type, f: freq, senderId: window.myId, ts: Date.now() });
    }
};

window.updateQsoStatus = function(msg, color) {
    const el = document.getElementById('qsoStatusText');
    if (el) { el.textContent = "P2P: " + msg; el.style.color = color; }
};

window.exitQsoMode = function() {
    if (window.roomCode) db.ref(`rooms/${window.roomCode}/players`).off('value');
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
