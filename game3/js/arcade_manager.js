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
    arcadeWordsAtCurrentLen = 0;
    arcadeWordLen = 3;
    arcadeWpm = 20; // Velocità fissa iniziale per tutti
    peakWpm = arcadeWpm;

    showScreen('arcadeArea');
    window.updateArcadeStatsUI();

    if (els.arcadeBrickContainer) {
        // Rimuoviamo solo i mattoncini (classe .arcade-brick), preservando l'overlay
        els.arcadeBrickContainer.querySelectorAll('.arcade-brick').forEach(b => b.remove());
        // Memorizziamo l'altezza "full" come riferimento per scalare la velocità
        window.arcadeReferenceHeight = els.arcadeBrickContainer.clientHeight || 500;
        els.arcadeBrickContainer.style.minHeight = '0'; // Rimuoviamo eventuali lock precedenti
    }

    if (els.arcadeInput) {
        els.arcadeInput.value = '';
        els.arcadeInput.disabled = false;
        setTimeout(() => els.arcadeInput.focus(), 500);
    }

    arcadeActiveBrick = null;
    lastFrameTime = performance.now();
    arcadeLoopId = requestAnimationFrame(window.arcadeGameLoop);

    // Inizio ritardato di 1 secondo come richiesto
    setTimeout(window.spawnArcadeBrick, 1000);
};

window.spawnArcadeBrick = function() {
    if (!gameRunning || !isArcadeMode) return;

    // Genera parola della lunghezza corrente usando il dizionario specifico arcade (parole2.txt)
    let baseDict = (window.arcadeDictionary && window.arcadeDictionary.length > 0)
                   ? window.arcadeDictionary
                   : window.masterDictionary;

    let dict = baseDict.filter(w => w.length === arcadeWordLen);

    // Integrazione numeri scritti per parole corte
    const numberWords = {
        3: ["UNO", "DUE", "TRE", "SEI"],
        4: ["OTTO", "NOVE"],
        5: ["DIECI", "ZERO"],
        6: ["QUATTRO", "CINQUE", "SETTE"]
    };
    if (numberWords[arcadeWordLen]) {
        dict = dict.concat(numberWords[arcadeWordLen]);
    }

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
    const brickWidth = 80;
    const startX = Math.floor(Math.random() * (containerWidth - brickWidth));

    brick.style.left = startX + 'px';
    brick.style.top = '0px'; // Parte esattamente sotto la barra stats
    container.appendChild(brick);

    arcadeActiveBrick = {
        el: brick,
        word: word,
        y: 0,
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
        const lengthFactor = Math.max(0.4, 1 - ((arcadeWordLen - 3) * 0.05));

        // COMPENSAZIONE TASTIERA:
        // Se l'altezza attuale è ridotta (tastiera aperta), rallentiamo i pixel/frame
        // così il tempo totale di caduta rimane proporzionale allo spazio visibile.
        const currentHeight = els.arcadeBrickContainer.clientHeight;
        const heightScale = currentHeight / (window.arcadeReferenceHeight || currentHeight);

        const speed = (ARCADE_BASE_FALL_SPEED + (arcadeWpm - 15) * 0.02) * lengthFactor * heightScale;

        arcadeActiveBrick.y += speed * (deltaTime / 16.67); // Normalizzato a 60fps
        arcadeActiveBrick.el.style.top = arcadeActiveBrick.y + 'px';

        // Collisione con il fondo attuale (sopra la tastiera)
        if (arcadeActiveBrick.y > currentHeight - 40) {
            window.handleArcadeMiss();
        }
    }

    arcadeLoopId = requestAnimationFrame(window.arcadeGameLoop);
};

window.handleArcadeMiss = function() {
    if (!arcadeActiveBrick) return;

    arcadeLives--;
    window.updateArcadeStatsUI();

    // RESET STREAK IN CASO DI ERRORE
    window.currentStreak = 0;

    // Pulisce l'input se è rimasto del testo sbagliato
    if (els.arcadeInput) els.arcadeInput.value = '';

    // Effetto scuotimento
    els.arcadeArea.classList.add('shake');
    setTimeout(() => els.arcadeArea.classList.remove('shake'), 400);

    // Rimuovi mattoncino
    if (arcadeActiveBrick.el) arcadeActiveBrick.el.remove();
    arcadeActiveBrick = null;

    if (arcadeLives <= 0) {
        window.finishArcadeGame();
    } else {
        // Breve pausa prima del prossimo (RIDOTTA per fluidità)
        setTimeout(window.spawnArcadeBrick, 500);
    }
};

window.handleArcadeInput = function() {
    if (!arcadeActiveBrick || !gameRunning || window.arcadePaused) return;

    const typed = els.arcadeInput.value.trim().toUpperCase();
    const target = arcadeActiveBrick.word;

    // Rivelazione parziale dei caratteri corretti
    let displayStr = "";
    for (let i = 0; i < target.length; i++) {
        if (typed[i] === target[i]) displayStr += target[i];
        else displayStr += "•";
    }
    arcadeActiveBrick.el.textContent = displayStr;

    if (typed === target) {
        // CORRETTO!
        const reactionTime = Date.now() - arcadeActiveBrick.startTime;
        const timeBonus = Math.max(1, 15000 / reactionTime);
        const points = Math.round((arcadeWpm * target.length * arcadeLevel) * timeBonus);

        arcadeScore += points;
        arcadeWordsSolved++;
        arcadeWordsAtCurrentLen++;

        // AGGIORNAMENTO MISSIONI
        window.currentStreak++;
        if (typeof window.updateMissionProgress === 'function') {
            window.updateMissionProgress('count', 1);
            window.updateMissionProgress('wpm_min', arcadeWpm);
            window.updateMissionProgress('streak', window.currentStreak);
        }

        // Effetto esplosione
        const el = arcadeActiveBrick.el;
        el.textContent = target;
        el.classList.add('exploded');

        arcadeActiveBrick = null;
        els.arcadeInput.value = '';

        setTimeout(() => { if (el) el.remove(); }, 500);

        const hasTransition = window.updateArcadeProgression();
        window.updateArcadeStatsUI();

        // Prossimo mattoncino (AUMENTATO a 700ms per dare respiro tra parole)
        if (!hasTransition) {
            setTimeout(window.spawnArcadeBrick, 700);
        }
    }
};

window.updateArcadeProgression = function() {
    // Ogni parola indovinata: +1 WPM
    arcadeWpm++;
    if (arcadeWpm > peakWpm) peakWpm = arcadeWpm;

    // Progression richiesto: 3ch->2w, 4ch->3w, 5ch->5w
    const wordsPerLen = { 3: 2, 4: 3, 5: 5 };
    const needed = wordsPerLen[arcadeWordLen] || 5;

    if (arcadeWordsAtCurrentLen >= needed) {
        const oldLen = arcadeWordLen;
        arcadeWordLen = Math.min(15, arcadeWordLen + 1);

        // Se la lunghezza è aumentata, mostriamo SEMPRE una transizione visiva
        if (arcadeWordLen > oldLen) {
            arcadeWordsAtCurrentLen = 0; // Reset per la nuova lunghezza
            // Semplice Wave Up o vero Level Up?
            const levelThresholds = [6, 9, 12, 15];
            const isMajorLevel = levelThresholds.includes(arcadeWordLen);

            if (isMajorLevel) arcadeLevel++;

            window.showArcadeLevelUp(isMajorLevel);

            // Bonus Vita ogni volta che superiamo una soglia Major
            if (isMajorLevel) {
                arcadeLives = Math.min(5, arcadeLives + 1);
                showToast("❤️ VITA EXTRA GUADAGNATA!");
            }
            return true;
        }
    }
    return false;
};

window.showArcadeLevelUp = function(isMajor) {
    window.arcadePaused = true;
    stopAllMorseAudio();

    if (els.arcadeLevelOverlay) {
        // Forza riavvio animazione nascondendo e rimostrando
        els.arcadeLevelOverlay.style.display = 'none';
        void els.arcadeLevelOverlay.offsetWidth; // Reflow
        els.arcadeLevelOverlay.style.display = 'flex';

        if (els.arcadeLevelNumber) {
            els.arcadeLevelNumber.classList.remove('level-number-anim');
            void els.arcadeLevelNumber.offsetWidth; // Reflow
            els.arcadeLevelNumber.classList.add('level-number-anim');
            els.arcadeLevelNumber.textContent = isMajor ? arcadeLevel : arcadeWordLen;
        }

        if (els.arcadeLevelTitle) {
            els.arcadeLevelTitle.textContent = isMajor ? `LIVELLO ${arcadeLevel}` : "CARATTERI AUMENTATI";
        }
        if (els.arcadeLevelNextText) {
            els.arcadeLevelNextText.style.display = 'none'; // Nascondiamo la scritta sotto
        }
    }

    setTimeout(() => {
        if (els.arcadeLevelOverlay) {
            els.arcadeLevelOverlay.style.display = 'none';
        }
        window.arcadePaused = false;
        window.updateArcadeStatsUI();
        if (els.arcadeInput) {
            els.arcadeInput.value = '';
            els.arcadeInput.focus();
        }
        // Spawna il prossimo mattone alla fine della transizione
        window.spawnArcadeBrick();
    }, 2200);
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
        const rpgLevel = window.userProgression?.level || 1;
        const recordData = {
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            score: finalScore,
            wpm: finalWpm,
            level: rpgLevel,
            wave: arcadeLevel, // Salviamo separatamente il livello arcade raggiunto
            date: new Date().toLocaleDateString('it-IT'),
            ts: firebase.database.ServerValue.TIMESTAMP
        };
        db.ref(`leaderboard/arcade/all/${myId}`).transaction(current => {
            if (!current || finalScore > (current.score || 0)) return recordData;
            // Se non è record, aggiorniamo comunque il livello RPG se è cresciuto
            if (current && rpgLevel > (current.level || 0)) {
                current.level = rpgLevel;
            }
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
    // Mantiene la tastiera aperta forzando il focus se si clicca fuori nell'area arcade
    els.arcadeBrickContainer?.addEventListener('click', () => {
        if (isArcadeMode && gameRunning) els.arcadeInput.focus();
    });
    els.arcadeInput.addEventListener('blur', () => {
        if (isArcadeMode && gameRunning) setTimeout(() => els.arcadeInput.focus(), 100);
    });
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
    els.startArcadeBtn.onclick = () => {
        const mode = document.getElementById('gameModeInput')?.value;
        if (mode === 'la_torre') {
            if (typeof window.startTowerSequence === 'function') window.startTowerSequence();
        } else {
            window.startArcadeSequence();
        }
    };
}
