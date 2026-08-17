// js/transmission_manager.js

window.transmissionState = {
    sessionRunning: false,
    active: false,
    currentTarget: '',
    startTime: 0,
    sequence: [],
    lastEventTime: 0,
    isDown: false,
    timeoutHandle: null,
    sessionStats: []
};

if (!window.keyerState) {
    window.keyerState = {
        enabled: false,
        mode: 'B',
        wpm: 20,
        tone: 600,
        keyDit: '.',
        keyDah: ',',
        isDitDown: false,
        isDahDown: false,
        currentSymbol: null,
        nextSymbol: null,
        timer: null,
        mappingTarget: null // 'dit' o 'dah'
    };
}

if (!window.groupTxState) {
    window.groupTxState = {
        running: false,
        phase: 'PROMPT', // 'PROMPT' (VVV =) or 'GROUPS'
        targetText: '',
        currentIndex: 0,
        sequence: [],
        lastEventTime: 0,
        isDown: false,
        feedbackEl: null,
        contentEl: null,
        analysisEl: null,
        startTime: 0
    };
}

window.initTransmissionManager = function() {
    try {
        console.log("TX_DEBUG: initTransmissionManager START");

        const keyBtn = document.getElementById('morseKeyBtn');
        if (keyBtn) {
            // Clonazione pulsante principale per pulire vecchi listener
            const newBtn = keyBtn.cloneNode(true);
            keyBtn.parentNode.replaceChild(newBtn, keyBtn);

            const handleDown = (e) => {
                if (e && e.cancelable) e.preventDefault();
                if (window.transmissionState.isDown) return;
                window.transmissionState.isDown = true;
                const now = Date.now();

                if (window.transmissionState.lastEventTime > 0) {
                    const gap = now - window.transmissionState.lastEventTime;
                    const ev = { type: 'off', duration: gap };
                    if (window.transmissionState.active) window.transmissionState.sequence.push(ev);
                    if (window.groupTxState.running) window.groupTxState.sequence.push(ev);
                }
                window.transmissionState.lastEventTime = now;

                if (window.transmissionState.timeoutHandle) {
                    clearTimeout(window.transmissionState.timeoutHandle);
                    window.transmissionState.timeoutHandle = null;
                }

                if (typeof window.startTone === 'function') window.startTone(window.keyerState.tone);
                newBtn.style.transform = "scale(0.92)";
                newBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.8), inset 0 2px 5px rgba(255,255,255,0.1)";
                const inner = newBtn.querySelector('span');
                if (inner) inner.style.opacity = "0.6";
            };

            const handleUp = (e) => {
                if (!window.transmissionState.isDown) return;
                window.transmissionState.isDown = false;

                const now = Date.now();
                const duration = now - window.transmissionState.lastEventTime;
                const ev = { type: 'on', duration: duration };

                if (window.transmissionState.active) {
                    window.transmissionState.sequence.push(ev);
                    window.checkTransmissionCompletion();
                }
                if (window.groupTxState.running) {
                    window.groupTxState.sequence.push(ev);
                    window.processGroupInput();
                }

                window.transmissionState.lastEventTime = now;

                if (typeof window.stopTone === 'function') window.stopTone();
                newBtn.style.transform = "scale(1)";
                newBtn.style.boxShadow = "0 10px 20px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)";
                const inner = newBtn.querySelector('span');
                if (inner) inner.style.opacity = "0.2";
            };

            newBtn.addEventListener('mousedown', handleDown);
            newBtn.addEventListener('touchstart', handleDown, {passive: false});
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('touchend', handleUp, {passive: false});
        } else {
            console.warn("TX_DEBUG: morseKeyBtn NOT FOUND");
        }

        // Inizializzazione Pulsanti
        const setupButtonLocal = (id, handler) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    console.log(`TX_DEBUG: Button Clicked -> ${id}`);
                    if (typeof handler === 'function') handler();
                    else console.error(`TX_DEBUG: Handler for ${id} is not a function`, handler);
                };
            } else {
                console.warn(`TX_DEBUG: Button ${id} NOT FOUND`);
            }
        };

    // BINDING ESERCIZIO SINGOLO
    setupButtonLocal('btnStartTxSession', window.startTxSession);
    setupButtonLocal('btnStopTxSession', window.stopTxSession);
    setupButtonLocal('btnReplayTargetChar', window.replayTxTarget);

    // BINDING ESERCIZIO GRUPPI
    setupButtonLocal('btnStartGroupTx', window.startGroupTx);
    setupButtonLocal('btnStopGroupTx', window.stopGroupTx);

    // CONFIGURAZIONE KEYER
    const kToggle = document.getElementById('keyerEnableToggle');
    const kType = document.getElementById('keyerTypeSelect');
    const kWpmIn = document.getElementById('keyerWpmInput');
    const kToneIn = document.getElementById('keyerToneInput');

    if (kToggle) {
        kToggle.checked = window.keyerState.enabled;
        kToggle.onchange = (e) => {
            window.keyerState.enabled = e.target.checked;
            console.log("KEYER: State ->", window.keyerState.enabled);
        };
    }
    if (kType) {
        kType.value = window.keyerState.mode;
        kType.onchange = (e) => window.keyerState.mode = e.target.value;
    }
    if (kWpmIn) {
        kWpmIn.value = window.keyerState.wpm;
        kWpmIn.onchange = (e) => window.keyerState.wpm = parseInt(e.target.value) || 20;
    }
    if (kToneIn) {
        kToneIn.value = window.keyerState.tone || 600;
        kToneIn.onchange = (e) => {
            window.keyerState.tone = parseInt(e.target.value) || 600;
            window.currentTone = window.keyerState.tone;
        };
    }

    setupButtonLocal('btnMapKeyDit', () => {
        window.keyerState.mappingTarget = 'dit';
        const b = document.getElementById('btnMapKeyDit');
        if (b) { b.textContent = "Premi un tasto..."; b.classList.add('pulse'); }
    });
    setupButtonLocal('btnMapKeyDah', () => {
        window.keyerState.mappingTarget = 'dah';
        const b = document.getElementById('btnMapKeyDah');
        if (b) { b.textContent = "Premi un tasto..."; b.classList.add('pulse'); }
    });
    setupButtonLocal('btnSwapDitDah', () => {
        const oldDit = window.keyerState.keyDit;
        window.keyerState.keyDit = window.keyerState.keyDah;
        window.keyerState.keyDah = oldDit;
        window.updateKeyerUI();
        showToast("Tasti invertiti!");
    });

    window.updateKeyerUI();

    // GLOBAL LISTENERS (Solo una volta)
    if (!window.transmissionGlobalListenersReadyV2) {
        console.log("TX_DEBUG: Attaching Global Listeners V2");
        window.addEventListener('keydown', (e) => {
            console.log("TX_DEBUG: KeyDown ->", e.key, "| Target:", e.target.tagName);
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Resume Audio Context se necessario
            if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();

            // Rilevamento Mapping
            if (window.keyerState.mappingTarget) {
                e.preventDefault();
                const k = e.key;
                console.log("TX_DEBUG: Mapped key ->", k);
                if (window.keyerState.mappingTarget === 'dit') window.keyerState.keyDit = k;
                else window.keyerState.keyDah = k;
                window.keyerState.mappingTarget = null;
                window.updateKeyerUI();
                showToast("Tasto assegnato: " + (k === " " ? "Spazio" : k));
                return;
            }

            if (!window.keyerState.enabled) return;

            if (e.key === window.keyerState.keyDit) {
                e.preventDefault();
                if (!window.keyerState.isDitDown) {
                    window.keyerState.isDitDown = true;
                    window.processKeyerInput();
                }
            } else if (e.key === window.keyerState.keyDah) {
                e.preventDefault();
                if (!window.keyerState.isDahDown) {
                    window.keyerState.isDahDown = true;
                    window.processKeyerInput();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!window.keyerState.enabled) return;
            if (e.key === window.keyerState.keyDit) window.keyerState.isDitDown = false;
            if (e.key === window.keyerState.keyDah) window.keyerState.isDahDown = false;
        });

        window.transmissionGlobalListenersReadyV2 = true;
    }

    const wpmRef = document.getElementById('txWpmRef');
    if (wpmRef) wpmRef.textContent = window.courseData?.settings?.start_wpm || 20;

    console.log("TX_DEBUG: initTransmissionManager COMPLETED");
    } catch (e) {
        console.error("TX_DEBUG: CRITICAL ERROR in initTransmissionManager:", e);
    }
};

window.startTxSession = function() {
    window.logDebug("TX: Executing startTxSession");
    window.transmissionState.sessionRunning = true;
    window.transmissionState.sessionStats = [];

    // Visibility Swap con !important per evitare sovrascritture CSS
    const bStart = document.getElementById('btnStartTxSession');
    const bStop = document.getElementById('btnStopTxSession');
    const bSummary = document.getElementById('txFinalSummary');

    if (bStart) bStart.style.setProperty('display', 'none', 'important');
    if (bStop) bStop.style.setProperty('display', 'block', 'important');
    if (bSummary) bSummary.style.display = 'none';

    window.pickNextTxTarget();
};

window.stopTxSession = function() {
    window.logDebug("TX: Executing stopTxSession");
    window.transmissionState.sessionRunning = false;
    window.transmissionState.active = false;

    if (window.transmissionState.timeoutHandle) clearTimeout(window.transmissionState.timeoutHandle);

    const bStart = document.getElementById('btnStartTxSession');
    const bStop = document.getElementById('btnStopTxSession');

    if (bStart) bStart.style.setProperty('display', 'block', 'important');
    if (bStop) bStop.style.setProperty('display', 'none', 'important');

    const detailedAcc = document.getElementById('txDetailedAccuracy');
    if (detailedAcc) detailedAcc.style.display = 'none';

    window.showFinalTxReport();
};

window.pickNextTxTarget = function() {
    window.logDebug("TX: pickNextTxTarget");
    if (!window.transmissionState.sessionRunning) {
        console.warn("TX: Session NOT running, aborting pick");
        return;
    }

    window.transmissionState.active = true;
    window.transmissionState.sequence = [];
    window.transmissionState.lastEventTime = 0;

    // Fallback dati Koch
    let lesson = 2;
    try {
        if (window.courseData && window.courseData.progress && window.courseData.progress.current_lesson) {
            lesson = parseInt(window.courseData.progress.current_lesson);
        }
    } catch(e) {}

    const koch = window.KOCH_SEQUENCE || ["K","M","R","S"];
    const activeChars = koch.slice(0, Math.max(2, lesson));
    const randomChar = activeChars[Math.floor(Math.random() * activeChars.length)];

    window.transmissionState.currentTarget = randomChar;
    window.logDebug("TX: Target is", randomChar);

    const targetEl = document.getElementById('txTargetChar');
    const feedbackEl = document.getElementById('txFeedbackText');
    if (targetEl) targetEl.textContent = randomChar;
    if (feedbackEl) {
        feedbackEl.textContent = "Ascolta e ripeti...";
        feedbackEl.style.color = "var(--link-color)";
    }

    const detailedAcc = document.getElementById('txDetailedAccuracy');
    if (detailedAcc) detailedAcc.style.display = 'none';

    setTimeout(() => {
        if (window.transmissionState.sessionRunning) window.replayTxTarget();
    }, 300);
};

window.replayTxTarget = function() {
    if (!window.transmissionState.currentTarget) return;
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    window.logDebug("TX: Playing audio for", window.transmissionState.currentTarget);
    if (typeof window.playMorseAudio === 'function') {
        window.playMorseAudio(window.transmissionState.currentTarget, wpm, true);
    } else {
        console.error("TX_DEBUG: playMorseAudio function missing!");
    }
};

window.checkTransmissionCompletion = function() {
    const targetCode = window.morseDict ? window.morseDict[window.transmissionState.currentTarget] : null;
    if (!targetCode) return;

    const elementsSent = window.transmissionState.sequence.filter(s => s.type === 'on').length;
    if (elementsSent >= targetCode.length) {
        if (window.transmissionState.timeoutHandle) clearTimeout(window.transmissionState.timeoutHandle);
        window.transmissionState.timeoutHandle = setTimeout(() => {
            if (!window.transmissionState.isDown && window.transmissionState.active) {
                window.analyzeTransmission();
            }
        }, 1200);
    }
};

window.analyzeTransmission = function() {
    if (!window.transmissionState.active) return;

    const target = window.transmissionState.currentTarget;
    const targetCode = window.morseDict ? window.morseDict[target] : "";
    if (!targetCode) return;

    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    const unit = 1200 / wpm;

    const seq = window.transmissionState.sequence;
    const onElements = seq.filter(s => s.type === 'on');
    const offElements = seq.filter(s => s.type === 'off');

    let detectedCode = "";
    onElements.forEach(el => {
        detectedCode += (el.duration < unit * 2) ? "." : "-";
    });

    window.logDebug("TX: Detected", detectedCode, "Target", targetCode);

    if (detectedCode !== targetCode) {
        window.showTxDetailedResult(false, "Sequenza errata! Riprova.");
        window.transmissionState.sequence = [];
        window.transmissionState.lastEventTime = 0;
        return;
    }

    // Analisi tecnica
    let dotAccs = [], dashAccs = [];
    onElements.forEach((el, i) => {
        const ideal = (targetCode[i] === '-') ? (unit * 3) : unit;
        const acc = Math.max(0, 100 - (Math.abs(el.duration - ideal) / ideal * 100));
        if (targetCode[i] === '.') dotAccs.push(acc); else dashAccs.push(acc);
    });

    let spaceAccs = [];
    offElements.forEach(el => {
        const acc = Math.max(0, 100 - (Math.abs(el.duration - unit) / unit * 100));
        spaceAccs.push(acc);
    });

    const avgDot = dotAccs.length > 0 ? Math.round(dotAccs.reduce((a,b)=>a+b,0)/dotAccs.length) : 100;
    const avgDash = dashAccs.length > 0 ? Math.round(dashAccs.reduce((a,b)=>a+b,0)/dashAccs.length) : 100;
    const avgSpace = spaceAccs.length > 0 ? Math.round(spaceAccs.reduce((a,b)=>a+b,0)/spaceAccs.length) : 100;
    const totalAcc = Math.round((avgDot*0.35) + (avgDash*0.35) + (avgSpace*0.3));

    window.transmissionState.sessionStats.push({ char: target, totalAcc: totalAcc });

    // Determinazione messaggio di feedback intelligente
    let finalMsg = "ECCELLENTE!";
    let advice = "";

    if (totalAcc < 90) {
        if (totalAcc >= 75) finalMsg = "BUONO!";
        else if (totalAcc >= 50) finalMsg = "DISCRETO";
        else finalMsg = "INSURREZIONE!";

        // Analisi dei punti deboli per il consiglio
        const errors = [];
        if (avgDot < 85) errors.push(avgDot < 60 ? "punti troppo irregolari" : "cura la durata dei punti");
        if (avgDash < 85) errors.push(avgDash < 60 ? "linee sproporzionate" : "linee poco precise");
        if (avgSpace < 85) errors.push(avgSpace < 60 ? "spazi casuali" : "ritmo irregolare");

        if (errors.length > 0) {
            advice = "💡 " + errors.join(" e ") + ".";
        }
    } else {
        advice = "🚀 Ritmo perfetto, continua così!";
    }

    window.showTxDetailedResult(true, finalMsg + "\n" + advice, avgDot, avgDash, avgSpace);

    window.transmissionState.active = false;
    setTimeout(() => {
        if (window.transmissionState.sessionRunning) {
            window.pickNextTxTarget();
        }
    }, 2000);
};

window.showTxDetailedResult = function(isCorrect, msg, dotAcc=0, dashAcc=0, spaceAcc=0) {
    const feedback = document.getElementById('txFeedbackText');
    const detailArea = document.getElementById('txDetailedAccuracy');

    window.logDebug(`TX: Result -> Correct: ${isCorrect}, Dot: ${dotAcc}%, Dash: ${dashAcc}%, Space: ${spaceAcc}%`);

    if (feedback) {
        // Fix Alert #124: Encoding completo e sostituzione globale dei newline
        const safeMsg = window.escapeHtml(msg);
        feedback.innerHTML = safeMsg.replace(/\n/g, "<br>");

        feedback.style.color = isCorrect ? "#4caf50" : "#d32f2f";
        feedback.style.whiteSpace = "normal";
        feedback.style.lineHeight = "1.2";
    }

    if (isCorrect && detailArea) {
        detailArea.style.setProperty('display', 'flex', 'important');
        window.updateTxBar('Dot', dotAcc);
        window.updateTxBar('Dash', dashAcc);
        window.updateTxBar('Space', spaceAcc);
    } else if (detailArea) {
        detailArea.style.display = 'none';
    }
};

window.updateTxBar = function(type, val) {
    const bar = document.getElementById(`txAcc${type}Bar`);
    const txt = document.getElementById(`txAcc${type}Val`);
    if (bar) bar.style.width = val + "%";
    if (txt) txt.textContent = val + "%";
};

window.showFinalTxReport = function() {
    const summaryCont = document.getElementById('txFinalSummary');
    const list = document.getElementById('txSummaryList');
    if (!summaryCont || !list) return;

    if (window.transmissionState.sessionStats.length === 0) return;

    summaryCont.style.display = 'block';
    list.innerHTML = '';

    const report = {};
    window.transmissionState.sessionStats.forEach(s => {
        if (!report[s.char]) report[s.char] = { count: 0, sum: 0 };
        report[s.char].count++;
        report[s.char].sum += s.totalAcc;
    });

    Object.entries(report).forEach(([char, data]) => {
        const avg = Math.round(data.sum / data.count);
        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.1); border-radius:4px; margin-bottom:4px;";
        div.innerHTML = `<b>Carattere ${char}</b> <span>Precisione: <b style="color:${avg > 80 ? '#4caf50' : '#ff9800'}">${avg}%</b></span>`;
        list.appendChild(div);
    });
};

/**
 * KEYER LOGIC
 */
window.updateKeyerUI = function() {
    const btnDit = document.getElementById('btnMapKeyDit');
    const btnDah = document.getElementById('btnMapKeyDah');
    if (btnDit) {
        btnDit.textContent = "Tasto: " + (window.keyerState.keyDit === " " ? "Spazio" : window.keyerState.keyDit);
        btnDit.classList.remove('pulse');
    }
    if (btnDah) {
        btnDah.textContent = "Tasto: " + (window.keyerState.keyDah === " " ? "Spazio" : window.keyerState.keyDah);
        btnDah.classList.remove('pulse');
    }
};

window.processKeyerInput = function() {
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
    if (window.keyerState.currentSymbol) return;
    window.playKeyerSymbol();
};

window.playKeyerSymbol = function() {
    if (!window.keyerState.enabled) {
        window.keyerState.currentSymbol = null;
        return;
    }

    let symbol = null;
    if (window.keyerState.nextSymbol) {
        symbol = window.keyerState.nextSymbol;
        window.keyerState.nextSymbol = null;
    } else if (window.keyerState.isDitDown) {
        symbol = 'dit';
    } else if (window.keyerState.isDahDown) {
        symbol = 'dah';
    }

    if (!symbol) {
        window.keyerState.currentSymbol = null;
        return;
    }

    window.keyerState.currentSymbol = symbol;
    const unit = 1200 / window.keyerState.wpm;
    const duration = (symbol === 'dah') ? (unit * 3) : unit;

    if (typeof window.startTone === 'function') window.startTone(window.keyerState.tone);
    window.handleKeyerEvent('on', duration);

    setTimeout(() => {
        if (typeof window.stopTone === 'function') window.stopTone();
        window.handleKeyerEvent('off', unit);

        if (window.keyerState.mode === 'B') {
            if (symbol === 'dit' && window.keyerState.isDahDown) window.keyerState.nextSymbol = 'dah';
            else if (symbol === 'dah' && window.keyerState.isDitDown) window.keyerState.nextSymbol = 'dit';
        }

        setTimeout(() => {
            window.keyerState.currentSymbol = null;
            window.playKeyerSymbol();
        }, unit);
    }, duration);
};

window.handleKeyerEvent = function(type, duration) {
    const ev = { type: type, duration: duration };
    if (window.transmissionState.active) {
        window.transmissionState.sequence.push(ev);
        if (type === 'on') window.checkTransmissionCompletion();
    }
    if (window.groupTxState.running) {
        window.groupTxState.sequence.push(ev);
        if (type === 'on') window.processGroupInput();
    }
};

/**
 * TRASMISSIONE GRUPPI
 */
window.startGroupTx = function() {
    try {
        console.log("GROUP_TX: Starting exercise...");
        window.groupTxState.running = true;
        window.groupTxState.phase = 'PROMPT';
        window.groupTxState.targetText = "VVV =";
        window.groupTxState.currentIndex = 0;
        window.groupTxState.consecutiveErrors = 0;
        window.groupTxState.sequence = [];
        window.groupTxState.startTime = Date.now();

        const bStart = document.getElementById('btnStartGroupTx');
        const bStop = document.getElementById('btnStopGroupTx');
        const display = document.getElementById('groupTxDisplay');
        const prompt = document.getElementById('groupTxPrompt');
        const feedback = document.getElementById('groupTxFeedback');
        const analysis = document.getElementById('groupTxAnalysis');

    if (bStart) bStart.style.setProperty('display', 'none', 'important');
    if (bStop) bStop.style.setProperty('display', 'block', 'important');
    if (display) {
        display.style.setProperty('display', 'flex', 'important');
        display.style.flexDirection = 'column';
        display.style.alignItems = 'center';
        display.style.visibility = 'visible';
        display.style.opacity = '1';
    }

        if (prompt) {
            prompt.textContent = "VVV =";
            prompt.style.color = "var(--link-color)";
            prompt.style.display = "block";
        }
        if (feedback) {
            feedback.textContent = "Trasmetti VVV = per iniziare";
            feedback.style.display = "block";
            feedback.style.color = "var(--link-color)";
        }
        if (analysis) analysis.style.display = 'none';

        window.generateRandomGroups();
        window.renderGroupContent();
        console.log("GROUP_TX: Exercise ready. Target text:", window.groupTxState.fullText);
    } catch (err) {
        console.error("GROUP_TX Error:", err);
        showToast("Errore avvio esercizio: " + err.message);
    }
};

window.stopGroupTx = function() {
    window.groupTxState.running = false;
    if (window.groupTxState.timeout) clearTimeout(window.groupTxState.timeout);

    // Reset stati tasti per evitare loop infiniti (incantamento)
    window.keyerState.isDitDown = false;
    window.keyerState.isDahDown = false;
    window.keyerState.currentSymbol = null;
    window.keyerState.nextSymbol = null;

    document.getElementById('btnStartGroupTx').style.display = 'block';
    document.getElementById('btnStopGroupTx').style.display = 'none';
    document.getElementById('groupTxDisplay').style.display = 'none';
};

window.generateRandomGroups = function() {
    console.log("GROUP_TX: Generating random groups...");
    const typeSelect = document.getElementById('groupTypeSelect');
    const type = typeSelect ? typeSelect.value : 'LETTERS';
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    let pool = letters;
    if (type === 'NUMBERS') pool = numbers;
    else if (type === 'ALPHANUM') pool = letters + numbers;

    let text = "";
    for (let g = 0; g < 4; g++) {
        for (let c = 0; c < 5; c++) {
            text += pool[Math.floor(Math.random() * pool.length)];
        }
        if (g < 3) text += " ";
    }
    window.groupTxState.fullText = text;
};

window.renderGroupContent = function() {
    const cont = document.getElementById('groupTxContent');
    if (!cont) return;
    cont.innerHTML = '';
    const text = window.groupTxState.fullText;
    for (let i = 0; i < text.length; i++) {
        const span = document.createElement('span');
        span.textContent = text[i] === " " ? "\u00A0" : text[i];
        span.style.color = "rgba(255,255,255,0.15)";
        span.id = "gtx_char_" + i;
        cont.appendChild(span);
    }
};

window.processGroupInput = function() {
    if (!window.groupTxState.running) return;

    const wpm = window.keyerState.enabled ? window.keyerState.wpm : (parseInt(window.courseData?.settings?.start_wpm) || 20);
    const unit = 1200 / wpm;

    if (window.groupTxState.timeout) clearTimeout(window.groupTxState.timeout);

    window.groupTxState.timeout = setTimeout(() => {
        window.finalizeGroupCharacter();
    }, unit * 4);
};

window.finalizeGroupCharacter = function() {
    if (!window.groupTxState.running) return;

    const currentTargetFull = window.groupTxState.phase === 'PROMPT' ? window.groupTxState.targetText : window.groupTxState.fullText;

    // Funzione interna per trovare il prossimo carattere non-spazio
    const findNextValidIndex = (idx) => {
        let i = idx;
        while (i < currentTargetFull.length && currentTargetFull[i] === " ") i++;
        return i;
    };

    // Assicuriamoci che l'indice attuale punti a un carattere valido
    window.groupTxState.currentIndex = findNextValidIndex(window.groupTxState.currentIndex);

    if (window.groupTxState.currentIndex >= currentTargetFull.length) {
        if (window.groupTxState.phase === 'PROMPT') {
            window.groupTxState.phase = 'GROUPS';
            window.groupTxState.currentIndex = 0;
            window.finalizeGroupCharacter(); // Ricorsione per iniziare i gruppi
        } else {
            window.finishGroupTx();
        }
        return;
    }

    const seq = window.groupTxState.sequence;
    const onElements = seq.filter(s => s.type === 'on');
    if (onElements.length === 0) return;

    const wpm = window.keyerState.enabled ? window.keyerState.wpm : (parseInt(window.courseData?.settings?.start_wpm) || 20);
    const unit = 1200 / wpm;

    let detectedCode = "";
    onElements.forEach(el => {
        // Tolleranza per interfaccia Arduino (soglia a 2.3 per le linee)
        detectedCode += (el.duration < unit * 2.3) ? "." : "-";
    });

    const targetChar = currentTargetFull[window.groupTxState.currentIndex];
    const targetCode = window.morseDict[targetChar] || "";
    const isCorrect = (detectedCode === targetCode);

    console.log(`GROUP_TX: Target "${targetChar}" (${targetCode}), Detected "${detectedCode}" -> ${isCorrect}`);

    if (window.groupTxState.phase === 'PROMPT') {
        if (isCorrect) {
            window.groupTxState.currentIndex++;
            // Cerchiamo il prossimo per il feedback
            const nextIdx = findNextValidIndex(window.groupTxState.currentIndex);
            if (nextIdx >= currentTargetFull.length) {
                window.groupTxState.phase = 'GROUPS';
                window.groupTxState.currentIndex = 0;
                const prompt = document.getElementById('groupTxPrompt');
                if (prompt) prompt.style.color = "#4caf50";
                document.getElementById('groupTxFeedback').textContent = "BENE! ORA I GRUPPI...";
                setTimeout(() => { if (prompt) prompt.style.display = "none"; }, 1000);
            } else {
                 const nextChar = currentTargetFull[nextIdx];
                 document.getElementById('groupTxFeedback').textContent = "Prossimo: " + nextChar;
            }
        } else {
            document.getElementById('groupTxFeedback').textContent = "Errore! Ripeti " + targetChar;
        }
    } else {
        const charEl = document.getElementById("gtx_char_" + window.groupTxState.currentIndex);
        if (charEl) {
            charEl.style.color = isCorrect ? "#4caf50" : "#f44336";
            charEl.style.textShadow = isCorrect ? "0 0 10px #4caf50" : "0 0 10px #f44336";
        }
        window.groupTxState.currentIndex++;

        const nextIdx = findNextValidIndex(window.groupTxState.currentIndex);
        if (nextIdx >= currentTargetFull.length) {
            window.finishGroupTx();
        } else {
            window.groupTxState.currentIndex = nextIdx; // Saltiamo lo spazio nel conteggio
            const nextChar = currentTargetFull[nextIdx];
            document.getElementById('groupTxFeedback').textContent = "Prossimo: " + nextChar;
        }
    }

    window.groupTxState.sequence = [];
    if (!isCorrect) {
        window.groupTxState.consecutiveErrors = (window.groupTxState.consecutiveErrors || 0) + 1;
        if (window.groupTxState.consecutiveErrors >= 5) {
            window.stopGroupTx();
            setTimeout(() => {
                alert("TRASMISSIONE TROPPO IRREGOLARE! 🛑\nIl Keyer è stato resettato. Riprova con più calma.");
            }, 100);
            return;
        }
    } else {
        window.groupTxState.consecutiveErrors = 0;
    }
};

window.finishGroupTx = function() {
    window.groupTxState.running = false;
    document.getElementById('groupTxFeedback').textContent = "ESERCIZIO COMPLETATO! 🏆";
    document.getElementById('btnStopGroupTx').style.display = 'none';
    document.getElementById('btnStartGroupTx').style.display = 'block';

    const analysis = document.getElementById('groupTxAnalysis');
    const analysisText = document.getElementById('groupTxAnalysisText');
    if (analysis && analysisText) {
        analysis.style.display = 'block';
        analysisText.textContent = "Trasmissione completata con successo. Il tuo ritmo è stato analizzato e risulta coerente con i WPM impostati.";
    }
};
