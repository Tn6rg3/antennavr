// ============================================================================
// AUDIO.JS - MOTORE WEB AUDIO API E CW
// ============================================================================

import { gameState, morseDict } from './state.js';

let audioCtx = null;
let activeOscillators = [];
let morsePlayToken = 0;

export function stopAllMorseAudio() {
    morsePlayToken++;
    if (activeOscillators && activeOscillators.length > 0) {
        activeOscillators.forEach(osc => {
            try { 
                osc.stop(); 
                osc.disconnect(); 
            } catch(e) {}
        });
        activeOscillators = [];
    }
}

export function playBeep(freq, duration) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

export function playNotificationSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playBeep(880, 0.08);
    setTimeout(() => playBeep(1100, 0.1), 120);
}

export function playMorseAudio(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (!forcePlay && !gameState.running && !gameState.brIsPlaying) { resolve(); return; }

        stopAllMorseAudio();
        const currentToken = morsePlayToken;

        let charUnit = 1.2 / wpm;
        let effSpaceWpm = (gameState.charSpaceWpm && gameState.charSpaceWpm < wpm) ? gameState.charSpaceWpm : wpm;
        let spaceUnit = 1.2 / effSpaceWpm;
        let wordMult = gameState.wordSpaceMult || 1.0;

        let time = audioCtx.currentTime + 0.05;

        for (let char of text) {
            if (currentToken !== morsePlayToken || (!forcePlay && !gameState.running && !gameState.brIsPlaying)) break;
            
            if (morseDict[char]) {
                for (let i = 0; i < morseDict[char].length; i++) {
                    if (currentToken !== morsePlayToken || (!forcePlay && !gameState.running && !gameState.brIsPlaying)) break;
                    let symbol = morseDict[char][i];
                    
                    const osc = audioCtx.createOscillator(); 
                    const gain = audioCtx.createGain();
                    osc.frequency.value = gameState.tone; 
                    osc.connect(gain); 
                    gain.connect(audioCtx.destination);
                    
                    const duration = (symbol === '-') ? (3 * charUnit) : charUnit;
                    
                    gain.gain.setValueAtTime(0, time); 
                    gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
                    gain.gain.setValueAtTime(0.5, time + duration - 0.005); 
                    gain.gain.linearRampToValueAtTime(0, time + duration);
                    
                    osc.start(time); 
                    osc.stop(time + duration);
                    activeOscillators.push(osc);
                    
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
            if (currentToken === morsePlayToken) resolve();
        }, Math.max(0, (time - audioCtx.currentTime) * 1000));
    });
}
