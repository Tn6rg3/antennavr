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

    // Se stiamo navigando fuori da una stanza e siamo in una stanza attiva
    if (!isPlayingScreen && roomCode && !gameRunning) {
        // Se non abbiamo ancora accettato la sfida, usciamo del tutto per pulire il contatore
        db.ref(`rooms/${roomCode}/players/${myId}/accepted`).once('value', s => {
            if (s.exists() && s.val() === false) {
                window.exitRoomCleanly(false, true); // Uscita esplicita per rimuovere il player non confermato
            } else {
                window.listenToRoomInBackground();
            }
        });
    }

    if (db && myId) {
        try {
            db.ref(`presence/${myId}`).update({
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                status: isPlayingScreen ? 'playing' : 'online'
            });
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
                                const accCount = Object.values(s.val() || {}).filter(p => p.accepted).length;
                                db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(accCount);
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
                            const accCount = Object.values(s.val() || {}).filter(p => p.accepted).length;
                            db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(accCount);
                        } else if (!amIHost) {
                            db.ref(`public_lobby_rooms/${roomCode}`).remove();
                        }
                    });
                }
            });
            roomCode = "";
        }
        else {
            // Se l'utente non ha accettato la sfida, rimuoviamolo comunque per non "sporcare" il contatore
            // Se l'ha accettata, lo segniamo come offline per permettere il rientro (rejoin)
            db.ref(`rooms/${roomCode}/players/${myId}`).once('value', s => {
                const p = s.val();
                if (p && !p.accepted) {
                    db.ref(`rooms/${roomCode}/players/${myId}`).remove().then(() => {
                        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
                            const accCount = Object.values(snap.val() || {}).filter(p => p.accepted).length;
                            db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(accCount);
                        });
                    });
                } else {
                    db.ref(`rooms/${roomCode}/players/${myId}`).update({ online: false });
                    // NOTA: Se l'Host esce ma resta nell'app, la stanza rimane aperta e lui riceverà notifiche.
                }
            });
        }
    } else {
        if (listeners.room) { listeners.room.off(); listeners.room = null; }
    }

    db.ref(`presence/${myId}`).update({
        name: myName,
        username: myPrivacy ? "" : tgUsername,
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

// Listener silenzioso quando l'utente naviga l'app ma è in una stanza
window.listenToRoomInBackground = function() {
    if (!roomCode || listeners.room) return;

    // Usiamo lo stesso listener di joinRoomLogic ma senza cambiare schermata subito
    // per intercettare lo stato 'countdown' o 'playing'
    listeners.room = db.ref(`rooms/${roomCode}`);
    listeners.room.on('value', snap => {
        if (!snap.exists()) {
            roomCode = "";
            localStorage.removeItem(STORAGE_ROOM_KEY);
            return window.exitRoomCleanly(true);
        }
        const rData = snap.val();

        // Se la partita sta per iniziare o è iniziata, riportiamo l'utente dentro
        if ((rData.status === 'playing' || rData.status === 'countdown') && !gameRunning) {
            window.joinRoomLogic(true);
        }
    });
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
            // Se la stanza non è single player, l'utente entra come "prospect" (non ancora confermato)
            // tranne se è il proprietario o è un invito accettato
            const isInviteAccepted = window.lastIncomingInvite && window.lastIncomingInvite.fromId === roomHostId;
            const amIHost = (myId === roomHostId);
            const shouldAutoAccept = isSinglePlayer || amIHost || isInviteAccepted || roomCode.startsWith("TRN_");

            playerRef.set({
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                score: 0,
                wpm: 0,
                finished: false,
                teamId: myTeamId,
                ready: false,
                online: true,
                accepted: shouldAutoAccept // true se single player o host o invito diretto
            }).then(() => {
                if (!isSinglePlayer && !roomCode.startsWith("TRN_") && shouldAutoAccept) {
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

            // Se sono l'Host, assicuriamoci che la stanza si chiuda se sparisco (crash o chiusura tab)
            if (myId === roomHostId && rData.status === 'waiting') {
                db.ref(`rooms/${roomCode}`).onDisconnect().remove();
                db.ref(`public_lobby_rooms/${roomCode}`).onDisconnect().remove();
            }

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

    // Filtriamo i giocatori che hanno effettivamente accettato la sfida
    const playersArray = Object.entries(playersData);
    const count = playersArray.length;
    const acceptedPlayers = playersArray.filter(([id, data]) => data.accepted);
    const acceptedCount = acceptedPlayers.length;

    if (count > lastPlayerCount && lastPlayerCount > 0) {
        if (typeof window.playBeep === 'function') window.playBeep(500, 0.1);
        setTimeout(() => { if (typeof window.playBeep === 'function') window.playBeep(700, 0.15); }, 150);
        window.showToast("👤 Qualcuno è entrato!");
    }
    lastPlayerCount = count;
    let allReady = true;
    if (acceptedCount < 2) allReady = false;

    // Mostriamo TUTTI i giocatori per visibilità, ma evidenziamo chi ha accettato
    playersArray.forEach(([id, data]) => {
        if (data.accepted && !data.ready) allReady = false;
        const li = document.createElement('li');
        li.style.opacity = data.accepted ? "1" : "0.6"; // Più chiaro se non confermato

        const nSpan = document.createElement('span');
        let statusIcon = data.accepted ? (data.ready ? '✅' : '⏳') : '👀';
        nSpan.textContent = `${statusIcon} ${data.name}`;

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
        } else if (!data.accepted) {
            const sWait = document.createElement('small');
            sWait.style.fontStyle = 'italic';
            sWait.textContent = ' (In attesa...)';
            li.appendChild(sWait);
        }
        els.playersList.appendChild(li);
    });

    const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong';
    const amIHost = (myId === hostId) || roomCode.startsWith("TRN_");
    const myData = playersData[myId];
    const amIReady = myData?.ready;
    const haveIAccepted = myData?.accepted;

    if (els.acceptChallengeBtn) {
        els.acceptChallengeBtn.style.display = (!amIHost && !haveIAccepted) ? 'block' : 'none';
        els.acceptChallengeBtn.onclick = () => {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({ accepted: true }).then(() => {
                db.ref(`rooms/${roomCode}/players`).once('value', s => {
                    const accCount = Object.values(s.val() || {}).filter(p => p.accepted).length;
                    db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(accCount);
                });
            });
        };
    }

    if (els.withdrawChallengeBtn) {
        els.withdrawChallengeBtn.style.display = (!amIHost && haveIAccepted) ? 'block' : 'none';
        els.withdrawChallengeBtn.onclick = () => {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({ accepted: false, ready: false }).then(() => {
                db.ref(`rooms/${roomCode}/players`).once('value', s => {
                    const accCount = Object.values(s.val() || {}).filter(p => p.accepted).length;
                    db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(accCount);
                });
            });
        };
    }

    if (els.startMultiplayerBtn) els.startMultiplayerBtn.style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none';
    if (els.deleteRoomBtn) els.deleteRoomBtn.style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none';
    if (els.readyBtn) els.readyBtn.style.display = (haveIAccepted && isTrnOrPP && !amIReady) ? 'block' : 'none';

    if (isTrnOrPP) {
        if (els.waitingHostText) {
            els.waitingHostText.style.display = amIReady ? 'block' : 'none';
            els.waitingHostText.textContent = "In attesa...";
        }
        if (els.statusInfoText) {
            if (!haveIAccepted && !amIHost) els.statusInfoText.textContent = "Vuoi partecipare?";
            else els.statusInfoText.textContent = amIReady ? "SONO PRONTO ✅" : "Connessione sicura in corso...";
        }
    } else {
        if (els.waitingHostText) {
            els.waitingHostText.style.display = amIHost ? 'none' : 'block';
            els.waitingHostText.textContent = haveIAccepted ? "In attesa dell'host..." : "Accetta la sfida per partecipare!";
        }
        if (els.statusInfoText) {
            if (amIHost) els.statusInfoText.textContent = "Sei l'Host.";
            else if (haveIAccepted) els.statusInfoText.textContent = "Partecipante confermato.";
            else els.statusInfoText.textContent = "In attesa di conferma...";
        }
    }

    if (allReady && isTrnOrPP && (acceptedPlayers[0][0] === myId || amIHost)) {
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

    if (typeof playMorseAudio === 'function') playMorseAudio(currentWord, currentWpm);
    lastWordStartTime = Date.now();

    // Aggiornamento liveAudio per gli spettatori ad ogni nuova parola
    if (roomCode) {
        db.ref(`rooms/${roomCode}/liveAudio`).set({
            word: currentWord,
            wpm: currentWpm,
            ts: Date.now(),
            wordId: wordIndex // Aggiungiamo un ID parola incrementale
        });
    }

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

    // --- MOSTRA TASTI RIASCOLTO NELLA TABELLA SOLO A FINE PARTITA ---
    window.showPostMatchReplayButtons();

    // --- MODIFICA: RESTA NELLA SCHERMATA GIOCO PER REVISIONE ---
    if (els.quitGameBtn) {
        els.quitGameBtn.textContent = currentLang === 'it' ? "Vai alla Classifica" : "Go to Leaderboard";
        els.quitGameBtn.classList.remove('btn-danger');
        els.quitGameBtn.classList.add('btn-success');
        els.quitGameBtn.onclick = function() {
            // Ripristiniamo il comportamento originale e andiamo alla classifica
            els.quitGameBtn.textContent = currentLang === 'it' ? "Abbandona" : "Quit";
            els.quitGameBtn.classList.add('btn-danger');
            els.quitGameBtn.classList.remove('btn-success');
            els.quitGameBtn.onclick = function() {
                if (confirm("Vuoi abbandonare la partita?")) {
                    gameRunning = false;
                    window.exitRoomCleanly(false, true);
                }
            };

            finishGameNavigation();
        };
    }

    if (els.gameInputArea) els.gameInputArea.style.display = 'none';
    if (els.scoreDisplay) els.scoreDisplay.innerHTML = `<b style="color:var(--champ-color)">FINITO!</b> PT: ${totalScore}`;
};

window.showPostMatchReplayButtons = function() {
    if (!els.tableBody) return;
    const rows = els.tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const detail = matchDetailsArray[index];
        if (!detail) return;

        const isCorrect = (detail.real === detail.typed);
        if (!isCorrect) {
            // Troviamo la cella Pt / 🔊 (indice 2)
            const tdActions = row.cells[2];
            if (tdActions) {
                const replayBtn = document.createElement('button');
                replayBtn.className = 'action-btn-small btn-secondary';
                replayBtn.style.padding = '2px 6px';
                replayBtn.style.marginTop = '2px';
                replayBtn.style.width = 'auto';
                replayBtn.innerHTML = '🔊';
                replayBtn.onclick = () => window.playMorseAudio(detail.real, detail.wpm || currentWpm, true);
                tdActions.appendChild(replayBtn);
            }
        }
    });
};

function finishGameNavigation() {
    window.showScreen('leaderboardScreen');

    if (currentMode === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
        if (typeof window.switchLBGroup === 'function') window.switchLBGroup('daily');
    }
    else if (roomCode && roomCode.startsWith("TRN_")) {
        if (typeof window.switchLBGroup === 'function') window.switchLBGroup('special');
        setTimeout(() => {
            const select = document.getElementById('lbModeSelect');
            if (select) { select.value = 'tournaments'; select.dispatchEvent(new Event('change')); }
        }, 150);
    }
    else if (isSinglePlayer) {
        if (typeof window.switchLBGroup === 'function') window.switchLBGroup('single');
        setTimeout(() => {
            const select = document.getElementById('lbModeSelect');
            const targetMode = currentMode === 'callsign' ? 'callsign' : (currentMode === 'quiz' ? 'quiz' : (currentMode === 'chars' ? 'chars' : 'standard'));
            if (select) {
                select.value = targetMode;
                select.dispatchEvent(new Event('change'));

                // --- NUOVO: SELEZIONE FILTRO PAROLE PER SINGOLO ---
                setTimeout(() => {
                    const filter = document.getElementById('lbWordFilter');
                    if (filter) {
                        const val = requestedWordCount.toString();
                        // Verifichiamo se il valore esiste nelle opzioni, altrimenti 'all'
                        const exists = Array.from(filter.options).some(o => o.value === val);
                        filter.value = exists ? val : 'all';
                        filter.dispatchEvent(new Event('change'));
                    }
                }, 100);
            }
        }, 150);
    }
    else {
        if (typeof window.switchLBGroup === 'function') window.switchLBGroup('multi');
        setTimeout(() => {
            const select = document.getElementById('lbModeSelect');
            const targetMode = currentMode === 'pingpong' ? 'pingpong' : 'standard';
            if (select) {
                select.value = targetMode;
                select.dispatchEvent(new Event('change'));

                // --- NUOVO: SELEZIONE FILTRO PAROLE PER MULTI ---
                setTimeout(() => {
                    const filter = document.getElementById('lbWordFilter');
                    if (filter) {
                        const val = requestedWordCount.toString();
                        const exists = Array.from(filter.options).some(o => o.value === val);
                        filter.value = exists ? val : 'all';
                        filter.dispatchEvent(new Event('change'));
                    }
                }, 100);
            }
        }, 150);
    }
}

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
    if (!real) return;
    const r = real.toUpperCase();
    const t = (typed || "").toUpperCase();
    for (let i = 0; i < Math.max(r.length, t.length); i++) {
        if (!r[i]) continue; // Se la parola reale è finita, ignoriamo extra dell'utente qui (mostriamo solo la correzione)
        const span = document.createElement('span');
        if (!t[i] || t[i] !== r[i]) {
            span.style.color = "#d32f2f";
            span.style.fontWeight = "bold";
            span.style.textDecoration = "underline";
        }
        span.textContent = r[i];
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
        inputActive = false;
        const currentWord = gameWords[wordIndex] || "";
        const isCorrect = (userWord === currentWord);

        // Puliamo l'input immediatamente dopo l'invio nel corso per evitare residui
        if (els.permanentGameInput) els.permanentGameInput.value = "";

        if (window.courseData) {
            if (!window.courseData.progress.char_stats) window.courseData.progress.char_stats = {};
            for (let i=0; i<currentWord.length; i++) {
                let c = currentWord[i];
                if (!c || ['__proto__','constructor','prototype'].includes(c)) continue;

                // Sanitizzazione chiave per Firebase
                let dbChar = (typeof firebaseEscape === 'function') ? firebaseEscape(c) : c.replace(/\./g, '_dot_');

                if (!window.courseData.progress.char_stats[dbChar]) window.courseData.progress.char_stats[dbChar] = { attempts: 0, errors: 0 };
                window.courseData.progress.char_stats[dbChar].attempts++;
                if (userWord[i] !== currentWord[i]) window.courseData.progress.char_stats[dbChar].errors++;
            }
            window.saveCourseState();
        }

        const tr = document.createElement('tr');
        const tdTyped = document.createElement('td'); tdTyped.textContent = userWord;
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
        tdPoints.style.textAlign = 'center';
        tdPoints.textContent = isCorrect ? "OK" : "ERR";
        tdPoints.style.color = isCorrect ? "#4caf50" : "#d32f2f";
        tdPoints.style.fontWeight = "bold";

        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        if (els.tableBody) {
            els.tableBody.appendChild(tr);
            els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }

        setTimeout(() => {
            if (gameRunning && isCourseMode) {
                wordIndex++;
                window.playNextCourseGroup();
            }
        }, 300 * (parseFloat(window.courseData?.settings?.group_spacing) || 1.0));
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
        const tdTyped = document.createElement('td'); tdTyped.textContent = userWord || "-";

        const tdReal = document.createElement('td');
        window.renderDiffSecure(tdReal, currentWord, userWord);

        const tdPoints = document.createElement('td');
        tdPoints.style.textAlign = 'center';
        tdPoints.style.color = scoreColor;
        tdPoints.style.fontWeight = 'bold';
        tdPoints.textContent = currentMode === 'chars' ? points : (usedReplay ? '0' : (points > 0 ? "+"+points : points));

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
            // Evitiamo di riprodurre la stessa parola più volte (controllo ts o wordId)
            const msgTs = audioData.ts || 0;
            if (msgTs > (window.lastSpectatorAudioTs || 0)) {
                window.lastSpectatorAudioTs = msgTs;
                const liveWpm = audioData.wordWpm || audioData.wpm || 20;
                if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`;
                if (typeof playMorseAudio === 'function') playMorseAudio(audioData.word, liveWpm, true);
            }
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
