// js/spectator_manager.js - Gestore Modalità Spettatore (Ascolto e Monitoraggio Inserimento Mirato)

window.watchSpecificRoom = function(code, targetName) {
    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
    }

    gameRunning = false;
    inputActive = false;
    currentMode = 'spectator';
    isCourseMode = false;
    wordIndex = 0;
    gameWords = [];
    window.lastSpectatorAudioTs = 0;
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();

    roomCode = code;
    window.showScreen('gameArea');

    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = true;
        els.permanentGameInput.placeholder = `👁️ Stai osservando la partita di ${targetName}...`;
        els.permanentGameInput.value = "";
    }

    if (els.tableBody) els.tableBody.innerHTML = "";
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Punti: 0";
    if (els.wpmDisplay) els.wpmDisplay.textContent = "👁️ SPETTATORE | WPM: --";

    const mySpectatorRef = db.ref(`rooms/${roomCode}/spectators/${myId}`);
    mySpectatorRef.set({ name: myName, ts: firebase.database.ServerValue.TIMESTAMP });
    mySpectatorRef.onDisconnect().remove();

    const roomRef = db.ref(`rooms/${roomCode}`);
    const liveAudioRef = db.ref(`rooms/${roomCode}/liveAudio`);
    let statusRef = roomRef.child('status');
    let lastUpdateRef = null;
    let hostScoreRef = null;

    // 1. Ascolto mirato dello STATO della stanza
    statusRef.on('value', snap => {
        if (currentMode !== 'spectator') return;
        if (!snap.exists() || snap.val() === 'finished' || snap.val() === 'closed') {
            showToast("🏁 La partita che stavi osservando è terminata!");
            window.stopWatchingCleanly();
        }
    });

    // 2. Lettura singola dell'Host ID ed ascolto del solo punteggio e dell'ultima parola
    roomRef.child('hostId').once('value', hSnap => {
        if (currentMode !== 'spectator' || !hSnap.exists()) return;
        const hostId = hSnap.val();

        // Lettura iniziale storico parole
        roomRef.child(`players/${hostId}/matchDetailsFull`).once('value', initSnap => {
            if (currentMode !== 'spectator') return;
            if (els.tableBody) els.tableBody.innerHTML = "";
            if (initSnap.exists()) {
                initSnap.val().forEach(row => window.appendSpectatorRow(row));
            }
        });

        // Ascolto mirato dell'ultimo aggiornamento parola
        lastUpdateRef = roomRef.child(`players/${hostId}/lastUpdate`);
        lastUpdateRef.on('value', dSnap => {
            if (currentMode !== 'spectator') return;
            const lastRow = dSnap.val();
            if (lastRow) window.appendSpectatorRow(lastRow);
        });

        // Ascolto mirato del solo punteggio e WPM
        hostScoreRef = roomRef.child(`players/${hostId}`);
        hostScoreRef.on('value', pSnap => {
            if (currentMode !== 'spectator') return;
            const pData = pSnap.val();
            if (pData) {
                if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${pData.wpm || 20}`;
                if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${pData.score || 0}`;
            }
        });
    });

    // 3. Ascolto Audio Morse in diretta
    liveAudioRef.on('value', snap => {
        if (currentMode !== 'spectator') return;
        const audioData = snap.val();
        if (audioData && audioData.word) {
            const liveWpm = audioData.wordWpm || audioData.wpm || 20;

            if (els.permanentGameInput) {
                els.permanentGameInput.placeholder = `📻 Segnale in arrivo (${liveWpm} WPM)...`;
            }

            const msgTs = audioData.ts || 0;
            if (msgTs > (window.lastSpectatorAudioTs || 0)) {
                window.lastSpectatorAudioTs = msgTs;
                if (typeof playMorseAudio === 'function') playMorseAudio(audioData.word, liveWpm, true);
            }
        }
    });

    window.currentSpectatorCleanup = function() {
        console.log("🧹 Spectator Cleanup Executed");
        try { statusRef.off(); } catch(e){}
        if (lastUpdateRef) { try { lastUpdateRef.off(); } catch(e){} }
        if (hostScoreRef) { try { hostScoreRef.off(); } catch(e){} }
        try { liveAudioRef.off(); } catch(e){}
        try { mySpectatorRef.remove(); } catch(e){}
    };
};

window.appendSpectatorRow = function(detail) {
    if (!els.tableBody || !detail) return;
    const tr = document.createElement('tr');
    const tdTyped = document.createElement('td'); tdTyped.textContent = detail.typed || "-";
    const tdReal = document.createElement('td');
    window.renderDiffSecure(tdReal, detail.real, detail.typed);
    const tdWpm = document.createElement('td');
    tdWpm.style.textAlign = 'center';
    tdWpm.style.fontWeight = 'bold';
    tdWpm.style.color = '#ff9800';
    tdWpm.style.fontSize = '0.85em';
    tdWpm.textContent = `${detail.wpm || currentWpm} WPM`;

    const tdPoints = document.createElement('td');
    tdPoints.style.textAlign = 'center';
    tdPoints.style.color = detail.points > 0 ? "#00ff66" : "#f44336";
    tdPoints.style.fontWeight = 'bold';
    tdPoints.textContent = detail.points > 0 ? `+${detail.points}` : "0";

    tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdWpm); tr.appendChild(tdPoints);
    els.tableBody.appendChild(tr);
    if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
};

window.stopWatchingCleanly = function() {
    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }
    gameRunning = false;
    currentMode = 'standard';
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
    goBackToMenu();
};
