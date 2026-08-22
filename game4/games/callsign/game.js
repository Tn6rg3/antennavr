// game4/games/callsign/game.js
// Logica del gioco Callsign (Nominativi Radio)

const els = {
    wpmDisplay: document.getElementById('wpmDisplay'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    tableBody: document.getElementById('tableBody'),
    input: document.getElementById('permanentGameInput'),
    startBtn: document.getElementById('startGameBtn'),
    quitBtn: document.getElementById('quitGameBtn'),
    replayBtn: document.getElementById('replayWordBtn')
};

let currentWords = [];
let currentIndex = 0;
let score = 0;
let currentWpm = window.LOCAL_CONFIG.defaultWpm;
let gameActive = false;

function generateCallsign() {
    const prefixes = ["I", "K", "W", "G", "DL", "F", "EA", "JA", "VK", "PY"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const digit = Math.floor(Math.random() * 10);
    const suffixLen = Math.floor(Math.random() * 3) + 1;
    let suffix = "";
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(let i=0; i<suffixLen; i++) suffix += letters[Math.floor(Math.random() * letters.length)];
    return prefix + digit + suffix;
}

function startNewGame() {
    if (gameActive) return;
    gameActive = true;
    score = 0;
    currentIndex = 0;
    currentWords = [];
    for(let i=0; i<window.LOCAL_CONFIG.defaultWordCount; i++) {
        currentWords.push(generateCallsign());
    }

    els.tableBody.innerHTML = "";
    els.scoreDisplay.textContent = "Punti: 0";
    els.startBtn.disabled = true;
    els.input.value = "";
    els.input.focus();

    playNextWord();
}

async function playNextWord() {
    if (currentIndex >= currentWords.length) {
        endGame();
        return;
    }
    const word = currentWords[currentIndex];
    await window.GameAudio.playMorseAudio(word, currentWpm);
}

function handleInput() {
    if (!gameActive) return;
    const typed = els.input.value.trim().toUpperCase();
    const target = currentWords[currentIndex];
    if (typed === target) {
        score += 100;
        els.scoreDisplay.textContent = `Punti: ${score}`;
        addTableRow(typed, target, "✅");
        els.input.value = "";
        currentIndex++;
        playNextWord();
    }
}

els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const typed = els.input.value.trim().toUpperCase();
        const target = currentWords[currentIndex];
        if (typed !== target) {
            addTableRow(typed, target, "❌");
            els.input.value = "";
            currentIndex++;
            playNextWord();
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
els.replayBtn.addEventListener('click', () => { if (gameActive) playNextWord(); });
els.quitBtn.addEventListener('click', () => { window.parent.postMessage('closeModule', '*'); });
