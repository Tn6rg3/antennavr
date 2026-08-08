/**
 * APP.JS - Main Entry Point
 * Orchestrates module initialization and handles global UI events
 */

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
    db = firebase.database(); auth = firebase.auth();

    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';
    if (els.startWpmInput && localStorage.getItem(STORAGE_PREF_WPM)) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM);
    if (els.wordCountInput && localStorage.getItem(STORAGE_PREF_WORDS)) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS);
    if (els.toneInput && localStorage.getItem(STORAGE_PREF_TONE)) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE);
    if (els.charSpaceInput && localStorage.getItem(STORAGE_PREF_CHAR_SPACE)) els.charSpaceInput.value = localStorage.getItem(STORAGE_PREF_CHAR_SPACE);
    if (els.wordSpaceSelect && localStorage.getItem(STORAGE_PREF_WORD_SPACE)) els.wordSpaceSelect.value = localStorage.getItem(STORAGE_PREF_WORD_SPACE);

    isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
    if (localStorage.getItem(STORAGE_CHAT_CW_WPM)) { chatCwWpm = parseInt(localStorage.getItem(STORAGE_CHAT_CW_WPM)) || 20; if (els.chatCwWpmInput) els.chatCwWpmInput.value = chatCwWpm; }
    if (localStorage.getItem(STORAGE_CHAT_CW_TONE)) { chatCwTone = parseInt(localStorage.getItem(STORAGE_CHAT_CW_TONE)) || 600; if (els.chatCwToneInput) els.chatCwToneInput.value = chatCwTone; }

    if (els.toggleChatCwBtn) {
        if (isChatCwEnabled) { els.toggleChatCwBtn.textContent = "📻 CW: ON"; els.toggleChatCwBtn.classList.remove('btn-secondary'); els.toggleChatCwBtn.classList.add('btn-success'); if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block'; }
        els.toggleChatCwBtn.onclick = () => {
            isChatCwEnabled = !isChatCwEnabled; localStorage.setItem(STORAGE_CHAT_CW_ENABLED, isChatCwEnabled); if (!isChatCwEnabled) chatCwAudioQueue = [];
            if (isChatCwEnabled) { els.toggleChatCwBtn.textContent = "📻 CW: ON"; els.toggleChatCwBtn.classList.remove('btn-secondary'); els.toggleChatCwBtn.classList.add('btn-success'); if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block'; showToast("Modalità CW Chat Attivata!"); }
            else { els.toggleChatCwBtn.textContent = "📻 CW: OFF"; els.toggleChatCwBtn.classList.remove('btn-success'); els.toggleChatCwBtn.classList.add('btn-secondary'); if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'none'; showToast("Modalità CW Chat Disattivata."); }
            if (typeof listenToChat === 'function') listenToChat();
        };
    }
    if (els.chatCwWpmInput) els.chatCwWpmInput.onchange = e => { chatCwWpm = Math.max(5, Math.min(50, parseInt(e.target.value) || 20)); localStorage.setItem(STORAGE_CHAT_CW_WPM, chatCwWpm); };
    if (els.chatCwToneInput) els.chatCwToneInput.onchange = e => { chatCwTone = Math.max(400, Math.min(1000, parseInt(e.target.value) || 600)); localStorage.setItem(STORAGE_CHAT_CW_TONE, chatCwTone); };

    auth.signInAnonymously().then(async () => {
        try {
            const uRef = db.ref(`users/${myId}`); const uS = await uRef.once('value'); const uD = uS.val() || {};
            if (uD.alias) myName = uD.alias; myPrivacy = uD.privacyUsername || false; if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = myPrivacy;
            if (!uS.exists() || !uD.welcomed) {
                await uRef.update({ name: myName, welcomed: true, createdAt: firebase.database.ServerValue.TIMESTAMP });
                if (els.welcomeNewUserModal) { els.welcomeNewUserModal.style.display = 'flex'; const bC = document.getElementById('btnCloseWelcomeModal'); if (bC) bC.onclick = () => { els.welcomeNewUserModal.style.display = 'none'; }; }
                else setTimeout(() => { showToast(`📻 Benvenuto in Sfida Telegrafia, ${myName}! Buon divertimento!`); }, 1500);
            }
        } catch(e) {}
        if (els.playerName) els.playerName.textContent = myName; if (els.userAliasInput) els.userAliasInput.value = (myName !== (tgUser ? tgUser.first_name : "")) ? myName : ""; if (els.loadingText) els.loadingText.style.display = 'none'; if (els.createRoomBtn) els.createRoomBtn.disabled = false;
        db.ref('.info/serverTimeOffset').on('value', snap => serverTimeOffset = snap.val() || 0);
        db.ref('.info/connected').on('value', snap => { if (snap.val() === false) return; const pR = db.ref(`presence/${myId}`); pR.onDisconnect().remove(); pR.set({ name: myName, username: myPrivacy ? "" : tgUsername, status: 'online', ts: firebase.database.ServerValue.TIMESTAMP }); if (roomCode) if (typeof joinRoomLogic === 'function') joinRoomLogic(true); });

        if (startParam) { if (startParam.startsWith('team_')) { if (typeof processTeamInvite === 'function') processTeamInvite(startParam.replace('team_', '')); } else if (startParam.startsWith('room_')) { if (typeof window.joinSpecificRoom === 'function') window.joinSpecificRoom(startParam.replace('room_', '')); } }
        else { const lR = localStorage.getItem(STORAGE_ROOM_KEY); if (lR) { db.ref(`rooms/${lR}`).once('value', s => { if (s.exists() && s.val().status !== 'finished') { roomCode = lR; if (els.rejoinContainer) els.rejoinContainer.style.display = 'block'; if (els.rejoinGameBtn) els.rejoinGameBtn.onclick = () => { isRejoining = true; if (typeof joinRoomLogic === 'function') joinRoomLogic(false); }; if (typeof showScreen === 'function') showScreen('setupScreen'); } else { localStorage.removeItem(STORAGE_ROOM_KEY); if (typeof showScreen === 'function') showScreen('setupScreen'); } }); } else if (typeof showScreen === 'function') showScreen('setupScreen'); }

        const sL = localStorage.getItem('gameLang'); if (sL) { if (typeof setLanguage === 'function') setLanguage(sL); } else if (typeof updateMuteBtnUI === 'function') updateMuteBtnUI();
        if (typeof loadDictionaries === 'function') loadDictionaries().then(() => { let tS = new Date().toISOString().split('T')[0]; if (localStorage.getItem(STORAGE_DAILY_SHOWN) !== tS && !startParam) if (els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'flex'; });
        const sC = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY); if (sC) try { customDictionary = JSON.parse(sC); if (typeof updateCustomDictStatus === 'function') updateCustomDictStatus(); } catch(e) {}
        if (typeof checkActivityAndAwardMedals === 'function') checkActivityAndAwardMedals(); if (typeof listenToRooms === 'function') listenToRooms(); if (typeof listenToOnlineUsers === 'function') listenToOnlineUsers(); if (typeof listenToInvites === 'function') listenToInvites(); if (typeof listenToInviteAccepted === 'function') listenToInviteAccepted(); if (typeof initBattleRoyaleScheduler === 'function') initBattleRoyaleScheduler(); if (typeof loadRegolamento === 'function') loadRegolamento();
        if (els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION; if (els.appVersionFooter) els.appVersionFooter.textContent = APP_VERSION;
        db.ref('appConfig/latestVersion').on('value', s => { const lS = s.val() ? String(s.val()).trim() : ""; if (lS && lS !== String(APP_VERSION).trim()) { if (els.updateBanner) els.updateBanner.style.display = 'block'; } else if (els.updateBanner) els.updateBanner.style.display = 'none'; });
    }).catch(() => { if (els.loadingText) { els.loadingText.textContent = "Errore di Connessione."; els.loadingText.style.color = "red"; els.loadingText.style.fontWeight = "bold"; } });
    if (typeof populateGameModesUI === 'function') populateGameModesUI(); if (typeof checkGameTypeUI === 'function') checkGameTypeUI();
}

// --- GLOBAL EVENT LISTENERS ---
if (els.updateBannerBtn) els.updateBannerBtn.onclick = () => { if (typeof window.forceAppUpdate === 'function') window.forceAppUpdate(); };
if (els.gameModeInput) els.gameModeInput.onchange = () => { if (typeof checkGameTypeUI === 'function') checkGameTypeUI(); };
if (els.gameTypeInput) els.gameTypeInput.onchange = () => { if (typeof checkGameTypeUI === 'function') checkGameTypeUI(); };
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.onclick = () => {
        els.dailyChallengeModal.style.display = 'none'; currentMode = 'daily_challenge'; isSinglePlayer = true; currentWpm = 15; baseWpm = 15; requestedWordCount = 20; currentTone = 600; isFixedSpeed = false; isEasyMode = false; window.charSpaceWpm = 0; window.wordSpaceMult = 1.0;
        roomCode = Math.floor(1000 + Math.random() * 9000).toString(); if (typeof getGameWords === 'function') gameWords = getGameWords(requestedWordCount, currentMode);
        db.ref('rooms/' + roomCode).set({ status: 'countdown', type: 'single', mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords, fixedSpeed: isFixedSpeed, charSpaceWpm: 0, wordSpaceMult: 1.0, createdAt: firebase.database.ServerValue.TIMESTAMP, hostId: myId }).then(() => { if (typeof joinRoomLogic === 'function') joinRoomLogic(false); });
    };
}
if (els.btnPlayDailyLater) els.btnPlayDailyLater.onclick = () => els.dailyChallengeModal.style.display = 'none';
if (els.btnDeclineDaily) els.btnDeclineDaily.onclick = () => { localStorage.setItem(STORAGE_DAILY_SHOWN, new Date().toISOString().split('T')[0]); els.dailyChallengeModal.style.display = 'none'; };
if (els.btnCloseBRBanner) els.btnCloseBRBanner.onclick = () => { if (els.brBanner) els.brBanner.style.display = 'none'; if (brBannerTimeout) clearTimeout(brBannerTimeout); brBannerDismissedToday = true; if (brRoomCode) db.ref(`rooms/${brRoomCode}/players`).off('value'); };
if (els.sendLobbyChatBtn) els.sendLobbyChatBtn.onclick = () => { const t = els.lobbyChatInput?.value.trim(); if (t && roomCode) db.ref(`rooms/${roomCode}/chat`).push({ name: myName, text: t, ts: firebase.database.ServerValue.TIMESTAMP }).then(() => { if (els.lobbyChatInput) els.lobbyChatInput.value = ''; }); };
if (els.lobbyChatInput) els.lobbyChatInput.onkeypress = e => { if (e.key === 'Enter') if (els.sendLobbyChatBtn) els.sendLobbyChatBtn.click(); };
if (els.sendChatBtn) els.sendChatBtn.onclick = () => { const t = els.chatInput?.value.trim(); if (!t) return; (activeChatContext === 'room' && roomCode ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push()).set({ name: myName, username: myPrivacy ? "" : tgUsername, text: t, ts: firebase.database.ServerValue.TIMESTAMP }).catch(e => showToast("Errore: " + e.message)); if (els.chatInput) els.chatInput.value = ''; };
if (els.chatInput) els.chatInput.onkeypress = e => { if (e.key === 'Enter') if (els.sendChatBtn) els.sendChatBtn.click(); };
if (els.clearChatBtn) els.clearChatBtn.onclick = () => { if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) { if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove(); else if (activeChatContext === 'team' && myTeamId) db.ref(`teams/${myTeamId}/chat`).remove(); else db.ref('globalChat').remove(); showToast("Chat cancellata."); } };
if (els.muteGlobalChatBtn) els.muteGlobalChatBtn.onclick = () => { isGlobalChatMuted = !isGlobalChatMuted; localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted); if (typeof updateMuteBtnUI === 'function') updateMuteBtnUI(); showToast(isGlobalChatMuted ? "Notifiche silenziate." : "Notifiche riattivate."); };
if (els.sendInviteBtn) els.sendInviteBtn.onclick = () => {
    if (isChallenging) return; isChallenging = true; const tId = currentInviterId;
    db.ref(`invites/${tId}`).set({ fromId: myId, fromName: myName, mode: els.inviteModeInput?.value || 'standard', wpm: parseInt(els.inviteWpmInput?.value || 20), wordCount: parseInt(els.inviteWordCountInput?.value || 10), ts: firebase.database.ServerValue.TIMESTAMP, status: 'pending' }).then(() => {
        showToast("Invito inviato!"); if (els.inviteModal) els.inviteModal.style.display = 'none'; db.ref(`presence/${tId}`).once('value', s => { if (s.exists()) if (typeof renderOrUpdateUserListItem === 'function') renderOrUpdateUserListItem(tId, s.val()); }); if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);
        listeners.outgoingInvite = db.ref(`invites/${tId}`).on('value', snap => { if (!snap.exists() && isChallenging) { setTimeout(() => { if (isChallenging) { showToast("Rifiutato o scaduto."); isChallenging = false; currentInviterId = null; db.ref(`presence/${tId}`).once('value', s => { if (s.exists()) if (typeof renderOrUpdateUserListItem === 'function') renderOrUpdateUserListItem(tId, s.val()); }); if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite); } }, 1000); } });
    });
};
if (els.declineTeamInviteBtn) els.declineTeamInviteBtn.onclick = () => { db.ref(`invites/${myId}`).remove(); if (typeof window.closeInviteModal === 'function') window.closeInviteModal(); };
if (els.declineInviteBtn) els.declineInviteBtn.onclick = () => { db.ref(`invites/${myId}`).remove(); if (typeof window.closeInviteModal === 'function') window.closeInviteModal(); };
if (els.acceptInviteBtn) els.acceptInviteBtn.onclick = () => { const inv = window.lastIncomingInvite; if (!inv) return; db.ref(`invites/${myId}`).remove(); if (typeof window.closeInviteModal === 'function') window.closeInviteModal(); const rC = Math.floor(1000 + Math.random() * 9000).toString(); if (typeof getGameWords === 'function') { db.ref(`rooms/${rC}`).set({ status: 'waiting', type: 'multi', mode: inv.mode, wpm: inv.wpm, tone: 600, wordCount: inv.wordCount, words: getGameWords(inv.wordCount, inv.mode), createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 600000, hostId: inv.fromId }).then(() => { db.ref(`public_lobby_rooms/${rC}`).set({ mode: inv.mode, pCount: 1, wpm: inv.wpm, wordCount: inv.wordCount, status: 'waiting', expiresAt: Date.now() + 600000 }); db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rC }); roomCode = rC; if (typeof joinRoomLogic === 'function') joinRoomLogic(false); }); } };
if (els.quitGameBtn) els.quitGameBtn.onclick = () => { if (confirm("Vuoi abbandonare la partita?")) { gameRunning = false; if (typeof exitRoomCleanly === 'function') exitRoomCleanly(false, true); } };
if (els.deleteRoomBtn) els.deleteRoomBtn.onclick = () => { if (window.isDeletingRoom) return; if (confirm("Eliminare questa stanza?")) { window.isDeletingRoom = true; const cC = roomCode; if (typeof exitRoomCleanly === 'function') exitRoomCleanly(true, false); if (cC) db.ref(`public_lobby_rooms/${cC}`).remove().then(() => db.ref(`rooms/${cC}`).remove().finally(() => window.isDeletingRoom = false)); else window.isDeletingRoom = false; } };
if (els.leaveLobbyBtn) els.leaveLobbyBtn.onclick = () => { if (typeof exitRoomCleanly === 'function') exitRoomCleanly(false, false); };
if (els.startMultiplayerBtn) els.startMultiplayerBtn.onclick = () => db.ref(`rooms/${roomCode}/players`).once('value', snap => { if (currentMode === 'pingpong' && Object.keys(snap.val() || {}).length < 2) return alert("Richiede 2 giocatori!"); db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null }); db.ref(`public_lobby_rooms/${roomCode}`).remove(); });
if (els.createRoomBtn) els.createRoomBtn.onclick = () => {
    const gType = els.gameTypeInput.value, gMode = els.gameModeInput.value; if (gType === 'tournament') { if (typeof showScreen === 'function') showScreen('teamsScreen'); if (typeof switchTeamTab === 'function') { if (gMode === 'trn_create_team') switchTeamTab('gest'); else if (gMode === 'trn_join_team') switchTeamTab('allteams'); else if (gMode === 'trn_create_trn') switchTeamTab('tournaments'); } return; }
    if (gMode === 'custom' && customDictionary.length === 0) { if (els.customDictModal) els.customDictModal.style.display = 'flex'; return showToast("Carica prima un file!"); }
    isChallenging = false; currentMode = gMode || 'standard'; isSinglePlayer = (gType === 'single'); const aS = (isSinglePlayer && els.allowSpectatorsCheckbox?.checked);
    currentWpm = currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20); baseWpm = currentWpm; requestedWordCount = currentMode === 'callsign' ? 25 : Math.min(200, Math.max(1, parseInt(els.wordCountInput?.value) || 10)); currentTone = parseInt(els.toneInput?.value) || 600; isFixedSpeed = els.fixedSpeedCheckbox?.checked || false; isEasyMode = els.easyModeCheckbox?.checked || false;
    window.charSpaceWpm = isSinglePlayer ? (parseInt(els.charSpaceInput?.value) || currentWpm) : currentWpm; window.wordSpaceMult = isSinglePlayer ? (parseFloat(els.wordSpaceSelect?.value) || 1.0) : 1.0;
    roomCode = Math.floor(1000 + Math.random() * 9000).toString(); if (typeof getGameWords === 'function') gameWords = getGameWords(requestedWordCount, currentMode);
    const exp = isSinglePlayer ? null : Date.now() + ((parseInt(els.roomTimerInput?.value) || 5) * 60000);
    db.ref('rooms/' + roomCode).set({ status: isSinglePlayer ? 'countdown' : 'waiting', type: isSinglePlayer ? 'single' : (gType === 'coop' ? 'coop' : 'multi'), mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords, fixedSpeed: isFixedSpeed, charSpaceWpm: window.charSpaceWpm, wordSpaceMult: window.wordSpaceMult, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: exp, hostId: myId || "anon" }).then(() => { if (!isSinglePlayer) db.ref(`public_lobby_rooms/${roomCode}`).set({ mode: currentMode, type: gType === 'coop' ? 'coop' : 'multi', pCount: 1, wpm: currentWpm, wordCount: requestedWordCount, status: 'waiting', expiresAt: exp }); if (isSinglePlayer && aS) db.ref(`presence/${myId}`).update({ allowSpectators: true, activeRoomCode: roomCode }); if (typeof joinRoomLogic === 'function') joinRoomLogic(false); }).catch(e => alert(e.message));
};
if (els.readyBtn) els.readyBtn.onclick = () => { if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true }); };
if (els.replayWordBtn) els.replayWordBtn.onclick = () => { if (gameRunning && inputActive) { usedReplay = true; if (typeof playMorseAudio === 'function') playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm); if (els.permanentGameInput) els.permanentGameInput.focus(); } };
if (els.permanentGameInput) {
    els.permanentGameInput.oninput = () => { if (currentMode === 'chars' && inputActive && gameRunning) { const v = els.permanentGameInput.value.trim().toUpperCase(); if (v.length >= 1) { if (typeof handleWordSubmission === 'function') handleWordSubmission(v[0]); els.permanentGameInput.value = ""; } } };
    els.permanentGameInput.onkeypress = e => { if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') { const v = els.permanentGameInput.value.trim().toUpperCase(); if (v) { if (typeof handleWordSubmission === 'function') handleWordSubmission(v); els.permanentGameInput.value = ""; } } };
}
if (els.btnSendPingPong) els.btnSendPingPong.onclick = () => { if (gameRunning && currentMode === 'pingpong') { const w = els.pingPongWordToSend?.value.trim().toUpperCase(); if (w) db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { if (d) { d.word = w; d.wordId = (d.wordId || 0) + 1; } return d; }); } };
if (els.pingPongWordToSend) els.pingPongWordToSend.onkeypress = e => { if (e.key === 'Enter') if (els.btnSendPingPong) els.btnSendPingPong.click(); };
if (els.lbModeSelect) els.lbModeSelect.onchange = e => { activeTab = e.target.value; if (typeof showLeaderboardTab === 'function') showLeaderboardTab(e.target.value); };
if (els.btnTrnGlobalLB) els.btnTrnGlobalLB.onclick = () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnGlobalLB.classList.add('active-tab'); if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard('tournaments', null); };
if (els.btnTrnActiveLB) els.btnTrnActiveLB.onclick = () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnActiveLB.classList.add('active-tab'); if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard('active_tournament', null); };
if (els.lbWordFilter) els.lbWordFilter.onchange = () => { if (typeof showLeaderboardTab === 'function') showLeaderboardTab(activeTab); };
if (els.createTeamBtn) els.createTeamBtn.onclick = () => { const n = els.newTeamName?.value.trim(); if (n) db.ref('teams').push().set({ name: n, captainId: myId, status: 'open', members: { [myId]: { name: myName, username: myPrivacy ? "" : tgUsername } } }).then(() => { if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); }); };
if (els.clearTeamChatBtn) els.clearTeamChatBtn.onclick = () => { if (confirm('Vuoi cancellare la chat di squadra?')) if (myTeamId) db.ref(`teams/${myTeamId}/chat`).remove(); };
if (els.sendTeamChatBtn) els.sendTeamChatBtn.onclick = () => { const t = els.teamChatInput?.value.trim(); if (t && myTeamId) { db.ref(`teams/${myTeamId}/chat`).push({ name: myName, username: myPrivacy ? "" : tgUsername, text: t, ts: firebase.database.ServerValue.TIMESTAMP }); els.teamChatInput.value = ''; } };
if (els.teamChatInput) els.teamChatInput.onkeypress = e => { if (e.key === 'Enter') if (els.sendTeamChatBtn) els.sendTeamChatBtn.click(); };
if (els.leaveTeamBtn) els.leaveTeamBtn.onclick = () => { if (confirm("Vuoi abbandonare la squadra?")) { db.ref(`teams/${myTeamId}`).once('value', snap => { const t = snap.val(); if (isTeamCaptain) { let o = Object.keys(t.members).filter(id => id !== myId); if (o.length > 0) db.ref(`teams/${myTeamId}/captainId`).set(o[0]).then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => { if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); })); else db.ref(`teams/${myTeamId}/status`).set('retired').then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => { if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); })); } else db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => { if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); }); }); } };
if (els.createTrnBtn) els.createTrnBtn.onclick = () => { if (!isTeamCaptain) return; const n = els.newTrnName?.value.trim(); if (n) db.ref('tournaments').push().set({ name: n, hostId: myId, status: 'open', teams: { [myTeamId]: { name: myTeamName } }, standings: { [myTeamId]: { points: 0, name: myTeamName } } }); };
if (els.deleteDataBtn) els.deleteDataBtn.onclick = async () => {
    if (confirm("⚠️ Eliminerai per sempre TUTTI i tuoi dati. Confermi?")) {
        try {
            await db.ref(`leaderboard`).once('value', s => { s.forEach(m => { m.forEach(t => { t.forEach(r => { if (r.key === myId || r.key.startsWith(myId + "_")) r.ref.remove(); }); }); }); });
            const tsS = await db.ref('teams').once('value'); if (tsS.exists()) { const ts = tsS.val(); for (let tI in ts) { if (ts[tI].members?.[myId]) { if (ts[tI].captainId === myId) { let o = Object.keys(ts[tI].members).filter(k => k !== myId); if (o.length === 0) { await db.ref(`teams/${tI}/status`).set('retired'); await db.ref(`teams/${tI}/members/${myId}`).remove(); } else { await db.ref(`teams/${tI}/captainId`).set(o[0]); await db.ref(`teams/${tI}/members/${myId}`).remove(); } } else await db.ref(`teams/${tI}/members/${myId}`).remove(); } } }
            const trS = await db.ref('tournaments').once('value'); if (trS.exists()) { const tr = trS.val(); for (let trI in tr) { if (tr[trI].matches) { for (let mI in tr[trI].matches) { const m = tr[trI].matches[mI]; if (m.playerA?.id === myId) await db.ref(`tournaments/${trI}/matches/${mI}/playerA`).remove(); if (m.playerB?.id === myId) await db.ref(`tournaments/${trI}/matches/${mI}/playerB`).remove(); } } } }
            await db.ref(`users/${myId}`).remove(); alert("Dati eliminati."); if (window.Telegram?.WebApp) window.Telegram.WebApp.close();
        } catch(e) { alert("Errore: " + e.message); }
    }
};
if (els.saveAliasBtn) els.saveAliasBtn.onclick = async () => {
    const a = els.userAliasInput?.value.trim(), p = !!els.privacyUsernameCheckbox?.checked; if (p && !a) return alert("Alias obbligatorio!"); if (a?.length > 15) return alert("Max 15 caratteri.");
    const nN = a || (tgUser ? tgUser.first_name : "Giocatore"), cU = p ? "" : tgUsername;
    try { await db.ref(`users/${myId}`).update({ alias: a || null, privacyUsername: p }); myName = nN; myPrivacy = p; if (els.playerName) els.playerName.textContent = myName; showToast("Profilo aggiornato!"); if (typeof syncUserNameEverywhere === 'function') await syncUserNameEverywhere(myId, nN, cU); } catch(e) { alert("Errore salvataggio."); }
};
if (els.resetStatsBtn) els.resetStatsBtn.onclick = async () => { if (confirm("Vuoi azzerare tutte le tue statistiche?")) { try { await Promise.all([ db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove() ]); showToast("Reset completato!"); if (typeof showProfileScreen === 'function') showProfileScreen(); } catch(e) { alert("Errore reset."); } } };
if (els.btnLeaveBR) els.btnLeaveBR.onclick = () => { if (confirm("Vuoi abbandonare la Battaglia Serale?")) { brIsPlaying = false; lastBRRoundPlayed = -1; activeTab = "room"; if (brTimerInterval) clearInterval(brTimerInterval); db.ref(`rooms/${brRoomCode}/players/${myId}`).remove(); if (typeof showScreen === 'function') showScreen('setupScreen'); } };
if (els.goToRoomBtn) els.goToRoomBtn.onclick = () => { if (els.roomEventModal) els.roomEventModal.style.display = 'none'; if (typeof showScreen === 'function') showScreen('lobbyScreen'); };

// Visibility handling
window.lostFocusDuringWord = false;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (gameRunning && inputActive) { window.lostFocusDuringWord = true; if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio(); } }
    else { if (audioCtx?.state === 'suspended') audioCtx.resume(); if (typeof startBluetoothKeepAlive === 'function') startBluetoothKeepAlive(); if (gameRunning && window.lostFocusDuringWord) { window.lostFocusDuringWord = false; inputActive = false; showToast("⚠️ Schermo spento: parola persa!"); if (currentMode === 'conquest') { db.ref(`rooms/${roomCode}/coop_state`).transaction(s => { if (s?.status === 'playing') s.progress = Math.max(0, (s.progress || 0) - 2); return s; }); setTimeout(() => { if (gameRunning) if (typeof startCoopSequence === 'function') startCoopSequence(); }, 1000); } else if (currentMode === 'quiz') { if (typeof submitQuizAnswer === 'function') submitQuizAnswer(-1); } else if (currentMode === 'pingpong') { if (typeof sendAutoPingPongWord === 'function') sendAutoPingPongWord(); } else { currentWpm = Math.max(10, currentWpm - 2); if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; const mW = gameWords[wordIndex]?.toUpperCase() || "-"; matchDetailsArray.push({ real: mW, typed: "TIMEOUT (SCHERMO)", points: 0, wpm: currentWpm, ms: 0 }); if (els.tableBody) { const tr = document.createElement('tr'); tr.innerHTML = `<td style="color:#d32f2f; font-size:0.8em;">TIMEOUT</td><td><b>${escapeHTML(mW)}</b></td><td style="color:#d32f2f; font-weight:bold;">0</td>`; els.tableBody.appendChild(tr); if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight; } wordIndex++; setTimeout(() => { if (gameRunning) if (typeof playNextWord === 'function') playNextWord(); }, 800); } } }
});

// START
if (tgUser) { myName = tgUser.first_name; myId = tgUser.id.toString(); initGame(); }
else { if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen'); if (els.errorScreen) els.errorScreen.classList.add('active-screen'); }
