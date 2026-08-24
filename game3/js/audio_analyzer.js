/**
 * js/audio_analyzer.js - Laboratorio di Analisi Morse con Sessioni d'Esame
 *
 * Motore di analisi basato sulla logica a bit-stream e DSP del progetto 'ggmorse'
 * Autore originale: Georgi Gerganov (https://github.com/ggerganov/ggmorse)
 * Porting JavaScript e adattamento per Sfida Telegrafia.
 */

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

    // LIVELLI DI TOLLERANZA (Professional Calibration)
    difficulty: 'amateur',
    tolerances: {
        // Principiante: Tollerante sui tempi ma pronto a separare i caratteri per evitare merging
        beginner: { dashRatio: 1.8, charTimeout: 2.2, spaceForce: 1.6, wordSpace: 5.0 },
        // Amatore: Il bilanciamento standard che avevamo testato (Equilibrato)
        amateur:  { dashRatio: 2.0, charTimeout: 2.5, spaceForce: 1.8, wordSpace: 6.0 },
        // Elite: Richiede precisione da manuale, non perdona imprecisioni ritmiche
        elite:    { dashRatio: 2.2, charTimeout: 3.0, spaceForce: 2.8, wordSpace: 7.0 }
    },

    // SESSIONE D'ESAME
    sessionActive: false,
    sessionTimer: null,
    timeLeft: 0,
    sessionData: {
        pulses: [], // { type: 'MARK'|'SPACE', duration: bits }
        characters: [], // { char: 'A', code: '.-', acc: 95, wpm: 20 }
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
        difficulty: document.getElementById('realTxDifficultySelect'),
        autoWpm: document.getElementById('realTxAutoWpmToggle'),
        resetBtn: document.getElementById('btnResetRealTx'),
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
    if (els.difficulty) {
        window.audioAnalyzerState.difficulty = els.difficulty.value;
        els.difficulty.onchange = (e) => {
            window.audioAnalyzerState.difficulty = e.target.value;
            showToast(`Difficoltà: ${e.target.options[e.target.selectedIndex].text}`);
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
            const textEl = document.getElementById('realTxDecodedText');
            if (textEl) textEl.textContent = "...";
            window.updateAnalyzerStats(true);
        };
    }

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

        if (mag < state.noiseFloor * 2) state.noiseFloor = (state.noiseFloor * 0.98) + (mag * 0.02);
        state.signalPeak = Math.max(state.signalPeak * 0.995, mag);
        const range = state.signalPeak - state.noiseFloor;
        state.threshold = state.noiseFloor + (range * (0.35 + (state.squelch || 0.2) * 0.4));

        const rawBit = (mag > state.threshold) ? 1 : 0;
        if (rawBit === 1) state.bitHistory = Math.min(3, state.bitHistory + 1);
        else state.bitHistory = Math.max(-3, state.bitHistory - 1);

        const confirmedMark = (state.bitHistory >= 1);
        window.processStabilizedBit(confirmedMark);

        const peakBar = document.getElementById('realTxPeakBar');
        if (peakBar) peakBar.style.width = Math.min(100, (mag / (state.signalPeak || 0.01)) * 100) + "%";
    };

    showToast("🎤 Analizzatore Ricezione Attivo");
};

window.processStabilizedBit = function(isMark) {
    const state = window.audioAnalyzerState;
    const tol = state.tolerances[state.difficulty];
    const currentUnitBits = Math.max(4, Math.round(1200 / state.wpm / 5));

    if (isMark) {
        state.marksCount++;
        // CHIUSURA ANTICIPATA: Soglia basata sulla difficoltà
        if (state.spacesCount > currentUnitBits * tol.spaceForce && state.currentCode.length > 0) {
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

        // CHIUSURA PER TIMEOUT: Soglia basata sulla difficoltà
        if (state.spacesCount > currentUnitBits * tol.charTimeout && state.currentCode.length > 0) {
            window.decodeCurrentCode();
        }
        // SPAZIO PAROLA: Soglia basata sulla difficoltà
        if (state.spacesCount === Math.round(currentUnitBits * tol.wordSpace)) {
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
    const tol = state.tolerances[state.difficulty];
    const currentUnitBits = Math.max(4, Math.round(1200 / state.wpm / 5));

    if (markCount < 2) return;

    const isDash = (markCount > currentUnitBits * tol.dashRatio);
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

window.startRealTxSession = function() {
    const state = window.audioAnalyzerState;
    const duration = parseInt(document.getElementById('realTxTimerSelect').value) || 30;

    state.sessionActive = true;
    state.timeLeft = duration;
    state.sessionData = { pulses: [], characters: [], startTime: Date.now() };
    state.decodedText = "";
    state.currentCode = "";
    window.updateDecodedDisplay();
    window.updateAnalyzerStats(true);

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
    const tol = state.tolerances[state.difficulty];
    const reportCont = document.getElementById('realTxReportContent');
    const modal = document.getElementById('realTxReportModal');

    if (!data.characters.length) {
        alert("Nessun carattere trasmesso durante la sessione.");
        return;
    }

    const unitBits = Math.max(4, Math.round(1200 / state.wpm / 5));
    const marks = data.pulses.filter(p => p.type === 'MARK');
    const spaces = data.pulses.filter(p => p.type === 'SPACE');

    const dots = marks.filter(m => m.duration < unitBits * tol.dashRatio);
    const dashes = marks.filter(m => m.duration >= unitBits * tol.dashRatio);
    const avgDot = dots.length ? dots.reduce((a,b)=>a+b.duration,0)/dots.length : 0;
    const avgDash = dashes.length ? dashes.reduce((a,b)=>a+b.duration,0)/dashes.length : 0;
    const actualRatio = avgDot ? (avgDash / avgDot).toFixed(1) : "0";

    const charSpaces = spaces.filter(s => s.duration < unitBits * tol.wordSpace);
    const wordSpaces = spaces.filter(s => s.duration >= unitBits * tol.wordSpace);
    const avgCharSpace = charSpaces.length ? charSpaces.reduce((a,b)=>a+b.duration,0)/charSpaces.length : 0;
    const charSpaceUnits = (avgCharSpace / (avgDot || unitBits)).toFixed(1);

    const charStats = {};
    data.characters.forEach(c => {
        if (!charStats[c.char]) charStats[c.char] = { count: 0, sumAcc: 0, errors: 0 };
        charStats[c.char].count++;
        charStats[c.char].sumAcc += c.acc;
        if (c.char === "?") charStats[c.char].errors++;
    });

    const sortedChars = Object.entries(charStats)
        .map(([char, s]) => ({ char, avg: s.sumAcc / s.count }))
        .sort((a,b) => a.avg - b.avg);
    const worstChars = sortedChars.slice(0, 3);

    let html = `<div style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:12px; color: #aaa;">`;
    html += `📅 <b style="color:white;">Data:</b> ${new Date().toLocaleString('it-IT')}<br>`;
    html += `📊 <b style="color:white;">Livello:</b> <span style="color:var(--champ-color); font-weight:bold;">${state.difficulty.toUpperCase()}</span><br>`;
    html += `⏱️ <b style="color:white;">Sessione:</b> ${data.characters.length} caratteri @ <b style="color:var(--champ-color);">${state.wpm} WPM</b></div>`;

    html += `<div style="color:var(--link-color); font-weight:bold; margin-bottom:8px; font-size:1.1em; border-left:3px solid var(--link-color); padding-left:8px;">📐 ANALISI RITMICA</div>`;

    const ratioDiff = Math.abs(actualRatio - 3.0);
    const ratioColor = ratioDiff < 0.3 ? '#4caf50' : (ratioDiff < 0.6 ? '#ffeb3b' : '#f44336');
    html += `• <b>Ratio Punto/Linea:</b> <span style="color:${ratioColor}; font-size:1.2em;">1:${actualRatio}</span><br>`;
    html += `<small style="display:block; margin-bottom:8px; opacity:0.7;">(Target 1:3.0 - ${ratioDiff < 0.3 ? 'Manipolazione perfetta' : (actualRatio < 3 ? 'Linee troppo "leggere"' : 'Linee troppo "pesanti"')})</small>`;

    const spaceDiff = Math.abs(parseFloat(charSpaceUnits) - 3.0);
    const spaceColor = spaceDiff < 0.4 ? '#4caf50' : (spaceDiff < 0.8 ? '#ffeb3b' : '#f44336');
    html += `• <b>Spazio Lettere:</b> <span style="color:${spaceColor}; font-size:1.2em;">${charSpaceUnits}</span> unità<br>`;
    html += `<small style="display:block; margin-bottom:8px; opacity:0.7;">(Target 3.0 unità - ${spaceDiff < 0.4 ? 'Spaziatura precisa' : (parseFloat(charSpaceUnits) < 3 ? 'Lettere troppo vicine' : 'Lettere troppo distanti')})</small>`;

    html += `• <b>Spazi Parola:</b> <b style="color:white;">${wordSpaces.length}</b> <small style="opacity:0.6;">(Soglia ${tol.wordSpace} unità)</small><br><br>`;

    html += `<div style="color:var(--champ-color); font-weight:bold; margin-bottom:8px; font-size:1.1em; border-left:3px solid var(--champ-color); padding-left:8px;">🎯 PRECISIONE CARATTERI</div>`;
    worstChars.forEach(wc => {
        const accColor = wc.avg > 85 ? '#4caf50' : wc.avg > 70 ? '#ffeb3b' : '#f44336';
        html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>Lettera <b style="color:white; font-size:1.1em;">'${wc.char}'</b>:</span>
            <b style="color:${accColor};">${Math.round(wc.avg)}%</b>
        </div>`;
    });

    html += `<br><div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid #444;">`;
    html += `<b style="display:block; margin-bottom:6px; color:#ffeb3b;">💡 VALUTAZIONE ISTRUTTORE:</b>`;

    if (state.difficulty === 'elite') {
        if (ratioDiff < 0.2 && spaceDiff < 0.3) html += "Eccellente precisione Elite. La tua manipolazione è di livello professionale, degna di un operatore d'alto bordo.";
        else html += "In modalità Elite la precisione è fondamentale. Lavora sulla costanza millimetrica del rilascio linea.";
    } else if (state.difficulty === 'amateur') {
        if (ratioDiff < 0.4 && spaceDiff < 0.5) html += "Buona padronanza tecnica. Stai mantenendo un ritmo solido. Prova la modalità Elite per perfezionare i dettagli.";
        else html += "La base è corretta ma il ritmo oscilla. Concentrati sul sentire il 'battito' del metronomo interno.";
    } else {
        html += "Ottimo inizio! Il sistema ti sta aiutando a decodificare. Cerca di allungare le linee fino a sentire il triplo della durata del punto.";
    }
    html += `</div>`;

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
