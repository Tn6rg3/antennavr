// js/audio_analyzer.js

window.audioAnalyzerState = {
    active: false,
    audioCtx: null,
    stream: null,
    source: null,
    filter: null,
    analyser: null,
    dataArray: null,
    animationId: null,

    // Configurazione
    targetFreq: 600,
    squelch: 0.2, // 0.0 to 1.0
    qFactor: 5,

    // Stato decodifica
    isSignalOn: false,
    lastEventTime: 0,
    pulses: [],
    decodedText: "",

    // Statistiche WPM
    wpm: 20,
    autoWpm: true,
    dotHistory: [],

    // Performance
    dotAccs: [],
    dashAccs: [],
    spaceAccs: []
};

window.initAudioAnalyzer = function() {
    console.log("AudioAnalyzer: Initializing UI listeners...");

    const els = {
        micToggle: document.getElementById('realTxMicToggle'),
        freqIn: document.getElementById('realTxFreqInput'),
        squelchIn: document.getElementById('realTxSquelchInput'),
        qSelect: document.getElementById('realTxBandwidthSelect'),
        wpmIn: document.getElementById('realTxWpmInput'),
        autoWpm: document.getElementById('realTxAutoWpmToggle'),
        resetBtn: document.getElementById('btnResetRealTx')
    };

    if (els.micToggle) els.micToggle.onchange = (e) => window.toggleRealTxMic(e.target.checked);

    if (els.freqIn) {
        els.freqIn.onchange = (e) => {
            window.audioAnalyzerState.targetFreq = parseInt(e.target.value) || 600;
            if (window.audioAnalyzerState.filter) {
                window.audioAnalyzerState.filter.frequency.setTargetAtTime(window.audioAnalyzerState.targetFreq, window.audioAnalyzerState.audioCtx.currentTime, 0.1);
            }
        };
    }

    if (els.squelchIn) {
        els.squelchIn.oninput = (e) => {
            const val = parseInt(e.target.value);
            window.audioAnalyzerState.squelch = val / 100;
            document.getElementById('realTxSquelchVal').textContent = val + "%";
            document.getElementById('realTxSquelchMarker').style.left = val + "%";
        };
    }

    if (els.qSelect) {
        els.qSelect.onchange = (e) => {
            window.audioAnalyzerState.qFactor = parseFloat(e.target.value) || 5;
            if (window.audioAnalyzerState.filter) {
                window.audioAnalyzerState.filter.Q.setTargetAtTime(window.audioAnalyzerState.qFactor, window.audioAnalyzerState.audioCtx.currentTime, 0.1);
            }
        };
    }

    if (els.wpmIn) {
        els.wpmIn.onchange = (e) => {
            window.audioAnalyzerState.wpm = parseInt(e.target.value) || 20;
        };
    }

    if (els.autoWpm) {
        els.autoWpm.onchange = (e) => {
            window.audioAnalyzerState.autoWpm = e.target.checked;
        };
    }

    if (els.resetBtn) {
        els.resetBtn.onclick = () => {
            window.audioAnalyzerState.decodedText = "";
            window.audioAnalyzerState.pulses = [];
            const textEl = document.getElementById('realTxDecodedText');
            if (textEl) textEl.textContent = "...";
            window.updateAnalyzerStats(true);
        };
    }
};

window.toggleRealTxMic = async function(enabled) {
    if (enabled) {
        try {
            console.log("AudioAnalyzer: Requesting RAW microphone access...");
            // DISABILITIAMO TUTTI I FILTRI VOCALI CHE DISTORCONO IL CW
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    highpassFilter: false,
                    channelCount: 1
                },
                video: false
            };
            window.audioAnalyzerState.stream = await navigator.mediaDevices.getUserMedia(constraints);
            window.startAudioAnalysis();
        } catch (err) {
            console.error("AudioAnalyzer: Mic access denied", err);
            showToast("Errore: Accesso al microfono negato o constraints non supportati.");
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

    window.audioAnalyzerState.source = ctx.createMediaStreamSource(window.audioAnalyzerState.stream);

    // FILTRO PASSA BANDA PIÙ AGGRESSIVO (CASCADE)
    // Usiamo due filtri in serie per una pendenza maggiore (scampanatura più stretta)
    window.audioAnalyzerState.filter = ctx.createBiquadFilter();
    window.audioAnalyzerState.filter.type = "bandpass";
    window.audioAnalyzerState.filter.frequency.value = window.audioAnalyzerState.targetFreq;
    window.audioAnalyzerState.filter.Q.value = window.audioAnalyzerState.qFactor * 2;

    const filter2 = ctx.createBiquadFilter();
    filter2.type = "bandpass";
    filter2.frequency.value = window.audioAnalyzerState.targetFreq;
    filter2.Q.value = window.audioAnalyzerState.qFactor * 2;

    // ANALIZZATORE
    window.audioAnalyzerState.analyser = ctx.createAnalyser();
    window.audioAnalyzerState.analyser.fftSize = 2048; // Maggiore risoluzione in frequenza
    window.audioAnalyzerState.analyser.smoothingTimeConstant = 0.2; // Più reattivo
    const bufferLength = window.audioAnalyzerState.analyser.frequencyBinCount;
    // Passiamo ai Float per l'analisi in dB (più precisa)
    window.audioAnalyzerState.dataArray = new Float32Array(bufferLength);

    // CATENA: Stream -> Filter 1 -> Filter 2 -> Analyser
    window.audioAnalyzerState.source.connect(window.audioAnalyzerState.filter);
    window.audioAnalyzerState.filter.connect(filter2);
    filter2.connect(window.audioAnalyzerState.analyser);

    window.audioAnalyzerState.active = true;
    window.audioAnalyzerState.lastEventTime = Date.now();
    window.audioAnalyzerState.animationId = requestAnimationFrame(window.audioAnalysisLoop);

    showToast("🎤 Ricevitore Raw Attivo");
};

window.audioAnalysisLoop = function() {
    if (!window.audioAnalyzerState.active) return;

    const state = window.audioAnalyzerState;
    // getFloatFrequencyData restituisce valori in dB (da -100 a 0)
    state.analyser.getFloatFrequencyData(state.dataArray);

    const nyquist = state.audioCtx.sampleRate / 2;
    const index = Math.round((state.targetFreq / nyquist) * state.dataArray.length);

    // Troviamo il picco in dB nell'intorno della frequenza target
    let maxDb = -100;
    const range = 2;
    for(let i = index - range; i <= index + range; i++) {
        if (state.dataArray[i] > maxDb) maxDb = state.dataArray[i];
    }

    // Normalizzazione per la barra (mappiamo -80dB..-10dB a 0..100%)
    const minVisDb = -80;
    const maxVisDb = -10;
    let normMag = (maxDb - minVisDb) / (maxVisDb - minVisDb);
    normMag = Math.max(0, Math.min(1, normMag));

    const peakBar = document.getElementById('realTxPeakBar');
    if (peakBar) peakBar.style.width = (normMag * 100) + "%";

    // LOGICA DI RILEVAMENTO IMPULSO BASATA SUI dB
    // Lo squelch utente (0..1) mappa da -70dB a -20dB
    const thresholdDb = -70 + (state.squelch * 50);
    const isCurrentlyOn = (maxDb >= thresholdDb);

    const now = Date.now();
    if (isCurrentlyOn !== state.isSignalOn) {
        const duration = now - state.lastEventTime;

        // DE-BOUNCE: 25ms per evitare spike elettrici o click
        if (duration > 25) {
            const eventType = state.isSignalOn ? 'ON' : 'OFF';
            window.handleMorseAudioPulse(eventType, duration);

            state.isSignalOn = isCurrentlyOn;
            state.lastEventTime = now;

            const led = document.getElementById('realTxStatusLed');
            if (led) led.style.background = isCurrentlyOn ? "#4caf50" : "#333";
            if (led) led.style.boxShadow = isCurrentlyOn ? "0 0 15px #4caf50" : "none";
        }
    }

    // AUTO-CHIUSURA CARATTERE E PAROLA
    if (!state.isSignalOn && state.pulses.length > 0) {
        const quietDuration = now - state.lastEventTime;
        const unit = 1200 / state.wpm;

        if (quietDuration > unit * 3.2) {
            window.finalizeMorseAudioCharacter();
        }
    }

    state.animationId = requestAnimationFrame(window.audioAnalysisLoop);
};

window.handleMorseAudioPulse = function(type, duration) {
    const state = window.audioAnalyzerState;
    if (type === 'ON') {
        state.pulses.push({ type: 'SIGNAL', duration: duration });

        // AUTO-WPM TRACKING (Opzionale)
        if (state.autoWpm && duration < 300) { // Consideriamo solo segnali potenzialmente "punti"
             state.dotHistory.push(duration);
             if (state.dotHistory.length > 5) {
                 state.dotHistory.shift();
                 const avgDot = state.dotHistory.reduce((a,b)=>a+b,0) / state.dotHistory.length;
                 const calculatedWpm = Math.round(1200 / avgDot);
                 if (Math.abs(calculatedWpm - state.wpm) > 2) {
                     state.wpm = calculatedWpm;
                     const wpmIn = document.getElementById('realTxWpmInput');
                     if (wpmIn) wpmIn.value = state.wpm;
                 }
             }
        }
    } else {
        // Se è uno spazio molto lungo (parola), aggiungiamo uno spazio nel testo
        const unit = 1200 / state.wpm;
        if (duration > unit * 6) {
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

    const unit = 1200 / state.wpm;
    let code = "";

    state.pulses.forEach(p => {
        // Analisi tecnica per statistiche
        const isDash = (p.duration > unit * 2.2);
        const ideal = isDash ? (unit * 3) : unit;
        const acc = Math.max(0, 100 - (Math.abs(p.duration - ideal) / ideal * 100));

        if (isDash) {
            code += "-";
            state.dashAccs.push(acc);
        } else {
            code += ".";
            state.dotAccs.push(acc);
        }
    });

    // Traduzione
    let foundChar = "?";
    for (let char in window.morseDict) {
        if (window.morseDict[char] === code) {
            foundChar = char;
            break;
        }
    }

    state.decodedText += foundChar;
    state.pulses = []; // Pulizia per il prossimo carattere

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
        window.audioAnalyzerState.spaceAccs = [];
    }

    const calcAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : "--";

    const dotEl = document.getElementById('realTxDotAcc');
    const dashEl = document.getElementById('realTxDashAcc');
    const spaceEl = document.getElementById('realTxSpaceAcc');

    if (dotEl) dotEl.textContent = calcAvg(window.audioAnalyzerState.dotAccs) + (window.audioAnalyzerState.dotAccs.length ? "%" : "");
    if (dashEl) dashEl.textContent = calcAvg(window.audioAnalyzerState.dashAccs) + (window.audioAnalyzerState.dashAccs.length ? "%" : "");
    // Nota: Spazio non ancora implementato nel loop millimetrico per semplicità iniziale
    if (spaceEl) spaceEl.textContent = "--%";
};

window.stopAudioAnalyzer = function() {
    console.log("AudioAnalyzer: Stopping and releasing resources...");
    window.audioAnalyzerState.active = false;

    if (window.audioAnalyzerState.animationId) {
        cancelAnimationFrame(window.audioAnalyzerState.animationId);
    }

    if (window.audioAnalyzerState.stream) {
        window.audioAnalyzerState.stream.getTracks().forEach(track => track.stop());
        window.audioAnalyzerState.stream = null;
    }

    if (window.audioAnalyzerState.audioCtx) {
        window.audioAnalyzerState.audioCtx.close();
        window.audioAnalyzerState.audioCtx = null;
    }

    const micToggle = document.getElementById('realTxMicToggle');
    if (micToggle) micToggle.checked = false;

    const peakBar = document.getElementById('realTxPeakBar');
    if (peakBar) peakBar.style.width = "0%";

    const led = document.getElementById('realTxStatusLed');
    if (led) led.style.background = "#333";
};
