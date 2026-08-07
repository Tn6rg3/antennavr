// ============================================================================
// QUIZ.JS - QUIZ MORSE CON SHUFFLE RISPOSTE E FISHER-YATES
// ============================================================================

import { appState, gameState, listeners, fisherYatesShuffle } from './state.js';
import { els, showScreen, showToast } from './ui.js';
import { playMorseAudio, stopAllMorseAudio } from './audio.js';

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

export function getAvailableQuizQuestions() {
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

export function startQuizSequence() {
    showScreen('quizArea'); 
    gameState.running = true; 
    gameState.lastLoadedQuizIndex = -1;
    if (els.quizWpmDisplay) els.quizWpmDisplay.textContent = `WPM: ${gameState.wpm}`; 
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${gameState.totalScore}`;
    
    const availableQuestions = getAvailableQuizQuestions();

    if (gameState.roomCode && !gameState.isSinglePlayer) {
        if (listeners.quizState) appState.db.ref(`rooms/${gameState.roomCode}/quiz_state`).off('value', listeners.quizState);
        listeners.quizState = appState.db.ref(`rooms/${gameState.roomCode}/quiz_state`).on('value', snap => {
            const state = snap.val(); 
            if (!state || !gameState.running) return;
            const newIndex = state.questionIndex || 0;
            if (state.questionsOrder && Array.isArray(state.questionsOrder)) {
                gameState.randomizedQuizQuestions = state.questionsOrder.map(idx => availableQuestions[idx % availableQuestions.length]);
            } else {
                gameState.randomizedQuizQuestions = availableQuestions;
            }
            if (newIndex !== gameState.lastLoadedQuizIndex) { 
                gameState.lastLoadedQuizIndex = newIndex; 
                gameState.quizQuestionIndex = newIndex; 
                loadNextQuizQuestion(); 
            }
            gameState.quizActiveBuzzerId = state.activeBuzzerId || null; 
            renderQuizUI(state);
        });

        if (appState.myId === gameState.roomHostId) {
            const order = fisherYatesShuffle(Array.from({length: availableQuestions.length}, (_, i) => i));
            appState.db.ref(`rooms/${gameState.roomCode}/quiz_state`).set({ 
                questionIndex: 0, 
                activeBuzzerId: null, 
                status: 'playing', 
                questionsOrder: order
            });
        }
    } else { 
        gameState.randomizedQuizQuestions = fisherYatesShuffle(availableQuestions); 
        gameState.quizQuestionIndex = 0; 
        loadNextQuizQuestion(); 
    }
}

export function loadNextQuizQuestion() {
    const maxQuestions = Math.min(gameState.wordCount, gameState.randomizedQuizQuestions.length);
    if (gameState.quizQuestionIndex >= maxQuestions || gameState.quizQuestionIndex >= gameState.randomizedQuizQuestions.length) {
        return window.finishGame && window.finishGame();
    }
    const rawQ = gameState.randomizedQuizQuestions[gameState.quizQuestionIndex];
    if (!rawQ || !rawQ.q) {
        setTimeout(() => { if (gameState.running) loadNextQuizQuestion(); }, 400);
        return;
    }
    gameState.currentQuizQuestion = prepareShuffledQuestion(rawQ);
    setTimeout(() => { if (gameState.running) playQuizAudioSequence(); }, 300);
}

async function playQuizAudioSequence() {
    if (!gameState.running || !gameState.currentQuizQuestion) return;
    stopAllMorseAudio();
    gameState.inputActive = false; 
    disableQuizButtons(true);
    ['A', 'B', 'C', 'D'].forEach(l => { if (els['btnQuiz'+l]) els['btnQuiz'+l].classList.remove('active-choice'); });
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "Ascolta la domanda...";
    await playMorseAudio(gameState.currentQuizQuestion.q, gameState.wpm);
    if (!gameState.running) return; 
    await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < 4; i++) {
        const letter = ["A", "B", "C", "D"][i];
        if (!gameState.running) return; 
        if (els.quizQuestionBox) els.quizQuestionBox.textContent = `Opzione ${letter}...`;
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.add('active-choice');
        await playMorseAudio(`${letter} ${gameState.currentQuizQuestion.a[i]}`, gameState.wpm);
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.remove('active-choice');
        if (!gameState.running) return; 
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!gameState.running) return;
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "SCEGLI LA TUA RISPOSTA!"; 
    enableQuizControls(); 
    startQuizTimer(20);
}

function enableQuizControls() {
    gameState.inputActive = true;
    if (gameState.isSinglePlayer) disableQuizButtons(false);
    else { 
        if (els.quizBuzzer) els.quizBuzzer.style.display = 'block'; 
        if (els.quizOptionsContainer) els.quizOptionsContainer.style.opacity = '0.5'; 
        disableQuizButtons(true); 
    }
}

function disableQuizButtons(disabled) { 
    ['A', 'B', 'C', 'D'].forEach(l => { if (els['btnQuiz'+l]) els['btnQuiz'+l].disabled = disabled; }); 
}

function startQuizTimer(seconds) {
    if (gameState.intervals.quiz) clearInterval(gameState.intervals.quiz); 
    let timeLeft = 100;
    gameState.intervals.quiz = setInterval(() => {
        timeLeft -= 100 / (seconds * 10); 
        if (els.quizTimerProgress) els.quizTimerProgress.style.width = Math.max(0, timeLeft) + '%';
        if (timeLeft <= 0) { 
            clearInterval(gameState.intervals.quiz); 
            if (gameState.inputActive) { 
                showToast("Tempo scaduto!"); 
                if (gameState.isSinglePlayer || gameState.quizActiveBuzzerId === appState.myId) submitQuizAnswer(-1); 
            } 
        }
    }, 100);
}

export function submitQuizAnswer(index) {
    if (!gameState.isSinglePlayer && (!gameState.inputActive || gameState.quizActiveBuzzerId !== appState.myId)) return;
    if (gameState.isSinglePlayer && !gameState.inputActive) return;
    if (gameState.intervals.quiz) clearInterval(gameState.intervals.quiz); 
    gameState.inputActive = false; 
    disableQuizButtons(true);
    
    if (index === gameState.currentQuizQuestion.correct) { 
        gameState.totalScore += 100; 
        showToast(`CORRETTO (${["A", "B", "C", "D"][index]})! +100`); 
    } else {
        showToast(`SBAGLIATO! Era la ${["A", "B", "C", "D"][gameState.currentQuizQuestion.correct]}`);
    }
    
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${gameState.totalScore}`;
    if (gameState.roomCode) appState.db.ref(`rooms/${gameState.roomCode}/players/${appState.myId}`).update({ score: gameState.totalScore, wordIndex: gameState.quizQuestionIndex + 1 });
    
    setTimeout(() => {
        if (!gameState.running) return;
        if (gameState.roomCode && !gameState.isSinglePlayer) {
            appState.db.ref(`rooms/${gameState.roomCode}/quiz_state`).transaction(state => { 
                if (state && state.activeBuzzerId === appState.myId) { 
                    state.questionIndex = (state.questionIndex || 0) + 1; 
                    state.activeBuzzerId = null; 
                } 
                return state; 
            });
        } else if (gameState.isSinglePlayer) { 
            gameState.quizQuestionIndex++; 
            loadNextQuizQuestion(); 
        }
    }, 3000);
}

export function renderQuizUI(state) {
    if (!els.quizBuzzer || !els.buzzerWinner || !els.quizOptionsContainer) return;
    if (state.activeBuzzerId) {
        els.quizBuzzer.style.display = 'none';
        if (state.activeBuzzerId === appState.myId) { 
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
        els.quizBuzzer.style.display = gameState.inputActive ? 'block' : 'none'; 
        els.quizOptionsContainer.style.opacity = '0.5'; 
        disableQuizButtons(true);
    }
}

export function initQuizListeners() {
    if (els.quizBuzzer) {
        els.quizBuzzer.addEventListener('click', () => { 
            if (gameState.roomCode && !gameState.isSinglePlayer && !gameState.quizActiveBuzzerId && gameState.inputActive) {
                appState.db.ref(`rooms/${gameState.roomCode}/quiz_state`).transaction(state => { 
                    if (state && !state.activeBuzzerId) state.activeBuzzerId = appState.myId; 
                    return state; 
                });
            } 
        });
    }
    for (let i = 0; i < 4; i++) {
        const l = ["A", "B", "C", "D"][i];
        if (els['btnQuiz'+l]) els['btnQuiz'+l].onclick = () => submitQuizAnswer(i);
        if (els['replay'+l]) els['replay'+l].onclick = () => { if (gameState.currentQuizQuestion) playMorseAudio(gameState.currentQuizQuestion.a[i], gameState.wpm); };
    }
    if (els.quizReplayQ) {
        els.quizReplayQ.onclick = () => { 
            if (gameState.currentQuizQuestion) playMorseAudio(gameState.currentQuizQuestion.q, gameState.wpm); 
        };
    }
}
