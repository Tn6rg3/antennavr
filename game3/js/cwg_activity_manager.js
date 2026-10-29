// js/cwg_activity_manager.js - Gestore Attività Activity - CWG (Log QSO, Handshake Corrispondenza & Chiavi A/B con Timer 2 min)

window.cwgQsoTimerInterval = null;
window.cwgExchangeTimerInterval = null;
window.cwgQsoTimerSeconds = 0;
window.cwgExchangeSecondsLeft = 120; // 2 Minuti per lo scambio chiavi
window.cwgGeneratedTxKey = "";
window.cwgLiveQsoListenerRef = null;
window.isCwgInitiator = false; // true se l'utente è Utente A (chi avvia per primo)
window.cwgMyHandshakeTs = 0;

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

    // Verifica / Richiesta obbligatoria del Nominativo Activity (SENZA mai usare lo username Telegram)
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
        // Pulizia preliminare di eventuali spot precedenti per la stessa banda per evitare duplicati
        window.removeCwgCqSpot(true, band);

        const text = `📡 [SPOT CQ ACTIVITY]: ${myCall} sta facendo chiamata CQ Activity - CWG sulla banda ${band}! 📻`;

        // 1. Pubblica in Chat Globale
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

        // 2. Pubblica in Bacheca Sfide (public_lobby_rooms) con rimozione automatica alla disconnessione!
        const spotId = `cq_spot_${myCall}_${band}`;
        const spotRef = db.ref(`public_lobby_rooms/${spotId}`);

        spotRef.onDisconnect().remove(); // Cancella automaticamente se l'utente chiude l'app o si disconnette

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

    // 1. Rimuove dalla Bacheca Sfide (public_lobby_rooms)
    const spotId = `cq_spot_${myCall}_${band}`;
    db.ref(`public_lobby_rooms/${spotId}`).remove().catch(() => {});

    // 2. Rimuove lo spot specifico dalla Chat Globale
    if (window.lastCqSpotMsgKey) {
        db.ref(`globalChat/${window.lastCqSpotMsgKey}`).remove().catch(() => {});
        window.lastCqSpotMsgKey = null;
    }

    // Cerca e rimuove eventuali altri spot dello stesso utente per pulizia completa
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

// Listener per pulizia spot alla chiusura della scheda o dell'app
window.addEventListener('beforeunload', () => {
    try { window.removeCwgCqSpot(true); } catch(e) {}
});
                        db.ref(`globalChat/${c.key}`).remove().catch(() => {});
                    }
                });
            }
        });

        if (typeof showToast === 'function') showToast(`📡 Spot CQ rimosso con successo!`);
    }
};

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

    // Registriamo su Firebase che noi (myCall) stiamo collegando partnerCall sulla banda selezionata
    const myPresenceKey = `${myCall}_${partnerCall}_${band}`;
    const myPresenceRef = db.ref(`activity_cwg/handshake/${myPresenceKey}`);
    myPresenceRef.set({
        myCall: myCall,
        partnerCall: partnerCall,
        band: band,
        ts: nowTs
    }).catch(() => {});

    // Ascoltiamo se anche il partnerCall ha registrato che sta collegando myCall sulla stessa banda
    const partnerPresenceKey = `${partnerCall}_${myCall}_${band}`;
    const partnerPresenceRef = db.ref(`activity_cwg/handshake/${partnerPresenceKey}`);
    window.cwgLiveQsoListenerRef = partnerPresenceRef;

    // Verifica presenza utente nel database del gioco per avviso
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

        // Se la richiesta del partner è recente (ultimi 5 minuti)
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

            // IL TIMER PARTE UNICAMENTE ORA A CORRISPONDENZA CONFERMATA!
            if (!window.cwgQsoTimerInterval && window.cwgQsoTimerSeconds === 0) {
                if (typeof showToast === 'function') {
                    showToast(`🟢 Corrispondenza confermata tra ${myCall} e ${partnerCall}! Timer 4 Minuti avviato.`);
                }

                // Determiniamo chi è Utente A (chi ha salvato la presenza prima)
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

    // Attiviamo l'handshake e mettiamo il timer in STANDBY finché non c'è corrispondenza reciproca!
    window.checkCwgDoubleHandshakeMatch();
};

window.runCwgQsoTimerCountdown = function(initialElapsedSeconds = 0, isInitiator = true) {
    window.isCwgInitiator = isInitiator;

    // Compiliamo automaticamente l'Ora di Inizio con l'orario attuale se vuota
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const startTimeInput = document.getElementById('cwgLogStartTime');
    if (startTimeInput && (!startTimeInput.value || startTimeInput.value.trim() === "")) {
        startTimeInput.value = `${hh}:${mm}`;
    }

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

        // Al raggiungimento dei 4 minuti (240s) sblocchiamo la fase scambio
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

            // AVVIO FASE SCAMBIO CHIAVI CON TIMER LIMITE DI 2 MINUTI (120s)
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

    if (keysSec) keysSec.style.display = "block";
    window.cwgExchangeSecondsLeft = 120; // 2 minuti esatti

    if (window.isCwgInitiator) {
        // UTENTE A (Iniziatore): Genera e mostra SUBITO la propria Chiave TX da trasmettere
        window.requestCwgTxKey();
        if (stepHelp) {
            stepHelp.textContent = "① Trasmetti la tua Chiave TX in Morse a B, e scrivi qui sotto la Chiave RX che B ti invierà entro 2 minuti!";
            stepHelp.style.color = "#00bcd4";
        }
    } else {
        // UTENTE B (Partner): Deve prima inserire la chiave di A per sbloccare la propria Chiave TX
        if (stepHelp) {
            stepHelp.textContent = "① Ricevi la Chiave Morse di A ed inseriscila nel campo qui sotto entro 2 minuti!";
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

        // SCADENZA TIMER 2 MINUTI SCAMBIO
        if (left <= 0) {
            clearInterval(window.cwgExchangeTimerInterval);
            window.cwgExchangeTimerInterval = null;

            const rxInput = document.getElementById('cwgRxKeyInput');
            const rxKey = rxInput ? rxInput.value.trim() : "";

            if (rxKey.length === 8) {
                // Se la chiave è stata inserita in tempo, salva automaticamente
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
        // Se siamo Utente B e non avevamo ancora generato la nostra chiave TX, la generiamo ORA!
        if (!window.isCwgInitiator && !window.cwgGeneratedTxKey) {
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
