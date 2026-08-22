// game4/games/custom/game.js
const els = {
    setupArea: document.getElementById('setupArea'),
    gameArea: document.getElementById('gameAreaBody'),
    customText: document.getElementById('customText'),
    wpmInput: document.getElementById('wpmInput'),
    startBtn: document.getElementById('startGameBtn'),
    quitBtn: document.getElementById('quitGameBtn'),
    tableBody: document.getElementById('tableBody'),
    input: document.getElementById('permanentGameInput'),
    replayBtn: document.getElementById('replayWordBtn'),
    exitBtn: document.getElementById('exitBtn')
};

let currentWords = [];
let currentIndex = 0;
let score = 0;
let currentWpm = 20;
let gameActive = false;

function startNewGame() {
    const text = els.customText.value.trim().toUpperCase();
    if (!text) { alert("Inserisci del testo!"); return; }

    currentWords = text.split(/\s+/);
    currentWpm = parseInt(els.wpmInput.value) || 20;

    els.setupArea.style.display = 'none';
    els.gameArea.style.display = 'flex';

    gameActive = true;
    score = 0;
    currentIndex = 0;
    els.tableBody.innerHTML = "";
    els.input.value = "";
    els.input.focus();

    playNextWord();
}

async function playNextWord() {
    if (currentIndex >= currentWords.length) {
        endGame();
        return;
    }
    await window.GameAudio.playMorseAudio(currentWords[currentIndex], currentWpm);
}

function handleInput() {
    if (!gameActive) return;
    const typed = els.input.value.trim().toUpperCase();
    const target = currentWords[currentIndex];
    if (typed === target) {
        score += 10;
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
    els.tableBody.innerHTML += `<tr><td>${typed}</td><td>${target}</td><td>${status}</td></tr>`;
    document.getElementById('tableWrapper').scrollTop = document.getElementById('tableWrapper').scrollHeight;
}

function endGame() {
    gameActive = false;
    alert(`Esercitazione finita!`);
    els.setupArea.style.display = 'flex';
    els.gameArea.style.display = 'none';
}

els.startBtn.addEventListener('click', startNewGame);
els.input.addEventListener('input', handleInput);
els.replayBtn.addEventListener('click', () => { if (gameActive) playNextWord(); });
els.exitBtn.addEventListener('click', () => { window.parent.postMessage('closeModule', '*'); });
els.quitBtn.addEventListener('click', () => { endGame(); });
