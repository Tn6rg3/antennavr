// game4/games/tournament/audio.js
let audioCtx = null;
function playBeep(freq = 440, duration = 0.2) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}
window.GameAudio = { playBeep };
