// game4/games/chars/game.js
// Logica del gioco Chars (Caratteri Singoli)

const els = {
    wpmDisplay: document.getElementById('wpmDisplay'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    tableBody: document.getElementById('tableBody'),
    input: document.getElementById('permanentGameInput'),
    startBtn: document.getElementById('startGameBtn'),
    quitBtn: document.getElementById('quitGameBtn'),
    replayBtn: document.getElementById('replayWordBtn')
};

let currentChars = [];
let currentIndex = 0;
let score = 0;
let currentWpm = window.LOCAL_CONFIG.defaultWpm;
let gameActive = false;

function startNewGame() {
    if (gameActive) return;
    gameActive = true;
    score = 0;
    currentIndex = 0;

    const charsPool = window.LOCAL_CONFIG.charsToUse.split("");
    currentChars = [];
    for(let i=0; i<window.LOCAL_CONFIG.defaultWordCount; i++) {
        currentChars.push(charsPool[Math.floor(Math.random() * charsPool.length)]);
    }

    els.tableBody.innerHTML = "";
    els.scoreDisplay.textContent = "Punti: 0";
    els.startBtn.disabled = true;
    els.input.value = "";
    els.input.focus();

    playNextChar();
}

async function playNextChar() {
    if (currentIndex >= currentChars.length) {
        endGame();
        return;
    }

    const char = currentChars[currentIndex];
    await window.GameAudio.playMorseAudio(char, currentWpm);
}

function handleInput() {
    if (!gameActive) return;

    const typed = els.input.value.trim().toUpperCase();
    const target = currentChars[currentIndex];

    if (typed === target) {
        score += 10;
        els.scoreDisplay.textContent = `Punti: ${score}`;
        addTableRow(typed, target, "✅");
        els.input.value = "";
        currentIndex++;
        playNextChar();
    }
}

els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const typed = els.input.value.trim().toUpperCase();
        const target = currentChars[currentIndex];
        if (typed !== target) {
            addTableRow(typed, target, "❌");
            els.input.value = "";
            currentIndex++;
            playNextChar();
        }
    }
});

function addTableRow(typed, target, status) {
    const row = `<tr><td>${typed}</td><td>${target}</td><td>${status}</td></tr>`;
    els.tableBody.innerHTML += row;
    const wrapper = document.getElementById('tableWrapper');
    wrapper.scrollTop = wrapper.scrollHeight;
}

function endGame() {
    gameActive = false;
    alert(`Partita finita! Punti totali: ${score}`);
    els.startBtn.disabled = false;
}

els.startBtn.addEventListener('click', startNewGame);
els.input.addEventListener('input', handleInput);
els.replayBtn.addEventListener('click', () => {
    if (gameActive) playNextChar();
});
els.quitBtn.addEventListener('click', () => {
    window.parent.postMessage('closeModule', '*');
});
