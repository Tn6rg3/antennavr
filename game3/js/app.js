// ============================================================================
// APP.JS - ENTRY POINT & GLOBAL STATE
// ============================================================================

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260807.223";

// URL della Web App di Google Apps Script per la validazione identità
const VALIDATION_SERVER_URL = "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

window.tg = window.Telegram.WebApp;
const tg = window.tg;
window.tgUser = tg.initDataUnsafe?.user;
const tgUser = window.tgUser;
window.tgUsername = tgUser?.username || "";
const tgUsername = window.tgUsername;
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
const STORAGE_CUSTOM_DICT_KEY = "cwgame_custom_dict";
const STORAGE_CHAT_MUTED_KEY = "cwgame_chat_muted";
const STORAGE_PREF_WPM = "cwgame_pref_wpm";
const STORAGE_PREF_WORDS = "cwgame_pref_words";
const STORAGE_PREF_TONE = "cwgame_pref_tone";
const STORAGE_PREF_CHAR_SPACE = "cwgame_pref_char_space";
const STORAGE_PREF_WORD_SPACE = "cwgame_pref_word_space";
const STORAGE_PREF_FIXED = "cwgame_pref_fixed";
const STORAGE_PREF_EASY = "cwgame_pref_easy";
const STORAGE_PREF_SPECTATE = "cwgame_pref_spectate";
const STORAGE_DAILY_SHOWN = "cwgame_daily_shown";
const STORAGE_CHAT_CW_ENABLED = "cwgame_chat_cw_enabled";
const STORAGE_CHAT_CW_WPM = "cwgame_chat_cw_wpm";
const STORAGE_CHAT_CW_TONE = "cwgame_chat_cw_tone";

const DEBUG_MODE = false;
window.logDebug = (...args) => { if (DEBUG_MODE) console.log(...args); };

// --- STATO GLOBALE ---
window.myName = "";
window.myId = "";
window.myPrivacy = false;
window.myTeamId = null;
window.myTeamName = "";
window.isTeamCaptain = false;
let db = null, auth = null, currentLang = 'it';
let activeChatContext = null, activeTab = "room", isChatDrawerOpen = false;
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
window.isSinglePlayer = false;
window.currentMode = "standard";
window.requestedWordCount = 10;
window.isFixedSpeed = false;
window.isEasyMode = false;
window.lastWordStartTime = 0;

// STATO CORSO CW
let isCourseMode = false, courseSessionTimer = null, coursePauseInterval = null;
window.courseData = null;

// STATO CO-OP
let isCoopMode = false, coopActiveFreqIndex = 0;
let coopTimerInterval = null, coopDecayInterval = null;

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
window.customDictionary = [];

let currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;
let nextWordTimeout = null;
let sessionCharErrors = Object.create(null), sessionErrorsByWpm = Object.create(null);
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
        arcadeNextBrickTimeout, nextWordTimeout
    ];
    timers.forEach(t => { if(t) { clearInterval(t); clearTimeout(t); } });

    lobbyTimerInterval = quizTimerInterval = ppTimerInterval = null;
    brTimerInterval = brCheckInterval = null;
    coopTimerInterval = coopDecayInterval = null;
    courseSessionTimer = coursePauseInterval = null;
    arcadeNextBrickTimeout = null;
    nextWordTimeout = null;
}

/**
 * RESET RIGOROSO DELLO STATO DI GIOCO
 * Da chiamare PRIMA di iniziare qualsiasi nuova partita/modalità
 */
window.resetGameState = function() {
    console.log("Game Core: Full state reset...");

    // 1. Ferma tutto ciò che è in esecuzione
    gameRunning = false;
    inputActive = false;
    clearAllTimers();
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    // 2. Resetta flag di modalità
    isCourseMode = false;
    isCoopMode = false;
    isArcadeMode = false;
    window.isSinglePlayer = false;

    // 3. Resetta variabili di sessione
    wordIndex = 0;
    totalScore = 0;
    currentStreak = 0;
    peakWpm = 0;
    matchDetailsArray = [];
    usedReplay = false;

    // 4. Pulisce sessione corso pendente se non siamo esplicitamente in modalità corso
    // Questo evita che i parametri del corso "inquinino" altre modalità
    if (window.courseData) {
        window.courseData.current_day_session = null;
    }

    // 5. Resetta parametri audio avanzati
    window.charSpaceWpm = 0;
    window.wordSpaceMult = 1.0;
    window.isFixedSpeed = false;
    window.isEasyMode = false;
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

if(document.getElementById('gameModeInput')) document.getElementById('gameModeInput').addEventListener('change', () => window.checkGameTypeUI?.());
if(document.getElementById('gameTypeInput')) document.getElementById('gameTypeInput').addEventListener('change', () => window.checkGameTypeUI?.());

// --- STARTUP ---
async function startApp() {
    if (!tgUser) {
        if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
        if (els.errorScreen) els.errorScreen.classList.add('active-screen');
        return;
    }

    // 1. Fase di Verifica Identità (Backend Google Apps Script)
    const statusText = document.getElementById('initStatusText');
    if (statusText) statusText.textContent = "Verifica identità Morse...";

    try {
        const isVerified = await validateIdentity();
        if (!isVerified) {
            if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
            if (els.validationErrorScreen) els.validationErrorScreen.classList.add('active-screen');
            return;
        }
    } catch (e) {
        console.error("Validation failed:", e);
        if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
        if (els.validationErrorScreen) els.validationErrorScreen.classList.add('active-screen');
        return;
    }

    // 2. Proseguiamo con l'avvio normale
    myName = tgUser.first_name;
    myId = tgUser.id.toString();
    initGame();
}

async function validateIdentity() {
    if (!VALIDATION_SERVER_URL || !VALIDATION_SERVER_URL.startsWith("http")) {
        console.warn("Security: Validation URL not set, skipping.");
        return true;
    }

    try {
        const url = VALIDATION_SERVER_URL + "?initData=" + encodeURIComponent(tg.initData);

        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            redirect: 'follow'
        });

        if (!response.ok) return false;

        const result = await response.json();
        return result.status === 'ok';
    } catch (err) {
        console.error("Validation: Request failed", err);
        return false;
    }
}
window.startApp = startApp;

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
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    // --- ESPORTAZIONE GLOBALE PER CONSOLE E DEBUG ---
    window.db = firebase.database();
    window.auth = firebase.auth();
    db = window.db;
    auth = window.auth;

    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';
    if (els.startWpmInput) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM) || 20;
    if (els.wordCountInput) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS) || 10;
    if (els.toneInput) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE) || 600;

    // RIPRISTINO IMPOSTAZIONI AGGIUNTIVE
    if (els.charSpaceInput) els.charSpaceInput.value = localStorage.getItem(STORAGE_PREF_CHAR_SPACE) || "";
    if (els.wordSpaceSelect) els.wordSpaceSelect.value = localStorage.getItem(STORAGE_PREF_WORD_SPACE) || "1.0";
    if (els.fixedSpeedCheckbox) els.fixedSpeedCheckbox.checked = localStorage.getItem(STORAGE_PREF_FIXED) === 'true';
    if (els.easyModeCheckbox) els.easyModeCheckbox.checked = localStorage.getItem(STORAGE_PREF_EASY) === 'true';
    if (els.allowSpectatorsCheckbox) els.allowSpectatorsCheckbox.checked = localStorage.getItem(STORAGE_PREF_SPECTATE) === 'true';

    // SALVATAGGIO AUTOMATICO DELLE PREFERENZE AL CAMBIO
    const savePref = (key, val) => localStorage.setItem(key, val);
    els.startWpmInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_WPM, e.target.value));
    els.wordCountInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORDS, e.target.value));
    els.toneInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_TONE, e.target.value));
    els.charSpaceInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_CHAR_SPACE, e.target.value));
    els.wordSpaceSelect?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORD_SPACE, e.target.value));
    els.fixedSpeedCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_FIXED, e.target.checked));
    els.easyModeCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_EASY, e.target.checked));
    els.allowSpectatorsCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_SPECTATE, e.target.checked));

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

    auth.signInAnonymously().then(async () => {
        window.myId = tgUser.id.toString();
        console.log("CW Game: Auth success, Telegram ID:", window.myId);

        // --- SICUREZZA: Registriamo il mapping UID subito per le regole Firebase ---
        // Questo deve avvenire PRIMA di qualsiasi altra operazione di scrittura o lettura protetta
        try {
            const mappingRef = db.ref(`uid_mapping/${firebase.auth().currentUser.uid}`);
            await mappingRef.set(window.myId);
            mappingRef.onDisconnect().remove();
        } catch (e) {
            console.error("CW Game: Security Mapping failed", e);
        }

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

        if (data.alias) {
            window.myName = data.alias;
        } else {
            window.myName = tgUser.first_name;
            updates.alias = window.myName;
            needsUpdate = true;
        }

        if (data.privacyUsername === undefined) {
            window.myPrivacy = true;
            updates.privacyUsername = true;
            needsUpdate = true;
        } else {
            window.myPrivacy = data.privacyUsername;
        }

        if (needsUpdate) {
            await userRef.update(updates);
            console.log("Privacy: Applied default settings (Privacy ON, Alias set).");
        }

        if (!snap.exists() || !data.welcomed) {
            // Aggiorniamo welcomed e i dati base
            await userRef.update({ welcomed: true, createdAt: firebase.database.ServerValue.TIMESTAMP });
            window.isNewUserWaitingWelcome = true; // Flag per coordinare la sfida giornaliera
            if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'flex';
        }

        if (els.playerName) els.playerName.textContent = window.myName;

        // --- SISTEMA LAZY CLEANUP GIORNALIERO ---
        try {
            const cleanupRef = db.ref('appConfig/lastCleanupTs');
            cleanupRef.once('value', snap => {
                const lastCleanup = snap.val() || 0;
                const now = Date.now();
                const ONE_DAY_MS = 24 * 60 * 60 * 1000;

                if (now - lastCleanup > ONE_DAY_MS) {
                    console.log("CW Game: Running daily chat cleanup...");
                    // Svuotiamo le chat principali per mantenere il DB leggero
                    db.ref('globalChat').remove();
                    db.ref('courseChat').remove();
                    db.ref('courseChats').remove(); // Pulizia aule tutor
                    cleanupRef.set(now);
                }
            });
        } catch(e) { console.warn("Cleanup error:", e); }

        // --- PULIZIA SESSIONI PRECEDENTI ---
        // Se l'app si è chiusa male, l'utente potrebbe avere ancora una stanza "waiting" a suo nome.
        // La puliamo all'avvio per evitare "ghost rooms" in bacheca.
        db.ref('rooms').orderByChild('hostId').equalTo(window.myId).once('value', s => {
            s.forEach(roomSnap => {
                if (roomSnap.val().status === 'waiting') {
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

        db.ref('.info/connected').on('value', s => {
            if (!s.val()) return;
            const pRef = db.ref(`presence/${myId}`);
            pRef.onDisconnect().remove();
            const presenceData = {
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                status: 'online',
                uid: firebase.auth().currentUser.uid,
                ts: firebase.database.ServerValue.TIMESTAMP,
                lastActive: firebase.database.ServerValue.TIMESTAMP
            };

            if (window.userProgression && window.userProgression.level) {
                presenceData.level = window.userProgression.level;
            }

            pRef.set(presenceData);
        });

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
            } else if (db && myId) {
                // Aggiorna il timestamp sul server ogni minuto per mostrare che siamo vivi
                db.ref(`presence/${myId}/lastActive`).set(firebase.database.ServerValue.TIMESTAMP);
            }
        }, 60000); // Controllo ogni minuto

        if (startParam) {
            if (startParam.startsWith('team_')) window.processTeamInvite?.(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom?.(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', s => {
                    if (s.exists() && s.val().status !== 'finished') {
                        roomCode = lastRoom; if (els.rejoinContainer) els.rejoinContainer.style.display = 'block';
                        showScreen('setupScreen');
                    } else { localStorage.removeItem(STORAGE_ROOM_KEY); showScreen('setupScreen'); }
                });
            } else showScreen('setupScreen');
        }

        const savedLang = localStorage.getItem('gameLang');
        if (savedLang) window.setLanguage(savedLang); else updateMuteBtnUI();
        
        window.loadDictionaries().then(() => {
            let today = new Date().toISOString().split('T')[0];

            if (startParam) return;

            // Verifichiamo se l'utente ha già giocato o rifiutato la sfida OGGI
            db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(10).once('value', histSnap => {
                let alreadyPlayedToday = false;
                histSnap.forEach(matchSnap => {
                    const m = matchSnap.val();
                    if (!m.date) return;
                    const mDate = new Date(m.date).toISOString().split('T')[0];
                    if (m.mode === 'daily_challenge' && mDate === today) alreadyPlayedToday = true;
                });

                const alreadyShownToday = localStorage.getItem(STORAGE_DAILY_SHOWN) === today;

                if (!alreadyPlayedToday && !alreadyShownToday && els.dailyChallengeModal) {
                    // Se l'utente è nuovo, aspettiamo che chiuda il benvenuto
                    if (window.isNewUserWaitingWelcome) {
                        window.pendingDailyChallengeShow = true;
                    } else {
                        els.dailyChallengeModal.style.display = 'flex';
                    }
                } else if (alreadyPlayedToday) {
                    // Aggiorniamo il cache locale se Firebase dice che abbiamo giocato
                    localStorage.setItem(STORAGE_DAILY_SHOWN, today);
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

        window.initBattleRoyaleScheduler?.();
        window.initGlobalNotificationListener?.(); // AVVIO LISTENER BACKGROUND
        window.loadRegolamento();
        window.initProgression?.();
        window.initCourseManager?.();
        window.setupBugSystem?.();

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
    }).catch(err => {
        console.error("CW Game: Auth Error", err);
        const statusText = document.getElementById('initStatusText');
        if (statusText) {
            statusText.textContent = "Errore di connessione al server Morse. Ricarica l'app o riprova più tardi.";
            statusText.style.color = "#f44336";
        }
    });

    window.populateGameModesUI?.();
    window.checkGameTypeUI?.();
    setTimeout(() => { window.checkGameTypeUI?.(); }, 1200);
}

window.closeWelcomeAndCheckDaily = function() {
    if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'none';
    window.isNewUserWaitingWelcome = false;

    // Se c'è una sfida giornaliera in attesa, mostrala ora
    if (window.pendingDailyChallengeShow && els.dailyChallengeModal) {
        setTimeout(() => {
            els.dailyChallengeModal.style.display = 'flex';
            window.pendingDailyChallengeShow = false;
        }, 500);
    }
};

// --- SISTEMA BUG E ADMIN ---
window.setupBugSystem = function() {
    const badge = document.getElementById('bugsBadge');

    // Rilevamento Admin basato su Permessi Firebase (Nessun ID in chiaro nel codice)
    // Tentiamo di leggere bugReports: se Firebase lo permette, siamo admin.
    db.ref('bugReports').limitToLast(1).on('value', snap => {
        window.isAdmin = true;
        if (els.adminBugPanel) els.adminBugPanel.style.display = 'block';
        window.updateAdminBadge();

        // 2. Tutor Requests Listener (Attivo solo se siamo effettivamente admin)
        db.ref('tutorRequests').off('value');
        db.ref('tutorRequests').on('value', () => {
            window.updateAdminBadge();
        });
    }, (error) => {
        // Se Firebase nega l'accesso (standard user), nascondiamo pannello e badge
        window.isAdmin = false;
        if (els.adminBugPanel) els.adminBugPanel.style.display = 'none';
        if (badge) badge.style.display = 'none';
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

    // --- TASTO DEV: RESET SFIDA GIORNALIERA ---
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
                localStorage.removeItem(STORAGE_DAILY_SHOWN);

                showToast("Sfida resettata! Ricarica l'app.");
                setTimeout(() => location.reload(), 1000);
            } catch(e) { alert("Errore: " + e.message); }
        };
    }
};

window.updateAdminBadge = async function() {
    const badge = document.getElementById('bugsBadge');
    if (!badge || !db) return;

    try {
        const lastSeenBugTs = parseInt(localStorage.getItem('cw_last_bug_ts') || 0);

        // Contiamo bug nuovi e tutor requests pendenti
        const [bugsSnap, tutorSnap] = await Promise.all([
            db.ref('bugReports').once('value'),
            db.ref('tutorRequests').once('value')
        ]);

        let count = 0;
        if (bugsSnap.exists()) {
            bugsSnap.forEach(c => { if (c.val().ts > lastSeenBugTs) count++; });
        }
        if (tutorSnap.exists()) {
            count += Object.keys(tutorSnap.val()).length;
        }

        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch(e) { console.error("Firebase Security Logic Error:", e); }
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

            // Tasto Elimina
            const delBtn = document.createElement('button');
            delBtn.style.cssText = "font-size:0.7em; background:#d32f2f; color:white; border:none; border-radius:4px; padding:2px 6px; margin-top:5px; cursor:pointer;";
            delBtn.textContent = "Elimina";
            delBtn.onclick = () => {
                if (confirm('Eliminare definitivamente questa segnalazione?')) {
                    db.ref(`bugReports/${child.key}`).remove().then(() => {
                        item.remove();
                        showToast('Eliminato');
                        window.updateAdminBadge();
                    });
                }
            };

            item.appendChild(header);
            item.appendChild(dateDiv);
            item.appendChild(msgDiv);
            item.appendChild(delBtn);
            list.prepend(item);
        });
    });
};

window.loadAdminTutorRequests = function() {
    const list = document.getElementById('adminBugList');
    if (!list) return;
    list.innerHTML = "Caricamento richieste...";

    db.ref('tutorRequests').once('value', snap => {
        list.innerHTML = "";
        if (!snap.exists()) {
            list.innerHTML = "Nessuna richiesta pendente.";
            return;
        }
        snap.forEach(child => {
            const req = child.val();
            const item = document.createElement('div');
            item.style.padding = "10px";
            item.style.borderBottom = "1px solid #673ab7";
            item.style.background = "rgba(103, 58, 183, 0.05)";

            const title = document.createElement('div');
            title.style.fontWeight = "bold";
            title.style.color = "#9575cd";
            title.textContent = `🎓 Richiesta da: ${req.name || "Anonimo"}`;

            const info = document.createElement('div');
            info.style.fontSize = "0.75em";
            info.style.color = "var(--hint-color)";
            info.textContent = `ID: ${req.uid || ""} | @${req.username || "N/A"}`;

            const btnArea = document.createElement('div');
            btnArea.style.display = "flex";
            btnArea.style.gap = "10px";
            btnArea.style.marginTop = "8px";

            const approveBtn = document.createElement('button');
            approveBtn.style.cssText = "flex:1; background:#4caf50; color:white; border:none; border-radius:4px; padding:5px; cursor:pointer; font-size:0.8em;";
            approveBtn.textContent = "APPROVA ✅";
            approveBtn.onclick = () => window.approveTutor(child.key, req.uid, req.name);

            const rejectBtn = document.createElement('button');
            rejectBtn.style.cssText = "flex:1; background:#d32f2f; color:white; border:none; border-radius:4px; padding:5px; cursor:pointer; font-size:0.8em;";
            rejectBtn.textContent = "RIFIUTA ❌";
            rejectBtn.onclick = () => {
                if (confirm('Rifiutare questa richiesta?')) {
                    db.ref(`tutorRequests/${child.key}`).remove().then(() => {
                        window.updateAdminBadge();
                        item.remove();
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

        currentMode = 'daily_challenge';
        window.isSinglePlayer = true;
        currentWpm = baseWpm = 15;
        requestedWordCount = 20;

        // USA ID UNIVOC_O ANCHE PER LA SFIDA GIORNALIERA
        roomCode = "DAILY_" + window.myId;
        gameWords = window.getGameWords(requestedWordCount, currentMode);

        const startDaily = () => {
            db.ref('rooms/' + roomCode).set({
                status: 'countdown',
                type: 'single',
                mode: currentMode,
                wpm: currentWpm,
                tone: currentTone,
                wordCount: requestedWordCount,
                words: gameWords,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                hostId: myId,
                fixedSpeed: false, // Forziamo parametri standard per la sfida
                easyMode: false
            }).then(() => window.joinRoomLogic?.(false))
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
if (els.btnPlayDailyLater) els.btnPlayDailyLater.onclick = () => { if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none'; };
if (els.btnDeclineDaily) els.btnDeclineDaily.onclick = () => {
    localStorage.setItem(STORAGE_DAILY_SHOWN, new Date().toISOString().split('T')[0]);
    if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';
};

// --- CONDIVISIONE ---
window.shareAppToFriends = function() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`)}&text=${encodeURIComponent("📻 Unisciti a me su Sfida Telegrafia!")}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
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
        let ref = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
        ref.set({
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            text: txt,
            ts: firebase.database.ServerValue.TIMESTAMP,
            senderId: myId // Necessario per eliminazione e sicurezza
        });
        if (els.chatInput) els.chatInput.value = '';
    };
}
if (els.sendLobbyChatBtn) {
    els.sendLobbyChatBtn.onclick = async () => {
        const now = Date.now();
        if (now - window.lastChatSentTs < 2000) return showToast("🐌 Vai più piano! Attendi 2 secondi.");

        if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
        const txt = els.lobbyChatInput?.value.trim();
        if (!txt || !roomCode) return;
        if (txt.length > 200) return showToast(currentLang === 'it' ? "⚠️ Messaggio troppo lungo (max 200 car.)" : "⚠️ Message too long (max 200 chars)");

        window.lastChatSentTs = now;
        db.ref(`rooms/${roomCode}/chat`).push().set({
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            text: txt,
            ts: firebase.database.ServerValue.TIMESTAMP,
            senderId: myId
        });
        if (els.lobbyChatInput) els.lobbyChatInput.value = '';
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
        if (gType === 'tournament') { window.showScreen('teamsScreen'); return; }
        if (gMode === 'custom' && window.customDictionary.length === 0) return showToast("Carica un file!");

        window.isChallenging = false;
        window.outgoingChallengeId = null;
        window.incomingChallengeId = null;
        window.currentMode = gMode || 'standard';
        window.isSinglePlayer = (gType === 'single');
        window.currentWpm = window.baseWpm = (window.currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20));
        window.requestedWordCount = (window.currentMode === 'callsign' ? 25 : (parseInt(els.wordCountInput?.value) || 10));
        window.currentTone = parseInt(els.toneInput?.value) || 600;

        // --- LETTURA OPZIONI AVANZATE ---
        const isFixed = window.isSinglePlayer && els.fixedSpeedCheckbox?.checked;
        const isEasy = window.isSinglePlayer && els.easyModeCheckbox?.checked;
        const allowSpectators = window.isSinglePlayer && els.allowSpectatorsCheckbox?.checked;

        // Se l'input è vuoto o non siamo in Solo, impostiamo 0 (spaziatura automatica proporzionale)
        let cSpace = (window.isSinglePlayer && els.charSpaceInput?.value) ? parseInt(els.charSpaceInput.value) : 0;
        let wSpace = window.isSinglePlayer && els.wordSpaceSelect?.value ? parseFloat(els.wordSpaceSelect.value) : 1.0;

        window.roomCode = window.isSinglePlayer ? "SOLO_" + window.myId : Math.floor(1000 + Math.random() * 9000).toString();
        window.gameWords = window.getGameWords(window.requestedWordCount, window.currentMode);

        const expires = window.isSinglePlayer ? null : Date.now() + ((parseInt(els.roomTimerInput?.value) || 5) * 60000);

        const roomRef = db.ref('rooms/' + window.roomCode);
        roomRef.set({
            status: window.isSinglePlayer ? 'countdown' : 'waiting',
            type: window.isSinglePlayer ? 'single' : (gType === 'coop' ? 'coop' : 'multi'),
            mode: window.currentMode,
            wpm: window.currentWpm,
            tone: window.currentTone,
            wordCount: window.requestedWordCount,
            words: window.gameWords,
            fixedSpeed: !!isFixed,
            easyMode: !!isEasy,
            allowSpectators: !!allowSpectators,
            charSpaceWpm: cSpace,
            wordSpaceMult: wSpace,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: expires,
            hostId: window.myId
        }).then(() => {
            if (!window.isSinglePlayer) {
                // PULIZIA AUTOMATICA: Se l'Host si disconnette completamente da Firebase, rimuovi la stanza
                roomRef.onDisconnect().remove();

                const lobbyRef = db.ref(`public_lobby_rooms/${window.roomCode}`);
                lobbyRef.set({
                    mode: window.currentMode,
                    pCount: 1,
                    wpm: window.currentWpm,
                    status: 'waiting',
                    expiresAt: expires,
                    hostId: window.myId // Fondamentale per identificare la propria stanza in bacheca
                });
                lobbyRef.onDisconnect().remove();
            }

            if (window.isSinglePlayer && allowSpectators) {
                db.ref(`presence/${window.myId}`).update({
                    allowSpectators: true,
                    activeRoomCode: window.roomCode
                });
            }

            window.joinRoomLogic?.(false);
        });
    };
}

// --- LISTA STANZE (SPOSTATO IN SOCIAL_MANAGER.JS) ---
