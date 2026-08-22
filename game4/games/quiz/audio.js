// game4/games/quiz/audio.js

window.morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    '=': '-...-',
    '.': '.-.-.-', ',': '--..--', '?': '..--..',
    'À': '.--.-', 'È': '..-..', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..--'
};

window.activeOscillators = [];
window.morsePlayToken = 0;

window.resumeAudioContext = function() {
    try {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }
        if (window.audioCtx.state === 'suspended' || window.audioCtx.state === 'interrupted') {
            window.audioCtx.resume();
        }
    } catch(e) { console.error("AudioEngine: Error resuming:", e); }
};

window.stopAllMorseAudio = function() {
    window.morsePlayToken++;
    if (window.activeOscillators && window.activeOscillators.length > 0) {
        window.activeOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch(e) { }
        });
        window.activeOscillators = [];
    }
};

window.playBeep = function(freq, duration) {
    window.resumeAudioContext();
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
    } catch(e) { }
};

window.playMorseAudio = function(text, wpm, tone = 600) {
    return new Promise(resolve => {
        window.resumeAudioContext();
        window.stopAllMorseAudio();
        const currentToken = window.morsePlayToken;

        let charUnit = 1.2 / wpm;
        let time = window.audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (currentToken !== window.morsePlayToken) break;

            if (window.morseDict[char]) {
                for (let i = 0; i < window.morseDict[char].length; i++) {
                    if (currentToken !== window.morsePlayToken) break;
                    let symbol = window.morseDict[char][i];

                    const osc = window.audioCtx.createOscillator();
                    const gain = window.audioCtx.createGain();
                    osc.frequency.value = tone;
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
                time += (3 * charUnit);
            } else if (char === ' ') {
                time += (7 * charUnit);
            }
        }
        setTimeout(() => {
            if (currentToken === window.morsePlayToken) resolve();
        }, Math.max(0, (time - window.audioCtx.currentTime) * 1000));
    });
};
