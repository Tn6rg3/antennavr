/**
 * NETWORK.JS
 * Firebase, Presence, Chat, and Invites
 */

function setupChat(chatRef, containerId, alertBtnId) {
    const container = els[containerId];
    if (!container) return;
    if (listeners.activeChat[containerId] && listeners.activeChat[containerId].ref) {
        listeners.activeChat[containerId].ref.off('value', listeners.activeChat[containerId].callback);
    }
    let initialLoad = true, lastTs = Date.now();
    const callback = chatRef.limitToLast(10).on('value', snapshot => {
        container.innerHTML = '';
        let newMsgsCount = 0, latestMsg = null, latestMsgKey = null, maxTs = lastTs;
        snapshot.forEach(child => {
            const msg = child.val();
            const div = document.createElement('div'); div.style.marginBottom = '6px';
            if (msg.ts) {
                const d = new Date(msg.ts);
                const dateSmall = document.createElement('small');
                dateSmall.style.color = 'var(--hint-color)'; dateSmall.style.fontSize = '0.75em';
                dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                div.appendChild(dateSmall); if (msg.ts > maxTs) maxTs = msg.ts;
            }
            const nameB = document.createElement('b'); nameB.style.color = 'var(--link-color)'; nameB.textContent = msg.name + ": ";
            div.appendChild(nameB);
            const textSpan = document.createElement('span');
            if (isChatCwEnabled) {
                textSpan.className = 'cw-spoiler'; textSpan.textContent = msg.text; textSpan.title = "Clicca per svelare il testo";
                textSpan.onclick = function() { this.classList.toggle('revealed'); };
            } else { textSpan.textContent = msg.text; }
            div.appendChild(textSpan); container.appendChild(div);
            if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) { newMsgsCount++; latestMsg = msg; latestMsgKey = child.key; }
        });
        lastTs = maxTs; container.scrollTop = container.scrollHeight;
        if (!initialLoad && newMsgsCount > 0 && latestMsg) {
            if (alertBtnId && !isChatDrawerOpen && els[alertBtnId]) els[alertBtnId].style.backgroundColor = '#4caf50';
            const isPlayingBR = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
            const isGlobal = (chatRef.key === 'globalChat');
            const shouldNotify = isGlobal ? (!isGlobalChatMuted && !gameRunning && !isPlayingBR && (!isChatDrawerOpen || activeChatContext !== 'global')) : (!isChatDrawerOpen || chatRef.key !== (activeChatContext === 'room' ? roomCode : myTeamId));
            if (isChatCwEnabled) {
                if (shouldNotify) showToast(`${isGlobal ? "🌎" : "💬"} ${latestMsg.name}: [📻 Messaggio CW...]`);
                if (!gameRunning && !isPlayingBR && (shouldNotify || (isChatDrawerOpen && activeChatContext === (isGlobal ? 'global' : 'room')))) {
                    if (latestMsgKey && latestMsgKey !== window.lastPlayedCwMsgKey) { window.lastPlayedCwMsgKey = latestMsgKey; enqueueChatCwAudio(latestMsg.text); }
                }
            } else {
                if (shouldNotify) {
                    showToast(`${isGlobal ? "🌎" : "💬"} ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
                    if (!isGlobalChatMuted) playNotificationSound();
                }
            }
        }
        initialLoad = false;
    });
    listeners.activeChat[containerId] = { ref: chatRef, callback: callback };
}

function listenToChat() {
    if (activeChatContext === 'room' && roomCode) {
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null);
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "💬 Chat Stanza";
        if (els.gameArea && els.gameArea.classList.contains('active-screen')) { els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false; }
    } else {
        setupChat(db.ref('globalChat'), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
}

function enqueueChatCwAudio(text) {
    if (!text || !isChatCwEnabled) return;
    if (chatCwAudioQueue.length < 10) { chatCwAudioQueue.push(text.toUpperCase()); processChatCwQueue(); }
}

async function processChatCwQueue() {
    if (isChatCwPlaying || chatCwAudioQueue.length === 0) return;
    isChatCwPlaying = true;
    while (chatCwAudioQueue.length > 0 && isChatCwEnabled) {
        const nextText = chatCwAudioQueue.shift();
        const savedTone = currentTone; currentTone = chatCwTone;
        try { await playMorseAudio(nextText, chatCwWpm, true); } catch (e) { console.error(e); } finally { currentTone = savedTone; }
        if (chatCwAudioQueue.length > 0 && isChatCwEnabled) await new Promise(r => setTimeout(r, 600));
    }
    isChatCwPlaying = false;
}

function renderOrUpdateUserListItem(userId, u) {
    if (!els.onlineUsersList || userId === myId) return;
    let li = document.getElementById(`user_list_item_${userId}`); if (!li) { li = document.createElement('li'); li.id = `user_list_item_${userId}`; els.onlineUsersList.appendChild(li); const eM = els.onlineUsersList.querySelector('.empty-users-msg'); if (eM) eM.remove(); }
    li.innerHTML = ''; li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:4px 8px; margin-bottom:3px;";
    const isW = (isChallenging && currentInviterId === userId), isP = (u.status === 'playing'), canS = (isP && u.allowSpectators && u.activeRoomCode);
    const lS = document.createElement('span'); lS.style.cssText = "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%; font-size:0.9em;";
    const nB = document.createElement('b'); nB.textContent = u.name || "Anonimo"; nB.style.cssText = 'cursor:pointer; color:var(--link-color); text-decoration:underline;'; nB.onclick = () => openTeamInviteModal(userId, u.name); lS.appendChild(nB);
    const btn = document.createElement('button'); btn.style.cssText = "width:auto; padding:4px 10px; font-size:0.8em; margin:0; flex-shrink:0;";
    if (canS) { btn.className = "action-btn-small"; btn.style.cssText += "background-color:#fbc02d; color:#000; font-weight:bold;"; btn.textContent = "👁️ Osserva"; btn.onclick = () => window.watchSpecificRoom(u.activeRoomCode, u.name); }
    else if (isP) { btn.className = "action-btn-small btn-secondary"; btn.disabled = true; btn.textContent = "In partita"; }
    else { btn.className = `action-btn-small ${isW ? 'btn-danger' : 'btn-success'}`; if (isChallenging && !isW) btn.disabled = true; btn.textContent = isW ? 'In Attesa...' : 'Sfida'; btn.onclick = () => openInviteModal(userId, u.name); }
    li.appendChild(lS); li.appendChild(btn);
}

function removeUserListItem(userId) { if (!els.onlineUsersList) return; const li = document.getElementById(`user_list_item_${userId}`); if (li) li.remove(); if (els.onlineUsersList.children.length === 0) { const eL = document.createElement('li'); eL.className = 'empty-users-msg'; eL.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;"; eL.textContent = "Sei solo."; els.onlineUsersList.appendChild(eL); } }

function listenToOnlineUsers() {
    if (listeners.presence) return;
    if (els.onlineUsersList) els.onlineUsersList.innerHTML = '';
    const presenceRef = db.ref('presence').limitToLast(50);
    const onAdded = presenceRef.on('child_added', snap => { if (snap.key !== myId) renderOrUpdateUserListItem(snap.key, snap.val()); });
    const onChanged = presenceRef.on('child_changed', snap => { if (snap.key !== myId) renderOrUpdateUserListItem(snap.key, snap.val()); });
    const onRemoved = presenceRef.on('child_removed', snap => removeUserListItem(snap.key));
    listeners.presence = { ref: presenceRef, onAdded, onChanged, onRemoved };
}

function listenToInvites() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val(); if (!inv || roomCode || gameRunning) return;
        if (Date.now() - inv.ts > 60000) return db.ref(`invites/${myId}`).remove();
        if (els.inviteModalText) els.inviteModalText.innerHTML = '';
        if (inv.type === 'team') {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = inv.teamId ? "🚀 INVITO SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
            if (els.inviteModalText) {
                if (inv.teamId) {
                    els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti ha invitato ad unirti alla squadra "));
                    const bT = document.createElement('b'); bT.textContent = inv.teamName; els.inviteModalText.appendChild(bT); els.inviteModalText.appendChild(document.createTextNode("."));
                } else els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti suggerisce di creare una tua squadra!"));
            }
            if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'block';
            if (els.acceptTeamInviteBtn) {
                els.acceptTeamInviteBtn.textContent = inv.teamId ? "UNISCITI ✅" : "VAI ALLA CREAZIONE 🛠️";
                els.acceptTeamInviteBtn.onclick = () => { db.ref(`invites/${myId}`).remove(); window.closeInviteModal(); if (inv.teamId) window.joinTeam(inv.teamId); else showScreen('teamsScreen'); };
            }
        } else {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();
            if (els.inviteModalText) {
                els.inviteModalText.appendChild(document.createTextNode("Ti ha invitato a giocare:")); els.inviteModalText.appendChild(document.createElement('br'));
                const bM = document.createElement('b'); bM.textContent = inv.mode.toUpperCase(); els.inviteModalText.appendChild(bM);
                els.inviteModalText.appendChild(document.createTextNode(" a ")); const bW = document.createElement('b'); bW.textContent = inv.wpm; els.inviteModalText.appendChild(bW);
                els.inviteModalText.appendChild(document.createTextNode(" WPM (")); const bC = document.createElement('b'); bC.textContent = inv.wordCount; els.inviteModalText.appendChild(bC); els.inviteModalText.appendChild(document.createTextNode(" test)."));
            }
            if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'block';
        }
        if (els.inviteModal) els.inviteModal.style.display = 'flex'; currentInviterId = inv.fromId; window.lastIncomingInvite = inv;
    });
}

function listenToInviteAccepted() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => {
        const d = snap.val(); if (d && d.roomCode) { db.ref(`invite_accepted/${myId}`).remove(); isChallenging = false; window.closeInviteModal(); roomCode = d.roomCode; joinRoomLogic(false); }
    });
}

async function syncUserNameEverywhere(userId, newName, newUsername) {
    await db.ref(`presence/${userId}`).update({ name: newName, username: newUsername });
    if (roomCode) await db.ref(`rooms/${roomCode}/players/${userId}`).update({ name: newName, username: newUsername });
    const now = new Date(); const dK = now.toISOString().split('T')[0]; const wK = getWeekNumber(now); const mK = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    for (const path of [`activity/daily/${dK}`, `activity/weekly/${wK}`, `activity/monthly/${mK}`]) {
        const r = db.ref(`${path}/${userId}`); if ((await r.once('value')).exists()) await r.update({ name: newName });
    }
    if (myTeamId) await db.ref(`teams/${myTeamId}/members/${userId}`).update({ name: newName, username: newUsername });
    const ts = await db.ref('tournaments').once('value');
    if (ts.exists()) {
        for (let tI in ts.val()) {
            if (ts.val()[tI].status !== 'finished' && ts.val()[tI].matches) {
                for (let mI in ts.val()[tI].matches) {
                    const m = ts.val()[tI].matches[mI];
                    if (m.playerA && m.playerA.id === userId) await db.ref(`tournaments/${tI}/matches/${mI}/playerA`).update({ name: newName, username: newUsername });
                    if (m.playerB && m.playerB.id === userId) await db.ref(`tournaments/${tI}/matches/${mI}/playerB`).update({ name: newName, username: newUsername });
                }
            }
        }
    }
    for (const path of ['callsign/global', 'standard', 'pingpong', 'chars', 'quiz']) {
        const s = await db.ref(`leaderboard/${path}`).once('value');
        if (s.exists()) {
            s.forEach(sub => { if (path === 'callsign/global') { if (sub.key === userId) sub.ref.update({ name: newName, username: newUsername }); } else { sub.forEach(ur => { if (ur.key === userId) ur.ref.update({ name: newName, username: newUsername }); }); } });
        }
    }
}
