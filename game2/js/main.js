// ============================================================================
// MAIN.JS - AVVIO DELL'APPLICAZIONE E CONNESSIONE TRA I MODULI
// ============================================================================

import { appState, gameState, uiState } from './state.js';
import { els, showScreen, showToast, loadRegolamento, loadDictionaries, updateMuteBtnUI } from './ui.js';
import { stopAllMorseAudio } from './audio.js';
import { initChatListeners, listenToChat, toggleChat } from './chat.js';
import { listenToRooms, joinSpecificRoom, joinRoomLogic, exitRoomCleanly } from './lobby.js';
import { initQuizListeners, submitQuizAnswer } from './quiz.js';
import { checkMyTeamStatus, switchTeamTab, joinTeam, initTeamListeners } from './teams.js';
import { switchActTab, showLeaderboardTab, showProfileScreen, syncUserNameEverywhere } from './leaderboard.js';
import { listenToTournaments, viewTournament, toggleTrnSlot, startTrnMatch } from './tournaments.js';
import { handleWordSubmission, playNextWord, startCountdownSequence, resumeGameSequence, finishGame, initBattleRoyaleScheduler, toggleBattleRoyaleJoin, submitBRAnswer } from './game.js';

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
    initChatListeners();
    initQuizListeners();
    initTeamListeners();
    initBattleRoyaleScheduler();

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

// --- GESTIONE SPEGNIMENTO SCHERMO DURANTE IL GIOCO ---
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
                setTimeout(() => { if (gameState.running) playNextWord(); }, 800);
            }
        }
    }
});

// --- LISTENER PER LA BATTAGLIA REALE ---
if (els.brInput) {
    els.brInput.addEventListener('keypress', e => { if (e.key === 'Enter' && els.btnSendBr) els.btnSendBr.click(); });
}
if (els.btnSendBr) {
    els.btnSendBr.addEventListener('click', () => {
        appState.db.ref(`rooms/${gameState.brRoomCode}/currentWord`).once('value', s => submitBRAnswer(s.val(), false));
    });
}

// --- BRIDGE PER L'HTML (ESPOSIZIONE WINDOW) ---
window.toggleLanguage = () => { appState.currentLang = (appState.currentLang === 'it') ? 'en' : 'it'; showToast("Lingua cambiata"); };
window.goBackToMenu = () => showScreen('setupScreen');
window.openGlobalChat = () => { listenToChat(); toggleChat(); };
window.joinSpecificRoom = joinSpecificRoom;
window.switchTeamTab = switchTeamTab;
window.joinTeam = joinTeam;
window.switchActTab = switchActTab;
window.showLeaderboardTab = showLeaderboardTab;
window.showProfileScreen = showProfileScreen;
window.toggleTrnSlot = toggleTrnSlot;
window.startTrnMatch = startTrnMatch;
window.viewTournament = viewTournament;
window.toggleBattleRoyaleJoin = toggleBattleRoyaleJoin;
window.startCountdownSequence = startCountdownSequence;
window.resumeGameSequence = resumeGameSequence;
window.finishGame = finishGame;
window.playNextWord = playNextWord;

// --- AVVIO DELL'APP ---
if (tgUser) { 
    appState.myName = tgUser.first_name; 
    appState.myId = tgUser.id.toString(); 
    appState.tgUsername = tgUser.username || "";
    initGame(); 
} else {
    if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen'); 
    if (els.errorScreen) els.errorScreen.classList.add('active-screen');
}
