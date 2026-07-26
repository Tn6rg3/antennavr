const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20240521.37"; // Versione incrementata

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;
const tgUsername = tgUser?.username || "";
const startParam = tg.initDataUnsafe?.start_param;

// --- MAPPA DOM DINAMICA (Proxy) ---
const els = new Proxy({}, { get: (target, id) => document.getElementById(id) });

// --- COSTANTI ---
const STORAGE_ROOM_KEY = "cwgame_last_room";
const STORAGE_CUSTOM_DICT_KEY = "cwgame_custom_dict";
const STORAGE_CHAT_MUTED_KEY = "cwgame_chat_muted"; // Nuova costante per il mute
const STORAGE_PREF_WPM = "cwgame_pref_wpm";
const STORAGE_PREF_WORDS = "cwgame_pref_words";
const STORAGE_PREF_TONE = "cwgame_pref_tone";

// --- STATO GLOBALE ---
let myName, myId, myPrivacy = false;
let myTeamId = null, myTeamName = "", isTeamCaptain = false;
let db, auth, currentLang = 'it';
let activeChatContext = null, activeTab = "room", isChatDrawerOpen = false;
let isGlobalChatMuted = false; // Stato per le notifiche della chat globale
let isChallenging = false, isRejoining = false, currentInviterId = null;
let roomCode = "", roomHostId = null, activeTrnId = null;
let lastPlayerCount = 0, gameStartPlayerCount = 0, lobbyTimerInterval = null;
let gameRunning = false, inputActive = false, audioCtx = null;
let gameWords = [], wordIndex = 0, currentWpm = 20, baseWpm = 20, currentTone = 600;
let totalScore = 0, currentStreak = 0, usedReplay = false, matchDetailsArray = [];
let isSinglePlayer = false, currentMode = "standard", requestedWordCount = 10;
let isFixedSpeed = false, isEasyMode = false, lastWordStartTime = 0;

window.lastPlayedWordId = 0;
window.lastSeenGuessId = 0;

let masterDictionary = [], itDictionary = [], enDictionary = [], customDictionary = [];
let quizTimerInterval = null, currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;
let sessionCharErrors = Object.create(null), sessionErrorsByWpm = Object.create(null);
let userMatchHistory = [];

const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

// --- FORZATURA AGGIORNAMENTO CACHE ---
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

// --- FUNZIONI DI SUPPORTO ---
function escapeHTML(str) {
    if (!str && str !== 0) return "";
    return String(str).replace(/[&<>'"]/g, match => {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escapeMap[match];
    });
}

function showToast(message) {
    const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
}

window.openTelegramProfile = function(username) {
    if (username && String(username).trim() !== "") tg.openTelegramLink('https://t.me/' + username);
    else tg.showAlert("Questo utente ha impostato la privacy o non ha uno username pubblico.");
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');

    hideChat();
    if(els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';

    if (db && myId) {
        const isPlayingScreen = ['lobbyScreen', 'gameArea', 'countdownScreen', 'quizArea'].includes(screenId);
        db.ref(`presence/${myId}`).update({ status: isPlayingScreen ? 'playing' : 'online' });
    }

    if (screenId === 'setupScreen') {
        const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
        if (!lastRoom && els.rejoinContainer) els.rejoinContainer.style.display = 'none';
    }

    if (screenId === 'teamsScreen') { activeChatContext = 'team'; checkMyTeamStatus(); }
    else if (screenId === 'lobbyScreen' || screenId === 'gameArea') { activeChatContext = 'room'; listenToChat(); }
    else if (screenId === 'participationScreen') { switchActTab('daily'); activeChatContext = null; }
    else { activeChatContext = 'global'; listenToChat(); }
}

window.goBackToMenu = function() {
    if(activeChatContext !== 'team') hideChat();
    showScreen('setupScreen');
}

// --- DIZIONARI E TESTI MULTILINGUA ---
const i18n = {
    it: {
        hello: "Ciao", lb: "Classifica", profile: "Profilo", activity: "Attività", conn_secure: "Connessione sicura in corso...",
        free_challenge: "⚡ Sfida Libera", play_solo: "Gioca da Solo o Sfida un Amico",
        game_type: "Tipo di Gioco:", mode: "Modalità:", wpm: "WPM:", words: "Parole:", tone: "Tono:", timeout: "Scadenza Stanza (min):",
        opt_multi: "Multiplayer (con Lobby)", opt_single: "Singleplayer (Immediata)",
        opt_std: "Parole Comuni", opt_call: "Nominativi (CW Freak)", opt_pp: "Ping Pong",
        opt_custom: "Personale", fixed: "Fissa", easy: "Semplice", create_room: "Inizia Partita Libera", play_now: "Gioca Subito",
        challenge_board: "Bacheca Sfide ⏳", no_challenges: "Nessuna sfida.",
        online_users: "Utenti Online 🟢", global_chat: "💬 Chat", you_are_alone: "Sei solo.",
        profile_title: "👤 Profilo e Statistiche", alias_label: "Il tuo Alias", save: "Salva", alias_hint: "L'alias sostituirà il tuo nome Telegram nelle classifiche e nelle squadre.",
        privacy_label: "Nascondi mio username Telegram", privacy_hint: "Se attivo, nessuno potrà cliccare sul tuo nome per vedere il tuo profilo. L'Alias diventa obbligatorio.",
        wrong_chars: "📈 Caratteri più sbagliati", wpm_error: "⚠️ Errori per WPM", match_history: "📜 Storico Partite", loading: "Caricamento...",
        back_to_menu: "Torna al Menu Principale", daily: "Oggi", weekly: "Settimana", monthly: "Mese", medals: "Le Mie Medaglie",
        finished: "Concluso", winner: "Vincitore", points: "Punti", history: "Storico Partite",
        chat_title: "💬 Chat", chat_clear: "Cancella", chat_close: "Chiudi", chat_send: "Invia", chat_placeholder: "Scrivi un messaggio...",
        lobby_players: "Giocatori presenti:", lobby_chat: "💬 Chat di Stanza", lobby_invite: "📢 Invita Amici su Telegram",
        act_title: "Classifica Attività", act_loading: "Caricamento...", act_no_data: "Nessuna attività registrata.",
        prepare: "Preparati!", start_via: "VIA!", game_chat: "💬 Chat", quit_game: "Abbandona",
        input_placeholder: "Digita qui...", replay: "🔁 Riascolta", th_typed: "Scritto", th_real: "Reale", th_pts: "Punti",
        teams_btn: "🏆 TORNEI A SQUADRE", delete_data: "🗑️ Elimina Definitivamente i miei Dati",
        tab_this_match: "Questa Partita", tab_trn_lb: "Classifica Tornei", tab_callsigns: "Nominativi", tab_pingpong: "Ping Pong", tab_std_multi: "Parole (Multi)", tab_std_single: "Parole (Single)",
        btn_start_match: "AVVIA PARTITA", btn_delete_room: "ELIMINA STANZA", btn_leave_lobby: "Esci dalla Stanza",
        status_host: "Sei l'Host della partita.", status_guest: "Sei un partecipante. Attendi il via.", lobby_free: "Lobby Stanza Libera", lobby_trn: "Lobby Incontro Torneo 🥊",
        ready_btn: "SONO PRONTO ✅", waiting_host: "In attesa che l'Host avvii...",
        tab_my_team: "La mia Squadra", tab_all_teams: "Tutte le Squadre", tab_tournaments: "I Tornei",
        custom_title: "Dizionario Personale 📖", custom_desc: "Carica un file di testo (.txt) con le tue parole personalizzate.",
        select_file: "Scegli File .txt", custom_hint1: "Le parole possono essere separate da spazio, virgola o a capo.",
        custom_hint2: "Verranno ignorate le parole più corte di 3 caratteri.", custom_hint3: "Il dizionario rimarrà salvato in locale.",
        no_file: "Nessun file caricato.", loaded_words: "Parole caricate: ", manage_custom: "⚙️ Gestisci Dizionario Personale"
    },
    en: {
        hello: "Hello", lb: "Leaderboard", profile: "Profile", activity: "Activity", conn_secure: "Secure connection in progress...",
        free_challenge: "⚡ Free Challenge", play_solo: "Play Solo or Challenge a Friend",
        game_type: "Game Type:", mode: "Mode:", wpm: "WPM:", words: "Words:", tone: "Tone:", timeout: "Room Timeout (min):",
        opt_multi: "Multiplayer (Lobby)", opt_single: "Singleplayer (Immediate)",
        opt_std: "Common Words", opt_call: "Callsigns (CW Freak)", opt_pp: "Ping Pong",
        opt_custom: "Personal", fixed: "Fixed", easy: "Easy", create_room: "Start Free Match", play_now: "Play Now",
        challenge_board: "Challenge Board ⏳", no_challenges: "No challenges.",
        online_users: "Online Users 🟢", global_chat: "💬 Chat", you_are_alone: "You are alone.",
        profile_title: "👤 Profile and Statistics", alias_label: "Your Alias", save: "Save", alias_hint: "The alias will replace your Telegram name in leaderboards and teams.",
        privacy_label: "Hide my Telegram username", privacy_hint: "If active, no one can click your name to see your profile. Alias becomes mandatory.",
        wrong_chars: "📈 Most Mistaken Characters", wpm_error: "⚠️ Errors per WPM", match_history: "📜 Match History", loading: "Loading...",
        back_to_menu: "Back to Main Menu", daily: "Today", weekly: "Week", monthly: "Month", medals: "My Medals",
        finished: "Finished", winner: "Winner", points: "Points", history: "Match History",
        chat_title: "💬 Chat", chat_clear: "Clear", chat_close: "Close", chat_send: "Send", chat_placeholder: "Type a message...",
        lobby_players: "Players present:", lobby_chat: "💬 Room Chat", lobby_invite: "📢 Invite Friends on Telegram",
        act_title: "Activity Rankings", act_loading: "Loading...", act_no_data: "No activity recorded.",
        prepare: "Get Ready!", start_via: "GO!", game_chat: "💬 Chat", quit_game: "Quit",
        input_placeholder: "Type here...", replay: "🔁 Replay", th_typed: "Typed", th_real: "Real", th_pts: "Points",
        teams_btn: "🏆 TEAM TOURNAMENTS", delete_data: "🗑️ Permanently Delete My Data",
        tab_this_match: "This Match", tab_trn_lb: "Tournament Leaderboard", tab_callsigns: "Callsigns", tab_pingpong: "Ping Pong", tab_std_multi: "Words (Multi)", tab_std_single: "Words (Single)",
        btn_start_match: "START MATCH", btn_delete_room: "DELETE ROOM", btn_leave_lobby: "Leave Lobby",
        status_host: "You are the Match Host.", status_guest: "You are a participant. Wait for the start.", lobby_free: "Free Room Lobby", lobby_trn: "Tournament Match Lobby 🥊",
        ready_btn: "I AM READY ✅", waiting_host: "Waiting for Host to start...",
        tab_my_team: "My Team", tab_all_teams: "All Teams", tab_tournaments: "Tournaments",
        custom_title: "Personal Dictionary 📖", custom_desc: "Upload a text file (.txt) with your custom words.",
        select_file: "Choose .txt File", custom_hint1: "Words can be separated by spaces, commas, or newlines.",
        custom_hint2: "Words shorter than 3 characters will be ignored.", custom_hint3: "The dictionary will be saved locally.",
        no_file: "No file uploaded.", loaded_words: "Words loaded: ", manage_custom: "⚙️ Manage Personal Dictionary"
    }
};

window.toggleLanguage = function() { const newLang = (currentLang === 'it') ? 'en' : 'it'; setLanguage(newLang); updateDictionary(); showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English"); }

function setLanguage(lang) {
    currentLang = lang; localStorage.setItem('gameLang', lang);
    const t = i18n[lang] || i18n.it;
    if(els.langBtn) els.langBtn.textContent = lang.toUpperCase();

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

    for (let key in textMap) if (els[key]) els[key].textContent = textMap[key];
    
    if(els.txt_lb_btn) els.txt_lb_btn.textContent = "🏆 " + t.lb;
    if(els.txt_profile_btn) els.txt_profile_btn.textContent = "👤 " + t.profile;
    if(els.txt_act_btn) els.txt_act_btn.textContent = "🏅 " + t.activity;
    
    if(els.opt_lb_pp) els.opt_lb_pp.textContent = t.tab_pingpong + " (" + (lang==='it'?'Sfide':'Challenges') + ")";
    if(els.opt_lb_multi) els.opt_lb_multi.textContent = t.tab_std_multi + " (" + (lang==='it'?'Sfide':'Challenges') + ")";
    if(els.opt_lb_chars_multi) els.opt_lb_chars_multi.textContent = (lang==='it'?'Caratteri (Multi - Sfide)':'Characters (Multi - Challenges)');
    if(els.opt_lb_chars_single) els.opt_lb_chars_single.textContent = (lang==='it'?'Caratteri (Single)':'Characters (Single)');
    if(els.opt_lb_quiz_multi) els.opt_lb_quiz_multi.textContent = (lang==='it'?'Quiz (Multi - Sfide)':'Quiz (Multi - Challenges)');
    if(els.opt_lb_quiz_single) els.opt_lb_quiz_single.textContent = (lang==='it'?'Quiz (Single)':'Quiz (Single)');

    if(els.chatInput) els.chatInput.placeholder = t.chat_placeholder;
    if(els.lobbyChatInput) els.lobbyChatInput.placeholder = t.chat_placeholder;
    if(els.permanentGameInput) els.permanentGameInput.placeholder = t.input_placeholder;

    checkGameTypeUI();
    updateMuteBtnUI();
    if (activeTrnId) db.ref(`tournaments/${activeTrnId}`).once('value', snap => { if(snap.exists()) renderActiveTournament(snap); });
}

// Funzione dedicata per aggiornare la UI del tasto Mute
function updateMuteBtnUI() {
    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.textContent = isGlobalChatMuted 
            ? (currentLang === 'it' ? "🔇 Notifiche Disattivate" : "🔇 Notifications Muted") 
            : (currentLang === 'it' ? "🔊 Notifiche Attive" : "🔊 Notifications Active");
    }
}

async function loadDictionaries() {
    await Promise.all([ fetchDictionary("parole.txt", 'it'), fetchDictionary("words.txt", 'en') ]);
    updateDictionary();
}

async function loadRegolamento() {
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error("Errore nel caricamento");
        els.regolamentoContainer.innerHTML = await response.text();
        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = function() {
                const text = encodeURIComponent("💡 Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
                const shareUrl = `https://t.me/share/url?text=${text}`;
                if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, '_blank');
            };
        }
    } catch (e) {
        if(els.regolamentoContainer) els.regolamentoContainer.innerHTML = "<p style='color:red; text-align:center;'>Impossibile caricare il regolamento.</p>";
    }
}

async function fetchDictionary(url, lang) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("GitHub offline");
        const lines = (await resp.text()).split('\n').map(l => l.trim().toLowerCase()).filter(l => l.length > 2);
        if (lang === 'it') itDictionary = lines; else enDictionary = lines;
    } catch(e) {
        if (lang === 'it') itDictionary = ["abbandono", "amicizia", "antenna", "battaglia", "bellezza", "calcolo", "canzone"];
        else enDictionary = ["abandon", "friendship", "antenna", "battle", "beauty", "calculation", "song"];
    }
}

function updateDictionary() { masterDictionary = (currentLang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary; }

const morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--','?': '..--..' 
};

// --- INIZIALIZZAZIONE ---
if (!tgUser) { els.loadingScreen.classList.remove('active-screen'); els.errorScreen.classList.add('active-screen'); } 
else { myName = tgUser.first_name; myId = tgUser.id.toString(); initGame(); }

function initGame() {
    const firebaseConfig = { apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk", authDomain: "telegrafiabot.firebaseapp.com", databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app", projectId: "telegrafiabot", storageBucket: "telegrafiabot.firebasestorage.app", messagingSenderId: "575790683327", appId: "1:575790683327:web:db333b0316c8e8ec63a20a" };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    // --- NUOVO CODICE APP CHECK ---
    const appCheck = firebase.appCheck();
    appCheck.activate(
        '6LdSf2YtAAAAAEIl7_RCLdkqbWNClV7Huicdy3lW', // La chiave PUBBLICA
        true // Permette il rinnovo automatico del token
    );
    // ------------------------------

    db = firebase.database(); 
    auth = firebase.auth();

    // Carica stato mute
    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';

    // Carica preferenze WPM, Parole e Tono
    if (els.startWpmInput && localStorage.getItem(STORAGE_PREF_WPM)) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM);
    if (els.wordCountInput && localStorage.getItem(STORAGE_PREF_WORDS)) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS);
    if (els.toneInput && localStorage.getItem(STORAGE_PREF_TONE)) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE);

    auth.signInAnonymously().then(async () => {
        try {
            const userData = (await db.ref(`users/${myId}`).once('value')).val() || {};
            if (userData.alias) myName = userData.alias;
            myPrivacy = userData.privacyUsername || false; els.privacyUsernameCheckbox.checked = myPrivacy;
        } catch(e) {}

        els.playerName.textContent = myName; els.userAliasInput.value = (myName !== tgUser.first_name) ? myName : "";
        els.loadingText.style.display = 'none'; els.createRoomBtn.disabled = false;

        db.ref('.info/connected').on('value', (snap) => {
            if (snap.val() === false) return;
            const pRef = db.ref(`presence/${myId}`);
            pRef.onDisconnect().remove();
            pRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, status: 'online', ts: firebase.database.ServerValue.TIMESTAMP });
            if (roomCode) joinRoomLogic(true);
        });

        if (startParam) {
            if (startParam.startsWith('team_')) processTeamInvite(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', snap => {
                    if (snap.exists() && snap.val().status !== 'finished') {
                        roomCode = lastRoom; els.rejoinContainer.style.display = 'block'; els.rejoinGameBtn.onclick = () => { isRejoining = true; joinRoomLogic(false); }; showScreen('setupScreen');
                    } else { localStorage.removeItem(STORAGE_ROOM_KEY); showScreen('setupScreen'); }
                });
            } else showScreen('setupScreen');
        }

        const savedLang = localStorage.getItem('gameLang'); if (savedLang) setLanguage(savedLang);
        else updateMuteBtnUI();
        
        loadDictionaries();

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) { try { customDictionary = JSON.parse(savedCustom); updateCustomDictStatus(); } catch(e) {} }

        checkActivityAndAwardMedals(); checkTournamentPopup();
        listenToRooms(); listenToOnlineUsers(); listenToInvites(); listenToInviteAccepted();
        loadRegolamento();

        if(els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
        if(els.appVersionFooter) els.appVersionFooter.textContent = APP_VERSION;

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) els.updateBanner.style.display = 'block'; else els.updateBanner.style.display = 'none';
        });

    }).catch(e => {
        if (els.loadingText) { els.loadingText.textContent = "Errore di Connessione."; els.loadingText.style.color = "red"; els.loadingText.style.fontWeight = "bold"; }
    });

    checkGameTypeUI();
}

// --- AUDIO ---
function playBeep(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.frequency.value = freq; osc.connect(gain); gain.connect(audioCtx.destination);
        const time = audioCtx.currentTime;
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
        gain.gain.setValueAtTime(0.5, time + duration - 0.005); gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.start(time); osc.stop(time + duration);
    } catch(e) {}
}

// NUOVA FUNZIONE: Suono di notifica per la chat
function playNotificationSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playBeep(880, 0.08); // Primo tono
    setTimeout(() => playBeep(1100, 0.1), 120); // Secondo tono più alto
}

function playMorseAudio(text, wpm) {
    return new Promise(resolve => {
        if (!audioCtx || !gameRunning) { resolve(); return; }
        const unitDuration = 1.2 / wpm; let time = audioCtx.currentTime + 0.05;
        for (let char of text) {
            if (!gameRunning) break;
            if (morseDict[char]) {
                for (let symbol of morseDict[char]) {
                    if (!gameRunning) break;
                    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                    osc.frequency.value = currentTone; osc.connect(gain); gain.connect(audioCtx.destination);
                    const duration = (symbol === '-') ? (3 * unitDuration) : (unitDuration);
                    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
                    gain.gain.setValueAtTime(0.5, time + duration - 0.005); gain.gain.linearRampToValueAtTime(0, time + duration);
                    osc.start(time); osc.stop(time + duration);
                    time += duration + unitDuration;
                }
                time += 2 * unitDuration;
            } else if (char === ' ') { time += 4 * unitDuration; }
        }
        setTimeout(resolve, (time - audioCtx.currentTime) * 1000);
    });
}

// --- CHAT ---
window.toggleChat = function() {
    if (els.chatDrawer.style.display === 'none') {
        els.chatDrawer.style.display = 'flex'; isChatDrawerOpen = true;
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    } else { els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false; }
}

function hideChat() {
    if(els.chatDrawer) els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false;
    Object.keys(listeners.activeChat).forEach(key => { listeners.activeChat[key].ref.off('value', listeners.activeChat[key].callback); delete listeners.activeChat[key]; });
}

function listenToChat() {
    if (activeChatContext === 'room' && roomCode) {
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null); setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
        if(els.chatTitle) els.chatTitle.textContent = "💬 Chat Stanza";
        if (els.gameArea && els.gameArea.classList.contains('active-screen')) { els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false; }
    } else {
        setupChat(db.ref('globalChat'), 'chatMessages', null); if(els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
}

window.openGlobalChat = function() { activeChatContext = 'global'; listenToChat(); toggleChat(); }

if(els.sendLobbyChatBtn) els.sendLobbyChatBtn.addEventListener('click', () => {
    const txt = els.lobbyChatInput.value.trim(); if (!txt || !roomCode) return;
    const msgRef = db.ref(`rooms/${roomCode}/chat`).push(); msgRef.onDisconnect().remove();
    msgRef.set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP }); els.lobbyChatInput.value = '';
});
if(els.lobbyChatInput) els.lobbyChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') els.sendLobbyChatBtn.click(); });

function setupChat(chatRef, containerId, alertBtnId) {
    const container = els[containerId]; if (!container) return;
    if (listeners.activeChat[containerId]) listeners.activeChat[containerId].ref.off('value', listeners.activeChat[containerId].callback);
    let initialLoad = true, lastTs = Date.now();
    const callback = chatRef.limitToLast(40).on('value', snapshot => {
        container.innerHTML = ''; let newMsgsCount = 0, latestMsg = null, maxTs = lastTs;
        snapshot.forEach(child => {
            const msg = child.val(); const div = document.createElement('div'); div.style.marginBottom = '6px';
            if(msg.ts) {
                const d = new Date(msg.ts); const dateSmall = document.createElement('small');
                dateSmall.style.color = 'var(--hint-color)'; dateSmall.style.fontSize = '0.75em';
                dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                div.appendChild(dateSmall); if(msg.ts > maxTs) maxTs = msg.ts;
            }
            const nameB = document.createElement('b'); nameB.style.color = 'var(--link-color)'; nameB.textContent = msg.name + ":";
            div.appendChild(nameB); div.appendChild(document.createTextNode(" " + msg.text)); container.appendChild(div);
            if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) { newMsgsCount++; latestMsg = msg; }
        });
        lastTs = maxTs; container.scrollTop = container.scrollHeight;
        
        // Logica per le notifiche visive E AUDIO
        if (!initialLoad && newMsgsCount > 0) {
            if (alertBtnId && !isChatDrawerOpen && els[alertBtnId]) els[alertBtnId].style.backgroundColor = '#4caf50';
            
            if (latestMsg) {
                if (chatRef.key === 'globalChat') {
                    // Chat globale: notifica se non mutato, NON in partita e NON aperta in primo piano
                    if (!isGlobalChatMuted && !gameRunning && (!isChatDrawerOpen || activeChatContext !== 'global')) {
                        showToast(`🌎 ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
                        if (typeof playNotificationSound === 'function') playNotificationSound(); // <-- SUONO AGGIUNTO QUI
                    }
                } else {
                    // Altre chat (stanza, team)
                    if (!isChatDrawerOpen || chatRef.key !== (activeChatContext === 'room' ? roomCode : myTeamId)) {
                        showToast(`💬 ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
                        if (!isGlobalChatMuted && typeof playNotificationSound === 'function') playNotificationSound(); // <-- SUONO AGGIUNTO QUI
                    }
                }
            }
        }
        
        initialLoad = false;
    });
    listeners.activeChat[containerId] = { ref: chatRef, callback: callback };
}

if(els.sendChatBtn) els.sendChatBtn.addEventListener('click', () => {
    const txt = els.chatInput.value.trim(); if (!txt) return;
    let msgRef = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
    
    // NOTA BENE: Ho rimosso msgRef.onDisconnect().remove() per sistemare l'invio
    msgRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP })
        .catch(e => showToast("Errore invio: " + e.message)); 
        
    els.chatInput.value = '';
});

if(els.chatInput) els.chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') els.sendChatBtn.click(); });

if(els.clearChatBtn) els.clearChatBtn.addEventListener('click', () => { if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) { if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove(); else db.ref('globalChat').remove(); } });

// Listener per il pulsante Mute (se usi l'evento via JS e non onclick HTML)
if (els.muteGlobalChatBtn) {
    els.muteGlobalChatBtn.addEventListener('click', () => {
        isGlobalChatMuted = !isGlobalChatMuted;
        localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted);
        if (typeof updateMuteBtnUI === 'function') updateMuteBtnUI();
        showToast(isGlobalChatMuted 
            ? (currentLang==='it'?"Notifiche Chat silenziate.":"Chat notifications muted.") 
            : (currentLang==='it'?"Notifiche Chat riattivate.":"Chat notifications unmuted."));
    });
}
// --- LINGUA E UI ---
function checkGameTypeUI() {
    const isSingle = els.gameTypeInput.value === 'single', isTrn = els.gameTypeInput.value === 'tournament', isCustom = els.gameModeInput.value === 'custom';
    els.timeoutDiv.style.display = isSingle || isTrn ? 'none' : 'block';
    els.fixedSpeedContainer.style.display = isSingle ? 'flex' : 'none';
    els.easyModeContainer.style.display = isSingle ? 'flex' : 'none';
    els.customDictControl.style.display = (isSingle && isCustom) ? 'flex' : 'none';

    const gameModes = els.gameModeInput.querySelectorAll('option:not([value^="trn_"])');
    const trnModes = els.trn_opt_group ? els.trn_opt_group.querySelectorAll('option') : [];

    if (isTrn) {
        gameModes.forEach(opt => { opt.style.display = 'none'; opt.disabled = true; });
        if (els.trn_opt_group) els.trn_opt_group.style.display = 'block';
        trnModes.forEach(opt => { opt.style.display = 'block'; opt.disabled = false; });
        if (!els.gameModeInput.value.startsWith('trn_')) els.gameModeInput.value = 'trn_join_team';
        els.createRoomBtn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
    } else {
        gameModes.forEach(opt => { opt.style.display = 'block'; opt.disabled = false; });
        if (els.trn_opt_group) els.trn_opt_group.style.display = 'none';
        trnModes.forEach(opt => { opt.style.display = 'none'; opt.disabled = true; });
        if (els.gameModeInput.value.startsWith('trn_')) els.gameModeInput.value = 'standard';
        els.createRoomBtn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
    }
    if(!isSingle) { els.fixedSpeedCheckbox.checked = false; els.easyModeCheckbox.checked = false; }
}

if(els.gameModeInput) els.gameModeInput.addEventListener('change', e => {
    const isC = e.target.value === 'callsign', isPP = e.target.value === 'pingpong';
    if (isPP) { els.gameTypeInput.value = 'multi'; els.gameTypeInput.disabled = true; checkGameTypeUI(); } else els.gameTypeInput.disabled = false;
    
    ['startWpmInput', 'wordCountInput', 'toneInput'].forEach(id => { 
        els[id].disabled = isC; 
        if (isC && id !== 'toneInput') {
            els[id].value = 25; // Forza a 25 per i nominativi
        } else if (!isC && id !== 'toneInput') {
            // Ripristina dai salvataggi se l'utente esce dalla modalità nominativi
            if (id === 'startWpmInput' && localStorage.getItem(STORAGE_PREF_WPM)) els[id].value = localStorage.getItem(STORAGE_PREF_WPM);
            if (id === 'wordCountInput' && localStorage.getItem(STORAGE_PREF_WORDS)) els[id].value = localStorage.getItem(STORAGE_PREF_WORDS);
        }
    });
    
    els.fixedSpeedCheckbox.disabled = isC; if(isC) els.fixedSpeedCheckbox.checked = false; checkGameTypeUI();
});
if(els.gameTypeInput) els.gameTypeInput.addEventListener('change', checkGameTypeUI);

// --- LISTENER SALVATAGGIO PREFERENZE ---
if (els.startWpmInput) els.startWpmInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_WPM, e.target.value));
if (els.wordCountInput) els.wordCountInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_WORDS, e.target.value));
if (els.toneInput) els.toneInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_TONE, e.target.value));


function updateCustomDictStatus() {
    if (!els.customDictStatus) return;
    if (customDictionary.length === 0) { els.customDictStatus.textContent = "Nessun file caricato."; els.customDictStatus.style.color = "var(--hint-color)"; }
    else { els.customDictStatus.textContent = "Parole caricate: " + customDictionary.length; els.customDictStatus.style.color = "var(--link-color)"; }
}

if (els.customDictFileInput) els.customDictFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) return alert("Per favore seleziona un file .txt!");
    const reader = new FileReader();
    reader.onload = (event) => {
        const uniqueWords = [...new Set(event.target.result.split(/[\s,;.:!?"'()\[\]{}]+/).filter(w => w.trim().length >= 3).map(w => w.trim().toLowerCase()))];
        if (uniqueWords.length === 0) return alert("Nessuna parola valida trovata.");
        customDictionary = uniqueWords; localStorage.setItem(STORAGE_CUSTOM_DICT_KEY, JSON.stringify(customDictionary)); updateCustomDictStatus(); showToast(`Caricate ${uniqueWords.length} parole!`);
    }; reader.readAsText(file);
});

function generateCallsign() {
    const prefixes = ["I", "IK", "IZ", "IN", "IT", "IS", "IU", "IW", "W", "K", "N", "A", "WA", "WB", "DL", "DJ", "DK", "DO", "EA", "EB", "EC", "F", "G", "M", "GW", "GM", "9A", "S5", "OK", "OM", "SP", "SQ", "UA", "UR", "EW", "ER", "YO", "YU", "HA", "LZ", "OE", "HB", "PA", "PB", "ON", "VE", "VK", "ZL", "JA", "PY", "LU", "CX"];
    let callsign = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(Math.random() * 10);
    let suffixLen = (Math.random() > 0.9) ? 1 : (Math.random() > 0.7) ? 2 : 3;
    for(let i = 0; i < suffixLen; i++) callsign += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    if (Math.random() > 0.90) callsign += ["/QRP", "/P", "/M", "/AM", "/MM"][Math.floor(Math.random() * 5)]; return callsign;
}

function getGameWords(num, mode) {
    if (mode === 'callsign') return Array.from({length: num}, generateCallsign);
    if (mode === 'pingpong') return [];
    if (mode === 'chars') return Array.from({length: num}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]);
    if (mode === 'custom' && customDictionary.length > 0) return [...customDictionary].sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
    return masterDictionary.sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
}

window.showRoomEventModal = function(title, text) { els.roomEventTitle.textContent = title; els.roomEventText.textContent = text; els.roomEventModal.style.display = 'flex'; playBeep(600, 0.2); setTimeout(() => playBeep(800, 0.3), 200); }
if(els.goToRoomBtn) els.goToRoomBtn.addEventListener('click', () => { els.roomEventModal.style.display = 'none'; if (roomCode) joinRoomLogic(false); });
window.checkTournamentPopup = function() { if (localStorage.getItem('hideTrnWelcomePopup') === 'true' || myTeamId) return; setTimeout(() => { if(els.tournamentWelcomeModal) els.tournamentWelcomeModal.style.display = 'flex'; }, 1500); }
window.closeTrnWelcomeModal = function() { if (els.stopShowingTrnPopup && els.stopShowingTrnPopup.checked) localStorage.setItem('hideTrnWelcomePopup', 'true'); if(els.tournamentWelcomeModal) els.tournamentWelcomeModal.style.display = 'none'; }
window.goToTournamentsFromPopup = function() { closeTrnWelcomeModal(); showScreen('teamsScreen'); }

function listenToOnlineUsers() {
    db.ref('presence').on('value', snap => {
        if(!els.onlineUsersList) return; els.onlineUsersList.innerHTML = ''; let count = 0;
        snap.forEach(child => {
            const u = child.val(); if (child.key === myId) return; count++; const li = document.createElement('li');
            const isWaiting = (isChallenging && currentInviterId === child.key), isPlaying = (u.status === 'playing');
            
            const leftSpan = document.createElement('span'); 
            const nameB = document.createElement('b'); nameB.textContent = u.name; nameB.style.cursor = 'pointer'; nameB.style.color = 'var(--link-color)'; nameB.style.textDecoration = 'underline';
            nameB.onclick = () => openTeamInviteModal(child.key, u.name); 
            leftSpan.appendChild(nameB); leftSpan.appendChild(document.createElement('br'));
            
            const statusSmall = document.createElement('small'); statusSmall.textContent = isPlaying ? "🟡 In Partita" : "🟢 Online"; leftSpan.appendChild(statusSmall);
            
            const btn = document.createElement('button'); btn.className = `action-btn-small ${isWaiting ? 'btn-danger' : 'btn-success'}`;
            if (isPlaying) { btn.classList.add('btn-secondary'); btn.disabled = true; btn.textContent = "In partita"; }
            else { if (isChallenging && !isWaiting) btn.disabled = true; btn.textContent = isWaiting ? 'In Attesa...' : 'Sfida'; btn.onclick = () => openInviteModal(child.key, u.name); }
            li.appendChild(leftSpan); li.appendChild(btn); els.onlineUsersList.appendChild(li);
        });
        if (count === 0) {
            const emptyLi = document.createElement('li'); emptyLi.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;";
            emptyLi.textContent = "Sei solo."; els.onlineUsersList.appendChild(emptyLi);
        }
    });
}

window.openInviteModal = function(targetId, targetName) {
    currentInviterId = targetId; els.inviteModalTitle.textContent = "Sfida " + targetName; els.inviteModalText.textContent = "Scegli le impostazioni per la sfida:"; els.inviteSettings.style.display = 'block'; els.teamInviteSettings.style.display = 'none'; els.incomingInviteArea.style.display = 'none'; els.incomingTeamInviteArea.style.display = 'none'; els.outgoingInviteArea.style.display = 'block'; els.inviteModal.style.display = 'flex';
}

window.openTeamInviteModal = async function(targetId, targetName) {
    currentInviterId = targetId; els.inviteModalTitle.textContent = "Recluta " + targetName; els.recruitmentStatusText.textContent = "Caricamento stato..."; els.inviteSettings.style.display = 'none'; els.teamInviteSettings.style.display = 'block'; els.incomingInviteArea.style.display = 'none'; els.incomingTeamInviteArea.style.display = 'none'; els.outgoingInviteArea.style.display = 'none'; els.recruitJoinBtn.style.display = 'none';
    try {
        const teamsSnap = await db.ref('teams').once('value'); let tName = null, inTeam = false;
        teamsSnap.forEach(tSnap => { const t = tSnap.val(); if (t.status !== 'retired' && t.members && t.members[targetId]) { inTeam = true; tName = t.name; } });
        
        els.recruitmentStatusText.innerHTML = "";
        if (inTeam) {
            els.recruitmentStatusText.appendChild(document.createTextNode("⚠️ "));
            const b1 = document.createElement('b'); b1.textContent = targetName; els.recruitmentStatusText.appendChild(b1);
            els.recruitmentStatusText.appendChild(document.createTextNode(" fa già parte della squadra "));
            const b2 = document.createElement('b'); b2.textContent = tName; els.recruitmentStatusText.appendChild(b2);
            els.recruitmentStatusText.appendChild(document.createTextNode("."));
            els.recruitCreateBtn.style.display = 'none'; 
        } else {
            els.recruitmentStatusText.appendChild(document.createTextNode("💡 "));
            const b1 = document.createElement('b'); b1.textContent = targetName; els.recruitmentStatusText.appendChild(b1);
            els.recruitmentStatusText.appendChild(document.createTextNode(" non ha ancora una squadra."));
            els.recruitCreateBtn.style.display = 'block'; if (myTeamId) els.recruitJoinBtn.style.display = 'block'; 
        }
        
        els.recruitJoinBtn.onclick = () => sendRecruitmentInvite('team'); els.recruitCreateBtn.onclick = () => sendRecruitmentInvite('suggest');
        els.recruitMsgBtn.onclick = () => { db.ref(`presence/${targetId}`).once('value', s => { const u = s.val(); if (u && u.username && String(u.username).trim() !== "") tg.openTelegramLink('https://t.me/' + u.username); else tg.showAlert("Nessun username pubblico."); }); };
    } catch(e) {} els.inviteModal.style.display = 'flex';
}

function sendRecruitmentInvite(type) {
    db.ref(`invites/${currentInviterId}`).set({ fromId: myId, fromName: myName, type: 'team', ts: firebase.database.ServerValue.TIMESTAMP, teamId: type === 'team' ? myTeamId : null, teamName: type === 'team' ? myTeamName : null }).then(() => { showToast("Invito inviato!"); window.closeInviteModal(); });
}

window.closeInviteModal = function() { els.inviteModal.style.display = 'none'; currentInviterId = null; }

if(els.sendInviteBtn) els.sendInviteBtn.addEventListener('click', () => {
    if (isChallenging) return; isChallenging = true; const tId = currentInviterId;
    db.ref(`invites/${tId}`).set({ fromId: myId, fromName: myName, mode: els.inviteModeInput.value, wpm: parseInt(els.inviteWpmInput.value), wordCount: parseInt(els.inviteWordCountInput.value), ts: firebase.database.ServerValue.TIMESTAMP, status: 'pending' }).then(() => {
        showToast("Invito inviato! In attesa..."); 
        
        // Fix: nascondiamo il modale ma teniamo conservato il currentInviterId
        els.inviteModal.style.display = 'none';
        
        // Forza l'aggiornamento UI pingando il proprio timestamp presence
        db.ref(`presence/${myId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);

        if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);
        listeners.outgoingInvite = db.ref(`invites/${tId}`).on('value', snap => { 
            if (!snap.exists() && isChallenging) setTimeout(() => { 
                if (isChallenging) { 
                    showToast("Rifiutato o scaduto."); 
                    isChallenging = false; 
                    currentInviterId = null; 
                    
                    // Forza aggiornamento UI a reset
                    db.ref(`presence/${myId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);
                    
                    if(listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite); 
                } 
            }, 1000); 
        });
    });
});

function listenToInvites() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val(); if (!inv || roomCode || gameRunning) return;
        if (Date.now() - inv.ts > 60000) return db.ref(`invites/${myId}`).remove();
        
        els.inviteModalText.innerHTML = '';
        if (inv.type === 'team') {
            els.inviteModalTitle.textContent = inv.teamId ? "🚀 INVITO SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
            if (inv.teamId) {
                els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti ha invitato ad unirti alla squadra "));
                const bTeam = document.createElement('b'); bTeam.textContent = inv.teamName; els.inviteModalText.appendChild(bTeam);
                els.inviteModalText.appendChild(document.createTextNode("."));
            } else els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti suggerisce di creare una tua squadra!"));
            
            els.inviteSettings.style.display = 'none'; els.teamInviteSettings.style.display = 'none'; els.incomingInviteArea.style.display = 'none'; els.incomingTeamInviteArea.style.display = 'block'; els.outgoingInviteArea.style.display = 'none';
            els.acceptTeamInviteBtn.textContent = inv.teamId ? "UNISCITI ✅" : "VAI ALLA CREAZIONE 🛠️"; els.acceptTeamInviteBtn.onclick = () => { db.ref(`invites/${myId}`).remove(); window.closeInviteModal(); if (inv.teamId) joinTeam(inv.teamId); else showScreen('teamsScreen'); };
        } else {
            els.inviteModalTitle.textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();
            
            els.inviteModalText.appendChild(document.createTextNode("Ti ha invitato a giocare:"));
            els.inviteModalText.appendChild(document.createElement('br'));
            const bMode = document.createElement('b'); bMode.textContent = inv.mode.toUpperCase(); els.inviteModalText.appendChild(bMode);
            els.inviteModalText.appendChild(document.createTextNode(" a "));
            const bWpm = document.createElement('b'); bWpm.textContent = inv.wpm; els.inviteModalText.appendChild(bWpm);
            els.inviteModalText.appendChild(document.createTextNode(" WPM ("));
            const bCount = document.createElement('b'); bCount.textContent = inv.wordCount; els.inviteModalText.appendChild(bCount);
            els.inviteModalText.appendChild(document.createTextNode(" test)."));
            
            els.inviteSettings.style.display = 'none'; els.teamInviteSettings.style.display = 'none'; els.incomingInviteArea.style.display = 'block'; els.incomingTeamInviteArea.style.display = 'none'; els.outgoingInviteArea.style.display = 'none';
        }
        els.inviteModal.style.display = 'flex'; currentInviterId = inv.fromId; window.lastIncomingInvite = inv;
    });
}
if(els.declineTeamInviteBtn) els.declineTeamInviteBtn.addEventListener('click', () => { db.ref(`invites/${myId}`).remove(); window.closeInviteModal(); });
if(els.declineInviteBtn) els.declineInviteBtn.addEventListener('click', () => { db.ref(`invites/${myId}`).remove(); window.closeInviteModal(); });
if(els.acceptInviteBtn) els.acceptInviteBtn.addEventListener('click', () => {
    const inv = window.lastIncomingInvite; db.ref(`invites/${myId}`).remove(); window.closeInviteModal(); const rCode = Math.floor(1000 + Math.random() * 9000).toString();
    db.ref(`rooms/${rCode}`).set({ status: 'waiting', type: 'multi', mode: inv.mode, wpm: inv.wpm, tone: 600, wordCount: inv.wordCount, words: getGameWords(inv.wordCount, inv.mode), createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 600000, hostId: inv.fromId }).then(() => { db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode }); roomCode = rCode; joinRoomLogic(false); });
});

function listenToInviteAccepted() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => { const d = snap.val(); if (d && d.roomCode) { db.ref(`invite_accepted/${myId}`).remove(); isChallenging = false; window.closeInviteModal(); roomCode = d.roomCode; joinRoomLogic(false); } });
}

function listenToRooms() {
    db.ref('rooms').on('value', snap => {
        if(!els.waitingRoomsList) return; els.waitingRoomsList.innerHTML = ''; let wCount = 0;
        snap.forEach(child => {
            const room = child.val(); const code = child.key;
            if (code.startsWith("TRN_") || (room.expiresAt && Date.now() > room.expiresAt)) { if(Date.now() > room.expiresAt) db.ref(`rooms/${code}`).remove(); return; }
            if (room.status === 'waiting' && room.type !== 'single') {
                wCount++; const pCount = room.players ? Object.keys(room.players).length : 0; const li = document.createElement('li');
                let modeIcon = room.mode === 'callsign' ? '🎙️ Nom.' : room.mode === 'pingpong' ? '🏓 Ping Pong' : room.mode === 'quiz' ? '❓ Quiz' : '🔤 Parole';
                
                const span = document.createElement('span');
                const bTitle = document.createElement('b'); bTitle.textContent = `#${code} - ${modeIcon}`;
                const smallInfo = document.createElement('small'); smallInfo.textContent = `${pCount} Gioc. | ${room.wpm} WPM | ${room.wordCount} Test`;
                span.appendChild(bTitle); span.appendChild(document.createElement('br')); span.appendChild(smallInfo);
                li.appendChild(span);
                
                const btn = document.createElement('button'); btn.className = 'action-btn-small'; btn.textContent = 'Entra'; btn.onclick = () => window.joinSpecificRoom(code); li.appendChild(btn); els.waitingRoomsList.appendChild(li);
            }
        });
        if (wCount === 0) els.waitingRoomsList.innerHTML = '<li style="justify-content:center; color:var(--hint-color); background:none; border:none;">Nessuna sfida.</li>';
    });
}
window.joinSpecificRoom = function(code) { roomCode = code; joinRoomLogic(false); }

if(els.createRoomBtn) els.createRoomBtn.addEventListener('click', () => {
    const gameType = els.gameTypeInput.value, gameMode = els.gameModeInput.value;
    if (gameType === 'tournament') { showScreen('teamsScreen'); if (gameMode === 'trn_create_team') switchTeamTab('gest'); else if (gameMode === 'trn_join_team') switchTeamTab('allteams'); else if (gameMode === 'trn_create_trn') switchTeamTab('tournaments'); return; }
    if (gameMode === 'custom' && customDictionary.length === 0) { els.customDictModal.style.display = 'flex'; return showToast("Carica prima un file di testo!"); }

    isChallenging = false; if (currentInviterId) db.ref(`invites/${currentInviterId}`).once('value', s => { if (s.exists() && s.val().fromId === myId) db.ref(`invites/${currentInviterId}`).remove(); });
    db.ref(`invite_accepted/${myId}`).remove(); currentMode = gameMode; isSinglePlayer = gameType === 'single'; currentWpm = currentMode==='callsign' ? 25 : parseInt(els.startWpmInput.value); baseWpm = currentWpm; requestedWordCount = currentMode==='callsign' ? 25 : Math.max(1, parseInt(els.wordCountInput.value)); currentTone = parseInt(els.toneInput.value); isFixedSpeed = els.fixedSpeedCheckbox.checked; isEasyMode = els.easyModeCheckbox.checked;
    roomCode = Math.floor(1000 + Math.random() * 9000).toString(); gameWords = getGameWords(requestedWordCount, currentMode);
    db.ref('rooms/' + roomCode).set({ status: isSinglePlayer ? 'countdown' : 'waiting', type: isSinglePlayer ? 'single' : 'multi', mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords, fixedSpeed: isFixedSpeed, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: isSinglePlayer ? null : Date.now() + (Math.max(1, parseInt(els.roomTimerInput.value)) * 60000), hostId: myId }).then(() => joinRoomLogic(false));
});

function exitRoomCleanly(roomWasDeletedByHost = false) {
    let targetScreen = 'setupScreen'; const amIHost = (myId === roomHostId); localStorage.removeItem(STORAGE_ROOM_KEY); isRejoining = false; isChallenging = false; currentInviterId = null;
    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        if (!roomWasDeletedByHost && amIHost && !roomCode.startsWith("TRN_")) {} else {
            if (listeners.room) { listeners.room.off(); listeners.room = null; }
            if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
            db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
            db.ref(`rooms/${roomCode}`).once('value', snap => { if (snap.exists()) db.ref(`rooms/${roomCode}/players/${myId}`).remove(); }); roomCode = "";
        }
    } else { if (listeners.room) { listeners.room.off(); listeners.room = null; } }
    hideChat(); showScreen(targetScreen);
}

function joinRoomLogic(isReconnect = false) {
    gameRunning = false; localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
    const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) { showScreen('leaderboardScreen'); activeTab="room"; showLeaderboardTab('tabRoomBtn'); localStorage.removeItem(STORAGE_ROOM_KEY); return; }
        if (pData) { totalScore = pData.score || 0; wordIndex = pData.wordIndex || 0; quizQuestionIndex = pData.wordIndex || 0; matchDetailsArray = pData.matchDetails || []; if (isRejoining) showToast("🔄 Partita recuperata!"); }
        showScreen('lobbyScreen'); els.lobbyTitleText.textContent = roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera"; if(els.permanentGameInput) els.permanentGameInput.blur();
        playerRef.onDisconnect().update({ online: false }); 
        if (!pData) playerRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, score: 0, wpm: 0, finished: false, teamId: myTeamId, ready: false, online: true }); 
        else playerRef.update({ online: true, name: myName, username: myPrivacy ? "" : tgUsername });
        listenToChat(); if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return exitRoomCleanly(true); const rData = snap.val(); currentMode = rData.mode; requestedWordCount = rData.wordCount; isSinglePlayer = rData.type === 'single'; isFixedSpeed = rData.fixedSpeed || false; roomHostId = rData.hostId;
            if (rData.status === 'playing' && !gameRunning) { currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone; if (rData.words) gameWords = rData.words; return resumeGameSequence(); }
            if (rData.status === 'countdown' && !gameRunning) { currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone; if (rData.words) gameWords = rData.words; return startCountdownSequence(); }
            if (rData.status === 'waiting') {
                renderPlayersList(rData.players || {}, rData.hostId); const pCount = Object.keys(rData.players || {}).length;
                if (myId === rData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato."); lastPlayerCount = pCount;
                if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
                if (rData.expiresAt && !isSinglePlayer) lobbyTimerInterval = setInterval(() => { const diff = rData.expiresAt - Date.now(); if (diff <= 0) { clearInterval(lobbyTimerInterval); els.lobbyTimerText.textContent = "Tempo scaduto!"; } else els.lobbyTimerText.textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2, '0')}`; }, 1000); else if(els.lobbyTimerText) els.lobbyTimerText.textContent = "";
            }
        });
    });
}
if(els.inviteFriendsBtn) els.inviteFriendsBtn.addEventListener('click', () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=room_${roomCode}`)}&text=${encodeURIComponent(`Sfida in Telegrafia! Entra nella mia stanza: #${roomCode}`)}`));

function renderPlayersList(playersData, hostId) {
    if(!els.playersList) return; els.playersList.innerHTML = ''; const count = Object.keys(playersData).length;
    if (count > lastPlayerCount && lastPlayerCount > 0) { playBeep(500, 0.1); setTimeout(() => playBeep(700, 0.15), 150); showToast("👤 Nuovo giocatore!"); } lastPlayerCount = count; let allReady = true; const pKeys = Object.keys(playersData); if (pKeys.length < 2) allReady = false;
    Object.entries(playersData).forEach(([id, data]) => {
        if (!data.ready) allReady = false; const li = document.createElement('li'); const nSpan = document.createElement('span'); nSpan.textContent = `${data.ready ? '✅' : '⏳'} ${data.name}`;
        if (data.username && String(data.username).trim() !== "") { nSpan.style.color = 'var(--link-color)'; nSpan.style.cursor = 'pointer'; nSpan.style.textDecoration = 'underline'; nSpan.onclick = () => openTelegramProfile(data.username); }
        li.appendChild(nSpan); if (id === hostId) { const sHost = document.createElement('small'); sHost.textContent = ' (HOST)'; li.appendChild(sHost); } els.playersList.appendChild(li);
    });
    const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong'; const amIHost = (myId === hostId) || roomCode.startsWith("TRN_"); const amIReady = playersData[myId]?.ready;
    els.startMultiplayerBtn.style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none'; els.deleteRoomBtn.style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none'; els.readyBtn.style.display = (isTrnOrPP && !amIReady) ? 'block' : 'none';
    if (isTrnOrPP) { els.waitingHostText.style.display = amIReady ? 'block' : 'none'; els.waitingHostText.textContent = "In attesa..."; els.statusInfoText.textContent = amIReady ? "SONO PRONTO ✅" : "Connessione sicura in corso..."; } else { els.waitingHostText.style.display = amIHost ? 'none' : 'block'; els.waitingHostText.textContent = "In attesa dell'host..."; els.statusInfoText.textContent = amIHost ? "Sei l'Host." : "Sei un partecipante."; }
    if (allReady && isTrnOrPP && (pKeys[0] === myId || amIHost)) db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
}
if(els.readyBtn) els.readyBtn.addEventListener('click', () => { if(roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true }); });

function getLevenshteinDistance(a, b) {
    const matrix = []; for (let i = 0; i <= b.length; i++) matrix[i] = [i]; for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++) { if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1]; else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, Math.min(matrix[i][j-1]+1, matrix[i-1][j]+1)); } return matrix[b.length][a.length];
}
function renderDiffSecure(container, real, typed) {
    for (let i = 0; i < Math.max(real.length, typed.length); i++) { if (!real[i]) continue; const span = document.createElement('span'); if (!typed[i] || typed[i] !== real[i]) span.style.color = "#d32f2f"; span.textContent = real[i]; container.appendChild(span); }
}
if(els.replayWordBtn) els.replayWordBtn.addEventListener('click', () => { if (!gameRunning || !inputActive) return; usedReplay = true; playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm); els.permanentGameInput.focus(); });

if(els.permanentGameInput) {
    els.permanentGameInput.addEventListener('input', function(e) { if (currentMode === 'chars' && inputActive && gameRunning) { const val = els.permanentGameInput.value.trim().toUpperCase(); if (val.length >= 1) { handleWordSubmission(val[0]); els.permanentGameInput.value = ""; } } });
    els.permanentGameInput.addEventListener('keypress', function(e) { if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') { const val = els.permanentGameInput.value.trim().toUpperCase(); if (val) { handleWordSubmission(val); els.permanentGameInput.value = ""; } } });
}

function handleWordSubmission(userWord) {
    inputActive = false; const currentWord = gameWords[wordIndex].toUpperCase(); let points = 0, scoreColor = ""; const reactionMs = Date.now() - lastWordStartTime; const levDist = getLevenshteinDistance(currentWord, userWord);
    if (currentMode === 'chars') { if (userWord === currentWord) { points = Math.max(100, Math.floor(1000 - (reactionMs / 2))); scoreColor = "#4caf50"; } else { points = 0; scoreColor = "#d32f2f"; } } 
    else {
        const basePoints = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2)); const estimatedAudioMs = (currentWord.length * 60 / currentWpm) * 1000; let timeMultiplier = 1.0;
        if (reactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000)); else if (reactionMs < estimatedAudioMs && levDist === 0) timeMultiplier = 1.1;
        points = Math.round(basePoints * timeMultiplier); if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50"; else if (levDist === 1) scoreColor = "#ff9800"; else scoreColor = "#d32f2f"; if (usedReplay) points = Math.round(points * 0.2);
    }

    if (levDist > 0) {
        let wrongChars = [];
        for(let i=0; i<Math.max(currentWord.length, userWord.length); i++) if(userWord[i] !== currentWord[i] && currentWord[i] && !['__proto__','constructor','prototype'].includes(currentWord[i])) if(!wrongChars.includes(currentWord[i])) wrongChars.push(currentWord[i]);
        if(!sessionErrorsByWpm[currentWpm]) sessionErrorsByWpm[currentWpm] = Object.create(null);
        wrongChars.forEach(c => { sessionCharErrors[c] = (sessionCharErrors[c] || 0) + 1; sessionErrorsByWpm[currentWpm][c] = (sessionErrorsByWpm[currentWpm][c] || 0) + 1; });
    }

    if (!isFixedSpeed && currentMode !== 'chars') { if (levDist === 0 && !usedReplay) currentWpm += 2; else if (levDist === 1) currentWpm -= 1; else if (levDist > 1) currentWpm -= 2; currentWpm = Math.max(10, currentWpm); }
    totalScore += points; matchDetailsArray.push({ real: currentWord, typed: userWord, points: points, wpm: currentWpm, ms: reactionMs });

    if (currentMode !== 'pingpong') {
        const tr = document.createElement('tr');
        const tdTyped = document.createElement('td'); tdTyped.textContent = userWord;
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = currentWord; tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = scoreColor; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = currentMode === 'chars' ? points + " (" + reactionMs + "ms)" : (usedReplay ? '0 (Replay)' : (points > 0 ? "+"+points : points));
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
        if(els.tableBody) { els.tableBody.appendChild(tr); els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight; }
    }
    if(els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; if(els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wpm: currentWpm, wordIndex: wordIndex + 1, matchDetails: matchDetailsArray });
    usedReplay = false;
    if (currentMode === 'pingpong') { wordIndex++; db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { if (d) { d.senderId = myId; d.word = ''; d.wordsPlayed = (d.wordsPlayed || 0) + 1; d.lastGuess = { id: Date.now(), real: currentWord, typed: userWord, points: points }; } return d; }); } else { wordIndex++; setTimeout(playNextWord, 600); }
}

if(els.btnSendPingPong) els.btnSendPingPong.addEventListener('click', () => { if (!gameRunning || currentMode !== 'pingpong') return; let word = els.pingPongWordToSend.value.trim().toUpperCase(); if (!word) return; db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { if (d) { d.word = word; d.wordId = (d.wordId || 0) + 1; } return d; }); });
if(els.pingPongWordToSend) els.pingPongWordToSend.addEventListener('keypress', e => { if (e.key === 'Enter') els.btnSendPingPong.click(); });

function playNextWord() {
    if (!gameRunning || currentMode === 'pingpong') return; if (wordIndex >= requestedWordCount) return finishGame();
    if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
    inputActive = true; usedReplay = false; const currentWord = gameWords[wordIndex].toUpperCase();
    if (isEasyMode && isSinglePlayer && els.easyModeHint) { els.easyModeHint.textContent = currentWord.split('').sort(() => 0.5 - Math.random()).join(' '); els.easyModeHint.style.display = 'block'; } else if(els.easyModeHint) els.easyModeHint.style.display = 'none';
    playMorseAudio(currentWord, currentWpm); lastWordStartTime = Date.now(); if(els.permanentGameInput) els.permanentGameInput.focus();
}

function startCountdownSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (listeners.room) listeners.room.off();
    if (!isSinglePlayer) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            gameStartPlayerCount = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (listeners.players) db.ref(`rooms/${roomCode}/players`).off('value', listeners.players);
            listeners.players = db.ref(`rooms/${roomCode}/players`).on('value', pSnap => {
                if (!gameRunning) return; const currentPCount = Object.keys(pSnap.val() || {}).length;
                if (gameStartPlayerCount > 0 && currentPCount < gameStartPlayerCount) setTimeout(() => { db.ref(`rooms/${roomCode}/players`).once('value', s => { if (gameRunning && Object.keys(s.val() || {}).length < gameStartPlayerCount) { alert("Un giocatore ha abbandonato. Ritorno al menu."); gameRunning = false; exitRoomCleanly(false); } else if (gameRunning) showToast("👥 Giocatore rientrato!"); }); }, 10000);
            });
        });
    }
    if(els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; if(els.scoreDisplay) els.scoreDisplay.textContent = `Punti: 0`;
    if (!isRejoining) { totalScore = 0; currentStreak = 0; wordIndex = 0; quizQuestionIndex = 0; usedReplay = false; sessionCharErrors = Object.create(null); sessionErrorsByWpm = Object.create(null); matchDetailsArray = []; }
    if(els.tableBody) els.tableBody.innerHTML = ""; window.lastPlayedWordId = 0; window.lastSeenGuessId = 0;
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if(els.pingPongSendArea) els.pingPongSendArea.style.display = 'none'; if(els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (currentMode === 'pingpong' && (myId === roomHostId || roomCode.startsWith("TRN_"))) db.ref(`rooms/${roomCode}/pingpong`).once('value', s => { if(!s.exists()) db.ref(`rooms/${roomCode}/pingpong`).set({ senderId: myId, word: '', wordId: 0, wordsPlayed: 0, lastGuess: null }); });
    if (!isRejoining) { wordIndex = 0; totalScore = 0; matchDetailsArray = []; }
    showScreen('countdownScreen'); gameRunning = true; let count = 3; if(els.countdownNumber) els.countdownNumber.textContent = count;
    const interval = setInterval(() => {
        if (count > 1) { count--; if(els.countdownNumber) els.countdownNumber.textContent = count; playBeep(600, 0.1); }
        else {
            clearInterval(interval); if (myId === roomHostId) db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
            if(els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!'); playBeep(800, 0.3);
            setTimeout(() => { if (!gameRunning) return; if (currentMode === 'quiz') return startQuizSequence(); showScreen('gameArea'); if (currentMode === 'pingpong') setupPingPongListener(); else { setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); setTimeout(() => { if (gameRunning) playNextWord(); }, 800); } }, 500);
        }
    }, 1000);
}

function resumeGameSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gameRunning = true; isRejoining = false;
    if(els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; if(els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;
    if(els.tableBody) {
        els.tableBody.innerHTML = "";
        matchDetailsArray.forEach(row => {
            const tr = document.createElement('tr'); let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
            const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed;
            const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = row.real; tdReal.appendChild(bReal);
            const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.tableBody.appendChild(tr);
        });
    }
    if (currentMode === 'quiz') startQuizSequence(); else { showScreen('gameArea'); if (currentMode === 'pingpong') setupPingPongListener(); else { setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); setTimeout(() => { if (gameRunning) playNextWord(); }, 800); } }
}

let ppTimerInterval = null;
function setupPingPongListener() {
    if (listeners.pingPong) db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong);
    listeners.pingPong = db.ref(`rooms/${roomCode}/pingpong`).on('value', snap => {
        if (!gameRunning) return; const ppData = snap.val(); if (!ppData) return;
        if (ppData.lastGuess && ppData.lastGuess.id !== window.lastSeenGuessId) {
            window.lastSeenGuessId = ppData.lastGuess.id;
            const tr = document.createElement('tr');
            const tdTyped = document.createElement('td'); tdTyped.textContent = ppData.lastGuess.typed || '';
            const tdReal = document.createElement('td'); renderDiffSecure(tdReal, ppData.lastGuess.real, ppData.lastGuess.typed || '');
            const tdPoints = document.createElement('td'); tdPoints.style.fontWeight = 'bold'; tdPoints.style.color = ppData.lastGuess.points > 0 ? "#4caf50" : (ppData.lastGuess.points === 0 && ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999"); tdPoints.textContent = ppData.lastGuess.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints);
            if(els.tableBody) els.tableBody.appendChild(tr); if(els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }
        if (ppData.wordsPlayed >= requestedWordCount) { if(ppTimerInterval) clearInterval(ppTimerInterval); return finishGame(); }
        if (ppData.senderId === myId) {
            if (!ppData.word) { els.pingPongSendArea.style.display = 'flex'; els.gameInputArea.style.display = 'none'; els.pingPongWordToSend.value = ''; setTimeout(() => els.pingPongWordToSend.focus(), 100); startPingPongTimer(); } 
            else { if(ppTimerInterval) clearInterval(ppTimerInterval); els.pingPongSendArea.style.display = 'none'; els.gameInputArea.style.display = 'flex'; els.permanentGameInput.disabled = true; els.permanentGameInput.placeholder = "Avversario in decodifica..."; els.permanentGameInput.value = ""; }
        } else {
            if(ppTimerInterval) clearInterval(ppTimerInterval); els.pingPongSendArea.style.display = 'none'; els.gameInputArea.style.display = 'flex';
            if (ppData.word && ppData.wordId > window.lastPlayedWordId) { window.lastPlayedWordId = ppData.wordId; gameWords[wordIndex] = ppData.word; els.permanentGameInput.disabled = false; els.permanentGameInput.placeholder = "Decodifica e scrivi..."; els.permanentGameInput.value = ""; setTimeout(() => els.permanentGameInput.focus(), 100); inputActive = true; setTimeout(() => playMorseAudio(ppData.word.toUpperCase(), currentWpm), 500); } 
            else if (!ppData.word) { els.permanentGameInput.disabled = true; els.permanentGameInput.placeholder = "In attesa dell'avversario..."; els.permanentGameInput.value = ""; inputActive = false; }
        }
    });
}

function startPingPongTimer() {
    if (ppTimerInterval) clearInterval(ppTimerInterval); let timeLeft = 100; if(els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = '100%';
    ppTimerInterval = setInterval(() => { timeLeft -= (100 / 300); if(els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = Math.max(0, timeLeft) + '%'; if (timeLeft <= 0) { clearInterval(ppTimerInterval); sendAutoPingPongWord(); } }, 100);
}

function sendAutoPingPongWord() {
    if (!gameRunning || currentMode !== 'pingpong') return;
    const randomWord = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { if (d && !d.word) { d.word = randomWord; d.wordId = (d.wordId || 0) + 1; } return d; });
    showToast(currentLang==='it'?"Tempo scaduto! Parola inviata automaticamente.":"Time's up! Word sent automatically.");
}

function finishGame() {
    gameRunning = false; inputActive = false; if(els.permanentGameInput) els.permanentGameInput.blur();
    if (ppTimerInterval) clearInterval(ppTimerInterval); if (quizTimerInterval) clearInterval(quizTimerInterval);
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    localStorage.removeItem(STORAGE_ROOM_KEY); isRejoining = false; isChallenging = false; showScreen('leaderboardScreen');

    if (roomCode) { const myPlayerRef = db.ref(`rooms/${roomCode}/players/${myId}`); myPlayerRef.update({ finished: true, score: totalScore, wpm: currentWpm, matchDetails: matchDetailsArray }); myPlayerRef.onDisconnect().cancel(); }
    if (totalScore > 0 && !roomCode.startsWith("TRN_")) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const isReallySolo = isSinglePlayer || (Object.keys(snap.val() || {}).length < 2);
            let dbPath = `leaderboard/${currentMode === 'callsign' ? 'callsign/global' : `${currentMode === 'quiz' ? 'quiz' : currentMode === 'chars' ? 'chars' : currentMode === 'pingpong' ? 'pingpong' : 'standard'}/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}`}/${myId}`;
            if (currentMode !== 'callsign' && els.lbWordFilter) {
                if (!Array.from(els.lbWordFilter.options).some(opt => opt.value == requestedWordCount) && requestedWordCount !== 'all') { let opt = document.createElement('option'); opt.value = requestedWordCount; opt.text = `${requestedWordCount} Stringhe`; els.lbWordFilter.add(opt); }
                els.lbWordFilter.value = requestedWordCount;
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
        if (Object.keys(sessionCharErrors).length > 0) db.ref(`users/${myId}/stats/charErrors`).once('value', s => { let curr = s.val() || {}; for (let char in sessionCharErrors) curr[char] = (curr[char] || 0) + sessionCharErrors[char]; db.ref(`users/${myId}/stats/charErrors`).set(curr); });
        if (Object.keys(sessionErrorsByWpm).length > 0) db.ref(`users/${myId}/stats/errorsByWpm`).once('value', s => { let curr = s.val() || {}; for (let w in sessionErrorsByWpm) { if(!curr[w]) curr[w]={}; for (let c in sessionErrorsByWpm[w]) curr[w][c] = (curr[w][c] || 0) + sessionErrorsByWpm[w][c]; } db.ref(`users/${myId}/stats/errorsByWpm`).set(curr); });
    }
    if (roomCode && roomCode.startsWith("TRN_")) { activeTab="room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
    else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; showLeaderboardTab('tabGlobalCWFreakBtn'); }
    else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; showLeaderboardTab('tabGlobalPingPongBtn'); }
    else if (isSinglePlayer) { activeTab = "std_single"; showLeaderboardTab('tabGlobalStandardSingleBtn'); }
    else { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
}
if(els.quitGameBtn) els.quitGameBtn.addEventListener('click', () => { if (confirm("Vuoi abbandonare la partita?")) { gameRunning = false; exitRoomCleanly(); } });
if(els.startMultiplayerBtn) els.startMultiplayerBtn.addEventListener('click', () => {
    db.ref(`rooms/${roomCode}/players`).once('value', snap => {
        if (currentMode === 'pingpong' && (snap.exists() ? Object.keys(snap.val()).length : 0) < 2) return alert("Ping Pong richiede almeno 2 giocatori in stanza per iniziare!");
        db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
    });
});
if(els.deleteRoomBtn) els.deleteRoomBtn.addEventListener('click', () => { if (confirm("Eliminare questa stanza?")) db.ref(`rooms/${roomCode}`).remove().then(() => exitRoomCleanly(true)); });
if(els.leaveLobbyBtn) els.leaveLobbyBtn.addEventListener('click', () => exitRoomCleanly());
if(els.deleteDataBtn) els.deleteDataBtn.addEventListener('click', async () => {
    if (confirm("⚠️ Eliminerai per sempre TUTTI i tuoi dati. Confermi?")) {
        try {
            await db.ref(`leaderboard`).once('value', s => { s.forEach(mode => { mode.forEach(type => { type.forEach(r => { if(r.key === myId || r.key.startsWith(myId + "_")) r.ref.remove(); }); }); }); });
            const teamsSnap = await db.ref('teams').once('value');
            if (teamsSnap.exists()) {
                const teams = teamsSnap.val();
                for (let tId in teams) if (teams[tId].members && teams[tId].members[myId]) {
                    if (teams[tId].captainId === myId) {
                        let others = Object.keys(teams[tId].members).filter(k => k !== myId);
                        if (others.length === 0) { await db.ref(`teams/${tId}/status`).set('retired'); await db.ref(`teams/${tId}/members/${myId}`).remove(); }
                        else { await db.ref(`teams/${tId}/captainId`).set(others[0]); await db.ref(`teams/${tId}/members/${myId}`).remove(); }
                    } else await db.ref(`teams/${tId}/members/${myId}`).remove();
                }
            }
            const trnsSnap = await db.ref('tournaments').once('value');
            if (trnsSnap.exists()) {
                const trns = trnsSnap.val();
                for (let trnId in trns) if (trns[trnId].matches) {
                    for (let mId in trns[trnId].matches) {
                        const m = trns[trnId].matches[mId];
                        if (m.playerA && m.playerA.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).remove();
                        if (m.playerB && m.playerB.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).remove();
                    }
                }
            }
            await db.ref(`users/${myId}`).remove(); alert("Dati eliminati."); window.Telegram.WebApp.close();
        } catch (e) { alert("Errore: " + e.message); }
    }
});

if(els.saveAliasBtn) els.saveAliasBtn.addEventListener('click', async () => {
    const alias = els.userAliasInput.value.trim(); const privacy = els.privacyUsernameCheckbox.checked;
    if (privacy && !alias) return alert("L'Alias è obbligatorio se nascondi lo username Telegram!");
    if (alias.length > 15) return alert("Alias troppo lungo (max 15 caratteri).");
    const newName = alias || tgUser.first_name; const currentUsername = privacy ? "" : tgUsername;

    try {
        await db.ref(`users/${myId}`).update({ alias: alias || null, privacyUsername: privacy });
        myName = newName; myPrivacy = privacy; els.playerName.textContent = myName; showToast("Profilo aggiornato!");
        await db.ref(`presence/${myId}`).update({ name: myName, username: currentUsername });
        if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ name: myName, username: currentUsername });
        const now = new Date(); const dKey = now.toISOString().split('T')[0]; const wKey = getWeekNumber(now); const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
        for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) { const actRef = db.ref(`${path}/${myId}`); const actSnap = await actRef.once('value'); if (actSnap.exists()) await actRef.update({ name: myName }); }
        if (myTeamId) await db.ref(`teams/${myTeamId}/members/${myId}`).update({ name: myName, username: currentUsername });
        const trnsSnap = await db.ref('tournaments').once('value');
        if (trnsSnap.exists()) {
            const trns = trnsSnap.val();
            for (let trnId in trns) if (trns[trnId].status !== 'finished' && trns[trnId].matches) {
                for (let mId in trns[trnId].matches) {
                    const m = trns[trnId].matches[mId];
                    if (m.playerA && m.playerA.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).update({ name: myName, username: currentUsername });
                    if (m.playerB && m.playerB.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).update({ name: myName, username: currentUsername });
                }
            }
        }
        for (const path of ['callsign/global', 'standard', 'pingpong', 'chars']) {
            const snap = await db.ref(`leaderboard/${path}`).once('value');
            if (snap.exists()) snap.forEach(subNode => { if (path === 'callsign/global') { if (subNode.key === myId) subNode.ref.update({ name: myName, username: currentUsername }); } else subNode.forEach(userRecord => { if (userRecord.key === myId) userRecord.ref.update({ name: myName, username: currentUsername }); }); });
        }
    } catch(e) { alert("Errore durante il salvataggio."); }
});
if(els.resetStatsBtn) els.resetStatsBtn.addEventListener('click', async () => { if (confirm(currentLang === 'it' ? "Vuoi azzerare tutte le tue statistiche? Questa operazione non può essere annullata." : "Reset all your statistics? This cannot be undone.")) { try { await Promise.all([ db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove() ]); showToast("Statistiche azzerate correttamente!"); showProfileScreen(); } catch(e) { alert("Errore durante il reset delle statistiche."); } } });

window.showProfileScreen = function() {
    showScreen('profileScreen'); els.errorChartContainer.textContent = 'Caricamento...'; els.wpmErrorChartContainer.textContent = 'Caricamento...'; els.matchHistoryList.textContent = 'Caricamento...';
    db.ref(`users/${myId}/stats/charErrors`).once('value').then(snap => {
        const errors = snap.val() || {}; els.errorChartContainer.innerHTML = ''; const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
        if(sorted.length === 0) { const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore.'; els.errorChartContainer.appendChild(p); } 
        else {
            let maxErr = sorted[0][1];
            sorted.forEach(([char, count]) => {
                const row = document.createElement('div'); row.style.cssText = "display:flex; align-items:center; margin-bottom:4px;";
                const spanChar = document.createElement('span'); spanChar.style.cssText = "width:20px; font-weight:bold;"; spanChar.textContent = char;
                const barWrap = document.createElement('div'); barWrap.style.cssText = "flex-grow:1; background:var(--bg-color); border:1px solid var(--hint-color); border-radius:4px; height:12px; margin:0 5px; overflow:hidden;";
                const barFill = document.createElement('div'); barFill.style.cssText = `width:${(count / maxErr) * 100}%; background:#d32f2f; height:100%;`;
                barWrap.appendChild(barFill);
                const spanCount = document.createElement('span'); spanCount.style.cssText = "width:25px; text-align:right; font-size:0.9em; font-weight:bold;"; spanCount.textContent = count;
                row.appendChild(spanChar); row.appendChild(barWrap); row.appendChild(spanCount);
                els.errorChartContainer.appendChild(row);
            });
        }
    });
    db.ref(`users/${myId}/stats/errorsByWpm`).once('value').then(snap => {
        const wpmErrors = snap.val() || {}; els.wpmErrorChartContainer.innerHTML = '';
        if(Object.keys(wpmErrors).length === 0) { const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore per WPM.'; els.wpmErrorChartContainer.appendChild(p); return; }
        Object.keys(wpmErrors).sort((a,b) => parseInt(b) - parseInt(a)).forEach(wpm => {
            let charsAtWpm = wpmErrors[wpm]; let totalErrs = Object.values(charsAtWpm).reduce((acc, curr) => acc + curr, 0); let topChar = Object.entries(charsAtWpm).sort((a,b) => b[1] - a[1])[0];
            const row = document.createElement('div'); row.style.cssText = "margin-bottom:8px; border-bottom:1px solid var(--hint-color); padding-bottom:4px;";
            const divTop = document.createElement('div'); divTop.style.cssText = "display:flex; justify-content:space-between; font-weight:bold; color:var(--link-color);";
            const spanWpm = document.createElement('span'); spanWpm.textContent = `${wpm} WPM`;
            const spanTot = document.createElement('span'); spanTot.textContent = `Tot: ${totalErrs} err`;
            divTop.appendChild(spanWpm); divTop.appendChild(spanTot);
            const divBot = document.createElement('div'); divBot.style.cssText = "font-size:0.85em; color:var(--text-color);";
            divBot.appendChild(document.createTextNode("Peggior lettera: "));
            const bChar = document.createElement('b'); bChar.textContent = topChar[0]; divBot.appendChild(bChar); divBot.appendChild(document.createTextNode(` (${topChar[1]} volte)`));
            row.appendChild(divTop); row.appendChild(divBot);
            els.wpmErrorChartContainer.appendChild(row);
        });
    });
    db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(30).once('value').then(snap => {
        els.matchHistoryList.innerHTML = ''; userMatchHistory = [];
        snap.forEach(child => { userMatchHistory.push({ key: child.key, ...child.val() }); }); userMatchHistory.reverse();
        if (userMatchHistory.length === 0) { const li = document.createElement('li'); li.style.justifyContent = 'center'; li.style.color = 'var(--hint-color)'; li.textContent = 'Nessuna partita giocata.'; els.matchHistoryList.appendChild(li); return; }
        userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now()); const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            let modeIcon = match.mode === 'callsign' ? '🎙️ Nom.' : match.mode === 'pingpong' ? '🏓 Ping Pong' : match.mode === 'chars' ? '⌨️ Carat.' : '🔤 Parole';
            const li = document.createElement('li'); li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';
            
            const topDiv = document.createElement('div'); topDiv.style.cssText = "display:flex; justify-content:space-between; width:100%; margin-bottom:5px;";
            const spanLeft = document.createElement('span'); spanLeft.style.cssText = "font-size:0.85em; font-weight:bold;"; spanLeft.textContent = `${modeIcon} (${match.type})`;
            const spanRight = document.createElement('span'); spanRight.style.cssText = "font-size:0.8em; color:var(--hint-color);"; spanRight.textContent = dateStr;
            topDiv.appendChild(spanLeft); topDiv.appendChild(spanRight);
            
            const botDiv = document.createElement('div'); botDiv.style.cssText = "display:flex; justify-content:space-between; width:100%; align-items:center;";
            const spanScore = document.createElement('span'); const bScore = document.createElement('b'); bScore.textContent = `${match.score} pt`; const smallWpm = document.createElement('small'); smallWpm.textContent = ` (${match.wpm} WPM)`;
            spanScore.appendChild(bScore); spanScore.appendChild(smallWpm);
            
            const btnDiv = document.createElement('div'); btnDiv.style.display = 'flex'; btnDiv.style.gap = '5px';
            const vBtn = document.createElement('button'); vBtn.className = "action-btn-small btn-secondary"; vBtn.textContent = "Vedi"; vBtn.onclick = () => openMatchDetails(match.key);
            const dBtn = document.createElement('button'); dBtn.className = "action-btn-small btn-danger"; dBtn.textContent = "X"; dBtn.onclick = () => deleteHistoryItem(match.key);
            btnDiv.appendChild(vBtn); btnDiv.appendChild(dBtn); botDiv.appendChild(spanScore); botDiv.appendChild(btnDiv);
            li.appendChild(topDiv); li.appendChild(botDiv); els.matchHistoryList.appendChild(li);
        });
    });
}
window.openMatchDetails = function(matchKey) {
    const match = userMatchHistory.find(m => m.key === matchKey); if(!match) return;
    els.matchDetailsBody.innerHTML = '';
    (match.details || []).forEach(row => {
        const tr = document.createElement('tr'); let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
}
window.deleteHistoryItem = function(key) { if(confirm("Eliminare questa partita?")) db.ref(`users/${myId}/history/${key}`).remove().then(() => showProfileScreen()); }

function showLeaderboardTab(tabId) {
    const mapping = { 'tabRoomBtn': 'room', 'tabGlobalTournamentBtn': 'trn_global', 'tabGlobalCWFreakBtn': 'cwfreak', 'tabGlobalPingPongBtn': 'pingpong', 'tabGlobalStandardMultiBtn': 'std_multi', 'tabGlobalStandardSingleBtn': 'std_single', 'tabGlobalCharsMultiBtn': 'chars_multi', 'tabGlobalCharsSingleBtn': 'chars_single', 'tabGlobalQuizMultiBtn': 'quiz_multi', 'tabGlobalQuizSingleBtn': 'quiz_single' };
    let modeValue = mapping[tabId] || tabId; if(els.lbModeSelect) els.lbModeSelect.value = modeValue;

    els.trnSubTabs.style.display = 'none';
    if (modeValue === 'room') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'block'; els.leaderboardContainer.innerHTML = '';
        if (roomCode) db.ref(`rooms/${roomCode}/players`).once('value', snap => renderRoomLeaderboard(snap.val() || {}));
        else { els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Nessuna partita attiva.</p>'; els.waitingOthersText.style.display = 'none'; }
    } else if (modeValue === 'trn_global') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none'; els.trnSubTabs.style.display = 'flex';
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnGlobalLB.classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeValue === 'cwfreak') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none'; fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (['chars_multi', 'quiz_multi'].includes(modeValue)) {
        els.lbFilterArea.style.display = 'block'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        populateDynamicFilters(`recent_matches/${modeValue}`, '');
        fetchAndRenderGlobalLeaderboard(modeValue, els.lbWordFilter.value);
    } else if (modeValue === 'pingpong') {
        els.lbFilterArea.style.display = 'block'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        populateDynamicFilters('pingpong', ''); fetchAndRenderGlobalLeaderboard('pingpong', els.lbWordFilter.value);
    } else {
        els.lbFilterArea.style.display = 'block'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        let type = modeValue === 'std_multi' ? 'multi' : 'single';
        populateDynamicFilters(type === 'multi' ? 'recent_matches/standard_multi' : 'standard', type === 'single' ? 'single' : '');
        fetchAndRenderGlobalLeaderboard(`standard_${type}`, els.lbWordFilter.value);
    }
}
if(els.lbModeSelect) els.lbModeSelect.addEventListener('change', e => { activeTab = e.target.value; showLeaderboardTab(e.target.value); });
if(els.btnTrnGlobalLB) els.btnTrnGlobalLB.addEventListener('click', () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnGlobalLB.classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('tournaments', null); });
if(els.btnTrnActiveLB) els.btnTrnActiveLB.addEventListener('click', () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnActiveLB.classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('active_tournament', null); });
if(els.lbWordFilter) els.lbWordFilter.addEventListener('change', () => { if (['std_multi','std_single','pingpong'].includes(activeTab)) showLeaderboardTab(activeTab === 'std_multi' ? 'tabGlobalStandardMultiBtn' : activeTab === 'std_single' ? 'tabGlobalStandardSingleBtn' : 'tabGlobalPingPongBtn'); });

function populateDynamicFilters(modePath, subTypeFilter = "") {
    const currentValue = els.lbWordFilter.value;
    db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
        let options = ['<option value="all">Tutte le categorie</option>']; let counts = [];
        snapshot.forEach(wordCountNode => {
            const key = wordCountNode.key;
            if (modePath.startsWith('recent_matches')) { if (key !== 'unknown' && !counts.includes(key)) counts.push(key); }
            else { if (!subTypeFilter || key.startsWith(subTypeFilter + "_")) { const count = key.split('_').pop(); if (!counts.includes(count)) counts.push(count); } }
        });
        counts.sort((a,b) => parseInt(a) - parseInt(b)).forEach(c => options.push(`<option value="${c}">${c} Stringhe</option>`));
        els.lbWordFilter.innerHTML = options.join(''); if (counts.includes(currentValue) || currentValue === 'all') els.lbWordFilter.value = currentValue;
    });
}

function listenToRoomLeaderboard() {
    if (!roomCode) return;
    if (listeners.roomLb) db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb);
    listeners.roomLb = db.ref(`rooms/${roomCode}`).on('value', snap => {
        if (!snap.exists()) return; const roomData = snap.val(), players = roomData.players || {};
        if (activeTab === "room") renderRoomLeaderboard(players);
        let allFinished = true; Object.values(players).forEach(p => { if (!p.finished) allFinished = false; });
        if (allFinished && roomData.status !== 'finished' && Object.keys(players).length > 0) {
            db.ref(`rooms/${roomCode}/status`).set('finished');
            if (Object.keys(players).length >= 2 && ['multi', 'pingpong', 'chars', 'quiz'].includes(roomData.type || currentMode)) saveMatchToGlobalHistory(players, roomData);
            if (roomCode.startsWith("TRN_")) {
                const matchId = roomCode.replace("TRN_", ""); let highestScore = -1, winnerTeamId = null;
                Object.values(players).forEach(p => { if (p.score > highestScore) { highestScore = p.score; winnerTeamId = p.teamId; } else if (p.score === highestScore) winnerTeamId = "tie"; });
                if (winnerTeamId && activeTrnId) {
                    db.ref(`tournaments/${activeTrnId}/matches/${matchId}`).update({ status: 'finished', winnerTeamId: winnerTeamId }).then(() => checkTournamentCompletion(activeTrnId));
                    if (winnerTeamId !== "tie") db.ref(`tournaments/${activeTrnId}/standings/${winnerTeamId}`).transaction(t => { if (t) t.points = (t.points || 0) + 1; return t; });
                }
                setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 15000);
            } else if (roomData.hostId === myId) setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 30000);
        }
    });
}

function checkTournamentCompletion(trnId) {
    db.ref(`tournaments/${trnId}`).once('value', snap => {
        const trn = snap.val(); if (!trn || trn.status === 'finished' || !trn.matches) return;
        let allFinished = true; Object.values(trn.matches).forEach(m => { if (m.status !== 'finished') allFinished = false; });
        if (allFinished) {
            db.ref(`tournaments/${trnId}/status`).set('finished'); showToast("Torneo completato! Spostato in archivio.");
            if (trn.standings) Object.entries(trn.standings).forEach(([tId, data]) => {
                if (data.points > 0) db.ref(`leaderboard/tournaments/${tId}`).transaction(currentG => {
                    if (!currentG) return { name: data.name, score: data.points, date: new Date().toLocaleDateString('it-IT') };
                    currentG.score = (currentG.score || 0) + data.points; currentG.date = new Date().toLocaleDateString('it-IT'); return currentG;
                });
            });
        }
    });
}

function renderRoomLeaderboard(players) {
    els.leaderboardContainer.innerHTML = ''; let allFinished = true;
    const playersArray = Object.entries(players).map(([id, data]) => ({ id, name: data.name || "Sconosciuto", username: data.username, score: data.score || 0, wpm: data.wpm || 0, finished: data.finished, matchDetails: data.matchDetails || [] }));
    if(playersArray.length===0) return;
    playersArray.forEach(p => { if (!p.finished) allFinished = false; });
    els.waitingOthersText.style.display = allFinished ? 'none' : 'block';

    if (allFinished && (roomCode && (roomCode.startsWith("TRN_") || currentMode === 'pingpong' || playersArray.length > 1))) renderHeadToHeadView(playersArray, els.leaderboardContainer);
    else {
        playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, index) => {
            const row = document.createElement('div'); row.className = 'leaderboard-row';
            let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const leftSpan = document.createElement('span'); leftSpan.appendChild(document.createTextNode(medal + " "));
            if (player.username && String(player.username).trim() !== "") { const nameLink = document.createElement('span'); nameLink.style.color = 'var(--link-color)'; nameLink.style.cursor = 'pointer'; nameLink.style.textDecoration = 'underline'; nameLink.textContent = player.name; nameLink.onclick = () => openTelegramProfile(player.username); leftSpan.appendChild(nameLink); } 
            else leftSpan.appendChild(document.createTextNode(player.name));
            leftSpan.appendChild(document.createElement('br')); const wpmSmall = document.createElement('small'); wpmSmall.style.color = 'var(--hint-color)'; wpmSmall.textContent = `(${player.wpm || 0} WPM)`; leftSpan.appendChild(wpmSmall);
            const rightSpan = document.createElement('span');
            const scoreB = document.createElement('b'); scoreB.textContent = `${player.score} pt`; rightSpan.appendChild(scoreB);
            row.appendChild(leftSpan); row.appendChild(rightSpan); els.leaderboardContainer.appendChild(row);
        });
    }
    if(allFinished && playersArray.length > 0) els.roomWinnerBanner.textContent = roomCode.startsWith("TRN_") ? `🏆 Vince il match: ${playersArray[0].name}` : `🏆 Vincitore: ${playersArray[0].name}`;
}

function renderHeadToHeadView(players, container) {
    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)); const maxScore = players[0].score;
    players.forEach((p) => {
        const card = document.createElement('div'); card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');
        
        const nameDiv = document.createElement('div'); nameDiv.className = 'h2h-name'; nameDiv.textContent = p.name;
        if (p.id === myId) {
            const meSmall = document.createElement('small'); meSmall.textContent = ` (${currentLang === 'it' ? 'Tu' : 'You'})`; nameDiv.appendChild(meSmall);
        }
        card.appendChild(nameDiv);

        const statsDiv = document.createElement('div'); statsDiv.className = 'h2h-stats';
        
        const rowPt = document.createElement('div'); rowPt.className = 'h2h-stat-row'; 
        const sPtLbl = document.createElement('span'); sPtLbl.textContent = currentLang === 'it' ? 'Punti:' : 'Points:';
        const sPtVal = document.createElement('span'); sPtVal.className = 'h2h-val'; sPtVal.style.color = '#4caf50'; sPtVal.textContent = p.score;
        rowPt.appendChild(sPtLbl); rowPt.appendChild(sPtVal); statsDiv.appendChild(rowPt);
        
        const rowSp = document.createElement('div'); rowSp.className = 'h2h-stat-row'; 
        const sSpLbl = document.createElement('span'); sSpLbl.textContent = currentLang === 'it' ? 'Velocità:' : 'Speed:';
        const sSpVal = document.createElement('span'); sSpVal.className = 'h2h-val'; sSpVal.style.color = 'var(--link-color)'; sSpVal.textContent = `${p.wpm} WPM`;
        rowSp.appendChild(sSpLbl); rowSp.appendChild(sSpVal); statsDiv.appendChild(rowSp);
        
        card.appendChild(statsDiv);

        const hintDiv = document.createElement('div'); hintDiv.className = 'h2h-hint';
        hintDiv.textContent = p.id === myId ? (currentLang === 'it' ? 'Clicca per dettagli' : 'Click for details') : (currentLang === 'it' ? 'Dettagli privati' : 'Details are private');
        card.appendChild(hintDiv);

        if (p.id !== myId) hintDiv.style.opacity = "0.5";
        card.onclick = () => {
            if (p.id !== myId) return showToast(currentLang === 'it' ? "Puoi vedere solo i tuoi dettagli." : "You can only view your own details.");
            if (p.matchDetails && p.matchDetails.length > 0) showPlayerDetailsModal(p.name, p.matchDetails);
            else if (p.id === myId && matchDetailsArray.length > 0) showPlayerDetailsModal(p.name, matchDetailsArray);
            else showToast(currentLang === 'it' ? "Dettagli non disponibili" : "Details not available");
        };
        h2h.appendChild(card);
    });
    container.appendChild(h2h);
}

function showPlayerDetailsModal(name, details) {
    els.matchDetailsBody.innerHTML = '';
    els.matchDetailsModal.querySelector('h3').textContent = `${currentLang === 'it' ? 'Dettagli Partita di' : 'Match Details for'} ${name}`;
    details.forEach(row => {
        const tr = document.createElement('tr'); let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
}

function saveMatchToGlobalHistory(players, roomData) {
    if (myId !== roomData.hostId) return;
    const matchId = Date.now().toString();
    let modePath = ['pingpong', 'chars', 'quiz'].includes(currentMode) ? (currentMode === 'pingpong' ? 'pingpong' : `${currentMode}_multi`) : 'standard_multi';
    const matchData = { players: Object.entries(players).map(([id, data]) => ({ id, name: data.name, username: data.username || "", score: data.score || 0, wpm: data.wpm || 0, matchDetails: data.matchDetails || [] })), mode: currentMode, wordCount: roomData.wordCount, date: new Date().toLocaleDateString('it-IT'), ts: firebase.database.ServerValue.TIMESTAMP };
    db.ref(`leaderboard/recent_matches/${modePath}/${roomData.wordCount || 'all'}/${matchId}`).set(matchData);
}

function fetchAndRenderGlobalLeaderboard(tabType, filterWordCount) {
    els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Caricamento...</p>';
    
    // Sfide recenti
    if (['standard_multi', 'chars_multi', 'quiz_multi'].includes(tabType)) {
        db.ref(`leaderboard/recent_matches/${tabType}`).once('value', snapshot => {
            let matches = [];
            snapshot.forEach(wcNode => { if (filterWordCount === 'all' || wcNode.key === filterWordCount) wcNode.forEach(mNode => matches.push(mNode.val())); });
            matches.sort((a,b) => (b.ts || 0) - (a.ts || 0)); renderMatchesHistoryHTML(matches.slice(0, 30), els.leaderboardContainer);
        });
        return;
    }

    // PingPong
    if (tabType === 'pingpong') {
        db.ref(`leaderboard/pingpong`).once('value', snapshot => {
            let players = [];
            if(snapshot.exists()) {
                snapshot.forEach(wordCountNode => {
                    const key = wordCountNode.key;
                    if (filterWordCount !== 'all' && !key.endsWith("_" + filterWordCount)) return;
                    wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 100), els.leaderboardContainer, true);
        });
        return;
    }

    // Callsign (Nominativi / CW Freak)
    if (tabType === 'callsign') {
        db.ref('leaderboard/callsign/global').once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 100), els.leaderboardContainer, false);
        });
        return;
    }

    // Tornei
    if (tabType === 'tournaments') {
        db.ref('leaderboard/tournaments').once('value', snapshot => {
            let teams = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) teams.push(child.val()); });
            }
            teams.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(teams.slice(0, 100), els.leaderboardContainer, false, true);
        });
        return;
    }

    // Torneo Attivo
    if (tabType === 'active_tournament') {
        if (!activeTrnId) {
            els.leaderboardContainer.innerHTML = '';
            const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color);"; p.textContent = currentLang==='it' ? "Non sei iscritto a nessun torneo attivo." : "You are not enrolled in any active tournament.";
            els.leaderboardContainer.appendChild(p);
        } else {
            db.ref(`tournaments/${activeTrnId}`).once('value', snap => {
                const trn = snap.val();
                if (trn && trn.standings) {
                    els.leaderboardContainer.innerHTML = '';
                    const header = document.createElement('div'); header.style.cssText = "text-align:center; margin-bottom:10px; padding:5px; background:var(--sec-bg-color); border-radius:8px;";
                    const hSmall = document.createElement('small'); hSmall.style.color = "var(--hint-color)"; hSmall.textContent = currentLang==='it'?'Torneo Attivo:':'Active Tournament:';
                    const hB = document.createElement('b'); hB.style.cssText = "color:var(--champ-color); font-size:1.1em;"; hB.textContent = trn.name;
                    header.appendChild(hSmall); header.appendChild(document.createElement('br')); header.appendChild(hB);
                    els.leaderboardContainer.appendChild(header);

                    let std = Object.entries(trn.standings).map(([id, data]) => ({ name: data.name, score: data.points, date: currentLang==='it'?"In corso":"In progress" }));
                    std.sort((a,b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                    const listCont = document.createElement('div');
                    renderPlayersListHTML(std, listCont, false, true);
                    els.leaderboardContainer.appendChild(listCont);
                } else {
                    els.leaderboardContainer.innerHTML = '';
                    const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color);"; p.textContent = currentLang==='it'?'Dati torneo non disponibili.':'Tournament data unavailable.';
                    els.leaderboardContainer.appendChild(p);
                }
            });
        }
        return;
    }

    // Modalità singole (standard, chars, quiz)
    let isStandard = tabType.startsWith('standard');
    let isChars = tabType.startsWith('chars');
    let isQuiz = tabType.startsWith('quiz');
    let modePath = isQuiz ? 'quiz' : (isChars ? 'chars' : 'standard');
    let subType = isQuiz ? tabType.replace('quiz_', '') : (isChars ? tabType.replace('chars_', '') : tabType.replace('standard_', ''));

    db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
        let players = [];
        if(snapshot.exists()) {
            snapshot.forEach(wordCountNode => {
                const key = wordCountNode.key;
                if (!key.startsWith(subType + "_")) return;
                if (filterWordCount !== 'all' && !key.endsWith("_" + filterWordCount)) return;

                wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
            });
        }
        players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        renderPlayersListHTML(players.slice(0, 100), els.leaderboardContainer, true);
    });
}

function renderMatchesHistoryHTML(matches, container) {
    container.innerHTML = '';
    if (matches.length === 0) {
        const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.'; container.appendChild(p); return;
    }
    matches.forEach(match => {
        const mw = document.createElement('div'); mw.style.marginBottom = "25px"; mw.style.borderBottom = "1px dashed var(--hint-color)"; mw.style.paddingBottom = "15px";
        const infoDiv = document.createElement('div'); infoDiv.style.textAlign = 'center'; infoDiv.style.fontSize = '0.8em'; infoDiv.style.color = 'var(--hint-color)'; infoDiv.style.marginBottom = '8px';
        infoDiv.textContent = `📅 ${match.date} - ${match.wordCount} Stringhe`; mw.appendChild(infoDiv);
        renderHeadToHeadView(match.players, mw); container.appendChild(mw);
    });
}

function renderPlayersListHTML(players, container, showWordCount, isTeam = false) {
    container.innerHTML = '';
    if (players.length === 0) {
        const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)';
        p.textContent = currentLang === 'it' ? 'Nessun record trovato per questa categoria.' : 'No records found for this category.';
        container.appendChild(p); return;
    }

    players.forEach((player, index) => {
        const row = document.createElement('div'); row.className = 'leaderboard-row'; row.style.padding = "8px 10px"; row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        const mainDiv = document.createElement('div'); mainDiv.style.display = 'flex'; mainDiv.style.alignItems = 'center'; mainDiv.style.gap = '8px'; mainDiv.style.flexGrow = '1';
        
        const medalDiv = document.createElement('div'); medalDiv.style.fontSize = '1.2em'; medalDiv.style.minWidth = '1.5em'; medalDiv.style.textAlign = 'center';
        if (index === 0) medalDiv.textContent = "🥇"; else if (index === 1) medalDiv.textContent = "🥈"; else if (index === 2) medalDiv.textContent = "🥉";
        else { const span = document.createElement('span'); span.style.color = 'var(--hint-color)'; span.style.fontSize = '0.8em'; span.textContent = (index + 1) + "."; medalDiv.appendChild(span); }

        const infoDiv = document.createElement('div'); infoDiv.style.display = 'flex'; infoDiv.style.flexDirection = 'column';
        const nameDiv = document.createElement('div'); nameDiv.style.display = 'flex'; nameDiv.style.alignItems = 'center';
        
        if (player.username && String(player.username).trim() !== "" && !isTeam) {
            const nameLink = document.createElement('span'); nameLink.style.color = 'var(--link-color)'; nameLink.style.cursor = 'pointer'; nameLink.style.textDecoration = 'underline'; nameLink.style.fontWeight = 'bold'; nameLink.textContent = player.name; nameLink.onclick = () => openTelegramProfile(player.username);
            nameDiv.appendChild(nameLink);
        } else {
            const nameSpan = document.createElement('span'); nameSpan.style.fontWeight = 'bold'; nameSpan.textContent = player.name; nameDiv.appendChild(nameSpan);
        }
        
        if (showWordCount && player.wordCount) {
            const wcSpan = document.createElement('span'); wcSpan.style.background = 'var(--hint-color)'; wcSpan.style.color = 'var(--bg-color)'; wcSpan.style.padding = '1px 4px'; wcSpan.style.borderRadius = '3px'; wcSpan.style.fontSize = '0.8em'; wcSpan.style.marginLeft = '4px'; wcSpan.textContent = player.wordCount + " str."; nameDiv.appendChild(wcSpan);
        }

        const dateDiv = document.createElement('div'); dateDiv.style.fontSize = '0.75em'; dateDiv.style.color = 'var(--hint-color)'; dateDiv.textContent = (player.date || "") + " ";
        if (!isTeam && player.wpm) {
            const wpmSpan = document.createElement('span'); wpmSpan.style.color = 'var(--champ-color)'; wpmSpan.style.fontWeight = 'bold'; wpmSpan.textContent = player.wpm + " WPM"; dateDiv.appendChild(wpmSpan);
        }

        infoDiv.appendChild(nameDiv); infoDiv.appendChild(dateDiv);
        mainDiv.appendChild(medalDiv); mainDiv.appendChild(infoDiv);

        const scoreDiv = document.createElement('div'); scoreDiv.style.textAlign = 'right';
        const scoreB = document.createElement('b'); scoreB.style.fontSize = '1.1em'; scoreB.style.color = 'var(--link-color)'; scoreB.textContent = player.score;
        const ptSpan = document.createElement('span'); ptSpan.style.fontSize = '0.7em'; ptSpan.style.color = 'var(--hint-color)'; ptSpan.style.marginLeft = '2px'; ptSpan.textContent = 'pt';
        scoreDiv.appendChild(scoreB); scoreDiv.appendChild(ptSpan);

        row.appendChild(mainDiv); row.appendChild(scoreDiv); container.appendChild(row);
    });
}

// --- SQUADRE E TORNEI ---
if(els.goToTeamsBtn) els.goToTeamsBtn.addEventListener('click', () => showScreen('teamsScreen'));

function processTeamInvite(inviteTeamId) {
    db.ref(`teams/${inviteTeamId}`).once('value', snap => {
        if(snap.exists() && snap.val().status === 'open') {
            db.ref(`teams/${inviteTeamId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername }); tg.showAlert(`Sei entrato nella squadra ${snap.val().name}!`); showScreen('teamsScreen');
        } else { tg.showAlert("Squadra non esistente o chiusa."); showScreen('setupScreen'); }
    });
}

function checkMyTeamStatus() {
    db.ref('teams').once('value', snap => {
        myTeamId = null; isTeamCaptain = false; myTeamName = "";
        snap.forEach(team => { if (team.child('members').hasChild(myId)) { myTeamId = team.key; myTeamName = team.val().name; isTeamCaptain = (team.val().captainId === myId); } });
        if (myTeamId) { els.noTeamView.style.display = 'none'; els.myTeamView.style.display = 'flex'; listenToMyTeam(); listenToTournaments(); listenToAllTeams(true); switchTeamTab('gest'); }
        else { els.myTeamView.style.display = 'none'; els.noTeamView.style.display = 'flex'; listenToAllTeams(false); switchTeamTab('gest'); }
    });
}

window.switchTeamTab = function(tab) {
    [els.tabTeamGestBtn, els.tabAllTeamsBtn, els.tabTournamentsBtn].forEach(b => { if(b) b.classList.remove('active-tab'); });
    els.noTeamView.style.display = 'none'; els.myTeamView.style.display = 'none'; els.allTeamsArea.style.display = 'none'; els.tournamentsArea.style.display = 'none';
    if (tab === 'gest') { els.tabTeamGestBtn.classList.add('active-tab'); if(myTeamId) els.myTeamView.style.display = 'flex'; else els.noTeamView.style.display = 'flex'; }
    else if (tab === 'allteams') { els.tabAllTeamsBtn.classList.add('active-tab'); els.allTeamsArea.style.display = 'flex'; listenToAllTeams(!!myTeamId); }
    else { els.tabTournamentsBtn.classList.add('active-tab'); els.tournamentsArea.style.display = 'flex'; listenToTournaments(); }
}

if(els.createTeamBtn) els.createTeamBtn.addEventListener('click', () => {
    const tName = els.newTeamName.value.trim(); if(!tName) return;
    db.ref('teams').push().set({ name: tName, captainId: myId, status: 'open', members: { [myId]: { name: myName, username: myPrivacy ? "" : tgUsername } } }).then(() => checkMyTeamStatus());
});

function listenToAllTeams(isAlreadyInTeam) {
    if (listeners.allTeams) db.ref('teams').off('value', listeners.allTeams);
    listeners.allTeams = db.ref('teams').on('value', snap => {
        if(els.openTeamsList) els.openTeamsList.innerHTML = ''; if(els.globalAllTeamsList) els.globalAllTeamsList.innerHTML = '';
        snap.forEach(child => {
            const t = child.val(); const count = Object.keys(t.members || {}).length; if (t.status === 'retired' || count === 0) return;
            const liAll = document.createElement('li'); liAll.style.flexDirection = 'column'; liAll.style.alignItems = 'flex-start';
            
            const topDiv = document.createElement('div'); topDiv.style.cssText = "width:100%; display:flex; justify-content:space-between;";
            if (!isAlreadyInTeam && t.status !== 'closed') { topDiv.style.cursor = 'pointer'; topDiv.onclick = () => window.joinTeam(child.key); }
            
            const spanTitle = document.createElement('span');
            const bTitle = document.createElement('b'); bTitle.textContent = t.name;
            const smCount = document.createElement('small'); smCount.textContent = ` (${count} mem.)`;
            spanTitle.appendChild(bTitle); spanTitle.appendChild(smCount);
            topDiv.appendChild(spanTitle);

            if (!isAlreadyInTeam && t.status !== 'closed') {
                const spanJoin = document.createElement('span'); spanJoin.style.cssText = "color:var(--link-color); font-size:0.8em; font-weight:bold;"; spanJoin.textContent = "+ Unisciti"; topDiv.appendChild(spanJoin);
            }

            const memDiv = document.createElement('div'); memDiv.style.cssText = "margin-top:3px; padding-left:5px; border-left:2px solid var(--link-color);";
            Object.values(t.members || {}).forEach(m => {
                const spanM = document.createElement('span'); spanM.style.cssText = "display:inline-block; margin-right:5px; font-size:0.85em; color:var(--hint-color);"; spanM.textContent = `- ${m.name}`; memDiv.appendChild(spanM);
            });
            
            liAll.appendChild(topDiv); liAll.appendChild(memDiv);
            if(els.globalAllTeamsList) els.globalAllTeamsList.appendChild(liAll);

            if (!isAlreadyInTeam && t.status !== 'closed' && els.openTeamsList) {
                const liOpen = document.createElement('li'); liOpen.style.cursor = 'pointer'; liOpen.onclick = () => window.joinTeam(child.key);
                const leftOpen = document.createElement('span'); const bOpen = document.createElement('b'); bOpen.textContent = t.name; const smallOpen = document.createElement('small'); smallOpen.textContent = ` (${count} mem.)`; leftOpen.appendChild(bOpen); leftOpen.appendChild(smallOpen);
                const rightOpen = document.createElement('span'); rightOpen.style.color = 'var(--link-color)'; rightOpen.style.fontWeight = 'bold'; rightOpen.textContent = "+ Unisciti";
                liOpen.appendChild(leftOpen); liOpen.appendChild(rightOpen); els.openTeamsList.appendChild(liOpen);
            }
        });
        if(els.openTeamsList && !els.openTeamsList.innerHTML) {
            const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra aperta."; els.openTeamsList.appendChild(li);
        }
        if(els.globalAllTeamsList && !els.globalAllTeamsList.innerHTML) {
            const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra creata."; els.globalAllTeamsList.appendChild(li);
        }
    });
}

window.joinTeam = function(tId) { db.ref(`teams/${tId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername }).then(() => checkMyTeamStatus()); }

function listenToMyTeam() {
    if (listeners.team) db.ref(`teams/${myTeamId}`).off('value', listeners.team);
    listeners.team = db.ref(`teams/${myTeamId}`).on('value', snap => {
        if(!snap.exists() || snap.val().status === 'retired') return checkMyTeamStatus();
        const team = snap.val(); els.myTeamNameDisplay.textContent = team.name; els.teamStatusText.innerHTML = team.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';
        els.captainName.innerHTML = ''; els.teamOthersList.innerHTML = '';
        Object.entries(team.members || {}).forEach(([id, mem]) => {
            const span = document.createElement('span'); span.textContent = mem.name;
            if (mem.username && String(mem.username).trim() !== "") { span.style.color = 'var(--link-color)'; span.style.cursor = 'pointer'; span.style.textDecoration = 'underline'; span.onclick = () => openTelegramProfile(mem.username); }
            if (id === team.captainId) els.captainName.appendChild(span);
            else { 
                if (els.teamOthersList.children.length > 0) { const sep = document.createElement('span'); sep.style.color = 'var(--hint-color)'; sep.textContent = ' | '; els.teamOthersList.appendChild(sep); } 
                els.teamOthersList.appendChild(span); 
            }
        });
        els.captainActions.style.display = isTeamCaptain ? 'block' : 'none';
        els.toggleTeamLockBtn.textContent = team.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni"; els.toggleTeamLockBtn.onclick = () => db.ref(`teams/${myTeamId}/status`).set(team.status === 'open' ? 'closed' : 'open');
        els.inviteTeamBtn.onclick = () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=team_${myTeamId}`)}&text=${encodeURIComponent(`Unisciti alla mia squadra: ${team.name}!`)}`);
        setupChat(db.ref(`teams/${myTeamId}/chat`), 'teamChatMessages', null);
    });
}

if(els.clearTeamChatBtn) els.clearTeamChatBtn.addEventListener('click', () => { if (confirm('Vuoi cancellare la chat di squadra?')) if (myTeamId) db.ref(`teams/${myTeamId}/chat`).remove(); });
if(els.sendTeamChatBtn) els.sendTeamChatBtn.addEventListener('click', () => { const txt = els.teamChatInput.value.trim(); if (!txt || !myTeamId) return; db.ref(`teams/${myTeamId}/chat`).push({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP }); els.teamChatInput.value = ''; });
if(els.teamChatInput) els.teamChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') els.sendTeamChatBtn.click(); });
if(els.leaveTeamBtn) els.leaveTeamBtn.addEventListener('click', () => {
    if(confirm("Vuoi abbandonare la squadra?")) db.ref(`teams/${myTeamId}`).once('value', snap => {
        const team = snap.val();
        if(isTeamCaptain) {
            let others = Object.keys(team.members).filter(id => id !== myId);
            if(others.length > 0) db.ref(`teams/${myTeamId}/captainId`).set(others[0]).then(()=> db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus()));
            else db.ref(`teams/${myTeamId}/status`).set('retired').then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus()));
        } else db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus());
    });
});

function listenToTournaments() {
    if (listeners.trn) db.ref('tournaments').off('value', listeners.trn);
    listeners.trn = db.ref('tournaments').on('value', snap => {
        activeTrnId = null; if(els.openTournamentsList) els.openTournamentsList.innerHTML = ''; if(els.pastTournamentsList) els.pastTournamentsList.innerHTML = '';
        if(els.createTrnPanel) els.createTrnPanel.style.display = isTeamCaptain ? 'flex' : 'none';
        let foundActive = null;
        snap.forEach(child => {
            const trn = child.val(); const trnId = child.key; const isMember = myTeamId && trn.teams && trn.teams[myTeamId]; const isHost = trn.hostId === myId;
            if ((isMember || isHost) && trn.status !== 'finished') { if (!foundActive) foundActive = child; else if (trn.status === 'playing' && foundActive.val().status !== 'playing') foundActive = child; }
            if (trn.status === 'open') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const countSmall = document.createElement('small'); countSmall.textContent = ` (${Object.keys(trn.teams || {}).length} sq.)`; leftSpan.appendChild(nameB); leftSpan.appendChild(countSmall); li.appendChild(leftSpan);
                if (isTeamCaptain && !isMember) { const btn = document.createElement('button'); btn.className = 'action-btn-small btn-champ'; btn.textContent = 'Iscrivi'; btn.onclick = () => window.joinTournament(trnId); li.appendChild(btn); } 
                else if (isMember) { const joinedSmall = document.createElement('small'); joinedSmall.style.color = 'var(--link-color)'; joinedSmall.style.fontWeight = 'bold'; joinedSmall.textContent = ' (Iscritto)'; li.appendChild(joinedSmall); }
                if(els.openTournamentsList) els.openTournamentsList.appendChild(li);
            } else if (trn.status === 'finished') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const statusSmall = document.createElement('small'); statusSmall.textContent = " (Concluso)"; leftSpan.appendChild(nameB); leftSpan.appendChild(statusSmall); li.appendChild(leftSpan);
                const btn = document.createElement('button'); btn.className = 'action-btn-small btn-secondary'; btn.textContent = 'Vedi Risultati'; btn.onclick = () => window.viewTournament(trnId);
                li.appendChild(btn); if(els.pastTournamentsList) els.pastTournamentsList.appendChild(li);
            }
        });
        if (foundActive) { activeTrnId = foundActive.key; renderActiveTournament(foundActive); } 
        else { 
            els.trnLobbyArea.style.display = 'flex'; els.trnActiveArea.style.display = 'none'; 
            if(els.openTournamentsList && !els.openTournamentsList.innerHTML) {
                const li1 = document.createElement('li'); li1.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li1.textContent = "Nessun torneo aperto."; els.openTournamentsList.appendChild(li1);
            }
            if(els.pastTournamentsList && !els.pastTournamentsList.innerHTML) {
                const li2 = document.createElement('li'); li2.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li2.textContent = "Nessun torneo concluso."; els.pastTournamentsList.appendChild(li2);
            }
        }
    });
}
window.viewTournament = function(tId) { db.ref(`tournaments/${tId}`).once('value', snap => { if(snap.exists()) { activeTrnId = tId; renderActiveTournament(snap); els.trnLobbyArea.style.display = 'none'; els.trnActiveArea.style.display = 'flex'; } }); }
if(els.createTrnBtn) els.createTrnBtn.addEventListener('click', () => { if (!isTeamCaptain) return; const n = els.newTrnName.value.trim(); if(n) db.ref('tournaments').push().set({ name: n, hostId: myId, status: 'open', teams: { [myTeamId]: { name: myTeamName } }, standings: { [myTeamId]: { points: 0, name: myTeamName } } }); });
window.joinTournament = function(tId) { if (!isTeamCaptain) return; db.ref(`tournaments/${tId}/teams/${myTeamId}`).set({ name: myTeamName }); db.ref(`tournaments/${tId}/standings/${myTeamId}`).set({ points: 0, name: myTeamName }); }

function renderActiveTournament(trnSnap) {
    els.trnLobbyArea.style.display = 'none'; els.trnActiveArea.style.display = 'flex'; const trn = trnSnap.val(); if (!trn) return;
    const isFinished = trn.status === 'finished'; els.activeTrnTitle.textContent = trn.name + (isFinished ? (currentLang === 'it' ? " (Concluso)" : " (Finished)") : "");
    const amIHost = (trn.hostId === myId); els.editTrnNameBtn.style.display = (amIHost && !isFinished) ? 'block' : 'none'; els.leaveTrnBtn.style.display = (isTeamCaptain && !isFinished) ? 'block' : 'none';
    
    els.trnStandingsBody.innerHTML = ''; let std = Object.entries(trn.standings || {}).map(([id, data]) => ({ id, ...data })); std.sort((a,b) => b.points - a.points);
    std.forEach((s, idx) => {
        let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;
        const tr = document.createElement('tr'); const tdMed = document.createElement('td'); tdMed.textContent = med; const tdName = document.createElement('td'); const nameB = document.createElement('b'); nameB.textContent = s.name; tdName.appendChild(nameB);
        if (s.id === myTeamId) tdName.appendChild(document.createTextNode(" " + (currentLang === 'it' ? '(Voi)' : '(You)')));
        const tdPts = document.createElement('td'); const ptsB = document.createElement('b'); ptsB.textContent = s.points; tdPts.appendChild(ptsB);
        tr.appendChild(tdMed); tr.appendChild(tdName); tr.appendChild(tdPts); els.trnStandingsBody.appendChild(tr);
    });

    els.trnHostControls.style.display = (amIHost && !isFinished) ? 'block' : 'none';
    if (els.finishTrnBtn) { els.finishTrnBtn.style.display = (amIHost && trn.status === 'playing') ? 'block' : 'none'; els.finishTrnBtn.onclick = () => { if(confirm("Vuoi concludere manualmente il torneo?")) db.ref(`tournaments/${activeTrnId}/status`).set('finished'); }; }
    const teamCount = trn.teams ? Object.keys(trn.teams).length : 0; els.trnTeamCountTxt.textContent = (currentLang === 'it' ? "Squadre Iscritte: " : "Enrolled Teams: ") + teamCount;

    if (els.startTrnBtn) { els.startTrnBtn.disabled = teamCount < 2 || (trn.status !== 'open' && trn.status !== 'playing'); els.startTrnBtn.textContent = trn.status === 'playing' ? (currentLang === 'it' ? "Rigenera Tabellone (Attenzione!)" : "Regenerate Bracket (Warning!)") : (currentLang === 'it' ? "Genera Tabellone e Avvia" : "Generate Bracket and Start"); }
    
    els.trnBracketContainer.innerHTML = '';
    if (trn.status === 'open') {
        const waitP = document.createElement('p'); waitP.style.textAlign = 'center'; waitP.style.color = 'var(--hint-color)'; waitP.style.fontSize = '0.9em'; waitP.textContent = currentLang === 'it' ? "Il torneo è aperto, attendi l'avvio dall'organizzatore." : "The tournament is open, wait for the host to start."; els.trnBracketContainer.appendChild(waitP);
    } else if (trn.matches) {
        Object.entries(trn.matches).forEach(([mId, m]) => {
            const isMyMatch = (m.teamA === myTeamId || m.teamB === myTeamId); const card = document.createElement('div'); card.className = 'match-card';
            if (isMyMatch) { card.style.borderColor = "var(--champ-color)"; card.style.borderWidth = "2px"; }
            let aColor = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)"); let bColor = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
            
            const matchCardTeams = document.createElement('div'); matchCardTeams.className = "match-card-teams";
            const tA = document.createElement('div'); tA.style.color = aColor; const bA = document.createElement('b'); bA.textContent = m.teamAName; tA.appendChild(bA);
            const mVs = document.createElement('div'); mVs.className = "match-vs"; mVs.textContent = "VS";
            const tB = document.createElement('div'); tB.style.color = bColor; const bB = document.createElement('b'); bB.textContent = m.teamBName; tB.appendChild(bB);
            matchCardTeams.appendChild(tA); matchCardTeams.appendChild(mVs); matchCardTeams.appendChild(tB);
            card.appendChild(matchCardTeams);

            if (m.status !== 'finished') {
                const slotsDiv = document.createElement('div'); slotsDiv.style.display = 'flex'; slotsDiv.style.width = '100%'; slotsDiv.style.gap = '10px';
                const btnA = document.createElement('button'); btnA.className = 'slot-btn' + (m.playerA ? ' filled' : ''); btnA.textContent = m.playerA ? m.playerA.name : (currentLang === 'it' ? 'A: Libero' : 'A: Open'); btnA.onclick = () => window.toggleTrnSlot(mId, 'A', m.teamA);
                const btnB = document.createElement('button'); btnB.className = 'slot-btn' + (m.playerB ? ' filled' : ''); btnB.textContent = m.playerB ? m.playerB.name : (currentLang === 'it' ? 'B: Libero' : 'B: Open'); btnB.onclick = () => window.toggleTrnSlot(mId, 'B', m.teamB);
                slotsDiv.appendChild(btnA); slotsDiv.appendChild(btnB); card.appendChild(slotsDiv);
                if (m.playerA && m.playerB && (m.playerA.id === myId || m.playerB.id === myId)) {
                    const joinBtn = document.createElement('button'); joinBtn.className = 'btn-success'; joinBtn.style.fontSize = '0.85em'; joinBtn.style.padding = '6px'; joinBtn.style.marginTop = '8px'; joinBtn.textContent = currentLang === 'it' ? 'ENTRA NELLA SFIDA' : 'JOIN MATCH'; joinBtn.onclick = () => window.startTrnMatch(mId); card.appendChild(joinBtn);
                }
            } else { const finDiv = document.createElement('div'); finDiv.style.fontSize = '0.85em'; finDiv.style.color = '#4caf50'; finDiv.style.fontWeight = 'bold'; finDiv.style.marginTop = '5px'; finDiv.textContent = currentLang === 'it' ? 'Concluso' : 'Finished'; card.appendChild(finDiv); }
            els.trnBracketContainer.appendChild(card);
        });
    }
}
if(els.editTrnNameBtn) els.editTrnNameBtn.addEventListener('click', () => { let n = prompt("Nuovo nome:"); if (n && n.trim() !== "") db.ref(`tournaments/${activeTrnId}/name`).set(n.trim()); });
if(els.leaveTrnBtn) els.leaveTrnBtn.addEventListener('click', () => { if (!isTeamCaptain) return; if (confirm("Ritirare la squadra?")) { db.ref(`tournaments/${activeTrnId}/teams/${myTeamId}`).remove(); db.ref(`tournaments/${activeTrnId}/standings/${myTeamId}`).remove(); } });
if(els.deleteTrnBtn) els.deleteTrnBtn.addEventListener('click', () => { if(confirm("Eliminare definitivamente il torneo?")) db.ref(`tournaments/${activeTrnId}`).remove(); });
if(els.startTrnBtn) els.startTrnBtn.addEventListener('click', () => {
    if (!activeTrnId) return;
    db.ref(`tournaments/${activeTrnId}/teams`).once('value', snap => {
        let teams = []; snap.forEach(child => teams.push({ id: child.key, name: child.val().name }));
        if (teams.length < 2) return alert("Servono almeno 2 squadre per iniziare!");
        let matches = {}; let matchIndex = 1;
        for(let i=0; i<teams.length; i++) for(let j=i+1; j<teams.length; j++) matches[`m${matchIndex++}`] = { teamA: teams[i].id, teamAName: teams[i].name, teamB: teams[j].id, teamBName: teams[j].name, status: 'waiting' };
        db.ref(`tournaments/${activeTrnId}`).update({ status: 'playing', matches: matches }).then(() => showToast("Tabellone generato con successo!")).catch(err => alert("Errore: " + err.message));
    });
});
window.toggleTrnSlot = function(matchId, side, teamId) {
    if (teamId !== myTeamId) return alert("Non appartieni a questa squadra!");
    const slotRef = db.ref(`tournaments/${activeTrnId}/matches/${matchId}/player${side}`);
    slotRef.once('value', snap => { if (!snap.exists()) slotRef.set({ id: myId, name: myName }); else if (snap.val().id === myId) slotRef.remove(); else alert("Posto occupato da " + snap.val().name); });
}
window.startTrnMatch = function(matchId) {
    const rc = "TRN_" + matchId;
    db.ref(`rooms/${rc}`).once('value', s => {
        if (s.exists()) window.joinSpecificRoom(rc);
        else db.ref('rooms/' + rc).set({ status: 'waiting', type: 'multi', mode: 'pingpong', wpm: 20, tone: 600, wordCount: 20, fixedSpeed: false, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 1800000, hostId: myId }).then(() => window.joinSpecificRoom(rc));
    });
}

// --- ATTIVITÀ E MEDAGLIE ---
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0');
}

function updateActivity(won = false) {
    const now = new Date(); const dKey = now.toISOString().split('T')[0]; const wKey = getWeekNumber(now); const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    ['daily/'+dKey, 'weekly/'+wKey, 'monthly/'+mKey].forEach(path => {
        db.ref(`activity/${path}/${myId}`).transaction(data => {
            if (!data) return { name: myName, games: 1, wins: won ? 1 : 0, lastPlayed: firebase.database.ServerValue.TIMESTAMP };
            data.games = (data.games || 0) + 1; if (won) data.wins = (data.wins || 0) + 1; data.name = myName; data.lastPlayed = firebase.database.ServerValue.TIMESTAMP; return data;
        }).then(() => { if (path.startsWith('daily')) checkActivityAndAwardMedals(); });
    });
}

async function checkActivityAndAwardMedals() {
    const now = new Date(); const dKey = now.toISOString().split('T')[0]; const wKey = getWeekNumber(now); const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    try {
        const [dSnap, wSnap, mSnap, uMedals] = await Promise.all([ db.ref(`activity/daily/${dKey}/${myId}`).once('value'), db.ref(`activity/weekly/${wKey}/${myId}`).once('value'), db.ref(`activity/monthly/${mKey}/${myId}`).once('value'), db.ref(`users/${myId}/medals`).once('value') ]);
        const dData = dSnap.val() || { games: 0 }, wData = wSnap.val() || { games: 0 }, mData = mSnap.val() || { games: 0 };
        let myMedals = uMedals.val() || {};

        // 1. PULIZIA: Rimuove le medaglie scadute (reset giornaliero, settimanale, mensile)
        const validKeys = [dKey, wKey, mKey];
        for (let id in myMedals) {
            if (!validKeys.includes(myMedals[id].periodKey)) {
                await db.ref(`users/${myId}/medals/${id}`).remove();
                delete myMedals[id];
            }
        }

        // 2. ASSEGNAZIONE: Controlla e assegna le nuove medaglie
        const check = (count, thresh, id, title, desc, icon, pKey) => { 
            if (count >= thresh && (!myMedals[id] || myMedals[id].periodKey !== pKey)) { 
                awardMedal(id, title, desc, icon, pKey); 
                myMedals[id] = { periodKey: pKey };
                return true; 
            } 
            return false; 
        };

        check(dData.games, 3, 'd_bronze', "Bronzo Giornaliero", "Hai giocato 3 partite oggi!", "🥉", dKey); 
        check(dData.games, 7, 'd_silver', "Argento Giornaliero", "Sei un veterano! 7 partite oggi!", "🥈", dKey); 
        check(dData.games, 15, 'd_gold', "Oro Giornaliero", "Incredibile! 15 partite in un giorno!", "🥇", dKey);
        check(wData.games, 20, 'w_active', "Stakanovista Settimanale", "20 partite questa settimana!", "🎖️", wKey); 
        check(wData.games, 50, 'w_pro', "Campione Settimanale", "50 partite! Una leggenda questa settimana!", "🏆", wKey);
        check(mData.games, 150, 'm_legend', "Titano del Mese", "150 partite! Il gioco non ha segreti per te.", "💎", mKey);
    } catch(e) {}
    updateMedalGallery();
}

function awardMedal(id, title, desc, icon, periodKey) {
    db.ref(`users/${myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon, periodKey });
    els.overlayMedalIcon.textContent = icon; els.overlayMedalTitle.textContent = title; els.overlayMedalDesc.textContent = desc; els.medalOverlay.style.display = 'flex';
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle'; const now = audioCtx.currentTime; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8); osc.start(now); osc.stop(now + 0.8);
    updateMedalGallery();
}

function updateMedalGallery() {
    if (!els.myMedalsContainer) return;
    db.ref(`users/${myId}/medals`).once('value', snap => {
        if (!snap.exists()) return els.myMedalsContainer.innerHTML = '<span style="font-size:0.6em; color:var(--hint-color);">Nessuna medaglia.</span>';
        els.myMedalsContainer.innerHTML = '';
        Object.values(snap.val()).forEach(m => { const span = document.createElement('span'); span.textContent = m.icon; span.title = `${m.title} (${m.date})`; span.onclick = () => showToast(`${m.title} - ${m.date}`); span.style.cursor = "pointer"; els.myMedalsContainer.appendChild(span); });
    });
}

window.switchActTab = function(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab')); els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`].classList.add('active-tab');
    const now = new Date(); let key = period === 'daily' ? now.toISOString().split('T')[0] : period === 'weekly' ? getWeekNumber(now) : now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    els.actListTitle.textContent = period === 'daily' ? "I più attivi di Oggi" : period === 'weekly' ? "I più attivi della Settimana" : "I più attivi del Mese";
    renderActivityRankings(period, key); updateMedalGallery();
}

function renderActivityRankings(period, key) {
    els.activityRankList.innerHTML = '';
    const loadLi = document.createElement('li'); loadLi.style.cssText = "justify-content:center; color:var(--hint-color);"; loadLi.textContent = "Caricamento..."; els.activityRankList.appendChild(loadLi);
    
    db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = ''; let users = [];
        if (snap.exists()) snap.forEach(child => { const u = child.val(); if (u && typeof u === 'object') users.push({ id: child.key, ...u }); });
        users.sort((a, b) => (b.games || 0) - (a.games || 0)); users = users.slice(0, 50);
        if (users.length === 0) {
            const empLi = document.createElement('li'); empLi.style.cssText = "justify-content:center; color:var(--hint-color);"; empLi.textContent = "Nessuna attività registrata."; els.activityRankList.appendChild(empLi); return;
        }
        users.forEach((u, idx) => {
            let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;
            const li = document.createElement('li'); 
            const nameSpan = document.createElement('span'); nameSpan.appendChild(document.createTextNode(medal + " ")); const nameB = document.createElement('b'); nameB.textContent = u.name || "Anonimo"; nameSpan.appendChild(nameB);
            const statsSpan = document.createElement('span'); const gamesB = document.createElement('b'); gamesB.textContent = u.games || 0; statsSpan.appendChild(gamesB); statsSpan.appendChild(document.createTextNode(" part. "));
            const winsSmall = document.createElement('small'); winsSmall.style.color = '#4caf50'; winsSmall.textContent = `(${u.wins || 0} v.)`; statsSpan.appendChild(winsSmall);
            li.appendChild(nameSpan); li.appendChild(statsSpan); els.activityRankList.appendChild(li);
        });
    }).catch(err => { 
        els.activityRankList.innerHTML = ''; 
        const errLi = document.createElement('li'); errLi.style.cssText = "justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;";
        const eSpan = document.createElement('span'); eSpan.textContent = "Errore nel caricamento."; errLi.appendChild(eSpan);
        const eSmall = document.createElement('small'); eSmall.style.cssText = "font-size:0.7em; opacity:0.7;"; eSmall.textContent = err.message; errLi.appendChild(eSmall);
        els.activityRankList.appendChild(errLi);
    });
}

// --- LOGICA QUIZ ---
function startQuizSequence() {
    showScreen('quizArea'); gameRunning = true; lastLoadedQuizIndex = -1;
    els.quizWpmDisplay.textContent = `WPM: ${currentWpm}`; els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode && !isSinglePlayer) {
        if (listeners.quizState) db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState);
        listeners.quizState = db.ref(`rooms/${roomCode}/quiz_state`).on('value', snap => {
            const state = snap.val(); if (!state) return;
            const newIndex = state.questionIndex || 0;
            randomizedQuizQuestions = state.questionsOrder ? state.questionsOrder.map(idx => QUIZ_QUESTIONS[idx]) : QUIZ_QUESTIONS;
            if (newIndex !== lastLoadedQuizIndex) { lastLoadedQuizIndex = newIndex; quizQuestionIndex = newIndex; loadNextQuizQuestion(); }
            quizActiveBuzzerId = state.activeBuzzerId || null; renderQuizUI(state);
        });
        if (myId === roomHostId) db.ref(`rooms/${roomCode}/quiz_state`).set({ questionIndex: 0, activeBuzzerId: null, status: 'playing', questionsOrder: Array.from({length: QUIZ_QUESTIONS.length}, (_, i) => i).sort(() => Math.random() - 0.5) });
    } else { randomizedQuizQuestions = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5); quizQuestionIndex = 0; loadNextQuizQuestion(); }
}

function loadNextQuizQuestion() {
    if (quizQuestionIndex >= requestedWordCount || quizQuestionIndex >= randomizedQuizQuestions.length) return finishGame();
    currentQuizQuestion = randomizedQuizQuestions[quizQuestionIndex]; playQuizAudioSequence();
}

async function playQuizAudioSequence() {
    inputActive = false; disableQuizButtons(true);
    ['A', 'B', 'C', 'D'].forEach(l => { if(els['btnQuiz'+l]) els['btnQuiz'+l].classList.remove('active-choice'); });
    els.quizQuestionBox.textContent = "Ascolta la domanda...";
    await playMorseAudio(currentQuizQuestion.q, currentWpm);
    if (!gameRunning) return; await new Promise(r => setTimeout(r, 1500));
    
    for (let i = 0; i < 4; i++) {
        const letter = ["A", "B", "C", "D"][i];
        if (!gameRunning) return; els.quizQuestionBox.textContent = `Opzione ${letter}...`;
        if(els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.add('active-choice');
        await playMorseAudio(`${letter} ${currentQuizQuestion.a[i]}`, currentWpm);
        if(els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.remove('active-choice');
        if (!gameRunning) return; await new Promise(r => setTimeout(r, 1000));
    }
    if (!gameRunning) return;
    els.quizQuestionBox.textContent = "SCEGLI LA TUA RISPOSTA!"; enableQuizControls(); startQuizTimer(20);
}

function enableQuizControls() {
    inputActive = true;
    if (isSinglePlayer) disableQuizButtons(false);
    else { els.quizBuzzer.style.display = 'block'; els.quizOptionsContainer.style.opacity = '0.5'; disableQuizButtons(true); }
}
function disableQuizButtons(disabled) { ['A', 'B', 'C', 'D'].forEach(l => { if(els['btnQuiz'+l]) els['btnQuiz'+l].disabled = disabled; }); }
function startQuizTimer(seconds) {
    if (quizTimerInterval) clearInterval(quizTimerInterval); let timeLeft = 100;
    quizTimerInterval = setInterval(() => {
        timeLeft -= 100 / (seconds * 10); if(els.quizTimerProgress) els.quizTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) { clearInterval(quizTimerInterval); if (inputActive) { showToast("Tempo scaduto!"); if (isSinglePlayer || quizActiveBuzzerId === myId) submitQuizAnswer(-1); } }
    }, 100);
}

function submitQuizAnswer(index) {
    if (!isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) return;
    if (isSinglePlayer && !inputActive) return;
    if (quizTimerInterval) clearInterval(quizTimerInterval); inputActive = false; disableQuizButtons(true);
    
    if (index === currentQuizQuestion.correct) { totalScore += 100; showToast(`CORRETTO (${["A", "B", "C", "D"][index]})! +100`); }
    else showToast(`SBAGLIATO! Era la ${["A", "B", "C", "D"][currentQuizQuestion.correct]}`);
    els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wordIndex: quizQuestionIndex + 1 });
    
    setTimeout(() => {
        if (!gameRunning) return;
        if (roomCode && !isSinglePlayer) db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => { if (state && state.activeBuzzerId === myId) { state.questionIndex = (state.questionIndex || 0) + 1; state.activeBuzzerId = null; } return state; });
        else if (isSinglePlayer) { quizQuestionIndex++; loadNextQuizQuestion(); }
    }, 3000);
}

if(els.quizBuzzer) els.quizBuzzer.addEventListener('click', () => { if (roomCode && !isSinglePlayer && !quizActiveBuzzerId && inputActive) db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => { if (state && !state.activeBuzzerId) state.activeBuzzerId = myId; return state; }); });
for (let i = 0; i < 4; i++) {
    const l = ["A", "B", "C", "D"][i];
    if(els['btnQuiz'+l]) els['btnQuiz'+l].onclick = () => submitQuizAnswer(i);
    if(els['replay'+l]) els['replay'+l].onclick = () => { if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.a[i], currentWpm); };
}
if(els.quizReplayQ) els.quizReplayQ.onclick = () => { if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.q, currentWpm); };
if(els.quitQuizBtn) els.quitQuizBtn.onclick = () => { if (confirm("Vuoi abbandonare il Quiz?")) { if(quizTimerInterval) clearInterval(quizTimerInterval); gameRunning = false; exitRoomCleanly(); } };

function renderQuizUI(state) {
    if (state.activeBuzzerId) {
        els.quizBuzzer.style.display = 'none';
        if (state.activeBuzzerId === myId) { els.buzzerWinner.textContent = "TOCCA A TE!"; els.quizOptionsContainer.style.opacity = '1'; disableQuizButtons(false); }
        else { els.buzzerWinner.textContent = "L'AVVERSARIO RISPONDE..."; els.quizOptionsContainer.style.opacity = '0.5'; disableQuizButtons(true); }
    } else {
        els.buzzerWinner.textContent = ""; els.quizBuzzer.style.display = inputActive ? 'block' : 'none'; els.quizOptionsContainer.style.opacity = '0.5'; disableQuizButtons(true);
    }
}
