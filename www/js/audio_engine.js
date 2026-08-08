// --- MORSE ENGINE CON ARRESTO ANTISOVRAPPOSIZIONE UNIFICATO ---
const morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    'Ã€': '.--.-', 'Ãˆ': '..-..', 'Ã‰': '..-..', 'ÃŒ': '.---.', 'Ã’': '---.', 'Ã™': '..--','?': '..--..'
};

window.activeOscillators = window.activeOscillators || [];
window.morsePlayToken = 0;

function stopAllMorseAudio() {
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
}
window.btKeepAliveOsc = null;

function startBluetoothKeepAlive() {
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
}
function playBeep(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startBluetoothKeepAlive(); // Mantiene le cuffie BT sveglie

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
}
function playNotificationSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playBeep(880, 0.08);
    setTimeout(() => playBeep(1100, 0.1), 120);
}

// DEFINIZIONE UNICA DI playMorseAudio
function playMorseAudio(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        startBluetoothKeepAlive();
        if (!forcePlay && !gameRunning && !brIsPlaying) { resolve(); return; }

        stopAllMorseAudio();
        const currentToken = window.morsePlayToken;

        let charUnit = 1.2 / wpm;
        let effSpaceWpm = (window.charSpaceWpm && window.charSpaceWpm < wpm) ? window.charSpaceWpm : wpm;
        let spaceUnit = 1.2 / effSpaceWpm;
        let wordMult = window.wordSpaceMult || 1.0;

        let time = audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !brIsPlaying)) break;

            if (morseDict[char]) {
                for (let i = 0; i < morseDict[char].length; i++) {
                    if (currentToken !== window.morsePlayToken || (!forcePlay && !gameRunning && !brIsPlaying)) break;
                    let symbol = morseDict[char][i];

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
                    if (i < morseDict[char].length - 1) time += charUnit;
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
}

