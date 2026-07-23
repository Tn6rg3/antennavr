const BOT_USERNAME = "cwappgame_bot";
    const WEBAPP_NAME = "cwgame";
    const APP_VERSION = "20240520.99"; // Versione aggiornata

    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();

    const tg = window.Telegram.WebApp;
    const tgUser = tg.initDataUnsafe?.user;
    const tgUsername = tgUser?.username || "";
    const startParam = tg.initDataUnsafe?.start_param;

    function escapeHTML(str) {
        if (!str && str !== 0) return "";
        return String(str).replace(/[&<>'"]/g, function (match) {
            const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
            return escapeMap[match];
        });
    }

    let myName, myId, myPrivacy = false;
    let db, auth;
    let currentRoomListener = null, chatListener = null, pingPongListener = null, gamePlayersListener = null;
    let roomLeaderboardListener = null;
    let presenceListener = null, invitesListener = null, inviteAcceptedListener = null, outgoingInviteListener = null;
    let roomCode = "", lastPlayerCount = 0, lobbyTimerInterval = null, roomHostId = null, gameStartPlayerCount = 0;
    let activeChatContext = null;
    let currentInviterId = null;
    let isChallenging = false;
    let isRejoining = false;

    const STORAGE_ROOM_KEY = "cwgame_last_room";

    // --- VARIABILI SQUADRE E TORNEI ---
    let myTeamId = null, isTeamCaptain = false;
    let teamListener = null, allTeamsListener = null;
    let activeTrnId = null, trnListener = null;
    let myTeamName = "";

    let masterDictionary = [];
    let itDictionary = [], enDictionary = [];

    async function loadDictionaries() {
    await Promise.all([
        fetchDictionary("parole.txt", 'it'),
        fetchDictionary("words.txt", 'en')
    ]);
    updateDictionary();
}

async function loadRegolamento() {
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error("Errore nel caricamento del file");
        const htmlTesto = await response.text();
        document.getElementById('regolamentoContainer').innerHTML = htmlTesto;

        // Ricolleghiamo il bottone feedback che ora è nel file esterno
        const btnFeedback = document.getElementById('sendFeedbackBtn');
        if (btnFeedback) {
            btnFeedback.onclick = function() {
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
        document.getElementById('regolamentoContainer').innerHTML = "<p style='color:red; text-align:center;'>Impossibile caricare il regolamento.</p>";
        console.warn("Errore caricamento regolamento:", e);
    }
}
    async function fetchDictionary(url, lang) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("GitHub offline");
            const text = await resp.text();
            const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(l => l.length > 2);
            if (lang === 'it') itDictionary = lines;
            else enDictionary = lines;
        } catch(e) {
            console.warn(`Errore dizionario ${lang}:`, e.message);
            // Backup statico se fallisce
            if (lang === 'it') itDictionary = ["abbandono", "amicizia", "antenna", "battaglia", "bellezza", "calcolo", "canzone", "coraggio", "destino", "energia", "fiducia", "geografia", "illusione", "linguaggio", "mistero", "natura", "obiettivo", "passione", "rispetto", "scienza", "universo", "viaggio", "vittoria"];
            else enDictionary = ["abandon", "friendship", "antenna", "battle", "beauty", "calculation", "song", "courage", "destiny", "energy", "trust", "geography", "illusion", "language", "mystery", "nature", "objective", "passion", "respect", "science", "universe", "journey", "victory"];
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
    let audioCtx, inputActive = false, gameRunning = false, activeTab = "room";
    let isSinglePlayer = false, currentMode = "standard", requestedWordCount = 10;
    let isFixedSpeed = false, isEasyMode = false;
    let usedReplay = false;
    let matchDetailsArray = [];
    let currentLang = 'it';
    let lastWordStartTime = 0; // Per calcolo ms in modalità caratteri

    window.lastPlayedWordId = 0;
    window.lastSeenGuessId = 0;

    let sessionCharErrors = Object.create(null);
    let sessionErrorsByWpm = Object.create(null);

    window.openTelegramProfile = function(username) {
        if (username) tg.openTelegramLink('https://t.me/' + username);
        else tg.showAlert("Questo utente non ha impostato un Username pubblico su Telegram.");
    }

    function showToast(message) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
    }

    if (!tgUser) {
        document.getElementById('loadingScreen').classList.remove('active-screen');
        document.getElementById('errorScreen').classList.add('active-screen');
    } else {
        myName = tgUser.first_name; myId = tgUser.id.toString(); initGame();
    }

    let quizTimerInterval = null, currentQuizQuestion = null, quizActiveBuzzerId = null;
    let quizQuestionIndex = 0;
    let randomizedQuizQuestions = [];

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
        const screenEl = document.getElementById(screenId);
        if (screenEl) screenEl.classList.add('active-screen');

        hideChat();
        document.getElementById('matchDetailsModal').style.display = 'none';

        // Interrompi audio se cambiamo schermata (es. abbandono)
        if (audioCtx && audioCtx.state === 'running') {
            // audioCtx.suspend(); // Sospende, ma meglio gameRunning per playMorseAudio
        }

        // Aggiornamento Presenza in tempo reale basato sulla schermata attiva
        if (db && myId) {
            const isPlayingScreen = (screenId === 'lobbyScreen' || screenId === 'gameArea' || screenId === 'countdownScreen' || screenId === 'quizArea');
            db.ref(`presence/${myId}`).update({ status: isPlayingScreen ? 'playing' : 'online' });
        }

        if (screenId === 'setupScreen') {
            // Se torniamo al menu, ricontrolliamo se mostrare il tasto rejoining
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (!lastRoom) document.getElementById('rejoinContainer').style.display = 'none';
        }

        if(screenId === 'teamsScreen') { activeChatContext = 'team'; checkMyTeamStatus(); }
        else if (screenId === 'lobbyScreen' || screenId === 'gameArea') { activeChatContext = 'room'; listenToChat(); }
        else if (screenId === 'participationScreen') { switchActTab('daily'); activeChatContext = null; }
        else {
            activeChatContext = 'global';
            listenToChat();
        }
    }

    window.goBackToMenu = function() {
        if(activeChatContext !== 'team') hideChat();
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
            // Caricamento Alias e Privacy
            try {
                const userSnap = await db.ref(`users/${myId}`).once('value');
                const userData = userSnap.val() || {};
                if (userData.alias) myName = userData.alias;
                myPrivacy = userData.privacyUsername || false;

                document.getElementById('privacyUsernameCheckbox').checked = myPrivacy;
            } catch(e) { console.error("Errore caricamento dati utente:", e); }

            document.getElementById('playerName').textContent = myName;
            document.getElementById('userAliasInput').value = (myName !== tgUser.first_name) ? myName : "";

            document.getElementById('loadingText').style.display = 'none';
            document.getElementById('createRoomBtn').disabled = false;

            db.ref('.info/connected').on('value', (snap) => {
                if (snap.val() === false) return;

                // Sistema di Presenza
                const pRef = db.ref(`presence/${myId}`);
                const currentUsername = myPrivacy ? "" : tgUsername;
                pRef.onDisconnect().remove();
                pRef.set({ name: myName, username: currentUsername, status: 'online', ts: firebase.database.ServerValue.TIMESTAMP });

                if (roomCode) joinRoomLogic(true);
            });

            if (startParam) {
                if (startParam.startsWith('team_')) { processTeamInvite(startParam.replace('team_', '')); }
                else if (startParam.startsWith('room_')) { window.joinSpecificRoom(startParam.replace('room_', '')); }
            } else {
                const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
                if (lastRoom) {
                    db.ref(`rooms/${lastRoom}`).once('value', snap => {
                        if (snap.exists() && snap.val().status !== 'finished') {
                            roomCode = lastRoom;
                            document.getElementById('rejoinContainer').style.display = 'block';
                            document.getElementById('rejoinGameBtn').onclick = () => {
                                isRejoining = true;
                                joinRoomLogic(false);
                            };
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

            // Caricamento dizionari e lingua
            const savedLang = localStorage.getItem('gameLang');
            if (savedLang) setLanguage(savedLang);
            loadDictionaries();

            // Controlla attività e premia medaglie DOPO aver mostrato il menu
            checkActivityAndAwardMedals();

            // Mostra il pop-up dei tornei se non disattivato
            checkTournamentPopup();

            listenToRooms();
            listenToOnlineUsers();
            listenToInvites();
            listenToInviteAccepted();

            // CARICA IL REGOLAMENTO
            loadRegolamento();

            // MOSTRA VERSIONE IN UI
            const vDisp = document.getElementById('appVersionDisplay');
            if(vDisp) vDisp.textContent = "v" + APP_VERSION;

            const vFoot = document.getElementById('appVersionFooter');
            if(vFoot) vFoot.textContent = APP_VERSION;

            // GESTIONE AGGIORNAMENTI APP
            console.log("Controllo aggiornamenti... Versione Locale:", APP_VERSION);
            db.ref('appConfig/latestVersion').on('value', snap => {
                const latest = snap.val();
                console.log("Versione su Firebase:", latest);
                if (latest && String(latest).trim() !== String(APP_VERSION).trim()) {
                    document.getElementById('updateBanner').style.display = 'block';
                } else {
                    document.getElementById('updateBanner').style.display = 'none';
                }
            });

        }).catch(e => {
            const loadingText = document.getElementById('loadingText');
            if (loadingText) {
                loadingText.textContent = "Errore di Connessione.";
                loadingText.style.color = "red";
                loadingText.style.fontWeight = "bold";
            }
        });

        checkGameTypeUI();
    }

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

            const totalDurationMs = (time - audioCtx.currentTime) * 1000;
            setTimeout(resolve, totalDurationMs);
        });
    }

    let activeChatListeners = {};

    window.toggleChat = function() {
        const drawer = document.getElementById('chatDrawer');
        if (drawer.style.display === 'none') {
            drawer.style.display = 'flex'; isChatDrawerOpen = true;
            document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
        } else { drawer.style.display = 'none'; isChatDrawerOpen = false; }
    }

    function hideChat() {
        document.getElementById('chatDrawer').style.display = 'none';
        isChatDrawerOpen = false;

        // Pulizia automatica dei listener quando nascondi la chat
        Object.keys(activeChatListeners).forEach(key => {
            activeChatListeners[key].ref.off('value', activeChatListeners[key].callback);
            delete activeChatListeners[key];
        });
    }

    function listenToChat() {
        if (activeChatContext === 'room' && roomCode) {
            setupChat(db.ref(`rooms/${roomCode}/chat`), 'lobbyChatMessages', null);
            setupChat(db.ref(`rooms/${roomCode}/chat`), 'chatMessages', null);
            document.getElementById('chatTitle').textContent = "💬 Chat Stanza";

            if (document.getElementById('gameArea').classList.contains('active-screen')) {
                // Di default la chat è chiusa in partita per non coprire l'input
                const drawer = document.getElementById('chatDrawer');
                drawer.style.display = 'none';
                isChatDrawerOpen = false;
            }
        } else {
            // Chat Globale
            setupChat(db.ref('globalChat'), 'chatMessages', null);
            document.getElementById('chatTitle').textContent = "🌎 Chat Globale";
        }
    }

    window.openGlobalChat = function() {
        activeChatContext = 'global';
        listenToChat();
        toggleChat();
    }

    document.getElementById('sendLobbyChatBtn').addEventListener('click', () => {
        const input = document.getElementById('lobbyChatInput');
        const txt = input.value.trim(); if (!txt || !roomCode) return;

        const msgRef = db.ref(`rooms/${roomCode}/chat`).push();
        msgRef.onDisconnect().remove(); // Cancella automaticamente alla disconnessione

        msgRef.set({ name: myName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        input.value = '';
    });
    document.getElementById('lobbyChatInput').addEventListener('keypress', function(e) { if (e.key === 'Enter') document.getElementById('sendLobbyChatBtn').click(); });

    function setupChat(chatRef, containerId, alertBtnId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Se c'era già un listener per QUESTO specifico box (es. il drawer o la lobby), staccalo per evitare cloni
        if (activeChatListeners[containerId]) {
            activeChatListeners[containerId].ref.off('value', activeChatListeners[containerId].callback);
        }

        let initialLoad = true;
        let lastTs = Date.now();

        const callback = chatRef.limitToLast(40).on('value', snapshot => {
            container.innerHTML = '';
            let newMsgsCount = 0;
            let latestMsg = null;
            let maxTs = lastTs;

            snapshot.forEach(child => {
                const msg = child.val();
                const div = document.createElement('div');
                div.style.marginBottom = '6px';

                if(msg.ts) {
                    const d = new Date(msg.ts);
                    const dateSmall = document.createElement('small');
                    dateSmall.style.color = 'var(--hint-color)';
                    dateSmall.style.fontSize = '0.75em';
                    dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}] `;
                    div.appendChild(dateSmall);
                    if(msg.ts > maxTs) maxTs = msg.ts;
                }

                const nameB = document.createElement('b');
                nameB.style.color = 'var(--link-color)';
                nameB.textContent = msg.name + ":";
                div.appendChild(nameB);

                div.appendChild(document.createTextNode(" " + msg.text));
                container.appendChild(div);

                if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== myName) {
                    newMsgsCount++; latestMsg = msg;
                }
            });

            lastTs = maxTs;
            container.scrollTop = container.scrollHeight;

            // Notifiche (solo se il drawer è chiuso)
            if (!initialLoad && newMsgsCount > 0 && alertBtnId && !isChatDrawerOpen) {
                showToast(`💬 Nuovo messaggio da ${latestMsg.name}`);
                const btn = document.getElementById(alertBtnId);
                if (btn) btn.style.backgroundColor = '#4caf50';
            }

            // Notifica globale per messaggi in stanza se siamo l'host e siamo fuori
            if (!initialLoad && newMsgsCount > 0 && roomHostId === myId && activeChatContext !== 'room' && chatRef.key !== 'globalChat') {
                if (latestMsg) showToast(`📢 (Stanza) ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
            }

            // Notifica per messaggi globali se siamo in una stanza
            if (!initialLoad && newMsgsCount > 0 && activeChatContext === 'room' && chatRef.key === 'globalChat') {
                if (latestMsg) showToast(`🌎 (Global) ${latestMsg.name}: ${latestMsg.text.substring(0,25)}...`);
            }
            initialLoad = false;
        });

        // Salva il riferimento per poterlo rimuovere correttamente
        activeChatListeners[containerId] = { ref: chatRef, callback: callback };
    }

    document.getElementById('sendChatBtn').addEventListener('click', () => {
        const txt = document.getElementById('chatInput').value.trim(); if (!txt) return;
        const currentUsername = myPrivacy ? "" : tgUsername;

        let msgRef;
        if (activeChatContext === 'room' && roomCode) {
            msgRef = db.ref(`rooms/${roomCode}/chat`).push();
        } else {
            msgRef = db.ref('globalChat').push();
        }

        msgRef.onDisconnect().remove(); // Cancella automaticamente alla disconnessione

        msgRef.set({ name: myName, username: currentUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        document.getElementById('chatInput').value = '';
    });
    document.getElementById('chatInput').addEventListener('keypress', function (e) { if (e.key === 'Enter') document.getElementById('sendChatBtn').click(); });

    document.getElementById('clearChatBtn').addEventListener('click', () => {
        if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat?')) {
            if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove();
            else db.ref('globalChat').remove();
        }
    });

    function checkGameTypeUI() {
        const typeSelect = document.getElementById('gameTypeInput');
        const modeSelect = document.getElementById('gameModeInput');
        const type = typeSelect.value;
        const isSingle = type === 'single';
        const isTrn = type === 'tournament';

        document.getElementById('timeoutDiv').style.display = isSingle || isTrn ? 'none' : 'block';
        document.getElementById('fixedSpeedContainer').style.display = isSingle ? 'flex' : 'none';
        document.getElementById('easyModeContainer').style.display = isSingle ? 'flex' : 'none';

        // --- LOGICA FILTRO DINAMICO OPZIONI ---
        const gameModes = modeSelect.querySelectorAll('option:not([value^="trn_"])');
        const trnGroup = document.getElementById('trn_opt_group');
        const trnModes = trnGroup ? trnGroup.querySelectorAll('option') : [];

        if (isTrn) {
            // Mostra solo opzioni Torneo
            gameModes.forEach(opt => { opt.style.display = 'none'; opt.disabled = true; });
            if (trnGroup) trnGroup.style.display = 'block';
            trnModes.forEach(opt => { opt.style.display = 'block'; opt.disabled = false; });

            // Forza la selezione su un'opzione valida per il torneo se quella attuale è sparita
            if (!modeSelect.value.startsWith('trn_')) {
                modeSelect.value = 'trn_join_team';
            }
            document.getElementById('createRoomBtn').textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
        } else {
            // Mostra solo opzioni Gioco
            gameModes.forEach(opt => { opt.style.display = 'block'; opt.disabled = false; });
            if (trnGroup) trnGroup.style.display = 'none';
            trnModes.forEach(opt => { opt.style.display = 'none'; opt.disabled = true; });

            // Forza la selezione su un'opzione valida per il gioco se quella attuale era un'opzione torneo
            if (modeSelect.value.startsWith('trn_')) {
                modeSelect.value = 'standard';
            }
            document.getElementById('createRoomBtn').textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
        }

        if(!isSingle) {
            document.getElementById('fixedSpeedCheckbox').checked = false;
            document.getElementById('easyModeCheckbox').checked = false;
        }
    }

    const i18n = {
        it: {
            hello: "Ciao", lb: "Classifica", profile: "Profilo", activity: "Attività", conn_secure: "Connessione sicura in corso...",
            free_challenge: "⚡ Sfida Libera", play_solo: "Gioca da Solo o Sfida un Amico",
            game_type: "Tipo di Gioco:", mode: "Modalità:", wpm: "WPM:", words: "Parole:", tone: "Tono:", timeout: "Scadenza Stanza (min):",
            opt_multi: "Multiplayer (con Lobby)", opt_single: "Singleplayer (Immediata)",
            opt_std: "Parole Comuni", opt_call: "Nominativi (CW Freak)", opt_pp: "Ping Pong",
            fixed: "Fissa", easy: "Semplice", create_room: "Inizia Partita Libera", play_now: "Gioca Subito",
            challenge_board: "Bacheca Sfide ⏳", no_challenges: "Nessuna sfida.",
            online_users: "Utenti Online 🟢", global_chat: "💬 Chat", you_are_alone: "Sei solo.",
            profile_title: "👤 Profilo e Statistiche", alias_label: "Il tuo Alias", save: "Salva", alias_hint: "L'alias sostituirà il tuo nome Telegram nelle classifiche e nelle squadre.",
            privacy_label: "Nascondi mio username Telegram", privacy_hint: "Se attivo, nessuno potrà cliccare sul tuo nome per vedere il tuo profilo. L'Alias diventa obbligatorio.",
            wrong_chars: "📈 Caratteri più sbagliati", wpm_error: "⚠️ Errori per WPM", match_history: "📜 Storico Partite", loading: "Caricamento...",
            back_to_menu: "Torna al Menu Principale",
            daily: "Oggi", weekly: "Settimana", monthly: "Mese", medals: "Le Mie Medaglie",
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
            tab_my_team: "La mia Squadra", tab_all_teams: "Tutte le Squadre", tab_tournaments: "I Tornei"
        },
        en: {
            hello: "Hello", lb: "Leaderboard", profile: "Profile", activity: "Activity", conn_secure: "Secure connection in progress...",
            free_challenge: "⚡ Free Challenge", play_solo: "Play Solo or Challenge a Friend",
            game_type: "Game Type:", mode: "Mode:", wpm: "WPM:", words: "Words:", tone: "Tone:", timeout: "Room Timeout (min):",
            opt_multi: "Multiplayer (Lobby)", opt_single: "Singleplayer (Immediate)",
            opt_std: "Common Words", opt_call: "Callsigns (CW Freak)", opt_pp: "Ping Pong",
            fixed: "Fixed", easy: "Easy", create_room: "Start Free Match", play_now: "Play Now",
            challenge_board: "Challenge Board ⏳", no_challenges: "No challenges.",
            online_users: "Online Users 🟢", global_chat: "💬 Chat", you_are_alone: "You are alone.",
            profile_title: "👤 Profile and Statistics", alias_label: "Your Alias", save: "Save", alias_hint: "The alias will replace your Telegram name in leaderboards and teams.",
            privacy_label: "Hide my Telegram username", privacy_hint: "If active, no one can click your name to see your profile. Alias becomes mandatory.",
            wrong_chars: "📈 Most Mistaken Characters", wpm_error: "⚠️ Errors per WPM", match_history: "📜 Match History", loading: "Loading...",
            back_to_menu: "Back to Main Menu",
            daily: "Today", weekly: "Week", monthly: "Month", medals: "My Medals",
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
            tab_my_team: "My Team", tab_all_teams: "All Teams", tab_tournaments: "Tournaments"
        }
    };

    window.toggleLanguage = function() {
        const newLang = (currentLang === 'it') ? 'en' : 'it';
        setLanguage(newLang);
        updateDictionary();
        showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English");
    }

    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('gameLang', lang);
        const t = i18n[lang];
        document.getElementById('langBtn').textContent = lang.toUpperCase();

        // Leaderboard Dropdown translations
        const lb_room = document.getElementById('opt_lb_room');
        const lb_trn = document.getElementById('opt_lb_trn');
        const lb_call = document.getElementById('opt_lb_call');
        const lb_pp = document.getElementById('opt_lb_pp');
        const lb_multi = document.getElementById('opt_lb_multi');
        const lb_single = document.getElementById('opt_lb_single');
        const lb_chars_multi = document.getElementById('opt_lb_chars_multi');
        const lb_chars_single = document.getElementById('opt_lb_chars_single');
        const lb_quiz_multi = document.getElementById('opt_lb_quiz_multi');
        const lb_quiz_single = document.getElementById('opt_lb_quiz_single');

        if(lb_room) lb_room.textContent = t.tab_this_match;
        if(lb_trn) lb_trn.textContent = t.tab_trn_lb;
        if(lb_call) lb_call.textContent = t.tab_callsigns;
        if(lb_pp) lb_pp.textContent = t.tab_pingpong + " (" + (lang==='it'?'Sfide':'Challenges') + ")";
        if(lb_multi) lb_multi.textContent = t.tab_std_multi + " (" + (lang==='it'?'Sfide':'Challenges') + ")";
        if(lb_single) lb_single.textContent = t.tab_std_single;
        if(lb_chars_multi) lb_chars_multi.textContent = (lang==='it'?'Caratteri (Multi - Sfide)':'Characters (Multi - Challenges)');
        if(lb_chars_single) lb_chars_single.textContent = (lang==='it'?'Caratteri (Single)':'Characters (Single)');
        if(lb_quiz_multi) lb_quiz_multi.textContent = (lang==='it'?'Quiz (Multi - Sfide)':'Quiz (Multi - Challenges)');
        if(lb_quiz_single) lb_quiz_single.textContent = (lang==='it'?'Quiz (Single)':'Quiz (Single)');

        // Setup Screen
        document.getElementById('txt_hello').textContent = t.hello;
        document.getElementById('txt_lb_btn').textContent = "🏆 " + t.lb;
        document.getElementById('txt_profile_btn').textContent = "👤 " + t.profile;
        document.getElementById('txt_act_btn').textContent = "🏅 " + t.activity;

        document.getElementById('txt_free_challenge_title').textContent = t.free_challenge;
        document.getElementById('txt_play_solo_title').textContent = t.play_solo;
        document.getElementById('txt_game_type_label').textContent = t.game_type;
        document.getElementById('txt_mode_label').textContent = t.mode;
        document.getElementById('txt_opt_multi').textContent = t.opt_multi;
        document.getElementById('txt_opt_single').textContent = t.opt_single;
        document.getElementById('txt_opt_std').textContent = t.opt_std;
        document.getElementById('txt_opt_call').textContent = t.opt_call;
        document.getElementById('txt_opt_pp').textContent = t.opt_pp;

        document.getElementById('txt_wpm_label').textContent = t.wpm;
        document.getElementById('txt_words_label').textContent = t.words;
        document.getElementById('txt_tone_label').textContent = t.tone;
        document.getElementById('txt_fixed_speed').textContent = t.fixed;
        document.getElementById('txt_easy_mode').textContent = t.easy;
        document.getElementById('txt_room_timeout').textContent = t.timeout;

        document.getElementById('txt_challenge_board_title').textContent = t.challenge_board;
        document.getElementById('txt_no_challenges').textContent = t.no_challenges;
        document.getElementById('txt_online_users_title').textContent = t.online_users;
        document.getElementById('txt_global_chat_btn').textContent = t.global_chat;
        document.getElementById('txt_you_are_alone').textContent = t.you_are_alone;

        // Chat
        document.getElementById('chatTitle').textContent = t.chat_title;
        document.getElementById('clearChatBtn').textContent = t.chat_clear;
        document.getElementById('closeChatBtn').textContent = t.chat_close;
        document.getElementById('sendChatBtn').textContent = t.chat_send;
        document.getElementById('chatInput').placeholder = t.chat_placeholder;

        // Lobby
        document.getElementById('txt_lobby_players').textContent = t.lobby_players;
        document.getElementById('txt_lobby_chat_title').textContent = t.lobby_chat;
        document.getElementById('sendLobbyChatBtn').textContent = t.chat_send;
        document.getElementById('lobbyChatInput').placeholder = t.chat_placeholder;
        document.getElementById('inviteFriendsBtn').textContent = t.lobby_invite;

        // Game Area
        document.getElementById('txt_prepare').textContent = t.prepare;
        document.getElementById('txt_th_typed').textContent = t.th_typed;
        document.getElementById('txt_th_real').textContent = t.th_real;
        document.getElementById('txt_th_pts').textContent = t.th_pts;
        document.getElementById('permanentGameInput').placeholder = t.input_placeholder;
        document.getElementById('replayWordBtn').textContent = t.replay;
        document.getElementById('txt_game_chat_btn').textContent = t.game_chat;
        document.getElementById('quitGameBtn').textContent = t.quit_game;

        // Profile Screen
        document.getElementById('txt_profile_title').textContent = t.profile_title;
        document.getElementById('txt_alias_title').textContent = t.alias_label;
        document.getElementById('saveAliasBtn').textContent = t.save;
        document.getElementById('txt_alias_hint').textContent = t.alias_hint;
        document.getElementById('txt_privacy_label').textContent = t.privacy_label;
        document.getElementById('txt_privacy_hint').textContent = t.privacy_hint;
        document.getElementById('txt_wrong_chars_title').textContent = t.wrong_chars;
        document.getElementById('txt_wpm_error_title').textContent = t.wpm_error;
        document.getElementById('txt_match_history_title').textContent = t.match_history;
        document.getElementById('txt_back_btn').textContent = t.back_to_menu;

        // Participation Screen
        document.getElementById('tabDailyAct').textContent = t.daily;
        document.getElementById('tabWeeklyAct').textContent = t.weekly;
        document.getElementById('tabMonthlyAct').textContent = t.monthly;
        document.getElementById('actListTitle').textContent = t.act_title;

        // Extra elements
        document.getElementById('goToTeamsBtn').textContent = t.teams_btn;
        document.getElementById('deleteDataBtn').textContent = t.delete_data;
        document.getElementById('tabRoomBtn').textContent = t.tab_this_match;
        document.getElementById('tabGlobalTournamentBtn').textContent = t.tab_trn_lb;
        document.getElementById('tabGlobalCWFreakBtn').textContent = t.tab_callsigns;
        document.getElementById('tabGlobalPingPongBtn').textContent = t.tab_pingpong;
        document.getElementById('tabGlobalStandardMultiBtn').textContent = t.tab_std_multi;
        document.getElementById('tabGlobalStandardSingleBtn').textContent = t.tab_std_single;

        // Lobby elements
        document.getElementById('startMultiplayerBtn').textContent = t.btn_start_match;
        document.getElementById('deleteRoomBtn').textContent = t.btn_delete_room;
        document.getElementById('leaveLobbyBtn').textContent = t.btn_leave_lobby;
        document.getElementById('readyBtn').textContent = t.ready_btn;

        // Teams and Tournaments Tabs
        if(document.getElementById('tabTeamGestBtn')) document.getElementById('tabTeamGestBtn').textContent = t.tab_my_team;
        if(document.getElementById('tabAllTeamsBtn')) document.getElementById('tabAllTeamsBtn').textContent = t.tab_all_teams;
        if(document.getElementById('tabTournamentsBtn')) document.getElementById('tabTournamentsBtn').textContent = t.tab_tournaments;

        const loadingStats = document.getElementById('txt_loading_stats');
        if(loadingStats) loadingStats.textContent = t.loading;
        const loadingStats2 = document.getElementById('txt_loading_stats2');
        if(loadingStats2) loadingStats2.textContent = t.loading;

        checkGameTypeUI();

        // Se siamo nella vista torneo, forza un aggiornamento per ridisegnare i bottoni
        if (activeTrnId) {
            db.ref(`tournaments/${activeTrnId}`).once('value', snap => {
                if(snap.exists()) renderActiveTournament(snap);
            });
        }
    }

    document.getElementById('gameModeInput').addEventListener('change', (e) => {
        const isC = e.target.value === 'callsign';
        const isPP = e.target.value === 'pingpong';

        if (isPP) {
            document.getElementById('gameTypeInput').value = 'multi';
            document.getElementById('gameTypeInput').disabled = true;
            checkGameTypeUI();
        } else {
            document.getElementById('gameTypeInput').disabled = false;
        }

        ['startWpmInput', 'wordCountInput', 'toneInput'].forEach(id => {
            document.getElementById(id).disabled = isC;
            if(isC && id!=='toneInput') document.getElementById(id).value = 25;
        });
        document.getElementById('fixedSpeedCheckbox').disabled = isC;
        if(isC) document.getElementById('fixedSpeedCheckbox').checked = false;
    });
    document.getElementById('gameTypeInput').addEventListener('change', checkGameTypeUI);

    function generateCallsign() {
        const prefixes = ["I", "IK", "IZ", "IN", "IT", "IS", "IU", "IW", "W", "K", "N", "A", "WA", "WB", "DL", "DJ", "DK", "DO", "EA", "EB", "EC", "F", "G", "M", "GW", "GM", "9A", "S5", "OK", "OM", "SP", "SQ", "UA", "UR", "EW", "ER", "YO", "YU", "HA", "LZ", "OE", "HB", "PA", "PB", "ON", "VE", "VK", "ZL", "JA", "PY", "LU", "CX"];
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        let digit = Math.floor(Math.random() * 10);
        let rand = Math.random();
        let suffixLen = (rand > 0.9) ? 1 : (rand > 0.7) ? 2 : 3;
        let suffix = "";
        for(let i = 0; i < suffixLen; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
        let callsign = prefix + digit + suffix;
        if (Math.random() > 0.90) {
            const modifiers = ["/QRP", "/P", "/M", "/AM", "/MM"];
            callsign += modifiers[Math.floor(Math.random() * modifiers.length)];
        }
        return callsign;
    }

    function getGameWords(num, mode) {
        if (mode === 'callsign') return Array.from({length: num}, generateCallsign);
        if (mode === 'pingpong') return [];
        if (mode === 'chars') {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            return Array.from({length: num}, () => chars[Math.floor(Math.random() * chars.length)]);
        }
        return masterDictionary.sort(() => 0.5 - Math.random()).slice(0, num).map(w => w.toUpperCase());
    }

    window.showRoomEventModal = function(title, text) {
        document.getElementById('roomEventTitle').textContent = title;
        document.getElementById('roomEventText').textContent = text;
        document.getElementById('roomEventModal').style.display = 'flex';
        playBeep(600, 0.2); setTimeout(() => playBeep(800, 0.3), 200);
    }

    document.getElementById('goToRoomBtn').addEventListener('click', () => {
        document.getElementById('roomEventModal').style.display = 'none';
        if (roomCode) joinRoomLogic(false);
    });

    window.checkTournamentPopup = function() {
        const hideTrnPopup = localStorage.getItem('hideTrnWelcomePopup');
        if (hideTrnPopup === 'true') return;

        // Se l'utente ha già una squadra, probabilmente conosce già l'area tornei
        if (myTeamId) return;

        setTimeout(() => {
            document.getElementById('tournamentWelcomeModal').style.display = 'flex';
        }, 1500);
    }

    window.closeTrnWelcomeModal = function() {
        const stopShowing = document.getElementById('stopShowingTrnPopup').checked;
        if (stopShowing) {
            localStorage.setItem('hideTrnWelcomePopup', 'true');
        }
        document.getElementById('tournamentWelcomeModal').style.display = 'none';
    }

    window.goToTournamentsFromPopup = function() {
        closeTrnWelcomeModal();
        showScreen('teamsScreen');
    }

    let lastOnlineUsersSnap = null;
    function listenToOnlineUsers() {
        db.ref('presence').on('value', snap => {
            lastOnlineUsersSnap = snap;
            renderOnlineUsers();
        });
    }

    function renderOnlineUsers() {
        if (!lastOnlineUsersSnap) return;
        const list = document.getElementById('onlineUsersList'); list.innerHTML = '';
        let count = 0;
        lastOnlineUsersSnap.forEach(child => {
            const u = child.val(); if (child.key === myId) return;
            count++;
            const li = document.createElement('li');

            const isThisOneWaiting = (isChallenging && currentInviterId === child.key);
            const isPlaying = (u.status === 'playing');

            let statusText = isPlaying ? "🟡 In Partita" : "🟢 Online";

            const leftSpan = document.createElement('span');
            const nameB = document.createElement('b');
            nameB.textContent = u.name;
            nameB.style.cursor = 'pointer';
            nameB.style.color = 'var(--link-color)';
            nameB.style.textDecoration = 'underline';
            nameB.onclick = () => openTeamInviteModal(child.key, u.name);

            leftSpan.appendChild(nameB);
            leftSpan.appendChild(document.createElement('br'));
            const statusSmall = document.createElement('small');
            statusSmall.textContent = statusText;
            leftSpan.appendChild(statusSmall);

            const btn = document.createElement('button');
            btn.className = `action-btn-small ${isThisOneWaiting ? 'btn-danger' : 'btn-success'}`;
            if (isPlaying) {
                btn.classList.add('btn-secondary');
                btn.disabled = true;
                btn.textContent = "In partita";
            } else {
                if (isChallenging && !isThisOneWaiting) btn.disabled = true;
                btn.textContent = isThisOneWaiting ? 'In Attesa...' : 'Sfida';
                btn.onclick = () => openInviteModal(child.key, u.name);
            }

            li.appendChild(leftSpan);
            li.appendChild(btn);
            list.appendChild(li);
        });
        if (count === 0) {
            const li = document.createElement('li');
            li.style.justifyContent = 'center';
            li.style.color = 'var(--hint-color)';
            li.style.background = 'none';
            li.style.border = 'none';
            li.textContent = i18n[currentLang].you_are_alone;
            list.appendChild(li);
        }
    }

    window.openInviteModal = function(targetId, targetName) {
        currentInviterId = targetId;
        document.getElementById('inviteModalTitle').textContent = "Sfida " + targetName;
        document.getElementById('inviteModalText').textContent = "Scegli le impostazioni per la sfida:";
        document.getElementById('inviteSettings').style.display = 'block';
        document.getElementById('teamInviteSettings').style.display = 'none';
        document.getElementById('incomingInviteArea').style.display = 'none';
        document.getElementById('incomingTeamInviteArea').style.display = 'none';
        document.getElementById('outgoingInviteArea').style.display = 'block';
        document.getElementById('inviteModal').style.display = 'flex';
    }

    window.openTeamInviteModal = async function(targetId, targetName) {
        currentInviterId = targetId;
        document.getElementById('inviteModalTitle').textContent = "Recluta " + targetName;

        const statusText = document.getElementById('recruitmentStatusText');
        statusText.textContent = "Caricamento stato utente...";

        document.getElementById('inviteSettings').style.display = 'none';
        document.getElementById('teamInviteSettings').style.display = 'block';
        document.getElementById('incomingInviteArea').style.display = 'none';
        document.getElementById('incomingTeamInviteArea').style.display = 'none';
        document.getElementById('outgoingInviteArea').style.display = 'none';

        const joinBtn = document.getElementById('recruitJoinBtn');
        const createBtn = document.getElementById('recruitCreateBtn');
        const msgBtn = document.getElementById('recruitMsgBtn');

        joinBtn.style.display = 'none';

        try {
            // Controlliamo se l'utente è già in una squadra
            const teamsSnap = await db.ref('teams').once('value');
            let targetTeamName = null;
            let isAlreadyInTeam = false;

            teamsSnap.forEach(tSnap => {
                const team = tSnap.val();
                if (team.status !== 'retired' && team.members && team.members[targetId]) {
                    isAlreadyInTeam = true;
                    targetTeamName = team.name;
                }
            });

            if (isAlreadyInTeam) {
                statusText.textContent = "";
                statusText.appendChild(document.createTextNode("⚠️ "));
                const bName = document.createElement('b'); bName.textContent = targetName;
                statusText.appendChild(bName);
                statusText.appendChild(document.createTextNode(" fa già parte della squadra "));
                const bTeam = document.createElement('b'); bTeam.textContent = targetTeamName;
                statusText.appendChild(bTeam);
                statusText.appendChild(document.createTextNode("."));
                createBtn.style.display = 'none';
            } else {
                statusText.textContent = "";
                statusText.appendChild(document.createTextNode("💡 "));
                const bName = document.createElement('b'); bName.textContent = targetName;
                statusText.appendChild(bName);
                statusText.appendChild(document.createTextNode(" non ha ancora una squadra."));
                createBtn.style.display = 'block';
                if (myTeamId) joinBtn.style.display = 'block';
            }

            // Azioni bottoni
            joinBtn.onclick = () => sendRecruitmentInvite('team');
            createBtn.onclick = () => sendRecruitmentInvite('suggest');
            msgBtn.onclick = () => {
                db.ref(`presence/${targetId}`).once('value', s => {
                    const u = s.val();
                    if (u && u.username) {
                        tg.openTelegramLink('https://t.me/' + u.username);
                    } else {
                        tg.showAlert("L'utente non ha uno username pubblico.");
                    }
                });
            };

        } catch(e) {
            console.error(e);
            statusText.textContent = "Errore nel recupero dati.";
        }

        document.getElementById('inviteModal').style.display = 'flex';
    }

    function sendRecruitmentInvite(type) {
        const inviteData = {
            fromId: myId,
            fromName: myName,
            type: 'team',
            ts: firebase.database.ServerValue.TIMESTAMP
        };

        if (type === 'team') {
            inviteData.teamId = myTeamId;
            inviteData.teamName = myTeamName;
        } else {
            inviteData.teamId = null; // Suggest creation
        }

        db.ref(`invites/${currentInviterId}`).set(inviteData).then(() => {
            showToast(type === 'team' ? "Invito squadra inviato!" : "Suggerimento inviato!");
            closeInviteModal();
        });
    }

    window.closeInviteModal = function() {
        document.getElementById('inviteModal').style.display = 'none';
        currentInviterId = null;
    }

    document.getElementById('sendInviteBtn').addEventListener('click', () => {
        if (isChallenging) return;

        const mode = document.getElementById('inviteModeInput').value;
        const wpm = parseInt(document.getElementById('inviteWpmInput').value);
        const wc = parseInt(document.getElementById('inviteWordCountInput').value);

        const inviteData = {
            fromId: myId,
            fromName: myName,
            mode: mode,
            wpm: wpm,
            wordCount: wc,
            ts: firebase.database.ServerValue.TIMESTAMP,
            status: 'pending'
        };

        const targetId = currentInviterId;
        isChallenging = true;
        renderOnlineUsers(); // Forza aggiornamento immediato pulsante rosso

        db.ref(`invites/${targetId}`).set(inviteData).then(() => {
            showToast("Invito inviato! In attesa...");
            closeInviteModal();

            // Monitoriamo se l'invito viene rifiutato o scade
            if (outgoingInviteListener) db.ref(`invites/${targetId}`).off('value', outgoingInviteListener);
            outgoingInviteListener = db.ref(`invites/${targetId}`).on('value', invSnap => {
                if (!invSnap.exists() && isChallenging) {
                    // Se l'invito sparisce ma non è stato accettato (isChallenging è ancora true)
                    // Allora è stato rifiutato o è scaduto
                    setTimeout(() => {
                        if (isChallenging) {
                            showToast("L'utente ha rifiutato l'invito o la sfida è scaduta.");
                            isChallenging = false;
                            currentInviterId = null;
                            renderOnlineUsers(); // Torna verde
                            if (outgoingInviteListener) {
                                db.ref(`invites/${targetId}`).off('value', outgoingInviteListener);
                                outgoingInviteListener = null;
                            }
                        }
                    }, 1000);
                }
            });
        });
    });

    function listenToInvites() {
        db.ref(`invites/${myId}`).on('value', snap => {
            const inv = snap.val();
            if (!inv) return;

            // Se il giocatore è già in una stanza o sta giocando, ignora l'invito
            if (roomCode || gameRunning) return;

            // Se l'invito è vecchio (più di 1 min), ignoralo
            if (Date.now() - inv.ts > 60000) { db.ref(`invites/${myId}`).remove(); return; }

            if (inv.type === 'team') {
                document.getElementById('inviteModalTitle').textContent = inv.teamId ? "🚀 INVITO IN SQUADRA" : "💡 SUGGERIMENTO SQUADRA";

                const textEl = document.getElementById('inviteModalText');
                textEl.innerHTML = '';
                if (inv.teamId) {
                    textEl.appendChild(document.createTextNode(`${inv.fromName} ti ha invitato ad unirti alla squadra `));
                    const bTeam = document.createElement('b');
                    bTeam.textContent = inv.teamName;
                    textEl.appendChild(bTeam);
                    textEl.appendChild(document.createTextNode("."));
                } else {
                    textEl.appendChild(document.createTextNode(`${inv.fromName} ti suggerisce di creare una tua squadra per partecipare ai tornei!`));
                }

                document.getElementById('inviteSettings').style.display = 'none';
                document.getElementById('teamInviteSettings').style.display = 'none';
                document.getElementById('incomingInviteArea').style.display = 'none';
                document.getElementById('incomingTeamInviteArea').style.display = 'block';
                document.getElementById('outgoingInviteArea').style.display = 'none';

                const acceptBtn = document.getElementById('acceptTeamInviteBtn');
                acceptBtn.textContent = inv.teamId ? "UNISCITI ALLA SQUADRA ✅" : "VAI ALLA CREAZIONE 🛠️";
                acceptBtn.onclick = () => {
                    db.ref(`invites/${myId}`).remove();
                    closeInviteModal();
                    if (inv.teamId) {
                        joinTeam(inv.teamId);
                    } else {
                        showScreen('teamsScreen');
                    }
                };
            } else {
                document.getElementById('inviteModalTitle').textContent = "🚀 SFIDA DA " + inv.fromName.toUpperCase();

                const textEl = document.getElementById('inviteModalText');
                textEl.innerHTML = '';
                textEl.appendChild(document.createTextNode("Ti ha invitato a giocare:"));
                textEl.appendChild(document.createElement('br'));
                const bMode = document.createElement('b');
                bMode.textContent = inv.mode.toUpperCase();
                textEl.appendChild(bMode);
                textEl.appendChild(document.createTextNode(" a "));
                const bWpm = document.createElement('b');
                bWpm.textContent = inv.wpm;
                textEl.appendChild(bWpm);
                textEl.appendChild(document.createTextNode(" WPM ("));
                const bCount = document.createElement('b');
                bCount.textContent = inv.wordCount;
                textEl.appendChild(bCount);
                textEl.appendChild(document.createTextNode(" test)."));

                document.getElementById('inviteSettings').style.display = 'none';
                document.getElementById('teamInviteSettings').style.display = 'none';
                document.getElementById('incomingInviteArea').style.display = 'block';
                document.getElementById('incomingTeamInviteArea').style.display = 'none';
                document.getElementById('outgoingInviteArea').style.display = 'none';
            }
            document.getElementById('inviteModal').style.display = 'flex';

            currentInviterId = inv.fromId;
            window.lastIncomingInvite = inv;
        });
    }

    document.getElementById('declineTeamInviteBtn').addEventListener('click', () => {
        db.ref(`invites/${myId}`).remove();
        closeInviteModal();
    });

    document.getElementById('declineInviteBtn').addEventListener('click', () => {
        db.ref(`invites/${myId}`).remove();
        closeInviteModal();
    });

    document.getElementById('acceptInviteBtn').addEventListener('click', () => {
        const inv = window.lastIncomingInvite;
        db.ref(`invites/${myId}`).remove();
        closeInviteModal();

        // Creazione stanza concordata
        const rCode = Math.floor(1000 + Math.random() * 9000).toString();
        const words = getGameWords(inv.wordCount, inv.mode);

        const roomData = {
            status: 'waiting', type: 'multi',
            mode: inv.mode, wpm: inv.wpm, tone: 600, wordCount: inv.wordCount, words: words,
            createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + (10 * 60000), hostId: inv.fromId
        };

        db.ref(`rooms/${rCode}`).set(roomData).then(() => {
            // Comunichiamo il codice al mittente
            db.ref(`invite_accepted/${inv.fromId}`).set({ roomCode: rCode });
            roomCode = rCode;
            joinRoomLogic(false);
        });
    });

    // Listener per il mittente (chi ha inviato l'invito)
    function listenToInviteAccepted() {
        if (inviteAcceptedListener) db.ref(`invite_accepted/${myId}`).off('value', inviteAcceptedListener);
        inviteAcceptedListener = db.ref(`invite_accepted/${myId}`).on('value', snap => {
            const data = snap.val();
            if (data && data.roomCode) {
                db.ref(`invite_accepted/${myId}`).remove();

                // Sfida accettata! Resettiamo lo stato di sfida
                isChallenging = false;
                closeInviteModal();
                roomCode = data.roomCode;
                joinRoomLogic(false);
            }
        });
    }

    function listenToRooms() {
        db.ref('rooms').on('value', snapshot => {
            const list = document.getElementById('waitingRoomsList'); list.innerHTML = ''; let wCount = 0;
            snapshot.forEach(child => {
                const room = child.val(); const code = child.key;
                if (code.startsWith("TRN_")) return;
                if (room.expiresAt && Date.now() > room.expiresAt) { db.ref(`rooms/${code}`).remove(); return; }

                if (room.status === 'waiting' && room.type !== 'single') {
                    wCount++; let pCount = room.players ? Object.keys(room.players).length : 0;
                    const li = document.createElement('li');
                    let modeIcon = room.mode === 'callsign' ? '🎙️ Nom.' : room.mode === 'pingpong' ? '🏓 Ping Pong' : '🔤 Parole';
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
                li.textContent = i18n[currentLang].no_challenges;
                list.appendChild(li);
            }
        });
    }
    window.joinSpecificRoom = function(code) { roomCode = code; joinRoomLogic(false); }

    document.getElementById('createRoomBtn').addEventListener('click', () => {
        const gameType = document.getElementById('gameTypeInput').value;
        const gameMode = document.getElementById('gameModeInput').value;

        // Se è selezionata la modalità Torneo, reindirizza alle aree specifiche
        if (gameType === 'tournament') {
            showScreen('teamsScreen');
            if (gameMode === 'trn_create_team') switchTeamTab('gest');
            else if (gameMode === 'trn_join_team') switchTeamTab('allteams');
            else if (gameMode === 'trn_create_trn') switchTeamTab('tournaments');
            return;
        }

        // Pulizia inviti pendenti prima di iniziare una nuova partita (Solo o Multi)
        isChallenging = false;
        if (currentInviterId) {
            db.ref(`invites/${currentInviterId}`).once('value', s => {
                if (s.exists() && s.val().fromId === myId) db.ref(`invites/${currentInviterId}`).remove();
            });
        }
        db.ref(`invite_accepted/${myId}`).remove();

        currentMode = document.getElementById('gameModeInput').value;
        isSinglePlayer = document.getElementById('gameTypeInput').value === 'single';
        currentWpm = currentMode==='callsign' ? 25 : parseInt(document.getElementById('startWpmInput').value);
        baseWpm = currentWpm;
        requestedWordCount = currentMode==='callsign' ? 25 : Math.max(1, parseInt(document.getElementById('wordCountInput').value));
        currentTone = parseInt(document.getElementById('toneInput').value);
        let timerMins = Math.max(1, parseInt(document.getElementById('roomTimerInput').value));
        let setFixedSpeed = document.getElementById('fixedSpeedCheckbox').checked;
        isEasyMode = document.getElementById('easyModeCheckbox').checked;

        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        gameWords = getGameWords(requestedWordCount, currentMode);

        db.ref('rooms/' + roomCode).set({
            status: isSinglePlayer ? 'countdown' : 'waiting', type: isSinglePlayer ? 'single' : 'multi',
            mode: currentMode, wpm: currentWpm, tone: currentTone, wordCount: requestedWordCount, words: gameWords,
            fixedSpeed: setFixedSpeed,
            createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: isSinglePlayer ? null : Date.now() + (timerMins * 60000), hostId: myId
        }).then(() => joinRoomLogic(false));
    });

    // Funzione sicura per uscire dalle stanze
    function exitRoomCleanly(roomWasDeletedByHost = false) {
        let targetScreen = 'setupScreen';
        const amIHost = (myId === roomHostId);

        localStorage.removeItem(STORAGE_ROOM_KEY);
        isRejoining = false;
        isChallenging = false;
        currentInviterId = null;

        if (gamePlayersListener && roomCode) {
            db.ref(`rooms/${roomCode}/players`).off('value', gamePlayersListener);
            gamePlayersListener = null;
        }

        if (roomLeaderboardListener && roomCode) {
            db.ref(`rooms/${roomCode}`).off('value', roomLeaderboardListener);
            roomLeaderboardListener = null;
        }

        if (roomCode) {
            if (roomCode.startsWith("TRN_")) {
                targetScreen = 'teamsScreen';
            }
            const rc = roomCode;

            // Se sono l'host, NON mi rimuovo dai players per rimanere visibile in bacheca
            // e NON spengo il listener per continuare a ricevere notifiche
            if (!roomWasDeletedByHost && amIHost && !rc.startsWith("TRN_")) {
                // Host rimane in ascolto
            } else {
                if (currentRoomListener) { currentRoomListener.off(); currentRoomListener = null; }
                if (pingPongListener) { db.ref(`rooms/${roomCode}/pingpong`).off('value', pingPongListener); pingPongListener = null; }

                db.ref(`rooms/${rc}/players/${myId}`).onDisconnect().cancel();
                db.ref(`rooms/${rc}`).once('value', snap => {
                    if (snap.exists()) db.ref(`rooms/${rc}/players/${myId}`).remove();
                });
                roomCode = "";
            }
        } else {
            if (currentRoomListener) { currentRoomListener.off(); currentRoomListener = null; }
        }

        hideChat();
        showScreen(targetScreen);
    }

    function joinRoomLogic(isReconnect = false) {
        gameRunning = false;
        localStorage.setItem(STORAGE_ROOM_KEY, roomCode);

        const playerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
        playerRef.once('value', snapshot => {
            const playerData = snapshot.val();
            if (playerData?.finished) {
                showScreen('leaderboardScreen'); activeTab="room";
                showLeaderboardTab('tabRoomBtn');
                localStorage.removeItem(STORAGE_ROOM_KEY);
                return;
            }

            if (isRejoining && playerData) {
                totalScore = playerData.score || 0;
                wordIndex = playerData.wordIndex || 0;
                matchDetailsArray = playerData.matchDetails || [];
                showToast("🔄 Partita recuperata!");
            }

            showScreen('lobbyScreen');
            document.getElementById('lobbyTitleText').textContent = roomCode.startsWith("TRN_") ? i18n[currentLang].lobby_trn : i18n[currentLang].lobby_free;
            document.getElementById('permanentGameInput').blur();

            playerRef.onDisconnect().update({ online: false });

            // Inseriamo anche ready: false di default
            const currentUsername = myPrivacy ? "" : tgUsername;
            if (!playerData) {
                playerRef.set({ name: myName, username: currentUsername, score: 0, wpm: 0, finished: false, teamId: myTeamId, ready: false, online: true });
            } else {
                playerRef.update({ online: true });
            }

            listenToChat();
            if (currentRoomListener && !isReconnect) currentRoomListener.off();

            currentRoomListener = db.ref(`rooms/${roomCode}`);
            currentRoomListener.on('value', roomSnap => {
                if (!roomSnap.exists()) {
                    exitRoomCleanly(true);
                    return;
                }

                const roomData = roomSnap.val();
                currentMode = roomData.mode; requestedWordCount = roomData.wordCount; isSinglePlayer = roomData.type === 'single';
                isFixedSpeed = roomData.fixedSpeed || false;
                roomHostId = roomData.hostId;

                if (roomData.status === 'playing' && isRejoining && !gameRunning) {
                    currentWpm = roomData.wpm; baseWpm = roomData.wpm; currentTone = roomData.tone;
                    if (roomData.words) gameWords = roomData.words;
                    resumeGameSequence(); return;
                }

                if (roomData.status === 'countdown' && !gameRunning) {
                    currentWpm = roomData.wpm; baseWpm = roomData.wpm; currentTone = roomData.tone;
                    if (roomData.words) gameWords = roomData.words;
                    startCountdownSequence(); return;
                }
                if (roomData.status === 'waiting') {
                    const playersData = roomData.players || {};
                    renderPlayersList(playersData, roomData.hostId);

                    // Notifica Host quando entra qualcuno
                    const pCount = Object.keys(playersData).length;
                    if (myId === roomData.hostId && pCount > lastPlayerCount && activeChatContext !== 'room') {
                         showRoomEventModal("Qualcuno è entrato!", "Un nuovo giocatore è appena entrato nella tua stanza.");
                    }
                    lastPlayerCount = pCount;
                    if (lobbyTimerInterval) clearInterval(lobbyTimerInterval);
                    if (roomData.expiresAt && !isSinglePlayer) {
                        lobbyTimerInterval = setInterval(() => {
                            const diff = roomData.expiresAt - Date.now();
                            if (diff <= 0) { clearInterval(lobbyTimerInterval); document.getElementById('lobbyTimerText').textContent = "Tempo scaduto!"; }
                            else { document.getElementById('lobbyTimerText').textContent = `Scade tra: ${Math.floor(diff/60000)}:${Math.floor((diff%60000)/1000).toString().padStart(2, '0')}`; }
                        }, 1000);
                    } else {
                        document.getElementById('lobbyTimerText').textContent = "";
                    }
                }
            });
        });
    }

    document.getElementById('inviteFriendsBtn').addEventListener('click', () => {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=room_${roomCode}`)}&text=${encodeURIComponent(`Sfida in Telegrafia! Entra nella mia stanza per giocare: #${roomCode}`)}`;
        tg.openTelegramLink(shareUrl);
    });

    function renderPlayersList(playersData, hostId) {
        const list = document.getElementById('playersList'); list.innerHTML = '';
        const count = Object.keys(playersData).length;
        if (count > lastPlayerCount && lastPlayerCount > 0) { playBeep(500, 0.1); setTimeout(() => playBeep(700, 0.15), 150); showToast("👤 Un nuovo giocatore è entrato!"); }
        lastPlayerCount = count;

        let allReady = true;
        const pKeys = Object.keys(playersData);
        if (pKeys.length < 2) allReady = false; // Serve un minimo di 2 giocatori per queste modalità a doppio consenso

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

        const isTrnOrPP = roomCode.startsWith("TRN_") || currentMode === 'pingpong';
        const amIHost = (myId === hostId) || roomCode.startsWith("TRN_");
        const amIReady = playersData[myId]?.ready;

        document.getElementById('startMultiplayerBtn').style.display = (amIHost && !isTrnOrPP) ? 'block' : 'none';
        document.getElementById('deleteRoomBtn').style.display = (myId === hostId && !roomCode.startsWith("TRN_")) ? 'block' : 'none';

        // Tasto Pronto visibile se non siamo ancora pronti e se siamo in PingPong / Torneo
        document.getElementById('readyBtn').style.display = (isTrnOrPP && !amIReady) ? 'block' : 'none';

        const t = i18n[currentLang];
        if (isTrnOrPP) {
            document.getElementById('waitingHostText').style.display = amIReady ? 'block' : 'none';
            document.getElementById('waitingHostText').textContent = t.waiting_host;
            document.getElementById('statusInfoText').textContent = amIReady ? t.ready_btn : t.conn_secure;
        } else {
            document.getElementById('waitingHostText').style.display = amIHost ? 'none' : 'block';
            document.getElementById('waitingHostText').textContent = t.waiting_host;
            document.getElementById('statusInfoText').textContent = amIHost ? t.status_host : t.status_guest;
        }

        // Avvio automatico per tornei/pingpong quando TUTTI sono pronti
        if (allReady && isTrnOrPP && (pKeys[0] === myId || amIHost)) {
            db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
        }
    }

    // Tasto "Sono Pronto"
    document.getElementById('readyBtn').addEventListener('click', () => {
        if(roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ ready: true });
    });

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
    const max = Math.max(real.length, typed.length);
    for (let i = 0; i < max; i++) {
        if (!real[i]) continue;
        const span = document.createElement('span');
        if (!typed[i] || typed[i] !== real[i]) {
            span.style.color = "#d32f2f"; // Rosso per errore
        }
        span.textContent = real[i];
        container.appendChild(span);
    }
}

    document.getElementById('replayWordBtn').addEventListener('click', () => {
        if (!gameRunning || !inputActive) return;
        usedReplay = true;
        playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm);
        document.getElementById('permanentGameInput').focus();
    });


    const permInput = document.getElementById('permanentGameInput');

    // Supporto per modalità caratteri (senza Invio)
    permInput.addEventListener('input', function(e) {
        if (currentMode === 'chars' && inputActive && gameRunning) {
            const val = permInput.value.trim().toUpperCase();
            if (val.length >= 1) {
                // Prendi solo l'ultimo carattere inserito
                handleWordSubmission(val[0]);
                permInput.value = "";
            }
        }
    });

    permInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && inputActive && gameRunning && currentMode !== 'chars') {
            const userWord = permInput.value.trim().toUpperCase();
            if (userWord === "") return;
            handleWordSubmission(userWord);
            permInput.value = "";
        }
    });

    function handleWordSubmission(userWord) {
        inputActive = false;
        const currentWord = gameWords[wordIndex].toUpperCase();
        let points = 0, scoreColor = "";
        let reactionMs = Date.now() - lastWordStartTime;

        // --- CALCOLO PUNTEGGIO STILE RUFZXP ---
        const levDist = getLevenshteinDistance(currentWord, userWord);

        if (currentMode === 'chars') {
            // Modalità Caratteri: Già basata su ms, la affiniamo
            if (userWord === currentWord) {
                // Max 1000 punti per < 300ms, poi scende
                points = Math.max(100, Math.floor(1000 - (reactionMs / 2)));
                scoreColor = "#4caf50";
            } else {
                points = 0;
                scoreColor = "#d32f2f";
            }
        } else {
            // Modalità Parole / Nominativi / Ping Pong
            // Formula base: (WPM^2 * Lunghezza) / (10 * (Errori + 1)^2)
            const basePoints = (Math.pow(currentWpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2));

            // Penalità Tempo (RufzXP): Bonus se veloce, malus se lento
            // Tempo stimato audio: (Lunghezza * 60 / WPM) * 1000 ms approssimativo
            // Diamo 2 secondi di "grace period" dopo la fine stimata dell'audio
            const estimatedAudioMs = (currentWord.length * 60 / currentWpm) * 1000;
            const gracePeriod = 2000;
            let timeMultiplier = 1.0;

            if (reactionMs > (estimatedAudioMs + gracePeriod)) {
                const delay = reactionMs - (estimatedAudioMs + gracePeriod);
                // Perdita del 5% per ogni secondo di ritardo, fino a min 50%
                timeMultiplier = Math.max(0.5, 1.0 - (delay / 20000));
            } else if (reactionMs < estimatedAudioMs && levDist === 0) {
                // Bonus velocità estrema (head copy durante l'invio)
                timeMultiplier = 1.1;
            }

            points = Math.round(basePoints * timeMultiplier);

            // Colore basato sulla precisione
            if (levDist === 0) scoreColor = usedReplay ? "#999999" : "#4caf50";
            else if (levDist === 1) scoreColor = "#ff9800";
            else scoreColor = "#d32f2f";

            if (usedReplay) points = Math.round(points * 0.2); // Riascolto penalizza dell'80%
        }

        // --- STATISTICHE ERRORI ---
        if (levDist > 0) {
            let wrongChars = [];
            const maxLen = Math.max(currentWord.length, userWord.length);
            for(let i=0; i<maxLen; i++) {
                if(userWord[i] !== currentWord[i] && currentWord[i]) {
                    let char = currentWord[i];
                    if(char === '__proto__' || char === 'constructor' || char === 'prototype') continue;
                    if(!wrongChars.includes(char)) wrongChars.push(char);
                }
            }
            if(!sessionErrorsByWpm[currentWpm]) sessionErrorsByWpm[currentWpm] = Object.create(null);
            wrongChars.forEach(c => {
                sessionCharErrors[c] = (sessionCharErrors[c] || 0) + 1;
                sessionErrorsByWpm[currentWpm][c] = (sessionErrorsByWpm[currentWpm][c] || 0) + 1;
            });
        }

        // --- AGGIORNAMENTO VELOCITÀ ADATTIVA ---
        if (!isFixedSpeed && currentMode !== 'chars') {
            if (levDist === 0 && !usedReplay) currentWpm += 2;
            else if (levDist === 1) currentWpm -= 1;
            else if (levDist > 1) currentWpm -= 2;
            currentWpm = Math.max(10, currentWpm); // Minimo assoluto 10 WPM, può scendere sotto baseWpm
        }

        totalScore += points;
        matchDetailsArray.push({
            real: currentWord,
            typed: userWord,
            points: points,
            wpm: currentWpm,
            ms: reactionMs
        });

        if (currentMode !== 'pingpong') {
            const tr = document.createElement('tr');

            const tdTyped = document.createElement('td');
            tdTyped.textContent = userWord;

            const tdReal = document.createElement('td');
            const bReal = document.createElement('b');
            bReal.textContent = currentWord;
            tdReal.appendChild(bReal);

            const tdPoints = document.createElement('td');
            tdPoints.style.color = scoreColor;
            tdPoints.style.fontWeight = 'bold';

            if (currentMode === 'chars') {
                tdPoints.textContent = points + " (" + reactionMs + "ms)";
            } else {
                tdPoints.textContent = usedReplay ? '0 (Replay)' : (points > 0 ? "+"+points : points);
            }

            tr.appendChild(tdTyped);
            tr.appendChild(tdReal);
            tr.appendChild(tdPoints);
            document.getElementById('tableBody').appendChild(tr);
            const tableWrapper = document.getElementById('tableWrapper'); tableWrapper.scrollTop = tableWrapper.scrollHeight;
        }

        document.getElementById('wpmDisplay').textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
        document.getElementById('scoreDisplay').textContent = `Punti: ${totalScore}`;

        if (roomCode) {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({
                score: totalScore,
                wpm: currentWpm,
                wordIndex: wordIndex + 1,
                matchDetails: matchDetailsArray
            });
        }
        usedReplay = false;

        if (currentMode === 'pingpong') {
            wordIndex++;
            db.ref(`rooms/${roomCode}/pingpong`).transaction(currentData => {
                if (currentData) {
                    currentData.senderId = myId;
                    currentData.word = '';
                    currentData.wordsPlayed = (currentData.wordsPlayed || 0) + 1;
                    currentData.lastGuess = { id: Date.now(), real: currentWord, typed: userWord, points: points };
                }
                return currentData;
            });
        } else {
            wordIndex++; setTimeout(playNextWord, 600);
        }
    }

    document.getElementById('btnSendPingPong').addEventListener('click', () => {
        if (!gameRunning || currentMode !== 'pingpong') return;
        let word = document.getElementById('pingPongWordToSend').value.trim().toUpperCase();
        if (!word) return;

        db.ref(`rooms/${roomCode}/pingpong`).transaction(currentData => {
            if (currentData) { currentData.word = word; currentData.wordId = (currentData.wordId || 0) + 1; }
            return currentData;
        });
    });
    document.getElementById('pingPongWordToSend').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnSendPingPong').click();
    });

    function playNextWord() {
        if (!gameRunning) return;
        if (currentMode === 'pingpong') return;
        if (wordIndex >= requestedWordCount) { finishGame(); return; }
        if (currentMode === 'callsign') currentTone = Math.floor(Math.random() * (700 - 400 + 1)) + 400;

        inputActive = true; usedReplay = false;
        const currentWord = gameWords[wordIndex].toUpperCase();

        // Modalità Facilitata: Caratteri in ordine sparso
        const hintEl = document.getElementById('easyModeHint');
        if (isEasyMode && isSinglePlayer) {
            const shuffled = currentWord.split('').sort(() => 0.5 - Math.random()).join(' ');
            hintEl.textContent = shuffled;
            hintEl.style.display = 'block';
        } else {
            hintEl.style.display = 'none';
        }

        playMorseAudio(currentWord, currentWpm);
        lastWordStartTime = Date.now();
        document.getElementById('permanentGameInput').focus();
    }

    function startCountdownSequence() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (currentRoomListener) currentRoomListener.off();

        // Host aggiorna lo status a 'playing' dopo il countdown
        if (myId === roomHostId) {
            // Lo faremo alla fine del countdown per permettere il rejoining
        }

        // LOGICA ABBANDONO: Monitora se i giocatori in partita diminuiscono
        if (!isSinglePlayer) {
            db.ref(`rooms/${roomCode}/players`).once('value', snap => {
                gameStartPlayerCount = snap.exists() ? Object.keys(snap.val()).length : 0;

                if (gamePlayersListener) db.ref(`rooms/${roomCode}/players`).off('value', gamePlayersListener);
                gamePlayersListener = db.ref(`rooms/${roomCode}/players`).on('value', playersSnap => {
                    if (!gameRunning) return;
                    const players = playersSnap.val() || {};
                    const currentPCount = Object.keys(players).length;

                    // Controlliamo quanti sono REALMENTE usciti (non solo offline)
                    // Se un giocatore viene rimosso del tutto dalla stanza, allora è abbandono
                    if (gameStartPlayerCount > 0 && currentPCount < gameStartPlayerCount) {
                         // Aspettiamo 10 secondi per vedere se è una rimozione definitiva o un ricaricamento
                         setTimeout(() => {
                            db.ref(`rooms/${roomCode}/players`).once('value', s => {
                                if (gameRunning && Object.keys(s.val() || {}).length < gameStartPlayerCount) {
                                    alert("Un giocatore ha abbandonato la partita definitivamente. Ritorno al menu principale.");
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

        document.getElementById('wpmDisplay').textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
        document.getElementById('scoreDisplay').textContent = `Punti: 0`;

        if (!isRejoining) {
            totalScore = 0; currentStreak = 0; wordIndex = 0; quizQuestionIndex = 0;
            usedReplay = false; sessionCharErrors = Object.create(null); sessionErrorsByWpm = Object.create(null); matchDetailsArray = [];
        }

        if (currentMode === 'quiz') {
            startQuizSequence();
            return;
        }

        document.getElementById('tableBody').innerHTML = "";
        window.lastPlayedWordId = 0; window.lastSeenGuessId = 0;
        if (pingPongListener) { db.ref(`rooms/${roomCode}/pingpong`).off('value', pingPongListener); pingPongListener = null; }
        document.getElementById('pingPongSendArea').style.display = 'none';
        document.getElementById('gameInputArea').style.display = 'flex';

        if (currentMode === 'pingpong' && (myId === roomHostId || roomCode.startsWith("TRN_"))) {
            db.ref(`rooms/${roomCode}/pingpong`).once('value', s => {
                if(!s.exists()) {
                    db.ref(`rooms/${roomCode}/pingpong`).set({ senderId: myId, word: '', wordId: 0, wordsPlayed: 0, lastGuess: null });
                }
            });
        }

        // Se stiamo recuperando la partita, non resettiamo wordIndex
        if (!isRejoining) {
            wordIndex = 0;
            totalScore = 0;
            matchDetailsArray = [];
        }

        showScreen('countdownScreen'); gameRunning = true;
        let count = 3; document.getElementById('countdownNumber').textContent = count;

        const interval = setInterval(() => {
            if (count > 1) { count--; document.getElementById('countdownNumber').textContent = count; playBeep(600, 0.1); }
            else {
                clearInterval(interval);

                if (myId === roomHostId) {
                    db.ref(`rooms/${roomCode}`).update({ status: 'playing' });
                }

                document.getElementById('countdownNumber').textContent = (currentLang === 'en' ? 'GO!' : 'VIA!');
                playBeep(800, 0.3);
                setTimeout(() => {
                    if (!gameRunning) return;
                    showScreen('gameArea');

                    if (currentMode === 'pingpong') {
                        setupPingPongListener();
                    } else {
                        setTimeout(() => document.getElementById('permanentGameInput').focus(), 200);
                        setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
                    }
                }, 500);
            }
        }, 1000);
    }

    function resumeGameSequence() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gameRunning = true;
        isRejoining = false; // Reset flag after use

        document.getElementById('wpmDisplay').textContent = `WPM: ${currentWpm}${isFixedSpeed ? ' (Fix)' : ''}`;
        document.getElementById('scoreDisplay').textContent = `Punti: ${totalScore}`;

        // Ricostruisci tabella
        const body = document.getElementById('tableBody');
        body.innerHTML = "";
        matchDetailsArray.forEach(row => {
            const tr = document.createElement('tr');
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");

            const tdTyped = document.createElement('td');
            tdTyped.textContent = row.typed;

            const tdReal = document.createElement('td');
            const bReal = document.createElement('b');
            bReal.textContent = row.real;
            tdReal.appendChild(bReal);

            const tdPoints = document.createElement('td');
            tdPoints.style.color = color;
            tdPoints.style.fontWeight = 'bold';
            tdPoints.textContent = row.points;

            tr.appendChild(tdTyped);
            tr.appendChild(tdReal);
            tr.appendChild(tdPoints);
            body.appendChild(tr);
        });

        showScreen('gameArea');
        if (currentMode === 'pingpong') {
            setupPingPongListener();
        } else {
            setTimeout(() => document.getElementById('permanentGameInput').focus(), 200);
            setTimeout(() => { if (gameRunning) playNextWord(); }, 800);
        }
    }

    let ppTimerInterval = null;

    function setupPingPongListener() {
        if (pingPongListener) { db.ref(`rooms/${roomCode}/pingpong`).off('value', pingPongListener); }
        pingPongListener = db.ref(`rooms/${roomCode}/pingpong`).on('value', snap => {
            if (!gameRunning) return;
            const ppData = snap.val(); if (!ppData) return;

            if (ppData.lastGuess && ppData.lastGuess.id !== window.lastSeenGuessId) {
                window.lastSeenGuessId = ppData.lastGuess.id;

                const tr = document.createElement('tr');
                const tdTyped = document.createElement('td');
                tdTyped.textContent = ppData.lastGuess.typed || '';

                const tdReal = document.createElement('td');
                renderDiffSecure(tdReal, ppData.lastGuess.real, ppData.lastGuess.typed || '');

                const tdPoints = document.createElement('td');
                tdPoints.style.fontWeight = 'bold';
                tdPoints.style.color = ppData.lastGuess.points > 0 ? "#4caf50" :
                                       (ppData.lastGuess.points === 0 && ppData.lastGuess.typed !== ppData.lastGuess.real ? "#d32f2f" : "#999999");
                tdPoints.textContent = ppData.lastGuess.points;

                tr.appendChild(tdTyped);
                tr.appendChild(tdReal);
                tr.appendChild(tdPoints);

                document.getElementById('tableBody').appendChild(tr);
                const tableWrapper = document.getElementById('tableWrapper');
                tableWrapper.scrollTop = tableWrapper.scrollHeight;
            }

            if (ppData.wordsPlayed >= requestedWordCount) {
                if(ppTimerInterval) clearInterval(ppTimerInterval);
                finishGame(); return;
            }

            let amISender = (ppData.senderId === myId);

            if (amISender) {
                if (!ppData.word) {
                    document.getElementById('pingPongSendArea').style.display = 'flex';
                    document.getElementById('gameInputArea').style.display = 'none';
                    document.getElementById('pingPongWordToSend').value = '';
                    setTimeout(() => document.getElementById('pingPongWordToSend').focus(), 100);

                    // Inizia Timer 10 secondi
                    startPingPongTimer();
                } else {
                    if(ppTimerInterval) clearInterval(ppTimerInterval);
                    document.getElementById('pingPongSendArea').style.display = 'none';
                    document.getElementById('gameInputArea').style.display = 'flex';
                    document.getElementById('permanentGameInput').disabled = true;
                    document.getElementById('permanentGameInput').placeholder = "Avversario in decodifica...";
                    document.getElementById('permanentGameInput').value = "";
                }
            } else {
                if(ppTimerInterval) clearInterval(ppTimerInterval);
                document.getElementById('pingPongSendArea').style.display = 'none';
                document.getElementById('gameInputArea').style.display = 'flex';

                if (ppData.word && ppData.wordId > window.lastPlayedWordId) {
                    window.lastPlayedWordId = ppData.wordId;
                    gameWords[wordIndex] = ppData.word;

                    document.getElementById('permanentGameInput').disabled = false;
                    document.getElementById('permanentGameInput').placeholder = "Decodifica e scrivi...";
                    document.getElementById('permanentGameInput').value = "";
                    setTimeout(() => document.getElementById('permanentGameInput').focus(), 100);
                    inputActive = true;
                    setTimeout(() => playMorseAudio(ppData.word.toUpperCase(), currentWpm), 500);
                } else if (!ppData.word) {
                    document.getElementById('permanentGameInput').disabled = true;
                    document.getElementById('permanentGameInput').placeholder = "In attesa dell'avversario...";
                    document.getElementById('permanentGameInput').value = "";
                    inputActive = false;
                }
            }
        });
    }

    function startPingPongTimer() {
        if (ppTimerInterval) clearInterval(ppTimerInterval);
        const bar = document.getElementById('pingPongTimerProgress');
        let timeLeft = 100; // Percentuale
        bar.style.width = '100%';

        ppTimerInterval = setInterval(() => {
            timeLeft -= (100 / 300); // 300 step da 100ms = 30 secondi
            bar.style.width = Math.max(0, timeLeft) + '%';

            if (timeLeft <= 0) {
                clearInterval(ppTimerInterval);
                sendAutoPingPongWord();
            }
        }, 100);
    }

    function sendAutoPingPongWord() {
        if (!gameRunning || currentMode !== 'pingpong') return;

        // Scegli una parola a caso dal dizionario attivo
        const randomWord = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();

        db.ref(`rooms/${roomCode}/pingpong`).transaction(currentData => {
            if (currentData && !currentData.word) {
                currentData.word = randomWord;
                currentData.wordId = (currentData.wordId || 0) + 1;
            }
            return currentData;
        });
        showToast(currentLang==='it'?"Tempo scaduto! Parola inviata automaticamente.":"Time's up! Word sent automatically.");
    }

    function finishGame() {
        gameRunning = false; inputActive = false; document.getElementById('permanentGameInput').blur();
        if (ppTimerInterval) clearInterval(ppTimerInterval);
        if (quizTimerInterval) clearInterval(quizTimerInterval);
        if (pingPongListener) { db.ref(`rooms/${roomCode}/pingpong`).off('value', pingPongListener); pingPongListener = null; }

        localStorage.removeItem(STORAGE_ROOM_KEY);
        isRejoining = false;
        isChallenging = false;

        showScreen('leaderboardScreen');

        if (roomCode) {
            const myPlayerRef = db.ref(`rooms/${roomCode}/players/${myId}`);
            myPlayerRef.update({
                finished: true,
                score: totalScore,
                wpm: currentWpm,
                matchDetails: matchDetailsArray
            });
            myPlayerRef.onDisconnect().cancel();
        }

        if (totalScore > 0 && !roomCode.startsWith("TRN_")) {
            // Recupera la lista aggiornata dei giocatori per determinare se è Solo o Multi
            db.ref(`rooms/${roomCode}/players`).once('value', snapshot => {
                const players = snapshot.val() || {};
                const finalPCount = Object.keys(players).length;
                const isReallySolo = isSinglePlayer || (finalPCount < 2);
                let dbPath = '';

                if (currentMode === 'callsign') dbPath = `leaderboard/callsign/global/${myId}`;
                else if (currentMode === 'pingpong') dbPath = `leaderboard/pingpong/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}/${myId}`;
                else if (currentMode === 'chars') dbPath = `leaderboard/chars/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}/${myId}`;
                else if (currentMode === 'quiz') dbPath = `leaderboard/quiz/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}/${myId}`;
                else dbPath = `leaderboard/standard/${isReallySolo ? 'single' : 'multi'}_${requestedWordCount}/${myId}`;

                if (currentMode !== 'callsign') {
                    let select = document.getElementById('lbWordFilter');
                    if (!Array.from(select.options).some(opt => opt.value == requestedWordCount) && requestedWordCount !== 'all') {
                        let opt = document.createElement('option'); opt.value = requestedWordCount; opt.text = `${requestedWordCount} Stringhe`; select.add(opt);
                    }
                    select.value = requestedWordCount;
                }

                const globalUserRef = db.ref(dbPath);
                globalUserRef.once('value', snap => {
                    let oldData = snap.val();
                    if (!oldData || totalScore > oldData.score) {
                        const currentUsername = myPrivacy ? "" : tgUsername;
                        globalUserRef.set({ name: myName, username: currentUsername, score: totalScore, wpm: currentWpm, wordCount: requestedWordCount, date: new Date().toLocaleDateString('it-IT') });
                    }
                });
            });
        }

        if (matchDetailsArray.length > 0) {
            const historyRef = db.ref(`users/${myId}/history`).push();
            historyRef.set({ date: firebase.database.ServerValue.TIMESTAMP, mode: currentMode, score: totalScore, wpm: currentWpm, type: isSinglePlayer ? 'single' : 'multi', wordCount: requestedWordCount, details: matchDetailsArray });

            // Aggiorna Attività e Medaglie
            updateActivity(totalScore > 0);

            if (Object.keys(sessionCharErrors).length > 0) {
                const statsRef = db.ref(`users/${myId}/stats/charErrors`);
                statsRef.once('value', snap => {
                    let currentErrors = snap.val() || {};
                    for (let char in sessionCharErrors) currentErrors[char] = (currentErrors[char] || 0) + sessionCharErrors[char];
                    statsRef.set(currentErrors);
                });
            }
            if (Object.keys(sessionErrorsByWpm).length > 0) {
                const wpmStatsRef = db.ref(`users/${myId}/stats/errorsByWpm`);
                wpmStatsRef.once('value', snap => {
                    let currentWpmErrs = snap.val() || {};
                    for (let w in sessionErrorsByWpm) {
                        if(!currentWpmErrs[w]) currentWpmErrs[w] = {};
                        for (let c in sessionErrorsByWpm[w]) currentWpmErrs[w][c] = (currentWpmErrs[w][c] || 0) + sessionErrorsByWpm[w][c];
                    }
                    wpmStatsRef.set(currentWpmErrs);
                });
            }
        }

        if (roomCode && roomCode.startsWith("TRN_")) { activeTab="room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
        else if (isSinglePlayer && currentMode === 'callsign') { activeTab = "cwfreak"; showLeaderboardTab('tabGlobalCWFreakBtn'); }
        else if (isSinglePlayer && currentMode === 'pingpong') { activeTab = "pingpong"; showLeaderboardTab('tabGlobalPingPongBtn'); }
        else if (isSinglePlayer) { activeTab = "std_single"; showLeaderboardTab('tabGlobalStandardSingleBtn'); }
        else { activeTab = "room"; showLeaderboardTab('tabRoomBtn'); listenToRoomLeaderboard(); }
    }

    document.getElementById('quitGameBtn').addEventListener('click', () => { if (confirm("Vuoi abbandonare la partita?")) { gameRunning = false; exitRoomCleanly(); } });

    document.getElementById('startMultiplayerBtn').addEventListener('click', () => {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const playersCount = snap.exists() ? Object.keys(snap.val()).length : 0;
            if (currentMode === 'pingpong' && playersCount < 2) {
                alert("La modalità Ping Pong è una sfida a turni e richiede almeno 2 giocatori in stanza per iniziare!");
                return;
            }
            db.ref(`rooms/${roomCode}`).update({ status: 'countdown', expiresAt: null });
        });
    });

    document.getElementById('deleteRoomBtn').addEventListener('click', () => {
        if (confirm("Eliminare questa stanza?")) {
            const rc = roomCode;
            db.ref(`rooms/${rc}`).remove().then(() => {
                exitRoomCleanly(true);
            });
        }
    });

    document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
        exitRoomCleanly();
    });

    document.getElementById('deleteDataBtn').addEventListener('click', async () => {
        if (confirm("⚠️ Eliminerai per sempre TUTTI i tuoi dati, inclusa l'appartenenza a squadre, classifiche e statistiche. Confermi?")) {
            try {
                await db.ref(`leaderboard`).once('value', snapshot => {
                    snapshot.forEach(mode => { mode.forEach(type => { type.forEach(record => {
                        if(record.key === myId || record.key.startsWith(myId + "_")) record.ref.remove();
                    }); }); });
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
                        const trn = trns[trnId];
                        if (trn.matches) {
                            for (let mId in trn.matches) {
                                const m = trn.matches[mId];
                                if (m.playerA && m.playerA.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).remove();
                                if (m.playerB && m.playerB.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).remove();
                            }
                        }
                    }
                }

                await db.ref(`users/${myId}`).remove();
                alert("Dati, affiliazioni alle squadre e statistiche eliminati definitivamente.");
                window.Telegram.WebApp.close();
            } catch (e) { alert("Errore: " + e.message); console.error(e); }
        }
    });

    document.getElementById('saveAliasBtn').addEventListener('click', async () => {
        const alias = document.getElementById('userAliasInput').value.trim();
        const privacy = document.getElementById('privacyUsernameCheckbox').checked;

        if (privacy && !alias) {
            alert("L'Alias è obbligatorio se nascondi lo username Telegram!");
            return;
        }

        if (alias.length > 15) return alert("Alias troppo lungo (max 15 caratteri).");

        const newName = alias || tgUser.first_name;
        const currentUsername = privacy ? "" : tgUsername;

        try {
            await db.ref(`users/${myId}`).update({
                alias: alias || null,
                privacyUsername: privacy
            });

            myName = newName;
            myPrivacy = privacy;
            document.getElementById('playerName').textContent = myName;
            showToast("Profilo aggiornato!");

            // 1. Aggiorna Presenza (Online)
            await db.ref(`presence/${myId}`).update({
                name: myName,
                username: currentUsername
            });

            // 2. Aggiorna Attività (Classifiche di partecipazione attuali)
            const now = new Date();
            const dKey = now.toISOString().split('T')[0];
            const wKey = getWeekNumber(now);
            const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

            const actPaths = [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`];
            for (const path of actPaths) {
                const actRef = db.ref(`${path}/${myId}`);
                const actSnap = await actRef.once('value');
                if (actSnap.exists()) {
                    await actRef.update({ name: myName });
                }
            }

            // 3. Aggiorna nelle squadre
            if (myTeamId) {
                await db.ref(`teams/${myTeamId}/members/${myId}`).update({
                    name: myName,
                    username: currentUsername
                });
            }

            // 4. Aggiorna nei match attivi
            const trnsSnap = await db.ref('tournaments').once('value');
            if (trnsSnap.exists()) {
                const trns = trnsSnap.val();
                for (let trnId in trns) {
                    const trn = trns[trnId];
                    if (trn.status !== 'finished' && trn.matches) {
                        for (let mId in trn.matches) {
                            const m = trn.matches[mId];
                            if (m.playerA && m.playerA.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).update({ name: myName, username: currentUsername });
                            if (m.playerB && m.playerB.id === myId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).update({ name: myName, username: currentUsername });
                        }
                    }
                }
            }

            // 5. Aggiorna classifiche record
            const lbPaths = ['callsign/global', 'standard', 'pingpong', 'chars'];
            for (const path of lbPaths) {
                const ref = db.ref(`leaderboard/${path}`);
                const snap = await ref.once('value');
                if (snap.exists()) {
                    snap.forEach(subNode => {
                        if (path === 'callsign/global') {
                            if (subNode.key === myId) subNode.ref.update({ name: myName, username: currentUsername });
                        } else {
                            subNode.forEach(userRecord => {
                                if (userRecord.key === myId) userRecord.ref.update({ name: myName, username: currentUsername });
                            });
                        }
                    });
                }
            }
        } catch(e) {
            console.error("Errore salvataggio profilo:", e);
            alert("Errore durante il salvataggio.");
        }
    });

    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
        if (confirm(currentLang === 'it' ? "Vuoi azzerare tutte le tue statistiche (errori caratteri, WPM e storico partite)? Questa operazione non può essere annullata." : "Do you want to reset all your statistics (character errors, WPM, and match history)? This action cannot be undone.")) {
            try {
                // Rimuove statistiche e storico dal database
                await Promise.all([
                    db.ref(`users/${myId}/stats`).remove(),
                    db.ref(`users/${myId}/history`).remove()
                ]);
                showToast(currentLang === 'it' ? "Statistiche azzerate correttamente!" : "Statistics reset successfully!");
                showProfileScreen(); // Ricarica la schermata del profilo
            } catch(e) {
                console.error("Errore durante il reset:", e);
                alert("Errore durante il reset delle statistiche.");
            }
        }
    });




    let userMatchHistory = [];

    window.showProfileScreen = function() {
        showScreen('profileScreen');
        document.getElementById('errorChartContainer').textContent = 'Caricamento...';
        document.getElementById('wpmErrorChartContainer').textContent = 'Caricamento...';
        const list = document.getElementById('matchHistoryList');
        list.textContent = 'Caricamento...';

        db.ref(`users/${myId}/stats/charErrors`).once('value').then(snap => {
            const errors = snap.val() || {}; const container = document.getElementById('errorChartContainer'); container.innerHTML = '';
            const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
            if(sorted.length === 0) {
                const p = document.createElement('p');
                p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)';
                p.textContent = 'Nessun errore.';
                container.appendChild(p);
            } else {
                let maxErr = sorted[0][1];
                sorted.forEach(([char, count]) => {
                    let pct = (count / maxErr) * 100;
                    let row = document.createElement('div');
                    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.marginBottom = '4px';

                    const charSpan = document.createElement('span');
                    charSpan.style.width = '20px'; charSpan.style.fontWeight = 'bold';
                    charSpan.textContent = char;

                    const barContainer = document.createElement('div');
                    barContainer.style.flexGrow = '1'; barContainer.style.background = 'var(--bg-color)';
                    barContainer.style.border = '1px solid var(--hint-color)'; barContainer.style.borderRadius = '4px';
                    barContainer.style.height = '12px'; barContainer.style.margin = '0 5px'; barContainer.style.overflow = 'hidden';

                    const bar = document.createElement('div');
                    bar.style.width = pct + '%'; bar.style.background = '#d32f2f'; bar.style.height = '100%';
                    barContainer.appendChild(bar);

                    const countSpan = document.createElement('span');
                    countSpan.style.width = '25px'; countSpan.style.textAlign = 'right';
                    countSpan.style.fontSize = '0.9em'; countSpan.style.fontWeight = 'bold';
                    countSpan.textContent = count;

                    row.appendChild(charSpan);
                    row.appendChild(barContainer);
                    row.appendChild(countSpan);
                    container.appendChild(row);
                });
            }
        });
        db.ref(`users/${myId}/stats/errorsByWpm`).once('value').then(snap => {
            const wpmErrors = snap.val() || {}; const container = document.getElementById('wpmErrorChartContainer'); container.innerHTML = '';
            if(Object.keys(wpmErrors).length === 0) {
                const p = document.createElement('p');
                p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)';
                p.textContent = 'Nessun errore per WPM.';
                container.appendChild(p);
                return;
            }
            let wpmSorted = Object.keys(wpmErrors).sort((a,b) => parseInt(b) - parseInt(a));
            wpmSorted.forEach(wpm => {
                let charsAtWpm = wpmErrors[wpm]; let totalErrs = Object.values(charsAtWpm).reduce((acc, curr) => acc + curr, 0);
                let topChar = Object.entries(charsAtWpm).sort((a,b) => b[1] - a[1])[0];
                let row = document.createElement('div'); row.style.marginBottom = '8px'; row.style.borderBottom = '1px solid var(--hint-color)'; row.style.paddingBottom = '4px';

                const topDiv = document.createElement('div');
                topDiv.style.display = 'flex'; topDiv.style.justifyContent = 'space-between';
                topDiv.style.fontWeight = 'bold'; topDiv.style.color = 'var(--link-color)';

                const wpmSpan = document.createElement('span'); wpmSpan.textContent = wpm + " WPM";
                const errSpan = document.createElement('span'); errSpan.textContent = "Tot: " + totalErrs + " err";
                topDiv.appendChild(wpmSpan); topDiv.appendChild(errSpan);

                const detailDiv = document.createElement('div');
                detailDiv.style.fontSize = '0.85em'; detailDiv.style.color = 'var(--text-color)';
                detailDiv.appendChild(document.createTextNode("Peggior lettera: "));
                const bChar = document.createElement('b'); bChar.textContent = topChar[0];
                detailDiv.appendChild(bChar);
                detailDiv.appendChild(document.createTextNode(` (${topChar[1]} volte)`));

                row.appendChild(topDiv);
                row.appendChild(detailDiv);
                container.appendChild(row);
            });
        });
        db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(30).once('value').then(snap => {
            const list = document.getElementById('matchHistoryList');
            list.innerHTML = ''; userMatchHistory = [];
            snap.forEach(child => { userMatchHistory.push({ key: child.key, ...child.val() }); }); userMatchHistory.reverse();
            if (userMatchHistory.length === 0) {
                const li = document.createElement('li');
                li.style.justifyContent = 'center'; li.style.color = 'var(--hint-color)';
                li.textContent = 'Nessuna partita giocata.';
                list.appendChild(li);
                return;
            }
            userMatchHistory.forEach(match => {
                const d = new Date(match.date || Date.now()); const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
                const li = document.createElement('li'); li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';

                let modeIcon = '🔤 Parole';
                if (match.mode === 'callsign') modeIcon = '🎙️ Nom.';
                else if (match.mode === 'pingpong') modeIcon = '🏓 Ping Pong';
                else if (match.mode === 'chars') modeIcon = '⌨️ Carat.';

                const topDiv = document.createElement('div');
                topDiv.style.display = 'flex'; topDiv.style.justifyContent = 'space-between'; topDiv.style.width = '100%'; topDiv.style.marginBottom = '5px';
                const modeSpan = document.createElement('span'); modeSpan.style.fontSize = '0.85em'; modeSpan.style.fontWeight = 'bold';
                modeSpan.textContent = `${modeIcon} (${match.type})`;
                const dateSpan = document.createElement('span'); dateSpan.style.fontSize = '0.8em'; dateSpan.style.color = 'var(--hint-color)';
                dateSpan.textContent = dateStr;
                topDiv.appendChild(modeSpan); topDiv.appendChild(dateSpan);

                const botDiv = document.createElement('div');
                botDiv.style.display = 'flex'; botDiv.style.justifyContent = 'space-between'; botDiv.style.width = '100%'; botDiv.style.alignItems = 'center';

                const scoreSpan = document.createElement('span');
                const bScore = document.createElement('b'); bScore.textContent = match.score + " pt";
                const smallWpm = document.createElement('small'); smallWpm.textContent = ` (${match.wpm} WPM)`;
                scoreSpan.appendChild(bScore); scoreSpan.appendChild(smallWpm);

                const btnDiv = document.createElement('div');
                btnDiv.style.display = 'flex'; btnDiv.style.gap = '5px';

                const vBtn = document.createElement('button'); vBtn.className = "action-btn-small btn-secondary"; vBtn.textContent = "Vedi";
                vBtn.onclick = () => openMatchDetails(match.key);
                const dBtn = document.createElement('button'); dBtn.className = "action-btn-small btn-danger"; dBtn.textContent = "X";
                dBtn.onclick = () => deleteHistoryItem(match.key);

                btnDiv.appendChild(vBtn); btnDiv.appendChild(dBtn);
                botDiv.appendChild(scoreSpan); botDiv.appendChild(btnDiv);

                li.appendChild(topDiv);
                li.appendChild(botDiv);
                list.appendChild(li);
            });
        });
    }

    window.openMatchDetails = function(matchKey) {
        const match = userMatchHistory.find(m => m.key === matchKey); if(!match) return;
        const details = match.details || []; const body = document.getElementById('matchDetailsBody'); body.innerHTML = '';
        details.forEach(row => {
            const tr = document.createElement('tr');
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");

            const tdTyped = document.createElement('td');
            tdTyped.textContent = row.typed || '-';

            const tdReal = document.createElement('td');
            const bReal = document.createElement('b');
            renderDiffSecure(bReal, row.real, row.typed || '');
            tdReal.appendChild(bReal);

            const tdPoints = document.createElement('td');
            tdPoints.style.color = color;
            tdPoints.style.fontWeight = 'bold';
            tdPoints.textContent = row.points;

            tr.appendChild(tdTyped);
            tr.appendChild(tdReal);
            tr.appendChild(tdPoints);
            body.appendChild(tr);
        });
        document.getElementById('matchDetailsModal').style.display = 'flex';
    }

    window.deleteHistoryItem = function(key) {
        if(confirm("Eliminare questa partita dallo storico? Le statistiche verranno ricalcolate.")) {
            db.ref(`users/${myId}/history/${key}`).remove().then(() => showProfileScreen());
        }
    }

    function showLeaderboardTab(tabId) {
        // Nascondi i vecchi bottoni e usa il selettore se preferito,
        // ma per ora manteniamo tabId per compatibilità e sincronizziamo il menu a tendina.
        const selector = document.getElementById('lbModeSelect');
        const mapping = {
            'tabRoomBtn': 'room',
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

        // Cerca la chiave se tabId è un ID bottone, altrimenti usa tabId come valore
        let modeValue = mapping[tabId] || tabId;
        selector.value = modeValue;

        const filterArea = document.getElementById('lbFilterArea'),
              roomWinnerBanner = document.getElementById('roomWinnerBanner'),
              waitingText = document.getElementById('waitingOthersText'),
              trnSubTabs = document.getElementById('trnSubTabs');

        trnSubTabs.style.display = 'none';

        if (modeValue === 'room') {
            filterArea.style.display = 'none'; roomWinnerBanner.style.display = 'block'; document.getElementById('leaderboardContainer').innerHTML = '';
            if (roomCode) db.ref(`rooms/${roomCode}/players`).once('value', snap => renderRoomLeaderboard(snap.val() || {}));
            else {
                const p = document.createElement('p');
                p.style.textAlign = 'center';
                p.textContent = 'Nessuna partita attiva.';
                document.getElementById('leaderboardContainer').appendChild(p);
                waitingText.style.display = 'none';
            }
        } else if (modeValue === 'trn_global') {
            filterArea.style.display = 'none'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            trnSubTabs.style.display = 'flex';
            document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
            document.getElementById('btnTrnGlobalLB').classList.add('active-tab');
            fetchAndRenderGlobalLeaderboard('tournaments', null);
        } else if (modeValue === 'cwfreak') {
            filterArea.style.display = 'none'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            fetchAndRenderGlobalLeaderboard('callsign', null);
        } else if (modeValue === 'pingpong') {
            filterArea.style.display = 'block'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            populateDynamicFilters('recent_matches/pingpong');
            let wc = document.getElementById('lbWordFilter').value;
            fetchAndRenderGlobalLeaderboard('pingpong', wc);
        } else if (modeValue === 'chars_multi') {
            filterArea.style.display = 'block'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            populateDynamicFilters('recent_matches/chars_multi');
            let wc = document.getElementById('lbWordFilter').value;
            fetchAndRenderGlobalLeaderboard('chars_multi', wc);
        } else if (modeValue === 'chars_single') {
            filterArea.style.display = 'block'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            populateDynamicFilters('chars', 'single');
            let wc = document.getElementById('lbWordFilter').value;
            fetchAndRenderGlobalLeaderboard('chars_single', wc);
        } else if (modeValue === 'quiz_multi') {
            filterArea.style.display = 'block'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            populateDynamicFilters('recent_matches/quiz_multi');
            let wc = document.getElementById('lbWordFilter').value;
            fetchAndRenderGlobalLeaderboard('quiz_multi', wc);
        } else if (modeValue === 'quiz_single') {
            filterArea.style.display = 'block'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            populateDynamicFilters('quiz', 'single');
            let wc = document.getElementById('lbWordFilter').value;
            fetchAndRenderGlobalLeaderboard('quiz_single', wc);
        } else {
            filterArea.style.display = 'block'; roomWinnerBanner.style.display = 'none'; waitingText.style.display = 'none';
            let type = modeValue === 'std_multi' ? 'multi' : 'single';
            if (type === 'multi') {
                populateDynamicFilters('recent_matches/standard_multi');
                let wc = document.getElementById('lbWordFilter').value;
                fetchAndRenderGlobalLeaderboard('standard_multi', wc);
            } else {
                populateDynamicFilters('standard', 'single');
                let wc = document.getElementById('lbWordFilter').value;
                fetchAndRenderGlobalLeaderboard('standard_single', wc);
            }
        }
    }

    // Listener per il nuovo menu a tendina
    document.getElementById('lbModeSelect').addEventListener('change', (e) => {
        activeTab = e.target.value;
        showLeaderboardTab(e.target.value);
    });

    document.getElementById('btnTrnGlobalLB').addEventListener('click', () => {
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
        document.getElementById('btnTrnGlobalLB').classList.add('active-tab');
        fetchAndRenderGlobalLeaderboard('tournaments', null);
    });
    document.getElementById('btnTrnActiveLB').addEventListener('click', () => {
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
        document.getElementById('btnTrnActiveLB').classList.add('active-tab');
        fetchAndRenderGlobalLeaderboard('active_tournament', null);
    });

    document.getElementById('lbWordFilter').addEventListener('change', () => {
        if (activeTab === "std_multi") showLeaderboardTab('tabGlobalStandardMultiBtn');
        else if (activeTab === "std_single") showLeaderboardTab('tabGlobalStandardSingleBtn');
        else if (activeTab === "pingpong") showLeaderboardTab('tabGlobalPingPongBtn');
    });

    function populateDynamicFilters(modePath, subTypeFilter = "") {
        const select = document.getElementById('lbWordFilter');
        const currentValue = select.value;
        db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
            let options = ['<option value="all">Tutte le categorie</option>'];
            let counts = [];
            snapshot.forEach(wordCountNode => {
                const key = wordCountNode.key;
                // Se siamo nel nuovo percorso recent_matches, la chiave è direttamente il numero parole
                if (modePath.startsWith('recent_matches')) {
                    if (key !== 'unknown' && !counts.includes(key)) counts.push(key);
                } else {
                    // Vecchia logica per record singoli
                    if (!subTypeFilter || key.startsWith(subTypeFilter + "_")) {
                        const count = key.split('_').pop();
                        if (!counts.includes(count)) counts.push(count);
                    }
                }
            });
            counts.sort((a,b) => parseInt(a) - parseInt(b)).forEach(c => {
                options.push(`<option value="${c}">${c} Stringhe</option>`);
            });
            select.innerHTML = options.join('');
            if (counts.includes(currentValue) || currentValue === 'all') select.value = currentValue;
        });
    }

    // Ascoltatore che decreta il vincitore e segna 1 o 0 al torneo
    function listenToRoomLeaderboard() {
        if (!roomCode) return;
        if (roomLeaderboardListener) db.ref(`rooms/${roomCode}`).off('value', roomLeaderboardListener);

        roomLeaderboardListener = db.ref(`rooms/${roomCode}`).on('value', snapshot => {
            if (!snapshot.exists()) return;
            const roomData = snapshot.val(), players = roomData.players || {};
            if (activeTab === "room") renderRoomLeaderboard(players);

            let allFinished = true; Object.values(players).forEach(p => { if (!p.finished) allFinished = false; });

            if (allFinished && roomData.status !== 'finished' && Object.keys(players).length > 0) {
                db.ref(`rooms/${roomCode}/status`).set('finished');

                // Salva il match nel database globale SOLO SE ci sono almeno 2 giocatori
                const finalPCount = Object.keys(players).length;
                if (finalPCount >= 2) {
                    if (roomData.type === 'multi' || currentMode === 'pingpong' || currentMode === 'chars' || currentMode === 'quiz') {
                        saveMatchToGlobalHistory(players, roomData);
                    }
                }

                if (roomCode.startsWith("TRN_")) {
                    const matchId = roomCode.replace("TRN_", "");
                    let highestScore = -1, winnerTeamId = null;

                    Object.values(players).forEach(p => {
                        if (p.score > highestScore) {
                            highestScore = p.score;
                            winnerTeamId = p.teamId;
                        } else if (p.score === highestScore) {
                            winnerTeamId = "tie";
                        }
                    });

                    if (winnerTeamId && winnerTeamId !== "tie" && activeTrnId) {
                        db.ref(`tournaments/${activeTrnId}/matches/${matchId}`).update({ status: 'finished', winnerTeamId: winnerTeamId }).then(() => {
                            checkTournamentCompletion(activeTrnId);
                        });
                        // +1 punto a chi vince
                        db.ref(`tournaments/${activeTrnId}/standings/${winnerTeamId}`).transaction(teamStanding => {
                            if (teamStanding) teamStanding.points = (teamStanding.points || 0) + 1;
                            return teamStanding;
                        });
                    } else if (winnerTeamId === "tie" && activeTrnId) {
                        // Pareggio, nessun punto (+0)
                        db.ref(`tournaments/${activeTrnId}/matches/${matchId}`).update({ status: 'finished', winnerTeamId: 'tie' }).then(() => {
                            checkTournamentCompletion(activeTrnId);
                        });
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

            let allMatchesFinished = true;
            Object.values(trn.matches).forEach(m => {
                if (m.status !== 'finished') allMatchesFinished = false;
            });

            if (allMatchesFinished) {
                db.ref(`tournaments/${trnId}/status`).set('finished');
                showToast("Torneo completato! Spostato in archivio.");

                // Aggiorna classifica globale tornei (per squadra)
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
        const container = document.getElementById('leaderboardContainer'); container.innerHTML = '';
        const waitingText = document.getElementById('waitingOthersText'); let allFinished = true;

        const playersArray = Object.entries(players).map(([id, data]) => {
            return { id: id, name: data.name || "Sconosciuto", username: data.username, score: data.score || 0, wpm: data.wpm || 0, finished: data.finished, matchDetails: data.matchDetails || [] };
        });
        if(playersArray.length===0) return;
        playersArray.forEach(p => { if (!p.finished) allFinished = false; });
        waitingText.style.display = allFinished ? 'none' : 'block';

        // Se è multiplayer o pingpong e tutti hanno finito, mostriamo la vista "Testa a Testa"
        const isMultiOrPP = roomCode && (roomCode.startsWith("TRN_") || currentMode === 'pingpong' || (playersArray.length > 1));

        if (allFinished && isMultiOrPP) {
            renderHeadToHeadView(playersArray, container);
        } else {
            // Vista classica a lista
            playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, index) => {
                const row = document.createElement('div');
                row.className = 'leaderboard-row';

                let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

                const leftSpan = document.createElement('span');
                const medalText = document.createTextNode(medal + " ");
                leftSpan.appendChild(medalText);

                if (player.username) {
                    const nameLink = document.createElement('span');
                    nameLink.style.color = 'var(--link-color)';
                    nameLink.style.cursor = 'pointer';
                    nameLink.style.textDecoration = 'underline';
                    nameLink.textContent = player.name;
                    nameLink.onclick = () => openTelegramProfile(player.username);
                    leftSpan.appendChild(nameLink);
                } else {
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = player.name;
                    leftSpan.appendChild(nameSpan);
                }

                leftSpan.appendChild(document.createElement('br'));
                const wpmSmall = document.createElement('small');
                wpmSmall.style.color = 'var(--hint-color)';
                wpmSmall.textContent = `(${player.wpm || 0} WPM)`;
                leftSpan.appendChild(wpmSmall);

                const rightSpan = document.createElement('span');
                const scoreB = document.createElement('b');
                scoreB.textContent = `${player.score} pt`;
                rightSpan.appendChild(scoreB);

                row.appendChild(leftSpan);
                row.appendChild(rightSpan);
                container.appendChild(row);
            });
        }

        if(allFinished && playersArray.length > 0) {
            const winnerText = currentLang === 'it' ? "Vincitore: " : "Winner: ";
            const matchWinnerText = currentLang === 'it' ? "Vince il match: " : "Match winner: ";
            document.getElementById('roomWinnerBanner').textContent = roomCode.startsWith("TRN_") ? `🏆 ${matchWinnerText}${playersArray[0].name}` : `🏆 ${winnerText}${playersArray[0].name}`;
        }
    }

    function renderHeadToHeadView(players, container) {
        const h2h = document.createElement('div');
        h2h.className = 'h2h-container';

        // Ordiniamo per punteggio decrescente
        players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm));
        const maxScore = players[0].score;

        players.forEach((p, idx) => {
            const card = document.createElement('div');
            card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');

            const nameDiv = document.createElement('div');
            nameDiv.className = 'h2h-name';
            nameDiv.textContent = p.name;
            if (p.id === myId) {
                const meSmall = document.createElement('small');
                meSmall.textContent = ` (${currentLang === 'it' ? 'Tu' : 'You'})`;
                nameDiv.appendChild(meSmall);
            }
            card.appendChild(nameDiv);

            const statsDiv = document.createElement('div');
            statsDiv.className = 'h2h-stats';

            const pointsRow = createH2HStatRow(currentLang === 'it' ? 'Punti:' : 'Points:', p.score, '#4caf50');
            const speedRow = createH2HStatRow(currentLang === 'it' ? 'Velocità:' : 'Speed:', `${p.wpm} WPM`, 'var(--link-color)');

            statsDiv.appendChild(pointsRow);
            statsDiv.appendChild(speedRow);
            card.appendChild(statsDiv);

            const isMe = (p.id === myId);
            const hintDiv = document.createElement('div');
            hintDiv.className = 'h2h-hint';
            if (isMe) {
                hintDiv.textContent = currentLang === 'it' ? 'Clicca per dettagli' : 'Click for details';
            } else {
                hintDiv.textContent = currentLang === 'it' ? 'Dettagli privati' : 'Details are private';
                hintDiv.style.opacity = "0.5";
            }
            card.appendChild(hintDiv);

            card.onclick = () => {
                if (!isMe) {
                    showToast(currentLang === 'it' ? "Puoi vedere solo i tuoi dettagli." : "You can only view your own details.");
                    return;
                }

                if (p.matchDetails && p.matchDetails.length > 0) {
                    showPlayerDetailsModal(p.name, p.matchDetails);
                } else if (isMe && matchDetailsArray.length > 0) {
                    showPlayerDetailsModal(p.name, matchDetailsArray);
                } else {
                    showToast(currentLang === 'it' ? "Dettagli non disponibili" : "Details not available");
                }
            };

            h2h.appendChild(card);
        });

        container.appendChild(h2h);
    }

    function createH2HStatRow(label, value, color) {
        const row = document.createElement('div');
        row.className = 'h2h-stat-row';
        const lblSpan = document.createElement('span');
        lblSpan.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.className = 'h2h-val';
        valSpan.style.color = color;
        valSpan.textContent = value;
        row.appendChild(lblSpan);
        row.appendChild(valSpan);
        return row;
    }

    function showPlayerDetailsModal(name, details) {
        const modal = document.getElementById('matchDetailsModal');
        const body = document.getElementById('matchDetailsBody');
        body.innerHTML = '';

        // Titolo dinamico
        modal.querySelector('h3').textContent = `${currentLang === 'it' ? 'Dettagli Partita di' : 'Match Details for'} ${name}`;

        details.forEach(row => {
            const tr = document.createElement('tr');
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");

            const tdTyped = document.createElement('td');
            tdTyped.textContent = row.typed || '-';

            const tdReal = document.createElement('td');
            const bReal = document.createElement('b');
            renderDiffSecure(bReal, row.real, row.typed || '');
            tdReal.appendChild(bReal);

            const tdPoints = document.createElement('td');
            tdPoints.style.color = color;
            tdPoints.style.fontWeight = 'bold';
            tdPoints.textContent = row.points;

            tr.appendChild(tdTyped);
            tr.appendChild(tdReal);
            tr.appendChild(tdPoints);
            body.appendChild(tr);
        });

        modal.style.display = 'flex';
    }

    function saveMatchToGlobalHistory(players, roomData) {
        // Solo l'host salva per evitare duplicati
        if (myId !== roomData.hostId) return;

        const matchId = Date.now().toString();
        let modePath = 'standard_multi';
        if (currentMode === 'pingpong') modePath = 'pingpong';
        else if (currentMode === 'chars') modePath = 'chars_multi';
        else if (currentMode === 'quiz') modePath = 'quiz_multi';

        // Per il pingpong usiamo wordCount come fallback se manca
        const subPath = roomData.wordCount || 'all';

        const matchData = {
            players: Object.entries(players).map(([id, data]) => ({
                id,
                name: data.name,
                username: data.username || "",
                score: data.score || 0,
                wpm: data.wpm || 0,
                matchDetails: data.matchDetails || []
            })),
            mode: currentMode,
            wordCount: roomData.wordCount,
            date: new Date().toLocaleDateString('it-IT'),
            ts: firebase.database.ServerValue.TIMESTAMP
        };

        db.ref(`leaderboard/recent_matches/${modePath}/${subPath}/${matchId}`).set(matchData);
    }

    function fetchAndRenderGlobalLeaderboard(tabType, filterWordCount) {
        const container = document.getElementById('leaderboardContainer'); container.innerHTML = '<p style="text-align:center;">Caricamento...</p>';

        // Per Ping Pong, Multiplayer Standard, Caratteri Multi e Quiz Multi mostriamo le SFIDE RECENTI
        if (tabType === 'pingpong' || tabType === 'standard_multi' || tabType === 'chars_multi' || tabType === 'quiz_multi') {
            const modePath = tabType === 'pingpong' ? 'pingpong' :
                             (tabType === 'chars_multi' ? 'chars_multi' :
                             (tabType === 'quiz_multi' ? 'quiz_multi' : 'standard_multi'));

            db.ref(`leaderboard/recent_matches/${modePath}`).once('value', snapshot => {
                let matches = [];
                snapshot.forEach(wordCountNode => {
                    const wc = wordCountNode.key;
                    if (filterWordCount !== 'all' && wc !== filterWordCount) return;

                    wordCountNode.forEach(matchNode => {
                        matches.push(matchNode.val());
                    });
                });

                // Ordina per data (più recenti prima)
                matches.sort((a,b) => (b.ts || 0) - (a.ts || 0));
                renderMatchesHistoryHTML(matches.slice(0, 30), container);
            });
            return;
        }

        if (tabType === 'callsign') {
            db.ref(`leaderboard/callsign/global`).orderByChild('score').limitToLast(50).once('value', snapshot => {
                let players = []; snapshot.forEach(child => { players.push(child.val()); });
                renderPlayersListHTML(players.reverse(), container, false);
            });
        } else if (tabType === 'tournaments') {
            db.ref(`leaderboard/tournaments`).orderByChild('score').limitToLast(50).once('value', snapshot => {
                let teams = []; snapshot.forEach(child => { teams.push(child.val()); });
                renderPlayersListHTML(teams.reverse(), container, false, true);
            });
        } else if (tabType === 'active_tournament') {
            if (!activeTrnId) {
                container.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang==='it' ? "Non sei iscritto a nessun torneo attivo." : "You are not enrolled in any active tournament."}</p>`;
            } else {
                db.ref(`tournaments/${activeTrnId}`).once('value', snap => {
                    const trn = snap.val();
                    if (trn && trn.standings) {
                        // Aggiungiamo il nome del torneo come intestazione nella classifica
                        const header = document.createElement('div');
                        header.style.textAlign = 'center';
                        header.style.marginBottom = '10px';
                        header.style.padding = '5px';
                        header.style.background = 'var(--sec-bg-color)';
                        header.style.borderRadius = '8px';
                        header.innerHTML = `<small style="color:var(--hint-color)">${currentLang==='it'?'Torneo Attivo:':'Active Tournament:'}</small><br><b style="color:var(--champ-color); font-size:1.1em;">${escapeHTML(trn.name)}</b>`;

                        let standings = Object.entries(trn.standings).map(([id, data]) => ({ name: data.name, score: data.points, date: currentLang==='it'?"In corso":"In progress" }));
                        standings.sort((a,b) => b.score - a.score);

                        container.innerHTML = '';
                        container.appendChild(header);

                        // Creiamo un mini-container per la lista per non sovrascrivere l'header
                        const listCont = document.createElement('div');
                        renderPlayersListHTML(standings, listCont, false, true);
                        container.appendChild(listCont);
                    } else {
                        container.innerHTML = `<p style="text-align:center; color:var(--hint-color);">${currentLang==='it'?'Dati torneo non disponibili.':'Tournament data unavailable.'}</p>`;
                    }
                });
            }
        } else {
            let isStandard = tabType.startsWith('standard');
            let isChars = tabType.startsWith('chars');
            let isQuiz = tabType.startsWith('quiz');
            let modePath = isQuiz ? 'quiz' : (isChars ? 'chars' : (isStandard ? 'standard' : 'pingpong'));
            let subType = isQuiz ? tabType.replace('quiz_', '') : (isChars ? tabType.replace('chars_', '') : (isStandard ? tabType.replace('standard_', '') : ''));

            db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
                let players = [];
                snapshot.forEach(wordCountNode => {
                    const key = wordCountNode.key;
                    // Filtro per sottotipo (es. "single" o "multi")
                    if ((isStandard || isChars || isQuiz) && !key.startsWith(subType + "_")) return;

                    // Filtro per numero parole
                    if (filterWordCount !== 'all' && !key.endsWith("_" + filterWordCount)) return;

                    wordCountNode.forEach(userNode => {
                        players.push(userNode.val());
                    });
                });

                players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm));
                players = players.slice(0, 100);
                renderPlayersListHTML(players, container, true);
            });
        }
    }

    function renderMatchesHistoryHTML(matches, container) {
        container.innerHTML = '';
        if (matches.length === 0) {
            const p = document.createElement('p');
            p.style.textAlign = 'center';
            p.style.color = 'var(--hint-color)';
            p.textContent = currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.';
            container.appendChild(p);
            return;
        }

        matches.forEach(match => {
            const matchWrapper = document.createElement('div');
            matchWrapper.style.marginBottom = "25px";
            matchWrapper.style.borderBottom = "1px dashed var(--hint-color)";
            matchWrapper.style.paddingBottom = "15px";

            const info = document.createElement('div');
            info.style.textAlign = 'center';
            info.style.fontSize = '0.8em';
            info.style.color = 'var(--hint-color)';
            info.style.marginBottom = '8px';
            info.textContent = `📅 ${match.date} - ${match.wordCount} Stringhe`;
            matchWrapper.appendChild(info);

            renderHeadToHeadView(match.players, matchWrapper);
            container.appendChild(matchWrapper);
        });
    }

    function renderPlayersListHTML(players, container, showWordCount, isTeam = false) {
        container.innerHTML = '';
        if (players.length === 0) {
            const p = document.createElement('p');
            p.style.textAlign = 'center';
            p.style.color = 'var(--hint-color)';
            p.textContent = currentLang === 'it' ? 'Nessun record trovato per questa categoria.' : 'No records found for this category.';
            container.appendChild(p);
            return;
        }

        players.forEach((player, index) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.style.padding = "8px 10px";
            row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

            const mainDiv = document.createElement('div');
            mainDiv.style.display = 'flex';
            mainDiv.style.alignItems = 'center';
            mainDiv.style.gap = '8px';
            mainDiv.style.flexGrow = '1';

            const medalDiv = document.createElement('div');
            medalDiv.style.fontSize = '1.2em';
            medalDiv.style.minWidth = '1.5em';
            medalDiv.style.textAlign = 'center';
            if (index === 0) medalDiv.textContent = "🥇";
            else if (index === 1) medalDiv.textContent = "🥈";
            else if (index === 2) medalDiv.textContent = "🥉";
            else {
                const span = document.createElement('span');
                span.style.color = 'var(--hint-color)';
                span.style.fontSize = '0.8em';
                span.textContent = (index + 1) + ".";
                medalDiv.appendChild(span);
            }

            const infoDiv = document.createElement('div');
            infoDiv.style.display = 'flex';
            infoDiv.style.flexDirection = 'column';

            const nameDiv = document.createElement('div');
            nameDiv.style.display = 'flex';
            nameDiv.style.alignItems = 'center';

            if (player.username && !isTeam) {
                const nameLink = document.createElement('span');
                nameLink.style.color = 'var(--link-color)';
                nameLink.style.cursor = 'pointer';
                nameLink.style.textDecoration = 'underline';
                nameLink.style.fontWeight = 'bold';
                nameLink.textContent = player.name;
                nameLink.onclick = () => openTelegramProfile(player.username);
                nameDiv.appendChild(nameLink);
            } else {
                const nameSpan = document.createElement('span');
                nameSpan.style.fontWeight = 'bold';
                nameSpan.textContent = player.name;
                nameDiv.appendChild(nameSpan);
            }

            if (showWordCount && player.wordCount) {
                const wcSpan = document.createElement('span');
                wcSpan.style.background = 'var(--hint-color)';
                wcSpan.style.color = 'var(--bg-color)';
                wcSpan.style.padding = '1px 4px';
                wcSpan.style.borderRadius = '3px';
                wcSpan.style.fontSize = '0.8em';
                wcSpan.style.marginLeft = '4px';
                wcSpan.textContent = player.wordCount + " str.";
                nameDiv.appendChild(wcSpan);
            }

            const dateDiv = document.createElement('div');
            dateDiv.style.fontSize = '0.75em';
            dateDiv.style.color = 'var(--hint-color)';
            let dateText = player.date + " ";
            dateDiv.textContent = dateText;
            if (!isTeam && player.wpm) {
                const wpmSpan = document.createElement('span');
                wpmSpan.style.color = 'var(--champ-color)';
                wpmSpan.style.fontWeight = 'bold';
                wpmSpan.textContent = player.wpm + " WPM";
                dateDiv.appendChild(wpmSpan);
            }

            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(dateDiv);

            mainDiv.appendChild(medalDiv);
            mainDiv.appendChild(infoDiv);

            const scoreDiv = document.createElement('div');
            scoreDiv.style.textAlign = 'right';
            const scoreB = document.createElement('b');
            scoreB.style.fontSize = '1.1em';
            scoreB.style.color = 'var(--link-color)';
            scoreB.textContent = player.score;
            const ptSpan = document.createElement('span');
            ptSpan.style.fontSize = '0.7em';
            ptSpan.style.color = 'var(--hint-color)';
            ptSpan.style.marginLeft = '2px';
            ptSpan.textContent = 'pt';
            scoreDiv.appendChild(scoreB);
            scoreDiv.appendChild(ptSpan);

            row.appendChild(mainDiv);
            row.appendChild(scoreDiv);
            container.appendChild(row);
        });
    }

    // ==========================================
    // SEZIONE SQUADRE E TORNEI
    // ==========================================
    document.getElementById('goToTeamsBtn').addEventListener('click', () => showScreen('teamsScreen'));

    function processTeamInvite(inviteTeamId) {
        db.ref(`teams/${inviteTeamId}`).once('value', snap => {
            if(snap.exists() && snap.val().status === 'open') {
                const currentUsername = myPrivacy ? "" : tgUsername;
                db.ref(`teams/${inviteTeamId}/members/${myId}`).set({ name: myName, username: currentUsername });
                tg.showAlert(`Sei entrato nella squadra ${snap.val().name}!`); showScreen('teamsScreen');
            } else { tg.showAlert("La squadra non esiste o le iscrizioni sono chiuse."); showScreen('setupScreen'); }
        });
    }

    function checkMyTeamStatus() {
        db.ref('teams').once('value', snapshot => {
            myTeamId = null; isTeamCaptain = false; myTeamName = "";
            snapshot.forEach(team => {
                if (team.child('members').hasChild(myId)) {
                    myTeamId = team.key;
                    myTeamName = team.val().name;
                    isTeamCaptain = (team.val().captainId === myId);
                }
            });
            if (myTeamId) {
                document.getElementById('noTeamView').style.display = 'none';
                document.getElementById('myTeamView').style.display = 'flex';
                listenToMyTeam(); listenToTournaments(); listenToAllTeams(true);
                switchTeamTab('gest');
            } else {
                document.getElementById('myTeamView').style.display = 'none';
                document.getElementById('noTeamView').style.display = 'flex';
                listenToAllTeams(false);
                switchTeamTab('gest');
            }
        });
    }

    window.switchTeamTab = function(tab) {
        console.log("Switching to tab:", tab);
        document.getElementById('tabTeamGestBtn').classList.remove('active-tab');
        document.getElementById('tabAllTeamsBtn').classList.remove('active-tab');
        document.getElementById('tabTournamentsBtn').classList.remove('active-tab');

        // Nascondi tutto prima di mostrare il tab selezionato
        document.getElementById('noTeamView').style.display = 'none';
        document.getElementById('myTeamView').style.display = 'none';
        document.getElementById('allTeamsArea').style.display = 'none';
        document.getElementById('tournamentsArea').style.display = 'none';

        if (tab === 'gest') {
            document.getElementById('tabTeamGestBtn').classList.add('active-tab');
            if(myTeamId) {
                document.getElementById('myTeamView').style.display = 'flex';
            } else {
                document.getElementById('noTeamView').style.display = 'flex';
            }
        } else if (tab === 'allteams') {
            document.getElementById('tabAllTeamsBtn').classList.add('active-tab');
            document.getElementById('allTeamsArea').style.display = 'flex';
            listenToAllTeams(!!myTeamId);
        } else {
            document.getElementById('tabTournamentsBtn').classList.add('active-tab');
            document.getElementById('tournamentsArea').style.display = 'flex';
            listenToTournaments();
        }
    }

    document.getElementById('createTeamBtn').addEventListener('click', () => {
        const tName = document.getElementById('newTeamName').value.trim(); if(!tName) return;
        const currentUsername = myPrivacy ? "" : tgUsername;
        db.ref('teams').push().set({ name: tName, captainId: myId, status: 'open', members: { [myId]: { name: myName, username: currentUsername } } }).then(() => checkMyTeamStatus());
    });

    function listenToAllTeams(isAlreadyInTeam) {
        if (allTeamsListener) db.ref('teams').off('value', allTeamsListener);
        allTeamsListener = db.ref('teams').on('value', snap => {
            const openList = document.getElementById('openTeamsList');
            const allList = document.getElementById('globalAllTeamsList');
            if(openList) openList.innerHTML = '';
            if(allList) allList.innerHTML = '';

            snap.forEach(child => {
                const t = child.val();
                const count = Object.keys(t.members || {}).length;

                // Filtro rigoroso: salta squadre ritirate o senza membri
                if (t.status === 'retired' || count === 0) return;

                const teamId = child.key;
                const escTeam = escapeHTML(t.name);
                const teamStatus = t.status || 'open'; // Default a open se manca

                const liAll = document.createElement('li');
                liAll.style.flexDirection = 'column'; liAll.style.alignItems = 'flex-start';

                const topDiv = document.createElement('div');
                topDiv.style.width = '100%'; topDiv.style.display = 'flex'; topDiv.style.justifyContent = 'space-between';
                if (!isAlreadyInTeam && teamStatus === 'open') {
                    topDiv.style.cursor = 'pointer';
                    topDiv.onclick = () => joinTeam(teamId);
                }

                const leftSpan = document.createElement('span');
                const bTeam = document.createElement('b'); bTeam.textContent = t.name;
                const smallCount = document.createElement('small'); smallCount.textContent = ` (${count} mem.)`;
                leftSpan.appendChild(bTeam); leftSpan.appendChild(smallCount);

                topDiv.appendChild(leftSpan);
                if (!isAlreadyInTeam && teamStatus === 'open') {
                    const joinSpan = document.createElement('span');
                    joinSpan.style.color = 'var(--link-color)'; joinSpan.style.fontSize = '0.8em'; joinSpan.style.fontWeight = 'bold';
                    joinSpan.textContent = "+ Unisciti";
                    topDiv.appendChild(joinSpan);
                }

                const membersDiv = document.createElement('div');
                membersDiv.style.marginTop = '3px'; membersDiv.style.paddingLeft = '5px'; membersDiv.style.borderLeft = '2px solid var(--link-color)';
                Object.values(t.members || {}).forEach(m => {
                    const mSpan = document.createElement('span');
                    mSpan.style.display = 'inline-block'; mSpan.style.marginRight = '5px'; mSpan.style.fontSize = '0.85em'; mSpan.style.color = 'var(--hint-color)';
                    mSpan.textContent = `- ${m.name}`;
                    membersDiv.appendChild(mSpan);
                });

                liAll.appendChild(topDiv);
                liAll.appendChild(membersDiv);
                if(allList) allList.appendChild(liAll);

                if (!isAlreadyInTeam && teamStatus === 'open') {
                    const liOpen = document.createElement('li');
                    liOpen.style.cursor = 'pointer';
                    liOpen.onclick = () => joinTeam(teamId);

                    const leftOpen = document.createElement('span');
                    const bOpen = document.createElement('b'); bOpen.textContent = t.name;
                    const smallOpen = document.createElement('small'); smallOpen.textContent = ` (${count} mem.)`;
                    leftOpen.appendChild(bOpen); leftOpen.appendChild(smallOpen);

                    const rightOpen = document.createElement('span');
                    rightOpen.style.color = 'var(--link-color)'; rightOpen.style.fontWeight = 'bold';
                    rightOpen.textContent = "+ Unisciti";

                    liOpen.appendChild(leftOpen);
                    liOpen.appendChild(rightOpen);
                    if(openList) openList.appendChild(liOpen);
                }
            });

            if(openList && openList.innerHTML === '') {
                const li = document.createElement('li');
                li.style.color = 'var(--hint-color)'; li.style.justifyContent = 'center'; li.style.background = 'none'; li.style.border = 'none';
                li.textContent = 'Nessuna squadra aperta.';
                openList.appendChild(li);
            }
            if(allList && allList.innerHTML === '') {
                const li = document.createElement('li');
                li.style.color = 'var(--hint-color)'; li.style.justifyContent = 'center'; li.style.background = 'none'; li.style.border = 'none';
                li.textContent = 'Nessuna squadra creata.';
                allList.appendChild(li);
            }
        });
    }

    window.joinTeam = function(tId) {
        const currentUsername = myPrivacy ? "" : tgUsername;
        db.ref(`teams/${tId}/members/${myId}`).set({ name: myName, username: currentUsername }).then(() => checkMyTeamStatus());
    }

    function listenToMyTeam() {
        if (teamListener) db.ref(`teams/${myTeamId}`).off('value', teamListener);
        teamListener = db.ref(`teams/${myTeamId}`).on('value', snap => {
            if(!snap.exists() || snap.val().status === 'retired') { checkMyTeamStatus(); return; }
            const team = snap.val(); document.getElementById('myTeamNameDisplay').textContent = team.name;
            document.getElementById('teamStatusText').innerHTML = team.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';

            const captainCont = document.getElementById('captainName');
            const othersCont = document.getElementById('teamOthersList');
            captainCont.innerHTML = '';
            othersCont.innerHTML = '';

            Object.entries(team.members || {}).forEach(([id, mem]) => {
                const isC = (id === team.captainId);
                const escName = escapeHTML(mem.name); const escUser = escapeHTML(mem.username);

                const span = document.createElement('span');
                if (mem.username) {
                    span.style.color = 'var(--link-color)';
                    span.style.cursor = 'pointer';
                    span.style.textDecoration = 'underline';
                    span.onclick = () => openTelegramProfile(escUser);
                }
                span.textContent = escName;

                if (isC) {
                    captainCont.appendChild(span);
                } else {
                    if (othersCont.children.length > 0) {
                        const sep = document.createElement('span');
                        sep.textContent = ' | ';
                        sep.style.color = 'var(--hint-color)';
                        othersCont.appendChild(sep);
                    }
                    othersCont.appendChild(span);
                }
            });

            document.getElementById('captainActions').style.display = isTeamCaptain ? 'block' : 'none';
            const btnLock = document.getElementById('toggleTeamLockBtn'); btnLock.textContent = team.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni";
            btnLock.onclick = () => db.ref(`teams/${myTeamId}/status`).set(team.status === 'open' ? 'closed' : 'open');
            document.getElementById('inviteTeamBtn').onclick = () => { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=team_${myTeamId}`)}&text=${encodeURIComponent(`Unisciti alla mia squadra di Telegrafia: ${team.name}!`)}`); }

            setupChat(db.ref(`teams/${myTeamId}/chat`), 'teamChatMessages', null);
        });
    }

    document.getElementById('clearTeamChatBtn').addEventListener('click', () => {
        if (confirm('Vuoi cancellare per tutti l\'intera cronologia della chat di squadra?')) {
            if (myTeamId) db.ref(`teams/${myTeamId}/chat`).remove();
        }
    });

    document.getElementById('sendTeamChatBtn').addEventListener('click', () => {
        const txt = document.getElementById('teamChatInput').value.trim(); if (!txt || !myTeamId) return;
        const currentUsername = myPrivacy ? "" : tgUsername;
        db.ref(`teams/${myTeamId}/chat`).push({ name: myName, username: currentUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        document.getElementById('teamChatInput').value = '';
    });
    document.getElementById('teamChatInput').addEventListener('keypress', function (e) { if (e.key === 'Enter') document.getElementById('sendTeamChatBtn').click(); });

    document.getElementById('leaveTeamBtn').addEventListener('click', () => {
        if(confirm("Vuoi abbandonare la squadra? Se sei l'ultimo membro la squadra si ritirerà dai tornei.")) {
            db.ref(`teams/${myTeamId}`).once('value', snap => {
                const team = snap.val();
                if(isTeamCaptain) {
                    let others = Object.keys(team.members).filter(id => id !== myId);
                    if(others.length > 0) {
                        db.ref(`teams/${myTeamId}/captainId`).set(others[0]).then(()=> {
                            db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus());
                        });
                    } else {
                        db.ref(`teams/${myTeamId}/status`).set('retired').then(() => {
                            db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus());
                        });
                    }
                } else {
                    db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => checkMyTeamStatus());
                }
            });
        }
    });

    // --- LOGICA TORNEI ---
    function listenToTournaments() {
        if (trnListener) db.ref('tournaments').off('value', trnListener);
        trnListener = db.ref('tournaments').on('value', snap => {
            console.log("Tournaments data:", snap.val());
            activeTrnId = null;
            const openList = document.getElementById('openTournamentsList');
            const pastList = document.getElementById('pastTournamentsList');
            if (openList) openList.innerHTML = '';
            if (pastList) pastList.innerHTML = '';

            const createTrnPanel = document.getElementById('createTrnPanel');
            if (createTrnPanel) createTrnPanel.style.display = isTeamCaptain ? 'flex' : 'none';

            let foundActive = null;

            snap.forEach(child => {
                const trn = child.val();
                const trnId = child.key;
                const isMember = myTeamId && trn.teams && trn.teams[myTeamId];
                const isHost = trn.hostId === myId;

                // Gestione Torneo Attivo (quello a cui partecipo o che ospito)
                if ((isMember || isHost) && trn.status !== 'finished') {
                    // Priorità: Torneo in corso > Torneo aperto
                    if (!foundActive) {
                        foundActive = child;
                    } else {
                        const currentStatus = trn.status;
                        const activeStatus = foundActive.val().status;
                        if (currentStatus === 'playing' && activeStatus !== 'playing') {
                            foundActive = child;
                        }
                    }
                }

                // Popolamento liste generali (solo se NON è quello che sto visualizzando come attivo)
                if (trn.status === 'open') {
                    let teamCount = trn.teams ? Object.keys(trn.teams).length : 0;
                    const li = document.createElement('li');

                    const leftSpan = document.createElement('span');
                    const nameB = document.createElement('b');
                    nameB.textContent = trn.name;
                    leftSpan.appendChild(nameB);
                    leftSpan.appendChild(document.createTextNode(" "));
                    const countSmall = document.createElement('small');
                    countSmall.textContent = `(${teamCount} sq.)`;
                    leftSpan.appendChild(countSmall);

                    li.appendChild(leftSpan);

                    if (isTeamCaptain && !isMember) {
                        const btn = document.createElement('button');
                        btn.className = 'action-btn-small btn-champ';
                        btn.textContent = 'Iscrivi';
                        btn.onclick = () => joinTournament(trnId);
                        li.appendChild(btn);
                    } else if (isMember) {
                        const joinedSmall = document.createElement('small');
                        joinedSmall.style.color = 'var(--link-color)';
                        joinedSmall.style.fontWeight = 'bold';
                        joinedSmall.textContent = ' (Iscritto)';
                        li.appendChild(joinedSmall);
                    }

                    if (openList) openList.appendChild(li);
                } else if (trn.status === 'finished') {
                    const li = document.createElement('li');

                    const leftSpan = document.createElement('span');
                    const nameB = document.createElement('b');
                    nameB.textContent = trn.name;
                    leftSpan.appendChild(nameB);
                    leftSpan.appendChild(document.createTextNode(" "));
                    const statusSmall = document.createElement('small');
                    statusSmall.textContent = "(Concluso)";
                    leftSpan.appendChild(statusSmall);

                    const btn = document.createElement('button');
                    btn.className = 'action-btn-small btn-secondary';
                    btn.textContent = 'Vedi Risultati';
                    btn.onclick = () => viewTournament(trnId);

                    li.appendChild(leftSpan);
                    li.appendChild(btn);
                    if (pastList) pastList.appendChild(li);
                }
            });

            if (foundActive) {
                activeTrnId = foundActive.key;
                renderActiveTournament(foundActive);
            } else {
                document.getElementById('trnLobbyArea').style.display = 'flex';
                document.getElementById('trnActiveArea').style.display = 'none';
                if(openList && openList.innerHTML === '') openList.innerHTML = '<li style="color:var(--hint-color); justify-content:center; border:none; background:none;">Nessun torneo aperto.</li>';
                if(pastList && pastList.innerHTML === '') pastList.innerHTML = '<li style="color:var(--hint-color); justify-content:center; border:none; background:none;">Nessun torneo concluso.</li>';
            }
        });
    }

    window.viewTournament = function(tId) {
        db.ref(`tournaments/${tId}`).once('value', snap => {
            if(snap.exists()) {
                activeTrnId = tId;
                renderActiveTournament(snap);
                document.getElementById('trnLobbyArea').style.display = 'none';
                document.getElementById('trnActiveArea').style.display = 'flex';
            }
        });
    }

    document.getElementById('createTrnBtn').addEventListener('click', () => {
        if (!isTeamCaptain) return;
        const n = document.getElementById('newTrnName').value.trim(); if(!n) return;
        db.ref('tournaments').push().set({
            name: n, hostId: myId, status: 'open',
            teams: { [myTeamId]: { name: myTeamName } },
            standings: { [myTeamId]: { points: 0, name: myTeamName } }
        });
    });

    window.joinTournament = function(tId) {
        if (!isTeamCaptain) return;
        db.ref(`tournaments/${tId}/teams/${myTeamId}`).set({ name: myTeamName });
        db.ref(`tournaments/${tId}/standings/${myTeamId}`).set({ points: 0, name: myTeamName });
    }

    function renderActiveTournament(trnSnap) {
        document.getElementById('trnLobbyArea').style.display = 'none';
        document.getElementById('trnActiveArea').style.display = 'flex';

        const trn = trnSnap.val();
        if (!trn) return;
        const isFinished = trn.status === 'finished';

        // Traduzione dinamica del titolo
        const finishedStr = currentLang === 'it' ? " (Concluso)" : " (Finished)";
        document.getElementById('activeTrnTitle').textContent = trn.name + (isFinished ? finishedStr : "");

    const amIHost = (trn.hostId === myId);
    document.getElementById('editTrnNameBtn').style.display = (amIHost && !isFinished) ? 'block' : 'none';
    document.getElementById('leaveTrnBtn').style.display = (isTeamCaptain && !isFinished) ? 'block' : 'none';

    // Classifica
    const stdBody = document.getElementById('trnStandingsBody');
    stdBody.innerHTML = '';
    let standings = Object.entries(trn.standings || {}).map(([id, data]) => ({ id, ...data }));
    standings.sort((a,b) => b.points - a.points);
    standings.forEach((s, idx) => {
        const tr = document.createElement('tr');
        let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;

        const tdMed = document.createElement('td');
        tdMed.textContent = med;

        const tdName = document.createElement('td');
        const nameB = document.createElement('b');
        nameB.textContent = s.name;
        tdName.appendChild(nameB);
        if (s.id === myTeamId) {
            const youSmall = document.createTextNode(" " + (currentLang === 'it' ? '(Voi)' : '(You)'));
            tdName.appendChild(youSmall);
        }

        const tdPts = document.createElement('td');
        const ptsB = document.createElement('b');
        ptsB.textContent = s.points;
        tdPts.appendChild(ptsB);

        tr.appendChild(tdMed);
        tr.appendChild(tdName);
        tr.appendChild(tdPts);
        stdBody.appendChild(tr);
    });

    document.getElementById('trnHostControls').style.display = (amIHost && !isFinished) ? 'block' : 'none';
    const finishBtn = document.getElementById('finishTrnBtn');
    if (finishBtn) {
        finishBtn.style.display = (amIHost && trn.status === 'playing') ? 'block' : 'none';
        finishBtn.onclick = () => {
            if(confirm("Vuoi concludere manualmente il torneo e spostarlo in archivio?")) {
                db.ref(`tournaments/${activeTrnId}/status`).set('finished');
            }
        };
    }
    const teamCount = trn.teams ? Object.keys(trn.teams).length : 0;

    // Traduzione dinamica delle squadre iscritte
    const enrolledStr = currentLang === 'it' ? "Squadre Iscritte: " : "Enrolled Teams: ";
    document.getElementById('trnTeamCountTxt').textContent = `${enrolledStr}${teamCount}`;

    const startBtn = document.getElementById('startTrnBtn');
    if (startBtn) {
        // Se siamo l'host, permettiamo l'avvio anche se non siamo "playing" ancora
        startBtn.disabled = teamCount < 2 || (trn.status !== 'open' && trn.status !== 'playing');

        // Traduzione dinamica dei pulsanti host
        if (trn.status === 'playing') {
            startBtn.textContent = currentLang === 'it' ? "Rigenera Tabellone (Attenzione!)" : "Regenerate Bracket (Warning!)";
        } else {
            startBtn.textContent = currentLang === 'it' ? "Genera Tabellone e Avvia" : "Generate Bracket and Start";
        }
    }

    const bracketCont = document.getElementById('trnBracketContainer');
    bracketCont.innerHTML = '';

    if (trn.status === 'open') {
        const waitP = document.createElement('p');
        waitP.style.textAlign = 'center';
        waitP.style.color = 'var(--hint-color)';
        waitP.style.fontSize = '0.9em';
        waitP.textContent = currentLang === 'it' ? "Il torneo è aperto, attendi l'avvio dall'organizzatore." : "The tournament is open, wait for the host to start.";
        bracketCont.appendChild(waitP);
    } else if (trn.matches) {
        Object.entries(trn.matches).forEach(([mId, m]) => {
            const isMyMatch = (m.teamA === myTeamId || m.teamB === myTeamId);
            const card = document.createElement('div');
            card.className = 'match-card';
            if (isMyMatch) card.style.borderColor = "var(--champ-color)";
            card.style.borderWidth = "2px";

            let aColor = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
            let bColor = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");

            const teamsDiv = document.createElement('div');
            teamsDiv.className = 'match-card-teams';

            const teamADiv = document.createElement('div');
            teamADiv.style.color = aColor;
            const teamAB = document.createElement('b');
            teamAB.textContent = m.teamAName;
            teamADiv.appendChild(teamAB);

            const vsDiv = document.createElement('div');
            vsDiv.className = 'match-vs';
            vsDiv.textContent = 'VS';

            const teamBDiv = document.createElement('div');
            teamBDiv.style.color = bColor;
            const teamBB = document.createElement('b');
            teamBB.textContent = m.teamBName;
            teamBDiv.appendChild(teamBB);

            teamsDiv.appendChild(teamADiv);
            teamsDiv.appendChild(vsDiv);
            teamsDiv.appendChild(teamBDiv);
            card.appendChild(teamsDiv);

            if (m.status !== 'finished') {
                const slotsDiv = document.createElement('div');
                slotsDiv.style.display = 'flex';
                slotsDiv.style.width = '100%';
                slotsDiv.style.gap = '10px';

                const slotAEmpty = currentLang === 'it' ? 'A: Libero' : 'A: Open';
                const btnA = document.createElement('button');
                btnA.className = 'slot-btn' + (m.playerA ? ' filled' : '');
                btnA.textContent = m.playerA ? m.playerA.name : slotAEmpty;
                btnA.onclick = () => toggleTrnSlot(mId, 'A', m.teamA);

                const slotBEmpty = currentLang === 'it' ? 'B: Libero' : 'B: Open';
                const btnB = document.createElement('button');
                btnB.className = 'slot-btn' + (m.playerB ? ' filled' : '');
                btnB.textContent = m.playerB ? m.playerB.name : slotBEmpty;
                btnB.onclick = () => toggleTrnSlot(mId, 'B', m.teamB);

                slotsDiv.appendChild(btnA);
                slotsDiv.appendChild(btnB);
                card.appendChild(slotsDiv);

                if (m.playerA && m.playerB) {
                    if (m.playerA.id === myId || m.playerB.id === myId) {
                        const joinBtn = document.createElement('button');
                        joinBtn.className = 'btn-success';
                        joinBtn.style.fontSize = '0.85em';
                        joinBtn.style.padding = '6px';
                        joinBtn.style.marginTop = '8px';
                        joinBtn.textContent = currentLang === 'it' ? 'ENTRA NELLA SFIDA' : 'JOIN MATCH';
                        joinBtn.onclick = () => startTrnMatch(mId);
                        card.appendChild(joinBtn);
                    }
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
            bracketCont.appendChild(card);
        });
    }
}

    document.getElementById('editTrnNameBtn').addEventListener('click', () => {
        let newName = prompt("Inserisci il nuovo nome del torneo:");
        if (newName && newName.trim() !== "") {
            db.ref(`tournaments/${activeTrnId}/name`).set(newName.trim());
        }
    });

    document.getElementById('leaveTrnBtn').addEventListener('click', () => {
        if (!isTeamCaptain) return;
        if (confirm("Sei sicuro di voler ritirare la tua squadra da questo torneo?")) {
            db.ref(`tournaments/${activeTrnId}/teams/${myTeamId}`).remove();
            db.ref(`tournaments/${activeTrnId}/standings/${myTeamId}`).remove();
        }
    });

    document.getElementById('deleteTrnBtn').addEventListener('click', () => {
        if(confirm("Eliminare definitivamente il torneo?")) db.ref(`tournaments/${activeTrnId}`).remove();
    });

    document.getElementById('startTrnBtn').addEventListener('click', () => {
    console.log("Start button clicked. activeTrnId:", activeTrnId);
    if (!activeTrnId) return;
    db.ref(`tournaments/${activeTrnId}/teams`).once('value', snap => {
        let teams = [];
        snap.forEach(child => {
            teams.push({ id: child.key, name: child.val().name });
        });
        console.log("Teams found:", teams);

        if (teams.length < 2) {
            alert("Servono almeno 2 squadre per iniziare!");
            return;
        }

        let matches = {}; let matchIndex = 1;
        // Generazione Round-Robin
        for(let i=0; i<teams.length; i++) {
            for(let j=i+1; j<teams.length; j++) {
                matches[`m${matchIndex++}`] = {
                    teamA: teams[i].id, teamAName: teams[i].name,
                    teamB: teams[j].id, teamBName: teams[j].name,
                    status: 'waiting'
                };
            }
        }
        console.log("Matches generated:", matches);

        db.ref(`tournaments/${activeTrnId}`).update({ status: 'playing', matches: matches })
        .then(() => {
            console.log("Firebase updated successfully!");
            showToast("Tabellone generato con successo!");
        })
        .catch(err => {
            console.error("Firebase update failed:", err);
            alert("Errore durante l'avvio del torneo: " + err.message);
        });
    });
});

    window.toggleTrnSlot = function(matchId, side, teamId) {
    if (teamId !== myTeamId) {
        alert("Non appartieni a questa squadra!");
        return;
    }
    const slotRef = db.ref(`tournaments/${activeTrnId}/matches/${matchId}/player${side}`);
    slotRef.once('value', snap => {
        if (!snap.exists()) {
            slotRef.set({ id: myId, name: myName });
        } else if (snap.val().id === myId) {
            slotRef.remove();
        } else {
            alert("Questo posto è già occupato da " + snap.val().name);
        }
    });
}

    window.startTrnMatch = function(matchId) {
        const specificRoomCode = "TRN_" + matchId;
        db.ref(`rooms/${specificRoomCode}`).once('value', snapshot => {
            if (snapshot.exists()) { window.joinSpecificRoom(specificRoomCode); }
            else {
                db.ref('rooms/' + specificRoomCode).set({
                    status: 'waiting', type: 'multi', mode: 'pingpong',
                    wpm: 20, tone: 600, wordCount: 20, fixedSpeed: false,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    expiresAt: Date.now() + (30 * 60000), hostId: myId
                }).then(() => { window.joinSpecificRoom(specificRoomCode); });
            }
        });
    }

    // --- LOGICA ATTIVITÀ E MEDAGLIE ---
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return d.getUTCFullYear() + "-W" + (weekNo < 10 ? '0'+weekNo : weekNo);
    }

    function updateActivity(won = false) {
        const now = new Date();
        const dailyKey = now.toISOString().split('T')[0];
        const weeklyKey = getWeekNumber(now);
        const monthlyKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

        const updates = ['daily/'+dailyKey, 'weekly/'+weeklyKey, 'monthly/'+monthlyKey];
        updates.forEach(path => {
            db.ref(`activity/${path}/${myId}`).transaction(data => {
                if (!data) return { name: myName, games: 1, wins: won ? 1 : 0, lastPlayed: firebase.database.ServerValue.TIMESTAMP };
                data.games = (data.games || 0) + 1;
                if (won) data.wins = (data.wins || 0) + 1;
                data.name = myName;
                data.lastPlayed = firebase.database.ServerValue.TIMESTAMP;
                return data;
            }).then(() => {
                if (path.startsWith('daily')) checkActivityAndAwardMedals();
            });
        });
    }

    async function checkActivityAndAwardMedals() {
        const now = new Date();
        const dKey = now.toISOString().split('T')[0];
        const wKey = getWeekNumber(now);
        const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

        try {
            const [dSnap, wSnap, mSnap, userMedalsSnap] = await Promise.all([
                db.ref(`activity/daily/${dKey}/${myId}`).once('value'),
                db.ref(`activity/weekly/${wKey}/${myId}`).once('value'),
                db.ref(`activity/monthly/${mKey}/${myId}`).once('value'),
                db.ref(`users/${myId}/medals`).once('value')
            ]);

            const dData = dSnap.val() || { games: 0 };
            const wData = wSnap.val() || { games: 0 };
            const mData = mSnap.val() || { games: 0 };
            const myMedals = userMedalsSnap.val() || {};

            // Soglie Medaglie
            const check = (count, threshold, id, title, desc, icon) => {
                if (count >= threshold && !myMedals[id]) {
                    awardMedal(id, title, desc, icon);
                    return true;
                }
                return false;
            };

            // GIORNALIERE (Controlla tutte, non fermarti al primo)
            check(dData.games, 3, `d_bronze_${dKey}`, "Bronzo Giornaliero", "Hai giocato 3 partite oggi!", "🥉");
            check(dData.games, 7, `d_silver_${dKey}`, "Argento Giornaliero", "Sei un veterano! 7 partite oggi!", "🥈");
            check(dData.games, 15, `d_gold_${dKey}`, "Oro Giornaliero", "Incredibile! 15 partite in un giorno!", "🥇");

            // SETTIMANALI
            check(wData.games, 20, `w_active_${wKey}`, "Stakanovista Settimanale", "20 partite questa settimana!", "🎖️");
            check(wData.games, 50, `w_pro_${wKey}`, "Campione Settimanale", "50 partite! Una leggenda questa settimana!", "🏆");

            // MENSILI
            check(mData.games, 150, `m_legend_${mKey}`, "Titano del Mese", "150 partite! Il gioco non ha segreti per te.", "💎");

        } catch(e) { console.error("Errore check medaglie:", e); }

        updateMedalGallery();
    }

    function awardMedal(id, title, desc, icon) {
        db.ref(`users/${myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon });

        // Visualizza Overlay
        document.getElementById('overlayMedalIcon').textContent = icon;
        document.getElementById('overlayMedalTitle').textContent = title;
        document.getElementById('overlayMedalDesc').textContent = desc;
        document.getElementById('medalOverlay').style.display = 'flex';

        playMedalSound();
        updateMedalGallery();
    }

    function playMedalSound() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'triangle';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5); // C6
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        osc.start(now);
        osc.stop(now + 0.8);
    }

    function updateMedalGallery() {
        const cont = document.getElementById('myMedalsContainer');
        if (!cont) return;
        db.ref(`users/${myId}/medals`).once('value', snap => {
            if (!snap.exists()) {
                cont.innerHTML = "";
                const span = document.createElement('span');
                span.style.fontSize = "0.6em"; span.style.color = "var(--hint-color)";
                span.textContent = "Nessuna medaglia ancora.";
                cont.appendChild(span);
                return;
            }
            cont.innerHTML = '';
            Object.values(snap.val()).forEach(m => {
                const span = document.createElement('span');
                span.textContent = m.icon;
                span.title = `${m.title} (${m.date})`;
                span.onclick = () => showToast(`${m.title} - Sbloccata il ${m.date}`);
                span.style.cursor = "pointer";
                cont.appendChild(span);
            });
        });
    }

    window.switchActTab = function(period) {
        document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab'));
        document.getElementById(`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`).classList.add('active-tab');

        const now = new Date();
        let key = "";
        if (period === 'daily') {
            key = now.toISOString().split('T')[0];
            document.getElementById('actListTitle').textContent = "I più attivi di Oggi";
        } else if (period === 'weekly') {
            key = getWeekNumber(now);
            document.getElementById('actListTitle').textContent = "I più attivi della Settimana";
        } else {
            key = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
            document.getElementById('actListTitle').textContent = "I più attivi del Mese";
        }

        renderActivityRankings(period, key);
        updateMedalGallery();
    }

    function renderActivityRankings(period, key) {
        const list = document.getElementById('activityRankList');
        list.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Caricamento...</li>';

        // Usiamo una fetch semplice senza ordinamento Firebase per evitare errori di indicizzazione
        db.ref(`activity/${period}/${key}`).once('value').then(snap => {
            list.innerHTML = '';
            let users = [];

            if (snap.exists()) {
                snap.forEach(child => {
                    const u = child.val();
                    if (u && typeof u === 'object') {
                        users.push({ id: child.key, ...u });
                    }
                });
            }

            // Ordinamento lato client (molto più sicuro)
            users.sort((a, b) => (b.games || 0) - (a.games || 0));
            users = users.slice(0, 50);

            if (users.length === 0) {
                list.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna attività registrata.</li>';
                return;
            }

            users.forEach((u, idx) => {
                const li = document.createElement('li');
                let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;

                const nameSpan = document.createElement('span');
                const medalText = document.createTextNode(medal + " ");
                nameSpan.appendChild(medalText);
                const nameB = document.createElement('b');
                nameB.textContent = u.name || "Anonimo";
                nameSpan.appendChild(nameB);

                const statsSpan = document.createElement('span');
                const gamesB = document.createElement('b');
                gamesB.textContent = u.games || 0;
                statsSpan.appendChild(gamesB);
                statsSpan.appendChild(document.createTextNode(" part. "));
                const winsSmall = document.createElement('small');
                winsSmall.style.color = '#4caf50';
                winsSmall.textContent = `(${u.wins || 0} v.)`;
                statsSpan.appendChild(winsSmall);

                li.appendChild(nameSpan);
                li.appendChild(statsSpan);
                list.appendChild(li);
            });
        }).catch(err => {
            console.error("Errore fetch attività:", err);
            list.innerHTML = `<li style="justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;">
                                <span>Errore nel caricamento.</span>
                                <small style="font-size:0.7em; opacity:0.7;">Firebase: ${err.code || err.message}</small>
                              </li>`;
        });
    }

    // --- LOGICA MODALITÀ QUIZ ---
    function startQuizSequence() {
        showScreen('quizArea');
        gameRunning = true;

        // Randomizziamo le domande all'inizio del quiz
        randomizedQuizQuestions = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5);
        quizQuestionIndex = 0;

        document.getElementById('quizWpmDisplay').textContent = `WPM: ${currentWpm}`;
        document.getElementById('quizScoreDisplay').textContent = `Punti: ${totalScore}`;

        if (roomCode && !isSinglePlayer) {
            // Setup Multiplayer Quiz state
            db.ref(`rooms/${roomCode}/quiz_state`).on('value', snap => {
                const state = snap.val();
                if (!state) return;

                quizQuestionIndex = state.questionIndex || 0;
                quizActiveBuzzerId = state.activeBuzzerId || null;

                renderQuizUI(state);
            });

            // Inizia la prima domanda se siamo l'host
            if (myId === roomHostId) {
                // Per il multiplayer, usiamo l'ordine originale per sincronizzazione
                // oppure dovremmo condividere il seed. Per ora usiamo l'indice condiviso.
                db.ref(`rooms/${roomCode}/quiz_state`).set({
                    questionIndex: 0,
                    activeBuzzerId: null,
                    status: 'playing'
                });
            }
        } else {
            // Single player quiz
            loadNextQuizQuestion();
        }
    }

    function loadNextQuizQuestion() {
        const sourceList = isSinglePlayer ? randomizedQuizQuestions : QUIZ_QUESTIONS;

        if (quizQuestionIndex >= requestedWordCount || quizQuestionIndex >= sourceList.length) {
            finishGame();
            return;
        }

        currentQuizQuestion = sourceList[quizQuestionIndex];
        playQuizAudioSequence();
    }

    async function playQuizAudioSequence() {
        inputActive = false;
        disableQuizButtons(true);

        // Reset visuale opzioni
        for (let l of ['A', 'B', 'C', 'D']) {
            document.getElementById('btnQuiz' + l).classList.remove('active-choice');
        }

        document.getElementById('quizQuestionBox').textContent = "Ascolta la domanda...";

        // Aspettiamo che finisca davvero la domanda
        await playMorseAudio(currentQuizQuestion.q, currentWpm);

        if (!gameRunning) return;
        await sleep(1500); // Pausa di respiro dopo la domanda

        // Riproduciamo le opzioni A, B, C, D
        const letters = ["A", "B", "C", "D"];
        for (let i = 0; i < 4; i++) {
            if (!gameRunning) return;
            document.getElementById('quizQuestionBox').textContent = `Opzione ${letters[i]}...`;

            // Evidenzia l'opzione che sta suonando
            const currentBtn = document.getElementById('btnQuiz' + letters[i]);
            currentBtn.classList.add('active-choice');

            // Aspettiamo che finisca davvero l'opzione corrente
            await playMorseAudio(`${letters[i]} ${currentQuizQuestion.a[i]}`, currentWpm);

            currentBtn.classList.remove('active-choice');

            if (!gameRunning) return;
            await sleep(1000); // Piccola pausa tra le opzioni
        }

        if (!gameRunning) return;

        document.getElementById('quizQuestionBox').textContent = "SCEGLI LA TUA RISPOSTA!";
        enableQuizControls();
        startQuizTimer(20);
    }

    function enableQuizControls() {
        inputActive = true;
        if (isSinglePlayer) {
            disableQuizButtons(false);
        } else {
            // In multi, prima bisogna premere il buzzer
            document.getElementById('quizBuzzer').style.display = 'block';
            document.getElementById('quizOptionsContainer').style.opacity = '0.5';
            disableQuizButtons(true);
        }
    }

    function disableQuizButtons(disabled) {
        for (let l of ['A', 'B', 'C', 'D']) {
            const btn = document.getElementById('btnQuiz' + l);
            if(btn) btn.disabled = disabled;
        }
    }

    function startQuizTimer(seconds) {
        if (quizTimerInterval) clearInterval(quizTimerInterval);
        const bar = document.getElementById('quizTimerProgress');
        let timeLeft = 100;
        const decrement = 100 / (seconds * 10);

        quizTimerInterval = setInterval(() => {
            timeLeft -= decrement;
            bar.style.width = Math.max(0, timeLeft) + '%';

            if (timeLeft <= 0) {
                clearInterval(quizTimerInterval);
                handleQuizTimeout();
            }
        }, 100);
    }

    function handleQuizTimeout() {
        if (!inputActive) return;
        showToast("Tempo scaduto!");
        if (isSinglePlayer) {
            submitQuizAnswer(-1); // Sbagliata
        } else if (quizActiveBuzzerId === myId) {
            submitQuizAnswer(-1); // Chi ha prenotato non ha risposto
        }
    }

    function submitQuizAnswer(index) {
        if (!inputActive && !isSinglePlayer && quizActiveBuzzerId !== myId) return;
        if (quizTimerInterval) clearInterval(quizTimerInterval);
        inputActive = false;

        // Disabilita tasti per evitare doppi click
        disableQuizButtons(true);

        const isCorrect = (index === currentQuizQuestion.correct);
        const selectedLetter = ["A", "B", "C", "D"][index] || "?";

        if (isCorrect) {
            totalScore += 100; // Punteggio fisso quiz
            showToast(`CORRETTO (${selectedLetter})! +100`);
        } else {
            showToast(`SBAGLIATO! Era la ${["A", "B", "C", "D"][currentQuizQuestion.correct]}`);
        }

        document.getElementById('quizScoreDisplay').textContent = `Punti: ${totalScore}`;

        if (roomCode) {
            db.ref(`rooms/${roomCode}/players/${myId}`).update({
                score: totalScore,
                wordIndex: quizQuestionIndex + 1
            });
        }

        setTimeout(() => {
            if (!gameRunning) return;
            quizQuestionIndex++;

            if (roomCode && !isSinglePlayer && myId === roomHostId) {
                db.ref(`rooms/${roomCode}/quiz_state`).update({
                    questionIndex: quizQuestionIndex,
                    activeBuzzerId: null
                });
            } else if (isSinglePlayer) {
                loadNextQuizQuestion();
            }
        }, 3000);
    }

    function sleep(ms) {
        return new Promise(resolve => {
            const check = () => {
                if (!gameRunning) resolve(); // Esci subito se il gioco è fermo
                else resolve();
            };
            setTimeout(resolve, ms);
        });
    }

    // Eventi Bottoni Quiz
    const buzzerBtn = document.getElementById('quizBuzzer');
    if(buzzerBtn) {
        buzzerBtn.addEventListener('click', () => {
            if (!roomCode || isSinglePlayer || quizActiveBuzzerId) return;

            db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => {
                if (state && !state.activeBuzzerId) {
                    state.activeBuzzerId = myId;
                }
                return state;
            });
        });
    }

    for (let i = 0; i < 4; i++) {
        const letter = ["A", "B", "C", "D"][i];
        const btn = document.getElementById('btnQuiz' + letter);
        if(btn) btn.onclick = () => submitQuizAnswer(i);

        const rBtn = document.getElementById('replay' + letter);
        if(rBtn) rBtn.onclick = () => {
            if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.a[i], currentWpm);
        };
    }

    const replayQBtn = document.getElementById('quizReplayQ');
    if(replayQBtn) {
        replayQBtn.onclick = () => {
            if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.q, currentWpm);
        };
    }

    const quitQuizBtn = document.getElementById('quitQuizBtn');
    if(quitQuizBtn) {
        quitQuizBtn.onclick = () => {
            if (confirm("Vuoi abbandonare il Quiz?")) {
                if(quizTimerInterval) clearInterval(quizTimerInterval);
                gameRunning = false;
                exitRoomCleanly();
            }
        };
    }

    function renderQuizUI(state) {
        const buzzerBtn = document.getElementById('quizBuzzer');
        const winnerDiv = document.getElementById('buzzerWinner');

        if (state.activeBuzzerId) {
            buzzerBtn.style.display = 'none';
            if (state.activeBuzzerId === myId) {
                winnerDiv.textContent = "TOCCA A TE!";
                document.getElementById('quizOptionsContainer').style.opacity = '1';
                disableQuizButtons(false);
            } else {
                winnerDiv.textContent = "L'AVVERSARIO RISPONDE...";
                document.getElementById('quizOptionsContainer').style.opacity = '0.5';
                disableQuizButtons(true);
            }
        } else {
            winnerDiv.textContent = "";
            buzzerBtn.style.display = 'block';
            document.getElementById('quizOptionsContainer').style.opacity = '0.5';
            disableQuizButtons(true);
        }
    }
