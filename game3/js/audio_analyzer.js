// js/audio_analyzer.js - Motore DSP professionale ispirato a ggmorse

window.audioAnalyzerState = {
    active: false,
    audioCtx: null,
    stream: null,
    analyser: null,

    // Parametri Ricevitore
    targetFreq: 600,
    sampleRate: 48000,

    // Inseguitore di Inviluppo (Envelope)
    envelope: 0,
    envSmooth: 0.15, // Smoothing per estrarre l'onda quadra

    // Soglia Adattiva (Moving Average)
    maxEnv: 0.01,
    minEnv: 0,
    threshold: 0.005,

    // Stato Bitstream
    isMark: false,
    lastTransitionTime: performance.now(),
    bitBuffer: [],

    // Decodifica
    pulses: [],
    decodedText: "",
    unitMs: 60, // 20 WPM di partenza
    wpm: 20,
    autoWpm: true,

    // Statistiche
    dotAccs: [],
    dashAccs: []
};

window.initAudioAnalyzer = function() {
    console.log("ggMorse-Engine: Initializing...");

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

    // Lo squelch in questa versione agisce come "Hysteresis" (margine di sicurezza sulla soglia)
    if (els.squelchIn) {
        els.squelchIn.oninput = (e) => {
            const val = parseInt(e.target.value);
            window.audioAnalyzerState.squelch = val / 100;
            document.getElementById('realTxSquelchVal').textContent = val + "%";
            document.getElementById('realTxSquelchMarker').style.left = val + "%";
        };
    }

    if (els.resetBtn) {
        els.resetBtn.onclick = () => {
            window.audioAnalyzerState.decodedText = "";
            document.getElementById('realTxDecodedText').textContent = "...";
            window.updateAnalyzerStats(true);
        };
    }
};

window.toggleRealTxMic = async function(enabled) {
    if (enabled) {
        try {
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000
                }
            };
            window.audioAnalyzerState.stream = await navigator.mediaDevices.getUserMedia(constraints);
            window.startProfessionalAnalysis();
        } catch (err) {
            showToast("Microfono non disponibile.");
            document.getElementById('realTxMicToggle').checked = false;
        }
    } else {
        window.stopAudioAnalyzer();
    }
};

/**
 * MOTORE DI ANALISI PROFESSIONALE
 * Utilizza una catena di filtraggio per estrarre l'inviluppo del segnale.
 */
window.startProfessionalAnalysis = function() {
    if (!window.audioAnalyzerState.stream) return;

    window.audioAnalyzerState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window.audioAnalyzerState.audioCtx;
    const state = window.audioAnalyzerState;
    state.sampleRate = ctx.sampleRate;

    const source = ctx.createMediaStreamSource(state.stream);

    // 1. FILTRO PASSA-BANDA STRETTISSIMO (Q=20)
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = state.targetFreq;
    bandpass.Q.value = 20;

    // 2. ANALIZZATORE PER ACCESSO AI DATI TEMPORALI
    state.analyser = ctx.createAnalyser();
    state.analyser.fftSize = 512; // Piccole finestre per massima reattività temporale

    source.connect(bandpass);
    bandpass.connect(state.analyser);

    state.active = true;
    state.lastTransitionTime = performance.now();
    state.maxEnv = 0.01;
    state.minEnv = 0;

    requestAnimationFrame(window.dspLoop);
    showToast("🎤 Motore ggMorse Attivato");
};

window.dspLoop = function() {
    const state = window.audioAnalyzerState;
    if (!state.active) return;

    const buffer = new Float32Array(state.analyser.fftSize);
    state.analyser.getFloatTimeDomainData(buffer);

    // 1. ESTRAZIONE INVILUPPO (Rectification + Smoothing)
    // Calcoliamo la magnitudo istantanea del segnale filtrato
    let instantMag = 0;
    for(let i=0; i<buffer.length; i++) {
        instantMag = Math.max(instantMag, Math.abs(buffer[i]));
    }

    // Leaky Integrator per pulire la forma d'onda (inviluppo)
    state.envelope = (state.envelope * (1 - state.envSmooth)) + (instantMag * state.envSmooth);

    // 2. ADAPTIVE THRESHOLDING (Logica ggmorse)
    // Tracciamo il picco massimo e minimo del segnale per adattarci al volume
    state.maxEnv = Math.max(state.maxEnv * 0.999, state.envelope);
    state.minEnv = (state.minEnv * 0.99) + (state.envelope * 0.01);

    // La soglia è il punto medio tra segnale e silenzio
    const range = state.maxEnv - state.minEnv;
    const targetThreshold = state.minEnv + (range * 0.5);
    state.threshold = (state.threshold * 0.95) + (targetThreshold * 0.05);

    // Peak Meter UI
    const peakBar = document.getElementById('realTxPeakBar');
    if (peakBar) {
        const norm = (state.envelope / (state.maxEnv || 0.01)) * 100;
        peakBar.style.width = norm + "%";
    }

    // 3. RILEVAMENTO TRANSIZIONI (Hysteresis)
    // Usiamo un piccolo margine (squelch) per evitare scatti continui
    const margin = range * (state.squelch || 0.1);
    const isNowOn = (state.envelope > (state.threshold + margin));

    if (isNowOn !== state.isMark) {
        const now = performance.now();
        const duration = now - state.lastTransitionTime;

        // Validazione impulso: ggmorse ignora impulsi < 15ms come rumore
        if (duration > 15) {
            window.processMorseTransition(state.isMark ? 'MARK' : 'SPACE', duration);
            state.isMark = isNowOn;
            state.lastTransitionTime = now;

            const led = document.getElementById('realTxStatusLed');
            if (led) led.style.background = isNowOn ? "var(--link-color)" : "#333";
        }
    }

    // 4. AUTO-CHIUSURA CARATTERE
    if (!state.isMark && state.pulses.length > 0) {
        const quiet = performance.now() - state.lastTransitionTime;
        if (quiet > state.unitMs * 3.5) {
            window.finalizeMorseCharacter();
        }
    }

    requestAnimationFrame(window.dspLoop);
};

window.processMorseTransition = function(type, duration) {
    const state = window.audioAnalyzerState;
    if (type === 'MARK') {
        // Abbiamo finito una nota (ON)
        state.pulses.push({ duration: duration });

        // AUTO-WPM TRACKING (ggmorse style)
        if (state.autoWpm && duration < 500) {
            // Se è un punto (segno più breve registrato)
            const isPoint = (duration < state.unitMs * 1.8);
            if (isPoint) {
                state.unitMs = (state.unitMs * 0.8) + (duration * 0.2);
                state.wpm = Math.round(1200 / state.unitMs);
                const wpmIn = document.getElementById('realTxWpmInput');
                if (wpmIn) wpmIn.value = state.wpm;
            }
        }
    } else {
        // Abbiamo finito un silenzio (OFF)
        // Se lo spazio è lungo, inseriamo lo spazio tra parole
        if (duration > state.unitMs * 5.0) {
            if (state.decodedText.length > 0 && !state.decodedText.endsWith(" ")) {
                state.decodedText += " ";
                window.updateDecodedDisplay();
            }
        }
    }
};

window.finalizeMorseCharacter = function() {
    const state = window.audioAnalyzerState;
    if (state.pulses.length === 0) return;

    let code = "";
    state.pulses.forEach(p => {
        const isDash = (p.duration > state.unitMs * 2.0);
        code += isDash ? "-" : ".";

        // Precisione
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
    document.getElementById('realTxDotAcc').textContent = calcAvg(window.audioAnalyzerState.dotAccs) + "%";
    document.getElementById('realTxDashAcc').textContent = calcAvg(window.audioAnalyzerState.dashAccs) + "%";
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
