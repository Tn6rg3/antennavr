// game4/course/audio.js

let audioCtx = null;
let oscillator = null;
let gainNode = null;

window.initAudio = function() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    }
};

window.startTone = function(frequency = 600) {
    window.initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (oscillator) {
        oscillator.stop();
        oscillator.disconnect();
    }

    oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.connect(gainNode);
    oscillator.start();

    gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    gainNode.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.005);
};

window.stopTone = function() {
    if (gainNode) {
        gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.005);
    }
    setTimeout(() => {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
    }, 50);
};

const morseDict = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....',
    'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.',
    'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
    '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----', '.': '.-.-.-', ',': '--..--',
    '?': '..--..', '/': '-..-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '(': '-.--.', ')': '-.--.-'
};
window.morseDict = morseDict;

window.playMorseAudio = function(text, wpm = 20, isFarnsworth = false) {
    window.initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const unit = 1200 / wpm;
    const charSpaceWpm = window.charSpaceWpm || wpm;
    const charUnit = 1200 / charSpaceWpm;
    const wordSpaceMult = window.wordSpaceMult || 7 / 3; // Standard is 7 units, char space is 3 units

    let currentTime = audioCtx.currentTime + 0.1;

    text.toUpperCase().split('').forEach(char => {
        if (char === ' ') {
            currentTime += charUnit * 7 * wordSpaceMult;
            return;
        }
        const code = morseDict[char];
        if (code) {
            code.split('').forEach(symbol => {
                const duration = (symbol === '-') ? (unit * 3) : unit;

                const osc = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(window.keyerState?.tone || 600, currentTime);

                g.gain.setValueAtTime(0, currentTime);
                g.gain.linearRampToValueAtTime(0.1, currentTime + 0.005);
                g.gain.setValueAtTime(0.1, currentTime + (duration / 1000) - 0.005);
                g.gain.linearRampToValueAtTime(0, currentTime + (duration / 1000));

                osc.connect(g);
                g.connect(audioCtx.destination);

                osc.start(currentTime);
                osc.stop(currentTime + (duration / 1000));

                currentTime += (duration / 1000) + (unit / 1000);
            });
            currentTime += (charUnit * 3 / 1000) - (unit / 1000);
        }
    });
};

window.stopAllMorseAudio = function() {
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
        window.initAudio();
    }
};
