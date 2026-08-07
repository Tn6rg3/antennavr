// ============================================================================
// STATE.JS - STATO CENTRALE DELL'APPLICAZIONE
// ============================================================================

export const APP_VERSION = "20260807.209";
export const BOT_USERNAME = "cwappgame_bot";
export const WEBAPP_NAME = "cwgame";

export const STORAGE_KEYS = {
    ROOM: "cwgame_last_room",
    CUSTOM_DICT: "cwgame_custom_dict",
    CHAT_MUTED: "cwgame_chat_muted",
    PREF_WPM: "cwgame_pref_wpm",
    PREF_WORDS: "cwgame_pref_words",
    PREF_TONE: "cwgame_pref_tone",
    PREF_CHAR_SPACE: "cwgame_pref_char_space",
    PREF_WORD_SPACE: "cwgame_pref_word_space",
    DAILY_SHOWN: "cwgame_daily_shown",
    CHAT_CW_ENABLED: "cwgame_chat_cw_enabled",
    CHAT_CW_WPM: "cwgame_chat_cw_wpm",
    CHAT_CW_TONE: "cwgame_chat_cw_tone"
};

export const morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--','?': '..--..' 
};

export const appState = {
    db: null,
    auth: null,
    myId: "",
    myName: "",
    myPrivacy: false,
    tgUsername: "",
    myTeamId: null,
    myTeamName: "",
    isTeamCaptain: false,
    currentLang: "it",
    serverTimeOffset: 0,
    masterDictionary: [],
    itDictionary: [],
    enDictionary: [],
    customDictionary: [],
    userMatchHistory: [],
    sessionCharErrors: Object.create(null),
    sessionErrorsByWpm: Object.create(null)
};

export const gameState = {
    running: false,
    inputActive: false,
    mode: "standard",
    wpm: 20,
    baseWpm: 20,
    tone: 600,
    wordCount: 10,
    words: [],
    wordIndex: 0,
    totalScore: 0,
    currentStreak: 0,
    usedReplay: false,
    matchDetails: [],
    isSinglePlayer: false,
    isFixedSpeed: false,
    isEasyMode: false,
    roomCode: "",
    roomHostId: null,
    lastWordStartTime: 0,
    charSpaceWpm: 0,
    wordSpaceMult: 1.0,
    lastPlayedWordId: 0,
    lastSeenGuessId: 0,
    gameStartPlayerCount: 0,
    lastPlayerCount: 0,
    
    // Conquista (Co-op)
    isCoopMode: false,
    coopActiveFreqIndex: 0,
    
    // Quiz
    quizQuestionIndex: 0,
    quizActiveBuzzerId: null,
    randomizedQuizQuestions: [],
    currentQuizQuestion: null,
    lastLoadedQuizIndex: -1,

    // Battaglia Reale
    brRoomCode: "",
    brIsPlaying: false,
    brAmIAlive: true,

    // Timers
    intervals: {
        lobby: null,
        quiz: null,
        pingPong: null,
        brCheck: null,
        brTimer: null,
        coopTimer: null,
        coopDecay: null
    }
};

export const chatState = {
    activeContext: null,
    isDrawerOpen: false,
    isMuted: false,
    cwEnabled: false,
    cwWpm: 20,
    cwTone: 600,
    audioQueue: [],
    isPlaying: false,
    lastPlayedMsgKey: null
};

export const uiState = {
    activeTab: "room",
    activeTrnId: null,
    lastBRRoundPlayed: -1,
    lostFocusDuringWord: false,
    isChallenging: false,
    isRejoining: false,
    currentInviterId: null,
    brBannerDismissedToday: false
};

export const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, roomsList: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

export function fisherYatesShuffle(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function clearAllTimers() {
    Object.keys(gameState.intervals).forEach(key => {
        if (gameState.intervals[key]) {
            clearInterval(gameState.intervals[key]);
            gameState.intervals[key] = null;
        }
    });
}
