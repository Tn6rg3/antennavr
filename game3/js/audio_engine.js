// js/audio_engine.js

window.morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    '=': '-...-',
    '.': '.-.-.-', ',': '--..--', '?': '..--..',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--'
};

window.activeOscillators = [];
window.manualOscillator = null;
window.manualGain = null;
window.morsePlayToken = 0;
window.btKeepAliveOsc = null;

/**
 * FUNZIONE DI RIPRISTINO AUDIO (SPECIFICA PER iOS/iPhone)
 * Tenta di riattivare il contesto audio se sospeso o bloccato.
 */
window.resumeAudioContext = function() {
    try {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }
        if (window.audioCtx.state === 'suspended' || window.audioCtx.state === 'interrupted') {
            window.audioCtx.resume().then(() => {
                console.log("AudioEngine: Pacemaker riattivato. Stato:", window.audioCtx.state);
            }).catch(err => {
                // Silenziamo l'errore se è causato da mancanza di interazione (normale in background)
                if (err.name !== 'NotAllowedError') console.warn("AudioEngine: Resume posticipato (attesa tocco).");
            });
        }
    } catch(e) { console.error("AudioEngine: Errore critico ripristino:", e); }
};

window.startTone = function(freq) {
    window.resumeAudioContext();


    if (window.manualOscillator) return;

    const f = freq || window.currentTone || 600;
    const osc = window.audioCtx.createOscillator();
    const gain = window.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = f;

    gain.gain.setValueAtTime(0, window.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, window.audioCtx.currentTime + 0.005);

    osc.connect(gain);
    gain.connect(window.audioCtx.destination);

    osc.start();
    window.manualOscillator = osc;
    window.manualGain = gain;
};

window.stopTone = function() {
    if (!window.manualOscillator) return;

    const osc = window.manualOscillator;
    const gain = window.manualGain;

    const now = window.audioCtx.currentTime;
    if (gain) {
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.005);
    }

    setTimeout(() => {
        try {
            osc.stop();
            osc.disconnect();
        } catch(e) { console.error("Audio Engine Disconnect Error:", e); }
    }, 20);

    window.manualOscillator = null;
    window.manualGain = null;
};

window.stopAllMorseAudio = function() {
    window.morsePlayToken++;
    if (window.activeOscillators && window.activeOscillators.length > 0) {
        window.activeOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch(e) { console.error("Audio Engine Disconnect Error:", e); }
        });
        window.activeOscillators = [];
    }
    // Fermiamo anche il tono manuale se attivo durante stopAll
    window.stopTone();
};

window.startBluetoothKeepAlive = function() {
    window.resumeAudioContext();
    if (window.btKeepAliveOsc) return;

    try {
        const osc = window.audioCtx.createOscillator();
        const gain = window.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 30; // Frequenza infrasuono (non udibile)
        gain.gain.value = 0.0005; // Volume impercettibile ma sufficiente per il chip BT

        osc.connect(gain);
        gain.connect(window.audioCtx.destination);
        osc.start();

        window.btKeepAliveOsc = osc;
    } catch(e) { console.error("Audio Engine Disconnect Error:", e); }
};

window.playBeep = function(freq, duration) {
    window.resumeAudioContext();
    window.startBluetoothKeepAlive();

    try {
        const osc = window.audioCtx.createOscillator();
        const gain = window.audioCtx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(window.audioCtx.destination);
        const time = window.audioCtx.currentTime;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
        gain.gain.setValueAtTime(0.5, time + duration - 0.005);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.start(time);
        osc.stop(time + duration);
    } catch(e) { console.error("Audio Engine Disconnect Error:", e); }
};

window.playNotificationSound = function() {
    // DISATTIVIAMO LE NOTIFICHE SONORE DURANTE IL GIOCO
    if (gameRunning || isCourseMode) return;

    window.resumeAudioContext();
    window.playBeep(880, 0.08);
    setTimeout(() => window.playBeep(1100, 0.1), 120);
};

window.playMorseAudio = function(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        window.resumeAudioContext();
        window.startBluetoothKeepAlive();

        const isBrActive = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
        if (!forcePlay && !gameRunning && !isBrActive) { resolve(); return; }

        window.stopAllMorseAudio();
        const currentToken = window.morsePlayToken;

        let charUnit = 1.2 / wpm;
        let effSpaceWpm = (window.charSpaceWpm && window.charSpaceWpm < wpm) ? window.charSpaceWpm : wpm;
        let spaceUnit = 1.2 / effSpaceWpm;
        let wordMult = window.wordSpaceMult || 1.0;

        let time = window.audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !isBrActive)) break;

            if (window.morseDict[char]) {
                for (let i = 0; i < window.morseDict[char].length; i++) {
                    if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !isBrActive)) break;
                    let symbol = window.morseDict[char][i];

                    const osc = window.audioCtx.createOscillator();
                    const gain = window.audioCtx.createGain();
                    osc.frequency.value = currentTone;
                    osc.connect(gain);
                    gain.connect(window.audioCtx.destination);

                    const duration = (symbol === '-') ? (3 * charUnit) : charUnit;

                    gain.gain.setValueAtTime(0, time);
                    gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
                    gain.gain.setValueAtTime(0.5, time + duration - 0.005);
                    gain.gain.linearRampToValueAtTime(0, time + duration);

                    osc.start(time);
                    osc.stop(time + duration);
                    window.activeOscillators.push(osc);

                    time += duration;
                    if (i < window.morseDict[char].length - 1) time += charUnit;
                }
                time += (3 * spaceUnit);
            } else if (char === ' ') {
                let totalWordSpace = (7 * spaceUnit) * wordMult;
                let remainingSpace = totalWordSpace - (3 * spaceUnit);
                time += Math.max(0, remainingSpace);
            }
        }
        setTimeout(() => {
            if (currentToken === window.morsePlayToken) resolve();
        }, Math.max(0, (time - window.audioCtx.currentTime) * 1000));
    });
};
