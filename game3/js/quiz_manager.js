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
    if (isSinglePlayer) {
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
                if (isSinglePlayer || quizActiveBuzzerId === myId) window.submitQuizAnswer(-1);
            }
        }
    }, 100);
};

window.submitQuizAnswer = function(index) {
    if (!isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) return;
    if (isSinglePlayer && !inputActive) return;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    inputActive = false;
    window.disableQuizButtons(true);

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
        els.buzzerWinner.textContent = "";
        els.quizBuzzer.style.display = inputActive ? 'block' : 'none';
        els.quizOptionsContainer.style.opacity = '0.5';
        window.disableQuizButtons(true);
    }
};
