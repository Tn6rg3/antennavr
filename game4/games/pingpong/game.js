// game4/games/pingpong/game.js
const els = {
    sendArea: document.getElementById('sendArea'),
    receiveArea: document.getElementById('receiveArea'),
    wordToSend: document.getElementById('wordToSend'),
    sendBtn: document.getElementById('sendBtn'),
    receiveInput: document.getElementById('receiveInput'),
    statusText: document.getElementById('statusText'),
    quitBtn: document.getElementById('quitBtn')
};

let lastWordId = 0;

function initPingPong() {
    if (!window.roomCode) return;

    window.db.ref(`rooms/${window.roomCode}/pingpong`).on('value', snap => {
        const data = snap.val();
        if (!data) return;

        if (data.senderId === window.myId) {
            if (!data.word) {
                showSendArea("Tocca a te inviare!");
            } else {
                showStatus("In attesa dell'avversario...");
            }
        } else {
            if (data.word && data.wordId > lastWordId) {
                lastWordId = data.wordId;
                showReceiveArea(data.word);
            } else if (!data.word) {
                showStatus("L'avversario sta scegliendo una parola...");
            }
        }
    });
}

function showSendArea(msg) {
    els.sendArea.style.display = 'flex';
    els.receiveArea.style.display = 'none';
    els.statusText.textContent = msg;
    els.wordToSend.value = "";
    els.wordToSend.focus();
}

function showReceiveArea(word) {
    els.sendArea.style.display = 'none';
    els.receiveArea.style.display = 'flex';
    els.statusText.textContent = "Ricezione in corso...";
    window.GameAudio.playMorseAudio(word, 20);
    els.receiveInput.value = "";
    els.receiveInput.focus();
    els.receiveInput.oninput = () => {
        if (els.receiveInput.value.trim().toUpperCase() === word.toUpperCase()) {
            window.db.ref(`rooms/${window.roomCode}/pingpong`).update({ word: null });
        }
    };
}

function showStatus(msg) {
    els.sendArea.style.display = 'none';
    els.receiveArea.style.display = 'none';
    els.statusText.textContent = msg;
}

els.sendBtn.onclick = () => {
    const val = els.wordToSend.value.trim().toUpperCase();
    if (!val) return;
    window.db.ref(`rooms/${window.roomCode}/pingpong`).transaction(d => {
        if (!d) d = {};
        if (!d.word) {
            d.word = val;
            d.wordId = (d.wordId || 0) + 1;
            d.senderId = window.myId;
        }
        return d;
    });
};

els.quitBtn.onclick = () => {
    window.db.ref(`rooms/${window.roomCode}/pingpong`).off();
    window.parent.postMessage('closeModule', '*');
};

if (window.roomCode) initPingPong();
