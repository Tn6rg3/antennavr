// game4/common/audio.js
// Gestione Audio Professionale CW con correzioni iOS e Bluetooth Keep-Alive

window.audioCtx = null;
window.activeOscillators = [];
window.manualOscillator = null;
window.manualGain = null;
window.morsePlayToken = 0;
window.btKeepAliveOsc = null;

window.resumeAudioContext = function() {
    try {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }
        if (window.audioCtx.state === 'suspended' || window.audioCtx.state === 'interrupted') {
            window.audioCtx.resume();
        }
    } catch(e) { console.error("AudioEngine Error:", e); }
};

window.stopAllMorseAudio = function() {
    window.morsePlayToken++;
    window.activeOscillators.forEach(osc => {
        try { osc.stop(); osc.disconnect(); } catch(e) {}
    });
    window.activeOscillators = [];
    window.stopTone();
};

window.startBluetoothKeepAlive = function() {
    window.resumeAudioContext();
    if (window.btKeepAliveOsc) return;
    try {
        const osc = window.audioCtx.createOscillator();
        const gain = window.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 30;
        gain.gain.value = 0.0005;
        osc.connect(gain);
        gain.connect(window.audioCtx.destination);
        osc.start();
        window.btKeepAliveOsc = osc;
    } catch(e) {}
};

window.startTone = function(freq) {
    window.resumeAudioContext();
    if (window.manualOscillator) return;
    const f = freq || 600;
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
        try { osc.stop(); osc.disconnect(); } catch(e) {}
    }, 20);
    window.manualOscillator = null;
    window.manualGain = null;
};

window.playMorseAudio = function(text, wpm, tone = 600) {
    return new Promise(resolve => {
        window.resumeAudioContext();
        window.startBluetoothKeepAlive();
        window.stopAllMorseAudio();
        const currentToken = window.morsePlayToken;

        let charUnit = 1.2 / wpm;
        let time = window.audioCtx.currentTime + 0.05;

        for (let char of text.toUpperCase()) {
            if (currentToken !== window.morsePlayToken) break;
            const code = window.MORSE_DICT[char];
            if (code) {
                for (let i = 0; i < code.length; i++) {
                    if (currentToken !== window.morsePlayToken) break;
                    let symbol = code[i];
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
                    if (i < code.length - 1) time += charUnit;
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
