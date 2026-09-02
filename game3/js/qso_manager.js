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
    outgoingSeq: 0,
    remoteIsOn: false,
    echoActive: false
};

window.initQsoManager = function() {
    if (window.qsoState.isInitialized) return;
    var quitBtn = document.getElementById('quitQsoBtn');
    if (quitBtn) quitBtn.onclick = function() { if (confirm("Vuoi chiudere il QSO?")) window.exitQsoMode(); };

    var clearLogBtn = document.getElementById('btnClearQsoLog');
    if (clearLogBtn) clearLogBtn.onclick = function() {
        window.qsoState.decodedText = "";
        var logEl = document.getElementById('qsoDecodedText');
        if (logEl) logEl.textContent = "...";
    };

    var wpmIn = document.getElementById('qsoWpmInput');
    var toneIn = document.getElementById('qsoToneInput');
    if (wpmIn) {
        wpmIn.value = window.keyerState.wpm;
        wpmIn.onchange = function(e) {
            var val = parseInt(e.target.value) || 20;
            window.keyerState.wpm = val;
            var m = document.getElementById('keyerWpmInput'); if (m) m.value = val;
            window.saveKeyerSettings();
        };
    }
    if (toneIn) {
        toneIn.value = window.keyerState.tone;
        toneIn.onchange = function(e) {
            var val = parseInt(e.target.value) || 600;
            window.keyerState.tone = val; window.currentTone = val;
            var m = document.getElementById('keyerToneInput'); if (m) m.value = val;
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
    var btn = document.getElementById('btnForceQsoRelay'); if (btn) btn.style.display = 'block';
    var echoBtn = document.getElementById('btnToggleQsoEcho'); if (echoBtn) echoBtn.style.display = 'block';
    window.qsoState.echoActive = false;
    if (echoBtn) { echoBtn.textContent = "TEST CANALE (ECHO): OFF"; echoBtn.className = "btn-warning"; }

    var myPeerId = "CWGAME_" + window.myId;
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

    window.qsoState.peer.on('open', function(id) {
        window.updateQsoStatus("ATTESA P2P...", "#f39c12");
        if (window.roomCode) {
            db.ref("rooms/" + window.roomCode + "/players/" + window.myId + "/peerId").set(id);
            window.listenForQsoPartner();
        }
    });

    window.qsoState.peer.on('connection', function(incoming) { window.setupQsoDataChannel(incoming); });
    window.qsoState.peer.on('error', function() { window.activateQsoRelayMode(); });

    // Sincronizzazione Relay Globale
    if (window.roomCode) {
        db.ref("rooms/" + window.roomCode + "/qso_state/relay_active").on('value', function(snap) {
            if (snap.val() === true && !window.qsoState.isRelayMode) window.activateQsoRelayMode();
        });
    }

    // Auto-Relay dopo 15 secondi
    setTimeout(function() {
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
    var btn = document.getElementById('btnForceQsoRelay'); if (btn) btn.style.display = 'none';

    if (window.roomCode) {
        db.ref("rooms/" + window.roomCode + "/qso_state/relay_active").set(true);
    }
};

window.listenForQsoPartner = function() {
    if (!window.roomCode) return;
    db.ref("rooms/" + window.roomCode + "/players").on('value', function(snap) {
        var players = snap.val() || {};
        for (var pId in players) {
            if (pId !== window.myId) {
                var partnerId = pId;
                var partnerName = players[pId].name || "Operatore";

                var partnerEl = document.getElementById('qsoPartnerName');
                if (partnerEl) partnerEl.textContent = "Partner: " + partnerName;

                if (players[pId].peerId && !window.qsoState.conn) {
                    var connection = window.qsoState.peer.connect(players[pId].peerId, { reliable: false, metadata: { name: window.myName, pNow: performance.now() } });
                    window.setupQsoDataChannel(connection, partnerName);

                    var partnerRelayRef = db.ref("rooms/" + window.roomCode + "/qso_relay/" + partnerId);
                    var relayBuffer = {
                        baseTime: 0,
                        remoteBaseTime: 0,
                        bufferDelay: 0.3
                    };

                    partnerRelayRef.on('child_added', function(rSnap) {
                        var data = rSnap.val();
                        if (!data || data.ts < window.qsoState.relayStartTime) return;

                        if (relayBuffer.remoteBaseTime === 0) {
                            relayBuffer.remoteBaseTime = data.ts;
                            relayBuffer.baseTime = (window.audioCtx && window.audioCtx.currentTime || 0) + relayBuffer.bufferDelay;
                        }

                        var offset = (data.ts - relayBuffer.remoteBaseTime) / 1000;
                        var scheduledTime = relayBuffer.baseTime + offset;
                        var now = (window.audioCtx && window.audioCtx.currentTime || 0);
                        var delaySec = Math.max(0, scheduledTime - now);

                        if (data.s === 1) {
                            if (typeof window.startRemoteTone === 'function') window.startRemoteTone(data.f, delaySec);
                        } else if (data.s === 0) {
                            if (typeof window.stopRemoteTone === 'function') window.stopRemoteTone(delaySec);
                        }
                        rSnap.ref.remove();
                    });
                }
            }
        }
    });
};

window.setupQsoDataChannel = function(c, partnerName) {
    window.qsoState.conn = c;

    var onOpen = function() {
        window.updateQsoStatus("CONNESSO ✅", "#2ecc71");
        var b = document.getElementById('btnForceQsoRelay'); if (b) b.style.display = 'none';

        var nameToShow = partnerName || (c.metadata && c.metadata.name) || "Operatore";
        var partnerEl = document.getElementById('qsoPartnerName');
        if (partnerEl) partnerEl.textContent = "Partner: " + nameToShow;

        window.qsoState.conn.send({ type: 'SYNC', pNow: performance.now() });

        if (window.qsoState.hbInterval) clearInterval(window.qsoState.hbInterval);
        window.qsoState.hbInterval = setInterval(function() {
            if (window.qsoState.conn && window.qsoState.conn.open) {
                window.qsoState.conn.send({
                    type: 'HB', isDown: !!window.manualOscillator, f: window.currentTone,
                    ts: performance.now(), seq: window.qsoState.outgoingSeq++
                });
            }
        }, 300);
    };

    if (c.open) onOpen();
    else c.on('open', onOpen);

    c.on('data', function(d) {
        var now = performance.now();
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

        var scheduledPNow = d.ts + window.qsoState.clockOffset + (window.qsoState.playbackDelay * 1000);
        var delaySec = (scheduledPNow - now) / 1000;

        if (d.type === 'DN') window.startRemoteTone(d.f, Math.max(0, delaySec));
        else if (d.type === 'UP') window.stopRemoteTone(Math.max(0, delaySec));

        if (window.qsoState.remoteWatchdog) clearTimeout(window.qsoState.remoteWatchdog);
        window.qsoState.remoteWatchdog = setTimeout(function() { if (window.remoteOscillator) window.stopRemoteTone(0); }, 1000);
    });
    c.on('close', function() {
        window.updateQsoStatus("DISCONNESSO", "#e74c3c");
        if (window.qsoState.hbInterval) clearInterval(window.qsoState.hbInterval);
        window.qsoState.conn = null;
    });
};

window.sendQsoEvent = function(type, freq) {
    var nowP = performance.now();
    var nowD = Date.now();
    if (window.qsoState.conn && window.qsoState.conn.open) {
        window.qsoState.conn.send({ type: type, f: freq, ts: nowP, seq: window.qsoState.outgoingSeq++ });
    }
    if ((window.qsoState.isRelayMode || window.qsoState.echoActive || !window.qsoState.conn) && window.roomCode) {
        db.ref("rooms/" + window.roomCode + "/qso_relay/" + window.myId).push({
            s: (type === 'DN' ? 1 : 0), f: freq, ts: nowD
        });
    }
};

window.updateQsoStatus = function(msg, color) {
    var el = document.getElementById('qsoStatusText');
    if (el) { el.textContent = "STATO: " + msg; el.style.color = color; }
};

window.exitQsoMode = function() {
    if (window.roomCode) {
        db.ref("rooms/" + window.roomCode + "/players").off('value');
        db.ref("rooms/" + window.roomCode + "/qso_state/relay_active").off('value');
        if (!window.qsoState.echoActive) db.ref("rooms/" + window.roomCode + "/qso_relay/" + window.myId).remove();
    }
    if (window.qsoState.syncInterval) clearInterval(window.qsoState.syncInterval);
    if (window.qsoState.hbInterval) clearInterval(window.qsoState.hbInterval);
    if (window.qsoState.echoListener) {
        db.ref("rooms/" + window.roomCode + "/qso_relay/" + window.myId).off('child_added', window.qsoState.echoListener);
        window.qsoState.echoListener = null;
    }
    if (window.qsoState.conn) { window.qsoState.conn.close(); }
    if (window.qsoState.peer) { window.qsoState.peer.destroy(); }
    window.qsoState.conn = null; window.qsoState.peer = null;
    window.qsoState.isInitialized = false;
    window.stopTone();
    window.stopRemoteTone();
    window.exitRoomCleanly(false, true);
};

window.toggleQsoEcho = function() {
    if (!window.roomCode) { alert("Crea o entra in una stanza prima di attivare l'Echo Test."); return; }

    if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();

    var btn = document.getElementById('btnToggleQsoEcho');
    window.qsoState.echoActive = !window.qsoState.echoActive;

    var myRelayRef = db.ref("rooms/" + window.roomCode + "/qso_relay/" + window.myId);

    if (window.qsoState.echoActive) {
        window.qsoState.echoStartTime = Date.now();
        if (btn) { btn.textContent = "ECHO TEST: ON 🔊"; btn.className = "btn-success"; }
        window.updateQsoStatus("ECHO TEST ATTIVO", "#2ecc71");

        var echoBuffer = {
            baseTime: 0,
            remoteBaseTime: 0,
            bufferDelay: 1.0
        };

        window.qsoState.echoListener = function(rSnap) {
            var data = rSnap.val();
            if (!data) return;

            if (data.ts < window.qsoState.echoStartTime) return;

            if (echoBuffer.remoteBaseTime === 0) {
                echoBuffer.remoteBaseTime = data.ts;
                echoBuffer.baseTime = (window.audioCtx && window.audioCtx.currentTime || 0) + echoBuffer.bufferDelay;
            }

            var offset = (data.ts - echoBuffer.remoteBaseTime) / 1000;
            var scheduledTime = echoBuffer.baseTime + offset;
            var now = (window.audioCtx && window.audioCtx.currentTime || 0);
            var delaySec = Math.max(0, scheduledTime - now);

            if (data.s === 1) {
                if (typeof window.startRemoteTone === 'function') {
                    window.startRemoteTone(data.f, delaySec);
                }
            } else if (data.s === 0) {
                if (typeof window.stopRemoteTone === 'function') {
                    window.stopRemoteTone(delaySec);
                }
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
