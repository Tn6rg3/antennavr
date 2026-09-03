// js/spectator_manager.js

window.watchSpecificRoom = function(code, targetName) {
    // RESET STATO LOCALE PER EVITARE INTERFERENZE (Fix parole invece di gruppi)
    gameRunning = false;
    inputActive = false;
    currentMode = 'spectator';
    isCourseMode = false;
    wordIndex = 0;
    gameWords = [];
    window.lastSpectatorAudioTs = 0; // RESET TIMESTAMP PER NUOVA SESSIONE
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    // Ripristino Audio Context (Necessario per iOS/iPhone Tutor)
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
    if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.style.display = 'none';

    const mySpectatorRef = db.ref(`rooms/${roomCode}/spectators/${myId}`);
    mySpectatorRef.set({ name: myName, ts: firebase.database.ServerValue.TIMESTAMP });
    mySpectatorRef.onDisconnect().remove();

    const roomRef = db.ref(`rooms/${roomCode}`);
    let hostDetailsListener = null;

    const onStatusChange = roomRef.on('value', snap => {
        if (!snap.exists()) {
            showToast("⚠️ Il giocatore ha terminato o abbandonato la partita.");
            window.stopWatchingCleanly();
            return;
        }

        const roomData = snap.val();
        const hostId = roomData.hostId;
        const players = roomData.players || {};
        const hostData = players[hostId] || Object.values(players)[0];

        if (roomData.tone) currentTone = roomData.tone;

        if (!hostData || hostData.finished) {
            showToast("🏁 La partita che stavi osservando è terminata!");
            window.stopWatchingCleanly();
            return;
        }

        // --- SINCRONIZZAZIONE TABELLA (MATCH DETAILS) ---
        // OTTIMIZZAZIONE: Carichiamo lo storico completo solo una volta all'ingresso
        if (!hostDetailsListener && hostId) {
            console.log("Spectator: Initializing Incremental Sync for Host:", hostId);

            // 1. Caricamento iniziale dei dati presenti (una sola volta)
            roomRef.child(`players/${hostId}/matchDetailsFull`).once('value', initSnap => {
                if (els.tableBody) els.tableBody.innerHTML = "";
                if (initSnap.exists()) {
                    initSnap.val().forEach(row => window.appendSpectatorRow(row));
                }
            });

            // 2. Ascolto solo dell'ULTIMO aggiornamento (Risparmio download massiccio)
            hostDetailsListener = roomRef.child(`players/${hostId}/lastUpdate`).on('value', dSnap => {
                const lastRow = dSnap.val();
                if (!lastRow) return;
                window.appendSpectatorRow(lastRow);
            });
        }

        const currentSpeed = hostData.wpm || roomData.wpm || 20;
        if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${currentSpeed}`;
        if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${hostData.score || 0}`;
    });

    const onAudioChange = db.ref(`rooms/${roomCode}/liveAudio`).on('value', snap => {
        const audioData = snap.val();
        if (audioData && audioData.word) {
            const liveWpm = audioData.wordWpm || audioData.wpm || 20;

            if (els.permanentGameInput) {
                els.permanentGameInput.placeholder = `📻 Segnale in arrivo (${liveWpm} WPM)...`;
            }

            if (els.wpmDisplay) {
                els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`;
            }

            // Se non c'è ancora un'attività recente in tabella, mostriamo l'avviso di ricezione SENZA rivelare la parola
            if (els.tableBody && els.tableBody.children.length === 0) {
                els.tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--link-color); padding:20px;">🎧 Ricezione segnale in corso...</td></tr>`;
            }

            // Evitiamo di riprodurre la stessa parola più volte (controllo ts o wordId)
            const msgTs = audioData.ts || 0;
            if (msgTs > (window.lastSpectatorAudioTs || 0)) {
                window.lastSpectatorAudioTs = msgTs;
                if (typeof playMorseAudio === 'function') playMorseAudio(audioData.word, liveWpm, true);
            }
        }
    }, (error) => {
        console.error("Spectator Audio Observer Error:", error);
    });

    window.currentSpectatorCleanup = function() {
        if (hostDetailsListener) roomRef.child('players').off();
        roomRef.off('value');
        db.ref(`rooms/${roomCode}/liveAudio`).off('value', onAudioChange);
        mySpectatorRef.remove();
    };
};

window.appendSpectatorRow = function(row) {
    if (!els.tableBody || !row) return;

    // Rimuoviamo eventuale riga "In ascolto segnale..." / "In attesa..."
    const waitingCell = els.tableBody.querySelector('td[colspan="3"]');
    if (waitingCell && waitingCell.parentElement) {
        waitingCell.parentElement.remove();
    }

    // Evitiamo duplicati (controllo base se la parola reale è l'ultima inserita)
    const rows = els.tableBody.querySelectorAll('tr');
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        if (lastRow.cells[1] && lastRow.cells[1].textContent === row.real && lastRow.cells[0].textContent === (row.typed || "-")) return;
    }

    const tr = document.createElement('tr');
    const tdTyped = document.createElement('td');
    tdTyped.textContent = row.typed || "-";

    const tdReal = document.createElement('td');
    const bReal = document.createElement('b');
    if (typeof window.renderDiffSecure === 'function') window.renderDiffSecure(bReal, row.real, row.typed || "");
    else bReal.textContent = row.real;
    tdReal.appendChild(bReal);

    const tdPoints = document.createElement('td');
    tdPoints.style.color = row.points > 0 ? "#4caf50" : "#d32f2f";
    tdPoints.style.fontWeight = "bold";
    tdPoints.textContent = row.points > 0 ? "OK" : "ERR";

    tr.appendChild(tdTyped);
    tr.appendChild(tdReal);
    tr.appendChild(tdPoints);
    els.tableBody.appendChild(tr);

    if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
};

window.stopWatchingCleanly = function() {
    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }
    setTimeout(() => {
        roomCode = "";
        window.goBackToMenu();
    }, 2500);
};
