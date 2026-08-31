// js/quiz_manager.js

window.FALLBACK_QUIZ_QUESTIONS = [
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

window.getAvailableQuizQuestions = function() {
    if (typeof QUIZ_QUESTIONS !== 'undefined' && Array.isArray(QUIZ_QUESTIONS) && QUIZ_QUESTIONS.length > 0) {
        return QUIZ_QUESTIONS;
    }
    if (typeof window.QUIZ_QUESTIONS !== 'undefined' && Array.isArray(window.QUIZ_QUESTIONS) && window.QUIZ_QUESTIONS.length > 0) {
        return window.QUIZ_QUESTIONS;
    }
    return window.FALLBACK_QUIZ_QUESTIONS;
};

window.prepareShuffledQuestion = function(rawQuestion) {
    if (!rawQuestion || !Array.isArray(rawQuestion.a)) return rawQuestion;
    const correctText = rawQuestion.a[rawQuestion.correct || 0];
    const shuffledOptions = fisherYatesShuffle([...rawQuestion.a]);
    const newCorrectIndex = shuffledOptions.indexOf(correctText);
    return {
        q: rawQuestion.q,
        a: shuffledOptions,
        correct: newCorrectIndex >= 0 ? newCorrectIndex : 0
    };
};

window.startQuizSequence = function() {
    showScreen('quizArea');
    gameRunning = true;
    lastLoadedQuizIndex = -1;
    if (els.quizWpmDisplay) els.quizWpmDisplay.textContent = `WPM: ${currentWpm}`;
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;

    const availableQuestions = window.getAvailableQuizQuestions();

    if (roomCode && !window.isSinglePlayer) {
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
                window.loadNextQuizQuestion();
            }
            quizActiveBuzzerId = state.activeBuzzerId || null;
            window.renderQuizUI(state);
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
        window.loadNextQuizQuestion();
    }
};

window.loadNextQuizQuestion = function() {
    const maxQuestions = Math.min(requestedWordCount, randomizedQuizQuestions.length);
    if (quizQuestionIndex >= maxQuestions || quizQuestionIndex >= randomizedQuizQuestions.length) {
        return finishGame();
    }

    const rawQ = randomizedQuizQuestions[quizQuestionIndex];

    if (!rawQ || !rawQ.q) {
        setTimeout(() => {
            if (gameRunning) window.loadNextQuizQuestion();
        }, 400);
        return;
    }

    currentQuizQuestion = window.prepareShuffledQuestion(rawQ);

    setTimeout(() => {
        if (gameRunning) window.playQuizAudioSequence();
    }, 300);
};

window.playQuizAudioSequence = async function() {
    if (!gameRunning || !currentQuizQuestion) return;

    stopAllMorseAudio();
    inputActive = false;
    window.disableQuizButtons(true);
    ['A', 'B', 'C', 'D'].forEach(l => {
        if (els['btnQuiz'+l]) els['btnQuiz'+l].classList.remove('active-choice');
    });

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
    window.enableQuizControls();
    window.startQuizTimer(20);
};

window.enableQuizControls = function() {
    inputActive = true;
    if (window.isSinglePlayer) {
        window.disableQuizButtons(false);
    } else {
        if (els.quizBuzzer) els.quizBuzzer.style.display = 'block';
        if (els.quizOptionsContainer) els.quizOptionsContainer.style.opacity = '0.5';
        window.disableQuizButtons(true);
    }
};

window.disableQuizButtons = function(disabled) {
    ['A', 'B', 'C', 'D'].forEach(l => {
        if (els['btnQuiz'+l]) els['btnQuiz'+l].disabled = disabled;
    });
};

window.startQuizTimer = function(seconds) {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    let timeLeft = 100;
    quizTimerInterval = setInterval(() => {
        timeLeft -= 100 / (seconds * 10);
        if (els.quizTimerProgress) els.quizTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            if (inputActive) {
                showToast("Tempo scaduto!");
                if (window.isSinglePlayer || quizActiveBuzzerId === myId) window.submitQuizAnswer(-1);
            }
        }
    }, 100);
};

window.submitQuizAnswer = function(index) {
    if (!window.isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) return;
    if (window.isSinglePlayer && !inputActive) return;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    inputActive = false;
    window.disableQuizButtons(true);

    const isCorrect = (index === currentQuizQuestion.correct);
    const feedbackBox = els.quizQuestionBox;

    if (isCorrect) {
        totalScore += 100;
        if (feedbackBox) {
            feedbackBox.innerHTML = `<span style="color:#4caf50; font-size:1.5em;">✅ CORRETTO!</span><br>+100 punti`;
        }

        // AGGIORNAMENTO MISSIONI
        window.currentStreak++;
        if (typeof window.updateMissionProgress === 'function') {
            window.updateMissionProgress('count', 1);
            window.updateMissionProgress('streak', window.currentStreak);
        }

        if (typeof playBeep === 'function') playBeep(880, 0.2);
        // Colora di verde il pulsante premuto
        const btn = els['btnQuiz' + ["A", "B", "C", "D"][index]];
        if (btn) btn.style.backgroundColor = "#4caf50";
    } else {
        // RESET STREAK IN CASO DI ERRORE
        window.currentStreak = 0;

        const correctLetter = ["A", "B", "C", "D"][currentQuizQuestion.correct];
        if (feedbackBox) {
            feedbackBox.innerHTML = `<span style="color:#f44336; font-size:1.5em;">❌ SBAGLIATO</span><br>Era la risposta ${correctLetter}`;
        }
        if (typeof playBeep === 'function') playBeep(300, 0.4);

        // Colora di rosso lo sbagliato e di verde il corretto
        if (index >= 0) {
            const btnWrong = els['btnQuiz' + ["A", "B", "C", "D"][index]];
            if (btnWrong) btnWrong.style.backgroundColor = "#f44336";
        }
        const btnCorrect = els['btnQuiz' + correctLetter];
        if (btnCorrect) btnCorrect.style.backgroundColor = "#4caf50";
    }

    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wordIndex: quizQuestionIndex + 1 });

    setTimeout(() => {
        if (!gameRunning) return;

        // Reset colori pulsanti
        ['A', 'B', 'C', 'D'].forEach(l => {
            if (els['btnQuiz'+l]) els['btnQuiz'+l].style.backgroundColor = "";
        });

        if (roomCode && !window.isSinglePlayer) {
            db.ref(`rooms/${roomCode}/quiz_state`).transaction(state => {
                if (state && state.activeBuzzerId === myId) {
                    state.questionIndex = (state.questionIndex || 0) + 1;
                    state.activeBuzzerId = null;
                }
                return state;
            });
        } else if (window.isSinglePlayer) {
            quizQuestionIndex++;
            window.loadNextQuizQuestion();
        }
    }, 3000);
};

window.renderQuizUI = function(state) {
    if (!els.quizBuzzer || !els.buzzerWinner || !els.quizOptionsContainer) return;
    if (state.activeBuzzerId) {
        els.quizBuzzer.style.display = 'none';
        if (state.activeBuzzerId === myId) {
            els.buzzerWinner.textContent = "TOCCA A TE!";
            els.quizOptionsContainer.style.opacity = '1';
            window.disableQuizButtons(false);
        } else {
            els.buzzerWinner.textContent = "L'AVVERSARIO RISPONDE...";
            els.quizOptionsContainer.style.opacity = '0.5';
            window.disableQuizButtons(true);
        }
    } else {
        els.quizOptionsContainer.style.opacity = '0.5';
        window.disableQuizButtons(true);
    }
};

window.initQuizManager = function() {
    console.log("Quiz: Initializing listeners...");

    // Pulsanti Risposta
    ['A', 'B', 'C', 'D'].forEach((l, idx) => {
        if (els['btnQuiz' + l]) {
            els['btnQuiz' + l].onclick = () => window.submitQuizAnswer(idx);
        }
        if (els['replay' + l]) {
            els['replay' + l].onclick = () => {
                if (currentQuizQuestion) {
                    stopAllMorseAudio();
                    playMorseAudio(`${l} ${currentQuizQuestion.a[idx]}`, currentWpm, true);
                }
            };
        }
    });

    // Riascolta Domanda
    if (els.quizReplayQ) {
        els.quizReplayQ.onclick = () => {
            if (currentQuizQuestion) {
                stopAllMorseAudio();
                playMorseAudio(currentQuizQuestion.q, currentWpm, true);
            }
        };
    }

    // Buzzer (Multiplayer)
    if (els.quizBuzzer) {
        els.quizBuzzer.onclick = () => {
            if (!roomCode || window.isSinglePlayer || quizActiveBuzzerId) return;

            db.ref(`rooms/${roomCode}/quiz_state/activeBuzzerId`).transaction(current => {
                if (current === null) return myId;
                return undefined; // Già prenotato
            });
        };
    }

    // Abbandona
    if (els.quitQuizBtn) {
        els.quitQuizBtn.onclick = () => {
            if (confirm(currentLang === 'it' ? "Vuoi davvero abbandonare il quiz?" : "Do you really want to quit the quiz?")) {
                gameRunning = false;
                if (typeof window.exitRoomCleanly === 'function') {
                    window.exitRoomCleanly(false, true);
                } else {
                    goBackToMenu();
                }
            }
        };
    }
};
