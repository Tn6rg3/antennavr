// js/cwg_activity_manager.js - Gestore Attività Activity - CWG (Log QSO & Chiavi 4 Minuti)

window.cwgQsoTimerInterval = null;
window.cwgQsoTimerSeconds = 0;
window.cwgGeneratedTxKey = "";

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

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const keysSec = document.getElementById('cwgKeysSection');
    const txBox = document.getElementById('cwgTxKeyDisplayBox');
    const saveBtn = document.getElementById('btnSaveCwgQso');
    const startBtn = document.getElementById('btnCwgStartTimer');

    if (timerDisp) timerDisp.textContent = "00:00 / 04:00";
    if (fillBar) fillBar.style.width = "0%";
    if (keysSec) keysSec.style.display = "none";
    if (txBox) txBox.style.display = "none";
    if (saveBtn) saveBtn.disabled = true;
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "▶️ AVVIA QSO & TIMER 4 MINUTI";
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    if (document.getElementById('cwgLogStartTime')) document.getElementById('cwgLogStartTime').value = `${hh}:${mm}`;
};

window.startCwgQsoTimer = function() {
    const partnerCallInput = document.getElementById('cwgLogPartnerCall');
    const partnerCall = partnerCallInput ? partnerCallInput.value.trim() : "";

    if (!partnerCall || partnerCall.length < 3) {
        return alert("⚠️ Inserisci prima un Nominativo (Call) del corrispondente valido.");
    }

    const startBtn = document.getElementById('btnCwgStartTimer');
    if (startBtn) startBtn.disabled = true;

    if (window.cwgQsoTimerInterval) clearInterval(window.cwgQsoTimerInterval);
    window.cwgQsoTimerSeconds = 0;

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const keysSec = document.getElementById('cwgKeysSection');

    window.cwgQsoTimerInterval = setInterval(() => {
        window.cwgQsoTimerSeconds++;
        const currentSecs = window.cwgQsoTimerSeconds;

        const mins = String(Math.floor(currentSecs / 60)).padStart(2, '0');
        const secs = String(currentSecs % 60).padStart(2, '0');
        if (timerDisp) timerDisp.textContent = `${mins}:${secs} / 04:00`;

        const perc = Math.min(100, (currentSecs / 240) * 100);
        if (fillBar) fillBar.style.width = `${perc}%`;

        // Al raggiungimento dei 4 minuti (240s) sblocchiamo l'inserimento chiavi
        if (currentSecs >= 240) {
            clearInterval(window.cwgQsoTimerInterval);
            window.cwgQsoTimerInterval = null;

            if (timerDisp) {
                timerDisp.textContent = "✅ 04:00 - QSO SBLOCCATO!";
                timerDisp.style.color = "#00ff66";
            }
            if (keysSec) keysSec.style.display = "block";
            if (typeof showToast === 'function') {
                showToast("⏱️ 4 Minuti di QSO Raggiunti! Ora puoi inserire la Chiave Ricevuta.");
            }

            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            if (document.getElementById('cwgLogEndTime')) document.getElementById('cwgLogEndTime').value = `${hh}:${mm}`;
        }
    }, 1000);
};

window.onCwgRxKeyInputChanged = function() {
    const rxInput = document.getElementById('cwgRxKeyInput');
    const rxKey = rxInput ? rxInput.value.trim().toUpperCase() : "";
    const saveBtn = document.getElementById('btnSaveCwgQso');

    if (rxKey.length === 8) {
        window.requestCwgTxKey();
    } else {
        const txBox = document.getElementById('cwgTxKeyDisplayBox');
        if (txBox) txBox.style.display = "none";
        if (saveBtn) saveBtn.disabled = true;
    }
};

window.requestCwgTxKey = async function() {
    const partnerCall = (document.getElementById('cwgLogPartnerCall')?.value || "").trim().toUpperCase();
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!partnerCall || partnerCall.length < 3) {
        return alert("⚠️ Nominativo mancante.");
    }

    const txBox = document.getElementById('cwgTxKeyDisplayBox');
    const txText = document.getElementById('cwgTxKeyText');
    const saveBtn = document.getElementById('btnSaveCwgQso');

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
            if (saveBtn) saveBtn.disabled = false;
        } else {
            if (txText) txText.textContent = "ERRORE";
            alert("Errore generazione chiave server.");
        }
    } catch(e) {
        console.error("CWG Key Fetch Error:", e);
        // Fallback locale di emergenza se la rete fallisce
        const fallbackKey = "K" + String(Date.now()).slice(-7);
        window.cwgGeneratedTxKey = fallbackKey;
        if (txText) txText.textContent = fallbackKey;
        if (saveBtn) saveBtn.disabled = false;
    }
};

window.saveCwgQsoLog = async function() {
    const partnerCall = (document.getElementById('cwgLogPartnerCall')?.value || "").trim().toUpperCase();
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();
    const startTime = (document.getElementById('cwgLogStartTime')?.value || "").trim();
    const endTime = (document.getElementById('cwgLogEndTime')?.value || "").trim();
    const rstTx = (document.getElementById('cwgLogRstTx')?.value || "599").trim();
    const rstRx = (document.getElementById('cwgLogRstRx')?.value || "599").trim();
    const rxKey = (document.getElementById('cwgRxKeyInput')?.value || "").trim().toUpperCase();
    const txKey = window.cwgGeneratedTxKey;

    if (!partnerCall || partnerCall.length < 3) return alert("⚠️ Inserisci un Call valido.");
    if (rxKey.length !== 8) return alert("⚠️ La Chiave Ricevuta deve contenere esattamente 8 caratteri.");
    if (!txKey) return alert("⚠️ Chiave di Trasmissione non ancora generata.");

    if (!confirm(`CONFERMA SALVATAGGIO DEFINITIVO:\n\nQSO con: ${partnerCall}\nBanda: ${band}\nChiave RX: ${rxKey}\nChiave TX: ${txKey}\n\nATTENZIONE: Una volta salvato, il Log NON potrà più essere modificato o eliminato. Procedere?`)) {
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
