// ============================================================================
// APP.JS - ENTRY POINT & GLOBAL STATE
// ============================================================================

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260807.255";

// URL della Web App di Google Apps Script per la validazione identità (Letto dinamicamente da Firebase Config)
let VALIDATION_SERVER_URL = window.VALIDATION_SERVER_URL || "";

// --- FUNZIONE DI SALVATAGGIO CONFIGURAZIONE DINAMICA FIREBASE ---
window.saveFirebaseConfigUrl = function(key, newUrl) {
    if (!key || !newUrl) return;
    const cleanUrl = newUrl.trim();
    if (typeof db !== 'undefined' && db) {
        db.ref(`config/${key}`).set(cleanUrl).then(() => {
            if (key === 'validation_server_url') window.VALIDATION_SERVER_URL = cleanUrl;
            if (typeof showToast === 'function') showToast(`🔒 Config '${key}' salvato su Firebase!`);
            console.log(`✓ Firebase Config '${key}' updated:`, cleanUrl);
        }).catch(err => {
            console.error("Firebase Config Save Error:", err);
            alert("Errore salvataggio Firebase: " + err.message);
        });
    } else {
        alert("⚠️ Connessione Firebase in fase di inizializzazione, riprova tra un istante.");
    }
};

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

window.tg = window.Telegram.WebApp;
const tg = window.tg;

// --- GESTIONE DATI UTENTE (Supporto Browser Esterno) ---
// Recuperiamo initData sia dalla WebApp che dai parametri URL (per browser esterno)
const urlParams = new URLSearchParams(window.location.search);

// TELEGRAM DESKTOP PC FIX: Telegram Desktop usa 'tgWebAppData' nella query string dell'iframe
const rawInitData = tg.initData || urlParams.get('initData') || urlParams.get('tgWebAppData') || "";
window.tgInitData = rawInitData;

let userFromUrl = null;
try {
    if (rawInitData) {
        const decoded = decodeURIComponent(rawInitData);
        const userMatch = decoded.match(/user=([^&]+)/);
        if (userMatch) userFromUrl = JSON.parse(decodeURIComponent(userMatch[1]));
    }
} catch(e) { console.warn("Init: Errore parsing user da URL", e); }

window.tgUser = tg.initDataUnsafe?.user || userFromUrl;
let tgUser = window.tgUser;
window.tgUsername = tgUser?.username || "";
let tgUsername = window.tgUsername;
const startParam = tg.initDataUnsafe?.start_param || urlParams.get('startapp');

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

// --- GESTIONE RIPRISTINO APP (PREVIENE APP BLOCCATA DA BACKGROUND) ---
const handleAppResume = (forceReconnect = false) => {
    console.log("App: Ripristino visibilità e risveglio da background...");

    // 1. Sblocco e ripristino incondizionato di tutti i contesti Web Audio
    if (typeof window.resumeAudioContext === 'function') {
        window.resumeAudioContext();
    }

    // 2. Sblocco DOM, Tastiera e Input di gioco
    if (typeof window.initDOMCache === 'function') window.initDOMCache();
    if (els && els.permanentGameInput) {
        els.permanentGameInput.disabled = false;
        els.permanentGameInput.removeAttribute('disabled');
    }
    inputActive = true;

    // 3. Ripristino Connessione Firebase SENZA forzare goOffline (previene la cancellazione temporanea di presence!)
    if (window.db) {
        window.db.goOnline();
    }

    // Aggiorniamo subito lo stato di presenza su Firebase
    updateAppStatus(true);
};

// Listener per eventi del ciclo di vita Telegram WebApp (Sblocco immediato su risveglio)
if (window.Telegram && window.Telegram.WebApp) {
    try {
        window.Telegram.WebApp.onEvent('viewportChanged', (e) => {
            if (e && e.isStateChanged) handleAppResume(false);
        });
        window.Telegram.WebApp.onEvent('activated', () => {
            handleAppResume(false);
        });
    } catch(e) {}
}

// Sblocco AudioContext al primo tocco sul display
window.addEventListener('pointerdown', () => {
    if (typeof window.resumeAudioContext === 'function') {
        window.resumeAudioContext();
    }
}, { passive: true });

// WATCHDOG: Rileva risvegli dopo sospensioni prolungate (es. schermo spento a lungo)
let lastWatchdogTick = Date.now();
setInterval(() => {
    const now = Date.now();
    if (now - lastWatchdogTick > 30000) { // Salto temporale di almeno 30 secondi
        console.warn("App: Watchdog rileva risveglio profondo, riattivo connessione...");
        handleAppResume(false);
    }
    lastWatchdogTick = now;
}, 5000);

document.addEventListener('visibilitychange', () => {
    const isVisible = !document.hidden;
    if (isVisible) handleAppResume(true);
    updateAppStatus(isVisible);
});

// --- GESTIONE PRESENZA E FOCUS (HEARTBEAT) ---
const updateAppStatus = (isFocused) => {
    if (window.isMandatoryAliasPending || window.isUserBanned || !window.myId || !window.db) return;

    db.ref(`presence/${window.myId}`).once('value', s => {
        if (s.exists()) {
            db.ref(`presence/${window.myId}`).update({
                isFocused: isFocused,
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });
};

// Heartbeat ogni 15 secondi per confermare la presenza
setInterval(() => {
    if (!document.hidden) updateAppStatus(true);
}, 15000);

// --- UNLOCK AUDIO (SPECIFICO PER iOS/IPHONE) ---
// Su iPhone l'audio deve essere attivato da un gesto esplicito dell'utente.
// Questo listener si attiva al primo tocco o click e "sblocca" l'AudioContext.
const unlockAudio = () => {
    if (typeof window.resumeAudioContext === 'function') {
        window.resumeAudioContext();
    }
    // Rimuoviamo i listener una volta sbloccato l'audio per non appesantire il sistema
    window.removeEventListener('mousedown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('mousedown', unlockAudio);
window.addEventListener('touchstart', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// --- MAPPA DOM DINAMICA (Proxy) ---
window.els = new Proxy({}, { get: (target, id) => document.getElementById(id) });
const els = window.els;

window.escapeHtml = function(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// --- COSTANTI DI STORAGE ---
const STORAGE_ROOM_KEY = "cwgame_last_room";
const STORAGE_DAILY_STATUS_KEY = "cwgame_daily_shown";
const STORAGE_LAST_ANNOUNCEMENT_ID = "cwgame_last_announcement_id";
const STORAGE_CUSTOM_DICT_KEY = "cwgame_custom_dict";
const STORAGE_CHAT_MUTED_KEY = "cwgame_chat_muted";
const STORAGE_PREF_WPM = "cwgame_pref_wpm";
const STORAGE_PREF_WORDS = "cwgame_pref_words";
const STORAGE_PREF_WORD_LEN = "cwgame_pref_word_len";
const STORAGE_PREF_TONE = "cwgame_pref_tone";
const STORAGE_PREF_CHAR_SPACE = "cwgame_pref_char_space";
const STORAGE_PREF_WORD_SPACE = "cwgame_pref_word_space";
const STORAGE_PREF_FIXED = "cwgame_pref_fixed";
const STORAGE_PREF_EASY = "cwgame_pref_easy";
const STORAGE_PREF_SPECTATE = "cwgame_pref_spectate";
const STORAGE_PREF_VOICE_INPUT = "cwgame_pref_voice_input";
const STORAGE_PUSH_NOTIFS_KEY = "cwgame_push_notifs";
const STORAGE_CHAT_CW_ENABLED = "cwgame_chat_cw_enabled";
const STORAGE_CHAT_CW_WPM = "cwgame_chat_cw_wpm";
const STORAGE_CHAT_CW_TONE = "cwgame_chat_cw_tone";

const DEBUG_MODE = false;
window.logDebug = (...args) => { if (DEBUG_MODE) console.log(...args); };

// --- STATO GLOBALE ---
window.myName = "";
window.myId = "";
window.myPrivacy = true;
window.myPrivacyOnline = false;
window.myPrivacyLeaderboard = false;
window.myPushNotifs = localStorage.getItem(STORAGE_PUSH_NOTIFS_KEY) !== 'false';
window.myTeamId = null;
window.myTeamName = "";
window.isTeamCaptain = false;
let db = null, auth = null, currentLang = 'it';
window.activeChatContext = null; // RESO GLOBALE
let activeTab = "room", isChatDrawerOpen = false;
let isGlobalChatMuted = false;
let isChatCwEnabled = false, chatCwWpm = 20, chatCwTone = 600;
let chatCwAudioQueue = [], isChatCwPlaying = false;
window.lastPlayedCwMsgTs = 0;
window.lastChatSentTs = 0; // Cooldown anti-spam per la chat

window.isChallenging = false;
window.isRejoining = false;
window.outgoingChallengeId = null; // ID dell'utente che HO sfidato
window.incomingChallengeId = null; // ID dell'utente che MI sfida
window.activeTrnId = null;
window.roomCode = "";
window.roomHostId = null;
window.lastPlayerCount = 0;
window.gameStartPlayerCount = 0;
window.gameRunning = false;
window.inputActive = false;
window.audioCtx = null;
window.gameWords = [];
window.wordIndex = 0;
window.currentWpm = 20;
window.baseWpm = 20;
window.currentTone = 600;
window.peakWpm = 0;
window.totalScore = 0;
window.currentStreak = 0;
window.usedReplay = false;
window.matchDetailsArray = [];
window.isSinglePlayer = true;
window.currentMode = "standard";
window.requestedWordCount = 10;
window.isFixedSpeed = false;
window.isEasyMode = false;
window.isSpeakMode = false; // NUOVO
window.voiceRate = 1.0;     // NUOVO
window.lastWordStartTime = 0;

// STATO CORSO CW
let isCourseMode = false, courseSessionTimer = null, coursePauseInterval = null;
window.courseData = null;

// STATO CO-OP
window.isCoopMode = false, coopActiveFreqIndex = 0;
let coopTimerInterval = null, coopDecayInterval = null;
window.perfectionQueue = []; // Coda per la modalità Perfezione
window.isPerfectionRetry = false; // Flag per sapere se la parola attuale è un recupero
window.perfectionWordsDone = 0; // Contatore parole nuove completate (corrette o sbagliate)
window.currentPerfectionWord = null;
window.currentPerfectionWpm = null;

// STATO ARCADE
let isArcadeMode = false, arcadeLives = 3, arcadeScore = 0, arcadeLevel = 1;
let arcadeWpm = 15, arcadeWordLen = 3, arcadeWordsSolved = 0, arcadeWordsAtCurrentLen = 0;
let arcadeActiveBrick = null, arcadeNextBrickTimeout = null;

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

window.masterDictionary = [];
window.itDictionary = [];
window.enDictionary = [];
window.arcadeDictionary = [];
window.customDictionary = [];

let currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;
let nextWordTimeout = null;
let userMatchHistory = [];

// GESTIONE INATTIVITÀ
let lastActivityTs = Date.now();
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minuti

// GESTORE CENTRALE LISTENER
const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, roomsList: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

// --- UTILS ---
window.countInvalidChars = function(str) {
    if (!str) return 0;
    const safeRegex = /[a-zA-Z0-9 ÀÈÉÌÒÙàèéìòù]/gu;
    const clean = str.replace(safeRegex, '');
    return [...clean].length;
};

window.isNameValid = function(str) {
    if (!str) return false;
    const invalidCount = window.countInvalidChars(str);
    // Contiamo quanti caratteri alfanumerici reali ci sono
    const validCount = str.replace(/[^a-zA-Z0-9ÀÈÉÌÒÙàèéìòù]/gu, '').length;

    // Regola: Massimo 1 icona/simbolo E almeno 2 caratteri di testo/numeri
    if (invalidCount >= 2) return false;
    if (validCount < 2) return false;
    return true;
};

function fisherYatesShuffle(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function clearAllTimers() {
    // Fermiamo tutti gli intervalli e timeout di sistema
    const timers = [
        lobbyTimerInterval, quizTimerInterval, ppTimerInterval,
        brTimerInterval, brCheckInterval,
        coopTimerInterval, coopDecayInterval,
        courseSessionTimer, coursePauseInterval,
        arcadeNextBrickTimeout, nextWordTimeout,
        window.autoAdvanceTimer
    ];
    timers.forEach(t => { if(t) { clearInterval(t); clearTimeout(t); } });

    lobbyTimerInterval = quizTimerInterval = ppTimerInterval = null;
    brTimerInterval = brCheckInterval = null;
    coopTimerInterval = coopDecayInterval = null;
    courseSessionTimer = coursePauseInterval = null;
    arcadeNextBrickTimeout = null;
    nextWordTimeout = null;
    window.autoAdvanceTimer = null;
}

/**
 * RESET RIGOROSO DELLO STATO DI GIOCO
 * Da chiamare PRIMA di inizializzare i parametri di una nuova sessione
 */
window.closeAllModals = function() {
    const modalIds = [
        'dailyChallengeModal',
        'triDailyModal',
        'triDailyPreviewModal',
        'triDailyResultsModal',
        'courseSessionModal',
        'mandatoryAliasModal',
        'statInfoModal',
        'courseReminderModal'
    ];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

window.resetGameState = function() {
    console.log("Game Core: Full state reset...");
    if (typeof window.closeAllModals === 'function') window.closeAllModals();

    // 1. Ferma tutto ciò che è in esecuzione
    gameRunning = false;
    inputActive = false;
    clearAllTimers();
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    // 2. Resetta flag di modalità (Verranno reimpostati dalla logica di avvio)
    isCourseMode = false;
    window.isCoopMode = false;
    isArcadeMode = false;
    if (typeof window.stopTowerClimb === 'function') window.stopTowerClimb();
    if (typeof window.exitQsoMode === 'function' && window.currentMode === 'qso') {
        // Pulizia QSO se stavamo uscendo da lì
    }
    window.isSinglePlayer = (document.getElementById('gameTypeInput')?.value === 'single');
    window.currentMode = document.getElementById('gameModeInput')?.value || 'standard';
    coopActiveFreqIndex = 0; // RESET INDICE FREQUENZA CO-OP

    // 2b. Reset specifico Perfezione
    window.perfectionQueue = [];
    window.isPerfectionRetry = false;
    window.perfectionWordsDone = 0;
    window.currentPerfectionWord = null;
    window.currentPerfectionWpm = null;

    // 3. Ripristina UI Input (Fix Spectator/Course residuals)
    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = false;
        els.permanentGameInput.placeholder = "Digita qui...";
        els.permanentGameInput.value = "";
    }
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';

    // 4. Resetta variabili di sessione
    wordIndex = 0;
    totalScore = 0;
    currentStreak = 0;
    peakWpm = 0;
    matchDetailsArray = [];
    usedReplay = false;

    // 5. Pulisce sessione corso pendente
    if (window.courseData) {
        window.courseData.current_day_session = null;
    }

    // 6. Resetta parametri audio avanzati
    window.charSpaceWpm = 0;
    window.wordSpaceMult = 1.0;
    window.isFixedSpeed = false;
    window.isEasyMode = false;
    if (els && els.easyModeCheckbox) els.easyModeCheckbox.checked = false;
    window.isAllowSpectators = false;
};

window.forceAppUpdate = function() {
    showToast("Aggiornamento...");
    if ('caches' in window) caches.keys().then(n => n.forEach(c => caches.delete(c)));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
    setTimeout(() => { location.replace(location.pathname + "?v=" + Date.now()); }, 300);
};

if (els.updateBannerBtn) els.updateBannerBtn.addEventListener('click', window.forceAppUpdate);

function showToast(message) {
    // DISATTIVIAMO LE NOTIFICHE VISIVE DURANTE IL GIOCO
    if (gameRunning || isCourseMode) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (els.toastContainer) {
        els.toastContainer.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
    }
}

window.openTelegramProfile = function(username) {
    if (username && String(username).trim() !== "") tg.openTelegramLink('https://t.me/' + username);
    else tg.showAlert("Profilo privato o senza username pubblico.");
};

window.toggleLanguage = function() {
    const newLang = (currentLang === 'it') ? 'en' : 'it';
    window.setLanguage(newLang);
    window.updateDictionary();
    showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English");
};

function updateMuteBtnUI() {
    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.textContent = isGlobalChatMuted
            ? (currentLang === 'it' ? "🔇 Notifiche Disattivate" : "🔇 Notifications Muted")
            : (currentLang === 'it' ? "🔊 Notifiche Attive" : "🔊 Notifications Active");
    }
}
window.updateMuteBtnUI = updateMuteBtnUI;

// --- REGOLAMENTO ---
window.loadRegolamento = async function() {
    if (!els.regolamentoContainer) return;
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error();
        const html = await response.text();

        // Creiamo un elemento temporaneo per il parsing sicuro
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Rimuoviamo eventuali script malevoli se presenti (ulteriori precauzione)
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(s => s.remove());

        // Pulizia sicura del contenitore e inserimento
        els.regolamentoContainer.innerHTML = '';
        while (doc.body.firstChild) {
            els.regolamentoContainer.appendChild(doc.body.firstChild);
        }

        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = () => {
                const url = `https://t.me/share/url?text=${encodeURIComponent("💡 Suggerimento: \n\n[Scrivi qui...]")}`;
                if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
            };
        }
    } catch (e) {
        console.error("Regolamento load error:", e);
        els.regolamentoContainer.innerHTML = `<div style="text-align:center;padding:15px;"><h3>📜 Regole</h3><p>Decodifica il Morse e scala la classifica!</p></div>`;
    }
};

if(document.getElementById('gameModeInput')) document.getElementById('gameModeInput').addEventListener('change', () => {
    window.checkGameTypeUI?.();
    if (typeof window.displayGlobalRatings === 'function') window.displayGlobalRatings();
});
if(document.getElementById('gameTypeInput')) document.getElementById('gameTypeInput').addEventListener('change', () => {
    window.checkGameTypeUI?.();
    if (typeof window.displayGlobalRatings === 'function') window.displayGlobalRatings();
});
if(document.getElementById('groupCharSetInput')) document.getElementById('groupCharSetInput').addEventListener('change', () => {
    window.checkGameTypeUI?.();
});

window.ensureUidMapping = async function() {
    try {
        const cUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
        if (cUid && window.myId && db) {
            const mappingRef = db.ref(`uid_mapping/${cUid}`);
            const mapSnap = await mappingRef.once('value');
            if (!mapSnap.exists() || mapSnap.val() !== window.myId) {
                await mappingRef.set(window.myId);
            }
        }
    } catch(e) { console.warn("Ensure Mapping Note:", e); }
};

window.isValidTelegramId = function(id) {
    if (!id) return false;
    const strId = String(id).trim();
    return strId !== "" && strId !== "undefined" && strId !== "null" && strId !== "0" && strId.length >= 3;
};

// --- STARTUP ---
// --- STARTUP ---
async function startApp() {
    if (!window.tgUser) {
        window.tgUser = tg.initDataUnsafe?.user;
    }
    const currentTgUser = window.tgUser;

    // BLOCCO RIGIDO ESTERNO: Accesso vietato al 100% se aperti fuori da Telegram
    if (!currentTgUser || !currentTgUser.id || !window.tgInitData) {
        console.warn("Security: External access blocked (No Telegram User).");
        if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
        if (els.errorScreen) els.errorScreen.classList.add('active-screen');
        return;
    }

    myName = currentTgUser.first_name || "Operatore";
    myId = currentTgUser.id ? currentTgUser.id.toString() : "";

    // 1. Fase di Verifica Identità (Backend Google Apps Script)
    const statusText = document.getElementById('initStatusText');
    if (statusText) statusText.textContent = "Verifica identità Morse...";

    try {
        const isVerified = await validateIdentity();

        // Segnaliamo che l'app ha superato la fase critica di avvio
        window.appIsReady = true;
        if (window.bootstrapTimer) clearTimeout(window.bootstrapTimer);

        if (!isVerified) {
            if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
            if (els.validationErrorScreen) els.validationErrorScreen.classList.add('active-screen');
            return;
        }
    } catch (e) {
        console.error("Validation failed:", e);
        // Se GAS risponde con errore, attiviamo la notifica bot
        const gasErrorMsg = "⚠️ <b>Errore di autenticazione.</b>\nIl server dei permessi non risponde. Riprova tra poco.";
        fetch(`${VALIDATION_SERVER_URL}?action=notify&targetId=${window.myId}&text=${encodeURIComponent(gasErrorMsg)}`, { mode: 'no-cors' });

        if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
        if (els.validationErrorScreen) els.validationErrorScreen.classList.add('active-screen');
        return;
    }

    // INIZIALIZZAZIONE PREVENTIVA FIREBASE SE NON ANCORA PRONTO
    const firebaseConfig = {
        apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
        authDomain: "telegrafiabot.firebaseapp.com",
        databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "telegrafiabot",
        storageBucket: "telegrafiabot.firebasestorage.app",
        messagingSenderId: "575790683327",
        appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if (!window.db) window.db = firebase.database();
    if (!window.auth) window.auth = firebase.auth();
    db = window.db;
    auth = window.auth;

    // ESEGUIAMO AUTH & CONTROLLO BAN SOLTANTO ORA CHE window.myId E' DEFINITO AL 100%!
    try {
        await window.auth.signInAnonymously();
    } catch(authErr) {
        console.warn("Auth Note:", authErr);
    }
    await window.ensureUidMapping();
        if (!window.isValidTelegramId(window.myId)) {
            console.warn("CW Game: Invalid Telegram ID.");
            return;
        }

        // --- 1. CONTROLLO BAN BLACKLIST PERMANENTE IMMEDIATO (PRIMA DELLA PRESENZA) ---
        try {
            const [banSnap1, banSnap2] = await Promise.all([
                db.ref(`appConfig/bannedUsers/${window.myId}`).once('value'),
                db.ref(`bannedUsers/${window.myId}`).once('value')
            ]);

            const isBanned = (banSnap1 && banSnap1.exists() && banSnap1.val() === true) ||
                             (banSnap2 && banSnap2.exists() && banSnap2.val() === true);

            if (isBanned) {
                window.isUserBanned = true;
                console.warn("CW Game: Accesso BLOCCATO.");

                // Cancella subito qualsiasi traccia di presenza
                db.ref(`presence/${window.myId}`).remove().catch(() => {});
                db.ref(`users/${window.myId}`).remove().catch(() => {});
                db.ref('.info/connected').off();

                alert("⛔ ACCESSO BLOCCATO\n\nIl tuo account Telegram è stato disabilitato dall'amministratore.");
                if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
                setTimeout(() => {
                    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
                        window.Telegram.WebApp.close();
                    } else if (window.tg && typeof window.tg.close === 'function') {
                        window.tg.close();
                    } else {
                        location.reload();
                    }
                }, 800);
                return; // Interrompe l'avvio incondizionatamente!
            }
        } catch(e) {
            console.warn("Verify Ban Check Note:", e);
        }

        // --- 2. SISTEMA DI MAPPING E PRESENZA (Solo se ID valido e NON bannato) ---
        db.ref('.info/connected').on('value', async (s) => {
            if (s.val() === true && window.isValidTelegramId(window.myId) && !window.isUserBanned) {

                // Ripristina il mapping di sicurezza (solo se non gia impostato)
                try {
                    const cUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
                    if (cUid) {
                        const mappingRef = db.ref(`uid_mapping/${cUid}`);
                        const mapSnap = await mappingRef.once('value');
                        if (!mapSnap.exists() || mapSnap.val() !== window.myId) {
                            await mappingRef.set(window.myId);
                        }
                    }
                } catch (e) { console.warn("Mapping Note:", e.message || e); }

                // BLOCCO PRESENZA SE L'ALIAS NON E' ANCORA STATO CONFERMATO O SE E' BANNATO
                if (window.isMandatoryAliasPending || window.isUserBanned) {
                    return;
                }

                // Ripristina la presenza online SOLO se ha un alias registrato
                const pRef = db.ref(`presence/${window.myId}`);
                pRef.onDisconnect().remove();
                const presenceData = {
                    name: window.myName || "Giocatore",
                    username: window.myPrivacy ? "" : tgUsername,
                    status: 'online',
                    uid: firebase.auth().currentUser.uid,
                    level: (window.userProgression && window.userProgression.level) ? window.userProgression.level : 1,
                    ts: firebase.database.ServerValue.TIMESTAMP,
                    lastActive: firebase.database.ServerValue.TIMESTAMP
                };
                pRef.set(presenceData);

                if (typeof window.setupBugSystem === 'function') {
                    window.setupBugSystem();
                }
            }
        });

        // LISTENER IN TEMPO REALE BAN ADMIN (CHIUSURA ISTANTANEA SE BANNATO DALL'ADMIN)
        db.ref(`appConfig/bannedUsers/${window.myId}`).on('value', banSnap => {
            if (banSnap && banSnap.exists() && banSnap.val() === true) {
                window.isUserBanned = true;
                console.warn("CW Game: Instant Admin Ban triggered.");
                if (window.db) {
                    db.ref(`presence/${window.myId}`).remove().catch(() => {});
                    db.ref(`users/${window.myId}`).remove().catch(() => {});
                    db.ref('.info/connected').off();
                }
                localStorage.clear();
                sessionStorage.clear();
                alert("⛔ ACCESSO BLOCCATO\n\nIl tuo account cwganme è stato disabilitato dall'amministratore.");
                setTimeout(() => {
                    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
                        window.Telegram.WebApp.close();
                    } else {
                        location.reload();
                    }
                }, 800);
            }
        }, error => {
            console.error("Realtime ban listener error:", error);
        });

    // --- TELEGRAM TTS FIX: Svegliamo il motore vocale ---
    const synth = window.speechSynthesis || window.webkitSpeechSynthesis;
    if (synth) {
        synth.getVoices();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = () => synth.getVoices();
        }
    }

    await initGame();
}

window.fetchValidationUrlFromFirebase = async function() {
    if (window.VALIDATION_SERVER_URL && window.VALIDATION_SERVER_URL.startsWith('http')) {
        return window.VALIDATION_SERVER_URL;
    }
    try {
        if (typeof db !== 'undefined' && db) {
            let snap = await db.ref('appConfig/validation_server_url').once('value');
            if (!snap.exists() || !snap.val()) {
                snap = await db.ref('config/validation_server_url').once('value');
            }
            if (snap.exists() && snap.val()) {
                window.VALIDATION_SERVER_URL = snap.val().trim();
                console.log("🔒 Loaded Validation Apps Script URL from Firebase:", window.VALIDATION_SERVER_URL);
                return window.VALIDATION_SERVER_URL;
            }
        }
    } catch(e) {
        console.warn("Validation Config Fetch Warning:", e);
    }
    return window.VALIDATION_SERVER_URL || "";
};

async function validateIdentity() {
    // BLOCCO RIGIDO ESTERNO: Se manca initData, blocca l'accesso immediatamente
    if (!window.tgInitData || window.tgInitData.trim() === "") {
        console.warn("Security: Missing tgInitData, validation failed.");
        return false;
    }

    const valUrl = await window.fetchValidationUrlFromFirebase();
    if (!valUrl || !valUrl.startsWith("http")) {
        // Se l'URL di validazione non è impostato in Firebase, si richiede comunque un utente Telegram valido
        return !!(window.tgUser && window.tgUser.id);
    }

    try {
        const url = valUrl + "?initData=" + encodeURIComponent(window.tgInitData || "");

        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            redirect: 'follow'
        });

        if (!response.ok) {
            if (window.tgUser && window.tgUser.id) return true;
            return false;
        }

        const result = await response.json();

        // Salva SEMPRE l'URL e il Token Dinamico inviati dallo script di autenticazione
        if (result && result.qsoAudioServerUrl) {
            localStorage.setItem('cwgame_qso_audio_url', result.qsoAudioServerUrl);
            window.qsoAudioServerUrl = result.qsoAudioServerUrl;
        }

        if (result && result.aiAuthToken) {
            localStorage.setItem('cwgame_ai_auth_token', result.aiAuthToken);
            window.aiAuthToken = result.aiAuthToken;
        }

        if (result && result.status === 'ok') {
            return true;
        }

        // Se l'hash check del server fallisce su Telegram Desktop ma window.tgUser è valido dentro Telegram:
        if (window.tgUser && window.tgUser.id) {
            console.warn("Validation: GAS hash check failed on desktop, but user is authenticated in Telegram WebApp.");
            return true;
        }

        return false;
    } catch (err) {
        console.error("Validation: Request failed", err);
        if (window.tgUser && window.tgUser.id) return true;
        return false;
    }
}

async function sendPushNotification(targetId, text) {
    if (!targetId) return;

    const serverUrl = (VALIDATION_SERVER_URL && VALIDATION_SERVER_URL.startsWith('http'))
        ? VALIDATION_SERVER_URL
        : "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    // Usiamo il testo fornito o un messaggio generico di fallback
    const notificationText = (text && text.trim() !== "") ? text : "Hai nuovi messaggi su Sfida Telegrafia! 📻";

    const url = `${serverUrl}?action=notify&targetId=${targetId}&text=${encodeURIComponent(notificationText)}`;
    try {
        fetch(url, { method: 'GET', mode: 'no-cors' }).catch(() => {});
        console.log("Push: Richiesta inviata per targetId =", targetId);
    } catch(e) { console.error("Push Error:", e); }
}

window.requestTelegramPushPermissions = function() {
    const btn = document.getElementById('pushNotifBtn');

    // Se sono già attive, le disattiviamo
    if (window.myPushNotifs) {
        window.myPushNotifs = false;
        if (window.db && window.myId) db.ref(`users/${window.myId}/pushNotifications`).set(false);
        localStorage.setItem(STORAGE_PUSH_NOTIFS_KEY, "false");
        showToast("🔕 Notifiche disattivate");
        updatePushBtnUI(btn);
        return;
    }

    // Se sono disattivate, chiediamo il permesso e attiviamo
    if (tg.requestWriteAccess) {
        tg.requestWriteAccess((allowed) => {
            if (allowed) {
                window.myPushNotifs = true;
                if (window.db && window.myId) {
                    db.ref(`users/${window.myId}/pushNotifications`).set(true);
                    db.ref(`users/${window.myId}/pushEnabled`).set(true);
                }
                localStorage.setItem(STORAGE_PUSH_NOTIFS_KEY, "true");
                showToast("✅ Notifiche di Sistema attivate!");
                updatePushBtnUI(btn);
            }
        });
    } else {
        showToast("⚠️ Funzionalità non supportata da questa versione di Telegram.");
    }
};

window.updatePushBtnUI = function(btn) {
    if (!btn) btn = document.getElementById('pushNotifBtn');
    if (!btn) return;

    if (window.myPushNotifs) {
        btn.textContent = "🔔 Notifiche: ATTIVE";
        btn.style.backgroundColor = "var(--btn-success-bg, #28a745)";
        btn.style.color = "#fff";
    } else {
        btn.textContent = "🔕 Notifiche: DISATTIVATE";
        btn.style.backgroundColor = "var(--btn-secondary-bg, #6c757d)";
        btn.style.color = "#fff";
    }
};

window.startApp = startApp;

async function initGame() {
    const firebaseConfig = {
        apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
        authDomain: "telegrafiabot.firebaseapp.com",
        databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "telegrafiabot",
        storageBucket: "telegrafiabot.firebasestorage.app",
        messagingSenderId: "575790683327",
        appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    // --- ESPORTAZIONE GLOBALE PER CONSOLE E DEBUG ---
    window.db = firebase.database();
    window.auth = firebase.auth();
    db = window.db;
    auth = window.auth;

    // --- CONTROLLO MANUTENZIONE (Firebase) ---
    db.ref('appConfig/maintenance').on('value', snap => {
        if (snap.val() === true) {
            console.warn("App: Modalità manutenzione attiva.");
            window.appIsReady = true; // Ferma il bootstrap watchdog
            if (window.bootstrapTimer) clearTimeout(window.bootstrapTimer);

            const screens = document.querySelectorAll('.screen');
            screens.forEach(s => s.classList.remove('active-screen'));
            if (els.maintenanceScreen) els.maintenanceScreen.classList.add('active-screen');
            if (els.loadingScreen) els.loadingScreen.style.display = 'none';
        }
    });

    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';
    if (els.startWpmInput) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM) || 20;
    if (els.wordCountInput) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS) || 10;
    if (document.getElementById('wordLengthInput')) document.getElementById('wordLengthInput').value = localStorage.getItem(STORAGE_PREF_WORD_LEN) || 0;
    if (els.toneInput) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE) || 600;

    // RIPRISTINO IMPOSTAZIONI AGGIUNTIVE
    if (els.charSpaceInput) els.charSpaceInput.value = localStorage.getItem(STORAGE_PREF_CHAR_SPACE) || "";
    if (els.wordSpaceSelect) els.wordSpaceSelect.value = localStorage.getItem(STORAGE_PREF_WORD_SPACE) || "1.0";
    if (els.fixedSpeedCheckbox) els.fixedSpeedCheckbox.checked = localStorage.getItem(STORAGE_PREF_FIXED) === 'true';
    if (els.easyModeCheckbox) els.easyModeCheckbox.checked = false; // Disattivata di default ad ogni avvio
    if (els.allowSpectatorsCheckbox) els.allowSpectatorsCheckbox.checked = localStorage.getItem(STORAGE_PREF_SPECTATE) === 'true';
    if (document.getElementById('voiceInputCheckbox')) document.getElementById('voiceInputCheckbox').checked = localStorage.getItem('cwgame_pref_voice_input') === 'true';
    if (document.getElementById('autoAdvanceCheckbox')) document.getElementById('autoAdvanceCheckbox').checked = localStorage.getItem('cwgame_pref_auto_advance') === 'true';
    if (document.getElementById('autoAdvanceDelaySelect')) document.getElementById('autoAdvanceDelaySelect').value = localStorage.getItem('cwgame_pref_auto_advance_delay') || "5";

    // SALVATAGGIO AUTOMATICO DELLE PREFERENZE AL CAMBIO
    const savePref = (key, val) => localStorage.setItem(key, val);
    els.startWpmInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_WPM, e.target.value));
    els.wordCountInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORDS, e.target.value));
    document.getElementById('wordLengthInput')?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORD_LEN, e.target.value));
    els.toneInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_TONE, e.target.value));
    els.charSpaceInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_CHAR_SPACE, e.target.value));
    els.wordSpaceSelect?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORD_SPACE, e.target.value));
    els.fixedSpeedCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_FIXED, e.target.checked));
    els.allowSpectatorsCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_SPECTATE, e.target.checked));
    document.getElementById('voiceInputCheckbox')?.addEventListener('change', (e) => savePref('cwgame_pref_voice_input', e.target.checked));
    document.getElementById('autoAdvanceCheckbox')?.addEventListener('change', (e) => savePref('cwgame_pref_auto_advance', e.target.checked));
    document.getElementById('autoAdvanceDelaySelect')?.addEventListener('change', (e) => savePref('cwgame_pref_auto_advance_delay', e.target.value));

    isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
    chatCwWpm = parseInt(localStorage.getItem(STORAGE_CHAT_CW_WPM)) || 20;
    chatCwTone = parseInt(localStorage.getItem(STORAGE_CHAT_CW_TONE)) || 600;

    // RIPRISTINO VALORI INPUT CHAT CW
    if (els.chatCwWpmInput) els.chatCwWpmInput.value = chatCwWpm;
    if (els.chatCwToneInput) els.chatCwToneInput.value = chatCwTone;

    // SALVATAGGIO AUTOMATICO IMPOSTAZIONI CHAT CW
    els.chatCwWpmInput?.addEventListener('change', (e) => {
        chatCwWpm = parseInt(e.target.value) || 20;
        localStorage.setItem(STORAGE_CHAT_CW_WPM, chatCwWpm);
    });
    els.chatCwToneInput?.addEventListener('change', (e) => {
        chatCwTone = parseInt(e.target.value) || 600;
        localStorage.setItem(STORAGE_CHAT_CW_TONE, chatCwTone);
    });

    if (els.toggleChatCwBtn) {
        const updateBtn = () => {
            // Sincronizzazione variabile globale con stato reale
            isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
            els.toggleChatCwBtn.textContent = isChatCwEnabled ? "📻 CW: ON" : "📻 CW: OFF";
            els.toggleChatCwBtn.className = isChatCwEnabled ? "btn btn-success" : "btn btn-secondary";
            if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = isChatCwEnabled ? 'block' : 'none';
        };
        updateBtn();
        els.toggleChatCwBtn.onclick = () => {
            const newState = !(localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true');
            localStorage.setItem(STORAGE_CHAT_CW_ENABLED, newState);
            isChatCwEnabled = newState; // Forza aggiornamento variabile globale
            updateBtn();
            if (typeof listenToChat === 'function') listenToChat();
        };
    }

window.initMandatoryAliasHandlers = function() {
    const btnSave = document.getElementById('btnSaveMandatoryAlias');
    const btnExit = document.getElementById('btnExitMandatoryAlias');
    const input = document.getElementById('mandatoryAliasInput');

    if (btnSave) {
        btnSave.onclick = async () => {
            const rawAlias = (input ? input.value : "").trim();
            const isValid = (typeof window.isNameValid === 'function') ? window.isNameValid(rawAlias) : (rawAlias.length >= 2);

            if (!isValid || rawAlias.length < 2) {
                alert("⚠️ Inserisci un Alias valido (almeno 2 caratteri, max 1 icona).");
                return;
            }

            try {
                if (typeof showToast === 'function') showToast("Salvataggio Alias...");
                window.myName = rawAlias;

                if (window.myId && window.db) {
                    await window.ensureUidMapping();
                    await db.ref(`users/${window.myId}`).set({
                        alias: rawAlias,
                        assignedDefaultName: rawAlias,
                        hasSetCustomAlias: true,
                        privacyUsername: window.myPrivacy !== undefined ? window.myPrivacy : true,
                        privacyOnline: window.myPrivacyOnline !== undefined ? window.myPrivacyOnline : false,
                        privacyLeaderboard: window.myPrivacyLeaderboard !== undefined ? window.myPrivacyLeaderboard : false,
                        pushNotifications: window.myPushNotifs !== undefined ? window.myPushNotifs : true,
                        welcomed: true,
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    }).catch(err => console.warn("Set alias warning:", err));
                }

                window.isMandatoryAliasPending = false;
                const modal = document.getElementById('mandatoryAliasModal');
                if (modal) modal.style.display = 'none';

                // SCRITTURA PRESENZA ONLINE SOLO ORA CHE L'ALIAS E' STATO CONFERMATO!
                if (window.myId && window.db) {
                    const pRef = db.ref(`presence/${window.myId}`);
                    pRef.onDisconnect().remove();
                    pRef.set({
                        name: rawAlias,
                        username: window.myPrivacy ? "" : tgUsername,
                        status: 'online',
                        uid: firebase.auth().currentUser ? firebase.auth().currentUser.uid : "",
                        level: (window.userProgression && window.userProgression.level) ? window.userProgression.level : 1,
                        ts: firebase.database.ServerValue.TIMESTAMP,
                        lastActive: firebase.database.ServerValue.TIMESTAMP
                    });
                }

                if (typeof window.checkDailyMissionsStatus === 'function') {
                    window.checkDailyMissionsStatus();
                }

                if (els && els.playerName) els.playerName.textContent = rawAlias;

                if (typeof showToast === 'function') showToast(`✅ Benvenuto ${rawAlias}! Profilo configurato.`);
                if (els && els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
                if (typeof window.showScreen === 'function') window.showScreen('setupScreen');

                if (window.isNewUserWaitingWelcome && els.welcomeNewUserModal) {
                    els.welcomeNewUserModal.style.display = 'flex';
                } else if (typeof window.checkTodayStartupModals === 'function') {
                    setTimeout(window.checkTodayStartupModals, 400);
                }

            } catch(e) {
                console.error("Save Alias Error:", e);
                alert("Errore salvataggio: " + e.message);
            }
        };
    }

    if (btnExit) {
        btnExit.onclick = () => {
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
                window.Telegram.WebApp.close();
            } else if (window.tg && typeof window.tg.close === 'function') {
                window.tg.close();
            } else {
                location.reload();
            }
        };
    }
};

        // --- CARICAMENTO PROFILO UTENTE ---
        const userRef = db.ref(`users/${window.myId}`);
        const snap = await userRef.once('value');
        const data = snap.val() || {};

        // --- PROTEZIONE ANTI-SPAM (USERNAME GATE) ---
        // Se l'utente non ha username E non esiste ancora nel database, lo blocchiamo
        if (!tgUsername && !snap.exists()) {
            if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
            if (els.noUsernameScreen) els.noUsernameScreen.classList.add('active-screen');
            return; // Interrompiamo l'avvio
        }

        // --- GESTIONE ALIAS E PRIVACY DI DEFAULT ---
        let needsUpdate = false;
        const updates = {};

        // VALIDAZIONE RIGOROSA NOMINATIVO (Max 1 icona, min 2 testo)
        let rawName = data.alias || tgUser.first_name || "Operatore";
        const isValid = window.isNameValid(rawName);

        if (!isValid) {
            // Se l'utente ha già un nome assegnato dal sistema in passato, lo riusiamo
            if (data.assignedDefaultName) {
                window.myName = data.assignedDefaultName;
                if (data.alias !== window.myName) {
                    updates.alias = window.myName;
                    needsUpdate = true;
                }
            } else {
                // Generiamo un nuovo nome GiocatoreX
                try {
                    const result = await db.ref('appConfig/userCounter').transaction(curr => (curr || 0) + 1);
                    const newCount = result.snapshot.val();
                    window.myName = "Giocatore" + newCount;
                    updates.assignedDefaultName = window.myName;
                    updates.alias = window.myName;
                    needsUpdate = true;

                    setTimeout(() => {
                        tg.showAlert("⚠️ Il tuo nome non è valido (richiesto testo e max 1 icona). Ti è stato assegnato il nome: " + window.myName + ". Puoi cambiarlo nel Profilo.");
                    }, 3000);
                } catch(e) {
                    console.error("Counter Error:", e);
                    window.myName = "Giocatore";
                }
            }
        } else {
            window.myName = rawName;
            if (!data.alias) {
                updates.alias = window.myName;
                needsUpdate = true;
            }
        }

        if (data.privacyUsername === undefined) {
            window.myPrivacy = true;
            updates.privacyUsername = true;
            needsUpdate = true;
        } else {
            window.myPrivacy = data.privacyUsername;
        }

        if (data.privacyOnline === undefined) {
            window.myPrivacyOnline = false; // Default: visibile online
            updates.privacyOnline = false;
            needsUpdate = true;
        } else {
            window.myPrivacyOnline = data.privacyOnline;
        }

        if (data.privacyLeaderboard === undefined) {
            window.myPrivacyLeaderboard = false; // Default: visibile in classifica
            updates.privacyLeaderboard = false;
            needsUpdate = true;
        } else {
            window.myPrivacyLeaderboard = data.privacyLeaderboard;
        }

        if (data.pushNotifications === undefined) {
            window.myPushNotifs = true;
            updates.pushNotifications = true;
            needsUpdate = true;
        } else {
            window.myPushNotifs = data.pushNotifications;
        }

        if (els.playerName) els.playerName.textContent = window.myName;

        // --- GESTIONE ALIAS OBBLIGATORIO PRIMO INGRESSO ---
        const hasSetCustomAlias = !!(data && (data.hasSetCustomAlias === true || (data.alias && !data.alias.startsWith("Giocatore"))));

        if (!hasSetCustomAlias) {
            window.isMandatoryAliasPending = true;
            window.isNewUserWaitingWelcome = true;
            if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
            setTimeout(() => {
                if (typeof window.showProfileScreen === 'function') window.showProfileScreen();
                const modal = document.getElementById('mandatoryAliasModal');
                const input = document.getElementById('mandatoryAliasInput');
                if (modal) {
                    if (input) input.value = window.myName || (tgUser ? tgUser.first_name : "") || "";
                    modal.style.display = 'flex';
                }
            }, 300);
        } else {
            // Utente già registrato in passato
            if (needsUpdate && !window.isUserBanned) {
                await window.ensureUidMapping();
                await userRef.update(updates).catch(err => console.warn("Update settings note:", err));
                console.log("Privacy: Applied default settings (Privacy ON, Alias set).");
            }
            if ((!snap.exists() || !data.welcomed) && !window.isUserBanned) {
                await window.ensureUidMapping();
                await userRef.update({ welcomed: true, createdAt: firebase.database.ServerValue.TIMESTAMP }).catch(err => console.warn("Welcome update note:", err));
                window.isNewUserWaitingWelcome = true;
                if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'flex';
            }
        }

        if (typeof window.initMandatoryAliasHandlers === 'function') {
            window.initMandatoryAliasHandlers();
        }

        // --- SISTEMA LAZY CLEANUP GIORNALIERO ---
        try {
            const cleanupRef = db.ref('appConfig/lastCleanupTs');
            cleanupRef.once('value', snap => {
                const lastCleanup = snap.val() || 0;
                const now = Date.now();
                const ONE_DAY_MS = 24 * 60 * 60 * 1000;

                if (now - lastCleanup > ONE_DAY_MS) {
                    console.log("CW Game: Running daily database garbage collector...");
                    // 1. Svuotiamo le chat principali
                    db.ref('globalChat').remove();
                    db.ref('courseChat').remove();
                    db.ref('courseChats').remove();

                    // 2. Pulizia stanze orfane o scadute
                    db.ref('rooms').once('value', roomsSnap => {
                        if (!roomsSnap.exists()) return;
                        roomsSnap.forEach(rSnap => {
                            const r = rSnap.val();
                            const players = r.players || {};
                            const hasPlayers = Object.keys(players).length > 0;
                            const isExpired = r.expiresAt && now > r.expiresAt;
                            const isVeryOld = r.createdAt && (now - r.createdAt) > (ONE_DAY_MS * 2); // Più di 48h

                            if (!hasPlayers || isExpired || isVeryOld) {
                                console.log(`GC: Rimuovo stanza ${rSnap.key} (Motivo: Orfana/Scaduta)`);
                                rSnap.ref.remove();
                                db.ref(`public_lobby_rooms/${rSnap.key}`).remove();
                            }
                        });
                    });

                    // 3. Pulizia lobby pubblica (stanze fantasma senza corrispondenza in /rooms)
                    db.ref('public_lobby_rooms').once('value', lobbySnap => {
                        if (!lobbySnap.exists()) return;
                        lobbySnap.forEach(lSnap => {
                            db.ref(`rooms/${lSnap.key}`).once('value', rCheck => {
                                if (!rCheck.exists()) {
                                    console.log(`GC: Rimuovo lobby fantasma ${lSnap.key}`);
                                    lSnap.ref.remove();
                                }
                            });
                        });
                    });

                    cleanupRef.set(now);
                }
            });
        } catch(e) { console.warn("Cleanup error:", e); }

        // --- PULIZIA SESSIONI PRECEDENTI (SOLO SE VECCHIE) ---
        db.ref('rooms').orderByChild('hostId').equalTo(window.myId).once('value', s => {
            const now = Date.now() + serverTimeOffset;
            s.forEach(roomSnap => {
                const room = roomSnap.val();
                // Eliminiamo solo se la stanza è in waiting da più di 1 minuto
                // Questo permette di cambiare dispositivo senza killare la stanza appena creata
                if (room.status === 'waiting' && (!room.createdAt || (now - room.createdAt) > 60000)) {
                    roomSnap.ref.remove();
                    db.ref(`public_lobby_rooms/${roomSnap.key}`).remove();
                }
            });
        });

        // --- SBLOCCO UI CRITICO ---
        if (els.loadingText) els.loadingText.style.display = 'none';
        if (els.createRoomBtn) {
            els.createRoomBtn.disabled = false;
            console.log("CW Game: UI Unlocked.");
        }

        if (typeof window.initMandatoryAliasHandlers === 'function') {
            window.initMandatoryAliasHandlers();
        }

        // --- MONITORAGGIO INATTIVITÀ ---
        const updateActivity = () => { lastActivityTs = Date.now(); };
        ['mousedown', 'keydown', 'touchstart', 'input'].forEach(evt => window.addEventListener(evt, updateActivity));

        setInterval(() => {
            const now = Date.now();
            if (now - lastActivityTs > INACTIVITY_TIMEOUT_MS) {
                console.log("Inattività rilevata (15 min). Chiusura sessione.");
                if (roomCode) {
                    window.showToast?.(currentLang === 'it' ? "Sessione chiusa per inattività." : "Session closed due to inactivity.");
                    window.exitRoomCleanly?.(false, true);
                }
                // Rimuoviamo anche la presenza per sicurezza
                db.ref(`presence/${myId}`).remove();
                // Fermiamo l'aggiornamento automatico fino alla prossima interazione
            } else if (db && myId && !window.isMandatoryAliasPending && !window.isUserBanned) {
                // Aggiorna il timestamp sul server ogni minuto solo se il nodo presenza esiste ancora
                db.ref(`presence/${myId}`).once('value', s => {
                    if (s.exists()) {
                        db.ref(`presence/${myId}/lastActive`).set(firebase.database.ServerValue.TIMESTAMP);
                    }
                });
            }
        }, 60000); // Controllo ogni minuto

        if (startParam) {
            if (startParam.startsWith('team_')) window.processTeamInvite?.(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom?.(startParam.replace('room_', ''));
        } else {
            localStorage.removeItem(STORAGE_ROOM_KEY);
            window.isRejoining = false;
            if (els && els.rejoinContainer) els.rejoinContainer.style.display = 'none';
            showScreen('setupScreen');
        }

        const savedLang = localStorage.getItem('gameLang');
        if (savedLang) window.setLanguage(savedLang); else updateMuteBtnUI();
        
        window.loadDictionaries().then(() => {
            let today = window.getLocalDateString();

            if (startParam) return;

            // Verifichiamo se l'utente ha già giocato o iniziato la sfida OGGI
            db.ref(`users/${myId}`).once('value', userSnap => {
                const userData = userSnap.val() || {};
                const history = userData.history || {};
                const lastAttemptDate = userData.daily_attempt || "";

                let alreadyPlayedToday = (lastAttemptDate === today);

                if (!alreadyPlayedToday) {
                    Object.values(history).forEach(m => {
                        if (!m.date) return;
                        const mDate = window.getLocalDateString(m.date);
                        if (m.mode === 'daily_challenge' && mDate === today) alreadyPlayedToday = true;
                    });
                }

                const alreadyShownToday = localStorage.getItem(STORAGE_DAILY_STATUS_KEY) === today;

                if (alreadyPlayedToday) {
                    // Aggiorniamo il cache locale se Firebase dice che abbiamo giocato
                    localStorage.setItem(STORAGE_DAILY_STATUS_KEY, today);
                }
            });
        });

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) { try { window.customDictionary = JSON.parse(savedCustom); window.updateCustomDictStatus?.(); } catch(e) { console.error("Local Storage Error:", e); } }

        window.listenToRooms?.();
        window.listenToOnlineUsers?.();
        window.listenToInvites?.();

        // --- ATTIVAZIONE SISTEMA SFIDE (Fix Avvio Simultaneo) ---
        if (typeof window.listenToInviteAccepted === 'function') {
            window.listenToInviteAccepted();
        }

        if (typeof window.ensureUidMapping === 'function') {
            await window.ensureUidMapping();
        }

        window.initBattleRoyaleScheduler?.();
        window.initGlobalNotificationListener?.(); // AVVIO LISTENER BACKGROUND
        window.loadRegolamento();
        window.initProgression?.();
        window.initCourseManager?.();
        window.initQuizManager?.();
        window.setupBugSystem?.();
        window.initAdminAnnouncementListener();
        window.checkBugFeedback();
        if (typeof window.checkCwgBetaVisibility === 'function') window.checkCwgBetaVisibility();

        // --- GESTIONE VERSIONI E BANNER AGGIORNAMENTO ---
        const updateVers = () => {
            if (els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
            const footer = document.getElementById('appVersionFooter');
            if (footer) footer.textContent = APP_VERSION;
        };
        updateVers();
        setTimeout(updateVers, 1500); // Forza dopo caricamento altri script

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) {
                if (els.updateBanner) els.updateBanner.style.display = 'block';
            } else {
                if (els.updateBanner) els.updateBanner.style.display = 'none';
            }
        });

    window.populateGameModesUI?.();
    window.checkGameTypeUI?.();
    if (typeof window.checkTodayStartupModals === 'function') {
        setTimeout(window.checkTodayStartupModals, 1500);
    }
    if (typeof window.checkAndTriggerTriDailySlotNotifications === 'function') {
        setTimeout(window.checkAndTriggerTriDailySlotNotifications, 3000);
    }

    // Attiviamo subito il gestore trasmissione per avere i tasti pronti ovunque
    if (typeof window.initTransmissionManager === 'function') {
        window.initTransmissionManager();
    }

    setTimeout(() => { window.checkGameTypeUI?.(); }, 1200);
}

/**
 * LISTENER ANNUNCI AMMINISTRATORE (Global Popup)
 */
window.initAdminAnnouncementListener = function() {
    if (!db) return;

    db.ref('admin_announcement').on('value', snap => {
        const data = snap.val();
        if (!data || !data.active || !data.text) {
            if (els.adminAnnouncementModal) els.adminAnnouncementModal.style.display = 'none';
            return;
        }

        const annId = data.id || "default";
        const lastSeen = localStorage.getItem(STORAGE_LAST_ANNOUNCEMENT_ID);

        // Se l'ID è diverso da quello salvato, mostriamo il popup
        if (annId !== lastSeen) {
            if (els.adminAnnouncementModal && els.adminAnnouncementText) {
                if (els.adminAnnouncementTitle) els.adminAnnouncementTitle.textContent = data.title || "Comunicazione";

                // Protezione XSS: Usiamo textContent e aggiungiamo <br> manualmente
                els.adminAnnouncementText.textContent = '';
                if (data.text) {
                    data.text.split('\n').forEach((line, index, array) => {
                        els.adminAnnouncementText.appendChild(document.createTextNode(line));
                        if (index < array.length - 1) {
                            els.adminAnnouncementText.appendChild(document.createElement('br'));
                        }
                    });
                }

                els.adminAnnouncementModal.style.display = 'flex';

                // Bottone di conferma
                if (els.btnConfirmAnnouncement) {
                    els.btnConfirmAnnouncement.onclick = () => {
                        localStorage.setItem(STORAGE_LAST_ANNOUNCEMENT_ID, annId);
                        els.adminAnnouncementModal.style.display = 'none';
                    };
                }
            }
        }
    });
};

window.closeWelcomeAndCheckDaily = function() {
    if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'none';
    window.isNewUserWaitingWelcome = false;

    if (typeof window.checkTodayStartupModals === 'function') {
        setTimeout(() => {
            window.checkTodayStartupModals(true);
        }, 300);
    }
};

// --- SISTEMA BUG E ADMIN ---
window.setupBugSystem = function() {
    const badge = document.getElementById('bugsBadge');
    if (!db) return;

    const isTutorRole = (window.courseData && window.courseData.role === 'tutor') || (localStorage.getItem('cwgame_role') === 'tutor');
    if (window.courseData && window.courseData.role === 'tutor') {
        localStorage.setItem('cwgame_role', 'tutor');
    }

    // Rilevamento Admin basato su Permessi Firebase
    db.ref('bugReports').limitToLast(1).once('value').then(snap => {
        window.isAdmin = true;
        if (els.adminBugPanel) els.adminBugPanel.style.display = 'block';
        if (els.btnReadAllBugs) els.btnReadAllBugs.style.display = 'block';
        window.updateAdminBadge();
        window.loadAdminCwgTesterList?.();

        // Listener per Richieste Tutor
        db.ref('tutorRequests').off('value');
        db.ref('tutorRequests').on('value', () => {
            window.updateAdminBadge();
        });
    }).catch((error) => {
        if (error.code === 'PERMISSION_DENIED') {
            window.isAdmin = false;
            // Se l'utente è un Tutor, mostriamo il pannello per accedere alle richieste Tutor
            if (isTutorRole) {
                if (els.adminBugPanel) els.adminBugPanel.style.display = 'block';
                if (els.btnReadAllBugs) els.btnReadAllBugs.style.display = 'none'; // Nasconde i Bug riservati al Dev
                window.updateAdminBadge();

                db.ref('tutorRequests').off('value');
                db.ref('tutorRequests').on('value', () => {
                    window.updateAdminBadge();
                });
            } else {
                if (els.adminBugPanel) els.adminBugPanel.style.display = 'none';
                if (badge) badge.style.display = 'none';
            }
        }
    });

    // 3. Invio Bug (Per tutti)
    if (document.getElementById('btnSendBugReport')) {
        document.getElementById('btnSendBugReport').onclick = () => {
            const textarea = document.getElementById('bugReportText');
            if (!textarea) return;
            const text = textarea.value.trim();
            if (text.length < 5) return showToast("Messaggio troppo breve!");

            db.ref('bugReports').push({
                from: myName,
                fromId: myId,
                username: tgUsername || "N/A",
                msg: text,
                ts: firebase.database.ServerValue.TIMESTAMP,
                date: new Date().toLocaleString('it-IT')
            }).then(() => {
                showToast("Segnalazione inviata! Grazie.");
                textarea.value = "";
            }).catch(() => showToast("Errore nell'invio."));
        };
    }

    // 4. Lettori (Solo Admin)
    if (els.btnReadAllBugs) {
        els.btnReadAllBugs.onclick = () => window.loadAdminBugs();
    }
    if (els.btnReadTutorRequests) {
        els.btnReadTutorRequests.onclick = () => window.loadAdminTutorRequests();
    }

    // --- GESTIONE INVIO ANNUNCIO GLOBALE (ADMIN) ---
    if (els.btnAdminSendAnnouncement) {
        els.btnAdminSendAnnouncement.onclick = () => {
            const title = els.adminAnnTitleInput?.value.trim() || "Comunicazione";
            const text = els.adminAnnTextInput?.value.trim();

            if (!text || text.length < 5) return showToast("Testo annuncio troppo breve!");

            if (confirm("Inviare questo annuncio a TUTTI gli utenti?")) {
                const newId = "ann_" + Date.now(); // ID automatico basato sul tempo
                db.ref('admin_announcement').set({
                    active: true,
                    id: newId,
                    title: title,
                    text: text,
                    ts: firebase.database.ServerValue.TIMESTAMP
                }).then(() => {
                    // Segnamo l'annuncio come già letto per l'admin stesso, così non gli appare il pop-up
                    localStorage.setItem(STORAGE_LAST_ANNOUNCEMENT_ID, newId);
                    showToast("Annuncio pubblicato con successo! 🚀");
                    if (els.adminAnnTitleInput) els.adminAnnTitleInput.value = "";
                    if (els.adminAnnTextInput) els.adminAnnTextInput.value = "";
                }).catch(err => {
                    console.error("Admin: Error publishing announcement", err);
                    showToast("Errore durante la pubblicazione.");
                });
            }
        };
    }

    if (els.btnAdminClearAnnouncement) {
        els.btnAdminClearAnnouncement.onclick = () => {
            if (confirm("Rimuovere l'annuncio attivo? Non apparirà più a nessuno.")) {
                db.ref('admin_announcement').update({ active: false }).then(() => {
                    showToast("Annuncio rimosso.");
                });
            }
        };
    }

    const btnResetUserDaily = document.getElementById('btnAdminResetUserDaily');
    if (btnResetUserDaily) {
        btnResetUserDaily.onclick = async () => {
            const inputVal = (document.getElementById('adminResetUserInput')?.value || "").trim();
            if (!inputVal) {
                alert("Inserisci lo Username (@mario) o l'Alias dell'utente da sbloccare.");
                return;
            }

            const cleanVal = inputVal.replace('@', '').trim().toLowerCase();
            const today = new Date().toISOString().split('T')[0];
            let targetId = null;
            let targetName = inputVal;

            try {
                // 1. Cerca nei dati di presenza (presence) per Username o Alias / Nome
                const presenceSnap = await db.ref('presence').once('value');
                const presenceData = presenceSnap.val() || {};

                for (const [id, userObj] of Object.entries(presenceData)) {
                    if (!userObj) continue;
                    const uName = (userObj.username || "").toLowerCase();
                    const aliasName = (userObj.name || "").toLowerCase();

                    if ((uName && uName === cleanVal) || (aliasName && (aliasName === cleanVal || aliasName.includes(cleanVal)))) {
                        targetId = id;
                        targetName = userObj.name || userObj.username || id;
                        break;
                    }
                }

                // 2. Se non trovato in presence, cerca direttamente nel nodo users
                if (!targetId) {
                    const usersSnap = await db.ref('users').once('value');
                    const usersData = usersSnap.val() || {};
                    for (const [id, userObj] of Object.entries(usersData)) {
                        if (!userObj) continue;
                        const uName = (userObj.username || "").toLowerCase();
                        const aliasName = (userObj.name || userObj.alias || "").toLowerCase();

                        if ((uName && uName === cleanVal) || (aliasName && (aliasName === cleanVal || aliasName.includes(cleanVal)))) {
                            targetId = id;
                            targetName = userObj.name || userObj.alias || userObj.username || id;
                            break;
                        }
                    }
                }

                // 3. Fallback se ha inserito direttamente l'ID numerico
                if (!targetId && !isNaN(inputVal)) {
                    targetId = inputVal;
                }

                if (!targetId) {
                    alert(`Impossibile trovare l'utente per Username/Alias '${inputVal}'. Verifica la scrittura e riprova.`);
                    return;
                }

                if (!confirm(`Sbloccare la Sfida Giornaliera di oggi per '${targetName}'?`)) return;

                await Promise.all([
                    db.ref(`users/${targetId}/daily_attempt`).remove(),
                    db.ref(`leaderboard/daily_challenge/${today}/${targetId}`).remove()
                ]);

                // Pulizia dello storico di oggi per sbloccare completamente il pop-up all'avvio
                const hSnap = await db.ref(`users/${targetId}/history`).orderByChild('mode').equalTo('daily_challenge').once('value');
                hSnap.forEach(s => {
                    const val = s.val();
                    if (val && val.date && new Date(val.date).toISOString().split('T')[0] === today) {
                        s.ref.remove();
                    }
                });

                showToast(`✓ Sfida Giornaliera sbloccata per '${targetName}'!`);
                alert(`✓ Sfida Giornaliera di oggi sbloccata con successo per '${targetName}'!`);
                if (document.getElementById('adminResetUserInput')) {
                    document.getElementById('adminResetUserInput').value = '';
                }
            } catch(err) {
                console.error("Admin Reset Daily Error:", err);
                alert("Errore sblocco admin: " + err.message);
            }
        };
    }

    // --- TASTO ADMIN: ELIMINAZIONE UTENTE SPECIFICO ---
    const btnDeleteUser = document.getElementById('btnAdminDeleteUser');
    if (btnDeleteUser) {
        btnDeleteUser.onclick = async () => {
            const inputVal = (document.getElementById('adminDeleteUserInput')?.value || "").trim();
            if (typeof window.adminDeleteUserByName === 'function') {
                await window.adminDeleteUserByName(inputVal);
            }
        };
    }

    // --- TASTO ADMIN: BLOCCAMNETO / BAN UTENTE SPECIFICO ---
    const btnBanUser = document.getElementById('btnAdminBanUser');
    if (btnBanUser) {
        btnBanUser.onclick = async () => {
            const inputVal = (document.getElementById('adminDeleteUserInput')?.value || "").trim();
            if (typeof window.adminBanUserByName === 'function') {
                await window.adminBanUserByName(inputVal);
            }
        };
    }

    // --- TASTO ADMIN: PULIZIA UTENTI FANTASMA / INCOMPLETI ---
    const btnCleanupIncomplete = document.getElementById('btnAdminCleanupIncompleteUsers');
    if (btnCleanupIncomplete) {
        btnCleanupIncomplete.onclick = async () => {
            if (typeof window.adminCleanupIncompleteUsers === 'function') {
                await window.adminCleanupIncompleteUsers();
            }
        };
    }

    // --- GESTIONE BETA TESTER ACTIVITY - CWG ---
    window.isUserCwgBetaTester = async function() {
        if (window.isAdmin) return true;
        if (!db || !window.myId) return false;
        try {
            const snap = await db.ref(`appConfig/cwg_beta_users/${window.myId}`).once('value');
            return snap.exists() && snap.val() === true;
        } catch(e) {
            return false;
        }
    };

    window.loadAdminCwgTesterList = function() {
        const listDiv = document.getElementById('adminCwgTesterList');
        if (!listDiv || !db) return;

        db.ref('appConfig/cwg_beta_users').once('value', snap => {
            listDiv.innerHTML = '';
            if (!snap.exists()) {
                listDiv.innerHTML = '<p style="text-align:center; color:var(--hint-color); margin:2px 0;">Nessun Beta Tester registrato. (Attivo per Admin)</p>';
                return;
            }

            const testerIds = Object.keys(snap.val() || {});
            if (testerIds.length === 0) {
                listDiv.innerHTML = '<p style="text-align:center; color:var(--hint-color); margin:2px 0;">Nessun Beta Tester registrato.</p>';
                return;
            }

            testerIds.forEach(id => {
                db.ref(`users/${id}`).once('value', uSnap => {
                    const uData = uSnap.val() || {};
                    const name = uData.alias || uData.name || id;

                    const item = document.createElement('div');
                    item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:3px 5px; border-bottom:1px solid rgba(255,255,255,0.05);";

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = `🧪 ${name} (${id})`;

                    const delBtn = document.createElement('button');
                    delBtn.style.cssText = "background:none; border:none; color:#f44336; cursor:pointer; font-weight:bold; font-size:0.8em;";
                    delBtn.textContent = "✕";
                    delBtn.onclick = () => {
                        db.ref(`appConfig/cwg_beta_users/${id}`).remove().then(() => {
                            showToast(`Tester ${name} rimosso.`);
                            window.loadAdminCwgTesterList();
                        });
                    };

                    item.appendChild(nameSpan);
                    item.appendChild(delBtn);
                    listDiv.appendChild(item);
                });
            });
        });
    };

    window.selectAdminCandidate = function(candidates, actionTitle = "selezionare") {
        if (!candidates || candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        let msg = `Trovati ${candidates.length} utenti corrispondenti:\n\n`;
        candidates.forEach((c, idx) => {
            const uNameStr = c.username ? ` (@${c.username})` : '';
            msg += `${idx + 1}. ${c.name}${uNameStr} - ID: ${c.id}\n`;
        });
        msg += `\nInserisci il NUMERO dell'utente da ${actionTitle} (da 1 a ${candidates.length}):`;

        const choice = prompt(msg);
        if (!choice) return null;
        const choiceNum = parseInt(choice);
        if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > candidates.length) {
            alert("Selezione annullata o non valida.");
            return null;
        }
        return candidates[choiceNum - 1];
    };

    const btnAddTester = document.getElementById('btnAdminAddCwgTester');
    if (btnAddTester) {
        btnAddTester.onclick = async () => {
            const inputVal = (document.getElementById('adminCwgTesterInput')?.value || "").trim();
            if (!inputVal) return alert("Inserisci l'ID Telegram, Alias o Username del Beta Tester da abilitare.");

            const candidates = await window.findAdminUserCandidates(inputVal);
            if (!candidates || candidates.length === 0) {
                return alert(`Nessun utente trovato per '${inputVal}'. Assicurati che l'utente sia entrato almeno una volta nel gioco.`);
            }

            const target = window.selectAdminCandidate(candidates, "abilitare come Beta Tester");
            if (!target) return;

            if (confirm(`Abilitare ${target.name} (ID: ${target.id}) come Beta Tester per Activity - CWG?`)) {
                db.ref(`appConfig/cwg_beta_users/${target.id}`).set(true).then(() => {
                    showToast(`✅ ${target.name} abilitato come Beta Tester!`);
                    if (document.getElementById('adminCwgTesterInput')) document.getElementById('adminCwgTesterInput').value = "";
                    window.loadAdminCwgTesterList();
                });
            }
        };
    }

    const btnRemoveTester = document.getElementById('btnAdminRemoveCwgTester');
    if (btnRemoveTester) {
        btnRemoveTester.onclick = async () => {
            const inputVal = (document.getElementById('adminCwgTesterInput')?.value || "").trim();
            if (!inputVal) return alert("Inserisci l'ID Telegram, Alias o Username del Beta Tester da rimuovere.");

            const candidates = await window.findAdminUserCandidates(inputVal);
            if (!candidates || candidates.length === 0) {
                return alert(`Nessun utente trovato per '${inputVal}'.`);
            }

            const target = window.selectAdminCandidate(candidates, "rimuovere dai Beta Tester");
            if (!target) return;

            if (confirm(`Rimuovere ${target.name} (ID: ${target.id}) dai Beta Tester?`)) {
                db.ref(`appConfig/cwg_beta_users/${target.id}`).remove().then(() => {
                    showToast(`Tester ${target.name} rimosso.`);
                    if (document.getElementById('adminCwgTesterInput')) document.getElementById('adminCwgTesterInput').value = "";
                    window.loadAdminCwgTesterList();
                });
            }
        };
    }

    // --- FUNZIONE ADMIN: RESET SFIDA GIORNALIERA UTENTE SPECIFICO ---
    window.adminResetDailyForUser = async function(targetUserId) {
        if (!targetUserId) {
            targetUserId = prompt("Inserisci l'ID Telegram dell'utente a cui sbloccare la Sfida Giornaliera:");
        }
        if (!targetUserId) return;

        const today = new Date().toISOString().split('T')[0];
        try {
            await Promise.all([
                db.ref(`users/${targetUserId}/daily_attempt`).remove(),
                db.ref(`leaderboard/daily_challenge/${today}/${targetUserId}`).remove()
            ]);
            if (typeof showToast === 'function') showToast(`🔄 Sfida Giornaliera sbloccata per l'utente ${targetUserId}!`);
            alert(`✓ Sfida Giornaliera di oggi sbloccata con successo per l'utente Telegram ID ${targetUserId}!`);
        } catch(err) {
            console.error("Admin Reset Daily Error:", err);
            alert("Errore sblocco admin: " + err.message);
        }
    };

    // --- HELPER DI RICERCA UNIVERSALE UTENTI ADMIN ---
    window.findAdminUserCandidates = async function(inputVal) {
        const cleanVal = inputVal.replace('@', '').trim().toLowerCase();
        let candidates = new Map();

        // 1. Cerca nei dati di presenza online
        try {
            const presenceSnap = await db.ref('presence').once('value');
            if (presenceSnap.exists()) {
                for (const [id, userObj] of Object.entries(presenceSnap.val() || {})) {
                    if (!userObj) continue;
                    const uName = (userObj.username || "").toLowerCase();
                    const aliasName = (userObj.name || "").toLowerCase();

                    const matchesName = (aliasName && (aliasName === cleanVal || aliasName.includes(cleanVal)));
                    const matchesUser = (uName && (uName === cleanVal || uName.includes(cleanVal)));
                    const matchesGeneric = (cleanVal.includes('giocat') || cleanVal.includes('anonim')) && (!aliasName || aliasName.includes('giocat') || aliasName.includes('anonim'));
                    const matchesId = (id === cleanVal || id.includes(cleanVal));

                    if (matchesName || matchesUser || matchesGeneric || matchesId) {
                        candidates.set(id, {
                            id: id,
                            name: userObj.name || userObj.username || "Giocatore / Anonimo",
                            username: userObj.username || ""
                        });
                    }
                }
            }
        } catch(e) {}

        // 2. Cerca nei profili users
        try {
            const usersSnap = await db.ref('users').once('value');
            if (usersSnap.exists()) {
                for (const [id, userObj] of Object.entries(usersSnap.val() || {})) {
                    if (!userObj) continue;
                    const uName = (userObj.username || "").toLowerCase();
                    const aliasName = (userObj.alias || userObj.assignedDefaultName || "").toLowerCase();

                    const matchesName = (aliasName && (aliasName === cleanVal || aliasName.includes(cleanVal)));
                    const matchesUser = (uName && (uName === cleanVal || uName.includes(cleanVal)));
                    const matchesGeneric = (cleanVal.includes('giocat') || cleanVal.includes('anonim')) && (!aliasName || aliasName.includes('giocat') || aliasName.includes('anonim'));
                    const matchesId = (id === cleanVal || id.includes(cleanVal));

                    if (matchesName || matchesUser || matchesGeneric || matchesId) {
                        if (!candidates.has(id)) {
                            candidates.set(id, {
                                id: id,
                                name: userObj.alias || userObj.assignedDefaultName || userObj.username || "Giocatore / Anonimo",
                                username: userObj.username || ""
                            });
                        }
                    }
                }
            }
        } catch(e) {}

        if (candidates.size === 0 && !isNaN(inputVal.trim())) {
            const cleanId = inputVal.trim();
            candidates.set(cleanId, { id: cleanId, name: inputVal.trim(), username: "" });
        }

        return Array.from(candidates.values());
    };

    // --- FUNZIONE ADMIN: ELIMINAZIONE UTENTE PER NOME / ALIAS ---
    window.adminDeleteUserByName = async function(inputVal) {
        if (!inputVal || inputVal.trim() === "") {
            alert("Inserisci il Nome, Alias o Username dell'utente da eliminare.");
            return;
        }

        try {
            // Garantisce il mapping di sicurezza Admin prima di qualsiasi rimozione
            if (firebase.auth().currentUser && window.myId) {
                await db.ref(`uid_mapping/${firebase.auth().currentUser.uid}`).set(window.myId).catch(() => {});
            }

            if (typeof showToast === 'function') showToast("Ricerca utenti nel database...");
            const candidates = await window.findAdminUserCandidates(inputVal);

            if (candidates.length === 0) {
                alert(`❌ Impossibile trovare l'utente per '${inputVal}'. Verifica la scrittura o inserisci direttamente l'ID Telegram.`);
                return;
            }

            let selectedUser = candidates[0];
            if (candidates.length > 1) {
                const listTxt = candidates.map((c, idx) => `${idx + 1}) ${c.name} (ID: ${c.id})`).join('\n');
                const selIdx = prompt(`Trovati ${candidates.length} utenti corrispondenti per '${inputVal}':\n\n${listTxt}\n\nInserisci il numero dell'utente da eliminare (1-${candidates.length}):`);
                const parsedIdx = parseInt(selIdx) - 1;
                if (!isNaN(parsedIdx) && candidates[parsedIdx]) {
                    selectedUser = candidates[parsedIdx];
                } else {
                    return; // Annullato o selezione non valida
                }
            }

            const targetId = selectedUser.id;
            const targetName = selectedUser.name;
            const targetUsername = selectedUser.username;

            // FINESTRA DI CONFERMA SICUREZZA ADMIN
            const userDetailsText = `⚠️ CONFERMA ELIMINAZIONE UTENTE (ADMIN)\n\nUtente Trovato:\n👤 Nome / Alias: ${targetName}\n🆔 Telegram ID: ${targetId}\n${targetUsername ? '💬 Username: @' + targetUsername + '\n' : ''}\nSei assolutamente sicuro di voler ELIMINARE DEFINITIVAMENTE tutti i dati, classifiche, storico e profilo di questo utente?`;

            if (!confirm(userDetailsText)) return;
            if (!confirm(`🛑 CONFERMA FINALE: Eliminare l'utente '${targetName}' (ID: ${targetId})? L'operazione NON può essere annullata.`)) return;

            if (typeof showToast === 'function') showToast("Eliminazione dati utente in corso...");

            const safeRemove = (ref) => ref.remove().catch(e => console.warn("Safe remove note:", e));

            // 1. Pulizia Classifiche e Leaderboard
            const categories = ['standard', 'chars', 'quiz', 'pingpong', 'callsign', 'arcade', 'la_torre'];
            for (const cat of categories) {
                try {
                    const catSnap = await db.ref(`leaderboard/${cat}`).once('value');
                    if (catSnap.exists()) {
                        catSnap.forEach(subNode => {
                            if (subNode.hasChild(targetId)) safeRemove(subNode.child(targetId).ref);
                        });
                    }
                } catch(e) {}
            }

            // 2. Pulizia Nodi Utente
            await Promise.all([
                safeRemove(db.ref(`users/${targetId}`)),
                safeRemove(db.ref(`presence/${targetId}`)),
                safeRemove(db.ref(`courseActiveEnrollments/${targetId}`)),
                safeRemove(db.ref(`invites/${targetId}`)),
                safeRemove(db.ref(`invite_accepted/${targetId}`))
            ]);

            // 3. Pulizia Richieste Tutor
            try {
                const tutorReqSnap = await db.ref('tutorRequests').once('value');
                if (tutorReqSnap.exists()) {
                    tutorReqSnap.forEach(child => {
                        if (child.val() && child.val().uid === targetId) safeRemove(child.ref);
                    });
                }
            } catch(e) {}

            if (typeof showToast === 'function') showToast(`✅ Utente '${targetName}' (ID: ${targetId}) eliminato con successo!`);
            alert(`✅ Utente '${targetName}' (ID: ${targetId}) rimosso definitivamente dal database!`);

            // Pulisce la cache locale delle presenze e forza il refresh dell'elenco utenti
            if (typeof window.removeUserListItem === 'function') window.removeUserListItem(targetId);
            if (typeof window.refreshOnlineUsersList === 'function') window.refreshOnlineUsersList();

            const inputEl = document.getElementById('adminDeleteUserInput');
            if (inputEl) inputEl.value = "";

        } catch(err) {
            console.error("Admin Delete User Error:", err);
            alert("Errore eliminazione utente: " + err.message);
        }
    };

    window.adminBanUserByName = async function(inputVal) {
        if (!inputVal || inputVal.trim() === "") {
            alert("Inserisci il Nome, Alias o Username dell'utente da bloccare.");
            return;
        }

        try {
            // Garantisce il mapping di sicurezza Admin prima di qualsiasi blocco
            if (firebase.auth().currentUser && window.myId) {
                await db.ref(`uid_mapping/${firebase.auth().currentUser.uid}`).set(window.myId).catch(() => {});
            }

            if (typeof showToast === 'function') showToast("Ricerca utenti per blocco...");
            const candidates = await window.findAdminUserCandidates(inputVal);

            if (candidates.length === 0) {
                alert(`❌ Impossibile trovare l'utente per '${inputVal}'. Verifica la scrittura o inserisci direttamente l'ID Telegram.`);
                return;
            }

            let selectedUser = candidates[0];
            if (candidates.length > 1) {
                const listTxt = candidates.map((c, idx) => `${idx + 1}) ${c.name} (ID: ${c.id})`).join('\n');
                const selIdx = prompt(`Trovati ${candidates.length} utenti corrispondenti per '${inputVal}':\n\n${listTxt}\n\nInserisci il numero dell'utente da BLOCCARE (1-${candidates.length}):`);
                const parsedIdx = parseInt(selIdx) - 1;
                if (!isNaN(parsedIdx) && candidates[parsedIdx]) {
                    selectedUser = candidates[parsedIdx];
                } else {
                    return; // Annullato o selezione non valida
                }
            }

            const targetId = selectedUser.id;
            const targetName = selectedUser.name;

            const confirmText = `⛔ CONFERMA BLOCCO PERMANENTE UTENTE (BAN ADMIN)\n\nUtente Trovato:\n👤 Nome / Alias: ${targetName}\n🆔 Telegram ID: ${targetId}\n\nVuoi inserire questo ID nella BLACKLIST PERMANENTE ed eliminare i suoi dati? L'utente non potrà mai più accedere al gioco.`;
            if (!confirm(confirmText)) return;

            // 1. Salva in Blacklist Permanente su Firebase (Sia su appConfig che su bannedUsers root) ed elimina la presenza
            try {
                const banUpdates = {};
                banUpdates[`appConfig/bannedUsers/${targetId}`] = true;
                banUpdates[`bannedUsers/${targetId}`] = true;
                banUpdates[`presence/${targetId}`] = null;

                await db.ref().update(banUpdates);
            } catch(bErr) {
                console.warn("Atomic Ban write note, running fallback:", bErr);
                await Promise.all([
                    db.ref(`appConfig/bannedUsers/${targetId}`).set(true).catch(() => {}),
                    db.ref(`bannedUsers/${targetId}`).set(true).catch(() => {}),
                    db.ref(`presence/${targetId}`).remove().catch(() => {})
                ]);
            }

            // 2. Pulisce la cache locale delle presenze
            if (window.onlineUsersCache) delete window.onlineUsersCache[targetId];
            if (typeof window.removeUserListItem === 'function') window.removeUserListItem(targetId);
            if (typeof window.refreshOnlineUsersList === 'function') window.refreshOnlineUsersList();

            // 3. Elimina i suoi dati e profilo
            if (typeof window.adminDeleteUserByName === 'function') {
                await window.adminDeleteUserByName(targetId);
            }

            alert(`⛔ Utente '${targetName}' (ID: ${targetId}) BLOCCATO permanentemente e rimosso dal gioco!`);

        } catch(e) {
            console.error("Admin Ban Error:", e);
            alert("Errore blocco utente: " + e.message);
        }
    };

    // --- FUNZIONE ADMIN: PULIZIA AUTOMATICA UTENTI INCOMPLETI FANTASMA ---
    window.adminCleanupIncompleteUsers = async function() {
        if (!confirm("🧹 PULIZIA DATABASE UTENTI INCOMPLETI\n\nVuoi avviare la scansione per trovare e rimuovere tutti gli utenti fantasma che NON hanno completato l'inserimento dell'Alias e NON hanno mai giocato partite?")) return;

        try {
            if (typeof showToast === 'function') showToast("Scansione utenti incompleti in corso...");

            // Garantisce il mapping di sicurezza Admin prima di qualsiasi pulizia
            if (firebase.auth().currentUser && window.myId) {
                await db.ref(`uid_mapping/${firebase.auth().currentUser.uid}`).set(window.myId).catch(() => {});
            }

            const [usersSnap, presenceSnap] = await Promise.all([
                db.ref('users').once('value').catch(() => null),
                db.ref('presence').once('value').catch(() => null)
            ]);

            const usersData = (usersSnap && usersSnap.exists()) ? usersSnap.val() : {};
            const presenceData = (presenceSnap && presenceSnap.exists()) ? presenceSnap.val() : {};

            let incompleteIds = new Set();

            // 1. Controlla profili in users (Ispetta sia l'Alias che la presenza di attività reale)
            for (const [id, userObj] of Object.entries(usersData)) {
                if (!userObj || id === "352908417" || id === window.myId) continue;

                const isGenericName = !userObj.alias || userObj.alias === "Giocatore" || userObj.alias.startsWith("Giocatore") || userObj.alias === "Operatore";
                const hasNoHistory = !userObj.history || Object.keys(userObj.history).length === 0;
                const hasNoScore = !userObj.score || userObj.score === 0;
                const hasNoCourse = !userObj.course || (!userObj.course.active_plan && (!userObj.course.completedLessons || userObj.course.completedLessons.length === 0));

                // E' un fantasma SOLO SE ha un nome generico/mancante E non ha mai giocato/studiato!
                if (isGenericName && hasNoHistory && hasNoScore && hasNoCourse) {
                    incompleteIds.add(id);
                }
            }

            // 2. Controlla presenze in presence (Pulisce presenze orfane di utenti mai registrati)
            for (const [id, userObj] of Object.entries(presenceData)) {
                if (!userObj || id === "352908417" || id === window.myId) continue;
                const userProfile = usersData[id];

                if (!userProfile) {
                    incompleteIds.add(id);
                } else {
                    const isGenericName = !userProfile.alias || userProfile.alias === "Giocatore" || userProfile.alias.startsWith("Giocatore") || userProfile.alias === "Operatore";
                    const hasNoHistory = !userProfile.history || Object.keys(userProfile.history).length === 0;
                    const hasNoScore = !userProfile.score || userProfile.score === 0;
                    if (isGenericName && hasNoHistory && hasNoScore) {
                        incompleteIds.add(id);
                    }
                }
            }

            const targetIds = Array.from(incompleteIds);

            if (targetIds.length === 0) {
                alert("✨ Nessun utente fantasma/incompleto trovato nel database! Il database è già pulito.");
                return;
            }

            const confirmMsg = `🧹 RILEVATI ${targetIds.length} UTENTI FANTASMA INCOMPLETI (Senza Alias e con 0 Partite):\n\n` +
                targetIds.slice(0, 10).map(id => `• ID: ${id}`).join('\n') +
                (targetIds.length > 10 ? `\n... ed altri ${targetIds.length - 10} utenti` : "") +
                `\n\nVuoi ELIMINARE DEFINITIVAMENTE dal database queste ${targetIds.length} schede fantasma?`;

            if (!confirm(confirmMsg)) return;

            if (typeof showToast === 'function') showToast(`Rimozione di ${targetIds.length} profili in corso...`);

            for (const targetId of targetIds) {
                const atomicDelete = {};
                atomicDelete[`users/${targetId}`] = null;
                atomicDelete[`presence/${targetId}`] = null;
                atomicDelete[`courseActiveEnrollments/${targetId}`] = null;

                try {
                    await db.ref().update(atomicDelete);
                } catch(e) {
                    await Promise.all([
                        db.ref(`users/${targetId}`).remove().catch(() => {}),
                        db.ref(`presence/${targetId}`).remove().catch(() => {}),
                        db.ref(`courseActiveEnrollments/${targetId}`).remove().catch(() => {})
                    ]);
                }

                if (window.onlineUsersCache) delete window.onlineUsersCache[targetId];
                if (typeof window.removeUserListItem === 'function') window.removeUserListItem(targetId);
            }

            if (typeof window.refreshOnlineUsersList === 'function') window.refreshOnlineUsersList();

            alert(`✅ Pulizia completata! Rimosse ${targetIds.length} schede utente incomplete dal database.`);
            if (typeof showToast === 'function') showToast(`✅ Rimosse ${targetIds.length} schede utente fantasma.`);

        } catch(err) {
            console.error("Admin Cleanup Error:", err);
            alert("Errore durante la pulizia: " + err.message);
        }
    };

    // --- TASTO DEV: RESET SFIDA GIORNALIERA PERSONALE ---
    if (els.btnDevResetDaily) {
        els.btnDevResetDaily.onclick = async () => {
            if (!confirm("Sei lo Sviluppatore. Vuoi resettare la tua sfida di oggi?")) return;
            const today = new Date().toISOString().split('T')[0];

            try {
                // 1. Rimuove dalla classifica
                await db.ref(`leaderboard/daily_challenge/${today}/${myId}`).remove();

                // 2. Rimuove dallo storico
                const hSnap = await db.ref(`users/${myId}/history`).orderByChild('mode').equalTo('daily_challenge').once('value');
                hSnap.forEach(s => {
                    const val = s.val();
                    if (val && val.date && new Date(val.date).toISOString().split('T')[0] === today) {
                        s.ref.remove();
                    }
                });

                // 3. Pulisce cache locale
                localStorage.removeItem(STORAGE_DAILY_STATUS_KEY);

                showToast("Sfida resettata! Ricarica l'app.");
                setTimeout(() => location.reload(), 1000);
            } catch(e) { alert("Errore: " + e.message); }
        };
    }
};

window.updateAdminBadge = async function() {
    const badge = document.getElementById('bugsBadge');
    if (!db) return;

    let unreadBugsCount = 0;
    let pendingTutorRequestsCount = 0;

    const lastSeenBugTs = parseInt(localStorage.getItem('cw_last_bug_ts') || 0);

    // 1. Lettura Bug Reports (Solo se Admin)
    try {
        if (window.isAdmin) {
            const bugsSnap = await db.ref('bugReports').once('value');
            if (bugsSnap && bugsSnap.exists()) {
                bugsSnap.forEach(c => {
                    if (c.val() && c.val().ts > lastSeenBugTs) unreadBugsCount++;
                });
            }
        }
    } catch(e) {}

    // 2. Lettura Richieste Tutor (Accessibile ai Tutor/Admin)
    try {
        const tutorSnap = await db.ref('tutorRequests').once('value');
        if (tutorSnap && tutorSnap.exists()) {
            const requests = tutorSnap.val() || {};
            Object.values(requests).forEach(req => {
                if (req) {
                    if (!req.tutorId || req.tutorId === window.myId || window.isAdmin) {
                        pendingTutorRequestsCount++;
                    }
                }
            });
        }
    } catch(e) {}

    const totalBadgeCount = unreadBugsCount + pendingTutorRequestsCount;

    if (badge) {
        if (totalBadgeCount > 0) {
            badge.textContent = totalBadgeCount;
            badge.style.display = 'flex';
            badge.classList.add('badge-active');
        } else {
            badge.style.display = 'none';
            badge.classList.remove('badge-active');
        }
    }
};

window.loadAdminBugs = function() {
    const list = document.getElementById('adminBugList');
    if (!list) return;

    localStorage.setItem('cw_last_bug_ts', Date.now());
    window.updateAdminBadge();

    list.innerHTML = "Caricamento...";
    db.ref('bugReports').once('value', snap => {
        list.innerHTML = "";
        if (!snap.exists()) { list.innerHTML = "Nessuna segnalazione."; return; }
        snap.forEach(child => {
            const bug = child.val();
            const item = document.createElement('div');
            item.style.padding = "8px";
            item.style.borderBottom = "1px solid var(--hint-color)";

            // Header: Utente
            const header = document.createElement('div');
            header.style.color = "var(--link-color)";
            header.style.fontWeight = "bold";
            header.textContent = `👤 ${bug.from || "Anonimo"} (@${bug.username || "N/A"})`;

            // Data
            const dateDiv = document.createElement('div');
            dateDiv.style.fontSize = "0.7em";
            dateDiv.style.color = "var(--hint-color)";
            dateDiv.textContent = bug.date || "";

            // Messaggio
            const msgDiv = document.createElement('div');
            msgDiv.style.marginTop = "4px";
            msgDiv.style.whiteSpace = "pre-wrap";
            msgDiv.textContent = bug.msg || "";

            // Area Bottoni
            const btnArea = document.createElement('div');
            btnArea.style.display = "flex";
            btnArea.style.gap = "8px";
            btnArea.style.marginTop = "5px";

            // Tasto Rispondi
            const replyBtn = document.createElement('button');
            replyBtn.style.cssText = "flex:1; font-size:0.7em; background:var(--link-color); color:white; border:none; border-radius:4px; padding:6px; cursor:pointer;";
            replyBtn.textContent = "Rispondi";
            replyBtn.onclick = () => window.openBugReply(child.key, bug.fromId, bug.msg);

            // Tasto Elimina
            const delBtn = document.createElement('button');
            delBtn.style.cssText = "flex:1; font-size:0.7em; background:#d32f2f; color:white; border:none; border-radius:4px; padding:6px; cursor:pointer;";
            delBtn.textContent = "Elimina";
            delBtn.onclick = () => {
                if (confirm('Eliminare definitivamente questa segnalazione?')) {
                    db.ref(`bugReports/${child.key}`).remove().then(() => {
                        item.remove();
                        showToast('Eliminato');
                        window.updateAdminBadge();
                    }).catch(e => {
                        console.error("Delete Error:", e);
                        alert("Errore permessi Firebase: " + e.message);
                    });
                }
            };

            item.appendChild(header);
            item.appendChild(dateDiv);
            item.appendChild(msgDiv);
            btnArea.appendChild(replyBtn);
            btnArea.appendChild(delBtn);
            item.appendChild(btnArea);
            list.prepend(item);
        });
    });
};

window.openBugReply = function(bugKey, userId, originalMsg) {
    if (!userId) return alert("Impossibile rispondere: ID utente mancante.");
    const replyText = prompt(`Invia feedback per: "${originalMsg.substring(0, 30)}..."\n\nScrivi la tua risposta:`);
    if (!replyText || replyText.trim() === "") return;

    const feedbackData = {
        reply: replyText.trim(),
        originalMsg: originalMsg,
        ts: firebase.database.ServerValue.TIMESTAMP,
        date: new Date().toLocaleString('it-IT')
    };

    const performUpload = (attempts = 0) => {
        db.ref(`users/${userId}/bugFeedback`).push(feedbackData).then(() => {
            showToast("Risposta inviata!");
            // Se inviato, rimuoviamo il bug dalla lista admin
            db.ref(`bugReports/${bugKey}`).remove().catch(() => {});
        }).catch(e => {
            console.error(`Errore invio bugFeedback (Tentativo ${attempts}):`, e);
            if (attempts < 1) {
                console.log("Riprovo l'invio tra 1 secondo...");
                setTimeout(() => performUpload(attempts + 1), 1000);
            } else {
                alert("Errore permessi Firebase: " + e.message + "\n\nSuggerimento: Se il messaggio è molto lungo, prova a dividerlo in due invii.");
            }
        });
    };

    performUpload();
};

window.checkBugFeedback = function() {
    if (!myId) return;
    db.ref(`users/${myId}/bugFeedback`).once('value', snap => {
        if (!snap.exists()) return;

        snap.forEach(child => {
            const feedback = child.val();
            const modal = document.getElementById('bugFeedbackModal');
            const origMsg = document.getElementById('feedbackOriginalMsg');
            const replyText = document.getElementById('feedbackReplyText');
            const closeBtn = document.getElementById('btnCloseFeedbackModal');

            if (modal && origMsg && replyText && closeBtn) {
                origMsg.textContent = `"${feedback.originalMsg}"`;
                replyText.textContent = feedback.reply;

                setTimeout(() => {
                    modal.style.display = 'flex';
                }, 2000);

                closeBtn.onclick = () => {
                    modal.style.display = 'none';
                    db.ref(`users/${myId}/bugFeedback/${child.key}`).remove();
                };
            }
        });
    });
};

window.loadAdminTutorRequests = function() {
    const list = document.getElementById('adminBugList');
    if (!list) return;
    list.innerHTML = "<p style='text-align:center; padding:10px; color:var(--hint-color);'>Caricamento richieste...</p>";

    db.ref('tutorRequests').once('value', snap => {
        list.innerHTML = "";
        if (!snap.exists()) {
            list.innerHTML = "<p style='text-align:center; padding:10px; color:var(--hint-color);'>Nessuna richiesta pendente.</p>";
            return;
        }

        let count = 0;
        snap.forEach(child => {
            const req = child.val();
            if (!req) return;

            const isStudentReq = (req.type === 'student_assignment' || !!req.tutorId);
            const isForMe = (req.tutorId === window.myId) || (!req.tutorId && window.isAdmin) || window.isAdmin;

            if (!isForMe) return;

            count++;
            const item = document.createElement('div');
            item.style.padding = "10px";
            item.style.borderBottom = "1px solid #673ab7";
            item.style.background = "rgba(103, 58, 183, 0.05)";
            item.style.marginBottom = "6px";
            item.style.borderRadius = "8px";

            const title = document.createElement('div');
            title.style.fontWeight = "bold";
            title.style.color = "#9575cd";
            title.textContent = isStudentReq ? `🎓 Scelta Tutor da: ${req.name || "Anonimo"}` : `🎓 Richiesta Ruolo Tutor: ${req.name || "Anonimo"}`;

            const info = document.createElement('div');
            info.style.fontSize = "0.75em";
            info.style.color = "var(--hint-color)";
            info.textContent = isStudentReq
                ? `L'operatore ${req.name || "Corsista"} (@${req.username || "N/A"}) ti ha scelto come Tutor per il Corso CW.`
                : `ID: ${req.uid || ""} | @${req.username || "N/A"}`;

            const btnArea = document.createElement('div');
            btnArea.style.display = "flex";
            btnArea.style.gap = "10px";
            btnArea.style.marginTop = "8px";

            const approveBtn = document.createElement('button');
            approveBtn.style.cssText = "flex:1; background:#4caf50; color:white; border:none; border-radius:4px; padding:6px; cursor:pointer; font-size:0.8em; font-weight:bold;";
            approveBtn.textContent = isStudentReq ? "ACCETTA CORSISTA ✅" : "APPROVA TUTOR ✅";

            approveBtn.onclick = () => {
                if (isStudentReq) {
                    window.acceptStudentAssignment(child.key, req.uid, req.name, req.tutorId);
                } else {
                    window.approveTutor(child.key, req.uid, req.name);
                }
            };

            const rejectBtn = document.createElement('button');
            rejectBtn.style.cssText = "flex:1; background:#d32f2f; color:white; border:none; border-radius:4px; padding:6px; cursor:pointer; font-size:0.8em; font-weight:bold;";
            rejectBtn.textContent = "RIFIUTA ❌";
            rejectBtn.onclick = () => {
                if (confirm('Rifiutare questa richiesta?')) {
                    db.ref(`tutorRequests/${child.key}`).remove().then(() => {
                        window.updateAdminBadge();
                        item.remove();
                        if (list.children.length === 0) list.innerHTML = "<p style='text-align:center; padding:10px; color:var(--hint-color);'>Nessuna richiesta pendente.</p>";
                    });
                }
            };

            btnArea.appendChild(approveBtn);
            btnArea.appendChild(rejectBtn);
            item.appendChild(title);
            item.appendChild(info);
            item.appendChild(btnArea);
            list.prepend(item);
        });

        if (count === 0) {
            list.innerHTML = "<p style='text-align:center; padding:10px; color:var(--hint-color);'>Nessuna richiesta pendente per te.</p>";
        }
    });
};

window.acceptStudentAssignment = function(reqId, studentUid, studentName, tutorId) {
    if (!confirm(`Accettare ${studentName} come tuo corsista?`)) return;

    db.ref(`users/${studentUid}/course`).update({
        tutor_id: window.myId
    }).then(() => {
        db.ref(`tutorRequests/${reqId}`).remove();
        showToast(`✅ Corsista ${studentName} assegnato a te!`);

        if (typeof sendPushNotification === 'function') {
            const notifMsg = `🎓 Il Tutor ${window.myName} ha accettato la tua richiesta! Ora sei seguito direttamente.`;
            sendPushNotification(studentUid, notifMsg);
        }

        window.updateAdminBadge();
        window.loadAdminTutorRequests();
    }).catch(e => {
        showToast("Errore durante l'assegnazione.");
    });
};

window.approveTutor = function(reqId, uid, name) {
    if (!confirm(`Approvare ${name} come TUTOR?`)) return;

    // 1. Imposta ruolo nell'utente
    db.ref(`users/${uid}/course`).update({
        role: 'tutor',
        active_plan: true,
        enrolledAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        // 2. Registra nell'elenco globale iscritti (per visibilità tutor)
        db.ref(`courseActiveEnrollments/${uid}`).set({
            name: name,
            role: 'tutor',
            ts: firebase.database.ServerValue.TIMESTAMP
        });
        // 3. Rimuovi la richiesta
        db.ref(`tutorRequests/${reqId}`).remove();
        showToast(`Operatore ${name} approvato come Tutor!`);
        document.getElementById('btnReadTutorRequests').click(); // Refresh
    }).catch(e => {
        showToast("Errore durante l'approvazione.");
    });
};

// --- SFIDA GIORNALIERA ---
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.onclick = () => {
        if (els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';

        // Reset preventivo per evitare conflitti con altre modalità (es. corso)
        window.resetGameState();

        window.currentMode = 'daily_challenge';
        window.isSinglePlayer = true;
        currentWpm = baseWpm = 15;
        requestedWordCount = 100;
        window.requestedWordCount = 100;

        // USA ID UNIVOCO ANCHE PER LA SFIDA GIORNALIERA (Pre-carica fino a 100 parole giornaliere)
        roomCode = "DAILY_" + window.myId;
        gameWords = window.getDailyWords(100);
        currentTone = parseInt(localStorage.getItem(STORAGE_PREF_TONE)) || 600;

        const startDaily = () => {
            // SEGNIAMO IL TENTATIVO IMMEDIATAMENTE PER EVITARE REPLAY IN CASO DI ABBANDONO/RELOAD
            let today = window.getLocalDateString();
            db.ref(`users/${myId}/daily_attempt`).set(today);
            localStorage.setItem(STORAGE_DAILY_STATUS_KEY, today);

            const dailyData = {
                status: 'countdown',
                type: 'single',
                mode: window.currentMode,
                wpm: currentWpm,
                tone: currentTone,
                wordCount: requestedWordCount,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                hostId: myId,
                fixedSpeed: false,
                easyMode: false,
                game_words: gameWords // Inseriamo le parole atomicamente
            };

            db.ref('rooms/' + roomCode).set(dailyData).then(() => {
                window.joinRoomLogic?.(false);
            })
            .catch(err => {
                console.error("Daily Challenge Start Error:", err);
                showToast("Errore avvio sfida. Riprova tra un istante.");
            });
        };

        // Per utenti nuovi, diamo un piccolo margine extra per la propagazione dei permessi Firebase
        if (window.isNewUserWaitingWelcome === false) {
            setTimeout(startDaily, 800);
        } else {
            startDaily();
        }
    };
}
if (els.btnShareDaily) {
    els.btnShareDaily.onclick = () => {
        const text = `🏆 Ho completato la Sfida Giornaliera Morse!\n🎯 Punteggio: ${totalScore} pt\n🚀 Velocità di picco: ${peakWpm} WPM\n\nProva anche tu su Sfida Telegrafia! 📻\n@${BOT_USERNAME}`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}`)}&text=${encodeURIComponent(text)}`;
        if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    };
}

if (els.btnPlayDailyLater) els.btnPlayDailyLater.onclick = () => {
    sessionStorage.setItem("cwgame_daily_later_session", "true");
    if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';
    if (typeof window.checkTodayStartupModals === 'function') window.checkTodayStartupModals(true);
};
if (els.btnDeclineDaily) els.btnDeclineDaily.onclick = () => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem(STORAGE_DAILY_STATUS_KEY, todayStr);
    db.ref(`users/${myId}/daily_attempt`).set(todayStr);
    if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';
    if (typeof window.checkTodayStartupModals === 'function') window.checkTodayStartupModals(true);
};

window.allowReplayDailyChallenge = function() {
    localStorage.removeItem(STORAGE_DAILY_STATUS_KEY);

    const resetAndOpenModal = () => {
        showToast("🔄 Sfida Giornaliera riattivata! Buona fortuna...");
        if (els.leaderboardScreen) els.leaderboardScreen.classList.remove('active-screen');
        if (typeof window.loadDailyYesterdayPodium === 'function') window.loadDailyYesterdayPodium();
        const modal = document.getElementById('dailyChallengeModal');
        if (modal) modal.style.display = 'flex';
    };

    if (typeof db !== 'undefined' && db && window.myId) {
        db.ref(`users/${window.myId}/daily_attempt`).remove()
            .then(resetAndOpenModal)
            .catch(err => {
                console.warn("Replay Daily Attempt Remove Error:", err);
                resetAndOpenModal();
            });
    } else {
        resetAndOpenModal();
    }
};

window.reopenDailyChallenge = function() {
    localStorage.removeItem("cwgame_daily_later");
    if (!db || !window.myId) {
        showToast("⚠️ Connessione in corso, riprova tra poco.");
        return;
    }

    const today = window.getLocalDateString();

    db.ref(`users/${window.myId}/history`).once('value').then(snap => {
        const history = snap.val() || {};
        let playedAndScoredToday = false;

        Object.values(history).forEach(m => {
            if (m && m.mode === 'daily_challenge' && m.date) {
                const mDate = window.getLocalDateString(m.date);
                if (mDate === today) playedAndScoredToday = true;
            }
        });

        if (playedAndScoredToday) {
            alert("🏆 Hai già completato la Sfida Giornaliera di oggi!\nI record della Sfida Giornaliera si calcolano su una singola prova al giorno.");
            return;
        }

        // Resettiamo il flag di rifiuto/annullamento accidentale
        localStorage.removeItem(STORAGE_DAILY_STATUS_KEY);
        db.ref(`users/${window.myId}/daily_attempt`).remove().then(() => {
            showToast("📅 Sfida Giornaliera riattivata! Preparati...");
            if (typeof window.loadDailyYesterdayPodium === 'function') window.loadDailyYesterdayPodium();
            const modal = document.getElementById('dailyChallengeModal');
            if (modal) {
                modal.style.display = 'flex';
            }
        });
    }).catch(err => {
        console.error("Reopen Daily Challenge Error:", err);
        localStorage.removeItem(STORAGE_DAILY_STATUS_KEY);
        db.ref(`users/${window.myId}/daily_attempt`).remove();
        const modal = document.getElementById('dailyChallengeModal');
        if (modal) modal.style.display = 'flex';
    });
};

// --- SFIDA TRIPLA GIORNALIERA (MATTINA, POMERIGGIO, SERA) ---

window.closeTriDailyModalLater = function() {
    const slotInfo = typeof window.getTriDailySlot === 'function' ? window.getTriDailySlot() : { id: 'morning' };
    sessionStorage.setItem(`cwgame_tri_later_session_${slotInfo.id}`, "true");
    const modal = document.getElementById('triDailyModal');
    if (modal) modal.style.display = 'none';
};

window.declineTriDailyToday = function() {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem("cwgame_tri_daily_decline", todayStr);
    localStorage.setItem("cwgame_tri_daily_shown", todayStr);
    const modal = document.getElementById('triDailyModal');
    if (modal) modal.style.display = 'none';
    if (typeof showToast === 'function') {
        showToast("Sfida Tripla rimandata per oggi. Puoi riaprirla quando vuoi dal menu!");
    }
};

window.openTriDailyHub = function() {
    const modal = document.getElementById('triDailyModal');
    if (!modal) return;
    modal.style.display = 'flex';
    window.renderTriDailyHubCards();
};

window.renderTriDailyHubCards = function() {
    const cardsContainer = document.getElementById('triDailyCardsContainer');
    const totalScoreEl = document.getElementById('triDailyHubTotalScore');
    const completedSlotsEl = document.getElementById('triDailyHubCompletedSlots');
    if (!cardsContainer) return;

    const todayStr = window.getLocalDateString();
    const currentSlot = typeof window.getTriDailySlot === 'function' ? window.getTriDailySlot() : { id: 'morning' };

    cardsContainer.innerHTML = '<p style="font-size:0.85em; color:var(--hint-color);">Caricamento dati sfida...</p>';

    db.ref(`users/${window.myId}/tri_daily_attempt/${todayStr}`).once('value', snap => {
        const attemptData = snap.val() || {};
        let totalScore = 0;
        let completedCount = 0;

        const slots = [
            { id: 'morning', name: '☀️ Mattina (06:00 - 12:00)', words: 10, step: '+3 WPM' },
            { id: 'afternoon', name: '🌤️ Pomeriggio (12:00 - 18:00)', words: 15, step: '+2 WPM' },
            { id: 'evening', name: '🌙 Sera (18:00 - 24:00)', words: 20, step: '+1 WPM' }
        ];

        cardsContainer.innerHTML = '';

        slots.forEach(s => {
            const slotObj = attemptData[s.id] || {};
            const isPlayed = !!slotObj.played;
            const isCompleted = !!slotObj.completed;
            const isWithdrawn = !!slotObj.withdrawn;
            const isInterrupted = isPlayed && !isCompleted && !isWithdrawn;
            const score = slotObj.score || 0;
            const finalWpm = slotObj.finalWpm || slotObj.peakWpm || 0;

            if (isCompleted || isWithdrawn) {
                localStorage.setItem(`cwgame_tri_played_${todayStr}_${s.id}`, "true");
            }
            if (isCompleted || isPlayed) {
                totalScore += score;
                completedCount++;
            }

            const card = document.createElement('div');
            card.style.cssText = "background: rgba(255,255,255,0.05); border-radius: 10px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); text-align: left;";

            const topRow = document.createElement('div');
            topRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;";

            const nameB = document.createElement('b');
            nameB.style.cssText = "color:var(--text-color); font-size:0.9em;";
            nameB.textContent = s.name;
            topRow.appendChild(nameB);

            const badgeSpan = document.createElement('span');
            badgeSpan.style.cssText = "font-weight:bold; font-size:0.8em; float:right;";
            if (isWithdrawn) {
                badgeSpan.style.color = "#f44336";
                badgeSpan.textContent = "🏃 Rinunciata";
            } else if (isCompleted) {
                badgeSpan.style.color = "#4caf50";
                badgeSpan.textContent = `✅ ${score} pt (${finalWpm} WPM)`;
            } else if (isInterrupted) {
                badgeSpan.style.color = "#ff9800";
                badgeSpan.textContent = "⚠️ Interrotta (Riprendi)";
            } else if (currentSlot.id === s.id) {
                badgeSpan.style.color = "#ff9800";
                badgeSpan.style.animation = "pulse 1.5s infinite";
                badgeSpan.textContent = "🚀 IN CORSO";
            } else if (currentSlot.id === 'night') {
                badgeSpan.style.color = "#9e9e9e";
                badgeSpan.textContent = "🌌 Riposo";
            } else {
                badgeSpan.style.color = "#9e9e9e";
                badgeSpan.textContent = "🔒 Non Attiva";
            }
            topRow.appendChild(badgeSpan);
            card.appendChild(topRow);

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = "font-size:0.75em; color:var(--hint-color);";
            infoDiv.textContent = `${s.words} Parole | Incremento WPM: ${s.step}`;
            card.appendChild(infoDiv);

            if (currentSlot.id === s.id && (!isCompleted || isInterrupted) && !isWithdrawn) {
                const btnDiv = document.createElement('div');
                btnDiv.style.cssText = "display:flex; gap:8px; margin-top:10px;";

                const startBtnEl = document.createElement('button');
                startBtnEl.className = "btn-success";
                startBtnEl.style.cssText = "flex:2; padding:8px; font-size:0.85em; margin:0;";
                startBtnEl.textContent = isInterrupted ? `🔄 RIPRENDI SESSIONE (${s.words} PAROLE) 🚀` : `INIZIA SESSIONE (${s.words} PAROLE) 🚀`;
                startBtnEl.onclick = () => window.showTriDailyPreview(s.id);

                const withdrawBtnEl = document.createElement('button');
                withdrawBtnEl.className = "btn-danger";
                withdrawBtnEl.style.cssText = "flex:1; padding:8px; font-size:0.8em; margin:0;";
                withdrawBtnEl.textContent = "🏃 Ritirati";
                withdrawBtnEl.onclick = () => window.withdrawTriDailySession(s.id);

                btnDiv.appendChild(startBtnEl);
                btnDiv.appendChild(withdrawBtnEl);
                card.appendChild(btnDiv);
            }

            cardsContainer.appendChild(card);
        });

        if (totalScoreEl) totalScoreEl.textContent = `${totalScore} pt`;
        if (completedSlotsEl) completedSlotsEl.textContent = `${completedCount} / 3`;
    });
};

window.showTriDailyPreview = function(slotId) {
    const hub = document.getElementById('triDailyModal');
    if (hub) hub.style.display = 'none';

    const previewModal = document.getElementById('triDailyPreviewModal');
    const previewList = document.getElementById('triDailyPreviewList');
    const previewTitle = document.getElementById('triDailyPreviewTitle');
    const previewMsg = document.getElementById('triDailyPreviewMsg');
    const startBtn = document.getElementById('btnTriDailyStartConfirm');
    const withdrawBtn = document.getElementById('btnTriDailyWithdraw');

    if (!previewModal || !previewList) return;
    previewModal.style.display = 'flex';
    previewList.innerHTML = '<p style="text-align:center; color:var(--hint-color);">Caricamento classifica provvisoria...</p>';

    const todayStr = window.getLocalDateString();
    const slotInfo = typeof window.getTriDailySlot === 'function' ? window.getTriDailySlot() : { labelIt: 'Sessione', wordCount: 10 };

    if (previewTitle) previewTitle.textContent = `🔥 Classifica Provvisoria (${slotInfo.labelIt})`;

    db.ref(`leaderboard/tri_daily/${todayStr}`).orderByChild('totalScore').limitToLast(10).once('value', snap => {
        previewList.innerHTML = '';
        const list = [];
        snap.forEach(c => {
            list.unshift({ id: c.key, ...c.val() });
        });

        if (list.length === 0) {
            previewList.innerHTML = '<p style="text-align:center; color:var(--hint-color); padding:10px;">Sei il primo a giocare in questo slot! Fai una grande prestazione per guidare la classifica! 🚀</p>';
        } else {
            list.forEach((item, idx) => {
                const rank = idx + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                const name = item.name || 'Telegrafista';
                const score = item.totalScore || 0;
                const isMe = (item.id === window.myId);

                const row = document.createElement('div');
                row.style.cssText = `display:flex; justify-content:space-between; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05); ${isMe ? 'background:rgba(255,152,0,0.2); font-weight:bold;' : ''}`;

                const nameSpan = document.createElement('span');
                nameSpan.textContent = `${medal} ${name}`;

                const scoreB = document.createElement('b');
                scoreB.style.color = "#ff9800";
                scoreB.textContent = `${score} pt`;

                row.appendChild(nameSpan);
                row.appendChild(scoreB);
                previewList.appendChild(row);
            });
        }

        if (previewMsg) previewMsg.textContent = `Sei pronto per affrontare lo slot ${slotInfo.labelIt} (${slotInfo.wordCount} Parole)?`;
    });

    const laterBtn = document.getElementById('btnTriDailyLater');

    if (startBtn) {
        startBtn.onclick = () => {
            previewModal.style.display = 'none';
            window.startTriDailySession(slotId);
        };
    }

    if (laterBtn) {
        laterBtn.onclick = () => {
            previewModal.style.display = 'none';
            window.openTriDailyHub();
        };
    }

    if (withdrawBtn) {
        withdrawBtn.onclick = () => {
            previewModal.style.display = 'none';
            window.withdrawTriDailySession(slotId);
        };
    }
};

window.withdrawTriDailySession = function(slotId) {
    if (!confirm("Sei sicuro di volerti ritirare da questa sessione della Sfida Tripla? Potrai comunque partecipare alle sessioni successive.")) return;

    const todayStr = window.getLocalDateString();
    localStorage.setItem(`cwgame_tri_played_${todayStr}_${slotId}`, "true");
    db.ref(`users/${window.myId}/tri_daily_attempt/${todayStr}/${slotId}`).set({
        played: true,
        withdrawn: true,
        score: 0,
        timestamp: Date.now()
    }).then(() => {
        showToast("🏃 Ti sei ritirato da questa sessione.");
        window.openTriDailyHub();
    });
};

window.startTriDailySession = function(slotId) {
    window.resetGameState();

    const todayStr = window.getLocalDateString();
    localStorage.setItem(`cwgame_tri_played_${todayStr}_${slotId}`, "true");
    const slotInfo = typeof window.getTriDailySlot === 'function' ? window.getTriDailySlot() : { wordCount: 10, defaultWpm: 15 };

    db.ref(`users/${window.myId}/tri_daily_attempt/${todayStr}`).once('value', snap => {
        const attemptData = snap.val() || {};
        let inheritedWpm = 15;

        if (slotId === 'afternoon') {
            inheritedWpm = attemptData.morning?.finalWpm || attemptData.morning?.peakWpm || 15;
        } else if (slotId === 'evening') {
            inheritedWpm = attemptData.afternoon?.finalWpm || attemptData.afternoon?.peakWpm || attemptData.morning?.finalWpm || 15;
        }

        window.currentMode = 'tri_daily';
        window.currentTriDailySlotId = slotId;
        window.isSinglePlayer = true;
        window.currentWpm = window.baseWpm = inheritedWpm;
        window.requestedWordCount = slotInfo.wordCount || 10;
        window.currentTone = parseInt(localStorage.getItem(STORAGE_PREF_TONE)) || 600;

        roomCode = "SOLO_TRI_" + window.myId;
        gameWords = window.getTriDailyWords(window.requestedWordCount);

        db.ref(`users/${window.myId}/tri_daily_attempt/${todayStr}/${slotId}`).update({
            played: true,
            score: 0,
            startWpm: inheritedWpm,
            timestamp: Date.now()
        });

        const dailyData = {
            status: 'countdown',
            type: 'single',
            mode: window.currentMode,
            wpm: currentWpm,
            tone: currentTone,
            wordCount: window.requestedWordCount,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            hostId: window.myId,
            fixedSpeed: false,
            easyMode: false,
            game_words: gameWords
        };

        db.ref('rooms/' + roomCode).set(dailyData).then(() => {
            window.joinRoomLogic?.(false);
        }).catch(err => {
            console.error("TriDaily Start Error:", err);
            showToast("Errore avvio sessione. Riprova tra poco.");
        });
    });
};

window.checkTriDailyNextDayResults = function() {
    if (!window.myId) return;

    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterdayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const ackKey = `cwgame_tri_ack_${yesterdayStr}`;
    if (localStorage.getItem(ackKey)) return;

    db.ref(`users/${window.myId}/tri_daily_attempt/${yesterdayStr}`).once('value', snap => {
        if (!snap.exists()) {
            localStorage.setItem(ackKey, "true");
            if (typeof window.checkTodayStartupModals === 'function') window.checkTodayStartupModals(true);
            return;
        }

        const attempt = snap.val() || {};
        let myTotal = 0;
        let slotsCount = 0;
        ['morning', 'afternoon', 'evening'].forEach(s => {
            if (attempt[s] && attempt[s].score) {
                myTotal += Number(attempt[s].score) || 0;
                slotsCount++;
            }
        });

        if (myTotal <= 0) {
            localStorage.setItem(ackKey, "true");
            if (typeof window.checkTodayStartupModals === 'function') window.checkTodayStartupModals(true);
            return;
        }

        db.ref(`leaderboard/tri_daily/${yesterdayStr}`).once('value', lbSnap => {
            if (!lbSnap.exists()) return;

            const list = [];
            lbSnap.forEach(c => {
                if (c.exists()) list.push({ id: c.key, ...c.val() });
            });

            list.sort((a, b) => (Number(b.totalScore || 0) - Number(a.totalScore || 0)) || (Number(b.peakWpm || 0) - Number(a.peakWpm || 0)));

            const modal = document.getElementById('triDailyResultsModal');
            const podiumContainer = document.getElementById('triDailyPodiumContainer');
            const resultBox = document.getElementById('triDailyMyResultBox');
            const acceptTodayBtn = document.getElementById('btnTriDailyAcceptToday');

            if (!modal || !podiumContainer) return;

            podiumContainer.innerHTML = '';
            const top3 = list.slice(0, 3);
            top3.forEach((item, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                const div = document.createElement('div');
                div.style.cssText = 'text-align:center; flex:1;';

                const medalSpan = document.createElement('span');
                medalSpan.style.cssText = "font-size:1.5em; display:block;";
                medalSpan.textContent = medal;

                const nameB = document.createElement('b');
                nameB.style.cssText = "font-size:0.8em; color:var(--text-color); display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;";
                nameB.textContent = item.name || 'Anonimo';

                const scoreSmall = document.createElement('small');
                scoreSmall.style.cssText = "color:#ff9800; font-size:0.75em;";
                scoreSmall.textContent = `${item.totalScore || 0} pt`;

                div.appendChild(medalSpan);
                div.appendChild(nameB);
                div.appendChild(scoreSmall);
                podiumContainer.appendChild(div);
            });

            const myRankIndex = list.findIndex(x => x.id === window.myId);
            const myRankStr = myRankIndex >= 0 ? `${myRankIndex + 1}° su ${list.length}` : 'In Classifica';

            if (resultBox) {
                resultBox.textContent = ''; // clear

                const pRank = document.createElement('p');
                pRank.style.cssText = "margin:0 0 5px 0;";
                pRank.appendChild(document.createTextNode("Piazzamento di Ieri: "));

                const bRank = document.createElement('b');
                bRank.style.cssText = "color:var(--champ-color); font-size:1.1em;";
                bRank.textContent = myRankStr;
                pRank.appendChild(bRank);

                const statsDiv = document.createElement('div');
                statsDiv.style.cssText = "display:flex; justify-content:space-around; font-size:0.85em; color:var(--hint-color);";

                const spanPts = document.createElement('span');
                spanPts.appendChild(document.createTextNode("Punti Totali: "));
                const bPts = document.createElement('b');
                bPts.style.color = "#ff9800";
                bPts.textContent = `${myTotal} pt`;
                spanPts.appendChild(bPts);

                const spanSess = document.createElement('span');
                spanSess.appendChild(document.createTextNode("Sessioni: "));
                const bSess = document.createElement('b');
                bSess.style.color = "#2e7d32";
                bSess.textContent = `${slotsCount}/3`;
                spanSess.appendChild(bSess);

                statsDiv.appendChild(spanPts);
                statsDiv.appendChild(spanSess);

                resultBox.appendChild(pRank);
                resultBox.appendChild(statsDiv);
            }

            modal.style.display = 'flex';

            if (acceptTodayBtn) {
                acceptTodayBtn.onclick = () => {
                    localStorage.setItem(ackKey, "true");
                    modal.style.display = 'none';
                    if (typeof window.checkTodayStartupModals === 'function') {
                        window.checkTodayStartupModals(true);
                    }
                };
            }
        });
    });
};

window.loadDailyYesterdayPodium = function() {
    const podiumList = document.getElementById('dailyYesterdayPodiumList');
    const dateLabel = document.getElementById('dailyYesterdayDateLabel');
    if (!podiumList) return;

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = (typeof window.getLocalDateString === 'function') ? window.getLocalDateString(yesterdayDate) : yesterdayDate.toISOString().split('T')[0];
    const yesterdayFormatted = yesterdayDate.toLocaleDateString('it-IT');

    if (dateLabel) dateLabel.textContent = yesterdayFormatted;
    podiumList.innerHTML = '<p style="text-align:center; font-size:0.8em; color:var(--hint-color); margin:5px 0;">Caricamento podio di ieri...</p>';

    if (!db) return;

    db.ref(`leaderboard/daily_challenge/${yesterdayStr}`).orderByChild('score').limitToLast(50).once('value', snap => {
        podiumList.innerHTML = '';
        if (!snap.exists()) {
            podiumList.innerHTML = '<p style="text-align:center; font-size:0.8em; color:var(--hint-color); margin:5px 0;">Nessun dato registrato ieri.</p>';
            return;
        }

        const list = [];
        snap.forEach(c => {
            list.unshift({ id: c.key, ...c.val() });
        });

        // Ordinamento per punteggio decrescente, poi WPM decrescente
        list.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.wpm) - Number(a.wpm)));

        const top3 = list.slice(0, 3);
        top3.forEach((item, idx) => {
            const rank = idx + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
            const name = item.name || 'Telegrafista';
            const score = item.score || 0;
            const wpm = item.wpm || 15;
            const isMe = (item.id === window.myId);

            const row = document.createElement('div');
            row.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding:4px 6px; border-radius:6px; font-size:0.82em; ${isMe ? 'background:rgba(255,215,0,0.25); font-weight:bold;' : 'background:rgba(255,255,255,0.03);'}`;

            const leftSpan = document.createElement('span');
            leftSpan.textContent = `${medal} ${name}`;

            const rightSpan = document.createElement('span');
            rightSpan.style.color = "var(--champ-color)";
            rightSpan.style.fontWeight = "bold";
            rightSpan.textContent = `${score} pt (${wpm} WPM)`;

            row.appendChild(leftSpan);
            row.appendChild(rightSpan);
            podiumList.appendChild(row);
        });

        // Se l'utente ha giocato ieri ma non è nei Top 3, mostriamo il suo piazzamento
        const myIndex = list.findIndex(x => x.id === window.myId);
        if (myIndex >= 3) {
            const myItem = list[myIndex];
            const myRank = myIndex + 1;
            const myRow = document.createElement('div');
            myRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:4px 6px; margin-top:4px; border-top:1px dashed rgba(255,215,0,0.3); font-size:0.8em; background:rgba(255,215,0,0.15); font-weight:bold; border-radius:6px;";

            const leftSpan = document.createElement('span');
            leftSpan.textContent = `👤 Tu: ${myRank}° su ${list.length}`;

            const rightSpan = document.createElement('span');
            rightSpan.style.color = "var(--champ-color)";
            rightSpan.textContent = `${myItem.score || 0} pt (${myItem.wpm || 15} WPM)`;

            myRow.appendChild(leftSpan);
            myRow.appendChild(rightSpan);
            podiumList.appendChild(myRow);
        }
    });
};

window.checkTodayStartupModals = function(skipYesterdayCheck = false) {
    if (window.isMandatoryAliasPending) return;
    if (typeof window.closeAllModals === 'function') window.closeAllModals();

    const d = new Date();
    const todayStr = (typeof window.getLocalDateString === 'function') ? window.getLocalDateString(d) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Step 1: Risultati di ieri se non ancora visti
    if (!skipYesterdayCheck) {
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = (typeof window.getLocalDateString === 'function') ? window.getLocalDateString(yesterdayDate) : `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
        const ackKey = `cwgame_tri_ack_${yesterdayStr}`;

        if (!localStorage.getItem(ackKey)) {
            if (typeof window.checkTriDailyNextDayResults === 'function') {
                window.checkTriDailyNextDayResults();
                return;
            }
        }
    }

    // Step 2: Sfida Giornaliera Classica
    const dailyPlayed = (localStorage.getItem(STORAGE_DAILY_STATUS_KEY) === todayStr);
    const dailyLaterInThisSession = (sessionStorage.getItem("cwgame_daily_later_session") === "true");
    if (!dailyPlayed && !dailyLaterInThisSession && els.dailyChallengeModal) {
        if (!window.isNewUserWaitingWelcome) {
            if (typeof window.loadDailyYesterdayPodium === 'function') window.loadDailyYesterdayPodium();
            els.dailyChallengeModal.style.display = 'flex';
            return;
        }
    }

    // Step 3: Sfida Tripla Giornaliera (Hub)
    const triDeclined = (localStorage.getItem("cwgame_tri_daily_decline") === todayStr);
    const slotInfo = typeof window.getTriDailySlot === 'function' ? window.getTriDailySlot() : { id: 'night' };
    const triSlotPlayed = (localStorage.getItem(`cwgame_tri_played_${todayStr}_${slotInfo.id}`) === "true");
    const triLaterInThisSession = (sessionStorage.getItem(`cwgame_tri_later_session_${slotInfo.id}`) === "true");

    if (!triDeclined && slotInfo.id !== 'night' && !triSlotPlayed && !triLaterInThisSession) {
        window.openTriDailyHub();
    }
};

window.checkAndTriggerTriDailySlotNotifications = function() {
    if (!db || !window.myId) return;

    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const slotInfo = typeof window.getTriDailySlot === 'function' ? window.getTriDailySlot(d) : { id: 'morning' };
    const currentSlotId = slotInfo.id;

    if (currentSlotId !== 'afternoon' && currentSlotId !== 'evening') return;

    // Usiamo il nodo 'activity' (con permessi .write aperti agli utenti autenticati)
    const notifRefPath = `activity/tri_daily_notifications/${todayStr}/${currentSlotId}`;

    db.ref(notifRefPath).once('value', notifSnap => {
        if (notifSnap.exists()) return;

        // Invia la notifica SOLO ai partecipanti della Sfida Tripla di oggi
        db.ref(`leaderboard/tri_daily/${todayStr}`).once('value', lbSnap => {
            if (!lbSnap.exists()) return;

            const participants = [];
            lbSnap.forEach(child => {
                if (child.key && !isNaN(child.key)) participants.push(child.key);
            });

            if (participants.length === 0) return;

            db.ref(notifRefPath).set({
                sentAt: firebase.database.ServerValue.TIMESTAMP,
                sentBy: window.myId,
                recipientCount: participants.length
            }).then(() => {
                const slotLabel = currentSlotId === 'afternoon' ? 'Pomeriggio 🌤️ (15 Parole)' : 'Sera 🌙 (20 Parole)';

                if (VALIDATION_SERVER_URL && VALIDATION_SERVER_URL.startsWith('http')) {
                    const gasUrl = `${VALIDATION_SERVER_URL}?action=notify_tri_daily&slotLabel=${encodeURIComponent(slotLabel)}&participants=${encodeURIComponent(participants.join(','))}`;
                    try { fetch(gasUrl, { mode: 'no-cors' }); } catch(e) {}
                }

                const notifText = `🏆 Sfida Tripla: È aperta la Sessione ${slotLabel}! Entra in gioco ora per completare la sfida e scalare la classifica! 🚀`;
                participants.forEach(pId => {
                    db.ref(`users/${pId}/pushNotifications`).once('value', prefSnap => {
                        if (prefSnap.val() !== false) {
                            sendPushNotification(pId, notifText);
                        }
                    });
                });
                console.log(`TriDaily: Notifiche inviate a ${participants.length} partecipanti per lo slot ${currentSlotId}.`);
            });
        });
    });
};

// --- CONDIVISIONE ---
window.shareAppToFriends = function() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}`)}&text=${encodeURIComponent("📻 Unisciti a me su Sfida Telegrafia!\n@" + BOT_USERNAME)}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
};

window.openMaxWpmRecordsModal = function() {
    const modal = document.getElementById('maxWpmRecordsModal');
    const container = document.getElementById('maxWpmRecordsList');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = '<p style="text-align:center; font-size:0.85em; color:var(--hint-color); padding:10px;">Caricamento record di velocità...</p>';

    if (!db) return;

    const todayStr = (typeof window.getLocalDateString === 'function') ? window.getLocalDateString() : new Date().toISOString().split('T')[0];

    const modesToFetch = [
        { id: 'standard', name: '🔤 Parole Comuni', path: 'leaderboard/standard' },
        { id: 'standard_plus', name: '➕ Parole +', path: 'leaderboard/standard_plus' },
        { id: 'daily_challenge', name: '📅 Sfida Giornaliera', path: 'leaderboard/daily_challenge' },
        { id: 'tri_daily', name: '🏆 Sfida Tripla', path: 'leaderboard/tri_daily' },
        { id: 'callsign', name: '🎙️ CW Freak (Nominativi)', path: 'leaderboard/callsign/global' }
    ];

    const promises = modesToFetch.map(m => {
        return db.ref(m.path).once('value').then(snap => {
            let bestName = "Nessun Record";
            let maxWpm = 0;

            if (snap.exists()) {
                const scanNode = (node) => {
                    if (!node) return;
                    node.forEach(child => {
                        const val = child.val();
                        if (val && typeof val === 'object') {
                            if (val.wpm !== undefined || val.peakWpm !== undefined) {
                                const w = Number(val.peakWpm || val.wpm || 0);
                                if (w > maxWpm) {
                                    maxWpm = w;
                                    bestName = val.name || "Telegrafista";
                                }
                            } else {
                                scanNode(child);
                            }
                        }
                    });
                };
                scanNode(snap);
            }

            return { name: m.name, bestName, maxWpm };
        }).catch(() => ({ name: m.name, bestName: "Nessun Record", maxWpm: 0 }));
    });

    Promise.all(promises).then(results => {
        container.innerHTML = '';
        results.forEach(res => {
            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px;";

            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = "display:flex; flex-direction:column;";

            const modeB = document.createElement('b');
            modeB.style.cssText = "font-size:0.85em; color:var(--text-color);";
            modeB.textContent = res.name;

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = "font-size:0.75em; color:var(--hint-color); margin-top:2px;";
            nameSpan.textContent = res.maxWpm > 0 ? `🥇 Recordman: ${res.bestName}` : `Nessun record salvato`;

            leftDiv.appendChild(modeB);
            leftDiv.appendChild(nameSpan);

            const rightB = document.createElement('b');
            rightB.style.cssText = "font-size:1em; color:#ff9800; font-weight:bold;";
            rightB.textContent = res.maxWpm > 0 ? `${res.maxWpm} WPM` : `--`;

            row.appendChild(leftDiv);
            row.appendChild(rightB);
            container.appendChild(row);
        });
    });
};

window.inviteFriendsToRoom = function() {
    if (!roomCode) return showToast("Nessuna stanza attiva.");
    const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=room_${roomCode}`)}&text=${encodeURIComponent(`📻 Unisciti alla mia stanza su Sfida Telegrafia!\nCodice Stanza: #${roomCode}`)}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
};

// --- LISTENER PULSANTI CHAT ---
if (els.inviteFriendsBtn) {
    els.inviteFriendsBtn.onclick = () => window.inviteFriendsToRoom();
}

if (els.sendChatBtn) {
    els.sendChatBtn.onclick = async () => {
        const now = Date.now();
        if (now - window.lastChatSentTs < 2000) return showToast("🐌 Vai più piano! Attendi 2 secondi.");

        if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
        const txt = els.chatInput?.value.trim();
        if (!txt) return;
        if (txt.length > 200) return showToast(currentLang === 'it' ? "⚠️ Messaggio troppo lungo (max 200 car.)" : "⚠️ Message too long (max 200 chars)");

        window.lastChatSentTs = now;
        const rc = window.roomCode;
        const ctx = window.activeChatContext;
        let ref = (ctx === 'room' && rc) ? db.ref(`rooms/${rc}/chat`).push() : db.ref('globalChat').push();
        ref.set({
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            text: txt,
            ts: firebase.database.ServerValue.TIMESTAMP,
            senderId: myId // Necessario per eliminazione e sicurezza
        });

        // --- INVIO NOTIFICHE PUSH AGLI OFFLINE/DISTRAI (SOLO IN STANZA) ---
        if (ctx === 'room' && rc) {
            console.log("DEBUG_PUSH: Controllo destinatari per stanza", rc);
            db.ref(`rooms/${rc}/players`).once('value', (snap) => {
                if (!snap.exists()) { console.log("DEBUG_PUSH: Nessun giocatore trovato nella stanza."); return; }
                snap.forEach((pSnap) => {
                    const pId = pSnap.key;
                    if (pId !== myId) {
                        db.ref(`presence/${pId}`).once('value', (presSnap) => {
                            const presData = presSnap.val() || {};
                            const now = Date.now();

                            const isFocused = presData.isFocused !== false;
                            const lastActiveDiff = now - (presData.lastActive || 0);
                            const isTimedOut = lastActiveDiff > 35000;

                            console.log(`DEBUG_PUSH: Utente ${pId} -> isFocused: ${isFocused}, LastActive: ${Math.round(lastActiveDiff/1000)}s fa`);

                            const isAppNotAccessible = !presSnap.exists() || !isFocused || isTimedOut;

                            if (isAppNotAccessible) {
                                console.log("DEBUG_PUSH: Utente inattivo. Controllo preferenze push...");
                                db.ref(`users/${pId}/pushNotifications`).once('value', (prefSnap) => {
                                    if (prefSnap.val() !== false) {
                                        sendPushNotification(pId, txt);
                                    } else {
                                        console.log("DEBUG_PUSH: L'utente ha disattivato le notifiche nel profilo.");
                                    }
                                });
                            } else {
                                console.log("DEBUG_PUSH: Utente attivo nell'app, push saltata.");
                            }
                        });
                    }
                });
            });
        }

        if (els.chatInput) els.chatInput.value = '';
    };
}

if (els.chatInput) {
    els.chatInput.onkeypress = (e) => {
        if (e.key === 'Enter') els.sendChatBtn?.click();
    };
}

if (els.sendLobbyChatBtn) {
    els.sendLobbyChatBtn.onclick = async () => {
        const now = Date.now();
        if (now - window.lastChatSentTs < 2000) return showToast("🐌 Vai più piano! Attendi 2 secondi.");

        if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
        const txt = els.lobbyChatInput?.value.trim();
        const rc = window.roomCode;
        if (!txt || !rc) return;
        if (txt.length > 200) return showToast(currentLang === 'it' ? "⚠️ Messaggio troppo lungo (max 200 car.)" : "⚠️ Message too long (max 200 chars)");

        window.lastChatSentTs = now;
        db.ref(`rooms/${rc}/chat`).push().set({
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            text: txt,
            ts: firebase.database.ServerValue.TIMESTAMP,
            senderId: myId
        });

        // --- NOTIFICHE PUSH ANCHE PER LA LOBBY ---
        db.ref(`rooms/${rc}/players`).once('value', (snap) => {
            console.log("DEBUG_PUSH: Controllo lobby per stanza", rc);
            snap.forEach((pSnap) => {
                const pId = pSnap.key;
                if (pId !== myId) {
                    db.ref(`presence/${pId}`).once('value', (presSnap) => {
                        const presData = presSnap.val() || {};
                        const now = Date.now();
                        const isFocused = presData.isFocused !== false;
                        const lastActiveDiff = now - (presData.lastActive || 0);
                        const isTimedOut = lastActiveDiff > 35000;

                        console.log(`DEBUG_PUSH_LOBBY: Utente ${pId} -> isFocused: ${isFocused}, LastActive: ${Math.round(lastActiveDiff/1000)}s fa`);

                        const isAppNotAccessible = !presSnap.exists() || !isFocused || isTimedOut;

                        if (isAppNotAccessible) {
                            db.ref(`users/${pId}/pushNotifications`).once('value', (prefSnap) => {
                                if (prefSnap.val() !== false) {
                                    sendPushNotification(pId, txt);
                                }
                            });
                        }
                    });
                }
            });
        });

        if (els.lobbyChatInput) els.lobbyChatInput.value = '';
    };
}

if (els.lobbyChatInput) {
    els.lobbyChatInput.onkeypress = (e) => {
        if (e.key === 'Enter') els.sendLobbyChatBtn?.click();
    };
}
if (els.clearChatBtn) {
    els.clearChatBtn.onclick = () => {
        if (confirm('Vuoi cancellare la cronologia?')) {
            if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove();
            else if (activeChatContext === 'team' && myTeamId) db.ref(`teams/${myTeamId}/chat`).remove();
            else db.ref('globalChat').remove();
        }
    };
}
if (els.muteGlobalChatBtn) {
    els.muteGlobalChatBtn.onclick = () => {
        isGlobalChatMuted = !isGlobalChatMuted;
        localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted);
        updateMuteBtnUI();
        showToast(isGlobalChatMuted ? "Notifiche silenziate." : "Notifiche riattivate.");
    };
}

// --- CREAZIONE STANZA ---
if (els.createRoomBtn) {
    els.createRoomBtn.onclick = () => {
        const gType = els.gameTypeInput.value, gMode = els.gameModeInput.value;
        const isSpeak = (gType === 'single' && gMode === 'standard') && document.getElementById('speakModeCheckbox')?.checked;

        // --- FIX: REDIREZIONE BROWSER ESTERNO PER TTS SU MOBILE ---
        // Alcuni browser interni di Telegram bloccano la sintesi vocale.
        // Se l'utente è su mobile e usa "Ascolto", proponiamo l'apertura esterna.
        const isMobile = tg.platform === 'android' || tg.platform === 'ios';
        const isInternal = !window.location.search.includes('initData'); // Se non c'è initData nell'URL, siamo dentro TG

        if (isSpeak && isMobile && isInternal) {
            if (confirm(currentLang === 'it'
                ? "🚀 Per una migliore esperienza audio in modalità Ascolto, si consiglia di aprire il gioco nel browser esterno. Vuoi passare al browser di sistema?"
                : "🚀 For a better audio experience in Listening mode, it's recommended to open the game in an external browser. Do you want to switch to the system browser?")) {

                // Costruiamo l'URL esterno includendo initData per mantenere l'autenticazione
                const currentUrl = window.location.origin + window.location.pathname;
                const externalUrl = currentUrl + "?initData=" + encodeURIComponent(tg.initData);
                tg.openLink(externalUrl);
                return; // Interrompiamo l'avvio qui, l'utente continuerà di là
            }
        }

        // --- SBLOCCO TTS MOBILE (IMPERCETTIBILE) ---
        if (('speechSynthesis' in window)) {
            const unlock = new SpeechSynthesisUtterance(" ");
            unlock.volume = 0.001;
            window.speechSynthesis.speak(unlock);
        }

        if (gType === 'tournament') { window.showScreen('teamsScreen'); return; }
        if (gMode === 'custom' && window.customDictionary.length === 0) return showToast("Carica un file!");

        window.resetGameState();

        window.isChallenging = false;
        window.outgoingChallengeId = null;
        window.incomingChallengeId = null;
        window.currentMode = gMode || 'standard';
        console.log("Create Room: Initial Mode selection ->", gMode, "Global window.currentMode ->", window.currentMode);
        window.isSinglePlayer = (gType === 'single') || (gType === 'transmission' && (gMode === 'code_groups' || gMode === 'standard'));
        window.currentWpm = window.baseWpm = (window.currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20));
        window.requestedWordCount = (window.currentMode === 'callsign' ? 25 : (parseInt(els.wordCountInput?.value) || 10));
        window.requestedWordLength = parseInt(document.getElementById('wordLengthInput')?.value) || 0;
        window.currentTone = parseInt(els.toneInput?.value) || 600;

        window.wordsPerGroup = (window.currentMode === 'standard_plus') ? (parseInt(document.getElementById('wordsPerGroupInput')?.value) || 2) : 1;

        if (gType === 'transmission') {
            if (gMode === 'qso_audio_search') {
                window.showScreen('qsoAudioScreen');
                if (typeof window.initQsoAudioModule === 'function') window.initQsoAudioModule();
                return;
            }
            if (gMode === 'groups_tx' || gMode === 'real_tx') {
                window.startTransmissionFree(gMode);
                return;
            }
        }

        const isFixed = window.isSinglePlayer && els.fixedSpeedCheckbox?.checked;
        const isEasy = window.isSinglePlayer && els.easyModeCheckbox?.checked;
        const allowSpectators = window.isSinglePlayer && els.allowSpectatorsCheckbox?.checked;
        const vRate = parseFloat(document.getElementById('voiceRateSelect')?.value) || 1.0;

        window.isAutoAdvance = window.isSinglePlayer && window.currentMode === 'standard' && els.speakModeCheckbox?.checked === true && document.getElementById('autoAdvanceCheckbox')?.checked === true;
        window.autoAdvanceDelaySec = parseInt(document.getElementById('autoAdvanceDelaySelect')?.value) || 5;

        let cSpace = (window.isSinglePlayer && els.charSpaceInput?.value) ? parseInt(els.charSpaceInput.value) : 0;
        let wSpace = window.isSinglePlayer && els.wordSpaceSelect?.value ? parseFloat(els.wordSpaceSelect.value) : 1.0;

        window.roomCode = window.isSinglePlayer ? "SOLO_" + window.myId : Math.floor(1000 + Math.random() * 9000).toString();

        const createAndJoinRoom = async (stats = {}) => {
            logDebug("Create Room: Preparazione sessione...");

            const myUid = firebase.auth().currentUser?.uid;
            if (myUid) {
                try {
                    await db.ref(`uid_mapping/${myUid}`).set(window.myId);
                } catch (e) { logDebug("Create Room: Errore mapping", e); }
            }

            window.gameWords = window.getGameWords(window.requestedWordCount, window.currentMode, {
                groupSize: window.wordsPerGroup,
                wordLength: window.requestedWordLength,
                charSetType: document.getElementById('groupCharSetInput')?.value || 'letters',
                stats: stats
            });

            // Se il filtro di lunghezza parole ha prodotto meno parole di quelle richieste, adeguiamo il conteggio
            if (window.gameWords && window.gameWords.length > 0 && window.gameWords.length < window.requestedWordCount) {
                console.log(`WordLength: Adjusting requestedWordCount from ${window.requestedWordCount} to ${window.gameWords.length}`);
                window.requestedWordCount = window.gameWords.length;
                if (typeof showToast === 'function') {
                    showToast(`ℹ️ Trovate ${window.gameWords.length} parole di lunghezza ${window.requestedWordLength}. La partita durerà ${window.gameWords.length} parole.`);
                }
            }

            const expires = window.isSinglePlayer ? null : Date.now() + ((parseInt(els.roomTimerInput?.value) || 5) * 60000);

            // --- FIX COLLISIONE ID STANZA (Robust ID) ---
            if (window.isSinglePlayer) {
                window.roomCode = "SOLO_" + window.myId + "_" + Math.floor(Date.now()/1000);
            } else {
                const rand = Math.floor(10000 + Math.random() * 90000);
                window.roomCode = rand.toString() + Date.now().toString().slice(-3);
            }

            const roomRef = db.ref('rooms/' + window.roomCode);

            // Verifica preventiva unicità
            const check = await roomRef.once('value');
            if (check.exists()) return els.createRoomBtn.click();

            const roomData = {
                status: window.isSinglePlayer ? 'countdown' : 'waiting',
                type: window.isSinglePlayer ? 'single' : (gType === 'coop' ? 'coop' : 'multi'),
                mode: window.currentMode,
                groupSize: window.wordsPerGroup,
                wpm: window.currentWpm,
                tone: window.currentTone,
                wordCount: window.requestedWordCount,
                wordLength: window.requestedWordLength,
                fixedSpeed: !!isFixed,
                easyMode: !!isEasy,
                speakMode: !!isSpeak,
                voiceInputMode: !!(isSpeak && document.getElementById('voiceInputCheckbox')?.checked),
                voiceRate: vRate,
                allowSpectators: !!allowSpectators,
                charSpaceWpm: cSpace,
                wordSpaceMult: wSpace,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                expiresAt: expires,
                hostId: window.myId,
                game_words: window.gameWords
            };

            roomRef.set(roomData).then(() => {
                console.log("Create Room: Stanza creata con successo ->", window.roomCode);
                if (!window.isSinglePlayer) {
                    roomRef.onDisconnect().remove();
                    const lobbyRef = db.ref(`public_lobby_rooms/${window.roomCode}`);
                    lobbyRef.set({
                        mode: window.currentMode,
                        pCount: 1,
                        wpm: window.currentWpm,
                        status: 'waiting',
                        expiresAt: expires,
                        hostId: window.myId
                    });
                    lobbyRef.onDisconnect().remove();
                } else if (allowSpectators) {
                    db.ref(`presence/${window.myId}`).update({
                        allowSpectators: true,
                        activeRoomCode: window.roomCode
                    });
                }
                window.joinRoomLogic(false);
            }).catch(err => {
                console.error("Create Room: Errore SET database", err);
                showToast("Errore di connessione al database. Riprova.");
            });
        };

        if (gMode === 'target_training') {
            db.ref(`users/${myId}/stats`).once('value').then(snap => {
                const stats = snap.val() || {};
                const charStats = stats.charStats || {};

                // Usiamo la velocità WPM impostata dall'utente nel campo input del menu
                const chosenWpm = parseInt(els.startWpmInput?.value) || 20;
                window.currentWpm = window.baseWpm = chosenWpm;

                // Salviamo lo stato iniziale per il report finale
                window.targetTrainingContext = {
                    initialStats: JSON.parse(JSON.stringify(charStats)),
                    targetChars: Object.entries(charStats)
                        .map(([char, d]) => {
                            const dbChar = (typeof window.firebaseUnescape === 'function') ? window.firebaseUnescape(char) : char.replace(/_dot_/g, '.');
                            return { char: dbChar.toUpperCase(), acc: (d.attempts > 0 ? (d.attempts - d.errors) / d.attempts : 1), attempts: d.attempts };
                        })
                        .filter(c => c.attempts >= 3 && c.acc < 0.85)
                        .sort((a,b) => a.acc - b.acc)
                        .map(c => c.char)
                        .slice(0, 7)
                };

                const hasData = window.targetTrainingContext.targetChars.length > 0;
                if (!hasData) {
                    showToast("ℹ️ Dati insufficienti per l'Allenamento Mirato. Gioca altre modalità per raccogliere statistiche!");
                }
                createAndJoinRoom(stats);
            });
        } else {
            window.targetTrainingContext = null;
            createAndJoinRoom();
        }
    };
}

// --- LISTA STANZE (SPOSTATO IN SOCIAL_MANAGER.JS) ---
