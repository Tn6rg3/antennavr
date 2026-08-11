// js/arcade_manager.js

let arcadeLoopId = null;
let lastFrameTime = 0;
const ARCADE_BASE_FALL_SPEED = 0.5; // pixel per frame a 60fps (base)

window.startArcadeSequence = function() {
    console.log("Arcade: Starting Mission...");
    isArcadeMode = true;
    gameRunning = true;
    arcadeLives = 3;
    arcadeScore = 0;
    arcadeLevel = 1;
    arcadeWordsSolved = 0;
    arcadeWordLen = 3;
    arcadeWpm = 20; // Velocità fissa iniziale per tutti
    peakWpm = arcadeWpm;

    showScreen('arcadeArea');
    window.updateArcadeStatsUI();

    if (els.arcadeBrickContainer) els.arcadeBrickContainer.innerHTML = '';
    if (els.arcadeInput) {
        els.arcadeInput.value = '';
        els.arcadeInput.disabled = false;
        setTimeout(() => els.arcadeInput.focus(), 500);
    }

    arcadeActiveBrick = null;
    lastFrameTime = performance.now();
    arcadeLoopId = requestAnimationFrame(window.arcadeGameLoop);

    window.spawnArcadeBrick();
};

window.spawnArcadeBrick = function() {
    if (!gameRunning || !isArcadeMode) return;

    // Genera parola della lunghezza corrente
    const dict = window.masterDictionary.filter(w => w.length === arcadeWordLen);
    const word = (dict.length > 0 ? dict[Math.floor(Math.random() * dict.length)] : "SOS").toUpperCase();

    const container = els.arcadeBrickContainer;
    if (!container) return;

    const brick = document.createElement('div');
    brick.className = 'arcade-brick';
    brick.id = 'active_brick';
    // Mostriamo puntini invece della parola
    brick.textContent = "•".repeat(word.length);

    // Posizione orizzontale casuale
    const containerWidth = container.clientWidth;
    const brickWidth = 100;
    const startX = Math.floor(Math.random() * (containerWidth - brickWidth));

    brick.style.left = startX + 'px';
    brick.style.top = '-50px';
    container.appendChild(brick);

    arcadeActiveBrick = {
        el: brick,
        word: word,
        y: -50,
        startTime: Date.now()
    };

    // Riproduce audio Morse
    stopAllMorseAudio();
    playMorseAudio(word, arcadeWpm, true);
};

window.arcadeGameLoop = function(timestamp) {
    if (!gameRunning || !isArcadeMode) return;

    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (arcadeActiveBrick && !window.arcadePaused) {
        // Velocità di caduta aumenta con WPM, ma rallenta se la parola è lunga
        // Tempo extra per parole lunghe: moltiplicatore inverso alla lunghezza
        const lengthFactor = Math.max(0.4, 1 - ((arcadeWordLen - 3) * 0.05));
        const speed = (ARCADE_BASE_FALL_SPEED + (arcadeWpm - 15) * 0.02) * lengthFactor;

        arcadeActiveBrick.y += speed * (deltaTime / 16.67); // Normalizzato a 60fps
        arcadeActiveBrick.el.style.top = arcadeActiveBrick.y + 'px';

        // Collisione con il fondo
        const containerHeight = els.arcadeBrickContainer.clientHeight;
        if (arcadeActiveBrick.y > containerHeight - 50) {
            window.handleArcadeMiss();
        }
    }

    arcadeLoopId = requestAnimationFrame(window.arcadeGameLoop);
};

window.handleArcadeMiss = function() {
    if (!arcadeActiveBrick) return;

    arcadeLives--;
    window.updateArcadeStatsUI();

    // Effetto scuotimento
    els.arcadeArea.classList.add('shake');
    setTimeout(() => els.arcadeArea.classList.remove('shake'), 400);

    // Rimuovi mattoncino
    if (arcadeActiveBrick.el) arcadeActiveBrick.el.remove();
    arcadeActiveBrick = null;

    if (arcadeLives <= 0) {
        window.finishArcadeGame();
    } else {
        // Breve pausa prima del prossimo
        setTimeout(window.spawnArcadeBrick, 1000);
    }
};

window.handleArcadeInput = function() {
    if (!arcadeActiveBrick || !gameRunning) return;

    const typed = els.arcadeInput.value.trim().toUpperCase();
    const target = arcadeActiveBrick.word;

    if (typed === target) {
        // CORRETTO!
        const reactionTime = Date.now() - arcadeActiveBrick.startTime;

        // Calcolo punteggio Arcade: (WPM * Lunghezza) * (Bonus tempo)
        const timeBonus = Math.max(1, 20000 / reactionTime);
        const points = Math.round((arcadeWpm * target.length) * timeBonus);

        arcadeScore += points;
        arcadeWordsSolved++;

        // Effetto esplosione
        const el = arcadeActiveBrick.el;
        el.textContent = target; // Rivela la parola
        el.classList.add('exploded');

        const oldBrick = arcadeActiveBrick;
        arcadeActiveBrick = null;
        els.arcadeInput.value = '';

        setTimeout(() => { if (el) el.remove(); }, 500);

        window.updateArcadeProgression();
        window.updateArcadeStatsUI();

        // Prossimo mattoncino
        setTimeout(window.spawnArcadeBrick, 600);
    }
};

window.updateArcadeProgression = function() {
    // Ogni parola indovinata: +1 WPM
    arcadeWpm++;
    if (arcadeWpm > peakWpm) peakWpm = arcadeWpm;

    // Ogni 2 parole: +1 lunghezza (max 15)
    if (arcadeWordsSolved % 2 === 0) {
        const oldLen = arcadeWordLen;
        arcadeWordLen = Math.min(15, arcadeWordLen + 1);

        // Verifica Level Up (soglie: 6, 9, 12...)
        if (arcadeWordLen > oldLen) {
            const levelThresholds = [6, 9, 12, 15];
            if (levelThresholds.includes(arcadeWordLen)) {
                arcadeLevel++;
                window.showArcadeLevelUp();

                // Bonus Vita ogni 3 livelli (2, 5, 8... considerando la logica utente 4, 7, 10)
                // Usiamo arcadeLevel per semplicità: se divisibile per 3 (es. Livello 3 -> 4)
                if (arcadeLevel % 3 === 1 && arcadeLevel > 1) {
                    arcadeLives = Math.min(5, arcadeLives + 1);
                    showToast("❤️ VITA EXTRA GUADAGNATA!");
                }
            }
        }
    }
};

window.showArcadeLevelUp = function() {
    window.arcadePaused = true;
    stopAllMorseAudio();

    if (els.arcadeLevelOverlay) {
        els.arcadeLevelOverlay.style.display = 'flex';
        if (els.arcadeLevelNextText) {
            els.arcadeLevelNextText.textContent = `Preparati per parole da ${arcadeWordLen} caratteri!`;
        }
    }

    setTimeout(() => {
        if (els.arcadeLevelOverlay) els.arcadeLevelOverlay.style.display = 'none';
        window.arcadePaused = false;
        window.updateArcadeStatsUI();
    }, 3000);
};

window.updateArcadeStatsUI = function() {
    if (els.arcadeWpmDisplay) els.arcadeWpmDisplay.textContent = `WPM: ${arcadeWpm}`;
    if (els.arcadeScoreDisplay) els.arcadeScoreDisplay.textContent = `Punti: ${arcadeScore}`;
    if (els.arcadeLevelDisplay) els.arcadeLevelDisplay.textContent = `LIVELLO ${arcadeLevel}`;

    if (els.arcadeLivesDisplay) {
        const hearts = "❤️".repeat(arcadeLives);
        els.arcadeLivesDisplay.textContent = hearts;
        if (arcadeLives === 1) els.arcadeLivesDisplay.classList.add('pulse-red');
        else els.arcadeLivesDisplay.classList.remove('pulse-red');
    }
};

window.finishArcadeGame = function() {
    gameRunning = false;
    cancelAnimationFrame(arcadeLoopId);
    stopAllMorseAudio();

    const finalScore = arcadeScore;
    const finalWpm = peakWpm;

    showToast("💀 MISSIONE FALLITA! " + finalScore + " punti.");

    // Salvataggio record Arcade
    if (db && myId) {
        const recordData = {
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            score: finalScore,
            wpm: finalWpm,
            level: arcadeLevel,
            date: new Date().toLocaleDateString('it-IT'),
            ts: firebase.database.ServerValue.TIMESTAMP
        };
        db.ref(`leaderboard/arcade/all/${myId}`).transaction(current => {
            if (!current || finalScore > (current.score || 0)) return recordData;
            return current;
        });
    }

    setTimeout(() => {
        showScreen('leaderboardScreen');
        if (typeof window.switchLBGroup === 'function') {
            // Routing manuale verso la nuova tab Arcade
            window.lbManualRouting = true;
            window.switchLBGroup('special');
            setTimeout(() => {
                if (els.lbModeSelect) {
                    els.lbModeSelect.value = 'arcade';
                    window.showLeaderboardTab('arcade');
                }
            }, 200);
        }
    }, 1500);
};

// Listeners
if (els.arcadeInput) {
    els.arcadeInput.addEventListener('input', window.handleArcadeInput);
}

if (els.quitArcadeBtn) {
    els.quitArcadeBtn.onclick = () => {
        if (confirm("Vuoi davvero abbandonare la missione? I punti non verranno salvati.")) {
            gameRunning = false;
            cancelAnimationFrame(arcadeLoopId);
            isArcadeMode = false;
            goBackToMenu();
        }
    };
}

if (els.startArcadeBtn) {
    els.startArcadeBtn.onclick = () => window.startArcadeSequence();
}
