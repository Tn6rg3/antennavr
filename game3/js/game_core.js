// js/game_core.js

window.showScreen = function(screenId) {
    clearAllTimers();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');

    if (typeof hideChat === 'function') hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';

    const isPlayingScreen = ['lobbyScreen', 'gameArea', 'countdownScreen', 'quizArea', 'brScreen'].includes(screenId);

    if (db && myId) {
        try {
            db.ref(`presence/${myId}`).update({ status: isPlayingScreen ? 'playing' : 'online' });
        } catch(e) {}
    }

    if (screenId === 'setupScreen') {
        const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
        if (!lastRoom && els.rejoinContainer) {
            els.rejoinContainer.style.display = 'none';
        } else if (lastRoom && els.rejoinContainer) {
            els.rejoinContainer.style.display = 'block';
            if (els.rejoinGameBtn) {
                els.rejoinGameBtn.onclick = () => {
                    roomCode = lastRoom;
                    isRejoining = true;
                    joinRoomLogic(false);
                };
            }
        }

        if (typeof listenToOnlineUsers === 'function') listenToOnlineUsers();
        if (typeof listenToRooms === 'function') listenToRooms();
    } else {
        if (listeners.presence && listeners.presence.ref) {
            listeners.presence.ref.off('child_added', listeners.presence.onAdded);
            listeners.presence.ref.off('child_changed', listeners.presence.onChanged);
            listeners.presence.ref.off('child_removed', listeners.presence.onRemoved);
            listeners.presence = null;
        }
        if (listeners.roomsList && listeners.roomsList.ref) {
            listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
            listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
            listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
            listeners.roomsList = null;
        }
    }

    if (isPlayingScreen) {
        if (listeners.activeChat['chatMessages']) {
            listeners.activeChat['chatMessages'].ref.off('value', listeners.activeChat['chatMessages'].callback);
            delete listeners.activeChat['chatMessages'];
        }
        if (screenId === 'lobbyScreen' || screenId === 'gameArea') {
            activeChatContext = 'room';
            if (typeof listenToChat === 'function') listenToChat();
        } else {
            activeChatContext = null;
        }
    } else if (screenId === 'teamsScreen') {
        activeChatContext = 'team';
        if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus();
    } else {
        if (screenId === 'participationScreen') { if (typeof switchActTab === 'function') switchActTab('daily'); }
        if (activeChatContext !== 'global') {
            activeChatContext = 'global';
            if (typeof listenToChat === 'function') listenToChat();
        }
    }
};

window.goBackToMenu = function() {
    if (activeChatContext !== 'team') if (typeof hideChat === 'function') hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';
    if (els.inviteModal) els.inviteModal.style.display = 'none';

    showScreen('setupScreen');
};

window.exitRoomCleanly = function(roomWasDeletedByHost = false, isExplicitQuit = false) {
    clearAllTimers();

    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }

    let targetScreen = 'setupScreen';
    const amIHost = (myId === roomHostId);

    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (listeners.pingPong && roomCode) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (roomCode) { db.ref(`rooms/${roomCode}/coop_state`).off(); }

    isCoopMode = false;
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        localStorage.removeItem(STORAGE_ROOM_KEY);

        if (roomWasDeletedByHost) {
            if (amIHost && !roomCode.startsWith("TRN_")) {
                db.ref(`rooms/${roomCode}`).remove();
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            } else {
                db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
                db.ref(`rooms/${roomCode}/players/${myId}`).remove();
            }
            roomCode = "";
        }
        else if (isExplicitQuit) {
            db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
            db.ref(`rooms/${roomCode}/players/${myId}`).remove();
            roomCode = "";
        }
        else {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({ online: false });
        }
    } else {
        if (listeners.room) { listeners.room.off(); listeners.room = null; }
    }

    db.ref(`presence/${myId}`).update({
        allowSpectators: false,
        activeRoomCode: null,
        status: 'online'
    });

    if (typeof hideChat === 'function') hideChat();
    showScreen(targetScreen);

    if (targetScreen === 'setupScreen') {
        if (typeof listenToRooms === 'function') listenToRooms();
    }
};

window.joinSpecificRoom = function(code) {
    roomCode = code;
    joinRoomLogic(false);
};

window.joinRoomLogic = function(isReconnect = false) {
    gameRunning = false;
    const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) {
            showScreen('leaderboardScreen');
            activeTab = "room";
            if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabRoomBtn');
            localStorage.removeItem(STORAGE_ROOM_KEY);
            return;
        }
        if (pData) {
            totalScore = pData.score || 0;
            wordIndex = pData.wordIndex || 0;
            quizQuestionIndex = pData.wordIndex || 0;
            matchDetailsArray = pData.matchDetails || [];
            if (isRejoining) showToast("🔄 Partita recuperata!");
        }
        showScreen('lobbyScreen');
        if (els.lobbyTitleText) els.lobbyTitleText.textContent = roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera";
        if (els.permanentGameInput) els.permanentGameInput.blur();
        playerRef.onDisconnect().update({ online: false });

        if (!pData) {
            playerRef.set({
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                score: 0,
                wpm: 0,
                finished: false,
                teamId: myTeamId,
                ready: false,
                online: true
            }).then(() => {
                if (!isSinglePlayer && !roomCode.startsWith("TRN_")) {
                    db.ref(`rooms/${roomCode}/players`).once('value', s => {
                        const count = s.exists() ? Object.keys(s.val()).length : 1;
                        db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(count);
                    });
                }
            });
        } else {
            playerRef.update({ online: true, name: myName, username: myPrivacy ? "" : tgUsername });
        }

        if (typeof listenToChat === 'function') listenToChat();
        if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return exitRoomCleanly(true);
            const rData = snap.val();
            currentMode = rData.mode;
            requestedWordCount = rData.wordCount;
            isSinglePlayer = rData.type === 'single';
            isFixedSpeed = rData.fixedSpeed || false;
            roomHostId = rData.hostId;

            window.charSpaceWpm = rData.charSpaceWpm !== undefined ? rData.charSpaceWpm : rData.wpm;
            window.wordSpaceMult = rData.wordSpaceMult || 1.0;

            if (rData.status === 'playing' || rData.status === 'countdown') {
                localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
            }

            if (rData.status === 'playing' && !gameRunning) {
                currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone;
                if (rData.words) gameWords = rData.words;
                return resumeGameSequence();
            }
            if (rData.status === 'countdown' && !gameRunning) {
                currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone;
                if (rData.words) gameWords = rData.words;
                return startCountdownSequence();
            }
            if (rData.status === 'waiting') {
                window.renderPlayersList(rData.players || {}, rData.hostId);
                const pCount = Object.keys(rData.players || {}).length;
                if (myId === rData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') {
                    if (typeof showRoomEventModal === 'function') showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato.");
                }
                lastPlayerCount = pCount;
                if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
                if (rData.expiresAt && !isSinglePlayer) {
                    lobbyTimerInterval = setInterval(() => {
                        const diff = rData.expiresAt - Date.now();
                        if (diff <= 0) {
                            clearInterval(lobbyTimerInterval);
                            if (els.lobbyTimerText) els.lobbyTimerText.textContent = "Tempo scaduto!";
                        } else if (els.lobbyTimerText) {
                            els.lobbyTimerText.textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2, '0')}`;
                        }
                    }, 1000);
                } else if (els.lobbyTimerText) {
                    els.lobbyTimerText.textContent = "";
                }
            }
        });
    });
};

window.renderPlayersList = function(playersData, hostId) {
    if (!els.playersList) return;
    els.playersList.innerHTML = '';
    const count = Object.keys(playersData).length;
    if (count > lastPlayerCount && lastPlayerCount > 0) {
        if (typeof playBeep === 'function') playBeep(500, 0.1);
        setTimeout(() => { if (typeof playBeep === 'function') playBeep(700, 0.15); }, 150);
        showToast("👤 Nuovo giocatore!");
    }
    lastPlayerCount = count;
    let allReady = true;
    const pKeys = Object.keys(playersData);
    if (pKeys.length < 2) allReady = false;

    Object.entries(playersData).forEach(([id, data]) => {
        if (!data.ready) allReady = false;
        const li = document.createElement('li');
        const nSpan = document.createElement('span');
        nSpan.textContent = `${data.ready ? '✅' : '⏳'} ${data.name}`;
        if (data.username && String(data.username).trim() !== "") {
            nSpan.style.color = 'var(--link-color)';
            nSpan.style.cursor = 'pointer';
            nSpan.style.textDecoration = 'underline';
            nSpan.onclick = () => { if (typeof openTelegramProfile === 'function') openTelegramProfile(data.username); };
        }
        li.appendChild(nSpan);
        if (id === hostId) {
            const sHost = document.createElement('small');
            sHost.textContent = ' (HOST)';
            li.appendChild(sHost);
        }
        els.playersList.appendChild(li);
    });

    const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong';
    const amIHost = (myId === hostId) || roomCode.startsWith("TRN_");
    const amIReady = playersData[myId]?.ready;

    if (els.startMultiplayerBtn) els.startMultiplayerBtn.style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none';
    if (els.deleteRoomBtn) els.deleteRoomBtn.style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none';
    if (els.readyBtn) els.readyBtn.style.display = (isTrnOrPP && !amIReady) ? 'block' : 'none';

    if (isTrnOrPP) {
        if (els.waitingHostText) {
            els.waitingHostText.style.display = amIReady ? 'block' : 'none';
            els.waitingHostText.textContent = "In attesa...";
        }
        if (els.statusInfoText) els.statusInfoText.textContent = amIReady ? "SONO PRONTO ✅" : "Connessione sicura in corso...";
    } else {
        if (els.waitingHostText) {
            els.waitingHostText.style.display = amIHost ? 'none' : 'block';
            els.waitingHostText.textContent = "In attesa dell'host...";
        }
        if (els.statusInfoText) els.statusInfoText.textContent = amIHost ? "Sei l'Host." : "Sei un partecipante.";
    }

    if (allReady && isTrnOrPP && (pKeys[0] === myId || amIHost)) {
        db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
    }
};

window.startCountdownSequence = function() {
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
                                showToast("👥 Giocatore rientrato!");
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
            els.spectatorsCountDisplay.textContent = '👁️ 0';
        }
        db.ref(`rooms/${roomCode}/spectators`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.textContent = `👁️ ${count}`;
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
            if (typeof playBeep === 'function') playBeep(600, 0.1);
        } else {
            clearInterval(interval);
            if (myId === roomHostId) {
                db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            }
            if (els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!');
            if (typeof playBeep === 'function') playBeep(800, 0.3);
            setTimeout(() => {
                if (!gameRunning) return;

                isCoopMode = (currentMode === 'conquest');
                if (els.coopArea) els.coopArea.style.display = 'none';
                if (els.tableWrapper) els.tableWrapper.style.display = 'block';

                if (currentMode === 'conquest') {
                    if (typeof startCoopSequence === 'function') return startCoopSequence();
                }
                if (currentMode === 'quiz') {
                    if (typeof startQuizSequence === 'function') return startQuizSequence();
                }

                showScreen('gameArea');
                if (currentMode === 'pingpong') {
                    if (typeof setupPingPongListener === 'function') setupPingPongListener();
                } else {
                    setTimeout(() => { if (els.permanentGameInput) els.permanentGameInput.focus(); }, 200);
                    setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
                }
            }, 500);
        }
    }, 1000);
};

window.resumeGameSequence = function() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gameRunning = true;
    isRejoining = false;

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
        if (typeof startCoopSequence === 'function') startCoopSequence();
    } else if (currentMode === 'quiz') {
        if (typeof startQuizSequence === 'function') startQuizSequence();
    } else {
        showScreen('gameArea');
        if (currentMode === 'pingpong') {
            if (typeof setupPingPongListener === 'function') setupPingPongListener();
        } else {
            setTimeout(() => { if (els.permanentGameInput) els.permanentGameInput.focus(); }, 200);
            setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
        }
    }
};

window.playNextWord = function() {
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

    if (typeof playMorseAudio === 'function') playMorseAudio(currentWord, currentWpm);
    lastWordStartTime = Date.now();
    if (els.permanentGameInput) els.permanentGameInput.focus();
};

window.finishGame = function() {
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
            const textMsg = encodeURIComponent(`📻 Sfida Giornaliera CW!\nHo totalizzato ${totalScore} pt (Max Velocità: ${currentWpm} WPM).\nRiesci a fare di meglio?`);
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
                    showToast(currentLang === 'it' ? "🏆 Nuovo Record in Classifica!" : "🏆 New Leaderboard Record!");
                } else {
                    showToast(currentLang === 'it' ? "Ottima partita! (Non hai superato il tuo record personale)" : "Good game! (Personal best not beaten)");
                }
            });
        });
    }

    if (matchDetailsArray.length > 0) {
        db.ref(`users/${myId}/history`).push().set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: currentWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });
        if (typeof updateActivity === 'function') updateActivity(totalScore > 0);
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
        if (typeof showLeaderboardTab === 'function') showLeaderboardTab('opt_lb_daily');
    }
    else if (roomCode && roomCode.startsWith("TRN_")) { activeTab = "room"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabRoomBtn'); if (typeof listenToRoomLeaderboard === 'function') listenToRoomLeaderboard(); }
    else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalCWFreakBtn'); }
    else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalPingPongBtn'); }
    else if (isSinglePlayer && currentMode === 'quiz') { activeTab = "quiz_single"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalQuizSingleBtn'); }
    else if (isSinglePlayer && currentMode === 'chars') { activeTab = "chars_single"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalCharsSingleBtn'); }
    else if (isSinglePlayer) { activeTab = "std_single"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalStandardSingleBtn'); }
    else { activeTab = "room"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabRoomBtn'); if (typeof listenToRoomLeaderboard === 'function') listenToRoomLeaderboard(); }
};

window.getGameWords = function(num, mode) {
    if (mode === 'daily_challenge') return window.getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: masterDictionary, custom: customDictionary });
    }
    return fisherYatesShuffle(masterDictionary).slice(0, num).map(w => w.toUpperCase());
};

window.getDailyWords = function(num) {
    let todayStr = new Date().toISOString().split('T')[0];
    let seed = parseInt(todayStr.replace(/-/g, ''));
    let prng = mulberry32(seed);
    let dict = [...masterDictionary];
    for (let i = dict.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [dict[i], dict[j]] = [dict[j], dict[i]];
    }
    return dict.slice(0, num).map(w => w.toUpperCase());
};

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
