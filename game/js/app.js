const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20240520.23";

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;
const tgUsername = tgUser?.username || "";
const startParam = tg.initDataUnsafe?.start_param;

// Helper per abbreviare il DOM
const byId = id => document.getElementById(id);

function escapeHTML(str) {
  if (!str && str !== 0) return "";
  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
  return String(str).replace(/[&<>'"]/g, match => escapeMap[match]);
}

let myName, myId, myPrivacy = false;
let db, auth, audioCtx;
let currentRoomListener = null, chatListener = null, pingPongListener = null, gamePlayersListener = null;
let quizStateListener = null, roomLeaderboardListener = null;
let presenceListener = null, invitesListener = null, inviteAcceptedListener = null, outgoingInviteListener = null;
let roomCode = "", lastPlayerCount = 0, lobbyTimerInterval = null, roomHostId = null, gameStartPlayerCount = 0;
let activeChatContext = null, currentInviterId = null, isChallenging = false, isRejoining = false;

const STORAGE_ROOM_KEY = "cwgame_last_room";
const STORAGE_CUSTOM_DICT_KEY = "cwgame_custom_dict";

// Variabili Squadre e Tornei
let myTeamId = null, isTeamCaptain = false, myTeamName = "";
let teamListener = null, allTeamsListener = null;
let activeTrnId = null, trnListener = null;

let masterDictionary = [], itDictionary = [], enDictionary = [], customDictionary = [];

async function loadDictionaries() {
  await Promise.all([fetchDictionary("parole.txt", 'it'), fetchDictionary("words.txt", 'en')]);
  updateDictionary();
}

async function loadRegolamento() {
  try {
    const response = await fetch('regolamento.html');
    if (!response.ok) throw new Error("Errore fetch");
    byId('regolamentoContainer').innerHTML = await response.text();
    const btnFeedback = byId('sendFeedbackBtn');
    if (btnFeedback) {
      btnFeedback.onclick = () => {
        const text = encodeURIComponent("💡 Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
        const shareUrl = `https://t.me/share/url?text=${text}`;
        window.Telegram?.WebApp?.openTelegramLink ? window.Telegram.WebApp.openTelegramLink(shareUrl) : window.open(shareUrl, '_blank');
      };
    }
  } catch (e) {
    byId('regolamentoContainer').innerHTML = "<p style='color:red; text-align:center;'>Impossibile caricare il regolamento.</p>";
  }
}

async function fetchDictionary(url, lang) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("GitHub offline");
    const text = await resp.text();
    const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(l => l.length > 2);
    lang === 'it' ? (itDictionary = lines) : (enDictionary = lines);
  } catch(e) {
    console.warn(`Backup caricato per ${lang}`);
    const backupIt = ["abbandono", "amicizia", "antenna", "battaglia", "bellezza", "calcolo", "canzone", "coraggio", "destino", "energia", "fiducia", "geografia", "illusione", "linguaggio", "mistero", "natura", "obiettivo", "passione", "rispetto", "scienza", "universo", "viaggio", "vittoria"];
    const backupEn = ["abandon", "friendship", "antenna", "battle", "beauty", "calculation", "song", "courage", "destiny", "energy", "trust", "geography", "illusion", "language", "mystery", "nature", "objective", "passion", "respect", "science", "universe", "journey", "victory"];
    lang === 'it' ? (itDictionary = backupIt) : (enDictionary = backupEn);
  }
}

function updateDictionary() {
  masterDictionary = (currentLang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary;
}

const morseDict = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
  'À': '.--.-', 'È': '.-..-', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..---'
};

let gameWords = [], currentWpm = 20, baseWpm = 20, currentTone = 600, totalScore = 0, currentStreak = 0, wordIndex = 0;
let inputActive = false, gameRunning = false, activeTab = "room";
let isSinglePlayer = false, currentMode = "standard", requestedWordCount = 10;
let isFixedSpeed = false, isEasyMode = false, usedReplay = false, matchDetailsArray = [];
let currentLang = 'it', lastWordStartTime = 0;

window.lastPlayedWordId = 0;
window.lastSeenGuessId = 0;
let sessionCharErrors = {}, sessionErrorsByWpm = {};

let quizTimerInterval = null, currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;

window.openTelegramProfile = username => username ? tg.openTelegramLink('https://t.me/' + username) : tg.showAlert("Questo utente non ha uno Username pubblico.");

function showToast(message) {
  const container = byId('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

if (!tgUser) {
  byId('loadingScreen').classList.remove('active-screen');
  byId('errorScreen').classList.add('active-screen');
} else {
  myName = tgUser.first_name; myId = tgUser.id.toString(); initGame();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
  const screenEl = byId(screenId);
  if (screenEl) screenEl.classList.add('active-screen');

  hideChat();
  byId('matchDetailsModal').style.display = 'none';

  if (db && myId) {
    const isPlayingScreen = ['lobbyScreen', 'gameArea', 'countdownScreen', 'quizArea'].includes(screenId);
    db.ref(`presence/${myId}`).update({ status: isPlayingScreen ? 'playing' : 'online' });
  }

  if (screenId === 'setupScreen') {
    if (!localStorage.getItem(STORAGE_ROOM_KEY)) byId('rejoinContainer').style.display = 'none';
  }

  if (screenId === 'teamsScreen') { activeChatContext = 'team'; checkMyTeamStatus(); }
  else if (screenId === 'lobbyScreen' || screenId === 'gameArea') { activeChatContext = 'room'; listenToChat(); }
  else if (screenId === 'participationScreen') { switchActTab('daily'); activeChatContext = null; }
  else { activeChatContext = 'global'; listenToChat(); }
}

window.goBackToMenu = () => {
  if (activeChatContext !== 'team') hideChat();
  showScreen('setupScreen');
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
  db = firebase.database(); auth = firebase.auth();

  auth.signInAnonymously().then(async () => {
    try {
      const userSnap = await db.ref(`users/${myId}`).once('value');
      const userData = userSnap.val() || {};
      if (userData.alias) myName = userData.alias;
      myPrivacy = userData.privacyUsername || false;
      byId('privacyUsernameCheckbox').checked = myPrivacy;
    } catch (e) {}

    byId('playerName').textContent = myName;
    byId('userAliasInput').value = (myName !== tgUser.first_name) ? myName : "";
    byId('loadingText').style.display = 'none';
    byId('createRoomBtn').disabled = false;

    db.ref('.info/connected').on('value', snap => {
      if (!snap.val()) return;
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
            roomCode = lastRoom;
            byId('rejoinContainer').style.display = 'block';
            byId('rejoinGameBtn').onclick = () => { isRejoining = true; joinRoomLogic(false); };
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
    loadDictionaries();

    const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
    if (savedCustom) {
      try { customDictionary = JSON.parse(savedCustom); updateCustomDictStatus(); } catch(e) {}
    }

    checkActivityAndAwardMedals();
    checkTournamentPopup();
    listenToRooms(); listenToOnlineUsers(); listenToInvites(); listenToInviteAccepted();
    loadRegolamento();

    if(byId('appVersionDisplay')) byId('appVersionDisplay').textContent = "v" + APP_VERSION;
    if(byId('appVersionFooter')) byId('appVersionFooter').textContent = APP_VERSION;

    db.ref('appConfig/latestVersion').on('value', snap => {
      const latestStr = snap.val() ? String(snap.val()).trim() : "";
      byId('updateBanner').style.display = (latestStr && latestStr !== APP_VERSION) ? 'block' : 'none';
    });

  }).catch(() => {
    const loader = byId('loadingText');
    if (loader) { loader.textContent = "Errore di Connessione."; loader.style.color = "red"; }
  });

  checkGameTypeUI();
}

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playBeep(freq, duration) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = freq; osc.connect(gain); gain.connect(ctx.destination);
    const time = ctx.currentTime;
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
    gain.gain.setValueAtTime(0.5, time + duration - 0.005); gain.gain.linearRampToValueAtTime(0, time + duration);
    osc.start(time); osc.stop(time + duration);
  } catch(e) {}
}

function playMorseAudio(text, wpm) {
  return new Promise(resolve => {
    const ctx = getAudioContext();
    if (!gameRunning) return resolve();
    const unitDuration = 1.2 / wpm;
    let time = ctx.currentTime + 0.05;
    for (let char of text) {
      if (!gameRunning) break;
      if (morseDict[char]) {
        for (let symbol of morseDict[char]) {
          if (!gameRunning) break;
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.frequency.value = currentTone; osc.connect(gain); gain.connect(ctx.destination);
          const duration = (symbol === '-') ? (3 * unitDuration) : unitDuration;
          gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
          gain.gain.setValueAtTime(0.5, time + duration - 0.005); gain.gain.linearRampToValueAtTime(0, time + duration);
          osc.start(time); osc.stop(time + duration);
          time += duration + unitDuration;
        }
        time += 2 * unitDuration;
      } else if (char === ' ') { time += 4 * unitDuration; }
    }
    setTimeout(resolve, (time - ctx.currentTime) * 1000);
  });
}

let activeChatListeners = {}, isChatDrawerOpen = false;

window.toggleChat = () => {
  const drawer = byId('chatDrawer');
  isChatDrawerOpen = drawer.style.display === 'none';
  drawer.style.display = isChatDrawerOpen ? 'flex' : 'none';
  if (isChatDrawerOpen) byId('chatMessages').scrollTop = byId('chatMessages').scrollHeight;
}

function hideChat() {
  byId('chatDrawer').style.display = 'none';
  isChatDrawerOpen = false;
  Object.keys(activeChatListeners).forEach(k => {
    activeChatListeners[k].ref.off('value', activeChatListeners[k].callback);
    delete activeChatListeners[k];
  });
}

function listenToChat() {
  if (activeChatContext === 'room' && roomCode) {
    setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null);
    setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
    byId('chatTitle').textContent = "💬 Chat Stanza";
    if (byId('gameArea').classList.contains('active-screen')) {
      byId('chatDrawer').style.display = 'none';
      isChatDrawerOpen = false;
    }
  } else {
    setupChat(db.ref('globalChat'), 'chatMessages', null);
    byId('chatTitle').textContent = "🌎 Chat Globale";
  }
}

window.openGlobalChat = () => { activeChatContext = 'global'; listenToChat(); toggleChat(); }

byId('sendLobbyChatBtn').addEventListener('click', () => {
  const txt = byId('lobbyChatInput').value.trim();
  if (!txt || !roomCode) return;
  const msgRef = db.ref(`rooms/${roomCode}/chat`).push();
  msgRef.onDisconnect().remove();
  msgRef.set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
  byId('lobbyChatInput').value = '';
});
byId('lobbyChatInput').addEventListener('keypress', e => { if (e.key === 'Enter') byId('sendLobbyChatBtn').click(); });

function setupChat(chatRef, containerId, alertBtnId) {
  const container = byId(containerId);
  if (!container) return;
  if (activeChatListeners[containerId]) activeChatListeners[containerId].ref.off('value', activeChatListeners[containerId].callback);

  let initialLoad = true, lastTs = Date.now();
  const callback = chatRef.limitToLast(40).on('value', snapshot => {
    container.innerHTML = '';
    let newMsgsCount = 0, latestMsg = null, maxTs = lastTs;

    snapshot.forEach(child => {
      const msg = child.val();
      const div = document.createElement('div');
      div.style.marginBottom = '6px';
      if (msg.ts) {
        const d = new Date(msg.ts);
        const dateSmall = document.createElement('small');
        dateSmall.style.color = 'var(--hint-color)'; dateSmall.style.fontSize = '0.75em';
        dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
        div.appendChild(dateSmall);
        if(msg.ts > maxTs) maxTs = msg.ts;
      }
      const nameB = document.createElement('b');
      nameB.style.color = 'var(--link-color)'; nameB.textContent = msg.name + ":";
      div.appendChild(nameB);
      div.appendChild(document.createTextNode(" " + msg.text));
      container.appendChild(div);

      if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) { newMsgsCount++; latestMsg = msg; }
    });
    lastTs = maxTs;
    container.scrollTop = container.scrollHeight;

    if (!initialLoad && newMsgsCount > 0) {
      if (alertBtnId && !isChatDrawerOpen) {
        showToast(`💬 Nuovo messaggio da ${latestMsg.name}`);
        if(byId(alertBtnId)) byId(alertBtnId).style.backgroundColor = '#4caf50';
      }
      if (roomHostId === myId && activeChatContext !== 'room' && chatRef.key !== 'globalChat') showToast(`📢 (Stanza) ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
      if (activeChatContext === 'room' && chatRef.key === 'globalChat') showToast(`🌎 (Global) ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
    }
    initialLoad = false;
  });
  activeChatListeners[containerId] = { ref: chatRef, callback: callback };
}

byId('sendChatBtn').addEventListener('click', () => {
  const txt = byId('chatInput').value.trim(); if (!txt) return;
  const msgRef = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
  msgRef.onDisconnect().remove();
  msgRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
  byId('chatInput').value = '';
});
byId('chatInput').addEventListener('keypress', e => { if (e.key === 'Enter') byId('sendChatBtn').click(); });

byId('clearChatBtn').addEventListener('click', () => {
  if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) {
    (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).remove() : db.ref('globalChat').remove();
  }
});

function checkGameTypeUI() {
  const isSingle = byId('gameTypeInput').value === 'single';
  const isTrn = byId('gameTypeInput').value === 'tournament';
  const isCustom = byId('gameModeInput').value === 'custom';
  const modeSelect = byId('gameModeInput');

  byId('timeoutDiv').style.display = (isSingle || isTrn) ? 'none' : 'block';
  byId('fixedSpeedContainer').style.display = isSingle ? 'flex' : 'none';
  byId('easyModeContainer').style.display = isSingle ? 'flex' : 'none';
  byId('customDictControl').style.display = (isSingle && isCustom) ? 'flex' : 'none';

  const gameModes = modeSelect.querySelectorAll('option:not([value^="trn_"])');
  const trnGroup = byId('trn_opt_group');
  const trnModes = trnGroup ? trnGroup.querySelectorAll('option') : [];

  if (isTrn) {
    gameModes.forEach(opt => { opt.style.display = 'none'; opt.disabled = true; });
    if (trnGroup) trnGroup.style.display = 'block';
    trnModes.forEach(opt => { opt.style.display = 'block'; opt.disabled = false; });
    if (!modeSelect.value.startsWith('trn_')) modeSelect.value = 'trn_join_team';
    byId('createRoomBtn').textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
  } else {
    gameModes.forEach(opt => { opt.style.display = 'block'; opt.disabled = false; });
    if (trnGroup) trnGroup.style.display = 'none';
    trnModes.forEach(opt => { opt.style.display = 'none'; opt.disabled = true; });
    if (modeSelect.value.startsWith('trn_')) modeSelect.value = 'standard';
    byId('createRoomBtn').textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
  }

  if(!isSingle) { byId('fixedSpeedCheckbox').checked = false; byId('easyModeCheckbox').checked = false; }
}

const i18n = {
  it: { /* Tutte le traduzioni rimangono invariate per sicurezza - abbreviato per chiarezza ma presente in memoria */
    hello: "Ciao", lb: "Classifica", profile: "Profilo", activity: "Attività", conn_secure: "Connessione sicura in corso...",
    free_challenge: "⚡ Sfida Libera", play_solo: "Gioca da Solo o Sfida un Amico", game_type: "Tipo di Gioco:", mode: "Modalità:", wpm: "WPM:", words: "Parole:", tone: "Tono:", timeout: "Scadenza Stanza (min):",
    opt_multi: "Multiplayer (con Lobby)", opt_single: "Singleplayer (Immediata)", opt_std: "Parole Comuni", opt_call: "Nominativi (CW Freak)", opt_pp: "Ping Pong", opt_custom: "Personale",
    fixed: "Fissa", easy: "Semplice", create_room: "Inizia Partita Libera", play_now: "Gioca Subito", challenge_board: "Bacheca Sfide ⏳", no_challenges: "Nessuna sfida.",
    online_users: "Utenti Online 🟢", global_chat: "💬 Chat", you_are_alone: "Sei solo.", profile_title: "👤 Profilo e Statistiche", alias_label: "Il tuo Alias", save: "Salva", alias_hint: "L'alias sostituirà il tuo nome Telegram nelle classifiche e nelle squadre.",
    privacy_label: "Nascondi mio username Telegram", privacy_hint: "Se attivo, nessuno potrà cliccare sul tuo nome per vedere il tuo profilo. L'Alias diventa obbligatorio.",
    wrong_chars: "📈 Caratteri più sbagliati", wpm_error: "⚠️ Errori per WPM", match_history: "📜 Storico Partite", loading: "Caricamento...", back_to_menu: "Torna al Menu Principale",
    daily: "Oggi", weekly: "Settimana", monthly: "Mese", medals: "Le Mie Medaglie", finished: "Concluso", winner: "Vincitore", points: "Punti", history: "Storico Partite",
    chat_title: "💬 Chat", chat_clear: "Cancella", chat_close: "Chiudi", chat_send: "Invia", chat_placeholder: "Scrivi un messaggio...", lobby_players: "Giocatori presenti:", lobby_chat: "💬 Chat di Stanza", lobby_invite: "📢 Invita Amici su Telegram",
    act_title: "Classifica Attività", act_loading: "Caricamento...", act_no_data: "Nessuna attività registrata.", prepare: "Preparati!", start_via: "VIA!", game_chat: "💬 Chat", quit_game: "Abbandona",
    input_placeholder: "Digita qui...", replay: "🔁 Riascolta", th_typed: "Scritto", th_real: "Reale", th_pts: "Punti", teams_btn: "🏆 TORNEI A SQUADRE", delete_data: "🗑️ Elimina Definitivamente i miei Dati",
    tab_this_match: "Questa Partita", tab_trn_lb: "Classifica Tornei", tab_callsigns: "Nominativi", tab_pingpong: "Ping Pong", tab_std_multi: "Parole (Multi)", tab_std_single: "Parole (Single)",
    btn_start_match: "AVVIA PARTITA", btn_delete_room: "ELIMINA STANZA", btn_leave_lobby: "Esci dalla Stanza", status_host: "Sei l'Host della partita.", status_guest: "Sei un partecipante. Attendi il via.", lobby_free: "Lobby Stanza Libera", lobby_trn: "Lobby Incontro Torneo 🥊",
    ready_btn: "SONO PRONTO ✅", waiting_host: "In attesa che l'Host avvii...", tab_my_team: "La mia Squadra", tab_all_teams: "Tutte le Squadre", tab_tournaments: "I Tornei",
    custom_title: "Dizionario Personale 📖", custom_desc: "Carica un file di testo (.txt) con le tue parole personalizzate.", select_file: "Scegli File .txt", custom_hint1: "Le parole possono essere separate da spazio, virgola o a capo.",
    custom_hint2: "Verranno ignorate le parole più corte di 3 caratteri.", custom_hint3: "Il dizionario rimarrà salvato in locale.", no_file: "Nessun file caricato.", loaded_words: "Parole caricate: ", manage_custom: "⚙️ Gestisci Dizionario Personale"
  },
  en: {
    hello: "Hello", lb: "Leaderboard", profile: "Profile", activity: "Activity", conn_secure: "Secure connection in progress...",
    free_challenge: "⚡ Free Challenge", play_solo: "Play Solo or Challenge a Friend", game_type: "Game Type:", mode: "Mode:", wpm: "WPM:", words: "Words:", tone: "Tone:", timeout: "Room Timeout (min):",
    opt_multi: "Multiplayer (Lobby)", opt_single: "Singleplayer (Immediate)", opt_std: "Common Words", opt_call: "Callsigns (CW Freak)", opt_pp: "Ping Pong", opt_custom: "Personal",
    fixed: "Fixed", easy: "Easy", create_room: "Start Free Match", play_now: "Play Now", challenge_board: "Challenge Board ⏳", no_challenges: "No challenges.",
    online_users: "Online Users 🟢", global_chat: "💬 Chat", you_are_alone: "You are alone.", profile_title: "👤 Profile and Statistics", alias_label: "Your Alias", save: "Save", alias_hint: "The alias will replace your Telegram name in leaderboards and teams.",
    privacy_label: "Hide my Telegram username", privacy_hint: "If active, no one can click your name to see your profile. Alias becomes mandatory.",
    wrong_chars: "📈 Most Mistaken Characters", wpm_error: "⚠️ Errors per WPM", match_history: "📜 Match History", loading: "Loading...", back_to_menu: "Back to Main Menu",
    daily: "Today", weekly: "Week", monthly: "Month", medals: "My Medals", finished: "Finished", winner: "Winner", points: "Points", history: "Match History",
    chat_title: "💬 Chat", chat_clear: "Clear", chat_close: "Close", chat_send: "Send", chat_placeholder: "Type a message...", lobby_players: "Players present:", lobby_chat: "💬 Room Chat", lobby_invite: "📢 Invite Friends on Telegram",
    act_title: "Activity Rankings", act_loading: "Loading...", act_no_data: "No activity recorded.", prepare: "Get Ready!", start_via: "GO!", game_chat: "💬 Chat", quit_game: "Quit",
    input_placeholder: "Type here...", replay: "🔁 Replay", th_typed: "Typed", th_real: "Real", th_pts: "Points", teams_btn: "🏆 TEAM TOURNAMENTS", delete_data: "🗑️ Permanently Delete My Data",
    tab_this_match: "This Match", tab_trn_lb: "Tournament Leaderboard", tab_callsigns: "Callsigns", tab_pingpong: "Ping Pong", tab_std_multi: "Words (Multi)", tab_std_single: "Words (Single)",
    btn_start_match: "START MATCH", btn_delete_room: "DELETE ROOM", btn_leave_lobby: "Leave Lobby", status_host: "You are the Match Host.", status_guest: "You are a participant. Wait for the start.", lobby_free: "Free Room Lobby", lobby_trn: "Tournament Match Lobby 🥊",
    ready_btn: "I AM READY ✅", waiting_host: "Waiting for Host to start...", tab_my_team: "My Team", tab_all_teams: "All Teams", tab_tournaments: "Tournaments",
    custom_title: "Personal Dictionary 📖", custom_desc: "Upload a text file (.txt) with your custom words.", select_file: "Choose .txt File", custom_hint1: "Words can be separated by spaces, commas, or newlines.",
    custom_hint2: "Words shorter than 3 characters will be ignored.", custom_hint3: "The dictionary will be saved locally.", no_file: "No file uploaded.", loaded_words: "Words loaded: ", manage_custom: "⚙️ Manage Personal Dictionary"
  }
};

window.toggleLanguage = () => {
  setLanguage(currentLang === 'it' ? 'en' : 'it');
  updateDictionary();
  showToast(currentLang === 'it' ? "Lingua: Italiano" : "Language: English");
}

function setLanguage(lang) {
  currentLang = lang; localStorage.setItem('gameLang', lang);
  const t = i18n[lang];
  byId('langBtn').textContent = lang.toUpperCase();

  const setIfFound = (id, text) => { if(byId(id)) byId(id).textContent = text; };
  setIfFound('opt_lb_room', t.tab_this_match); setIfFound('opt_lb_trn', t.tab_trn_lb); setIfFound('opt_lb_call', t.tab_callsigns);
  setIfFound('opt_lb_pp', t.tab_pingpong + " (" + (lang==='it'?'Sfide':'Challenges') + ")");
  setIfFound('opt_lb_multi', t.tab_std_multi + " (" + (lang==='it'?'Sfide':'Challenges') + ")"); setIfFound('opt_lb_single', t.tab_std_single);
  setIfFound('opt_lb_chars_multi', lang==='it'?'Caratteri (Multi - Sfide)':'Characters (Multi - Challenges)');
  setIfFound('opt_lb_chars_single', lang==='it'?'Caratteri (Single)':'Characters (Single)');
  setIfFound('opt_lb_quiz_multi', lang==='it'?'Quiz (Multi - Sfide)':'Quiz (Multi - Challenges)');
  setIfFound('opt_lb_quiz_single', lang==='it'?'Quiz (Single)':'Quiz (Single)');

  setIfFound('txt_hello', t.hello); setIfFound('txt_lb_btn', "🏆 " + t.lb); setIfFound('txt_profile_btn', "👤 " + t.profile); setIfFound('txt_act_btn', "🏅 " + t.activity);
  setIfFound('txt_free_challenge_title', t.free_challenge); setIfFound('txt_play_solo_title', t.play_solo); setIfFound('txt_game_type_label', t.game_type); setIfFound('txt_mode_label', t.mode);
  setIfFound('txt_opt_multi', t.opt_multi); setIfFound('txt_opt_single', t.opt_single); setIfFound('txt_opt_std', t.opt_std); setIfFound('txt_opt_call', t.opt_call); setIfFound('txt_opt_pp', t.opt_pp);
  setIfFound('txt_wpm_label', t.wpm); setIfFound('txt_words_label', t.words); setIfFound('txt_tone_label', t.tone); setIfFound('txt_fixed_speed', t.fixed); setIfFound('txt_easy_mode', t.easy); setIfFound('txt_room_timeout', t.timeout);
  setIfFound('txt_challenge_board_title', t.challenge_board); setIfFound('txt_no_challenges', t.no_challenges); setIfFound('txt_online_users_title', t.online_users);
  setIfFound('txt_global_chat_btn', t.global_chat); setIfFound('txt_you_are_alone', t.you_are_alone);

  setIfFound('chatTitle', t.chat_title); setIfFound('clearChatBtn', t.chat_clear); setIfFound('closeChatBtn', t.chat_close); setIfFound('sendChatBtn', t.chat_send); if(byId('chatInput')) byId('chatInput').placeholder = t.chat_placeholder;
  setIfFound('txt_lobby_players', t.lobby_players); setIfFound('txt_lobby_chat_title', t.lobby_chat); setIfFound('sendLobbyChatBtn', t.chat_send); if(byId('lobbyChatInput')) byId('lobbyChatInput').placeholder = t.chat_placeholder; setIfFound('inviteFriendsBtn', t.lobby_invite);
  setIfFound('txt_prepare', t.prepare); setIfFound('txt_th_typed', t.th_typed); setIfFound('txt_th_real', t.th_real); setIfFound('txt_th_pts', t.th_pts);
  if(byId('permanentGameInput')) byId('permanentGameInput').placeholder = t.input_placeholder; setIfFound('replayWordBtn', t.replay); setIfFound('txt_game_chat_btn', t.game_chat); setIfFound('quitGameBtn', t.quit_game);
  setIfFound('txt_profile_title', t.profile_title); setIfFound('txt_alias_title', t.alias_label); setIfFound('saveAliasBtn', t.save); setIfFound('txt_alias_hint', t.alias_hint);
  setIfFound('txt_privacy_label', t.privacy_label); setIfFound('txt_privacy_hint', t.privacy_hint); setIfFound('txt_wrong_chars_title', t.wrong_chars); setIfFound('txt_wpm_error_title', t.wpm_error); setIfFound('txt_match_history_title', t.match_history); setIfFound('txt_back_btn', t.back_to_menu);
  
  setIfFound('tabDailyAct', t.daily); setIfFound('tabWeeklyAct', t.weekly); setIfFound('tabMonthlyAct', t.monthly); setIfFound('actListTitle', t.act_title);
  setIfFound('goToTeamsBtn', t.teams_btn); setIfFound('deleteDataBtn', t.delete_data); setIfFound('tabRoomBtn', t.tab_this_match); setIfFound('tabGlobalTournamentBtn', t.tab_trn_lb); setIfFound('tabGlobalCWFreakBtn', t.tab_callsigns); setIfFound('tabGlobalPingPongBtn', t.tab_pingpong);
  setIfFound('startMultiplayerBtn', t.btn_start_match); setIfFound('deleteRoomBtn', t.btn_delete_room); setIfFound('leaveLobbyBtn', t.btn_leave_lobby); setIfFound('readyBtn', t.ready_btn);
  setIfFound('tabTeamGestBtn', t.tab_my_team); setIfFound('tabAllTeamsBtn', t.tab_all_teams); setIfFound('tabTournamentsBtn', t.tab_tournaments);

  setIfFound('txt_custom_dict_title', t.custom_title); setIfFound('txt_custom_dict_desc', t.custom_desc); setIfFound('txt_select_file_btn', t.select_file);
  setIfFound('txt_custom_hint1', t.custom_hint1); setIfFound('txt_custom_hint2', t.custom_hint2); setIfFound('txt_custom_hint3', t.custom_hint3);
  setIfFound('txt_close_custom_btn', t.chat_close); setIfFound('txt_manage_custom_btn', t.manage_custom); setIfFound('txt_loading_stats', t.loading); setIfFound('txt_loading_stats2', t.loading);
  updateCustomDictStatus();
  checkGameTypeUI();

  if (activeTrnId) db.ref(`tournaments/${activeTrnId}`).once('value', snap => { if(snap.exists()) renderActiveTournament(snap); });
}

byId('gameModeInput').addEventListener('change', e => {
  const isC = e.target.value === 'callsign', isPP = e.target.value === 'pingpong';
  if (isPP) {
    byId('gameTypeInput').value = 'multi'; byId('gameTypeInput').disabled = true;
  } else { byId('gameTypeInput').disabled = false; }
  
  ['startWpmInput', 'wordCountInput', 'toneInput'].forEach(id => {
    byId(id).disabled = isC;
    if(isC && id!=='toneInput') byId(id).value = 25;
  });
  byId('fixedSpeedCheckbox').disabled = isC;
  if(isC) byId('fixedSpeedCheckbox').checked = false;
  checkGameTypeUI();
});
byId('gameTypeInput').addEventListener('change', checkGameTypeUI);

function updateCustomDictStatus() {
  const el = byId('customDictStatus'); if (!el) return;
  const t = i18n[currentLang];
  el.textContent = customDictionary.length === 0 ? t.no_file : t.loaded_words + customDictionary.length;
  el.style.color = customDictionary.length === 0 ? "var(--hint-color)" : "var(--link-color)";
}

const fileInput = byId('customDictFileInput');
if (fileInput) {
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) return alert(currentLang === 'it' ? "Scegli un file .txt!" : "Choose a .txt file!");
    const reader = new FileReader();
    reader.onload = ev => {
      const uniqueWords = [...new Set(ev.target.result.split(/[\s,;.:!?"'()\[\]{}]+/).filter(w => w.trim().length >= 3).map(w => w.trim().toLowerCase()))];
      if (uniqueWords.length === 0) return alert(currentLang === 'it' ? "Nessuna parola trovata." : "No words found.");
      customDictionary = uniqueWords;
      localStorage.setItem(STORAGE_CUSTOM_DICT_KEY, JSON.stringify(customDictionary));
      updateCustomDictStatus();
      showToast(currentLang === 'it' ? `Caricate ${uniqueWords.length} parole!` : `Loaded ${uniqueWords.length} words!`);
    };
    reader.readAsText(file);
  });
}

function generateCallsign() {
  const prefs = ["I", "IK", "IZ", "IN", "IT", "IS", "IU", "IW", "W", "K", "N", "A", "WA", "WB", "DL", "DJ", "DK", "DO", "EA", "EB", "EC", "F", "G", "M", "GW", "GM", "9A", "S5", "OK", "OM", "SP", "SQ", "UA", "UR", "EW", "ER", "YO", "YU", "HA", "LZ", "OE", "HB", "PA", "PB", "ON", "VE", "VK", "ZL", "JA", "PY", "LU", "CX"];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let cs = prefs[Math.floor(Math.random() * prefs.length)] + Math.floor(Math.random() * 10);
  for(let i = 0, len = (Math.random() > 0.9) ? 1 : (Math.random() > 0.7) ? 2 : 3; i < len; i++) cs += chars[Math.floor(Math.random() * chars.length)];
  if (Math.random() > 0.9) cs += ["/QRP", "/P", "/M", "/AM", "/MM"][Math.floor(Math.random() * 5)];
  return cs;
}

function getGameWords(num, mode) {
  if (mode === 'callsign') return Array.from({length: num}, generateCallsign);
  if (mode === 'pingpong') return [];
  if (mode === 'chars') return Array.from({length: num}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]);
  const dict = mode === 'custom' && customDictionary.length > 0 ? customDictionary : masterDictionary;
  return [...dict].sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
}

window.showRoomEventModal = (title, text) => {
  byId('roomEventTitle').textContent = title; byId('roomEventText').textContent = text;
  byId('roomEventModal').style.display = 'flex';
  playBeep(600, 0.2); setTimeout(() => playBeep(800, 0.3), 200);
}

byId('goToRoomBtn').addEventListener('click', () => { byId('roomEventModal').style.display = 'none'; if(roomCode) joinRoomLogic(false); });

window.checkTournamentPopup = () => {
  if (localStorage.getItem('hideTrnWelcomePopup') === 'true' || myTeamId) return;
  setTimeout(() => byId('tournamentWelcomeModal').style.display = 'flex', 1500);
}

window.closeTrnWelcomeModal = () => {
  if (byId('stopShowingTrnPopup').checked) localStorage.setItem('hideTrnWelcomePopup', 'true');
  byId('tournamentWelcomeModal').style.display = 'none';
}

window.goToTournamentsFromPopup = () => { closeTrnWelcomeModal(); showScreen('teamsScreen'); }

let lastOnlineUsersSnap = null;
function listenToOnlineUsers() {
  db.ref('presence').on('value', snap => { lastOnlineUsersSnap = snap; renderOnlineUsers(); });
}

function renderOnlineUsers() {
  if (!lastOnlineUsersSnap) return;
  const list = byId('onlineUsersList'); list.innerHTML = '';
  let count = 0;
  lastOnlineUsersSnap.forEach(child => {
    if (child.key === myId) return;
    count++; const u = child.val();
    const isThisOneWaiting = isChallenging && currentInviterId === child.key, isPlaying = u.status === 'playing';
    
    const li = document.createElement('li');
    const leftSpan = document.createElement('span');
    leftSpan.innerHTML = `<b style="cursor:pointer; color:var(--link-color); text-decoration:underline;">${escapeHTML(u.name)}</b><br><small>${isPlaying ? "🟡 In Partita" : "🟢 Online"}</small>`;
    leftSpan.querySelector('b').onclick = () => openTeamInviteModal(child.key, u.name);
    
    const btn = document.createElement('button');
    btn.className = `action-btn-small ${isThisOneWaiting ? 'btn-danger' : 'btn-success'}`;
    if (isPlaying) { btn.classList.add('btn-secondary'); btn.disabled = true; btn.textContent = "In partita"; }
    else { btn.disabled = isChallenging && !isThisOneWaiting; btn.textContent = isThisOneWaiting ? 'In Attesa...' : 'Sfida'; btn.onclick = () => openInviteModal(child.key, u.name); }
    
    li.append(leftSpan, btn); list.appendChild(li);
  });
  if (count === 0) list.innerHTML = `<li style="justify-content:center; color:var(--hint-color); background:none; border:none;">${i18n[currentLang].you_are_alone}</li>`;
}

window.openInviteModal = (targetId, targetName) => {
  currentInviterId = targetId;
  byId('inviteModalTitle').textContent = "Sfida " + targetName;
  byId('inviteModalText').textContent = "Scegli le impostazioni per la sfida:";
  ['inviteSettings', 'outgoingInviteArea'].forEach(id => byId(id).style.display = 'block');
  ['teamInviteSettings', 'incomingInviteArea', 'incomingTeamInviteArea'].forEach(id => byId(id).style.display = 'none');
  byId('inviteModal').style.display = 'flex';
}

window.openTeamInviteModal = async (targetId, targetName) => {
  currentInviterId = targetId;
  byId('inviteModalTitle').textContent = "Recluta " + targetName;
  const statusText = byId('recruitmentStatusText'); statusText.textContent = "Caricamento...";
  
  ['teamInviteSettings'].forEach(id => byId(id).style.display = 'block');
  ['inviteSettings', 'incomingInviteArea', 'incomingTeamInviteArea', 'outgoingInviteArea'].forEach(id => byId(id).style.display = 'none');
  
  const [joinBtn, createBtn, msgBtn] = ['recruitJoinBtn', 'recruitCreateBtn', 'recruitMsgBtn'].map(byId);
  joinBtn.style.display = 'none';

  try {
    const teamsSnap = await db.ref('teams').once('value');
    let targetTeamName = null;
    teamsSnap.forEach(tSnap => { const t = tSnap.val(); if (t.status !== 'retired' && t.members?.[targetId]) targetTeamName = t.name; });

    if (targetTeamName) {
      statusText.innerHTML = `⚠️ <b>${escapeHTML(targetName)}</b> fa già parte della squadra <b>${escapeHTML(targetTeamName)}</b>.`;
      createBtn.style.display = 'none';
    } else {
      statusText.innerHTML = `💡 <b>${escapeHTML(targetName)}</b> non ha ancora una squadra.`;
      createBtn.style.display = 'block';
      if (myTeamId) joinBtn.style.display = 'block';
    }
    joinBtn.onclick = () => sendRecruitmentInvite('team');
    createBtn.onclick = () => sendRecruitmentInvite('suggest');
    msgBtn.onclick = () => db.ref(`presence/${targetId}`).once('value', s => s.val()?.username ? tg.openTelegramLink('https://t.me/' + s.val().username) : tg.showAlert("Nessuno username pubblico."));
  } catch(e) { statusText.textContent = "Errore dati."; }
  byId('inviteModal').style.display = 'flex';
}

function sendRecruitmentInvite(type) {
  const data = { fromId: myId, fromName: myName, type: 'team', ts: firebase.database.ServerValue.TIMESTAMP, teamId: type === 'team' ? myTeamId : null, teamName: type === 'team' ? myTeamName : null };
  db.ref(`invites/${currentInviterId}`).set(data).then(() => { showToast(type === 'team' ? "Invito inviato!" : "Suggerimento inviato!"); closeInviteModal(); });
}

window.closeInviteModal = () => { byId('inviteModal').style.display = 'none'; currentInviterId = null; }

byId('sendInviteBtn').addEventListener('click', () => {
  if (isChallenging) return;
  const mode = byId('inviteModeInput').value, wpm = parseInt(byId('inviteWpmInput').value), wordCount = parseInt(byId('inviteWordCountInput').value);
  const data = { fromId: myId, fromName: myName, mode, wpm, wordCount, ts: firebase.database.ServerValue.TIMESTAMP, status: 'pending' };
  isChallenging = true; renderOnlineUsers();
  
  db.ref(`invites/${currentInviterId}`).set(data).then(() => {
    showToast("Invito inviato! In attesa..."); closeInviteModal();
    if (outgoingInviteListener) db.ref(`invites/${currentInviterId}`).off('value', outgoingInviteListener);
    outgoingInviteListener = db.ref(`invites/${currentInviterId}`).on('value', snap => {
      if (!snap.exists() && isChallenging) {
        setTimeout(() => {
          if (isChallenging) { showToast("Invito rifiutato o scaduto."); isChallenging = false; currentInviterId = null; renderOnlineUsers(); }
        }, 1000);
      }
    });
  });
});

function listenToInvites() {
  db.ref(`invites/${myId}`).on('value', snap => {
    const inv = snap.val();
    if (!inv || roomCode || gameRunning) return;
    if (Date.now() - inv.ts > 60000) { db.ref(`invites/${myId}`).remove(); return; }

    if (inv.type === 'team') {
      byId('inviteModalTitle').textContent = inv.teamId ? "🚀 INVITO IN SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
      byId('inviteModalText').innerHTML = inv.teamId ? `${escapeHTML(inv.fromName)} ti invita in <b>${escapeHTML(inv.teamName)}</b>.` : `${escapeHTML(inv.fromName)} ti suggerisce di creare una squadra!`;
      ['incomingTeamInviteArea'].forEach(id => byId(id).style.display = 'block');
      ['inviteSettings', 'teamInviteSettings', 'incomingInviteArea', 'outgoingInviteArea'].forEach(id => byId(id).style.display = 'none');
      
      const acceptBtn = byId('acceptTeamInviteBtn');
      acceptBtn.textContent = inv.teamId ? "UNISCITI ✅" : "CREA 🛠️";
      acceptBtn.onclick = () => { db.ref(`invites/${myId}`).remove(); closeInviteModal(); inv.teamId ? joinTeam(inv.teamId) : showScreen('teamsScreen'); };
    } else {
      byId('inviteModalTitle').textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();
      byId('inviteModalText').innerHTML = `Sfida in: <br><b>${inv.mode.toUpperCase()}</b> a <b>${inv.wpm}</b> WPM (<b>${inv.wordCount}</b> test).`;
      ['incomingInviteArea'].forEach(id => byId(id).style.display = 'block');
      ['inviteSettings', 'teamInviteSettings', 'incomingTeamInviteArea', 'outgoingInviteArea'].forEach(id => byId(id).style.display = 'none');
    }
    byId('inviteModal').style.display = 'flex';
    currentInviterId = inv.fromId; window.lastIncomingInvite = inv;
  });
}

['declineTeamInviteBtn', 'declineInviteBtn'].forEach(id => byId(id).addEventListener('click', () => { db.ref(`invites/${myId}`).remove(); closeInviteModal(); }));

byId('acceptInviteBtn').addEventListener('click', () => {
  const inv = window.lastIncomingInvite;
  db.ref(`invites/${myId}`).remove(); closeInviteModal();
  const rCode = Math.floor(1000 + Math.random() * 9000).toString();
  db.ref(`rooms/${rCode}`).set({
    status: 'waiting', type: 'multi', mode: inv.mode, wpm: inv.wpm, tone: 600, wordCount: inv.wordCount, words: getGameWords(inv.wordCount, inv.mode),
    createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 600000, hostId: inv.fromId
  }).then(() => {
    db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode });
    roomCode = rCode; joinRoomLogic(false);
  });
});

function listenToInviteAccepted() {
  if (inviteAcceptedListener) db.ref(`invite_accepted/${myId}`).off('value', inviteAcceptedListener);
  inviteAcceptedListener = db.ref(`invite_accepted/${myId}`).on('value', snap => {
    if (snap.val()?.roomCode) {
      db.ref(`invite_accepted/${myId}`).remove();
      isChallenging = false; closeInviteModal(); roomCode = snap.val().roomCode; joinRoomLogic(false);
    }
  });
}

function listenToRooms() {
  db.ref('rooms').on('value', snap => {
    const list = byId('waitingRoomsList'); list.innerHTML = ''; let wCount = 0;
    snap.forEach(child => {
      const room = child.val(), code = child.key;
      if (code.startsWith("TRN_")) return;
      if (room.expiresAt && Date.now() > room.expiresAt) return db.ref(`rooms/${code}`).remove();

      if (room.status === 'waiting' && room.type !== 'single') {
        wCount++;
        const modeIcon = room.mode === 'callsign' ? '🎙️ Nom.' : room.mode === 'pingpong' ? '🏓 Ping' : room.mode === 'quiz' ? '❓ Quiz' : '🔤 Parole';
        const li = document.createElement('li');
        li.innerHTML = `<span><b>#${code} - ${modeIcon}</b><br><small>${room.players ? Object.keys(room.players).length : 0} Gioc. | ${room.wpm} WPM | ${room.wordCount} Test</small></span>`;
        const btn = document.createElement('button'); btn.className = 'action-btn-small'; btn.textContent = 'Entra'; btn.onclick = () => { roomCode = code; joinRoomLogic(false); };
        li.appendChild(btn); list.appendChild(li);
      }
    });
    if (wCount === 0) list.innerHTML = `<li style="justify-content:center; color:var(--hint-color); background:none; border:none;">${i18n[currentLang].no_challenges}</li>`;
  });
}
window.joinSpecificRoom = code => { roomCode = code; joinRoomLogic(false); }

byId('createRoomBtn').addEventListener('click', () => {
  const gType = byId('gameTypeInput').value, gMode = byId('gameModeInput').value;
  if (gType === 'tournament') {
    showScreen('teamsScreen');
    switchTeamTab(gMode === 'trn_create_team' ? 'gest' : gMode === 'trn_join_team' ? 'allteams' : 'tournaments');
    return;
  }
  if (gMode === 'custom' && customDictionary.length === 0) {
    byId('customDictModal').style.display = 'flex'; showToast(currentLang === 'it' ? "Carica file txt!" : "Upload txt!"); return;
  }
  isChallenging = false;
  if (currentInviterId) db.ref(`invites/${currentInviterId}`).once('value', s => { if(s.exists() && s.val().fromId===myId) db.ref(`invites/${currentInviterId}`).remove(); });
  db.ref(`invite_accepted/${myId}`).remove();

  currentMode = gMode; isSinglePlayer = gType === 'single';
  currentWpm = currentMode==='callsign' ? 25 : parseInt(byId('startWpmInput').value); baseWpm = currentWpm;
  requestedWordCount = currentMode==='callsign' ? 25 : Math.max(1, parseInt(byId('wordCountInput').value));
  currentTone = parseInt(byId('toneInput').value); isFixedSpeed = byId('fixedSpeedCheckbox').checked; isEasyMode = byId('easyModeCheckbox').checked;
  
  roomCode = Math.floor(1000 + Math.random() * 9000).toString(); gameWords = getGameWords(requestedWordCount, currentMode);
  
  db.ref('rooms/' + roomCode).set({
    status: isSinglePlayer ? 'countdown' : 'waiting', type: isSinglePlayer ? 'single' : 'multi',
    mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords, fixedSpeed: isFixedSpeed,
    createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: isSinglePlayer ? null : Date.now() + (Math.max(1, parseInt(byId('roomTimerInput').value)) * 60000), hostId: myId
  }).then(() => joinRoomLogic(false));
});

function exitRoomCleanly(roomWasDeletedByHost = false) {
  let targetScreen = 'setupScreen';
  localStorage.removeItem(STORAGE_ROOM_KEY);
  isRejoining = isChallenging = false; currentInviterId = null;

  if (gamePlayersListener && roomCode) db.ref(`rooms/${roomCode}/players`).off('value', gamePlayersListener);
  if (roomLeaderboardListener && roomCode) db.ref(`rooms/${roomCode}`).off('value', roomLeaderboardListener);
  if (quizStateListener && roomCode) db.ref(`rooms/${roomCode}/quiz_state`).off('value', quizStateListener);

  if (roomCode) {
    if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
    if (!roomWasDeletedByHost && myId === roomHostId && !roomCode.startsWith("TRN_")) {} else {
      if (currentRoomListener) currentRoomListener.off();
      if (pingPongListener) db.ref(`rooms/${roomCode}/pingpong`).off('value');
      db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
      db.ref(`rooms/${roomCode}/players/${myId}`).remove();
      roomCode = "";
    }
  } else { if (currentRoomListener) currentRoomListener.off(); }
  hideChat(); showScreen(targetScreen);
}

function joinRoomLogic(isReconnect = false) {
  gameRunning = false; localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
  const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
  
  playerRef.once('value', snap => {
    const pData = snap.val();
    if (pData?.finished) { showScreen('leaderboardScreen'); activeTab="room"; showLeaderboardTab('tabRoomBtn'); localStorage.removeItem(STORAGE_ROOM_KEY); return; }
    if (pData) {
      totalScore = pData.score || 0; wordIndex = quizQuestionIndex = pData.wordIndex || 0; matchDetailsArray = pData.matchDetails || [];
      if (isRejoining) showToast("🔄 Partita recuperata!");
    }

    showScreen('lobbyScreen'); byId('lobbyTitleText').textContent = roomCode.startsWith("TRN_") ? i18n[currentLang].lobby_trn : i18n[currentLang].lobby_free;
    byId('permanentGameInput').blur();
    playerRef.onDisconnect().update({ online: false });
    pData ? playerRef.update({ online: true }) : playerRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, score: 0, wpm: 0, finished: false, teamId: myTeamId, ready: false, online: true });

    listenToChat();
    if (currentRoomListener && !isReconnect) currentRoomListener.off();

    currentRoomListener = db.ref(`rooms/${roomCode}`);
    currentRoomListener.on('value', roomSnap => {
      if (!roomSnap.exists()) return exitRoomCleanly(true);
      const rData = roomSnap.val();
      currentMode = rData.mode; requestedWordCount = rData.wordCount; isSinglePlayer = rData.type === 'single'; isFixedSpeed = rData.fixedSpeed || false; roomHostId = rData.hostId;
      
      if (rData.status === 'playing' && !gameRunning) { currentWpm = baseWpm = rData.wpm; currentTone = rData.tone; if(rData.words) gameWords = rData.words; return resumeGameSequence(); }
      if (rData.status === 'countdown' && !gameRunning) { currentWpm = baseWpm = rData.wpm; currentTone = rData.tone; if(rData.words) gameWords = rData.words; return startCountdownSequence(); }
      if (rData.status === 'waiting') {
        renderPlayersList(rData.players || {}, rData.hostId);
        if (myId === rData.hostId && Object.keys(rData.players||{}).length > lastPlayerCount && activeChatContext !== 'room') showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è nella tua stanza.");
        lastPlayerCount = Object.keys(rData.players||{}).length;
        if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
        if (rData.expiresAt && !isSinglePlayer) lobbyTimerInterval = setInterval(() => {
          const diff = rData.expiresAt - Date.now();
          if (diff <= 0) { clearInterval(lobbyTimerInterval); byId('lobbyTimerText').textContent = "Tempo scaduto!"; }
          else byId('lobbyTimerText').textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2,'0')}`;
        }, 1000);
        else byId('lobbyTimerText').textContent = "";
      }
    });
  });
}

byId('inviteFriendsBtn').addEventListener('click', () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=room_${roomCode}`)}&text=${encodeURIComponent(`Sfida in Telegrafia! Entra: #${roomCode}`)}`));

function renderPlayersList(playersData, hostId) {
  const list = byId('playersList'); list.innerHTML = '';
  const count = Object.keys(playersData).length;
  if (count > lastPlayerCount && lastPlayerCount > 0) { playBeep(500,0.1); setTimeout(()=>playBeep(700,0.15),150); showToast("👤 Nuovo giocatore!"); }
  lastPlayerCount = count;

  let allReady = count >= 2;
  Object.entries(playersData).forEach(([id, data]) => {
    if (!data.ready) allReady = false;
    const li = document.createElement('li');
    li.innerHTML = `<span>${data.ready?'✅':'⏳'} <b style="${data.username?'color:var(--link-color);cursor:pointer;text-decoration:underline;':''}">${escapeHTML(data.name)}</b></span>${id === hostId ? '<small> (HOST)</small>' : ''}`;
    if (data.username) li.querySelector('b').onclick = () => openTelegramProfile(data.username);
    list.appendChild(li);
  });

  const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong';
  const amIHost = myId === hostId || roomCode.startsWith("TRN_");
  const amIReady = playersData[myId]?.ready;

  byId('startMultiplayerBtn').style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none';
  byId('deleteRoomBtn').style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none';
  byId('readyBtn').style.display = (isTrnOrPP && !amIReady) ? 'block' : 'none';
  
  const t = i18n[currentLang];
  byId('waitingHostText').style.display = (isTrnOrPP ? amIReady : !amIHost) ? 'block' : 'none';
  byId('waitingHostText').textContent = t.waiting_host;
  byId('statusInfoText').textContent = isTrnOrPP ? (amIReady ? t.ready_btn : t.conn_secure) : (amIHost ? t.status_host : t.status_guest);

  if (allReady && isTrnOrPP && (Object.keys(playersData)[0] === myId || amIHost)) db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
}

byId('readyBtn').addEventListener('click', () => roomCode && db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true }));

const getLevenshteinDistance = (a, b) => {
  const m = []; for (let i=0; i<=b.length; i++) m[i] = [i]; for (let j=0; j<=a.length; j++) m[0][j] = j;
  for (let i=1; i<=b.length; i++) for (let j=1; j<=a.length; j++) m[i][j] = b.charAt(i-1)===a.charAt(j-1) ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}

const renderDiffSecure = (container, real, typed) => {
  for (let i = 0, m = Math.max(real.length, typed.length); i < m; i++) {
    if (!real[i]) continue;
    const span = document.createElement('span'); span.textContent = real[i];
    if (typed[i] !== real[i]) span.style.color = "#d32f2f";
    container.appendChild(span);
  }
}

byId('replayWordBtn').addEventListener('click', () => {
  if (!gameRunning || !inputActive) return;
  usedReplay = true; playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm); byId('permanentGameInput').focus();
});

const permInput = byId('permanentGameInput');
permInput.addEventListener('input', e => {
  if (currentMode === 'chars' && inputActive && gameRunning && permInput.value.trim().length > 0) {
    handleWordSubmission(permInput.value.trim().toUpperCase()[0]); permInput.value = "";
  }
});
permInput.addEventListener('keypress', e => {
  if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars' && permInput.value.trim() !== "") {
    handleWordSubmission(permInput.value.trim().toUpperCase()); permInput.value = "";
  }
});

function handleWordSubmission(userWord) {
  inputActive = false;
  const currentWord = gameWords[wordIndex].toUpperCase();
  let points = 0, color = "", ms = Date.now() - lastWordStartTime, lev = getLevenshteinDistance(currentWord, userWord);

  if (currentMode === 'chars') {
    points = userWord === currentWord ? Math.max(100, Math.floor(1000 - ms/2)) : 0;
    color = points > 0 ? "#4caf50" : "#d32f2f";
  } else {
    let base = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(lev + 1, 2));
    let mult = 1.0, estMs = (currentWord.length * 60 / currentWpm) * 1000;
    if (ms > estMs + 2000) mult = Math.max(0.5, 1.0 - ((ms - estMs - 2000) / 20000));
    else if (ms < estMs && lev === 0) mult = 1.1;
    points = Math.round(base * mult);
    color = lev === 0 ? (usedReplay ? "#999" : "#4caf50") : (lev === 1 ? "#ff9800" : "#d32f2f");
    if (usedReplay) points = Math.round(points * 0.2);
  }

  if (lev > 0) {
    [...new Set(currentWord.split('').filter((c,i) => c !== userWord[i]))].forEach(c => {
      if (['__proto__','constructor','prototype'].includes(c)) return;
      sessionCharErrors[c] = (sessionCharErrors[c] || 0) + 1;
      if (!sessionErrorsByWpm[currentWpm]) sessionErrorsByWpm[currentWpm] = {};
      sessionErrorsByWpm[currentWpm][c] = (sessionErrorsByWpm[currentWpm][c] || 0) + 1;
    });
  }

  if (!isFixedSpeed && currentMode !== 'chars') {
    if (lev === 0 && !usedReplay) currentWpm += 2; else if (lev === 1) currentWpm -= 1; else currentWpm -= 2;
    currentWpm = Math.max(10, currentWpm);
  }

  totalScore += points; matchDetailsArray.push({ real: currentWord, typed: userWord, points, wpm: currentWpm, ms });

  if (currentMode !== 'pingpong') {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(userWord)}</td><td><b>${escapeHTML(currentWord)}</b></td><td style="color:${color};font-weight:bold;">${currentMode === 'chars' ? `${points} (${ms}ms)` : (usedReplay ? '0 (Replay)' : (points > 0 ? '+'+points : points))}</td>`;
    byId('tableBody').appendChild(tr); byId('tableWrapper').scrollTop = byId('tableWrapper').scrollHeight;
  }

  byId('wpmDisplay').textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; byId('scoreDisplay').textContent = `Punti: ${totalScore}`;
  if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wpm: currentWpm, wordIndex: wordIndex + 1, matchDetails: matchDetailsArray });
  usedReplay = false;

  if (currentMode === 'pingpong') {
    wordIndex++;
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => d ? { ...d, senderId: myId, word: '', wordsPlayed: (d.wordsPlayed||0)+1, lastGuess: { id: Date.now(), real: currentWord, typed: userWord, points } } : d);
  } else { wordIndex++; setTimeout(playNextWord, 600); }
}

byId('btnSendPingPong').addEventListener('click', () => {
  if (!gameRunning || currentMode !== 'pingpong') return;
  const word = byId('pingPongWordToSend').value.trim().toUpperCase();
  if (word) db.ref(`rooms/${roomCode}/pingpong`).transaction(d => d ? { ...d, word, wordId: (d.wordId||0)+1 } : d);
});
byId('pingPongWordToSend').addEventListener('keypress', e => { if(e.key === 'Enter') byId('btnSendPingPong').click(); });

function playNextWord() {
  if (!gameRunning || currentMode === 'pingpong') return;
  if (wordIndex >= requestedWordCount) return finishGame();
  if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * 301) + 400;
  
  inputActive = true; usedReplay = false; const word = gameWords[wordIndex].toUpperCase();
  const hintEl = byId('easyModeHint');
  if (isEasyMode && isSinglePlayer) { hintEl.textContent = word.split('').sort(()=>0.5-Math.random()).join(' '); hintEl.style.display = 'block'; } else hintEl.style.display = 'none';
  
  playMorseAudio(word, currentWpm); lastWordStartTime = Date.now(); byId('permanentGameInput').focus();
}

function startCountdownSequence() {
  getAudioContext();
  if (currentRoomListener) currentRoomListener.off();
  if (!isSinglePlayer) {
    db.ref(`rooms/${roomCode}/players`).once('value', snap => {
      gameStartPlayerCount = snap.exists() ? Object.keys(snap.val()).length : 0;
      if (gamePlayersListener) db.ref(`rooms/${roomCode}/players`).off('value', gamePlayersListener);
      gamePlayersListener = db.ref(`rooms/${roomCode}/players`).on('value', pSnap => {
        if (!gameRunning) return;
        if (gameStartPlayerCount > 0 && Object.keys(pSnap.val()||{}).length < gameStartPlayerCount) {
          setTimeout(() => db.ref(`rooms/${roomCode}/players`).once('value', s => {
            if (gameRunning && Object.keys(s.val()||{}).length < gameStartPlayerCount) { alert("Giocatore uscito. Fine partita."); gameRunning = false; exitRoomCleanly(false); }
            else if (gameRunning) showToast("👥 Giocatore rientrato!");
          }), 10000);
        }
      });
    });
  }

  byId('wpmDisplay').textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; byId('scoreDisplay').textContent = "Punti: 0";
  if (!isRejoining) { totalScore = currentStreak = wordIndex = quizQuestionIndex = 0; usedReplay = false; sessionCharErrors = {}; sessionErrorsByWpm = {}; matchDetailsArray = []; }
  byId('tableBody').innerHTML = ""; window.lastPlayedWordId = window.lastSeenGuessId = 0;
  if (pingPongListener) db.ref(`rooms/${roomCode}/pingpong`).off('value', pingPongListener);
  byId('pingPongSendArea').style.display = 'none'; byId('gameInputArea').style.display = 'flex';

  if (currentMode === 'pingpong' && (myId === roomHostId || roomCode.startsWith("TRN_"))) {
    db.ref(`rooms/${roomCode}/pingpong`).once('value', s => { if(!s.exists()) db.ref(`rooms/${roomCode}/pingpong`).set({ senderId: myId, word: '', wordId: 0, wordsPlayed: 0, lastGuess: null }); });
  }

  showScreen('countdownScreen'); gameRunning = true; let count = 3; byId('countdownNumber').textContent = count;
  const interval = setInterval(() => {
    if (--count > 0) { byId('countdownNumber').textContent = count; playBeep(600, 0.1); }
    else {
      clearInterval(interval);
      if (myId === roomHostId) db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
      byId('countdownNumber').textContent = currentLang === 'en' ? 'GO!' : 'VIA!'; playBeep(800, 0.3);
      setTimeout(() => {
        if (!gameRunning) return;
        if (currentMode === 'quiz') return startQuizSequence();
        showScreen('gameArea');
        if (currentMode === 'pingpong') setupPingPongListener();
        else { setTimeout(() => byId('permanentGameInput').focus(), 200); setTimeout(() => { if(gameRunning) playNextWord(); }, 800); }
      }, 500);
    }
  }, 1000);
}

function resumeGameSequence() {
  getAudioContext(); gameRunning = true; isRejoining = false;
  byId('wpmDisplay').textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`; byId('scoreDisplay').textContent = `Punti: ${totalScore}`;
  const body = byId('tableBody'); body.innerHTML = "";
  matchDetailsArray.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(row.typed)}</td><td><b>${escapeHTML(row.real)}</b></td><td style="color:${row.points > 0 ? '#4caf50' : (row.points === 0 && row.typed !== row.real ? '#d32f2f' : '#999')};font-weight:bold;">${row.points}</td>`;
    body.appendChild(tr);
  });
  if (currentMode === 'quiz') startQuizSequence();
  else {
    showScreen('gameArea');
    if (currentMode === 'pingpong') setupPingPongListener();
    else { setTimeout(() => byId('permanentGameInput').focus(), 200); setTimeout(() => { if(gameRunning) playNextWord(); }, 800); }
  }
}

let ppTimerInterval = null;
function setupPingPongListener() {
  if (pingPongListener) db.ref(`rooms/${roomCode}/pingpong`).off('value', pingPongListener);
  pingPongListener = db.ref(`rooms/${roomCode}/pingpong`).on('value', snap => {
    if (!gameRunning) return;
    const pp = snap.val(); if (!pp) return;
    
    if (pp.lastGuess && pp.lastGuess.id !== window.lastSeenGuessId) {
      window.lastSeenGuessId = pp.lastGuess.id;
      const tr = document.createElement('tr');
      const tdReal = document.createElement('td'); renderDiffSecure(tdReal, pp.lastGuess.real, pp.lastGuess.typed || '');
      tr.innerHTML = `<td>${escapeHTML(pp.lastGuess.typed || '')}</td>`;
      tr.appendChild(tdReal);
      tr.innerHTML += `<td style="color:${pp.lastGuess.points > 0 ? '#4caf50' : (pp.lastGuess.points === 0 && pp.lastGuess.typed !== pp.lastGuess.real ? '#d32f2f' : '#999')};font-weight:bold;">${pp.lastGuess.points}</td>`;
      byId('tableBody').appendChild(tr); byId('tableWrapper').scrollTop = byId('tableWrapper').scrollHeight;
    }
    if (pp.wordsPlayed >= requestedWordCount) { if(ppTimerInterval) clearInterval(ppTimerInterval); return finishGame(); }

    if (pp.senderId === myId) {
      if (!pp.word) {
        byId('pingPongSendArea').style.display = 'flex'; byId('gameInputArea').style.display = 'none';
        byId('pingPongWordToSend').value = ''; setTimeout(() => byId('pingPongWordToSend').focus(), 100); startPingPongTimer();
      } else {
        if(ppTimerInterval) clearInterval(ppTimerInterval);
        byId('pingPongSendArea').style.display = 'none'; byId('gameInputArea').style.display = 'flex';
        byId('permanentGameInput').disabled = true; byId('permanentGameInput').placeholder = "Avversario in decodifica..."; byId('permanentGameInput').value = "";
      }
    } else {
      if(ppTimerInterval) clearInterval(ppTimerInterval);
      byId('pingPongSendArea').style.display = 'none'; byId('gameInputArea').style.display = 'flex';
      if (pp.word && pp.wordId > window.lastPlayedWordId) {
        window.lastPlayedWordId = pp.wordId; gameWords[wordIndex] = pp.word;
        byId('permanentGameInput').disabled = false; byId('permanentGameInput').placeholder = "Decodifica e scrivi..."; byId('permanentGameInput').value = "";
        setTimeout(() => byId('permanentGameInput').focus(), 100); inputActive = true;
        setTimeout(() => playMorseAudio(pp.word.toUpperCase(), currentWpm), 500);
      } else if (!pp.word) {
        byId('permanentGameInput').disabled = true; byId('permanentGameInput').placeholder = "In attesa dell'avversario..."; byId('permanentGameInput').value = ""; inputActive = false;
      }
    }
  });
}

function startPingPongTimer() {
  if (ppTimerInterval) clearInterval(ppTimerInterval);
  const bar = byId('pingPongTimerProgress'); let tl = 100; bar.style.width = '100%';
  ppTimerInterval = setInterval(() => {
    tl -= (100 / 300); bar.style.width = Math.max(0, tl) + '%';
    if (tl <= 0) { clearInterval(ppTimerInterval); sendAutoPingPongWord(); }
  }, 100);
}

function sendAutoPingPongWord() {
  if (!gameRunning || currentMode !== 'pingpong') return;
  const rw = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
  db.ref(`rooms/${roomCode}/pingpong`).transaction(d => d && !d.word ? { ...d, word: rw, wordId: (d.wordId||0)+1 } : d);
  showToast(currentLang==='it' ? "Tempo scaduto! Parola inviata." : "Time's up! Word sent.");
}

function finishGame() {
  gameRunning = inputActive = false; byId('permanentGameInput').blur();
  [ppTimerInterval, quizTimerInterval].forEach(clearInterval);
  if (pingPongListener) db.ref(`rooms/${roomCode}/pingpong`).off('value');
  if (quizStateListener) db.ref(`rooms/${roomCode}/quiz_state`).off('value');
  localStorage.removeItem(STORAGE_ROOM_KEY); isRejoining = isChallenging = false; showScreen('leaderboardScreen');

  if (roomCode) {
    db.ref(`rooms/${roomCode}/players/${myId}`).update({ finished: true, score: totalScore, wpm: currentWpm, matchDetails: matchDetailsArray });
    db.ref(`rooms/${roomCode}/players/${myId}`).onDisconnect().cancel();
  }

  if (totalScore > 0 && !roomCode.startsWith("TRN_")) {
    db.ref(`rooms/${roomCode}/players`).once('value', snap => {
      const isSolo = isSinglePlayer || Object.keys(snap.val()||{}).length < 2;
      let path = `leaderboard/${currentMode==='callsign'?'callsign/global':`${currentMode}/${isSolo?'single':'multi'}_${requestedWordCount}`}/${myId}`;
      if (currentMode !== 'callsign') {
        const sel = byId('lbWordFilter');
        if (![...sel.options].some(o=>o.value==requestedWordCount) && requestedWordCount!=='all') sel.add(new Option(`${requestedWordCount} Stringhe`, requestedWordCount));
        sel.value = requestedWordCount;
      }
      db.ref(path).once('value', s => {
        if (!s.val() || totalScore > s.val().score) db.ref(path).set({ name: myName, username: myPrivacy?"":tgUsername, score: totalScore, wpm: currentWpm, wordCount: requestedWordCount, date: new Date().toLocaleDateString('it-IT') });
      });
    });
  }

  if (matchDetailsArray.length > 0) {
    db.ref(`users/${myId}/history`).push().set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: currentWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });
    updateActivity(totalScore > 0);
    if (Object.keys(sessionCharErrors).length > 0) db.ref(`users/${myId}/stats/charErrors`).transaction(d => { d=d||{}; for(let c in sessionCharErrors) d[c] = (d[c]||0)+sessionCharErrors[c]; return d; });
    if (Object.keys(sessionErrorsByWpm).length > 0) db.ref(`users/${myId}/stats/errorsByWpm`).transaction(d => { d=d||{}; for(let w in sessionErrorsByWpm){ d[w]=d[w]||{}; for(let c in sessionErrorsByWpm[w]) d[w][c] = (d[w][c]||0)+sessionErrorsByWpm[w][c]; } return d; });
  }

  activeTab = (roomCode && roomCode.startsWith("TRN_")) || !isSinglePlayer ? "room" : currentMode === 'callsign' ? "cwfreak" : currentMode === 'pingpong' ? "pingpong" : "std_single";
  showLeaderboardTab(activeTab === 'room' ? 'tabRoomBtn' : activeTab === 'cwfreak' ? 'tabGlobalCWFreakBtn' : activeTab === 'pingpong' ? 'tabGlobalPingPongBtn' : 'tabGlobalStandardSingleBtn');
  if (activeTab === 'room') listenToRoomLeaderboard();
}

byId('quitGameBtn').addEventListener('click', () => { if (confirm("Vuoi abbandonare la partita?")) { gameRunning = false; exitRoomCleanly(); } });
byId('startMultiplayerBtn').addEventListener('click', () => db.ref(`rooms/${roomCode}/players`).once('value', s => { if(currentMode==='pingpong' && Object.keys(s.val()||{}).length<2) return alert("Ping Pong richiede almeno 2 giocatori!"); db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null }); }));
byId('deleteRoomBtn').addEventListener('click', () => { if (confirm("Eliminare stanza?")) db.ref(`rooms/${roomCode}`).remove().then(() => exitRoomCleanly(true)); });
byId('leaveLobbyBtn').addEventListener('click', () => exitRoomCleanly());
byId('deleteDataBtn').addEventListener('click', async () => {
  if (!confirm("⚠️ Eliminerai per sempre TUTTI i tuoi dati. Confermi?")) return;
  try {
    await db.ref(`leaderboard`).once('value', s => s.forEach(m => m.forEach(t => t.forEach(r => { if(r.key===myId || r.key.startsWith(myId+"_")) r.ref.remove(); }))));
    const teams = (await db.ref('teams').once('value')).val() || {};
    for (let t in teams) if (teams[t].members?.[myId]) teams[t].captainId === myId && Object.keys(teams[t].members).length === 1 ? await db.ref(`teams/${t}/status`).set('retired') : (teams[t].captainId === myId ? await db.ref(`teams/${t}/captainId`).set(Object.keys(teams[t].members).find(k=>k!==myId)) : null), await db.ref(`teams/${t}/members/${myId}`).remove();
    const trns = (await db.ref('tournaments').once('value')).val() || {};
    for (let t in trns) if (trns[t].matches) for (let m in trns[t].matches) { if (trns[t].matches[m].playerA?.id===myId) await db.ref(`tournaments/${t}/matches/${m}/playerA`).remove(); if (trns[t].matches[m].playerB?.id===myId) await db.ref(`tournaments/${t}/matches/${m}/playerB`).remove(); }
    await db.ref(`users/${myId}`).remove(); alert("Dati eliminati."); window.Telegram.WebApp.close();
  } catch (e) { alert("Errore: " + e.message); }
});

byId('saveAliasBtn').addEventListener('click', async () => {
  const alias = byId('userAliasInput').value.trim(), privacy = byId('privacyUsernameCheckbox').checked;
  if (privacy && !alias) return alert("L'Alias è obbligatorio se nascondi lo username!");
  if (alias.length > 15) return alert("Alias max 15 car.");
  
  myName = alias || tgUser.first_name; myPrivacy = privacy; byId('playerName').textContent = myName; showToast("Profilo aggiornato!");
  const uName = privacy ? "" : tgUsername;
  
  try {
    await db.ref(`users/${myId}`).update({ alias: alias || null, privacyUsername: privacy });
    await db.ref(`presence/${myId}`).update({ name: myName, username: uName });
    const now = new Date(), paths = [`activity/daily/${now.toISOString().split('T')[0]}`, `activity/weekly/${getWeekNumber(now)}`, `activity/monthly/${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`];
    for (let p of paths) { const s = await db.ref(`${p}/${myId}`).once('value'); if(s.exists()) await db.ref(`${p}/${myId}`).update({ name: myName }); }
    if (myTeamId) await db.ref(`teams/${myTeamId}/members/${myId}`).update({ name: myName, username: uName });
    
    const trns = (await db.ref('tournaments').once('value')).val() || {};
    for (let t in trns) if (trns[t].status !== 'finished' && trns[t].matches) for (let m in trns[t].matches) { if (trns[t].matches[m].playerA?.id===myId) await db.ref(`tournaments/${t}/matches/${m}/playerA`).update({name:myName,username:uName}); if (trns[t].matches[m].playerB?.id===myId) await db.ref(`tournaments/${t}/matches/${m}/playerB`).update({name:myName,username:uName}); }
    
    for (let p of ['callsign/global', 'standard', 'pingpong', 'chars']) {
      const s = await db.ref(`leaderboard/${p}`).once('value');
      if (s.exists()) s.forEach(sn => p === 'callsign/global' ? (sn.key === myId && sn.ref.update({ name: myName, username: uName })) : sn.forEach(u => u.key === myId && u.ref.update({ name: myName, username: uName })));
    }
  } catch(e) { alert("Errore salvataggio."); }
});

byId('resetStatsBtn').addEventListener('click', async () => {
  if (confirm(currentLang==='it' ? "Azzerare tutte le statistiche?" : "Reset all stats?")) {
    await Promise.all([db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove()]);
    showToast("Statistiche azzerate!"); showProfileScreen();
  }
});

let userMatchHistory = [];
window.showProfileScreen = () => {
  showScreen('profileScreen'); byId('errorChartContainer').textContent = byId('wpmErrorChartContainer').textContent = byId('matchHistoryList').textContent = 'Caricamento...';
  
  db.ref(`users/${myId}/stats/charErrors`).once('value').then(s => {
    const c = byId('errorChartContainer'); c.innerHTML = ''; const errs = Object.entries(s.val()||{}).sort((a,b)=>b[1]-a[1]);
    if (!errs.length) return c.innerHTML = '<p style="text-align:center;color:var(--hint-color);">Nessun errore.</p>';
    errs.forEach(([ch, cnt]) => c.innerHTML += `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="width:20px;font-weight:bold;">${ch}</span><div style="flex-grow:1;background:var(--bg-color);border:1px solid var(--hint-color);border-radius:4px;height:12px;margin:0 5px;overflow:hidden;"><div style="width:${cnt/errs[0][1]*100}%;background:#d32f2f;height:100%;"></div></div><span style="width:25px;text-align:right;font-size:0.9em;font-weight:bold;">${cnt}</span></div>`);
  });
  
  db.ref(`users/${myId}/stats/errorsByWpm`).once('value').then(s => {
    const c = byId('wpmErrorChartContainer'); c.innerHTML = ''; const we = s.val()||{};
    if (!Object.keys(we).length) return c.innerHTML = '<p style="text-align:center;color:var(--hint-color);">Nessun errore.</p>';
    Object.keys(we).sort((a,b)=>b-a).forEach(w => {
      let top = Object.entries(we[w]).sort((a,b)=>b[1]-a[1])[0], tot = Object.values(we[w]).reduce((a,b)=>a+b,0);
      c.innerHTML += `<div style="margin-bottom:8px;border-bottom:1px solid var(--hint-color);padding-bottom:4px;"><div style="display:flex;justify-content:space-between;font-weight:bold;color:var(--link-color);"><span>${w} WPM</span><span>Tot: ${tot} err</span></div><div style="font-size:0.85em;color:var(--text-color);">Peggior lettera: <b>${top[0]}</b> (${top[1]} volte)</div></div>`;
    });
  });
  
  db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(30).once('value').then(s => {
    const l = byId('matchHistoryList'); l.innerHTML = ''; userMatchHistory = []; s.forEach(c => userMatchHistory.push({ key: c.key, ...c.val() }));
    if (!userMatchHistory.length) return l.innerHTML = '<li style="justify-content:center;color:var(--hint-color);">Nessuna partita.</li>';
    userMatchHistory.reverse().forEach(m => {
      const d = new Date(m.date||Date.now()), icon = m.mode==='callsign'?'🎙️ Nom.':m.mode==='pingpong'?'🏓 Ping':m.mode==='chars'?'⌨️ Carat.':'🔤 Parole';
      const li = document.createElement('li'); li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';
      li.innerHTML = `<div style="display:flex;justify-content:space-between;width:100%;margin-bottom:5px;"><span style="font-size:0.85em;font-weight:bold;">${icon} (${m.type})</span><span style="font-size:0.8em;color:var(--hint-color);">${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span></div>`;
      const bot = document.createElement('div'); bot.style.display = 'flex'; bot.style.justifyContent = 'space-between'; bot.style.width = '100%'; bot.style.alignItems = 'center';
      bot.innerHTML = `<span><b>${m.score} pt</b><small> (${m.wpm} WPM)</small></span>`;
      const btns = document.createElement('div'); btns.style.display = 'flex'; btns.style.gap = '5px';
      const v = document.createElement('button'); v.className="action-btn-small btn-secondary"; v.textContent="Vedi"; v.onclick = () => openMatchDetails(m.key);
      const del = document.createElement('button'); del.className="action-btn-small btn-danger"; del.textContent="X"; del.onclick = () => { if(confirm("Eliminare?")) db.ref(`users/${myId}/history/${m.key}`).remove().then(()=>showProfileScreen()); };
      btns.append(v, del); bot.appendChild(btns); li.appendChild(bot); l.appendChild(li);
    });
  });
}

window.openMatchDetails = k => {
  const d = userMatchHistory.find(m => m.key === k)?.details; if (!d) return;
  byId('matchDetailsBody').innerHTML = '';
  d.forEach(r => { const tr = document.createElement('tr'); const tdR = document.createElement('td'); const bR = document.createElement('b'); renderDiffSecure(bR, r.real, r.typed||''); tdR.appendChild(bR); tr.innerHTML = `<td>${escapeHTML(r.typed||'-')}</td>`; tr.appendChild(tdR); tr.innerHTML += `<td style="color:${r.points>0?'#4caf50':(r.points===0&&r.typed!==r.real?'#d32f2f':'#999')};font-weight:bold;">${r.points}</td>`; byId('matchDetailsBody').appendChild(tr); });
  byId('matchDetailsModal').style.display = 'flex';
}

function showLeaderboardTab(tabId) {
  const map = { 'tabRoomBtn':'room', 'tabGlobalTournamentBtn':'trn_global', 'tabGlobalCWFreakBtn':'cwfreak', 'tabGlobalPingPongBtn':'pingpong', 'tabGlobalStandardMultiBtn':'std_multi', 'tabGlobalStandardSingleBtn':'std_single', 'tabGlobalCharsMultiBtn':'chars_multi', 'tabGlobalCharsSingleBtn':'chars_single', 'tabGlobalQuizMultiBtn':'quiz_multi', 'tabGlobalQuizSingleBtn':'quiz_single' };
  let val = map[tabId] || tabId; byId('lbModeSelect').value = val;
  const [f, rw, w, trnS] = ['lbFilterArea', 'roomWinnerBanner', 'waitingOthersText', 'trnSubTabs'].map(byId);
  trnS.style.display = 'none';

  if (val === 'room') {
    f.style.display = 'none'; rw.style.display = 'block'; byId('leaderboardContainer').innerHTML = '';
    roomCode ? db.ref(`rooms/${roomCode}/players`).once('value', s => renderRoomLeaderboard(s.val()||{})) : (byId('leaderboardContainer').innerHTML = '<p style="text-align:center;">Nessuna partita attiva.</p>', w.style.display = 'none');
  } else if (val === 'trn_global') {
    f.style.display = rw.style.display = w.style.display = 'none'; trnS.style.display = 'flex'; document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); byId('btnTrnGlobalLB').classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('tournaments', null);
  } else if (val === 'cwfreak') { f.style.display = rw.style.display = w.style.display = 'none'; fetchAndRenderGlobalLeaderboard('callsign', null); }
  else {
    f.style.display = 'block'; rw.style.display = w.style.display = 'none';
    const dynPath = val==='pingpong'?'recent_matches/pingpong':val==='chars_multi'?'recent_matches/chars_multi':val==='chars_single'?'chars':val==='quiz_multi'?'recent_matches/quiz_multi':val==='quiz_single'?'quiz':val==='std_multi'?'recent_matches/standard_multi':'standard';
    populateDynamicFilters(dynPath, val.endsWith('single')?'single':'');
    fetchAndRenderGlobalLeaderboard(val==='std_multi'?'standard_multi':val==='std_single'?'standard_single':val, byId('lbWordFilter').value);
  }
}

byId('lbModeSelect').addEventListener('change', e => showLeaderboardTab(activeTab = e.target.value));
byId('btnTrnGlobalLB').addEventListener('click', () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b=>b.classList.remove('active-tab')); byId('btnTrnGlobalLB').classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('tournaments', null); });
byId('btnTrnActiveLB').addEventListener('click', () => { document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b=>b.classList.remove('active-tab')); byId('btnTrnActiveLB').classList.add('active-tab'); fetchAndRenderGlobalLeaderboard('active_tournament', null); });
byId('lbWordFilter').addEventListener('change', () => showLeaderboardTab(activeTab));

function populateDynamicFilters(path, sub = "") {
  const sel = byId('lbWordFilter'), cur = sel.value;
  db.ref(`leaderboard/${path}`).once('value', s => {
    let opts = ['<option value="all">Tutte le categorie</option>'], cnts = [];
    s.forEach(n => { const k = n.key; if(path.startsWith('recent_matches')) { if(k!=='unknown' && !cnts.includes(k)) cnts.push(k); } else if(!sub || k.startsWith(sub+"_")) { const c = k.split('_').pop(); if(!cnts.includes(c)) cnts.push(c); } });
    cnts.sort((a,b)=>a-b).forEach(c => opts.push(`<option value="${c}">${c} Stringhe</option>`));
    sel.innerHTML = opts.join(''); if(cnts.includes(cur) || cur==='all') sel.value = cur;
  });
}

function listenToRoomLeaderboard() {
  if (!roomCode) return;
  if (roomLeaderboardListener) db.ref(`rooms/${roomCode}`).off('value', roomLeaderboardListener);
  roomLeaderboardListener = db.ref(`rooms/${roomCode}`).on('value', s => {
    if (!s.exists()) return;
    const rData = s.val(), p = rData.players || {};
    if (activeTab === "room") renderRoomLeaderboard(p);
    if (Object.values(p).every(x => x.finished) && rData.status !== 'finished' && Object.keys(p).length > 0) {
      db.ref(`rooms/${roomCode}/status`).set('finished');
      if (Object.keys(p).length >= 2 && ['multi','pingpong','chars','quiz'].includes(rData.type || currentMode)) saveMatchToGlobalHistory(p, rData);
      if (roomCode.startsWith("TRN_")) {
        const mId = roomCode.replace("TRN_", ""); let max = -1, wT = null;
        Object.values(p).forEach(x => { if(x.score > max){ max = x.score; wT = x.teamId; } else if(x.score===max) wT = "tie"; });
        if (activeTrnId) db.ref(`tournaments/${activeTrnId}/matches/${mId}`).update({ status: 'finished', winnerTeamId: wT }).then(() => checkTournamentCompletion(activeTrnId));
        if (wT && wT !== "tie" && activeTrnId) db.ref(`tournaments/${activeTrnId}/standings/${wT}`).transaction(t => { if(t) t.points=(t.points||0)+1; return t; });
        setTimeout(() => roomCode && db.ref(`rooms/${roomCode}`).remove(), 15000);
      } else if (rData.hostId === myId) setTimeout(() => roomCode && db.ref(`rooms/${roomCode}`).remove(), 30000);
    }
  });
}

function checkTournamentCompletion(tId) {
  db.ref(`tournaments/${tId}`).once('value', s => {
    const trn = s.val(); if (!trn || trn.status === 'finished' || !trn.matches) return;
    if (Object.values(trn.matches).every(m => m.status === 'finished')) {
      db.ref(`tournaments/${tId}/status`).set('finished'); showToast("Torneo completato!");
      if (trn.standings) Object.entries(trn.standings).forEach(([id, d]) => { if(d.points > 0) db.ref(`leaderboard/tournaments/${id}`).transaction(g => g ? { ...g, score: (g.score||0)+d.points, date: new Date().toLocaleDateString('it-IT') } : { name: d.name, score: d.points, date: new Date().toLocaleDateString('it-IT') }); });
    }
  });
}

function renderRoomLeaderboard(players) {
  const c = byId('leaderboardContainer'), wText = byId('waitingOthersText'); c.innerHTML = '';
  const arr = Object.entries(players).map(([id, d]) => ({ id, name: d.name || "Sconosciuto", username: d.username, score: d.score || 0, wpm: d.wpm || 0, finished: d.finished, matchDetails: d.matchDetails || [] }));
  if (!arr.length) return;
  wText.style.display = arr.every(p => p.finished) ? 'none' : 'block';

  if (arr.every(p => p.finished) && (roomCode?.startsWith("TRN_") || currentMode === 'pingpong' || arr.length > 1)) renderHeadToHeadView(arr, c);
  else {
    arr.sort((a,b) => b.score-a.score || b.wpm-a.wpm).forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'leaderboard-row';
      const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`;
      row.innerHTML = `<span>${m} <b style="${p.username?'color:var(--link-color);cursor:pointer;text-decoration:underline;':''}">${escapeHTML(p.name)}</b><br><small style="color:var(--hint-color);">(${p.wpm||0} WPM)</small></span><span><b>${p.score} pt</b></span>`;
      if(p.username) row.querySelector('b').onclick = () => openTelegramProfile(p.username);
      c.appendChild(row);
    });
  }
  if (arr.every(p => p.finished) && arr.length) byId('roomWinnerBanner').textContent = `🏆 ${currentLang==='it'?(roomCode?.startsWith("TRN_")?"Vince il match: ":"Vincitore: "):"Winner: "}${arr.sort((a,b)=>b.score-a.score)[0].name}`;
}

function renderHeadToHeadView(players, container) {
  const h2h = document.createElement('div'); h2h.className = 'h2h-container';
  players.sort((a,b) => b.score-a.score || b.wpm-a.wpm).forEach((p, i, arr) => {
    const card = document.createElement('div'); card.className = 'h2h-card' + (p.score === arr[0].score && p.score > 0 ? ' winner' : '');
    card.innerHTML = `<div class="h2h-name">${escapeHTML(p.name)}${p.id===myId?`<small> (${currentLang==='it'?'Tu':'You'})</small>`:''}</div><div class="h2h-stats"><div class="h2h-stat-row"><span>${currentLang==='it'?'Punti:':'Points:'}</span><span class="h2h-val" style="color:#4caf50;">${p.score}</span></div><div class="h2h-stat-row"><span>${currentLang==='it'?'Velocità:':'Speed:'}</span><span class="h2h-val" style="color:var(--link-color);">${p.wpm} WPM</span></div></div><div class="h2h-hint" style="${p.id!==myId?'opacity:0.5':''}">${p.id===myId?(currentLang==='it'?'Clicca per dettagli':'Click for details'):(currentLang==='it'?'Dettagli privati':'Details are private')}</div>`;
    card.onclick = () => { if(p.id!==myId) return showToast(currentLang==='it'?"Solo i tuoi dettagli.":"Only your details."); p.matchDetails?.length ? showPlayerDetailsModal(p.name, p.matchDetails) : (matchDetailsArray.length ? showPlayerDetailsModal(p.name, matchDetailsArray) : showToast(currentLang==='it'?"Dettagli non disponibili":"Details unavailable")); };
    h2h.appendChild(card);
  });
  container.appendChild(h2h);
}

function showPlayerDetailsModal(name, details) {
  byId('matchDetailsModal').querySelector('h3').textContent = `${currentLang==='it'?'Dettagli Partita di':'Match Details for'} ${name}`;
  byId('matchDetailsBody').innerHTML = '';
  details.forEach(r => { const tr = document.createElement('tr'); const tdR = document.createElement('td'); const bR = document.createElement('b'); renderDiffSecure(bR, r.real, r.typed||''); tdR.appendChild(bR); tr.innerHTML = `<td>${escapeHTML(r.typed||'-')}</td>`; tr.appendChild(tdR); tr.innerHTML += `<td style="color:${r.points>0?'#4caf50':(r.points===0&&r.typed!==r.real?'#d32f2f':'#999')};font-weight:bold;">${r.points}</td>`; byId('matchDetailsBody').appendChild(tr); });
  byId('matchDetailsModal').style.display = 'flex';
}

function saveMatchToGlobalHistory(players, rData) {
  if (myId !== rData.hostId) return;
  const path = currentMode==='pingpong'?'pingpong':currentMode==='chars'?'chars_multi':currentMode==='quiz'?'quiz_multi':'standard_multi';
  db.ref(`leaderboard/recent_matches/${path}/${rData.wordCount||'all'}/${Date.now()}`).set({ players: Object.entries(players).map(([id, d]) => ({ id, name: d.name, username: d.username||"", score: d.score||0, wpm: d.wpm||0, matchDetails: d.matchDetails||[] })), mode: currentMode, wordCount: rData.wordCount, date: new Date().toLocaleDateString('it-IT'), ts: firebase.database.ServerValue.TIMESTAMP });
}

function fetchAndRenderGlobalLeaderboard(tabType, wc) {
  const c = byId('leaderboardContainer'); c.innerHTML = '<p style="text-align:center;">Caricamento...</p>';
  if (['pingpong','standard_multi','chars_multi','quiz_multi'].includes(tabType)) {
    db.ref(`leaderboard/recent_matches/${tabType==='standard_multi'?'standard_multi':tabType}`).once('value', s => {
      let m = []; s.forEach(n => { if(wc!=='all' && n.key!==wc) return; n.forEach(mn => m.push(mn.val())); });
      m.sort((a,b) => (b.ts||0)-(a.ts||0)); renderMatchesHistoryHTML(m.slice(0,30), c);
    });
  } else if (tabType === 'callsign') db.ref('leaderboard/callsign/global').orderByChild('score').limitToLast(50).once('value', s => { let p=[]; s.forEach(ch=>p.push(ch.val())); renderPlayersListHTML(p.reverse(), c, false); });
  else if (tabType === 'tournaments') db.ref('leaderboard/tournaments').orderByChild('score').limitToLast(50).once('value', s => { let t=[]; s.forEach(ch=>t.push(ch.val())); renderPlayersListHTML(t.reverse(), c, false, true); });
  else if (tabType === 'active_tournament') {
    if (!activeTrnId) c.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang==='it'?"Nessun torneo attivo.":"No active tournament."}</p>`;
    else db.ref(`tournaments/${activeTrnId}`).once('value', s => {
      const trn = s.val(); if(trn?.standings) { c.innerHTML = `<div style="text-align:center;margin-bottom:10px;padding:5px;background:var(--sec-bg-color);border-radius:8px;"><small style="color:var(--hint-color)">${currentLang==='it'?'Torneo Attivo:':'Active Tournament:'}</small><br><b style="color:var(--champ-color);font-size:1.1em;">${escapeHTML(trn.name)}</b></div>`; const lc = document.createElement('div'); renderPlayersListHTML(Object.entries(trn.standings).map(([_,d])=>({name:d.name, score:d.points, date:currentLang==='it'?"In corso":"In progress"})).sort((a,b)=>b.score-a.score), lc, false, true); c.appendChild(lc); } else c.innerHTML = '<p style="text-align:center;">Dati non disponibili.</p>';
    });
  } else {
    const pth = tabType.startsWith('quiz')?'quiz':tabType.startsWith('chars')?'chars':tabType.startsWith('standard')?'standard':'pingpong';
    const sub = tabType.split('_')[1] || '';
    db.ref(`leaderboard/${pth}`).once('value', s => {
      let p = []; s.forEach(n => { if((sub && !n.key.startsWith(sub+"_")) || (wc!=='all' && !n.key.endsWith("_"+wc))) return; n.forEach(u => p.push(u.val())); });
      renderPlayersListHTML(p.sort((a,b)=>b.score-a.score||b.wpm-a.wpm).slice(0,100), c, true);
    });
  }
}

function renderMatchesHistoryHTML(matches, c) {
  c.innerHTML = '';
  if (!matches.length) return c.innerHTML = `<p style="text-align:center;color:var(--hint-color);">${currentLang==='it'?'Nessuna sfida recente.':'No recent challenges.'}</p>`;
  matches.forEach(m => {
    const w = document.createElement('div'); w.style.marginBottom = "25px"; w.style.borderBottom = "1px dashed var(--hint-color)"; w.style.paddingBottom = "15px";
    w.innerHTML = `<div style="text-align:center;font-size:0.8em;color:var(--hint-color);margin-bottom:8px;">📅 ${m.date} - ${m.wordCount} Stringhe</div>`;
    renderHeadToHeadView(m.players, w); c.appendChild(w);
  });
}

function renderPlayersListHTML(players, c, showWC, isTeam = false) {
  c.innerHTML = ''; if (!players.length) return c.innerHTML = '<p style="text-align:center;color:var(--hint-color);">Nessun record.</p>';
  players.forEach((p, i) => {
    const r = document.createElement('div'); r.className = 'leaderboard-row'; r.style.padding = "8px 10px"; r.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="color:var(--hint-color);font-size:0.8em;">${i+1}.</span>`;
    r.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-grow:1;"><div style="font-size:1.2em;min-width:1.5em;text-align:center;">${m}</div><div style="display:flex;flex-direction:column;"><div style="display:flex;align-items:center;"><b style="${p.username&&!isTeam?'color:var(--link-color);cursor:pointer;text-decoration:underline;':''}">${escapeHTML(p.name)}</b>${showWC&&p.wordCount?`<span style="background:var(--hint-color);color:var(--bg-color);padding:1px 4px;border-radius:3px;font-size:0.8em;margin-left:4px;">${p.wordCount} str.</span>`:''}</div><div style="font-size:0.75em;color:var(--hint-color);">${p.date} ${!isTeam&&p.wpm?`<span style="color:var(--champ-color);font-weight:bold;">${p.wpm} WPM</span>`:''}</div></div></div><div style="text-align:right;"><b style="font-size:1.1em;color:var(--link-color);">${p.score}</b><span style="font-size:0.7em;color:var(--hint-color);margin-left:2px;">pt</span></div>`;
    if(p.username && !isTeam) r.querySelector('b').onclick = () => openTelegramProfile(p.username);
    c.appendChild(r);
  });
}

byId('goToTeamsBtn').addEventListener('click', () => showScreen('teamsScreen'));

function processTeamInvite(id) {
  db.ref(`teams/${id}`).once('value', s => {
    if(s.exists() && s.val().status === 'open') { db.ref(`teams/${id}/members/${myId}`).set({ name: myName, username: myPrivacy?"":tgUsername }); tg.showAlert(`Entrato in ${s.val().name}!`); showScreen('teamsScreen'); }
    else { tg.showAlert("Squadra non valida/chiusa."); showScreen('setupScreen'); }
  });
}

function checkMyTeamStatus() {
  db.ref('teams').once('value', s => {
    myTeamId = null; isTeamCaptain = false; myTeamName = "";
    s.forEach(t => { if (t.child('members').hasChild(myId)) { myTeamId = t.key; myTeamName = t.val().name; isTeamCaptain = t.val().captainId === myId; } });
    byId('noTeamView').style.display = myTeamId ? 'none' : 'flex'; byId('myTeamView').style.display = myTeamId ? 'flex' : 'none';
    if(myTeamId) { listenToMyTeam(); listenToTournaments(); listenToAllTeams(true); } else listenToAllTeams(false);
    switchTeamTab('gest');
  });
}

window.switchTeamTab = tab => {
  ['tabTeamGestBtn','tabAllTeamsBtn','tabTournamentsBtn'].forEach(id => byId(id).classList.remove('active-tab'));
  ['noTeamView','myTeamView','allTeamsArea','tournamentsArea'].forEach(id => byId(id).style.display = 'none');
  if (tab === 'gest') { byId('tabTeamGestBtn').classList.add('active-tab'); byId(myTeamId?'myTeamView':'noTeamView').style.display = 'flex'; }
  else if (tab === 'allteams') { byId('tabAllTeamsBtn').classList.add('active-tab'); byId('allTeamsArea').style.display = 'flex'; listenToAllTeams(!!myTeamId); }
  else { byId('tabTournamentsBtn').classList.add('active-tab'); byId('tournamentsArea').style.display = 'flex'; listenToTournaments(); }
}

byId('createTeamBtn').addEventListener('click', () => {
  const n = byId('newTeamName').value.trim();
  if (n) db.ref('teams').push().set({ name: n, captainId: myId, status: 'open', members: { [myId]: { name: myName, username: myPrivacy?"":tgUsername } } }).then(checkMyTeamStatus);
});

function listenToAllTeams(inTeam) {
  if (allTeamsListener) db.ref('teams').off('value', allTeamsListener);
  allTeamsListener = db.ref('teams').on('value', s => {
    const o = byId('openTeamsList'), a = byId('globalAllTeamsList'); if(o) o.innerHTML=''; if(a) a.innerHTML='';
    s.forEach(ch => {
      const t = ch.val(), cnt = Object.keys(t.members||{}).length, id = ch.key;
      if (t.status === 'retired' || cnt === 0) return;
      const li = document.createElement('li'); li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';
      li.innerHTML = `<div style="width:100%;display:flex;justify-content:space-between;${!inTeam&&t.status!=='closed'?'cursor:pointer;':''}"><span><b>${escapeHTML(t.name)}</b><small> (${cnt} mem.)</small></span>${!inTeam&&t.status!=='closed'?'<span style="color:var(--link-color);font-size:0.8em;font-weight:bold;">+ Unisciti</span>':''}</div><div style="margin-top:3px;padding-left:5px;border-left:2px solid var(--link-color);">${Object.values(t.members||{}).map(m=>`<span style="display:inline-block;margin-right:5px;font-size:0.85em;color:var(--hint-color);">- ${escapeHTML(m.name)}</span>`).join('')}</div>`;
      if (!inTeam && t.status !== 'closed') li.querySelector('div').onclick = () => joinTeam(id);
      if(a) a.appendChild(li);
      if (!inTeam && t.status !== 'closed' && o) {
        const lo = document.createElement('li'); lo.style.cursor='pointer'; lo.onclick=()=>joinTeam(id);
        lo.innerHTML = `<span><b>${escapeHTML(t.name)}</b><small> (${cnt} mem.)</small></span><span style="color:var(--link-color);font-weight:bold;">+ Unisciti</span>`; o.appendChild(lo);
      }
    });
    if(o && !o.innerHTML) o.innerHTML = '<li style="color:var(--hint-color);justify-content:center;border:none;background:none;">Nessuna squadra aperta.</li>';
    if(a && !a.innerHTML) a.innerHTML = '<li style="color:var(--hint-color);justify-content:center;border:none;background:none;">Nessuna squadra.</li>';
  });
}
window.joinTeam = id => db.ref(`teams/${id}/members/${myId}`).set({ name: myName, username: myPrivacy?"":tgUsername }).then(checkMyTeamStatus);

function listenToMyTeam() {
  if (teamListener) db.ref(`teams/${myTeamId}`).off('value', teamListener);
  teamListener = db.ref(`teams/${myTeamId}`).on('value', s => {
    if(!s.exists() || s.val().status === 'retired') return checkMyTeamStatus();
    const t = s.val(); byId('myTeamNameDisplay').textContent = t.name; byId('teamStatusText').innerHTML = t.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';
    const cCont = byId('captainName'), oCont = byId('teamOthersList'); cCont.innerHTML = oCont.innerHTML = '';
    Object.entries(t.members||{}).forEach(([id, m]) => {
      const sp = document.createElement('span'); sp.textContent = m.name;
      if (m.username) { sp.style.color='var(--link-color)'; sp.style.cursor='pointer'; sp.style.textDecoration='underline'; sp.onclick=()=>openTelegramProfile(m.username); }
      if (id === t.captainId) cCont.appendChild(sp);
      else { if(oCont.children.length) oCont.insertAdjacentHTML('beforeend','<span style="color:var(--hint-color);"> | </span>'); oCont.appendChild(sp); }
    });
    byId('captainActions').style.display = isTeamCaptain ? 'block' : 'none';
    const bLk = byId('toggleTeamLockBtn'); bLk.textContent = t.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni"; bLk.onclick = () => db.ref(`teams/${myTeamId}/status`).set(t.status==='open'?'closed':'open');
    byId('inviteTeamBtn').onclick = () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=team_${myTeamId}`)}&text=${encodeURIComponent(`Unisciti a ${t.name}!`)}`);
    setupChat(db.ref(`teams/${myTeamId}/chat`), 'teamChatMessages', null);
  });
}
byId('clearTeamChatBtn').addEventListener('click', () => { if(confirm('Cancellare chat di squadra?')) db.ref(`teams/${myTeamId}/chat`).remove(); });
byId('sendTeamChatBtn').addEventListener('click', () => { const t = byId('teamChatInput').value.trim(); if(t && myTeamId) { db.ref(`teams/${myTeamId}/chat`).push({ name: myName, username: myPrivacy?"":tgUsername, text: t, ts: firebase.database.ServerValue.TIMESTAMP }); byId('teamChatInput').value = ''; } });
byId('teamChatInput').addEventListener('keypress', e => { if(e.key === 'Enter') byId('sendTeamChatBtn').click(); });
byId('leaveTeamBtn').addEventListener('click', () => {
  if (confirm("Abbandonare squadra?")) {
    db.ref(`teams/${myTeamId}`).once('value', s => {
      const t = s.val(), o = Object.keys(t.members).filter(id=>id!==myId);
      if (isTeamCaptain) o.length ? db.ref(`teams/${myTeamId}/captainId`).set(o[0]).then(()=>db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(checkMyTeamStatus)) : db.ref(`teams/${myTeamId}/status`).set('retired').then(()=>db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(checkMyTeamStatus));
      else db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(checkMyTeamStatus);
    });
  }
});

function listenToTournaments() {
  if (trnListener) db.ref('tournaments').off('value', trnListener);
  trnListener = db.ref('tournaments').on('value', s => {
    activeTrnId = null; const ol = byId('openTournamentsList'), pl = byId('pastTournamentsList'); if(ol) ol.innerHTML=''; if(pl) pl.innerHTML='';
    if(byId('createTrnPanel')) byId('createTrnPanel').style.display = isTeamCaptain ? 'flex' : 'none';
    let fA = null;
    s.forEach(ch => {
      const t = ch.val(), isM = myTeamId && t.teams?.[myTeamId], isH = t.hostId === myId;
      if ((isM || isH) && t.status !== 'finished') (!fA || (t.status === 'playing' && fA.val().status !== 'playing')) ? fA = ch : null;
      if (t.status === 'open') {
        const li = document.createElement('li');
        li.innerHTML = `<span><b>${escapeHTML(t.name)}</b> <small>(${Object.keys(t.teams||{}).length} sq.)</small></span>`;
        if (isTeamCaptain && !isM) { const btn = document.createElement('button'); btn.className="action-btn-small btn-champ"; btn.textContent="Iscrivi"; btn.onclick = () => window.joinTournament(ch.key); li.appendChild(btn); }
        else if (isM) li.innerHTML += `<small style="color:var(--link-color);font-weight:bold;"> (Iscritto)</small>`;
        if(ol) ol.appendChild(li);
      } else if (t.status === 'finished' && pl) {
        const li = document.createElement('li');
        li.innerHTML = `<span><b>${escapeHTML(t.name)}</b> <small>(Concluso)</small></span>`;
        const btn = document.createElement('button'); btn.className="action-btn-small btn-secondary"; btn.textContent="Risultati"; btn.onclick = () => window.viewTournament(ch.key); li.appendChild(btn);
        pl.appendChild(li);
      }
    });
    if (fA) { activeTrnId = fA.key; renderActiveTournament(fA); } else {
      byId('trnLobbyArea').style.display = 'flex'; byId('trnActiveArea').style.display = 'none';
      if(ol && !ol.innerHTML) ol.innerHTML = '<li style="color:var(--hint-color);justify-content:center;border:none;background:none;">Nessun torneo.</li>';
      if(pl && !pl.innerHTML) pl.innerHTML = '<li style="color:var(--hint-color);justify-content:center;border:none;background:none;">Nessun concluso.</li>';
    }
  });
}

window.viewTournament = id => db.ref(`tournaments/${id}`).once('value', s => { if(s.exists()){ activeTrnId=id; renderActiveTournament(s); byId('trnLobbyArea').style.display='none'; byId('trnActiveArea').style.display='flex'; } });
byId('createTrnBtn').addEventListener('click', () => {
  const n = byId('newTrnName').value.trim();
  if (isTeamCaptain && n) db.ref('tournaments').push().set({ name: n, hostId: myId, status: 'open', teams: { [myTeamId]: { name: myTeamName } }, standings: { [myTeamId]: { points: 0, name: myTeamName } } });
});
window.joinTournament = id => isTeamCaptain && db.ref(`tournaments/${id}/teams/${myTeamId}`).set({ name: myTeamName }).then(()=>db.ref(`tournaments/${id}/standings/${myTeamId}`).set({ points: 0, name: myTeamName }));

function renderActiveTournament(s) {
  byId('trnLobbyArea').style.display = 'none'; byId('trnActiveArea').style.display = 'flex';
  const t = s.val(); if(!t) return; const isF = t.status === 'finished', amH = t.hostId === myId;
  byId('activeTrnTitle').textContent = t.name + (isF ? (currentLang==='it'?" (Concluso)":" (Finished)") : "");
  byId('editTrnNameBtn').style.display = (amH && !isF) ? 'block' : 'none'; byId('leaveTrnBtn').style.display = (isTeamCaptain && !isF) ? 'block' : 'none';
  
  const bdy = byId('trnStandingsBody'); bdy.innerHTML = '';
  Object.entries(t.standings||{}).map(([id,d])=>({id,...d})).sort((a,b)=>b.points-a.points).forEach((st, i) => {
    bdy.innerHTML += `<tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}</td><td><b>${escapeHTML(st.name)}</b>${st.id===myTeamId?` ${currentLang==='it'?'(Voi)':'(You)'}`:''}</td><td><b>${st.points}</b></td></tr>`;
  });
  
  byId('trnHostControls').style.display = (amH && !isF) ? 'block' : 'none';
  if (byId('finishTrnBtn')) { byId('finishTrnBtn').style.display = (amH && t.status==='playing')?'block':'none'; byId('finishTrnBtn').onclick = () => confirm("Concludere torneo?") && db.ref(`tournaments/${activeTrnId}/status`).set('finished'); }
  
  const tCnt = Object.keys(t.teams||{}).length; byId('trnTeamCountTxt').textContent = `${currentLang==='it'?"Squadre Iscritte: ":"Enrolled: "}${tCnt}`;
  const sBtn = byId('startTrnBtn');
  if (sBtn) { sBtn.disabled = tCnt < 2 || (t.status!=='open' && t.status!=='playing'); sBtn.textContent = t.status==='playing' ? (currentLang==='it'?"Rigenera (Attenzione!)":"Regenerate (Warning!)") : (currentLang==='it'?"Genera Tabellone":"Generate Bracket"); }
  
  const bc = byId('trnBracketContainer'); bc.innerHTML = '';
  if (t.status === 'open') bc.innerHTML = `<p style="text-align:center;color:var(--hint-color);font-size:0.9em;">${currentLang==='it'?"Attendi l'avvio.":"Wait for start."}</p>`;
  else if (t.matches) {
    Object.entries(t.matches).forEach(([mId, m]) => {
      const c = document.createElement('div'); c.className = 'match-card'; c.style.borderWidth="2px"; if (m.teamA===myTeamId||m.teamB===myTeamId) c.style.borderColor="var(--champ-color)";
      const cA = m.winnerTeamId===m.teamA?"#4caf50":(m.winnerTeamId?"#999":"var(--text-color)"), cB = m.winnerTeamId===m.teamB?"#4caf50":(m.winnerTeamId?"#999":"var(--text-color)");
      c.innerHTML = `<div class="match-card-teams"><div style="color:${cA};"><b>${escapeHTML(m.teamAName)}</b></div><div class="match-vs">VS</div><div style="color:${cB};"><b>${escapeHTML(m.teamBName)}</b></div></div>`;
      if (m.status !== 'finished') {
        const sd = document.createElement('div'); sd.style.display="flex"; sd.style.width="100%"; sd.style.gap="10px";
        const bA = document.createElement('button'), bB = document.createElement('button');
        bA.className=`slot-btn${m.playerA?' filled':''}`; bA.textContent=m.playerA?m.playerA.name:`A: ${currentLang==='it'?'Libero':'Open'}`; bA.onclick=()=>toggleTrnSlot(mId,'A',m.teamA);
        bB.className=`slot-btn${m.playerB?' filled':''}`; bB.textContent=m.playerB?m.playerB.name:`B: ${currentLang==='it'?'Libero':'Open'}`; bB.onclick=()=>toggleTrnSlot(mId,'B',m.teamB);
        sd.append(bA, bB); c.appendChild(sd);
        if (m.playerA && m.playerB && (m.playerA.id===myId || m.playerB.id===myId)) {
          const jB = document.createElement('button'); jB.className="btn-success"; jB.style="font-size:0.85em;padding:6px;margin-top:8px;"; jB.textContent=currentLang==='it'?'ENTRA NELLA SFIDA':'JOIN MATCH'; jB.onclick=()=>startTrnMatch(mId); c.appendChild(jB);
        }
      } else { c.innerHTML += `<div style="font-size:0.85em;color:#4caf50;font-weight:bold;margin-top:5px;">${currentLang==='it'?'Concluso':'Finished'}</div>`; }
      bc.appendChild(c);
    });
  }
}
byId('editTrnNameBtn').addEventListener('click', () => { let n = prompt("Nuovo nome:"); if(n?.trim()) db.ref(`tournaments/${activeTrnId}/name`).set(n.trim()); });
byId('leaveTrnBtn').addEventListener('click', () => { if(isTeamCaptain && confirm("Ritirare squadra?")) db.ref(`tournaments/${activeTrnId}/teams/${myTeamId}`).remove().then(()=>db.ref(`tournaments/${activeTrnId}/standings/${myTeamId}`).remove()); });
byId('deleteTrnBtn').addEventListener('click', () => { if(confirm("Eliminare torneo?")) db.ref(`tournaments/${activeTrnId}`).remove(); });
byId('startTrnBtn').addEventListener('click', () => {
  if(!activeTrnId) return;
  db.ref(`tournaments/${activeTrnId}/teams`).once('value', s => {
    let t = []; s.forEach(c => t.push({id:c.key, name:c.val().name}));
    if (t.length < 2) return alert("Servono almeno 2 squadre!");
    let m = {}, idx = 1; for(let i=0; i<t.length; i++) for(let j=i+1; j<t.length; j++) m[`m${idx++}`] = { teamA: t[i].id, teamAName: t[i].name, teamB: t[j].id, teamBName: t[j].name, status: 'waiting' };
    db.ref(`tournaments/${activeTrnId}`).update({ status: 'playing', matches: m }).then(()=>showToast("Tabellone generato!")).catch(e=>alert("Errore: "+e.message));
  });
});
window.toggleTrnSlot = (mId, side, tId) => {
  if (tId !== myTeamId) return alert("Non appartieni a questa squadra!");
  const r = db.ref(`tournaments/${activeTrnId}/matches/${mId}/player${side}`);
  r.once('value', s => !s.exists() ? r.set({ id: myId, name: myName }) : s.val().id === myId ? r.remove() : alert("Occupato da " + s.val().name));
}
window.startTrnMatch = id => {
  const rc = "TRN_" + id;
  db.ref(`rooms/${rc}`).once('value', s => s.exists() ? window.joinSpecificRoom(rc) : db.ref('rooms/'+rc).set({ status: 'waiting', type: 'multi', mode: 'pingpong', wpm: 20, tone: 600, wordCount: 20, fixedSpeed: false, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now()+1800000, hostId: myId }).then(()=>window.joinSpecificRoom(rc)));
}

const getWeekNumber = d => { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); const start = new Date(Date.UTC(d.getUTCFullYear(),0,1)), wk = Math.ceil((((d-start)/86400000)+1)/7); return `${d.getUTCFullYear()}-W${wk<10?'0'+wk:wk}`; }
function updateActivity(won = false) {
  const d = new Date(), paths = [`daily/${d.toISOString().split('T')[0]}`, `weekly/${getWeekNumber(d)}`, `monthly/${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`];
  paths.forEach(p => db.ref(`activity/${p}/${myId}`).transaction(data => data ? { ...data, games: (data.games||0)+1, wins: won ? (data.wins||0)+1 : data.wins, name: myName, lastPlayed: firebase.database.ServerValue.TIMESTAMP } : { name: myName, games: 1, wins: won?1:0, lastPlayed: firebase.database.ServerValue.TIMESTAMP }).then(() => p.startsWith('daily') && checkActivityAndAwardMedals()));
}
async function checkActivityAndAwardMedals() {
  const d = new Date(), dk = d.toISOString().split('T')[0], wk = getWeekNumber(d), mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  try {
    const [dS, wS, mS, uM] = await Promise.all([`activity/daily/${dk}/${myId}`, `activity/weekly/${wk}/${myId}`, `activity/monthly/${mk}/${myId}`, `users/${myId}/medals`].map(p => db.ref(p).once('value')));
    const dG = dS.val()?.games||0, wG = wS.val()?.games||0, mG = mS.val()?.games||0, myM = uM.val()||{};
    const chk = (c, t, id, tit, des, ic) => c >= t && !myM[id] && awardMedal(id, tit, des, ic);
    chk(dG, 3, `d_bronze_${dk}`, "Bronzo Giornaliero", "3 partite oggi!", "🥉"); chk(dG, 7, `d_silver_${dk}`, "Argento Giornaliero", "7 partite oggi!", "🥈"); chk(dG, 15, `d_gold_${dk}`, "Oro Giornaliero", "15 partite oggi!", "🥇");
    chk(wG, 20, `w_active_${wk}`, "Stakanovista Settimanale", "20 partite!", "🎖️"); chk(wG, 50, `w_pro_${wk}`, "Campione Settimanale", "50 partite!", "🏆");
    chk(mG, 150, `m_legend_${mk}`, "Titano del Mese", "150 partite!", "💎");
  } catch(e) {} updateMedalGallery();
}
function awardMedal(id, tit, des, ic) {
  db.ref(`users/${myId}/medals/${id}`).set({ title: tit, date: new Date().toLocaleDateString('it-IT'), icon: ic });
  byId('overlayMedalIcon').textContent = ic; byId('overlayMedalTitle').textContent = tit; byId('overlayMedalDesc').textContent = des; byId('medalOverlay').style.display = 'flex';
  playMedalSound(); updateMedalGallery();
}
function playMedalSound() {
  try { const c = getAudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'triangle'; const n = c.currentTime; o.frequency.setValueAtTime(523.25, n); o.frequency.exponentialRampToValueAtTime(1046.50, n+0.5); g.gain.setValueAtTime(0.3, n); g.gain.exponentialRampToValueAtTime(0.01, n+0.8); o.start(n); o.stop(n+0.8); } catch(e) {}
}
function updateMedalGallery() {
  const c = byId('myMedalsContainer'); if (!c) return;
  db.ref(`users/${myId}/medals`).once('value', s => {
    if (!s.exists()) return c.innerHTML = '<span style="font-size:0.6em;color:var(--hint-color);">Nessuna medaglia.</span>';
    c.innerHTML = ''; Object.values(s.val()).forEach(m => { const sp = document.createElement('span'); sp.textContent = m.icon; sp.title = `${m.title} (${m.date})`; sp.style.cursor="pointer"; sp.onclick = () => showToast(`${m.title} - ${m.date}`); c.appendChild(sp); });
  });
}
window.switchActTab = p => {
  ['tabDailyAct','tabWeeklyAct','tabMonthlyAct'].forEach(id => byId(id).classList.remove('active-tab'));
  byId(`tab${p.charAt(0).toUpperCase()+p.slice(1)}Act`).classList.add('active-tab');
  const d = new Date(); let k = "";
  if (p==='daily') { k = d.toISOString().split('T')[0]; byId('actListTitle').textContent = "I più attivi di Oggi"; }
  else if (p==='weekly') { k = getWeekNumber(d); byId('actListTitle').textContent = "I più attivi della Settimana"; }
  else { k = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0'); byId('actListTitle').textContent = "I più attivi del Mese"; }
  renderActivityRankings(p, k); updateMedalGallery();
}
function renderActivityRankings(p, k) {
  const l = byId('activityRankList'); l.innerHTML = '<li style="justify-content:center;color:var(--hint-color);">Caricamento...</li>';
  db.ref(`activity/${p}/${k}`).once('value').then(s => {
    l.innerHTML = ''; let u = []; s.forEach(c => typeof c.val() === 'object' && u.push({ id: c.key, ...c.val() }));
    u.sort((a,b)=>(b.games||0)-(a.games||0)).slice(0,50).forEach((x, i) => {
      const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`; const li = document.createElement('li');
      li.innerHTML = `<span>${m} <b>${escapeHTML(x.name||"Anonimo")}</b></span><span><b>${x.games||0}</b> part. <small style="color:#4caf50;">(${x.wins||0} v.)</small></span>`; l.appendChild(li);
    });
    if (!u.length) l.innerHTML = '<li style="justify-content:center;color:var(--hint-color);">Nessuna attività.</li>';
  }).catch(e => l.innerHTML = `<li style="justify-content:center;color:var(--hint-color);flex-direction:column;text-align:center;"><span>Errore.</span><small style="font-size:0.7em;">${e.message}</small></li>`);
}

function startQuizSequence() {
  showScreen('quizArea'); gameRunning = true; lastLoadedQuizIndex = -1;
  byId('quizWpmDisplay').textContent = `WPM: ${currentWpm}`; byId('quizScoreDisplay').textContent = `Punti: ${totalScore}`;
  if (roomCode && !isSinglePlayer) {
    if (quizStateListener) db.ref(`rooms/${roomCode}/quiz_state`).off('value', quizStateListener);
    quizStateListener = db.ref(`rooms/${roomCode}/quiz_state`).on('value', s => {
      const st = s.val(); if (!st) return;
      randomizedQuizQuestions = st.questionsOrder ? st.questionsOrder.map(i => QUIZ_QUESTIONS[i]) : QUIZ_QUESTIONS;
      if ((st.questionIndex||0) !== lastLoadedQuizIndex) { lastLoadedQuizIndex = quizQuestionIndex = (st.questionIndex||0); loadNextQuizQuestion(); }
      quizActiveBuzzerId = st.activeBuzzerId || null; renderQuizUI(st);
    });
    if (myId === roomHostId) db.ref(`rooms/${roomCode}/quiz_state`).set({ questionIndex: 0, activeBuzzerId: null, status: 'playing', questionsOrder: Array.from({length:QUIZ_QUESTIONS.length},(_,i)=>i).sort(()=>Math.random()-0.5) });
  } else { randomizedQuizQuestions = [...QUIZ_QUESTIONS].sort(()=>Math.random()-0.5); quizQuestionIndex = 0; loadNextQuizQuestion(); }
}

function loadNextQuizQuestion() {
  if (quizQuestionIndex >= requestedWordCount || quizQuestionIndex >= randomizedQuizQuestions.length) return finishGame();
  currentQuizQuestion = randomizedQuizQuestions[quizQuestionIndex]; playQuizAudioSequence();
}

async function playQuizAudioSequence() {
  inputActive = false; disableQuizButtons(true); ['A','B','C','D'].forEach(l => byId('btnQuiz'+l)?.classList.remove('active-choice'));
  byId('quizQuestionBox').textContent = "Ascolta la domanda..."; await playMorseAudio(currentQuizQuestion.q, currentWpm);
  if (!gameRunning) return; await sleep(1500);
  for (let i = 0; i < 4; i++) {
    if (!gameRunning) return; const l = ["A","B","C","D"][i]; byId('quizQuestionBox').textContent = `Opzione ${l}...`;
    const btn = byId('btnQuiz'+l); btn?.classList.add('active-choice'); await playMorseAudio(`${l} ${currentQuizQuestion.a[i]}`, currentWpm);
    btn?.classList.remove('active-choice'); if (!gameRunning) return; await sleep(1000);
  }
  if (!gameRunning) return; byId('quizQuestionBox').textContent = "SCEGLI LA TUA RISPOSTA!"; enableQuizControls(); startQuizTimer(20);
}

function enableQuizControls() {
  inputActive = true;
  if (isSinglePlayer) disableQuizButtons(false); else { byId('quizBuzzer').style.display = 'block'; byId('quizOptionsContainer').style.opacity = '0.5'; disableQuizButtons(true); }
}

function disableQuizButtons(dis) { ['A','B','C','D'].forEach(l => { if(byId('btnQuiz'+l)) byId('btnQuiz'+l).disabled = dis; }); }
function startQuizTimer(s) {
  if (quizTimerInterval) clearInterval(quizTimerInterval);
  const b = byId('quizTimerProgress'), d = 100/(s*10); let t = 100;
  quizTimerInterval = setInterval(() => { t -= d; b.style.width = Math.max(0,t)+'%'; if (t <= 0) { clearInterval(quizTimerInterval); handleQuizTimeout(); } }, 100);
}

function handleQuizTimeout() { if(!inputActive) return; showToast("Tempo scaduto!"); if(isSinglePlayer || quizActiveBuzzerId === myId) submitQuizAnswer(-1); }

function submitQuizAnswer(idx) {
  if ((!isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) || (isSinglePlayer && !inputActive)) return;
  if (quizTimerInterval) clearInterval(quizTimerInterval); inputActive = false; disableQuizButtons(true);
  
  if (idx === currentQuizQuestion.correct) { totalScore += 100; showToast(`CORRETTO (${["A","B","C","D"][idx]})! +100`); }
  else showToast(`SBAGLIATO! Era la ${["A","B","C","D"][currentQuizQuestion.correct]}`);
  
  byId('quizScoreDisplay').textContent = `Punti: ${totalScore}`;
  if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wordIndex: quizQuestionIndex + 1 });
  
  setTimeout(() => {
    if (!gameRunning) return;
    if (roomCode && !isSinglePlayer) db.ref(`rooms/${roomCode}/quiz_state`).transaction(s => { if(s && s.activeBuzzerId===myId){ s.questionIndex=(s.questionIndex||0)+1; s.activeBuzzerId=null; } return s; });
    else if (isSinglePlayer) { quizQuestionIndex++; loadNextQuizQuestion(); }
  }, 3000);
}

const sleep = ms => new Promise(r => setTimeout(() => gameRunning ? r() : r(), ms));
if (byId('quizBuzzer')) byId('quizBuzzer').addEventListener('click', () => { if(roomCode && !isSinglePlayer && !quizActiveBuzzerId && inputActive) db.ref(`rooms/${roomCode}/quiz_state`).transaction(s => s && !s.activeBuzzerId ? { ...s, activeBuzzerId: myId } : s); });

['A','B','C','D'].forEach((l, i) => {
  if(byId('btnQuiz'+l)) byId('btnQuiz'+l).onclick = () => submitQuizAnswer(i);
  if(byId('replay'+l)) byId('replay'+l).onclick = () => currentQuizQuestion && playMorseAudio(currentQuizQuestion.a[i], currentWpm);
});
if(byId('quizReplayQ')) byId('quizReplayQ').onclick = () => currentQuizQuestion && playMorseAudio(currentQuizQuestion.q, currentWpm);
if(byId('quitQuizBtn')) byId('quitQuizBtn').onclick = () => { if (confirm("Abbandonare?")) { clearInterval(quizTimerInterval); gameRunning = false; exitRoomCleanly(); } };

function renderQuizUI(s) {
  const b = byId('quizBuzzer'), w = byId('buzzerWinner'), opt = byId('quizOptionsContainer');
  if (s.activeBuzzerId) {
    b.style.display = 'none';
    if (s.activeBuzzerId === myId) { w.textContent = "TOCCA A TE!"; opt.style.opacity = '1'; disableQuizButtons(false); }
    else { w.textContent = "L'AVVERSARIO RISPONDE..."; opt.style.opacity = '0.5'; disableQuizButtons(true); }
  } else { w.textContent = ""; b.style.display = inputActive ? 'block' : 'none'; opt.style.opacity = '0.5'; disableQuizButtons(true); }
}
