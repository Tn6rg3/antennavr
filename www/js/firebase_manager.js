// --- STARTUP DEL GIOCO ---
if (!tgUser) {
    if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
    if (els.errorScreen) els.errorScreen.classList.add('active-screen');
} else {
    myName = tgUser.first_name;
    myId = tgUser.id.toString();
    initGame();
}

function initGame() {
    const firebaseConfig = {
        apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
        authDomain: "telegrafiabot.firebaseapp.com",
        databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "telegrafiabot",
        storageBucket: "telegrafiabot.firebasestorage.app",
        messagingSenderId: "575790683327",
        appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    db = firebase.database();
    auth = firebase.auth();

    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';

    if (els.startWpmInput && localStorage.getItem(STORAGE_PREF_WPM)) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM);
    if (els.wordCountInput && localStorage.getItem(STORAGE_PREF_WORDS)) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS);
    if (els.toneInput && localStorage.getItem(STORAGE_PREF_TONE)) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE);
    if (els.charSpaceInput && localStorage.getItem(STORAGE_PREF_CHAR_SPACE)) els.charSpaceInput.value = localStorage.getItem(STORAGE_PREF_CHAR_SPACE);
    if (els.wordSpaceSelect && localStorage.getItem(STORAGE_PREF_WORD_SPACE)) els.wordSpaceSelect.value = localStorage.getItem(STORAGE_PREF_WORD_SPACE);

    isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
    if (localStorage.getItem(STORAGE_CHAT_CW_WPM)) {
        chatCwWpm = parseInt(localStorage.getItem(STORAGE_CHAT_CW_WPM)) || 20;
        if (els.chatCwWpmInput) els.chatCwWpmInput.value = chatCwWpm;
    }
    if (localStorage.getItem(STORAGE_CHAT_CW_TONE)) {
        chatCwTone = parseInt(localStorage.getItem(STORAGE_CHAT_CW_TONE)) || 600;
        if (els.chatCwToneInput) els.chatCwToneInput.value = chatCwTone;
    }

    if (els.toggleChatCwBtn) {
        if (isChatCwEnabled) {
            els.toggleChatCwBtn.textContent = "ðŸ“» CW: ON";
            els.toggleChatCwBtn.classList.remove('btn-secondary');
            els.toggleChatCwBtn.classList.add('btn-success');
            if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block';
        }

        els.toggleChatCwBtn.addEventListener('click', () => {
            isChatCwEnabled = !isChatCwEnabled;
            localStorage.setItem(STORAGE_CHAT_CW_ENABLED, isChatCwEnabled);
            if (!isChatCwEnabled) chatCwAudioQueue = [];

            if (isChatCwEnabled) {
                els.toggleChatCwBtn.textContent = "ðŸ“» CW: ON";
                els.toggleChatCwBtn.classList.remove('btn-secondary');
                els.toggleChatCwBtn.classList.add('btn-success');
                if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block';
                showToast("ModalitÃ  CW Chat Attivata!");
            } else {
                els.toggleChatCwBtn.textContent = "ðŸ“» CW: OFF";
                els.toggleChatCwBtn.classList.remove('btn-success');
                els.toggleChatCwBtn.classList.add('btn-secondary');
                if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'none';
                showToast("ModalitÃ  CW Chat Disattivata.");
            }
            listenToChat();
        });
    }

    if (els.chatCwWpmInput) {
        els.chatCwWpmInput.addEventListener('change', (e) => {
            chatCwWpm = Math.max(5, Math.min(50, parseInt(e.target.value) || 20));
            localStorage.setItem(STORAGE_CHAT_CW_WPM, chatCwWpm);
        });
    }
    if (els.chatCwToneInput) {
        els.chatCwToneInput.addEventListener('change', (e) => {
            chatCwTone = Math.max(400, Math.min(1000, parseInt(e.target.value) || 600));
            localStorage.setItem(STORAGE_CHAT_CW_TONE, chatCwTone);
        });
    }

    auth.signInAnonymously().then(async () => {
        try {
            const userRef = db.ref(`users/${myId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val() || {};

            if (userData.alias) myName = userData.alias;
            myPrivacy = userData.privacyUsername || false;
            if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = myPrivacy;

            // --- CONTROLLO PRIMO ACCESSO ASSOLUTO (SOLO PER IL NUOVO UTENTE) ---
            if (!userSnap.exists() || !userData.welcomed) {
                // 1. Registra che l'utente Ã¨ entrato ed Ã¨ stato accolto
                await userRef.update({
                    name: myName,
                    welcomed: true,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                });

                // 2. Mostra la finestra modale di benvenuto ESCLUSIVAMENTE a lui
                if (els.welcomeNewUserModal) {
                    els.welcomeNewUserModal.style.display = 'flex';
                    const btnClose = document.getElementById('btnCloseWelcomeModal');
                    if (btnClose) {
                        btnClose.onclick = () => {
                            els.welcomeNewUserModal.style.display = 'none';
                        };
                    }
                } else {
                    // Fallback discreto se manca il modal nell'HTML: Toast di benvenuto privato
                    setTimeout(() => {
                        showToast(`ðŸ“» Benvenuto in Sfida Telegrafia, ${myName}! Buon divertimento!`);
                    }, 1500);
                }
            }
            // ------------------------------------------------------------------
        } catch(e) {}

        if (els.playerName) els.playerName.textContent = myName;
        if (els.userAliasInput) els.userAliasInput.value = (myName !== tgUser.first_name) ? myName : "";
        if (els.loadingText) els.loadingText.style.display = 'none';
        if (els.createRoomBtn) els.createRoomBtn.disabled = false;

        db.ref('.info/serverTimeOffset').on('value', (snap) => {
            serverTimeOffset = snap.val() || 0;
        });

        db.ref('.info/connected').on('value', (snap) => {
            if (snap.val() === false) return;
            const pRef = db.ref(`presence/${myId}`);
            pRef.onDisconnect().remove();
            pRef.set({
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                status: 'online',
                ts: firebase.database.ServerValue.TIMESTAMP
            });
            if (roomCode) joinRoomLogic(true);
        });

        if (typeof checkYesterdayDailyMedal === 'function') checkYesterdayDailyMedal();

        // --- BLOCCO ROUTING SCHERMATE REINTEGRATO ---
        if (startParam) {
            if (startParam.startsWith('team_')) processTeamInvite(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', snap => {
                    if (snap.exists() && snap.val().status !== 'finished') {
                        roomCode = lastRoom;
                        if (els.rejoinContainer) els.rejoinContainer.style.display = 'block';
                        if (els.rejoinGameBtn) els.rejoinGameBtn.onclick = () => { isRejoining = true; joinRoomLogic(false); };
                        showScreen('setupScreen');
                    } else {
                        localStorage.removeItem(STORAGE_ROOM_KEY);
                        showScreen('setupScreen');
                    }
                });
            } else {
                showScreen('setupScreen');
            }
        }

        const savedLang = localStorage.getItem('gameLang');
        if (savedLang) setLanguage(savedLang);
        else updateMuteBtnUI();

        loadDictionaries().then(() => {
            let todayStr = new Date().toISOString().split('T')[0];
            let lastShown = localStorage.getItem(STORAGE_DAILY_SHOWN);
            if (lastShown !== todayStr && !startParam) {
                if (els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'flex';
            }
        });

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) {
            try {
                customDictionary = JSON.parse(savedCustom);
                updateCustomDictStatus();
            } catch(e) {}
        }

        if (typeof checkActivityAndAwardMedals === 'function') checkActivityAndAwardMedals();
        if (typeof checkTournamentPopup === 'function') checkTournamentPopup();

        listenToRooms();
        listenToOnlineUsers();
        listenToInvites();
        listenToInviteAccepted();

        if (typeof initBattleRoyaleScheduler === 'function') initBattleRoyaleScheduler();
        if (typeof loadRegolamento === 'function') loadRegolamento();

        if (els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
        if (els.appVersionFooter) els.appVersionFooter.textContent = APP_VERSION;

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) {
                if (els.updateBanner) els.updateBanner.style.display = 'block';
            } else {
                if (els.updateBanner) els.updateBanner.style.display = 'none';
            }
        });

    }).catch(() => {
        if (els.loadingText) {
            els.loadingText.textContent = "Errore di Connessione.";
            els.loadingText.style.color = "red";
            els.loadingText.style.fontWeight = "bold";
        }
    });

    populateGameModesUI();
    checkGameTypeUI();
}
// ============================================================================
// GESTIONE PULSANTI MODALE SFIDA GIORNALIERA E BANNER
// ============================================================================

// 1. Tasto "ACCETTA LA SFIDA" -> Chiude il popup, crea la stanza e avvia il gioco
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.addEventListener('click', () => {
        els.dailyChallengeModal.style.display = 'none';

        currentMode = 'daily_challenge';
        isSinglePlayer = true;
        currentWpm = 15;
        baseWpm = 15;
        requestedWordCount = 20;
        currentTone = 600;
        isFixedSpeed = false;
        isEasyMode = false;

        window.charSpaceWpm = 0;
        window.wordSpaceMult = 1.0;

        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        gameWords = getGameWords(requestedWordCount, currentMode);

        db.ref('rooms/' + roomCode).set({
            status: 'countdown',
            type: 'single',
            mode: currentMode,
            wpm: currentWpm,
            tone: currentTone,
            wordCount: requestedWordCount,
            words: gameWords,
            fixedSpeed: isFixedSpeed,
            charSpaceWpm: 0,
            wordSpaceMult: 1.0,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            hostId: myId
        }).then(() => joinRoomLogic(false));
    });
}

// 2. Tasto "PiÃ¹ Tardi" -> Chiude solo il popup senza salvare nel localStorage
if (els.btnPlayDailyLater) {
    els.btnPlayDailyLater.addEventListener('click', () => {
        els.dailyChallengeModal.style.display = 'none';
    });
}

// 3. Tasto "Rifiuta per oggi" -> Chiude il popup e memorizza la data per non mostrarlo piÃ¹ oggi
if (els.btnDeclineDaily) {
    els.btnDeclineDaily.addEventListener('click', () => {
        let todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
        els.dailyChallengeModal.style.display = 'none';
    });
}

// 4. Tasto di chiusura "X" del banner Battaglia Serale (per sicurezza)
if (els.btnCloseBRBanner) {
    els.btnCloseBRBanner.addEventListener('click', () => {
        if (els.brBanner) els.brBanner.style.display = 'none';
        if (brBannerTimeout) clearTimeout(brBannerTimeout);
        brBannerDismissedToday = true;
        if (brRoomCode) db.ref(`rooms/${brRoomCode}/players`).off('value');
    });
}
// ============================================================================
// CONDIVISIONE APP GLOBALE (INDISTRUTTIBILE)
// ============================================================================
window.shareAppToFriends = function() {
    showToast("ðŸ“¢ Apertura condivisione Telegram...");

    const appUrl = `https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`;
    const textMsg = `ðŸ“» Unisciti a me su Sfida Telegrafia! Impara il codice Morse, sfida altri operatori e scala la classifica!`;
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
// --- LISTE E BACHECA SFIDE (SENZA DUPLICATI) ---
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
    let modeIcon = room.mode === 'callsign' ? 'ðŸŽ™ï¸ Nom.'
                 : room.mode === 'pingpong' ? 'ðŸ“ Ping Pong'
                 : room.mode === 'quiz' ? 'â“ Quiz'
                 : (room.mode === 'conquest' || room.type === 'coop') ? 'âš”ï¸ Conquista'
                 : 'ðŸ”¤ Parole';

    const pCount = Object.keys(room.players || {}).length || (room.pCount || 1);
    const prevCount = window.lastKnownRoomPlayersCount[code] || 1;
    const isMyRoom = (room.hostId === myId);
    const isOutsideRoom = (roomCode !== code || !els.lobbyScreen.classList.contains('active-screen'));

    if (isMyRoom && pCount > prevCount && pCount >= 2 && isOutsideRoom) {
        showToast(`ðŸ‘¤ Un giocatore Ã¨ appena entrato nella tua stanza #${code}!`);
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

// DEFINIZIONE UNICA DI removeRoomCard
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

// DEFINIZIONE UNICA DI listenToRooms
function listenToRooms() {
    if (listeners.roomsList && listeners.roomsList.ref) {
        listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
        listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
        listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
        listeners.roomsList = null;
    }

    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    const lobbyQuery = db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);

    const onAdded = lobbyQuery.on('child_added', snap => addOrUpdateRoomCard(snap.key, snap.val()));
    const onChanged = lobbyQuery.on('child_changed', snap => addOrUpdateRoomCard(snap.key, snap.val()));
    const onRemoved = lobbyQuery.on('child_removed', snap => removeRoomCard(snap.key));

    listeners.roomsList = { ref: lobbyQuery, onAdded, onChanged, onRemoved };
}
// ============================================================================
// APP.JS - PARTE 2 DI 2
// CHAT, GAMELOOP, CONQUISTA (CO-OP), QUIZ, BATTAGLIA REALE, SPETTATORE, TORNEI
// ============================================================================

// --- GESTIONE SCHERMATE E PULIZIA ---
function showScreen(screenId) {
    clearAllTimers();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');

    hideChat();
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

        listenToOnlineUsers();
        listenToRooms();
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
            listenToChat();
        } else {
            activeChatContext = null;
        }
    } else if (screenId === 'teamsScreen') {
        activeChatContext = 'team';
        checkMyTeamStatus();
    } else {
        if (screenId === 'participationScreen') { switchActTab('daily'); }
        if (activeChatContext !== 'global') {
            activeChatContext = 'global';
            listenToChat();
        }
    }
}

window.goBackToMenu = function() {
    if (activeChatContext !== 'team') hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';
    if (els.inviteModal) els.inviteModal.style.display = 'none';

    showScreen('setupScreen');
};

