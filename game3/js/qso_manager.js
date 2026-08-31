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
    relayStartTime: 0
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
    window.qsoState.isRelayMode = false;
    window.qsoState.relayStartTime = Date.now();

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
    window.qsoState.peer.on('error', () => window.activateQsoRelayMode());

    if (window.roomCode) {
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).on('value', snap => {
            if (snap.val() === true && !window.qsoState.isRelayMode) window.activateQsoRelayMode();
        });
    }

    setTimeout(() => {
        if (!window.qsoState.conn && window.currentMode === 'qso' && !window.qsoState.isRelayMode) {
            window.activateQsoRelayMode();
        }
    }, 12000);
};

window.activateQsoRelayMode = function() {
    if (window.qsoState.isRelayMode) return;
    window.qsoState.isRelayMode = true;
    window.qsoState.relayStartTime = Date.now();
    window.updateQsoStatus("MODALITÀ RELAY 🛰️", "#ff9800");
    const btn = document.getElementById('btnForceQsoRelay'); if (btn) btn.style.display = 'none';

    if (window.roomCode) {
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).set(true);
    }
};

window.listenForQsoPartner = function() {
    if (!window.roomCode) return;
    db.ref(`rooms/${window.roomCode}/players`).on('value', snap => {
        const players = snap.val() || {};
        for (let pId in players) {
            if (pId !== window.myId && players[pId].peerId && !window.qsoState.conn) {
                const partnerId = pId;
                const connection = window.qsoState.peer.connect(players[pId].peerId, { reliable: false, metadata: { name: window.myName } });
                window.setupQsoDataChannel(connection);

                // --- ASCOLTO RELAY OTTIMIZZATO ---
                const partnerRelayRef = db.ref(`rooms/${window.roomCode}/qso_relay/${partnerId}`);
                partnerRelayRef.on('child_added', rSnap => {
                    const data = rSnap.val();
                    if (!data) return;
                    if (data.s === 1) {
                        if (typeof window.startRemoteTone === 'function') window.startRemoteTone(data.f);
                    } else if (data.s === 0) {
                        if (typeof window.stopRemoteTone === 'function') window.stopRemoteTone();
                    }
                    rSnap.ref.remove();
                });
            }
        }
    });
};

window.setupQsoDataChannel = function(c) {
    window.qsoState.conn = c;
    c.on('open', () => {
        window.updateQsoStatus("CONNESSO ✅", "#2ecc71");
        const b = document.getElementById('btnForceQsoRelay'); if (b) b.style.display = 'none';
        document.getElementById('qsoPartnerName').textContent = "Partner: " + (c.metadata?.name || "Operatore");
        window.qsoState.conn.send({ type: 'PING', ts: Date.now() });
        window.qsoState.syncInterval = setInterval(() => { if (window.qsoState.conn?.open) window.qsoState.conn.send({ type: 'PING', ts: Date.now() }); }, 5000);
    });
    c.on('data', d => {
        if (d.type === 'PING') c.send({ type: 'PONG', origTs: d.ts, remoteTs: Date.now() });
        else if (d.type === 'PONG') {
            const rtt = Date.now() - d.origTs;
            window.qsoState.timeOffset = Date.now() - (d.remoteTs + (rtt / 2));
        }
        else if (d.type === 'DN') {
            if (typeof window.startRemoteTone === 'function') window.startRemoteTone(d.f);
        }
        else if (d.type === 'UP') {
            if (typeof window.stopRemoteTone === 'function') window.stopRemoteTone();
        }
    });
    c.on('close', () => { window.updateQsoStatus("DISCONNESSO", "#e74c3c"); window.qsoState.conn = null; });
};

window.sendQsoEvent = function(type, freq) {
    const now = Date.now();
    if (window.qsoState.conn?.open) window.qsoState.conn.send({ type, f: freq, ts: now });
    if ((window.qsoState.isRelayMode || !window.qsoState.conn) && window.roomCode) {
        db.ref(`rooms/${window.roomCode}/qso_relay/${window.myId}`).push({
            s: (type === 'DN' ? 1 : 0),
            f: freq,
            ts: now
        });
    }
};

window.updateQsoStatus = function(msg, color) {
    const el = document.getElementById('qsoStatusText');
    if (el) { el.textContent = "STATO: " + msg; el.style.color = color; }
};

window.exitQsoMode = function() {
    if (window.roomCode) {
        db.ref(`rooms/${window.roomCode}/players`).off('value');
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).off('value');
    }
    if (window.qsoState.syncInterval) clearInterval(window.qsoState.syncInterval);
    window.qsoState.conn?.close(); window.qsoState.peer?.destroy();
    window.qsoState.conn = null; window.qsoState.peer = null;
    window.qsoState.isInitialized = false;
    window.stopTone();
    window.stopRemoteTone();
    window.exitRoomCleanly(false, true);
};
