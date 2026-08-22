// game4/games/perfection/game.js
const els = {
    wpmDisplay: document.getElementById('wpmDisplay'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    tableBody: document.getElementById('tableBody'),
    input: document.getElementById('permanentGameInput'),
    startBtn: document.getElementById('startGameBtn'),
    quitBtn: document.getElementById('quitGameBtn'),
    replayBtn: document.getElementById('replayWordBtn')
};
let currentWords = []; let currentIndex = 0; let score = 0; let currentWpm = window.LOCAL_CONFIG.defaultWpm; let gameActive = false;
const POOL = ["RADIO", "MORSE", "SIGNAL", "ANTENNA", "KEYER", "WATT", "HERTZ", "CQ", "DX", "TELEGRAPH", "CW", "HF", "VHF", "UHF", "IONOSPHERE", "DIPOLE", "YAGI"];
function startNewGame() {
    if (gameActive) return; gameActive = true; score = 0; currentIndex = 0;
    currentWords = Array.from({length: window.LOCAL_CONFIG.defaultWordCount}, () => POOL[Math.floor(Math.random()*POOL.length)]);
    els.tableBody.innerHTML = ""; els.scoreDisplay.textContent = "Punti: 0"; els.startBtn.disabled = true; els.input.value = ""; els.input.focus();
    playNextWord();
}
async function playNextWord() {
    if (currentIndex >= currentWords.length) { endGame(true); return; }
    await window.GameAudio.playMorseAudio(currentWords[currentIndex], currentWpm);
}
function handleInput() {
    if (!gameActive) return;
    const typed = els.input.value.trim().toUpperCase();
    const target = currentWords[currentIndex];
    if (typed === target) {
        score += 100; els.scoreDisplay.textContent = `Punti: ${score}`;
        addTableRow(typed, target, "✅"); els.input.value = ""; currentIndex++; playNextWord();
    }
}
els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const typed = els.input.value.trim().toUpperCase();
        const target = currentWords[currentIndex];
        if (typed !== target) {
            addTableRow(typed, target, "💀");
            endGame(false);
        }
    }
});
function addTableRow(typed, target, status) {
    els.tableBody.innerHTML += `<tr><td>${typed}</td><td>${target}</td><td>${status}</td></tr>`;
    document.getElementById('tableWrapper').scrollTop = document.getElementById('tableWrapper').scrollHeight;
}
function endGame(won) {
    gameActive = false;
    alert(won ? `Incredibile! Hai completato la sfida! Punti: ${score}` : `ERRORE! Sfida fallita. Punti: ${score}`);
    els.startBtn.disabled = false;
}
els.startBtn.addEventListener('click', startNewGame);
els.input.addEventListener('input', handleInput);
els.replayBtn.addEventListener('click', () => { if (gameActive) playNextWord(); });
els.quitBtn.addEventListener('click', () => { window.parent.postMessage('closeModule', '*'); });
