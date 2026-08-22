// game4/games/arcade/game.js

let gameRunning = false;
let arcadeLives = 3;
let arcadeScore = 0;
let arcadeLevel = 1;
let arcadeWpm = 15;
let arcadeWordLen = 3;
let arcadeWordsSolved = 0;
let arcadeWordsAtCurrentLen = 0;
let arcadeActiveBrick = null;
let arcadeLoopId = null;
let lastFrameTime = 0;
window.arcadePaused = false;
const ARCADE_BASE_FALL_SPEED = 0.5;

const els = {
    arcadeWpmDisplay: document.getElementById('arcadeWpmDisplay'),
    arcadeLivesDisplay: document.getElementById('arcadeLivesDisplay'),
    arcadeScoreDisplay: document.getElementById('arcadeScoreDisplay'),
    arcadeLevelDisplay: document.getElementById('arcadeLevelDisplay'),
    arcadeBrickContainer: document.getElementById('arcadeBrickContainer'),
    arcadeInput: document.getElementById('arcadeInput'),
    quitArcadeBtn: document.getElementById('quitArcadeBtn'),
    arcadeLevelOverlay: document.getElementById('arcadeLevelOverlay'),
    arcadeLevelNumber: document.getElementById('arcadeLevelNumber'),
    arcadeLevelTitle: document.getElementById('arcadeLevelTitle'),
    arcadeLevelNextText: document.getElementById('arcadeLevelNextText')
};

function updateStats() {
    if (els.arcadeWpmDisplay) els.arcadeWpmDisplay.textContent = `WPM: ${arcadeWpm}`;
    if (els.arcadeScoreDisplay) els.arcadeScoreDisplay.textContent = `Punti: ${arcadeScore}`;
    if (els.arcadeLevelDisplay) els.arcadeLevelDisplay.textContent = `LIVELLO ${arcadeLevel}`;
    if (els.arcadeLivesDisplay) {
        els.arcadeLivesDisplay.textContent = "❤️".repeat(arcadeLives);
        if (arcadeLives === 1) els.arcadeLivesDisplay.classList.add('pulse-red');
        else els.arcadeLivesDisplay.classList.remove('pulse-red');
    }
}

async function startArcade() {
    if (window.loadDictionaries) await window.loadDictionaries();
    gameRunning = true;
    arcadeLives = 3;
    arcadeScore = 0;
    arcadeLevel = 1;
    arcadeWpm = 15;
    arcadeWordLen = 3;
    arcadeWordsSolved = 0;
    arcadeWordsAtCurrentLen = 0;
    updateStats();

    lastFrameTime = performance.now();
    arcadeLoopId = requestAnimationFrame(gameLoop);
    setTimeout(spawnBrick, 1000);
}

function spawnBrick() {
    if (!gameRunning || window.arcadePaused) return;

    let baseDict = (window.arcadeDictionary && window.arcadeDictionary.length > 0)
                   ? window.arcadeDictionary
                   : window.masterDictionary;

    let dict = baseDict.filter(w => w.length === arcadeWordLen);
    if (dict.length === 0) dict = baseDict.filter(w => w.length >= 3);

    const word = (dict.length > 0 ? dict[Math.floor(Math.random() * dict.length)] : "SOS").toUpperCase();

    const brick = document.createElement('div');
    brick.className = 'arcade-brick';
    brick.style.position = 'absolute';
    brick.style.minWidth = '60px';
    brick.style.height = '30px';
    brick.style.background = 'rgba(0, 255, 0, 0.2)';
    brick.style.border = '2px solid #0f0';
    brick.style.color = '#0f0';
    brick.style.textAlign = 'center';
    brick.style.lineHeight = '30px';
    brick.style.fontWeight = 'bold';
    brick.textContent = "•".repeat(word.length);

    const container = els.arcadeBrickContainer;
    const startX = Math.random() * (container.clientWidth - 80);
    brick.style.left = startX + 'px';
    brick.style.top = '0px';
    container.appendChild(brick);

    arcadeActiveBrick = { el: brick, word: word, y: 0, startTime: Date.now() };
    if (window.playMorseAudio) window.playMorseAudio(word, arcadeWpm);
}

function gameLoop(timestamp) {
    if (!gameRunning) return;

    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (arcadeActiveBrick && !window.arcadePaused) {
        const lengthFactor = Math.max(0.4, 1 - ((arcadeWordLen - 3) * 0.05));
        const speed = (ARCADE_BASE_FALL_SPEED + (arcadeWpm - 15) * 0.02) * lengthFactor;

        arcadeActiveBrick.y += speed * (deltaTime / 16.67);
        arcadeActiveBrick.el.style.top = arcadeActiveBrick.y + 'px';

        if (arcadeActiveBrick.y > els.arcadeBrickContainer.clientHeight - 40) {
            handleMiss();
        }
    }
    arcadeLoopId = requestAnimationFrame(gameLoop);
}

function handleMiss() {
    arcadeLives--;
    updateStats();
    if (arcadeActiveBrick && arcadeActiveBrick.el) arcadeActiveBrick.el.remove();
    arcadeActiveBrick = null;

    if (arcadeLives <= 0) {
        finishGame();
    } else {
        setTimeout(spawnBrick, 1000);
    }
}

function handleInput() {
    if (!arcadeActiveBrick || !gameRunning || window.arcadePaused) return;

    const typed = els.arcadeInput.value.trim().toUpperCase();
    const target = arcadeActiveBrick.word;

    // Rivelazione parziale
    let displayStr = "";
    for (let i = 0; i < target.length; i++) {
        if (typed[i] === target[i]) displayStr += target[i];
        else displayStr += "•";
    }
    arcadeActiveBrick.el.textContent = displayStr;

    if (typed === target) {
        const reactionTime = Date.now() - arcadeActiveBrick.startTime;
        const timeBonus = Math.max(1, 10000 / reactionTime);
        const points = Math.round((arcadeWpm * target.length * arcadeLevel) * timeBonus);

        arcadeScore += points;
        arcadeWordsSolved++;
        arcadeWordsAtCurrentLen++;

        const el = arcadeActiveBrick.el;
        el.textContent = target;
        el.classList.add('exploded');

        arcadeActiveBrick = null;
        els.arcadeInput.value = '';

        setTimeout(() => { if (el) el.remove(); }, 500);

        const hasTransition = updateProgression();
        updateStats();

        if (!hasTransition) {
            setTimeout(spawnBrick, 700);
        }
    }
}

function updateProgression() {
    arcadeWpm++;

    const wordsPerLen = { 3: 2, 4: 3, 5: 5 };
    const needed = wordsPerLen[arcadeWordLen] || 5;

    if (arcadeWordsAtCurrentLen >= needed) {
        arcadeWordLen = Math.min(15, arcadeWordLen + 1);
        arcadeWordsAtCurrentLen = 0;

        const levelThresholds = [6, 9, 12, 15];
        const isMajorLevel = levelThresholds.includes(arcadeWordLen);

        if (isMajorLevel) arcadeLevel++;
        showLevelUp(isMajorLevel);

        if (isMajorLevel) {
            arcadeLives = Math.min(5, arcadeLives + 1);
            if (window.showToast) window.showToast("❤️ VITA EXTRA!");
        }
        return true;
    }
    return false;
}

function showLevelUp(isMajor) {
    window.arcadePaused = true;
    if (window.stopAllMorseAudio) window.stopAllMorseAudio();

    if (els.arcadeLevelOverlay) {
        els.arcadeLevelOverlay.style.display = 'flex';
        if (els.arcadeLevelNumber) {
            els.arcadeLevelNumber.textContent = isMajor ? arcadeLevel : arcadeWordLen;
        }
        if (els.arcadeLevelTitle) {
            els.arcadeLevelTitle.textContent = isMajor ? `LIVELLO ${arcadeLevel}` : "PAROLE PIÙ LUNGHE";
        }
    }

    setTimeout(() => {
        if (els.arcadeLevelOverlay) els.arcadeLevelOverlay.style.display = 'none';
        window.arcadePaused = false;
        els.arcadeInput.focus();
        spawnBrick();
    }, 2000);
}

function finishGame() {
    gameRunning = false;
    cancelAnimationFrame(arcadeLoopId);
    if (window.showToast) window.showToast("💀 GAME OVER! PT: " + arcadeScore);
    els.quitArcadeBtn.textContent = (window.currentLang === 'en') ? "Back to Menu" : "Torna al Menu";
    els.quitArcadeBtn.onclick = () => {
        window.parent.postMessage('closeModule', '*');
    };

    if (window.addXP) {
        window.addXP(Math.floor(arcadeScore / 100), "Arcade session");
    }
}

els.arcadeInput.oninput = handleInput;
els.quitArcadeBtn.onclick = () => {
    if (confirm("Abbandonare?")) window.parent.postMessage('closeModule', '*');
};

startArcade();
