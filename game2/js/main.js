// ============================================================================
// MAIN.JS - AVVIO DELL'APPLICAZIONE E BRIDGE CON HTML
// ============================================================================

import { appState, gameState, uiState, STORAGE_KEYS } from './state.js';
import { els, showScreen, showToast, loadRegolamento, loadDictionaries } from './ui.js';
import { stopAllMorseAudio } from './audio.js';
import { initChatListeners } from './chat.js';
import { initQuizListeners, submitQuizAnswer } from './quiz.js';

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

    appState.auth.signInAnonymously().then(async () => {
        try {
            const userRef = appState.db.ref(`users/${appState.myId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val() || {};

            if (userData.alias) appState.myName = userData.alias;
            appState.myPrivacy = userData.privacyUsername || false; 
            if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = appState.myPrivacy;

            if (!userSnap.exists() || !userData.welcomed) {
                await userRef.update({
                    name: appState.myName,
                    welcomed: true,
                    createdAt: window.firebase.database.ServerValue.TIMESTAMP
                });
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
            pRef.set({ 
                name: appState.myName, 
                username: appState.myPrivacy ? "" : appState.tgUsername, 
                status: 'online', 
                ts: window.firebase.database.ServerValue.TIMESTAMP 
            });
        });

        showScreen('setupScreen');
    }).catch(() => {
        if (els.loadingText) { 
            els.loadingText.textContent = "Errore di Connessione."; 
            els.loadingText.style.color = "red"; 
        }
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
                setTimeout(() => {
                    if (gameState.running && window.playNextWord) window.playNextWord();
                }, 800);
            }
        }
    }
});

// --- PONTE PER I PULSANTI HTML (WINDOW EXPORTS) ---
window.toggleLanguage = function() {
    appState.currentLang = (appState.currentLang === 'it') ? 'en' : 'it';
    showToast(appState.currentLang === 'it' ? "Lingua: Italiano" : "Language: English");
};

window.goBackToMenu = function() {
    showScreen('setupScreen');
};

// --- AVVIO APP ---
if (tgUser) { 
    appState.myName = tgUser.first_name; 
    appState.myId = tgUser.id.toString(); 
    appState.tgUsername = tgUser.username || "";
    initGame(); 
} else {
    if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen'); 
    if (els.errorScreen) els.errorScreen.classList.add('active-screen');
}
