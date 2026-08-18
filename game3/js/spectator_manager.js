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

    // OTTIMIZZAZIONE SPETTATORE: Invece di ascoltare l'intera stanza (pesante),
    // ascoltiamo solo i matchDetails e lo stato di finitura del giocatore host.
    const onDetailsChange = roomRef.child(`players/${code.replace('COURSE_', '').replace('SOLO_', '').replace('DAILY_', '')}/matchDetails`).on('value', snap => {
        if (!snap.exists()) return;
        const matchDetails = snap.val();

        if (els.tableBody) {
            els.tableBody.innerHTML = "";
            matchDetails.forEach(row => {
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
                tdPoints.textContent = row.points;

                tr.appendChild(tdTyped);
                tr.appendChild(tdReal);
                tr.appendChild(tdPoints);
                els.tableBody.appendChild(tr);
            });

            setTimeout(() => {
                if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
            }, 50);
        }
    });

    const onStatusChange = roomRef.on('value', snap => {
        if (!snap.exists()) {
            showToast("⚠️ Il giocatore ha terminato o abbandonato la partita.");
            window.stopWatchingCleanly();
            return;
        }

        const roomData = snap.val();
        // Cerchiamo l'Host/Corsista usando l'hostId salvato nella stanza
        const hostData = roomData.players ? (roomData.players[roomData.hostId] || Object.values(roomData.players)[0]) : null;

        if (roomData.tone) currentTone = roomData.tone;

        if (!hostData || hostData.finished) {
            showToast("🏁 La partita che stavi osservando è terminata!");
            window.stopWatchingCleanly();
            return;
        }

        const currentSpeed = hostData.wpm || roomData.wpm || 20;
        if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${currentSpeed}`;
        if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${hostData.score || 0}`;
    });

    const onAudioChange = db.ref(`rooms/${roomCode}/liveAudio`).on('value', snap => {
        const audioData = snap.val();
        if (audioData && audioData.word) {
            // Se non c'è ancora un'attività recente in tabella, mostriamo che siamo in attesa
            if (els.tableBody && els.tableBody.innerHTML === "") {
                els.tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--link-color); padding:20px;">🎧 In attesa di ricezione segnali...</td></tr>`;
            }

            // Evitiamo di riprodurre la stessa parola più volte (controllo ts o wordId)
            const msgTs = audioData.ts || 0;
            if (msgTs > (window.lastSpectatorAudioTs || 0)) {
                window.lastSpectatorAudioTs = msgTs;
                const liveWpm = audioData.wordWpm || audioData.wpm || 20;
                if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`;
                if (typeof playMorseAudio === 'function') playMorseAudio(audioData.word, liveWpm, true);
            }
        }
    }, (error) => {
        console.error("Spectator Audio Observer Error:", error);
    });

    window.currentSpectatorCleanup = function() {
        roomRef.child('players').off(); // Spegne i listener sui dettagli
        roomRef.off('value'); // Spegne listener di stato
        db.ref(`rooms/${roomCode}/liveAudio`).off('value', onAudioChange);
        mySpectatorRef.remove();
    };
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
