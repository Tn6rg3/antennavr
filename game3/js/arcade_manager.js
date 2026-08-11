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

    // Scegliamo una parola della lunghezza attuale dal dizionario itDictionary o FALLBACK
    const pool = (window.itDictionary && window.itDictionary.length > 0) ? window.itDictionary : window.FALLBACK_WORDS_IT;
    const sameLenWords = pool.filter(w => w.length === arcadeCurrentLen);
    const word = sameLenWords.length > 0
        ? sameLenWords[Math.floor(Math.random() * sameLenWords.length)].toUpperCase()
        : window.generateRandomString(arcadeCurrentLen);

    arcadeActiveWord = word;

    // Grafica: Elemento che cade
    const container = document.getElementById('arcadeFallContainer');
    container.innerHTML = "";

    const wordEl = document.createElement('div');
    wordEl.className = 'falling-word';
    wordEl.id = "falling_word_obj";
    wordEl.innerHTML = "•".repeat(word.length); // Nascondiamo la parola inizialmente

    // Calcolo durata caduta (Graduale)
    // Formula: tempo base + (bonus per lunghezza) - (malus per WPM)
    // Garantiamo che l'utente abbia sempre almeno 1.5 secondi extra dopo la fine dell'audio
    const audioDurationMs = (word.length * 50 / currentWpm) * 1000;
    const fallDuration = Math.max(4000, 6000 + (word.length * 500) - (currentWpm * 50));

    wordEl.style.transition = `transform ${fallDuration}ms linear, opacity 0.5s`;
    container.appendChild(wordEl);

    // Avvio caduta (millisecondo dopo per far registrare il transition)
    setTimeout(() => {
        wordEl.style.transform = "translateY(75vh)";
    }, 50);

    // Audio
    if (typeof playMorseAudio === 'function') {
        playMorseAudio(word, currentWpm);
    }

    // Timer per il fallimento (se tocca il fondo)
    if (arcadeFallTimer) clearTimeout(arcadeFallTimer);
    arcadeFallTimer = setTimeout(() => {
        if (arcadeIsRunning && arcadeActiveWord === word) {
            window.handleArcadeMiss();
        }
    }, fallDuration);
};

window.handleArcadeSuccess = function() {
    if (arcadeFallTimer) clearTimeout(arcadeFallTimer);

    const el = document.getElementById('falling_word_obj');
    if (el) {
        el.textContent = arcadeActiveWord;
        el.style.color = "#00ff00";
        el.style.textShadow = "0 0 20px #00ff00";
        el.style.transform = "translateY(40vh) scale(2)";
        el.style.opacity = "0";
    }

    // Calcolo Punti
    totalScore += (arcadeCurrentLen * 10) + currentWpm;
    arcadeCorrectInRow++;

    // Progressione: +1 WPM ogni parola giusta
    currentWpm += 1;

    // Progressione: +1 carattere ogni 2 parole giuste
    if (arcadeCorrectInRow % 2 === 0) {
        arcadeCurrentLen = Math.min(12, arcadeCurrentLen + 1);
    }

    if (els.arcadeInput) els.arcadeInput.value = "";
    window.updateArcadeUI();

    // Prossima parola
    setTimeout(window.spawnArcadeWord, 800);
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

window.arcadeGameOver = function(reason) {
    arcadeIsRunning = false;
    gameRunning = false;
    if (arcadeFallTimer) clearTimeout(arcadeFallTimer);

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
    if (els.arcadeLivesDisplay) {
        let hearts = "";
        for(let i=0; i<3; i++) hearts += (i < arcadeLives) ? "❤️" : "🖤";
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
