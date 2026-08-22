// game4/games/standard/game.js

let gameRunning = false;
let inputActive = false;
let wordIndex = 0;
let totalScore = 0;
let currentWpm = 20;
let currentTone = 600;
let gameWords = [];
let matchDetailsArray = [];
let lastWordStartTime = 0;
let currentStreak = 0;
let roomCode = "";
let isSinglePlayer = true;

// Recupero roomCode da URL o localStorage
const urlParams = new URLSearchParams(window.location.search);
roomCode = urlParams.get('room') || JSON.parse(localStorage.getItem('game_config') || '{}').roomCode;

const els = {
    lobbyScreen: document.getElementById('lobbyScreen'),
    gameArea: document.getElementById('gameArea'),
    countdownScreen: document.getElementById('countdownScreen'),
    countdownNumber: document.getElementById('countdownNumber'),
    wpmDisplay: document.getElementById('wpmDisplay'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    tableBody: document.getElementById('tableBody'),
    tableWrapper: document.getElementById('tableWrapper'),
    permanentGameInput: document.getElementById('permanentGameInput'),
    replayWordBtn: document.getElementById('replayWordBtn'),
    quitGameBtn: document.getElementById('quitGameBtn'),
    leaveLobbyBtn: document.getElementById('leaveLobbyBtn'),
    statusInfoText: document.getElementById('statusInfoText'),
    startMultiplayerBtn: document.getElementById('startMultiplayerBtn'),
    playersList: document.getElementById('playersList')
};

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active-screen');
}

async function initRoom() {
    if (!roomCode) {
        alert("Errore: Nessuna stanza trovata.");
        window.parent.postMessage('closeModule', '*');
        return;
    }

    db.ref(`rooms/${roomCode}`).on('value', snap => {
        const room = snap.val();
        if (!room) return;

        currentWpm = room.wpm || 20;
        currentTone = room.tone || 600;
        gameWords = room.game_words || [];
        isSinglePlayer = (room.type === 'single');

        if (room.status === 'countdown' && !gameRunning) {
            startCountdown();
        } else if (room.status === 'playing') {
            // Already handled by startCountdown -> startGame
        } else if (room.status === 'waiting') {
            showScreen('lobbyScreen');
            updateLobbyUI(room);
        }
    });

    db.ref(`rooms/${roomCode}/players`).on('value', snap => {
        const players = snap.val() || {};
        renderPlayersList(players);
    });
}

function updateLobbyUI(room) {
    if (els.statusInfoText) {
        els.statusInfoText.textContent = (room.hostId === myId) ?
            (window.currentLang === 'it' ? "Sei l'Host. Avvia quando pronti." : "You are the Host. Start when ready.") :
            (window.currentLang === 'it' ? "In attesa dell'Host..." : "Waiting for Host...");
    }
    if (els.startMultiplayerBtn) {
        els.startMultiplayerBtn.style.display = (room.hostId === myId) ? 'block' : 'none';
        els.startMultiplayerBtn.onclick = () => {
            db.ref(`rooms/${roomCode}/status`).set('countdown');
        };
    }
}

function renderPlayersList(players) {
    if (!els.playersList) return;
    els.playersList.innerHTML = "";
    Object.values(players).forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<b>${p.name}</b> <span>${p.accepted ? '✅' : '⏳'}</span>`;
        els.playersList.appendChild(li);
    });
}

function startCountdown() {
    showScreen('countdownScreen');
    let count = 3;
    els.countdownNumber.textContent = count;
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            els.countdownNumber.textContent = count;
        } else {
            clearInterval(interval);
            if (myId === roomCode.split('_')[1] || !isSinglePlayer) { // Host or Solo owner
                 // For multi, only host should ideally update status, but logic can be shared
                 // but here we just start locally
            }
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameRunning = true;
    wordIndex = 0;
    totalScore = 0;
    currentStreak = 0;
    matchDetailsArray = [];
    showScreen('gameArea');
    updateStats();
    playNextWord();
}

function updateStats() {
    els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
    els.scoreDisplay.textContent = `Punti: ${totalScore}`;
}

function playNextWord() {
    if (!gameRunning) return;
    if (wordIndex >= gameWords.length) return finishGame();

    inputActive = true;
    const word = gameWords[wordIndex].toUpperCase();
    if (typeof window.playMorseAudio === 'function') {
        window.playMorseAudio(word, currentWpm, currentTone);
    }
    lastWordStartTime = Date.now();
    els.permanentGameInput.value = "";
    els.permanentGameInput.focus();
}

function handleSubmission() {
    if (!inputActive) return;
    const userWord = els.permanentGameInput.value.trim().toUpperCase();
    if (!userWord) return;

    const reactionMs = Date.now() - lastWordStartTime;
    inputActive = false;
    const realWord = gameWords[wordIndex].toUpperCase();

    const levDist = window.getLevenshteinDistance ? window.getLevenshteinDistance(realWord, userWord) : (realWord === userWord ? 0 : 1);

    const { points, scoreColor } = window.calculateGamePoints
        ? window.calculateGamePoints('standard', realWord, userWord, currentWpm, reactionMs, levDist, false)
        : { points: (levDist === 0 ? 10 : 0), scoreColor: (levDist === 0 ? '#4caf50' : '#d32f2f') };

    totalScore += points;

    if (levDist === 0) {
        currentStreak++;
        if (currentStreak >= 5) {
            const streakBonus = Math.floor(currentStreak / 5) * 5;
            totalScore += streakBonus;
            if (window.showToast) window.showToast(`🔥 Streak! +${streakBonus}`);
        }
        currentWpm = Math.min(50, currentWpm + 0.5);
    } else {
        currentStreak = 0;
        currentWpm = Math.max(10, currentWpm - 1);
    }

    // UI Table update
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${userWord}</td><td><b>${realWord}</b></td><td style="color:${scoreColor}">${points}</td>`;
    els.tableBody.appendChild(tr);
    els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;

    matchDetailsArray.push({ real: realWord, typed: userWord, points, levDist });

    updateStats();
    wordIndex++;

    setTimeout(playNextWord, 1000);
}

function finishGame() {
    gameRunning = false;
    inputActive = false;
    els.permanentGameInput.blur();
    els.scoreDisplay.innerHTML = `<b style="color:var(--champ-color)">FINITO!</b> PT: ${totalScore}`;
    els.quitGameBtn.textContent = (window.currentLang === 'en') ? "Back to Menu" : "Torna al Menu";

    // Update Firebase with final results for this player in the room
    if (roomCode) {
        db.ref(`rooms/${roomCode}/players/${myId}`).update({
            finished: true, score: totalScore, wpm: currentWpm, matchDetails: matchDetailsArray
        });
    }

    // Leaderboard update
    if (totalScore > 0) {
        let lbPath = "";
        if (roomCode.startsWith("SOLO_")) {
            lbPath = `leaderboard/standard/single_${gameWords.length}/${myId}`;
        } else {
            lbPath = `leaderboard/standard/multi_${gameWords.length}/${myId}`;
        }

        db.ref(lbPath).once('value', s => {
            const old = s.val();
            if (!old || totalScore > (old.score || 0)) {
                db.ref(lbPath).set({
                    name: window.myName,
                    score: totalScore,
                    wpm: currentWpm,
                    level: (window.userProgression?.level || 1),
                    date: new Date().toLocaleDateString('it-IT')
                });
                if (window.showToast) window.showToast(window.currentLang === 'it' ? "🏆 Nuovo Record!" : "🏆 New Record!");
            }
        });
    }

    // Match History & XP & Activity
    db.ref(`users/${myId}/history`).push().set({
        date: firebase.database.ServerValue.TIMESTAMP,
        mode: 'standard',
        score: totalScore,
        wpm: currentWpm,
        details: matchDetailsArray
    });

    if (window.addXP) window.addXP(Math.floor(totalScore / 10) + 50, "Match finished");
    if (window.updateActivity) window.updateActivity(totalScore > 0);

    els.quitGameBtn.onclick = () => {
        if (roomCode) {
            db.ref(`rooms/${roomCode}/players/${myId}`).off();
            db.ref(`rooms/${roomCode}`).off();
        }
        window.parent.postMessage('closeModule', '*');
    };
}

// Listeners
els.permanentGameInput.onkeypress = (e) => {
    if (e.key === 'Enter') handleSubmission();
};

els.replayWordBtn.onclick = () => {
    if (gameRunning && inputActive) {
        if (typeof window.playMorseAudio === 'function') {
            window.playMorseAudio(gameWords[wordIndex].toUpperCase(), currentWpm, currentTone);
        }
        els.permanentGameInput.focus();
    }
};

els.quitGameBtn.onclick = () => {
    if (confirm("Vuoi abbandonare?")) {
        window.parent.postMessage('closeModule', '*');
    }
};

els.leaveLobbyBtn.onclick = () => {
    window.parent.postMessage('closeModule', '*');
};

// Start initialization
initRoom();
