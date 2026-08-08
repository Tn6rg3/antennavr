/**
 * ROOMS.JS
 * Room creation, joining, and Lobby management
 */

function addOrUpdateRoomCard(code, room) {
    if (!els.waitingRoomsList || !room) return;
    if (code.startsWith("TRN_") || (room.expiresAt && Date.now() > room.expiresAt) || room.status !== 'waiting' || room.type === 'single') { if (typeof removeRoomCard === 'function') removeRoomCard(code); return; }
    let li = document.getElementById(`room_list_item_${code}`);
    if (!li) { li = document.createElement('li'); li.id = `room_list_item_${code}`; els.waitingRoomsList.appendChild(li); const eM = els.waitingRoomsList.querySelector('.empty-rooms-msg'); if (eM) eM.remove(); }
    li.innerHTML = '';
    let modeIcon = room.mode === 'callsign' ? '🎙️ Nom.' : room.mode === 'pingpong' ? '🏓 Ping Pong' : room.mode === 'quiz' ? '❓ Quiz' : (room.mode === 'conquest' || room.type === 'coop') ? '⚔️ Conquista' : '🔤 Parole';
    const pC = Object.keys(room.players || {}).length || (room.pCount || 1);
    window.lastKnownRoomPlayersCount = window.lastKnownRoomPlayersCount || {};
    const prevC = window.lastKnownRoomPlayersCount[code] || 1;
    if (room.hostId === myId && pC > prevC && pC >= 2 && (roomCode !== code || !els.lobbyScreen.classList.contains('active-screen'))) {
        showToast(`👤 Un giocatore è appena entrato nella tua stanza #${code}!`); if (typeof playNotificationSound === 'function') playNotificationSound();
    }
    window.lastKnownRoomPlayersCount[code] = pC;
    const span = document.createElement('span'); const bT = document.createElement('b'); bT.textContent = `#${code} - ${modeIcon}`; span.appendChild(bT); span.appendChild(document.createElement('br')); const sI = document.createElement('small'); sI.textContent = `${pC} Gioc. | ${room.wpm} WPM`; span.appendChild(sI); li.appendChild(span);
    const btn = document.createElement('button'); btn.className = 'action-btn-small'; btn.textContent = currentLang === 'en' ? 'Join' : 'Entra'; btn.onclick = () => { if (typeof window.joinSpecificRoom === 'function') window.joinSpecificRoom(code); }; li.appendChild(btn);
}

function removeRoomCard(code) {
    if (!els.waitingRoomsList) return;
    const li = document.getElementById(`room_list_item_${code}`); if (li) li.remove();
    if (els.waitingRoomsList.children.length === 0) {
        const eL = document.createElement('li'); eL.className = 'empty-rooms-msg'; eL.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;"; eL.textContent = currentLang === 'en' ? "No challenges." : "Nessuna sfida."; els.waitingRoomsList.appendChild(eL);
    }
}

function listenToRooms() {
    if (listeners.roomsList && listeners.roomsList.ref) { listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded); listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged); listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved); listeners.roomsList = null; }
    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    const lQ = db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);
    const onA = lQ.on('child_added', snap => { if (typeof addOrUpdateRoomCard === 'function') addOrUpdateRoomCard(snap.key, snap.val()); });
    const onC = lQ.on('child_changed', snap => { if (typeof addOrUpdateRoomCard === 'function') addOrUpdateRoomCard(snap.key, snap.val()); });
    const onR = lQ.on('child_removed', snap => { if (typeof removeRoomCard === 'function') removeRoomCard(snap.key); });
    listeners.roomsList = { ref: lQ, onAdded: onA, onChanged: onC, onRemoved: onR };
}

function joinRoomLogic(isReconnect = false) {
    gameRunning = false;
    const pRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    pRef.once('value', snapshot => {
        const pD = snapshot.val();
        if (pD?.finished) { if (typeof showScreen === 'function') showScreen('leaderboardScreen'); activeTab = "room"; if (typeof showLeaderboardTab === 'function') showLeaderboardTab('tabRoomBtn'); localStorage.removeItem(STORAGE_ROOM_KEY); return; }
        if (pD) { totalScore = pD.score || 0; wordIndex = pD.wordIndex || 0; quizQuestionIndex = pD.wordIndex || 0; matchDetailsArray = pD.matchDetails || []; if (isRejoining) showToast("🔄 Partita recuperata!"); }
        if (typeof showScreen === 'function') showScreen('lobbyScreen');
        if (els.lobbyTitleText) els.lobbyTitleText.textContent = roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera";
        if (els.permanentGameInput) els.permanentGameInput.blur();
        pRef.onDisconnect().update({ online: false });
        if (!pD) {
            pRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, score: 0, wpm: 0, finished: false, teamId: myTeamId || null, ready: false, online: true }).then(() => {
                if (!isSinglePlayer && !roomCode.startsWith("TRN_")) {
                    db.ref(`rooms/${roomCode}/players`).once('value', s => { if (s.exists()) db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(Object.keys(s.val()).length); else db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(1); });
                }
            });
        } else pRef.update({ online: true, name: myName, username: myPrivacy ? "" : tgUsername });
        if (typeof listenToChat === 'function') listenToChat();
        if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) { if (typeof exitRoomCleanly === 'function') exitRoomCleanly(true); return; }
            const rD = snap.val(); currentMode = rD.mode; requestedWordCount = rD.wordCount; isSinglePlayer = rD.type === 'single'; isFixedSpeed = rD.fixedSpeed || false; roomHostId = rD.hostId;
            window.charSpaceWpm = rD.charSpaceWpm !== undefined ? rD.charSpaceWpm : rD.wpm; window.wordSpaceMult = rD.wordSpaceMult || 1.0;
            if (rD.status === 'playing' || rD.status === 'countdown') localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
            if (rD.status === 'playing' && !gameRunning) { currentWpm = rD.wpm; baseWpm = rD.wpm; currentTone = rD.tone; if (rD.words) gameWords = rD.words; if (typeof resumeGameSequence === 'function') return resumeGameSequence(); }
            if (rD.status === 'countdown' && !gameRunning) { currentWpm = rD.wpm; baseWpm = rD.wpm; currentTone = rD.tone; if (rD.words) gameWords = rD.words; if (typeof startCountdownSequence === 'function') return startCountdownSequence(); }
            if (rD.status === 'waiting') {
                if (typeof renderPlayersList === 'function') renderPlayersList(rD.players || {}, rD.hostId);
                const pC = Object.keys(rD.players || {}).length;
                if (myId === rD.hostId && pC > lastPlayerCount && activeChatContext !== 'room') { if (typeof showRoomEventModal === 'function') showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato."); }
                lastPlayerCount = pC; if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
                if (rD.expiresAt && !isSinglePlayer) {
                    lobbyTimerInterval = setInterval(() => {
                        const diff = rD.expiresAt - Date.now();
                        if (diff <= 0) { clearInterval(lobbyTimerInterval); if (els.lobbyTimerText) els.lobbyTimerText.textContent = "Tempo scaduto!"; }
                        else if (els.lobbyTimerText) { els.lobbyTimerText.textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2, '0')}`; }
                    }, 1000);
                } else if (els.lobbyTimerText) els.lobbyTimerText.textContent = "";
            }
        });
    });
}

function renderPlayersList(playersData, hostId) {
    if (!els.playersList) return;
    els.playersList.innerHTML = ''; const count = Object.keys(playersData).length;
    if (count > lastPlayerCount && lastPlayerCount > 0) { if (typeof playBeep === 'function') playBeep(500, 0.1); setTimeout(() => { if (typeof playBeep === 'function') playBeep(700, 0.15); }, 150); showToast("👤 Nuovo giocatore!"); }
    lastPlayerCount = count; let allR = true; const pK = Object.keys(playersData); if (pK.length < 2) allR = false;
    Object.entries(playersData).forEach(([id, data]) => {
        if (!data.ready) allR = false;
        const li = document.createElement('li'); const nS = document.createElement('span'); nS.textContent = `${data.ready ? '✅' : '⏳'} ${data.name}`;
        if (data.username && String(data.username).trim() !== "") { nS.style.color = 'var(--link-color)'; nS.style.cursor = 'pointer'; nS.style.textDecoration = 'underline'; nS.onclick = () => { if (typeof openTelegramProfile === 'function') openTelegramProfile(data.username); }; }
        li.appendChild(nS); if (id === hostId) { const sH = document.createElement('small'); sH.textContent = ' (HOST)'; li.appendChild(sH); }
        els.playersList.appendChild(li);
    });
    const isTP = roomCode.startsWith("TRN_") || currentMode === 'pingpong'; const amIH = (myId === hostId) || roomCode.startsWith("TRN_"); const amIR = playersData[myId]?.ready;
    if (els.startMultiplayerBtn) els.startMultiplayerBtn.style.display = (amIH && !isTP) ? 'block' : 'none';
    if (els.deleteRoomBtn) els.deleteRoomBtn.style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none';
    if (els.readyBtn) els.readyBtn.style.display = (isTP && !amIR) ? 'block' : 'none';
    if (isTP) {
        if (els.waitingHostText) { els.waitingHostText.style.display = amIR ? 'block' : 'none'; els.waitingHostText.textContent = "In attesa..."; }
        if (els.statusInfoText) els.statusInfoText.textContent = amIR ? "SONO PRONTO ✅" : "Connessione sicura in corso...";
    } else {
        if (els.waitingHostText) { els.waitingHostText.style.display = amIH ? 'none' : 'block'; els.waitingHostText.textContent = "In attesa dell'host..."; }
        if (els.statusInfoText) els.statusInfoText.textContent = amIH ? "Sei l'Host." : "Sei un partecipante.";
    }
    if (allR && isTP && (pK[0] === myId || amIH)) { db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null }); db.ref(`public_lobby_rooms/${roomCode}`).remove(); }
}

function exitRoomCleanly(roomWasDeletedByHost = false, isExplicitQuit = false) {
    if (typeof clearAllTimers === 'function') clearAllTimers(); if (typeof window.currentSpectatorCleanup === 'function') { window.currentSpectatorCleanup(); window.currentSpectatorCleanup = null; }
    let targetS = 'setupScreen'; const amIH = (myId === roomHostId);
    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (listeners.pingPong && roomCode) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (roomCode) db.ref(`rooms/${roomCode}/coop_state`).off();
    isCoopMode = false; if (els.coopArea) els.coopArea.style.display = 'none'; if (els.tableWrapper) els.tableWrapper.style.display = 'block';
    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetS = 'teamsScreen'; localStorage.removeItem(STORAGE_ROOM_KEY);
        if (roomWasDeletedByHost) { if (amIH && !roomCode.startsWith("TRN_")) { db.ref(`rooms/${roomCode}`).remove(); db.ref(`public_lobby_rooms/${roomCode}`).remove(); } else { db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel(); db.ref(`rooms/${roomCode}/players/${myId}`).remove(); } roomCode = ""; }
        else if (isExplicitQuit) { db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel(); db.ref(`rooms/${roomCode}/players/${myId}`).remove(); roomCode = ""; }
        else db.ref(`rooms/${roomCode}/players/${myId}`).update({ online: false });
    } else { if (listeners.room) { listeners.room.off(); listeners.room = null; } }
    db.ref(`presence/${myId}`).update({ allowSpectators: false, activeRoomCode: null, status: 'online' });
    if (typeof hideChat === 'function') hideChat(); if (typeof showScreen === 'function') showScreen(targetS); if (targetS === 'setupScreen') if (typeof listenToRooms === 'function') listenToRooms();
}

function showRoomEventModal(title, text) {
    if (els.roomEventTitle) els.roomEventTitle.textContent = title;
    if (els.roomEventText) els.roomEventText.textContent = text;
    if (els.roomEventModal) els.roomEventModal.style.display = 'flex';
}
