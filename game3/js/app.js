// ============================================================================
// APP.JS - PARTE 1 DI 2
// INIZIALIZZAZIONE, STATO GLOBALE, AUDIO MORSE, CHAT, LOBBY E STANZE
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

// --- TRADUZIONI (i18n) ---
// Caricate da i18n_data.js

window.toggleLanguage = function() {
    const newLang = (currentLang === 'it') ? 'en' : 'it';
    setLanguage(newLang);
    updateDictionary();
    showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English");
};

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('gameLang', lang);
    const t = i18n[lang] || i18n.it;
    if (els.langBtn) els.langBtn.textContent = lang.toUpperCase();

    const textMap = {
        txt_hello: t.hello, txt_free_challenge_title: t.free_challenge, txt_play_solo_title: t.play_solo,
        txt_game_type_label: t.game_type, txt_mode_label: t.mode, txt_opt_multi: t.opt_multi, txt_opt_single: t.opt_single,
        txt_opt_std: t.opt_std, txt_opt_call: t.opt_call, txt_opt_pp: t.opt_pp, txt_wpm_label: t.wpm,
        txt_words_label: t.words, txt_tone_label: t.tone, txt_fixed_speed: t.fixed, txt_easy_mode: t.easy,
        txt_room_timeout: t.timeout, txt_challenge_board_title: t.challenge_board, txt_no_challenges: t.no_challenges,
        txt_online_users_title: t.online_users, txt_global_chat_btn: t.global_chat, txt_you_are_alone: t.you_are_alone,
        chatTitle: t.chat_title, clearChatBtn: t.chat_clear, closeChatBtn: t.chat_close, sendChatBtn: t.chat_send,
        txt_lobby_players: t.lobby_players, txt_lobby_chat_title: t.lobby_chat, sendLobbyChatBtn: t.chat_send,
        inviteFriendsBtn: t.lobby_invite, startMultiplayerBtn: t.btn_start_match, deleteRoomBtn: t.btn_delete_room,
        leaveLobbyBtn: t.btn_leave_lobby, readyBtn: t.ready_btn, txt_prepare: t.prepare, txt_th_typed: t.th_typed,
        txt_th_real: t.th_real, txt_th_pts: t.th_pts, replayWordBtn: t.replay, txt_game_chat_btn: t.game_chat,
        quitGameBtn: t.quit_game, txt_profile_title: t.profile_title, txt_alias_title: t.alias_label, saveAliasBtn: t.save,
        txt_alias_hint: t.alias_hint, txt_privacy_label: t.privacy_label, txt_privacy_hint: t.privacy_hint,
        txt_wrong_chars_title: t.wrong_chars, txt_wpm_error_title: t.wpm_error, txt_match_history_title: t.match_history,
        txt_back_btn: t.back_to_menu, deleteDataBtn: t.delete_data, tabDailyAct: t.daily, tabWeeklyAct: t.weekly,
        tabMonthlyAct: t.monthly, goToTeamsBtn: t.teams_btn, tabTeamGestBtn: t.tab_my_team, tabAllTeamsBtn: t.tab_all_teams,
        tabTournamentsBtn: t.tab_tournaments, txt_custom_dict_title: t.custom_title, txt_custom_dict_desc: t.custom_desc,
        txt_select_file_btn: t.select_file, txt_custom_hint1: t.custom_hint1, txt_custom_hint2: t.custom_hint2,
        txt_custom_hint3: t.custom_hint3, txt_close_custom_btn: t.chat_close, txt_manage_custom_btn: t.manage_custom,
        opt_lb_room: t.tab_this_match, opt_lb_trn: t.tab_trn_lb, opt_lb_call: t.tab_callsigns, opt_lb_single: t.tab_std_single
    };

    for (let key in textMap) {
        if (els[key]) els[key].textContent = textMap[key];
    }
    
    if (els.txt_lb_btn) els.txt_lb_btn.textContent = "🏆 " + t.lb;
    if (els.txt_profile_btn) els.txt_profile_btn.textContent = "👤 " + t.profile;
    if (els.txt_act_btn) els.txt_act_btn.textContent = "🏅 " + t.activity;

    populateGameModesUI();
    checkGameTypeUI();
    updateMuteBtnUI();
}

function updateMuteBtnUI() {
    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.textContent = isGlobalChatMuted 
            ? (currentLang === 'it' ? "🔇 Notifiche Disattivate" : "🔇 Notifications Muted") 
            : (currentLang === 'it' ? "🔊 Notifiche Attive" : "🔊 Notifications Active");
    }
}

// --- DIZIONARI ROBUSTI CON FALLBACK PIÙ RICCHI ---
// Caricati da i18n_data.js

async function loadDictionaries() {
    await Promise.all([ 
        fetchDictionary("parole.txt", 'it'), 
        fetchDictionary("words.txt", 'en') 
    ]);
    updateDictionary();
}

async function fetchDictionary(url, lang) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Offline o file non trovato");
        const text = await resp.text();
        const lines = text.split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 2);
            
        if (lines.length > 10) {
            if (lang === 'it') itDictionary = lines;
            else enDictionary = lines;
            return;
        }
        throw new Error("Dizionario troppo corto");
    } catch(e) {
        if (lang === 'it') itDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
        else enDictionary = FALLBACK_WORDS_EN.map(w => w.toLowerCase());
    }
}

function updateDictionary() { 
    masterDictionary = (currentLang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary; 
}

// --- CARICAMENTO REGOLAMENTO E PRIVACY ---
// Caricato dinamicamente


// --- MORSE ENGINE CON ARRESTO ANTISOVRAPPOSIZIONE UNIFICATO ---
// Gestito in audio_engine.js

// --- PRNG E SHUFFLE PER SFIDA GIORNALIERA ---
// Gestito in game_core.js

// --- UI E MODALITÀ ---
function populateGameModesUI() {
    if (!els.gameModeInput) return;
    const select = els.gameModeInput;
    const trnGroup = els.trn_opt_group;
    const currentVal = select.value || 'standard';
    select.innerHTML = '';
    
    Object.values(window.GAME_MODES || {}).forEach(mode => {
        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.id = 'txt_opt_' + mode.id;
        opt.textContent = currentLang === 'en' ? mode.titleEn : mode.titleIt;
        select.appendChild(opt);
    });
    
    if (trnGroup) select.appendChild(trnGroup);
    if (window.GAME_MODES && window.GAME_MODES[currentVal]) select.value = currentVal;
    else select.value = 'standard';
}

function checkGameTypeUI() {
    const isSingle = els.gameTypeInput.value === 'single';
    const isTrn = els.gameTypeInput.value === 'tournament';
    const isCoop = els.gameTypeInput.value === 'coop';
    const select = els.gameModeInput;
    const currentVal = select.value;
    
    select.innerHTML = '';
    
    if (isCoop) {
        const opt = document.createElement('option');
        opt.value = "conquest";
        opt.textContent = currentLang === 'en' ? "Conquest (Co-op) ⚔️" : "Conquista (Co-op) ⚔️";
        select.appendChild(opt);
        select.value = "conquest";
    } else if (isTrn) {
        const trnOptions = [
            { val: "trn_create_team", it: "Fonda Squadra", en: "Create Team" },
            { val: "trn_join_team", it: "Unisciti a Squadra", en: "Join Team" },
            { val: "trn_create_trn", it: "Crea Nuovo Torneo", en: "Create Tournament" }
        ];
        trnOptions.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.val;
            opt.textContent = currentLang === 'en' ? item.en : item.it;
            select.appendChild(opt);
        });
        select.value = currentVal.startsWith('trn_') ? currentVal : "trn_join_team";
    } else {
        Object.values(window.GAME_MODES || {}).forEach(mode => {
            if (mode.id !== 'conquest') {
                const opt = document.createElement('option');
                opt.value = mode.id;
                opt.id = 'txt_opt_' + mode.id;
                opt.textContent = currentLang === 'en' ? mode.titleEn : mode.titleIt;
                select.appendChild(opt);
            }
        });
        select.value = (currentVal === 'conquest' || currentVal.startsWith('trn_')) ? 'standard' : (currentVal || 'standard');
    }

    const selectedMode = select.value;
    const modeCfg = window.GAME_MODES ? window.GAME_MODES[selectedMode] : null;
    const isCustom = selectedMode === 'custom';
    const isChars = selectedMode === 'chars';
    const isPP = selectedMode === 'pingpong';

    els.timeoutDiv.style.display = (isSingle || isTrn) ? 'none' : 'block';
    
    if (modeCfg) {
        els.fixedSpeedContainer.style.display = (isSingle && modeCfg.fixedSpeedAllowed) ? 'flex' : 'none';
        els.easyModeContainer.style.display = isSingle ? 'flex' : 'none';
        if (els.advancedSpacingContainer) {
            els.advancedSpacingContainer.style.display = (isSingle && modeCfg.spacingConfigurable) ? 'flex' : 'none';
        }
        if (els.startWpmInput) {
            els.startWpmInput.disabled = (modeCfg.wpmConfigurable === false);
            if (modeCfg.wpmConfigurable === false && modeCfg.defaultWpm) els.startWpmInput.value = modeCfg.defaultWpm;
        }
        if (els.wordCountInput) {
            els.wordCountInput.disabled = (modeCfg.wordCountConfigurable === false);
            if (modeCfg.wordCountConfigurable === false && modeCfg.defaultWordCount) els.wordCountInput.value = modeCfg.defaultWordCount;
        }
    }

    if (els.customDictControl) els.customDictControl.style.display = (isSingle && isCustom) ? 'flex' : 'none';
    if (els.spectatorContainer) els.spectatorContainer.style.display = isSingle ? 'flex' : 'none';

    if (isCoop) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Crea Stanza Co-op ⚔️" : "Create Co-op Room ⚔️";
    } else if (isTrn) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
    } else {
        els.createRoomBtn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
    }
}

if(els.gameModeInput) els.gameModeInput.addEventListener('change', e => checkGameTypeUI());
if(els.gameTypeInput) els.gameTypeInput.addEventListener('change', checkGameTypeUI);

// --- STARTUP DEL GIOCO ---
if (!tgUser) { 
    if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen'); 
    if (els.errorScreen) els.errorScreen.classList.add('active-screen'); 
} else { 
    myName = tgUser.first_name; 
    myId = tgUser.id.toString(); 
    initGame(); 
}

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

    db = firebase.database(); 
    auth = firebase.auth();

    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';

    if (els.startWpmInput && localStorage.getItem(STORAGE_PREF_WPM)) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM);
    if (els.wordCountInput && localStorage.getItem(STORAGE_PREF_WORDS)) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS);
    if (els.toneInput && localStorage.getItem(STORAGE_PREF_TONE)) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE);
    if (els.charSpaceInput && localStorage.getItem(STORAGE_PREF_CHAR_SPACE)) els.charSpaceInput.value = localStorage.getItem(STORAGE_PREF_CHAR_SPACE);
    if (els.wordSpaceSelect && localStorage.getItem(STORAGE_PREF_WORD_SPACE)) els.wordSpaceSelect.value = localStorage.getItem(STORAGE_PREF_WORD_SPACE);

    isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
    if (localStorage.getItem(STORAGE_CHAT_CW_WPM)) {
        chatCwWpm = parseInt(localStorage.getItem(STORAGE_CHAT_CW_WPM)) || 20;
        if (els.chatCwWpmInput) els.chatCwWpmInput.value = chatCwWpm;
    }
    if (localStorage.getItem(STORAGE_CHAT_CW_TONE)) {
        chatCwTone = parseInt(localStorage.getItem(STORAGE_CHAT_CW_TONE)) || 600;
        if (els.chatCwToneInput) els.chatCwToneInput.value = chatCwTone;
    }

    if (els.toggleChatCwBtn) {
        if (isChatCwEnabled) {
            els.toggleChatCwBtn.textContent = "📻 CW: ON";
            els.toggleChatCwBtn.classList.remove('btn-secondary');
            els.toggleChatCwBtn.classList.add('btn-success');
            if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block';
        }

        els.toggleChatCwBtn.addEventListener('click', () => {
            isChatCwEnabled = !isChatCwEnabled;
            localStorage.setItem(STORAGE_CHAT_CW_ENABLED, isChatCwEnabled);
            if (!isChatCwEnabled) chatCwAudioQueue = [];
            
            if (isChatCwEnabled) {
                els.toggleChatCwBtn.textContent = "📻 CW: ON";
                els.toggleChatCwBtn.classList.remove('btn-secondary');
                els.toggleChatCwBtn.classList.add('btn-success');
                if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'block';
                showToast("Modalità CW Chat Attivata!");
            } else {
                els.toggleChatCwBtn.textContent = "📻 CW: OFF";
                els.toggleChatCwBtn.classList.remove('btn-success');
                els.toggleChatCwBtn.classList.add('btn-secondary');
                if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = 'none';
                showToast("Modalità CW Chat Disattivata.");
            }
            listenToChat();
        });
    }

    if (els.chatCwWpmInput) {
        els.chatCwWpmInput.addEventListener('change', (e) => {
            chatCwWpm = Math.max(5, Math.min(50, parseInt(e.target.value) || 20));
            localStorage.setItem(STORAGE_CHAT_CW_WPM, chatCwWpm);
        });
    }
    if (els.chatCwToneInput) {
        els.chatCwToneInput.addEventListener('change', (e) => {
            chatCwTone = Math.max(400, Math.min(1000, parseInt(e.target.value) || 600));
            localStorage.setItem(STORAGE_CHAT_CW_TONE, chatCwTone);
        });
    }

    auth.signInAnonymously().then(async () => {
        try {
            const userRef = db.ref(`users/${myId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val() || {};

            if (userData.alias) myName = userData.alias;
            myPrivacy = userData.privacyUsername || false; 
            if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = myPrivacy;

            // --- CONTROLLO PRIMO ACCESSO ASSOLUTO (SOLO PER IL NUOVO UTENTE) ---
            if (!userSnap.exists() || !userData.welcomed) {
                // 1. Registra che l'utente è entrato ed è stato accolto
                await userRef.update({
                    name: myName,
                    welcomed: true,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                });

                // 2. Mostra la finestra modale di benvenuto ESCLUSIVAMENTE a lui
                if (els.welcomeNewUserModal) {
                    els.welcomeNewUserModal.style.display = 'flex';
                    const btnClose = document.getElementById('btnCloseWelcomeModal');
                    if (btnClose) {
                        btnClose.onclick = () => {
                            els.welcomeNewUserModal.style.display = 'none';
                        };
                    }
                } else {
                    // Fallback discreto se manca il modal nell'HTML: Toast di benvenuto privato
                    setTimeout(() => {
                        showToast(`📻 Benvenuto in Sfida Telegrafia, ${myName}! Buon divertimento!`);
                    }, 1500);
                }
            }
            // ------------------------------------------------------------------
        } catch(e) {}

        if (els.playerName) els.playerName.textContent = myName; 
        if (els.userAliasInput) els.userAliasInput.value = (myName !== tgUser.first_name) ? myName : "";
        if (els.loadingText) els.loadingText.style.display = 'none'; 
        if (els.createRoomBtn) els.createRoomBtn.disabled = false;

        db.ref('.info/serverTimeOffset').on('value', (snap) => {
            serverTimeOffset = snap.val() || 0;
        });

        db.ref('.info/connected').on('value', (snap) => {
            if (snap.val() === false) return;
            const pRef = db.ref(`presence/${myId}`);
            pRef.onDisconnect().remove();
            pRef.set({ 
                name: myName, 
                username: myPrivacy ? "" : tgUsername, 
                status: 'online', 
                ts: firebase.database.ServerValue.TIMESTAMP 
            });
            if (roomCode) window.joinRoomLogic(true);
        });

        if (typeof checkYesterdayDailyMedal === 'function') checkYesterdayDailyMedal();

        // --- BLOCCO ROUTING SCHERMATE REINTEGRATO ---
        if (startParam) {
            if (startParam.startsWith('team_')) window.processTeamInvite(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', snap => {
                    if (snap.exists() && snap.val().status !== 'finished') {
                        roomCode = lastRoom; 
                        if (els.rejoinContainer) els.rejoinContainer.style.display = 'block'; 
                        if (els.rejoinGameBtn) els.rejoinGameBtn.onclick = () => { isRejoining = true; window.joinRoomLogic(false); };
                        showScreen('setupScreen');
                    } else { 
                        localStorage.removeItem(STORAGE_ROOM_KEY); 
                        showScreen('setupScreen'); 
                    }
                });
            } else {
                showScreen('setupScreen');
            }
        }

        const savedLang = localStorage.getItem('gameLang'); 
        if (savedLang) setLanguage(savedLang);
        else updateMuteBtnUI();
        
        loadDictionaries().then(() => {
            let todayStr = new Date().toISOString().split('T')[0];
            let lastShown = localStorage.getItem(STORAGE_DAILY_SHOWN);
            if (lastShown !== todayStr && !startParam) {
                if (els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'flex';
            }
        });

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) { 
            try { 
                customDictionary = JSON.parse(savedCustom); 
                updateCustomDictStatus(); 
            } catch(e) {} 
        }

        if (typeof checkActivityAndAwardMedals === 'function') checkActivityAndAwardMedals(); 
        if (typeof checkTournamentPopup === 'function') checkTournamentPopup();
        
        listenToRooms(); 
        listenToOnlineUsers(); 
        listenToInvites(); 
        listenToInviteAccepted();
        
        if (typeof initBattleRoyaleScheduler === 'function') initBattleRoyaleScheduler(); 
        if (typeof loadRegolamento === 'function') loadRegolamento();

        if (els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
        if (els.appVersionFooter) els.appVersionFooter.textContent = APP_VERSION;

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) {
                if (els.updateBanner) els.updateBanner.style.display = 'block';
            } else {
                if (els.updateBanner) els.updateBanner.style.display = 'none';
            }
        });

    }).catch(() => {
        if (els.loadingText) { 
            els.loadingText.textContent = "Errore di Connessione."; 
            els.loadingText.style.color = "red"; 
            els.loadingText.style.fontWeight = "bold"; 
        }
    });

    populateGameModesUI();
    checkGameTypeUI();
}
// ============================================================================
// GESTIONE PULSANTI MODALE SFIDA GIORNALIERA E BANNER
// ============================================================================

// 1. Tasto "ACCETTA LA SFIDA" -> Chiude il popup, crea la stanza e avvia il gioco
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.addEventListener('click', () => {
        els.dailyChallengeModal.style.display = 'none';

        currentMode = 'daily_challenge';
        isSinglePlayer = true;
        currentWpm = 15; 
        baseWpm = 15;
        requestedWordCount = 20;
        currentTone = 600;
        isFixedSpeed = false;
        isEasyMode = false;
        
        window.charSpaceWpm = 0; 
        window.wordSpaceMult = 1.0;

        roomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
        gameWords = getGameWords(requestedWordCount, currentMode);
        
        db.ref('rooms/' + roomCode).set({ 
            status: 'countdown', 
            type: 'single', 
            mode: currentMode, 
            wpm: currentWpm, 
            tone: currentTone, 
            wordCount: requestedWordCount, 
            words: gameWords, 
            fixedSpeed: isFixedSpeed, 
            charSpaceWpm: 0, 
            wordSpaceMult: 1.0, 
            createdAt: firebase.database.ServerValue.TIMESTAMP, 
            hostId: myId 
        }).then(() => window.joinRoomLogic(false));
    });
}

// 2. Tasto "Più Tardi" -> Chiude solo il popup senza salvare nel localStorage
if (els.btnPlayDailyLater) {
    els.btnPlayDailyLater.addEventListener('click', () => {
        els.dailyChallengeModal.style.display = 'none';
    });
}

// 3. Tasto "Rifiuta per oggi" -> Chiude il popup e memorizza la data per non mostrarlo più oggi
if (els.btnDeclineDaily) {
    els.btnDeclineDaily.addEventListener('click', () => {
        let todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
        els.dailyChallengeModal.style.display = 'none';
    });
}

// 4. Tasto di chiusura "X" del banner Battaglia Serale (per sicurezza)
if (els.btnCloseBRBanner) {
    els.btnCloseBRBanner.addEventListener('click', () => {
        if (els.brBanner) els.brBanner.style.display = 'none';
        if (brBannerTimeout) clearTimeout(brBannerTimeout);
        brBannerDismissedToday = true;
        if (brRoomCode) db.ref(`rooms/${brRoomCode}/players`).off('value');
    });
}
// ============================================================================
// CONDIVISIONE APP GLOBALE (INDISTRUTTIBILE)
// ============================================================================
window.shareAppToFriends = function() {
    showToast("📢 Apertura condivisione Telegram...");
    
    const appUrl = `https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`;
    const textMsg = `📻 Unisciti a me su Sfida Telegrafia! Impara il codice Morse, sfida altri operatori e scala la classifica!`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(textMsg)}`;
    
    setTimeout(() => {
        try {
            if (tg && typeof tg.openTelegramLink === 'function') {
                tg.openTelegramLink(shareUrl);
            } else {
                window.open(shareUrl, '_blank');
            }
        } catch (e) {
            window.open(shareUrl, '_blank');
        }
    }, 200);
};
// --- LISTE E BACHECA SFIDE (SENZA DUPLICATI) ---
window.lastKnownRoomPlayersCount = window.lastKnownRoomPlayersCount || {};

function addOrUpdateRoomCard(code, room) {
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
    const prevCount = window.lastKnownRoomPlayersCount[code] || 1;
    const isMyRoom = (room.hostId === myId);
    const isOutsideRoom = (roomCode !== code || !els.lobbyScreen.classList.contains('active-screen'));

    if (isMyRoom && pCount > prevCount && pCount >= 2 && isOutsideRoom) {
        showToast(`👤 Un giocatore è appena entrato nella tua stanza #${code}!`);
        if (typeof playNotificationSound === 'function') playNotificationSound();
    }
    window.lastKnownRoomPlayersCount[code] = pCount;

    const span = document.createElement('span');
    const bTitle = document.createElement('b'); 
    bTitle.textContent = `#${code} - ${modeIcon}`;
    const infoText = `${pCount} Gioc. | ${room.wpm} WPM`;
    const smallInfo = document.createElement('small'); 
    smallInfo.textContent = infoText;
    span.appendChild(bTitle); 
    span.appendChild(document.createElement('br')); 
    span.appendChild(smallInfo);
    li.appendChild(span);

    const btn = document.createElement('button'); 
    btn.className = 'action-btn-small'; 
    btn.textContent = currentLang === 'en' ? 'Join' : 'Entra'; 
    btn.onclick = () => window.joinSpecificRoom(code); 
    li.appendChild(btn);
}

// DEFINIZIONE UNICA DI removeRoomCard
function removeRoomCard(code) {
    if (!els.waitingRoomsList) return;
    const li = document.getElementById(`room_list_item_${code}`);
    if (li) li.remove();

    if (els.waitingRoomsList.children.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-rooms-msg';
        emptyLi.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;";
        emptyLi.textContent = currentLang === 'en' ? "No challenges." : "Nessuna sfida.";
        els.waitingRoomsList.appendChild(emptyLi);
    }
}

// DEFINIZIONE UNICA DI listenToRooms
function listenToRooms() {
    if (listeners.roomsList && listeners.roomsList.ref) {
        listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
        listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
        listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
        listeners.roomsList = null;
    }

    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    const lobbyQuery = db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);

    const onAdded = lobbyQuery.on('child_added', snap => addOrUpdateRoomCard(snap.key, snap.val()));
    const onChanged = lobbyQuery.on('child_changed', snap => addOrUpdateRoomCard(snap.key, snap.val()));
    const onRemoved = lobbyQuery.on('child_removed', snap => removeRoomCard(snap.key));

    listeners.roomsList = { ref: lobbyQuery, onAdded, onChanged, onRemoved };
}
// ============================================================================
// APP.JS - PARTE 2 DI 2
// CHAT, GAMELOOP, CONQUISTA (CO-OP), QUIZ, BATTAGLIA REALE, SPETTATORE, TORNEI
// ============================================================================

// --- GESTIONE SCHERMATE E PULIZIA ---
// Gestito in game_core.js

// --- CHAT GLOBALE E DI STANZA ---
// Gestito in social_manager.js

// ============================================================================
// MODULO CHAT UNIFICATO (SETUP + INVIO MESSAGGI + FIX AUDIO DOPPIO)
// ============================================================================

// setupChat gestito in social_manager.js

// --- LISTENER PER INVIO MESSAGGI CHAT LOBBY ---

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

                    
// --- PRESENZA ONLINE E LISTE UTENTI ---
// Gestito in social_manager.js

// --- MODALI INVITO E SFIDE ---
// Gestito in social_manager.js

// listenToInviteAccepted gestito in social_manager.js

// --- USCITA PULITA DALLA STANZA ---
// Gestito in game_core.js

// --- CREAZIONE E INGRESSO IN STANZA ---
// Gestito in game_core.js

// --- GAMELOOP, VERIFICA E PUNTEGGI ---
// Gestito in game_core.js

// --- GAME CORE: COUNTDOWN, RESUME, NEXT WORD, FINISH ---
// Gestito in game_core.js

// --- CONQUISTA (CO-OP) ---
// Gestito in coop_manager.js

// --- QUIZ MORSE ---
// Gestito in quiz_manager.js

// --- BATTAGLIA REALE ---
// Gestito in br_manager.js

// --- MODALITÀ SPETTATORE ---
// Gestito in game_core.js

// --- CLASSIFICHE GLOBALI E DI STANZA ---
// Gestito in leaderboard_manager.js

// --- SQUADRE E TORNEI ---
// Gestito in teams_manager.js

// --- ATTIVITÀ, MEDAGLIE E STATISTICHE UTENTE ---
// Gestito in profile_manager.js

// --- GESTIONE STANDBY / SPEGNIMENTO SCHERMO DURANTE IL GIOCO ---
// Gestito in game_core.js
