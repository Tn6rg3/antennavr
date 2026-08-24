// js/audio_analyzer.js - Motore di analisi professionale ispirato a ggmorse

window.audioAnalyzerState = {
    active: false,
    audioCtx: null,
    stream: null,
    analyser: null,

    // Configurazione DSP
    targetFreq: 600,
    squelch: 0.2, // Moltiplicatore sopra il noise floor
    sampleRate: 44100,

    // Stato decodifica
    isSignalOn: false,
    lastEventTime: performance.now(),
    pulses: [],
    decodedText: "",

    // Tracking WPM (Adaptive)
    wpm: 20,
    autoWpm: true,
    unitMs: 60,

    // Analisi Energia (Filtro Goertzel)
    noiseFloor: 0.001,
    signalEnergy: 0,

    // Performance
    dotAccs: [],
    dashAccs: [],
    spaceAccs: []
};

window.initAudioAnalyzer = function() {
    console.log("Goertzel Analyzer: Initializing UI...");

    const els = {
        micToggle: document.getElementById('realTxMicToggle'),
        freqIn: document.getElementById('realTxFreqInput'),
        squelchIn: document.getElementById('realTxSquelchInput'),
        wpmIn: document.getElementById('realTxWpmInput'),
        autoWpm: document.getElementById('realTxAutoWpmToggle'),
        resetBtn: document.getElementById('btnResetRealTx')
    };

    if (els.micToggle) els.micToggle.onchange = (e) => window.toggleRealTxMic(e.target.checked);
    if (els.freqIn) els.freqIn.onchange = (e) => { window.audioAnalyzerState.targetFreq = parseInt(e.target.value) || 600; };
    if (els.squelchIn) {
        els.squelchIn.oninput = (e) => {
            const val = parseInt(e.target.value);
            window.audioAnalyzerState.squelch = val / 100;
            document.getElementById('realTxSquelchVal').textContent = val + "%";
            document.getElementById('realTxSquelchMarker').style.left = val + "%";
        };
    }
    if (els.wpmIn) els.wpmIn.onchange = (e) => {
        window.audioAnalyzerState.wpm = parseInt(e.target.value) || 20;
        window.audioAnalyzerState.unitMs = 1200 / window.audioAnalyzerState.wpm;
    };
    if (els.resetBtn) {
        els.resetBtn.onclick = () => {
            window.audioAnalyzerState.decodedText = "";
            const textEl = document.getElementById('realTxDecodedText');
            if (textEl) textEl.textContent = "...";
            window.updateAnalyzerStats(true);
        };
    }
};

/**
 * IMPLEMENTAZIONE ALGORITMO DI GOERTZEL (Time Domain)
 * Rileva l'energia di una frequenza specifica in un blocco di campioni.
 */
function getGoertzelMagnitude(samples, targetFreq, sampleRate) {
    const k = Math.floor(0.5 + (samples.length * targetFreq) / sampleRate);
    const omega = (2.0 * Math.PI * k) / samples.length;
    const cosine = Math.cos(omega);
    const coeff = 2.0 * cosine;

    let q0 = 0, q1 = 0, q2 = 0;
    for (let i = 0; i < samples.length; i++) {
        q0 = coeff * q1 - q2 + samples[i];
        q2 = q1;
        q1 = q0;
    }
    return Math.sqrt(q1 * q1 + q2 * q2 - q1 * q2 * coeff) / (samples.length / 2);
}

window.toggleRealTxMic = async function(enabled) {
    if (enabled) {
        try {
            const constraints = {
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                video: false
            };
            window.audioAnalyzerState.stream = await navigator.mediaDevices.getUserMedia(constraints);
            window.startAudioAnalysis();
        } catch (err) {
            showToast("Accesso microfono negato.");
            document.getElementById('realTxMicToggle').checked = false;
        }
    } else {
        window.stopAudioAnalyzer();
    }
};

window.startAudioAnalysis = function() {
    if (!window.audioAnalyzerState.stream) return;

    window.audioAnalyzerState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window.audioAnalyzerState.audioCtx;
    window.audioAnalyzerState.sampleRate = ctx.sampleRate;

    const source = ctx.createMediaStreamSource(window.audioAnalyzerState.stream);
    window.audioAnalyzerState.analyser = ctx.createAnalyser();
    window.audioAnalyzerState.analyser.fftSize = 1024;

    source.connect(window.audioAnalyzerState.analyser);

    window.audioAnalyzerState.active = true;
    window.audioAnalyzerState.lastEventTime = performance.now();

    // Reset statistiche energia
    window.audioAnalyzerState.noiseFloor = 0.005;
    window.audioAnalyzerState.signalEnergy = 0;

    requestAnimationFrame(window.analysisLoop);
    showToast("🎤 Analizzatore ggMorse-Style Attivo");
};

window.analysisLoop = function() {
    const state = window.audioAnalyzerState;
    if (!state.active) return;

    const buffer = new Float32Array(state.analyser.fftSize);
    state.analyser.getFloatTimeDomainData(buffer);

    // 1. Calcola l'energia alla frequenza target usando Goertzel
    const currentMag = getGoertzelMagnitude(buffer, state.targetFreq, state.sampleRate);

    // 2. Calcola l'energia totale del blocco (per il noise floor)
    let totalEnergy = 0;
    for(let i=0; i<buffer.length; i++) totalEnergy += buffer[i]*buffer[i];
    totalEnergy = Math.sqrt(totalEnergy / buffer.length);

    // 3. Aggiornamento adattivo del Noise Floor (media mobile lenta)
    if (currentMag < state.noiseFloor * 1.5) {
        state.noiseFloor = (state.noiseFloor * 0.99) + (currentMag * 0.01);
    }

    // 4. Peak Meter UI (Logaritmico per visibilità)
    const peakBar = document.getElementById('realTxPeakBar');
    if (peakBar) {
        const displayVal = Math.min(100, Math.log10(currentMag / 0.0001) * 25);
        peakBar.style.width = Math.max(0, displayVal) + "%";
    }

    // 5. RILEVAMENTO IMPULSO (SNR Logic)
    // Il segnale è "ON" se la magnitudo supera il noise floor di una quota definita dallo squelch
    const dynamicThreshold = state.noiseFloor + (state.squelch * 0.1);
    const isCurrentlyOn = (currentMag > dynamicThreshold);

    const now = performance.now();
    if (isCurrentlyOn !== state.isSignalOn) {
        const duration = now - state.lastEventTime;

        if (duration > 20) { // De-bounce minimo
            window.handleMorseAudioPulse(state.isSignalOn ? 'ON' : 'OFF', duration);
            state.isSignalOn = isCurrentlyOn;
            state.lastEventTime = now;

            const led = document.getElementById('realTxStatusLed');
            if (led) led.style.background = isCurrentlyOn ? "var(--link-color)" : "#333";
        }
    }

    // 6. AUTO-CHIUSURA CARATTERE
    if (!state.isSignalOn && state.pulses.length > 0) {
        const quiet = now - state.lastEventTime;
        if (quiet > state.unitMs * 3.5) {
            window.finalizeMorseAudioCharacter();
        }
    }

    requestAnimationFrame(window.analysisLoop);
};

window.handleMorseAudioPulse = function(type, duration) {
    const state = window.audioAnalyzerState;
    if (type === 'ON') {
        state.pulses.push({ duration: duration });

        // ADAPTIVE WPM TRACKING
        if (state.autoWpm && duration < 400) {
            // Se la durata è vicina all'unità attuale, è un "punto", usiamolo per calibrare
            if (Math.abs(duration - state.unitMs) < state.unitMs * 0.6) {
                state.unitMs = (state.unitMs * 0.85) + (duration * 0.15);
                state.wpm = Math.round(1200 / state.unitMs);
                const wpmIn = document.getElementById('realTxWpmInput');
                if (wpmIn) wpmIn.value = state.wpm;
            }
        }
    } else {
        // Spazio tra parole
        if (duration > state.unitMs * 5.5) {
            if (state.decodedText.length > 0 && !state.decodedText.endsWith(" ")) {
                state.decodedText += " ";
                window.updateDecodedDisplay();
            }
        }
    }
};

window.finalizeMorseAudioCharacter = function() {
    const state = window.audioAnalyzerState;
    if (state.pulses.length === 0) return;

    let code = "";
    state.pulses.forEach(p => {
        const isDash = (p.duration > state.unitMs * 2.1);
        code += isDash ? "-" : ".";

        const ideal = isDash ? (state.unitMs * 3) : state.unitMs;
        const acc = Math.max(0, 100 - (Math.abs(p.duration - ideal) / ideal * 100));
        if (isDash) state.dashAccs.push(acc); else state.dotAccs.push(acc);
    });

    let foundChar = "?";
    for (let char in window.morseDict) {
        if (window.morseDict[char] === code) { foundChar = char; break; }
    }

    state.decodedText += foundChar;
    state.pulses = [];
    window.updateDecodedDisplay();
    window.updateAnalyzerStats();
};

window.updateDecodedDisplay = function() {
    const el = document.getElementById('realTxDecodedText');
    if (el) {
        el.textContent = window.audioAnalyzerState.decodedText;
        el.scrollTop = el.scrollHeight;
    }
};

window.updateAnalyzerStats = function(reset = false) {
    if (reset) {
        window.audioAnalyzerState.dotAccs = [];
        window.audioAnalyzerState.dashAccs = [];
    }
    const calcAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : "--";
    document.getElementById('realTxDotAcc').textContent = calcAvg(window.audioAnalyzerState.dotAccs) + (window.audioAnalyzerState.dotAccs.length ? "%" : "");
    document.getElementById('realTxDashAcc').textContent = calcAvg(window.audioAnalyzerState.dashAccs) + (window.audioAnalyzerState.dashAccs.length ? "%" : "");
};

window.stopAudioAnalyzer = function() {
    window.audioAnalyzerState.active = false;
    if (window.audioAnalyzerState.stream) {
        window.audioAnalyzerState.stream.getTracks().forEach(t => t.stop());
        window.audioAnalyzerState.stream = null;
    }
    if (window.audioAnalyzerState.audioCtx) {
        window.audioAnalyzerState.audioCtx.close();
        window.audioAnalyzerState.audioCtx = null;
    }
    document.getElementById('realTxMicToggle').checked = false;
    document.getElementById('realTxPeakBar').style.width = "0%";
};
