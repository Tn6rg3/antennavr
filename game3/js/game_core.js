// js/game_core.js

window.domCache = {};
window.initDOMCache = function() {
    const ids = [
        'wpmDisplay', 'scoreDisplay', 'tableBody', 'tableWrapper',
        'permanentGameInput', 'replayWordBtn', 'quitGameBtn',
        'pingPongSendArea', 'gameInputArea', 'pingPongWordToSend',
        'spectatorsCountDisplay', 'coopArea', 'coopTimeDisplay', 'coopProgressText', 'coopProgressBar'
    ];
    ids.forEach(id => {
        window.domCache[id] = document.getElementById(id);
    });
};

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

    // Inizializziamo il cache DOM se entriamo in gioco
    if (isPlayingScreen && typeof window.initDOMCache === 'function') {
        window.initDOMCache();
    }

    // Se stiamo navigando fuori da una stanza e siamo in una stanza attiva
    if (!isPlayingScreen && roomCode && !gameRunning) {
        // --- FIX: Se sono l'Host, NON devo mai essere rimosso automaticamente ---
        const amIHost = (myId === roomHostId);

        if (amIHost) {
            window.listenToRoomInBackground();
        } else {
            // Se sono un ospite, controllo se ho accettato
            db.ref(`rooms/${roomCode}/players/${myId}/accepted`).once('value', s => {
                if (s.exists() && s.val() === false) {
                    window.exitRoomCleanly(false, true);
                } else {
                    window.listenToRoomInBackground();
                }
            });
        }
    }

    if (db && myId) {
        try {
            const presenceData = {
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                status: isPlayingScreen ? 'playing' : 'online'
            };
            // Includiamo sempre il livello se disponibile
            if (window.userProgression?.level) {
                presenceData.level = window.userProgression.level;
            }
            db.ref(`presence/${myId}`).update(presenceData);
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

        // OTTIMIZZAZIONE: Attiviamo i listener solo nel menu principale
        if (typeof window.listenToOnlineUsers === 'function') window.listenToOnlineUsers();
        if (typeof window.listenToRooms === 'function') window.listenToRooms();
    } else {
        // OTTIMIZZAZIONE: Spegniamo i listener pesanti quando usciamo dal menu
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
        if (!window.lbManualRouting) {
            if (typeof window.switchLBGroup === 'function') window.switchLBGroup('daily');
        }
        window.lbManualRouting = false;
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
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    // Reset variabili di gioco per evitare leakage tra sessioni
    gameRunning = false;
    inputActive = false;
    gameWords = [];
    wordIndex = 0;
    isCourseMode = false;

    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }

    // RESET STATI SFIDA (Badge Online)
    if (typeof window.resetLocalChallengeState === 'function') {
        window.resetLocalChallengeState();
    }

    let targetScreen = 'setupScreen';
    const amIHost = (myId === roomHostId);

    // Salviamo il roomCode prima di pulirlo per decidere la schermata di ritorno
    const currentCode = roomCode;

    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (listeners.spectators && roomCode) { db.ref(`rooms/${roomCode}/spectators`).off('value', listeners.spectators); listeners.spectators = null; }
    window.isRoomMonitorActive = false;
    if (listeners.pingPong && roomCode) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (roomCode) { db.ref(`rooms/${roomCode}/coop_state`).off(); }

    isCoopMode = false;
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        localStorage.removeItem(STORAGE_ROOM_KEY);

        // Se eravamo in un corso, rimuoviamo il segnalatore LIVE per i tutor
        if (roomCode.startsWith("COURSE_")) {
            db.ref(`courseActiveEnrollments/${myId}`).update({ roomCode: null });
        }

        if (roomWasDeletedByHost) {
            if (!amIHost) {
                const msg = currentLang === 'it' ? "⚠️ La stanza è stata chiusa dall'Host." : "⚠️ The room was closed by the Host.";
                if (window.tg && window.tg.showAlert) window.tg.showAlert(msg);
                else showToast(msg);
            }
            if (amIHost && !roomCode.startsWith("TRN_")) {
                db.ref(`rooms/${roomCode}`).remove();
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            } else {
                db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
                db.ref(`rooms/${roomCode}/players/${myId}`).remove().then(() => {
                    // Aggiorna conteggio totale in bacheca
                    if (currentCode && !currentCode.startsWith("TRN_")) {
                        db.ref(`rooms/${currentCode}/players`).once('value', s => {
                            if (s.exists()) {
                                const totalCount = Object.keys(s.val() || {}).length;
                                db.ref(`public_lobby_rooms/${currentCode}/pCount`).set(totalCount);
                            }
                        });
                    }
                });
            }
            roomCode = "";
        }
        else if (isExplicitQuit) {
            db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();

            if (gameRunning) {
                db.ref(`rooms/${roomCode}/players/${myId}`).update({ finished: true, abandoned: true, online: false });
            } else {
                db.ref(`rooms/${roomCode}/players/${myId}`).remove().then(() => {
                    if (currentCode && !currentCode.startsWith("TRN_")) {
                        db.ref(`rooms/${currentCode}/players`).once('value', s => {
                            if (s.exists()) {
                                const totalCount = Object.keys(s.val() || {}).length;
                                db.ref(`public_lobby_rooms/${currentCode}/pCount`).set(totalCount);
                            } else if (!amIHost) {
                                db.ref(`public_lobby_rooms/${currentCode}`).remove();
                            }
                        });
                    }
                });
            }
            roomCode = "";
        } else {
            // Se usciamo per navigazione classifiche (senza delete o explicit quit)
            // puliamo comunque il roomCode per evitare riavvii automatici dai listener
            db.ref(`rooms/${roomCode}/players/${myId}`).once('value', s => {
                const p = s.val();
                if (p && !p.accepted) {
                    db.ref(`rooms/${roomCode}/players/${myId}`).remove().then(() => {
                        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
                            const totalCount = snap.exists() ? Object.keys(snap.val() || {}).length : 0;
                            db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(totalCount);
                        });
                    });
                } else {
                    db.ref(`rooms/${roomCode}/players/${myId}`).update({ online: false });
                }
            });
            roomCode = "";
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

    // Se non è un'uscita forzata/esplicita e siamo in un contesto particolare (es. Torneo), restiamo lì
    if (currentCode && currentCode.startsWith("TRN_")) targetScreen = 'teamsScreen';

    // Se stiamo navigando verso la classifica (lbManualRouting attivo), NON cambiamo schermata qui
    // altrimenti sovrascriviamo la destinazione desiderata (es. Leaderboard)
    if (!window.lbManualRouting) {
        window.showScreen(targetScreen);
    } else {
        console.log("Exit: Suppressing screen change due to lbManualRouting");
    }

    if (targetScreen === 'setupScreen' && !window.lbManualRouting) {
        if (typeof window.listenToRooms === 'function') window.listenToRooms();
    }
};

// Listener silenzioso quando l'utente naviga l'app ma è in una stanza
window.listenToRoomInBackground = function() {
    if (!roomCode || window.isRoomMonitorActive) return;

    console.log("Room Monitor: Enabling for " + roomCode);
    window.isRoomMonitorActive = true;

    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    listeners.room = db.ref(`rooms/${roomCode}`);

    // Inizializziamo i contatori globali
    window.lastPlayerCount = window.lastPlayerCount || 0;
    window.lastAcceptedCount = window.lastAcceptedCount || 0;

    let isFirstRun = true;

    listeners.room.on('value', snap => {
        if (!snap.exists()) {
            console.log("Room Monitor: Room deleted, cleaning up.");
            window.isRoomMonitorActive = false;
            roomCode = "";
            localStorage.removeItem(STORAGE_ROOM_KEY);
            return window.exitRoomCleanly(true);
        }

        const rData = snap.val();
        const players = rData.players || {};
        const pCount = Object.keys(players).length;
        const acceptedCount = Object.values(players).filter(p => p.accepted).length;
        const amIHost = (myId === rData.hostId);

        if (isFirstRun) {
            window.lastPlayerCount = pCount;
            window.lastAcceptedCount = acceptedCount;
            isFirstRun = false;
            console.log("Room Monitor: Initial sync. Players:", pCount, "Accepted:", acceptedCount);
        }

        // 1. SINCRONIZZAZIONE BACHECA PUBBLICA (Sempre se Host)
        // Garantiamo che gli altri utenti vedano il numero reale di persone in lobby
        if (amIHost && rData.status === 'waiting') {
            db.ref(`public_lobby_rooms/${roomCode}`).update({ pCount: pCount });
        }

        // 2. GESTIONE UI E NOTIFICHE
        const isLobbyVisible = (els.lobbyScreen && els.lobbyScreen.classList.contains('active-screen'));

        if (isLobbyVisible) {
            window.renderPlayersList(players, rData.hostId);
            window.lastPlayerCount = pCount;
            window.lastAcceptedCount = acceptedCount;
        } else if (!gameRunning && !isCourseMode) {
            // Logica Notifiche in Background
            if (amIHost) {
                if (acceptedCount > window.lastAcceptedCount) {
                    console.log("Room Monitor: Challenge accepted detected!");
                    window.showRoomEventModal("Sfida Accettata! 🚀", "Un giocatore è pronto a partire.");
                    if (typeof window.playBeep === 'function') {
                        window.playBeep(880, 0.1);
                        setTimeout(() => window.playBeep(1100, 0.15), 100);
                    }
                } else if (acceptedCount < window.lastAcceptedCount) {
                    console.log("Room Monitor: Withdrawal detected!");
                    window.showRoomEventModal("Sfida Annullata ⚠️", "Un giocatore si è ritirato dalla sfida.");
                    if (typeof window.playBeep === 'function') window.playBeep(440, 0.2);
                } else if (pCount > window.lastPlayerCount) {
                    console.log("Room Monitor: New player join detected!");
                    window.showRoomEventModal("Nuovo Ingresso 👤", "Qualcuno è entrato nella tua stanza.");
                    if (typeof window.playBeep === 'function') window.playBeep(700, 0.2);
                } else if (pCount < window.lastPlayerCount) {
                    console.log("Room Monitor: Player left room.");
                    // Notifica opzionale per l'uscita
                    // window.showRoomEventModal("Abbandono 👤", "Un utente è uscito dalla stanza.");
                }
            }
        }

        // Aggiorniamo i contatori per il prossimo evento
        window.lastPlayerCount = pCount;
        window.lastAcceptedCount = acceptedCount;

    // 3. GESTIONE TRANSIZIONI DI STATO (Countdown / Playing)
    if ((rData.status === 'playing' || rData.status === 'countdown') && !gameRunning) {
        console.log("Room Monitor: Match starting, switching to game mode.");
        localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
        window.isRoomMonitorActive = false;

        // Reset preventivo dello stato per evitare inquinamento da sessioni precedenti o corso
        if (typeof window.resetGameState === 'function') window.resetGameState();
        gameRunning = true; // Importante: deve essere true prima di caricare i parametri

        // Sincronizzazione parametri avanzati della stanza
            currentWpm = rData.wpm;
            baseWpm = rData.wpm;
            if (rData.words) gameWords = rData.words;

            window.isFixedSpeed = !!rData.fixedSpeed;
            window.isEasyMode = !!rData.easyMode;
            window.isAllowSpectators = !!rData.allowSpectators;
            window.charSpaceWpm = rData.charSpaceWpm || 0;
            window.wordSpaceMult = rData.wordSpaceMult || 1.0;

            if (rData.status === 'playing') {
                return window.resumeGameSequence();
            } else {
                return window.startCountdownSequence();
            }
        }
    });
};

window.joinSpecificRoom = function(code) {
    roomCode = code;
    window.joinRoomLogic(false);
};

window.joinRoomLogic = function(isReconnect = false) {
    gameRunning = false;

    // 1. Recuperiamo prima i dati della stanza per sapere chi è l'Host
    db.ref(`rooms/${roomCode}`).once('value', roomSnap => {
        const rData = roomSnap.val();
        if (!rData) return window.exitRoomCleanly(true);

        // Sincronizziamo l'Host ID fondamentale
        roomHostId = rData.hostId;
        window.roomCreatedAt = rData.createdAt || 0;

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
                // Se sono l'Host o è un invito accettato, accepted è sempre true
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
                    accepted: shouldAutoAccept
                }).then(() => {
                    // Aggiornamento bacheca real-time
                    db.ref(`rooms/${roomCode}/players`).once('value', s => {
                        const count = s.exists() ? Object.keys(s.val()).length : 1;
                        db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(count);
                    });
                });
            } else {
                playerRef.update({ online: true, name: myName, username: myPrivacy ? "" : tgUsername });
                // Sincronizziamo bacheca al rientro
                db.ref(`rooms/${roomCode}/players`).once('value', s => {
                    const count = s.exists() ? Object.keys(s.val()).length : 1;
                    db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(count);
                });
            }

            if (typeof window.listenToChat === 'function') window.listenToChat();
            window.isRoomMonitorActive = false;
            window.listenToRoomInBackground();

            // --- AVVIO TIMER SCADENZA LOBBY (Solo se Multi e se presente expiresAt) ---
            if (!isSinglePlayer && rData.expiresAt) {
                window.startLobbyTimer(rData.expiresAt);
            } else if (els.lobbyTimerText) {
                els.lobbyTimerText.textContent = "";
            }
        });
    });
};

/**
 * GESTORE TIMER LOBBY (SCADENZA STANZA)
 */
window.startLobbyTimer = function(expiresAt) {
    if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
    if (!els.lobbyTimerText) return;

    const updateTimer = () => {
        const now = Date.now();
        const diff = expiresAt - now;

        if (diff <= 0) {
            clearInterval(lobbyTimerInterval);
            els.lobbyTimerText.textContent = "STANZA SCADUTA!";

            // Se sono l'Host, elimino la stanza automaticamente
            if (myId === roomHostId) {
                showToast("Tempo scaduto! La stanza è stata chiusa.");
                window.exitRoomCleanly(true);
            } else {
                showToast("La stanza è scaduta.");
                window.exitRoomCleanly(false);
            }
            return;
        }

        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        const timeStr = (currentLang === 'en' ? "Expires in: " : "Scade tra: ") +
                        `${minutes}:${seconds.toString().padStart(2, '0')}`;

        els.lobbyTimerText.textContent = timeStr;
    };

    updateTimer();
    lobbyTimerInterval = setInterval(updateTimer, 1000);
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
            if (els.acceptChallengeBtn.disabled) return;
            els.acceptChallengeBtn.disabled = true;
            els.acceptChallengeBtn.textContent = "⌛ Elaborazione...";

            db.ref(`rooms/${roomCode}/players/${myId}`).update({ accepted: true }).then(() => {
                db.ref(`rooms/${roomCode}/players`).once('value', s => {
                    // --- FIX: Usiamo il conteggio totale dei presenti per coerenza bacheca ---
                    const totalCount = s.exists() ? Object.keys(s.val()).length : 1;
                    db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(totalCount);

                    els.acceptChallengeBtn.disabled = false;
                    els.acceptChallengeBtn.textContent = "ACCETTA LA SFIDA ✅";
                });
            }).catch(err => {
                console.error("Accept Challenge Error:", err);
                els.acceptChallengeBtn.disabled = false;
                els.acceptChallengeBtn.textContent = "ACCETTA LA SFIDA ✅";
            });
        };
    }

    if (els.withdrawChallengeBtn) {
        els.withdrawChallengeBtn.style.display = (!amIHost && haveIAccepted) ? 'block' : 'none';
        els.withdrawChallengeBtn.onclick = () => {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({ accepted: false, ready: false }).then(() => {
                db.ref(`rooms/${roomCode}/players`).once('value', s => {
                    const totalCount = s.exists() ? Object.keys(s.val()).length : 1;
                    db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(totalCount);
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
        // Recuperiamo il conteggio iniziale dei giocatori che iniziano la sfida
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const initialPlayers = snap.val() || {};
            // Non forziamo più a 2, lasciamo che il listener aggiorni il conteggio dinamico
            gameStartPlayerCount = Object.keys(initialPlayers).length;

            console.log("Match Start: Initial player count =", gameStartPlayerCount);

            if (listeners.players) db.ref(`rooms/${roomCode}/players`).off('value', listeners.players);
            listeners.players = db.ref(`rooms/${roomCode}/players`).on('value', pSnap => {
                // Monitoriamo solo se la partita è effettivamente in corso o nel countdown
                if (!gameRunning) return;

                const players = pSnap.val() || {};
                const currentPCount = Object.keys(players).length;

                // --- NUOVA LOGICA DI RILEVAMENTO ABBANDONO (Più robusta) ---

                // 1. Durante il countdown, aggiorniamo il conteggio di partenza se entrano nuovi giocatori
                // Questo risolve il problema delle sfide dirette dove l'host entra un istante dopo l'accept
                if (currentPCount > gameStartPlayerCount) {
                    gameStartPlayerCount = currentPCount;
                    console.log("Match Countdown: Player count updated to", gameStartPlayerCount);
                    return;
                }

                // 2. Verifichiamo l'abbandono solo se siamo oltre il countdown (o se il calo è drastico)
                const playersArray = Object.values(players);
                const hasAbandoned = playersArray.some(p => p.abandoned);

                if (gameStartPlayerCount >= 2 && (currentPCount < gameStartPlayerCount || hasAbandoned)) {
                    // Verifichiamo lo stato reale della stanza prima di chiudere
                    db.ref(`rooms/${roomCode}/status`).once('value', sSnap => {
                        const currentStatus = sSnap.val();

                        // Chiudiamo a tavolino solo se la partita era iniziata o se l'abbandono è esplicito
                        if (currentStatus === 'playing' || hasAbandoned) {
                            if (currentPCount === 1 && players[myId]) {
                                gameRunning = false;
                                const msg = currentLang === 'it' ? "L'avversario si è ritirato. Hai vinto a tavolino! 🏆" : "Opponent withdrew. You win by default! 🏆";
                                if (window.tg && window.tg.showAlert) window.tg.showAlert(msg); else alert(msg);
                                window.finishGame();
                            } else if (!players[myId]?.abandoned) {
                                showToast(currentLang === 'it' ? "Un giocatore ha abbandonato." : "A player left the game.");
                            }
                        }
                    });
                }

                // Caso 2: Qualcuno è ancora nel nodo ma è andato Offline (Crash o chiusura app)
                // Lo gestiamo solo per il match 1vs1 per ora
                if (gameStartPlayerCount === 2 && currentPCount === 2) {
                    const myNameLower = (myName || "").toLowerCase();
                    const opponent = Object.values(players).find(p => (p.name || "").toLowerCase() !== myNameLower);

                    if (opponent && opponent.online === false) {
                        // Aspettiamo un momento per vedere se rientra
                        setTimeout(() => {
                            if (!gameRunning) return;
                            db.ref(`rooms/${roomCode}/players`).once('value', s => {
                                const latestPlayers = s.val() || {};
                                const latestOpp = Object.values(latestPlayers).find(p => (p.name || "").toLowerCase() !== myNameLower);
                                if (gameRunning && latestOpp && latestOpp.online === false) {
                                    showToast(currentLang === 'it' ? "L'avversario sembra offline..." : "Opponent seems offline...");
                                }
                            });
                        }, 5000);
                    }
                }
            });
        });
    }
    if (domCache.wpmDisplay) domCache.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if (domCache.scoreDisplay) domCache.scoreDisplay.textContent = `Punti: 0`;

    // --- GESTIONE CONTATORE SPETTATORI (REAL-TIME) ---
    if (isSinglePlayer && window.isAllowSpectators) {
        if (els.spectatorsCountDisplay) {
            els.spectatorsCountDisplay.style.display = 'inline-block';
            els.spectatorsCountDisplay.textContent = '👁️ 0';
        }

        // Pulizia listener precedente se presente
        if (listeners.spectators) db.ref(`rooms/${roomCode}/spectators`).off('value', listeners.spectators);

        listeners.spectators = db.ref(`rooms/${roomCode}/spectators`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (els.spectatorsCountDisplay) {
                els.spectatorsCountDisplay.textContent = `👁️ ${count}`;
                // Piccolo effetto visivo quando entra qualcuno
                els.spectatorsCountDisplay.style.transform = 'scale(1.2)';
                setTimeout(() => { if(els.spectatorsCountDisplay) els.spectatorsCountDisplay.style.transform = 'scale(1)'; }, 200);
            }
        });
    } else if (els.spectatorsCountDisplay) {
        els.spectatorsCountDisplay.style.display = 'none';
    }

    if (!isRejoining) {
        totalScore = 0; currentStreak = 0; wordIndex = 0; quizQuestionIndex = 0; usedReplay = false;
        peakWpm = currentWpm;
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

    // RESET CONDIVISIONE
    const share = document.getElementById('matchShareContainer');
    if (share) share.style.display = 'none';

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

    if (domCache.wpmDisplay) domCache.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if (domCache.scoreDisplay) domCache.scoreDisplay.textContent = `Punti: ${totalScore}`;

    if (domCache.tableBody) {
        domCache.tableBody.innerHTML = "";
        matchDetailsArray.forEach(row => {
            const tr = document.createElement('tr');
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
            const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed;
            const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = row.real; tdReal.appendChild(bReal);
            const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); domCache.tableBody.appendChild(tr);
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

    // LOGICA MODALITÀ SEMPLICE (EASY MODE) - Mostra caratteri mescolati
    const easyHint = document.getElementById('easyModeHint');
    if (isEasyMode && easyHint) {
        const shuffled = currentWord.split('').sort(() => Math.random() - 0.5).join('');
        easyHint.textContent = shuffled;
        easyHint.style.display = 'block';
    } else if (easyHint) {
        easyHint.style.display = 'none';
    }

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

    if (domCache.permanentGameInput) domCache.permanentGameInput.focus();
};

window.finishGame = function() {
    // Se vinciamo a tavolino con 0 punti, diamo un punto simbolico per attivare il salvataggio
    if (totalScore === 0 && !isSinglePlayer && !isCourseMode) {
        totalScore = 1;
    }

    gameRunning = false;
    inputActive = false;
    window.isRoomMonitorActive = false; // Disattiva il monitor di background per questa stanza

    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
    if (els.permanentGameInput) els.permanentGameInput.blur();

    const easyHint = document.getElementById('easyModeHint');
    if (easyHint) easyHint.style.display = 'none';

    clearAllTimers();

    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }

    // Se è una partita singola, segnamo la stanza come finita sul server
    if (roomCode && isSinglePlayer) {
        db.ref(`rooms/${roomCode}/status`).set('finished');
    }

    localStorage.removeItem(STORAGE_ROOM_KEY);
    window.isRejoining = false;
    window.isChallenging = false;
    window.outgoingChallengeId = null;
    window.incomingChallengeId = null;

    db.ref(`presence/${myId}`).update({
        allowSpectators: false,
        activeRoomCode: null,
        status: 'online'
    });

    if (roomCode) {
        const myPlayerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
        myPlayerRef.update({ finished: true, score: totalScore, wpm: peakWpm, matchDetails: matchDetailsArray });
        myPlayerRef.onDisconnect().cancel();
    }

    if (window.totalScore > 0 && !window.roomCode.startsWith("TRN_")) {
        db.ref(`rooms/${window.roomCode}/players`).once('value', snap => {
            const playersData = snap.val() || {};
            const pArray = Object.values(playersData);

            // --- FIX CLASSIFICA SFIDE ---
            // Determiniamo se è un multiplayer se:
            // 1. Ci sono effettivamente 2 o più persone nel nodo finale
            // 2. OPPURE la stanza non era single player e il conteggio iniziale era >= 2
            const isActuallyMulti = (pArray.length >= 2) || (!isSinglePlayer && gameStartPlayerCount >= 2);

            let dbPath;
            if (window.currentMode === 'daily_challenge') {
                let todayStr = new Date().toISOString().split('T')[0];
                dbPath = `leaderboard/daily_challenge/${todayStr}/${window.myId}`;
            } else {
                const modeFolder = window.currentMode === 'callsign' ? 'callsign/global' : `${window.currentMode === 'quiz' ? 'quiz' : window.currentMode === 'chars' ? 'chars' : window.currentMode === 'pingpong' ? 'pingpong' : 'standard'}/${!isActuallyMulti ? 'single' : 'multi'}_${window.requestedWordCount}`;
                dbPath = `leaderboard/${modeFolder}/${window.myId}`;
            }

            db.ref(dbPath).once('value', s => {
                let oldData = s.val();
                let oldScore = oldData ? (Number(oldData.score) || 0) : 0;
                let oldWpm = oldData ? (Number(oldData.wpm) || 0) : 0;
                const myLevel = window.userProgression?.level || 1;

                // Aggiorniamo se il punteggio è migliore, OPPURE se il punteggio è uguale ma la velocità è superiore
                if (!oldData || window.totalScore > oldScore || (window.totalScore === oldScore && window.peakWpm > oldWpm)) {
                    db.ref(dbPath).set({
                        name: window.myName,
                        username: window.myPrivacy ? "" : tgUsername,
                        score: window.totalScore,
                        wpm: window.peakWpm,
                        level: myLevel,
                        wordCount: window.requestedWordCount,
                        date: new Date().toLocaleDateString('it-IT')
                    });
                    window.showToast(currentLang === 'it' ? "🏆 Nuovo Record in Classifica!" : "🏆 New Leaderboard Record!");
                } else {
                    // Anche se non è record, aggiorniamo il livello se è cambiato
                    if (oldData && oldData.level !== myLevel) {
                        db.ref(dbPath).update({ level: myLevel });
                    }
                    window.showToast(currentLang === 'it' ? "Ottima partita! (Non hai superato il tuo record personale)" : "Good game! (Personal best not beaten)");
                }
            });

            // --- SALVATAGGIO RIEPILOGO MATCH (CRONOLOGIA SFIDE) ---
            if (isActuallyMulti) {
                window.saveMatchSummary(snap.val());
            }
        });
    }

    if (matchDetailsArray.length > 0) {
        db.ref(`users/${myId}/history`).push().set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: peakWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });
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
        if (currentMode === 'course') {
            els.quitGameBtn.textContent = currentLang === 'it' ? "Torna al Corso" : "Back to Course";
        } else {
            els.quitGameBtn.textContent = currentLang === 'it' ? "Vai alla Classifica" : "Go to Leaderboard";
        }

        els.quitGameBtn.classList.remove('btn-danger');
        els.quitGameBtn.classList.add('btn-success');

        // Salviamo lo stato del gioco corrente per la navigazione classifiche
        const savedMode = currentMode;
        const savedWordCount = requestedWordCount;
        const savedSinglePlayer = isSinglePlayer;
        const savedRoomCode = roomCode;

        els.quitGameBtn.onclick = function() {
            const modeToRoute = savedMode;
            const wcToRoute = savedWordCount;
            const singleToRoute = savedSinglePlayer;
            const codeToRoute = savedRoomCode;

            // --- FIX: Impostiamo lbManualRouting PRIMA di uscire per evitare redirect alla Home ---
            window.lbManualRouting = (modeToRoute !== 'course');

            // Pulizia UI e ripristino bottone originale
            els.quitGameBtn.textContent = currentLang === 'it' ? "Abbandona" : "Quit";
            els.quitGameBtn.classList.add('btn-danger');
            els.quitGameBtn.classList.remove('btn-success');
            els.quitGameBtn.onclick = function() {
                if (confirm("Vuoi abbandonare la partita?")) {
                    gameRunning = false;
                    window.exitRoomCleanly(false, true);
                }
            };

            if (modeToRoute === 'course') {
                window.exitRoomCleanly(false, false);
                window.showProfileScreen();
                window.switchProfileTab('course');
                return;
            }

            // Usciamo dalla stanza (ora rispetterà lbManualRouting)
            window.exitRoomCleanly(false, false);

            // Eseguiamo la navigazione alla classifica
            window.finishGameNavigation(modeToRoute, wcToRoute, singleToRoute, codeToRoute);
        };
    }

    // Pulizia eventuale container condivisione precedente
    const oldShare = document.getElementById('matchShareContainer');
    if (oldShare) oldShare.style.display = 'none';

    if (els.gameInputArea) els.gameInputArea.style.display = 'none';
    if (els.scoreDisplay) els.scoreDisplay.innerHTML = `<b style="color:var(--champ-color)">FINITO!</b> PT: ${totalScore}`;

    // --- NUOVO: AUTO-NAVIGAZIONE PER SFIDA GIORNALIERA ---
    if (currentMode === 'daily_challenge' && totalScore > 0) {
        setTimeout(() => {
            if (typeof window.finishGameNavigation === 'function') {
                const savedRoom = roomCode;
                window.lbManualRouting = true;
                window.exitRoomCleanly(false, false);
                window.finishGameNavigation('daily_challenge', 20, true, savedRoom);
            }
        }, 3000);
    }
}

window.showMatchShareButtons = function() {
    if (currentMode === 'course') return; // OTTIMIZZAZIONE: Nessun social nel corso

    // Cerchiamo un contenitore dove inserire i bottoni, o lo creiamo sotto la tabella
    let shareContainer = document.getElementById('matchShareContainer');
    if (!shareContainer) {
        shareContainer = document.createElement('div');
        shareContainer.id = 'matchShareContainer';
        shareContainer.style.cssText = "display:flex; flex-direction:column; gap:8px; width:100%; margin-top:10px;";
        const quitBtn = els.quitGameBtn;
        if (quitBtn && quitBtn.parentNode) {
            quitBtn.parentNode.insertBefore(shareContainer, quitBtn);
        }
    }
    shareContainer.innerHTML = '';
    shareContainer.style.display = 'flex';

    const btn = document.createElement('button');
    btn.className = 'btn-champ';
    btn.style.margin = '0';
    btn.textContent = currentLang === 'it' ? "📢 Condividi Risultato" : "📢 Share Result";

    btn.onclick = () => {
        const appUrl = encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`);
        let modeName = (currentMode || "Match").toUpperCase();
        if (currentMode === 'daily_challenge') modeName = "Sfida Giornaliera";

        const textMsg = encodeURIComponent(`📻 ${modeName} CW!\nHo totalizzato ${totalScore} pt (Velocità: ${currentWpm} WPM).\nRiesci a fare di meglio?`);
        const shareUrl = `https://t.me/share/url?url=${appUrl}&text=${textMsg}`;
        try {
            if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, '_blank');
        } catch (e) {
            window.open(shareUrl, '_blank');
        }
    };

    shareContainer.appendChild(btn);
};

window.saveMatchSummary = function(playersData) {
    if (!playersData || window.isSinglePlayer || isCourseMode || !roomCode) return;

    // --- FIX: Usiamo roomCode come ID univoco del match per garantire la sincronizzazione ---
    // Essendo il roomCode unico per sessione, entrambi i giocatori scriveranno nello stesso nodo.
    const matchId = roomCode;
    const safeWordCount = requestedWordCount || 10;

    // Recuperiamo i dati dei giocatori
    const players = Object.entries(playersData).map(([pid, p]) => ({
        id: pid,
        name: p.name || "Sconosciuto",
        username: p.username || "",
        score: p.score || 0,
        wpm: p.wpm || 0,
        finished: !!p.finished,
        abandoned: !!p.abandoned
    }));

    // Se c'è solo un giocatore (e non è abbandonato), non è un match multiplayer valido da salvare
    if (players.length < 2) {
        console.log("Summary: Skipping save, match not multiplayer (only 1 player).");
        return;
    }

    // Determiniamo il percorso corretto
    let baseMode = currentMode;
    if (baseMode === 'std') baseMode = 'standard';

    const validModes = ['standard', 'chars', 'quiz', 'pingpong', 'conquest', 'callsign'];
    let category = validModes.includes(baseMode) ? baseMode : 'standard';

    // Aggiungiamo sempre il suffisso _multi per la classifica "Sfide"
    if (category !== 'pingpong' && category !== 'conquest') {
        if (!category.endsWith("_multi")) category += "_multi";
    }

    const matchSummary = {
        players: players,
        mode: currentMode,
        wordCount: safeWordCount,
        date: new Date().toLocaleDateString('it-IT'),
        ts: firebase.database.ServerValue.TIMESTAMP
    };

    const summaryPath = `leaderboard/recent_matches/${category}/${safeWordCount}/${matchId}`;
    console.log("Summary: Saving match to " + summaryPath, matchSummary);

    db.ref(summaryPath).set(matchSummary).then(() => {
        console.log("Summary: Match saved successfully.");
    }).catch(e => {
        console.error("Summary Save Error:", e);
    });
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
                // Puliamo prima per sicurezza se richiamata più volte
                const oldBtn = tdActions.querySelector('.action-btn-small');
                if (oldBtn) oldBtn.remove();

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

function finishGameNavigation(mode, wordCount, isSingle, code) {
    window.lbManualRouting = true;
    window.showScreen('leaderboardScreen');

    // Determiniamo la categoria principale (tab)
    let mainGroup = 'multi';
    if (mode === 'daily_challenge') mainGroup = 'daily';
    else if (code && code.startsWith("TRN_")) mainGroup = 'special';
    else if (isSingle) mainGroup = 'single';

    // Determiniamo il sotto-modo (select)
    let subMode = 'standard';
    if (mode === 'callsign') subMode = 'callsign';
    else if (mode === 'quiz') subMode = 'quiz';
    else if (mode === 'chars') subMode = 'chars';
    else if (mode === 'pingpong') subMode = 'pingpong';
    else if (code && code.startsWith("TRN_")) subMode = 'tournaments';

    if (typeof window.switchLBGroup === 'function') {
        window.switchLBGroup(mainGroup);
    }

    setTimeout(() => {
        const modeSelect = document.getElementById('lbModeSelect');
        if (modeSelect) {
            modeSelect.value = subMode;
            modeSelect.dispatchEvent(new Event('change'));
        }

        setTimeout(() => {
            const wordFilter = document.getElementById('lbWordFilter');
            if (wordFilter) {
                const val = wordCount.toString();
                const exists = Array.from(wordFilter.options).some(o => o.value === val);
                wordFilter.value = exists ? val : 'all';
                wordFilter.dispatchEvent(new Event('change'));
            }
        }, 150);
    }, 200);
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
        if (domCache.permanentGameInput) domCache.permanentGameInput.focus();
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
            const rawVal = els.permanentGameInput.value;
            // Estraiamo solo il carattere digitato ignorando spazi/controlli aggiunti dal tablet
            const cleanVal = rawVal.replace(/\s/g, '').toUpperCase();
            if (cleanVal.length >= 1) {
                // Prendiamo l'ultimo carattere inserito in caso di buffer tastiera
                window.handleWordSubmission(cleanVal[cleanVal.length - 1]);
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

    // NASCONDI SUGGERIMENTO MODALITÀ SEMPLICE ALLA SOTTOMISSIONE
    const easyHint = document.getElementById('easyModeHint');
    if (easyHint) easyHint.style.display = 'none';

    userWord = userWord.substring(0, 50).trim().toUpperCase();

    if (isCourseMode) {
        inputActive = false;
        const currentWord = gameWords[wordIndex] || "";
        const isCorrect = (userWord === currentWord);

        // Puliamo l'input immediatamente dopo l'invio nel corso per evitare residui
        if (els.permanentGameInput) els.permanentGameInput.value = "";

        if (window.courseData) {
            if (!window.courseData.progress.char_stats) window.courseData.progress.char_stats = {};
            if (!window.courseData.progress.char_stats_by_type) window.courseData.progress.char_stats_by_type = { Z2: {}, WORK: {}, LONG: {} };

            const sessionType = window.courseData.current_day_session?.type || 'LONG';

            for (let i=0; i<currentWord.length; i++) {
                let c = currentWord[i];
                if (!c || ['__proto__','constructor','prototype'].includes(c)) continue;

                // Sanitizzazione chiave per Firebase
                let dbChar = (typeof firebaseEscape === 'function') ? firebaseEscape(c) : c.replace(/\./g, '_dot_');

                // 1. Statistiche Globali
                if (!window.courseData.progress.char_stats[dbChar]) window.courseData.progress.char_stats[dbChar] = { attempts: 0, errors: 0 };
                window.courseData.progress.char_stats[dbChar].attempts++;
                if (userWord[i] !== currentWord[i]) window.courseData.progress.char_stats[dbChar].errors++;

                // 2. Statistiche per TIPO di sessione
                if (!window.courseData.progress.char_stats_by_type[sessionType]) window.courseData.progress.char_stats_by_type[sessionType] = {};
                if (!window.courseData.progress.char_stats_by_type[sessionType][dbChar]) window.courseData.progress.char_stats_by_type[sessionType][dbChar] = { attempts: 0, errors: 0 };
                window.courseData.progress.char_stats_by_type[sessionType][dbChar].attempts++;
                if (userWord[i] !== currentWord[i]) window.courseData.progress.char_stats_by_type[sessionType][dbChar].errors++;
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

        // --- SINCRONIZZAZIONE PER TUTOR (SPETTATORI) ---
        matchDetailsArray.push({ real: currentWord, typed: userWord, points: isCorrect ? 1 : 0, wpm: currentWpm });
        if (roomCode) {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({
                wordIndex: wordIndex + 1,
                matchDetails: matchDetailsArray
            });
        }

        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        if (els.tableBody) {
            els.bodyTable = els.tableBody; // Backup per domCache
            els.tableBody.appendChild(tr);
            els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }

        if (nextWordTimeout) clearTimeout(nextWordTimeout);
        nextWordTimeout = setTimeout(() => {
            if (gameRunning && isCourseMode) {
                if (window.courseTimeIsUp) {
                    window.courseTimeIsUp = false;
                    if (typeof window.finishCourseSession === 'function') window.finishCourseSession();
                    return;
                }
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
            if (domCache.wpmDisplay) domCache.wpmDisplay.textContent = `WPM: ${currentWpm}`;
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
            if (domCache.wpmDisplay) domCache.wpmDisplay.textContent = `WPM: ${currentWpm}`;
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
            if (currentWpm > peakWpm) peakWpm = currentWpm;
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
        if (domCache.wpmDisplay) domCache.wpmDisplay.textContent = `WPM: ${currentWpm}`;
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
        if (nextWordTimeout) clearTimeout(nextWordTimeout);
        nextWordTimeout = setTimeout(window.playNextWord, 600);
    }
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
                    tdReal.innerHTML = "";
      const b = document.createElement('b');
      b.textContent = missedWord;
      tdReal.appendChild(b);

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
    if (typeof window.initDOMCache === 'function') window.initDOMCache();
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
