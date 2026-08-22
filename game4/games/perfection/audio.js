// game4/games/perfection/audio.js
const MORSE_DICT = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.','/': '-..-.',
    '=': '-...-', '.': '.-.-.-', ',': '--..--', '?': '..--..',
};
let audioCtx = null; let activeOscillators = []; let morsePlayToken = 0;
function resumeAudioContext() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); if (audioCtx.state === 'suspended') audioCtx.resume(); }
function stopAllMorseAudio() { morsePlayToken++; activeOscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch(e) {} }); activeOscillators = []; }
function playMorseAudio(text, wpm, tone = 600) {
    return new Promise(resolve => {
        resumeAudioContext(); stopAllMorseAudio(); const currentToken = morsePlayToken; let charUnit = 1.2 / wpm; let time = audioCtx.currentTime + 0.05;
        for (let char of text.toUpperCase()) {
            if (currentToken !== morsePlayToken) break;
            if (MORSE_DICT[char]) {
                for (let i = 0; i < MORSE_DICT[char].length; i++) {
                    if (currentToken !== morsePlayToken) break;
                    let symbol = MORSE_DICT[char][i];
                    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.frequency.value = tone; osc.connect(gain); gain.connect(audioCtx.destination);
                    const duration = (symbol === '-') ? (3 * charUnit) : charUnit;
                    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.5, time + 0.005); gain.gain.setValueAtTime(0.5, time + duration - 0.005); gain.gain.linearRampToValueAtTime(0, time + duration);
                    osc.start(time); osc.stop(time + duration); activeOscillators.push(osc); time += duration; if (i < MORSE_DICT[char].length - 1) time += charUnit;
                }
                time += (3 * charUnit);
            } else if (char === ' ') time += (7 * charUnit);
        }
        setTimeout(() => { if (currentToken === morsePlayToken) resolve(); }, Math.max(0, (time - audioCtx.currentTime) * 1000));
    });
}
window.GameAudio = { playMorseAudio, stopAllMorseAudio, resumeAudioContext };
