// js/audio_analyzer.js - Laboratorio di Analisi Morse con Sessioni d'Esame

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

    // INTEGRATORE DI BIT
    bitHistory: 0,

    // Stato decodificatore
    marksCount: 0,
    spacesCount: 0,
    currentCode: "",
    decodedText: "",

    // Tracking WPM
    wpm: 20,
    unitBits: 12,
    autoWpm: true,

    // SESSIONE D'ESAME
    sessionActive: false,
    sessionTimer: null,
    timeLeft: 0,
    sessionData: {
        pulses: [], // { type: 'MARK'|'SPACE', duration: bits }
        characters: [], // { char: 'A', acc: 95, wpm: 20 }
        startTime: 0
    },

    // Statistiche generali
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
        resetBtn: document.getElementById('btnResetRealTx'),
        // Nuovi elementi sessione
        btnStartSession: document.getElementById('btnStartRealTxSession'),
        btnStopSession: document.getElementById('btnStopRealTxSession'),
        timerSelect: document.getElementById('realTxTimerSelect')
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

    // BINDING SESSIONE
    if (els.btnStartSession) els.btnStartSession.onclick = () => window.startRealTxSession();
    if (els.btnStopSession) els.btnStopSession.onclick = () => window.stopRealTxSession(true);
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
        if (state.spacesCount > currentUnitBits * 2.0 && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
        if (state.spacesCount > 0 && state.sessionActive) {
            state.sessionData.pulses.push({ type: 'SPACE', duration: state.spacesCount });
        }
        state.spacesCount = 0;
    } else {
        state.spacesCount++;
        if (state.marksCount > 0) {
            window.handleTransition(state.marksCount);
            if (state.sessionActive) {
                state.sessionData.pulses.push({ type: 'MARK', duration: state.marksCount });
            }
            state.marksCount = 0;
        }

        if (state.spacesCount > currentUnitBits * 3.0 && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
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

    if (markCount < 2) return;

    const isDash = (markCount > currentUnitBits * 1.8);
    state.currentCode += isDash ? "-" : ".";

    const ideal = isDash ? (currentUnitBits * 3) : currentUnitBits;
    const acc = Math.max(0, 100 - (Math.abs(markCount - ideal) / ideal * 100));
    if (isDash) state.dashAccs.push(acc); else state.dotAccs.push(acc);

    if (state.autoWpm && !isDash && markCount > 2) {
        let newUnitBits = (currentUnitBits * 0.9) + (markCount * 0.1);
        let newWpm = Math.round(1200 / (newUnitBits * 5));
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

    const charToStore = foundChar || "?";
    if (state.sessionActive) {
        const lastAcc = state.dotAccs.length > 0 || state.dashAccs.length > 0
            ? Math.round(((state.dotAccs[state.dotAccs.length-1] || 100) + (state.dashAccs[state.dashAccs.length-1] || 100)) / 2)
            : 100;
        state.sessionData.characters.push({ char: charToStore, code: state.currentCode, acc: lastAcc, wpm: state.wpm });
    }

    state.decodedText += charToStore;
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
    const dotEl = document.getElementById('realTxDotAcc');
    const dashEl = document.getElementById('realTxDashAcc');
    if (dotEl) dotEl.textContent = calcAvg(state.dotAccs) + (state.dotAccs.length ? "%" : "");
    if (dashEl) dashEl.textContent = calcAvg(state.dashAccs) + (state.dashAccs.length ? "%" : "");
};

// --- LOGICA SESSIONE D'ESAME ---

window.startRealTxSession = function() {
    const state = window.audioAnalyzerState;
    const duration = parseInt(document.getElementById('realTxTimerSelect').value) || 30;

    // Reset Dati
    state.sessionActive = true;
    state.timeLeft = duration;
    state.sessionData = { pulses: [], characters: [], startTime: Date.now() };
    state.decodedText = "";
    state.currentCode = "";
    window.updateDecodedDisplay();
    window.updateAnalyzerStats(true);

    // UI Toggle
    document.getElementById('btnStartRealTxSession').style.display = 'none';
    document.getElementById('btnStopRealTxSession').style.display = 'block';
    const timerDisp = document.getElementById('realTxSessionTimerDisplay');
    timerDisp.style.display = 'block';
    document.getElementById('realTxTimeLeft').textContent = duration;

    if (state.sessionTimer) clearInterval(state.sessionTimer);
    state.sessionTimer = setInterval(() => {
        state.timeLeft--;
        document.getElementById('realTxTimeLeft').textContent = state.timeLeft;
        if (state.timeLeft <= 0) window.stopRealTxSession();
    }, 1000);

    showToast("🏁 Sessione d'Esame Iniziata!");
};

window.stopRealTxSession = function(manual = false) {
    const state = window.audioAnalyzerState;
    state.sessionActive = false;
    if (state.sessionTimer) clearInterval(state.sessionTimer);

    document.getElementById('btnStartRealTxSession').style.display = 'block';
    document.getElementById('btnStopRealTxSession').style.display = 'none';
    document.getElementById('realTxSessionTimerDisplay').style.display = 'none';

    if (!manual) {
        window.generateDetailedReport();
    }
};

window.generateDetailedReport = function() {
    const state = window.audioAnalyzerState;
    const data = state.sessionData;
    const reportCont = document.getElementById('realTxReportContent');
    const modal = document.getElementById('realTxReportModal');

    if (!data.characters.length) {
        alert("Nessun carattere trasmesso durante la sessione.");
        return;
    }

    // --- ANALISI TECNICA ---
    const unitBits = Math.round(1200 / state.wpm / 5);
    const marks = data.pulses.filter(p => p.type === 'MARK');
    const spaces = data.pulses.filter(p => p.type === 'SPACE');

    // 1. Ratio Punto/Linea
    const dots = marks.filter(m => m.duration < unitBits * 1.8);
    const dashes = marks.filter(m => m.duration >= unitBits * 1.8);
    const avgDot = dots.length ? dots.reduce((a,b)=>a+b.duration,0)/dots.length : 0;
    const avgDash = dashes.length ? dashes.reduce((a,b)=>a+b.duration,0)/dashes.length : 0;
    const actualRatio = avgDot ? (avgDash / avgDot).toFixed(1) : "0";

    // 2. Analisi Spazi
    const charSpaces = spaces.filter(s => s.duration < unitBits * 5);
    const wordSpaces = spaces.filter(s => s.duration >= unitBits * 5);
    const avgCharSpace = charSpaces.length ? charSpaces.reduce((a,b)=>a+b.duration,0)/charSpaces.length : 0;
    const charSpaceUnits = (avgCharSpace / (avgDot || unitBits)).toFixed(1);

    // 3. Classifica Caratteri Sbagliati/Imprecisi
    const charStats = {};
    data.characters.forEach(c => {
        if (!charStats[c.char]) charStats[c.char] = { count: 0, sumAcc: 0, errors: 0 };
        charStats[c.char].count++;
        charStats[c.char].sumAcc += c.acc;
        if (c.char === "?") charStats[c.char].errors++;
    });

    const worstChars = Object.entries(charStats)
        .map(([char, s]) => ({ char, avg: s.sumAcc / s.count }))
        .sort((a,b) => a.avg - b.avg)
        .slice(0, 3);

    // --- COSTRUZIONE REPORT STRUTTURATO ---
    let html = `<div style="border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:10px;">`;
    html += `📅 <b>Data:</b> ${new Date().toLocaleString('it-IT')}<br>`;
    html += `⏱️ <b>Durata:</b> ${data.characters.length} caratteri a media <b>${state.wpm} WPM</b></div>`;

    html += `<div style="color:var(--link-color); font-weight:bold; margin-bottom:5px;">📐 PARAMETRI TECNICI</div>`;
    html += `• <b>Ratio Punto/Linea:</b> 1:${actualRatio} <span style="color:${Math.abs(actualRatio-3)<0.4?'#4caf50':'#ff9800'}">${Math.abs(actualRatio-3)<0.4?'(Ottimo)':'(Tendi a '+ (actualRatio<3?'accorciare':'allungare') +' le linee)'}</span><br>`;
    html += `• <b>Spazio tra Lettere:</b> ${charSpaceUnits} unità <small style="opacity:0.6;">(Ideale: 3.0)</small><br>`;
    html += `• <b>Spazi Parola rilevati:</b> ${wordSpaces.length}<br><br>`;

    html += `<div style="color:var(--champ-color); font-weight:bold; margin-bottom:5px;">🎯 PRECISIONE CARATTERI</div>`;
    worstChars.forEach(wc => {
        html += `• <b>Lettera '${wc.char}':</b> ${Math.round(wc.avg)}% precisione<br>`;
    });

    html += `<br><div style="color:#ffeb3b; font-weight:bold; margin-bottom:5px;">💡 CONSIGLIO DELL'ISTRUTTORE</div>`;
    if (Math.abs(actualRatio-3) > 0.5) {
        html += `Il tuo rapporto punto/linea è sbilanciato. Cura la chiusura della linea, deve durare esattamente come tre punti.`;
    } else if (parseFloat(charSpaceUnits) < 2.5) {
        html += `Le tue lettere sono troppo vicine. Lascia "respirare" il codice aumentando leggermente la pausa tra i caratteri.`;
    } else {
        html += `Ottima manipolazione! Il ritmo è costante. Prova ad alzare i WPM di riferimento per la prossima sessione.`;
    }

    reportCont.innerHTML = html;
    modal.style.display = 'flex';
};

window.stopAudioAnalyzer = function() {
    window.audioAnalyzerState.active = false;
    if (window.audioAnalyzerState.sessionTimer) clearInterval(window.audioAnalyzerState.sessionTimer);
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
