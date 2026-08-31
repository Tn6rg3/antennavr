// js/qso_manager.js

window.qsoState = {
    peer: null,
    conn: null,
    partnerId: null,
    partnerName: '---',
    status: 'DISCONNESSO',
    clockOffset: 0, // Differenza tra performance.now() locale e remoto
    playbackDelay: 0.3, // Buffer di 300ms (in secondi per WebAudio)
    syncInterval: null,
    rxIsTx: false,
    remoteWatchdog: null,
    decodedText: '',
    isInitialized: false,
    isRelayMode: false,
    lastProcessedSeq: 0
};

window.initQsoManager = function() {
    if (window.qsoState.isInitialized) return;
    const quitBtn = document.getElementById('quitQsoBtn');
    if (quitBtn) quitBtn.onclick = () => { if (confirm("Vuoi chiudere il QSO?")) window.exitQsoMode(); };

    const clearLogBtn = document.getElementById('btnClearQsoLog');
    if (clearLogBtn) clearLogBtn.onclick = () => {
        window.qsoState.decodedText = "";
        const logEl = document.getElementById('qsoDecodedText');
        if (logEl) logEl.textContent = "...";
    };

    const wpmIn = document.getElementById('qsoWpmInput');
    const toneIn = document.getElementById('qsoToneInput');
    if (wpmIn) {
        wpmIn.value = window.keyerState.wpm;
        wpmIn.onchange = (e) => {
            const val = parseInt(e.target.value) || 20;
            window.keyerState.wpm = val;
            const m = document.getElementById('keyerWpmInput'); if (m) m.value = val;
            window.saveKeyerSettings();
        };
    }
    if (toneIn) {
        toneIn.value = window.keyerState.tone;
        toneIn.onchange = (e) => {
            const val = parseInt(e.target.value) || 600;
            window.keyerState.tone = val; window.currentTone = val;
            const m = document.getElementById('keyerToneInput'); if (m) m.value = val;
            window.saveKeyerSettings();
        };
    }
    window.qsoState.isInitialized = true;
};

window.startQsoMode = function() {
    window.initQsoManager();
    window.showScreen('qsoArea');
    const myPeerId = "CWGAME_" + window.myId;
    if (window.qsoState.peer) window.qsoState.peer.destroy();

    window.qsoState.peer = new Peer(myPeerId, {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' }
            ]
        }
    });

    window.qsoState.peer.on('open', (id) => {
        window.updateQsoStatus("ATTESA P2P...", "#f39c12");
        if (window.roomCode) {
            db.ref(`rooms/${window.roomCode}/players/${window.myId}/peerId`).set(id);
            window.listenForQsoPartner();
        }
    });

    window.qsoState.peer.on('connection', (incoming) => window.setupQsoDataChannel(incoming));
};

window.listenForQsoPartner = function() {
    if (!window.roomCode) return;
    db.ref(`rooms/${window.roomCode}/players`).on('value', snap => {
        const players = snap.val() || {};
        for (let pId in players) {
            if (pId !== window.myId && players[pId].peerId && !window.qsoState.conn) {
                const partnerId = pId;
                const connection = window.qsoState.peer.connect(players[pId].peerId, {
                    reliable: false, // UDP-style per minima latenza e niente freeze
                    metadata: { name: window.myName, pNow: performance.now() }
                });
                window.setupQsoDataChannel(connection);
            }
        }
    });
};

window.setupQsoDataChannel = function(c) {
    window.qsoState.conn = c;
    c.on('open', () => {
        window.updateQsoStatus("CONNESSO ✅", "#2ecc71");
        document.getElementById('qsoPartnerName').textContent = "Partner: " + (c.metadata?.name || "Operatore");

        // Sincronizzazione iniziale
        window.qsoState.conn.send({ type: 'SYNC', pNow: performance.now() });
    });

    c.on('data', d => {
        if (d.type === 'SYNC') {
            // Calcolo offset temporale tra i due orologi ad alta precisione
            window.qsoState.clockOffset = performance.now() - d.pNow;
            return;
        }

        // --- RICEZIONE CON JITTER BUFFER ---
        const now = performance.now();
        // Calcoliamo quando il segnale dovrebbe essere riprodotto
        // TempoOriginale + Offset + Buffer Fisso
        const scheduledPNow = d.ts + window.qsoState.clockOffset + (window.qsoState.playbackDelay * 1000);
        const delaySec = (scheduledPNow - now) / 1000;

        if (d.type === 'DN') {
            window.startRemoteTone(d.f, Math.max(0, delaySec));
        } else if (d.type === 'UP') {
            window.stopRemoteTone(Math.max(0, delaySec));
        }
    });

    c.on('close', () => { window.updateQsoStatus("DISCONNESSO", "#e74c3c"); window.qsoState.conn = null; });
};

window.sendQsoEvent = function(type, freq) {
    if (window.qsoState.conn?.open) {
        window.qsoState.conn.send({
            type: type,
            f: freq,
            ts: performance.now() // Timestamp ad alta precisione
        });
    }
};

window.updateQsoStatus = function(msg, color) {
    const el = document.getElementById('qsoStatusText');
    if (el) { el.textContent = "STATO: " + msg; el.style.color = color; }
};

window.exitQsoMode = function() {
    if (window.roomCode) db.ref(`rooms/${window.roomCode}/players`).off('value');
    window.qsoState.conn?.close(); window.qsoState.peer?.destroy();
    window.qsoState.conn = null; window.qsoState.peer = null;
    window.qsoState.isInitialized = false;
    window.stopTone();
    window.stopRemoteTone();
    window.exitRoomCleanly(false, true);
};
