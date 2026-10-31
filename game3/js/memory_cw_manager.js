// js/memory_cw_manager.js - Gestore Modalità "Gioco delle Coppie" (Memory CW)

window.memoryCards = [];
window.memorySelectedCards = [];
window.memoryMatchedPairs = 0;
window.memoryTotalPairs = 8;
window.memoryScore = 0;
window.memoryAttempts = 0;
window.memoryTimerInterval = null;
window.memorySeconds = 0;
window.isMemoryLockGrid = false;

window.startMemoryCwGame = function() {
    if (typeof window.showScreen === 'function') {
        window.showScreen('memoryCwScreen');
    }

    if (window.memoryTimerInterval) {
        clearInterval(window.memoryTimerInterval);
        window.memoryTimerInterval = null;
    }

    window.memorySeconds = 0;
    window.memoryAttempts = 0;
    window.memoryScore = 0;
    window.memoryMatchedPairs = 0;
    window.memorySelectedCards = [];
    window.isMemoryLockGrid = false;

    const countInput = document.getElementById('memoryCardCountInput');
    const totalCards = countInput ? (parseInt(countInput.value) || 16) : 16;
    window.memoryTotalPairs = Math.floor(totalCards / 2);

    // Recuperiamo il dizionario unificato
    if (typeof window.updateDictionary === 'function') window.updateDictionary();
    let dict = window.masterDictionary || window.itDictionaryCombined || ["RADIO", "MORSE", "ANTENNA", "SEGNALE", "FREQUENZA", "ONDA", "CW", "TASTO"];

    // Filtriamo parole pulite di lunghezza tra 3 e 8 caratteri
    let cleanDict = dict.map(w => String(w).trim().toUpperCase()).filter(w => w.length >= 3 && w.length <= 8 && !w.includes(' '));
    if (cleanDict.length < window.memoryTotalPairs) {
        cleanDict = ["RADIO", "MORSE", "ANTENNA", "SEGNALE", "FREQUENZA", "ONDA", "TASTO", "SINTONIA", "RICEVUTA", "BANDA"];
    }

    // Estraiamo N parole uniche
    let shuffleDict = (typeof fisherYatesShuffle === 'function') ? fisherYatesShuffle(cleanDict) : [...cleanDict];
    let selectedWords = shuffleDict.slice(0, window.memoryTotalPairs);

    // Creiamo le coppie duplicate (Coppia A-A, B-B, ecc.)
    let cardPairs = [];
    selectedWords.forEach((word, idx) => {
        cardPairs.push({ id: idx * 2, pairId: idx, word: word, isFlipped: false, isMatched: false });
        cardPairs.push({ id: idx * 2 + 1, pairId: idx, word: word, isFlipped: false, isMatched: false });
    });

    // Rimescoliamo le carte sulla griglia
    window.memoryCards = (typeof fisherYatesShuffle === 'function') ? fisherYatesShuffle(cardPairs) : cardPairs;

    window.updateMemoryUI();

    // Avvio Timer
    const timerDisp = document.getElementById('memoryTimerDisplay');
    if (timerDisp) timerDisp.textContent = "00:00";

    window.memoryTimerInterval = setInterval(() => {
        window.memorySeconds++;
        const mins = String(Math.floor(window.memorySeconds / 60)).padStart(2, '0');
        const secs = String(window.memorySeconds % 60).padStart(2, '0');
        if (timerDisp) timerDisp.textContent = `${mins}:${secs}`;
    }, 1000);
};

window.updateMemoryUI = function() {
    const gridContainer = document.getElementById('memoryGridContainer');
    const pairsDisp = document.getElementById('memoryPairsDisplay');
    const attemptsDisp = document.getElementById('memoryAttemptsDisplay');
    const scoreDisp = document.getElementById('memoryScoreDisplay');

    if (pairsDisp) pairsDisp.textContent = `${window.memoryMatchedPairs} / ${window.memoryTotalPairs}`;
    if (attemptsDisp) attemptsDisp.textContent = window.memoryAttempts;
    if (scoreDisp) scoreDisp.textContent = `${window.memoryScore} pt`;

    if (!gridContainer) return;

    // Regoliamo le colonne in base al numero di carte
    const colCount = window.memoryCards.length <= 10 ? 5 : 4;
    gridContainer.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;
    gridContainer.innerHTML = '';

    window.memoryCards.forEach((card, index) => {
        const cardBtn = document.createElement('button');
        cardBtn.className = 'memory-card-btn';
        cardBtn.style.cssText = `
            height: 75px;
            border-radius: 10px;
            font-weight: bold;
            font-size: 0.85em;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            transition: all 0.2s ease;
            box-sizing: border-box;
            padding: 4px;
        `;

        if (card.isMatched) {
            cardBtn.style.background = "rgba(76, 175, 80, 0.25)";
            cardBtn.style.border = "2px solid #4caf50";
            cardBtn.style.color = "#00ff66";
            cardBtn.innerHTML = `<span>✅</span><b style="font-size:0.8em; margin-top:2px;">${card.word}</b>`;
            cardBtn.disabled = true;
        } else if (card.isFlipped) {
            cardBtn.style.background = "rgba(0, 188, 212, 0.3)";
            cardBtn.style.border = "2px solid #00e5ff";
            cardBtn.style.color = "#ffffff";
            cardBtn.innerHTML = `<span style="font-size:1.3em;">🔊</span><small style="font-size:0.65em; color:#00e5ff; font-weight:bold; margin-top:2px;">Ascolta...</small>`;
        } else {
            cardBtn.style.background = "url('css/carta.jpg') center/cover no-repeat, var(--sec-bg-color)";
            cardBtn.style.border = "2px solid var(--link-color)";
            cardBtn.style.color = "transparent";
            cardBtn.innerHTML = ``;
        }

        cardBtn.onclick = () => window.onMemoryCardClicked(index);
        gridContainer.appendChild(cardBtn);
    });
};

window.onMemoryCardClicked = function(index) {
    if (window.isMemoryLockGrid) return;
    const card = window.memoryCards[index];
    if (!card || card.isFlipped || card.isMatched) return;

    // Fai ascoltare l'audio Morse della parola della carta
    const wpmInput = document.getElementById('startWpmInput');
    const wpm = wpmInput ? (parseInt(wpmInput.value) || 20) : 20;

    if (typeof window.stopAllMorseAudio === 'function') window.stopAllMorseAudio();
    if (typeof window.playMorseAudio === 'function') {
        window.playMorseAudio(card.word, wpm, true);
    }

    card.isFlipped = true;
    window.memorySelectedCards.push({ card, index });
    window.updateMemoryUI();

    // Se sono state scoperte 2 carte
    if (window.memorySelectedCards.length === 2) {
        window.memoryAttempts++;
        window.isMemoryLockGrid = true;

        const first = window.memorySelectedCards[0];
        const second = window.memorySelectedCards[1];

        if (first.card.pairId === second.card.pairId) {
            // CORRISPONDENZA CONFERMATA (MATCH!)
            first.card.isMatched = true;
            second.card.isMatched = true;
            window.memoryMatchedPairs++;
            window.memoryScore += 100;

            if (typeof playBeep === 'function') playBeep(880, 0.12);
            if (typeof showToast === 'function') showToast(`✅ COPPIA TROVATA: ${first.card.word}! (+100 pt)`);

            window.memorySelectedCards = [];
            window.isMemoryLockGrid = false;
            window.updateMemoryUI();

            // Verifica vittoria
            if (window.memoryMatchedPairs === window.memoryTotalPairs) {
                setTimeout(() => window.finishMemoryCwGame(), 300);
            }
        } else {
            // DIVERSE: Ripristiniamo coperte dopo 1.2s
            const statusEl = document.getElementById('memoryStatusText');
            if (statusEl) statusEl.textContent = "❌ Carte diverse. Ascolta e riprova...";

            setTimeout(() => {
                first.card.isFlipped = false;
                second.card.isFlipped = false;
                window.memorySelectedCards = [];
                window.isMemoryLockGrid = false;
                if (statusEl) statusEl.textContent = "Clicca su una carta per ascoltare il suo suono in codice Morse! 🎧";
                window.updateMemoryUI();
            }, 1200);
        }
    }
};

window.finishMemoryCwGame = function() {
    if (window.memoryTimerInterval) {
        clearInterval(window.memoryTimerInterval);
        window.memoryTimerInterval = null;
    }

    const timeBonus = Math.max(0, 300 - window.memorySeconds * 2);
    const accuracyBonus = Math.max(0, 200 - (window.memoryAttempts - window.memoryTotalPairs) * 10);
    const totalFinalScore = window.memoryScore + timeBonus + accuracyBonus;

    const mins = String(Math.floor(window.memorySeconds / 60)).padStart(2, '0');
    const secs = String(window.memorySeconds % 60).padStart(2, '0');

    // Salviamo il punteggio su Firebase se disponibile
    if (typeof db !== 'undefined' && db && window.myId) {
        const wpmInput = document.getElementById('startWpmInput');
        const wpm = wpmInput ? (parseInt(wpmInput.value) || 20) : 20;

        db.ref(`leaderboard/arcade/memory_cw/${window.myId}`).once('value', snap => {
            const oldScore = snap.exists() ? (snap.val().score || 0) : 0;
            if (!snap.exists() || totalFinalScore > oldScore) {
                db.ref(`leaderboard/arcade/memory_cw/${window.myId}`).set({
                    name: window.myName || "Telegrafista",
                    score: totalFinalScore,
                    time: `${mins}:${secs}`,
                    attempts: window.memoryAttempts,
                    wpm: wpm,
                    date: (typeof window.getLocalDateString === 'function') ? window.getLocalDateString() : new Date().toISOString().split('T')[0]
                });
            }
        });
    }

    alert(`🎉 COMPLIMENTI! HAI COMPLETATO IL MEMORY CW!\n\nCoppie Trovate: ${window.memoryMatchedPairs} / ${window.memoryTotalPairs}\nTempo Impiegato: ${mins}:${secs}\nTentativi: ${window.memoryAttempts}\nPunteggio Finale: ${totalFinalScore} pt`);
};
