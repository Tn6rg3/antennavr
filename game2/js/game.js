// ============================================================================
// GAME.JS - MOTORE CORE, CONQUISTA (CO-OP), PING-PONG E BATTAGLIA REALE
// ============================================================================

import { appState, gameState, uiState, clearAllTimers, STORAGE_KEYS, fisherYatesShuffle } from './state.js';
import { els, showScreen, showToast, escapeHTML } from './ui.js';
import { playBeep, playMorseAudio, stopAllMorseAudio } from './audio.js';
import { exitRoomCleanly } from './lobby.js';
import { startQuizSequence } from './quiz.js';
import { updateActivity } from './leaderboard.js';

// --- CALCOLO DISTANZA LEVENSHTEIN ---
export function getLevenshteinDistance(a, b) {
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

// --- CONTO ALLA ROVESCIA E AVVIO ---
export function startCountdownSequence() {
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}${gameState.isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: 0`;

    if (!uiState.isRejoining) { 
        gameState.totalScore = 0; gameState.currentStreak = 0; gameState.wordIndex = 0; gameState.usedReplay = false; 
        appState.sessionCharErrors = Object.create(null); appState.sessionErrorsByWpm = Object.create(null); gameState.matchDetails = []; 
    }
    if (els.tableBody) els.tableBody.innerHTML = ""; 
    showScreen('countdownScreen'); 
    gameState.running = true; 
    let count = 3; 
    if (els.countdownNumber) els.countdownNumber.textContent = count;
    
    const interval = setInterval(() => {
        if (count > 1) { 
            count--; 
            if (els.countdownNumber) els.countdownNumber.textContent = count; 
            playBeep(600, 0.1); 
        } else {
            clearInterval(interval); 
            if (appState.myId === gameState.roomHostId) {
                appState.db.ref(`rooms/${gameState.roomCode}`).update({ status: 'playing' });
                appState.db.ref(`public_lobby_rooms/${gameState.roomCode}`).remove();
            }
            if (els.countdownNumber) els.countdownNumber.textContent = 'VIA!'; 
            playBeep(800, 0.3);
            setTimeout(() => { 
                if (!gameState.running) return; 
                gameState.isCoopMode = (gameState.mode === 'conquest');
                if (els.coopArea) els.coopArea.style.display = 'none';
                if (els.tableWrapper) els.tableWrapper.style.display = 'block';

                if (gameState.mode === 'conquest') return startCoopSequence(); 
                if (gameState.mode === 'quiz') return startQuizSequence(); 
                
                showScreen('gameArea'); 
                if (gameState.mode === 'pingpong') {
                    setupPingPongListener(); 
                } else { 
                    setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); 
                    setTimeout(() => { if (gameState.running) playNextWord(); }, 800); 
                } 
            }, 500);
        }
    }, 1000);
}

export function resumeGameSequence() {
    gameState.running = true; 
    uiState.isRejoining = false;
    gameState.isCoopMode = (gameState.mode === 'conquest');
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}${gameState.isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${gameState.totalScore}`;
    
    if (els.tableBody) {
        els.tableBody.innerHTML = "";
        gameState.matchDetails.forEach(row => {
            const tr = document.createElement('tr'); 
            let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
            tr.innerHTML = `<td>${escapeHTML(row.typed || '-')}</td><td><b>${escapeHTML(row.real || '')}</b></td><td style="color:${color};font-weight:bold;">${row.points}</td>`;
            els.tableBody.appendChild(tr);
        });
    }
    if (gameState.mode === 'conquest') startCoopSequence(); 
    else if (gameState.mode === 'quiz') startQuizSequence(); 
    else { 
        showScreen('gameArea'); 
        if (gameState.mode === 'pingpong') setupPingPongListener(); 
        else { 
            setTimeout(() => els.permanentGameInput && els.permanentGameInput.focus(), 200); 
            setTimeout(() => { if (gameState.running) playNextWord(); }, 800); 
        } 
    }
}

// --- GESTIONE INVIO PAROLE E PUNTEGGI ---
export function handleWordSubmission(userWord) {
    if (!userWord) return;
    userWord = userWord.substring(0, 50).trim().toUpperCase();

    // RAMO CONQUISTA CO-OP
    if (gameState.mode === 'conquest') {
        if (gameState.coopActiveFreqIndex === 0) return showToast("⚠️ Seleziona prima una Frequenza!");
        const currentWord = gameState.words[0];
        const isCorrect = (userWord === currentWord);
        const gain = gameState.coopActiveFreqIndex === 1 ? 4 : (gameState.coopActiveFreqIndex === 2 ? 7 : 12);
        const penalty = gameState.coopActiveFreqIndex === 1 ? 2 : (gameState.coopActiveFreqIndex === 2 ? 3 : 5);
        gameState.inputActive = false;

        if (isCorrect) {
            gameState.wpm += 2;
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}`;
            showToast(`✅ CORRETTO! +${gain}% (Velocità -> ${gameState.wpm} WPM)`);
            playBeep(880, 0.1);
            appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.min(100, (state.progress || 0) + gain);
                if (Array.isArray(state.activeWords) && state.activeWords.length === 3) {
                    const idx = gameState.coopActiveFreqIndex - 1;
                    const nextWords = generateCoopTripleWords();
                    state.activeWords[idx] = nextWords[idx];
                }
                return state;
            });
        } else {
            gameState.wpm = Math.max(10, gameState.wpm - 2);
            if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}`;
            showToast(`❌ ERRORE! -${penalty}% (Velocità -> ${gameState.wpm} WPM)`);
            playBeep(300, 0.25);
            appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).transaction(state => {
                if (!state || state.status !== 'playing') return state;
                state.progress = Math.max(0, (state.progress || 0) - penalty);
                return state;
            });
        }

        setTimeout(() => {
            if (!gameState.running) return;
            if (els.permanentGameInput) { els.permanentGameInput.value = ""; els.permanentGameInput.focus(); }
            gameState.inputActive = true; 
            if (!isCorrect && gameState.words[0]) playMorseAudio(gameState.words[0], gameState.wpm);
        }, 1500);
        return;
    }

    // RAMO STANDARD / CLASSICO
    gameState.inputActive = false; 
    const currentWord = gameState.words[gameState.wordIndex].toUpperCase(); 
    const reactionMs = Date.now() - gameState.lastWordStartTime; 
    const levDist = getLevenshteinDistance(currentWord, userWord);
    let points = 0, scoreColor = "";

    const basePoints = (Math.pow(gameState.wpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2)); 
    const estimatedAudioMs = (currentWord.length * 60 / gameState.wpm) * 1000; 
    let timeMultiplier = 1.0;
    if (reactionMs > (estimatedAudioMs + 2000)) timeMultiplier = Math.max(0.5, 1.0 - ((reactionMs - (estimatedAudioMs + 2000)) / 20000)); 
    else if (reactionMs < estimatedAudioMs && levDist === 0) timeMultiplier = 1.1;
    
    points = Math.round(basePoints * timeMultiplier); 
    if (levDist === 0) scoreColor = gameState.usedReplay ? "#999999" : "#4caf50"; 
    else if (levDist === 1) scoreColor = "#ff9800"; 
    else scoreColor = "#d32f2f"; 
    if (gameState.usedReplay) points = Math.round(points * 0.2);

    if (!gameState.isFixedSpeed && gameState.mode !== 'chars') { 
        if (levDist === 0 && !gameState.usedReplay) gameState.wpm += 2; 
        else if (levDist === 1) gameState.wpm -= 1; 
        else if (levDist > 1) gameState.wpm -= 2; 
        gameState.wpm = Math.max(10, gameState.wpm); 
    }
    gameState.totalScore += points; 
    gameState.matchDetails.push({ real: currentWord, typed: userWord, points: points, wpm: gameState.wpm, ms: reactionMs });

    if (els.tableBody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHTML(userWord)}</td><td><b>${escapeHTML(currentWord)}</b></td><td style="color:${scoreColor};font-weight:bold;">${points}</td>`;
        els.tableBody.appendChild(tr);
        if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight;
    }
    
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}${gameState.isFixedSpeed ? ' (Fix)' : ''}`; 
    if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${gameState.totalScore}`;
    if (gameState.roomCode) appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).update({ score: gameState.totalScore, wpm: gameState.wpm, wordIndex: gameState.wordIndex + 1, matchDetails: gameState.matchDetails });
    gameState.usedReplay = false;
    
    gameState.wordIndex++; 
    setTimeout(playNextWord, 600);
}

export function playNextWord() {
    if (!gameState.running || gameState.mode === 'pingpong') return; 
    if (gameState.wordIndex >= gameState.wordCount) return finishGame();
    gameState.inputActive = true; 
    const currentWord = gameState.words[gameState.wordIndex].toUpperCase();
    playMorseAudio(currentWord, gameState.wpm); 
    gameState.lastWordStartTime = Date.now(); 
    if (els.permanentGameInput) els.permanentGameInput.focus();
}

export function finishGame() {
    gameState.running = false; 
    gameState.inputActive = false; 
    if (els.permanentGameInput) els.permanentGameInput.blur();
    clearAllTimers();
    localStorage.removeItem(STORAGE_KEYS.ROOM); 
    showScreen('leaderboardScreen');
    if (gameState.roomCode) { 
        appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).update({ finished: true, score: gameState.totalScore, wpm: gameState.wpm, matchDetails: gameState.matchDetails }); 
    }
    updateActivity(gameState.totalScore > 0);
}

// --- CONQUISTA (CO-OP) ---
export function startCoopSequence() {
    gameState.isCoopMode = true;
    showScreen('gameArea');
    if (els.coopArea) els.coopArea.style.display = 'flex';
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'none';
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${gameState.wpm}`;
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Obiettivo: 100%";
    
    gameState.coopActiveFreqIndex = 0;
    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';

    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = false;
        els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴...";
        els.permanentGameInput.value = "";
    }
    gameState.inputActive = false;

    if (appState.myId === gameState.roomHostId) {
        const initialWords = generateCoopTripleWords();
        appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).set({
            progress: 10, timeRemaining: 300, status: 'playing', activeWords: initialWords, freqOwners: { 1: null, 2: null, 3: null }
        });
        startCoopHostTimers();
    }
    listenToCoopState();
    setupCoopFreqButtons();
}

function generateCoopTripleWords() {
    const wEasy = appState.masterDictionary.filter(w => w.length >= 3 && w.length <= 4);
    const wMed  = appState.masterDictionary.filter(w => w.length >= 5 && w.length <= 6);
    const wHard = appState.masterDictionary.filter(w => w.length >= 7);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.toUpperCase() || "RADIO";
    return [pick(wEasy), pick(wMed), pick(wHard)];
}

function startCoopHostTimers() {
    if (gameState.intervals.coopTimer) clearInterval(gameState.intervals.coopTimer);
    if (gameState.intervals.coopDecay) clearInterval(gameState.intervals.coopDecay);

    gameState.intervals.coopTimer = setInterval(() => {
        appState.db.ref(`rooms/${gameState.roomCode}/coop_state/timeRemaining`).transaction(t => (t === null || t <= 0) ? 0 : t - 1);
    }, 1000);

    gameState.intervals.coopDecay = setInterval(() => {
        appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).transaction(state => {
            if (!state || state.status !== 'playing') return state;
            state.progress = Math.max(0, (state.progress || 0) - 1);
            if (state.timeRemaining <= 0) state.status = 'lost';
            return state;
        });
    }, 2000);
}

function listenToCoopState() {
    appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).on('value', snap => {
        const state = snap.val();
        if (!state || !gameState.running) return;

        if (els.coopProgressBar) els.coopProgressBar.style.width = `${state.progress}%`;
        if (els.coopProgressText) els.coopProgressText.textContent = `Conquista: ${state.progress}%`;
        
        const mins = Math.floor(state.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (state.timeRemaining % 60).toString().padStart(2, '0');
        if (els.coopTimeDisplay) els.coopTimeDisplay.textContent = `⏱️ ${mins}:${secs}`;

        if (state.progress >= 100 && state.status !== 'won') {
            if (appState.myId === gameState.roomHostId) appState.db.ref(`rooms/${gameState.roomCode}/coop_state/status`).set('won');
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
            if (!btn || !ownerDiv) return;
            if (!owners[num]) {
                btn.disabled = false; btn.style.opacity = "1"; ownerDiv.textContent = "LIBERA"; ownerDiv.style.color = "var(--hint-color)";
            } else if (owners[num] === appState.myId) {
                btn.disabled = false; btn.style.opacity = "1"; ownerDiv.textContent = "🔒 IN USO DA TE"; ownerDiv.style.color = "#4caf50";
            } else {
                btn.disabled = true; btn.style.opacity = "0.4"; ownerDiv.textContent = "🔒 OCCUPATA"; ownerDiv.style.color = "#ff9800";
            }
        });

        if (gameState.coopActiveFreqIndex > 0 && owners[gameState.coopActiveFreqIndex] === appState.myId && state.activeWords && state.activeWords.length === 3) {
            const currentFreqWord = state.activeWords[gameState.coopActiveFreqIndex - 1];
            if (currentFreqWord && currentFreqWord !== gameState.words[0]) {
                gameState.words[0] = currentFreqWord;
                gameState.inputActive = true;
                stopAllMorseAudio();
                playMorseAudio(currentFreqWord, gameState.wpm);
                if (els.permanentGameInput) { els.permanentGameInput.value = ""; els.permanentGameInput.focus(); }
            }
        }
    });
}

function setupCoopFreqButtons() {
    const labels = ["🟢 FREQ 1 (3-4 car.)", "🟡 FREQ 2 (5-6 car.)", "🔴 FREQ 3 (7+ car.)"];
    [1, 2, 3].forEach(num => {
        const btn = els[`btnCoopFreq${num}`];
        if (!btn) return;
        btn.onclick = () => {
            appState.db.ref(`rooms/${gameState.roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) owners = { 1: null, 2: null, 3: null };
                if (owners[num] && owners[num] !== appState.myId) return undefined;
                [1, 2, 3].forEach(n => { if (owners[n] === appState.myId) owners[n] = null; });
                owners[num] = appState.myId;
                return owners;
            }, (err, committed, snap) => {
                if (committed) {
                    gameState.coopActiveFreqIndex = num;
                    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = `Canale: ${labels[num - 1]}`;
                    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'inline-block';
                    if (els.permanentGameInput) { els.permanentGameInput.disabled = false; els.permanentGameInput.placeholder = "Digita qui..."; els.permanentGameInput.focus(); }
                    gameState.inputActive = true;
                } else showToast("⚠️ Frequenza occupata da un compagno!");
            });
        };
    });

    if (els.btnCoopReleaseFreq) {
        els.btnCoopReleaseFreq.onclick = () => {
            appState.db.ref(`rooms/${gameState.roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) return owners;
                [1, 2, 3].forEach(n => { if (owners[n] === appState.myId) owners[n] = null; });
                return owners;
            }, () => {
                gameState.coopActiveFreqIndex = 0;
                gameState.inputActive = false;
                stopAllMorseAudio();
                if (els.permanentGameInput) { els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴..."; els.permanentGameInput.value = ""; }
                if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
                if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';
                showToast("🔓 Canale rilasciato per i compagni.");
            });
        };
    }
}

function finishCoopGame(won) {
    gameState.running = false;
    clearAllTimers();
    if (gameState.roomCode) appState.db.ref(`rooms/${gameState.roomCode}/coop_state`).off();
    showScreen('leaderboardScreen');
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';
    if (els.coopArea) els.coopArea.style.display = 'none';
    if (won) {
        showToast("🏆 VITTORIA DI SQUADRA! Territorio Conquistato!");
        if (els.roomWinnerBanner) { els.roomWinnerBanner.textContent = "🏆 MISSIONE COMPIUTA CONTRO IL DISTURBO NEMICO!"; els.roomWinnerBanner.style.color = "#4caf50"; }
    } else {
        showToast("💀 TEMPO SCADUTO! Il disturbo nemico ha vinto.");
        if (els.roomWinnerBanner) { els.roomWinnerBanner.textContent = "💀 MISSIONE FALLITA: HA VINTO L'AVVERSARIO IRREALE"; els.roomWinnerBanner.style.color = "#d32f2f"; }
    }
    updateActivity(won);
}

// --- BATTAGLIA REALE SERALE ---
const BR_H_BANNER = 9, BR_M_BANNER = 54, BR_H_START = 21, BR_M_START = 30;

export function initBattleRoyaleScheduler() {
    checkBattleTime();
    if (gameState.intervals.brCheck) clearInterval(gameState.intervals.brCheck);
    gameState.intervals.brCheck = setInterval(checkBattleTime, 60000);
}

export function toggleBattleRoyaleJoin() {
    const now = new Date(Date.now() + appState.serverTimeOffset);
    const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
    gameState.brRoomCode = "BR_" + dKey;
    
    appState.db.ref(`rooms/${gameState.brRoomCode}/players/${appState.myId}`).once('value', pSnap => {
        if (pSnap.exists()) {
            appState.db.ref(`rooms/${gameState.brRoomCode}/players/${appState.myId}`).remove().then(() => showToast("Ti sei ritirato dalla sfida serale."));
        } else {
            appState.db.ref(`rooms/${gameState.brRoomCode}`).update({
                status: 'enrolling', type: 'battle_royale', wpm: 25, round: 0, hostId: appState.myId, createdAt: window.firebase.database.ServerValue.TIMESTAMP
            });
            appState.db.ref(`rooms/${gameState.brRoomCode}/players/${appState.myId}`).set({
                name: appState.myName, lives: 3, status: 'Iscritto ⏳', answered: false
            }).then(() => showToast("⚔️ Iscrizione registrata! Il banner è ora verde."));
        }
    });
}

function checkBattleTime() {
    if (gameState.running || gameState.brIsPlaying || uiState.brBannerDismissedToday) return; 
    const now = new Date(Date.now() + appState.serverTimeOffset);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const isTime = (currentTotalMinutes >= (BR_H_BANNER * 60 + BR_M_BANNER) && currentTotalMinutes < (BR_H_START * 60 + BR_M_START));
    const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
    gameState.brRoomCode = "BR_" + dKey;

    if (isTime) {
        if (els.brBanner && els.brBanner.style.display === 'none') {
            els.brBanner.style.display = 'block';
            setTimeout(() => { if (els.brBanner) els.brBanner.style.display = 'none'; }, 10000);
        }
        if (els.btnJoinBR) els.btnJoinBR.onclick = toggleBattleRoyaleJoin;
        appState.db.ref(`rooms/${gameState.brRoomCode}/players`).on('value', snap => {
            const players = snap.val() || {};
            const count = Object.keys(players).length;
            if (els.brEnrolledCount) els.brEnrolledCount.textContent = count;
            if (els.brEnrolledCountCompact) els.brEnrolledCountCompact.textContent = count;
            if (players[appState.myId]) {
                if (els.brBanner) els.brBanner.style.backgroundColor = '#4caf50';
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'none';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'inline-block';
                if (els.btnJoinBR) els.btnJoinBR.textContent = 'RITIRATI DALLA SFIDA';
            } else {
                if (els.brBanner) els.brBanner.style.backgroundColor = '#e53935';
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'block';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'none';
                if (els.btnJoinBR) els.btnJoinBR.textContent = 'PARTECIPA ALLA SFIDA';
            }
        });
    } else {
        if (els.brBanner) els.brBanner.style.display = 'none';
        appState.db.ref(`rooms/${gameState.brRoomCode}/players`).off('value');
    }

    if (now.getHours() === BR_H_START && now.getMinutes() === BR_M_START) {
        appState.db.ref(`rooms/${gameState.brRoomCode}/players/${appState.myId}`).once('value', snap => {
            if (snap.exists()) {
                uiState.lastBRRoundPlayed = -1;
                showScreen('brScreen');
                listenToBattleRoyaleRoom();
            }
        });
        startBattleRoyaleSystem();
    }
}

function listenToBattleRoyaleRoom() {
    appState.db.ref(`rooms/${gameState.brRoomCode}`).on('value', snap => {
        if (!snap.exists()) { showScreen('setupScreen'); alert("La Battaglia è stata annullata o è terminata."); return; }
        const rData = snap.val();
        renderBRPlayers(rData.players || {});

        if (rData.status === 'playing') {
            gameState.brIsPlaying = true;
            if (els.brWpmDisplay) els.brWpmDisplay.textContent = rData.wpm + " WPM";
            const myData = rData.players[appState.myId];
            gameState.brAmIAlive = myData && myData.lives > 0;
            const hearts = ["💀 ELIMINATO", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
            let safeLives = Math.min(5, Math.max(0, myData?.lives ? parseInt(myData.lives) : 0));
            if (els.brLivesDisplay) els.brLivesDisplay.textContent = gameState.brAmIAlive ? hearts[safeLives] : "💀 ELIMINATO";
            
            if (rData.roundEndTime && rData.currentWord && rData.round !== uiState.lastBRRoundPlayed) {
                uiState.lastBRRoundPlayed = rData.round;
                handleBRRound(rData);
            }
        }
        if (rData.status === 'finished') {
            gameState.brIsPlaying = false;
            if (els.brStatusText) els.brStatusText.textContent = `Partita Conclusa! Vincitore: ${rData.winner || 'Nessuno'}`;
            if (els.brInputArea) els.brInputArea.style.display = 'none';
            if (els.brTimerContainer) els.brTimerContainer.style.display = 'none';
        }
    });
}

function renderBRPlayers(players) {
    if (!els.brPlayersList) return;
    els.brPlayersList.innerHTML = "";
    Object.values(players).forEach(p => {
        const li = document.createElement('li');
        li.style.cssText = "display:flex; justify-content:space-between; padding:5px; border-bottom:1px dashed rgba(255,255,255,0.1);";
        const heartsList = ["💀", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
        let safeLives = Math.min(5, Math.max(0, p.lives ? parseInt(p.lives) : 0));
        li.innerHTML = `<span><b style="color:var(--link-color);">${escapeHTML(p.name)}</b> <small>${heartsList[safeLives]}</small></span><span style="font-size:0.85em;">${p.status}</span>`;
        els.brPlayersList.appendChild(li);
    });
}

function startBattleRoyaleSystem() {
    appState.db.ref(`rooms/${gameState.brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData && rData.hostId === appState.myId) {
            const pCount = Object.keys(rData.players || {}).length;
            if (pCount < 5) appState.db.ref(`rooms/${gameState.brRoomCode}/status`).set('cancelled');
            else {
                appState.db.ref(`rooms/${gameState.brRoomCode}/status`).set('playing');
                hostNextBRRound(rData, 25, 1);
            }
        }
    });
}

function hostNextBRRound(rData, wpm, roundNum) {
    const word = appState.masterDictionary[Math.floor(Math.random() * appState.masterDictionary.length)].toUpperCase();
    const endTime = Date.now() + 30000; 
    let updates = {};
    Object.keys(rData.players || {}).forEach(pid => {
        if (rData.players[pid].lives > 0) {
            updates[`players/${pid}/answered`] = false;
            updates[`players/${pid}/status`] = 'Ascolto...';
        }
    });
    updates['currentWord'] = word; updates['wpm'] = wpm; updates['round'] = roundNum; updates['roundEndTime'] = endTime;
    appState.db.ref(`rooms/${gameState.brRoomCode}`).update(updates);
    setTimeout(() => checkBRRoundResults(wpm, roundNum), 31000);
}

function handleBRRound(rData) {
    if (gameState.intervals.brTimer) clearInterval(gameState.intervals.brTimer);
    if (els.brStatusText) els.brStatusText.textContent = `Round ${rData.round}! Attenzione...`;
    
    if (gameState.brAmIAlive && !rData.players[appState.myId].answered) {
        if (els.brInputArea) els.brInputArea.style.display = 'flex';
        if (els.brInput) { els.brInput.disabled = false; els.brInput.placeholder = "Decodifica e scrivi qui..."; els.brInput.value = ''; els.brInput.focus(); }
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'block';
        playMorseAudio(rData.currentWord, rData.wpm);
    } else {
        if (els.brInputArea) els.brInputArea.style.display = 'none';
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'none';
    }

    gameState.intervals.brTimer = setInterval(() => {
        const left = rData.roundEndTime - Date.now();
        if (left <= 0) {
            clearInterval(gameState.intervals.brTimer);
            if (els.brTimerProgress) els.brTimerProgress.style.width = '0%';
            if (gameState.brAmIAlive && !rData.players[appState.myId].answered) submitBRAnswer(rData.currentWord, true);
        } else if (els.brTimerProgress) {
            els.brTimerProgress.style.width = (left / 30000 * 100) + '%';
            if (left < 10000) els.brTimerProgress.style.background = '#e53935';
            else if (left < 20000) els.brTimerProgress.style.background = '#ff9800';
            else els.brTimerProgress.style.background = '#4caf50';
        }
    }, 100);
}

export function submitBRAnswer(realWord, isTimeout) {
    if (!gameState.brAmIAlive || !els.brInput) return;
    clearInterval(gameState.intervals.brTimer);
    const typed = els.brInput.value.trim().toUpperCase().substring(0, 50);
    els.brInput.placeholder = isTimeout ? "Tempo scaduto!" : "Risposta inviata! Attendi...";
    els.brInput.value = '';
    const isCorrect = !isTimeout && (typed === realWord);
    
    appState.db.ref(`rooms/${gameState.brRoomCode}/players/${appState.myId}`).transaction(p => {
        if (!p) return p;
        p.answered = true;
        if (isCorrect) p.status = 'Corretto!';
        else { p.lives -= 1; p.status = p.lives === 0 ? 'Eliminato' : 'Errore!'; }
        return p;
    });
}

function checkBRRoundResults(currentWpm, currentRound) {
    appState.db.ref(`rooms/${gameState.brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData.hostId !== appState.myId) return;
        let aliveCount = 0, lastAliveName = "";
        Object.values(rData.players || {}).forEach(p => { if (p.lives > 0) { aliveCount++; lastAliveName = p.name; } });

        if (aliveCount <= 1) {
            appState.db.ref(`rooms/${gameState.brRoomCode}/status`).set('finished');
            appState.db.ref(`rooms/${gameState.brRoomCode}/winner`).set(aliveCount === 1 ? lastAliveName : 'Nessuno');
        } else {
            hostNextBRRound(rData, currentWpm + 1, currentRound + 1);
        }
    });
}
