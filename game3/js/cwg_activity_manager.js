// js/cwg_activity_manager.js - Gestore Attività Activity - CWG (Log QSO & Chiavi 4 Minuti)

window.cwgQsoTimerInterval = null;
window.cwgQsoTimerSeconds = 0;
window.cwgGeneratedTxKey = "";
window.cwgLiveQsoListenerRef = null;

window.openCwgActivityScreen = async function() {
    const isBeta = typeof window.isUserCwgBetaTester === 'function' ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) {
        return alert("⚠️ Questa modalità è attualmente riservata ai Beta Tester autorizzati.");
    }

    if (typeof window.showScreen === 'function') {
        window.showScreen('cwgActivityScreen');
    }

    window.resetCwgForm();
};

window.resetCwgForm = function() {
    if (window.cwgQsoTimerInterval) {
        clearInterval(window.cwgQsoTimerInterval);
        window.cwgQsoTimerInterval = null;
    }
    window.cwgQsoTimerSeconds = 0;
    window.cwgGeneratedTxKey = "";

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

    if (timerDisp) {
        timerDisp.textContent = "00:00 / 04:00";
        timerDisp.style.color = "#00ff66";
    }
    if (fillBar) fillBar.style.width = "0%";
    if (keysSec) keysSec.style.display = "none";
    if (txBox) txBox.style.display = "none";
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = "none";
    if (rxInput) rxInput.value = "";

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "▶️ AVVIA QSO & TIMER 4 MINUTI";
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

window.listenToPartnerCwgTimerSync = function() {
    if (!db || !window.myName) return;
    const partnerCall = (document.getElementById('cwgLogPartnerCall')?.value || "").trim().toUpperCase();
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!partnerCall || partnerCall.length < 3) return;

    if (window.cwgLiveQsoListenerRef) {
        try { window.cwgLiveQsoListenerRef.off(); } catch(e) {}
        window.cwgLiveQsoListenerRef = null;
    }

    // Ascoltiamo se il corrispondente ha già avviato il timer per noi
    const liveKey = `${window.myName.toUpperCase()}_${partnerCall}_${band}`;
    const liveRef = db.ref(`activity_cwg/live_qso/${liveKey}`);
    window.cwgLiveQsoListenerRef = liveRef;

    liveRef.on('value', snap => {
        if (!snap.exists()) return;
        const data = snap.val() || {};
        const startTime = data.startTime || 0;
        const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);

        // Se il QSO del corrispondente è stato avviato meno di 5 minuti fa ed il nostro timer non è ancora attivo:
        if (elapsedSecs >= 0 && elapsedSecs < 300 && !window.cwgQsoTimerInterval && window.cwgQsoTimerSeconds === 0) {
            if (typeof showToast === 'function') {
                showToast(`📡 Il corrispondente ${partnerCall} ha avviato il QSO! Timer sincronizzato.`);
            }
            window.startCwgQsoTimer(elapsedSecs);
        }
    });
};

window.startCwgQsoTimer = function(initialElapsedSeconds = 0) {
    const partnerCallInput = document.getElementById('cwgLogPartnerCall');
    const partnerCall = partnerCallInput ? partnerCallInput.value.trim().toUpperCase() : "";
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!partnerCall || partnerCall.length < 3) {
        return alert("⚠️ Inserisci prima un Nominativo (Call) del corrispondente valido.");
    }

    // Compiliamo automaticamente l'Ora di Inizio con l'orario attuale se vuota
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const startTimeInput = document.getElementById('cwgLogStartTime');
    if (startTimeInput && (!startTimeInput.value || startTimeInput.value.trim() === "")) {
        startTimeInput.value = `${hh}:${mm}`;
    }

    const startBtn = document.getElementById('btnCwgStartTimer');
    const cancelBtn = document.getElementById('btnCwgCancelQso');
    if (startBtn) startBtn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = "block";

    if (window.cwgQsoTimerInterval) clearInterval(window.cwgQsoTimerInterval);
    window.cwgQsoTimerSeconds = Number(initialElapsedSeconds) || 0;

    // Segnaliamo in tempo reale su Firebase l'avvio del QSO al corrispondente (se avviato da noi)
    if (initialElapsedSeconds === 0 && db && window.myName) {
        const myCall = window.myName.toUpperCase();
        const partnerLiveKey = `${partnerCall}_${myCall}_${band}`;
        db.ref(`activity_cwg/live_qso/${partnerLiveKey}`).set({
            startTime: Date.now(),
            startedBy: window.myId,
            myCall: myCall
        }).catch(() => {});
    }

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const keysSec = document.getElementById('cwgKeysSection');

    const updateTimerUI = () => {
        const currentSecs = window.cwgQsoTimerSeconds;

        const mins = String(Math.floor(currentSecs / 60)).padStart(2, '0');
        const secs = String(currentSecs % 60).padStart(2, '0');
        if (timerDisp) timerDisp.textContent = `${mins}:${secs} / 04:00`;

        const perc = Math.min(100, (currentSecs / 240) * 100);
        if (fillBar) fillBar.style.width = `${perc}%`;

        // Al raggiungimento dei 4 minuti (240s) sblocchiamo l'inserimento ed ORA GENERIAMO E MOSTRIAMO SUBITO LA CHIAVE TX!
        if (currentSecs >= 240) {
            if (window.cwgQsoTimerInterval) {
                clearInterval(window.cwgQsoTimerInterval);
                window.cwgQsoTimerInterval = null;
            }

            if (timerDisp) {
                timerDisp.textContent = "✅ 04:00 - QSO COMPLETO!";
                timerDisp.style.color = "#00ff66";
            }
            if (keysSec) keysSec.style.display = "block";

            // MOSTRA SUBITO LA PROPRIA CHIAVE DA TRASMETTERE IN MORSE!
            window.requestCwgTxKey();

            if (typeof showToast === 'function') {
                showToast("⏱️ 4 Minuti di QSO Raggiunti! La tua Chiave TX è pronta da inviare.");
            }

            const endNow = new Date();
            const endHh = String(endNow.getHours()).padStart(2, '0');
            const endMm = String(endNow.getMinutes()).padStart(2, '0');
            const endTimeInput = document.getElementById('cwgLogEndTime');
            if (endTimeInput && (!endTimeInput.value || endTimeInput.value.trim() === "")) {
                endTimeInput.value = `${endHh}:${endMm}`;
            }
        }
    };

    updateTimerUI();
    window.cwgQsoTimerInterval = setInterval(() => {
        window.cwgQsoTimerSeconds++;
        updateTimerUI();
    }, 1000);
};

window.onCwgRxKeyInputChanged = function() {
    const rxInput = document.getElementById('cwgRxKeyInput');
    const rxKey = rxInput ? rxInput.value.trim().toUpperCase() : "";
    const saveBtn = document.getElementById('btnSaveCwgQso');

    if (rxKey.length === 8) {
        if (saveBtn) saveBtn.disabled = false;
    } else {
        if (saveBtn) saveBtn.disabled = true;
    }
};

window.requestCwgTxKey = async function() {
    const partnerCall = (document.getElementById('cwgLogPartnerCall')?.value || "").trim().toUpperCase();
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!partnerCall || partnerCall.length < 3) return;

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
    const partnerCall = (document.getElementById('cwgLogPartnerCall')?.value || "").trim().toUpperCase();
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    // Se l'ora di fine non è stata inserita, la compiliamo automaticamente con l'orarioattuale al salvataggio
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

    if (!partnerCall || partnerCall.length < 3) return alert("⚠️ Inserisci un Call valido.");
    if (rxKey.length !== 8) return alert("⚠️ La Chiave Ricevuta deve contenere esattamente 8 caratteri.");
    if (!txKey) return alert("⚠️ Chiave di Trasmissione non ancora generata.");

    if (!confirm(`CONFERMA SALVATAGGIO DEFINITIVO:\n\nQSO con: ${partnerCall}\nBanda: ${band}\nOra Inizio: ${startTime} | Ora Fine: ${endTime}\nChiave RX: ${rxKey}\nChiave TX: ${txKey}\n\nATTENZIONE: Una volta salvato, il Log NON potrà più essere modificato o eliminato. Procedere?`)) {
        return;
    }

    if (typeof showToast === 'function') showToast("Salvataggio Log QSO in corso...");

    const serverUrl = (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL)
        ? VALIDATION_SERVER_URL
        : "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    try {
        const saveUrl = `${serverUrl}?action=save_cwg_qso&userId=${window.myId}&userName=${encodeURIComponent(window.myName)}&partnerCall=${encodeURIComponent(partnerCall)}&band=${encodeURIComponent(band)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&rstTx=${encodeURIComponent(rstTx)}&rstRx=${encodeURIComponent(rstRx)}&rxKey=${encodeURIComponent(rxKey)}&txKey=${encodeURIComponent(txKey)}`;
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
