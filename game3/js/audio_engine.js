// js/audio_engine.js

window.morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--','?': '..--..'
};

window.activeOscillators = [];
window.morsePlayToken = 0;
window.btKeepAliveOsc = null;

window.stopAllMorseAudio = function() {
    window.morsePlayToken++;
    if (window.activeOscillators && window.activeOscillators.length > 0) {
        window.activeOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch(e) {}
        });
        window.activeOscillators = [];
    }
};

window.startBluetoothKeepAlive = function() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (window.btKeepAliveOsc) return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 30; // Frequenza infrasuono (non udibile)
        gain.gain.value = 0.0005; // Volume impercettibile ma sufficiente per il chip BT

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();

        window.btKeepAliveOsc = osc;
    } catch(e) {}
};

window.playBeep = function(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    window.startBluetoothKeepAlive();

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const time = audioCtx.currentTime;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
        gain.gain.setValueAtTime(0.5, time + duration - 0.005);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.start(time);
        osc.stop(time + duration);
    } catch(e) {}
};

window.playNotificationSound = function() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    window.playBeep(880, 0.08);
    setTimeout(() => window.playBeep(1100, 0.1), 120);
};

window.playMorseAudio = function(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        window.startBluetoothKeepAlive();

        const isBrActive = (typeof brIsPlaying !== 'undefined' && brIsPlaying);
        if (!forcePlay && !gameRunning && !isBrActive) { resolve(); return; }

        window.stopAllMorseAudio();
        const currentToken = window.morsePlayToken;

        let charUnit = 1.2 / wpm;
        let effSpaceWpm = (window.charSpaceWpm && window.charSpaceWpm < wpm) ? window.charSpaceWpm : wpm;
        let spaceUnit = 1.2 / effSpaceWpm;
        let wordMult = window.wordSpaceMult || 1.0;

        let time = audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !isBrActive)) break;

            if (window.morseDict[char]) {
                for (let i = 0; i < window.morseDict[char].length; i++) {
                    if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !isBrActive)) break;
                    let symbol = window.morseDict[char][i];

                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.frequency.value = currentTone;
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

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
        }, Math.max(0, (time - audioCtx.currentTime) * 1000));
    });
};
