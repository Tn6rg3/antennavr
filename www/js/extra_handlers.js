// ============================================================================
// EXTRA_HANDLERS.JS - GESTIONE STANDBY, SFIDA GIORNALIERA E ALTRI EVENTI
// ============================================================================

// 1. Tasto "ACCETTA LA SFIDA" -> Chiude il popup, crea la stanza e avvia il gioco
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.addEventListener('click', () => {
        els.dailyChallengeModal.style.display = 'none';
        currentMode = 'daily_challenge';
        isSinglePlayer = true;
        currentWpm = 15; baseWpm = 15; requestedWordCount = 20; currentTone = 600;
        isFixedSpeed = false; isEasyMode = false;
        window.charSpaceWpm = 0; window.wordSpaceMult = 1.0;
        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        gameWords = getGameWords(requestedWordCount, currentMode);
        db.ref('rooms/' + roomCode).set({ status: 'countdown', type: 'single', mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords, fixedSpeed: isFixedSpeed, charSpaceWpm: 0, wordSpaceMult: 1.0, createdAt: firebase.database.ServerValue.TIMESTAMP, hostId: myId }).then(() => joinRoomLogic(false));
    });
}

// 2. Tasto "Più Tardi"
if (els.btnPlayDailyLater) { els.btnPlayDailyLater.addEventListener('click', () => { els.dailyChallengeModal.style.display = 'none'; }); }

// 3. Tasto "Rifiuta per oggi"
if (els.btnDeclineDaily) { els.btnDeclineDaily.addEventListener('click', () => { let todayStr = new Date().toISOString().split('T')[0]; localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr); els.dailyChallengeModal.style.display = 'none'; }); }

// 4. Tasto di chiusura "X" del banner Battaglia Serale
if (els.btnCloseBRBanner) { els.btnCloseBRBanner.addEventListener('click', () => { if (els.brBanner) els.brBanner.style.display = 'none'; if (brBannerTimeout) clearTimeout(brBannerTimeout); brBannerDismissedToday = true; if (brRoomCode) db.ref(`rooms/${brRoomCode}/players`).off('value'); }); }

// --- GESTIONE STANDBY / SPEGNIMENTO SCHERMO DURANTE IL GIOCO ---
window.lostFocusDuringWord = false;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (gameRunning && inputActive) { window.lostFocusDuringWord = true; stopAllMorseAudio(); } }
    else {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        startBluetoothKeepAlive();
        if (gameRunning && window.lostFocusDuringWord) {
            window.lostFocusDuringWord = false; inputActive = false; showToast("⚠️ Schermo spento: parola considerata persa!");
            if (currentMode === 'conquest') { db.ref(`rooms/${roomCode}/coop_state`).transaction(state => { if (!state || state.status !== 'playing') return state; state.progress = Math.max(0, (state.progress || 0) - 2); return state; }); setTimeout(() => { if (gameRunning) startCoopSequence(); }, 1000); }
            else if (currentMode === 'quiz') { submitQuizAnswer(-1); }
            else if (currentMode === 'pingpong') { sendAutoPingPongWord(); }
            else {
                currentWpm = Math.max(10, currentWpm - 2); if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
                const missedWord = gameWords[wordIndex] ? gameWords[wordIndex].toUpperCase() : "-";
                matchDetailsArray.push({ real: missedWord, typed: "TIMEOUT (SCHERMO)", points: 0, wpm: currentWpm, ms: 0 });
                if (els.tableBody) { const tr = document.createElement('tr'); const tdTyped = document.createElement('td'); tdTyped.textContent = "TIMEOUT"; tdTyped.style.color = "#d32f2f"; tdTyped.style.fontSize = "0.8em"; const tdReal = document.createElement('td'); tdReal.innerHTML = `<b>${escapeHTML(missedWord)}</b>`; const tdPoints = document.createElement('td'); tdPoints.style.color = "#d32f2f"; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = "0"; tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.tableBody.appendChild(tr); if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight; }
                wordIndex++; setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
            }
        }
    }
});
