// ============================================================================
// AUDIO.JS - MOTORE MORSE E INTERRUZIONE SUONI
// ============================================================================

import { gameState, chatState } from './state.js';

let audioCtx = null;
let activeOscillators = [];
let morsePlayToken = 0;

export function stopAllMorseAudio() {
    morsePlayToken++;
    if (activeOscillators.length > 0) {
        activeOscillators.forEach(osc => {
            try { 
                osc.stop(); 
                osc.disconnect(); 
            } catch(e) {}
        });
        activeOscillators = [];
    }
}

export function playMorseAudio(text, wpm, forcePlay = false) {
    return new Promise(resolve => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Legge lo stato direttamente da gameState!
        if (!forcePlay && !gameState.running) { 
            resolve(); 
            return; 
        }

        stopAllMorseAudio();
        const currentToken = morsePlayToken;
        
        // ... (logica di generazione frequenza morse usando gameState.tone o wpm)
        
        setTimeout(() => {
            if (currentToken === morsePlayToken) resolve();
        }, 100);
    });
}
