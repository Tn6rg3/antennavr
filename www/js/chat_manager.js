// --- CHAT GLOBALE E DI STANZA ---
function hideChat() {
    if (els.chatDrawer) els.chatDrawer.style.display = 'none';
    isChatDrawerOpen = false;
    chatCwAudioQueue = [];
    Object.keys(listeners.activeChat).forEach(key => {
        if (listeners.activeChat[key] && listeners.activeChat[key].ref) {
            listeners.activeChat[key].ref.off('value', listeners.activeChat[key].callback);
        }
        delete listeners.activeChat[key];
    });
}

function listenToChat() {
    if (activeChatContext === 'room' && roomCode) {
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null);
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "ðŸ’¬ Chat Stanza";
        if (els.gameArea && els.gameArea.classList.contains('active-screen')) {
            els.chatDrawer.style.display = 'none';
            isChatDrawerOpen = false;
        }
    } else {
        setupChat(db.ref('globalChat'), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "ðŸŒŽ Chat Globale";
    }
}

window.openGlobalChat = function() {
    activeChatContext = 'global';
    listenToChat();
    toggleChat();
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

function enqueueChatCwAudio(text) {
    if (!text || !isChatCwEnabled) return;
    if (chatCwAudioQueue.length < 10) {
        chatCwAudioQueue.push(text.toUpperCase());
        processChatCwQueue();
    }
}

async function processChatCwQueue() {
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
}



// ============================================================================
// MODULO CHAT UNIFICATO (SETUP + INVIO MESSAGGI + FIX AUDIO DOPPIO)
// ============================================================================

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

            // Controllo sicuro anti-crash per capire se il gioco o la BR sono attivi
            const isPlayingBR = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
            const isGlobal = (chatRef.key === 'globalChat');
            const shouldNotify = isGlobal
                ? (!isGlobalChatMuted && !gameRunning && !isPlayingBR && (!isChatDrawerOpen || activeChatContext !== 'global'))
                : (!isChatDrawerOpen || chatRef.key !== (activeChatContext === 'room' ? roomCode : myTeamId));

            if (isChatCwEnabled) {
                if (shouldNotify) {
                    const prefix = isGlobal ? "ðŸŒŽ" : "ðŸ’¬";
                    showToast(`${prefix} ${latestMsg.name}: [ðŸ“» Messaggio CW...]`);
                }
                if (!gameRunning && !isPlayingBR && (shouldNotify || (isChatDrawerOpen && activeChatContext === (isGlobal ? 'global' : 'room')))) {
                    if (latestMsgKey && latestMsgKey !== window.lastPlayedCwMsgKey) {
                        window.lastPlayedCwMsgKey = latestMsgKey;
                        enqueueChatCwAudio(latestMsg.text);
                    }
                }
            } else {
                if (shouldNotify) {
                    const prefix = isGlobal ? "ðŸŒŽ" : "ðŸ’¬";
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
}

// --- LISTENER PER INVIO MESSAGGI CHAT LOBBY ---
if (els.sendLobbyChatBtn) {
    els.sendLobbyChatBtn.onclick = function() {
        const txt = els.lobbyChatInput ? els.lobbyChatInput.value.trim() : "";
        if (!txt || !roomCode) return;
        const msgRef = db.ref(`rooms/${roomCode}/chat`).push();
        msgRef.onDisconnect().remove();
        msgRef.set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        if (els.lobbyChatInput) els.lobbyChatInput.value = '';
    };
}

if (els.lobbyChatInput) {
    els.lobbyChatInput.onkeypress = function(e) {
        if (e.key === 'Enter' && els.sendLobbyChatBtn) els.sendLobbyChatBtn.click();
    };
}

// --- LISTENER PER INVIO MESSAGGI CHAT GLOBALE / STANZA ---
if (els.sendChatBtn) {
    els.sendChatBtn.onclick = function() {
        const txt = els.chatInput ? els.chatInput.value.trim() : "";
        if (!txt) return;
        let msgRef = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
        msgRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP })
            .catch(e => showToast("Errore invio: " + e.message));
        if (els.chatInput) els.chatInput.value = '';
    };
}

if (els.chatInput) {
    els.chatInput.onkeypress = function(e) {
        if (e.key === 'Enter' && els.sendChatBtn) els.sendChatBtn.click();
    };
}

// --- PULSANTI CANCELLA CHAT E MUTO ---
if (els.clearChatBtn) {
    els.clearChatBtn.onclick = function() {
        if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) {
            if (activeChatContext === 'room' && roomCode) {
                db.ref(`rooms/${roomCode}/chat`).remove();
            } else if (activeChatContext === 'team' && myTeamId) {
                db.ref(`teams/${myTeamId}/chat`).remove();
            } else {
                db.ref('globalChat').remove();
            }
            showToast("Chat cancellata per tutti.");
        }
    };
}

if (els.muteGlobalChatBtn) {
    els.muteGlobalChatBtn.onclick = function() {
        isGlobalChatMuted = !isGlobalChatMuted;
        localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted);
        if (typeof updateMuteBtnUI === 'function') updateMuteBtnUI();
        showToast(isGlobalChatMuted ? (currentLang==='it'?"Notifiche Chat silenziate.":"Chat notifications muted.") : (currentLang==='it'?"Notifiche Chat riattivate.":"Chat notifications unmuted."));
    };
}


