// ============================================================================
// LOBBY.JS - STANZE DI ATTESA, INVITI E PRESENZA
// ============================================================================

import { appState, gameState, uiState, listeners, STORAGE_KEYS } from './state.js';
import { els, showScreen, showToast, escapeHTML } from './ui.js';
import { hideChat } from './chat.js';
import { stopAllMorseAudio } from './audio.js';

window.lastKnownRoomPlayersCount = window.lastKnownRoomPlayersCount || {};

export function addOrUpdateRoomCard(code, room) {
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
    const span = document.createElement('span');
    const bTitle = document.createElement('b'); bTitle.textContent = `#${code} - ${modeIcon}`;
    const smallInfo = document.createElement('small'); smallInfo.textContent = `${pCount} Gioc. | ${room.wpm} WPM`;
    span.appendChild(bTitle); span.appendChild(document.createElement('br')); span.appendChild(smallInfo);
    li.appendChild(span);

    const btn = document.createElement('button'); btn.className = 'action-btn-small'; btn.textContent = 'Entra'; 
    btn.onclick = () => joinSpecificRoom(code); 
    li.appendChild(btn);
}

export function removeRoomCard(code) {
    if (!els.waitingRoomsList) return;
    const li = document.getElementById(`room_list_item_${code}`);
    if (li) li.remove();
    if (els.waitingRoomsList.children.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-rooms-msg';
        emptyLi.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;";
        emptyLi.textContent = "Nessuna sfida.";
        els.waitingRoomsList.appendChild(emptyLi);
    }
}

export function listenToRooms() {
    if (listeners.roomsList && listeners.roomsList.ref) {
        listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
        listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
        listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
    }
    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    const lobbyQuery = appState.db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);
    const onAdded = lobbyQuery.on('child_added', snap => addOrUpdateRoomCard(snap.key, snap.val()));
    const onChanged = lobbyQuery.on('child_changed', snap => addOrUpdateRoomCard(snap.key, snap.val()));
    const onRemoved = lobbyQuery.on('child_removed', snap => removeRoomCard(snap.key));
    listeners.roomsList = { ref: lobbyQuery, onAdded, onChanged, onRemoved };
}

export function joinSpecificRoom(code) { 
    gameState.roomCode = code; 
    joinRoomLogic(false); 
}

export function joinRoomLogic(isReconnect = false) {
    gameState.running = false; 
    const playerRef = appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) { 
            showScreen('leaderboardScreen'); 
            localStorage.removeItem(STORAGE_KEYS.ROOM); 
            return; 
        }
        showScreen('lobbyScreen'); 
        if (els.lobbyTitleText) els.lobbyTitleText.textContent = gameState.roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera"; 
        playerRef.onDisconnect().update({ online: false }); 
        
        if (!pData) {
            playerRef.set({ 
                name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername, score: 0, wpm: 0, finished: false, teamId: appState.myTeamId, ready: false, online: true 
            });
        } else {
            playerRef.update({ online: true, name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername });
        }
        
        if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = appState.db.ref(`rooms/${gameState.roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return exitRoomCleanly(true); 
            const rData = snap.val(); 
            gameState.mode = rData.mode; 
            gameState.wordCount = rData.wordCount; 
            gameState.isSinglePlayer = rData.type === 'single'; 
            gameState.isFixedSpeed = rData.fixedSpeed || false; 
            gameState.roomHostId = rData.hostId;
            
            if (rData.status === 'playing' && !gameState.running && window.resumeGameSequence) { 
                gameState.wpm = rData.wpm; gameState.baseWpm = rData.wpm; gameState.tone = rData.tone; 
                if (rData.words) gameState.words = rData.words; 
                return window.resumeGameSequence(); 
            }
            if (rData.status === 'countdown' && !gameState.running && window.startCountdownSequence) { 
                gameState.wpm = rData.wpm; gameState.baseWpm = rData.wpm; gameState.tone = rData.tone; 
                if (rData.words) gameState.words = rData.words; 
                return window.startCountdownSequence(); 
            }
        });
    });
}

export function exitRoomCleanly(roomWasDeletedByHost = false, isExplicitQuit = false) {
    stopAllMorseAudio();
    let targetScreen = 'setupScreen'; 
    const amIHost = (appState.myId === gameState.roomHostId); 

    if (listeners.players && gameState.roomCode) { appState.db.ref(`rooms/${gameState.roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (gameState.roomCode) { appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).off(); }
    
    gameState.isCoopMode = false;
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    if (gameState.roomCode) {
        if (gameState.roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        localStorage.removeItem(STORAGE_KEYS.ROOM);

        if (roomWasDeletedByHost) {
            if (amIHost && !gameState.roomCode.startsWith("TRN_")) {
                appState.db.ref(`rooms/${gameState.roomCode}`).remove();
                appState.db.ref(`public_lobby_rooms/${gameState.roomCode}`).remove();
            } else {
                appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).onDisconnect().cancel();
                appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).remove();
            }
            gameState.roomCode = "";
        } else if (isExplicitQuit) {
            appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).onDisconnect().cancel();
            appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).remove();
            gameState.roomCode = "";
        } else {
            appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).update({ online: false });
        }
    }
    
    appState.db.ref(`presence/${appState.myId}`).update({ allowSpectators: false, activeRoomCode: null, status: 'online' });
    hideChat(); 
    showScreen(targetScreen);
    if (targetScreen === 'setupScreen') listenToRooms();
}
