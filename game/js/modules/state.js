/**
 * GameState - Centralizzato stato globale dell'app
 * Unica fonte di verità per player, room, game, listeners, UI
 */

window.GameState = {
  // ===== PLAYER =====
  player: {
    id: null,
    name: null,
    username: "",
    alias: null,
    privacy: false,
    teamId: null,
    teamName: "",
    isTeamCaptain: false
  },

  // ===== ROOM & GAME CONFIG =====
  room: {
    code: "",
    hostId: null,
    mode: "standard", // standard, callsign, pingpong, chars, quiz, custom
    type: "multi", // multi, single, tournament
    wpm: 20,
    baseWpm: 20,
    tone: 600,
    wordCount: 10,
    isFixedSpeed: false,
    isEasyMode: false,
    status: "waiting" // waiting, countdown, playing, finished
  },

  // ===== GAME RUNTIME =====
  game: {
    running: false,
    singlePlayer: false,
    wordIndex: 0,
    totalScore: 0,
    currentStreak: 0,
    words: [],
    matchDetails: [],
    usedReplay: false,
    inputActive: false,
    lastWordStartTime: 0,
    currentLang: 'it'
  },

  // ===== QUIZ STATE =====
  quiz: {
    currentQuestion: null,
    questionIndex: 0,
    randomizedQuestions: [],
    lastLoadedIndex: -1,
    activeBuzzerId: null,
    timerInterval: null
  },

  // ===== ERROR TRACKING =====
  errors: {
    sessionCharErrors: {},
    sessionErrorsByWpm: {}
  },

  // ===== LISTENERS (per gestione pulizia) =====
  listeners: {
    currentRoom: null,
    chat: {},
    gamePlayer: null,
    pingPong: null,
    quiz: null,
    tournament: null,
    team: null,
    allTeams: null,
    tournaments: null,
    presence: null,
    invites: null,
    outgoingInvite: null
  },

  // ===== UI STATE =====
  ui: {
    activeTab: "room",
    activeScreen: "setupScreen",
    activeChatContext: null, // 'team', 'room', 'global'
    chatOpen: false
  },

  // ===== TOURNAMENT STATE =====
  tournament: {
    activeTrnId: null,
    myTeamId: null,
    isTeamCaptain: false
  },

  // ===== INVITES STATE =====
  invites: {
    currentInviterId: null,
    isChallenging: false,
    isRejoining: false,
    lastIncomingInvite: null
  },

  // ===== LAZY LOAD TRACKING =====
  tracking: {
    lastPlayedWordId: 0,
    lastSeenGuessId: 0,
    lastOnlineUsersSnap: null,
    lastPlayerCount: 0,
    gameStartPlayerCount: 0
  }
};

/**
 * Setter sicuro per stato annidato
 * Esempio: GameState.set('player.name', 'Marco')
 */
GameState.set = function(path, value) {
  const keys = path.split('.');
  let obj = this;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in obj)) obj[key] = {};
    obj = obj[key];
  }
  
  obj[keys[keys.length - 1]] = value;
};

/**
 * Getter sicuro per stato annidato
 */
GameState.get = function(path) {
  const keys = path.split('.');
  let obj = this;
  
  for (const key of keys) {
    if (!(key in obj)) return undefined;
    obj = obj[key];
  }
  
  return obj;
};

/**
 * Reset completo (da chiamare al logout o cambio room)
 */
GameState.reset = function() {
  this.room.code = "";
  this.room.hostId = null;
  this.game.running = false;
  this.game.wordIndex = 0;
  this.game.totalScore = 0;
  this.game.words = [];
  this.game.matchDetails = [];
  this.errors.sessionCharErrors = {};
  this.errors.sessionErrorsByWpm = {};
};

/**
 * Reset game-specific (tra partita e partita)
 */
GameState.resetGame = function() {
  this.game.wordIndex = 0;
  this.game.totalScore = 0;
  this.game.currentStreak = 0;
  this.game.words = [];
  this.game.matchDetails = [];
  this.game.usedReplay = false;
  this.game.inputActive = false;
  this.errors.sessionCharErrors = {};
  this.errors.sessionErrorsByWpm = {};
};
