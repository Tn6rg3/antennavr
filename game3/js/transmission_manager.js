// js/transmission_manager.js

window.transmissionState = {
    active: false,
    currentTarget: '',
    startTime: 0,
    sequence: [], // { type: 'on'|'off', duration: ms }
    lastEventTime: 0,
    isDown: false,
    timeoutHandle: null
};

window.initTransmissionManager = function() {
    console.log("Transmission Manager: Initializing...");
    const keyBtn = document.getElementById('morseKeyBtn');
    if (!keyBtn) return;

    // Gestione Eventi Mouse/Touch
    const handleDown = (e) => {
        if (e) {
            if (e.cancelable) e.preventDefault();
        }
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
        keyBtn.style.transform = "scale(0.92)";
        keyBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.8), inset 0 2px 5px rgba(255,255,255,0.1)";
        keyBtn.querySelector('span').style.opacity = "0.6";
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
        keyBtn.style.transform = "scale(1)";
        keyBtn.style.boxShadow = "0 10px 20px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)";
        keyBtn.querySelector('span').style.opacity = "0.2";

        // Se la sessione è attiva, verifichiamo se l'utente ha finito il carattere
        if (window.transmissionState.active) {
            window.checkTransmissionCompletion();
        }
    };

    keyBtn.addEventListener('mousedown', handleDown);
    keyBtn.addEventListener('touchstart', handleDown, {passive: false});

    // Window per catturare il rilascio anche fuori dal bottone
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp, {passive: false});
    window.addEventListener('touchcancel', handleUp, {passive: false});

    // Listener Bottoni
    document.getElementById('btnStartTxSession')?.addEventListener('click', window.startTxSession);
    document.getElementById('btnReplayTargetChar')?.addEventListener('click', window.replayTxTarget);

    // Inizializziamo il WPM di riferimento nell'interfaccia
    const wpmRef = document.getElementById('txWpmRef');
    if (wpmRef && window.courseData?.settings) {
        wpmRef.textContent = window.courseData.settings.start_wpm || 20;
    }
};

window.startTxSession = function() {
    if (!window.courseData) return;

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    window.transmissionState.active = true;
    window.transmissionState.sequence = [];
    window.transmissionState.lastEventTime = 0;
    if (window.transmissionState.timeoutHandle) clearTimeout(window.transmissionState.timeoutHandle);

    // Scegliamo un carattere dai correnti
    const lesson = window.courseData.progress.current_lesson || 2;
    const activeChars = window.KOCH_SEQUENCE.slice(0, lesson);
    window.transmissionState.currentTarget = activeChars[Math.floor(Math.random() * activeChars.length)];

    const targetEl = document.getElementById('txTargetChar');
    const feedbackEl = document.getElementById('txFeedbackText');
    if (targetEl) targetEl.textContent = window.transmissionState.currentTarget;
    if (feedbackEl) {
        feedbackEl.textContent = "Ascolta e ripeti...";
        feedbackEl.style.color = "var(--link-color)";
    }

    document.getElementById('txAccuracyContainer').style.display = 'none';

    // Suoniamo il carattere per riferimento
    window.replayTxTarget();
};

window.replayTxTarget = function() {
    if (!window.transmissionState.currentTarget) return;
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    window.playMorseAudio(window.transmissionState.currentTarget, wpm, true);
};

window.checkTransmissionCompletion = function() {
    const target = window.transmissionState.currentTarget;
    const targetCode = window.morseDict[target];
    if (!targetCode) return;

    const elementsSent = window.transmissionState.sequence.filter(s => s.type === 'on').length;

    // Se ha inviato abbastanza elementi, aspettiamo un secondo di silenzio per concludere
    if (elementsSent >= targetCode.length) {
        if (window.transmissionState.timeoutHandle) clearTimeout(window.transmissionState.timeoutHandle);
        window.transmissionState.timeoutHandle = setTimeout(() => {
            if (window.transmissionState.isDown) return;
            window.analyzeTransmission();
        }, 1200);
    }
};

window.analyzeTransmission = function() {
    if (!window.transmissionState.active) return;
    window.transmissionState.active = false;

    const target = window.transmissionState.currentTarget;
    const targetCode = window.morseDict[target];
    const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
    const unit = 1200 / wpm; // Durata punto ideale in ms

    const seq = window.transmissionState.sequence;
    const onElements = seq.filter(s => s.type === 'on');

    if (onElements.length === 0) return;

    // 1. Verifica correttezza sequenza (punti vs linee)
    // Soglia dinamica: una pressione è una linea se > 2 unità
    let detectedCode = "";
    onElements.forEach(el => {
        if (el.duration < unit * 2) detectedCode += ".";
        else detectedCode += "-";
    });

    // Se il codice rilevato è diverso, errore
    if (detectedCode !== targetCode) {
        let msg = "Sequenza errata!";
        if (detectedCode.length > targetCode.length) msg = "Troppi elementi!";
        if (detectedCode.length < targetCode.length) msg = "Pochi elementi!";
        window.showTxResult(false, 0, msg);
        return;
    }

    // 2. Analisi temporale ON (Precisione durata)
    let accuracySum = 0;
    onElements.forEach((el, i) => {
        const ideal = (targetCode[i] === '-') ? (unit * 3) : unit;
        const diff = Math.abs(el.duration - ideal);
        // Tolleranza: se l'errore è > 100%, accuratezza 0. Altrimenti proporzionale.
        const accuracy = Math.max(0, 100 - (diff / ideal * 100));
        accuracySum += accuracy;
    });

    // 3. Analisi temporale OFF (Precisione gap tra elementi)
    const offElements = seq.filter(s => s.type === 'off');
    let gapAccuracySum = 0;
    offElements.forEach(el => {
        const ideal = unit; // Spazio tra elementi dello stesso carattere
        const diff = Math.abs(el.duration - ideal);
        const accuracy = Math.max(0, 100 - (diff / ideal * 100));
        gapAccuracySum += accuracy;
    });

    const avgOnAcc = accuracySum / onElements.length;
    const avgOffAcc = offElements.length > 0 ? (gapAccuracySum / offElements.length) : 100;

    // Media pesata: la durata dei toni pesa di più (70%) rispetto agli spazi (30%)
    const finalAccuracy = Math.round((avgOnAcc * 0.7) + (avgOffAcc * 0.3));

    let feedbackMsg = "Ottimo lavoro!";
    if (finalAccuracy > 90) feedbackMsg = "Precisione da professionista! 🏆";
    else if (finalAccuracy > 75) feedbackMsg = "Buon ritmo, continua così! 👍";
    else if (finalAccuracy > 50) feedbackMsg = "Sufficiente, prova a essere più regolare.";
    else feedbackMsg = "Troppa incertezza nei tempi.";

    window.showTxResult(true, finalAccuracy, feedbackMsg);

    // Aggiungiamo XP se è buono
    if (finalAccuracy > 70) window.addXP?.(10, "Transmission Success");
};

window.showTxResult = function(isCorrect, accuracy, msg) {
    const feedback = document.getElementById('txFeedbackText');
    const accCont = document.getElementById('txAccuracyContainer');
    const accBar = document.getElementById('txAccuracyBar');
    const accVal = document.getElementById('txAccuracyValue');

    if (isCorrect) {
        feedback.textContent = msg;
        feedback.style.color = "#4caf50";
        accCont.style.display = 'block';
        accBar.style.width = accuracy + "%";
        accVal.textContent = accuracy + "%";
        accVal.style.color = accuracy > 80 ? "#4caf50" : (accuracy > 50 ? "#ff9800" : "#d32f2f");
    } else {
        feedback.textContent = msg;
        feedback.style.color = "#d32f2f";
        accCont.style.display = 'none';
    }
};
