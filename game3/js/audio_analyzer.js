// js/audio_analyzer.js - Motore Bitstream con Integratore e Protezione WPM

window.audioAnalyzerState = {
    active: false,
    audioCtx: null,
    stream: null,
    processor: null,

    targetFreq: 600,
    sampleRate: 48000,

    // Inseguitore Energia
    noiseFloor: 0.001,
    signalPeak: 0.01,
    threshold: 0.005,

    // INTEGRATORE DI BIT (Anti-flicker)
    bitHistory: 0,
    confirmedMark: false,

    // Stato decodificatore
    marksCount: 0,
    spacesCount: 0,
    currentCode: "",
    decodedText: "",

    // Tracking WPM
    wpm: 20,
    unitBits: 12, // 1 bit = 5ms -> 20WPM = 60ms = 12 bit
    autoWpm: true,

    // Statistiche
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
    if (els.wpmIn) {
        els.wpmIn.onchange = (e) => {
            const val = Math.max(5, Math.min(60, parseInt(e.target.value) || 20));
            window.audioAnalyzerState.wpm = val;
            window.audioAnalyzerState.unitBits = Math.round(1200 / val / 5);
        };
    }
    if (els.autoWpm) {
        window.audioAnalyzerState.autoWpm = els.autoWpm.checked;
        els.autoWpm.onchange = (e) => { window.audioAnalyzerState.autoWpm = e.target.checked; };
    }
    if (els.resetBtn) {
        els.resetBtn.onclick = () => {
            window.audioAnalyzerState.decodedText = "";
            window.audioAnalyzerState.currentCode = "";
            document.getElementById('realTxDecodedText').textContent = "...";
            window.updateAnalyzerStats(true);
        };
    }
};

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
            window.startStabilizedAnalysis();
        } catch (err) {
            showToast("Errore microfono.");
            document.getElementById('realTxMicToggle').checked = false;
        }
    } else {
        window.stopAudioAnalyzer();
    }
};

window.startStabilizedAnalysis = function() {
    if (!window.audioAnalyzerState.stream) return;
    window.audioAnalyzerState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window.audioAnalyzerState.audioCtx;
    const state = window.audioAnalyzerState;
    state.sampleRate = ctx.sampleRate;

    const source = ctx.createMediaStreamSource(state.stream);
    state.processor = ctx.createScriptProcessor(256, 1, 1);
    source.connect(state.processor);
    state.processor.connect(ctx.destination);

    state.active = true;
    state.noiseFloor = 0.001;
    state.signalPeak = 0.01;

    state.processor.onaudioprocess = (e) => {
        if (!state.active) return;
        if (ctx.state === 'suspended') ctx.resume();

        const samples = e.inputBuffer.getChannelData(0);
        const mag = getMagnitude(samples, state.targetFreq, state.sampleRate);

        // 1. Adaptive Squelch
        if (mag < state.noiseFloor * 2) state.noiseFloor = (state.noiseFloor * 0.98) + (mag * 0.02);
        state.signalPeak = Math.max(state.signalPeak * 0.995, mag);
        const range = state.signalPeak - state.noiseFloor;
        state.threshold = state.noiseFloor + (range * (0.35 + (state.squelch || 0.2) * 0.4));

        // 2. Integratore di Bit (Filtro passa-basso logico)
        // Se mag > soglia, incrementiamo bitHistory, altrimenti caliamo.
        // Questo impedisce a singoli campioni sporchi di cambiare lo stato MARK/SPACE.
        const rawBit = (mag > state.threshold) ? 1 : 0;
        if (rawBit === 1) state.bitHistory = Math.min(3, state.bitHistory + 1);
        else state.bitHistory = Math.max(-3, state.bitHistory - 1);

        const confirmedMark = (state.bitHistory >= 1);
        window.processStabilizedBit(confirmedMark);

        // UI Peak Meter
        const peakBar = document.getElementById('realTxPeakBar');
        if (peakBar) peakBar.style.width = Math.min(100, (mag / (state.signalPeak || 0.01)) * 100) + "%";
    };

    showToast("🎤 Analizzatore Stabilizzato Attivo");
};

window.processStabilizedBit = function(isMark) {
    const state = window.audioAnalyzerState;
    const currentUnitBits = Math.max(4, Math.round(1200 / state.wpm / 5));

    if (isMark) {
        state.marksCount++;
        // Se torniamo in MARK dopo un silenzio, chiudiamo il carattere precedente se necessario
        if (state.spacesCount > currentUnitBits * 2.0 && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
        state.spacesCount = 0;
    } else {
        state.spacesCount++;
        if (state.marksCount > 0) {
            window.handleTransition(state.marksCount);
            state.marksCount = 0;
        }

        // Timeout Carattere (Auto-decode)
        if (state.spacesCount > currentUnitBits * 3.0 && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
        // Timeout Parola (Aggiunge spazio)
        if (state.spacesCount === Math.round(currentUnitBits * 7)) {
            if (state.decodedText.length > 0 && !state.decodedText.endsWith(" ")) {
                state.decodedText += " ";
                window.updateDecodedDisplay();
            }
        }
    }

    const led = document.getElementById('realTxStatusLed');
    if (led) led.style.background = isMark ? "var(--link-color)" : "#333";
};

window.handleTransition = function(markCount) {
    const state = window.audioAnalyzerState;
    const currentUnitBits = Math.max(4, Math.round(1200 / state.wpm / 5));

    // Validazione Segnale (Gglitch Filter)
    if (markCount < 2) return;

    const isDash = (markCount > currentUnitBits * 1.8);
    state.currentCode += isDash ? "-" : ".";

    // Calcolo Precisione
    const ideal = isDash ? (currentUnitBits * 3) : currentUnitBits;
    const acc = Math.max(0, 100 - (Math.abs(markCount - ideal) / ideal * 100));
    if (isDash) state.dashAccs.push(acc); else state.dotAccs.push(acc);

    // ADAPTIVE WPM TRACKING (Con limiti di sicurezza)
    if (state.autoWpm && !isDash && markCount > 2) {
        // Aggiorniamo la stima dell'unità base solo se il segnale è plausibile
        let newUnitBits = (currentUnitBits * 0.9) + (markCount * 0.1);
        let newWpm = Math.round(1200 / (newUnitBits * 5));

        // LIMITI RIGIDI: 10 - 50 WPM
        newWpm = Math.max(10, Math.min(50, newWpm));

        if (Math.abs(newWpm - state.wpm) >= 1) {
            state.wpm = newWpm;
            const wpmIn = document.getElementById('realTxWpmInput');
            if (wpmIn) wpmIn.value = state.wpm;
        }
    }
    window.updateAnalyzerStats();
};

window.decodeCurrentCode = function() {
    const state = window.audioAnalyzerState;
    if (!state.currentCode) return;
    let foundChar = "";
    for (let char in window.morseDict) {
        if (window.morseDict[char] === state.currentCode) { foundChar = char; break; }
    }
    if (foundChar) state.decodedText += foundChar;
    else state.decodedText += "?";

    state.currentCode = "";
    window.updateDecodedDisplay();
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
    if (reset) { state.dotAccs = []; state.dashAccs = []; }
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
