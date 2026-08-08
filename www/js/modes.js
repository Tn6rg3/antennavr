// ============================================================================
// MODES.JS - MODALITÀ SPECIALI: CONQUISTA, QUIZ, BATTAGLIA REALE, SPETTATORE
// ============================================================================

// --- CONQUISTA (CO-OP) ---
function startCoopSequence() {
    isCoopMode = true;
    showScreen('gameArea');
    if (els.coopArea) els.coopArea.style.display = 'flex';
    if (els.gameInputArea) els.gameInputArea.style.display = 'flex';
    if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none';
    if (els.tableWrapper) els.tableWrapper.style.display = 'none';

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
        const initialWords = generateCoopTripleWords();
        db.ref(`rooms/${roomCode}/coop_state`).set({
            progress: 10,
            timeRemaining: 300,
            status: 'playing',
            activeWords: initialWords,
            freqOwners: { 1: null, 2: null, 3: null }
        });
        startCoopHostTimers();
    }

    listenToCoopState();
    setupCoopFreqButtons();
}

function generateCoopTripleWords() {
    const wEasy = masterDictionary.filter(w => w.length >= 3 && w.length <= 4);
    const wMed  = masterDictionary.filter(w => w.length >= 5 && w.length <= 6);
    const wHard = masterDictionary.filter(w => w.length >= 7);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.toUpperCase() || "RADIO";
    return [pick(wEasy), pick(wMed), pick(wHard)];
}

function startCoopHostTimers() {
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
}

function listenToCoopState() {
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
}

function setupCoopFreqButtons() {
    const labels = ["🟢 FREQ 1 (3-4 car.)", "🟡 FREQ 2 (5-6 car.)", "🔴 FREQ 3 (7+ car.)"];

    [1, 2, 3].forEach(num => {
        const btn = els[`btnCoopFreq${num}`];
        if (!btn) return;
        btn.onclick = () => {
            db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(owners => {
                if (!owners) owners = { 1: null, 2: null, 3: null };
                if (owners[num] && owners[num] !== myId) return undefined;
                [1, 2, 3].forEach(n => { if (owners[n] === myId) owners[n] = null; });
                owners[num] = myId;
                return owners;
            }, (error, committed, snapshot) => {
                if (committed) {
                    const latestOwners = snapshot.val() || {};
                    coopActiveFreqIndex = num;
                    if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = `Canale: ${labels[num - 1]}`;
                    if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'inline-block';

                    if (els.permanentGameInput) {
                        els.permanentGameInput.disabled = false;
                        els.permanentGameInput.placeholder = "Digita qui...";
                        els.permanentGameInput.focus();
                    }
                    inputActive = true;

                    db.ref(`rooms/${roomCode}/coop_state/activeWords`).once('value', s => {
                        const words = s.val();
                        if (words && words[num - 1] && latestOwners[num] === myId) {
                            gameWords[0] = words[num - 1];
                            stopAllMorseAudio();
                            playMorseAudio(words[num - 1], currentWpm);
                            if (els.permanentGameInput) els.permanentGameInput.focus();
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
}

function finishCoopGame(won) {
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
}

// --- QUIZ MORSE ---
const FALLBACK_QUIZ_QUESTIONS = [
    { q: "SOS", a: ["Segnale di soccorso", "Saluti operativi", "Fine trasmissione", "Stazione radio"], correct: 0 },
    { q: "CQ", a: ["Chiamata a tutti", "Conferma ricezione", "Cambio frequenza", "Codice segreto"], correct: 0 },
    { q: "QTH", a: ["La mia posizione è...", "Qual è il tuo nome?", "Chiudi la trasmissione", "Segnale disturbato"], correct: 0 },
    { q: "QRS", a: ["Trasmetti più lentamente", "Aumenta velocità", "Frequenza occupata", "Ripeti messaggio"], correct: 0 },
    { q: "QRZ", a: ["Chi mi chiama?", "Come mi ricevi?", "Pronto a trasmettere", "Fine lavoro"], correct: 0 },
    { q: "QSL", a: ["Confermo ricezione", "Negativo", "In attesa", "Disturbo atmosferico"], correct: 0 },
    { q: "73", a: ["Cordiali saluti", "Buona fortuna", "A presto", "Grazie di tutto"], correct: 0 },
    { q: "88", a: ["Amore e baci", "Saluti formali", "Arrivederci", "Codice di chiusura"], correct: 0 },
    { q: "QRT", a: ["Sospendo le trasmissioni", "Inizio trasmissioni", "Cambio canale", "Ripeti di nuovo"], correct: 0 },
    { q: "QRV", a: ["Sei pronto?", "Sono occupato", "Aumenta potenza", "Chiudi stazione"], correct: 0 }
];

function getAvailableQuizQuestions() {
    if (typeof QUIZ_QUESTIONS !== 'undefined' && Array.isArray(QUIZ_QUESTIONS) && QUIZ_QUESTIONS.length > 0) {
        return QUIZ_QUESTIONS;
    }
    if (typeof window.QUIZ_QUESTIONS !== 'undefined' && Array.isArray(window.QUIZ_QUESTIONS) && window.QUIZ_QUESTIONS.length > 0) {
        return window.QUIZ_QUESTIONS;
    }
    return FALLBACK_QUIZ_QUESTIONS;
}

function prepareShuffledQuestion(rawQuestion) {
    if (!rawQuestion || !Array.isArray(rawQuestion.a)) return rawQuestion;
    const correctText = rawQuestion.a[rawQuestion.correct || 0];
    const shuffledOptions = fisherYatesShuffle([...rawQuestion.a]);
    const newCorrectIndex = shuffledOptions.indexOf(correctText);
    return {
        q: rawQuestion.q,
        a: shuffledOptions,
        correct: newCorrectIndex >= 0 ? newCorrectIndex : 0
    };
}

function startQuizSequence() {
    showScreen('quizArea');
    gameRunning = true;
    lastLoadedQuizIndex = -1;
    if (els.quizWpmDisplay) els.quizWpmDisplay.textContent = `WPM: ${currentWpm}`;
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;

    const availableQuestions = getAvailableQuizQuestions();

    if (roomCode && !isSinglePlayer) {
        if (listeners.quizState) db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState);

        listeners.quizState = db.ref(`rooms/${roomCode}/quiz_state`).on('value', snap => {
            const state = snap.val();
            if (!state || !gameRunning) return;
            const newIndex = state.questionIndex || 0;
            if (state.questionsOrder && Array.isArray(state.questionsOrder)) {
                randomizedQuizQuestions = state.questionsOrder.map(idx => availableQuestions[idx % availableQuestions.length]);
            } else {
                randomizedQuizQuestions = availableQuestions;
            }
            if (newIndex !== lastLoadedQuizIndex) {
                lastLoadedQuizIndex = newIndex;
                quizQuestionIndex = newIndex;
                loadNextQuizQuestion();
            }
            quizActiveBuzzerId = state.activeBuzzerId || null;
            renderQuizUI(state);
        });

        if (myId === roomHostId) {
            const order = fisherYatesShuffle(Array.from({length: availableQuestions.length}, (_, i) => i));
            db.ref(`rooms/${roomCode}/quiz_state`).set({
                questionIndex: 0,
                activeBuzzerId: null,
                status: 'playing',
                questionsOrder: order
            });
        }
    } else {
        randomizedQuizQuestions = fisherYatesShuffle(availableQuestions);
        quizQuestionIndex = 0;
        loadNextQuizQuestion();
    }
}

function loadNextQuizQuestion() {
    const maxQuestions = Math.min(requestedWordCount, randomizedQuizQuestions.length);
    if (quizQuestionIndex >= maxQuestions || quizQuestionIndex >= randomizedQuizQuestions.length) {
        return finishGame();
    }
    const rawQ = randomizedQuizQuestions[quizQuestionIndex];
    if (!rawQ || !rawQ.q) {
        setTimeout(() => { if (gameRunning) loadNextQuizQuestion(); }, 400);
        return;
    }
    currentQuizQuestion = prepareShuffledQuestion(rawQ);
    setTimeout(() => { if (gameRunning) playQuizAudioSequence(); }, 300);
}

async function playQuizAudioSequence() {
    if (!gameRunning || !currentQuizQuestion) return;
    stopAllMorseAudio();
    inputActive = false;
    disableQuizButtons(true);
    ['A', 'B', 'C', 'D'].forEach(l => { if (els['btnQuiz'+l]) els['btnQuiz'+l].classList.remove('active-choice'); });
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "Ascolta la domanda...";
    await playMorseAudio(currentQuizQuestion.q, currentWpm);
    if (!gameRunning) return;
    await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < 4; i++) {
        const letter = ["A", "B", "C", "D"][i];
        if (!gameRunning) return;
        if (els.quizQuestionBox) els.quizQuestionBox.textContent = `Opzione ${letter}...`;
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.add('active-choice');
        await playMorseAudio(`${letter} ${currentQuizQuestion.a[i]}`, currentWpm);
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.remove('active-choice');
        if (!gameRunning) return;
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!gameRunning) return;
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "SCEGLI LA TUA RISPOSTA!";
    enableQuizControls();
    startQuizTimer(20);
}

function enableQuizControls() {
    inputActive = true;
    if (isSinglePlayer) {
        disableQuizButtons(false);
    } else {
        if (els.quizBuzzer) els.quizBuzzer.style.display = 'block';
        if (els.quizOptionsContainer) els.quizOptionsContainer.style.opacity = '0.5';
        disableQuizButtons(true);
    }
}

function disableQuizButtons(disabled) {
    ['A', 'B', 'C', 'D'].forEach(l => { if (els['btnQuiz'+l]) els['btnQuiz'+l].disabled = disabled; });
}

function startQuizTimer(seconds) {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    let timeLeft = 100;
    quizTimerInterval = setInterval(() => {
        timeLeft -= 100 / (seconds * 10);
        if (els.quizTimerProgress) els.quizTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            if (inputActive) {
                showToast("Tempo scaduto!");
                if (isSinglePlayer || quizActiveBuzzerId === myId) submitQuizAnswer(-1);
            }
        }
    }, 100);
}

function submitQuizAnswer(index) {
    if (!isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) return;
    if (isSinglePlayer && !inputActive) return;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    inputActive = false;
    disableQuizButtons(true);
    if (index === currentQuizQuestion.correct) {
        totalScore += 100;
        showToast(`CORRETTO (${["A", "B", "C", "D"][index]})! +100`);
    } else {
        showToast(`SBAGLIATO! Era la ${["A", "B", "C", "D"][currentQuizQuestion.correct]}`);
    }
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wordIndex: quizQuestionIndex + 1 });
    setTimeout(() => {
        if (!gameRunning) return;
        if (roomCode && !isSinglePlayer) {
            db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => {
                if (state && state.activeBuzzerId === myId) {
                    state.questionIndex = (state.questionIndex || 0) + 1;
                    state.activeBuzzerId = null;
                }
                return state;
            });
        } else if (isSinglePlayer) {
            quizQuestionIndex++;
            loadNextQuizQuestion();
        }
    }, 3000);
}

if (els.quizBuzzer) {
    els.quizBuzzer.addEventListener('click', () => {
        if (roomCode && !isSinglePlayer && !quizActiveBuzzerId && inputActive) {
            db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => {
                if (state && !state.activeBuzzerId) state.activeBuzzerId = myId;
                return state;
            });
        }
    });
}

for (let i = 0; i < 4; i++) {
    const l = ["A", "B", "C", "D"][i];
    if (els['btnQuiz'+l]) els['btnQuiz'+l].onclick = () => submitQuizAnswer(i);
    if (els['replay'+l]) els['replay'+l].onclick = () => { if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.a[i], currentWpm); };
}

if (els.quizReplayQ) {
    els.quizReplayQ.onclick = () => { if (currentQuizQuestion) playMorseAudio(currentQuizQuestion.q, currentWpm); };
}

if (els.quitQuizBtn) {
    els.quitQuizBtn.onclick = () => {
        if (confirm("Vuoi abbandonare il Quiz?")) {
            if (quizTimerInterval) clearInterval(quizTimerInterval);
            gameRunning = false;
            exitRoomCleanly();
        }
    };
}

function renderQuizUI(state) {
    if (!els.quizBuzzer || !els.buzzerWinner || !els.quizOptionsContainer) return;
    if (state.activeBuzzerId) {
        els.quizBuzzer.style.display = 'none';
        if (state.activeBuzzerId === myId) {
            els.buzzerWinner.textContent = "TOCCA A TE!";
            els.quizOptionsContainer.style.opacity = '1';
            disableQuizButtons(false);
        } else {
            els.buzzerWinner.textContent = "L'AVVERSARIO RISPONDE...";
            els.quizOptionsContainer.style.opacity = '0.5';
            disableQuizButtons(true);
        }
    } else {
        els.buzzerWinner.textContent = "";
        els.quizBuzzer.style.display = inputActive ? 'block' : 'none';
        els.quizOptionsContainer.style.opacity = '0.5';
        disableQuizButtons(true);
    }
}

// --- BATTAGLIA REALE SERALE ---
const BR_H_BANNER = 9;
const BR_M_BANNER = 54;
const BR_H_START = 21;
const BR_M_START = 30;

let brRoomCode = "";
let brIsPlaying = false, brAmIAlive = true;

function initBattleRoyaleScheduler() {
    checkBattleTime();
    if (brCheckInterval) clearInterval(brCheckInterval);
    brCheckInterval = setInterval(checkBattleTime, 100000);
}

window.toggleBattleRoyaleJoin = function() {
    if (!brRoomCode) {
        const now = new Date(Date.now() + serverTimeOffset);
        const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
        brRoomCode = "BR_" + dKey;
    }
    db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', pSnap => {
        if (pSnap.exists()) {
            db.ref(`rooms/${brRoomCode}/players/${myId}`).remove().then(() => { showToast("Ti sei ritirato dalla sfida serale."); });
        } else {
            db.ref(`rooms/${brRoomCode}`).update({ status: 'enrolling', type: 'battle_royale', wpm: 25, round: 0, hostId: myId, createdAt: firebase.database.ServerValue.TIMESTAMP });
            db.ref(`rooms/${brRoomCode}/players/${myId}`).set({ name: myName, lives: 3, status: 'Iscritto ⏳', answered: false }).then(() => { showToast("⚔️ Iscrizione registrata!"); });
        }
    });
};

function checkBattleTime() {
    if (gameRunning || brIsPlaying || brBannerDismissedToday) return;
    const now = new Date(Date.now() + serverTimeOffset);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const bannerTotalMinutes = BR_H_BANNER * 60 + BR_M_BANNER;
    const startTotalMinutes = BR_H_START * 60 + BR_M_START;
    const isTime = (currentTotalMinutes >= bannerTotalMinutes && currentTotalMinutes < startTotalMinutes);
    const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
    brRoomCode = "BR_" + dKey;

    if (isTime) {
        if (els.brBanner && els.brBanner.style.display === 'none') {
            els.brBanner.style.display = 'block';
            if (brBannerTimeout) clearTimeout(brBannerTimeout);
            brBannerTimeout = setTimeout(() => { if (els.brBanner) els.brBanner.style.display = 'none'; brBannerDismissedToday = true; db.ref(`rooms/${brRoomCode}/players`).off('value'); }, 10000);
        }
        if (els.btnJoinBR) {
            els.btnJoinBR.onclick = () => {
                window.toggleBattleRoyaleJoin();
                if (brBannerTimeout) clearTimeout(brBannerTimeout);
                brBannerTimeout = setTimeout(() => { if (els.brBanner) els.brBanner.style.display = 'none'; brBannerDismissedToday = true; db.ref(`rooms/${brRoomCode}/players`).off('value'); }, 10000);
            };
        }
        db.ref(`rooms/${brRoomCode}/players`).on('value', snap => {
            const players = snap.val() || {};
            const count = Object.keys(players).length;
            if (els.brEnrolledCount) els.brEnrolledCount.textContent = count;
            if (els.brEnrolledCountCompact) els.brEnrolledCountCompact.textContent = count;
            if (players[myId]) {
                if (els.brBanner) { els.brBanner.style.backgroundColor = '#4caf50'; els.brBanner.style.borderColor = '#81c784'; els.brBanner.style.padding = '8px 12px'; }
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'none';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'inline-block';
                if (els.btnJoinBR) { els.btnJoinBR.textContent = 'RITIRATI DALLA SFIDA'; els.btnJoinBR.style.color = '#4caf50'; els.btnJoinBR.style.width = 'auto'; els.btnJoinBR.style.flexGrow = '1'; }
            } else {
                if (els.brBanner) { els.brBanner.style.backgroundColor = '#e53935'; els.brBanner.style.borderColor = '#ff5252'; els.brBanner.style.padding = '15px'; }
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'block';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'none';
                if (els.btnJoinBR) { els.btnJoinBR.textContent = 'PARTECIPA ALLA SFIDA'; els.btnJoinBR.style.color = '#e53935'; els.btnJoinBR.style.width = '100%'; els.btnJoinBR.style.flexGrow = '0'; }
            }
        });
    } else {
        if (els.brBanner) els.brBanner.style.display = 'none';
        db.ref(`rooms/${brRoomCode}/players`).off('value');
    }
    if (currentHour === BR_H_START && currentMinute === BR_M_START) {
        db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', snap => {
            if (snap.exists() && activeTab !== "br_playing") {
                activeTab = "br_playing";
                lastBRRoundPlayed = -1;
                showScreen('brScreen');
                listenToBattleRoyaleRoom();
            }
        });
        startBattleRoyaleSystem();
    }
}

function listenToBattleRoyaleRoom() {
    db.ref(`rooms/${brRoomCode}`).on('value', snap => {
        if (!snap.exists()) { showScreen('setupScreen'); alert("La Battaglia è stata annullata o è terminata."); return; }
        const rData = snap.val();
        renderBRPlayers(rData.players || {});
        if (rData.status === 'cancelled') {
            if (els.brStatusText) els.brStatusText.textContent = "Annullata: Giocatori insufficienti (<5).";
            setTimeout(() => { showScreen('setupScreen'); activeTab = "room"; }, 4000);
            return;
        }
        if (rData.status === 'playing') {
            brIsPlaying = true;
            if (els.brWpmDisplay) els.brWpmDisplay.textContent = rData.wpm + " WPM";
            const myData = rData.players[myId];
            brAmIAlive = myData && myData.lives > 0;
            const hearts = ["💀 ELIMINATO", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
            let safeLives = myData && myData.lives ? parseInt(myData.lives) : 0;
            if (safeLives < 0) safeLives = 0; if (safeLives > 5) safeLives = 5;
            if (els.brLivesDisplay) els.brLivesDisplay.textContent = brAmIAlive ? hearts[safeLives] : "💀 ELIMINATO";
            if (rData.roundEndTime && rData.currentWord && rData.round !== lastBRRoundPlayed) {
                lastBRRoundPlayed = rData.round; handleBRRound(rData);
            }
        }
        if (rData.status === 'finished') {
            brIsPlaying = false; lastBRRoundPlayed = -1;
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
        const li = document.createElement('li'); li.style.cssText = "display:flex; justify-content:space-between; padding:5px; border-bottom:1px dashed rgba(255,255,255,0.1);";
        const info = document.createElement('span'); const heartsList = ["💀", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
        let safePLives = p.lives ? parseInt(p.lives) : 0; if (safePLives < 0) safePLives = 0; if (safePLives > 5) safePLives = 5;
        info.innerHTML = `<b style="color:var(--link-color);">${escapeHTML(p.name)}</b> <small>${heartsList[safePLives]}</small>`;
        const status = document.createElement('span'); status.style.fontSize = "0.85em"; status.style.color = p.status === 'Corretto!' ? '#4caf50' : (p.status === 'Eliminato' || p.status === 'Errore!' ? '#e53935' : 'var(--hint-color)');
        status.textContent = p.status; li.appendChild(info); li.appendChild(status); els.brPlayersList.appendChild(li);
    });
}

function startBattleRoyaleSystem() {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData && rData.hostId === myId) {
            const pCount = Object.keys(rData.players || {}).length;
            if (pCount < 5) db.ref(`rooms/${brRoomCode}/status`).set('cancelled');
            else { db.ref(`rooms/${brRoomCode}/status`).set('playing'); hostNextBRRound(rData, 25, 1); }
        }
    });
}

function hostNextBRRound(rData, wpm, roundNum) {
    const word = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
    const endTime = Date.now() + 30000;
    let updates = {};
    Object.keys(rData.players || {}).forEach(pid => { if (rData.players[pid].lives > 0) { updates[`players/${pid}/answered`] = false; updates[`players/${pid}/status`] = 'Ascolto...'; } });
    updates['currentWord'] = word; updates['wpm'] = wpm; updates['round'] = roundNum; updates['roundEndTime'] = endTime;
    db.ref(`rooms/${brRoomCode}`).update(updates);
    setTimeout(() => checkBRRoundResults(wpm, roundNum), 31000);
}

function handleBRRound(rData) {
    if (brTimerInterval) clearInterval(brTimerInterval);
    if (els.brStatusText) els.brStatusText.textContent = `Round ${rData.round}! Attenzione...`;
    if (brAmIAlive && !rData.players[myId].answered) {
        if (els.brInputArea) els.brInputArea.style.display = 'flex';
        if (els.brInput) { els.brInput.disabled = false; els.brInput.placeholder = "Decodifica e scrivi qui..."; els.brInput.value = ''; els.brInput.focus(); }
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'block';
        playMorseAudio(rData.currentWord, rData.wpm);
    } else { if (els.brInputArea) els.brInputArea.style.display = 'none'; if (els.brTimerContainer) els.brTimerContainer.style.display = 'none'; }
    brTimerInterval = setInterval(() => {
        const left = rData.roundEndTime - Date.now();
        if (left <= 0) { clearInterval(brTimerInterval); if (els.brTimerProgress) els.brTimerProgress.style.width = '0%'; if (brAmIAlive && !rData.players[myId].answered) submitBRAnswer(rData.currentWord, true); }
        else if (els.brTimerProgress) { els.brTimerProgress.style.width = (left / 30000 * 100) + '%'; if (left < 10000) els.brTimerProgress.style.background = '#e53935'; else if (left < 20000) els.brTimerProgress.style.background = '#ff9800'; else els.brTimerProgress.style.background = '#4caf50'; }
    }, 100);
}

if (els.brInput) { els.brInput.addEventListener('keypress', e => { if (e.key === 'Enter' && els.btnSendBr) els.btnSendBr.click(); }); }
if (els.btnSendBr) { els.btnSendBr.addEventListener('click', () => { db.ref(`rooms/${brRoomCode}/currentWord`).once('value', s => { submitBRAnswer(s.val(), false); }); }); }

function submitBRAnswer(realWord, isTimeout) {
    if (!brAmIAlive || !els.brInput) return; clearInterval(brTimerInterval);
    const typed = els.brInput.value.trim().toUpperCase().substring(0, 50);
    els.brInput.placeholder = isTimeout ? "Tempo scaduto!" : "Risposta inviata! Attendi...";
    els.brInput.value = ''; els.brInput.focus();
    const isCorrect = !isTimeout && (typed === realWord);
    db.ref(`rooms/${brRoomCode}/players/${myId}`).transaction(p => { if (!p) return p; p.answered = true; if (isCorrect) p.status = 'Corretto!'; else { p.lives -= 1; p.status = p.lives === 0 ? 'Eliminato' : 'Errore!'; } return p; });
}

function checkBRRoundResults(currentWpm, currentRound) {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rData = snap.val(); if (rData.hostId !== myId) return;
        let aliveCount = 0; let lastAliveName = "";
        Object.values(rData.players || {}).forEach(p => { if (p.lives > 0) { aliveCount++; lastAliveName = p.name; } });
        if (aliveCount <= 1) { db.ref(`rooms/${brRoomCode}/status`).set('finished'); db.ref(`rooms/${brRoomCode}/winner`).set(aliveCount === 1 ? lastAliveName : 'Nessuno'); }
        else { hostNextBRRound(rData, currentWpm + 1, currentRound + 1); }
    });
}

if (els.btnLeaveBR) { els.btnLeaveBR.addEventListener('click', () => { if (confirm("Vuoi abbandonare la Battaglia Serale?")) { brIsPlaying = false; lastBRRoundPlayed = -1; activeTab = "room"; if (brTimerInterval) clearInterval(brTimerInterval); db.ref(`rooms/${brRoomCode}/players/${myId}`).remove(); showScreen('setupScreen'); } }); }

// --- MODALITÀ SPETTATORE ---
window.watchSpecificRoom = function(code, targetName) {
    roomCode = code; showScreen('gameArea');
    if (els.permanentGameInput) { els.permanentGameInput.disabled = true; els.permanentGameInput.placeholder = `👁️ Stai osservando la partita di ${targetName}...`; els.permanentGameInput.value = ""; }
    if (els.wpmDisplay) els.wpmDisplay.textContent = "👁️ SPETTATORE | WPM: --";
    if (els.spectatorsCountDisplay) els.spectatorsCountDisplay.style.display = 'none';
    const mySpectatorRef = db.ref(`rooms/${roomCode}/spectators/${myId}`); mySpectatorRef.set({ name: myName, ts: firebase.database.ServerValue.TIMESTAMP }); mySpectatorRef.onDisconnect().remove();
    const roomRef = db.ref(`rooms/${roomCode}`);
    const onRoomChange = roomRef.on('value', snap => {
        if (!snap.exists()) { showToast("⚠️ Partita terminata."); stopWatchingCleanly(); return; }
        const rData = snap.val(); const hostData = Object.values(rData.players || {})[0];
        if (!hostData || hostData.finished) { showToast("🏁 Partita terminata!"); stopWatchingCleanly(); return; }
        const currentSpeed = hostData.wpm || rData.wpm || 20; if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${currentSpeed}`; if (els.scoreDisplay) els.scoreDisplay.textContent = `Punti: ${hostData.score || 0}`;
        if (els.tableBody && hostData.matchDetails) {
            els.tableBody.innerHTML = "";
            hostData.matchDetails.forEach(row => {
                const tr = document.createElement('tr'); const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || "-";
                const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ""); tdReal.appendChild(bReal);
                const tdPoints = document.createElement('td'); tdPoints.style.color = row.points > 0 ? "#4caf50" : "#d32f2f"; tdPoints.style.fontWeight = "bold"; tdPoints.textContent = row.points;
                tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.tableBody.appendChild(tr);
            });
            setTimeout(() => { if (els.tableWrapper) els.tableWrapper.scrollTop = els.tableWrapper.scrollHeight; }, 50);
        }
    });
    const onAudioChange = db.ref(`rooms/${roomCode}/liveAudio`).on('value', snap => { const audioData = snap.val(); if (audioData && audioData.word) { const liveWpm = audioData.wpm || 20; if (els.wpmDisplay) els.wpmDisplay.textContent = `👁️ SPETTATORE | WPM: ${liveWpm}`; playMorseAudio(audioData.word, liveWpm, true); } });
    window.currentSpectatorCleanup = function() { roomRef.off('value', onRoomChange); db.ref(`rooms/${roomCode}/liveAudio`).off('value', onAudioChange); mySpectatorRef.remove(); };
};

function stopWatchingCleanly() { if (typeof window.currentSpectatorCleanup === 'function') { window.currentSpectatorCleanup(); window.currentSpectatorCleanup = null; } setTimeout(() => { roomCode = ""; goBackToMenu(); }, 2500); }
