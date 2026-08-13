// js/transmission_manager.js

window.transmissionState = {
    sessionRunning: false,
    active: false,
    currentTarget: '',
    startTime: 0,
    sequence: [], // { type: 'on'|'off', duration: ms }
    lastEventTime: 0,
    isDown: false,
    timeoutHandle: null,
    sessionStats: []
};

window.initTransmissionManager = function() {
    console.log("Transmission Manager: Initializing...");

    const keyBtn = document.getElementById('morseKeyBtn');
    if (!keyBtn) return;

    // Sostituiamo il tasto per pulire i listener
    const newBtn = keyBtn.cloneNode(true);
    keyBtn.parentNode.replaceChild(newBtn, keyBtn);

    const handleDown = (e) => {
        if (e && e.cancelable) e.preventDefault();
        if (!window.transmissionState.active || window.transmissionState.isDown) return;

        window.transmissionState.isDown = true;
        const now = Date.now();

        if (window.transmissionState.lastEventTime > 0) {
            const gap = now - window.transmissionState.lastEventTime;
            window.transmissionState.sequence.push({ type: 'off', duration: gap });
        }
        window.transmissionState.lastEventTime = now;

        if (window.transmissionState.timeoutHandle) {
            clearTimeout(window.transmissionState.timeoutHandle);
            window.transmissionState.timeoutHandle = null;
        }

        window.startTone();
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
        if (window.transmissionState.active) {
            window.transmissionState.sequence.push({ type: 'on', duration: duration });
            window.checkTransmissionCompletion();
        }
        window.transmissionState.lastEventTime = now;

        window.stopTone();
        newBtn.style.transform = "scale(1)";
        newBtn.style.boxShadow = "0 10px 20px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)";
        const inner = newBtn.querySelector('span');
        if (inner) inner.style.opacity = "0.2";
    };

    newBtn.addEventListener('mousedown', handleDown);
    newBtn.addEventListener('touchstart', handleDown, {passive: false});
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp, {passive: false});

    // Inizializzazione Pulsanti
    const btnStart = document.getElementById('btnStartTxSession');
    const btnStop = document.getElementById('btnStopTxSession');
    const btnReplay = document.getElementById('btnReplayTargetChar');

    if (btnStart) {
        btnStart.onclick = () => {
            console.log("Transmission UI: Start Clicked");
            window.startTxSession();
        };
    }
    if (btnStop) {
        btnStop.onclick = () => {
            console.log("Transmission UI: Stop Clicked");
            window.stopTxSession();
        };
    }
    if (btnReplay) {
        btnReplay.onclick = () => {
            window.replayTxTarget();
        };
    }

    // WPM Display
    const wpmRef = document.getElementById('txWpmRef');
    if (wpmRef) {
        wpmRef.textContent = window.courseData?.settings?.start_wpm || 20;
    }
};

window.startTxSession = function() {
    console.log("Transmission: Session started");
    window.transmissionState.sessionRunning = true;
    window.transmissionState.sessionStats = [];

    // Aggiornamento Visibility UI
    const bStart = document.getElementById('btnStartTxSession');
    const bStop = document.getElementById('btnStopTxSession');
    if (bStart) bStart.style.display = 'none';
    if (bStop) bStop.style.display = 'inline-block';

    document.getElementById('txFinalSummary').style.display = 'none';

    window.pickNextTxTarget();
};

window.stopTxSession = function() {
    console.log("Transmission: Session stopped");
    window.transmissionState.sessionRunning = false;
    window.transmissionState.active = false;

    if (window.transmissionState.timeoutHandle) clearTimeout(window.transmissionState.timeoutHandle);

    const bStart = document.getElementById('btnStartTxSession');
    const bStop = document.getElementById('btnStopTxSession');
    if (bStart) bStart.style.display = 'inline-block';
    if (bStop) bStop.style.display = 'none';

    document.getElementById('txDetailedAccuracy').style.display = 'none';
    window.showFinalTxReport();
};

window.pickNextTxTarget = function() {
    if (!window.transmissionState.sessionRunning) return;

    window.transmissionState.active = true;
    window.transmissionState.sequence = [];
    window.transmissionState.lastEventTime = 0;

    let lesson = 2;
    if (window.courseData?.progress?.current_lesson) lesson = parseInt(window.courseData.progress.current_lesson);
    const koch = window.KOCH_SEQUENCE || ["K","M","R","S"];
    const activeChars = koch.slice(0, Math.max(2, lesson));
    const randomChar = activeChars[Math.floor(Math.random() * activeChars.length)];

    window.transmissionState.currentTarget = randomChar;
    console.log("Transmission: Target char ->", randomChar);

    const targetEl = document.getElementById('txTargetChar');
    const feedbackEl = document.getElementById('txFeedbackText');
    if (targetEl) targetEl.textContent = randomChar;
    if (feedbackEl) {
        feedbackEl.textContent = "Ascolta e ripeti...";
        feedbackEl.style.color = "var(--link-color)";
    }

    // Reset Barre
    document.getElementById('txDetailedAccuracy').style.display = 'none';

    setTimeout(() => {
        if (window.transmissionState.sessionRunning) window.replayTxTarget();
    }, 200);
};

window.replayTxTarget = function() {
    if (!window.transmissionState.currentTarget) return;
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    console.log("Transmission: Replaying", window.transmissionState.currentTarget, "@", wpm, "WPM");
    if (typeof window.playMorseAudio === 'function') {
        window.playMorseAudio(window.transmissionState.currentTarget, wpm, true);
    }
};

window.checkTransmissionCompletion = function() {
    const targetCode = window.morseDict[window.transmissionState.currentTarget];
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
    const targetCode = window.morseDict[target];
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    const unit = 1200 / wpm; // Unità in ms

    const seq = window.transmissionState.sequence;
    const onElements = seq.filter(s => s.type === 'on');
    const offElements = seq.filter(s => s.type === 'off');

    let detectedCode = "";
    onElements.forEach(el => {
        detectedCode += (el.duration < unit * 2) ? "." : "-";
    });

    console.log("Transmission: Detected", detectedCode, "vs Target", targetCode);

    if (detectedCode !== targetCode) {
        window.showTxDetailedResult(false, "Sequenza errata! Riprova.");
        window.transmissionState.sequence = [];
        window.transmissionState.lastEventTime = 0;
        return;
    }

    // Calcolo accuratezze
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

    window.showTxDetailedResult(true, "ECCELLENTE!", avgDot, avgDash, avgSpace);

    // Avanzamento automatico solo se corretto
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

    if (feedback) {
        feedback.textContent = msg;
        feedback.style.color = isCorrect ? "#4caf50" : "#d32f2f";
    }

    if (isCorrect && detailArea) {
        detailArea.style.display = 'flex';
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
