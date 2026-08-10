// js/game_core.js

window.showScreen = function(screenId) {
    clearAllTimers();
    if (courseSessionTimer) { clearInterval(courseSessionTimer); courseSessionTimer = null; }
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
                    window.joinRoomLogic(false);
                };
            }
        }

        if (typeof window.listenToOnlineUsers === 'function') window.listenToOnlineUsers();
        if (typeof window.listenToRooms === 'function') window.listenToRooms();
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
        if (listeners.activeChat && listeners.activeChat['chatMessages']) {
            listeners.activeChat['chatMessages'].ref.off('value', listeners.activeChat['chatMessages'].callback);
            delete listeners.activeChat['chatMessages'];
        }
        if (screenId === 'lobbyScreen' || screenId === 'gameArea') {
            activeChatContext = 'room';
            if (typeof window.listenToChat === 'function') window.listenToChat();
        } else {
            activeChatContext = null;
        }
    } else if (screenId === 'leaderboardScreen') {
        if (typeof window.switchLBGroup === 'function') window.switchLBGroup('daily');
    } else if (screenId === 'teamsScreen') {
        activeChatContext = 'team';
        if (typeof window.checkMyTeamStatus === 'function') window.checkMyTeamStatus();
    } else {
        if (screenId === 'participationScreen') { if (typeof window.switchActTab === 'function') window.switchActTab('daily'); }
        if (activeChatContext !== 'global') {
            activeChatContext = 'global';
            if (typeof window.listenToChat === 'function') window.listenToChat();
        }
    }
};

window.goBackToMenu = function() {
    if (activeChatContext !== 'team') if (typeof window.hideChat === 'function') window.hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';
    if (els.inviteModal) els.inviteModal.style.display = 'none';

    window.showScreen('setupScreen');
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
                db.ref(`rooms/${roomCode}/players/${myId}`).remove().then(() => {
                    // Decrementa conteggio pubblico se la stanza esiste ancora
                    if (roomCode && !roomCode.startsWith("TRN_")) {
                        db.ref(`rooms/${roomCode}/players`).once('value', s => {
                            if (s.exists()) {
                                db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(Object.keys(s.val()).length);
                            }
                        });
                    }
                });
            }
            roomCode = "";
        }
        else if (isExplicitQuit) {
            db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
            db.ref(`rooms/${roomCode}/players/${myId}`).remove().then(() => {
                if (roomCode && !roomCode.startsWith("TRN_")) {
                    db.ref(`rooms/${roomCode}/players`).once('value', s => {
                        if (s.exists()) {
                            db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(Object.keys(s.val()).length);
                        } else if (!amIHost) {
                            db.ref(`public_lobby_rooms/${roomCode}`).remove();
                        }
                    });
                }
            });
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

    if (typeof window.hideChat === 'function') window.hideChat();
    window.showScreen(targetScreen);

    if (targetScreen === 'setupScreen') {
        if (typeof window.listenToRooms === 'function') window.listenToRooms();
    }
};

window.joinSpecificRoom = function(code) {
    roomCode = code;
    window.joinRoomLogic(false);
};

window.joinRoomLogic = function(isReconnect = false) {
    gameRunning = false;
    const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) {
            window.showScreen('leaderboardScreen');
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
            if (isRejoining) window.showToast("🔄 Partita recuperata!");
        }
        window.showScreen('lobbyScreen');
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
            // Aggiorna conteggio anche al rientro per sicurezza
            if (!isSinglePlayer && !roomCode.startsWith("TRN_")) {
                db.ref(`rooms/${roomCode}/players`).once('value', s => {
                    const count = s.exists() ? Object.keys(s.val()).length : 1;
                    db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(count);
                });
            }
        }

        if (typeof window.listenToChat === 'function') window.listenToChat();
        if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return window.exitRoomCleanly(true);
            const rData = snap.val();
            currentMode = rData.mode;
            requestedWordCount = rData.wordCount;
            isSinglePlayer = rData.type === 'single';
            isFixedSpeed = !!rData.fixedSpeed;
            isEasyMode = !!rData.easyMode;
            roomHostId = rData.hostId;

            // Se charSpaceWpm è 0 o mancante, l'audio engine userà automaticamente la velocità corrente (WPM)
            window.charSpaceWpm = rData.charSpaceWpm || 0;
            window.wordSpaceMult = rData.wordSpaceMult || 1.0;

            if (rData.status === 'playing' || rData.status === 'countdown') {
                localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
            }

            if (rData.status === 'playing' && !gameRunning) {
                currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone;
                if (rData.words) gameWords = rData.words;
                return window.resumeGameSequence();
            }
            if (rData.status === 'countdown' && !gameRunning) {
                currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone;
                if (rData.words) gameWords = rData.words;
                return window.startCountdownSequence();
            }
            if (rData.status === 'waiting') {
                window.renderPlayersList(rData.players || {}, rData.hostId);
                const pCount = Object.keys(rData.players || {}).length;
                if (myId === rData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') {
                    if (typeof window.showRoomEventModal === 'function') window.showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato.");
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
        if (typeof window.playBeep === 'function') window.playBeep(500, 0.1);
        setTimeout(() => { if (typeof window.playBeep === 'function') window.playBeep(700, 0.15); }, 150);
        window.showToast("👤 Nuovo giocatore!");
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
            nSpan.onclick = () => { if (typeof window.openTelegramProfile === 'function') window.openTelegramProfile(data.username); };
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

    isCourseMode = (currentMode === 'course');
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
                                window.exitRoomCleanly(false);
                            } else if (gameRunning) {
                                window.showToast("👥 Giocatore rientrato!");
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

    window.showScreen('countdownScreen');
    gameRunning = true;
    let count = 3;
    if (els.countdownNumber) els.countdownNumber.textContent = count;

    const interval = setInterval(() => {
        if (count > 1) {
            count--;
            if (els.countdownNumber) els.countdownNumber.textContent = count;
            if (typeof window.playBeep === 'function') window.playBeep(600, 0.1);
        } else {
            clearInterval(interval);
            if (myId === roomHostId) {
                db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            }
            if (els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!');
            if (typeof window.playBeep === 'function') window.playBeep(800, 0.3);
            setTimeout(() => {
                if (!gameRunning) return;

                isCoopMode = (currentMode === 'conquest');
                if (els.coopArea) els.coopArea.style.display = 'none';
                if (els.tableWrapper) els.tableWrapper.style.display = 'block';

                if (currentMode === 'conquest') {
                    if (typeof window.startCoopSequence === 'function') return window.startCoopSequence();
                }
                if (currentMode === 'course') {
                    if (typeof window.startCourseSessionSequence === 'function') return window.startCourseSessionSequence();
                }
                if (currentMode === 'quiz') {
                    if (typeof window.startQuizSequence === 'function') return window.startQuizSequence();
                }

                window.showScreen('gameArea');
                if (currentMode === 'pingpong') {
                    if (typeof window.setupPingPongListener === 'function') window.setupPingPongListener();
                } else {
                    setTimeout(() => { if (els.permanentGameInput) els.permanentGameInput.focus(); }, 200);
                    setTimeout(() => { if (gameRunning) window.playNextWord(); }, 800);
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
        if (typeof window.startCoopSequence === 'function') window.startCoopSequence();
    } else if (currentMode === 'quiz') {
        if (typeof window.startQuizSequence === 'function') window.startQuizSequence();
    } else {
        window.showScreen('gameArea');
        if (currentMode === 'pingpong') {
            if (typeof window.setupPingPongListener === 'function') window.setupPingPongListener();
        } else {
            setTimeout(() => { if (els.permanentGameInput) els.permanentGameInput.focus(); }, 200);
            setTimeout(() => { if (gameRunning) window.playNextWord(); }, 800);
        }
    }
};

window.playNextWord = function() {
    if (!gameRunning || currentMode === 'pingpong') return;
    if (isCourseMode) return window.playNextCourseGroup?.();
    if (wordIndex >= requestedWordCount) return window.finishGame();
    if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
    inputActive = true;
    usedReplay = false;
    const currentWord = gameWords[wordIndex].toUpperCase();

    if (roomCode) db.ref(`rooms/${roomCode}/liveAudio`).set({ word: currentWord, wpm: currentWpm, ts: Date.now() });

    if (isEasyMode && els.easyModeHint) {
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

    window.showScreen('leaderboardScreen');

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
                    window.showToast(currentLang === 'it' ? "🏆 Nuovo Record in Classifica!" : "🏆 New Leaderboard Record!");
                } else {
                    window.showToast(currentLang === 'it' ? "Ottima partita! (Non hai superato il tuo record personale)" : "Good game! (Personal best not beaten)");
                }
            });
        });
    }

    if (matchDetailsArray.length > 0) {
        db.ref(`users/${myId}/history`).push().set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: currentWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });
        if (typeof window.updateActivity === 'function') window.updateActivity(totalScore > 0);

        // --- ASSEGNAZIONE XP FINALE (RPG) ---
        if (typeof window.addXP === 'function') {
            const xpGain = Math.floor(totalScore / 10) + 50; // XP base + bonus partita
            window.addXP(xpGain, "Match Finished");
        }

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
        if (typeof window.showLeaderboardTab === 'function') window.showLeaderboardTab('opt_lb_daily');
    }
    else if (roomCode && roomCode.startsWith("TRN_")) { activeTab = "room"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabRoomBtn'); if (typeof window.listenToRoomLeaderboard === 'function') window.listenToRoomLeaderboard(); }
    else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalCWFreakBtn'); }
    else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalPingPongBtn'); }
    else if (isSinglePlayer && currentMode === 'quiz') { activeTab = "quiz_single"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalQuizSingleBtn'); }
    else if (isSinglePlayer && currentMode === 'chars') { activeTab = "chars_single"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalCharsSingleBtn'); }
    else if (isSinglePlayer) { activeTab = "std_single"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabGlobalStandardSingleBtn'); }
    else { activeTab = "room"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabRoomBtn'); if (typeof window.listenToRoomLeaderboard === 'function') window.listenToRoomLeaderboard(); }
};

window.getLevenshteinDistance = function(a, b) {
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
};

window.renderDiffSecure = function(container, real, typed) {
    for (let i = 0; i < Math.max(real.length, typed.length); i++) {
        if (!real[i]) continue;
        const span = document.createElement('span');
        if (!typed[i] || typed[i] !== real[i]) span.style.color = "#d32f2f";
        span.textContent = real[i];
        container.appendChild(span);
    }
};

if (els.replayWordBtn) {
    els.replayWordBtn.addEventListener('click', () => {
        if (!gameRunning || !inputActive) return;
        usedReplay = true;
        if (typeof playMorseAudio === 'function') playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm);
        if (els.permanentGameInput) els.permanentGameInput.focus();
    });
}

if (els.permanentGameInput) {
    els.permanentGameInput.addEventListener('input', function() {
        if (isCourseMode && inputActive && gameRunning) {
            const val = els.permanentGameInput.value.trim().toUpperCase();
            if (val.length >= 5) {
                window.handleWordSubmission(val.substring(0, 5));
                els.permanentGameInput.value = "";
            }
            return;
        }
        if (currentMode === 'chars' && inputActive && gameRunning) {
            const val = els.permanentGameInput.value.trim().toUpperCase();
            if (val.length >= 1) {
                window.handleWordSubmission(val[0]);
                els.permanentGameInput.value = "";
            }
        }
    });
    els.permanentGameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') {
            const val = els.permanentGameInput.value.trim().toUpperCase();
            if (val) {
                window.handleWordSubmission(val);
                els.permanentGameInput.value = "";
            }
        }
    });
}

window.handleWordSubmission = function(userWord) {
    if (!userWord) return;
    userWord = userWord.substring(0, 50).trim().toUpperCase();

    if (isCourseMode) {
        const currentWord = gameWords[wordIndex] || "";
        const isCorrect = (userWord === currentWord);

        // Aggiorna statistiche corso
        if (window.courseData) {
            if (!window.courseData.progress.char_stats) window.courseData.progress.char_stats = {};
            for (let i=0; i<currentWord.length; i++) {
                let c = currentWord[i];
                if (!window.courseData.progress.char_stats[c]) window.courseData.progress.char_stats[c] = { attempts: 0, errors: 0 };
                window.courseData.progress.char_stats[c].attempts++;
                if (userWord[i] !== c) window.courseData.progress.char_stats[c].errors++;
            }
            window.saveCourseState?.();
        }

        // Feedback visuale con evidenziazione errori
        const tr = document.createElement('tr');
        const tdTyped = document.createElement('td');
        tdTyped.textContent = userWord;

        const tdReal = document.createElement('td');
        for (let i=0; i<currentWord.length; i++) {
            const span = document.createElement('span');
            span.textContent = currentWord[i];
            if (userWord[i] !== currentWord[i]) {
                span.style.color = "#d32f2f";
                span.style.fontWeight = "bold";
            }
            tdReal.appendChild(span);
        }

        const tdPoints = document.createElement('td');
        tdPoints.textContent = isCorrect ? "OK" : "ERR";
        tdPoints.style.color = isCorrect ? "#4caf50" : "#d32f2f";
        tdPoints.style.fontWeight = "bold";

        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        if (els.tableBody) {
            els.tableBody.appendChild(tr);
            els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }

        // --- CONTROLLO PAUSA PROGRAMMATA (CORSO) ---
        if (window.coursePausePending) {
            window.coursePausePending = false;
            window.triggerCoursePause?.();
            return;
        }

        setTimeout(() => {
            if (gameRunning) window.playNextCourseGroup?.();
        }, 600);
        return;
    }

    if (currentMode === 'conquest') {
        if (coopActiveFreqIndex === 0) {
            return showToast("⚠️ Seleziona prima una Frequenza!");
        }

        const currentWord = gameWords[0];
        const isCorrect = userWord === currentWord;
        const gain = coopActiveFreqIndex === 1 ? 4 : (coopActiveFreqIndex === 2 ? 7 : 12);
        const penalty = coopActiveFreqIndex === 1 ? 2 : (coopActiveFreqIndex === 2 ? 3 : 5);

        inputActive = false;

        if (isCorrect) {
            currentWpm += 2;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
            showToast(`✅ CORRETTO! +${gain}% (Velocità -> ${currentWpm} WPM)`);
            if (typeof playBeep === 'function') playBeep(880, 0.1);

            db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.min(100, (state.progress || 0) + gain);

                if (!Array.isArray(state.activeWords) || state.activeWords.length !== 3) {
                    if (typeof window.generateCoopTripleWords === 'function') state.activeWords = window.generateCoopTripleWords();
                    return state;
                }

                const idx = coopActiveFreqIndex - 1;
                if (idx >= 0 && idx < 3) {
                    if (typeof window.generateCoopTripleWords === 'function') {
                        const nextWords = window.generateCoopTripleWords();
                        state.activeWords[idx] = nextWords[idx];
                    }
                }
                return state;
            });
        } else {
            currentWpm = Math.max(10, currentWpm - 2);
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
            showToast(`❌ ERRORE! -${penalty}% (Velocità -> ${currentWpm} WPM)`);
            if (typeof playBeep === 'function') playBeep(300, 0.25);

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
                if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
                if (typeof playMorseAudio === 'function') playMorseAudio(gameWords[0], currentWpm);
            }
        }, 1500);
        return;
    }

    inputActive = false;
    const currentWord = gameWords[wordIndex].toUpperCase();
    let points = 0, scoreColor = "";
    const reactionMs = Date.now() - lastWordStartTime;
    const levDist = window.getLevenshteinDistance(currentWord, userWord);

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
            if (usedReplay) points = 0;
        }
    }

    if (levDist > 0) {
        // --- NUOVO: TRACCIAMENTO ERRORI AVANZATO ---
        if (typeof window.trackAdvancedErrors === 'function') {
            window.trackAdvancedErrors(currentWord, userWord, currentWpm);
        }

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
        if (levDist === 0 && !usedReplay) {
            currentWpm += 2;
            window.addXP?.(10, "Correct Word");
            window.updateMissionProgress?.('count', 1);
            window.updateMissionProgress?.('wpm_min', currentWpm);
            currentStreak++;
            window.updateMissionProgress?.('streak', currentStreak);
        }
        else if (usedReplay) {
            currentWpm -= 2;
            currentStreak = 0;
        }
        else if (levDist === 1) {
            currentWpm -= 1;
            currentStreak = 0;
        }
        else if (levDist > 1) {
            currentWpm -= 2;
            currentStreak = 0;
        }
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
        setTimeout(window.playNextWord, 600);
    }
};

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
            const tdPoints = document.createElement('td'); tdPoints.style.fontWeight = 'bold'; tdPoints.style.color = ppData.lastGuess.points > 0 ? "#4caf50" : (ppData.lastGuess.points === 0 && ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999"); tdPoints.textContent = ppData.lastGuess.points;
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
    const randomWord = window.masterDictionary[Math.floor(Math.random() * window.masterDictionary.length)].toUpperCase();
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
        if (d && !d.word) {
            d.word = randomWord;
            d.wordId = (d.wordId || 0) + 1;
        }
        return d;
    });
    showToast(currentLang === 'it' ? "Tempo scaduto! Parola inviata automaticamente." : "Time's up! Word sent automatically.");
};

window.watchSpecificRoom = function(code, targetName) {
    roomCode = code;
    window.showScreen('gameArea');

    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = true;
        els.permanentGameInput.placeholder = `👁️ Stai osservando la partita di ${targetName}...`;
        els.permanentGameInput.value = "";
    }

    if (els.wpmDisplay) els.wpmDisplay.textContent = "👁️ SPETTATORE | WPM: --";
    if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.style.display = 'none';

    const mySpectatorRef = db.ref(`rooms/${roomCode}/spectators/${myId}`);
    mySpectatorRef.set({ name: myName, ts: firebase.database.ServerValue.TIMESTAMP });
    mySpectatorRef.onDisconnect().remove();

    const roomRef = db.ref(`rooms/${roomCode}`);
    const onRoomChange = roomRef.on('value', snap => {
        if (!snap.exists()) {
            showToast("⚠️ Il giocatore ha terminato o abbandonato la partita.");
            window.stopWatchingCleanly();
            return;
        }

        const roomData = snap.val();
        const players = roomData.players || {};
        const hostData = Object.values(players)[0];

        if (!hostData || hostData.finished) {
            showToast("🏁 La partita che stavi osservando è terminata!");
            window.stopWatchingCleanly();
            return;
        }

        const currentSpeed = hostData.wpm || roomData.wpm || 20;
        if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${currentSpeed}`;
        if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${hostData.score || 0}`;

        if (els.tableBody && hostData.matchDetails) {
            els.tableBody.innerHTML = "";
            hostData.matchDetails.forEach(row => {
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

    const onAudioChange = db.ref(`rooms/${roomCode}/liveAudio`).on('value', snap => {
        const audioData = snap.val();
        if (audioData && audioData.word) {
            const liveWpm = audioData.wpm || 20;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`;
            if (typeof playMorseAudio === 'function') playMorseAudio(audioData.word, liveWpm, true);
        }
    });

    window.currentSpectatorCleanup = function() {
        roomRef.off('value', onRoomChange);
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

if (els.quitGameBtn) {
    els.quitGameBtn.onclick = function() {
        if (confirm("Vuoi abbandonare la partita?")) {
            gameRunning = false;
            window.exitRoomCleanly(false, true);
        }
    };
}

if (els.deleteRoomBtn) {
    els.deleteRoomBtn.onclick = function() {
        if (window.isDeletingRoom) return;
        if (confirm("Eliminare questa stanza?")) {
            window.isDeletingRoom = true;
            els.deleteRoomBtn.disabled = true;
            const currentCode = roomCode;
            window.exitRoomCleanly(true, false);
            if (currentCode) {
                db.ref(`public_lobby_rooms/${currentCode}`).remove();
                db.ref(`rooms/${currentCode}`).remove().finally(() => {
                    window.isDeletingRoom = false;
                    if (els.deleteRoomBtn) els.deleteRoomBtn.disabled = false;
                });
            } else {
                window.isDeletingRoom = false;
                if (els.deleteRoomBtn) els.deleteRoomBtn.disabled = false;
            }
        }
    };
}

if (els.leaveLobbyBtn) {
    els.leaveLobbyBtn.onclick = function() {
        window.exitRoomCleanly(false, false);
    };
}

if (els.startMultiplayerBtn) {
    els.startMultiplayerBtn.onclick = function() {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            if (currentMode === 'pingpong' && (snap.exists() ? Object.keys(snap.val()).length : 0) < 2) {
                return alert("Ping Pong richiede almeno 2 giocatori in stanza per iniziare!");
            }
            db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
            db.ref(`public_lobby_rooms/${roomCode}`).remove();
        });
    };
}

if (els.readyBtn) {
    els.readyBtn.addEventListener('click', () => {
        if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true });
    });
}

if (els.btnSendPingPong) {
    els.btnSendPingPong.onclick = function() {
        const input = document.getElementById('pingPongWordToSend');
        const val = input ? input.value.trim().toUpperCase() : "";
        if (!val) return;

        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
            if (d && !d.word) {
                d.word = val;
                d.wordId = (d.wordId || 0) + 1;
                d.senderId = myId;
            }
            return d;
        });
        if (input) input.value = "";
    };
}

if (document.getElementById('pingPongWordToSend')) {
    document.getElementById('pingPongWordToSend').onkeypress = function(e) {
        if (e.key === 'Enter') els.btnSendPingPong.click();
    };
}

window.lostFocusDuringWord = false;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (gameRunning && inputActive) {
            window.lostFocusDuringWord = true;
            if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
        }
    } else {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (typeof startBluetoothKeepAlive === 'function') startBluetoothKeepAlive();
        if (gameRunning && window.lostFocusDuringWord) {
            if (els.btnSendPingPong) {
    els.btnSendPingPong.onclick = function() {
        const input = document.getElementById('pingPongWordToSend');
        const val = input ? input.value.trim().toUpperCase() : "";
        if (!val) return;

        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => {
            if (d && !d.word) {
                d.word = val;
                d.wordId = (d.wordId || 0) + 1;
                d.senderId = myId;
            }
            return d;
        });
        if (input) input.value = "";
    };
}

if (document.getElementById('pingPongWordToSend')) {
    document.getElementById('pingPongWordToSend').onkeypress = function(e) {
        if (e.key === 'Enter') els.btnSendPingPong.click();
    };
}

window.lostFocusDuringWord = false;
            inputActive = false;
            showToast("⚠️ Schermo spento: parola considerata persa!");

            if (currentMode === 'conquest') {
                db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                    if (!state || state.status !== 'playing') return state;
                    state.progress = Math.max(0, (state.progress || 0) - 2);
                    return state;
                });
                setTimeout(() => {
                    if (gameRunning) {
                        if (typeof startCoopSequence === 'function') startCoopSequence();
                    }
                }, 1000);

            } else if (currentMode === 'quiz') {
                if (typeof submitQuizAnswer === 'function') submitQuizAnswer(-1);

            } else if (currentMode === 'pingpong') {
                if (typeof window.sendAutoPingPongWord === 'function') window.sendAutoPingPongWord();

            } else {
                currentWpm = Math.max(10, currentWpm - 2);
                if (els.wpmDisplay) {
                    els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
                }

                const missedWord = gameWords[wordIndex] ? gameWords[wordIndex].toUpperCase() : "-";

                matchDetailsArray.push({
                    real: missedWord,
                    typed: "TIMEOUT (SCHERMO)",
                    points: 0,
                    wpm: currentWpm,
                    ms: 0
                });

                if (els.tableBody) {
                    const tr = document.createElement('tr');
                    const tdTyped = document.createElement('td');
                    tdTyped.textContent = "TIMEOUT";
                    tdTyped.style.color = "#d32f2f";
                    tdTyped.style.fontSize = "0.8em";

                    const tdReal = document.createElement('td');
                    tdReal.innerHTML = `<b>${escapeHTML(missedWord)}</b>`;

                    const tdPoints = document.createElement('td');
                    tdPoints.style.color = "#d32f2f";
                    tdPoints.style.fontWeight = 'bold';
                    tdPoints.textContent = "0";

                    tr.appendChild(tdTyped);
                    tr.appendChild(tdReal);
                    tr.appendChild(tdPoints);
                    els.tableBody.appendChild(tr);

                    if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
                }

                wordIndex++;
                setTimeout(() => {
                    if (gameRunning) window.playNextWord();
                }, 800);
            }
        }
    }
});

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// --- AVVIO APP (SICUREZZA DOM E MODULI) ---
function bootApp() {
    console.log("CW Game: Booting app...");
    if (typeof window.startApp === 'function') {
        window.startApp();
    } else {
        console.warn("CW Game: startApp not found, retrying...");
        setTimeout(bootApp, 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(bootApp, 100));
} else {
    setTimeout(bootApp, 100);
}
