// js/coop_manager.js

window.startCoopSequence = function() {
    window.isCoopMode = true;
    showScreen('gameArea');
    if (els.coopArea) els.coopArea.style.display = 'flex';
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'none';

    gameRunning = true; // Assicuriamoci che il gioco sia considerato in esecuzione
    inputActive = false;

    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`;
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Obiettivo: 100%";

    coopActiveFreqIndex = 0;
    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';

    if (els.permanentGameInput) {
        els.permanentGameInput.disabled = false;
        els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴...";
        els.permanentGameInput.value = "";
    }
    inputActive = false;

    if (myId === roomHostId) {
        const initialWords = window.generateCoopTripleWords();
        const coopRef = db.ref(`rooms/${roomCode}/coop_state`);

        // Inizializzazione protetta: evitiamo di sovrascrivere se già presente (es. reconnect)
        coopRef.once('value', snap => {
            if (!snap.exists()) {
                coopRef.set({
                    progress: 10,
                    timeRemaining: 300,
                    status: 'playing',
                    activeWords: initialWords,
                    freqOwners: { 1: null, 2: null, 3: null }
                });
                window.startCoopHostTimers();
            } else if (snap.val().status !== 'playing') {
                coopRef.update({ status: 'playing' });
            }
        });
    }

    window.listenToCoopState();
    window.setupCoopFreqButtons();
};

window.generateCoopTripleWords = function() {
    const wEasy = masterDictionary.filter(w => w.length >= 3 && w.length <= 4);
    const wMed  = masterDictionary.filter(w => w.length >= 5 && w.length <= 6);
    const wHard = masterDictionary.filter(w => w.length >= 7);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.toUpperCase() || "RADIO";
    return [pick(wEasy), pick(wMed), pick(wHard)];
};

window.startCoopHostTimers = function() {
    if (coopTimerInterval) clearInterval(coopTimerInterval);
    if (coopDecayInterval) clearInterval(coopDecayInterval);

    coopTimerInterval = setInterval(() => {
        db.ref(`rooms/${roomCode}/coop_state/timeRemaining`).transaction(t => {
            if (t === null || t <= 0) return 0;
            return t - 1;
        });
    }, 1000);

    coopDecayInterval = setInterval(() => {
        db.ref(`rooms/${roomCode}/coop_state`).transaction(state => {
            if (!state || state.status !== 'playing') return state;
            state.progress = Math.max(0, (state.progress || 0) - 1);
            if (state.timeRemaining <= 0) state.status = 'lost';
            return state;
        });
    }, 2000);
};

window.listenToCoopState = function() {
    db.ref(`rooms/${roomCode}/coop_state`).on('value', snap => {
        const state = snap.val();
        if (!state || !gameRunning) return;

        if (els.coopProgressBar) els.coopProgressBar.style.width = `${state.progress}%`;
        if (els.coopProgressText) els.coopProgressText.textContent = `Conquista: ${state.progress}%`;

        const mins = Math.floor(state.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (state.timeRemaining % 60).toString().padStart(2, '0');
        if (els.coopTimeDisplay) els.coopTimeDisplay.textContent = `⏱️ ${mins}:${secs}`;

        if (state.progress >= 100 && state.status !== 'won') {
            if (myId === roomHostId) db.ref(`rooms/${roomCode}/coop_state/status`).set('won');
            window.finishCoopGame(true);
            return;
        } else if (state.timeRemaining <= 0 || state.status === 'lost') {
            window.finishCoopGame(false);
            return;
        }

        const owners = state.freqOwners || { 1: null, 2: null, 3: null };
        [1, 2, 3].forEach(num => {
            const btn = els[`btnCoopFreq${num}`];
            const ownerDiv = els[`coopOwner${num}`];
            const ownerId = owners[num];

            if (!btn || !ownerDiv) return;

            if (!ownerId) {
                btn.disabled = false;
                btn.style.opacity = "1";
                ownerDiv.textContent = "LIBERA";
                ownerDiv.style.color = "var(--hint-color)";
            } else if (ownerId === myId) {
                btn.disabled = false;
                btn.style.opacity = "1";
                ownerDiv.textContent = "🔒 IN USO DA TE";
                ownerDiv.style.color = "#4caf50";
            } else {
                btn.disabled = true;
                btn.style.opacity = "0.4";
                db.ref(`rooms/${roomCode}/players/${ownerId}/name`).once('value', s => {
                    ownerDiv.textContent = `🔒 ${s.val() || 'ALTRO'}`;
                });
                ownerDiv.style.color = "#ff9800";
            }
        });

        if (coopActiveFreqIndex > 0 && owners[coopActiveFreqIndex] === myId && state.activeWords && state.activeWords.length === 3) {
            const currentFreqWord = state.activeWords[coopActiveFreqIndex - 1];
            if (currentFreqWord && currentFreqWord !== gameWords[0]) {
                gameWords[0] = currentFreqWord;
                inputActive = true;

                stopAllMorseAudio();
                playMorseAudio(currentFreqWord, currentWpm);

                if (els.permanentGameInput) {
                    els.permanentGameInput.value = "";
                    els.permanentGameInput.focus();
                }
            }
        }
    });
};

window.setupCoopFreqButtons = function() {
    const labels = ["🟢 FREQ 1 (3-4 car.)", "🟡 FREQ 2 (5-6 car.)", "🔴 FREQ 3 (7+ car.)"];

    [1, 2, 3].forEach(num => {
        const btn = document.getElementById(`btnCoopFreq${num}`); // Accesso diretto per sicurezza
        if (!btn) return;
        btn.onclick = (e) => {
            if (e) e.preventDefault();
            console.log("Co-op: Selecting frequency", num);

            db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) owners = { 1: null, 2: null, 3: null };
                if (owners[num] && owners[num] !== myId) return undefined;
                [1, 2, 3].forEach(n => { if (owners[n] === myId) owners[n] = null; });
                owners[num] = myId;
                return owners;
            }, (error, committed, snapshot) => {
                if (error) {
                    console.error("Co-op Transaction Error:", error);
                    return;
                }
                if (committed) {
                    coopActiveFreqIndex = num;
                    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = `Canale: ${labels[num - 1]}`;
                    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'inline-block';

                    if (els.permanentGameInput) {
                        els.permanentGameInput.disabled = false;
                        els.permanentGameInput.placeholder = "Digita qui...";
                        els.permanentGameInput.focus();
                    }
                    inputActive = true;

                    // Forza il controllo immediato della parola per evitare attese dal listener
                    db.ref(`rooms/${roomCode}/coop_state/activeWords`).once('value', s => {
                        const words = s.val();
                        if (words && words[num - 1]) {
                            const newWord = words[num - 1];
                            gameWords[0] = newWord;
                            stopAllMorseAudio();
                            setTimeout(() => {
                                if (gameRunning && window.isCoopMode && coopActiveFreqIndex === num) {
                                    playMorseAudio(newWord, currentWpm);
                                }
                            }, 300);
                            if (els.permanentGameInput) els.permanentGameInput.focus();
                        } else {
                            console.warn("Co-op: activeWords not yet available for selection");
                        }
                    });
                } else {
                    showToast("⚠️ Frequenza occupata da un compagno!");
                }
            });
        };
    });

    if (els.btnCoopReleaseFreq) {
        els.btnCoopReleaseFreq.onclick = () => {
            db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) return owners;
                [1, 2, 3].forEach(n => { if (owners[n] === myId) owners[n] = null; });
                return owners;
            }, () => {
                coopActiveFreqIndex = 0;
                inputActive = false;
                stopAllMorseAudio();
                if (els.permanentGameInput) {
                    els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴...";
                    els.permanentGameInput.value = "";
                }
                if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato";
                if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';
                showToast("🔓 Canale rilasciato per i compagni.");
            });
        };
    }
};

window.finishCoopGame = function(won) {
    gameRunning = false;
    clearAllTimers();
    if (roomCode) db.ref(`rooms/${roomCode}/coop_state`).off();

    if (roomCode) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const players = snap.val() || {};
            const namesList = Object.values(players).map(p => p.name).join(", ");
            const finalScore = won ? 100 : 75;

            const fakeHeadToHead = {
                "team_real": {
                    id: myId,
                    name: `👥 ${namesList || "Squadra"}`,
                    score: finalScore,
                    wpm: currentWpm,
                    finished: true
                },
                "team_ai": {
                    id: "ai_enemy",
                    name: "🤖 Disturbo Nemico (AI)",
                    score: won ? 99 : 100,
                    wpm: currentWpm + 5,
                    finished: true
                }
            };

            db.ref(`rooms/${roomCode}/players`).set(fakeHeadToHead);

            const matchId = Date.now().toString();
            const matchData = {
                players: Object.values(fakeHeadToHead),
                mode: "conquest",
                wordCount: "Co-op",
                date: new Date().toLocaleDateString('it-IT'),
                ts: firebase.database.ServerValue.TIMESTAMP
            };
            db.ref(`leaderboard/recent_matches/conquest_multi/all/${matchId}`).set(matchData);
        });
    }

    showScreen('leaderboardScreen');
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';
    if (els.coopArea) els.coopArea.style.display = 'none';

    if (won) {
        showToast("🏆 VITTORIA DI SQUADRA! Territorio Conquistato!");
        if (els.roomWinnerBanner) {
            els.roomWinnerBanner.textContent = "🏆 MISSIONE COMPIUTA CONTRO IL DISTURBO NEMICO!";
            els.roomWinnerBanner.style.color = "#4caf50";
        }
        updateActivity(true);
    } else {
        showToast("💀 TEMPO SCADUTO! Il disturbo nemico ha vinto.");
        if (els.roomWinnerBanner) {
            els.roomWinnerBanner.textContent = "💀 MISSIONE FALLITA: HA VINTO L'AVVERSARIO IRREALE";
            els.roomWinnerBanner.style.color = "#d32f2f";
        }
        updateActivity(false);
    }
};
