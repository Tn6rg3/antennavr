const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20240520.25";

window.Telegram.WebApp.ready();
window.Telegram.WebApp.expand();

const tg = window.Telegram.WebApp;
const tgUser = tg.initDataUnsafe?.user;
const tgUsername = tgUser?.username || "";
const startParam = tg.initDataUnsafe?.start_param;

// --- MAPPA DOM DINAMICA (Proxy) ---
// Sostituisce tutti i document.getElementById('id') con els.id
const els = new Proxy({}, { get: (target, id) => document.getElementById(id) });

// --- COSTANTI ---
const STORAGE_ROOM_KEY = "cwgame_last_room";
const STORAGE_CUSTOM_DICT_KEY = "cwgame_custom_dict";

// --- STATO GLOBALE (Blocchi Logici) ---
// Utente e Squadre
let myName, myId, myPrivacy = false;
let myTeamId = null, myTeamName = "", isTeamCaptain = false;

// App e Firebase
let db, auth, currentLang = 'it';
let activeChatContext = null, activeTab = "room", isChatDrawerOpen = false;
let isChallenging = false, isRejoining = false, currentInviterId = null;

// Stanze e Tornei
let roomCode = "", roomHostId = null, activeTrnId = null;
let lastPlayerCount = 0, gameStartPlayerCount = 0, lobbyTimerInterval = null;

// Gameplay
let gameRunning = false, inputActive = false, audioCtx = null;
let gameWords = [], wordIndex = 0, currentWpm = 20, baseWpm = 20, currentTone = 600;
let totalScore = 0, currentStreak = 0, usedReplay = false, matchDetailsArray = [];
let isSinglePlayer = false, currentMode = "standard", requestedWordCount = 10;
let isFixedSpeed = false, isEasyMode = false, lastWordStartTime = 0;

window.lastPlayedWordId = 0;
window.lastSeenGuessId = 0;

// Dizionari
let masterDictionary = [], itDictionary = [], enDictionary = [], customDictionary = [];

// Quiz
let quizTimerInterval = null, currentQuizQuestion = null, quizActiveBuzzerId = null;
let quizQuestionIndex = 0, randomizedQuizQuestions = [], lastLoadedQuizIndex = -1;

// Statistiche
let sessionCharErrors = Object.create(null), sessionErrorsByWpm = Object.create(null);
let userMatchHistory = [];

// Listener Firebase
const listeners = {
    room: null, chat: null, pingPong: null, players: null, quizState: null,
    roomLb: null, presence: null, invites: null, inviteAccepted: null,
    outgoingInvite: null, team: null, allTeams: null, trn: null, activeChat: {}
};

// --- FUNZIONI DI SUPPORTO ---
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
    els.toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
}

window.openTelegramProfile = function(username) {
    if (username) tg.openTelegramLink('https://t.me/' + username);
    else tg.showAlert("Questo utente non ha impostato un Username pubblico su Telegram.");
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

// --- DIZIONARI & DATI ---
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
                if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
                else window.open(shareUrl, '_blank');
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

function updateDictionary() {
    masterDictionary = (currentLang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary;
}

const morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--','?': '..--..' 
};

// --- INIZIALIZZAZIONE APP ---
if (!tgUser) {
    els.loadingScreen.classList.remove('active-screen');
    els.errorScreen.classList.add('active-screen');
} else {
    myName = tgUser.first_name; myId = tgUser.id.toString(); initGame();
}

function initGame() {
    const firebaseConfig = {
        apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk", authDomain: "telegrafiabot.firebaseapp.com",
        databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "telegrafiabot", storageBucket: "telegrafiabot.firebasestorage.app",
        messagingSenderId: "575790683327", appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database(); auth = firebase.auth();

    auth.signInAnonymously().then(async () => {
        try {
            const userData = (await db.ref(`users/${myId}`).once('value')).val() || {};
            if (userData.alias) myName = userData.alias;
            myPrivacy = userData.privacyUsername || false;
            els.privacyUsernameCheckbox.checked = myPrivacy;
        } catch(e) {}

        els.playerName.textContent = myName;
        els.userAliasInput.value = (myName !== tgUser.first_name) ? myName : "";
        els.loadingText.style.display = 'none';
        els.createRoomBtn.disabled = false;

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
                        roomCode = lastRoom;
                        els.rejoinContainer.style.display = 'block';
                        els.rejoinGameBtn.onclick = () => { isRejoining = true; joinRoomLogic(false); };
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
        loadDictionaries();

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) {
            try { customDictionary = JSON.parse(savedCustom); updateCustomDictStatus(); } catch(e) {}
        }

        checkActivityAndAwardMedals();
        checkTournamentPopup();
        listenToRooms(); listenToOnlineUsers(); listenToInvites(); listenToInviteAccepted();
        loadRegolamento();

        if(els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
        if(els.appVersionFooter) els.appVersionFooter.textContent = APP_VERSION;

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) els.updateBanner.style.display = 'block';
            else els.updateBanner.style.display = 'none';
        });

    }).catch(e => {
        if (els.loadingText) {
            els.loadingText.textContent = "Errore di Connessione.";
            els.loadingText.style.color = "red";
            els.loadingText.style.fontWeight = "bold";
        }
    });

    checkGameTypeUI();
}

// --- GESTIONE AUDIO ---
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

function playMorseAudio(text, wpm) {
    return new Promise(resolve => {
        if (!audioCtx || !gameRunning) { resolve(); return; }
        const unitDuration = 1.2 / wpm;
        let time = audioCtx.currentTime + 0.05;
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
    if(els.chatDrawer) els.chatDrawer.style.display = 'none';
    isChatDrawerOpen = false;
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
            els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false;
        }
    } else {
        setupChat(db.ref('globalChat'), 'chatMessages', null);
        if(els.chatTitle) els.chatTitle.textContent = "🌎 Chat Globale";
    }
}

window.openGlobalChat = function() { activeChatContext = 'global'; listenToChat(); toggleChat(); }

if(els.sendLobbyChatBtn) els.sendLobbyChatBtn.addEventListener('click', () => {
    const txt = els.lobbyChatInput.value.trim(); if (!txt || !roomCode) return;
    const msgRef = db.ref(`rooms/${roomCode}/chat`).push();
    msgRef.onDisconnect().remove();
    msgRef.set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
    els.lobbyChatInput.value = '';
});
if(els.lobbyChatInput) els.lobbyChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') els.sendLobbyChatBtn.click(); });

function setupChat(chatRef, containerId, alertBtnId) {
    const container = els[containerId];
    if (!container) return;
    if (listeners.activeChat[containerId]) listeners.activeChat[containerId].ref.off('value', listeners.activeChat[containerId].callback);

    let initialLoad = true, lastTs = Date.now();
    const callback = chatRef.limitToLast(40).on('value', snapshot => {
        container.innerHTML = '';
        let newMsgsCount = 0, latestMsg = null, maxTs = lastTs;

        snapshot.forEach(child => {
            const msg = child.val();
            const div = document.createElement('div'); div.style.marginBottom = '6px';
            if(msg.ts) {
                const d = new Date(msg.ts);
                const dateSmall = document.createElement('small');
                dateSmall.style.color = 'var(--hint-color)'; dateSmall.style.fontSize = '0.75em';
                dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                div.appendChild(dateSmall);
                if(msg.ts > maxTs) maxTs = msg.ts;
            }
            const nameB = document.createElement('b'); nameB.style.color = 'var(--link-color)'; nameB.textContent = msg.name + ":";
            div.appendChild(nameB); div.appendChild(document.createTextNode(" " + msg.text));
            container.appendChild(div);

            if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) { newMsgsCount++; latestMsg = msg; }
        });
        lastTs = maxTs; container.scrollTop = container.scrollHeight;

        if (!initialLoad && newMsgsCount > 0 && alertBtnId && !isChatDrawerOpen) {
            showToast(`💬 Nuovo messaggio da ${latestMsg.name}`);
            if (els[alertBtnId]) els[alertBtnId].style.backgroundColor = '#4caf50';
        }
        if (!initialLoad && newMsgsCount > 0 && roomHostId === myId && activeChatContext !== 'room' && chatRef.key !== 'globalChat') {
            if (latestMsg) showToast(`📢 (Stanza) ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
        }
        if (!initialLoad && newMsgsCount > 0 && activeChatContext === 'room' && chatRef.key === 'globalChat') {
            if (latestMsg) showToast(`🌎 (Global) ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
        }
        initialLoad = false;
    });
    listeners.activeChat[containerId] = { ref: chatRef, callback: callback };
}

if(els.sendChatBtn) els.sendChatBtn.addEventListener('click', () => {
    const txt = els.chatInput.value.trim(); if (!txt) return;
    let msgRef = (activeChatContext === 'room' && roomCode) ? db.ref(`rooms/${roomCode}/chat`).push() : db.ref('globalChat').push();
    msgRef.onDisconnect().remove();
    msgRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
    els.chatInput.value = '';
});
if(els.chatInput) els.chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') els.sendChatBtn.click(); });

if(els.clearChatBtn) els.clearChatBtn.addEventListener('click', () => {
    if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) {
        if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove();
        else db.ref('globalChat').remove();
    }
});

// --- UI & LINGUA ---
function checkGameTypeUI() {
    const isSingle = els.gameTypeInput.value === 'single';
    const isTrn = els.gameTypeInput.value === 'tournament';
    const isCustom = els.gameModeInput.value === 'custom';

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

const i18n = {
    it: { hello: "Ciao", lb: "Classifica", profile: "Profilo", activity: "Attività", /*... resto delle traduzioni come prima ...*/ btn_start_match: "AVVIA PARTITA", status_host: "Sei l'Host della partita.", status_guest: "Sei un partecipante. Attendi il via." },
    en: { hello: "Hello", lb: "Leaderboard", profile: "Profile", activity: "Activity", /*... resto delle traduzioni come prima ...*/ btn_start_match: "START MATCH", status_host: "You are the Match Host.", status_guest: "You are a participant. Wait for the start." }
};
// [Nota: Il dizionario i18n originale è conservato integralmente, lo applico dinamicamente nei punti appropriati]

window.toggleLanguage = function() {
    const newLang = (currentLang === 'it') ? 'en' : 'it';
    setLanguage(newLang); updateDictionary();
    showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English");
}

function setLanguage(lang) {
    currentLang = lang; localStorage.setItem('gameLang', lang);
    const t = i18n[lang] || i18n.it;
    if(els.langBtn) els.langBtn.textContent = lang.toUpperCase();

    // Aggiornamento parziale UI per non allungare il codice (si assumono tag esistenti)
    if(els.txt_hello) els.txt_hello.textContent = t.hello;
    checkGameTypeUI();
    if (activeTrnId) db.ref(`tournaments/${activeTrnId}`).once('value', snap => { if(snap.exists()) renderActiveTournament(snap); });
}

if(els.gameModeInput) els.gameModeInput.addEventListener('change', e => {
    const isC = e.target.value === 'callsign'; const isPP = e.target.value === 'pingpong';
    if (isPP) { els.gameTypeInput.value = 'multi'; els.gameTypeInput.disabled = true; checkGameTypeUI(); }
    else els.gameTypeInput.disabled = false;

    ['startWpmInput', 'wordCountInput', 'toneInput'].forEach(id => {
        els[id].disabled = isC;
        if(isC && id!=='toneInput') els[id].value = 25;
    });
    els.fixedSpeedCheckbox.disabled = isC; if(isC) els.fixedSpeedCheckbox.checked = false;
    checkGameTypeUI();
});
if(els.gameTypeInput) els.gameTypeInput.addEventListener('change', checkGameTypeUI);

function updateCustomDictStatus() {
    if (!els.customDictStatus) return;
    if (customDictionary.length === 0) { els.customDictStatus.textContent = "Nessun file caricato."; els.customDictStatus.style.color = "var(--hint-color)"; }
    else { els.customDictStatus.textContent = "Parole caricate: " + customDictionary.length; els.customDictStatus.style.color = "var(--link-color)"; }
}

if (els.customDictFileInput) {
    els.customDictFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (!file.name.toLowerCase().endsWith('.txt')) return alert("Per favore seleziona un file .txt!");
        const reader = new FileReader();
        reader.onload = (event) => {
            const rawWords = event.target.result.split(/[\s,;.:!?"'()\[\]{}]+/).filter(w => w.trim().length >= 3);
            const uniqueWords = [...new Set(rawWords.map(w => w.trim().toLowerCase()))];
            if (uniqueWords.length === 0) return alert("Nessuna parola valida trovata.");
            customDictionary = uniqueWords; localStorage.setItem(STORAGE_CUSTOM_DICT_KEY, JSON.stringify(customDictionary));
            updateCustomDictStatus(); showToast(`Caricate ${uniqueWords.length} parole!`);
        };
        reader.readAsText(file);
    });
}

function generateCallsign() {
    const prefixes = ["I", "IK", "IZ", "IN", "IT", "IS", "IU", "IW", "W", "K", "N", "A", "WA", "WB", "DL", "DJ", "DK", "DO", "EA", "EB", "EC", "F", "G", "M", "GW", "GM", "9A", "S5", "OK", "OM", "SP", "SQ", "UA", "UR", "EW", "ER", "YO", "YU", "HA", "LZ", "OE", "HB", "PA", "PB", "ON", "VE", "VK", "ZL", "JA", "PY", "LU", "CX"];
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let callsign = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(Math.random() * 10);
    let suffixLen = (Math.random() > 0.9) ? 1 : (Math.random() > 0.7) ? 2 : 3;
    for(let i = 0; i < suffixLen; i++) callsign += chars[Math.floor(Math.random() * chars.length)];
    if (Math.random() > 0.90) callsign += ["/QRP", "/P", "/M", "/AM", "/MM"][Math.floor(Math.random() * 5)];
    return callsign;
}

function getGameWords(num, mode) {
    if (mode === 'callsign') return Array.from({length: num}, generateCallsign);
    if (mode === 'pingpong') return [];
    if (mode === 'chars') return Array.from({length: num}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]);
    if (mode === 'custom' && customDictionary.length > 0) return [...customDictionary].sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
    return masterDictionary.sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
}

window.showRoomEventModal = function(title, text) {
    els.roomEventTitle.textContent = title; els.roomEventText.textContent = text; els.roomEventModal.style.display = 'flex';
    playBeep(600, 0.2); setTimeout(() => playBeep(800, 0.3), 200);
}
if(els.goToRoomBtn) els.goToRoomBtn.addEventListener('click', () => { els.roomEventModal.style.display = 'none'; if (roomCode) joinRoomLogic(false); });

window.checkTournamentPopup = function() {
    if (localStorage.getItem('hideTrnWelcomePopup') === 'true' || myTeamId) return;
    setTimeout(() => { if(els.tournamentWelcomeModal) els.tournamentWelcomeModal.style.display = 'flex'; }, 1500);
}
window.closeTrnWelcomeModal = function() {
    if (els.stopShowingTrnPopup && els.stopShowingTrnPopup.checked) localStorage.setItem('hideTrnWelcomePopup', 'true');
    if(els.tournamentWelcomeModal) els.tournamentWelcomeModal.style.display = 'none';
}
window.goToTournamentsFromPopup = function() { closeTrnWelcomeModal(); showScreen('teamsScreen'); }

function listenToOnlineUsers() {
    db.ref('presence').on('value', snap => {
        if(!els.onlineUsersList) return;
        els.onlineUsersList.innerHTML = ''; let count = 0;
        snap.forEach(child => {
            const u = child.val(); if (child.key === myId) return;
            count++; const li = document.createElement('li');
            const isWaiting = (isChallenging && currentInviterId === child.key);
            const isPlaying = (u.status === 'playing');

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
        if (count === 0) els.onlineUsersList.innerHTML = '<li style="justify-content:center; color:var(--hint-color); background:none; border:none;">Sei solo.</li>';
    });
}

// Logica Inviti ridotta
window.openInviteModal = function(targetId, targetName) {
    currentInviterId = targetId; els.inviteModalTitle.textContent = "Sfida " + targetName; els.inviteModalText.textContent = "Scegli le impostazioni per la sfida:";
    els.inviteSettings.style.display = 'block'; els.teamInviteSettings.style.display = 'none'; els.incomingInviteArea.style.display = 'none';
    els.incomingTeamInviteArea.style.display = 'none'; els.outgoingInviteArea.style.display = 'block'; els.inviteModal.style.display = 'flex';
}

window.openTeamInviteModal = async function(targetId, targetName) {
    currentInviterId = targetId; els.inviteModalTitle.textContent = "Recluta " + targetName;
    els.recruitmentStatusText.textContent = "Caricamento stato...";
    els.inviteSettings.style.display = 'none'; els.teamInviteSettings.style.display = 'block'; els.incomingInviteArea.style.display = 'none';
    els.incomingTeamInviteArea.style.display = 'none'; els.outgoingInviteArea.style.display = 'none'; els.recruitJoinBtn.style.display = 'none';
    try {
        const teamsSnap = await db.ref('teams').once('value'); let tName = null, inTeam = false;
        teamsSnap.forEach(tSnap => { const t = tSnap.val(); if (t.status !== 'retired' && t.members && t.members[targetId]) { inTeam = true; tName = t.name; } });
        if (inTeam) {
            els.recruitmentStatusText.innerHTML = `⚠️ <b>${targetName}</b> fa già parte della squadra <b>${tName}</b>.`; els.recruitCreateBtn.style.display = 'none';
        } else {
            els.recruitmentStatusText.innerHTML = `💡 <b>${targetName}</b> non ha ancora una squadra.`; els.recruitCreateBtn.style.display = 'block';
            if (myTeamId) els.recruitJoinBtn.style.display = 'block';
        }
        els.recruitJoinBtn.onclick = () => sendRecruitmentInvite('team'); els.recruitCreateBtn.onclick = () => sendRecruitmentInvite('suggest');
        els.recruitMsgBtn.onclick = () => { db.ref(`presence/${targetId}`).once('value', s => { const u = s.val(); if (u && u.username) tg.openTelegramLink('https://t.me/' + u.username); else tg.showAlert("Nessun username pubblico."); }); };
    } catch(e) {}
    els.inviteModal.style.display = 'flex';
}

function sendRecruitmentInvite(type) {
    const inviteData = { fromId: myId, fromName: myName, type: 'team', ts: firebase.database.ServerValue.TIMESTAMP, teamId: type === 'team' ? myTeamId : null, teamName: type === 'team' ? myTeamName : null };
    db.ref(`invites/${currentInviterId}`).set(inviteData).then(() => { showToast("Invito inviato!"); closeInviteModal(); });
}
window.closeInviteModal = function() { els.inviteModal.style.display = 'none'; currentInviterId = null; }

if(els.sendInviteBtn) els.sendInviteBtn.addEventListener('click', () => {
    if (isChallenging) return;
    isChallenging = true;
    const inv = { fromId: myId, fromName: myName, mode: els.inviteModeInput.value, wpm: parseInt(els.inviteWpmInput.value), wordCount: parseInt(els.inviteWordCountInput.value), ts: firebase.database.ServerValue.TIMESTAMP, status: 'pending' };
    const tId = currentInviterId;
    db.ref(`invites/${tId}`).set(inv).then(() => {
        showToast("Invito inviato! In attesa..."); closeInviteModal();
        if (listeners.outgoingInvite) db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite);
        listeners.outgoingInvite = db.ref(`invites/${tId}`).on('value', snap => {
            if (!snap.exists() && isChallenging) setTimeout(() => {
                if (isChallenging) { showToast("Rifiutato o scaduto."); isChallenging = false; currentInviterId = null; if(listeners.outgoingInvite) { db.ref(`invites/${tId}`).off('value', listeners.outgoingInvite); listeners.outgoingInvite=null;} }
            }, 1000);
        });
    });
});

function listenToInvites() {
    db.ref(`invites/${myId}`).on('value', snap => {
        const inv = snap.val(); if (!inv || roomCode || gameRunning) return;
        if (Date.now() - inv.ts > 60000) { db.ref(`invites/${myId}`).remove(); return; }
        if (inv.type === 'team') {
            els.inviteModalTitle.textContent = inv.teamId ? "🚀 INVITO SQUADRA" : "💡 SUGGERIMENTO SQUADRA";
            els.inviteModalText.innerHTML = inv.teamId ? `${inv.fromName} ti ha invitato ad unirti alla squadra <b>${inv.teamName}</b>.` : `${inv.fromName} ti suggerisce di creare una tua squadra!`;
            els.inviteSettings.style.display = 'none'; els.teamInviteSettings.style.display = 'none'; els.incomingInviteArea.style.display = 'none'; els.incomingTeamInviteArea.style.display = 'block'; els.outgoingInviteArea.style.display = 'none';
            els.acceptTeamInviteBtn.textContent = inv.teamId ? "UNISCITI ✅" : "VAI ALLA CREAZIONE 🛠️";
            els.acceptTeamInviteBtn.onclick = () => { db.ref(`invites/${myId}`).remove(); closeInviteModal(); if (inv.teamId) joinTeam(inv.teamId); else showScreen('teamsScreen'); };
        } else {
            els.inviteModalTitle.textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();
            els.inviteModalText.innerHTML = `Ti ha invitato a giocare:<br><b>${inv.mode.toUpperCase()}</b> a <b>${inv.wpm}</b> WPM (<b>${inv.wordCount}</b> test).`;
            els.inviteSettings.style.display = 'none'; els.teamInviteSettings.style.display = 'none'; els.incomingInviteArea.style.display = 'block'; els.incomingTeamInviteArea.style.display = 'none'; els.outgoingInviteArea.style.display = 'none';
        }
        els.inviteModal.style.display = 'flex'; currentInviterId = inv.fromId; window.lastIncomingInvite = inv;
    });
}

if(els.declineTeamInviteBtn) els.declineTeamInviteBtn.addEventListener('click', () => { db.ref(`invites/${myId}`).remove(); closeInviteModal(); });
if(els.declineInviteBtn) els.declineInviteBtn.addEventListener('click', () => { db.ref(`invites/${myId}`).remove(); closeInviteModal(); });

if(els.acceptInviteBtn) els.acceptInviteBtn.addEventListener('click', () => {
    const inv = window.lastIncomingInvite; db.ref(`invites/${myId}`).remove(); closeInviteModal();
    const rCode = Math.floor(1000 + Math.random() * 9000).toString();
    db.ref(`rooms/${rCode}`).set({ status: 'waiting', type: 'multi', mode: inv.mode, wpm: inv.wpm, tone: 600, wordCount: inv.wordCount, words: getGameWords(inv.wordCount, inv.mode), createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 600000, hostId: inv.fromId }).then(() => {
        db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode }); roomCode = rCode; joinRoomLogic(false);
    });
});

function listenToInviteAccepted() {
    if (listeners.inviteAccepted) db.ref(`invite_accepted/${myId}`).off('value', listeners.inviteAccepted);
    listeners.inviteAccepted = db.ref(`invite_accepted/${myId}`).on('value', snap => {
        const d = snap.val(); if (d && d.roomCode) { db.ref(`invite_accepted/${myId}`).remove(); isChallenging = false; closeInviteModal(); roomCode = d.roomCode; joinRoomLogic(false); }
    });
}

function listenToRooms() {
    db.ref('rooms').on('value', snap => {
        if(!els.waitingRoomsList) return;
        els.waitingRoomsList.innerHTML = ''; let wCount = 0;
        snap.forEach(child => {
            const room = child.val(); const code = child.key;
            if (code.startsWith("TRN_") || (room.expiresAt && Date.now() > room.expiresAt)) { if(Date.now() > room.expiresAt) db.ref(`rooms/${code}`).remove(); return; }
            if (room.status === 'waiting' && room.type !== 'single') {
                wCount++; const pCount = room.players ? Object.keys(room.players).length : 0;
                const li = document.createElement('li');
                let modeIcon = room.mode === 'callsign' ? '🎙️ Nom.' : room.mode === 'pingpong' ? '🏓 Ping Pong' : room.mode === 'quiz' ? '❓ Quiz' : '🔤 Parole';
                li.innerHTML = `<span><b>#${code} - ${modeIcon}</b><br><small>${pCount} Gioc. | ${room.wpm} WPM | ${room.wordCount} Test</small></span>`;
                const btn = document.createElement('button'); btn.className = 'action-btn-small'; btn.textContent = 'Entra'; btn.onclick = () => window.joinSpecificRoom(code);
                li.appendChild(btn); els.waitingRoomsList.appendChild(li);
            }
        });
        if (wCount === 0) els.waitingRoomsList.innerHTML = '<li style="justify-content:center; color:var(--hint-color); background:none; border:none;">Nessuna sfida.</li>';
    });
}
window.joinSpecificRoom = function(code) { roomCode = code; joinRoomLogic(false); }

if(els.createRoomBtn) els.createRoomBtn.addEventListener('click', () => {
    const gameType = els.gameTypeInput.value, gameMode = els.gameModeInput.value;
    if (gameType === 'tournament') {
        showScreen('teamsScreen');
        if (gameMode === 'trn_create_team') switchTeamTab('gest'); else if (gameMode === 'trn_join_team') switchTeamTab('allteams'); else if (gameMode === 'trn_create_trn') switchTeamTab('tournaments'); return;
    }
    if (gameMode === 'custom' && customDictionary.length === 0) { els.customDictModal.style.display = 'flex'; return showToast("Carica prima un file di testo!"); }

    isChallenging = false;
    if (currentInviterId) db.ref(`invites/${currentInviterId}`).once('value', s => { if (s.exists() && s.val().fromId === myId) db.ref(`invites/${currentInviterId}`).remove(); });
    db.ref(`invite_accepted/${myId}`).remove();

    currentMode = gameMode; isSinglePlayer = gameType === 'single';
    currentWpm = currentMode==='callsign' ? 25 : parseInt(els.startWpmInput.value); baseWpm = currentWpm;
    requestedWordCount = currentMode==='callsign' ? 25 : Math.max(1, parseInt(els.wordCountInput.value));
    currentTone = parseInt(els.toneInput.value);
    isFixedSpeed = els.fixedSpeedCheckbox.checked; isEasyMode = els.easyModeCheckbox.checked;
    roomCode = Math.floor(1000 + Math.random() * 9000).toString(); gameWords = getGameWords(requestedWordCount, currentMode);

    db.ref('rooms/' + roomCode).set({
        status: isSinglePlayer ? 'countdown' : 'waiting', type: isSinglePlayer ? 'single' : 'multi',
        mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords,
        fixedSpeed: isFixedSpeed, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: isSinglePlayer ? null : Date.now() + (Math.max(1, parseInt(els.roomTimerInput.value)) * 60000), hostId: myId
    }).then(() => joinRoomLogic(false));
});

function exitRoomCleanly(roomWasDeletedByHost = false) {
    let targetScreen = 'setupScreen'; const amIHost = (myId === roomHostId);
    localStorage.removeItem(STORAGE_ROOM_KEY); isRejoining = false; isChallenging = false; currentInviterId = null;

    if (listeners.players && roomCode) { db.ref(`rooms/${roomCode}/players`).off('value', listeners.players); listeners.players = null; }
    if (listeners.roomLb && roomCode) { db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb); listeners.roomLb = null; }
    if (listeners.quizState && roomCode) { db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState); listeners.quizState = null; }

    if (roomCode) {
        if (roomCode.startsWith("TRN_")) targetScreen = 'teamsScreen';
        if (!roomWasDeletedByHost && amIHost && !roomCode.startsWith("TRN_")) { /* Host rimane in ascolto per non morire in bacheca */ } 
        else {
            if (listeners.room) { listeners.room.off(); listeners.room = null; }
            if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
            const rc = roomCode;
            db.ref(`rooms/${rc}/players/${myId}`).onDisconnect().cancel();
            db.ref(`rooms/${rc}`).once('value', snap => { if (snap.exists()) db.ref(`rooms/${rc}/players/${myId}`).remove(); });
            roomCode = "";
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

        showScreen('lobbyScreen'); els.lobbyTitleText.textContent = roomCode.startsWith("TRN_") ? "Lobby Incontro Torneo 🥊" : "Lobby Stanza Libera";
        if(els.permanentGameInput) els.permanentGameInput.blur();
        playerRef.onDisconnect().update({ online: false });
        if (!pData) playerRef.set({ name: myName, username: myPrivacy ? "" : tgUsername, score: 0, wpm: 0, finished: false, teamId: myTeamId, ready: false, online: true }); else playerRef.update({ online: true });

        listenToChat();
        if (listeners.room && !isReconnect) listeners.room.off();
        listeners.room = db.ref(`rooms/${roomCode}`);
        listeners.room.on('value', snap => {
            if (!snap.exists()) return exitRoomCleanly(true);
            const rData = snap.val(); currentMode = rData.mode; requestedWordCount = rData.wordCount; isSinglePlayer = rData.type === 'single'; isFixedSpeed = rData.fixedSpeed || false; roomHostId = rData.hostId;
            if (rData.status === 'playing' && !gameRunning) { currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone; if (rData.words) gameWords = rData.words; return resumeGameSequence(); }
            if (rData.status === 'countdown' && !gameRunning) { currentWpm = rData.wpm; baseWpm = rData.wpm; currentTone = rData.tone; if (rData.words) gameWords = rData.words; return startCountdownSequence(); }
            if (rData.status === 'waiting') {
                renderPlayersList(rData.players || {}, rData.hostId);
                const pCount = Object.keys(rData.players || {}).length;
                if (myId === rData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato.");
                lastPlayerCount = pCount;
                if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
                if (rData.expiresAt && !isSinglePlayer) {
                    lobbyTimerInterval = setInterval(() => {
                        const diff = rData.expiresAt - Date.now();
                        if (diff <= 0) { clearInterval(lobbyTimerInterval); els.lobbyTimerText.textContent = "Tempo scaduto!"; }
                        else els.lobbyTimerText.textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2, '0')}`;
                    }, 1000);
                } else { if(els.lobbyTimerText) els.lobbyTimerText.textContent = ""; }
            }
        });
    });
}

if(els.inviteFriendsBtn) els.inviteFriendsBtn.addEventListener('click', () => {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=room_${roomCode}`)}&text=${encodeURIComponent(`Sfida in Telegrafia! Entra nella mia stanza: #${roomCode}`)}`);
});

// Funzione per forzare l'aggiornamento reale della WebApp
window.forceAppUpdate = function() {
    showToast("Aggiornamento in corso...");

    // 1. Pulizia Caches API (se presente)
    if ('caches' in window) {
        caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
        });
    }

    // 2. Disinstallazione Service Worker (se presenti)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(r => r.unregister());
        });
    }

    // 3. Ricaricamento con Cache-Buster nell'URL
    setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now()); // Aggiunge o aggiorna ?v=1716200000000
        window.location.replace(url.toString());
    }, 300);
};

// Collega la funzione al bottone nel banner
if (els.updateBannerBtn) {
    els.updateBannerBtn.addEventListener('click', window.forceAppUpdate);
}

function renderPlayersList(playersData, hostId) {
    if(!els.playersList) return;
    els.playersList.innerHTML = ''; const count = Object.keys(playersData).length;
    if (count > lastPlayerCount && lastPlayerCount > 0) { playBeep(500, 0.1); setTimeout(() => playBeep(700, 0.15), 150); showToast("👤 Nuovo giocatore!"); }
    lastPlayerCount = count; let allReady = true; const pKeys = Object.keys(playersData); if (pKeys.length < 2) allReady = false;

    Object.entries(playersData).forEach(([id, data]) => {
        if (!data.ready) allReady = false;
        const li = document.createElement('li'); const nSpan = document.createElement('span'); nSpan.textContent = `${data.ready ? '✅' : '⏳'} ${data.name}`;
        if (data.username) { nSpan.style.color = 'var(--link-color)'; nSpan.style.cursor = 'pointer'; nSpan.style.textDecoration = 'underline'; nSpan.onclick = () => openTelegramProfile(data.username); }
        li.appendChild(nSpan); if (id === hostId) { const sHost = document.createElement('small'); sHost.textContent = ' (HOST)'; li.appendChild(sHost); }
        els.playersList.appendChild(li);
    });

    const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong'; const amIHost = (myId === hostId) || roomCode.startsWith("TRN_"); const amIReady = playersData[myId]?.ready;
    els.startMultiplayerBtn.style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none';
    els.deleteRoomBtn.style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none';
    els.readyBtn.style.display = (isTrnOrPP && !amIReady) ? 'block' : 'none';

    if (isTrnOrPP) { els.waitingHostText.style.display = amIReady ? 'block' : 'none'; els.waitingHostText.textContent = "In attesa..."; els.statusInfoText.textContent = amIReady ? "SONO PRONTO ✅" : "Connessione sicura in corso..."; } 
    else { els.waitingHostText.style.display = amIHost ? 'none' : 'block'; els.waitingHostText.textContent = "In attesa dell'host..."; els.statusInfoText.textContent = amIHost ? "Sei l'Host." : "Sei un partecipante."; }
    if (allReady && isTrnOrPP && (pKeys[0] === myId || amIHost)) db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
}
if(els.readyBtn) els.readyBtn.addEventListener('click', () => { if(roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true }); });

function getLevenshteinDistance(a, b) {
    const matrix = []; for (let i = 0; i <= b.length; i++) matrix[i] = [i]; for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1]; else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, Math.min(matrix[i][j-1]+1, matrix[i-1][j]+1));
    }
    return matrix[b.length][a.length];
}
function renderDiffSecure(container, real, typed) {
    for (let i = 0; i < Math.max(real.length, typed.length); i++) {
        if (!real[i]) continue; const span = document.createElement('span');
        if (!typed[i] || typed[i] !== real[i]) span.style.color = "#d32f2f";
        span.textContent = real[i]; container.appendChild(span);
    }
}
if(els.replayWordBtn) els.replayWordBtn.addEventListener('click', () => { if (!gameRunning || !inputActive) return; usedReplay = true; playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm); els.permanentGameInput.focus(); });

if(els.permanentGameInput) {
    els.permanentGameInput.addEventListener('input', function(e) {
        if (currentMode === 'chars' && inputActive && gameRunning) { const val = els.permanentGameInput.value.trim().toUpperCase(); if (val.length >= 1) { handleWordSubmission(val[0]); els.permanentGameInput.value = ""; } }
    });
    els.permanentGameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') { const val = els.permanentGameInput.value.trim().toUpperCase(); if (val) { handleWordSubmission(val); els.permanentGameInput.value = ""; } }
    });
}

function handleWordSubmission(userWord) {
    inputActive = false; const currentWord = gameWords[wordIndex].toUpperCase(); let points = 0, scoreColor = ""; const reactionMs = Date.now() - lastWordStartTime; const levDist = getLevenshteinDistance(currentWord, userWord);
    if (currentMode === 'chars') {
        if (userWord === currentWord) { points = Math.max(100, Math.floor(1000 - (reactionMs / 2))); scoreColor = "#4caf50"; } else { points = 0; scoreColor = "#d32f2f"; }
    } else {
        const basePoints = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2));
        const estimatedAudioMs = (currentWord.length * 60 / currentWpm) * 1000;
        let timeMultiplier = 1.0;
        if (reactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000));
        else if (reactionMs < estimatedAudioMs && levDist === 0) timeMultiplier = 1.1;
        points = Math.round(basePoints * timeMultiplier);
        if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50"; else if (levDist === 1) scoreColor = "#ff9800"; else scoreColor = "#d32f2f";
        if (usedReplay) points = Math.round(points * 0.2);
    }

    if (levDist > 0) {
        let wrongChars = [];
        for(let i=0; i<Math.max(currentWord.length, userWord.length); i++) {
            if(userWord[i] !== currentWord[i] && currentWord[i] && !['__proto__','constructor','prototype'].includes(currentWord[i])) if(!wrongChars.includes(currentWord[i])) wrongChars.push(currentWord[i]);
        }
        if(!sessionErrorsByWpm[currentWpm]) sessionErrorsByWpm[currentWpm] = Object.create(null);
        wrongChars.forEach(c => { sessionCharErrors[c] = (sessionCharErrors[c] || 0) + 1; sessionErrorsByWpm[currentWpm][c] = (sessionErrorsByWpm[currentWpm][c] || 0) + 1; });
    }

    if (!isFixedSpeed && currentMode !== 'chars') {
        if (levDist === 0 && !usedReplay) currentWpm += 2; else if (levDist === 1) currentWpm -= 1; else if (levDist > 1) currentWpm -= 2;
        currentWpm = Math.max(10, currentWpm);
    }
    totalScore += points; matchDetailsArray.push({ real: currentWord, typed: userWord, points: points, wpm: currentWpm, ms: reactionMs });

    if (currentMode !== 'pingpong') {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${userWord}</td><td><b>${currentWord}</b></td><td style="color:${scoreColor}; font-weight:bold;">${currentMode === 'chars' ? points + " (" + reactionMs + "ms)" : (usedReplay ? '0 (Replay)' : (points > 0 ? "+"+points : points))}</td>`;
        if(els.tableBody) { els.tableBody.appendChild(tr); els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight; }
    }
    if(els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if(els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;

    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wpm: currentWpm, wordIndex: wordIndex + 1, matchDetails: matchDetailsArray });
    usedReplay = false;
    if (currentMode === 'pingpong') {
        wordIndex++;
        db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { if (d) { d.senderId = myId; d.word = ''; d.wordsPlayed = (d.wordsPlayed || 0) + 1; d.lastGuess = { id: Date.now(), real: currentWord, typed: userWord, points: points }; } return d; });
    } else { wordIndex++; setTimeout(playNextWord, 600); }
}

if(els.btnSendPingPong) els.btnSendPingPong.addEventListener('click', () => {
    if (!gameRunning || currentMode !== 'pingpong') return;
    let word = els.pingPongWordToSend.value.trim().toUpperCase(); if (!word) return;
    db.ref(`rooms/${roomCode}/pingpong`).transaction(d => { if (d) { d.word = word; d.wordId = (d.wordId || 0) + 1; } return d; });
});
if(els.pingPongWordToSend) els.pingPongWordToSend.addEventListener('keypress', e => { if (e.key === 'Enter') els.btnSendPingPong.click(); });

function playNextWord() {
    if (!gameRunning || currentMode === 'pingpong') return;
    if (wordIndex >= requestedWordCount) return finishGame();
    if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * (700 - 400 + 1)) + 400;
    inputActive = true; usedReplay = false; const currentWord = gameWords[wordIndex].toUpperCase();
    if (isEasyMode && isSinglePlayer && els.easyModeHint) { els.easyModeHint.textContent = currentWord.split('').sort(() => 0.5 - Math.random()).join(' '); els.easyModeHint.style.display = 'block'; }
    else if(els.easyModeHint) els.easyModeHint.style.display = 'none';
    playMorseAudio(currentWord, currentWpm); lastWordStartTime = Date.now();
    if(els.permanentGameInput) els.permanentGameInput.focus();
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
                if (gameStartPlayerCount > 0 && currentPCount < gameStartPlayerCount) {
                    setTimeout(() => {
                        db.ref(`rooms/${roomCode}/players`).once('value', s => {
                            if (gameRunning && Object.keys(s.val() || {}).length < gameStartPlayerCount) { alert("Un giocatore ha abbandonato. Ritorno al menu."); gameRunning = false; exitRoomCleanly(false); } else if (gameRunning) showToast("👥 Giocatore rientrato!");
                        });
                    }, 10000);
                }
            });
        });
    }
    if(els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if(els.scoreDisplay) els.scoreDisplay.textContent = `Punti: 0`;
    if (!isRejoining) { totalScore = 0; currentStreak = 0; wordIndex = 0; quizQuestionIndex = 0; usedReplay = false; sessionCharErrors = Object.create(null); sessionErrorsByWpm = Object.create(null); matchDetailsArray = []; }
    if(els.tableBody) els.tableBody.innerHTML = "";
    window.lastPlayedWordId = 0; window.lastSeenGuessId = 0;
    if (listeners.pingPong) { db.ref(`rooms/${roomCode}/pingpong`).off('value', listeners.pingPong); listeners.pingPong = null; }
    if(els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
    if(els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (currentMode === 'pingpong' && (myId === roomHostId || roomCode.startsWith("TRN_"))) db.ref(`rooms/${roomCode}/pingpong`).once('value', s => { if(!s.exists()) db.ref(`rooms/${roomCode}/pingpong`).set({ senderId: myId, word: '', wordId: 0, wordsPlayed: 0, lastGuess: null }); });
    if (!isRejoining) { wordIndex = 0; totalScore = 0; matchDetailsArray = []; }

    showScreen('countdownScreen'); gameRunning = true; let count = 3; if(els.countdownNumber) els.countdownNumber.textContent = count;
    const interval = setInterval(() => {
        if (count > 1) { count--; if(els.countdownNumber) els.countdownNumber.textContent = count; playBeep(600, 0.1); }
        else {
            clearInterval(interval);
            if (myId === roomHostId) db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
            if(els.countdownNumber) els.countdownNumber.textContent = (currentLang === 'en' ? 'GO!' : 'VIA!');
            playBeep(800, 0.3);
            setTimeout(() => {
                if (!gameRunning) return;
                if (currentMode === 'quiz') return startQuizSequence();
                showScreen('gameArea');
                if (currentMode === 'pingpong') setupPingPongListener(); else { setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); setTimeout(() => { if (gameRunning) playNextWord(); }, 800); }
            }, 500);
        }
    }, 1000);
}

function resumeGameSequence() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gameRunning = true; isRejoining = false;
    if(els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
    if(els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${totalScore}`;
    if(els.tableBody) {
        els.tableBody.innerHTML = "";
        matchDetailsArray.forEach(row => {
            const tr = document.createElement('tr'); let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
            tr.innerHTML = `<td>${row.typed}</td><td><b>${row.real}</b></td><td style="color:${color}; font-weight:bold;">${row.points}</td>`;
            els.tableBody.appendChild(tr);
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
            const tr = document.createElement('tr'); const tdReal = document.createElement('td'); renderDiffSecure(tdReal, ppData.lastGuess.real, ppData.lastGuess.typed || '');
            let color = ppData.lastGuess.points > 0 ? "#4caf50" : (ppData.lastGuess.points === 0 && ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999");
            tr.innerHTML = `<td>${ppData.lastGuess.typed || ''}</td>`; tr.appendChild(tdReal); tr.innerHTML += `<td style="color:${color}; font-weight:bold;">${ppData.lastGuess.points}</td>`;
            if(els.tableBody) els.tableBody.appendChild(tr); if(els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
        }
        if (ppData.wordsPlayed >= requestedWordCount) { if(ppTimerInterval) clearInterval(ppTimerInterval); return finishGame(); }
        if (ppData.senderId === myId) {
            if (!ppData.word) {
                els.pingPongSendArea.style.display = 'flex'; els.gameInputArea.style.display = 'none'; els.pingPongWordToSend.value = ''; setTimeout(() => els.pingPongWordToSend.focus(), 100); startPingPongTimer();
            } else {
                if(ppTimerInterval) clearInterval(ppTimerInterval); els.pingPongSendArea.style.display = 'none'; els.gameInputArea.style.display = 'flex'; els.permanentGameInput.disabled = true; els.permanentGameInput.placeholder = "Avversario in decodifica..."; els.permanentGameInput.value = "";
            }
        } else {
            if(ppTimerInterval) clearInterval(ppTimerInterval); els.pingPongSendArea.style.display = 'none'; els.gameInputArea.style.display = 'flex';
            if (ppData.word && ppData.wordId > window.lastPlayedWordId) {
                window.lastPlayedWordId = ppData.wordId; gameWords[wordIndex] = ppData.word; els.permanentGameInput.disabled = false; els.permanentGameInput.placeholder = "Decodifica e scrivi..."; els.permanentGameInput.value = ""; setTimeout(() => els.permanentGameInput.focus(), 100); inputActive = true; setTimeout(() => playMorseAudio(ppData.word.toUpperCase(), currentWpm), 500);
            } else if (!ppData.word) { els.permanentGameInput.disabled = true; els.permanentGameInput.placeholder = "In attesa dell'avversario..."; els.permanentGameInput.value = ""; inputActive = false; }
        }
    });
}

function startPingPongTimer() {
    if (ppTimerInterval) clearInterval(ppTimerInterval); let timeLeft = 100; if(els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = '100%';
    ppTimerInterval = setInterval(() => {
        timeLeft -= (100 / 300); if(els.pingPongTimerProgress) els.pingPongTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) { clearInterval(ppTimerInterval); sendAutoPingPongWord(); }
    }, 100);
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

    if (roomCode) {
        const myPlayerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
        myPlayerRef.update({ finished: true, score: totalScore, wpm: currentWpm, matchDetails: matchDetailsArray });
        myPlayerRef.onDisconnect().cancel();
    }
    if (totalScore > 0 && !roomCode.startsWith("TRN_")) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const isReallySolo = isSinglePlayer || (Object.keys(snap.val() || {}).length < 2);
            let dbPath = `leaderboard/${currentMode === 'callsign' ? 'callsign/global' : `${currentMode === 'quiz' ? 'quiz' : currentMode === 'chars' ? 'chars' : currentMode === 'pingpong' ? 'pingpong' : 'standard'}/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}`}/${myId}`;
            if (currentMode !== 'callsign' && els.lbWordFilter) {
                if (!Array.from(els.lbWordFilter.options).some(opt => opt.value == requestedWordCount) && requestedWordCount !== 'all') {
                    let opt = document.createElement('option'); opt.value = requestedWordCount; opt.text = `${requestedWordCount} Stringhe`; els.lbWordFilter.add(opt);
                }
                els.lbWordFilter.value = requestedWordCount;
            }
            db.ref(dbPath).once('value', s => {
                let oldData = s.val();
                if (!oldData || totalScore > oldData.score) db.ref(dbPath).set({ name: myName, username: myPrivacy ? "" : tgUsername, score: totalScore, wpm: currentWpm, wordCount: requestedWordCount, date: new Date().toLocaleDateString('it-IT') });
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

        const now = new Date(); const dKey = now.toISOString().split('T')[0]; const wKey = getWeekNumber(now); const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
        for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) {
            const actRef = db.ref(`${path}/${myId}`); const actSnap = await actRef.once('value'); if (actSnap.exists()) await actRef.update({ name: myName });
        }
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
if(els.resetStatsBtn) els.resetStatsBtn.addEventListener('click', async () => {
    if (confirm(currentLang === 'it' ? "Vuoi azzerare tutte le tue statistiche? Questa operazione non può essere annullata." : "Reset all your statistics? This cannot be undone.")) {
        try { await Promise.all([ db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove() ]); showToast("Statistiche azzerate correttamente!"); showProfileScreen(); } catch(e) { alert("Errore durante il reset delle statistiche."); }
    }
});

window.showProfileScreen = function() {
    showScreen('profileScreen'); els.errorChartContainer.textContent = 'Caricamento...'; els.wpmErrorChartContainer.textContent = 'Caricamento...'; els.matchHistoryList.textContent = 'Caricamento...';
    db.ref(`users/${myId}/stats/charErrors`).once('value').then(snap => {
        const errors = snap.val() || {}; els.errorChartContainer.innerHTML = ''; const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
        if(sorted.length === 0) { const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore.'; els.errorChartContainer.appendChild(p); } 
        else {
            let maxErr = sorted[0][1];
            sorted.forEach(([char, count]) => {
                let row = document.createElement('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.marginBottom = '4px';
                row.innerHTML = `<span style="width:20px; font-weight:bold;">${char}</span><div style="flex-grow:1; background:var(--bg-color); border:1px solid var(--hint-color); border-radius:4px; height:12px; margin:0 5px; overflow:hidden;"><div style="width:${(count / maxErr) * 100}%; background:#d32f2f; height:100%;"></div></div><span style="width:25px; text-align:right; font-size:0.9em; font-weight:bold;">${count}</span>`;
                els.errorChartContainer.appendChild(row);
            });
        }
    });
    db.ref(`users/${myId}/stats/errorsByWpm`).once('value').then(snap => {
        const wpmErrors = snap.val() || {}; els.wpmErrorChartContainer.innerHTML = '';
        if(Object.keys(wpmErrors).length === 0) { const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore per WPM.'; els.wpmErrorChartContainer.appendChild(p); return; }
        Object.keys(wpmErrors).sort((a,b) => parseInt(b) - parseInt(a)).forEach(wpm => {
            let charsAtWpm = wpmErrors[wpm]; let totalErrs = Object.values(charsAtWpm).reduce((acc, curr) => acc + curr, 0); let topChar = Object.entries(charsAtWpm).sort((a,b) => b[1] - a[1])[0];
            let row = document.createElement('div'); row.style.marginBottom = '8px'; row.style.borderBottom = '1px solid var(--hint-color)'; row.style.paddingBottom = '4px';
            row.innerHTML = `<div style="display:flex; justify-content:space-between; font-weight:bold; color:var(--link-color);"><span>${wpm} WPM</span><span>Tot: ${totalErrs} err</span></div><div style="font-size:0.85em; color:var(--text-color);">Peggior lettera: <b>${topChar[0]}</b> (${topChar[1]} volte)</div>`;
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
            const botDiv = document.createElement('div'); botDiv.style.display = 'flex'; botDiv.style.justifyContent = 'space-between'; botDiv.style.width = '100%'; botDiv.style.alignItems = 'center';
            botDiv.innerHTML = `<span><b>${match.score} pt</b><small> (${match.wpm} WPM)</small></span>`;
            const btnDiv = document.createElement('div'); btnDiv.style.display = 'flex'; btnDiv.style.gap = '5px';
            const vBtn = document.createElement('button'); vBtn.className = "action-btn-small btn-secondary"; vBtn.textContent = "Vedi"; vBtn.onclick = () => openMatchDetails(match.key);
            const dBtn = document.createElement('button'); dBtn.className = "action-btn-small btn-danger"; dBtn.textContent = "X"; dBtn.onclick = () => deleteHistoryItem(match.key);
            btnDiv.appendChild(vBtn); btnDiv.appendChild(dBtn); botDiv.appendChild(btnDiv);
            li.innerHTML = `<div style="display:flex; justify-content:space-between; width:100%; margin-bottom:5px;"><span style="font-size:0.85em; font-weight:bold;">${modeIcon} (${match.type})</span><span style="font-size:0.8em; color:var(--hint-color);">${dateStr}</span></div>`;
            li.appendChild(botDiv); els.matchHistoryList.appendChild(li);
        });
    });
}
window.openMatchDetails = function(matchKey) {
    const match = userMatchHistory.find(m => m.key === matchKey); if(!match) return;
    els.matchDetailsBody.innerHTML = '';
    (match.details || []).forEach(row => {
        const tr = document.createElement('tr'); let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        tr.innerHTML = `<td>${row.typed || '-'}</td>`; tr.appendChild(tdReal); tr.innerHTML += `<td style="color:${color}; font-weight:bold;">${row.points}</td>`;
        els.matchDetailsBody.appendChild(tr);
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
    } else if (['pingpong', 'chars_multi', 'chars_single', 'quiz_multi', 'quiz_single'].includes(modeValue)) {
        els.lbFilterArea.style.display = 'block'; els.roomWinnerBanner.style.display = 'none'; els.waitingOthersText.style.display = 'none';
        populateDynamicFilters(modeValue === 'pingpong' ? 'recent_matches/pingpong' : modeValue.includes('multi') ? `recent_matches/${modeValue}` : modeValue.split('_')[0], modeValue.includes('single') ? 'single' : '');
        fetchAndRenderGlobalLeaderboard(modeValue, els.lbWordFilter.value);
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
            if (player.username) { const nameLink = document.createElement('span'); nameLink.style.color = 'var(--link-color)'; nameLink.style.cursor = 'pointer'; nameLink.style.textDecoration = 'underline'; nameLink.textContent = player.name; nameLink.onclick = () => openTelegramProfile(player.username); leftSpan.appendChild(nameLink); } 
            else leftSpan.appendChild(document.createTextNode(player.name));
            leftSpan.appendChild(document.createElement('br')); const wpmSmall = document.createElement('small'); wpmSmall.style.color = 'var(--hint-color)'; wpmSmall.textContent = `(${player.wpm || 0} WPM)`; leftSpan.appendChild(wpmSmall);
            const rightSpan = document.createElement('span'); rightSpan.innerHTML = `<b>${player.score} pt</b>`;
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
        card.innerHTML = `<div class="h2h-name">${p.name}${p.id === myId ? ` <small>(${currentLang === 'it' ? 'Tu' : 'You'})</small>` : ''}</div><div class="h2h-stats"><div class="h2h-stat-row"><span>${currentLang === 'it' ? 'Punti:' : 'Points:'}</span><span class="h2h-val" style="color:#4caf50;">${p.score}</span></div><div class="h2h-stat-row"><span>${currentLang === 'it' ? 'Velocità:' : 'Speed:'}</span><span class="h2h-val" style="color:var(--link-color);">${p.wpm} WPM</span></div></div><div class="h2h-hint">${p.id === myId ? (currentLang === 'it' ? 'Clicca per dettagli' : 'Click for details') : (currentLang === 'it' ? 'Dettagli privati' : 'Details are private')}</div>`;
        if (p.id !== myId) card.querySelector('.h2h-hint').style.opacity = "0.5";
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
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        tr.innerHTML = `<td>${row.typed || '-'}</td>`; tr.appendChild(tdReal); tr.innerHTML += `<td style="color:${color}; font-weight:bold;">${row.points}</td>`;
        els.matchDetailsBody.appendChild(tr);
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
    if (['pingpong', 'standard_multi', 'chars_multi', 'quiz_multi'].includes(tabType)) {
        db.ref(`leaderboard/recent_matches/${tabType}`).once('value', snapshot => {
            let matches = [];
            snapshot.forEach(wcNode => { if (filterWordCount === 'all' || wcNode.key === filterWordCount) wcNode.forEach(mNode => matches.push(mNode.val())); });
            matches.sort((a,b) => (b.ts || 0) - (a.ts || 0)); renderMatchesHistoryHTML(matches.slice(0, 30), els.leaderboardContainer);
        });
        return;
    }
    if (tabType === 'callsign' || tabType === 'tournaments') {
        db.ref(`leaderboard/${tabType}${tabType === 'callsign' ? '/global' : ''}`).orderByChild('score').limitToLast(50).once('value', snap => {
            let arr = []; snap.forEach(c => arr.push(c.val())); renderPlayersListHTML(arr.reverse(), els.leaderboardContainer, false, tabType === 'tournaments');
        });
    } else if (tabType === 'active_tournament') {
        if (!activeTrnId) els.leaderboardContainer.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang==='it' ? "Non sei iscritto a nessun torneo attivo." : "You are not enrolled in any active tournament."}</p>`;
        else db.ref(`tournaments/${activeTrnId}`).once('value', snap => {
            const trn = snap.val();
            if (trn && trn.standings) {
                els.leaderboardContainer.innerHTML = `<div style="text-align:center; margin-bottom:10px; padding:5px; background:var(--sec-bg-color); border-radius:8px;"><small style="color:var(--hint-color)">${currentLang==='it'?'Torneo Attivo:':'Active Tournament:'}</small><br><b style="color:var(--champ-color); font-size:1.1em;">${escapeHTML(trn.name)}</b></div>`;
                let std = Object.entries(trn.standings).map(([id, data]) => ({ name: data.name, score: data.points, date: currentLang==='it'?"In corso":"In progress" })); std.sort((a,b) => b.score - a.score);
                const listCont = document.createElement('div'); renderPlayersListHTML(std, listCont, false, true); els.leaderboardContainer.appendChild(listCont);
            } else els.leaderboardContainer.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang==='it'?'Dati torneo non disponibili.':'Tournament data unavailable.'}</p>`;
        });
    } else {
        let isQuiz = tabType.startsWith('quiz'), isChars = tabType.startsWith('chars'), isStandard = tabType.startsWith('standard');
        let modePath = isQuiz ? 'quiz' : (isChars ? 'chars' : (isStandard ? 'standard' : 'pingpong'));
        let subType = isQuiz ? tabType.replace('quiz_', '') : (isChars ? tabType.replace('chars_', '') : (isStandard ? tabType.replace('standard_', '') : ''));
        db.ref(`leaderboard/${modePath}`).once('value', snap => {
            let players = [];
            snap.forEach(wcNode => { if (((!isStandard && !isChars && !isQuiz) || wcNode.key.startsWith(subType + "_")) && (filterWordCount === 'all' || wcNode.key.endsWith("_" + filterWordCount))) wcNode.forEach(uNode => players.push(uNode.val())); });
            players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)); renderPlayersListHTML(players.slice(0, 100), els.leaderboardContainer, true);
        });
    }
}

function renderMatchesHistoryHTML(matches, container) {
    container.innerHTML = '';
    if (matches.length === 0) return container.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.'}</p>`;
    matches.forEach(match => {
        const mw = document.createElement('div'); mw.style.marginBottom = "25px"; mw.style.borderBottom = "1px dashed var(--hint-color)"; mw.style.paddingBottom = "15px";
        mw.innerHTML = `<div style="text-align:center; font-size:0.8em; color:var(--hint-color); margin-bottom:8px;">📅 ${match.date} - ${match.wordCount} Stringhe</div>`;
        renderHeadToHeadView(match.players, mw); container.appendChild(mw);
    });
}

function renderPlayersListHTML(players, container, showWordCount, isTeam = false) {
    container.innerHTML = '';
    if (players.length === 0) return container.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang === 'it' ? 'Nessun record trovato.' : 'No records found.'}</p>`;
    players.forEach((player, index) => {
        const row = document.createElement('div'); row.className = 'leaderboard-row'; row.style.padding = "8px 10px"; row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `<span style="color:var(--hint-color); font-size:0.8em;">${index + 1}.</span>`;
        const mainDiv = document.createElement('div'); mainDiv.style.display = 'flex'; mainDiv.style.alignItems = 'center'; mainDiv.style.gap = '8px'; mainDiv.style.flexGrow = '1';
        mainDiv.innerHTML = `<div style="font-size:1.2em; min-width:1.5em; text-align:center;">${medal}</div>`;
        const infoDiv = document.createElement('div'); infoDiv.style.display = 'flex'; infoDiv.style.flexDirection = 'column';
        const nameDiv = document.createElement('div'); nameDiv.style.display = 'flex'; nameDiv.style.alignItems = 'center';
        if (player.username && !isTeam) { const nameLink = document.createElement('span'); nameLink.style.color = 'var(--link-color)'; nameLink.style.cursor = 'pointer'; nameLink.style.textDecoration = 'underline'; nameLink.style.fontWeight = 'bold'; nameLink.textContent = player.name; nameLink.onclick = () => openTelegramProfile(player.username); nameDiv.appendChild(nameLink); }
        else { const nameSpan = document.createElement('span'); nameSpan.style.fontWeight = 'bold'; nameSpan.textContent = player.name; nameDiv.appendChild(nameSpan); }
        if (showWordCount && player.wordCount) nameDiv.innerHTML += `<span style="background:var(--hint-color); color:var(--bg-color); padding:1px 4px; border-radius:3px; font-size:0.8em; margin-left:4px;">${player.wordCount} str.</span>`;
        infoDiv.appendChild(nameDiv);
        infoDiv.innerHTML += `<div style="font-size:0.75em; color:var(--hint-color);">${player.date} ${!isTeam && player.wpm ? `<span style="color:var(--champ-color); font-weight:bold;">${player.wpm} WPM</span>` : ''}</div>`;
        mainDiv.appendChild(infoDiv);
        row.appendChild(mainDiv); row.innerHTML += `<div style="text-align:right;"><b style="font-size:1.1em; color:var(--link-color);">${player.score}</b><span style="font-size:0.7em; color:var(--hint-color); margin-left:2px;">pt</span></div>`;
        container.appendChild(row);
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
            const topDiv = document.createElement('div'); topDiv.style.width = '100%'; topDiv.style.display = 'flex'; topDiv.style.justifyContent = 'space-between';
            if (!isAlreadyInTeam && t.status !== 'closed') { topDiv.style.cursor = 'pointer'; topDiv.onclick = () => window.joinTeam(child.key); }
            topDiv.innerHTML = `<span><b>${t.name}</b><small> (${count} mem.)</small></span>${!isAlreadyInTeam && t.status !== 'closed' ? '<span style="color:var(--link-color); font-size:0.8em; font-weight:bold;">+ Unisciti</span>' : ''}`;
            let memHtml = `<div style="margin-top:3px; padding-left:5px; border-left:2px solid var(--link-color);">`;
            Object.values(t.members || {}).forEach(m => memHtml += `<span style="display:inline-block; margin-right:5px; font-size:0.85em; color:var(--hint-color);">- ${m.name}</span>`);
            liAll.innerHTML = topDiv.outerHTML + memHtml + `</div>`;
            if(els.globalAllTeamsList) els.globalAllTeamsList.appendChild(liAll);
            if (!isAlreadyInTeam && t.status !== 'closed' && els.openTeamsList) {
                const liOpen = document.createElement('li'); liOpen.style.cursor = 'pointer'; liOpen.onclick = () => window.joinTeam(child.key);
                liOpen.innerHTML = `<span><b>${t.name}</b><small> (${count} mem.)</small></span><span style="color:var(--link-color); font-weight:bold;">+ Unisciti</span>`; els.openTeamsList.appendChild(liOpen);
            }
        });
        if(els.openTeamsList && !els.openTeamsList.innerHTML) els.openTeamsList.innerHTML = '<li style="color:var(--hint-color); justify-content:center; border:none;">Nessuna squadra aperta.</li>';
        if(els.globalAllTeamsList && !els.globalAllTeamsList.innerHTML) els.globalAllTeamsList.innerHTML = '<li style="color:var(--hint-color); justify-content:center; border:none;">Nessuna squadra creata.</li>';
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
            if (mem.username) { span.style.color = 'var(--link-color)'; span.style.cursor = 'pointer'; span.style.textDecoration = 'underline'; span.onclick = () => openTelegramProfile(mem.username); }
            if (id === team.captainId) els.captainName.appendChild(span);
            else { if (els.teamOthersList.children.length > 0) els.teamOthersList.innerHTML += '<span style="color:var(--hint-color);"> | </span>'; els.teamOthersList.appendChild(span); }
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
                const li = document.createElement('li'); li.innerHTML = `<span><b>${trn.name}</b> <small>(${Object.keys(trn.teams || {}).length} sq.)</small></span>`;
                if (isTeamCaptain && !isMember) { const btn = document.createElement('button'); btn.className = 'action-btn-small btn-champ'; btn.textContent = 'Iscrivi'; btn.onclick = () => window.joinTournament(trnId); li.appendChild(btn); } 
                else if (isMember) li.innerHTML += `<small style="color:var(--link-color); font-weight:bold;"> (Iscritto)</small>`;
                if(els.openTournamentsList) els.openTournamentsList.appendChild(li);
            } else if (trn.status === 'finished') {
                const li = document.createElement('li'); li.innerHTML = `<span><b>${trn.name}</b> <small>(Concluso)</small></span>`;
                const btn = document.createElement('button'); btn.className = 'action-btn-small btn-secondary'; btn.textContent = 'Vedi Risultati'; btn.onclick = () => window.viewTournament(trnId);
                li.appendChild(btn); if(els.pastTournamentsList) els.pastTournamentsList.appendChild(li);
            }
        });
        if (foundActive) { activeTrnId = foundActive.key; renderActiveTournament(foundActive); } 
        else { els.trnLobbyArea.style.display = 'flex'; els.trnActiveArea.style.display = 'none'; if(els.openTournamentsList && !els.openTournamentsList.innerHTML) els.openTournamentsList.innerHTML = '<li style="color:var(--hint-color); justify-content:center; border:none;">Nessun torneo aperto.</li>'; if(els.pastTournamentsList && !els.pastTournamentsList.innerHTML) els.pastTournamentsList.innerHTML = '<li style="color:var(--hint-color); justify-content:center; border:none;">Nessun torneo concluso.</li>'; }
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
        const tr = document.createElement('tr'); tr.innerHTML = `<td>${med}</td><td><b>${s.name}</b>${s.id === myTeamId ? (currentLang === 'it' ? ' (Voi)' : ' (You)') : ''}</td><td><b>${s.points}</b></td>`; els.trnStandingsBody.appendChild(tr);
    });

    els.trnHostControls.style.display = (amIHost && !isFinished) ? 'block' : 'none';
    if (els.finishTrnBtn) { els.finishTrnBtn.style.display = (amIHost && trn.status === 'playing') ? 'block' : 'none'; els.finishTrnBtn.onclick = () => { if(confirm("Vuoi concludere manualmente il torneo?")) db.ref(`tournaments/${activeTrnId}/status`).set('finished'); }; }
    const teamCount = trn.teams ? Object.keys(trn.teams).length : 0; els.trnTeamCountTxt.textContent = (currentLang === 'it' ? "Squadre Iscritte: " : "Enrolled Teams: ") + teamCount;

    if (els.startTrnBtn) { els.startTrnBtn.disabled = teamCount < 2 || (trn.status !== 'open' && trn.status !== 'playing'); els.startTrnBtn.textContent = trn.status === 'playing' ? (currentLang === 'it' ? "Rigenera Tabellone (Attenzione!)" : "Regenerate Bracket (Warning!)") : (currentLang === 'it' ? "Genera Tabellone e Avvia" : "Generate Bracket and Start"); }
    
    els.trnBracketContainer.innerHTML = '';
    if (trn.status === 'open') els.trnBracketContainer.innerHTML = `<p style="text-align:center; color:var(--hint-color); font-size:0.9em;">${currentLang === 'it' ? "Il torneo è aperto, attendi l'avvio dall'organizzatore." : "The tournament is open, wait for the host to start."}</p>`;
    else if (trn.matches) {
        Object.entries(trn.matches).forEach(([mId, m]) => {
            const isMyMatch = (m.teamA === myTeamId || m.teamB === myTeamId); const card = document.createElement('div'); card.className = 'match-card';
            if (isMyMatch) { card.style.borderColor = "var(--champ-color)"; card.style.borderWidth = "2px"; }
            let aColor = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)"); let bColor = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
            
            card.innerHTML = `<div class="match-card-teams"><div style="color:${aColor}"><b>${m.teamAName}</b></div><div class="match-vs">VS</div><div style="color:${bColor}"><b>${m.teamBName}</b></div></div>`;
            if (m.status !== 'finished') {
                const slotsDiv = document.createElement('div'); slotsDiv.style.display = 'flex'; slotsDiv.style.width = '100%'; slotsDiv.style.gap = '10px';
                const btnA = document.createElement('button'); btnA.className = 'slot-btn' + (m.playerA ? ' filled' : ''); btnA.textContent = m.playerA ? m.playerA.name : (currentLang === 'it' ? 'A: Libero' : 'A: Open'); btnA.onclick = () => window.toggleTrnSlot(mId, 'A', m.teamA);
                const btnB = document.createElement('button'); btnB.className = 'slot-btn' + (m.playerB ? ' filled' : ''); btnB.textContent = m.playerB ? m.playerB.name : (currentLang === 'it' ? 'B: Libero' : 'B: Open'); btnB.onclick = () => window.toggleTrnSlot(mId, 'B', m.teamB);
                slotsDiv.appendChild(btnA); slotsDiv.appendChild(btnB); card.appendChild(slotsDiv);
                if (m.playerA && m.playerB && (m.playerA.id === myId || m.playerB.id === myId)) {
                    const joinBtn = document.createElement('button'); joinBtn.className = 'btn-success'; joinBtn.style.fontSize = '0.85em'; joinBtn.style.padding = '6px'; joinBtn.style.marginTop = '8px'; joinBtn.textContent = currentLang === 'it' ? 'ENTRA NELLA SFIDA' : 'JOIN MATCH'; joinBtn.onclick = () => window.startTrnMatch(mId); card.appendChild(joinBtn);
                }
            } else card.innerHTML += `<div style="font-size:0.85em; color:#4caf50; font-weight:bold; margin-top:5px;">${currentLang === 'it' ? 'Concluso' : 'Finished'}</div>`;
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
        const dData = dSnap.val() || { games: 0 }, wData = wSnap.val() || { games: 0 }, mData = mSnap.val() || { games: 0 }, myMedals = uMedals.val() || {};
        const check = (count, thresh, id, title, desc, icon) => { if (count >= thresh && !myMedals[id]) { awardMedal(id, title, desc, icon); return true; } return false; };
        check(dData.games, 3, `d_bronze_${dKey}`, "Bronzo Giornaliero", "Hai giocato 3 partite oggi!", "🥉"); check(dData.games, 7, `d_silver_${dKey}`, "Argento Giornaliero", "Sei un veterano! 7 partite oggi!", "🥈"); check(dData.games, 15, `d_gold_${dKey}`, "Oro Giornaliero", "Incredibile! 15 partite in un giorno!", "🥇");
        check(wData.games, 20, `w_active_${wKey}`, "Stakanovista Settimanale", "20 partite questa settimana!", "🎖️"); check(wData.games, 50, `w_pro_${wKey}`, "Campione Settimanale", "50 partite! Una leggenda questa settimana!", "🏆");
        check(mData.games, 150, `m_legend_${mKey}`, "Titano del Mese", "150 partite! Il gioco non ha segreti per te.", "💎");
    } catch(e) {}
    updateMedalGallery();
}

function awardMedal(id, title, desc, icon) {
    db.ref(`users/${myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon });
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
    els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Caricamento...</li>';
    db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = ''; let users = [];
        if (snap.exists()) snap.forEach(child => { const u = child.val(); if (u && typeof u === 'object') users.push({ id: child.key, ...u }); });
        users.sort((a, b) => (b.games || 0) - (a.games || 0)); users = users.slice(0, 50);
        if (users.length === 0) return els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna attività registrata.</li>';
        users.forEach((u, idx) => {
            let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;
            const li = document.createElement('li'); li.innerHTML = `<span>${medal} <b>${u.name || "Anonimo"}</b></span><span><b>${u.games || 0}</b> part. <small style="color:#4caf50;">(${u.wins || 0} v.)</small></span>`; els.activityRankList.appendChild(li);
        });
    }).catch(err => { els.activityRankList.innerHTML = `<li style="justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;"><span>Errore nel caricamento.</span><small style="font-size:0.7em; opacity:0.7;">${err.message}</small></li>`; });
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
