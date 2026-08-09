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
            if (roomCode) joinRoomLogic(true);
        });

        if (typeof checkYesterdayDailyMedal === 'function') checkYesterdayDailyMedal();

        // --- BLOCCO ROUTING SCHERMATE REINTEGRATO ---
        if (startParam) {
            if (startParam.startsWith('team_')) processTeamInvite(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', snap => {
                    if (snap.exists() && snap.val().status !== 'finished') {
                        roomCode = lastRoom; 
                        if (els.rejoinContainer) els.rejoinContainer.style.display = 'block'; 
                        if (els.rejoinGameBtn) els.rejoinGameBtn.onclick = () => { isRejoining = true; joinRoomLogic(false); }; 
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
        }).then(() => joinRoomLogic(false));
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

if (els.quitGameBtn) {
    els.quitGameBtn.onclick = function() { 
        if (confirm("Vuoi abbandonare la partita?")) { 
            gameRunning = false; 
            exitRoomCleanly(false, true); 
        } 
    };
}

if (els.deleteRoomBtn) {
    els.deleteRoomBtn.onclick = function() {
        if (window.isDeletingRoom) return;

        if (confirm("Eliminare questa stanza?")) {
            window.isDeletingRoom = true;
            els.deleteRoomBtn.disabled = true;

            const currentCode = roomCode;
            exitRoomCleanly(true, false);

            if (currentCode) {
                db.ref(`public_lobby_rooms/${currentCode}`).remove();
                db.ref(`rooms/${currentCode}`).remove().finally(() => {
                    window.isDeletingRoom = false;
                    if (els.deleteRoomBtn) els.deleteRoomBtn.disabled = false;
                });
            } else {
                window.isDeletingRoom = false;
                if (els.deleteRoomBtn) els.deleteRoomBtn.disabled = false;
            }
        }
    };
}

if (els.leaveLobbyBtn) {
    els.leaveLobbyBtn.onclick = function() {
        exitRoomCleanly(false, false); 
    };
}

if (els.startMultiplayerBtn) {
    els.startMultiplayerBtn.onclick = function() {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            if (currentMode === 'pingpong' && (snap.exists() ? Object.keys(snap.val()).length : 0) < 2) {
                return alert("Ping Pong richiede almeno 2 giocatori in stanza per iniziare!");
            }
            db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
            db.ref(`public_lobby_rooms/${roomCode}`).remove();
        });
    };
}

// --- CREAZIONE E INGRESSO IN STANZA ---
// Gestito in game_core.js

if (els.readyBtn) {
    els.readyBtn.addEventListener('click', () => { 
        if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true }); 
    });
}

// --- GAMELOOP, VERIFICA E PUNTEGGI ---
// Gestito in game_core.js (parzialmente)

function handleWordSubmission(userWord) {
    if (!userWord) return;
    userWord = userWord.substring(0, 50).trim().toUpperCase();

    // RAMO SPECIALE: CONQUISTA (CO-OP)
    if (currentMode === 'conquest') {
        if (typeof startCoopSequence === 'function') {
            // Se coop_manager.js è caricato, usiamo la sua logica per gestire la sottomissione se necessario
            // Ma per ora manteniamo la logica qui o la spostiamo in game_core.js
        }
    }

    // RAMO STANDARD / MODALITÀ CLASSICHE
    inputActive = false; 
    const currentWord = gameWords[wordIndex].toUpperCase(); 
    let points = 0, scoreColor = ""; 
    const reactionMs = Date.now() - lastWordStartTime; 
    const levDist = getLevenshteinDistance(currentWord, userWord);
    
    if (typeof window.calculateGamePoints === 'function') {
        const res = window.calculateGamePoints(currentMode, currentWord, userWord, currentWpm, reactionMs, levDist, usedReplay);
        points = res.points;
        scoreColor = res.scoreColor;
    } else {
        if (currentMode === 'chars') { 
            if (userWord === currentWord) { 
                points = Math.max(100, Math.floor(1000 - (reactionMs / 2))); 
                scoreColor = "#4caf50"; 
            } else { 
                points = 0; 
                scoreColor = "#d32f2f"; 
            } 
        } else {
            const basePoints = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2)); 
            const estimatedAudioMs = (currentWord.length * 60 / currentWpm) * 1000; 
            let timeMultiplier = 1.0;
            if (reactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000)); 
            else if (reactionMs < estimatedAudioMs && levDist === 0) timeMultiplier = 1.1;
            points = Math.round(basePoints * timeMultiplier); 
            if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50"; 
            else if (levDist === 1) scoreColor = "#ff9800"; 
            else scoreColor = "#d32f2f"; 
            if (usedReplay) points = Math.round(points * 0.2);
        }
    }

    if (levDist > 0) {
        let wrongChars = [];
        for (let i = 0; i < Math.max(currentWord.length, userWord.length); i++) {
            if (userWord[i] !== currentWord[i] && currentWord[i] && !['__proto__','constructor','prototype'].includes(currentWord[i])) {
                if (!wrongChars.includes(currentWord[i])) wrongChars.push(currentWord[i]);
            }
        }
        if (!sessionErrorsByWpm[currentWpm]) sessionErrorsByWpm[currentWpm] = Object.create(null);
        wrongChars.forEach(c => { 
            sessionCharErrors[c] = (sessionCharErrors[c] || 0) + 1; 
            sessionErrorsByWpm[currentWpm][c] = (sessionErrorsByWpm[currentWpm][c] || 0) + 1; 
        });
    }

    if (!isFixedSpeed && currentMode !== 'chars') { 
        if (levDist === 0 && !usedReplay) currentWpm += 2; 
        else if (levDist === 1) currentWpm -= 1; 
        else if (levDist > 1) currentWpm -= 2; 
        currentWpm = Math.max(10, currentWpm); 
    }
    totalScore += points; 
    matchDetailsArray.push({ real: currentWord, typed: userWord, points: points, wpm: currentWpm, ms: reactionMs });

    if (currentMode !== 'pingpong') {
        const tr = document.createElement('tr');
        const tdTyped = document.createElement('td'); tdTyped.textContent = userWord;
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = currentWord; tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); 
        tdPoints.style.color = scoreColor; 
        tdPoints.style.fontWeight = 'bold'; 
        tdPoints.textContent = currentMode === 'chars' ? points + " (" + reactionMs + "ms)" : (usedReplay ? '0 (Replay)' : (points > 0 ? "+"+points : points));
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        if (els.tableBody) { 
            els.tableBody.appendChild(tr); 
            els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight; 
        }
    }
    
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wpm: currentWpm, wordIndex: wordIndex + 1, matchDetails: matchDetailsArray });
    usedReplay = false;
    
    if (currentMode === 'pingpong') { 
        wordIndex++; 
        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { 
            if (d) { 
                d.senderId = myId; 
                d.word = ''; 
                d.wordsPlayed = (d.wordsPlayed || 0) + 1; 
                d.lastGuess = { id: Date.now(), real: currentWord, typed: userWord, points: points }; 
            } 
            return d; 
        }); 
    } else { 
        wordIndex++; 
        setTimeout(playNextWord, 600); 
    }
}

if (els.btnSendPingPong) {
    els.btnSendPingPong.addEventListener('click', () => { 
        if (!gameRunning || currentMode !== 'pingpong') return; 
        let word = els.pingPongWordToSend.value.trim().toUpperCase(); 
        if (!word) return; 
        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { 
            if (d) { 
                d.word = word; 
                d.wordId = (d.wordId || 0) + 1; 
            } 
            return d; 
        }); 
    });
}
if (els.pingPongWordToSend) {
    els.pingPongWordToSend.addEventListener('keypress', e => { 
        if (e.key === 'Enter') els.btnSendPingPong.click(); 
    });
}

// --- GAME CORE: COUNTDOWN, RESUME, NEXT WORD, FINISH ---
// Gestito in game_core.js

function setupPingPongListener() {
    if (listeners.pingPong) db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong);
    listeners.pingPong = db.ref(`rooms/${roomCode}/pingpong`).on('value', snap => {
        if (!gameRunning) return; 
        const ppData = snap.val(); 
        if (!ppData) return;
        
        if (ppData.lastGuess && ppData.lastGuess.id !== window.lastSeenGuessId) {
            window.lastSeenGuessId = ppData.lastGuess.id;
            const tr = document.createElement('tr');
            const tdTyped = document.createElement('td'); tdTyped.textContent = ppData.lastGuess.typed || '';
            const tdReal = document.createElement('td'); renderDiffSecure(tdReal, ppData.lastGuess.real, ppData.lastGuess.typed || '');
            const tdPoints = document.createElement('td'); tdPoints.style.fontWeight = 'bold'; tdPoints.style.color = ppData.lastGuess.points > 0 ? "#4caf50" : (ppData.lastGuess.points === 0 && ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999"); tdPoints.textContent = ppData.lastGuess.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
            if (els.tableBody) els.tableBody.appendChild(tr); 
            if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }
        if (ppData.wordsPlayed >= requestedWordCount) { 
            if (ppTimerInterval) clearInterval(ppTimerInterval); 
            return finishGame(); 
        }
        if (ppData.senderId === myId) {
            if (!ppData.word) { 
                if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'flex'; 
                if (els.gameInputArea) els.gameInputArea.style.display = 'none'; 
                if (els.pingPongWordToSend) {
                    els.pingPongWordToSend.value = ''; 
                    setTimeout(() => els.pingPongWordToSend.focus(), 100); 
                }
                startPingPongTimer(); 
            } else { 
                if (ppTimerInterval) clearInterval(ppTimerInterval); 
                if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none'; 
                if (els.gameInputArea) els.gameInputArea.style.display = 'flex'; 
                if (els.permanentGameInput) {
                    els.permanentGameInput.disabled = true; 
                    els.permanentGameInput.placeholder = "Avversario in decodifica..."; 
                    els.permanentGameInput.value = ""; 
                }
            }
        } else {
            if (ppTimerInterval) clearInterval(ppTimerInterval); 
            if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none'; 
            if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
            if (ppData.word && ppData.wordId > window.lastPlayedWordId) { 
                window.lastPlayedWordId = ppData.wordId; 
                gameWords[wordIndex] = ppData.word; 
                if (els.permanentGameInput) {
                    els.permanentGameInput.disabled = false; 
                    els.permanentGameInput.placeholder = "Decodifica e scrivi..."; 
                    els.permanentGameInput.value = ""; 
                    setTimeout(() => els.permanentGameInput.focus(), 100); 
                }
                inputActive = true; 
                setTimeout(() => playMorseAudio(ppData.word.toUpperCase(), currentWpm), 500); 
            } else if (!ppData.word && els.permanentGameInput) { 
                els.permanentGameInput.disabled = true; 
                els.permanentGameInput.placeholder = "In attesa dell'avversario..."; 
                els.permanentGameInput.value = ""; 
                inputActive = false; 
            }
        }
    });
}

function startPingPongTimer() {
    if (ppTimerInterval) clearInterval(ppTimerInterval); 
    let timeLeft = 100; 
    if (els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = '100%';
    ppTimerInterval = setInterval(() => { 
        timeLeft -= (100 / 300); 
        if (els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = Math.max(0, timeLeft) + '%'; 
        if (timeLeft <= 0) { 
            clearInterval(ppTimerInterval); 
            sendAutoPingPongWord(); 
        } 
    }, 100);
}

function sendAutoPingPongWord() {
    if (!gameRunning || currentMode !== 'pingpong') return;
    const randomWord = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { 
        if (d && !d.word) { 
            d.word = randomWord; 
            d.wordId = (d.wordId || 0) + 1; 
        } 
        return d; 
    });
    showToast(currentLang === 'it' ? "Tempo scaduto! Parola inviata automaticamente." : "Time's up! Word sent automatically.");
}

function finishGame() {
    gameRunning = false; 
    inputActive = false; 
    if (els.permanentGameInput) els.permanentGameInput.blur();
    clearAllTimers();
    
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    
    localStorage.removeItem(STORAGE_ROOM_KEY); 
    isRejoining = false; 
    isChallenging = false; 
    
    db.ref(`presence/${myId}`).update({
        allowSpectators: false,
        activeRoomCode: null,
        status: 'online'
    });

    showScreen('leaderboardScreen');

    if (currentMode === 'daily_challenge' && els.btnShareDaily) {
        els.btnShareDaily.style.display = 'inline-block';
        els.btnShareDaily.onclick = () => {
            const appUrl = encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`);
            const textMsg = encodeURIComponent(`📻 Sfida Giornaliera CW!\nHo totalizzato ${totalScore} pt (Max Velocità: ${currentWpm} WPM).\nRiesci a fare di meglio?`);
            const shareUrl = `https://t.me/share/url?url=${appUrl}&text=${textMsg}`;
            try {
                if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, '_blank');
            } catch (e) {
                window.open(shareUrl, '_blank');
            }
        };
    } else if (els.btnShareDaily) {
        els.btnShareDaily.style.display = 'none';
    }

    if (roomCode) { 
        const myPlayerRef = db.ref(`rooms/${roomCode}/players/${myId}`); 
        myPlayerRef.update({ finished: true, score: totalScore, wpm: currentWpm, matchDetails: matchDetailsArray }); 
        myPlayerRef.onDisconnect().cancel(); 
    }
    
    if (totalScore > 0 && !roomCode.startsWith("TRN_")) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const isReallySolo = isSinglePlayer || (Object.keys(snap.val() || {}).length < 2);
            let dbPath;
            if (currentMode === 'daily_challenge') {
                let todayStr = new Date().toISOString().split('T')[0];
                dbPath = `leaderboard/daily_challenge/${todayStr}/${myId}`;
            } else {
                const modeFolder = currentMode === 'callsign' ? 'callsign/global' : `${currentMode === 'quiz' ? 'quiz' : currentMode === 'chars' ? 'chars' : currentMode === 'pingpong' ? 'pingpong' : 'standard'}/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}`;
                dbPath = `leaderboard/${modeFolder}/${myId}`;
            }

            db.ref(dbPath).once('value', s => { 
                let oldData = s.val(); 
                let oldScore = oldData ? (Number(oldData.score) || 0) : 0;
                if (!oldData || totalScore > oldScore) {
                    db.ref(dbPath).set({ name: myName, username: myPrivacy ? "" : tgUsername, score: totalScore, wpm: currentWpm, wordCount: requestedWordCount, date: new Date().toLocaleDateString('it-IT') }); 
                    showToast(currentLang === 'it' ? "🏆 Nuovo Record in Classifica!" : "🏆 New Leaderboard Record!");
                } else {
                    showToast(currentLang === 'it' ? "Ottima partita! (Non hai superato il tuo record personale)" : "Good game! (Personal best not beaten)");
                }
            });
        });
    }

    if (matchDetailsArray.length > 0) {
        db.ref(`users/${myId}/history`).push().set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: currentWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });
        updateActivity(totalScore > 0);
        if (Object.keys(sessionCharErrors).length > 0) {
            db.ref(`users/${myId}/stats/charErrors`).once('value', s => { 
                let curr = s.val() || {}; 
                for (let char in sessionCharErrors) curr[char] = (curr[char] || 0) + sessionCharErrors[char]; 
                db.ref(`users/${myId}/stats/charErrors`).set(curr); 
            });
        }
        if (Object.keys(sessionErrorsByWpm).length > 0) {
            db.ref(`users/${myId}/stats/errorsByWpm`).once('value', s => { 
                let curr = s.val() || {}; 
                for (let w in sessionErrorsByWpm) { 
                    if (!curr[w]) curr[w] = {}; 
                    for (let c in sessionErrorsByWpm[w]) curr[w][c] = (curr[w][c] || 0) + sessionErrorsByWpm[w][c]; 
                } 
                db.ref(`users/${myId}/stats/errorsByWpm`).set(curr); 
            });
        }
    }

    if (currentMode === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
        activeTab = "daily_challenge"; 
        showLeaderboardTab('opt_lb_daily');
    }
    else if (roomCode && roomCode.startsWith("TRN_")) { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
    else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; showLeaderboardTab('tabGlobalCWFreakBtn'); }
    else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; showLeaderboardTab('tabGlobalPingPongBtn'); }
    else if (isSinglePlayer && currentMode === 'quiz') { activeTab = "quiz_single"; showLeaderboardTab('tabGlobalQuizSingleBtn'); }
    else if (isSinglePlayer && currentMode === 'chars') { activeTab = "chars_single"; showLeaderboardTab('tabGlobalCharsSingleBtn'); }
    else if (isSinglePlayer) { activeTab = "std_single"; showLeaderboardTab('tabGlobalStandardSingleBtn'); }
    else { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
}

// --- CONQUISTA (CO-OP) ---
// Gestito in coop_manager.js

// --- QUIZ MORSE ---
// Gestito in quiz_manager.js

// --- BATTAGLIA REALE ---
// Gestito in br_manager.js
    inputActive = false;

    if (myId === roomHostId) {
        const initialWords = generateCoopTripleWords();
        db.ref(`rooms/${roomCode}/coop_state`).set({
            progress: 10,
            timeRemaining: 300,
            status: 'playing',
            activeWords: initialWords,
            freqOwners: { 1: null, 2: null, 3: null }
        });
        startCoopHostTimers();
    }

    listenToCoopState();
    setupCoopFreqButtons();
}

function generateCoopTripleWords() {
    const wEasy = masterDictionary.filter(w => w.length >= 3 && w.length <= 4);
    const wMed  = masterDictionary.filter(w => w.length >= 5 && w.length <= 6);
    const wHard = masterDictionary.filter(w => w.length >= 7);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.toUpperCase() || "RADIO";
    return [pick(wEasy), pick(wMed), pick(wHard)];
}

function startCoopHostTimers() {
    if (coopTimerInterval) clearInterval(coopTimerInterval);
    if (coopDecayInterval) clearInterval(coopDecayInterval);

    coopTimerInterval = setInterval(() => {
        db.ref(`rooms/${roomCode}/coop_state/timeRemaining`).transaction(t => {
            if (t === null || t <= 0) return 0;
            return t - 1;
        });
    }, 1000);

    coopDecayInterval = setInterval(() => {
        db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
            if (!state || state.status !== 'playing') return state;
            state.progress = Math.max(0, (state.progress || 0) - 1);
            if (state.timeRemaining <= 0) state.status = 'lost';
            return state;
        });
    }, 2000);
}

function listenToCoopState() {
    db.ref(`rooms/${roomCode}/coop_state`).on('value', snap => {
        const state = snap.val();
        if (!state || !gameRunning) return;

        if (els.coopProgressBar) els.coopProgressBar.style.width = `${state.progress}%`;
        if (els.coopProgressText) els.coopProgressText.textContent = `Conquista: ${state.progress}%`;
        
        const mins = Math.floor(state.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (state.timeRemaining % 60).toString().padStart(2, '0');
        if (els.coopTimeDisplay) els.coopTimeDisplay.textContent = `⏱️ ${mins}:${secs}`;

        if (state.progress >= 100 && state.status !== 'won') {
            if (myId === roomHostId) db.ref(`rooms/${roomCode}/coop_state/status`).set('won');
            finishCoopGame(true);
            return;
        } else if (state.timeRemaining <= 0 || state.status === 'lost') {
            finishCoopGame(false);
            return;
        }

        const owners = state.freqOwners || { 1: null, 2: null, 3: null };
        [1, 2, 3].forEach(num => {
            const btn = els[`btnCoopFreq${num}`];
            const ownerDiv = els[`coopOwner${num}`];
            const ownerId = owners[num];

            if (!btn || !ownerDiv) return;

            if (!ownerId) {
                btn.disabled = false;
                btn.style.opacity = "1";
                ownerDiv.textContent = "LIBERA";
                ownerDiv.style.color = "var(--hint-color)";
            } else if (ownerId === myId) {
                btn.disabled = false;
                btn.style.opacity = "1";
                ownerDiv.textContent = "🔒 IN USO DA TE";
                ownerDiv.style.color = "#4caf50";
            } else {
                btn.disabled = true;
                btn.style.opacity = "0.4";
                db.ref(`rooms/${roomCode}/players/${ownerId}/name`).once('value', s => {
                    ownerDiv.textContent = `🔒 ${s.val() || 'ALTRO'}`;
                });
                ownerDiv.style.color = "#ff9800";
            }
        });

        if (coopActiveFreqIndex > 0 && owners[coopActiveFreqIndex] === myId && state.activeWords && state.activeWords.length === 3) {
            const currentFreqWord = state.activeWords[coopActiveFreqIndex - 1];
            if (currentFreqWord && currentFreqWord !== gameWords[0]) {
                gameWords[0] = currentFreqWord;
                inputActive = true;
                
                stopAllMorseAudio();
                playMorseAudio(currentFreqWord, currentWpm);
                
                if (els.permanentGameInput) {
                    els.permanentGameInput.value = "";
                    els.permanentGameInput.focus();
                }
            }
        }
    });
}

function setupCoopFreqButtons() {
    const labels = ["🟢 FREQ 1 (3-4 car.)", "🟡 FREQ 2 (5-6 car.)", "🔴 FREQ 3 (7+ car.)"];
    
    [1, 2, 3].forEach(num => {
        const btn = els[`btnCoopFreq${num}`];
        if (!btn) return;
        btn.onclick = () => {
            db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) owners = { 1: null, 2: null, 3: null };
                if (owners[num] && owners[num] !== myId) return undefined;
                [1, 2, 3].forEach(n => { if (owners[n] === myId) owners[n] = null; });
                owners[num] = myId;
                return owners;
            }, (error, committed, snapshot) => {
                if (committed) {
                    const latestOwners = snapshot.val() || {};
                    coopActiveFreqIndex = num;
                    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = `Canale: ${labels[num - 1]}`;
                    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'inline-block';
                    
                    if (els.permanentGameInput) {
                        els.permanentGameInput.disabled = false;
                        els.permanentGameInput.placeholder = "Digita qui...";
                        els.permanentGameInput.focus();
                    }
                    inputActive = true; 
                    
                    db.ref(`rooms/${roomCode}/coop_state/activeWords`).once('value', s => {
                        const words = s.val();
                        if (words && words[num - 1] && latestOwners[num] === myId) {
                            gameWords[0] = words[num - 1];
                            stopAllMorseAudio();
                            playMorseAudio(words[num - 1], currentWpm);
                            if (els.permanentGameInput) els.permanentGameInput.focus();
                        }
                    });
                } else {
                    showToast("⚠️ Frequenza occupata da un compagno!");
                }
            });
        };
    });

    if (els.btnCoopReleaseFreq) {
        els.btnCoopReleaseFreq.onclick = () => {
            db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) return owners;
                [1, 2, 3].forEach(n => { if (owners[n] === myId) owners[n] = null; });
                return owners;
            }, () => {
                coopActiveFreqIndex = 0;
                inputActive = false;
                stopAllMorseAudio();
                if (els.permanentGameInput) {
                    els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴...";
                    els.permanentGameInput.value = "";
                }
                if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
                if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';
                showToast("🔓 Canale rilasciato per i compagni.");
            });
        };
    }
}

function finishCoopGame(won) {
    gameRunning = false;
    clearAllTimers();
    if (roomCode) db.ref(`rooms/${roomCode}/coop_state`).off();

    if (roomCode) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const players = snap.val() || {};
            const namesList = Object.values(players).map(p => p.name).join(", ");
            const finalScore = won ? 100 : 75;

            const fakeHeadToHead = {
                "team_real": {
                    id: myId,
                    name: `👥 ${namesList || "Squadra"}`,
                    score: finalScore,
                    wpm: currentWpm,
                    finished: true
                },
                "team_ai": {
                    id: "ai_enemy",
                    name: "🤖 Disturbo Nemico (AI)",
                    score: won ? 99 : 100,
                    wpm: currentWpm + 5,
                    finished: true
                }
            };

            db.ref(`rooms/${roomCode}/players`).set(fakeHeadToHead);

            const matchId = Date.now().toString();
            const matchData = {
                players: Object.values(fakeHeadToHead),
                mode: "conquest",
                wordCount: "Co-op",
                date: new Date().toLocaleDateString('it-IT'),
                ts: firebase.database.ServerValue.TIMESTAMP
            };
            db.ref(`leaderboard/recent_matches/conquest_multi/all/${matchId}`).set(matchData);
        });
    }

    showScreen('leaderboardScreen');
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';
    if (els.coopArea) els.coopArea.style.display = 'none';

    if (won) {
        showToast("🏆 VITTORIA DI SQUADRA! Territorio Conquistato!");
        if (els.roomWinnerBanner) {
            els.roomWinnerBanner.textContent = "🏆 MISSIONE COMPIUTA CONTRO IL DISTURBO NEMICO!";
            els.roomWinnerBanner.style.color = "#4caf50";
        }
        updateActivity(true);
    } else {
        showToast("💀 TEMPO SCADUTO! Il disturbo nemico ha vinto.");
        if (els.roomWinnerBanner) {
            els.roomWinnerBanner.textContent = "💀 MISSIONE FALLITA: HA VINTO L'AVVERSARIO IRREALE";
            els.roomWinnerBanner.style.color = "#d32f2f";
        }
        updateActivity(false);
    }
}
// --- QUIZ MORSE (CON SHUFFLE RISPOSTE A/B/C/D E FISHER-YATES) ---
// Gestito in quiz_manager.js

// --- BATTAGLIA REALE SERALE ---
// Gestito in br_manager.js

// --- MODALITÀ SPETTATORE ---
window.watchSpecificRoom = function(code, targetName) {
    roomCode = code;
    showScreen('gameArea');
    
    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = true;
        els.permanentGameInput.placeholder = `👁️ Stai osservando la partita di ${targetName}...`;
        els.permanentGameInput.value = "";
    }
    
    if (els.wpmDisplay) els.wpmDisplay.textContent = "👁️ SPETTATORE | WPM: --";
    if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.style.display = 'none';

    const mySpectatorRef = db.ref(`rooms/${roomCode}/spectators/${myId}`);
    mySpectatorRef.set({ name: myName, ts: firebase.database.ServerValue.TIMESTAMP });
    mySpectatorRef.onDisconnect().remove();
    
    const roomRef = db.ref(`rooms/${roomCode}`);
    const onRoomChange = roomRef.on('value', snap => {
        if (!snap.exists()) {
            showToast("⚠️ Il giocatore ha terminato o abbandonato la partita.");
            stopWatchingCleanly();
            return;
        }

        const roomData = snap.val();
        const players = roomData.players || {};
        const hostData = Object.values(players)[0];

        if (!hostData || hostData.finished) {
            showToast("🏁 La partita che stavi osservando è terminata!");
            stopWatchingCleanly();
            return;
        }

        const currentSpeed = hostData.wpm || roomData.wpm || 20;
        if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${currentSpeed}`;
        if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${hostData.score || 0}`;
        
        if (els.tableBody && hostData.matchDetails) {
            els.tableBody.innerHTML = "";
            hostData.matchDetails.forEach(row => {
                const tr = document.createElement('tr'); 
                const tdTyped = document.createElement('td'); 
                tdTyped.textContent = row.typed || "-";
                
                const tdReal = document.createElement('td'); 
                const bReal = document.createElement('b'); 
                renderDiffSecure(bReal, row.real, row.typed || ""); 
                tdReal.appendChild(bReal);
                
                const tdPoints = document.createElement('td'); 
                tdPoints.style.color = row.points > 0 ? "#4caf50" : "#d32f2f"; 
                tdPoints.style.fontWeight = "bold"; 
                tdPoints.textContent = row.points;
                
                tr.appendChild(tdTyped); 
                tr.appendChild(tdReal); 
                tr.appendChild(tdPoints); 
                els.tableBody.appendChild(tr);
            });

            setTimeout(() => {
                if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
            }, 50);
        }
    });

    const onAudioChange = db.ref(`rooms/${roomCode}/liveAudio`).on('value', snap => {
        const audioData = snap.val();
        if (audioData && audioData.word) {
            const liveWpm = audioData.wpm || 20;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`;
            playMorseAudio(audioData.word, liveWpm, true);
        }
    });

    window.currentSpectatorCleanup = function() {
        roomRef.off('value', onRoomChange);
        db.ref(`rooms/${roomCode}/liveAudio`).off('value', onAudioChange);
        mySpectatorRef.remove();
    };
};

function stopWatchingCleanly() {
    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }
    setTimeout(() => {
        roomCode = "";
        goBackToMenu();
    }, 2500);
}

// --- CLASSIFICHE GLOBALI E DI STANZA ---
// Gestito in leaderboard_manager.js

if (els.lbModeSelect) els.lbModeSelect.addEventListener('change', e => { activeTab = e.target.value; showLeaderboardTab(e.target.value); });
if (els.btnTrnGlobalLB) {
    els.btnTrnGlobalLB.addEventListener('click', () => { 
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); 
        els.btnTrnGlobalLB.classList.add('active-tab'); 
        fetchAndRenderGlobalLeaderboard('tournaments', null); 
    });
}
if (els.btnTrnActiveLB) {
    els.btnTrnActiveLB.addEventListener('click', () => { 
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); 
        els.btnTrnActiveLB.classList.add('active-tab'); 
        fetchAndRenderGlobalLeaderboard('active_tournament', null); 
    });
}
if (els.lbWordFilter) els.lbWordFilter.addEventListener('change', () => { showLeaderboardTab(activeTab); });

// populateDynamicFilters gestito in leaderboard_manager.js

// listenToRoomLeaderboard gestito in leaderboard_manager.js

// checkTournamentCompletion gestito in teams_manager.js

// renderRoomLeaderboard gestito in leaderboard_manager.js

// renderHeadToHeadView gestito in leaderboard_manager.js

// showPlayerDetailsModal gestito in leaderboard_manager.js

// saveMatchToGlobalHistory gestito in leaderboard_manager.js

// fetchAndRenderGlobalLeaderboard gestito in leaderboard_manager.js

// renderMatchesHistoryHTML gestito in leaderboard_manager.js

// renderPlayersListHTML gestito in leaderboard_manager.js

// --- SQUADRE E TORNEI ---
// Gestito in teams_manager.js

if (els.goToTeamsBtn) els.goToTeamsBtn.addEventListener('click', () => showScreen('teamsScreen'));

function processTeamInvite(inviteTeamId) {
    db.ref(`teams/${inviteTeamId}`).once('value', snap => {
        if (snap.exists() && snap.val().status === 'open') {
            db.ref(`teams/${inviteTeamId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername }); 
            tg.showAlert(`Sei entrato nella squadra ${snap.val().name}!`); 
            showScreen('teamsScreen');
        } else { 
            tg.showAlert("Squadra non esistente o chiusa."); 
            showScreen('setupScreen'); 
        }
    });
}

// checkMyTeamStatus e altre funzioni gestite in teams_manager.js

if (els.createTeamBtn) {
    els.createTeamBtn.addEventListener('click', () => {
        const tName = els.newTeamName ? els.newTeamName.value.trim() : ""; 
        if (!tName) return;
        db.ref('teams').push().set({ name: tName, captainId: myId, status: 'open', members: { [myId]: { name: myName, username: myPrivacy ? "" : tgUsername } } }).then(() => checkMyTeamStatus());
    });
}

// listenToAllTeams, joinTeam, listenToMyTeam, etc. in teams_manager.js

if (els.clearTeamChatBtn) {
    els.clearTeamChatBtn.addEventListener('click', () => { 
        if (confirm('Vuoi cancellare la chat di squadra?')) if (myTeamId) db.ref(`teams/${myTeamId}/chat`).remove(); 
    });
}
if (els.sendTeamChatBtn) {
    els.sendTeamChatBtn.addEventListener('click', () => { 
        const txt = els.teamChatInput.value.trim(); 
        if (!txt || !myTeamId) return; 
        db.ref(`teams/${myTeamId}/chat`).push({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP }); 
        els.teamChatInput.value = ''; 
    });
}
if (els.teamChatInput) {
    els.teamChatInput.addEventListener('keypress', e => { 
        if (e.key === 'Enter' && els.sendTeamChatBtn) els.sendTeamChatBtn.click(); 
    });
}
if (els.leaveTeamBtn) {
    els.leaveTeamBtn.addEventListener('click', () => {
        if (confirm("Vuoi abbandonare la squadra?")) {
            db.ref(`teams/${myTeamId}`).once('value', snap => {
                const team = snap.val();
                if (isTeamCaptain) {
                    let others = Object.keys(team.members).filter(id => id !== myId);
                    if (others.length > 0) db.ref(`teams/${myTeamId}/captainId`).set(others[0]).then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus()));
                    else db.ref(`teams/${myTeamId}/status`).set('retired').then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus()));
                } else {
                    db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus());
                }
            });
        }
    });
}

// listenToTournaments, viewTournament, joinTournament, renderActiveTournament, etc. in teams_manager.js

if (els.createTrnBtn) {
    els.createTrnBtn.addEventListener('click', () => { 
        if (!isTeamCaptain) return; 
        const n = els.newTrnName ? els.newTrnName.value.trim() : ""; 
        if (n) {
            db.ref('tournaments').push().set({ 
                name: n, 
                hostId: myId, 
                status: 'open', 
                teams: { [myTeamId]: { name: myTeamName } }, 
                standings: { [myTeamId]: { points: 0, name: myTeamName } } 
            }); 
        }
    });
}
window.joinTournament = function(tId) { 
    if (!isTeamCaptain) return; 
    db.ref(`tournaments/${tId}/teams/${myTeamId}`).set({ name: myTeamName }); 
    db.ref(`tournaments/${tId}/standings/${myTeamId}`).set({ points: 0, name: myTeamName }); 
};


// --- RENDER TORNEO ATTIVO CON PULSANTI SQUADRA CHIARI ---
// Gestito in teams_manager.js


// toggleTrnSlot, startTrnMatch, checkTournamentCompletion in teams_manager.js

// --- ATTIVITÀ, MEDAGLIE E STATISTICHE UTENTE ---
// Gestito in profile_manager.js

if (els.deleteDataBtn) {
    els.deleteDataBtn.addEventListener('click', async () => {
        if (confirm("⚠️ Eliminerai per sempre TUTTI i tuoi dati. Confermi?")) {
            try {
                await db.ref(`leaderboard`).once('value', s => { 
                    s.forEach(mode => { 
                        mode.forEach(type => { 
                            type.forEach(r => { 
                                if (r.key === myId || r.key.startsWith(myId + "_")) r.ref.remove(); 
                            }); 
                        }); 
                    }); 
                });
                const teamsSnap = await db.ref('teams').once('value');
                if (teamsSnap.exists()) {
                    const teams = teamsSnap.val();
                    for (let tId in teams) {
                        if (teams[tId].members && teams[tId].members[myId]) {
                            if (teams[tId].captainId === myId) {
                                let others = Object.keys(teams[tId].members).filter(k => k !== myId);
                                if (others.length === 0) { 
                                    await db.ref(`teams/${tId}/status`).set('retired'); 
                                    await db.ref(`teams/${tId}/members/${myId}`).remove(); 
                                } else { 
                                    await db.ref(`teams/${tId}/captainId`).set(others[0]); 
                                    await db.ref(`teams/${tId}/members/${myId}`).remove(); 
                                }
                            } else {
                                await db.ref(`teams/${tId}/members/${myId}`).remove();
                            }
                        }
                    }
                }
                const trnsSnap = await db.ref('tournaments').once('value');
                if (trnsSnap.exists()) {
                    const trns = trnsSnap.val();
                    for (let trnId in trns) {
                        if (trns[trnId].matches) {
                            for (let mId in trns[trnId].matches) {
                                const m = trns[trnId].matches[mId];
                                if (m.playerA && m.playerA.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).remove();
                                if (m.playerB && m.playerB.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).remove();
                            }
                        }
                    }
                }
                await db.ref(`users/${myId}`).remove(); 
                alert("Dati eliminati."); 
                window.Telegram.WebApp.close();
            } catch (e) { 
                alert("Errore: " + e.message); 
            }
        }
    });
}

if (els.saveAliasBtn) {
    els.saveAliasBtn.addEventListener('click', async () => {
        const alias = els.userAliasInput ? els.userAliasInput.value.trim() : ""; 
        const privacy = els.privacyUsernameCheckbox ? els.privacyUsernameCheckbox.checked : false;
        if (privacy && !alias) return alert("L'Alias è obbligatorio se nascondi lo username Telegram!");
        if (alias.length > 15) return alert("Alias troppo lungo (max 15 caratteri).");
        const newName = alias || tgUser.first_name; 
        const currentUsername = privacy ? "" : tgUsername;

        try {
            await db.ref(`users/${myId}`).update({ alias: alias || null, privacyUsername: privacy });
            myName = newName; myPrivacy = privacy; 
            if (els.playerName) els.playerName.textContent = myName; 
            showToast("Profilo aggiornato!");
            await syncUserNameEverywhere(myId, newName, currentUsername);
        } catch(e) { 
            alert("Errore durante il salvataggio."); 
        }
    });
}

if (els.resetStatsBtn) {
    els.resetStatsBtn.addEventListener('click', async () => { 
        if (confirm(currentLang === 'it' ? "Vuoi azzerare tutte le tue statistiche? Questa operazione non può essere annullata." : "Reset all your statistics? This cannot be undone.")) { 
            try { 
                await Promise.all([ db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove() ]); 
                showToast("Statistiche azzerate correttamente!"); 
                showProfileScreen(); 
            } catch(e) { 
                alert("Errore durante il reset delle statistiche."); 
            } 
        } 
    });
}

// showProfileScreen, openMatchDetails, deleteHistoryItem, syncUserNameEverywhere in profile_manager.js

// ============================================================================
// GESTIONE STANDBY / SPEGNIMENTO SCHERMO DURANTE IL GIOCO
// ============================================================================

window.lostFocusDuringWord = false;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // 1. Lo schermo si è spento o l'utente ha ridotto Telegram a icona
        if (gameRunning && inputActive) {
            window.lostFocusDuringWord = true;
            stopAllMorseAudio(); // Zittisce immediatamente eventuali oscillatori appesi
        }
    } else {
        // 2. Lo schermo si è riacceso
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        startBluetoothKeepAlive();
        // Se l'utente era nel mezzo di una parola/carattere quando ha spento lo schermo
        if (gameRunning && window.lostFocusDuringWord) {
            window.lostFocusDuringWord = false;
            inputActive = false;
            showToast("⚠️ Schermo spento: parola considerata persa!");

            // Gestione specifica in base alla modalità di gioco
            if (currentMode === 'conquest') {
                // In Conquista (Co-op) applichiamo una piccola penalità e rigeneriamo la parola
                db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                    if (!state || state.status !== 'playing') return state;
                    state.progress = Math.max(0, (state.progress || 0) - 2);
                    return state;
                });
                setTimeout(() => {
                    if (gameRunning) startCoopSequence();
                }, 1000);

            } else if (currentMode === 'quiz') {
                // In Quiz consideriamo la risposta errata per timeout
                submitQuizAnswer(-1);

            } else if (currentMode === 'pingpong') {
                // In Ping Pong inviamo automaticamente una parola di timeout
                sendAutoPingPongWord();

            } else {
                // PAROLE COMUNI, NOMINATIVI O CARATTERI:
                // Non resettiamo currentWpm a baseWpm! Applichiamo solo la normale penalità (-2 WPM)
                currentWpm = Math.max(10, currentWpm - 2);
                if (els.wpmDisplay) {
                    els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
                }

                const missedWord = gameWords[wordIndex] ? gameWords[wordIndex].toUpperCase() : "-";
                
                // Registriamo la parola persa nello storico della partita con 0 punti
                matchDetailsArray.push({
                    real: missedWord,
                    typed: "TIMEOUT (SCHERMO)",
                    points: 0,
                    wpm: currentWpm,
                    ms: 0
                });

                // Aggiungiamo una riga rossa visibile in tabella per indicare il timeout
                if (els.tableBody) {
                    const tr = document.createElement('tr');
                    const tdTyped = document.createElement('td'); 
                    tdTyped.textContent = "TIMEOUT";
                    tdTyped.style.color = "#d32f2f";
                    tdTyped.style.fontSize = "0.8em";
                    
                    const tdReal = document.createElement('td'); 
                    tdReal.innerHTML = `<b>${escapeHTML(missedWord)}</b>`;
                    
                    const tdPoints = document.createElement('td'); 
                    tdPoints.style.color = "#d32f2f"; 
                    tdPoints.style.fontWeight = 'bold'; 
                    tdPoints.textContent = "0";
                    
                    tr.appendChild(tdTyped); 
                    tr.appendChild(tdReal); 
                    tr.appendChild(tdPoints);
                    els.tableBody.appendChild(tr);
                    
                    if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
                }

                // Passiamo direttamente alla parola successiva
                wordIndex++;
                setTimeout(() => {
                    if (gameRunning) playNextWord();
                }, 800);
            }
        }
    }
});
