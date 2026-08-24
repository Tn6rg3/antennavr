// js/audio_analyzer.js - Porting della logica a bit-stream di ggmorse

window.audioAnalyzerState = {
    active: false,
    audioCtx: null,
    stream: null,
    processor: null,

    // Parametri DSP
    targetFreq: 600,
    sampleRate: 48000,
    bitRate: 100, // Frequenza di campionamento logico (100 Hz = 10ms per bit)

    // Inseguitore di inviluppo e soglia
    magnitude: 0,
    noiseFloor: 0.001,
    signalPeak: 0.01,
    threshold: 0.005,

    // Stato decodificatore
    isMark: false,
    bitBuffer: [], // Flusso di 0 e 1
    marksCount: 0,
    spacesCount: 0,

    // Tracking WPM
    wpm: 20,
    unitBits: 6, // Un punto a 20 WPM dura circa 60ms (6 bit a 100Hz)
    autoWpm: true,

    // Testo e Statistiche
    currentCode: "",
    decodedText: "",
    dotAccs: [],
    dashAccs: []
};

window.initAudioAnalyzer = function() {
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
        window.audioAnalyzerState.unitBits = Math.round(1200 / window.audioAnalyzerState.wpm / 10);
    };
    if (els.resetBtn) {
        els.resetBtn.onclick = () => {
            window.audioAnalyzerState.decodedText = "";
            document.getElementById('realTxDecodedText').textContent = "...";
            window.updateAnalyzerStats(true);
        };
    }
};

/**
 * Funzione Goertzel ottimizzata (porting logico)
 */
function getMagnitude(samples, targetFreq, sampleRate) {
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
            window.audioAnalyzerState.stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                video: false
            });
            window.startBitstreamAnalysis();
        } catch (err) {
            showToast("Errore microfono.");
            document.getElementById('realTxMicToggle').checked = false;
        }
    } else {
        window.stopAudioAnalyzer();
    }
};

window.startBitstreamAnalysis = function() {
    if (!window.audioAnalyzerState.stream) return;

    window.audioAnalyzerState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window.audioAnalyzerState.audioCtx;
    const state = window.audioAnalyzerState;
    state.sampleRate = ctx.sampleRate;

    const source = ctx.createMediaStreamSource(state.stream);

    // BUFFER RIDOTTO A 256 PER MASSIMA REATTIVITÀ (ggmorse style)
    // Analizziamo il segnale ogni ~5.3ms (@48kHz)
    state.processor = ctx.createScriptProcessor(256, 1, 1);

    source.connect(state.processor);
    state.processor.connect(ctx.destination);

    state.active = true;
    state.lastEventTime = performance.now();
    state.noiseFloor = 0.001;
    state.signalPeak = 0.01;

    state.processor.onaudioprocess = (e) => {
        if (!state.active) return;

        // Forza il microfono a restare sveglio
        if (ctx.state === 'suspended') ctx.resume();

        const samples = e.inputBuffer.getChannelData(0);

        // 1. Calcolo magnitudo Goertzel ad alta risoluzione
        const mag = getMagnitude(samples, state.targetFreq, state.sampleRate);
        state.magnitude = mag;

        // 2. Adaptive Thresholding (SNR dinamicissimo)
        // Il noiseFloor segue il silenzio, il signalPeak segue la nota
        if (mag < state.noiseFloor * 1.8) {
            state.noiseFloor = (state.noiseFloor * 0.95) + (mag * 0.05);
        }
        state.signalPeak = Math.max(state.signalPeak * 0.99, mag);

        const range = state.signalPeak - state.noiseFloor;
        // Soglia intelligente: metà strada tra rumore e picco, corretta dallo squelch
        const dynamicThreshold = state.noiseFloor + (range * (0.4 + (state.squelch || 0.2) * 0.4));
        state.threshold = dynamicThreshold;

        // UI Peak Meter (Logaritmico per una risposta naturale dell'occhio)
        const peakBar = document.getElementById('realTxPeakBar');
        if (peakBar) {
            const dbPos = 20 * Math.log10(mag / (state.signalPeak || 0.01));
            const norm = Math.max(0, 100 + dbPos);
            peakBar.style.width = norm + "%";
        }

        // 3. Generazione Bitstream (1 bit ogni 5ms)
        const bit = (mag > state.threshold) ? 1 : 0;
        window.processBit(bit);
    };

    showToast("🎤 Analizzatore ad Alta Risoluzione Attivo");
};

window.processBit = function(bit) {
    const state = window.audioAnalyzerState;

    // In questa modalità 1 bit = ~5ms
    if (bit === 1) {
        state.marksCount++;
        if (state.spacesCount > 0) {
            window.handleTransition('SPACE', state.spacesCount);
            state.spacesCount = 0;
        }
    } else {
        state.spacesCount++;
        if (state.marksCount > 0) {
            window.handleTransition('MARK', state.marksCount);
            state.marksCount = 0;
        }

        // UnitBits a 20 WPM con campionamento 5ms è circa 12 (60ms / 5ms)
        const currentUnitBits = Math.round(1200 / state.wpm / 5);

        // Chiusura carattere se silenzio > 3 unità
        if (state.spacesCount > currentUnitBits * 3 && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
        // Spazio parola se silenzio > 6 unità
        if (state.spacesCount === Math.round(currentUnitBits * 6.5)) {
            if (state.decodedText.length > 0 && !state.decodedText.endsWith(" ")) {
                state.decodedText += " ";
                window.updateDecodedDisplay();
            }
        }
    }

    // LED reattivo al singolo bit
    const led = document.getElementById('realTxStatusLed');
    if (led) led.style.background = (bit === 1) ? "var(--link-color)" : "#333";
    if (led) led.style.boxShadow = (bit === 1) ? "0 0 10px var(--link-color)" : "none";
};

window.handleTransition = function(type, count) {
    const state = window.audioAnalyzerState;

    // Filtro Glitch: ignora segnali < 15ms (circa 3 bit)
    if (count < 3) return;

    const currentUnitBits = Math.round(1200 / state.wpm / 5);

    if (type === 'MARK') {
        const isDash = (count > currentUnitBits * 1.8);
        state.currentCode += isDash ? "-" : ".";

        const ideal = isDash ? (currentUnitBits * 3) : currentUnitBits;
        const acc = Math.max(0, 100 - (Math.abs(count - ideal) / ideal * 100));
        if (isDash) state.dashAccs.push(acc); else state.dotAccs.push(acc);

        // Adaptive WPM Tracking (basato sui punti)
        if (state.autoWpm && !isDash && count < currentUnitBits * 1.5) {
            const newUnitBits = (currentUnitBits * 0.8) + (count * 0.2);
            state.wpm = Math.round(1200 / (newUnitBits * 5));
            const wpmIn = document.getElementById('realTxWpmInput');
            if (wpmIn) wpmIn.value = state.wpm;
        }
    }

    window.updateAnalyzerStats();
};

window.decodeCurrentCode = function() {
    const state = window.audioAnalyzerState;
    let foundChar = "";
    for (let char in window.morseDict) {
        if (window.morseDict[char] === state.currentCode) {
            foundChar = char;
            break;
        }
    }
    if (foundChar) {
        state.decodedText += foundChar;
        window.updateDecodedDisplay();
    }
    state.currentCode = "";
};

window.updateDecodedDisplay = function() {
    const el = document.getElementById('realTxDecodedText');
    if (el) {
        el.textContent = window.audioAnalyzerState.decodedText || "...";
        el.scrollTop = el.scrollHeight;
    }
};

window.updateAnalyzerStats = function(reset = false) {
    const state = window.audioAnalyzerState;
    if (reset) {
        state.dotAccs = [];
        state.dashAccs = [];
    }
    const calcAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : "--";
    document.getElementById('realTxDotAcc').textContent = calcAvg(state.dotAccs) + "%";
    document.getElementById('realTxDashAcc').textContent = calcAvg(state.dashAccs) + "%";
};

window.stopAudioAnalyzer = function() {
    window.audioAnalyzerState.active = false;
    if (window.audioAnalyzerState.processor) window.audioAnalyzerState.processor.disconnect();
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
