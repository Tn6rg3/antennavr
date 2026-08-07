// ============================================================================
// CHAT.JS - CHAT GLOBALE, DI STANZA E RIPRODUZIONE CW
// ============================================================================

import { appState, gameState, chatState, uiState, listeners, STORAGE_KEYS } from './state.js';
import { els, showToast, updateMuteBtnUI } from './ui.js';
import { playMorseAudio, playNotificationSound } from './audio.js';

export function hideChat() {
    if (els.chatDrawer) els.chatDrawer.style.display = 'none'; 
    chatState.isDrawerOpen = false;
    chatState.audioQueue = [];
    Object.keys(listeners.activeChat).forEach(key => { 
        if (listeners.activeChat[key] && listeners.activeChat[key].ref) {
            listeners.activeChat[key].ref.off('value', listeners.activeChat[key].callback); 
        }
        delete listeners.activeChat[key]; 
    });
}

export function enqueueChatCwAudio(text) {
    if (!text || !chatState.cwEnabled) return;
    if (chatState.audioQueue.length < 10) {
        chatState.audioQueue.push(text.toUpperCase());
        processChatCwQueue();
    }
}

async function processChatCwQueue() {
    if (chatState.isPlaying || chatState.audioQueue.length === 0) return;
    chatState.isPlaying = true;
    while (chatState.audioQueue.length > 0 && chatState.cwEnabled) {
        const nextText = chatState.audioQueue.shift();
        const savedTone = gameState.tone;
        gameState.tone = chatState.cwTone;
        try {
            await playMorseAudio(nextText, chatState.cwWpm, true);
        } catch (e) {
            console.error("Errore audio CW in chat:", e);
        } finally {
            gameState.tone = savedTone;
        }
        if (chatState.audioQueue.length > 0 && chatState.cwEnabled) {
            await new Promise(r => setTimeout(r, 600));
        }
    }
    chatState.isPlaying = false;
}

export function setupChat(chatRef, containerId, alertBtnId) {
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
            if (chatState.cwEnabled) {
                textSpan.className = 'cw-spoiler';
                textSpan.textContent = msg.text;
                textSpan.title = "Clicca per svelare il testo";
                textSpan.onclick = function() { this.classList.toggle('revealed'); };
            } else {
                textSpan.textContent = msg.text;
            }
            div.appendChild(textSpan);
            
            container.appendChild(div);
            if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== appState.myName) { 
                newMsgsCount++; 
                latestMsg = msg; 
                latestMsgKey = child.key;
            }
        });
        
        lastTs = maxTs; 
        container.scrollTop = container.scrollHeight;
        
        if (!initialLoad && newMsgsCount > 0 && latestMsg) {
            if (alertBtnId && !chatState.isDrawerOpen && els[alertBtnId]) {
                els[alertBtnId].style.backgroundColor = '#4caf50';
            }

            const isGlobal = (chatRef.key === 'globalChat');
            const shouldNotify = isGlobal
                ? (!chatState.isMuted && !gameState.running && (!chatState.isDrawerOpen || chatState.activeContext !== 'global'))
                : (!chatState.isDrawerOpen || chatRef.key !== (chatState.activeContext === 'room' ? gameState.roomCode : appState.myTeamId));

            if (chatState.cwEnabled) {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: [📻 Messaggio CW...]`);
                }
                if (!gameState.running && (shouldNotify || (chatState.isDrawerOpen && chatState.activeContext === (isGlobal ? 'global' : 'room')))) {
                    if (latestMsgKey && latestMsgKey !== chatState.lastPlayedMsgKey) {
                        chatState.lastPlayedMsgKey = latestMsgKey;
                        enqueueChatCwAudio(latestMsg.text);
                    }
                }
            } else {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
                    if (!chatState.isMuted) playNotificationSound();
                }
            }
        }
        initialLoad = false;
    });
    listeners.activeChat[containerId] = { ref: chatRef, callback: callback };
}

export function initChatListeners() {
    if (els.sendLobbyChatBtn) {
        els.sendLobbyChatBtn.onclick = function() {
            const txt = els.lobbyChatInput ? els.lobbyChatInput.value.trim() : ""; 
            if (!txt || !gameState.roomCode) return;
            const msgRef = appState.db.ref(`rooms/${gameState.roomCode}/chat`).push(); 
            msgRef.onDisconnect().remove();
            msgRef.set({ name: appState.myName, text: txt, ts: window.firebase.database.ServerValue.TIMESTAMP }); 
            if (els.lobbyChatInput) els.lobbyChatInput.value = '';
        };
    }

    if (els.sendChatBtn) {
        els.sendChatBtn.onclick = function() {
            const txt = els.chatInput ? els.chatInput.value.trim() : ""; 
            if (!txt) return;
            let msgRef = (chatState.activeContext === 'room' && gameState.roomCode) 
                ? appState.db.ref(`rooms/${gameState.roomCode}/chat`).push() 
                : appState.db.ref('globalChat').push();
            msgRef.set({ name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername, text: txt, ts: window.firebase.database.ServerValue.TIMESTAMP }); 
            if (els.chatInput) els.chatInput.value = '';
        };
    }

    if (els.clearChatBtn) {
        els.clearChatBtn.onclick = function() { 
            if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) { 
                if (chatState.activeContext === 'room' && gameState.roomCode) {
                    appState.db.ref(`rooms/${gameState.roomCode}/chat`).remove(); 
                } else if (chatState.activeContext === 'team' && appState.myTeamId) {
                    appState.db.ref(`teams/${appState.myTeamId}/chat`).remove();
                } else {
                    appState.db.ref('globalChat').remove(); 
                }
                showToast("Chat cancellata per tutti.");
            } 
        };
    }

    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.onclick = function() {
            chatState.isMuted = !chatState.isMuted;
            localStorage.setItem(STORAGE_KEYS.CHAT_MUTED, chatState.isMuted);
            updateMuteBtnUI();
            showToast(chatState.isMuted ? "Notifiche Chat silenziate." : "Notifiche Chat riattivate.");
        };
    }
}
