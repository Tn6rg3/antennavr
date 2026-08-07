// ============================================================================
// APP.JS - PARTE 1 DI 2
// INIZIALIZZAZIONE, STATO GLOBALE, AUDIO MORSE, CHAT, LOBBY E STANZE
// ============================================================================

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260807.207";

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
const FALLBACK_WORDS_IT = [
    "RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA", "BATTAGLIA", "STAZIONE", 
    "AMICIZIA", "FREQUENZA", "MESSAGGIO", "ASCOLTO", "TRASMISSIONE", "CIRCUITO", "OPERATORE"
];
const FALLBACK_WORDS_EN = [
    "RADIO", "MORSE", "TELEGRAPH", "SIGNAL", "ANTENNA", "BATTLE", "STATION", 
    "FRIENDSHIP", "FREQUENCY", "MESSAGE", "LISTENING", "TRANSMISSION", "CIRCUIT", "OPERATOR"
];

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
async function loadRegolamento() {
    if (!els.regolamentoContainer) return;
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error("File regolamento non trovato");
        els.regolamentoContainer.innerHTML = await response.text();
        
        // Riattiva il bottone feedback se presente all'interno dell'HTML caricato
        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = function() {
                const text = encodeURIComponent("💡 Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
                const shareUrl = `https://t.me/share/url?text=${text}`;
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(shareUrl);
                } else {
                    window.open(shareUrl, '_blank');
                }
            };
        }
    } catch (e) {
        // Fallback di sicurezza in caso di errore di rete o file mancante
        els.regolamentoContainer.innerHTML = `
            <div style="text-align:center; padding: 15px;">
                <h3 style="color: var(--champ-color); margin-top:0;">📜 Regole di Gioco</h3>
                <p style="font-size:0.9em;">Decodifica il codice Morse nel minor tempo possibile e scala le classifiche!</p>
                <ul style="text-align:left; font-size:0.85em; color: var(--text-color); margin-top:10px;">
                    <li><b>Parole Comuni & Nominativi:</b> Più sei veloce e preciso, più punti ottieni.</li>
                    <li><b>Conquista (Co-op):</b> Collabora con la tua squadra per portare la barra al 100%.</li>
                    <li><b>Battaglia Serale:</b> Ogni giorno alle 21:30 ad eliminazione diretta (3 vite).</li>
                </ul>
                <hr style="border:0; border-top:1px dashed var(--hint-color); margin:15px 0;">
                <p style="font-size:0.75em; color:var(--hint-color);">
                    <i>Nota: Impossibile caricare il file regolamento.html esteso (${e.message}).</i>
                </p>
            </div>
        `;
    }
}


// --- MORSE ENGINE CON ARRESTO ANTISOVRAPPOSIZIONE UNIFICATO ---
const morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--','?': '..--..' 
};

window.activeOscillators = window.activeOscillators || [];
window.morsePlayToken = 0;

function stopAllMorseAudio() {
    window.morsePlayToken++;
    if (window.activeOscillators && window.activeOscillators.length > 0) {
        window.activeOscillators.forEach(osc => {
            try { 
                osc.stop(); 
                osc.disconnect(); 
            } catch(e) {}
        });
        window.activeOscillators = [];
    }
}

function playBeep(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const osc = audioCtx.createOscillator(); 
        const gain = audioCtx.createGain();
        osc.frequency.value = freq; 
        osc.connect(gain); 
        gain.connect(audioCtx.destination);
        const time = audioCtx.currentTime;
        gain.gain.setValueAtTime(0, time); 
        gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
        gain.gain.setValueAtTime(0.5, time + duration - 0.005); 
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.start(time); 
        osc.stop(time + duration);
    } catch(e) {}
}

function playNotificationSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playBeep(880, 0.08);
    setTimeout(() => playBeep(1100, 0.1), 120);
}

// DEFINIZIONE UNICA DI playMorseAudio
function playMorseAudio(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (!forcePlay && !gameRunning && !brIsPlaying) { resolve(); return; }

        stopAllMorseAudio();
        const currentToken = window.morsePlayToken;

        let charUnit = 1.2 / wpm;
        let effSpaceWpm = (window.charSpaceWpm && window.charSpaceWpm < wpm) ? window.charSpaceWpm : wpm;
        let spaceUnit = 1.2 / effSpaceWpm;
        let wordMult = window.wordSpaceMult || 1.0;

        let time = audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !brIsPlaying)) break;
            
            if (morseDict[char]) {
                for (let i = 0; i < morseDict[char].length; i++) {
                    if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !brIsPlaying)) break;
                    let symbol = morseDict[char][i];
                    
                    const osc = audioCtx.createOscillator(); 
                    const gain = audioCtx.createGain();
                    osc.frequency.value = currentTone; 
                    osc.connect(gain); 
                    gain.connect(audioCtx.destination);
                    
                    const duration = (symbol === '-') ? (3 * charUnit) : charUnit;
                    
                    gain.gain.setValueAtTime(0, time); 
                    gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
                    gain.gain.setValueAtTime(0.5, time + duration - 0.005); 
                    gain.gain.linearRampToValueAtTime(0, time + duration);
                    
                    osc.start(time); 
                    osc.stop(time + duration);
                    window.activeOscillators.push(osc);
                    
                    time += duration;
                    if (i < morseDict[char].length - 1) time += charUnit;
                }
                time += (3 * spaceUnit);
            } else if (char === ' ') {
                let totalWordSpace = (7 * spaceUnit) * wordMult;
                let remainingSpace = totalWordSpace - (3 * spaceUnit);
                time += Math.max(0, remainingSpace);
            }
        }
        setTimeout(() => {
            if (currentToken === window.morsePlayToken) resolve();
        }, Math.max(0, (time - audioCtx.currentTime) * 1000));
    });
}

// --- PRNG E SHUFFLE PER SFIDA GIORNALIERA ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function getDailyWords(num) {
    let todayStr = new Date().toISOString().split('T')[0];
    let seed = parseInt(todayStr.replace(/-/g, ''));
    let prng = mulberry32(seed);
    let dict = [...masterDictionary];
    for (let i = dict.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [dict[i], dict[j]] = [dict[j], dict[i]];
    }
    return dict.slice(0, num).map(w => w.toUpperCase());
}

function getGameWords(num, mode) {
    if (mode === 'daily_challenge') return getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: masterDictionary, custom: customDictionary });
    }
    return fisherYatesShuffle(masterDictionary).slice(0, num).map(w => w.toUpperCase());
}

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
function showScreen(screenId) {
    clearAllTimers();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');

    hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';

    const isPlayingScreen = ['lobbyScreen', 'gameArea', 'countdownScreen', 'quizArea', 'brScreen'].includes(screenId);

    if (db && myId) {
        try {
            db.ref(`presence/${myId}`).update({ status: isPlayingScreen ? 'playing' : 'online' });
        } catch(e) {}
    }

    if (screenId === 'setupScreen') {
        const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
        if (!lastRoom && els.rejoinContainer) {
            els.rejoinContainer.style.display = 'none';
        } else if (lastRoom && els.rejoinContainer) {
            els.rejoinContainer.style.display = 'block';
            if (els.rejoinGameBtn) {
                els.rejoinGameBtn.onclick = () => {
                    roomCode = lastRoom;
                    isRejoining = true;
                    joinRoomLogic(false);
                };
            }
        }
        
        listenToOnlineUsers();
        listenToRooms();
    } else {
        if (listeners.presence && listeners.presence.ref) {
            listeners.presence.ref.off('child_added', listeners.presence.onAdded);
            listeners.presence.ref.off('child_changed', listeners.presence.onChanged);
            listeners.presence.ref.off('child_removed', listeners.presence.onRemoved);
            listeners.presence = null;
        }
        if (listeners.roomsList && listeners.roomsList.ref) {
            listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
            listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
            listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
            listeners.roomsList = null;
        }
    }

    if (isPlayingScreen) {
        if (listeners.activeChat['chatMessages']) {
            listeners.activeChat['chatMessages'].ref.off('value', listeners.activeChat['chatMessages'].callback);
            delete listeners.activeChat['chatMessages'];
        }
        if (screenId === 'lobbyScreen' || screenId === 'gameArea') {
            activeChatContext = 'room';
            listenToChat();
        } else {
            activeChatContext = null;
        }
    } else if (screenId === 'teamsScreen') {
        activeChatContext = 'team';
        checkMyTeamStatus();
    } else {
        if (screenId === 'participationScreen') { switchActTab('daily'); }
        if (activeChatContext !== 'global') {
            activeChatContext = 'global';
            listenToChat();
        }
    }
}

window.goBackToMenu = function() {
    if (activeChatContext !== 'team') hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';
    if (els.inviteModal) els.inviteModal.style.display = 'none';
    
    showScreen('setupScreen');
};

// --- CHAT GLOBALE E DI STANZA ---
function hideChat() {
    if (els.chatDrawer) els.chatDrawer.style.display = 'none'; 
    isChatDrawerOpen = false;
    chatCwAudioQueue = [];
    Object.keys(listeners.activeChat).forEach(key => { 
        if (listeners.activeChat[key] && listeners.activeChat[key].ref) {
            listeners.activeChat[key].ref.off('value', listeners.activeChat[key].callback); 
        }
        delete listeners.activeChat[key]; 
    });
}

function listenToChat() {
    if (activeChatContext === 'room' && roomCode) {
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null); 
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
        if (els.chatTitle) els.chatTitle.textContent = "💬 Chat Stanza";
        if (els.gameArea && els.gameArea.classList.contains('active-screen')) { 
            els.chatDrawer.style.display = 'none'; 
            isChatDrawerOpen = false; 
        }
    } else {
        setupChat(db.ref('globalChat'), 'chatMessages', null); 
        if (els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
}

window.openGlobalChat = function() { 
    activeChatContext = 'global'; 
    listenToChat(); 
    toggleChat(); 
};

window.toggleChat = function() {
    if (!els.chatDrawer) return;
    if (els.chatDrawer.style.display === 'none') {
        els.chatDrawer.style.display = 'flex'; 
        isChatDrawerOpen = true;
        if (els.chatMessages) els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    } else { 
        els.chatDrawer.style.display = 'none'; 
        isChatDrawerOpen = false; 
    }
};

function enqueueChatCwAudio(text) {
    if (!text || !isChatCwEnabled) return;
    if (chatCwAudioQueue.length < 10) {
        chatCwAudioQueue.push(text.toUpperCase());
        processChatCwQueue();
    }
}

async function processChatCwQueue() {
    if (isChatCwPlaying || chatCwAudioQueue.length === 0) return;
    isChatCwPlaying = true;
    while (chatCwAudioQueue.length > 0 && isChatCwEnabled) {
        const nextText = chatCwAudioQueue.shift();
        const savedTone = currentTone;
        currentTone = chatCwTone;
        try {
            await playMorseAudio(nextText, chatCwWpm, true);
        } catch (e) {
            console.error("Errore riproduzione Morse in chat:", e);
        } finally {
            currentTone = savedTone;
        }
        if (chatCwAudioQueue.length > 0 && isChatCwEnabled) {
            await new Promise(r => setTimeout(r, 600));
        }
    }
    isChatCwPlaying = false;
}



// ============================================================================
// MODULO CHAT UNIFICATO (SETUP + INVIO MESSAGGI + FIX AUDIO DOPPIO)
// ============================================================================

function setupChat(chatRef, containerId, alertBtnId) {
    const container = els[containerId]; 
    if (!container) return;
    
    if (listeners.activeChat[containerId] && listeners.activeChat[containerId].ref) {
        listeners.activeChat[containerId].ref.off('value', listeners.activeChat[containerId].callback);
    }
    
    let initialLoad = true, lastTs = Date.now();
    
    const callback = chatRef.limitToLast(10).on('value', snapshot => {
        container.innerHTML = ''; 
        let newMsgsCount = 0, latestMsg = null, latestMsgKey = null, maxTs = lastTs;
        
        snapshot.forEach(child => {
            const msg = child.val(); 
            const div = document.createElement('div'); 
            div.style.marginBottom = '6px';
            
            if (msg.ts) {
                const d = new Date(msg.ts); 
                const dateSmall = document.createElement('small');
                dateSmall.style.color = 'var(--hint-color)'; 
                dateSmall.style.fontSize = '0.75em';
                dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                div.appendChild(dateSmall); 
                if (msg.ts > maxTs) maxTs = msg.ts;
            }
            
            const nameB = document.createElement('b'); 
            nameB.style.color = 'var(--link-color)'; 
            nameB.textContent = msg.name + ": ";
            div.appendChild(nameB);
            
            const textSpan = document.createElement('span');
            if (isChatCwEnabled) {
                textSpan.className = 'cw-spoiler';
                textSpan.textContent = msg.text;
                textSpan.title = "Clicca per svelare il testo";
                textSpan.onclick = function() {
                    this.classList.toggle('revealed');
                };
            } else {
                textSpan.textContent = msg.text;
            }
            div.appendChild(textSpan);
            
            container.appendChild(div);
            if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) { 
                newMsgsCount++; 
                latestMsg = msg; 
                latestMsgKey = child.key;
            }
        });
        
        lastTs = maxTs; 
        container.scrollTop = container.scrollHeight;
        
        if (!initialLoad && newMsgsCount > 0 && latestMsg) {
            if (alertBtnId && !isChatDrawerOpen && els[alertBtnId]) {
                els[alertBtnId].style.backgroundColor = '#4caf50';
            }

            // Controllo sicuro anti-crash per capire se il gioco o la BR sono attivi
            const isPlayingBR = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
            const isGlobal = (chatRef.key === 'globalChat');
            const shouldNotify = isGlobal
                ? (!isGlobalChatMuted && !gameRunning && !isPlayingBR && (!isChatDrawerOpen || activeChatContext !== 'global'))
                : (!isChatDrawerOpen || chatRef.key !== (activeChatContext === 'room' ? roomCode : myTeamId));

            if (isChatCwEnabled) {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: [📻 Messaggio CW...]`);
                }
                if (!gameRunning && !isPlayingBR && (shouldNotify || (isChatDrawerOpen && activeChatContext === (isGlobal ? 'global' : 'room')))) {
                    if (latestMsgKey && latestMsgKey !== window.lastPlayedCwMsgKey) {
                        window.lastPlayedCwMsgKey = latestMsgKey;
                        enqueueChatCwAudio(latestMsg.text);
                    }
                }
            } else {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
                    if (!isGlobalChatMuted && typeof playNotificationSound === 'function') {
                        playNotificationSound();
                    }
                }
            }
        }
        initialLoad = false;
    });
    listeners.activeChat[containerId] = { ref: chatRef, callback: callback };
}

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
function renderOrUpdateUserListItem(userId, u) {
    if (!els.onlineUsersList || userId === myId) return;

    let li = document.getElementById(`user_list_item_${userId}`);
    if (!li) {
        li = document.createElement('li');
        li.id = `user_list_item_${userId}`;
        els.onlineUsersList.appendChild(li);
        const emptyMsg = els.onlineUsersList.querySelector('.empty-users-msg');
        if (emptyMsg) emptyMsg.remove();
    }

    li.innerHTML = '';

    const isWaiting = (isChallenging && currentInviterId === userId);
    const isPlaying = (u.status === 'playing');
    const canSpectate = (isPlaying && u.allowSpectators && u.activeRoomCode);

    const leftSpan = document.createElement('span');
    const nameB = document.createElement('b');
    nameB.textContent = u.name;
    nameB.style.cursor = 'pointer';
    nameB.style.color = 'var(--link-color)';
    nameB.style.textDecoration = 'underline';
    nameB.onclick = () => openTeamInviteModal(userId, u.name);
    leftSpan.appendChild(nameB);
    leftSpan.appendChild(document.createElement('br'));

    const statusSmall = document.createElement('small');
    statusSmall.textContent = canSpectate ? "🟡 In Partita (Osservabile)" : (isPlaying ? "🟡 In Partita" : "🟢 Online");
    leftSpan.appendChild(statusSmall);

    const btn = document.createElement('button');

    if (canSpectate) {
        btn.className = "action-btn-small";
        btn.style.backgroundColor = "#fbc02d";
        btn.style.color = "#000";
        btn.style.fontWeight = "bold";
        btn.textContent = "👁️ Osserva";
        btn.onclick = () => window.watchSpecificRoom(u.activeRoomCode, u.name);
    } else if (isPlaying) {
        btn.className = "action-btn-small btn-secondary";
        btn.disabled = true;
        btn.textContent = "In partita";
    } else {
        btn.className = `action-btn-small ${isWaiting ? 'btn-danger' : 'btn-success'}`;
        if (isChallenging && !isWaiting) btn.disabled = true;
        btn.textContent = isWaiting ? 'In Attesa...' : 'Sfida';
        btn.onclick = () => openInviteModal(userId, u.name);
    }

    li.appendChild(leftSpan);
    li.appendChild(btn);
}

function removeUserListItem(userId) {
    if (!els.onlineUsersList) return;
    const li = document.getElementById(`user_list_item_${userId}`);
    if (li) li.remove();

    if (els.onlineUsersList.children.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-users-msg';
        emptyLi.style.cssText = "justify-content:center; color:var(--hint-color); background:none; border:none;";
        emptyLi.textContent = "Sei solo.";
        els.onlineUsersList.appendChild(emptyLi);
    }
}

function listenToOnlineUsers() {
    if (listeners.presence) return;

    if (els.onlineUsersList) els.onlineUsersList.innerHTML = '';
    const presenceRef = db.ref('presence').limitToLast(50);

    const onAdded = presenceRef.on('child_added', snap => {
        if (snap.key !== myId) renderOrUpdateUserListItem(snap.key, snap.val());
    });

    const onChanged = presenceRef.on('child_changed', snap => {
        if (snap.key !== myId) renderOrUpdateUserListItem(snap.key, snap.val());
    });

    const onRemoved = presenceRef.on('child_removed', snap => {
        removeUserListItem(snap.key);
    });

    listeners.presence = { ref: presenceRef, onAdded, onChanged, onRemoved };
}

// --- MODALI INVITO E SFIDE ---
window.openInviteModal = function(targetId, targetName) {
    currentInviterId = targetId; 
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Sfida " + targetName; 
    if (els.inviteModalText) els.inviteModalText.textContent = "Scegli le impostazioni per la sfida:"; 
    if (els.inviteSettings) els.inviteSettings.style.display = 'block'; 
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none'; 
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none'; 
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none'; 
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'block'; 
    if (els.inviteModal) els.inviteModal.style.display = 'flex';
};

window.openTeamInviteModal = async function(targetId, targetName) {
    currentInviterId = targetId; 
    if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Recluta " + targetName; 
    if (els.recruitmentStatusText) els.recruitmentStatusText.textContent = "Caricamento stato..."; 
    if (els.inviteSettings) els.inviteSettings.style.display = 'none'; 
    if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'block'; 
    if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none'; 
    if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none'; 
    if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none'; 
    if (els.recruitJoinBtn) els.recruitJoinBtn.style.display = 'none';
    
    try {
        const teamsSnap = await db.ref('teams').once('value'); 
        let tName = null, inTeam = false;
        teamsSnap.forEach(tSnap => { 
            const t = tSnap.val(); 
            if (t.status !== 'retired' && t.members && t.members[targetId]) { 
                inTeam = true; 
                tName = t.name; 
            } 
        });
        
        if (els.recruitmentStatusText) {
            els.recruitmentStatusText.innerHTML = "";
            if (inTeam) {
                els.recruitmentStatusText.appendChild(document.createTextNode("⚠️ "));
                const b1 = document.createElement('b'); b1.textContent = targetName; els.recruitmentStatusText.appendChild(b1);
                els.recruitmentStatusText.appendChild(document.createTextNode(" fa già parte della squadra "));
                const b2 = document.createElement('b'); b2.textContent = tName; els.recruitmentStatusText.appendChild(b2);
                els.recruitmentStatusText.appendChild(document.createTextNode("."));
                if (els.recruitCreateBtn) els.recruitCreateBtn.style.display = 'none'; 
            } else {
                els.recruitmentStatusText.appendChild(document.createTextNode("💡 "));
                const b1 = document.createElement('b'); b1.textContent = targetName; els.recruitmentStatusText.appendChild(b1);
                els.recruitmentStatusText.appendChild(document.createTextNode(" non ha ancora una squadra."));
                if (els.recruitCreateBtn) els.recruitCreateBtn.style.display = 'block'; 
                if (myTeamId && els.recruitJoinBtn) els.recruitJoinBtn.style.display = 'block'; 
            }
        }
        
        if (els.recruitJoinBtn) els.recruitJoinBtn.onclick = () => sendRecruitmentInvite('team'); 
        if (els.recruitCreateBtn) els.recruitCreateBtn.onclick = () => sendRecruitmentInvite('suggest');
        if (els.recruitMsgBtn) {
            els.recruitMsgBtn.onclick = () => { 
                db.ref(`presence/${targetId}`).once('value', s => { 
                    const u = s.val(); 
                    if (u && u.username && String(u.username).trim() !== "") {
                        tg.openTelegramLink('https://t.me/' + u.username); 
                    } else {
                        tg.showAlert("Nessun username pubblico."); 
                    }
                }); 
            };
        }
    } catch(e) {} 
    
    if (els.inviteModal) els.inviteModal.style.display = 'flex';
};

function sendRecruitmentInvite(type) {
    db.ref(`invites/${currentInviterId}`).set({ 
        fromId: myId, 
        fromName: myName, 
        type: 'team', 
        ts: firebase.database.ServerValue.TIMESTAMP, 
        teamId: type === 'team' ? myTeamId : null, 
        teamName: type === 'team' ? myTeamName : null 
    }).then(() => { 
        showToast("Invito inviato!"); 
        window.closeInviteModal(); 
    });
}

window.closeInviteModal = function() { 
    if (els.inviteModal) els.inviteModal.style.display = 'none'; 
    currentInviterId = null; 
};

if (els.sendInviteBtn) {
    els.sendInviteBtn.addEventListener('click', () => {
        if (isChallenging) return; 
        isChallenging = true; 
        const tId = currentInviterId;

        db.ref(`invites/${tId}`).set({ 
            fromId: myId, 
            fromName: myName, 
            mode: els.inviteModeInput ? els.inviteModeInput.value : 'standard', 
            wpm: parseInt(els.inviteWpmInput ? els.inviteWpmInput.value : 20), 
            wordCount: parseInt(els.inviteWordCountInput ? els.inviteWordCountInput.value : 10), 
            ts: firebase.database.ServerValue.TIMESTAMP, 
            status: 'pending' 
        }).then(() => {
            showToast("Invito inviato! In attesa..."); 
            if (els.inviteModal) els.inviteModal.style.display = 'none';

            db.ref(`presence/${tId}`).once('value', s => {
                if (s.exists()) renderOrUpdateUserListItem(tId, s.val());
            });

            try {
                db.ref(`presence/${myId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);
            } catch(e) {}

            if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);
            
            listeners.outgoingInvite = db.ref(`invites/${tId}`).on('value', snap => { 
                if (!snap.exists() && isChallenging) {
                    setTimeout(() => { 
                        if (isChallenging) { 
                            showToast("Rifiutato o scaduto."); 
                            isChallenging = false; 
                            currentInviterId = null; 

                            db.ref(`presence/${tId}`).once('value', s => {
                                if (s.exists()) renderOrUpdateUserListItem(tId, s.val());
                            });

                            try {
                                db.ref(`presence/${myId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);
                            } catch(e) {}

                            if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite); 
                        } 
                    }, 1000);
                }
            });
        });
    });
}

function listenToInvites() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val(); 
        if (!inv || roomCode || gameRunning) return;
        if (Date.now() - inv.ts > 60000) return db.ref(`invites/${myId}`).remove();
        
        if (els.inviteModalText) els.inviteModalText.innerHTML = '';

        if (inv.type === 'team') {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = inv.teamId ? "🚀 INVITO SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
            if (els.inviteModalText) {
                if (inv.teamId) {
                    els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti ha invitato ad unirti alla squadra "));
                    const bTeam = document.createElement('b'); bTeam.textContent = inv.teamName; els.inviteModalText.appendChild(bTeam);
                    els.inviteModalText.appendChild(document.createTextNode("."));
                } else {
                    els.inviteModalText.appendChild(document.createTextNode(inv.fromName + " ti suggerisce di creare una tua squadra!"));
                }
            }
            
            if (els.inviteSettings) els.inviteSettings.style.display = 'none'; 
            if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none'; 
            if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none'; 
            if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'block'; 
            if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';

            if (els.acceptTeamInviteBtn) {
                els.acceptTeamInviteBtn.textContent = inv.teamId ? "UNISCITI ✅" : "VAI ALLA CREAZIONE 🛠️"; 
                els.acceptTeamInviteBtn.onclick = () => { 
                    db.ref(`invites/${myId}`).remove(); 
                    window.closeInviteModal(); 
                    if (inv.teamId) window.joinTeam(inv.teamId); 
                    else showScreen('teamsScreen'); 
                };
            }
        } else {
            if (els.inviteModalTitle) els.inviteModalTitle.textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();
            if (els.inviteModalText) {
                els.inviteModalText.appendChild(document.createTextNode("Ti ha invitato a giocare:"));
                els.inviteModalText.appendChild(document.createElement('br'));
                const bMode = document.createElement('b'); bMode.textContent = inv.mode.toUpperCase(); els.inviteModalText.appendChild(bMode);
                els.inviteModalText.appendChild(document.createTextNode(" a "));
                const bWpm = document.createElement('b'); bWpm.textContent = inv.wpm; els.inviteModalText.appendChild(bWpm);
                els.inviteModalText.appendChild(document.createTextNode(" WPM ("));
                const bCount = document.createElement('b'); bCount.textContent = inv.wordCount; els.inviteModalText.appendChild(bCount);
                els.inviteModalText.appendChild(document.createTextNode(" test)."));
            }
            
            if (els.inviteSettings) els.inviteSettings.style.display = 'none'; 
            if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'none'; 
            if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'block'; 
            if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none'; 
            if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
        }

        if (els.inviteModal) els.inviteModal.style.display = 'flex'; 
        currentInviterId = inv.fromId; 
        window.lastIncomingInvite = inv;
    });
}

if (els.declineTeamInviteBtn) {
    els.declineTeamInviteBtn.addEventListener('click', () => { 
        db.ref(`invites/${myId}`).remove(); 
        window.closeInviteModal(); 
    });
}

if (els.declineInviteBtn) {
    els.declineInviteBtn.addEventListener('click', () => { 
        db.ref(`invites/${myId}`).remove(); 
        window.closeInviteModal(); 
    });
}

if (els.acceptInviteBtn) {
    els.acceptInviteBtn.addEventListener('click', () => {
        const inv = window.lastIncomingInvite; 
        if (!inv) return;
        
        db.ref(`invites/${myId}`).remove(); 
        window.closeInviteModal(); 
        
        const rCode = Math.floor(1000 + Math.random() * 9000).toString();
        
        db.ref(`rooms/${rCode}`).set({ 
            status: 'waiting', 
            type: 'multi', 
            mode: inv.mode, 
            wpm: inv.wpm, 
            tone: 600, 
            wordCount: inv.wordCount, 
            words: getGameWords(inv.wordCount, inv.mode), 
            createdAt: firebase.database.ServerValue.TIMESTAMP, 
            expiresAt: Date.now() + 600000, 
            hostId: inv.fromId 
        }).then(() => { 
            db.ref(`public_lobby_rooms/${rCode}`).set({ 
                mode: inv.mode, 
                pCount: 1, 
                wpm: inv.wpm, 
                wordCount: inv.wordCount, 
                status: 'waiting', 
                expiresAt: Date.now() + 600000 
            });
            db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode }); 
            roomCode = rCode; 
            joinRoomLogic(false); 
        });
    });
}

function listenToInviteAccepted() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => { 
        const d = snap.val(); 
        if (d && d.roomCode) { 
            db.ref(`invite_accepted/${myId}`).remove(); 
            isChallenging = false; 
            window.closeInviteModal(); 
            roomCode = d.roomCode; 
            joinRoomLogic(false); 
        } 
    });
}

// --- USCITA PULITA DALLA STANZA ---
function exitRoomCleanly(roomWasDeletedByHost = false, isExplicitQuit = false) {
    clearAllTimers();
    
    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }

    let targetScreen = 'setupScreen'; 
    const amIHost = (myId === roomHostId); 

    // --- SPEGNIMENTO DI TUTTI I LISTENER (INCLUSO CO-OP) ---
    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (listeners.pingPong && roomCode) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (roomCode) { db.ref(`rooms/${roomCode}/coop_state`).off(); } // <-- AGGIUNTO SPEGNIMENTO CO-OP!
    
    // --- RESET DELLO STATO E DELL'INTERFACCIA ---
    isCoopMode = false;
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        localStorage.removeItem(STORAGE_ROOM_KEY);

        if (roomWasDeletedByHost) {
            if (amIHost && !roomCode.startsWith("TRN_")) {
                db.ref(`rooms/${roomCode}`).remove();
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            } else {
                db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
                db.ref(`rooms/${roomCode}/players/${myId}`).remove();
            }
            roomCode = "";
        }
        else if (isExplicitQuit) {
            db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
            db.ref(`rooms/${roomCode}/players/${myId}`).remove();
            roomCode = "";
        }
        else {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({ online: false });
        }
    } else { 
        if (listeners.room) { listeners.room.off(); listeners.room = null; } 
    }
    
    db.ref(`presence/${myId}`).update({
        allowSpectators: false,
        activeRoomCode: null,
        status: 'online'
    });

    hideChat(); 
    showScreen(targetScreen);
    
    if (targetScreen === 'setupScreen') {
        listenToRooms();
    }
}

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
if (els.createRoomBtn) {
    els.createRoomBtn.addEventListener('click', () => {
        const gameType = els.gameTypeInput.value, gameMode = els.gameModeInput.value;
        if (gameType === 'tournament') { 
            showScreen('teamsScreen'); 
            if (gameMode === 'trn_create_team') switchTeamTab('gest'); 
            else if (gameMode === 'trn_join_team') switchTeamTab('allteams'); 
            else if (gameMode === 'trn_create_trn') switchTeamTab('tournaments'); 
            return; 
        }
        if (gameMode === 'custom' && customDictionary.length === 0) { 
            els.customDictModal.style.display = 'flex'; 
            return showToast("Carica prima un file di testo!"); 
        }

        isChallenging = false; 
        if (currentInviterId) {
            db.ref(`invites/${currentInviterId}`).once('value', s => { 
                if (s.exists() && s.val().fromId === myId) db.ref(`invites/${currentInviterId}`).remove(); 
            });
        }
        db.ref(`invite_accepted/${myId}`).remove(); 

        currentMode = gameMode || 'standard'; 
        isSinglePlayer = (gameType === 'single'); 
        const allowSpectators = (isSinglePlayer && els.allowSpectatorsCheckbox?.checked) || false;

        currentWpm = currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20); 
        baseWpm = currentWpm; 
        requestedWordCount = currentMode === 'callsign' ? 25 : Math.min(200, Math.max(1, parseInt(els.wordCountInput?.value) || 10)); 
        currentTone = parseInt(els.toneInput?.value) || 600; 
        isFixedSpeed = els.fixedSpeedCheckbox?.checked || false; 
        isEasyMode = els.easyModeCheckbox?.checked || false;
        
        let cSpace = isSinglePlayer && (els.charSpaceInput && els.charSpaceInput.value) ? (parseInt(els.charSpaceInput.value) || currentWpm) : currentWpm;
        let wSpace = isSinglePlayer && (els.wordSpaceSelect && els.wordSpaceSelect.value) ? (parseFloat(els.wordSpaceSelect.value) || 1.0) : 1.0;
        window.charSpaceWpm = cSpace;
        window.wordSpaceMult = wSpace;

        roomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
        gameWords = getGameWords(requestedWordCount, currentMode);
        
        if (!gameWords || gameWords.length === 0) {
            const dict = (masterDictionary && masterDictionary.length > 0) ? masterDictionary : ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA"];
            gameWords = fisherYatesShuffle(dict).slice(0, requestedWordCount).map(w => w.toUpperCase());
        }

        const timerMinutes = parseInt(els.roomTimerInput?.value) || 5;
        const expiresTimestamp = isSinglePlayer ? null : Date.now() + (timerMinutes * 60000);

        db.ref('rooms/' + roomCode).set({ 
            status: isSinglePlayer ? 'countdown' : 'waiting', 
            type: isSinglePlayer ? 'single' : (gameType === 'coop' ? 'coop' : 'multi'), 
            mode: currentMode, 
            wpm: currentWpm, 
            tone: currentTone, 
            wordCount: requestedWordCount, 
            words: gameWords, 
            fixedSpeed: isFixedSpeed, 
            charSpaceWpm: cSpace,
            wordSpaceMult: wSpace,
            createdAt: firebase.database.ServerValue.TIMESTAMP, 
            expiresAt: expiresTimestamp, 
            hostId: myId || "anon" 
        }).then(() => {
            if (!isSinglePlayer) {
                db.ref(`public_lobby_rooms/${roomCode}`).set({
                    mode: currentMode,
                    type: gameType === 'coop' ? 'coop' : 'multi',
                    pCount: 1,
                    wpm: currentWpm,
                    wordCount: requestedWordCount,
                    status: 'waiting',
                    expiresAt: expiresTimestamp
                });
            }
            if (isSinglePlayer && allowSpectators) {
                db.ref(`presence/${myId}`).update({
                    allowSpectators: true,
                    activeRoomCode: roomCode
                });
            }
            joinRoomLogic(false);
        }).catch(err => {
            alert("Errore Firebase durante la creazione: " + err.message);
        });
    });
}

window.joinSpecificRoom = function(code) { 
    roomCode = code; 
    joinRoomLogic(false); 
};

function joinRoomLogic(isReconnect = false) {
    gameRunning = false; 
    const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) { 
            showScreen('leaderboardScreen'); 
            activeTab = "room"; 
            showLeaderboardTab('tabRoomBtn'); 
            localStorage.removeItem(STORAGE_ROOM_KEY); 
            return; 
        }
        if (pData) { 
            totalScore = pData.score || 0; 
            wordIndex = pData.wordIndex || 0; 
            quizQuestionIndex = pData.wordIndex || 0; 
            matchDetailsArray = pData.matchDetails || []; 
            if (isRejoining) showToast("🔄 Partita recuperata!"); 
        }
        showScreen('lobbyScreen'); 
        if (els.lobbyTitleText) els.lobbyTitleText.textContent = roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera"; 
        if (els.permanentGameInput) els.permanentGameInput.blur();
        playerRef.onDisconnect().update({ online: false }); 
        
        if (!pData) {
            playerRef.set({ 
                name: myName, 
                username: myPrivacy ? "" : tgUsername, 
                score: 0, 
                wpm: 0, 
                finished: false, 
                teamId: myTeamId, 
                ready: false, 
                online: true 
            }).then(() => {
                if (!isSinglePlayer && !roomCode.startsWith("TRN_")) {
                    db.ref(`rooms/${roomCode}/players`).once('value', s => {
                        const count = s.exists() ? Object.keys(s.val()).length : 1;
                        db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(count);
                    });
                }
            });
        } else {
            playerRef.update({ online: true, name: myName, username: myPrivacy ? "" : tgUsername });
        }
        
        listenToChat(); 
        if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return exitRoomCleanly(true); 
            const rData = snap.val(); 
            currentMode = rData.mode; 
            requestedWordCount = rData.wordCount; 
            isSinglePlayer = rData.type === 'single'; 
            isFixedSpeed = rData.fixedSpeed || false; 
            roomHostId = rData.hostId;
            
            window.charSpaceWpm = rData.charSpaceWpm !== undefined ? rData.charSpaceWpm : rData.wpm;
            window.wordSpaceMult = rData.wordSpaceMult || 1.0;
            
            if (rData.status === 'playing' || rData.status === 'countdown') {
                localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
            }

            if (rData.status === 'playing' && !gameRunning) { 
                currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone; 
                if (rData.words) gameWords = rData.words; 
                return resumeGameSequence(); 
            }
            if (rData.status === 'countdown' && !gameRunning) { 
                currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone; 
                if (rData.words) gameWords = rData.words; 
                return startCountdownSequence(); 
            }
            if (rData.status === 'waiting') {
                renderPlayersList(rData.players || {}, rData.hostId); 
                const pCount = Object.keys(rData.players || {}).length;
                if (myId === rData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') {
                    showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato.");
                }
                lastPlayerCount = pCount;
                if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
                if (rData.expiresAt && !isSinglePlayer) {
                    lobbyTimerInterval = setInterval(() => { 
                        const diff = rData.expiresAt - Date.now(); 
                        if (diff <= 0) { 
                            clearInterval(lobbyTimerInterval); 
                            if (els.lobbyTimerText) els.lobbyTimerText.textContent = "Tempo scaduto!"; 
                        } else if (els.lobbyTimerText) {
                            els.lobbyTimerText.textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2, '0')}`;
                        }
                    }, 1000); 
                } else if (els.lobbyTimerText) {
                    els.lobbyTimerText.textContent = "";
                }
            }
        });
    });
}

function renderPlayersList(playersData, hostId) {
    if (!els.playersList) return; 
    els.playersList.innerHTML = ''; 
    const count = Object.keys(playersData).length;
    if (count > lastPlayerCount && lastPlayerCount > 0) { 
        playBeep(500, 0.1); 
        setTimeout(() => playBeep(700, 0.15), 150); 
        showToast("👤 Nuovo giocatore!"); 
    } 
    lastPlayerCount = count; 
    let allReady = true; 
    const pKeys = Object.keys(playersData); 
    if (pKeys.length < 2) allReady = false;
    
    Object.entries(playersData).forEach(([id, data]) => {
        if (!data.ready) allReady = false; 
        const li = document.createElement('li'); 
        const nSpan = document.createElement('span'); 
        nSpan.textContent = `${data.ready ? '✅' : '⏳'} ${data.name}`;
        if (data.username && String(data.username).trim() !== "") { 
            nSpan.style.color = 'var(--link-color)'; 
            nSpan.style.cursor = 'pointer'; 
            nSpan.style.textDecoration = 'underline'; 
            nSpan.onclick = () => openTelegramProfile(data.username); 
        }
        li.appendChild(nSpan); 
        if (id === hostId) { 
            const sHost = document.createElement('small'); 
            sHost.textContent = ' (HOST)'; 
            li.appendChild(sHost); 
        } 
        els.playersList.appendChild(li);
    });
    
    const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong'; 
    const amIHost = (myId === hostId) || roomCode.startsWith("TRN_"); 
    const amIReady = playersData[myId]?.ready;
    
    if (els.startMultiplayerBtn) els.startMultiplayerBtn.style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none'; 
    if (els.deleteRoomBtn) els.deleteRoomBtn.style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none'; 
    if (els.readyBtn) els.readyBtn.style.display = (isTrnOrPP && !amIReady) ? 'block' : 'none';
    
    if (isTrnOrPP) { 
        if (els.waitingHostText) {
            els.waitingHostText.style.display = amIReady ? 'block' : 'none'; 
            els.waitingHostText.textContent = "In attesa...";
        }
        if (els.statusInfoText) els.statusInfoText.textContent = amIReady ? "SONO PRONTO ✅" : "Connessione sicura in corso..."; 
    } else { 
        if (els.waitingHostText) {
            els.waitingHostText.style.display = amIHost ? 'none' : 'block'; 
            els.waitingHostText.textContent = "In attesa dell'host...";
        }
        if (els.statusInfoText) els.statusInfoText.textContent = amIHost ? "Sei l'Host." : "Sei un partecipante."; 
    }
    
    if (allReady && isTrnOrPP && (pKeys[0] === myId || amIHost)) {
        db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
    }
}

if (els.readyBtn) {
    els.readyBtn.addEventListener('click', () => { 
        if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true }); 
    });
}

// --- GAMELOOP, VERIFICA E PUNTEGGI ---
function getLevenshteinDistance(a, b) {
    const matrix = []; 
    for (let i = 0; i <= b.length; i++) matrix[i] = [i]; 
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) { 
            if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1]; 
            else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, Math.min(matrix[i][j-1]+1, matrix[i-1][j]+1)); 
        }
    } 
    return matrix[b.length][a.length];
}

function renderDiffSecure(container, real, typed) {
    for (let i = 0; i < Math.max(real.length, typed.length); i++) { 
        if (!real[i]) continue; 
        const span = document.createElement('span'); 
        if (!typed[i] || typed[i] !== real[i]) span.style.color = "#d32f2f"; 
        span.textContent = real[i]; 
        container.appendChild(span); 
    }
}

if (els.replayWordBtn) {
    els.replayWordBtn.addEventListener('click', () => { 
        if (!gameRunning || !inputActive) return; 
        usedReplay = true; 
        playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm); 
        if (els.permanentGameInput) els.permanentGameInput.focus(); 
    });
}

if (els.permanentGameInput) {
    els.permanentGameInput.addEventListener('input', function() { 
        if (currentMode === 'chars' && inputActive && gameRunning) { 
            const val = els.permanentGameInput.value.trim().toUpperCase(); 
            if (val.length >= 1) { 
                handleWordSubmission(val[0]); 
                els.permanentGameInput.value = ""; 
            } 
        } 
    });
    els.permanentGameInput.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') { 
            const val = els.permanentGameInput.value.trim().toUpperCase(); 
            if (val) { 
                handleWordSubmission(val); 
                els.permanentGameInput.value = ""; 
            } 
        } 
    });
}

// DEFINIZIONE UNICA DI handleWordSubmission (Include nativamente "conquest" per eliminare il monkey patching)
function handleWordSubmission(userWord) {
    if (!userWord) return;
    userWord = userWord.substring(0, 50).trim().toUpperCase();

    // RAMO SPECIALE: CONQUISTA (CO-OP)
    if (currentMode === 'conquest') {
        if (coopActiveFreqIndex === 0) {
            return showToast("⚠️ Seleziona prima una Frequenza!");
        }

        const currentWord = gameWords[0];
        const isCorrect = userWord === currentWord;
        const gain = coopActiveFreqIndex === 1 ? 4 : (coopActiveFreqIndex === 2 ? 7 : 12);
        const penalty = coopActiveFreqIndex === 1 ? 2 : (coopActiveFreqIndex === 2 ? 3 : 5);

        inputActive = false;

        if (isCorrect) {
            currentWpm += 2;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
            showToast(`✅ CORRETTO! +${gain}% (Velocità -> ${currentWpm} WPM)`);
            playBeep(880, 0.1);

            db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.min(100, (state.progress || 0) + gain);

                if (!Array.isArray(state.activeWords) || state.activeWords.length !== 3) {
                    state.activeWords = generateCoopTripleWords();
                    return state;
                }

                const idx = coopActiveFreqIndex - 1;
                if (idx >= 0 && idx < 3) {
                    const nextWords = generateCoopTripleWords();
                    state.activeWords[idx] = nextWords[idx];
                }
                return state;
            });
        } else {
            currentWpm = Math.max(10, currentWpm - 2);
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
            showToast(`❌ ERRORE! -${penalty}% (Velocità -> ${currentWpm} WPM)`);
            playBeep(300, 0.25);

            db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.max(0, (state.progress || 0) - penalty);
                return state;
            });
        }

        setTimeout(() => {
            if (!gameRunning) return;
            if (els.permanentGameInput) {
                els.permanentGameInput.value = "";
                els.permanentGameInput.focus();
            }
            inputActive = true; 
            
            if (!isCorrect && gameWords[0]) {
                stopAllMorseAudio();
                playMorseAudio(gameWords[0], currentWpm);
            }
        }, 1500);
        return;
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

function playNextWord() {
    if (!gameRunning || currentMode === 'pingpong') return; 
    if (wordIndex >= requestedWordCount) return finishGame();
    if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
    inputActive = true; 
    usedReplay = false; 
    const currentWord = gameWords[wordIndex].toUpperCase();
    
    if (roomCode) db.ref(`rooms/${roomCode}/liveAudio`).set({ word: currentWord, wpm: currentWpm, ts: Date.now() });

    if (isEasyMode && isSinglePlayer && els.easyModeHint) { 
        els.easyModeHint.textContent = currentWord.split('').sort(() => 0.5 - Math.random()).join(' '); 
        els.easyModeHint.style.display = 'block'; 
    } else if (els.easyModeHint) {
        els.easyModeHint.style.display = 'none';
    }
    
    playMorseAudio(currentWord, currentWpm); 
    lastWordStartTime = Date.now(); 
    if (els.permanentGameInput) els.permanentGameInput.focus();
}

function startCountdownSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (listeners.room) listeners.room.off();
    if (!isSinglePlayer) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            gameStartPlayerCount = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (listeners.players) db.ref(`rooms/${roomCode}/players`).off('value', listeners.players);
            listeners.players = db.ref(`rooms/${roomCode}/players`).on('value', pSnap => {
                if (!gameRunning) return; 
                const currentPCount = Object.keys(pSnap.val() || {}).length;
                if (gameStartPlayerCount > 0 && currentPCount < gameStartPlayerCount) {
                    setTimeout(() => { 
                        db.ref(`rooms/${roomCode}/players`).once('value', s => { 
                            if (gameRunning && Object.keys(s.val() || {}).length < gameStartPlayerCount) { 
                                alert("Un giocatore ha abbandonato. Ritorno al menu."); 
                                gameRunning = false; 
                                exitRoomCleanly(false); 
                            } else if (gameRunning) {
                                showToast("👥 Giocatore rientrato!"); 
                            }
                        }); 
                    }, 10000);
                }
            });
        });
    }
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: 0`;

    if (isSinglePlayer && els.allowSpectatorsCheckbox && els.allowSpectatorsCheckbox.checked) {
        if (els.spectatorsCountDisplay) {
            els.spectatorsCountDisplay.style.display = 'inline-block';
            els.spectatorsCountDisplay.textContent = '👁️ 0';
        }
        db.ref(`rooms/${roomCode}/spectators`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.textContent = `👁️ ${count}`;
        });
    } else if (els.spectatorsCountDisplay) {
        els.spectatorsCountDisplay.style.display = 'none';
    }

    if (!isRejoining) { 
        totalScore = 0; currentStreak = 0; wordIndex = 0; quizQuestionIndex = 0; usedReplay = false; 
        sessionCharErrors = Object.create(null); sessionErrorsByWpm = Object.create(null); matchDetailsArray = []; 
    }
    if (els.tableBody) els.tableBody.innerHTML = ""; 
    window.lastPlayedWordId = 0; 
    window.lastSeenGuessId = 0;
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none'; 
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
    
    if (currentMode === 'pingpong' && (myId === roomHostId || roomCode.startsWith("TRN_"))) {
        db.ref(`rooms/${roomCode}/pingpong`).once('value', s => { 
            if (!s.exists()) db.ref(`rooms/${roomCode}/pingpong`).set({ senderId: myId, word: '', wordId: 0, wordsPlayed: 0, lastGuess: null }); 
        });
    }
    
    showScreen('countdownScreen'); 
    gameRunning = true; 
    let count = 3; 
    if (els.countdownNumber) els.countdownNumber.textContent = count;
    
    const interval = setInterval(() => {
        if (count > 1) { 
            count--; 
            if (els.countdownNumber) els.countdownNumber.textContent = count; 
            playBeep(600, 0.1); 
        } else {
            clearInterval(interval); 
            if (myId === roomHostId) {
                db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            }
            if (els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!'); 
            playBeep(800, 0.3);
            setTimeout(() => { 
                if (!gameRunning) return; 
                
                // --- PULIZIA PREVENTIVA PER EVITARE SOVRAPPOSIZIONI ---
                isCoopMode = (currentMode === 'conquest');
                if (els.coopArea) els.coopArea.style.display = 'none';
                if (els.tableWrapper) els.tableWrapper.style.display = 'block';

                if (currentMode === 'conquest') return startCoopSequence(); 
                if (currentMode === 'quiz') return startQuizSequence(); 
                
                showScreen('gameArea'); 
                if (currentMode === 'pingpong') {
                    setupPingPongListener(); 
                } else { 
                    setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); 
                    setTimeout(() => { if (gameRunning) playNextWord(); }, 800); 
                } 
            }, 500);
        }
    }, 1000);
}

function resumeGameSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gameRunning = true; 
    isRejoining = false;
    
    // --- PULIZIA PREVENTIVA ---
    isCoopMode = (currentMode === 'conquest');
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;
    
    if (els.tableBody) {
        els.tableBody.innerHTML = "";
        matchDetailsArray.forEach(row => {
            const tr = document.createElement('tr'); 
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
            const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed;
            const tdReal = document.createElement('td'); const bReal = document.createElement('b'); bReal.textContent = row.real; tdReal.appendChild(bReal);
            const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
            tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.tableBody.appendChild(tr);
        });
    }
    
    if (currentMode === 'conquest') {
        startCoopSequence(); 
    } else if (currentMode === 'quiz') {
        startQuizSequence(); 
    } else { 
        showScreen('gameArea'); 
        if (currentMode === 'pingpong') {
            setupPingPongListener(); 
        } else { 
            setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); 
            setTimeout(() => { if (gameRunning) playNextWord(); }, 800); 
        } 
    }
}

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
function startCoopSequence() {
    isCoopMode = true;
    showScreen('gameArea');
    if (els.coopArea) els.coopArea.style.display = 'flex';
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'none';
    
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Obiettivo: 100%";
    
    coopActiveFreqIndex = 0;
    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';

    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = false;
        els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴...";
        els.permanentGameInput.value = "";
    }
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
// ============================================================================
// --- QUIZ MORSE (CON SHUFFLE RISPOSTE A/B/C/D E FISHER-YATES) ---
// ============================================================================

// Domande di emergenza se quiz_data.js non è raggiungibile
const FALLBACK_QUIZ_QUESTIONS = [
    { q: "SOS", a: ["Segnale di soccorso", "Saluti operativi", "Fine trasmissione", "Stazione radio"], correct: 0 },
    { q: "CQ", a: ["Chiamata a tutti", "Conferma ricezione", "Cambio frequenza", "Codice segreto"], correct: 0 },
    { q: "QTH", a: ["La mia posizione è...", "Qual è il tuo nome?", "Chiudi la trasmissione", "Segnale disturbato"], correct: 0 },
    { q: "QRS", a: ["Trasmetti più lentamente", "Aumenta velocità", "Frequenza occupata", "Ripeti messaggio"], correct: 0 },
    { q: "QRZ", a: ["Chi mi chiama?", "Come mi ricevi?", "Pronto a trasmettere", "Fine lavoro"], correct: 0 },
    { q: "QSL", a: ["Confermo ricezione", "Negativo", "In attesa", "Disturbo atmosferico"], correct: 0 },
    { q: "73", a: ["Cordiali saluti", "Buona fortuna", "A presto", "Grazie di tutto"], correct: 0 },
    { q: "88", a: ["Amore e baci", "Saluti formali", "Arrivederci", "Codice di chiusura"], correct: 0 },
    { q: "QRT", a: ["Sospendo le trasmissioni", "Inizio trasmissioni", "Cambio canale", "Ripeti di nuovo"], correct: 0 },
    { q: "QRV", a: ["Sei pronto?", "Sono occupato", "Aumenta potenza", "Chiudi stazione"], correct: 0 }
];

// Funzione per recuperare le domande disponibili
function getAvailableQuizQuestions() {
    if (typeof QUIZ_QUESTIONS !== 'undefined' && Array.isArray(QUIZ_QUESTIONS) && QUIZ_QUESTIONS.length > 0) {
        return QUIZ_QUESTIONS;
    }
    if (typeof window.QUIZ_QUESTIONS !== 'undefined' && Array.isArray(window.QUIZ_QUESTIONS) && window.QUIZ_QUESTIONS.length > 0) {
        return window.QUIZ_QUESTIONS;
    }
    return FALLBACK_QUIZ_QUESTIONS;
}

// Funzione che mescola le opzioni (A, B, C, D) di una singola domanda
function prepareShuffledQuestion(rawQuestion) {
    if (!rawQuestion || !Array.isArray(rawQuestion.a)) return rawQuestion;
    
    // Identifichiamo il testo esatto della risposta corretta originale
    const correctText = rawQuestion.a[rawQuestion.correct || 0];
    
    // Mescoliamo le 4 risposte con Fisher-Yates
    const shuffledOptions = fisherYatesShuffle([...rawQuestion.a]);
    
    // Troviamo il nuovo indice (0=A, 1=B, 2=C, 3=D) della risposta corretta
    const newCorrectIndex = shuffledOptions.indexOf(correctText);
    
    return {
        q: rawQuestion.q,
        a: shuffledOptions,
        correct: newCorrectIndex >= 0 ? newCorrectIndex : 0
    };
}

function startQuizSequence() {
    showScreen('quizArea'); 
    gameRunning = true; 
    lastLoadedQuizIndex = -1;
    if (els.quizWpmDisplay) els.quizWpmDisplay.textContent = `WPM: ${currentWpm}`; 
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    
    const availableQuestions = getAvailableQuizQuestions();

    if (roomCode && !isSinglePlayer) {
        if (listeners.quizState) db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState);
        
        listeners.quizState = db.ref(`rooms/${roomCode}/quiz_state`).on('value', snap => {
            const state = snap.val(); 
            if (!state || !gameRunning) return;
            
            const newIndex = state.questionIndex || 0;
            
            if (state.questionsOrder && Array.isArray(state.questionsOrder)) {
                randomizedQuizQuestions = state.questionsOrder.map(idx => availableQuestions[idx % availableQuestions.length]);
            } else {
                randomizedQuizQuestions = availableQuestions;
            }

            if (newIndex !== lastLoadedQuizIndex) { 
                lastLoadedQuizIndex = newIndex; 
                quizQuestionIndex = newIndex; 
                loadNextQuizQuestion(); 
            }
            quizActiveBuzzerId = state.activeBuzzerId || null; 
            renderQuizUI(state);
        });

        if (myId === roomHostId) {
            // Usiamo Fisher-Yates per un ordine domande 100% casuale
            const order = fisherYatesShuffle(Array.from({length: availableQuestions.length}, (_, i) => i));
            db.ref(`rooms/${roomCode}/quiz_state`).set({ 
                questionIndex: 0, 
                activeBuzzerId: null, 
                status: 'playing', 
                questionsOrder: order
            });
        }
    } else { 
        // Singleplayer: Fisher-Yates su tutte le domande
        randomizedQuizQuestions = fisherYatesShuffle(availableQuestions); 
        quizQuestionIndex = 0; 
        loadNextQuizQuestion(); 
    }
}

function loadNextQuizQuestion() {
    const maxQuestions = Math.min(requestedWordCount, randomizedQuizQuestions.length);
    if (quizQuestionIndex >= maxQuestions || quizQuestionIndex >= randomizedQuizQuestions.length) {
        return finishGame();
    }
    
    const rawQ = randomizedQuizQuestions[quizQuestionIndex];
    
    // Controllo sicurezza per il Multiplayer se il dato tarda ad arrivare
    if (!rawQ || !rawQ.q) {
        setTimeout(() => {
            if (gameRunning) loadNextQuizQuestion();
        }, 400);
        return;
    }

    // Mescoliamo dinamicamente A, B, C e D prima di giocarla!
    currentQuizQuestion = prepareShuffledQuestion(rawQ);
    
    setTimeout(() => {
        if (gameRunning) playQuizAudioSequence();
    }, 300);
}

async function playQuizAudioSequence() {
    if (!gameRunning || !currentQuizQuestion) return;
    
    stopAllMorseAudio();
    inputActive = false; 
    disableQuizButtons(true);
    ['A', 'B', 'C', 'D'].forEach(l => { 
        if (els['btnQuiz'+l]) els['btnQuiz'+l].classList.remove('active-choice'); 
    });
    
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "Ascolta la domanda...";
    
    await playMorseAudio(currentQuizQuestion.q, currentWpm);
    if (!gameRunning) return; 
    await new Promise(r => setTimeout(r, 1500));
    
    for (let i = 0; i < 4; i++) {
        const letter = ["A", "B", "C", "D"][i];
        if (!gameRunning) return; 
        if (els.quizQuestionBox) els.quizQuestionBox.textContent = `Opzione ${letter}...`;
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.add('active-choice');
        
        await playMorseAudio(`${letter} ${currentQuizQuestion.a[i]}`, currentWpm);
        
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.remove('active-choice');
        if (!gameRunning) return; 
        await new Promise(r => setTimeout(r, 1000));
    }
    
    if (!gameRunning) return;
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "SCEGLI LA TUA RISPOSTA!"; 
    enableQuizControls(); 
    startQuizTimer(20);
}

function enableQuizControls() {
    inputActive = true;
    if (isSinglePlayer) {
        disableQuizButtons(false);
    } else { 
        if (els.quizBuzzer) els.quizBuzzer.style.display = 'block'; 
        if (els.quizOptionsContainer) els.quizOptionsContainer.style.opacity = '0.5'; 
        disableQuizButtons(true); 
    }
}

function disableQuizButtons(disabled) { 
    ['A', 'B', 'C', 'D'].forEach(l => { 
        if (els['btnQuiz'+l]) els['btnQuiz'+l].disabled = disabled; 
    }); 
}

function startQuizTimer(seconds) {
    if (quizTimerInterval) clearInterval(quizTimerInterval); 
    let timeLeft = 100;
    quizTimerInterval = setInterval(() => {
        timeLeft -= 100 / (seconds * 10); 
        if (els.quizTimerProgress) els.quizTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) { 
            clearInterval(quizTimerInterval); 
            if (inputActive) { 
                showToast("Tempo scaduto!"); 
                if (isSinglePlayer || quizActiveBuzzerId === myId) submitQuizAnswer(-1); 
            } 
        }
    }, 100);
}

function submitQuizAnswer(index) {
    if (!isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) return;
    if (isSinglePlayer && !inputActive) return;
    if (quizTimerInterval) clearInterval(quizTimerInterval); 
    inputActive = false; 
    disableQuizButtons(true);
    
    if (index === currentQuizQuestion.correct) { 
        totalScore += 100; 
        showToast(`CORRETTO (${["A", "B", "C", "D"][index]})! +100`); 
    } else {
        showToast(`SBAGLIATO! Era la ${["A", "B", "C", "D"][currentQuizQuestion.correct]}`);
    }
    
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wordIndex: quizQuestionIndex + 1 });
    
    setTimeout(() => {
        if (!gameRunning) return;
        if (roomCode && !isSinglePlayer) {
            db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => { 
                if (state && state.activeBuzzerId === myId) { 
                    state.questionIndex = (state.questionIndex || 0) + 1; 
                    state.activeBuzzerId = null; 
                } 
                return state; 
            });
        } else if (isSinglePlayer) { 
            quizQuestionIndex++; 
            loadNextQuizQuestion(); 
        }
    }, 3000);
}

if (els.quizBuzzer) {
    els.quizBuzzer.addEventListener('click', () => { 
        if (roomCode && !isSinglePlayer && !quizActiveBuzzerId && inputActive) {
            db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => { 
                if (state && !state.activeBuzzerId) state.activeBuzzerId = myId; 
                return state; 
            });
        } 
    });
}

for (let i = 0; i < 4; i++) {
    const l = ["A", "B", "C", "D"][i];
    if (els['btnQuiz'+l]) els['btnQuiz'+l].onclick = () => submitQuizAnswer(i);
    if (els['replay'+l]) els['replay'+l].onclick = () => { if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.a[i], currentWpm); };
}

if (els.quizReplayQ) {
    els.quizReplayQ.onclick = () => { 
        if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.q, currentWpm); 
    };
}

if (els.quitQuizBtn) {
    els.quitQuizBtn.onclick = () => { 
        if (confirm("Vuoi abbandonare il Quiz?")) { 
            if (quizTimerInterval) clearInterval(quizTimerInterval); 
            gameRunning = false; 
            exitRoomCleanly(); 
        } 
    };
}

function renderQuizUI(state) {
    if (!els.quizBuzzer || !els.buzzerWinner || !els.quizOptionsContainer) return;
    if (state.activeBuzzerId) {
        els.quizBuzzer.style.display = 'none';
        if (state.activeBuzzerId === myId) { 
            els.buzzerWinner.textContent = "TOCCA A TE!"; 
            els.quizOptionsContainer.style.opacity = '1'; 
            disableQuizButtons(false); 
        } else { 
            els.buzzerWinner.textContent = "L'AVVERSARIO RISPONDE..."; 
            els.quizOptionsContainer.style.opacity = '0.5'; 
            disableQuizButtons(true); 
        }
    } else {
        els.buzzerWinner.textContent = ""; 
        els.quizBuzzer.style.display = inputActive ? 'block' : 'none'; 
        els.quizOptionsContainer.style.opacity = '0.5'; 
        disableQuizButtons(true);
    }
}

// --- BATTAGLIA REALE SERALE (CON RISOLUZIONE BUG 1 E TASTIERA APERTA) ---
const BR_H_BANNER = 9;    
const BR_M_BANNER = 54;   
const BR_H_START = 21;    
const BR_M_START = 30;    

let brRoomCode = "";
let brIsPlaying = false, brAmIAlive = true;

function initBattleRoyaleScheduler() {
    checkBattleTime(); 
    if (brCheckInterval) clearInterval(brCheckInterval);
    brCheckInterval = setInterval(checkBattleTime, 100000); 
}

window.toggleBattleRoyaleJoin = function() {
    if (!brRoomCode) {
        const now = new Date(Date.now() + serverTimeOffset);
        const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
        brRoomCode = "BR_" + dKey;
    }
    
    db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', pSnap => {
        if (pSnap.exists()) {
            db.ref(`rooms/${brRoomCode}/players/${myId}`).remove().then(() => {
                showToast("Ti sei ritirato dalla sfida serale.");
            });
        } else {
            db.ref(`rooms/${brRoomCode}`).update({
                status: 'enrolling',
                type: 'battle_royale',
                wpm: 25,
                round: 0,
                hostId: myId,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            
            db.ref(`rooms/${brRoomCode}/players/${myId}`).set({
                name: myName,
                lives: 3,
                status: 'Iscritto ⏳',
                answered: false
            }).then(() => {
                showToast("⚔️ Iscrizione registrata! Il banner è ora verde.");
            });
        }
    });
};

function checkBattleTime() {
    if (gameRunning || brIsPlaying || brBannerDismissedToday) return; 
    
    const now = new Date(Date.now() + serverTimeOffset);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const bannerTotalMinutes = BR_H_BANNER * 60 + BR_M_BANNER;
    const startTotalMinutes = BR_H_START * 60 + BR_M_START;
    
    const isTime = (currentTotalMinutes >= bannerTotalMinutes && currentTotalMinutes < startTotalMinutes);
    
    const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
    brRoomCode = "BR_" + dKey;

    if (isTime) {
        if (els.brBanner && els.brBanner.style.display === 'none') {
            els.brBanner.style.display = 'block';
            
            if (brBannerTimeout) clearTimeout(brBannerTimeout);
            brBannerTimeout = setTimeout(() => {
                if (els.brBanner) els.brBanner.style.display = 'none';
                brBannerDismissedToday = true;
                db.ref(`rooms/${brRoomCode}/players`).off('value'); 
            }, 10000);
        }
        
        if (els.btnJoinBR) {
            els.btnJoinBR.onclick = () => {
                window.toggleBattleRoyaleJoin();
                if (brBannerTimeout) clearTimeout(brBannerTimeout);
                brBannerTimeout = setTimeout(() => {
                    if (els.brBanner) els.brBanner.style.display = 'none';
                    brBannerDismissedToday = true;
                    db.ref(`rooms/${brRoomCode}/players`).off('value');
                }, 10000);
            };
        }

        db.ref(`rooms/${brRoomCode}/players`).on('value', snap => {
            const players = snap.val() || {};
            const count = Object.keys(players).length;
            
            if (els.brEnrolledCount) els.brEnrolledCount.textContent = count;
            if (els.brEnrolledCountCompact) els.brEnrolledCountCompact.textContent = count;
            
            if (players[myId]) {
                if (els.brBanner) {
                    els.brBanner.style.backgroundColor = '#4caf50'; 
                    els.brBanner.style.borderColor = '#81c784';
                    els.brBanner.style.padding = '8px 12px';
                }
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'none';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'inline-block';
                
                if (els.btnJoinBR) {
                    els.btnJoinBR.textContent = 'RITIRATI DALLA SFIDA';
                    els.btnJoinBR.style.color = '#4caf50';
                    els.btnJoinBR.style.width = 'auto';
                    els.btnJoinBR.style.flexGrow = '1';
                }
            } else {
                if (els.brBanner) {
                    els.brBanner.style.backgroundColor = '#e53935'; 
                    els.brBanner.style.borderColor = '#ff5252';
                    els.brBanner.style.padding = '15px';
                }
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'block';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'none';
                
                if (els.btnJoinBR) {
                    els.btnJoinBR.textContent = 'PARTECIPA ALLA SFIDA';
                    els.btnJoinBR.style.color = '#e53935';
                    els.btnJoinBR.style.width = '100%';
                    els.btnJoinBR.style.flexGrow = '0';
                }
            }
        });
    } else {
        if (els.brBanner) els.brBanner.style.display = 'none';
        db.ref(`rooms/${brRoomCode}/players`).off('value');
    }

    if (currentHour === BR_H_START && currentMinute === BR_M_START) {
        db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', snap => {
            if (snap.exists() && activeTab !== "br_playing") {
                activeTab = "br_playing";
                lastBRRoundPlayed = -1;
                showScreen('brScreen');
                listenToBattleRoyaleRoom();
            }
        });
        startBattleRoyaleSystem(); 
    }
}

function listenToBattleRoyaleRoom() {
    db.ref(`rooms/${brRoomCode}`).on('value', snap => {
        if (!snap.exists()) { 
            showScreen('setupScreen'); 
            alert("La Battaglia è stata annullata o è terminata."); 
            return; 
        }
        const rData = snap.val();
        
        renderBRPlayers(rData.players || {});
        
        if (rData.status === 'cancelled') {
            if (els.brStatusText) els.brStatusText.textContent = "Annullata: Giocatori insufficienti (<5).";
            setTimeout(() => { showScreen('setupScreen'); activeTab = "room"; }, 4000);
            return;
        }

        if (rData.status === 'playing') {
            brIsPlaying = true;
            if (els.brWpmDisplay) els.brWpmDisplay.textContent = rData.wpm + " WPM";
            
            const myData = rData.players[myId];
            brAmIAlive = myData && myData.lives > 0;
            
            const hearts = ["💀 ELIMINATO", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
            let safeLives = myData && myData.lives ? parseInt(myData.lives) : 0;
            if (safeLives < 0) safeLives = 0;
            if (safeLives > 5) safeLives = 5;
            if (els.brLivesDisplay) els.brLivesDisplay.textContent = brAmIAlive ? hearts[safeLives] : "💀 ELIMINATO";
            
            if (rData.roundEndTime && rData.currentWord && rData.round !== lastBRRoundPlayed) {
                lastBRRoundPlayed = rData.round;
                handleBRRound(rData);
            }
        }
        
        if (rData.status === 'finished') {
            brIsPlaying = false;
            lastBRRoundPlayed = -1;
            if (els.brStatusText) els.brStatusText.textContent = `Partita Conclusa! Vincitore: ${rData.winner || 'Nessuno'}`;
            if (els.brInputArea) els.brInputArea.style.display = 'none';
            if (els.brTimerContainer) els.brTimerContainer.style.display = 'none';
        }
    });
}

function renderBRPlayers(players) {
    if (!els.brPlayersList) return;
    els.brPlayersList.innerHTML = "";
    Object.values(players).forEach(p => {
        const li = document.createElement('li');
        li.style.cssText = "display:flex; justify-content:space-between; padding:5px; border-bottom:1px dashed rgba(255,255,255,0.1);";
        
        const info = document.createElement('span');
        const heartsList = ["💀", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
        let safePLives = p.lives ? parseInt(p.lives) : 0;
        if (safePLives < 0) safePLives = 0;
        if (safePLives > 5) safePLives = 5;
        let icon = heartsList[safePLives];
        
        info.innerHTML = `<b style="color:var(--link-color);">${escapeHTML(p.name)}</b> <small>${icon}</small>`;
        
        const status = document.createElement('span');
        status.style.fontSize = "0.85em";
        status.style.color = p.status === 'Corretto!' ? '#4caf50' : (p.status === 'Eliminato' || p.status === 'Errore!' ? '#e53935' : 'var(--hint-color)');
        status.textContent = p.status;
        
        li.appendChild(info); li.appendChild(status);
        els.brPlayersList.appendChild(li);
    });
}

function startBattleRoyaleSystem() {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData && rData.hostId === myId) {
            const pCount = Object.keys(rData.players || {}).length;
            if (pCount < 5) {
                db.ref(`rooms/${brRoomCode}/status`).set('cancelled');
            } else {
                db.ref(`rooms/${brRoomCode}/status`).set('playing');
                hostNextBRRound(rData, 25, 1);
            }
        }
    });
}

function hostNextBRRound(rData, wpm, roundNum) {
    const word = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
    const endTime = Date.now() + 30000; 
    
    let updates = {};
    Object.keys(rData.players || {}).forEach(pid => {
        if (rData.players[pid].lives > 0) {
            updates[`players/${pid}/answered`] = false;
            updates[`players/${pid}/status`] = 'Ascolto...';
        }
    });
    updates['currentWord'] = word;
    updates['wpm'] = wpm;
    updates['round'] = roundNum;
    updates['roundEndTime'] = endTime;
    
    db.ref(`rooms/${brRoomCode}`).update(updates);
    
    setTimeout(() => checkBRRoundResults(wpm, roundNum), 31000);
}

function handleBRRound(rData) {
    if (brTimerInterval) clearInterval(brTimerInterval);
    
    if (els.brStatusText) els.brStatusText.textContent = `Round ${rData.round}! Attenzione...`;
    
    if (brAmIAlive && !rData.players[myId].answered) {
        if (els.brInputArea) els.brInputArea.style.display = 'flex';
        if (els.brInput) {
            els.brInput.disabled = false;
            els.brInput.placeholder = "Decodifica e scrivi qui...";
            els.brInput.value = '';
            els.brInput.focus();
        }
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'block';
        playMorseAudio(rData.currentWord, rData.wpm);
    } else {
        if (els.brInputArea) els.brInputArea.style.display = 'none';
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'none';
    }

    brTimerInterval = setInterval(() => {
        const left = rData.roundEndTime - Date.now();
        if (left <= 0) {
            clearInterval(brTimerInterval);
            if (els.brTimerProgress) els.brTimerProgress.style.width = '0%';
            if (brAmIAlive && !rData.players[myId].answered) submitBRAnswer(rData.currentWord, true);
        } else {
            if (els.brTimerProgress) {
                els.brTimerProgress.style.width = (left / 30000 * 100) + '%';
                if (left < 10000) els.brTimerProgress.style.background = '#e53935';
                else if (left < 20000) els.brTimerProgress.style.background = '#ff9800';
                else els.brTimerProgress.style.background = '#4caf50';
            }
        }
    }, 100);
}

if (els.brInput) {
    els.brInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && els.btnSendBr) els.btnSendBr.click();
    });
}

if (els.btnSendBr) {
    els.btnSendBr.addEventListener('click', () => {
        db.ref(`rooms/${brRoomCode}/currentWord`).once('value', s => {
            submitBRAnswer(s.val(), false);
        });
    });
}

// DEFINIZIONE CORRECTA DI submitBRAnswer (RISOLVE IL BUG 1 DELLA BATTAGLIA REALE)
function submitBRAnswer(realWord, isTimeout) {
    if (!brAmIAlive || !els.brInput) return;
    clearInterval(brTimerInterval);
    
    // Leggi il valore PRIMA di azzerare la casella di testo!
    const typed = els.brInput.value.trim().toUpperCase().substring(0, 50);
    
    els.brInput.placeholder = isTimeout ? "Tempo scaduto!" : "Risposta inviata! Attendi...";
    els.brInput.value = '';
    els.brInput.focus();
    
    const isCorrect = !isTimeout && (typed === realWord);
    
    db.ref(`rooms/${brRoomCode}/players/${myId}`).transaction(p => {
        if (!p) return p;
        p.answered = true;
        if (isCorrect) {
            p.status = 'Corretto!';
        } else {
            p.lives -= 1;
            p.status = p.lives === 0 ? 'Eliminato' : 'Errore!';
        }
        return p;
    });
}

function checkBRRoundResults(currentWpm, currentRound) {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData.hostId !== myId) return;
        
        let aliveCount = 0;
        let lastAliveName = "";
        
        Object.values(rData.players || {}).forEach(p => {
            if (p.lives > 0) { aliveCount++; lastAliveName = p.name; }
        });

        if (aliveCount <= 1) {
            db.ref(`rooms/${brRoomCode}/status`).set('finished');
            db.ref(`rooms/${brRoomCode}/winner`).set(aliveCount === 1 ? lastAliveName : 'Nessuno');
        } else {
            hostNextBRRound(rData, currentWpm + 1, currentRound + 1);
        }
    });
}

if (els.btnLeaveBR) {
    els.btnLeaveBR.addEventListener('click', () => {
        if (confirm("Vuoi abbandonare la Battaglia Serale?")) {
            brIsPlaying = false;
            lastBRRoundPlayed = -1;
            activeTab = "room";
            if (brTimerInterval) clearInterval(brTimerInterval);
            db.ref(`rooms/${brRoomCode}/players/${myId}`).remove();
            showScreen('setupScreen'); 
        }
    });
}

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
function showLeaderboardTab(tabId) {
    const mapping = {
        'tabRoomBtn': 'room',
        'opt_lb_daily': 'daily_challenge',
        'tabGlobalTournamentBtn': 'trn_global',
        'tabGlobalCWFreakBtn': 'cwfreak',
        'tabGlobalPingPongBtn': 'pingpong',
        'tabGlobalStandardMultiBtn': 'std_multi',
        'tabGlobalStandardSingleBtn': 'std_single',
        'tabGlobalCharsMultiBtn': 'chars_multi',
        'tabGlobalCharsSingleBtn': 'chars_single',
        'tabGlobalQuizMultiBtn': 'quiz_multi',
        'tabGlobalQuizSingleBtn': 'quiz_single'
    };
    let modeValue = mapping[tabId] || tabId;
    if (els.lbModeSelect) els.lbModeSelect.value = modeValue;

    if (els.trnSubTabs) els.trnSubTabs.style.display = 'none';
    if (modeValue === 'room') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'block'; 
        if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '';
        if (roomCode) db.ref(`rooms/${roomCode}/players`).once('value', snap => renderRoomLeaderboard(snap.val() || {}));
        else { 
            if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Nessuna partita attiva.</p>'; 
            if (els.waitingOthersText) els.waitingOthersText.style.display = 'none'; 
        }
    } else if (modeValue === 'daily_challenge') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else if (modeValue === 'trn_global') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        if (els.waitingOthersText) els.waitingOthersText.style.display = 'none'; 
        if (els.trnSubTabs) els.trnSubTabs.style.display = 'flex';
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); 
        if (els.btnTrnGlobalLB) els.btnTrnGlobalLB.classList.add('active-tab'); 
        fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeValue === 'cwfreak') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (modeValue === 'pingpong') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        populateDynamicFilters('pingpong', '');
        fetchAndRenderGlobalLeaderboard('pingpong', els.lbWordFilter ? els.lbWordFilter.value : 'all');
    } else {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        
        let isMulti = modeValue.endsWith('_multi');
        let type = isMulti ? 'multi' : 'single';
        
        let baseMode = 'standard';
        if (modeValue.startsWith('chars')) baseMode = 'chars';
        if (modeValue.startsWith('quiz')) baseMode = 'quiz';
        
        let filterPath = isMulti ? `recent_matches/${baseMode}_multi` : baseMode;
        populateDynamicFilters(filterPath, isMulti ? '' : 'single');
        
        fetchAndRenderGlobalLeaderboard(`${baseMode}_${type}`, els.lbWordFilter ? els.lbWordFilter.value : 'all');
    }
}

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

function populateDynamicFilters(modePath, subTypeFilter = "") {
    if (!els.lbWordFilter) return;
    const currentValue = els.lbWordFilter.value;
    db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
        let options = ['<option value="all">Tutte le categorie</option>']; 
        let counts = [];
        snapshot.forEach(wordCountNode => {
            const key = wordCountNode.key;
            if (modePath.startsWith('recent_matches')) { 
                if (key !== 'unknown' && !counts.includes(key)) counts.push(key); 
            } else { 
                if (!subTypeFilter || key.startsWith(subTypeFilter + "_")) { 
                    const count = key.split('_').pop(); 
                    if (!counts.includes(count)) counts.push(count); 
                } 
            }
        });
        counts.sort((a,b) => parseInt(a) - parseInt(b)).forEach(c => options.push(`<option value="${c}">${c} Stringhe</option>`));
        els.lbWordFilter.innerHTML = options.join(''); 
        if (counts.includes(currentValue) || currentValue === 'all') els.lbWordFilter.value = currentValue;
    });
}

function listenToRoomLeaderboard() {
    if (!roomCode) return;
    if (listeners.roomLb) db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb);
    listeners.roomLb = db.ref(`rooms/${roomCode}`).on('value', snap => {
        if (!snap.exists()) return; 
        const roomData = snap.val(), players = roomData.players || {};
        if (activeTab === "room") renderRoomLeaderboard(players);
        
        let allFinished = true; 
        Object.values(players).forEach(p => { if (!p.finished) allFinished = false; });
        if (allFinished && roomData.status !== 'finished' && Object.keys(players).length > 0) {
            db.ref(`rooms/${roomCode}/status`).set('finished');
            if (Object.keys(players).length >= 2 && ['multi', 'pingpong', 'chars', 'quiz'].includes(roomData.type || currentMode)) {
                saveMatchToGlobalHistory(players, roomData);
            }
            if (roomCode.startsWith("TRN_")) {
                const matchId = roomCode.replace("TRN_", ""); 
                let highestScore = -1, winnerTeamId = null;
                Object.values(players).forEach(p => { 
                    if (p.score > highestScore) { highestScore = p.score; winnerTeamId = p.teamId; } 
                    else if (p.score === highestScore) winnerTeamId = "tie"; 
                });
                if (winnerTeamId && activeTrnId) {
                    db.ref(`tournaments/${activeTrnId}/matches/${matchId}`).update({ status: 'finished', winnerTeamId: winnerTeamId }).then(() => checkTournamentCompletion(activeTrnId));
                    if (winnerTeamId !== "tie") {
                        db.ref(`tournaments/${activeTrnId}/standings/${winnerTeamId}`).transaction(t => { 
                            if (t) t.points = (t.points || 0) + 1; 
                            return t; 
                        });
                    }
                }
                setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 15000);
            } else if (roomData.hostId === myId) {
                setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 30000);
            }
        }
    });
}

function checkTournamentCompletion(trnId) {
    db.ref(`tournaments/${trnId}`).once('value', snap => {
        const trn = snap.val(); 
        if (!trn || trn.status === 'finished' || !trn.matches) return;
        let allFinished = true; 
        Object.values(trn.matches).forEach(m => { if (m.status !== 'finished') allFinished = false; });
        if (allFinished) {
            db.ref(`tournaments/${trnId}/status`).set('finished'); 
            showToast("Torneo completato! Spostato in archivio.");
            if (trn.standings) {
                Object.entries(trn.standings).forEach(([tId, data]) => {
                    if (data.points > 0) {
                        db.ref(`leaderboard/tournaments/${tId}`).transaction(currentG => {
                            if (!currentG) return { name: data.name, score: data.points, date: new Date().toLocaleDateString('it-IT') };
                            currentG.score = (currentG.score || 0) + data.points; 
                            currentG.date = new Date().toLocaleDateString('it-IT'); 
                            return currentG;
                        });
                    }
                });
            }
        }
    });
}

function renderRoomLeaderboard(players) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = ''; 
    let allFinished = true;
    const playersArray = Object.entries(players).map(([id, data]) => ({ 
        id, 
        name: data.name || "Sconosciuto", 
        username: data.username, 
        score: data.score || 0, 
        wpm: data.wpm || 0, 
        finished: data.finished, 
        matchDetails: data.matchDetails || [] 
    }));
    if (playersArray.length === 0) return;
    playersArray.forEach(p => { if (!p.finished) allFinished = false; });
    if (els.waitingOthersText) els.waitingOthersText.style.display = allFinished ? 'none' : 'block';

    if (allFinished && (roomCode && (roomCode.startsWith("TRN_") || currentMode === 'pingpong' || playersArray.length > 1))) {
        renderHeadToHeadView(playersArray, els.leaderboardContainer);
    } else {
        playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, index) => {
            const row = document.createElement('div'); row.className = 'leaderboard-row';
            let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const leftSpan = document.createElement('span'); leftSpan.appendChild(document.createTextNode(medal + " "));
            if (player.username && String(player.username).trim() !== "") { 
                const nameLink = document.createElement('span'); 
                nameLink.style.color = 'var(--link-color)'; 
                nameLink.style.cursor = 'pointer'; 
                nameLink.style.textDecoration = 'underline'; 
                nameLink.textContent = player.name; 
                nameLink.onclick = () => openTelegramProfile(player.username); 
                leftSpan.appendChild(nameLink); 
            } else {
                leftSpan.appendChild(document.createTextNode(player.name));
            }
            leftSpan.appendChild(document.createElement('br')); 
            const wpmSmall = document.createElement('small'); 
            wpmSmall.style.color = 'var(--hint-color)'; 
            wpmSmall.textContent = `(${player.wpm || 0} WPM)`; 
            leftSpan.appendChild(wpmSmall);
            const rightSpan = document.createElement('span');
            const scoreB = document.createElement('b'); scoreB.textContent = `${player.score} pt`; rightSpan.appendChild(scoreB);
            row.appendChild(leftSpan); row.appendChild(rightSpan); els.leaderboardContainer.appendChild(row);
        });
    }
    if (allFinished && playersArray.length > 0 && els.roomWinnerBanner) {
        els.roomWinnerBanner.textContent = roomCode.startsWith("TRN_") ? `🏆 Vince il match: ${playersArray[0].name}` : `🏆 Vincitore: ${playersArray[0].name}`;
    }
}

function renderHeadToHeadView(players, container) {
    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)); 
    const maxScore = players[0].score;
    players.forEach((p) => {
        const card = document.createElement('div'); 
        card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');
        
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
    if (!els.matchDetailsBody || !els.matchDetailsModal) return;
    els.matchDetailsBody.innerHTML = '';
    const h3 = els.matchDetailsModal.querySelector('h3');
    if (h3) h3.textContent = `${currentLang === 'it' ? 'Dettagli Partita di' : 'Match Details for'} ${name}`;
    details.forEach(row => {
        const tr = document.createElement('tr'); 
        let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
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
    const matchData = { 
        players: Object.entries(players).map(([id, data]) => ({ id, name: data.name, username: data.username || "", score: data.score || 0, wpm: data.wpm || 0, matchDetails: data.matchDetails || [] })), 
        mode: currentMode, 
        wordCount: roomData.wordCount, 
        date: new Date().toLocaleDateString('it-IT'), 
        ts: firebase.database.ServerValue.TIMESTAMP 
    };
    db.ref(`leaderboard/recent_matches/${modePath}/${roomData.wordCount || 'all'}/${matchId}`).set(matchData);
}

function fetchAndRenderGlobalLeaderboard(tabType, filterWordCount) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Caricamento...</p>';
    
    if (tabType === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        db.ref(`leaderboard/daily_challenge/${todayStr}`)
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, false);
        });
        return;
    }

    if (['standard_multi', 'chars_multi', 'quiz_multi'].includes(tabType)) {
        db.ref(`leaderboard/recent_matches/${tabType}`).once('value', snapshot => {
            let matches = [];
            snapshot.forEach(wcNode => { 
                if (filterWordCount === 'all' || wcNode.key === filterWordCount) {
                    wcNode.forEach(mNode => matches.push(mNode.val())); 
                }
            });
            matches.sort((a,b) => (b.ts || 0) - (a.ts || 0)); 
            renderMatchesHistoryHTML(matches.slice(0, 20), els.leaderboardContainer);
        });
        return;
    }

    if (tabType === 'pingpong') {
        if (filterWordCount !== 'all') {
            db.ref(`leaderboard/pingpong/${filterWordCount}`)
              .orderByChild('score')
              .limitToLast(50)
              .once('value', snapshot => {
                let players = [];
                if (snapshot.exists()) {
                    snapshot.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                }
                players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
            });
        } else {
            db.ref(`leaderboard/pingpong`).once('value', snapshot => {
                let players = [];
                if (snapshot.exists()) {
                    snapshot.forEach(wordCountNode => {
                        wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                    });
                }
                players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
            });
        }
        return;
    }

    if (tabType === 'callsign') {
        db.ref('leaderboard/callsign/global')
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, false);
        });
        return;
    }

    if (tabType === 'tournaments') {
        db.ref('leaderboard/tournaments')
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let teams = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) teams.push(child.val()); });
            }
            teams.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(teams.slice(0, 50), els.leaderboardContainer, false, true);
        });
        return;
    }

    if (tabType === 'active_tournament') {
        if (!activeTrnId) {
            els.leaderboardContainer.innerHTML = '';
            const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color);"; p.textContent = currentLang === 'it' ? "Non sei iscritto a nessun torneo attivo." : "You are not enrolled in any active tournament.";
            els.leaderboardContainer.appendChild(p);
        } else {
            db.ref(`tournaments/${activeTrnId}`).once('value', snap => {
                const trn = snap.val();
                if (trn && trn.standings) {
                    els.leaderboardContainer.innerHTML = '';
                    const header = document.createElement('div'); header.style.cssText = "text-align:center; margin-bottom:10px; padding:5px; background:var(--sec-bg-color); border-radius:8px;";
                    const hSmall = document.createElement('small'); hSmall.style.color = "var(--hint-color)"; hSmall.textContent = currentLang === 'it' ? 'Torneo Attivo:' : 'Active Tournament:';
                    const hB = document.createElement('b'); hB.style.cssText = "color:var(--champ-color); font-size:1.1em;"; hB.textContent = trn.name;
                    header.appendChild(hSmall); header.appendChild(document.createElement('br')); header.appendChild(hB);
                    els.leaderboardContainer.appendChild(header);

                    let std = Object.entries(trn.standings).map(([id, data]) => ({ name: data.name, score: data.points, date: currentLang === 'it' ? "In corso" : "In progress" }));
                    std.sort((a,b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                    const listCont = document.createElement('div');
                    renderPlayersListHTML(std.slice(0, 50), listCont, false, true);
                    els.leaderboardContainer.appendChild(listCont);
                } else {
                    els.leaderboardContainer.innerHTML = '';
                    const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color);"; p.textContent = currentLang === 'it' ? 'Dati torneo non disponibili.' : 'Tournament data unavailable.';
                    els.leaderboardContainer.appendChild(p);
                }
            });
        }
        return;
    }

    let isQuiz = tabType.startsWith('quiz');
    let isChars = tabType.startsWith('chars');
    let modePath = isQuiz ? 'quiz' : (isChars ? 'chars' : 'standard');
    let subType = isQuiz ? tabType.replace('quiz_', '') : (isChars ? tabType.replace('chars_', '') : tabType.replace('standard_', ''));

    if (filterWordCount !== 'all') {
        db.ref(`leaderboard/${modePath}/${subType}_${filterWordCount}`)
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
        });
    } else {
        db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(wordCountNode => {
                    const key = wordCountNode.key;
                    if (!key.startsWith(subType + "_")) return;
                    wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
        });
    }
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

function checkMyTeamStatus() {
    db.ref('teams').once('value', snap => {
        myTeamId = null; isTeamCaptain = false; myTeamName = "";
        snap.forEach(team => { 
            if (team.child('members').hasChild(myId)) { 
                myTeamId = team.key; 
                myTeamName = team.val().name; 
                isTeamCaptain = (team.val().captainId === myId); 
            } 
        });
        if (myTeamId) { 
            if (els.noTeamView) els.noTeamView.style.display = 'none'; 
            if (els.myTeamView) els.myTeamView.style.display = 'flex'; 
            listenToMyTeam(); 
            listenToTournaments(); 
            listenToAllTeams(true); 
            switchTeamTab('gest'); 
        } else { 
            if (els.myTeamView) els.myTeamView.style.display = 'none'; 
            if (els.noTeamView) els.noTeamView.style.display = 'flex'; 
            listenToAllTeams(false); 
            switchTeamTab('gest'); 
        }
    });
}

window.switchTeamTab = function(tab) {
    [els.tabTeamGestBtn, els.tabAllTeamsBtn, els.tabTournamentsBtn].forEach(b => { if (b) b.classList.remove('active-tab'); });
    if (els.noTeamView) els.noTeamView.style.display = 'none'; 
    if (els.myTeamView) els.myTeamView.style.display = 'none'; 
    if (els.allTeamsArea) els.allTeamsArea.style.display = 'none'; 
    if (els.tournamentsArea) els.tournamentsArea.style.display = 'none';
    
    if (tab === 'gest') { 
        if (els.tabTeamGestBtn) els.tabTeamGestBtn.classList.add('active-tab'); 
        if (myTeamId) { if (els.myTeamView) els.myTeamView.style.display = 'flex'; }
        else { if (els.noTeamView) els.noTeamView.style.display = 'flex'; }
    } else if (tab === 'allteams') { 
        if (els.tabAllTeamsBtn) els.tabAllTeamsBtn.classList.add('active-tab'); 
        if (els.allTeamsArea) els.allTeamsArea.style.display = 'flex'; 
        listenToAllTeams(!!myTeamId); 
    } else { 
        if (els.tabTournamentsBtn) els.tabTournamentsBtn.classList.add('active-tab'); 
        if (els.tournamentsArea) els.tournamentsArea.style.display = 'flex'; 
        listenToTournaments(); 
    }
};

if (els.createTeamBtn) {
    els.createTeamBtn.addEventListener('click', () => {
        const tName = els.newTeamName ? els.newTeamName.value.trim() : ""; 
        if (!tName) return;
        db.ref('teams').push().set({ name: tName, captainId: myId, status: 'open', members: { [myId]: { name: myName, username: myPrivacy ? "" : tgUsername } } }).then(() => checkMyTeamStatus());
    });
}

function listenToAllTeams(isAlreadyInTeam) {
    if (listeners.allTeams) db.ref('teams').off('value', listeners.allTeams);
    listeners.allTeams = db.ref('teams').on('value', snap => {
        if (els.openTeamsList) els.openTeamsList.innerHTML = ''; 
        if (els.globalAllTeamsList) els.globalAllTeamsList.innerHTML = '';
        
        snap.forEach(child => {
            const t = child.val(); 
            const count = Object.keys(t.members || {}).length; 
            if (t.status === 'retired' || count === 0) return;
            
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
            if (els.globalAllTeamsList) els.globalAllTeamsList.appendChild(liAll);

            if (!isAlreadyInTeam && t.status !== 'closed' && els.openTeamsList) {
                const liOpen = document.createElement('li'); liOpen.style.cursor = 'pointer'; liOpen.onclick = () => window.joinTeam(child.key);
                const leftOpen = document.createElement('span'); const bOpen = document.createElement('b'); bOpen.textContent = t.name; const smallOpen = document.createElement('small'); smallOpen.textContent = ` (${count} mem.)`; leftOpen.appendChild(bOpen); leftOpen.appendChild(smallOpen);
                const rightOpen = document.createElement('span'); rightOpen.style.color = 'var(--link-color)'; rightOpen.style.fontWeight = 'bold'; rightOpen.textContent = "+ Unisciti";
                liOpen.appendChild(leftOpen); liOpen.appendChild(rightOpen); els.openTeamsList.appendChild(liOpen);
            }
        });
        if (els.openTeamsList && !els.openTeamsList.innerHTML) {
            const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra aperta."; els.openTeamsList.appendChild(li);
        }
        if (els.globalAllTeamsList && !els.globalAllTeamsList.innerHTML) {
            const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra creata."; els.globalAllTeamsList.appendChild(li);
        }
    });
}

window.joinTeam = function(tId) { 
    db.ref(`teams/${tId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername }).then(() => checkMyTeamStatus()); 
};

function listenToMyTeam() {
    if (listeners.team) db.ref(`teams/${myTeamId}`).off('value', listeners.team);
    listeners.team = db.ref(`teams/${myTeamId}`).on('value', snap => {
        if (!snap.exists() || snap.val().status === 'retired') return checkMyTeamStatus();
        const team = snap.val(); 
        if (els.myTeamNameDisplay) els.myTeamNameDisplay.textContent = team.name; 
        if (els.teamStatusText) els.teamStatusText.innerHTML = team.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';
        if (els.captainName) els.captainName.innerHTML = ''; 
        if (els.teamOthersList) els.teamOthersList.innerHTML = '';
        
        Object.entries(team.members || {}).forEach(([id, mem]) => {
            const span = document.createElement('span'); span.textContent = mem.name;
            if (mem.username && String(mem.username).trim() !== "") { 
                span.style.color = 'var(--link-color)'; 
                span.style.cursor = 'pointer'; 
                span.style.textDecoration = 'underline'; 
                span.onclick = () => openTelegramProfile(mem.username); 
            }
            if (id === team.captainId) { 
                if (els.captainName) els.captainName.appendChild(span); 
            } else { 
                if (els.teamOthersList && els.teamOthersList.children.length > 0) { 
                    const sep = document.createElement('span'); sep.style.color = 'var(--hint-color)'; sep.textContent = ' | '; els.teamOthersList.appendChild(sep); 
                } 
                if (els.teamOthersList) els.teamOthersList.appendChild(span); 
            }
        });
        if (els.captainActions) els.captainActions.style.display = isTeamCaptain ? 'block' : 'none';
        if (els.toggleTeamLockBtn) {
            els.toggleTeamLockBtn.textContent = team.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni"; 
            els.toggleTeamLockBtn.onclick = () => db.ref(`teams/${myTeamId}/status`).set(team.status === 'open' ? 'closed' : 'open');
        }
        if (els.inviteTeamBtn) {
            els.inviteTeamBtn.onclick = () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=team_${myTeamId}`)}&text=${encodeURIComponent(`Unisciti alla mia squadra: ${team.name}!`)}`);
        }
        setupChat(db.ref(`teams/${myTeamId}/chat`), 'teamChatMessages', null);
    });
}

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

function listenToTournaments() {
    if (listeners.trn) db.ref('tournaments').off('value', listeners.trn);
    listeners.trn = db.ref('tournaments').on('value', snap => {
        activeTrnId = null; 
        if (els.openTournamentsList) els.openTournamentsList.innerHTML = ''; 
        if (els.pastTournamentsList) els.pastTournamentsList.innerHTML = '';
        if (els.createTrnPanel) els.createTrnPanel.style.display = isTeamCaptain ? 'flex' : 'none';
        
        let foundActive = null;
        snap.forEach(child => {
            const trn = child.val(); const trnId = child.key; const isMember = myTeamId && trn.teams && trn.teams[myTeamId]; const isHost = trn.hostId === myId;
            if ((isMember || isHost) && trn.status !== 'finished') { 
                if (!foundActive) foundActive = child; 
                else if (trn.status === 'playing' && foundActive.val().status !== 'playing') foundActive = child; 
            }
            if (trn.status === 'open') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const countSmall = document.createElement('small'); countSmall.textContent = ` (${Object.keys(trn.teams || {}).length} sq.)`; leftSpan.appendChild(nameB); leftSpan.appendChild(countSmall); li.appendChild(leftSpan);
                if (isTeamCaptain && !isMember) { 
                    const btn = document.createElement('button'); btn.className = 'action-btn-small btn-champ'; btn.textContent = 'Iscrivi'; btn.onclick = () => window.joinTournament(trnId); li.appendChild(btn); 
                } else if (isMember) { 
                    const joinedSmall = document.createElement('small'); joinedSmall.style.color = 'var(--link-color)'; joinedSmall.style.fontWeight = 'bold'; joinedSmall.textContent = ' (Iscritto)'; li.appendChild(joinedSmall); 
                }
                if (els.openTournamentsList) els.openTournamentsList.appendChild(li);
            } else if (trn.status === 'finished') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const statusSmall = document.createElement('small'); statusSmall.textContent = " (Concluso)"; leftSpan.appendChild(nameB); leftSpan.appendChild(statusSmall); li.appendChild(leftSpan);
                const btn = document.createElement('button'); btn.className = 'action-btn-small btn-secondary'; btn.textContent = 'Vedi Risultati'; btn.onclick = () => window.viewTournament(trnId);
                li.appendChild(btn); 
                if (els.pastTournamentsList) els.pastTournamentsList.appendChild(li);
            }
        });
        if (foundActive) { 
            activeTrnId = foundActive.key; 
            renderActiveTournament(foundActive); 
        } else { 
            if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'flex'; 
            if (els.trnActiveArea) els.trnActiveArea.style.display = 'none'; 
            if (els.openTournamentsList && !els.openTournamentsList.innerHTML) {
                const li1 = document.createElement('li'); li1.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li1.textContent = "Nessun torneo aperto."; els.openTournamentsList.appendChild(li1);
            }
            if (els.pastTournamentsList && !els.pastTournamentsList.innerHTML) {
                const li2 = document.createElement('li'); li2.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li2.textContent = "Nessun torneo concluso."; els.pastTournamentsList.appendChild(li2);
            }
        }
    });
}

window.viewTournament = function(tId) { 
    db.ref(`tournaments/${tId}`).once('value', snap => { 
        if (snap.exists()) { 
            activeTrnId = tId; 
            renderActiveTournament(snap); 
            if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none'; 
            if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex'; 
        } 
    }); 
};

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
// --- RENDER TORNEO ATTIVO CON PULSANTI SQUADRA AFFIANCATI E CHIARI ---
function renderActiveTournament(trnSnap) {
    if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none'; 
    if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex'; 
    const trn = trnSnap.val(); 
    if (!trn) return;

    const isFinished = trn.status === 'finished'; 
    if (els.activeTrnTitle) {
        els.activeTrnTitle.textContent = trn.name + (isFinished ? (currentLang === 'it' ? " (Concluso)" : " (Finished)") : "");
    }

    const amIHost = (trn.hostId === myId); 
    if (els.editTrnNameBtn) els.editTrnNameBtn.style.display = (amIHost && !isFinished) ? 'block' : 'none'; 
    if (els.leaveTrnBtn) els.leaveTrnBtn.style.display = (isTeamCaptain && !isFinished) ? 'block' : 'none';
    
    // 1. Render Tabella Classifica Torneo
    if (els.trnStandingsBody) {
        els.trnStandingsBody.innerHTML = ''; 
        let std = Object.entries(trn.standings || {}).map(([id, data]) => ({ id, ...data })); 
        std.sort((a, b) => b.points - a.points);
        
        std.forEach((s, idx) => {
            let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            const tr = document.createElement('tr'); 
            const tdMed = document.createElement('td'); tdMed.textContent = med; 
            const tdName = document.createElement('td'); const nameB = document.createElement('b'); nameB.textContent = s.name; tdName.appendChild(nameB);
            if (s.id === myTeamId) tdName.appendChild(document.createTextNode(" " + (currentLang === 'it' ? '(Voi)' : '(You)')));
            const tdPts = document.createElement('td'); const ptsB = document.createElement('b'); ptsB.textContent = s.points; tdPts.appendChild(ptsB);
            tr.appendChild(tdMed); tr.appendChild(tdName); tr.appendChild(tdPts); 
            els.trnStandingsBody.appendChild(tr);
        });
    }

    // 2. Controlli Organizzatore (Host)
    if (els.trnHostControls) els.trnHostControls.style.display = (amIHost && !isFinished) ? 'block' : 'none';
    if (els.finishTrnBtn) { 
        els.finishTrnBtn.style.display = (amIHost && trn.status === 'playing') ? 'block' : 'none'; 
        els.finishTrnBtn.onclick = () => { 
            if (confirm("Vuoi concludere manualmente il torneo?")) {
                db.ref(`tournaments/${activeTrnId}/status`).set('finished'); 
            }
        }; 
    }
    
    const teamCount = trn.teams ? Object.keys(trn.teams).length : 0; 
    if (els.trnTeamCountTxt) {
        els.trnTeamCountTxt.textContent = (currentLang === 'it' ? "Squadre Iscritte: " : "Enrolled Teams: ") + teamCount;
    }

    if (els.startTrnBtn) { 
        els.startTrnBtn.disabled = teamCount < 2 || (trn.status !== 'open' && trn.status !== 'playing'); 
        els.startTrnBtn.textContent = trn.status === 'playing' 
            ? (currentLang === 'it' ? "Rigenera Tabellone (Attenzione!)" : "Regenerate Bracket (Warning!)") 
            : (currentLang === 'it' ? "Genera Tabellone e Avvia" : "Generate Bracket and Start"); 
    }
    
    // 3. Render Tabellone Incontri (Bracket)
    if (els.trnBracketContainer) {
        els.trnBracketContainer.innerHTML = '';
        if (trn.status === 'open') {
            const waitP = document.createElement('p'); 
            waitP.style.textAlign = 'center'; 
            waitP.style.color = 'var(--hint-color)'; 
            waitP.style.fontSize = '0.9em'; 
            waitP.textContent = currentLang === 'it' ? "Il torneo è aperto, attendi l'avvio dall'organizzatore." : "The tournament is open, wait for the host to start."; 
            els.trnBracketContainer.appendChild(waitP);
        } else if (trn.matches) {
            Object.entries(trn.matches).forEach(([mId, m]) => {
                const isMyMatch = (m.teamA === myTeamId || m.teamB === myTeamId); 
                const card = document.createElement('div'); 
                card.className = 'match-card';
                if (isMyMatch) { 
                    card.style.borderColor = "var(--champ-color)"; 
                    card.style.borderWidth = "2px"; 
                }
                
                let aColor = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)"); 
                let bColor = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
                
                const matchCardTeams = document.createElement('div'); matchCardTeams.className = "match-card-teams";
                const tA = document.createElement('div'); tA.style.color = aColor; const bA = document.createElement('b'); bA.textContent = m.teamAName; tA.appendChild(bA);
                const mVs = document.createElement('div'); mVs.className = "match-vs"; mVs.textContent = "VS";
                const tB = document.createElement('div'); tB.style.color = bColor; const bB = document.createElement('b'); bB.textContent = m.teamBName; tB.appendChild(bB);
                matchCardTeams.appendChild(tA); matchCardTeams.appendChild(mVs); matchCardTeams.appendChild(tB);
                card.appendChild(matchCardTeams);

                if (m.status !== 'finished') {
                    const slotsDiv = document.createElement('div'); 
                    slotsDiv.style.display = 'flex'; 
                    slotsDiv.style.width = '100%'; 
                    slotsDiv.style.gap = '8px';
                    
                    // --- PULSANTE SQUADRA A (50% larghezza garantita) ---
                    const btnA = document.createElement('button'); 
                    btnA.className = 'slot-btn' + (m.playerA ? ' filled' : '');
                    btnA.style.flex = "1";
                    btnA.style.minWidth = "0";
                    btnA.style.margin = "0";
                    btnA.style.padding = "8px 4px";
                    btnA.style.fontSize = "0.85em";
                    btnA.innerHTML = m.playerA 
                        ? `✅ <b>${escapeHTML(m.playerA.name)}</b><br><small>(${escapeHTML(m.teamAName)})</small>` 
                        : `🟢 <b>Scegli per ${escapeHTML(m.teamAName)}</b><br><small>(Posto A)</small>`; 
                    btnA.onclick = () => window.toggleTrnSlot(mId, 'A', m.teamA, m.teamAName);
                    
                    // --- PULSANTE SQUADRA B (50% larghezza garantita) ---
                    const btnB = document.createElement('button'); 
                    btnB.className = 'slot-btn' + (m.playerB ? ' filled' : '');
                    btnB.style.flex = "1";
                    btnB.style.minWidth = "0";
                    btnB.style.margin = "0";
                    btnB.style.padding = "8px 4px";
                    btnB.style.fontSize = "0.85em";
                    btnB.innerHTML = m.playerB 
                        ? `✅ <b>${escapeHTML(m.playerB.name)}</b><br><small>(${escapeHTML(m.teamBName)})</small>` 
                        : `🟢 <b>Scegli per ${escapeHTML(m.teamBName)}</b><br><small>(Posto B)</small>`; 
                    btnB.onclick = () => window.toggleTrnSlot(mId, 'B', m.teamB, m.teamBName);
                    
                    slotsDiv.appendChild(btnA); 
                    slotsDiv.appendChild(btnB); 
                    card.appendChild(slotsDiv);
                    
                    // --- PULSANTE ENTRA NELLA SFIDA (Appare appena entrambi sono occupati) ---
                    if (m.playerA && m.playerB && (m.playerA.id === myId || m.playerB.id === myId)) {
                        const joinBtn = document.createElement('button'); 
                        joinBtn.className = 'btn-success'; 
                        joinBtn.style.fontSize = '0.9em'; 
                        joinBtn.style.padding = '8px'; 
                        joinBtn.style.marginTop = '8px'; 
                        joinBtn.textContent = currentLang === 'it' ? '⚡ ENTRA NELLA SFIDA' : '⚡ JOIN MATCH'; 
                        joinBtn.onclick = () => window.startTrnMatch(mId); 
                        card.appendChild(joinBtn);
                    }
                } else { 
                    const finDiv = document.createElement('div'); 
                    finDiv.style.fontSize = '0.85em'; 
                    finDiv.style.color = '#4caf50'; 
                    finDiv.style.fontWeight = 'bold'; 
                    finDiv.style.marginTop = '5px'; 
                    finDiv.textContent = currentLang === 'it' ? 'Concluso' : 'Finished'; 
                    card.appendChild(finDiv); 
                }
                els.trnBracketContainer.appendChild(card);
            });
        }
    }
}


// --- CONTROLLO SLOT CON MESSAGGIO DI ERRORE ESPLICITO ---
window.toggleTrnSlot = function(matchId, side, teamId, targetTeamName = "questa squadra") {
    if (teamId !== myTeamId) {
        return alert(`⚠️ Questo posto è riservato alla squadra "${targetTeamName}"!\n\nTu fai parte della squadra "${myTeamName || 'Nessuna'}": premi sul pulsante destinato alla tua squadra.`);
    }
    const slotRef = db.ref(`tournaments/${activeTrnId}/matches/${matchId}/player${side}`);
    slotRef.once('value', snap => { 
        if (!snap.exists()) {
            slotRef.set({ id: myId, name: myName }); 
        } else if (snap.val().id === myId) {
            slotRef.remove(); // Se ripremi sul tuo nome, ti rimuovi dallo slot
        } else {
            alert("⚠️ Questo posto è già stato occupato da " + snap.val().name); 
        }
    });
};

// --- AVVIO DELL'INCONTRO DI TORNEO ---
window.startTrnMatch = function(matchId) {
    const rc = "TRN_" + matchId;
    db.ref(`rooms/${rc}`).once('value', s => {
        if (s.exists()) {
            window.joinSpecificRoom(rc);
        } else {
            db.ref('rooms/' + rc).set({ 
                status: 'waiting', 
                type: 'multi', 
                mode: 'pingpong', 
                wpm: 20, 
                tone: 600, 
                wordCount: 20, 
                fixedSpeed: false, 
                createdAt: firebase.database.ServerValue.TIMESTAMP, 
                expiresAt: Date.now() + 1800000, 
                hostId: myId 
            }).then(() => window.joinSpecificRoom(rc));
        }
    });
};

// --- ATTIVITÀ, MEDAGLIE E STATISTICHE UTENTE ---
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); 
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0');
}

function updateActivity(won = false) {
    const now = new Date(); 
    const dKey = now.toISOString().split('T')[0]; 
    const wKey = getWeekNumber(now); 
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    ['daily/'+dKey, 'weekly/'+wKey, 'monthly/'+mKey].forEach(path => {
        db.ref(`activity/${path}/${myId}`).transaction(data => {
            if (!data) return { name: myName, games: 1, wins: won ? 1 : 0, lastPlayed: firebase.database.ServerValue.TIMESTAMP };
            data.games = (data.games || 0) + 1; 
            if (won) data.wins = (data.wins || 0) + 1; 
            data.name = myName; 
            data.lastPlayed = firebase.database.ServerValue.TIMESTAMP; 
            return data;
        }).then(() => { if (path.startsWith('daily')) checkActivityAndAwardMedals(); });
    });
}

async function checkActivityAndAwardMedals() {
    const now = new Date(); 
    const dKey = now.toISOString().split('T')[0]; 
    const wKey = getWeekNumber(now); 
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    try {
        const [dSnap, wSnap, mSnap, uMedals] = await Promise.all([ db.ref(`activity/daily/${dKey}/${myId}`).once('value'), db.ref(`activity/weekly/${wKey}/${myId}`).once('value'), db.ref(`activity/monthly/${mKey}/${myId}`).once('value'), db.ref(`users/${myId}/medals`).once('value') ]);
        const dData = dSnap.val() || { games: 0 }, wData = wSnap.val() || { games: 0 }, mData = mSnap.val() || { games: 0 };
        let myMedals = uMedals.val() || {};

        const validKeys = [dKey, wKey, mKey, 'daily_champ'];
        for (let id in myMedals) {
            if (!validKeys.includes(myMedals[id].periodKey)) {
                await db.ref(`users/${myId}/medals/${id}`).remove();
                delete myMedals[id];
            }
        }

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
    if (els.overlayMedalIcon) els.overlayMedalIcon.textContent = icon; 
    if (els.overlayMedalTitle) els.overlayMedalTitle.textContent = title; 
    if (els.overlayMedalDesc) els.overlayMedalDesc.textContent = desc; 
    if (els.medalOverlay) els.medalOverlay.style.display = 'flex';
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
        Object.values(snap.val()).forEach(m => { 
            const span = document.createElement('span'); 
            span.textContent = (m.count && m.count > 1) ? `${m.count}x ${m.icon}` : m.icon; 
            span.title = `${m.title} (${m.date})`; 
            span.onclick = () => showToast(`${m.title} - ${m.date}`); 
            span.style.cursor = "pointer"; 
            els.myMedalsContainer.appendChild(span); 
        });
    });
}

window.switchActTab = function(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab')); 
    if (els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`]) {
        els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`].classList.add('active-tab');
    }
    const now = new Date(); 
    let key = period === 'daily' ? now.toISOString().split('T')[0] : period === 'weekly' ? getWeekNumber(now) : now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    if (els.actListTitle) {
        els.actListTitle.textContent = period === 'daily' ? "I più attivi di Oggi" : period === 'weekly' ? "I più attivi della Settimana" : "I più attivi del Mese";
    }
    renderActivityRankings(period, key); 
    updateMedalGallery();
};

function renderActivityRankings(period, key) {
    if (!els.activityRankList) return;
    els.activityRankList.innerHTML = '';
    const loadLi = document.createElement('li'); loadLi.style.cssText = "justify-content:center; color:var(--hint-color);"; loadLi.textContent = "Caricamento..."; els.activityRankList.appendChild(loadLi);
    
    db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = ''; 
        let users = [];
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

// --- AZIONI PROFILO E IMPOSTAZIONI UTENTE ---
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

window.showProfileScreen = function() {
    showScreen('profileScreen'); 
    if (els.errorChartContainer) els.errorChartContainer.textContent = 'Caricamento...'; 
    if (els.wpmErrorChartContainer) els.wpmErrorChartContainer.textContent = 'Caricamento...'; 
    if (els.matchHistoryList) els.matchHistoryList.textContent = 'Caricamento...';
    
    db.ref(`users/${myId}/stats/charErrors`).once('value').then(snap => {
        if (!els.errorChartContainer) return;
        const errors = snap.val() || {}; 
        els.errorChartContainer.innerHTML = ''; 
        const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) { 
            const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore.'; els.errorChartContainer.appendChild(p); 
        } else {
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
        if (!els.wpmErrorChartContainer) return;
        const wpmErrors = snap.val() || {}; 
        els.wpmErrorChartContainer.innerHTML = '';
        if (Object.keys(wpmErrors).length === 0) { 
            const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore per WPM.'; els.wpmErrorChartContainer.appendChild(p); 
            return; 
        }
        Object.keys(wpmErrors).sort((a,b) => parseInt(b) - parseInt(a)).forEach(wpm => {
            let charsAtWpm = wpmErrors[wpm]; 
            let totalErrs = Object.values(charsAtWpm).reduce((acc, curr) => acc + curr, 0); 
            let topChar = Object.entries(charsAtWpm).sort((a,b) => b[1] - a[1])[0];
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
        if (!els.matchHistoryList) return;
        els.matchHistoryList.innerHTML = ''; 
        userMatchHistory = [];
        snap.forEach(child => { userMatchHistory.push({ key: child.key, ...child.val() }); }); 
        userMatchHistory.reverse();
        if (userMatchHistory.length === 0) { 
            const li = document.createElement('li'); li.style.justifyContent = 'center'; li.style.color = 'var(--hint-color)'; li.textContent = 'Nessuna partita giocata.'; els.matchHistoryList.appendChild(li); 
            return; 
        }
        userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now()); 
            const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            let modeIcon = match.mode === 'callsign' ? '🎙️ Nom.' : match.mode === 'pingpong' ? '🏓 Ping Pong' : match.mode === 'chars' ? '⌨️ Carat.' : (match.mode === 'daily_challenge' ? '📅 Daily' : match.mode === 'quiz' ? '❓ Quiz' : '🔤 Parole');
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
};

window.openMatchDetails = function(matchKey) {
    const match = userMatchHistory.find(m => m.key === matchKey); 
    if (!match || !els.matchDetailsBody || !els.matchDetailsModal) return;
    els.matchDetailsBody.innerHTML = '';
    (match.details || []).forEach(row => {
        const tr = document.createElement('tr'); 
        let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
};

window.deleteHistoryItem = function(key) { 
    if (confirm("Eliminare questa partita?")) {
        db.ref(`users/${myId}/history/${key}`).remove().then(() => showProfileScreen()); 
    }
};

async function syncUserNameEverywhere(userId, newName, newUsername) {
    await db.ref(`presence/${userId}`).update({ name: newName, username: newUsername });
    if (roomCode) await db.ref(`rooms/${roomCode}/players/${userId}`).update({ name: newName, username: newUsername });
    const now = new Date(); 
    const dKey = now.toISOString().split('T')[0]; 
    const wKey = getWeekNumber(now); 
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) { 
        const actRef = db.ref(`${path}/${userId}`); 
        const actSnap = await actRef.once('value'); 
        if (actSnap.exists()) await actRef.update({ name: newName }); 
    }
    if (myTeamId) await db.ref(`teams/${myTeamId}/members/${userId}`).update({ name: newName, username: newUsername });
    
    const trnsSnap = await db.ref('tournaments').once('value');
    if (trnsSnap.exists()) {
        const trns = trnsSnap.val();
        for (let trnId in trns) {
            if (trns[trnId].status !== 'finished' && trns[trnId].matches) {
                for (let mId in trns[trnId].matches) {
                    const m = trns[trnId].matches[mId];
                    if (m.playerA && m.playerA.id === userId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).update({ name: newName, username: newUsername });
                    if (m.playerB && m.playerB.id === userId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).update({ name: newName, username: newUsername });
                }
            }
        }
    }
    for (const path of ['callsign/global', 'standard', 'pingpong', 'chars', 'quiz']) {
        const snap = await db.ref(`leaderboard/${path}`).once('value');
        if (snap.exists()) {
            snap.forEach(subNode => { 
                if (path === 'callsign/global') { 
                    if (subNode.key === userId) subNode.ref.update({ name: newName, username: newUsername }); 
                } else { 
                    subNode.forEach(userRecord => { 
                        if (userRecord.key === userId) userRecord.ref.update({ name: newName, username: newUsername }); 
                    }); 
                } 
            });
        }
    }
}

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
