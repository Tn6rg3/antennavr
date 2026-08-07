// ============================================================================
// MAIN.JS - CORE DELLA PARTITA E BRIDGE HTML
// ============================================================================

import { appState, gameState, uiState, STORAGE_KEYS, fisherYatesShuffle } from './state.js';
import { els, showScreen, showToast, loadRegolamento, loadDictionaries, updateMuteBtnUI, escapeHTML } from './ui.js';
import { playMorseAudio, stopAllMorseAudio, playBeep } from './audio.js';
import { hideChat } from './chat.js';
import { listenToRooms, joinSpecificRoom, joinRoomLogic, exitRoomCleanly } from './lobby.js';
import { startQuizSequence, submitQuizAnswer } from './quiz.js';
import { checkMyTeamStatus, switchTeamTab, joinTeam } from './teams.js';
import { switchActTab, updateActivity } from './leaderboard.js';
import { listenToTournaments, viewTournament, toggleTrnSlot, startTrnMatch } from './tournaments.js';

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;

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
    if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
    appState.db = window.firebase.database(); 
    appState.auth = window.firebase.auth();

    loadDictionaries();
    loadRegolamento();

    appState.auth.signInAnonymously().then(async () => {
        try {
            const userRef = appState.db.ref(`users/${appState.myId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val() || {};

            if (userData.alias) appState.myName = userData.alias;
            appState.myPrivacy = userData.privacyUsername || false; 
            if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = appState.myPrivacy;

            if (!userSnap.exists() || !userData.welcomed) {
                await userRef.update({ name: appState.myName, welcomed: true, createdAt: window.firebase.database.ServerValue.TIMESTAMP });
                if (els.welcomeNewUserModal) {
                    els.welcomeNewUserModal.style.display = 'flex';
                    const btnClose = document.getElementById('btnCloseWelcomeModal');
                    if (btnClose) btnClose.onclick = () => els.welcomeNewUserModal.style.display = 'none';
                }
            }
        } catch(e) {}

        if (els.playerName) els.playerName.textContent = appState.myName; 
        if (els.loadingText) els.loadingText.style.display = 'none'; 
        if (els.createRoomBtn) els.createRoomBtn.disabled = false;

        appState.db.ref('.info/connected').on('value', (snap) => {
            if (snap.val() === false) return;
            const pRef = appState.db.ref(`presence/${appState.myId}`);
            pRef.onDisconnect().remove();
            pRef.set({ name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername, status: 'online', ts: window.firebase.database.ServerValue.TIMESTAMP });
        });

        showScreen('setupScreen');
        listenToRooms();
    });
}

// --- LOGICA GAMELOOP PRINCIPALE E WORD SUBMISSION ---
function handleWordSubmission(userWord) {
    if (!userWord) return;
    userWord = userWord.substring(0, 50).trim().toUpperCase();

    // RAMO CONQUISTA CO-OP
    if (gameState.mode === 'conquest') {
        if (gameState.coopActiveFreqIndex === 0) return showToast("⚠️ Seleziona prima una Frequenza!");
        const currentWord = gameState.words[0];
        const isCorrect = userWord === currentWord;
        const gain = gameState.coopActiveFreqIndex === 1 ? 4 : (gameState.coopActiveFreqIndex === 2 ? 7 : 12);
        const penalty = gameState.coopActiveFreqIndex === 1 ? 2 : (gameState.coopActiveFreqIndex === 2 ? 3 : 5);
        gameState.inputActive = false;

        if (isCorrect) {
            gameState.wpm += 2;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}`;
            showToast(`✅ CORRETTO! +${gain}% (Velocità -> ${gameState.wpm} WPM)`);
            playBeep(880, 0.1);
            appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.min(100, (state.progress || 0) + gain);
                return state;
            });
        } else {
            gameState.wpm = Math.max(10, gameState.wpm - 2);
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}`;
            showToast(`❌ ERRORE! -${penalty}% (Velocità -> ${gameState.wpm} WPM)`);
            playBeep(300, 0.25);
            appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.max(0, (state.progress || 0) - penalty);
                return state;
            });
        }
        setTimeout(() => {
            if (!gameState.running) return;
            if (els.permanentGameInput) { els.permanentGameInput.value = ""; els.permanentGameInput.focus(); }
            gameState.inputActive = true; 
            if (!isCorrect && gameState.words[0]) playMorseAudio(gameState.words[0], gameState.wpm);
        }, 1500);
        return;
    }

    // RAMO STANDARD / PAROLE
    gameState.inputActive = false; 
    const currentWord = gameState.words[gameState.wordIndex].toUpperCase(); 
    const reactionMs = Date.now() - gameState.lastWordStartTime; 
    const isCorrect = (userWord === currentWord);
    const points = isCorrect ? Math.round(100 + gameState.wpm * 2) : 0;
    const scoreColor = isCorrect ? "#4caf50" : "#d32f2f";

    if (isCorrect && !gameState.isFixedSpeed) gameState.wpm += 2;
    else if (!isCorrect && !gameState.isFixedSpeed) gameState.wpm = Math.max(10, gameState.wpm - 2);

    gameState.totalScore += points; 
    gameState.matchDetails.push({ real: currentWord, typed: userWord, points: points, wpm: gameState.wpm, ms: reactionMs });

    if (els.tableBody) {
        const tr = document.createElement('tr');
        const tdTyped = document.createElement('td'); tdTyped.textContent = userWord;
        const tdReal = document.createElement('td'); tdReal.innerHTML = `<b>${escapeHTML(currentWord)}</b>`;
        const tdPoints = document.createElement('td'); tdPoints.style.color = scoreColor; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        els.tableBody.appendChild(tr);
        if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
    }
    
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}${gameState.isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${gameState.totalScore}`;
    if (gameState.roomCode) appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).update({ score: gameState.totalScore, wpm: gameState.wpm, wordIndex: gameState.wordIndex + 1 });
    
    gameState.wordIndex++; 
    setTimeout(playNextWord, 600);
}

window.playNextWord = function() {
    if (!gameState.running || gameState.mode === 'pingpong') return; 
    if (gameState.wordIndex >= gameState.wordCount) return finishGame();
    gameState.inputActive = true; 
    const currentWord = gameState.words[gameState.wordIndex].toUpperCase();
    playMorseAudio(currentWord, gameState.wpm); 
    gameState.lastWordStartTime = Date.now(); 
    if (els.permanentGameInput) els.permanentGameInput.focus();
};

window.finishGame = function() {
    gameState.running = false; 
    gameState.inputActive = false; 
    showScreen('leaderboardScreen');
    if (gameState.roomCode) { 
        appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).update({ finished: true, score: gameState.totalScore }); 
    }
    updateActivity(gameState.totalScore > 0);
};

if (els.permanentGameInput) {
    els.permanentGameInput.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter' && gameState.inputActive && gameState.running) { 
            const val = els.permanentGameInput.value.trim().toUpperCase(); 
            if (val) { handleWordSubmission(val); els.permanentGameInput.value = ""; } 
        } 
    });
}

// --- GESTIONE SCHERMO STANDBY ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (gameState.running && gameState.inputActive) {
            uiState.lostFocusDuringWord = true;
            stopAllMorseAudio();
        }
    } else {
        if (gameState.running && uiState.lostFocusDuringWord) {
            uiState.lostFocusDuringWord = false;
            gameState.inputActive = false;
            showToast("⚠️ Schermo spento: parola considerata persa!");
            if (gameState.mode === 'quiz') {
                submitQuizAnswer(-1);
            } else {
                gameState.wpm = Math.max(10, gameState.wpm - 2);
                if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}`;
                gameState.wordIndex++;
                setTimeout(() => { if (gameState.running) window.playNextWord(); }, 800);
            }
        }
    }
});

// --- BRIDGE PER I PULSANTI HTML (EXPORTS A WINDOW) ---
window.toggleLanguage = () => { appState.currentLang = (appState.currentLang === 'it') ? 'en' : 'it'; showToast("Language changed"); };
window.goBackToMenu = () => showScreen('setupScreen');
window.joinSpecificRoom = joinSpecificRoom;
window.switchTeamTab = switchTeamTab;
window.joinTeam = joinTeam;
window.switchActTab = switchActTab;
window.toggleTrnSlot = toggleTrnSlot;
window.startTrnMatch = startTrnMatch;
window.viewTournament = viewTournament;

if (tgUser) { 
    appState.myName = tgUser.first_name; 
    appState.myId = tgUser.id.toString(); 
    appState.tgUsername = tgUser.username || "";
    initGame(); 
}
