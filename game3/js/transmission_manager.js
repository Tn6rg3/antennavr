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
    sessionStats: [] // Array di { char, dotAcc, dashAcc, spaceAcc, totalAcc }
};

window.initTransmissionManager = function() {
    console.log("Transmission Manager: Initializing...");
    const keyBtn = document.getElementById('morseKeyBtn');
    if (!keyBtn) return;

    // Rimuoviamo eventuali listener vecchi se ricaricato
    const newBtn = keyBtn.cloneNode(true);
    keyBtn.parentNode.replaceChild(newBtn, keyBtn);

    // Gestione Eventi Mouse/Touch
    const handleDown = (e) => {
        if (e && e.cancelable) e.preventDefault();
        if (window.transmissionState.isDown) return;
        window.transmissionState.isDown = true;

        const now = Date.now();
        if (window.transmissionState.active && window.transmissionState.lastEventTime > 0) {
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
        newBtn.querySelector('span').style.opacity = "0.6";
    };

    const handleUp = (e) => {
        if (!window.transmissionState.isDown) return;
        window.transmissionState.isDown = false;

        const now = Date.now();
        const duration = now - window.transmissionState.lastEventTime;
        if (window.transmissionState.active) {
            window.transmissionState.sequence.push({ type: 'on', duration: duration });
        }
        window.transmissionState.lastEventTime = now;

        window.stopTone();
        newBtn.style.transform = "scale(1)";
        newBtn.style.boxShadow = "0 10px 20px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)";
        newBtn.querySelector('span').style.opacity = "0.2";

        if (window.transmissionState.active) {
            window.checkTransmissionCompletion();
        }
    };

    newBtn.addEventListener('mousedown', handleDown);
    newBtn.addEventListener('touchstart', handleDown, {passive: false});
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp, {passive: false});

    // Listener Bottoni
    document.getElementById('btnStartTxSession')?.addEventListener('click', window.startTxSession);
    document.getElementById('btnStopTxSession')?.addEventListener('click', window.stopTxSession);
    document.getElementById('btnReplayTargetChar')?.addEventListener('click', window.replayTxTarget);

    const wpmRef = document.getElementById('txWpmRef');
    if (wpmRef && window.courseData?.settings) {
        wpmRef.textContent = window.courseData.settings.start_wpm || 20;
    }
};

window.startTxSession = function() {
    window.transmissionState.sessionRunning = true;
    window.transmissionState.sessionStats = [];

    document.getElementById('btnStartTxSession').style.display = 'none';
    document.getElementById('btnStopTxSession').style.display = 'block';
    document.getElementById('txFinalSummary').style.display = 'none';

    window.pickNextTxTarget();
};

window.stopTxSession = function() {
    window.transmissionState.sessionRunning = false;
    window.transmissionState.active = false;

    document.getElementById('btnStartTxSession').style.display = 'block';
    document.getElementById('btnStopTxSession').style.display = 'none';
    document.getElementById('txDetailedAccuracy').style.display = 'none';

    window.showFinalTxReport();
};

window.pickNextTxTarget = function() {
    if (!window.transmissionState.sessionRunning) return;

    window.transmissionState.active = true;
    window.transmissionState.sequence = [];
    window.transmissionState.lastEventTime = 0;

    const lesson = window.courseData?.progress?.current_lesson || 2;
    const activeChars = window.KOCH_SEQUENCE.slice(0, lesson);
    window.transmissionState.currentTarget = activeChars[Math.floor(Math.random() * activeChars.length)];

    const targetEl = document.getElementById('txTargetChar');
    const feedbackEl = document.getElementById('txFeedbackText');
    if (targetEl) targetEl.textContent = window.transmissionState.currentTarget;
    if (feedbackEl) {
        feedbackEl.textContent = "Ascolta e ripeti...";
        feedbackEl.style.color = "var(--link-color)";
    }

    window.replayTxTarget();
};

window.replayTxTarget = function() {
    if (!window.transmissionState.currentTarget) return;
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    window.playMorseAudio(window.transmissionState.currentTarget, wpm, true);
};

window.checkTransmissionCompletion = function() {
    const targetCode = window.morseDict[window.transmissionState.currentTarget];
    if (!targetCode) return;

    const elementsSent = window.transmissionState.sequence.filter(s => s.type === 'on').length;
    if (elementsSent >= targetCode.length) {
        if (window.transmissionState.timeoutHandle) clearTimeout(window.transmissionState.timeoutHandle);
        window.transmissionState.timeoutHandle = setTimeout(() => {
            if (window.transmissionState.isDown) return;
            window.analyzeTransmission();
        }, 1000);
    }
};

window.analyzeTransmission = function() {
    if (!window.transmissionState.active) return;

    const target = window.transmissionState.currentTarget;
    const targetCode = window.morseDict[target];
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    const unit = 1200 / wpm;

    const seq = window.transmissionState.sequence;
    const onElements = seq.filter(s => s.type === 'on');
    const offElements = seq.filter(s => s.type === 'off');

    let detectedCode = "";
    onElements.forEach(el => detectedCode += (el.duration < unit * 2) ? "." : "-");

    if (detectedCode !== targetCode) {
        window.showTxDetailedResult(false, "Sequenza errata, riprova!");
        window.transmissionState.sequence = [];
        window.transmissionState.lastEventTime = 0;
        return;
    }

    // Calcolo accuratezza separata
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

    window.transmissionState.sessionStats.push({ char: target, dotAcc: avgDot, dashAcc: avgDash, spaceAcc: avgSpace, totalAcc: totalAcc });

    window.showTxDetailedResult(true, "Corretto!", avgDot, avgDash, avgSpace);

    // Avanzamento automatico
    window.transmissionState.active = false;
    setTimeout(() => {
        if (window.transmissionState.sessionRunning) window.pickNextTxTarget();
    }, 1500);
};

window.showTxDetailedResult = function(isCorrect, msg, dotAcc=0, dashAcc=0, spaceAcc=0) {
    const feedback = document.getElementById('txFeedbackText');
    const detailArea = document.getElementById('txDetailedAccuracy');

    feedback.textContent = msg;
    feedback.style.color = isCorrect ? "#4caf50" : "#d32f2f";

    if (isCorrect) {
        detailArea.style.display = 'flex';
        window.updateTxBar('Dot', dotAcc);
        window.updateTxBar('Dash', dashAcc);
        window.updateTxBar('Space', spaceAcc);
    } else {
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

    // Aggreghiamo per carattere
    const report = {};
    window.transmissionState.sessionStats.forEach(s => {
        if (!report[s.char]) report[s.char] = { count: 0, sum: 0 };
        report[s.char].count++;
        report[s.char].sum += s.totalAcc;
    });

    Object.entries(report).forEach(([char, data]) => {
        const avg = Math.round(data.sum / data.count);
        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid rgba(255,255,255,0.05);";
        div.innerHTML = `<b>Carattere ${char}</b> <span>Precisione Media: <b style="color:${avg > 80 ? '#4caf50' : '#ff9800'}">${avg}%</b></span>`;
        list.appendChild(div);
    });
};
