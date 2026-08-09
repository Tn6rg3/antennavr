// ============================================================================
// APP.JS - ENTRY POINT & GLOBAL STATE
// ============================================================================

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260807.220";

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

// --- STATO GLOBALE ---
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

// STATO CO-OP
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

window.masterDictionary = [];
window.itDictionary = [];
window.enDictionary = [];
window.customDictionary = [];

let currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;
let sessionCharErrors = Object.create(null), sessionErrorsByWpm = Object.create(null);
let userMatchHistory = [];

// GESTORE CENTRALE LISTENER
const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, roomsList: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

// --- UTILS ---
function fisherYatesShuffle(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function clearAllTimers() {
    [lobbyTimerInterval, quizTimerInterval, ppTimerInterval, brTimerInterval, coopTimerInterval, coopDecayInterval].forEach(t => { if(t) clearInterval(t); });
    lobbyTimerInterval = quizTimerInterval = ppTimerInterval = brTimerInterval = coopTimerInterval = coopDecayInterval = null;
}

window.forceAppUpdate = function() {
    showToast("Aggiornamento...");
    if ('caches' in window) caches.keys().then(n => n.forEach(c => caches.delete(c)));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
    setTimeout(() => { location.replace(location.pathname + "?v=" + Date.now()); }, 300);
};

if (els.updateBannerBtn) els.updateBannerBtn.addEventListener('click', window.forceAppUpdate);

function escapeHTML(str) {
    if (!str && str !== 0) return "";
    return String(str).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
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
    if (username && String(username).trim() !== "") tg.openTelegramLink('https://t.me/' + username);
    else tg.showAlert("Profilo privato o senza username pubblico.");
};

window.toggleLanguage = function() {
    const newLang = (currentLang === 'it') ? 'en' : 'it';
    window.setLanguage(newLang);
    window.updateDictionary();
    showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English");
};

function updateMuteBtnUI() {
    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.textContent = isGlobalChatMuted 
            ? (currentLang === 'it' ? "🔇 Notifiche Disattivate" : "🔇 Notifications Muted") 
            : (currentLang === 'it' ? "🔊 Notifiche Attive" : "🔊 Notifications Active");
    }
}
window.updateMuteBtnUI = updateMuteBtnUI;

// --- REGOLAMENTO ---
window.loadRegolamento = async function() {
    if (!els.regolamentoContainer) return;
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error();
        els.regolamentoContainer.innerHTML = await response.text();
        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = () => {
                const url = `https://t.me/share/url?text=${encodeURIComponent("💡 Suggerimento: \n\n[Scrivi qui...]")}`;
                if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
            };
        }
    } catch (e) {
        els.regolamentoContainer.innerHTML = `<div style="text-align:center;padding:15px;"><h3>📜 Regole</h3><p>Decodifica il Morse e scala la classifica!</p></div>`;
    }
};

// --- STARTUP ---
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
    if (els.startWpmInput) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM) || 20;
    if (els.wordCountInput) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS) || 10;
    if (els.toneInput) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE) || 600;

    isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
    chatCwWpm = parseInt(localStorage.getItem(STORAGE_CHAT_CW_WPM)) || 20;
    chatCwTone = parseInt(localStorage.getItem(STORAGE_CHAT_CW_TONE)) || 600;

    if (els.toggleChatCwBtn) {
        const updateBtn = () => {
            els.toggleChatCwBtn.textContent = isChatCwEnabled ? "📻 CW: ON" : "📻 CW: OFF";
            els.toggleChatCwBtn.className = isChatCwEnabled ? "btn btn-success" : "btn btn-secondary";
            if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = isChatCwEnabled ? 'block' : 'none';
        };
        updateBtn();
        els.toggleChatCwBtn.onclick = () => {
            isChatCwEnabled = !isChatCwEnabled;
            localStorage.setItem(STORAGE_CHAT_CW_ENABLED, isChatCwEnabled);
            updateBtn();
            if (typeof listenToChat === 'function') listenToChat();
        };
    }

    auth.signInAnonymously().then(async () => {
        const userRef = db.ref(`users/${myId}`);
        const snap = await userRef.once('value');
        const data = snap.val() || {};
        if (data.alias) myName = data.alias;
        myPrivacy = data.privacyUsername || false;

        if (!snap.exists() || !data.welcomed) {
            await userRef.update({ name: myName, welcomed: true, createdAt: firebase.database.ServerValue.TIMESTAMP });
            if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'flex';
        }

        if (els.playerName) els.playerName.textContent = myName;
        db.ref('.info/connected').on('value', s => {
            if (!s.val()) return;
            const pRef = db.ref(`presence/${myId}`);
            pRef.onDisconnect().remove();
            pRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, status: 'online', ts: firebase.database.ServerValue.TIMESTAMP });
        });

        if (startParam) {
            if (startParam.startsWith('team_')) window.processTeamInvite?.(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom?.(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', s => {
                    if (s.exists() && s.val().status !== 'finished') {
                        roomCode = lastRoom; if (els.rejoinContainer) els.rejoinContainer.style.display = 'block';
                        showScreen('setupScreen');
                    } else { localStorage.removeItem(STORAGE_ROOM_KEY); showScreen('setupScreen'); }
                });
            } else showScreen('setupScreen');
        }

        const savedLang = localStorage.getItem('gameLang');
        if (savedLang) window.setLanguage(savedLang); else updateMuteBtnUI();
        
        window.loadDictionaries().then(() => {
            let today = new Date().toISOString().split('T')[0];
            if (localStorage.getItem(STORAGE_DAILY_SHOWN) !== today && !startParam && els.dailyChallengeModal) {
                els.dailyChallengeModal.style.display = 'flex';
            }
        });

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) { try { window.customDictionary = JSON.parse(savedCustom); window.updateCustomDictStatus?.(); } catch(e){} }

        window.listenToRooms?.();
        window.listenToOnlineUsers?.();
        window.listenToInvites?.();
        window.listenToInviteAccepted?.();
        window.initBattleRoyaleScheduler?.();
        window.loadRegolamento();

        if (els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
    });

    window.populateGameModesUI();
    window.checkGameTypeUI();
    setTimeout(() => { window.checkGameTypeUI?.(); }, 800);
}

// --- SFIDA GIORNALIERA ---
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.onclick = () => {
        if (els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';
        currentMode = 'daily_challenge'; isSinglePlayer = true;
        currentWpm = baseWpm = 15; requestedWordCount = 20;
        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        gameWords = window.getGameWords(requestedWordCount, currentMode);
        db.ref('rooms/' + roomCode).set({
            status: 'countdown', type: 'single', mode: currentMode, wpm: currentWpm, tone: currentTone,
            wordCount: requestedWordCount, words: gameWords, createdAt: firebase.database.ServerValue.TIMESTAMP, hostId: myId
        }).then(() => window.joinRoomLogic?.(false));
    };
}
if (els.btnPlayDailyLater) els.btnPlayDailyLater.onclick = () => { if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none'; };
if (els.btnDeclineDaily) els.btnDeclineDaily.onclick = () => {
    localStorage.setItem(STORAGE_DAILY_SHOWN, new Date().toISOString().split('T')[0]);
    if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';
};

// --- CONDIVISIONE ---
window.shareAppToFriends = function() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`)}&text=${encodeURIComponent("📻 Unisciti a me su Sfida Telegrafia!")}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
};

// --- LISTENER PULSANTI CHAT ---
if (els.sendChatBtn) {
    els.sendChatBtn.onclick = () => {
        const txt = els.chatInput?.value.trim(); if (!txt) return;
        let ref = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
        ref.set({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        if (els.chatInput) els.chatInput.value = '';
    };
}
if (els.sendLobbyChatBtn) {
    els.sendLobbyChatBtn.onclick = () => {
        const txt = els.lobbyChatInput?.value.trim(); if (!txt || !roomCode) return;
        db.ref(`rooms/${roomCode}/chat`).push().set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        if (els.lobbyChatInput) els.lobbyChatInput.value = '';
    };
}
if (els.clearChatBtn) {
    els.clearChatBtn.onclick = () => {
        if (confirm('Vuoi cancellare la cronologia?')) {
            if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove();
            else if (activeChatContext === 'team' && myTeamId) db.ref(`teams/${myTeamId}/chat`).remove();
            else db.ref('globalChat').remove();
        }
    };
}
if (els.muteGlobalChatBtn) {
    els.muteGlobalChatBtn.onclick = () => {
        isGlobalChatMuted = !isGlobalChatMuted;
        localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted);
        updateMuteBtnUI();
        showToast(isGlobalChatMuted ? "Notifiche silenziate." : "Notifiche riattivate.");
    };
}

// --- CREAZIONE STANZA ---
if (els.createRoomBtn) {
    els.createRoomBtn.onclick = () => {
        const gType = els.gameTypeInput.value, gMode = els.gameModeInput.value;
        if (gType === 'tournament') { window.showScreen('teamsScreen'); return; }
        if (gMode === 'custom' && window.customDictionary.length === 0) return showToast("Carica un file!");

        isChallenging = false;
        currentMode = gMode || 'standard';
        isSinglePlayer = (gType === 'single');
        currentWpm = baseWpm = (currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20));
        requestedWordCount = (currentMode === 'callsign' ? 25 : (parseInt(els.wordCountInput?.value) || 10));
        currentTone = parseInt(els.toneInput?.value) || 600;

        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        gameWords = window.getGameWords(requestedWordCount, currentMode);

        const expires = isSinglePlayer ? null : Date.now() + ((parseInt(els.roomTimerInput?.value) || 5) * 60000);
        db.ref('rooms/' + roomCode).set({
            status: isSinglePlayer ? 'countdown' : 'waiting',
            type: isSinglePlayer ? 'single' : (gType === 'coop' ? 'coop' : 'multi'),
            mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount,
            words: gameWords, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: expires, hostId: myId
        }).then(() => {
            if (!isSinglePlayer) db.ref(`public_lobby_rooms/${roomCode}`).set({ mode: currentMode, pCount: 1, wpm: currentWpm, status: 'waiting', expiresAt: expires });
            window.joinRoomLogic?.(false);
        });
    };
}

// --- LISTA STANZE ---
window.lastKnownRoomPlayersCount = {};
window.addOrUpdateRoomCard = function(code, room) {
    if (!els.waitingRoomsList || !room || room.status !== 'waiting' || room.type === 'single') { window.removeRoomCard?.(code); return; }
    let li = document.getElementById(`room_list_item_${code}`);
    if (!li) { li = document.createElement('li'); li.id = `room_list_item_${code}`; els.waitingRoomsList.appendChild(li); }
    li.innerHTML = `<span><b>#${code}</b><br><small>${Object.keys(room.players || {}).length || 1} Gioc. | ${room.wpm} WPM</small></span>`;
    const btn = document.createElement('button'); btn.className = 'action-btn-small'; btn.textContent = 'Entra';
    btn.onclick = () => window.joinSpecificRoom?.(code); li.appendChild(btn);
};

window.removeRoomCard = function(code) {
    const li = document.getElementById(`room_list_item_${code}`); if (li) li.remove();
};

window.listenToRooms = function() {
    const ref = db.ref('rooms').orderByChild('status').equalTo('waiting').limitToLast(20);
    ref.on('child_added', s => window.addOrUpdateRoomCard(s.key, s.val()));
    ref.on('child_changed', s => window.addOrUpdateRoomCard(s.key, s.val()));
    ref.on('child_removed', s => window.removeRoomCard(s.key));
};
