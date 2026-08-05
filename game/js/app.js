// ============================================================================
// APP.JS - PARTE 1 DI 2
// ============================================================================

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260805.132";

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;
const tgUsername = tgUser?.username || "";
const startParam = tg.initDataUnsafe?.start_param;

// --- GESTIONE SCHERMO RESIZE E TASTIERA MOBILE ---
if (tg.isExpanded === false) {
    tg.expand();
}
if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
}
tg.onEvent('viewportChanged', function(eventData) {
    if (eventData.isStateStable) {
        document.body.style.height = `${tg.viewportStableHeight}px`;
    }
});
document.body.style.height = `${tg.viewportStableHeight || window.innerHeight}px`;

// --- MAPPA DOM DINAMICA (Proxy) ---
const els = new Proxy({}, { get: (target, id) => document.getElementById(id) });

// --- COSTANTI ---
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

// --- STATO GLOBALE ---
let myName, myId, myPrivacy = false;
let myTeamId = null, myTeamName = "", isTeamCaptain = false;
let db, auth, currentLang = 'it';
let activeChatContext = null, activeTab = "room", isChatDrawerOpen = false;
let isGlobalChatMuted = false;
let isChatCwEnabled = false, chatCwWpm = 20, chatCwTone = 600;
let chatCwAudioQueue = [], isChatCwPlaying = false;
window.lastPlayedCwMsgTs = 0; // TRACKER ANTI-DOPPIO AUDIO CW CHAT

let isChallenging = false, isRejoining = false, currentInviterId = null;
let roomCode = "", roomHostId = null, activeTrnId = null;
let lastPlayerCount = 0, gameStartPlayerCount = 0;
let gameRunning = false, inputActive = false, audioCtx = null;
let gameWords = [], wordIndex = 0, currentWpm = 20, baseWpm = 20, currentTone = 600;
let totalScore = 0, currentStreak = 0, usedReplay = false, matchDetailsArray = [];
let isSinglePlayer = false, currentMode = "standard", requestedWordCount = 10;
let isFixedSpeed = false, isEasyMode = false, lastWordStartTime = 0;

// STATO GLOBALE CO-OP (CONQUISTA)
let isCoopMode = false, coopActiveFreqIndex = 0;
let coopTimerInterval = null, coopDecayInterval = null;

// TIMERS SISTEMA
let lobbyTimerInterval = null, quizTimerInterval = null, ppTimerInterval = null;
let brCheckInterval = null, brTimerInterval = null;
let serverTimeOffset = 0;

let brBannerTimeout = null;
let brBannerDismissedToday = false;
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

const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, roomsList: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

// --- GESTIONE INTERVALLI IN SICUREZZA ---
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
    const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
}

window.openTelegramProfile = function(username) {
    if (username && String(username).trim() !== "") tg.openTelegramLink('https://t.me/' + username);
    else tg.showAlert("Questo utente ha impostato la privacy o non ha uno username pubblico.");
}

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

function populateGameModesUI() {
    if (!els.gameModeInput) return;
    if (!window.GAME_MODES) window.GAME_MODES = {};
    
    if (!window.GAME_MODES["conquest"]) {
        window.GAME_MODES["conquest"] = {
            id: "conquest",
            titleIt: "Conquista (Co-op)",
            titleEn: "Conquest (Co-op)",
            icon: "⚔️",
            defaultWpm: 20,
            defaultWordCount: 50,
            wpmConfigurable: true,
            wordCountConfigurable: false,
            fixedSpeedAllowed: false,
            spacingConfigurable: true,
            generateWords: function(num, dicts) {
                return (dicts.master || []).sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
            }
        };
    }

    const select = els.gameModeInput;
    const trnGroup = els.trn_opt_group;
    const currentVal = select.value || 'standard';
    select.innerHTML = '';
    
    Object.values(window.GAME_MODES).forEach(mode => {
        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.id = 'txt_opt_' + mode.id;
        opt.textContent = currentLang === 'en' ? mode.titleEn : mode.titleIt;
        select.appendChild(opt);
    });
    
    if (trnGroup) select.appendChild(trnGroup);
    if (window.GAME_MODES[currentVal]) select.value = currentVal;
    else select.value = 'standard';
}

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

    populateGameModesUI();
    checkGameTypeUI();
    updateMuteBtnUI();
    if (activeTrnId) db.ref(`tournaments/${activeTrnId}`).once('value', snap => { if(snap.exists()) renderActiveTournament(snap); });
}

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

function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
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

if (!tgUser) { els.loadingScreen.classList.remove('active-screen'); els.errorScreen.classList.add('active-screen'); } 
else { myName = tgUser.first_name; myId = tgUser.id.toString(); initGame(); }

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
            const userData = (await db.ref(`users/${myId}`).once('value')).val() || {};
            if (userData.alias) myName = userData.alias;
            myPrivacy = userData.privacyUsername || false; 
            if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = myPrivacy;
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

        checkYesterdayDailyMedal();

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
            } else showScreen('setupScreen');
        }

        const savedLang = localStorage.getItem('gameLang'); 
        if (savedLang) setLanguage(savedLang);
        else updateMuteBtnUI();
        
        loadDictionaries().then(() => {
            let todayStr = new Date().toISOString().split('T')[0];
            let lastShown = localStorage.getItem(STORAGE_DAILY_SHOWN);
            if (lastShown !== todayStr && !startParam) {
                if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'flex';
            }
        });

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) { 
            try { 
                customDictionary = JSON.parse(savedCustom); 
                updateCustomDictStatus(); 
            } catch(e) {} 
        }

        checkActivityAndAwardMedals(); 
        checkTournamentPopup();
        listenToRooms(); 
        listenToOnlineUsers(); 
        listenToInvites(); 
        listenToInviteAccepted();
        
        initBattleRoyaleScheduler(); 
        loadRegolamento();

        if(els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
        if(els.appVersionFooter) els.appVersionFooter.textContent = APP_VERSION;

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) {
                if (els.updateBanner) els.updateBanner.style.display = 'block';
            } else {
                if (els.updateBanner) els.updateBanner.style.display = 'none';
            }
        });

    }).catch(e => {
        if (els.loadingText) { 
            els.loadingText.textContent = "Errore di Connessione."; 
            els.loadingText.style.color = "red"; 
            els.loadingText.style.fontWeight = "bold"; 
        }
    });

    populateGameModesUI();
    checkGameTypeUI();
}

async function checkYesterdayDailyMedal() {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const checkRef = db.ref(`users/${myId}/daily_medals_awarded/${yesterday}`);
    const checkSnap = await checkRef.once('value');
    if (checkSnap.exists()) return;

    const lbSnap = await db.ref(`leaderboard/daily_challenge/${yesterday}`).once('value');
    if (!lbSnap.exists()) return;

    let players = [];
    lbSnap.forEach(child => { players.push({ id: child.key, ...child.val() }); });
    players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

    let myRank = players.findIndex(p => p.id === myId);
    if (myRank >= 0 && myRank <= 2) {
        let medalId = myRank === 0 ? 'daily_gold' : (myRank === 1 ? 'daily_silver' : 'daily_bronze');
        let medalIcon = myRank === 0 ? '🥇' : (myRank === 1 ? '🥈' : '🥉');
        let medalTitle = myRank === 0 ? 'Oro Giornaliero' : (myRank === 1 ? 'Argento Giornaliero' : 'Bronzo Giornaliero');
        
        const medalRef = db.ref(`users/${myId}/medals/${medalId}`);
        const mSnap = await medalRef.once('value');
        let currentCount = mSnap.exists() ? (mSnap.val().count || 1) : 0;
        
        await medalRef.set({
            title: medalTitle,
            icon: medalIcon,
            date: new Date().toLocaleDateString('it-IT'),
            periodKey: 'daily_champ', 
            count: currentCount + 1
        });
        
        showToast(`Complimenti! Hai vinto la medaglia ${medalIcon} per la Sfida di Ieri!`);
    }
    await checkRef.set(true);
    updateMedalGallery();
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

function playNotificationSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playBeep(880, 0.08);
    setTimeout(() => playBeep(1100, 0.1), 120);
}

function playMorseAudio(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (!forcePlay && (!gameRunning && !brIsPlaying)) { resolve(); return; }

        let charUnit = 1.2 / wpm;
        let effSpaceWpm = (window.charSpaceWpm && window.charSpaceWpm < wpm) ? window.charSpaceWpm : wpm;
        let spaceUnit = 1.2 / effSpaceWpm;
        let wordMult = window.wordSpaceMult || 1.0;

        let time = audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (!forcePlay && !gameRunning && !brIsPlaying) break;
            
            if (morseDict[char]) {
                for (let i = 0; i < morseDict[char].length; i++) {
                    if (!forcePlay && !gameRunning && !brIsPlaying) break;
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
                    
                    time += duration;
                    if (i < morseDict[char].length - 1) {
                        time += charUnit;
                    }
                }
                time += (3 * spaceUnit);
            } else if (char === ' ') {
                let totalWordSpace = (7 * spaceUnit) * wordMult;
                let remainingSpace = totalWordSpace - (3 * spaceUnit);
                time += Math.max(0, remainingSpace);
            }
        }
        setTimeout(resolve, Math.max(0, (time - audioCtx.currentTime) * 1000));
    });
}

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

window.toggleChat = function() {
    if (els.chatDrawer.style.display === 'none') {
        els.chatDrawer.style.display = 'flex'; isChatDrawerOpen = true;
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    } else { els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false; }
}

function hideChat() {
    if(els.chatDrawer) els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false;
    chatCwAudioQueue = [];
    Object.keys(listeners.activeChat).forEach(key => { 
        listeners.activeChat[key].ref.off('value', listeners.activeChat[key].callback); 
        delete listeners.activeChat[key]; 
    });
}

function listenToChat() {
    if (activeChatContext === 'room' && roomCode) {
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null); 
        setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
        if(els.chatTitle) els.chatTitle.textContent = "💬 Chat Stanza";
        if (els.gameArea && els.gameArea.classList.contains('active-screen')) { 
            els.chatDrawer.style.display = 'none'; 
            isChatDrawerOpen = false; 
        }
    } else {
        setupChat(db.ref('globalChat'), 'chatMessages', null); 
        if(els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
}

window.openGlobalChat = function() { 
    activeChatContext = 'global'; 
    listenToChat(); 
    toggleChat(); 
}

if(els.sendLobbyChatBtn) els.sendLobbyChatBtn.addEventListener('click', () => {
    const txt = els.lobbyChatInput.value.trim(); if (!txt || !roomCode) return;
    const msgRef = db.ref(`rooms/${roomCode}/chat`).push(); msgRef.onDisconnect().remove();
    msgRef.set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP }); 
    els.lobbyChatInput.value = '';
});

if(els.lobbyChatInput) els.lobbyChatInput.addEventListener('keypress', e => { 
    if (e.key === 'Enter') els.sendLobbyChatBtn.click(); 
});

// BUG 1 CORRETTO: Aggiunta verifica window.lastPlayedCwMsgTs per impedire l'accodamento doppio di audio CW in co-op
function setupChat(chatRef, containerId, alertBtnId) {
    const container = els[containerId]; if (!container) return;
    if (listeners.activeChat[containerId]) {
        listeners.activeChat[containerId].ref.off('value', listeners.activeChat[containerId].callback);
    }
    let initialLoad = true, lastTs = Date.now();
    
    const callback = chatRef.limitToLast(10).on('value', snapshot => {
        container.innerHTML = ''; let newMsgsCount = 0, latestMsg = null, maxTs = lastTs;
        
        snapshot.forEach(child => {
            const msg = child.val(); const div = document.createElement('div'); div.style.marginBottom = '6px';
            
            if(msg.ts) {
                const d = new Date(msg.ts); const dateSmall = document.createElement('small');
                dateSmall.style.color = 'var(--hint-color)'; dateSmall.style.fontSize = '0.75em';
                dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                div.appendChild(dateSmall); if(msg.ts > maxTs) maxTs = msg.ts;
            }
            
            const nameB = document.createElement('b'); nameB.style.color = 'var(--link-color)'; nameB.textContent = msg.name + ": ";
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
            }
        });
        
        lastTs = maxTs; container.scrollTop = container.scrollHeight;
        
        if (!initialLoad && newMsgsCount > 0 && latestMsg) {
            if (alertBtnId && !isChatDrawerOpen && els[alertBtnId]) {
                els[alertBtnId].style.backgroundColor = '#4caf50';
            }

            const isGlobal = (chatRef.key === 'globalChat');
            const shouldNotify = isGlobal
                ? (!isGlobalChatMuted && !gameRunning && (!isChatDrawerOpen || activeChatContext !== 'global'))
                : (!isChatDrawerOpen || chatRef.key !== (activeChatContext === 'room' ? roomCode : myTeamId));

            if (isChatCwEnabled) {
                if (shouldNotify) {
                    const prefix = isGlobal ? "🌎" : "💬";
                    showToast(`${prefix} ${latestMsg.name}: [📻 Messaggio CW...]`);
                }
                if (shouldNotify || (isChatDrawerOpen && activeChatContext === (isGlobal ? 'global' : 'room'))) {
                    // CONTROLLO ANTI-DOPPIO AUDIO CW CHAT: Viene messo in coda solo se non è già stato suonato per questo timestamp
                    if (latestMsg.ts > (window.lastPlayedCwMsgTs || 0)) {
                        window.lastPlayedCwMsgTs = latestMsg.ts;
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

if(els.sendChatBtn) {
    els.sendChatBtn.addEventListener('click', () => {
        const txt = els.chatInput.value.trim(); if (!txt) return;
        let msgRef = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
        msgRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP })
            .catch(e => showToast("Errore invio: " + e.message)); 
        els.chatInput.value = '';
    });
}

if(els.chatInput) {
    els.chatInput.addEventListener('keypress', e => { 
        if (e.key === 'Enter') els.sendChatBtn.click(); 
    });
}

if(els.clearChatBtn) {
    els.clearChatBtn.addEventListener('click', () => { 
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
    });
}

if (els.muteGlobalChatBtn) {
    els.muteGlobalChatBtn.addEventListener('click', () => {
        isGlobalChatMuted = !isGlobalChatMuted;
        localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted);
        if (typeof updateMuteBtnUI === 'function') updateMuteBtnUI();
        showToast(isGlobalChatMuted ? (currentLang==='it'?"Notifiche Chat silenziate.":"Chat notifications muted.") : (currentLang==='it'?"Notifiche Chat riattivate.":"Chat notifications unmuted."));
    });
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
        if (!currentVal.startsWith('trn_')) select.value = "trn_join_team";
        else select.value = currentVal;
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
        if (currentVal === 'conquest' || currentVal.startsWith('trn_')) select.value = 'standard';
        else select.value = currentVal || 'standard';
    }

    const selectedMode = select.value;
    const modeCfg = window.GAME_MODES ? window.GAME_MODES[selectedMode] : null;
    const isCustom = selectedMode === 'custom';
    const isChars = selectedMode === 'chars';
    const isPP = selectedMode === 'pingpong';

    els.timeoutDiv.style.display = isSingle || isTrn ? 'none' : 'block';
    
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
    } else {
        els.fixedSpeedContainer.style.display = isSingle ? 'flex' : 'none';
        els.easyModeContainer.style.display = isSingle ? 'flex' : 'none';
        if (els.advancedSpacingContainer) {
            els.advancedSpacingContainer.style.display = (isSingle && !isChars && !isPP) ? 'flex' : 'none';
        }
    }

    els.customDictControl.style.display = (isSingle && isCustom) ? 'flex' : 'none';

    if (els.spectatorContainer) {
        els.spectatorContainer.style.display = isSingle ? 'flex' : 'none';
    }

    if (isCoop) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Crea Stanza Co-op ⚔️" : "Create Co-op Room ⚔️";
    } else if (isTrn) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
    } else {
        els.createRoomBtn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
    }
    
    if(!isSingle) { 
        if(els.fixedSpeedCheckbox) els.fixedSpeedCheckbox.checked = false; 
        if(els.easyModeCheckbox) els.easyModeCheckbox.checked = false; 
        if(els.allowSpectatorsCheckbox) els.allowSpectatorsCheckbox.checked = false;
    }
}

if(els.gameModeInput) els.gameModeInput.addEventListener('change', e => {
    const mode = e.target.value;
    const modeCfg = window.GAME_MODES ? window.GAME_MODES[mode] : null;
    const isPP = mode === 'pingpong';
    
    if (isPP) { els.gameTypeInput.value = 'multi'; els.gameTypeInput.disabled = true; checkGameTypeUI(); } 
    else els.gameTypeInput.disabled = false;
    
    ['startWpmInput', 'wordCountInput', 'toneInput'].forEach(id => { 
        if (modeCfg) {
            if (id === 'startWpmInput') {
                els[id].disabled = !modeCfg.wpmConfigurable;
                if (!modeCfg.wpmConfigurable) els[id].value = modeCfg.defaultWpm || 20;
                else if (localStorage.getItem(STORAGE_PREF_WPM)) els[id].value = localStorage.getItem(STORAGE_PREF_WPM);
            }
            if (id === 'wordCountInput') {
                els[id].disabled = !modeCfg.wordCountConfigurable;
                if (!modeCfg.wordCountConfigurable) els[id].value = modeCfg.defaultWordCount || 10;
                else if (localStorage.getItem(STORAGE_PREF_WORDS)) els[id].value = localStorage.getItem(STORAGE_PREF_WORDS);
            }
        }
    });
    
    if (modeCfg) {
        els.fixedSpeedCheckbox.disabled = !modeCfg.fixedSpeedAllowed;
        if(!modeCfg.fixedSpeedAllowed) els.fixedSpeedCheckbox.checked = false;
    }
    checkGameTypeUI();
});
if(els.gameTypeInput) els.gameTypeInput.addEventListener('change', checkGameTypeUI);

if (els.startWpmInput) els.startWpmInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_WPM, e.target.value));
if (els.wordCountInput) els.wordCountInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_WORDS, e.target.value));
if (els.toneInput) els.toneInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_TONE, e.target.value));
if (els.charSpaceInput) els.charSpaceInput.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_CHAR_SPACE, e.target.value));
if (els.wordSpaceSelect) els.wordSpaceSelect.addEventListener('change', e => localStorage.setItem(STORAGE_PREF_WORD_SPACE, e.target.value));

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

function getGameWords(num, mode) {
    if (mode === 'daily_challenge') return getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: masterDictionary, custom: customDictionary });
    }
    return masterDictionary.sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
}

window.showRoomEventModal = function(title, text) { els.roomEventTitle.textContent = title; els.roomEventText.textContent = text; els.roomEventModal.style.display = 'flex'; playBeep(600, 0.2); setTimeout(() => playBeep(800, 0.3), 200); }
if(els.goToRoomBtn) els.goToRoomBtn.addEventListener('click', () => { els.roomEventModal.style.display = 'none'; if (roomCode) joinRoomLogic(false); });
window.checkTournamentPopup = function() { if (localStorage.getItem('hideTrnWelcomePopup') === 'true' || myTeamId) return; setTimeout(() => { if(els.tournamentWelcomeModal) els.tournamentWelcomeModal.style.display = 'flex'; }, 1500); }
window.closeTrnWelcomeModal = function() { if (els.stopShowingTrnPopup && els.stopShowingTrnPopup.checked) localStorage.setItem('hideTrnWelcomePopup', 'true'); if(els.tournamentWelcomeModal) els.tournamentWelcomeModal.style.display = 'none'; }
window.goToTournamentsFromPopup = function() { closeTrnWelcomeModal(); showScreen('teamsScreen'); }

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
        els.inviteModal.style.display = 'none';
        try {
            db.ref(`presence/${myId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);
        } catch(e) {}

        if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);
        listeners.outgoingInvite = db.ref(`invites/${tId}`).on('value', snap => { 
            if (!snap.exists() && isChallenging) setTimeout(() => { 
                if (isChallenging) { 
                    showToast("Rifiutato o scaduto."); 
                    isChallenging = false; currentInviterId = null; 
                    try {
                        db.ref(`presence/${myId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);
                    } catch(e) {}
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
    db.ref(`rooms/${rCode}`).set({ status: 'waiting', type: 'multi', mode: inv.mode, wpm: inv.wpm, tone: 600, wordCount: inv.wordCount, words: getGameWords(inv.wordCount, inv.mode), createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 600000, hostId: inv.fromId }).then(() => { 
        db.ref(`public_lobby_rooms/${rCode}`).set({ mode: inv.mode, pCount: 1, wpm: inv.wpm, wordCount: inv.wordCount, status: 'waiting', expiresAt: Date.now() + 600000 });
        db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode }); 
        roomCode = rCode; 
        joinRoomLogic(false); 
    });
});

function listenToInviteAccepted() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => { const d = snap.val(); if (d && d.roomCode) { db.ref(`invite_accepted/${myId}`).remove(); isChallenging = false; window.closeInviteModal(); roomCode = d.roomCode; joinRoomLogic(false); } });
}

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
        if (listeners.presence) {
            if (listeners.presence.ref) {
                listeners.presence.ref.off('child_added', listeners.presence.onAdded);
                listeners.presence.ref.off('child_changed', listeners.presence.onChanged);
                listeners.presence.ref.off('child_removed', listeners.presence.onRemoved);
            }
            listeners.presence = null;
        }
        if (listeners.roomsList) {
            if (listeners.roomsList.ref) {
                listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
                listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
                listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
            }
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

function listenToRooms() {
    if (listeners.roomsList) return;

    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    const lobbyRef = db.ref('public_lobby_rooms').orderByChild('status').equalTo('waiting').limitToLast(20);

    const onAdded = lobbyRef.on('child_added', snap => {
        addOrUpdateRoomCard(snap.key, snap.val());
    });

    const onChanged = lobbyRef.on('child_changed', snap => {
        addOrUpdateRoomCard(snap.key, snap.val());
    });

    const onRemoved = lobbyRef.on('child_removed', snap => {
        removeRoomCard(snap.key);
    });

    listeners.roomsList = { ref: lobbyRef, onAdded, onChanged, onRemoved };
}
// ============================================================================
// APP.JS - PARTE 2 DI 2
// ============================================================================

window.joinSpecificRoom = function(code) { roomCode = code; joinRoomLogic(false); }

// --- CREAZIONE STANZA ---
if(els.createRoomBtn) els.createRoomBtn.addEventListener('click', () => {
    const gameType = els.gameTypeInput.value, gameMode = els.gameModeInput.value;
    if (gameType === 'tournament') { showScreen('teamsScreen'); if (gameMode === 'trn_create_team') switchTeamTab('gest'); else if (gameMode === 'trn_join_team') switchTeamTab('allteams'); else if (gameMode === 'trn_create_trn') switchTeamTab('tournaments'); return; }
    if (gameMode === 'custom' && customDictionary.length === 0) { els.customDictModal.style.display = 'flex'; return showToast("Carica prima un file di testo!"); }

    isChallenging = false; 
    if (currentInviterId) db.ref(`invites/${currentInviterId}`).once('value', s => { if (s.exists() && s.val().fromId === myId) db.ref(`invites/${currentInviterId}`).remove(); });
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
        gameWords = dict.sort(() => 0.5 - Math.random()).slice(0, requestedWordCount).map(w => w.toUpperCase());
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

if(els.btnPlayDailyNow) els.btnPlayDailyNow.addEventListener('click', () => {
    els.dailyChallengeModal.style.display = 'none';

    currentMode = 'daily_challenge';
    isSinglePlayer = true;
    currentWpm = 15; baseWpm = 15;
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

if(els.btnPlayDailyLater) els.btnPlayDailyLater.addEventListener('click', () => {
    els.dailyChallengeModal.style.display = 'none';
});

if(els.btnDeclineDaily) els.btnDeclineDaily.addEventListener('click', () => {
    let todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
    els.dailyChallengeModal.style.display = 'none';
});

if (els.btnCloseBRBanner) els.btnCloseBRBanner.addEventListener('click', () => {
    if (els.brBanner) els.brBanner.style.display = 'none';
    if (brBannerTimeout) clearTimeout(brBannerTimeout);
    brBannerDismissedToday = true;
    if (brRoomCode) db.ref(`rooms/${brRoomCode}/players`).off('value');
});

// ============================================================================
// 1. BACHECA SFIDE: LETTURA E AGGIORNAMENTO CARDE (Sorgente unica 'rooms')
// ============================================================================

function addOrUpdateRoomCard(code, room) {
    if (!els.waitingRoomsList || !room) return;
    
    // Mostriamo in bacheca SOLO le stanze in attesa ('waiting') e non singleplayer
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
                 : (room.mode === 'conquest' || room.type === 'coop') ? '⚔️ Conquista (Co-op)' 
                 : '🔤 Parole';

    // Calcoliamo i giocatori realmente presenti in stanza
    const pCount = room.players ? Object.keys(room.players).length : (room.pCount || 1);

    const span = document.createElement('span');
    const bTitle = document.createElement('b'); 
    bTitle.textContent = `#${code} - ${modeIcon}`;

    const infoText = (room.mode === 'conquest' || room.type === 'coop')
        ? `${pCount} Gioc. | ${room.wpm} WPM | 5 min`
        : `${pCount} Gioc. | ${room.wpm} WPM | ${room.wordCount} Test`;

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

// Funzione unificata per ascoltare in tempo reale tutte le stanze aperte dal nodo 'rooms'
function listenToRooms() {
    if (listeners.roomsList) {
        if (listeners.roomsList.ref) {
            listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
            listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
            listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
        }
        listeners.roomsList = null;
    }

    if (els.waitingRoomsList) els.waitingRoomsList.innerHTML = '';
    
    // Ascoltiamo le partite con status 'waiting' sulla collezione principale 'rooms'
    const lobbyQuery = db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);

    const onAdded = lobbyQuery.on('child_added', snap => {
        addOrUpdateRoomCard(snap.key, snap.val());
    });

    const onChanged = lobbyQuery.on('child_changed', snap => {
        addOrUpdateRoomCard(snap.key, snap.val());
    });

    const onRemoved = lobbyQuery.on('child_removed', snap => {
        removeRoomCard(snap.key);
    });

    listeners.roomsList = { ref: lobbyQuery, onAdded, onChanged, onRemoved };
}


// ============================================================================
// 2. USCITA DALLA STANZA SENZA ELIMINARLA DAL DATABASE
// ============================================================================

function exitRoomCleanly(roomWasDeletedByHost = false, isExplicitQuit = false) {
    clearAllTimers();
    
    if (typeof window.currentSpectatorCleanup === 'function') {
        window.currentSpectatorCleanup();
        window.currentSpectatorCleanup = null;
    }

    let targetScreen = 'setupScreen'; 
    const amIHost = (myId === roomHostId); 

    // Stacchiamo i listener della stanza corrente per non sovraccaricare la memoria
    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }
    if (listeners.room) { listeners.room.off(); listeners.room = null; }
    if (listeners.pingPong && roomCode) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    
    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        
        // Rimuoviamo sempre la chiave dal localStorage affinché non compaia il banner "RIENTRA IN PARTITA"
        localStorage.removeItem(STORAGE_ROOM_KEY);

        // A) SE LA STANZA DEVE ESSERE ELIMINATA FISICAMENTE (Tasto "Elimina Stanza")
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
        // B) SE SI ABBANDONA UNA PARTITA IN CORSO (Tasto "Abbandona")
        else if (isExplicitQuit) {
            db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
            db.ref(`rooms/${roomCode}/players/${myId}`).remove();
            roomCode = "";
        }
        // C) SE SI ESCE TEMPORANEAMENTE DALLA LOBBY IN ATTESA (Tasto "Esci dalla Stanza")
        else {
            // NON eliminiamo il nodo! La stanza rimane su Firebase con status 'waiting' e compare in bacheca.
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
    
    // Tornando alla schermata principale forziamo il ricaricamento immediato della bacheca sfide
    if (targetScreen === 'setupScreen') {
        listenToRooms();
    }
}


// ============================================================================
// 3. LISTENER SEPARATI PER I PULSANTI DI AZIONE
// ============================================================================

// 1. Pulsante "Abbandona" durante una partita attiva -> isExplicitQuit = true
if(els.quitGameBtn) els.quitGameBtn.addEventListener('click', () => { 
    if (confirm("Vuoi abbandonare la partita?")) { 
        gameRunning = false; 
        exitRoomCleanly(false, true); 
    } 
});

// 2. Pulsante "Elimina Stanza" nella lobby -> roomWasDeletedByHost = true (cancella la stanza)
if(els.deleteRoomBtn) els.deleteRoomBtn.addEventListener('click', () => { 
    if (confirm("Eliminare questa stanza?")) {
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
        db.ref(`rooms/${roomCode}`).remove().then(() => exitRoomCleanly(true, false)); 
    }
});

// 3. Pulsante "Esci dalla Stanza" nella lobby -> ENTRAMBI FALSE! 
// Lascia intatta la stanza, permettendole di essere visualizzata nella Bacheca Sfide.
if(els.leaveLobbyBtn) els.leaveLobbyBtn.addEventListener('click', () => {
    exitRoomCleanly(false, false); 
});
// ============================================================================
// LISTENER DEI PULSANTI DI USCITA
// ============================================================================

// 1. Tasto "Abbandona" durante una partita in corso -> isExplicitQuit = true (forfait / chiusura)
if(els.quitGameBtn) els.quitGameBtn.addEventListener('click', () => { 
    if (confirm("Vuoi abbandonare la partita?")) { 
        gameRunning = false; 
        exitRoomCleanly(false, true); 
    } 
});

// 2. Tasto "Elimina Stanza" -> roomWasDeletedByHost = true (cancella da Firebase e da Bacheca)
if(els.deleteRoomBtn) els.deleteRoomBtn.addEventListener('click', () => { 
    if (confirm("Eliminare questa stanza?")) {
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
        db.ref(`rooms/${roomCode}`).remove().then(() => exitRoomCleanly(true, true)); 
    }
});

// 3. Tasto "Esci dalla Stanza" in lobby -> ENTRAMBI FALSE!
// La stanza rimane in Bacheca Sfide, ma non compare il banner di rientro automatico.
if(els.leaveLobbyBtn) els.leaveLobbyBtn.addEventListener('click', () => {
    exitRoomCleanly(false, false); 
});

function joinRoomLogic(isReconnect = false) {
    gameRunning = false; 
    const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
    playerRef.once('value', snapshot => {
        const pData = snapshot.val();
        if (pData?.finished) { showScreen('leaderboardScreen'); activeTab="room"; showLeaderboardTab('tabRoomBtn'); localStorage.removeItem(STORAGE_ROOM_KEY); return; }
        if (pData) { totalScore = pData.score || 0; wordIndex = pData.wordIndex || 0; quizQuestionIndex = pData.wordIndex || 0; matchDetailsArray = pData.matchDetails || []; if (isRejoining) showToast("🔄 Partita recuperata!"); }
        showScreen('lobbyScreen'); els.lobbyTitleText.textContent = roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera"; if(els.permanentGameInput) els.permanentGameInput.blur();
        playerRef.onDisconnect().update({ online: false }); 
        if (!pData) {
            playerRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, score: 0, wpm: 0, finished: false, teamId: myTeamId, ready: false, online: true }).then(() => {
                if (!isSinglePlayer && !roomCode.startsWith("TRN_")) {
                    db.ref(`rooms/${roomCode}/players`).once('value', s => {
                        const count = s.exists() ? Object.keys(s.val()).length : 1;
                        db.ref(`public_lobby_rooms/${roomCode}/pCount`).set(count);
                    });
                }
            });
        } 
        else playerRef.update({ online: true, name: myName, username: myPrivacy ? "" : tgUsername });
        listenToChat(); if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return exitRoomCleanly(true); const rData = snap.val(); 
            currentMode = rData.mode; requestedWordCount = rData.wordCount; isSinglePlayer = rData.type === 'single'; isFixedSpeed = rData.fixedSpeed || false; roomHostId = rData.hostId;
            
            window.charSpaceWpm = rData.charSpaceWpm !== undefined ? rData.charSpaceWpm : rData.wpm;
            window.wordSpaceMult = rData.wordSpaceMult || 1.0;
            
            // BUG 4 CORRETTO: La partita viene salvata sul localStorage solo quando inizia il gioco!
            if (rData.status === 'playing' || rData.status === 'countdown') {
                localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
            }

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
    if (allReady && isTrnOrPP && (pKeys[0] === myId || amIHost)) {
        db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
    }
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
    if (userWord) userWord = userWord.substring(0, 50);

    inputActive = false; const currentWord = gameWords[wordIndex].toUpperCase(); let points = 0, scoreColor = ""; 
    const reactionMs = Date.now() - lastWordStartTime; 
    const levDist = getLevenshteinDistance(currentWord, userWord);
    
    if (typeof window.calculateGamePoints === 'function') {
        const res = window.calculateGamePoints(currentMode, currentWord, userWord, currentWpm, reactionMs, levDist, usedReplay);
        points = res.points;
        scoreColor = res.scoreColor;
    } else {
        if (currentMode === 'chars') { if (userWord === currentWord) { points = Math.max(100, Math.floor(1000 - (reactionMs / 2))); scoreColor = "#4caf50"; } else { points = 0; scoreColor = "#d32f2f"; } } 
        else {
            const basePoints = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2)); const estimatedAudioMs = (currentWord.length * 60 / currentWpm) * 1000; let timeMultiplier = 1.0;
            if (reactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000)); else if (reactionMs < estimatedAudioMs && levDist === 0) timeMultiplier = 1.1;
            points = Math.round(basePoints * timeMultiplier); if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50"; else if (levDist === 1) scoreColor = "#ff9800"; else scoreColor = "#d32f2f"; if (usedReplay) points = Math.round(points * 0.2);
        }
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
    
    if (roomCode) db.ref(`rooms/${roomCode}/liveAudio`).set({ word: currentWord, wpm: currentWpm, ts: Date.now() });

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

    if (isSinglePlayer && els.allowSpectatorsCheckbox && els.allowSpectatorsCheckbox.checked) {
        if (els.spectatorsCountDisplay) {
            els.spectatorsCountDisplay.style.display = 'inline-block';
            els.spectatorsCountDisplay.textContent = '👁️ 0';
        }
        db.ref(`rooms/${roomCode}/spectators`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (els.spectatorsCountDisplay) {
                els.spectatorsCountDisplay.textContent = `👁️ ${count}`;
            }
        });
    } else {
        if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.style.display = 'none';
    }

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
            clearInterval(interval); if (myId === roomHostId) {
                db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
                db.ref(`public_lobby_rooms/${roomCode}`).remove();
            }
            if(els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!'); playBeep(800, 0.3);
            setTimeout(() => { if (!gameRunning) return; if (currentMode === 'conquest') return startCoopSequence(); if (currentMode === 'quiz') return startQuizSequence(); showScreen('gameArea'); if (currentMode === 'pingpong') setupPingPongListener(); else { setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); setTimeout(() => { if (gameRunning) playNextWord(); }, 800); } }, 500);
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
    if (currentMode === 'conquest') startCoopSequence(); else if (currentMode === 'quiz') startQuizSequence(); else { showScreen('gameArea'); if (currentMode === 'pingpong') setupPingPongListener(); else { setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); setTimeout(() => { if (gameRunning) playNextWord(); }, 800); } }
}

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
    gameRunning = false; 
    inputActive = false; 
    if(els.permanentGameInput) els.permanentGameInput.blur();
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
    } else if(els.btnShareDaily) {
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
        if (Object.keys(sessionCharErrors).length > 0) db.ref(`users/${myId}/stats/charErrors`).once('value', s => { let curr = s.val() || {}; for (let char in sessionCharErrors) curr[char] = (curr[char] || 0) + sessionCharErrors[char]; db.ref(`users/${myId}/stats/charErrors`).set(curr); });
        if (Object.keys(sessionErrorsByWpm).length > 0) db.ref(`users/${myId}/stats/errorsByWpm`).once('value', s => { let curr = s.val() || {}; for (let w in sessionErrorsByWpm) { if(!curr[w]) curr[w]={}; for (let c in sessionErrorsByWpm[w]) curr[w][c] = (curr[w][c] || 0) + sessionErrorsByWpm[w][c]; } db.ref(`users/${myId}/stats/errorsByWpm`).set(curr); });
    }

    if (currentMode === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem(STORAGE_DAILY_SHOWN, todayStr);
        activeTab = "daily_challenge"; 
        showLeaderboardTab('opt_lb_daily');
    }
    else if (roomCode && roomCode.startsWith("TRN_")) { activeTab="room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
    else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; showLeaderboardTab('tabGlobalCWFreakBtn'); }
    else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; showLeaderboardTab('tabGlobalPingPongBtn'); }
    else if (isSinglePlayer && currentMode === 'quiz') { activeTab = "quiz_single"; showLeaderboardTab('tabGlobalQuizSingleBtn'); }
    else if (isSinglePlayer && currentMode === 'chars') { activeTab = "chars_single"; showLeaderboardTab('tabGlobalCharsSingleBtn'); }
    else if (isSinglePlayer) { activeTab = "std_single"; showLeaderboardTab('tabGlobalStandardSingleBtn'); }
    else { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
}

if(els.quitGameBtn) els.quitGameBtn.addEventListener('click', () => { 
    if (confirm("Vuoi abbandonare la partita?")) { 
        gameRunning = false; 
        exitRoomCleanly(false, true); 
    } 
});

if(els.startMultiplayerBtn) els.startMultiplayerBtn.addEventListener('click', () => {
    db.ref(`rooms/${roomCode}/players`).once('value', snap => {
        if (currentMode === 'pingpong' && (snap.exists() ? Object.keys(snap.val()).length : 0) < 2) return alert("Ping Pong richiede almeno 2 giocatori in stanza per iniziare!");
        db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
    });
});

if(els.deleteRoomBtn) els.deleteRoomBtn.addEventListener('click', () => { 
    if (confirm("Eliminare questa stanza?")) {
        db.ref(`public_lobby_rooms/${roomCode}`).remove();
        db.ref(`rooms/${roomCode}`).remove().then(() => exitRoomCleanly(true, true)); 
    }
});

if(els.leaveLobbyBtn) els.leaveLobbyBtn.addEventListener('click', () => {
    exitRoomCleanly(false, true);
});

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
        await syncUserNameEverywhere(myId, newName, currentUsername);
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

// --- GESTIONE SCHEDE CLASSIFICA ---
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

    els.trnSubTabs.style.display = 'none';
    if (modeValue === 'room') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'block'; els.leaderboardContainer.innerHTML = '';
        if (roomCode) db.ref(`rooms/${roomCode}/players`).once('value', snap => renderRoomLeaderboard(snap.val() || {}));
        else { els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Nessuna partita attiva.</p>'; els.waitingOthersText.style.display = 'none'; }
    } else if (modeValue === 'daily_challenge') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else if (modeValue === 'trn_global') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none'; els.trnSubTabs.style.display = 'flex';
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnGlobalLB.classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeValue === 'cwfreak') {
        els.lbFilterArea.style.display = 'none'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (modeValue === 'pingpong') {
        els.lbFilterArea.style.display = 'block'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        populateDynamicFilters('pingpong', '');
        fetchAndRenderGlobalLeaderboard('pingpong', els.lbWordFilter.value);
    } else {
        els.lbFilterArea.style.display = 'block'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        
        let isMulti = modeValue.endsWith('_multi');
        let type = isMulti ? 'multi' : 'single';
        
        let baseMode = 'standard';
        if (modeValue.startsWith('chars')) baseMode = 'chars';
        if (modeValue.startsWith('quiz')) baseMode = 'quiz';
        
        let filterPath = isMulti ? `recent_matches/${baseMode}_multi` : baseMode;
        populateDynamicFilters(filterPath, isMulti ? '' : 'single');
        
        fetchAndRenderGlobalLeaderboard(`${baseMode}_${type}`, els.lbWordFilter.value);
    }
}
if(els.lbModeSelect) els.lbModeSelect.addEventListener('change', e => { activeTab = e.target.value; showLeaderboardTab(e.target.value); });
if(els.btnTrnGlobalLB) els.btnTrnGlobalLB.addEventListener('click', () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnGlobalLB.classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('tournaments', null); });
if(els.btnTrnActiveLB) els.btnTrnActiveLB.addEventListener('click', () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); els.btnTrnActiveLB.classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('active_tournament', null); });
if(els.lbWordFilter) els.lbWordFilter.addEventListener('change', () => { showLeaderboardTab(activeTab); });

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

// --- CLASSIFICHE GLOBALI ---
function fetchAndRenderGlobalLeaderboard(tabType, filterWordCount) {
    els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Caricamento...</p>';
    
    if (tabType === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        db.ref(`leaderboard/daily_challenge/${todayStr}`)
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let players = [];
            if(snapshot.exists()) {
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
            snapshot.forEach(wcNode => { if (filterWordCount === 'all' || wcNode.key === filterWordCount) wcNode.forEach(mNode => matches.push(mNode.val())); });
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
                if(snapshot.exists()) {
                    snapshot.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                }
                players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
            });
        } else {
            db.ref(`leaderboard/pingpong`).once('value', snapshot => {
                let players = [];
                if(snapshot.exists()) {
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
                    renderPlayersListHTML(std.slice(0, 50), listCont, false, true);
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
            if(snapshot.exists()) {
                snapshot.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
        });
    } else {
        db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
            let players = [];
            if(snapshot.exists()) {
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

// === BATTAGLIA REALE SERALE ===
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
            els.brStatusText.textContent = "Annullata: Giocatori insufficienti (<5).";
            setTimeout(() => { showScreen('setupScreen'); activeTab = "room"; }, 4000);
            return;
        }

        if (rData.status === 'playing') {
            brIsPlaying = true;
            els.brWpmDisplay.textContent = rData.wpm + " WPM";
            
            const myData = rData.players[myId];
            brAmIAlive = myData && myData.lives > 0;
            
            const hearts = ["💀 ELIMINATO", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
            let safeLives = myData && myData.lives ? parseInt(myData.lives) : 0;
            if (safeLives < 0) safeLives = 0;
            if (safeLives > 5) safeLives = 5;
            els.brLivesDisplay.textContent = brAmIAlive ? hearts[safeLives] : "💀 ELIMINATO";
            
            if (rData.roundEndTime && rData.currentWord && rData.round !== lastBRRoundPlayed) {
                lastBRRoundPlayed = rData.round;
                handleBRRound(rData);
            }
        }
        
        if (rData.status === 'finished') {
            brIsPlaying = false;
            lastBRRoundPlayed = -1;
            els.brStatusText.textContent = `Partita Conclusa! Vincitore: ${rData.winner || 'Nessuno'}`;
            els.brInputArea.style.display = 'none';
            els.brTimerContainer.style.display = 'none';
        }
    });
}

function renderBRPlayers(players) {
    if(!els.brPlayersList) return;
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

// BUG 3 CORRETTO: In Battaglia Reale non disabilitiamo l'input per mantenere la tastiera aperta
function handleBRRound(rData) {
    if (brTimerInterval) clearInterval(brTimerInterval);
    
    els.brStatusText.textContent = `Round ${rData.round}! Attenzione...`;
    
    if (brAmIAlive && !rData.players[myId].answered) {
        els.brInputArea.style.display = 'flex';
        els.brInput.disabled = false;
        els.brInput.placeholder = "Decodifica e scrivi qui...";
        els.brInput.value = '';
        els.brInput.focus();
        els.brTimerContainer.style.display = 'block';
        playMorseAudio(rData.currentWord, rData.wpm);
    } else {
        els.brInputArea.style.display = 'none';
        els.brTimerContainer.style.display = 'none';
    }

    brTimerInterval = setInterval(() => {
        const left = rData.roundEndTime - Date.now();
        if (left <= 0) {
            clearInterval(brTimerInterval);
            if(els.brTimerProgress) els.brTimerProgress.style.width = '0%';
            if (brAmIAlive && !rData.players[myId].answered) submitBRAnswer(rData.currentWord, true);
        } else {
            if(els.brTimerProgress) {
                els.brTimerProgress.style.width = (left / 30000 * 100) + '%';
                if (left < 10000) els.brTimerProgress.style.background = '#e53935';
                else if (left < 20000) els.brTimerProgress.style.background = '#ff9800';
                else els.brTimerProgress.style.background = '#4caf50';
            }
        }
    }, 100);
}

if (els.brInput) els.brInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') els.btnSendBr.click();
});

if (els.btnSendBr) els.btnSendBr.addEventListener('click', () => {
    db.ref(`rooms/${brRoomCode}/currentWord`).once('value', s => {
        submitBRAnswer(s.val(), false);
    });
});

function submitBRAnswer(realWord, isTimeout) {
    if (!brAmIAlive) return;
    clearInterval(brTimerInterval);
    
    // BUG 3 CORRETTO: Teniamo abilitato l'input per lasciare aperta la tastiera mobile
    els.brInput.placeholder = isTimeout ? "Tempo scaduto!" : "Risposta inviata! Attendi...";
    els.brInput.value = '';
    els.brInput.focus();
    
    const typed = els.brInput.value.trim().toUpperCase().substring(0, 50);
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

if(els.btnLeaveBR) els.btnLeaveBR.addEventListener('click', () => {
    if(confirm("Vuoi abbandonare la Battaglia Serale?")) {
        brIsPlaying = false;
        lastBRRoundPlayed = -1;
        activeTab = "room";
        if(brTimerInterval) clearInterval(brTimerInterval);
        db.ref(`rooms/${brRoomCode}/players/${myId}`).remove();
        showScreen('setupScreen'); 
    }
});

// =========================================================
// MOTORE MODALITÀ SPETTATORE
// =========================================================

window.watchSpecificRoom = function(code, targetName) {
    roomCode = code;
    showScreen('gameArea');
    
    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = true;
        els.permanentGameInput.placeholder = `👁️ Stai osservando la partita di ${targetName}...`;
        els.permanentGameInput.value = "";
    }
    
    els.wpmDisplay.textContent = "👁️ SPETTATORE | WPM: --";
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
        els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${currentSpeed}`;
        els.scoreDisplay.textContent = `Punti: ${hostData.score || 0}`;
        
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
                if (els.tableWrapper) {
                    els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
                }
            }, 50);
        }
    });

    const onAudioChange = db.ref(`rooms/${roomCode}/liveAudio`).on('value', snap => {
        const audioData = snap.val();
        if (audioData && audioData.word) {
            const liveWpm = audioData.wpm || 20;
            els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`;
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

// =========================================================
// MOTORE GIOCO COLLABORATIVO: CONQUISTA (CO-OP)
// =========================================================

function startCoopSequence() {
    isCoopMode = true;
    showScreen('gameArea');
    els.coopArea.style.display = 'flex';
    els.gameInputArea.style.display = 'flex';
    els.pingPongSendArea.style.display = 'none';
    els.tableWrapper.style.display = 'none';
    
    els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
    els.scoreDisplay.textContent = "Obiettivo: 100%";
    
    coopActiveFreqIndex = 0;
    els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
    els.btnCoopReleaseFreq.style.display = 'none';

    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = false; // BUG 3 CORRETTO: Nessun blocco input
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

        els.coopProgressBar.style.width = `${state.progress}%`;
        els.coopProgressText.textContent = `Conquista: ${state.progress}%`;
        
        const mins = Math.floor(state.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (state.timeRemaining % 60).toString().padStart(2, '0');
        els.coopTimeDisplay.textContent = `⏱️ ${mins}:${secs}`;

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

        if (coopActiveFreqIndex > 0 && state.activeWords && state.activeWords.length === 3) {
            const currentFreqWord = state.activeWords[coopActiveFreqIndex - 1];
            if (currentFreqWord && currentFreqWord !== gameWords[0]) {
                gameWords[0] = currentFreqWord;
                inputActive = true;
                // BUG 2 CORRETTO: Riproduce il suono CW solo in locale per chi controlla il canale
                setTimeout(() => {
                    if (gameRunning && isCoopMode && gameWords[0] === currentFreqWord && owners[coopActiveFreqIndex] === myId) {
                        playMorseAudio(currentFreqWord, currentWpm);
                    }
                }, 300);
                els.permanentGameInput.value = "";
                els.permanentGameInput.focus();
            }
        }
    });
}
// ============================================================================
// APP.JS - PARTE FINALE (da setupCoopFreqButtons in poi)
// ============================================================================

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
            }, (error, committed) => {
                if (committed) {
                    coopActiveFreqIndex = num;
                    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = `Canale: ${labels[num - 1]}`;
                    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'inline-block';
                    
                    // CORREZIONE TASTIERA: manteniamo sempre il campo abilitato e in focus
                    if (els.permanentGameInput) {
                        els.permanentGameInput.disabled = false;
                        els.permanentGameInput.placeholder = "Digita qui...";
                        els.permanentGameInput.focus();
                    }
                    inputActive = true; 
                    
                    db.ref(`rooms/${roomCode}/coop_state/activeWords`).once('value', s => {
                        const words = s.val();
                        if (words && words[num - 1]) {
                            gameWords[0] = words[num - 1];
                            // CORREZIONE AUDIO INDIPENDENTE: suona il Morse del canale SOLO per me che l'ho attivato
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
                // Manteniamo l'input non disabilitato in modo traumatico, cambiamo solo il placeholder per evitare che si chiuda la tastiera
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

// Override per l'invio della parola con WPM Dinamico, Penalità e mantenimento tastiera aperta in Co-op
const originalHandleWordSubmission = handleWordSubmission;
handleWordSubmission = function(userWord) {
    if (currentMode !== 'conquest') {
        return originalHandleWordSubmission(userWord);
    }

    if (coopActiveFreqIndex === 0) {
        return showToast("⚠️ Seleziona prima una Frequenza!");
    }

    const currentWord = gameWords[0];
    const isCorrect = userWord.trim().toUpperCase() === currentWord;
    const gain = coopActiveFreqIndex === 1 ? 4 : (coopActiveFreqIndex === 2 ? 7 : 12);
    const penalty = coopActiveFreqIndex === 1 ? 2 : (coopActiveFreqIndex === 2 ? 3 : 5);

    inputActive = false;
    // CORREZIONE TASTIERA: NON disabilitiamo els.permanentGameInput per impedire la chiusura della tastiera di sistema

    if (isCorrect) {
        currentWpm += 2;
        if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
        showToast(`✅ CORRETTO! +${gain}% (Velocità -> ${currentWpm} WPM)`);
        playBeep(880, 0.1);

        db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
            if (!state || state.status !== 'playing') return state;
            state.progress = Math.min(100, (state.progress || 0) + gain);
            state.activeWords = generateCoopTripleWords();
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
        
        // CORREZIONE AUDIO INDIPENDENTE: la parola fallita o la nuova parola ripartono in Morse solo nel client locale di chi ha sbagliato
        if (!isCorrect && gameWords[0]) {
            playMorseAudio(gameWords[0], currentWpm);
        }
    }, 1500);
};

function finishCoopGame(won) {
    gameRunning = false;
    clearAllTimers();
    if (roomCode) db.ref(`rooms/${roomCode}/coop_state`).off();

    // 1. SALVATAGGIO PARTITA CONTRO AVVERSARIO IRREALE (AI)
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
