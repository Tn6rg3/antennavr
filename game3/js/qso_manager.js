// js/qso_manager.js

window.qsoState = {
    peer: null,
    conn: null,
    partnerId: null,
    partnerName: '---',
    status: 'DISCONNESSO',
    clockOffset: 0,
    playbackDelay: 0.8, // Buffer a 800ms per stabilità totale
    syncInterval: null,
    hbInterval: null,
    rxIsTx: false,
    remoteWatchdog: null,
    decodedText: '',
    isInitialized: false,
    isRelayMode: false,
    relayStartTime: 0,
    lastProcessedSeq: 0,
    outgoingSeq: 0
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
    const btn = document.getElementById('btnForceQsoRelay'); if (btn) btn.style.display = 'block';
    const echoBtn = document.getElementById('btnToggleQsoEcho'); if (echoBtn) echoBtn.style.display = 'block';
    window.qsoState.echoActive = false;
    if (echoBtn) { echoBtn.textContent = "TEST CANALE (ECHO): OFF"; echoBtn.className = "btn-warning"; }

    const myPeerId = "CWGAME_" + window.myId;
    if (window.qsoState.peer) window.qsoState.peer.destroy();

    window.qsoState.peer = new Peer(myPeerId, {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' },
                { urls: 'stun:stun.services.mozilla.com' }
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

    // Sincronizzazione Relay Globale
    if (window.roomCode) {
        db.ref(`rooms/${window.roomCode}/qso_state/relay_active`).on('value', snap => {
            if (snap.val() === true && !window.qsoState.isRelayMode) window.activateQsoRelayMode();
        });
    }

    // Auto-Relay dopo 15 secondi
    setTimeout(() => {
        if (!window.qsoState.conn && window.currentMode === 'qso' && !window.qsoState.isRelayMode) {
            window.activateQsoRelayMode();
        }
    }, 15000);
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
                const connection = window.qsoState.peer.connect(players[pId].peerId, { reliable: false, metadata: { name: window.myName, pNow: performance.now() } });
                window.setupQsoDataChannel(connection);

                // ASCOLTO RELAY OTTIMIZZATO
                const partnerRelayRef = db.ref(`rooms/${window.roomCode}/qso_relay/${partnerId}`);
                partnerRelayRef.on('child_added', rSnap => {
                    const data = rSnap.val();
                    if (!data || data.ts < window.qsoState.relayStartTime) return;
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
        window.qsoState.conn.send({ type: 'SYNC', pNow: performance.now() });

        if (window.qsoState.hbInterval) clearInterval(window.qsoState.hbInterval);
        window.qsoState.hbInterval = setInterval(() => {
            if (window.qsoState.conn?.open) {
                window.qsoState.conn.send({
                    type: 'HB', isDown: !!window.manualOscillator, f: window.currentTone,
                    ts: performance.now(), seq: window.qsoState.outgoingSeq++
                });
            }
        }, 300);
    });

    c.on('data', d => {
        const now = performance.now();
        if (d.type === 'SYNC') {
            window.qsoState.clockOffset = performance.now() - d.pNow;
            return;
        }
        if (d.seq && d.seq < window.qsoState.lastProcessedSeq) return;
        window.qsoState.lastProcessedSeq = d.seq || 0;

        if (d.type === 'HB') {
            if (!d.isDown && window.remoteOscillator) window.stopRemoteTone(0);
            return;
        }

        const scheduledPNow = d.ts + window.qsoState.clockOffset + (window.qsoState.playbackDelay * 1000);
        const delaySec = (scheduledPNow - now) / 1000;

        if (d.type === 'DN') window.startRemoteTone(d.f, Math.max(0, delaySec));
        else if (d.type === 'UP') window.stopRemoteTone(Math.max(0, delaySec));

        if (window.qsoState.remoteWatchdog) clearTimeout(window.qsoState.remoteWatchdog);
        window.qsoState.remoteWatchdog = setTimeout(() => { if (window.remoteOscillator) window.stopRemoteTone(0); }, 1000);
    });
    c.on('close', () => {
        window.updateQsoStatus("DISCONNESSO", "#e74c3c");
        if (window.qsoState.hbInterval) clearInterval(window.qsoState.hbInterval);
        window.qsoState.conn = null;
    });
};

window.sendQsoEvent = function(type, freq) {
    const nowP = performance.now();
    const nowD = Date.now();
    if (window.qsoState.conn?.open) {
        window.qsoState.conn.send({ type, f: freq, ts: nowP, seq: window.qsoState.outgoingSeq++ });
    }
    // Invio a Firebase se siamo in Relay Mode O se l'Echo Test è attivo
    if ((window.qsoState.isRelayMode || window.qsoState.echoActive || !window.qsoState.conn) && window.roomCode) {
        console.log(`[QSO] Invio a Firebase: ${type} @ ${freq}Hz (Echo: ${window.qsoState.echoActive})`);
        db.ref(`rooms/${window.roomCode}/qso_relay/${window.myId}`).push({
            s: (type === 'DN' ? 1 : 0), f: freq, ts: nowD
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
        if (!window.qsoState.echoActive) db.ref(`rooms/${window.roomCode}/qso_relay/${window.myId}`).remove();
    }
    if (window.qsoState.syncInterval) clearInterval(window.qsoState.syncInterval);
    if (window.qsoState.hbInterval) clearInterval(window.qsoState.hbInterval);
    if (window.qsoState.echoListener) {
        db.ref(`rooms/${window.roomCode}/qso_relay/${window.myId}`).off('child_added', window.qsoState.echoListener);
        window.qsoState.echoListener = null;
    }
    window.qsoState.conn?.close(); window.qsoState.peer?.destroy();
    window.qsoState.conn = null; window.qsoState.peer = null;
    window.qsoState.isInitialized = false;
    window.stopTone();
    window.stopRemoteTone();
    window.exitRoomCleanly(false, true);
};

window.toggleQsoEcho = function() {
    if (!window.roomCode) { alert("Crea o entra in una stanza prima di attivare l'Echo Test."); return; }
    const btn = document.getElementById('btnToggleQsoEcho');
    window.qsoState.echoActive = !window.qsoState.echoActive;

    const myRelayRef = db.ref(`rooms/${window.roomCode}/qso_relay/${window.myId}`);

    if (window.qsoState.echoActive) {
        window.qsoState.echoStartTime = Date.now();
        console.log(`[QSO] Echo attivato. Path: rooms/${window.roomCode}/qso_relay/${window.myId}`);
        if (btn) { btn.textContent = "ECHO TEST: ON 🔊"; btn.className = "btn-success"; }
        window.updateQsoStatus("ECHO TEST ATTIVO", "#2ecc71");

        window.qsoState.echoListener = (rSnap) => {
            const data = rSnap.val();
            if (!data) return;
            console.log(`[QSO] Ricevuto da Firebase (Echo): s=${data.s}, f=${data.f}, diff=${Date.now() - data.ts}ms`);

            // Ascoltiamo solo eventi futuri rispetto all'attivazione dell'echo
            if (data.ts < window.qsoState.echoStartTime) {
                console.log("[QSO] Salto evento vecchio");
                return;
            }

            // Riproduciamo il tono che abbiamo appena inviato a Firebase
            if (data.s === 1) {
                if (typeof window.startRemoteTone === 'function') {
                    console.log("[QSO] Esecuzione startRemoteTone");
                    window.startRemoteTone(data.f);
                } else console.warn("[QSO] startRemoteTone non definita");
            } else if (data.s === 0) {
                if (typeof window.stopRemoteTone === 'function') {
                    console.log("[QSO] Esecuzione stopRemoteTone");
                    window.stopRemoteTone();
                } else console.warn("[QSO] stopRemoteTone non definita");
            }
        };
        myRelayRef.on('child_added', window.qsoState.echoListener);
    } else {
        if (btn) { btn.textContent = "ECHO TEST: OFF"; btn.className = "btn-warning"; }
        window.updateQsoStatus("ECHO TEST SPENTO", "#f39c12");
        if (window.qsoState.echoListener) {
            myRelayRef.off('child_added', window.qsoState.echoListener);
            window.qsoState.echoListener = null;
        }
        if (typeof window.stopRemoteTone === 'function') window.stopRemoteTone();
    }
};
