// ============================================================================
// MAIN.JS - PUNTO DI INGRESSO E PONTE PER L'HTML
// ============================================================================

import { appState, gameState } from './state.js';
import { showScreen, showToast } from './ui.js';
import { listenToChat, toggleChat } from './chat.js';
import { joinSpecificRoom, exitRoomCleanly } from './lobby.js';
import { switchTeamTab, joinTeam } from './teams.js';
import { switchActTab } from './leaderboard.js';
import { toggleTrnSlot, startTrnMatch, viewTournament } from './tournaments.js';

// 1. INIZIALIZZAZIONE FIREBASE E APP
function initGame() {
    // ... bootstrap iniziale ...
}

// 2. ESPOSIZIONE SELETTIVA A WINDOW (SOLO PER IL BINDING HTML)
// Invece di avere 50 funzioni in window, esporti solo i listener necessari per l'HTML:

window.toggleLanguage = function() {
    appState.currentLang = (appState.currentLang === 'it') ? 'en' : 'it';
    // ...
};

window.openGlobalChat = function() {
    listenToChat();
    toggleChat();
};

window.goBackToMenu = function() {
    showScreen('setupScreen');
};

window.joinSpecificRoom = joinSpecificRoom;
window.switchTeamTab = switchTeamTab;
window.joinTeam = joinTeam;
window.switchActTab = switchActTab;
window.toggleTrnSlot = toggleTrnSlot;
window.startTrnMatch = startTrnMatch;
window.viewTournament = viewTournament;

// Avvio dell'applicazione
initGame();
