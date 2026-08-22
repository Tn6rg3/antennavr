// game4/course/course.js
// Logica del Corso CW (Metodo Koch)

const KOCH_SEQUENCE = "KMRSUAPTLOWI.NJEF0YV,,G5/Q9ZH38B?427C1D6X".split("");

const els = {
    progress: document.getElementById('kochProgress'),
    currentLesson: document.getElementById('currentLessonText'),
    lessonChars: document.getElementById('lessonChars'),
    briefingBox: document.getElementById('briefingBox'),
    briefingText: document.getElementById('briefingText'),
    trainingArea: document.getElementById('trainingArea'),
    dashboard: document.getElementById('courseDashboard'),
    tableBody: document.getElementById('courseTableBody'),
    input: document.getElementById('courseInput'),
    startBtn: document.getElementById('startSessionBtn'),
    quitBtn: document.getElementById('quitCourseBtn'),
    accuracyDisplay: document.getElementById('courseAccuracyDisplay')
};

let unlockedLevel = 2; // Iniziamo con i primi 2 caratteri: K, M
let sessionActive = false;
let sessionWords = [];
let currentIndex = 0;
let correctCount = 0;

function init() {
    renderProgress();
    updateLessonInfo();
}

function renderProgress() {
    els.progress.innerHTML = "";
    KOCH_SEQUENCE.forEach((char, index) => {
        const div = document.createElement('div');
        div.className = 'koch-char' + (index < unlockedLevel ? ' unlocked' : '');
        div.textContent = char;
        els.progress.appendChild(div);
    });
}

function updateLessonInfo() {
    const chars = KOCH_SEQUENCE.slice(0, unlockedLevel).join(", ");
    els.currentLesson.textContent = `Lezione ${unlockedLevel}`;
    els.lessonChars.textContent = `Caratteri: ${chars}`;
}

function startSession() {
    sessionActive = true;
    currentIndex = 0;
    correctCount = 0;
    sessionWords = generateSessionWords(10);

    els.dashboard.style.display = 'none';
    els.trainingArea.style.display = 'flex';
    els.briefingBox.style.display = 'block';
    els.briefingText.textContent = "Focus sui caratteri: " + KOCH_SEQUENCE.slice(0, unlockedLevel).join(", ");
    els.tableBody.innerHTML = "";

    els.input.value = "";
    els.input.focus();
    playNext();
}

function generateSessionWords(count) {
    const pool = KOCH_SEQUENCE.slice(0, unlockedLevel);
    const words = [];
    for (let i = 0; i < count; i++) {
        let word = "";
        const len = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < len; j++) {
            word += pool[Math.floor(Math.random() * pool.length)];
        }
        words.push(word);
    }
    return words;
}

async function playNext() {
    if (currentIndex >= sessionWords.length) {
        endSession();
        return;
    }
    await window.CourseAudio.playMorseAudio(sessionWords[currentIndex], 20);
}

els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && sessionActive) {
        const typed = els.input.value.trim().toUpperCase();
        const target = sessionWords[currentIndex];

        const row = document.createElement('tr');
        const tdTyped = document.createElement('td');
        const tdTarget = document.createElement('td');

        tdTyped.textContent = typed;
        tdTarget.textContent = target;

        if (typed === target) {
            tdTyped.style.color = 'green';
            correctCount++;
        } else {
            tdTyped.style.color = 'red';
        }

        row.appendChild(tdTyped);
        row.appendChild(tdTarget);
        els.tableBody.appendChild(row);

        const acc = Math.round((correctCount / (currentIndex + 1)) * 100);
        els.accuracyDisplay.textContent = `Acc: ${acc}%`;

        els.input.value = "";
        currentIndex++;
        playNext();
    }
});

function endSession() {
    sessionActive = false;
    const acc = (correctCount / sessionWords.length);
    alert(`Sessione finita! Precisione: ${Math.round(acc * 100)}%`);

    if (acc >= 0.9 && unlockedLevel < KOCH_SEQUENCE.length) {
        unlockedLevel++;
        alert("Ottimo lavoro! Hai sbloccato un nuovo carattere.");
    }

    els.dashboard.style.display = 'flex';
    els.trainingArea.style.display = 'none';
    els.briefingBox.style.display = 'none';
    init();
}

els.startBtn.addEventListener('click', startSession);
els.quitBtn.addEventListener('click', () => {
    window.parent.postMessage('closeModule', '*');
});

init();
