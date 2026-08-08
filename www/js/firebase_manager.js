// ============================================================================
// FIREBASE_MANAGER.JS - GESTIONE DATABASE E PRESENZA
// ============================================================================

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
            els.toggleChatCwBtn.textContent = "📻 CW: ON";
            els.toggleChatCwBtn.classList.remove('btn-secondary');
            els.toggleChatCwBtn.classList.add('btn-success');
            if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block';
        }

        els.toggleChatCwBtn.addEventListener('click', () => {
            isChatCwEnabled = !isChatCwEnabled;
            localStorage.setItem(STORAGE_CHAT_CW_ENABLED, isChatCwEnabled);
            if (!isChatCwEnabled) chatCwAudioQueue = [];

            if (isChatCwEnabled) {
                els.toggleChatCwBtn.textContent = "📻 CW: ON";
                els.toggleChatCwBtn.classList.remove('btn-secondary');
                els.toggleChatCwBtn.classList.add('btn-success');
                if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block';
                showToast("Modalità CW Chat Attivata!");
            } else {
                els.toggleChatCwBtn.textContent = "📻 CW: OFF";
                els.toggleChatCwBtn.classList.remove('btn-success');
                els.toggleChatCwBtn.classList.add('btn-secondary');
                if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'none';
                showToast("Modalità CW Chat Disattivata.");
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

            if (!userSnap.exists() || !userData.welcomed) {
                await userRef.update({
                    name: myName,
                    welcomed: true,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                });

                if (els.welcomeNewUserModal) {
                    els.welcomeNewUserModal.style.display = 'flex';
                    const btnClose = document.getElementById('btnCloseWelcomeModal');
                    if (btnClose) {
                        btnClose.onclick = () => {
                            els.welcomeNewUserModal.style.display = 'none';
                        };
                    }
                } else {
                    setTimeout(() => {
                        showToast(`📻 Benvenuto in Sfida Telegrafia, ${myName}! Buon divertimento!`);
                    }, 1500);
                }
            }
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

function listenToOnlineUsers() {
    if (listeners.presence) return;

    if (els.onlineUsersList) els.onlineUsersList.innerHTML = '';
    const presenceRef = db.ref('presence').limitToLast(50);

    const onAdded = presenceRef.on('child_added', snap => {
        if (snap.key !== myId) renderOrUpdateUserListItem(snap.key, snap.val());
    });

    const onChanged = presenceRef.on('child_changed', snap => {
        if (snap.key !== myId) renderOrUpdateUserListItem(snap.key, snap.val());
    });

    const onRemoved = presenceRef.on('child_removed', snap => {
        removeUserListItem(snap.key);
    });

    listeners.presence = { ref: presenceRef, onAdded, onChanged, onRemoved };
}

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
