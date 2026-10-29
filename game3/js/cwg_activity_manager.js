// js/cwg_activity_manager.js - Gestore Attività Activity - CWG (Log QSO, Handshake Corrispondenza & Chiavi A/B con Timer 2 min)

window.cwgQsoTimerInterval = null;
window.cwgExchangeTimerInterval = null;
window.cwgQsoTimerSeconds = 0;
window.cwgExchangeSecondsLeft = 120; // 2 Minuti per lo scambio chiavi
window.cwgGeneratedTxKey = "";
window.cwgLiveQsoListenerRef = null;
window.isCwgInitiator = false; // true se l'utente è Utente A (chi avvia per primo)
window.cwgMyHandshakeTs = 0;
window.cwgQsoStartTimestamp = 0;

window.cleanCallsignString = function(str) {
    if (!str) return "";
    let s = String(str).trim();
    if (s.startsWith('@')) s = s.substring(1);
    return s.toUpperCase().replace(/\s+/g, '');
};

window.saveMyActivityCallPreference = function(newCall) {
    const cleanCall = window.cleanCallsignString(newCall);
    if (!cleanCall || cleanCall.length < 2) return;
    localStorage.setItem('cwgame_activity_call', cleanCall);
    if (db && window.myId) {
        db.ref(`users/${window.myId}/activity_call`).set(cleanCall).catch(() => {});
    }
};

window.openCwgActivityScreenImpl = async function() {
    const isBeta = typeof window.isUserCwgBetaTester === 'function' ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) {
        return alert("⚠️ Questa modalità è attualmente riservata ai Beta Tester autorizzati.");
    }

    let myActivityCall = localStorage.getItem('cwgame_activity_call');

    if (!myActivityCall && db && window.myId) {
        try {
            const snap = await db.ref(`users/${window.myId}/activity_call`).once('value');
            if (snap.exists() && snap.val()) {
                myActivityCall = snap.val().trim().toUpperCase();
                localStorage.setItem('cwgame_activity_call', myActivityCall);
            }
        } catch(e) {}
    }

    if (!myActivityCall || myActivityCall.length < 2) {
        const inputCall = prompt("📻 REGISTRAZIONE NOMINATIVO ACTIVITY:\n\nInserisci il tuo Call / Nominativo radioamatoriale per le sfide Activity (es. IU2XYZ o IK1ABC):");
        if (!inputCall || inputCall.trim().length < 2) {
            alert("⚠️ Per accedere alla modalità Activity è necessario registrare il proprio Nominativo.");
            return;
        }
        myActivityCall = window.cleanCallsignString(inputCall);
        window.saveMyActivityCallPreference(myActivityCall);
    }

    if (typeof window.showScreen === 'function') {
        window.showScreen('cwgActivityScreen');
    }

    // Controlliamo se c'è una sessione QSO già attiva da ripristinare anziché azzerare
    const activeSessionRaw = localStorage.getItem('cwgame_active_qso_session');
    if (activeSessionRaw) {
        try {
            const session = JSON.parse(activeSessionRaw);
            const elapsed = Math.floor((Date.now() - session.qsoStartTs) / 1000);

            if (elapsed < 360) { // Entro i 6 minuti totali (4 min QSO + 2 min Scambio)
                if (document.getElementById('cwgLogMyCall')) document.getElementById('cwgLogMyCall').value = session.myCall;
                if (document.getElementById('cwgLogPartnerCall')) document.getElementById('cwgLogPartnerCall').value = session.partnerCall;
                if (document.getElementById('cwgLogBandSelect')) document.getElementById('cwgLogBandSelect').value = session.band;
                if (document.getElementById('cwgLogStartTime')) document.getElementById('cwgLogStartTime').value = session.startTime;

                if (elapsed < 240) {
                    window.runCwgQsoTimerCountdown(elapsed, session.isInitiator);
                } else {
                    window.isCwgInitiator = session.isInitiator;
                    window.startCwgKeysExchangePhase();
                }
                return;
            }
        } catch(e) {
            localStorage.removeItem('cwgame_active_qso_session');
        }
    }

    window.resetCwgForm();
};

window.openCwgActivityScreen = window.openCwgActivityScreenImpl;

window.resetCwgForm = function() {
    if (window.cwgQsoTimerInterval) {
        clearInterval(window.cwgQsoTimerInterval);
        window.cwgQsoTimerInterval = null;
    }
    if (window.cwgExchangeTimerInterval) {
        clearInterval(window.cwgExchangeTimerInterval);
        window.cwgExchangeTimerInterval = null;
    }
    window.cwgQsoTimerSeconds = 0;
    window.cwgExchangeSecondsLeft = 120;
    window.cwgGeneratedTxKey = "";
    window.isCwgInitiator = false;
    window.cwgQsoStartTimestamp = 0;
    localStorage.removeItem('cwgame_active_qso_session');

    if (window.cwgLiveQsoListenerRef) {
        try { window.cwgLiveQsoListenerRef.off(); } catch(e) {}
        window.cwgLiveQsoListenerRef = null;
    }

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const keysSec = document.getElementById('cwgKeysSection');
    const txBox = document.getElementById('cwgTxKeyDisplayBox');
    const saveBtn = document.getElementById('btnSaveCwgQso');
    const startBtn = document.getElementById('btnCwgStartTimer');
    const cancelBtn = document.getElementById('btnCwgCancelQso');
    const rxInput = document.getElementById('cwgRxKeyInput');
    const stepHelp = document.getElementById('cwgKeysStepHelpText');
    const statusBox = document.getElementById('cwgHandshakeStatusBox');

    if (statusBox) statusBox.style.display = "none";
    if (timerDisp) {
        timerDisp.textContent = "00:00 / 04:00 (STANDBY)";
        timerDisp.style.color = "#ff9800";
    }
    if (fillBar) fillBar.style.width = "0%";
    if (keysSec) keysSec.style.display = "none";
    if (txBox) txBox.style.display = "none";
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = "none";
    if (rxInput) {
        rxInput.value = "";
        rxInput.disabled = false;
    }
    if (stepHelp) stepHelp.textContent = "";

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "▶️ AVVIA QSO & TIMER 4 MINUTI";
    }

    const savedCall = localStorage.getItem('cwgame_activity_call') || "";
    const myCallInput = document.getElementById('cwgLogMyCall');
    if (myCallInput) {
        myCallInput.value = window.cleanCallsignString(savedCall);
    }

    if (document.getElementById('cwgLogStartTime')) document.getElementById('cwgLogStartTime').value = "";
    if (document.getElementById('cwgLogEndTime')) document.getElementById('cwgLogEndTime').value = "";
};

window.cancelCwgQso = function() {
    if (confirm("Sei sicuro di voler annullare questo QSO? I dati ed il timer verranno azzerati.")) {
        window.resetCwgForm();
        if (typeof showToast === 'function') showToast("QSO annullato.");
    }
};

window.sendCwgCqSpotInChat = function() {
    if (!db || !window.myId) return alert("⚠️ Connessione non attiva.");
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || window.myName || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toUpperCase();

    if (!myCall || myCall.length < 2) return alert("⚠️ Inserisci prima il tuo Nominativo / Call.");

    if (confirm(`Lanciare il CQ SPOT per ${myCall} sulla banda ${band} in Bacheca e Chat Globale?`)) {
        // Pulizia preliminare di eventuali spot precedenti per la stessa banda
        window.removeCwgCqSpot(true, band);

        const text = `📡 [SPOT CQ ACTIVITY]: ${myCall} sta facendo chiamata CQ Activity - CWG sulla banda ${band}! 📻`;

        const chatRef = db.ref('globalChat').push();
        window.lastCqSpotMsgKey = chatRef.key;

        chatRef.set({
            senderId: window.myId,
            name: myCall,
            senderName: myCall,
            text: text,
            isCqSpot: true,
            spotCall: myCall,
            spotBand: band,
            ts: firebase.database.ServerValue.TIMESTAMP
        }).catch(() => {});

        const spotId = `cq_spot_${myCall}_${band}`;
        const spotRef = db.ref(`public_lobby_rooms/${spotId}`);

        spotRef.onDisconnect().remove();

        spotRef.set({
            isCqSpot: true,
            status: 'waiting',
            mode: 'cwg_activity',
            spotCall: myCall,
            spotBand: band,
            hostName: myCall,
            expiresAt: Date.now() + 3600000,
            ts: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            if (typeof showToast === 'function') showToast(`📡 CQ SPOT inviato sulla banda ${band}!`);
        }).catch(err => {
            console.error("CQ Spot Error:", err);
            alert("Errore invio spot.");
        });
    }
};

window.removeCwgCqSpot = function(silent = false, targetBand = null) {
    if (!db || !window.myId) return;
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || window.myName || "");
    const band = targetBand || (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toUpperCase();

    if (!myCall || myCall.length < 2) return;

    if (!silent && !confirm(`Rimuovere lo Spot CQ per ${myCall} dalla Bacheca e dalla Chat Globale?`)) {
        return;
    }

    const spotId = `cq_spot_${myCall}_${band}`;
    db.ref(`public_lobby_rooms/${spotId}`).remove().catch(() => {});

    if (window.lastCqSpotMsgKey) {
        db.ref(`globalChat/${window.lastCqSpotMsgKey}`).remove().catch(() => {});
        window.lastCqSpotMsgKey = null;
    }

    db.ref('globalChat').orderByChild('spotCall').equalTo(myCall).once('value', snap => {
        if (snap.exists()) {
            snap.forEach(c => {
                const val = c.val();
                if (val && val.isCqSpot && (!targetBand || val.spotBand === band)) {
                    db.ref(`globalChat/${c.key}`).remove().catch(() => {});
                }
            });
        }
    });

    if (!silent && typeof showToast === 'function') showToast(`📡 Spot CQ rimosso con successo!`);
};

window.addEventListener('beforeunload', () => {
    try { window.removeCwgCqSpot(true); } catch(e) {}
});

window.joinCqSpotActivity = async function(spotCall, spotBand) {
    if (!spotCall) return;
    const isBeta = typeof window.isUserCwgBetaTester === 'function' ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) {
        return alert("⚠️ La modalità Activity - CWG è attualmente riservata ai Beta Tester autorizzati.");
    }

    if (typeof window.openCwgActivityScreen === 'function') {
        await window.openCwgActivityScreen();
    }

    const partnerInput = document.getElementById('cwgLogPartnerCall');
    const bandSelect = document.getElementById('cwgLogBandSelect');

    if (partnerInput) partnerInput.value = window.cleanCallsignString(spotCall);
    if (bandSelect && spotBand) bandSelect.value = spotBand.toLowerCase();

    window.checkCwgDoubleHandshakeMatch();
};

window.checkCwgDoubleHandshakeMatch = function() {
    if (!db) return;

    const myCallInput = document.getElementById('cwgLogMyCall');
    const partnerCallInput = document.getElementById('cwgLogPartnerCall');

    if (myCallInput) myCallInput.value = window.cleanCallsignString(myCallInput.value);
    if (partnerCallInput) partnerCallInput.value = window.cleanCallsignString(partnerCallInput.value);

    const myCall = myCallInput ? myCallInput.value : "";
    const partnerCall = partnerCallInput ? partnerCallInput.value : "";
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();
    const statusBox = document.getElementById('cwgHandshakeStatusBox');

    if (!myCall || myCall.length < 2 || !partnerCall || partnerCall.length < 2 || myCall === partnerCall) {
        if (statusBox) statusBox.style.display = "none";
        return;
    }

    if (window.cwgLiveQsoListenerRef) {
        try { window.cwgLiveQsoListenerRef.off(); } catch(e) {}
        window.cwgLiveQsoListenerRef = null;
    }

    const nowTs = Date.now();
    window.cwgMyHandshakeTs = nowTs;

    const myPresenceKey = `${myCall}_${partnerCall}_${band}`;
    const myPresenceRef = db.ref(`activity_cwg/handshake/${myPresenceKey}`);
    myPresenceRef.set({
        myCall: myCall,
        partnerCall: partnerCall,
        band: band,
        ts: nowTs
    }).catch(() => {});

    const partnerPresenceKey = `${partnerCall}_${myCall}_${band}`;
    const partnerPresenceRef = db.ref(`activity_cwg/handshake/${partnerPresenceKey}`);
    window.cwgLiveQsoListenerRef = partnerPresenceRef;

    db.ref('users').orderByChild('activity_call').equalTo(partnerCall).once('value', uSnap => {
        let isRegistered = uSnap.exists();

        if (statusBox) {
            statusBox.style.display = "block";
            statusBox.textContent = "";

            const span = document.createElement('span');
            span.style.fontSize = "0.85em";
            span.style.fontWeight = "bold";
            span.style.color = isRegistered ? "#ff9800" : "#ffb74d";

            const regText = isRegistered ? " (✅ Registrato nel gioco)" : " (⚠️ Utente non ancora registrato nel gioco)";
            span.textContent = `⏳ STANDBY: In attesa che ${partnerCall}${regText} inserisca il tuo Call (${myCall}) sulla banda ${band.toUpperCase()} per avviare il QSO...`;
            statusBox.appendChild(span);
        }
    });

    partnerPresenceRef.on('value', snap => {
        if (!snap.exists()) return;
        const data = snap.val() || {};
        const partnerTs = data.ts || 0;

        if (Math.abs(nowTs - partnerTs) < 300000) {
            if (statusBox) {
                statusBox.style.display = "block";
                statusBox.textContent = "";

                const span = document.createElement('span');
                span.style.color = "#00ff66";
                span.style.fontSize = "0.85em";
                span.style.fontWeight = "bold";
                span.textContent = `🟢 CORRISPONDENZA CONFERMATA CON ${partnerCall}! QSO AVVIATO!`;
                statusBox.appendChild(span);
            }

            if (!window.cwgQsoTimerInterval && window.cwgQsoTimerSeconds === 0) {
                if (typeof showToast === 'function') {
                    showToast(`🟢 Corrispondenza confermata tra ${myCall} e ${partnerCall}! Timer 4 Minuti avviato.`);
                }

                const isInitiator = (nowTs <= partnerTs);
                window.runCwgQsoTimerCountdown(0, isInitiator);
            }
        }
    });
};

window.startCwgQsoTimer = function() {
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    if (!partnerCall || partnerCall.length < 2) {
        return alert("⚠️ Inserisci prima un Nominativo (Call) del corrispondente valido.");
    }

    const cancelBtn = document.getElementById('btnCwgCancelQso');
    const startBtn = document.getElementById('btnCwgStartTimer');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "⏳ IN ATTESA DEL CORRISPONDENTE...";
    }
    if (cancelBtn) cancelBtn.style.display = "block";

    window.checkCwgDoubleHandshakeMatch();
};

window.runCwgQsoTimerCountdown = function(initialElapsedSeconds = 0, isInitiator = true) {
    window.isCwgInitiator = isInitiator;

    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const startTimeInput = document.getElementById('cwgLogStartTime');
    if (startTimeInput && (!startTimeInput.value || startTimeInput.value.trim() === "")) {
        startTimeInput.value = `${hh}:${mm}`;
    }

    // Salviamo lo stato della sessione attiva in localStorage per ripristino istantaneo!
    const qsoStartTs = Date.now() - (Number(initialElapsedSeconds) * 1000);
    window.cwgQsoStartTimestamp = qsoStartTs;

    localStorage.setItem('cwgame_active_qso_session', JSON.stringify({
        myCall: myCall,
        partnerCall: partnerCall,
        band: band,
        startTime: startTimeInput ? startTimeInput.value : `${hh}:${mm}`,
        qsoStartTs: qsoStartTs,
        isInitiator: isInitiator
    }));

    if (window.cwgQsoTimerInterval) clearInterval(window.cwgQsoTimerInterval);
    window.cwgQsoTimerSeconds = Number(initialElapsedSeconds) || 0;

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');

    const updateTimerUI = () => {
        const currentSecs = window.cwgQsoTimerSeconds;

        const mins = String(Math.floor(currentSecs / 60)).padStart(2, '0');
        const secs = String(currentSecs % 60).padStart(2, '0');
        if (timerDisp) {
            timerDisp.textContent = `${mins}:${secs} / 04:00`;
            timerDisp.style.color = "#00ff66";
        }

        const perc = Math.min(100, (currentSecs / 240) * 100);
        if (fillBar) {
            fillBar.style.width = `${perc}%`;
            fillBar.style.background = "#00ff66";
        }

        if (currentSecs >= 240) {
            if (window.cwgQsoTimerInterval) {
                clearInterval(window.cwgQsoTimerInterval);
                window.cwgQsoTimerInterval = null;
            }

            const endNow = new Date();
            const endHh = String(endNow.getHours()).padStart(2, '0');
            const endMm = String(endNow.getMinutes()).padStart(2, '0');
            const endTimeInput = document.getElementById('cwgLogEndTime');
            if (endTimeInput && (!endTimeInput.value || endTimeInput.value.trim() === "")) {
                endTimeInput.value = `${endHh}:${endMm}`;
            }

            window.startCwgKeysExchangePhase();
        }
    };

    updateTimerUI();
    window.cwgQsoTimerInterval = setInterval(() => {
        window.cwgQsoTimerSeconds++;
        updateTimerUI();
    }, 1000);
};

window.startCwgKeysExchangePhase = function() {
    const keysSec = document.getElementById('cwgKeysSection');
    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const stepHelp = document.getElementById('cwgKeysStepHelpText');
    const txBox = document.getElementById('cwgTxKeyDisplayBox');

    if (keysSec) keysSec.style.display = "block";
    window.cwgExchangeSecondsLeft = 120;

    if (window.isCwgInitiator) {
        // UTENTE A: Genera e mostra SUBITO la propria Chiave TX da trasmettere
        window.requestCwgTxKey();
        if (stepHelp) {
            stepHelp.textContent = "① Trasmetti la tua Chiave TX in Morse a B, e scrivi qui sotto la Chiave RX che B ti invierà entro 2 minuti!";
            stepHelp.style.color = "#00bcd4";
        }
    } else {
        // UTENTE B: La propria Chiave TX rimane NASCOSTA finché B non inserisce la chiave di A!
        if (txBox) txBox.style.display = "none";
        if (stepHelp) {
            stepHelp.textContent = "① Ricevi la Chiave Morse di A ed inseriscila nel campo qui sotto entro 2 minuti per sbloccare la tua Chiave TX!";
            stepHelp.style.color = "#ff9800";
        }
    }

    if (window.cwgExchangeTimerInterval) clearInterval(window.cwgExchangeTimerInterval);

    window.cwgExchangeTimerInterval = setInterval(() => {
        window.cwgExchangeSecondsLeft--;
        const left = window.cwgExchangeSecondsLeft;

        const mins = String(Math.floor(left / 60)).padStart(2, '0');
        const secs = String(left % 60).padStart(2, '0');

        if (timerDisp) {
            timerDisp.textContent = `⏱️ SCAMBIO CHIAVI: ${mins}:${secs}`;
            timerDisp.style.color = left < 30 ? "#f44336" : "#ff9800";
        }

        const perc = Math.max(0, (left / 120) * 100);
        if (fillBar) {
            fillBar.style.width = `${perc}%`;
            fillBar.style.background = left < 30 ? "#f44336" : "#ff9800";
        }

        if (left <= 0) {
            clearInterval(window.cwgExchangeTimerInterval);
            window.cwgExchangeTimerInterval = null;

            const rxInput = document.getElementById('cwgRxKeyInput');
            const rxKey = rxInput ? rxInput.value.trim() : "";

            if (rxKey.length === 8) {
                showToast("⏱️ Tempo di scambio scaduto. Salvataggio automatico del Log...");
                window.saveCwgQsoLog();
            } else {
                alert("⏱️ TEMPO LIMITE SCADUTO (2 Minuti superati)!\n\nNon è stata inserita una Chiave valida entro il tempo limite. Il QSO viene annullato (0 Punti).");
                window.resetCwgForm();
            }
        }
    }, 1000);
};

window.onCwgRxKeyInputChanged = function() {
    const rxInput = document.getElementById('cwgRxKeyInput');
    const rxKey = rxInput ? rxInput.value.trim().toUpperCase() : "";
    const saveBtn = document.getElementById('btnSaveCwgQso');

    if (rxKey.length === 8) {
        // Quando Utente B inserisce la chiave ricevuta da A, sblocchiamo e mostriamo la Chiave TX di B!
        if (!window.isCwgInitiator || !window.cwgGeneratedTxKey) {
            window.requestCwgTxKey();
        }
        if (saveBtn) saveBtn.disabled = false;
    } else {
        if (saveBtn) saveBtn.disabled = true;
    }
};

window.requestCwgTxKey = async function() {
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!partnerCall || partnerCall.length < 2) return;

    const txBox = document.getElementById('cwgTxKeyDisplayBox');
    const txText = document.getElementById('cwgTxKeyText');

    if (txText) txText.textContent = "Generazione...";
    if (txBox) txBox.style.display = "block";

    const serverUrl = (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL)
        ? VALIDATION_SERVER_URL
        : "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    try {
        const url = `${serverUrl}?action=generate_cwg_key&userId=${window.myId}&partnerCall=${encodeURIComponent(partnerCall)}&band=${encodeURIComponent(band)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data && data.status === 'ok' && data.key) {
            window.cwgGeneratedTxKey = data.key;
            if (txText) txText.textContent = data.key;
        } else {
            if (txText) txText.textContent = "ERRORE";
        }
    } catch(e) {
        console.error("CWG Key Fetch Error:", e);
        const fallbackKey = "K" + String(Date.now()).slice(-7);
        window.cwgGeneratedTxKey = fallbackKey;
        if (txText) txText.textContent = fallbackKey;
    }
};

window.saveCwgQsoLog = async function() {
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!myCall || myCall.length < 2) return alert("⚠️ Inserisci prima il tuo Nominativo / Call.");

    window.saveMyActivityCallPreference(myCall);

    let endTimeInput = document.getElementById('cwgLogEndTime');
    if (endTimeInput && (!endTimeInput.value || endTimeInput.value.trim() === "")) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        endTimeInput.value = `${hh}:${mm}`;
    }

    const startTime = (document.getElementById('cwgLogStartTime')?.value || "").trim();
    const endTime = endTimeInput ? endTimeInput.value.trim() : "";
    const rstTx = (document.getElementById('cwgLogRstTx')?.value || "599").trim();
    const rstRx = (document.getElementById('cwgLogRstRx')?.value || "599").trim();
    const rxKey = (document.getElementById('cwgRxKeyInput')?.value || "").trim().toUpperCase();
    const txKey = window.cwgGeneratedTxKey;

    if (!partnerCall || partnerCall.length < 2) return alert("⚠️ Inserisci un Call del corrispondente valido.");
    if (rxKey.length !== 8) return alert("⚠️ La Chiave Ricevuta deve contenere esattamente 8 caratteri.");
    if (!txKey) return alert("⚠️ Chiave di Trasmissione non ancora generata.");

    if (window.cwgExchangeTimerInterval) {
        clearInterval(window.cwgExchangeTimerInterval);
        window.cwgExchangeTimerInterval = null;
    }

    if (!confirm(`CONFERMA SALVATAGGIO DEFINITIVO:\n\nQSO con: ${partnerCall}\nBanda: ${band}\nOra Inizio: ${startTime} | Ora Fine: ${endTime}\nChiave RX: ${rxKey}\nChiave TX: ${txKey}\n\nATTENZIONE: Una volta salvato, il Log NON potrà più essere modificato o eliminato. Procedere?`)) {
        return;
    }

    if (typeof showToast === 'function') showToast("Salvataggio Log QSO in corso...");

    const serverUrl = (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL)
        ? VALIDATION_SERVER_URL
        : "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    try {
        const saveUrl = `${serverUrl}?action=save_cwg_qso&userId=${window.myId}&userName=${encodeURIComponent(myCall)}&partnerCall=${encodeURIComponent(partnerCall)}&band=${encodeURIComponent(band)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&rstTx=${encodeURIComponent(rstTx)}&rstRx=${encodeURIComponent(rstRx)}&rxKey=${encodeURIComponent(rxKey)}&txKey=${encodeURIComponent(txKey)}`;
        const resp = await fetch(saveUrl);
        const resData = await resp.json();

        if (resData && resData.status === 'ok') {
            alert(`✅ QSO CONVALIDATO E SALVATO!\n\nPunti Assegnati: +${resData.points || 1} pt\n\n${resData.message || ""}`);
            window.resetCwgForm();
            if (typeof window.showScreen === 'function') window.showScreen('setupScreen');
        } else {
            alert("⚠️ " + (resData.message || "Errore durante il salvataggio del QSO."));
        }
    } catch(e) {
        console.error("CWG Save Error:", e);
        alert("Errore di connessione durante il salvataggio. Riprova tra poco.");
    }
};
