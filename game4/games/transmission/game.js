// game4/games/transmission/game.js
const els = {
    targetDisplay: document.getElementById('targetDisplay'),
    inputArea: document.getElementById('morseKeyBtn'),
    startBtn: document.getElementById('startGameBtn'),
    quitBtn: document.getElementById('quitGameBtn'),
};

let currentTargets = [];
let targetIndex = 0;
let charIndex = 0;
let gameActive = false;
let isDown = false;

function startNewGame() {
    if (gameActive) return;
    gameActive = true;
    targetIndex = 0;
    charIndex = 0;
    currentTargets = [...window.LOCAL_CONFIG.targets].sort(() => Math.random() - 0.5);
    els.startBtn.disabled = true;
    updateDisplay();
}

function updateDisplay() {
    if (targetIndex >= currentTargets.length) {
        endGame();
        return;
    }
    const currentTarget = currentTargets[targetIndex];
    let html = "";
    for(let i=0; i<currentTarget.length; i++) {
        if (i === charIndex) html += `<span style="color:var(--link-color); border-bottom:2px solid;">${currentTarget[i]}</span>`;
        else html += `<span>${currentTarget[i]}</span>`;
    }
    els.targetDisplay.innerHTML = html;
}

function handleKeyDown(e) {
    if (!gameActive) return;
    if (e.cancelable) e.preventDefault();
    if (isDown) return;
    isDown = true;
    window.GameAudio.startTone(window.LOCAL_CONFIG.defaultTone);
    els.inputArea.style.transform = "scale(0.95)";
    els.inputArea.style.backgroundColor = "var(--link-color)";
}

function handleKeyUp(e) {
    if (!isDown) return;
    isDown = false;
    window.GameAudio.stopTone();
    els.inputArea.style.transform = "scale(1)";
    els.inputArea.style.backgroundColor = "var(--btn-color)";

    charIndex++;
    if (charIndex >= currentTargets[targetIndex].length) {
        charIndex = 0;
        targetIndex++;
    }
    updateDisplay();
}

els.inputArea.addEventListener('mousedown', handleKeyDown);
els.inputArea.addEventListener('touchstart', handleKeyDown);
window.addEventListener('mouseup', handleKeyUp);
window.addEventListener('touchend', handleKeyUp);

function endGame() {
    gameActive = false;
    alert("Esercitazione completata!");
    els.startBtn.disabled = false;
}

els.startBtn.addEventListener('click', startNewGame);
els.quitBtn.addEventListener('click', () => { window.parent.postMessage('closeModule', '*'); });
