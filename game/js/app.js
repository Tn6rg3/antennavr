/**
 * app.js - Main controller refactorizzato
 * Usa i moduli: state.js, audio.js, firebase.js, ui.js, game-engine.js
 * 
 * NOTA: Questo file è ridotto a ~600 righe, dalla versione originale di ~2000
 */

// ===== CONFIG =====
const APP_CONFIG = {
  version: "20240520.22",
  botName: "cwappgame_bot",
  appName: "cwgame",
  firebaseConfig: {
    apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
    authDomain: "telegrafiabot.firebaseapp.com",
    databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "telegrafiabot",
    storageBucket: "telegrafiabot.firebasestorage.app",
    messagingSenderId: "575790683327",
    appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
  }
};

// ===== GLOBAL VARIABLES (ridotte al minimo) =====
const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;
const tgUsername = tgUser?.username || "";
const startParam = tg.initDataUnsafe?.start_param;

let db, auth;
let masterDictionary = [];
let customDictionary = [];
let itDictionary = [];
let enDictionary = [];

// ===== i18n (manteniamo dalla versione originale) =====
const i18n = {
  it: {
    hello: "Ciao", lb: "Classifica", profile: "Profilo", activity: "Attività",
    // ... (copiare dalla versione originale se necessario)
  },
  en: {
    hello: "Hello", lb: "Leaderboard", profile: "Profile", activity: "Activity",
    // ... (copiare dalla versione originale se necessario)
  }
};

// ===== INIT =====
async function initializeApp() {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();

  if (!tgUser) {
    document.getElementById('loadingScreen').classList.remove('active-screen');
    document.getElementById('errorScreen').classList.add('active-screen');
    return;
  }

  // Setup Firebase
  FirebaseDB.init(APP_CONFIG.firebaseConfig);
  db = FirebaseDB.db;
  auth = FirebaseDB.auth;

  GameState.player.id = tgUser.id.toString();
  GameState.player.name = tgUser.first_name;

  // Authenticate
  await auth.signInAnonymously();

  // Load player data
  try {
    const userSnap = await db.ref(`users/${GameState.player.id}`).once('value');
    const userData = userSnap.val() || {};
    if (userData.alias) GameState.player.name = userData.alias;
    GameState.player.privacy = userData.privacyUsername || false;
    document.getElementById('privacyUsernameCheckbox').checked = GameState.player.privacy;
  } catch (e) {
    console.error("Errore caricamento dati utente:", e);
  }

  document.getElementById('playerName').textContent = GameState.player.name;
  document.getElementById('userAliasInput').value = 
    (GameState.player.name !== tgUser.first_name) ? GameState.player.name : "";

  document.getElementById('loadingText').style.display = 'none';
  document.getElementById('createRoomBtn').disabled = false;

  // Presence system
  db.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === false) return;

    const pRef = db.ref(`presence/${GameState.player.id}`);
    pRef.onDisconnect().remove();
    pRef.set({
      name: GameState.player.name,
      username: GameState.player.privacy ? "" : tgUsername,
      status: 'online',
      ts: firebase.database.ServerValue.TIMESTAMP
    });

    if (GameState.room.code) {
      joinRoomLogic(true);
    }
  });

  // Handle deep links
  if (startParam) {
    if (startParam.startsWith('team_')) {
      processTeamInvite(startParam.replace('team_', ''));
    } else if (startParam.startsWith('room_')) {
      GameState.room.code = startParam.replace('room_', '');
      joinRoomLogic(false);
    }
  } else {
    const lastRoom = localStorage.getItem('cwgame_last_room');
    if (lastRoom) {
      db.ref(`rooms/${lastRoom}`).once('value', snap => {
        if (snap.exists() && snap.val().status !== 'finished') {
          GameState.room.code = lastRoom;
          document.getElementById('rejoinContainer').style.display = 'block';
          document.getElementById('rejoinGameBtn').onclick = () => {
            GameState.invites.isRejoining = true;
            joinRoomLogic(false);
          };
          UIManager.showScreen('setupScreen');
        } else {
          localStorage.removeItem('cwgame_last_room');
          UIManager.showScreen('setupScreen');
        }
      });
    } else {
      UIManager.showScreen('setupScreen');
    }
  }

  // Load dictionaries
  const savedLang = localStorage.getItem('gameLang');
  if (savedLang) setLanguage(savedLang);
  loadDictionaries();

  // Load custom dictionary
  const savedCustom = localStorage.getItem('cwgame_custom_dict');
  if (savedCustom) {
    try {
      customDictionary = JSON.parse(savedCustom);
      updateCustomDictStatus();
    } catch (e) {
      console.warn("Errore caricamento dizionario personale:", e);
    }
  }

  // Setup listeners
  listenToRooms();
  listenToOnlineUsers();
  listenToInvites();

  // Load regolamento
  loadRegolamento();

  // Show version
  const vDisp = document.getElementById('appVersionDisplay');
  if (vDisp) vDisp.textContent = "v" + APP_CONFIG.version;

  const vFoot = document.getElementById('appVersionFooter');
  if (vFoot) vFoot.textContent = APP_CONFIG.version;

  // Check app updates
  db.ref('appConfig/latestVersion').on('value', snap => {
    const latest = snap.val();
    const current = String(APP_CONFIG.version).trim();
    const latestStr = latest ? String(latest).trim() : "";

    if (latestStr && latestStr !== current) {
      document.getElementById('updateBanner').style.display = 'block';
    } else {
      document.getElementById('updateBanner').style.display = 'none';
    }
  });
}

// ===== LANGUAGE =====
function setLanguage(lang) {
  GameState.set('game.currentLang', lang);
  localStorage.setItem('gameLang', lang);
  const t = i18n[lang];
  document.getElementById('langBtn').textContent = lang.toUpperCase();
  // TODO: Aggiornare tutti gli elementi UI (da copiare dalla versione originale)
}

function updateDictionary() {
  const lang = GameState.get('game.currentLang');
  masterDictionary = (lang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary;
}

// ===== DICTIONARIES =====
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
    if (!resp.ok) throw new Error("GitHub offline");
    const text = await resp.text();
    const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(l => l.length > 2);
    if (lang === 'it') itDictionary = lines;
    else enDictionary = lines;
  } catch (e) {
    console.warn(`Errore dizionario ${lang}:`, e.message);
    if (lang === 'it') itDictionary = ["abbandono", "amicizia", "antenna", "battaglia"];
    else enDictionary = ["abandon", "friendship", "antenna", "battle"];
  }
}

async function loadRegolamento() {
  try {
    const response = await fetch('regolamento.html');
    if (!response.ok) throw new Error("Errore nel caricamento del file");
    const htmlTesto = await response.text();
    document.getElementById('regolamentoContainer').innerHTML = htmlTesto;

    const btnFeedback = document.getElementById('sendFeedbackBtn');
    if (btnFeedback) {
      btnFeedback.onclick = function () {
        const text = encodeURIComponent("💡 Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
        const shareUrl = `https://t.me/share/url?text=${text}`;
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(shareUrl);
        } else {
          window.open(shareUrl, '_blank');
        }
      };
    }
  } catch (e) {
    document.getElementById('regolamentoContainer').innerHTML = "<p style='color:red;'>Impossibile caricare il regolamento.</p>";
    console.warn("Errore caricamento regolamento:", e);
  }
}

function updateCustomDictStatus() {
  const el = document.getElementById('customDictStatus');
  if (!el) return;
  if (customDictionary.length === 0) {
    el.textContent = "Nessun file caricato.";
    el.style.color = "var(--hint-color)";
  } else {
    el.textContent = "Parole caricate: " + customDictionary.length;
    el.style.color = "var(--link-color)";
  }
}

// ===== ROOM LOGIC =====
function listenToRooms() {
  FirebaseDB.attachListener('rooms', 'rooms_list', (snapshot) => {
    const list = document.getElementById('waitingRoomsList');
    list.innerHTML = '';
    let wCount = 0;

    snapshot.forEach(child => {
      const room = child.val();
      const code = child.key;
      if (code.startsWith("TRN_")) return;
      if (room.expiresAt && Date.now() > room.expiresAt) {
        db.ref(`rooms/${code}`).remove();
        return;
      }

      if (room.status === 'waiting' && room.type !== 'single') {
        wCount++;
        const pCount = room.players ? Object.keys(room.players).length : 0;
        const li = document.createElement('li');

        let modeIcon = room.mode === 'callsign' ? '🎙️ Nom.' :
                       room.mode === 'pingpong' ? '🏓 Ping Pong' : '🔤 Parole';
        if (room.mode === 'quiz') modeIcon = '❓ Quiz';

        const leftSpan = document.createElement('span');
        const titleB = document.createElement('b');
        titleB.textContent = `#${code} - ${modeIcon}`;
        leftSpan.appendChild(titleB);
        leftSpan.appendChild(document.createElement('br'));

        const infoSmall = document.createElement('small');
        infoSmall.textContent = `${pCount} Gioc. | ${room.wpm} WPM | ${room.wordCount} Test`;
        leftSpan.appendChild(infoSmall);

        const btn = document.createElement('button');
        btn.className = 'action-btn-small';
        btn.textContent = 'Entra';
        btn.onclick = () => joinSpecificRoom(code);

        li.appendChild(leftSpan);
        li.appendChild(btn);
        list.appendChild(li);
      }
    });

    if (wCount === 0) {
      const li = document.createElement('li');
      li.style.justifyContent = 'center';
      li.style.color = 'var(--hint-color)';
      li.style.background = 'none';
      li.style.border = 'none';
      li.textContent = "Nessuna sfida.";
      list.appendChild(li);
    }
  });
}

function joinSpecificRoom(code) {
  GameState.room.code = code;
  joinRoomLogic(false);
}

function joinRoomLogic(isReconnect = false) {
  GameState.game.running = false;
  localStorage.setItem('cwgame_last_room', GameState.room.code);

  const playerRef = db.ref(`rooms/${GameState.room.code}/players/${GameState.player.id}`);
  playerRef.once('value', snapshot => {
    const playerData = snapshot.val();

    if (playerData?.finished) {
      UIManager.showScreen('leaderboardScreen');
      localStorage.removeItem('cwgame_last_room');
      return;
    }

    if (playerData) {
      GameState.game.totalScore = playerData.score || 0;
      GameState.game.wordIndex = playerData.wordIndex || 0;
      GameState.game.matchDetails = playerData.matchDetails || [];
      if (GameState.invites.isRejoining) UIManager.showToast("🔄 Partita recuperata!");
    }

    UIManager.showScreen('lobbyScreen');
    document.getElementById('lobbyTitleText').textContent = 
      GameState.room.code.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera";

    playerRef.onDisconnect().update({ online: false });

    const currentUsername = GameState.player.privacy ? "" : tgUsername;
    if (!playerData) {
      playerRef.set({
        name: GameState.player.name,
        username: currentUsername,
        score: 0,
        wpm: 0,
        finished: false,
        teamId: GameState.player.teamId,
        ready: false,
        online: true
      });
    } else {
      playerRef.update({ online: true });
    }

    UIManager.listenToChat();

    if (GameState.listeners.currentRoom) {
      GameState.listeners.currentRoom.ref.off('value', GameState.listeners.currentRoom.callback);
    }

    const callback = (roomSnap) => {
      if (!roomSnap.exists()) {
        exitRoomCleanly(true);
        return;
      }

      const roomData = roomSnap.val();
      GameState.room.mode = roomData.mode;
      GameState.room.wordCount = roomData.wordCount;
      GameState.room.wpm = roomData.wpm;
      GameState.room.baseWpm = roomData.wpm;
      GameState.room.tone = roomData.tone;
      GameState.room.isFixedSpeed = roomData.fixedSpeed || false;
      GameState.room.hostId = roomData.hostId;
      GameState.game.singlePlayer = roomData.type === 'single';

      if (roomData.words) GameState.game.words = roomData.words;

      if (roomData.status === 'playing' && !GameState.game.running) {
        startCountdownSequence();
        return;
      }

      if (roomData.status === 'countdown' && !GameState.game.running) {
        startCountdownSequence();
        return;
      }

      if (roomData.status === 'waiting') {
        renderPlayersList(roomData.players || {}, roomData.hostId);
      }
    };

    FirebaseDB.attachListener(`rooms/${GameState.room.code}`, 'currentRoom', callback);
  });
}

function renderPlayersList(playersData, hostId) {
  const list = document.getElementById('playersList');
  list.innerHTML = '';

  const pKeys = Object.keys(playersData);
  let allReady = pKeys.length >= 2;

  Object.entries(playersData).forEach(([id, data]) => {
    const isH = (id === hostId);
    const isReady = data.ready ? '✅' : '⏳';
    if (!data.ready) allReady = false;

    const li = document.createElement('li');
    const nSpan = document.createElement('span');
    nSpan.textContent = `${isReady} ${data.name}`;

    if (data.username) {
      nSpan.style.color = 'var(--link-color)';
      nSpan.style.cursor = 'pointer';
      nSpan.style.textDecoration = 'underline';
      nSpan.onclick = () => openTelegramProfile(data.username);
    }

    li.appendChild(nSpan);
    if (isH) {
      const smallHost = document.createElement('small');
      smallHost.textContent = ' (HOST)';
      li.appendChild(smallHost);
    }
    list.appendChild(li);
  });

  const isTrnOrPP = GameState.room.code.startsWith("TRN_") || GameState.room.mode === 'pingpong';
  const amIHost = (GameState.player.id === hostId) || GameState.room.code.startsWith("TRN_");

  document.getElementById('startMultiplayerBtn').style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none';
  document.getElementById('deleteRoomBtn').style.display = (GameState.player.id === hostId && !GameState.room.code.startsWith("TRN_")) ? 'block' : 'none';
  document.getElementById('readyBtn').style.display = (isTrnOrPP && !playersData[GameState.player.id]?.ready) ? 'block' : 'none';

  if (allReady && isTrnOrPP && pKeys.length >= 2) {
    db.ref(`rooms/${GameState.room.code}`).update({ status: 'countdown', expiresAt: null });
  }
}

function exitRoomCleanly(roomWasDeletedByHost = false) {
  let targetScreen = 'setupScreen';
  const amIHost = (GameState.player.id === GameState.room.hostId);

  localStorage.removeItem('cwgame_last_room');
  GameState.invites.isRejoining = false;
  GameState.invites.isChallenging = false;
  GameState.invites.currentInviterId = null;

  FirebaseDB.detachListener('currentRoom');
  FirebaseDB.detachListener('gamePlayer');
  FirebaseDB.detachListener('pingPong');
  FirebaseDB.detachListener('quiz');

  if (GameState.room.code && GameState.room.code.startsWith("TRN_")) {
    targetScreen = 'teamsScreen';
  }

  if (!roomWasDeletedByHost && amIHost && !GameState.room.code.startsWith("TRN_")) {
    // Host rimane
  } else {
    if (GameState.room.code) {
      db.ref(`rooms/${GameState.room.code}/players/${GameState.player.id}`).onDisconnect().cancel();
      db.ref(`rooms/${GameState.room.code}`).once('value', snap => {
        if (snap.exists()) db.ref(`rooms/${GameState.room.code}/players/${GameState.player.id}`).remove();
      });
    }
    GameState.room.code = "";
  }

  UIManager.hideChat();
  UIManager.showScreen(targetScreen);
}

// ===== GAME LOGIC =====
function startCountdownSequence() {
  AudioManager.init();

  GameState.game.running = true;
  GameState.game.singlePlayer = GameState.room.type === 'single';
  GameState.game.wordIndex = 0;
  GameState.game.totalScore = 0;
  GameState.game.words = [];
  GameState.game.matchDetails = [];
  GameState.errors.sessionCharErrors = {};
  GameState.errors.sessionErrorsByWpm = {};

  document.getElementById('wpmDisplay').textContent = `WPM: ${GameState.room.wpm}`;
  document.getElementById('scoreDisplay').textContent = "Punti: 0";
  document.getElementById('tableBody').innerHTML = "";

  UIManager.showScreen('countdownScreen');

  let count = 3;
  document.getElementById('countdownNumber').textContent = count;

  const interval = setInterval(() => {
    if (count > 1) {
      count--;
      document.getElementById('countdownNumber').textContent = count;
      AudioManager.beep(600, 0.1);
    } else {
      clearInterval(interval);
      document.getElementById('countdownNumber').textContent = GameState.get('game.currentLang') === 'en' ? 'GO!' : 'VIA!';
      AudioManager.beep(800, 0.3);

      setTimeout(() => {
        if (!GameState.game.running) return;
        UIManager.showScreen('gameArea');
        setTimeout(() => document.getElementById('permanentGameInput').focus(), 200);
        setTimeout(() => { if (GameState.game.running) playNextWord(); }, 800);
      }, 500);
    }
  }, 1000);
}

function playNextWord() {
  if (!GameState.game.running) return;
  if (GameState.game.wordIndex >= GameState.room.wordCount) {
    finishGame();
    return;
  }

  GameState.game.inputActive = true;
  GameState.game.usedReplay = false;
  const currentWord = GameState.game.words[GameState.game.wordIndex].toUpperCase();

  const hintEl = document.getElementById('easyModeHint');
  if (GameState.room.isEasyMode && GameState.game.singlePlayer) {
    const shuffled = currentWord.split('').sort(() => 0.5 - Math.random()).join(' ');
    hintEl.textContent = shuffled;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }

  AudioManager.playMorse(currentWord, GameState.room.wpm);
  GameState.game.lastWordStartTime = Date.now();
  document.getElementById('permanentGameInput').focus();
}

async function finishGame() {
  GameState.game.running = false;
  document.getElementById('permanentGameInput').blur();
  localStorage.removeItem('cwgame_last_room');
  GameState.invites.isRejoining = false;

  UIManager.showScreen('leaderboardScreen');

  if (GameState.room.code) {
    const myPlayerRef = db.ref(`rooms/${GameState.room.code}/players/${GameState.player.id}`);
    await myPlayerRef.update({
      finished: true,
      score: GameState.game.totalScore,
      wpm: GameState.room.wpm,
      matchDetails: GameState.game.matchDetails
    });
    myPlayerRef.onDisconnect().cancel();
  }
}

// ===== EVENT LISTENERS =====
document.getElementById('permanentGameInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter' && GameState.game.inputActive && GameState.game.running) {
    const userWord = this.value.trim().toUpperCase();
    if (userWord === "") return;

    GameEngine.handleWordSubmission(userWord);
    this.value = "";

    if (GameState.game.wordIndex < GameState.room.wordCount) {
      setTimeout(playNextWord, 600);
    } else {
      finishGame();
    }
  }
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  GameState.room.mode = document.getElementById('gameModeInput').value;
  GameState.room.type = document.getElementById('gameTypeInput').value;
  GameState.room.wpm = parseInt(document.getElementById('startWpmInput').value);
  GameState.room.baseWpm = GameState.room.wpm;
  GameState.room.tone = parseInt(document.getElementById('toneInput').value);
  GameState.room.wordCount = parseInt(document.getElementById('wordCountInput').value);
  GameState.room.isFixedSpeed = document.getElementById('fixedSpeedCheckbox').checked;
  GameState.room.isEasyMode = document.getElementById('easyModeCheckbox').checked;

  GameState.room.code = Math.floor(1000 + Math.random() * 9000).toString();
  GameState.game.words = GameEngine.getGameWords(
    GameState.room.wordCount,
    GameState.room.mode,
    masterDictionary,
    customDictionary
  );

  db.ref('rooms/' + GameState.room.code).set({
    status: GameState.game.singlePlayer ? 'countdown' : 'waiting',
    type: GameState.game.singlePlayer ? 'single' : 'multi',
    mode: GameState.room.mode,
    wpm: GameState.room.wpm,
    tone: GameState.room.tone,
    wordCount: GameState.room.wordCount,
    words: GameState.game.words,
    fixedSpeed: GameState.room.isFixedSpeed,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    expiresAt: GameState.game.singlePlayer ? null : Date.now() + (10 * 60000),
    hostId: GameState.player.id
  }).then(() => joinRoomLogic(false));
});

document.getElementById('quitGameBtn').addEventListener('click', () => {
  if (confirm("Vuoi abbandonare la partita?")) {
    GameState.game.running = false;
    exitRoomCleanly();
  }
});

document.getElementById('startMultiplayerBtn').addEventListener('click', () => {
  db.ref(`rooms/${GameState.room.code}/players`).once('value', snap => {
    const playersCount = snap.exists() ? Object.keys(snap.val()).length : 0;
    if (GameState.room.mode === 'pingpong' && playersCount < 2) {
      alert("La modalità Ping Pong richiede almeno 2 giocatori!");
      return;
    }
    db.ref(`rooms/${GameState.room.code}`).update({ status: 'countdown', expiresAt: null });
  });
});

document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
  exitRoomCleanly();
});

document.getElementById('deleteRoomBtn').addEventListener('click', () => {
  if (confirm("Eliminare questa stanza?")) {
    const rc = GameState.room.code;
    db.ref(`rooms/${rc}`).remove().then(() => {
      exitRoomCleanly(true);
    });
  }
});

// ===== HELPER FUNCTIONS =====
function listenToOnlineUsers() {
  // TODO: Implementare
}

function listenToInvites() {
  // TODO: Implementare
}

function openTelegramProfile(username) {
  if (username) tg.openTelegramLink('https://t.me/' + username);
  else tg.showAlert("Questo utente non ha un username pubblico.");
}

function processTeamInvite(inviteTeamId) {
  // TODO: Implementare
}

// ===== STARTUP =====
window.addEventListener('load', initializeApp);
