// --- GAMELOOP, VERIFICA E PUNTEGGI ---
function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
            else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, Math.min(matrix[i][j-1]+1, matrix[i-1][j]+1));
        }
    }
    return matrix[b.length][a.length];
}

function renderDiffSecure(container, real, typed) {
    for (let i = 0; i < Math.max(real.length, typed.length); i++) {
        if (!real[i]) continue;
        const span = document.createElement('span');
        if (!typed[i] || typed[i] !== real[i]) span.style.color = "#d32f2f";
        span.textContent = real[i];
        container.appendChild(span);
    }
}

if (els.replayWordBtn) {
    els.replayWordBtn.addEventListener('click', () => {
        if (!gameRunning || !inputActive) return;
        usedReplay = true;
        playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm);
        if (els.permanentGameInput) els.permanentGameInput.focus();
    });
}

if (els.permanentGameInput) {
    els.permanentGameInput.addEventListener('input', function() {
        if (currentMode === 'chars' && inputActive && gameRunning) {
            const val = els.permanentGameInput.value.trim().toUpperCase();
            if (val.length >= 1) {
                handleWordSubmission(val[0]);
                els.permanentGameInput.value = "";
            }
        }
    });
    els.permanentGameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') {
            const val = els.permanentGameInput.value.trim().toUpperCase();
            if (val) {
                handleWordSubmission(val);
                els.permanentGameInput.value = "";
            }
        }
    });
}

// DEFINIZIONE UNICA DI handleWordSubmission (Include nativamente "conquest" per eliminare il monkey patching)
function handleWordSubmission(userWord) {
    if (!userWord) return;
    userWord = userWord.substring(0, 50).trim().toUpperCase();

    // RAMO SPECIALE: CONQUISTA (CO-OP)
    if (currentMode === 'conquest') {
        if (coopActiveFreqIndex === 0) {
            return showToast("âš ï¸ Seleziona prima una Frequenza!");
        }

        const currentWord = gameWords[0];
        const isCorrect = userWord === currentWord;
        const gain = coopActiveFreqIndex === 1 ? 4 : (coopActiveFreqIndex === 2 ? 7 : 12);
        const penalty = coopActiveFreqIndex === 1 ? 2 : (coopActiveFreqIndex === 2 ? 3 : 5);

        inputActive = false;

        if (isCorrect) {
            currentWpm += 2;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
            showToast(`âœ… CORRETTO! +${gain}% (VelocitÃ  -> ${currentWpm} WPM)`);
            playBeep(880, 0.1);

            db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.min(100, (state.progress || 0) + gain);

                if (!Array.isArray(state.activeWords) || state.activeWords.length !== 3) {
                    state.activeWords = generateCoopTripleWords();
                    return state;
                }

                const idx = coopActiveFreqIndex - 1;
                if (idx >= 0 && idx < 3) {
                    const nextWords = generateCoopTripleWords();
                    state.activeWords[idx] = nextWords[idx];
                }
                return state;
            });
        } else {
            currentWpm = Math.max(10, currentWpm - 2);
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
            showToast(`âŒ ERRORE! -${penalty}% (VelocitÃ  -> ${currentWpm} WPM)`);
            playBeep(300, 0.25);

            db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.max(0, (state.progress || 0) - penalty);
                return state;
            });
        }

        setTimeout(() => {
            if (!gameRunning) return;
            if (els.permanentGameInput) {
                els.permanentGameInput.value = "";
                els.permanentGameInput.focus();
            }
            inputActive = true;

            if (!isCorrect && gameWords[0]) {
                stopAllMorseAudio();
                playMorseAudio(gameWords[0], currentWpm);
            }
        }, 1500);
        return;
    }

    // RAMO STANDARD / MODALITÃ€ CLASSICHE
    inputActive = false;
    const currentWord = gameWords[wordIndex].toUpperCase();
    let points = 0, scoreColor = "";
    const reactionMs = Date.now() - lastWordStartTime;
    const levDist = getLevenshteinDistance(currentWord, userWord);

    if (typeof window.calculateGamePoints === 'function') {
        const res = window.calculateGamePoints(currentMode, currentWord, userWord, currentWpm, reactionMs, levDist, usedReplay);
        points = res.points;
        scoreColor = res.scoreColor;
    } else {
        if (currentMode === 'chars') {
            if (userWord === currentWord) {
                points = Math.max(100, Math.floor(1000 - (reactionMs / 2)));
                scoreColor = "#4caf50";
            } else {
                points = 0;
                scoreColor = "#d32f2f";
            }
        } else {
            const basePoints = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2));
            const estimatedAudioMs = (currentWord.length * 60 / currentWpm) * 1000;
            let timeMultiplier = 1.0;
            if (reactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000));
            else if (reactionMs < estimatedAudioMs && levDist === 0) timeMultiplier = 1.1;
            points = Math.round(basePoints * timeMultiplier);
            if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50";
            else if (levDist === 1) scoreColor = "#ff9800";
            else scoreColor = "#d32f2f";
            if (usedReplay) points = Math.round(points * 0.2);
        }
    }

    if (levDist > 0) {
        let wrongChars = [];
        for (let i = 0; i < Math.max(currentWord.length, userWord.length); i++) {
            if (userWord[i] !== currentWord[i] && currentWord[i] && !['__proto__','constructor','prototype'].includes(currentWord[i])) {
                if (!wrongChars.includes(currentWord[i])) wrongChars.push(currentWord[i]);
            }
        }
        if (!sessionErrorsByWpm[currentWpm]) sessionErrorsByWpm[currentWpm] = Object.create(null);
        wrongChars.forEach(c => {
            sessionCharErrors[c] = (sessionCharErrors[c] || 0) + 1;
            sessionErrorsByWpm[currentWpm][c] = (sessionErrorsByWpm[currentWpm][c] || 0) + 1;
        });
    }

    if (!isFixedSpeed && currentMode !== 'chars') {
        if (levDist === 0 && !usedReplay) currentWpm += 2;
        else if (levDist === 1) currentWpm -= 1;
        else if (levDist > 1) currentWpm -= 2;
        currentWpm = Math.max(10, currentWpm);
    }
    totalScore += points;
    matchDetailsArray.push({ real: currentWord, typed: userWord, points: points, wpm: currentWpm, ms: reactionMs });

    if (currentMode !== 'pingpong') {
        const tr = document.createElement('tr');
        const tdTyped = document.createElement('td'); tdTyped.textContent = userWord;
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = currentWord; tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td');
        tdPoints.style.color = scoreColor;
        tdPoints.style.fontWeight = 'bold';
        tdPoints.textContent = currentMode === 'chars' ? points + " (" + reactionMs + "ms)" : (usedReplay ? '0 (Replay)' : (points > 0 ? "+"+points : points));
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        if (els.tableBody) {
            els.tableBody.appendChild(tr);
            els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }
    }

    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wpm: currentWpm, wordIndex: wordIndex + 1, matchDetails: matchDetailsArray });
    usedReplay = false;

    if (currentMode === 'pingpong') {
        wordIndex++;
        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
            if (d) {
                d.senderId = myId;
                d.word = '';
                d.wordsPlayed = (d.wordsPlayed || 0) + 1;
                d.lastGuess = { id: Date.now(), real: currentWord, typed: userWord, points: points };
            }
            return d;
        });
    } else {
        wordIndex++;
        setTimeout(playNextWord, 600);
    }
}

if (els.btnSendPingPong) {
    els.btnSendPingPong.addEventListener('click', () => {
        if (!gameRunning || currentMode !== 'pingpong') return;
        let word = els.pingPongWordToSend.value.trim().toUpperCase();
        if (!word) return;
        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
            if (d) {
                d.word = word;
                d.wordId = (d.wordId || 0) + 1;
            }
            return d;
        });
    });
}
if (els.pingPongWordToSend) {
    els.pingPongWordToSend.addEventListener('keypress', e => {
        if (e.key === 'Enter') els.btnSendPingPong.click();
    });
}

function playNextWord() {
    if (!gameRunning || currentMode === 'pingpong') return;
    if (wordIndex >= requestedWordCount) return finishGame();
    if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
    inputActive = true;
    usedReplay = false;
    const currentWord = gameWords[wordIndex].toUpperCase();

    if (roomCode) db.ref(`rooms/${roomCode}/liveAudio`).set({ word: currentWord, wpm: currentWpm, ts: Date.now() });

    if (isEasyMode && isSinglePlayer && els.easyModeHint) {
        els.easyModeHint.textContent = currentWord.split('').sort(() => 0.5 - Math.random()).join(' ');
        els.easyModeHint.style.display = 'block';
    } else if (els.easyModeHint) {
        els.easyModeHint.style.display = 'none';
    }

    playMorseAudio(currentWord, currentWpm);
    lastWordStartTime = Date.now();
    if (els.permanentGameInput) els.permanentGameInput.focus();
}

function startCountdownSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (listeners.room) listeners.room.off();
    if (!isSinglePlayer) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            gameStartPlayerCount = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (listeners.players) db.ref(`rooms/${roomCode}/players`).off('value', listeners.players);
            listeners.players = db.ref(`rooms/${roomCode}/players`).on('value', pSnap => {
                if (!gameRunning) return;
                const currentPCount = Object.keys(pSnap.val() || {}).length;
                if (gameStartPlayerCount > 0 && currentPCount < gameStartPlayerCount) {
                    setTimeout(() => {
                        db.ref(`rooms/${roomCode}/players`).once('value', s => {
                            if (gameRunning && Object.keys(s.val() || {}).length < gameStartPlayerCount) {
                                alert("Un giocatore ha abbandonato. Ritorno al menu.");
                                gameRunning = false;
                                exitRoomCleanly(false);
                            } else if (gameRunning) {
                                showToast("ðŸ‘¥ Giocatore rientrato!");
                            }
                        });
                    }, 10000);
                }
            });
        });
    }
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: 0`;

    if (isSinglePlayer && els.allowSpectatorsCheckbox && els.allowSpectatorsCheckbox.checked) {
        if (els.spectatorsCountDisplay) {
            els.spectatorsCountDisplay.style.display = 'inline-block';
            els.spectatorsCountDisplay.textContent = 'ðŸ‘ï¸ 0';
        }
        db.ref(`rooms/${roomCode}/spectators`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.textContent = `ðŸ‘ï¸ ${count}`;
        });
    } else if (els.spectatorsCountDisplay) {
        els.spectatorsCountDisplay.style.display = 'none';
    }

    if (!isRejoining) {
        totalScore = 0; currentStreak = 0; wordIndex = 0; quizQuestionIndex = 0; usedReplay = false;
        sessionCharErrors = Object.create(null); sessionErrorsByWpm = Object.create(null); matchDetailsArray = [];
    }
    if (els.tableBody) els.tableBody.innerHTML = "";
    window.lastPlayedWordId = 0;
    window.lastSeenGuessId = 0;
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';

    if (currentMode === 'pingpong' && (myId === roomHostId || roomCode.startsWith("TRN_"))) {
        db.ref(`rooms/${roomCode}/pingpong`).once('value', s => {
            if (!s.exists()) db.ref(`rooms/${roomCode}/pingpong`).set({ senderId: myId, word: '', wordId: 0, wordsPlayed: 0, lastGuess: null });
        });
    }

    showScreen('countdownScreen');
    gameRunning = true;
    let count = 3;
    if (els.countdownNumber) els.countdownNumber.textContent = count;

    const interval = setInterval(() => {
        if (count > 1) {
            count--;
            if (els.countdownNumber) els.countdownNumber.textContent = count;
            playBeep(600, 0.1);
        } else {
            clearInterval(interval);
            if (myId === roomHostId) {
                db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            }
            if (els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!');
            playBeep(800, 0.3);
            setTimeout(() => {
                if (!gameRunning) return;

                // --- PULIZIA PREVENTIVA PER EVITARE SOVRAPPOSIZIONI ---
                isCoopMode = (currentMode === 'conquest');
                if (els.coopArea) els.coopArea.style.display = 'none';
                if (els.tableWrapper) els.tableWrapper.style.display = 'block';

                if (currentMode === 'conquest') return startCoopSequence();
                if (currentMode === 'quiz') return startQuizSequence();

                showScreen('gameArea');
                if (currentMode === 'pingpong') {
                    setupPingPongListener();
                } else {
                    setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200);
                    setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
                }
            }, 500);
        }
    }, 1000);
}

function resumeGameSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gameRunning = true;
    isRejoining = false;

    // --- PULIZIA PREVENTIVA ---
    isCoopMode = (currentMode === 'conquest');
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;

    if (els.tableBody) {
        els.tableBody.innerHTML = "";
        matchDetailsArray.forEach(row => {
            const tr = document.createElement('tr');
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
            const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed;
            const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = row.real; tdReal.appendChild(bReal);
            const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.tableBody.appendChild(tr);
        });
    }

    if (currentMode === 'conquest') {
        startCoopSequence();
    } else if (currentMode === 'quiz') {
        startQuizSequence();
    } else {
        showScreen('gameArea');
        if (currentMode === 'pingpong') {
            setupPingPongListener();
        } else {
            setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200);
            setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
        }
    }
}

function setupPingPongListener() {
    if (listeners.pingPong) db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong);
    listeners.pingPong = db.ref(`rooms/${roomCode}/pingpong`).on('value', snap => {
        if (!gameRunning) return;
        const ppData = snap.val();
        if (!ppData) return;

        if (ppData.lastGuess && ppData.lastGuess.id !== window.lastSeenGuessId) {
            window.lastSeenGuessId = ppData.lastGuess.id;
            const tr = document.createElement('tr');
            const tdTyped = document.createElement('td'); tdTyped.textContent = ppData.lastGuess.typed || '';
            const tdReal = document.createElement('td'); renderDiffSecure(tdReal, ppData.lastGuess.real, ppData.lastGuess.typed || '');
            const tdPoints = document.createElement('td'); tdPoints.style.fontWeight = 'bold'; tdPoints.style.color = ppData.lastGuess.points > 0 ? "#4caf50" : (ppData.lastGuess.points === 0 && ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999"); tdPoints.textContent = ppData.lastGuess.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
            if (els.tableBody) els.tableBody.appendChild(tr);
            if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }
        if (ppData.wordsPlayed >= requestedWordCount) {
            if (ppTimerInterval) clearInterval(ppTimerInterval);
            return finishGame();
        }
        if (ppData.senderId === myId) {
            if (!ppData.word) {
                if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'flex';
                if (els.gameInputArea) els.gameInputArea.style.display = 'none';
                if (els.pingPongWordToSend) {
                    els.pingPongWordToSend.value = '';
                    setTimeout(() => els.pingPongWordToSend.focus(), 100);
                }
                startPingPongTimer();
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
                setTimeout(() => playMorseAudio(ppData.word.toUpperCase(), currentWpm), 500);
            } else if (!ppData.word && els.permanentGameInput) {
                els.permanentGameInput.disabled = true;
                els.permanentGameInput.placeholder = "In attesa dell'avversario...";
                els.permanentGameInput.value = "";
                inputActive = false;
            }
        }
    });
}

function startPingPongTimer() {
    if (ppTimerInterval) clearInterval(ppTimerInterval);
    let timeLeft = 100;
    if (els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = '100%';
    ppTimerInterval = setInterval(() => {
        timeLeft -= (100 / 300);
        if (els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) {
            clearInterval(ppTimerInterval);
            sendAutoPingPongWord();
        }
    }, 100);
}

function sendAutoPingPongWord() {
    if (!gameRunning || currentMode !== 'pingpong') return;
    const randomWord = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
        if (d && !d.word) {
            d.word = randomWord;
            d.wordId = (d.wordId || 0) + 1;
        }
        return d;
    });
    showToast(currentLang === 'it' ? "Tempo scaduto! Parola inviata automaticamente." : "Time's up! Word sent automatically.");
}

function finishGame() {
    gameRunning = false;
    inputActive = false;
    if (els.permanentGameInput) els.permanentGameInput.blur();
    clearAllTimers();

    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }

    localStorage.removeItem(STORAGE_ROOM_KEY);
    isRejoining = false;
    isChallenging = false;

    db.ref(`presence/${myId}`).update({
        allowSpectators: false,
        activeRoomCode: null,
        status: 'online'
    });

    showScreen('leaderboardScreen');

    if (currentMode === 'daily_challenge' && els.btnShareDaily) {
        els.btnShareDaily.style.display = 'inline-block';
        els.btnShareDaily.onclick = () => {
            const appUrl = encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`);
            const textMsg = encodeURIComponent(`ðŸ“» Sfida Giornaliera CW!\nHo totalizzato ${totalScore} pt (Max VelocitÃ : ${currentWpm} WPM).\nRiesci a fare di meglio?`);
            const shareUrl = `https://t.me/share/url?url=${appUrl}&text=${textMsg}`;
            try {
                if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, '_blank');
            } catch (e) {
                window.open(shareUrl, '_blank');
            }
        };
    } else if (els.btnShareDaily) {
        els.btnShareDaily.style.display = 'none';
    }

    if (roomCode) {
        const myPlayerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
        myPlayerRef.update({ finished: true, score: totalScore, wpm: currentWpm, matchDetails: matchDetailsArray });
        myPlayerRef.onDisconnect().cancel();
    }

    if (totalScore > 0 && !roomCode.startsWith("TRN_")) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const isReallySolo = isSinglePlayer || (Object.keys(snap.val() || {}).length < 2);
            let dbPath;
            if (currentMode === 'daily_challenge') {
                let todayStr = new Date().toISOString().split('T')[0];
                dbPath = `leaderboard/daily_challenge/${todayStr}/${myId}`;
            } else {
                const modeFolder = currentMode === 'callsign' ? 'callsign/global' : `${currentMode === 'quiz' ? 'quiz' : currentMode === 'chars' ? 'chars' : currentMode === 'pingpong' ? 'pingpong' : 'standard'}/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}`;
                dbPath = `leaderboard/${modeFolder}/${myId}`;
            }

            db.ref(dbPath).once('value', s => {
                let oldData = s.val();
                let oldScore = oldData ? (Number(oldData.score) || 0) : 0;
                if (!oldData || totalScore > oldScore) {
                    db.ref(dbPath).set({ name: myName, username: myPrivacy ? "" : tgUsername, score: totalScore, wpm: currentWpm, wordCount: requestedWordCount, date: new Date().toLocaleDateString('it-IT') });
                    showToast(currentLang === 'it' ? "ðŸ† Nuovo Record in Classifica!" : "ðŸ† New Leaderboard Record!");
                } else {
                    showToast(currentLang === 'it' ? "Ottima partita! (Non hai superato il tuo record personale)" : "Good game! (Personal best not beaten)");
                }
            });
        });
    }

    if (matchDetailsArray.length > 0) {
        db.ref(`users/${myId}/history`).push().set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: currentWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });
        updateActivity(totalScore > 0);
        if (Object.keys(sessionCharErrors).length > 0) {
            db.ref(`users/${myId}/stats/charErrors`).once('value', s => {
                let curr = s.val() || {};
                for (let char in sessionCharErrors) curr[char] = (curr[char] || 0) + sessionCharErrors[char];
                db.ref(`users/${myId}/stats/charErrors`).set(curr);
            });
        }
        if (Object.keys(sessionErrorsByWpm).length > 0) {
            db.ref(`users/${myId}/stats/errorsByWpm`).once('value', s => {
                let curr = s.val() || {};
                for (let w in sessionErrorsByWpm) {
                    if (!curr[w]) curr[w] = {};
                    for (let c in sessionErrorsByWpm[w]) curr[w][c] = (curr[w][c] || 0) + sessionErrorsByWpm[w][c];
                }
                db.ref(`users/${myId}/stats/errorsByWpm`).set(curr);
            });
        }
    }

    if (currentMode === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
        activeTab = "daily_challenge";
        showLeaderboardTab('opt_lb_daily');
    }
    else if (roomCode && roomCode.startsWith("TRN_")) { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
    else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; showLeaderboardTab('tabGlobalCWFreakBtn'); }
    else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; showLeaderboardTab('tabGlobalPingPongBtn'); }
    else if (isSinglePlayer && currentMode === 'quiz') { activeTab = "quiz_single"; showLeaderboardTab('tabGlobalQuizSingleBtn'); }
    else if (isSinglePlayer && currentMode === 'chars') { activeTab = "chars_single"; showLeaderboardTab('tabGlobalCharsSingleBtn'); }
    else if (isSinglePlayer) { activeTab = "std_single"; showLeaderboardTab('tabGlobalStandardSingleBtn'); }
    else { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
}

