// game4/games/quiz/game.js

const QUIZ_QUESTIONS = [
    { q: "SOS", a: ["Segnale di soccorso", "Saluti operativi", "Fine trasmissione", "Stazione radio"], correct: 0 },
    { q: "CQ", a: ["Chiamata a tutti", "Conferma ricezione", "Cambio frequenza", "Codice segreto"], correct: 0 },
    { q: "QTH", a: ["La mia posizione è...", "Qual è il tuo nome?", "Chiudi la trasmissione", "Segnale disturbato"], correct: 0 },
    { q: "QRS", a: ["Trasmetti più lentamente", "Aumenta velocità", "Frequenza occupata", "Ripeti messaggio"], correct: 0 },
    { q: "QRZ", a: ["Chi mi chiama?", "Come mi ricevi?", "Pronto a trasmettere", "Fine lavoro"], correct: 0 }
];

let gameRunning = false;
let currentQuestionIndex = 0;
let totalScore = 0;
let currentWpm = 20;
let currentTone = 600;
let currentQuestion = null;
let quizTimerInterval = null;

initFirebase();
const els = window.els;

function updateStats() {
    els.quizWpmDisplay.textContent = `WPM: ${currentWpm}`;
    els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
}

async function startQuiz() {
    gameRunning = true;
    currentQuestionIndex = 0;
    totalScore = 0;
    updateStats();
    loadNextQuestion();
}

function loadNextQuestion() {
    if (currentQuestionIndex >= QUIZ_QUESTIONS.length) return finishGame();

    currentQuestion = QUIZ_QUESTIONS[currentQuestionIndex];
    playAudioSequence();
}

async function playAudioSequence() {
    if (!gameRunning) return;

    els.quizQuestionBox.textContent = "Ascolta la domanda...";
    await playMorseAudio(currentQuestion.q, currentWpm, currentTone);

    await new Promise(r => setTimeout(r, 1000));

    for (let i = 0; i < 4; i++) {
        if (!gameRunning) return;
        const letter = ["A", "B", "C", "D"][i];
        els.quizQuestionBox.textContent = `Opzione ${letter}...`;
        await playMorseAudio(`${letter} ${currentQuestion.a[i]}`, currentWpm, currentTone);
        await new Promise(r => setTimeout(r, 500));
    }

    els.quizQuestionBox.textContent = "SCEGLI LA RISPOSTA!";
    startTimer(15);
}

function startTimer(seconds) {
    let timeLeft = 100;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
        timeLeft -= 100 / (seconds * 10);
        els.quizTimerProgress.style.width = timeLeft + '%';
        if (timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            handleAnswer(-1);
        }
    }, 100);
}

function handleAnswer(index) {
    clearInterval(quizTimerInterval);
    const isCorrect = (index === currentQuestion.correct);
    if (isCorrect) {
        totalScore += 100;
        els.quizQuestionBox.innerHTML = "<span style='color:#4caf50'>CORRETTO!</span>";
    } else {
        els.quizQuestionBox.innerHTML = "<span style='color:#f44336'>SBAGLIATO!</span>";
    }

    updateStats();
    currentQuestionIndex++;
    setTimeout(loadNextQuestion, 2000);
}

function finishGame() {
    gameRunning = false;
    els.quizQuestionBox.textContent = "QUIZ COMPLETATO!";
    els.quitQuizBtn.textContent = "Torna al Menu";
    els.quitQuizBtn.onclick = () => {
        window.parent.postMessage('closeModule', '*');
    };
}

// Button Listeners
['A', 'B', 'C', 'D'].forEach((l, i) => {
    document.getElementById('btnQuiz' + l).onclick = () => handleAnswer(i);
});

els.quitQuizBtn.onclick = () => {
    window.parent.postMessage('closeModule', '*');
};

startQuiz();
