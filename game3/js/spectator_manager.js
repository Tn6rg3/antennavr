// js/spectator_manager.js - Gestore Modalità Spettatore (Ascolto e Monitoraggio Inserimento Mirato)

window.spectatorAppendedRows = new Set();

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
    window.spectatorAppendedRows = new Set();
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
    const spectatorFeedRef = db.ref(`rooms/${roomCode}/spectatorFeed`);
    const playersRef = db.ref(`rooms/${roomCode}/players`);
    let statusRef = roomRef.child('status');

    // 1. Ascolto dello STATO della stanza
    statusRef.on('value', snap => {
        if (currentMode !== 'spectator') return;
        if (snap.exists() && (snap.val() === 'finished' || snap.val() === 'closed')) {
            showToast("🏁 La partita che stavi osservando è terminata!");
            window.stopWatchingCleanly();
        }
    });

    // 2. Ascolto FEED SPETTATORE diretto in tempo reale (Scorrimento parole e punteggio)
    let lastFeedTs = 0;
    spectatorFeedRef.on('value', snap => {
        if (currentMode !== 'spectator' || !snap.exists()) return;
        const feed = snap.val();

        if (feed && feed.ts && feed.ts > lastFeedTs) {
            lastFeedTs = feed.ts;

            if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${feed.wpm || 20}`;
            if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${feed.score || 0}`;
            if (els.wordIndexDisplay) els.wordIndexDisplay.textContent = `${feed.wordIndex || 1} / ${window.requestedWordCount || 10}`;

            if (feed.lastUpdate) {
                window.appendSpectatorRow(feed.lastUpdate);
            }
        }
    });

    // Fallback per giocatori in stanze tradizionali o multiplayer
    playersRef.on('child_changed', pSnap => {
        if (currentMode !== 'spectator' || !pSnap.exists()) return;
        const pData = pSnap.val();
        if (pData) {
            if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${pData.wpm || 20}`;
            if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${pData.score || 0}`;
            if (pData.lastUpdate) {
                window.appendSpectatorRow(pData.lastUpdate);
            }
        }
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
        try { spectatorFeedRef.off(); } catch(e){}
        try { playersRef.off(); } catch(e){}
        try { liveAudioRef.off(); } catch(e){}
        try { mySpectatorRef.remove(); } catch(e){}
    };
};

window.appendSpectatorRow = function(detail) {
    if (!els.tableBody || !detail || !detail.real) return;

    const rowKey = `${detail.ts || ''}_${detail.real}_${detail.typed || ''}`;
    if (window.spectatorAppendedRows.has(rowKey)) return;
    window.spectatorAppendedRows.add(rowKey);

    const tr = document.createElement('tr');
    const tdTyped = document.createElement('td'); tdTyped.textContent = detail.typed || "-";
    const tdReal = document.createElement('td');
    if (typeof window.renderDiffSecure === 'function') {
        window.renderDiffSecure(tdReal, detail.real, detail.typed || "");
    } else {
        tdReal.textContent = detail.real;
    }

    const tdWpm = document.createElement('td');
    tdWpm.style.textAlign = 'center';
    tdWpm.style.fontWeight = 'bold';
    tdWpm.style.color = '#ff9800';
    tdWpm.style.fontSize = '0.85em';
    tdWpm.textContent = `${detail.wpm || 20} WPM`;

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
