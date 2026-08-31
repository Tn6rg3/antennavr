// js/audio_engine.js

window.morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    '=': '-...-',
    '.': '.-.-.-', ',': '--..--', '?': '..--..',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--'
};

window.activeOscillators = [];
window.preOscLocal = null;
window.preGainLocal = null;
window.preOscRemote = null;
window.preGainRemote = null;

window.morsePlayToken = 0;
window.btKeepAliveOsc = null;

window.resumeAudioContext = function() {
    try {
        if (!window.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            window.audioCtx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 });
        }
        if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
    } catch(e) {}
};

function initPersistentOscillators() {
    window.resumeAudioContext();
    if (!window.audioCtx) return;
    if (!window.preOscLocal) {
        window.preOscLocal = window.audioCtx.createOscillator();
        window.preGainLocal = window.audioCtx.createGain();
        window.preOscLocal.connect(window.preGainLocal).connect(window.audioCtx.destination);
        window.preGainLocal.gain.value = 0;
        window.preOscLocal.start();
    }
    if (!window.preOscRemote) {
        window.preOscRemote = window.audioCtx.createOscillator();
        window.preGainRemote = window.audioCtx.createGain();
        window.preOscRemote.connect(window.preGainRemote).connect(window.audioCtx.destination);
        window.preGainRemote.gain.value = 0;
        window.preOscRemote.start();
    }
}

// --- CANALE LOCALE (TRASMISSIONE MANUALE) ---
window.startTone = function(freq) {
    initPersistentOscillators();
    if (!window.preGainLocal) return;

    const f = freq || window.currentTone || 600;
    const now = window.audioCtx.currentTime;

    window.preOscLocal.frequency.setTargetAtTime(f, now, 0.001);
    window.preGainLocal.gain.cancelScheduledValues(now);
    window.preGainLocal.gain.setValueAtTime(window.preGainLocal.gain.value, now);
    // Rampa lineare 10ms per attacco pulito
    window.preGainLocal.gain.linearRampToValueAtTime(0.5, now + 0.010);

    if (window.currentMode === 'qso' && typeof window.sendQsoEvent === 'function') {
        window.sendQsoEvent('DN', f);
    }
};

window.stopTone = function() {
    if (!window.preGainLocal) return;
    const now = window.audioCtx.currentTime;
    window.preGainLocal.gain.cancelScheduledValues(now);
    window.preGainLocal.gain.setValueAtTime(window.preGainLocal.gain.value, now);
    window.preGainLocal.gain.linearRampToValueAtTime(0, now + 0.010);

    if (window.currentMode === 'qso' && typeof window.sendQsoEvent === 'function') {
        window.sendQsoEvent('UP', 0);
    }
};

// --- CANALE REMOTO (RICEZIONE P2P - SCHEDULATA) ---
window.startRemoteTone = function(freq, delaySec = 0) {
    initPersistentOscillators();
    if (!window.preGainRemote) return;

    const f = freq || window.currentTone || 600;
    // La riproduzione avviene al tempo esatto del WebAudio Clock + il ritardo del buffer
    const startTime = window.audioCtx.currentTime + delaySec;

    window.preOscRemote.frequency.setValueAtTime(f, startTime);
    window.preGainRemote.gain.cancelScheduledValues(startTime);
    window.preGainRemote.gain.setValueAtTime(window.preGainRemote.gain.value, startTime);
    window.preGainRemote.gain.linearRampToValueAtTime(0.5, startTime + 0.010);

    // Indicatore visivo (approssimato a causa del buffer)
    setTimeout(() => {
        const indicator = document.getElementById('qsoRxIndicator');
        if (indicator) indicator.style.backgroundColor = "var(--champ-color)";
    }, delaySec * 1000);
};

window.stopRemoteTone = function(delaySec = 0) {
    if (!window.preGainRemote) return;
    const stopTime = window.audioCtx.currentTime + delaySec;

    window.preGainRemote.gain.cancelScheduledValues(stopTime);
    window.preGainRemote.gain.setValueAtTime(window.preGainRemote.gain.value, stopTime);
    window.preGainRemote.gain.linearRampToValueAtTime(0, stopTime + 0.010);

    setTimeout(() => {
        const indicator = document.getElementById('qsoRxIndicator');
        if (indicator) indicator.style.backgroundColor = "#333";
    }, delaySec * 1000);
};

window.stopAllMorseAudio = function() {
    window.morsePlayToken++;
    if (window.activeOscillators) {
        window.activeOscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch(e) {} });
        window.activeOscillators = [];
    }
    if (window.preGainLocal) window.preGainLocal.gain.setTargetAtTime(0, window.audioCtx.currentTime, 0.005);
    if (window.preGainRemote) window.preGainRemote.gain.setTargetAtTime(0, window.audioCtx.currentTime, 0.005);
};

window.startBluetoothKeepAlive = function() {
    window.resumeAudioContext();
    if (window.btKeepAliveOsc) return;
    try {
        const osc = window.audioCtx.createOscillator();
        const gain = window.audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = 30; gain.gain.value = 0.0005;
        osc.connect(gain).connect(window.audioCtx.destination);
        osc.start(); window.btKeepAliveOsc = osc;
    } catch(e) {}
};

window.playBeep = function(freq, duration) {
    window.resumeAudioContext();
    try {
        const osc = window.audioCtx.createOscillator();
        const gain = window.audioCtx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain).connect(window.audioCtx.destination);
        const time = window.audioCtx.currentTime;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.3, time + 0.005);
        gain.gain.setValueAtTime(0.3, time + duration - 0.005);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.start(time);
        osc.stop(time + duration + 0.1);
    } catch(e) {}
};

window.playNotificationSound = function() {
    if (typeof gameRunning !== 'undefined' && gameRunning) return;
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
                    osc.frequency.value = window.currentTone || 600;
                    osc.connect(gain).connect(window.audioCtx.destination);
                    const duration = (symbol === '-') ? (3 * charUnit) : charUnit;
                    gain.gain.setValueAtTime(0, time);
                    gain.gain.linearRampToValueAtTime(0.5, time + 0.010);
                    gain.gain.setValueAtTime(0.5, time + duration - 0.010);
                    gain.gain.linearRampToValueAtTime(0, time + duration);
                    osc.start(time);
                    osc.stop(time + duration + 0.05);
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
        setTimeout(() => { if (currentToken === window.morsePlayToken) resolve(); }, Math.max(0, (time - window.audioCtx.currentTime) * 1000));
    });
};
