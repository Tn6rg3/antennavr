// ============================================================================
// CORE.JS - INIZIALIZZAZIONE, STATO GLOBALE, DOM MAPPING
// ============================================================================

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260807.212";

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;
const tgUsername = tgUser?.username || "";
const startParam = tg.initDataUnsafe?.start_param;

// --- GESTIONE SCHERMO RESIZE E TASTIERA MOBILE ---
if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
}

function updateViewportHeight() {
    if (!tg.isExpanded) tg.expand();
    const height = tg.viewportHeight || tg.viewportStableHeight || window.innerHeight;
    document.documentElement.style.height = `${height}px`;
    document.body.style.height = `${height}px`;
    document.body.style.minHeight = `${height}px`;
}

updateViewportHeight();
tg.onEvent('viewportChanged', updateViewportHeight);
window.addEventListener('resize', updateViewportHeight);
window.addEventListener('focus', updateViewportHeight);

// --- MAPPA DOM DINAMICA (Proxy) ---
const els = new Proxy({}, { get: (target, id) => document.getElementById(id) });

// --- COSTANTI DI STORAGE ---
const STORAGE_ROOM_KEY = "cwgame_last_room";
const STORAGE_CUSTOM_DICT_KEY = "cwgame_custom_dict";
const STORAGE_CHAT_MUTED_KEY = "cwgame_chat_muted";
const STORAGE_PREF_WPM = "cwgame_pref_wpm";
const STORAGE_PREF_WORDS = "cwgame_pref_words";
const STORAGE_PREF_TONE = "cwgame_pref_tone";
const STORAGE_PREF_CHAR_SPACE = "cwgame_pref_char_space";
const STORAGE_PREF_WORD_SPACE = "cwgame_pref_word_space";
const STORAGE_DAILY_SHOWN = "cwgame_daily_shown";
const STORAGE_CHAT_CW_ENABLED = "cwgame_chat_cw_enabled";
const STORAGE_CHAT_CW_WPM = "cwgame_chat_cw_wpm";
const STORAGE_CHAT_CW_TONE = "cwgame_chat_cw_tone";

// --- STATO GLOBALE (Raggruppato in sicurezza) ---
let myName = "", myId = "", myPrivacy = false;
let myTeamId = null, myTeamName = "", isTeamCaptain = false;
let db = null, auth = null, currentLang = 'it';
let activeChatContext = null, activeTab = "room", isChatDrawerOpen = false;
let isGlobalChatMuted = false;
let isChatCwEnabled = false, chatCwWpm = 20, chatCwTone = 600;
let chatCwAudioQueue = [], isChatCwPlaying = false;
window.lastPlayedCwMsgTs = 0;

let isChallenging = false, isRejoining = false, currentInviterId = null;
let roomCode = "", roomHostId = null, activeTrnId = null;
let lastPlayerCount = 0, gameStartPlayerCount = 0;
let gameRunning = false, inputActive = false, audioCtx = null;
let gameWords = [], wordIndex = 0, currentWpm = 20, baseWpm = 20, currentTone = 600;
let totalScore = 0, currentStreak = 0, usedReplay = false, matchDetailsArray = [];
let isSinglePlayer = false, currentMode = "standard", requestedWordCount = 10;
let isFixedSpeed = false, isEasyMode = false, lastWordStartTime = 0;

// STATO CO-OP (CONQUISTA)
let isCoopMode = false, coopActiveFreqIndex = 0;
let coopTimerInterval = null, coopDecayInterval = null;

// TIMERS E SCHEDULER
let lobbyTimerInterval = null, quizTimerInterval = null, ppTimerInterval = null;
let brCheckInterval = null, brTimerInterval = null;
let serverTimeOffset = 0;
let brBannerTimeout = null, brBannerDismissedToday = false;
let lastBRRoundPlayed = -1;

window.charSpaceWpm = 0;
window.wordSpaceMult = 1.0;
window.lastPlayedWordId = 0;
window.lastSeenGuessId = 0;

let masterDictionary = [], itDictionary = [], enDictionary = [], customDictionary = [];
let currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;
let sessionCharErrors = Object.create(null), sessionErrorsByWpm = Object.create(null);
let userMatchHistory = [];

// GESTORE CENTRALE LISTENER FIREBASE
const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, roomsList: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

// --- ALGORITMO SHUFFLE FISHER-YATES ---
function fisherYatesShuffle(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- GESTIONE TIMER E SICUREZZA ---
function clearAllTimers() {
    if (lobbyTimerInterval) { clearInterval(lobbyTimerInterval); lobbyTimerInterval = null; }
    if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }
    if (ppTimerInterval) { clearInterval(ppTimerInterval); ppTimerInterval = null; }
    if (brTimerInterval) { clearInterval(brTimerInterval); brTimerInterval = null; }
    if (coopTimerInterval) { clearInterval(coopTimerInterval); coopTimerInterval = null; }
    if (coopDecayInterval) { clearInterval(coopDecayInterval); coopDecayInterval = null; }
}

window.forceAppUpdate = function() {
    showToast("Aggiornamento in corso...");
    if ('caches' in window) caches.keys().then(names => names.forEach(name => caches.delete(name)));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
    setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now());
        window.location.replace(url.toString());
    }, 300);
};

if (els.updateBannerBtn) els.updateBannerBtn.addEventListener('click', window.forceAppUpdate);

function escapeHTML(str) {
    if (!str && str !== 0) return "";
    return String(str).replace(/[&<>'"]/g, match => {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escapeMap[match];
    });
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (els.toastContainer) {
        els.toastContainer.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
    }
}

window.openTelegramProfile = function(username) {
    if (username && String(username).trim() !== "") {
        tg.openTelegramLink('https://t.me/' + username);
    } else {
        tg.showAlert("Questo utente ha impostato la privacy o non ha uno username pubblico.");
    }
};
