// ============================================================================
// STATE.JS - STATO CENTRALE DELL'APPLICAZIONE
// ============================================================================

// 1. STATO APP (Utente, Firebase, Team, Configurazione)
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
    serverTimeOffset: 0
};

// 2. STATO PARTITA (WPM, Parole, Punteggi, Timers, Flag di gioco)
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
    matchDetails: [],
    isSinglePlayer: false,
    isFixedSpeed: false,
    isEasyMode: false,
    roomCode: "",
    roomHostId: null,
    lastWordStartTime: 0,
    
    // Conquista (Co-op)
    isCoopMode: false,
    coopActiveFreqIndex: 0,
    
    // Quiz
    quizQuestionIndex: 0,
    quizActiveBuzzerId: null,
    randomizedQuizQuestions: [],
    
    // Timers
    intervals: {
        lobby: null,
        quiz: null,
        pingPong: null,
        battleRoyale: null,
        coopTimer: null,
        coopDecay: null
    }
};

// 3. STATO CHAT (Audio CW, Muto, Cronologia audio)
export const chatState = {
    activeContext: null, // 'global', 'room', 'team'
    isDrawerOpen: false,
    isMuted: false,
    cwEnabled: false,
    cwWpm: 20,
    cwTone: 600,
    audioQueue: [],
    isPlaying: false,
    lastPlayedMsgKey: null
};

// 4. STATO INTERFACCIA (Schermate, Modali, Tracker visivi)
export const uiState = {
    activeTab: "room",
    activeTrnId: null,
    lastPlayerCount: 0,
    lastBRRoundPlayed: -1,
    lostFocusDuringWord: false
};

// 5. REGISTRO CENTRALE DEI LISTENER FIREBASE (Per evitare memory leak)
export const listeners = {
    room: null,
    chat: null,
    pingPong: null,
    players: null,
    quizState: null,
    roomLb: null,
    presence: null,
    roomsList: null,
    invites: null,
    inviteAccepted: null,
    outgoingInvite: null,
    team: null,
    allTeams: null,
    trn: null,
    activeChat: {}
};

// --- HELPER PER LA PULIZIA DEI TIMER ---
export function clearAllTimers() {
    Object.keys(gameState.intervals).forEach(key => {
        if (gameState.intervals[key]) {
            clearInterval(gameState.intervals[key]);
            gameState.intervals[key] = null;
        }
    });
}
