// js/arcade_manager.js

let arcadeLives = 3;
let arcadeCorrectInRow = 0;
let arcadeCurrentLen = 3;
let arcadeActiveWord = "";
let arcadeFallTimer = null;
let arcadeIsRunning = false;

window.initArcadeMode = function() {
    console.log("Arcade: Starting Initialization...");
    arcadeLives = 3;
    arcadeCorrectInRow = 0;
    arcadeCurrentLen = 3;
    totalScore = 0;
    currentWpm = 20;
    arcadeIsRunning = true;
    gameRunning = true;

    window.showScreen('arcadeArea');
    window.updateArcadeUI();

    if (els.arcadeInput) {
        els.arcadeInput.value = "";
        setTimeout(() => els.arcadeInput.focus(), 500);

        // Listener Input istantaneo
        els.arcadeInput.oninput = (e) => {
            const val = e.target.value.trim().toUpperCase();
            if (val === arcadeActiveWord && arcadeActiveWord !== "") {
                window.handleArcadeSuccess();
            }
        };
    }

    if (els.quitArcadeBtn) {
        els.quitArcadeBtn.onclick = () => {
            window.arcadeGameOver("Abbandono");
        };
    }

    setTimeout(window.spawnArcadeWord, 1000);
};

window.spawnArcadeWord = function() {
    if (!arcadeIsRunning) return;

    // Scegliamo una parola della lunghezza attuale
    const pool = (window.itDictionary && window.itDictionary.length > 0) ? window.itDictionary : window.FALLBACK_WORDS_IT;
    let sameLenWords = pool.filter(w => w.length === arcadeCurrentLen);

    // Se non troviamo parole di quella lunghezza, ne generiamo una o allarghiamo la ricerca
    if (sameLenWords.length === 0) {
        sameLenWords = pool.filter(w => w.length >= arcadeCurrentLen - 1 && w.length <= arcadeCurrentLen + 1);
    }

    const word = sameLenWords.length > 0
        ? sameLenWords[Math.floor(Math.random() * sameLenWords.length)].toUpperCase()
        : window.generateRandomString(arcadeCurrentLen);

    arcadeActiveWord = word;

    // Grafica: Mattoncino Arcade
    const container = document.getElementById('arcadeFallContainer');
    container.innerHTML = "";

    const wordWrapper = document.createElement('div');
    wordWrapper.className = 'falling-word-block';
    wordWrapper.id = "falling_word_obj";

    const brick = document.createElement('div');
    brick.className = 'arcade-brick';
    brick.textContent = "•".repeat(word.length); // Puntini dentro il mattoncino

    wordWrapper.appendChild(brick);
    container.appendChild(wordWrapper);

    // Calcolo durata caduta (PIÙ LENTA E GRADUALE)
    // Partiamo da 10 secondi per 3 caratteri e scendiamo gradualmente
    const baseDuration = 10000;
    const lenBonus = (word.length - 3) * 1000; // +1s per ogni carattere in più
    const wpmPenalty = (currentWpm - 20) * 150; // -0.15s per ogni WPM sopra i 20

    const fallDuration = Math.max(4500, baseDuration + lenBonus - wpmPenalty);

    console.log(`Arcade: Word "${word}" will fall in ${fallDuration}ms`);

    // Avvio caduta tramite JS Animation (più affidabile del CSS in questo contesto)
    let startTime = null;
    const startY = -100;
    const endY = window.innerHeight * 0.7; // Si ferma prima dell'input

    function animateFall(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = (timestamp - startTime) / fallDuration;

        if (progress < 1 && arcadeIsRunning && arcadeActiveWord === word) {
            const currentY = startY + (endY - startY) * progress;
            wordWrapper.style.transform = `translateY(${currentY}px)`;
            requestAnimationFrame(animateFall);
        } else if (progress >= 1 && arcadeIsRunning && arcadeActiveWord === word) {
            // HA TOCCATO IL FONDO
            window.handleArcadeMiss();
        }
    }

    // Audio
    if (typeof playMorseAudio === 'function') {
        playMorseAudio(word, currentWpm);
    }

    requestAnimationFrame(animateFall);
};

window.handleArcadeSuccess = function() {
    // Fermiamo la logica di caduta cambiando la parola attiva
    const wordWas = arcadeActiveWord;
    arcadeActiveWord = "";

    if (arcadeFallTimer) clearTimeout(arcadeFallTimer);

    const el = document.getElementById('falling_word_obj');
    if (el) {
        const brick = el.querySelector('.arcade-brick');
        if (brick) {
            brick.textContent = wordWas; // Riveliamo la parola
            brick.style.background = "rgba(0, 255, 0, 0.4)";
            brick.style.borderColor = "#00ff00";
            brick.style.color = "#fff";
        }
        el.classList.add('brick-exploding');
    }

    // Calcolo Punti (Bonus per velocità e lunghezza)
    totalScore += (arcadeCurrentLen * 20) + currentWpm;
    arcadeCorrectInRow++;

    // Progressione: +1 WPM ogni parola giusta
    currentWpm += 1;

    // Progressione Lunghezza: +1 carattere ogni 2 parole giuste
    if (arcadeCorrectInRow % 2 === 0) {
        const oldLen = arcadeCurrentLen;
        arcadeCurrentLen = Math.min(15, arcadeCurrentLen + 1);

        // Ogni 3 caratteri di aumento è un nuovo "Livello" (es: 6, 9, 12...)
        if (arcadeCurrentLen > oldLen && (arcadeCurrentLen - 3) % 3 === 0) {
            window.showArcadeLevelUp(arcadeCurrentLen);
            return;
        }
    }

    if (els.arcadeInput) els.arcadeInput.value = "";
    window.updateArcadeUI();

    // Prossima parola
    setTimeout(window.spawnArcadeWord, 800);
};

window.showArcadeLevelUp = function(newLen) {
    const overlay = document.getElementById('arcadeLevelUpOverlay');
    const levelText = document.getElementById('arcadeNewLevelText');
    const bonusText = document.getElementById('arcadeLevelBonus');
    if (!overlay || !levelText) return;

    const currentLevel = Math.floor((newLen - 3) / 3) + 1;
    levelText.textContent = `LIVELLO ${currentLevel} (${newLen} Caratteri)`;

    let bonus = "";
    // Ogni 3 livelli guadagni una vita (es: Lv 4, 7...)
    if (currentLevel > 1 && (currentLevel - 1) % 3 === 0) {
        arcadeLives = Math.min(5, arcadeLives + 1);
        bonus = "🎁 BONUS: +1 VITA! ❤️";
        if (typeof window.playBeep === 'function') window.playBeep(1000, 0.5);
    } else {
        if (typeof window.playBeep === 'function') window.playBeep(880, 0.2);
    }

    if (bonusText) bonusText.textContent = bonus;

    overlay.style.display = 'flex';
    window.updateArcadeUI();

    setTimeout(() => {
        overlay.style.display = 'none';
        if (els.arcadeInput) els.arcadeInput.value = "";
        window.spawnArcadeWord();
    }, 3000);
};

window.handleArcadeMiss = function() {
    arcadeLives--;
    arcadeCorrectInRow = 0; // Reset progressione lunghezza

    const area = document.getElementById('arcadeArea');
    area.classList.add('screen-shake');
    setTimeout(() => area.classList.remove('screen-shake'), 300);

    if (els.arcadeInput) els.arcadeInput.value = "";
    window.updateArcadeUI();

    if (arcadeLives <= 0) {
        window.arcadeGameOver("Vite Esaurite");
    } else {
        setTimeout(window.spawnArcadeWord, 1000);
    }
};
    } else {
        setTimeout(window.spawnArcadeWord, 1000);
    }
};

window.arcadeGameOver = function(reason) {
    arcadeIsRunning = false;
    gameRunning = false;
    if (arcadeFallTimer) clearTimeout(arcadeFallTimer);

    // Ripristiniamo la visualizzazione standard
    if (els.tableWrapper) els.tableWrapper.style.display = 'block';

    alert(`GAME OVER: ${reason}\n\nPunteggio Finale: ${totalScore}\nVelocità Massima: ${currentWpm} WPM`);

    // Salvataggio record (se score > 0)
    if (totalScore > 0) {
        const dbPath = `leaderboard/arcade/global/${myId}`;
        db.ref(dbPath).once('value', s => {
            const old = s.val();
            if (!old || totalScore > old.score) {
                db.ref(dbPath).set({
                    name: myName,
                    username: myPrivacy ? "" : tgUsername,
                    score: totalScore,
                    wpm: currentWpm,
                    date: new Date().toLocaleDateString('it-IT')
                });
            }
        });
    }

    window.goBackToMenu();
};

window.updateArcadeUI = function() {
    if (els.arcadeScoreDisplay) els.arcadeScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (els.arcadeWpmDisplay) els.arcadeWpmDisplay.textContent = `WPM: ${currentWpm}`;

    const currentLevel = Math.floor((arcadeCurrentLen - 3) / 3) + 1;
    const lvDisp = document.getElementById('arcadeLevelDisplay');
    if (lvDisp) lvDisp.textContent = `LV: ${currentLevel}`;

    if (els.arcadeLivesDisplay) {
        let hearts = "";
        for(let i=0; i<Math.max(3, arcadeLives); i++) {
            hearts += (i < arcadeLives) ? "❤️" : "🖤";
        }
        els.arcadeLivesDisplay.textContent = hearts;
    }
    const nextLenInfo = document.getElementById('arcadeWordLengthInfo');
    if (nextLenInfo) nextLenInfo.textContent = `Lunghezza attuale: ${arcadeCurrentLen} car.`;
};

window.generateRandomString = function(len) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let res = "";
    for(let i=0; i<len; i++) res += chars[Math.floor(Math.random() * chars.length)];
    return res;
};
