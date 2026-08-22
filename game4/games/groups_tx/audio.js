// game4/games/groups_tx/audio.js
let audioCtx = null;
let currentOsc = null;
let currentGain = null;

function resumeAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startTone(freq = 600) {
    resumeAudioContext();
    stopTone();
    currentOsc = audioCtx.createOscillator();
    currentGain = audioCtx.createGain();
    currentOsc.frequency.value = freq;
    currentOsc.connect(currentGain);
    currentGain.connect(audioCtx.destination);
    currentGain.gain.setValueAtTime(0, audioCtx.currentTime);
    currentGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.005);
    currentOsc.start();
}

function stopTone() {
    if (currentOsc) {
        currentGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.005);
        currentOsc.stop(audioCtx.currentTime + 0.01);
        currentOsc = null;
    }
}

window.GameAudio = { startTone, stopTone, resumeAudioContext };
