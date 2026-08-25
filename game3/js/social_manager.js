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
    if (window.activeChatContext === 'room' && window.roomCode) {
        window.setupChat(db.ref(`rooms/${window.roomCode}/chat`), 'lobbyChatMessages', 50);
        window.setupChat(db.ref(`rooms/${window.roomCode}/chat`), 'chatMessages', 50);
        if (els.chatTitle) els.chatTitle.textContent = "💬 Chat Stanza";
    } else {
        window.setupChat(db.ref('globalChat'), 'chatMessages', 50);
        if (els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
};

window.openGlobalChat = function() {
    window.activeChatContext = 'global';
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

window.canUserChat = async function() {
    // 1. Controllo Override Admin (Sempre prioritario)
    try {
        const overrideSnap = await db.ref(`users/${window.myId}/chatEnabledOverride`).once('value');
        if (overrideSnap.val() === true) return true;
    } catch(e) { console.error("Chat Auth Logic Error:", e); }

    // 2. XP Gate o Corso Attivo
    // Rimuoviamo l'obbligo dello username telegram per permettere a tutti di partecipare
    // basandoci sulla progressione o l'impegno nel corso.

    const level = window.userProgression?.level || 1;
    const isStudent = window.courseData && window.courseData.active_plan === true;

    if (level < 2 && !isStudent) {
        showToast(currentLang === 'it' ? "🚀 Raggiungi il Livello 2 (o iscriviti al Corso) per scrivere!" : "🚀 Reach Level 2 (or enroll in the Course) to chat!");
        return false;
    }
    return true;
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

window.setupChat = function(ref, containerId, limit = 50) {
    if (!els[containerId] || !ref) return;

    if (!listeners.activeChat) listeners.activeChat = {};

    // Spegniamo il listener precedente per questo specifico container UI
    if (listeners.activeChat[containerId]) {
        listeners.activeChat[containerId].ref.off('value', listeners.activeChat[containerId].callback);
        delete listeners.activeChat[containerId];
    }

    const callback = snap => {
        const container = els[containerId];
        if (!container) return;
        const shouldScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;

        container.innerHTML = '';
        const messages = [];

        snap.forEach(child => {
            const m = child.val();
            if (m && typeof m === 'object') {
                messages.push({ id: child.key, ...m });
            }
        });

        if (messages.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; margin-top:20px;">Nessun messaggio.</p>';
            return;
        }

        messages.forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            if (m.name === window.myName) div.classList.add('chat-msg-own');
            div.style.marginBottom = '6px';

            const header = document.createElement('div');
            header.style.cssText = "display:flex; justify-content:space-between; font-size:0.75em; opacity:0.7; margin-bottom:2px;";

            const timeStr = new Date(m.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const nameSpan = document.createElement('b');
            nameSpan.textContent = m.name;

            // PRIVACY: I nomi in chat non sono più link cliccabili a profili Telegram esterni
            // Il collegamento è rimosso per tutti per massima sicurezza e semplicità.

            const timeSpan = document.createElement('span');
            timeSpan.textContent = timeStr;

            header.appendChild(nameSpan);
            header.appendChild(timeSpan);

            // TASTO ELIMINA (Solo per i propri messaggi)
            if (m.senderId === window.myId) {
                const delBtn = document.createElement('span');
                delBtn.innerHTML = " 🗑️";
                delBtn.style.cursor = 'pointer';
                delBtn.style.marginLeft = '5px';
                delBtn.onclick = () => {
                    if (confirm(currentLang === 'it' ? "Eliminare il messaggio?" : "Delete message?")) {
                        ref.child(m.id).remove().catch(e => console.error("Delete Error:", e));
                    }
                };
                header.appendChild(delBtn);
            }

            div.appendChild(header);

            const textSpan = document.createElement('div');
            textSpan.style.wordBreak = 'break-word';

            const isCwActive = localStorage.getItem('cwgame_chat_cw_enabled') === 'true';
            if (isCwActive) {
                textSpan.className = 'cw-spoiler';
                textSpan.textContent = m.text;
                textSpan.title = "Clicca per svelare il testo";
                textSpan.onclick = function() { this.classList.toggle('revealed'); };
            } else {
                textSpan.textContent = m.text;
            }
            div.appendChild(textSpan);
            container.appendChild(div);
        });

        if (shouldScroll) container.scrollTop = container.scrollHeight;
    };

    const finalRef = limit ? ref.limitToLast(limit) : ref;
    finalRef.on('value', callback);
    listeners.activeChat[containerId] = { ref: finalRef, callback: callback };
};

// --- GESTORE NOTIFICHE GLOBALE (SCOLLEGATO DALLA UI) ---
window.initGlobalNotificationListener = function() {
    if (listeners.globalChatNotif) return;

    console.log("Chat: Initializing Global Background Listener...");

    // Usiamo un riferimento pulito e senza limiti iniziali per non perdere messaggi
    const globalRef = db.ref('globalChat');

    // Per evitare la notifica dell'ultimo messaggio già presente all'avvio
    let isFirstAddedEvent = true;

    // Usiamo il timestamp del server per essere precisi se disponibile, altrimenti ora locale
    // Sottraiamo un piccolo margine per sicurezza nel caso di messaggi simultanei allo startup
    let sessionStartTime = Date.now() - 5000;

    listeners.globalChatNotif = globalRef.limitToLast(1).on('child_added', snap => {
        const m = snap.val();
        if (!m || !m.ts) return;

        // 1. Saltiamo l'evento di "aggancio" (l'ultimo messaggio storico)
        if (isFirstAddedEvent) {
            isFirstAddedEvent = false;
            console.log("Chat: Global Listener linked to history. Ready for new messages.");
            return;
        }

        // 2. Filtro di sicurezza temporale (per evitare clock skew)
        // Se il messaggio è troppo vecchio rispetto all'avvio dell'app, lo ignoriamo
        if (m.ts < sessionStartTime) return;

        // 3. Filtro messaggi propri (non vogliamo notifiche per ciò che scriviamo noi)
        if (m.name === window.myName || m.senderId === window.myId) return;

        console.log("Chat: New background message detected from " + m.name);
        window.handleNewChatMessage('globalChat', m, snap.key);
    });

    // Listener per la stanza (se presente)
    setInterval(() => {
        if (roomCode && !listeners.roomChatNotif) {
            console.log("Chat: Adding Background Listener for Room:", roomCode);
            const roomRef = db.ref(`rooms/${roomCode}/chat`).limitToLast(1);
            let roomInitialLoad = true;
            let roomLastTs = Date.now();

            listeners.roomChatNotif = roomRef.on('child_added', rSnap => {
                const rm = rSnap.val();
                if (!rm || !rm.ts) return;
                if (roomInitialLoad || rm.name === myName || rm.ts <= roomLastTs) {
                    if (rm.ts > roomLastTs) roomLastTs = rm.ts;
                    roomInitialLoad = false;
                    return;
                }
                roomLastTs = rm.ts;
                window.handleNewChatMessage(roomCode, rm, rSnap.key);
            });
        } else if (!roomCode && listeners.roomChatNotif) {
            // Pulizia se usciamo dalla stanza
            db.ref().child('rooms').off(); // Spegnimento generico se necessario
            listeners.roomChatNotif = null;
        }
    }, 5000);
};

window.handleNewChatMessage = function(refKey, msg, msgKey) {
    const isGlobal = (refKey === 'globalChat');
    const isPlayingBR = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
    const isCwActive = localStorage.getItem('cwgame_chat_cw_enabled') === 'true';

    // 1. Notifica Visiva (Toast)
    const shouldNotifyUI = (isGlobal
        ? (!isGlobalChatMuted && !gameRunning && !isPlayingBR && (!isChatDrawerOpen || activeChatContext !== 'global'))
        : (!isChatDrawerOpen || refKey !== (activeChatContext === 'room' ? roomCode : myTeamId)));

    if (shouldNotifyUI) {
        const prefix = isGlobal ? "🌎" : "💬";
        if (isCwActive) {
            showToast(`${prefix} ${msg.name}: [📻 Messaggio CW...]`);
        } else {
            showToast(`${prefix} ${msg.name}: ${msg.text.substring(0,25)}...`);
            if (!isGlobalChatMuted && typeof playNotificationSound === 'function') playNotificationSound();
        }
    }

    // 2. Audio CW (Sempre se ON, tranne in partita)
    if (isCwActive && !gameRunning && !isPlayingBR) {
        if (msgKey !== window.lastPlayedCwMsgKey) {
            window.lastPlayedCwMsgKey = msgKey;
            window.enqueueChatCwAudio(msg.text);
        }
    }
};

// --- PRESENZA ONLINE E LISTE UTENTI ---
window.onlineUsersCache = {};

window.refreshOnlineUsersList = function() {
    if (!els.onlineUsersList) return;
    const entries = Object.entries(window.onlineUsersCache);
    console.log(`UI: Refreshing ${entries.length} online users`);
    entries.forEach(([uid, data]) => {
        window.renderOrUpdateUserListItem(uid, data);
    });
};

window.renderOrUpdateUserListItem = function(userId, u) {
    if (!els.onlineUsersList || userId === myId) return;

    // Se l'utente ha attivato la privacy online, lo rimuoviamo se esiste e non lo renderizziamo
    if (u.privacyOnline) {
        window.removeUserListItem(userId);
        delete window.onlineUsersCache[userId];
        return;
    }

    // Aggiorniamo la cache locale per rinfreschi futuri
    window.onlineUsersCache[userId] = u;

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

    const isIChallengingHim = (window.isChallenging && String(window.outgoingChallengeId) === String(userId));
    const isHeChallengingMe = (window.incomingChallengeId && String(window.incomingChallengeId) === String(userId));
    const isPlaying = (u.status === 'playing');
    const canSpectate = (isPlaying && u.allowSpectators && u.activeRoomCode);

    const leftSpan = document.createElement('span');
    leftSpan.style.cssText = "display: flex; flex-direction: column; flex-grow: 1; min-width: 0; padding-right: 10px;";

    const nameB = document.createElement('b');
    nameB.textContent = u.name || "Anonimo";
    nameB.style.cssText = "font-size: 0.95em; color: var(--link-color); text-decoration: underline; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;";
    nameB.onclick = () => window.openTeamInviteModal(userId, u.name);

    leftSpan.appendChild(nameB);

    // LIVELLO E STATO
    const statusRow = document.createElement('div');
    statusRow.style.cssText = "display: flex; gap: 5px; align-items: center;";

    if (u.level) {
        const lvDiv = document.createElement('div');
        lvDiv.style.cssText = "font-size: 0.72em; color: var(--champ-color); font-weight: bold; opacity: 0.9;";
        lvDiv.textContent = `Lv. ${u.level}`;
        statusRow.appendChild(lvDiv);
    }

    // Badge Stato Speciale
    if (isIChallengingHim) {
        const badge = document.createElement('small');
        badge.style.cssText = "font-size: 0.65em; background: #ff9800; color: #fff; padding: 1px 4px; border-radius: 4px; font-weight: bold;";
        badge.textContent = "SFIDATO";
        statusRow.appendChild(badge);
    } else if (isHeChallengingMe) {
        const badge = document.createElement('small');
        badge.style.cssText = "font-size: 0.65em; background: #4caf50; color: #fff; padding: 1px 4px; border-radius: 4px; font-weight: bold; animation: pulse 1s infinite;";
        badge.textContent = "TI SFIDA";
        statusRow.appendChild(badge);
    }

    leftSpan.appendChild(statusRow);

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
    } else if (isIChallengingHim) {
        btn.className = "action-btn-small btn-danger";
        btn.textContent = "Attesa...";
        btn.disabled = true;
    } else if (isHeChallengingMe) {
        btn.className = "action-btn-small btn-success";
        btn.style.animation = "pulse 1.5s infinite";
        btn.textContent = "Accetta!";
        btn.onclick = () => {
            // Se clicca Accetta dalla lista, mostriamo il modale inviti che ha già il tasto Accetta programmato
            if (els.inviteModal) window.listenToInvites();
        };
    } else {
        btn.className = "action-btn-small btn-success";
        if (window.isChallenging) btn.disabled = true; // Non puoi sfidare due persone contemporaneamente
        btn.textContent = 'Sfida';
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
        delete window.onlineUsersCache[snap.key];
        window.removeUserListItem(snap.key);
    });

    listeners.presence = { ref: presenceRef, onAdded, onChanged, onRemoved };
};

// --- MODALI INVITO E SFIDE ---
window.openInviteModal = function(targetId, targetName) {
    window.outgoingChallengeId = targetId;
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
                fromId: window.myId,
                fromName: window.myName,
                fromUsername: window.myPrivacy ? "" : tgUsername,
                type: 'game',
                mode: mode,
                wpm: wpm,
                wordCount: wordCount,
                ts: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                showToast("Sfida inviata a " + targetName + " 🚀");
                window.isChallenging = true;
                window.listenToOutgoingInvite(targetId);
                window.closeInviteModal();
                window.refreshOnlineUsersList();
            }).catch(err => {
                showToast("Errore invio: " + err.message);
            });
        };
    }
};

window.openTeamInviteModal = async function(targetId, targetName) {
    window.outgoingChallengeId = targetId;
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Opzioni Utente: " + targetName;
    if (els.recruitmentStatusText) els.recruitmentStatusText.textContent = "Caricamento stato...";
    if (els.inviteSettings) els.inviteSettings.style.display = 'none';
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'block';
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none';
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none';
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
    if (els.recruitJoinBtn) els.recruitJoinBtn.style.display = 'none';

    // CONTROLLI ADMIN (BOTTONE DIRETTO)
    const enableBtn = document.getElementById('btnAdminEnableChat');

    if (window.isAdmin && enableBtn) {
        enableBtn.style.display = 'block';
        enableBtn.textContent = "Verifica...";

        db.ref(`users/${targetId}/chatEnabledOverride`).once('value', s => {
            const hasOverride = s.val() === true;
            enableBtn.textContent = hasOverride ? "BLOCCA CHAT (Admin) 🔒" : "ABILITA CHAT (Admin) 🔓";
            enableBtn.onclick = () => {
                const nextState = !hasOverride;
                db.ref(`users/${targetId}/chatEnabledOverride`).set(nextState ? true : null).then(() => {
                    showToast(nextState ? "Chat sbloccata per " + targetName : "Blocco ripristinato");
                    window.openTeamInviteModal(targetId, targetName); // Refresh
                });
            };
        });
    } else if (enableBtn) {
        enableBtn.style.display = 'none';
    }

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
                    // Permettiamo il link solo se lo username esiste (non nascosto dalla privacy)
                    if (u && u.username && String(u.username).trim() !== "") {
                        tg.openTelegramLink('https://t.me/' + u.username);
                    } else {
                        tg.showAlert(currentLang === 'it' ? "Questo utente ha scelto di mantenere il profilo privato." : "This user has chosen to keep their profile private.");
                    }
                });
            };
        }
    } catch(e) { console.error("Chat Auth Logic Error:", e); }

    if (els.inviteModal) els.inviteModal.style.display = 'flex';
};

window.sendRecruitmentInvite = function(type) {
    db.ref(`invites/${window.outgoingChallengeId}`).set({
        fromId: myId,
        fromName: myName,
        fromUsername: myPrivacy ? "" : tgUsername,
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
    // RIMOSSO: Il cleanup del listener qui interrompeva il monitoraggio della sfida per il mittente.
    // Il reset completo avviene solo in resetLocalChallengeState().
};

window.resetLocalChallengeState = function() {
    console.log("Challenge: Resetting local state...");
    window.isChallenging = false;
    window.outgoingChallengeId = null;
    window.incomingChallengeId = null;
    window.lastIncomingInvite = null;

    if (listeners.outgoingInvite) {
        if (listeners.outgoingInvite.ref) listeners.outgoingInvite.ref.off('value', listeners.outgoingInvite.callback);
        listeners.outgoingInvite = null;
    }

    // Rinfresca la UI immediatamente e con un piccolo ritardo per sicurezza
    window.refreshOnlineUsersList();
    setTimeout(window.refreshOnlineUsersList, 500);
};

window.listenToInviteAccepted = function() {
    if (!myId) return;
    db.ref(`invite_accepted/${myId}`).on('value', snap => {
        const data = snap.val();
        if (data && data.roomCode) {
            console.log("Challenge: Accepted! Joining room:", data.roomCode);
            db.ref(`invite_accepted/${myId}`).remove();

            // Prima di entrare resettiamo lo stato di sfida locale
            window.resetLocalChallengeState();

            roomCode = data.roomCode;
            if (typeof window.joinRoomLogic === 'function') {
                window.joinRoomLogic(false);
            }
        }
    });
};

window.listenToOutgoingInvite = function(targetId) {
    const sTargetId = String(targetId);
    console.log("Challenge: Monitoring outgoing invite to:", sTargetId);

    if (listeners.outgoingInvite) {
        if (listeners.outgoingInvite.ref) listeners.outgoingInvite.ref.off('value', listeners.outgoingInvite.callback);
    }

    const inviteRef = db.ref(`invites/${sTargetId}`);
    const callback = inviteRef.on('value', snap => {
        const exists = snap.exists();
        const currentTarget = String(window.outgoingChallengeId);

        console.log(`TX: Invite update. Target: ${sTargetId}, GlobalTarget: ${currentTarget}, Exists: ${exists}, isChallenging: ${window.isChallenging}`);

        // Se l'invito sparisce dal DB e noi lo stiamo ancora aspettando (non siamo entrati in partita)
        if (!exists && window.isChallenging && currentTarget === sTargetId) {

            // Verifichiamo se non siamo in una stanza (per distinguere Rifiuto da Accettazione)
            setTimeout(() => {
                const amIInRoom = (typeof window.roomCode !== 'undefined' && window.roomCode && window.roomCode !== "");
                console.log(`TX: Re-checking state. InRoom: ${amIInRoom}, isChallenging: ${window.isChallenging}`);

                if (window.isChallenging && String(window.outgoingChallengeId) === sTargetId && !amIInRoom) {
                    console.log("Challenge: Definitely refused by target.");
                    const msg = currentLang === 'it' ? "La sfida è stata rifiutata o è scaduta." : "Challenge declined or expired.";

                    try {
                        if (window.tg && typeof window.tg.showAlert === 'function') {
                            window.tg.showAlert(msg);
                        } else {
                            alert(msg);
                        }
                    } catch(e) { console.error("Alert error:", e); }

                    showToast(msg);
                    window.resetLocalChallengeState();
                }
            }, 500);
        }
    });
    listeners.outgoingInvite = { target: sTargetId, ref: inviteRef, callback: callback };
};

window.listenToInvites = function() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val();

        // Aggiorniamo l'invito globale per la lista utenti (Badge "TI SFIDA")
        window.lastIncomingInvite = inv;
        window.incomingChallengeId = inv ? inv.fromId : null;
        window.refreshOnlineUsersList();

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
                    // Evitiamo click multipli
                    if (els.acceptInviteBtn.disabled) return;
                    els.acceptInviteBtn.disabled = true;
                    els.acceptInviteBtn.textContent = "⌛ Avvio...";

                    const roomCodeNew = Math.floor(1000 + Math.random() * 9000).toString();
                    const words = window.getGameWords(inv.wordCount || 10, inv.mode || 'standard');
                    const isCoop = (inv.mode === 'conquest');

                    const roomData = {
                        status: 'countdown',
                        type: isCoop ? 'coop' : 'multi',
                        mode: inv.mode || 'standard',
                        wpm: inv.wpm || 20,
                        tone: 600,
                        wordCount: inv.wordCount || 10,
                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                        hostId: inv.fromId,
                        game_words: words // Inseriamo le parole atomicamente per evitare race conditions
                    };

                    db.ref(`rooms/${roomCodeNew}`).set(roomData).then(() => {
                        db.ref(`invite_accepted/${inv.fromId}`).set({
                            roomCode: roomCodeNew,
                            ts: firebase.database.ServerValue.TIMESTAMP
                        });
                        db.ref(`invites/${myId}`).remove();
                        window.resetLocalChallengeState();
                        window.closeInviteModal();

                        // Reset bottone per futuro uso
                        els.acceptInviteBtn.disabled = false;
                        els.acceptInviteBtn.textContent = "ACCETTA ✅";

                        roomCode = roomCodeNew;
                        window.joinRoomLogic(false);
                    }).catch(err => {
                        console.error("Accept Invite Error:", err);
                        els.acceptInviteBtn.disabled = false;
                        els.acceptInviteBtn.textContent = "ACCETTA ✅";
                        showToast("Errore durante l'accettazione.");
                    });
                };
            }

            if (els.declineInviteBtn) {
                els.declineInviteBtn.onclick = () => {
                    db.ref(`invites/${myId}`).remove();
                    window.resetLocalChallengeState();
                    window.closeInviteModal();
                };
            }
        }

        if (els.inviteModal) els.inviteModal.style.display = 'flex';
        window.incomingChallengeId = inv.fromId;
        window.lastIncomingInvite = inv;
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

    // Se leggiamo da public_lobby_rooms non abbiamo .players, usiamo .pCount
    const pCount = (room.players ? Object.keys(room.players).length : 0) || (room.pCount || 1);
    const prevCount = window.lastKnownRoomPlayersCount[code] || 1;
    const isMyRoom = (room.hostId === myId);

    const isOutsideRoom = (roomCode !== code || (els.lobbyScreen && !els.lobbyScreen.classList.contains('active-screen')));

    if (isMyRoom && pCount > prevCount && pCount >= 2) {
        // Notifica secondaria via Toast se siamo nel menu
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

    // --- FIX: Usiamo public_lobby_rooms per la bacheca (più leggero e affidabile) ---
    const lobbyQuery = db.ref('public_lobby_rooms').orderByChild('status').equalTo('waiting').limitToLast(20);

    const onAdded = lobbyQuery.on('child_added', snap => {
        const room = snap.val();
        // Le stanze in public_lobby_rooms sono già filtrate per validità
        window.addOrUpdateRoomCard(snap.key, room);
    });
    const onChanged = lobbyQuery.on('child_changed', snap => window.addOrUpdateRoomCard(snap.key, snap.val()));
    const onRemoved = lobbyQuery.on('child_removed', snap => window.removeRoomCard(snap.key));

    listeners.roomsList = { ref: lobbyQuery, onAdded, onChanged, onRemoved };
};
