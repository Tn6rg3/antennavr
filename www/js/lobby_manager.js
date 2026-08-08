// ============================================================================
// LOBBY_MANAGER.JS - GESTIONE STANZE E INVITI
// ============================================================================

window.shareAppToFriends = function() {
    showToast("📢 Apertura condivisione Telegram...");

    const appUrl = `https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`;
    const textMsg = `📻 Unisciti a me su Sfida Telegrafia! Impara il codice Morse, sfida altri operatori e scala la classifica!`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(textMsg)}`;

    setTimeout(() => {
        try {
            if (tg && typeof tg.openTelegramLink === 'function') {
                tg.openTelegramLink(shareUrl);
            } else {
                window.open(shareUrl, '_blank');
            }
        } catch (e) {
            window.open(shareUrl, '_blank');
        }
    }, 200);
};

window.lastKnownRoomPlayersCount = window.lastKnownRoomPlayersCount || {};

function addOrUpdateRoomCard(code, room) {
    if (!els.waitingRoomsList || !room) return;
    if (code.startsWith("TRN_") || (room.expiresAt && Date.now() > room.expiresAt) || room.status !== 'waiting' || room.type === 'single') {
        removeRoomCard(code);
        return;
    }

    let li = document.getElementById(`room_list_item_${code}`);
    if (!li) {
        li = document.createElement('li');
        li.id = `room_list_item_${code}`;
        els.waitingRoomsList.appendChild(li);
        const emptyMsg = els.waitingRoomsList.querySelector('.empty-rooms-msg');
        if (emptyMsg) emptyMsg.remove();
    }

    li.innerHTML = '';
    let modeIcon = room.mode === 'callsign' ? '🎙️ Nom.'
                 : room.mode === 'pingpong' ? '🏓 Ping Pong'
                 : room.mode === 'quiz' ? '❓ Quiz'
                 : (room.mode === 'conquest' || room.type === 'coop') ? '⚔️ Conquista'
                 : '🔤 Parole';

    const pCount = Object.keys(room.players || {}).length || (room.pCount || 1);
    const prevCount = window.lastKnownRoomPlayersCount[code] || 1;
    const isMyRoom = (room.hostId === myId);
    const isOutsideRoom = (roomCode !== code || !els.lobbyScreen.classList.contains('active-screen'));

    if (isMyRoom && pCount > prevCount && pCount >= 2 && isOutsideRoom) {
        showToast(`👤 Un giocatore è appena entrato nella tua stanza #${code}!`);
        if (typeof playNotificationSound === 'function') playNotificationSound();
    }
    window.lastKnownRoomPlayersCount[code] = pCount;

    const span = document.createElement('span');
    const bTitle = document.createElement('b');
    bTitle.textContent = `#${code} - ${modeIcon}`;
    const infoText = `${pCount} Gioc. | ${room.wpm} WPM`;
    const smallInfo = document.createElement('small');
    smallInfo.textContent = infoText;
    span.appendChild(bTitle);
    span.appendChild(document.createElement('br'));
    span.appendChild(smallInfo);
    li.appendChild(span);

    const btn = document.createElement('button');
    btn.className = 'action-btn-small';
    btn.textContent = currentLang === 'en' ? 'Join' : 'Entra';
    btn.onclick = () => window.joinSpecificRoom(code);
    li.appendChild(btn);
}

function removeRoomCard(code) {
    if (!els.waitingRoomsList) return;
    const li = document.getElementById(`room_list_item_${code}`);
    if (li) li.remove();

    if (els.waitingRoomsList.children.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-rooms-msg';
        emptyLi.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;";
        emptyLi.textContent = currentLang === 'en' ? "No challenges." : "Nessuna sfida.";
        els.waitingRoomsList.appendChild(emptyLi);
    }
}

function openInviteModal(targetId, targetName) {
    currentInviterId = targetId;
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Sfida " + targetName;
    if (els.inviteModalText) els.inviteModalText.textContent = "Scegli le impostazioni per la sfida:";
    if (els.inviteSettings) els.inviteSettings.style.display = 'block';
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none';
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none';
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'block';
    if (els.inviteModal) els.inviteModal.style.display = 'flex';
}

function openTeamInviteModal(targetId, targetName) {
    currentInviterId = targetId;
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Recluta " + targetName;
    if (els.recruitmentStatusText) els.recruitmentStatusText.textContent = "Caricamento stato...";
    if (els.inviteSettings) els.inviteSettings.style.display = 'none';
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'block';
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none';
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
    if (els.recruitJoinBtn) els.recruitJoinBtn.style.display = 'none';

    db.ref('teams').once('value', snap => {
        let tName = null, inTeam = false;
        snap.forEach(tSnap => {
            const t = tSnap.val();
            if (t.status !== 'retired' && t.members && t.members[targetId]) {
                inTeam = true;
                tName = t.name;
            }
        });

        if (els.recruitmentStatusText) {
            els.recruitmentStatusText.innerHTML = "";
            if (inTeam) {
                els.recruitmentStatusText.appendChild(document.createTextNode("⚠️ "));
                const b1 = document.createElement('b'); b1.textContent = targetName; els.recruitmentStatusText.appendChild(b1);
                els.recruitmentStatusText.appendChild(document.createTextNode(" fa già parte della squadra "));
                const b2 = document.createElement('b'); b2.textContent = tName; els.recruitmentStatusText.appendChild(b2);
                els.recruitmentStatusText.appendChild(document.createTextNode("."));
                if (els.recruitCreateBtn) els.recruitCreateBtn.style.display = 'none';
            } else {
                els.recruitmentStatusText.appendChild(document.createTextNode("💡 "));
                const b1 = document.createElement('b'); b1.textContent = targetName; els.recruitmentStatusText.appendChild(b1);
                els.recruitmentStatusText.appendChild(document.createTextNode(" non ha ancora una squadra."));
                if (els.recruitCreateBtn) els.recruitCreateBtn.style.display = 'block';
                if (myTeamId && els.recruitJoinBtn) els.recruitJoinBtn.style.display = 'block';
            }
        }
    });

    if (els.inviteModal) els.inviteModal.style.display = 'flex';
}

function sendRecruitmentInvite(type) {
    db.ref(`invites/${currentInviterId}`).set({
        fromId: myId,
        fromName: myName,
        type: 'team',
        ts: firebase.database.ServerValue.TIMESTAMP,
        teamId: type === 'team' ? myTeamId : null,
        teamName: type === 'team' ? myTeamName : null
    }).then(() => {
        showToast("Invito inviato!");
        window.closeInviteModal();
    });
}

window.closeInviteModal = function() {
    if (els.inviteModal) els.inviteModal.style.display = 'none';
    currentInviterId = null;
};

if (els.sendInviteBtn) {
    els.sendInviteBtn.addEventListener('click', () => {
        if (isChallenging) return;
        isChallenging = true;
        const tId = currentInviterId;

        db.ref(`invites/${tId}`).set({
            fromId: myId,
            fromName: myName,
            mode: els.inviteModeInput ? els.inviteModeInput.value : 'standard',
            wpm: parseInt(els.inviteWpmInput ? els.inviteWpmInput.value : 20),
            wordCount: parseInt(els.inviteWordCountInput ? els.inviteWordCountInput.value : 10),
            ts: firebase.database.ServerValue.TIMESTAMP,
            status: 'pending'
        }).then(() => {
            showToast("Invito inviato! In attesa...");
            if (els.inviteModal) els.inviteModal.style.display = 'none';

            db.ref(`presence/${tId}`).once('value', s => {
                if (s.exists()) renderOrUpdateUserListItem(tId, s.val());
            });

            if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);

            listeners.outgoingInvite = db.ref(`invites/${tId}`).on('value', snap => {
                if (!snap.exists() && isChallenging) {
                    setTimeout(() => {
                        if (isChallenging) {
                            showToast("Rifiutato o scaduto.");
                            isChallenging = false;
                            currentInviterId = null;

                            db.ref(`presence/${tId}`).once('value', s => {
                                if (s.exists()) renderOrUpdateUserListItem(tId, s.val());
                            });

                            if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);
                        }
                    }, 1000);
                }
            });
        });
    });
}

function listenToInvites() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val();
        if (!inv || roomCode || gameRunning) return;
        if (Date.now() - inv.ts > 60000) return db.ref(`invites/${myId}`).remove();

        if (els.inviteModalText) els.inviteModalText.innerHTML = '';

        if (inv.type === 'team') {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = inv.teamId ? "🚀 INVITO SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
            if (inv.teamId) {
                els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti ha invitato ad unirti alla squadra "));
                const bTeam = document.createElement('b'); bTeam.textContent = inv.teamName; els.inviteModalText.appendChild(bTeam);
                els.inviteModalText.appendChild(document.createTextNode("."));
            } else {
                els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti suggerisce di creare una tua squadra!"));
            }

            if (els.inviteSettings) els.inviteSettings.style.display = 'none';
            if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none';
            if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none';
            if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'block';
            if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';

            if (els.acceptTeamInviteBtn) {
                els.acceptTeamInviteBtn.textContent = inv.teamId ? "UNISCITI ✅" : "VAI ALLA CREAZIONE 🛠️";
                els.acceptTeamInviteBtn.onclick = () => {
                    db.ref(`invites/${myId}`).remove();
                    window.closeInviteModal();
                    if (inv.teamId) window.joinTeam(inv.teamId);
                    else showScreen('teamsScreen');
                };
            }
        } else {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();
            els.inviteModalText.appendChild(document.createTextNode("Ti ha invitato a giocare:"));
            els.inviteModalText.appendChild(document.createElement('br'));
            const bMode = document.createElement('b'); bMode.textContent = inv.mode.toUpperCase(); els.inviteModalText.appendChild(bMode);
            els.inviteModalText.appendChild(document.createTextNode(" a "));
            const bWpm = document.createElement('b'); bWpm.textContent = inv.wpm; els.inviteModalText.appendChild(bWpm);
            els.inviteModalText.appendChild(document.createTextNode(" WPM ("));
            const bCount = document.createElement('b'); bCount.textContent = inv.wordCount; els.inviteModalText.appendChild(bCount);
            els.inviteModalText.appendChild(document.createTextNode(" test)."));

            if (els.inviteSettings) els.inviteSettings.style.display = 'none';
            if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none';
            if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'block';
            if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
            if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
        }

        if (els.inviteModal) els.inviteModal.style.display = 'flex';
        currentInviterId = inv.fromId;
        window.lastIncomingInvite = inv;
    });
}

if (els.declineTeamInviteBtn) {
    els.declineTeamInviteBtn.addEventListener('click', () => {
        db.ref(`invites/${myId}`).remove();
        window.closeInviteModal();
    });
}

if (els.declineInviteBtn) {
    els.declineInviteBtn.addEventListener('click', () => {
        db.ref(`invites/${myId}`).remove();
        window.closeInviteModal();
    });
}

if (els.acceptInviteBtn) {
    els.acceptInviteBtn.addEventListener('click', () => {
        const inv = window.lastIncomingInvite;
        if (!inv) return;

        db.ref(`invites/${myId}`).remove();
        window.closeInviteModal();

        const rCode = Math.floor(1000 + Math.random() * 9000).toString();

        db.ref(`rooms/${rCode}`).set({
            status: 'waiting',
            type: 'multi',
            mode: inv.mode,
            wpm: inv.wpm,
            tone: 600,
            wordCount: inv.wordCount,
            words: getGameWords(inv.wordCount, inv.mode),
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: Date.now() + 600000,
            hostId: inv.fromId
        }).then(() => {
            db.ref(`public_lobby_rooms/${rCode}`).set({
                mode: inv.mode,
                pCount: 1,
                wpm: inv.wpm,
                wordCount: inv.wordCount,
                status: 'waiting',
                expiresAt: Date.now() + 600000
            });
            db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode });
            roomCode = rCode;
            joinRoomLogic(false);
        });
    });
}

function listenToInviteAccepted() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => {
        const d = snap.val();
        if (d && d.roomCode) {
            db.ref(`invite_accepted/${myId}`).remove();
            isChallenging = false;
            window.closeInviteModal();
            roomCode = d.roomCode;
            joinRoomLogic(false);
        }
    });
}

function exitRoomCleanly(roomWasDeletedByHost = false, isExplicitQuit = false) {
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

    hideChat();
    showScreen(targetScreen);

    if (targetScreen === 'setupScreen') {
        listenToRooms();
    }
}

if (els.quitGameBtn) {
    els.quitGameBtn.onclick = function() {
        if (confirm("Vuoi abbandonare la partita?")) {
            gameRunning = false;
            exitRoomCleanly(false, true);
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
            exitRoomCleanly(true, false);

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
        exitRoomCleanly(false, false);
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

if (els.createRoomBtn) {
    els.createRoomBtn.addEventListener('click', () => {
        const gameType = els.gameTypeInput.value, gameMode = els.gameModeInput.value;
        if (gameType === 'tournament') {
            showScreen('teamsScreen');
            if (gameMode === 'trn_create_team') switchTeamTab('gest');
            else if (gameMode === 'trn_join_team') switchTeamTab('allteams');
            else if (gameMode === 'trn_create_trn') switchTeamTab('tournaments');
            return;
        }
        if (gameMode === 'custom' && customDictionary.length === 0) {
            els.customDictModal.style.display = 'flex';
            return showToast("Carica prima un file di testo!");
        }

        isChallenging = false;
        if (currentInviterId) {
            db.ref(`invites/${currentInviterId}`).once('value', s => {
                if (s.exists() && s.val().fromId === myId) db.ref(`invites/${currentInviterId}`).remove();
            });
        }
        db.ref(`invite_accepted/${myId}`).remove();

        currentMode = gameMode || 'standard';
        isSinglePlayer = (gameType === 'single');
        const allowSpectators = (isSinglePlayer && els.allowSpectatorsCheckbox?.checked) || false;

        currentWpm = currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20);
        baseWpm = currentWpm;
        requestedWordCount = currentMode === 'callsign' ? 25 : Math.min(200, Math.max(1, parseInt(els.wordCountInput?.value) || 10));
        currentTone = parseInt(els.toneInput?.value) || 600;
        isFixedSpeed = els.fixedSpeedCheckbox?.checked || false;
        isEasyMode = els.easyModeCheckbox?.checked || false;

        let cSpace = isSinglePlayer && (els.charSpaceInput && els.charSpaceInput.value) ? (parseInt(els.charSpaceInput.value) || currentWpm) : currentWpm;
        let wSpace = isSinglePlayer && (els.wordSpaceSelect && els.wordSpaceSelect.value) ? (parseFloat(els.wordSpaceSelect.value) || 1.0) : 1.0;
        window.charSpaceWpm = cSpace;
        window.wordSpaceMult = wSpace;

        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        gameWords = getGameWords(requestedWordCount, currentMode);

        if (!gameWords || gameWords.length === 0) {
            const dict = (masterDictionary && masterDictionary.length > 0) ? masterDictionary : ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA"];
            gameWords = fisherYatesShuffle(dict).slice(0, requestedWordCount).map(w => w.toUpperCase());
        }

        const timerMinutes = parseInt(els.roomTimerInput?.value) || 5;
        const expiresTimestamp = isSinglePlayer ? null : Date.now() + (timerMinutes * 60000);

        db.ref('rooms/' + roomCode).set({
            status: isSinglePlayer ? 'countdown' : 'waiting',
            type: isSinglePlayer ? 'single' : (gameType === 'coop' ? 'coop' : 'multi'),
            mode: currentMode,
            wpm: currentWpm,
            tone: currentTone,
            wordCount: requestedWordCount,
            words: gameWords,
            fixedSpeed: isFixedSpeed,
            charSpaceWpm: cSpace,
            wordSpaceMult: wSpace,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: expiresTimestamp,
            hostId: myId || "anon"
        }).then(() => {
            if (!isSinglePlayer) {
                db.ref(`public_lobby_rooms/${roomCode}`).set({
                    mode: currentMode,
                    type: gameType === 'coop' ? 'coop' : 'multi',
                    pCount: 1,
                    wpm: currentWpm,
                    wordCount: requestedWordCount,
                    status: 'waiting',
                    expiresAt: expiresTimestamp
                });
            }
            if (isSinglePlayer && allowSpectators) {
                db.ref(`presence/${myId}`).update({
                    allowSpectators: true,
                    activeRoomCode: roomCode
                });
            }
            joinRoomLogic(false);
        });
    });
}

window.joinSpecificRoom = function(code) {
    roomCode = code;
    joinRoomLogic(false);
};

function joinRoomLogic(isReconnect = false) {
    gameRunning = false;
    const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) {
            showScreen('leaderboardScreen');
            activeTab = "room";
            showLeaderboardTab('tabRoomBtn');
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

        listenToChat();
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
                renderPlayersList(rData.players || {}, rData.hostId);
                const pCount = Object.keys(rData.players || {}).length;
                if (myId === rData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') {
                    showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato.");
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
}

function renderPlayersList(playersData, hostId) {
    if (!els.playersList) return;
    els.playersList.innerHTML = '';
    const count = Object.keys(playersData).length;
    if (count > lastPlayerCount && lastPlayerCount > 0) {
        playBeep(500, 0.1);
        setTimeout(() => playBeep(700, 0.15), 150);
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
            nSpan.onclick = () => openTelegramProfile(data.username);
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
}

if (els.readyBtn) {
    els.readyBtn.addEventListener('click', () => {
        if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true });
    });
}
