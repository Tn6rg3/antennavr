// js/pingpong_manager.js

window.setupPingPongListener = function() {
    if (listeners.pingPong) db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong);
    listeners.pingPong = db.ref(`rooms/${roomCode}/pingpong`).on('value', snap => {
        if (!gameRunning) return;
        const ppData = snap.val();
        if (!ppData) return;

        if (ppData.lastGuess && ppData.lastGuess.id !== window.lastSeenGuessId) {
            window.lastSeenGuessId = ppData.lastGuess.id;
            const tr = document.createElement('tr');
            const tdTyped = document.createElement('td'); tdTyped.textContent = ppData.lastGuess.typed || '';
            const tdReal = document.createElement('td'); window.renderDiffSecure(tdReal, ppData.lastGuess.real, ppData.lastGuess.typed || '');

            const tdPoints = document.createElement('td');
            tdPoints.style.textAlign = 'center';
            tdPoints.style.fontWeight = 'bold';
            tdPoints.style.color = ppData.lastGuess.points > 0 ? "#4caf50" : (ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999");
            tdPoints.textContent = ppData.lastGuess.points;

            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
            if (els.tableBody) els.tableBody.appendChild(tr);
            if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }
        if (ppData.wordsPlayed >= requestedWordCount) {
            if (ppTimerInterval) clearInterval(ppTimerInterval);
            return window.finishGame();
        }
        if (ppData.senderId === myId) {
            if (!ppData.word) {
                if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'flex';
                if (els.gameInputArea) els.gameInputArea.style.display = 'none';
                if (els.pingPongWordToSend) {
                    els.pingPongWordToSend.value = '';
                    setTimeout(() => els.pingPongWordToSend.focus(), 100);
                }
                window.startPingPongTimer();
            } else {
                if (ppTimerInterval) clearInterval(ppTimerInterval);
                if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
                if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
                if (els.permanentGameInput) {
                    els.permanentGameInput.disabled = true;
                    els.permanentGameInput.placeholder = "Avversario in decodifica...";
                    els.permanentGameInput.value = "";
                }
            }
        } else {
            if (ppTimerInterval) clearInterval(ppTimerInterval);
            if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
            if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
            if (ppData.word && ppData.wordId > window.lastPlayedWordId) {
                window.lastPlayedWordId = ppData.wordId;
                gameWords[wordIndex] = ppData.word;
                if (els.permanentGameInput) {
                    els.permanentGameInput.disabled = false;
                    els.permanentGameInput.placeholder = "Decodifica e scrivi...";
                    els.permanentGameInput.value = "";
                    setTimeout(() => els.permanentGameInput.focus(), 100);
                }
                inputActive = true;
                setTimeout(() => { if (typeof playMorseAudio === 'function') playMorseAudio(ppData.word.toUpperCase(), currentWpm); }, 500);
            } else if (!ppData.word && els.permanentGameInput) {
                els.permanentGameInput.disabled = true;
                els.permanentGameInput.placeholder = "In attesa dell'avversario...";
                els.permanentGameInput.value = "";
                inputActive = false;
            }
        }
    });
};

window.startPingPongTimer = function() {
    if (ppTimerInterval) clearInterval(ppTimerInterval);
    let timeLeft = 100;
    if (els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = '100%';
    ppTimerInterval = setInterval(() => {
        timeLeft -= (100 / 300);
        if (els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) {
            clearInterval(ppTimerInterval);
            window.sendAutoPingPongWord();
        }
    }, 100);
};

window.sendAutoPingPongWord = function() {
    if (!gameRunning || currentMode !== 'pingpong') return;
    const randomWord = (window.masterDictionary && window.masterDictionary.length > 0)
        ? window.masterDictionary[Math.floor(Math.random() * window.masterDictionary.length)].toUpperCase()
        : "MORSE";
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
        if (d && !d.word) {
            d.word = randomWord;
            d.wordId = (d.wordId || 0) + 1;
        }
        return d;
    }, (error) => {
        if (error) console.error("PingPong Transaction Error:", error);
    });
    showToast(currentLang === 'it' ? "Tempo scaduto! Parola inviata automaticamente." : "Time's up! Word sent automatically.");
};
