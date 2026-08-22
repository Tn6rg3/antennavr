// game4/games/coop/game.js
const els = {
    progressText: document.getElementById('progressText'),
    progressBar: document.getElementById('progressBar'),
    timeDisplay: document.getElementById('timeDisplay'),
    freqButtons: [
        document.getElementById('btnFreq1'),
        document.getElementById('btnFreq2'),
        document.getElementById('btnFreq3')
    ],
    input: document.getElementById('permanentGameInput'),
    quitBtn: document.getElementById('quitGameBtn')
};

let activeFreqIndex = 0;
let currentWord = "";
let gameActive = false;

function initCoop() {
    if (!window.roomCode) {
        alert("Errore: Codice stanza mancante.");
        return;
    }

    window.db.ref(`rooms/${window.roomCode}/coop_state`).on('value', snap => {
        const state = snap.val();
        if (!state) return;

        els.progressBar.style.width = `${state.progress}%`;
        els.progressText.textContent = `Conquista: ${state.progress}%`;

        const mins = Math.floor(state.timeRemaining / 60).toString().padStart(2, '0');
        const secs = (state.timeRemaining % 60).toString().padStart(2, '0');
        els.timeDisplay.textContent = `⏱️ ${mins}:${secs}`;

        if (state.status === 'won') {
            alert("VITTORIA DI SQUADRA!");
            endGame();
        } else if (state.status === 'lost') {
            alert("TEMPO SCADUTO! MISSIONE FALLITA.");
            endGame();
        }

        const owners = state.freqOwners || {};
        els.freqButtons.forEach((btn, i) => {
            const num = i + 1;
            const ownerId = owners[num];
            if (!ownerId) {
                btn.style.opacity = "1";
                btn.textContent = `FREQ ${num} (Libera)`;
            } else if (ownerId === window.myId) {
                btn.style.opacity = "1";
                btn.textContent = `FREQ ${num} (TUA 🔒)`;
                if (activeFreqIndex === num && state.activeWords) {
                    const word = state.activeWords[i];
                    if (word && word !== currentWord) {
                        currentWord = word;
                        window.GameAudio.playMorseAudio(word, 20);
                        els.input.value = "";
                        els.input.focus();
                    }
                }
            } else {
                btn.style.opacity = "0.4";
                btn.textContent = `FREQ ${num} (Occupata)`;
            }
        });
    });
}

els.freqButtons.forEach((btn, i) => {
    btn.onclick = () => {
        const num = i + 1;
        window.db.ref(`rooms/${window.roomCode}/coop_state/freqOwners`).transaction(owners => {
            if (!owners) owners = { 1: null, 2: null, 3: null };
            if (owners[num] && owners[num] !== window.myId) return undefined;
            [1, 2, 3].forEach(n => { if (owners[n] === window.myId) owners[n] = null; });
            owners[num] = window.myId;
            return owners;
        }, (err, committed) => {
            if (committed) {
                activeFreqIndex = num;
                els.input.disabled = false;
                els.input.placeholder = "Digita qui...";
            }
        });
    };
});

els.input.addEventListener('input', () => {
    const typed = els.input.value.trim().toUpperCase();
    if (typed === currentWord) {
        window.db.ref(`rooms/${window.roomCode}/coop_state`).transaction(state => {
            if (!state) return state;
            state.progress = Math.min(100, (state.progress || 0) + 5);
            if (state.activeWords) {
                const wPool = ["RADIO", "MORSE", "SIGNAL", "ANTENNA", "KEYER", "WATT", "HERTZ", "CQ", "DX", "TELEGRAPH"];
                state.activeWords[activeFreqIndex - 1] = wPool[Math.floor(Math.random() * wPool.length)];
            }
            return state;
        });
        els.input.value = "";
    }
});

els.quitBtn.onclick = () => {
    window.db.ref(`rooms/${window.roomCode}/coop_state`).off();
    window.parent.postMessage('closeModule', '*');
};

function endGame() {
    window.db.ref(`rooms/${window.roomCode}/coop_state`).off();
}

// Avvio automatico se roomCode presente
if (window.roomCode) initCoop();
