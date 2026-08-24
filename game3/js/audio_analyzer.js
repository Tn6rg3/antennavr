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

    // Campioniamo ogni 10ms per generare il bitstream
    const bufferSize = Math.pow(2, Math.floor(Math.log2(state.sampleRate * 0.02))); // ~20ms buffer
    state.processor = ctx.createScriptProcessor(1024, 1, 1);

    source.connect(state.processor);
    state.processor.connect(ctx.destination);

    state.active = true;
    state.lastEventTime = performance.now();
    state.noiseFloor = 0.001;
    state.signalPeak = 0.01;

    state.processor.onaudioprocess = (e) => {
        if (!state.active) return;
        const samples = e.inputBuffer.getChannelData(0);

        // 1. Calcolo magnitudo Goertzel
        const mag = getMagnitude(samples, state.targetFreq, state.sampleRate);
        state.magnitude = mag;

        // 2. Adaptive Thresholding (Logica ggmorse)
        if (mag < state.noiseFloor * 2) {
            state.noiseFloor = (state.noiseFloor * 0.99) + (mag * 0.01);
        }
        state.signalPeak = Math.max(state.signalPeak * 0.995, mag);

        const range = state.signalPeak - state.noiseFloor;
        // La soglia dinamica tiene conto dello squelch utente come offset
        state.threshold = state.noiseFloor + (range * (0.3 + (state.squelch || 0.2) * 0.4));

        // UI Peak Meter
        const peakBar = document.getElementById('realTxPeakBar');
        if (peakBar) {
            const norm = Math.min(100, (mag / (state.signalPeak || 0.01)) * 100);
            peakBar.style.width = norm + "%";
        }

        // 3. Generazione Bitstream (1 = Segnale, 0 = Silenzio)
        const bit = (mag > state.threshold) ? 1 : 0;
        window.processBit(bit);
    };

    showToast("🎤 Motore ggMorse Bitstream Attivo");
};

window.processBit = function(bit) {
    const state = window.audioAnalyzerState;

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

        // Se siamo in silenzio da troppo tempo, chiudiamo il carattere
        if (state.spacesCount > state.unitBits * 4 && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
        // Se siamo in silenzio da moltissimo, aggiungiamo spazio parola
        if (state.spacesCount === Math.round(state.unitBits * 7)) {
            if (state.decodedText.length > 0 && !state.decodedText.endsWith(" ")) {
                state.decodedText += " ";
                window.updateDecodedDisplay();
            }
        }
    }

    // Feedback visivo LED
    const led = document.getElementById('realTxStatusLed');
    if (led) led.style.background = (bit === 1) ? "var(--link-color)" : "#333";
};

window.handleTransition = function(type, count) {
    const state = window.audioAnalyzerState;

    // Filtro Glitch (ggmorse ignora impulsi troppo brevi rispetto ai WPM attuali)
    if (count < 2) return;

    if (type === 'MARK') {
        // È finita una nota. Determiniamo se è Punto o Linea.
        const isDash = (count > state.unitBits * 1.8);
        state.currentCode += isDash ? "-" : ".";

        // Calcolo precisione tecnica
        const ideal = isDash ? (state.unitBits * 3) : state.unitBits;
        const acc = Math.max(0, 100 - (Math.abs(count - ideal) / ideal * 100));
        if (isDash) state.dashAccs.push(acc); else state.dotAccs.push(acc);

        // Adaptive WPM Tracking
        if (state.autoWpm && !isDash) {
            state.unitBits = (state.unitBits * 0.8) + (count * 0.2);
            state.wpm = Math.round(1200 / (state.unitBits * 10));
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
