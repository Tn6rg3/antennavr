// js/social_manager.js

// --- CHAT GLOBALE E DI STANZA ---
window.hideChat = function() {
    if (els.chatDrawer) els.chatDrawer.style.display = 'none';
    isChatDrawerOpen = false;
    chatCwAudioQueue = [];
    Object.keys(listeners.activeChat).forEach(key => {
        if (listeners.activeChat[key] && listeners.activeChat[key].ref) {
            listeners.activeChat[key].ref.off('value', listeners.activeChat[key].callback);
        }
        delete listeners.activeChat[key];
    });
};

window.listenToChat = function() {
    if (activeChatContext === 'room' && roomCode) {
        window.setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null);
        window.setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "💬 Chat Stanza";
        if (els.gameArea && els.gameArea.classList.contains('active-screen')) {
            els.chatDrawer.style.display = 'none';
            isChatDrawerOpen = false;
        }
    } else {
        window.setupChat(db.ref('globalChat'), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
};

window.openGlobalChat = function() {
    activeChatContext = 'global';
    window.listenToChat();
    window.toggleChat();
};

window.toggleChat = function() {
    if (!els.chatDrawer) return;
    if (els.chatDrawer.style.display === 'none') {
        els.chatDrawer.style.display = 'flex';
        isChatDrawerOpen = true;
        if (els.chatMessages) els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    } else {
        els.chatDrawer.style.display = 'none';
        isChatDrawerOpen = false;
    }
};

window.enqueueChatCwAudio = function(text) {
    if (!text || !isChatCwEnabled) return;
    if (chatCwAudioQueue.length < 10) {
        chatCwAudioQueue.push(text.toUpperCase());
        window.processChatCwQueue();
    }
};

window.processChatCwQueue = async function() {
    if (isChatCwPlaying || chatCwAudioQueue.length === 0) return;
    isChatCwPlaying = true;
    while (chatCwAudioQueue.length > 0 && isChatCwEnabled) {
        const nextText = chatCwAudioQueue.shift();
        const savedTone = currentTone;
        currentTone = chatCwTone;
        try {
            await playMorseAudio(nextText, chatCwWpm, true);
        } catch (e) {
            console.error("Errore riproduzione Morse in chat:", e);
        } finally {
            currentTone = savedTone;
        }
        if (chatCwAudioQueue.length > 0 && isChatCwEnabled) {
            await new Promise(r => setTimeout(r, 600));
        }
    }
    isChatCwPlaying = false;
};

window.setupChat = function(chatRef, containerId, alertBtnId) {
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
            const div = document.createElement('div');
            div.style.marginBottom = '6px';

            if (msg.ts) {
                const d = new Date(msg.ts);
                const dateSmall = document.createElement('small');
                dateSmall.style.color = 'var(--hint-color)';
                dateSmall.style.fontSize = '0.75em';
                dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                div.appendChild(dateSmall);
                if (msg.ts > maxTs) maxTs = msg.ts;
            }

            const nameB = document.createElement('b');
            nameB.style.color = 'var(--link-color)';
            nameB.textContent = msg.name + ": ";
            div.appendChild(nameB);

            const textSpan = document.createElement('span');
            if (isChatCwEnabled) {
                textSpan.className = 'cw-spoiler';
                textSpan.textContent = msg.text;
                textSpan.title = "Clicca per svelare il testo";
                textSpan.onclick = function() {
                    this.classList.toggle('revealed');
                };
            } else {
                textSpan.textContent = msg.text;
            }
            div.appendChild(textSpan);

            container.appendChild(div);
            if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) {
                newMsgsCount++;
                latestMsg = msg;
                latestMsgKey = child.key;
            }
        });

        lastTs = maxTs;
        container.scrollTop = container.scrollHeight;

        if (!initialLoad && newMsgsCount > 0 && latestMsg) {
            if (alertBtnId && !isChatDrawerOpen && els[alertBtnId]) {
                els[alertBtnId].style.backgroundColor = '#4caf50';
            }

            const isPlayingBR = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
            const isGlobal = (chatRef.key === 'globalChat');
            const shouldNotify = isGlobal
                ? (!isGlobalChatMuted && !gameRunning && !isPlayingBR && (!isChatDrawerOpen || activeChatContext !== 'global'))
                : (!isChatDrawerOpen || chatRef.key !== (activeChatContext === 'room' ? roomCode : myTeamId));

            if (isChatCwEnabled) {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: [📻 Messaggio CW...]`);
                }
                if (!gameRunning && !isPlayingBR && (shouldNotify || (isChatDrawerOpen && activeChatContext === (isGlobal ? 'global' : 'room')))) {
                    if (latestMsgKey && latestMsgKey !== window.lastPlayedCwMsgKey) {
                        window.lastPlayedCwMsgKey = latestMsgKey;
                        window.enqueueChatCwAudio(latestMsg.text);
                    }
                }
            } else {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
                    if (!isGlobalChatMuted && typeof playNotificationSound === 'function') {
                        playNotificationSound();
                    }
                }
            }
        }
        initialLoad = false;
    });
    listeners.activeChat[containerId] = { ref: chatRef, callback: callback };
};

// --- PRESENZA ONLINE E LISTE UTENTI ---
window.renderOrUpdateUserListItem = function(userId, u) {
    if (!els.onlineUsersList || userId === myId) return;

    let li = document.getElementById(`user_list_item_${userId}`);
    if (!li) {
        li = document.createElement('li');
        li.id = `user_list_item_${userId}`;
        els.onlineUsersList.appendChild(li);
        const emptyMsg = els.onlineUsersList.querySelector('.empty-users-msg');
        if (emptyMsg) emptyMsg.remove();
    }

    li.innerHTML = '';
    li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:4px 8px; margin-bottom:3px;";

    const isWaiting = (isChallenging && currentInviterId === userId);
    const isPlaying = (u.status === 'playing');
    const canSpectate = (isPlaying && u.allowSpectators && u.activeRoomCode);

    const leftSpan = document.createElement('span');
    leftSpan.style.cssText = "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%; font-size:0.9em;";

    const nameB = document.createElement('b');
    nameB.textContent = u.name || "Anonimo";
    nameB.style.cursor = 'pointer';
    nameB.style.color = 'var(--link-color)';
    nameB.style.textDecoration = 'underline';
    nameB.onclick = () => window.openTeamInviteModal(userId, u.name);

    leftSpan.appendChild(nameB);

    const btn = document.createElement('button');
    btn.style.cssText = "width:auto; padding:4px 10px; font-size:0.8em; margin:0; flex-shrink:0;";

    if (canSpectate) {
        btn.className = "action-btn-small";
        btn.style.backgroundColor = "#fbc02d";
        btn.style.color = "#000";
        btn.style.fontWeight = "bold";
        btn.textContent = "👁️ Osserva";
        btn.onclick = () => window.watchSpecificRoom(u.activeRoomCode, u.name);
    } else if (isPlaying) {
        btn.className = "action-btn-small btn-secondary";
        btn.disabled = true;
        btn.textContent = "In partita";
    } else {
        btn.className = `action-btn-small ${isWaiting ? 'btn-danger' : 'btn-success'}`;
        if (isChallenging && !isWaiting) btn.disabled = true;
        btn.textContent = isWaiting ? 'In Attesa...' : 'Sfida';
        btn.onclick = () => window.openInviteModal(userId, u.name);
    }

    li.appendChild(leftSpan);
    li.appendChild(btn);
};

window.removeUserListItem = function(userId) {
    if (!els.onlineUsersList) return;
    const li = document.getElementById(`user_list_item_${userId}`);
    if (li) li.remove();

    if (els.onlineUsersList.children.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-users-msg';
        emptyLi.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;";
        emptyLi.textContent = "Sei solo.";
        els.onlineUsersList.appendChild(emptyLi);
    }
};

window.listenToOnlineUsers = function() {
    if (listeners.presence) return;

    if (els.onlineUsersList) els.onlineUsersList.innerHTML = '';
    const presenceRef = db.ref('presence').limitToLast(50);

    const onAdded = presenceRef.on('child_added', snap => {
        if (snap.key !== myId) window.renderOrUpdateUserListItem(snap.key, snap.val());
    });

    const onChanged = presenceRef.on('child_changed', snap => {
        if (snap.key !== myId) window.renderOrUpdateUserListItem(snap.key, snap.val());
    });

    const onRemoved = presenceRef.on('child_removed', snap => {
        window.removeUserListItem(snap.key);
    });

    listeners.presence = { ref: presenceRef, onAdded, onChanged, onRemoved };
};

// --- MODALI INVITO E SFIDE ---
window.openInviteModal = function(targetId, targetName) {
    currentInviterId = targetId;
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Sfida " + targetName;
    if (els.inviteModalText) els.inviteModalText.textContent = "Scegli le impostazioni per la sfida:";
    if (els.inviteSettings) els.inviteSettings.style.display = 'block';
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none';
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none';
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'block';
    if (els.inviteModal) els.inviteModal.style.display = 'flex';

    // Rileghiamo il pulsante di invio per essere sicuri che usi i dati corretti
    if (els.sendInviteBtn) {
        els.sendInviteBtn.onclick = () => {
            const modeInput = document.getElementById('inviteModeInput');
            const wpmInput = document.getElementById('inviteWpmInput');
            const wcInput = document.getElementById('inviteWordCountInput');

            const mode = modeInput ? modeInput.value : 'standard';
            const wpm = wpmInput ? parseInt(wpmInput.value) : 20;
            const wordCount = wcInput ? parseInt(wcInput.value) : 10;

            console.log("RPG: Sending Game Invite to:", targetId, "Mode:", mode);

            db.ref(`invites/${targetId}`).set({
                fromId: myId,
                fromName: myName,
                type: 'game',
                mode: mode,
                wpm: wpm,
                wordCount: wordCount,
                ts: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                showToast("Sfida inviata a " + targetName + " 🚀");
                isChallenging = true;
                window.closeInviteModal();
            }).catch(err => {
                showToast("Errore invio: " + err.message);
            });
        };
    }
};

window.openTeamInviteModal = async function(targetId, targetName) {
    currentInviterId = targetId;
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Recluta " + targetName;
    if (els.recruitmentStatusText) els.recruitmentStatusText.textContent = "Caricamento stato...";
    if (els.inviteSettings) els.inviteSettings.style.display = 'none';
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'block';
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none';
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
    if (els.recruitJoinBtn) els.recruitJoinBtn.style.display = 'none';

    try {
        const teamsSnap = await db.ref('teams').once('value');
        let tName = null, inTeam = false;
        teamsSnap.forEach(tSnap => {
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

        if (els.recruitJoinBtn) els.recruitJoinBtn.onclick = () => window.sendRecruitmentInvite('team');
        if (els.recruitCreateBtn) els.recruitCreateBtn.onclick = () => window.sendRecruitmentInvite('suggest');
        if (els.recruitMsgBtn) {
            els.recruitMsgBtn.onclick = () => {
                db.ref(`presence/${targetId}`).once('value', s => {
                    const u = s.val();
                    if (u && u.username && String(u.username).trim() !== "") {
                        tg.openTelegramLink('https://t.me/' + u.username);
                    } else {
                        tg.showAlert("Nessun username pubblico.");
                    }
                });
            };
        }
    } catch(e) {}

    if (els.inviteModal) els.inviteModal.style.display = 'flex';
};

window.sendRecruitmentInvite = function(type) {
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
};

window.closeInviteModal = function() {
    if (els.inviteModal) els.inviteModal.style.display = 'none';
    currentInviterId = null;
};

window.listenToInvites = function() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val();
        if (!inv || roomCode || gameRunning) return;
        if (Date.now() - inv.ts > 60000) return db.ref(`invites/${myId}`).remove();

        if (els.inviteModalText) els.inviteModalText.innerHTML = '';

        if (inv.type === 'team') {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = inv.teamId ? "🚀 INVITO SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
            if (els.inviteModalText) {
                if (inv.teamId) {
                    els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti ha invitato ad unirti alla squadra "));
                    const bTeam = document.createElement('b'); bTeam.textContent = inv.teamName; els.inviteModalText.appendChild(bTeam);
                    els.inviteModalText.appendChild(document.createTextNode("."));
                } else {
                    els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti suggerisce di creare una tua squadra!"));
                }
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
            if (els.inviteModalText) {
                els.inviteModalText.innerHTML = '';
                els.inviteModalText.appendChild(document.createTextNode("Ti ha invitato a giocare:"));
                els.inviteModalText.appendChild(document.createElement('br'));
                const bMode = document.createElement('b'); bMode.textContent = (inv.mode || 'standard').toUpperCase(); els.inviteModalText.appendChild(bMode);
                els.inviteModalText.appendChild(document.createTextNode(" a "));
                const bWpm = document.createElement('b'); bWpm.textContent = inv.wpm || 20; els.inviteModalText.appendChild(bWpm);
                els.inviteModalText.appendChild(document.createTextNode(" WPM ("));
                const bCount = document.createElement('b'); bCount.textContent = inv.wordCount || 10; els.inviteModalText.appendChild(bCount);
                els.inviteModalText.appendChild(document.createTextNode(" test)."));
            }

            if (els.inviteSettings) els.inviteSettings.style.display = 'none';
            if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none';
            if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'block';
            if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
            if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
            if (els.acceptInviteBtn) {
                els.acceptInviteBtn.onclick = () => {
                    const roomCodeNew = Math.floor(1000 + Math.random() * 9000).toString();
                    const words = window.getGameWords(inv.wordCount || 10, inv.mode || 'standard');
                    const isCoop = (inv.mode === 'conquest');

                    db.ref(`rooms/${roomCodeNew}`).set({
                        status: 'countdown',
                        type: isCoop ? 'coop' : 'multi',
                        mode: inv.mode || 'standard',
                        wpm: inv.wpm || 20,
                        tone: 600,
                        wordCount: inv.wordCount || 10,
                        words: words,
                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                        hostId: inv.fromId
                    }).then(() => {
                        db.ref(`invite_accepted/${inv.fromId}`).set({
                            roomCode: roomCodeNew,
                            ts: firebase.database.ServerValue.TIMESTAMP
                        });
                        db.ref(`invites/${myId}`).remove();
                        window.closeInviteModal();
                        roomCode = roomCodeNew;
                        window.joinRoomLogic(false);
                    });
                };
            }

            if (els.declineInviteBtn) {
                els.declineInviteBtn.onclick = () => {
                    db.ref(`invites/${myId}`).remove();
                    window.closeInviteModal();
                };
            }
        }

        if (els.inviteModal) els.inviteModal.style.display = 'flex';
        currentInviterId = inv.fromId;
        window.lastIncomingInvite = inv;
    });
};

window.listenToInviteAccepted = function() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => {
        const d = snap.val();
        if (d && d.roomCode) {
            db.ref(`invite_accepted/${myId}`).remove();
            isChallenging = false;
            window.closeInviteModal();
            roomCode = d.roomCode;
            window.joinRoomLogic(false);
        }
    });
};

// --- LISTA STANZE E BACHECA SFIDE (SENZA DUPLICATI) ---
window.lastKnownRoomPlayersCount = window.lastKnownRoomPlayersCount || {};

window.addOrUpdateRoomCard = function(code, room) {
    if (!els.waitingRoomsList || !room) return;
    if (code.startsWith("TRN_") || (room.expiresAt && Date.now() > room.expiresAt) || room.status !== 'waiting' || room.type === 'single') {
        window.removeRoomCard(code);
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
    const isOutsideRoom = (roomCode !== code || (els.lobbyScreen && !els.lobbyScreen.classList.contains('active-screen')));

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
};

window.removeRoomCard = function(code) {
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
};

window.listenToRooms = function() {
    if (listeners.roomsList && listeners.roomsList.ref) {
        listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
        listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
        listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
        listeners.roomsList = null;
    }

    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    const lobbyQuery = db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);

    const onAdded = lobbyQuery.on('child_added', snap => window.addOrUpdateRoomCard(snap.key, snap.val()));
    const onChanged = lobbyQuery.on('child_changed', snap => window.addOrUpdateRoomCard(snap.key, snap.val()));
    const onRemoved = lobbyQuery.on('child_removed', snap => window.removeRoomCard(snap.key));

    listeners.roomsList = { ref: lobbyQuery, onAdded, onChanged, onRemoved };
};
