// js/caccia_qso_manager.js - Simulatore Radio HF 40m & Contest "Caccia QSO" (Morse Runner Style: S&P vs RUN Mode)

(function() {
    'use strict';

    // State globale della Stazione Radio Caccia QSO
    window.cacciaQsoState = {
        radioOn: false,
        vfoFreqHz: 7034000, // 7.034.00 MHz in Hz (Banda 40m CW)
        subMode: 'search_pounce', // 'search_pounce' (S&P) oppure 'run' (RUN Mode)
        sessionDurationSec: 600, // Predefinito: 10 minuti
        timeRemainingSec: 600,
        qsoCompletedCount: 0,
        totalPoints: 0,
        stations: [],
        currentQsoStep: 'IDLE', // IDLE, LISTENING, CALL_MATCHED, EXCHANGE_SENT, COMPLETED
        activeStation: null,
        logbook: [],
        timerInterval: null,
        audioCtx: null,
        noiseNode: null,
        noiseFilter: null,
        noiseGain: null,
        activeToneOscillators: {},
        isVfoDragging: false,
        vfoKnobAngle: 0,
        vfoLastTouchAngle: 0,
        isUserTransmitting: false, // Flag di trasmissione locale operatore
        mySerialNum: 1
    };

    /**
     * UTILITY: PUNTEGGIO DI CORRISPONDENZA TRA INPUT UTENTE E NOMINATIVO STAZIONE
     * Supporta sia il match posizione-per-posizione sia le sottostringhe (es. suffisso "XYZ" in "IK2XYZ")
     */
    function evaluateCallMatch(inputStr, targetCall) {
        if (!inputStr || !targetCall) return { exact: false, partial: false, score: 0 };
        if (inputStr === targetCall) return { exact: true, partial: true, score: 100 };

        // Match per sottostringa (es. prefisso o suffisso copiato nel pile-up, almeno 2 caratteri)
        if (inputStr.length >= 2 && targetCall.includes(inputStr)) {
            return { exact: false, partial: true, score: 50 + inputStr.length };
        }

        // Match carattere per carattere dalla posizione 0
        let posMatches = 0;
        const minLen = Math.min(inputStr.length, targetCall.length);
        for (let i = 0; i < minLen; i++) {
            if (inputStr[i] === targetCall[i]) posMatches++;
        }

        if (posMatches >= 3) {
            return { exact: false, partial: true, score: 30 + posMatches };
        }

        return { exact: false, partial: false, score: posMatches };
    }

    /**
     * RECUPERO E AGGIORNAMENTO VELOCITÀ WPM DINAMICA (10 - 50 WPM)
     */
    window.getCacciaQsoWpm = function() {
        const inputEl = document.getElementById('cacciaQsoWpmInput');
        return inputEl ? (parseInt(inputEl.value) || 20) : (window.currentWpm || 20);
    };

    window.changeCacciaQsoWpm = function(delta) {
        const inputEl = document.getElementById('cacciaQsoWpmInput');
        if (!inputEl) return;
        let current = parseInt(inputEl.value) || 20;
        let newVal = Math.max(10, Math.min(50, current + delta));
        inputEl.value = newVal;
        window.updateCacciaQsoWpmSpeed();
    };

    window.updateCacciaQsoWpmSpeed = function() {
        const newWpm = window.getCacciaQsoWpm();
        window.cacciaQsoState.stations.forEach(st => {
            st.wpm = newWpm;
        });
        console.log("Caccia QSO: All stations updated to WPM ->", newWpm);
    };

    /**
     * CAMBIO CICLICO DURATA SESSIONE AL CLICK SUL DISPLAY TIMER (5, 10, 15, 20, 25, 30 min)
     */
    window.cycleCacciaQsoDuration = function() {
        const state = window.cacciaQsoState;
        if (state.radioOn || state.timeRemainingSec < state.sessionDurationSec) return;

        const durations = [5, 10, 15, 20, 25, 30];
        const currentMins = Math.round(state.sessionDurationSec / 60);
        let nextIdx = (durations.indexOf(currentMins) + 1) % durations.length;
        const newMins = durations[nextIdx];

        state.sessionDurationSec = newMins * 60;
        state.timeRemainingSec = newMins * 60;

        window.updateCacciaQsoTimerDisplay();
    };

    window.updateCacciaQsoTimerDisplay = function() {
        const timerEl = document.getElementById('cacciaQsoTimerDisplay');
        if (!timerEl) return;
        const mins = Math.floor(window.cacciaQsoState.timeRemainingSec / 60);
        const secs = window.cacciaQsoState.timeRemainingSec % 60;
        timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    /**
     * INIZIALIZZAZIONE & AVVIO MODALITÀ
     */
    window.startCacciaQsoGame = function() {
        console.log("Caccia QSO: Starting game mode...");
        window.showScreen('cacciaQsoScreen');

        const myCallInput = document.getElementById('cacciaQsoMyCallInput');
        if (myCallInput) {
            myCallInput.value = (window.myName && window.myName !== 'Telegrafista') ? window.myName.toUpperCase() : 'IU2XYZ';
        }

        const rstInput = document.getElementById('cacciaQsoRstInput');
        if (rstInput) rstInput.value = '5NN';

        const nrInput = document.getElementById('cacciaQsoNrInput');
        if (nrInput) nrInput.value = '';

        const badgeEl = document.getElementById('cacciaQsoMySerialBadge');
        if (badgeEl) badgeEl.textContent = '001';

        const callInput = document.getElementById('cacciaQsoCallInput');
        if (callInput) callInput.value = '';

        window.cacciaQsoState.sessionDurationSec = 600;
        window.cacciaQsoState.timeRemainingSec = 600;
        window.cacciaQsoState.qsoCompletedCount = 0;
        window.cacciaQsoState.totalPoints = 0;
        window.cacciaQsoState.mySerialNum = 1;
        window.cacciaQsoState.logbook = [];
        window.cacciaQsoState.currentQsoStep = 'IDLE';
        window.cacciaQsoState.activeStation = null;
        window.cacciaQsoState.vfoFreqHz = 7034000;
        window.cacciaQsoState.vfoKnobAngle = 0;
        window.cacciaQsoState.isUserTransmitting = false;

        const subModeSelect = document.getElementById('cacciaQsoSubModeSelect');
        window.cacciaQsoState.subMode = subModeSelect ? subModeSelect.value : 'search_pounce';
        window.switchCacciaQsoSubMode(window.cacciaQsoState.subMode);

        window.updateCacciaQsoTimerDisplay();
        window.generateCacciaQsoStations();
        window.initCacciaQsoUI();

        // LA RADIO PARTE SPENTA ALL'INGRESSO COME DA REQUISITO
        window.toggleCacciaQsoPower(false);
    };

    /**
     * CAMBIO MODALITÀ OPERATIVA (S&P vs RUN)
     */
    window.switchCacciaQsoSubMode = function(newSubMode) {
        const state = window.cacciaQsoState;
        state.subMode = newSubMode;
        state.currentQsoStep = 'IDLE';
        state.activeStation = null;

        const cqBtn = document.getElementById('btnCacciaQsoCallCq');
        const btnSP = document.getElementById('btnSubModeSP');
        const btnRUN = document.getElementById('btnSubModeRUN');
        const selectEl = document.getElementById('cacciaQsoSubModeSelect');

        if (selectEl) selectEl.value = newSubMode;

        // Interrompe eventuali trasmissioni in corso al cambio modo
        window.clearCacciaQsoStationAudio();

        if (newSubMode === 'run') {
            // In RUN mode le stazioni di banda S&P non chiamano CQ autonomamente
            state.stations = [];
            if (cqBtn) cqBtn.style.display = 'block';
            if (btnRUN) {
                btnRUN.style.background = '#9575cd';
                btnRUN.style.color = '#ffffff';
                btnRUN.style.border = '2px solid #9575cd';
            }
            if (btnSP) {
                btnSP.style.background = 'rgba(255,255,255,0.05)';
                btnSP.style.color = '#aaaaaa';
                btnSP.style.border = '1px solid rgba(255,255,255,0.2)';
            }
        } else {
            // Torna in S&P: rigenera stazioni che chiamano CQ sulla banda
            window.generateCacciaQsoStations();
            if (cqBtn) cqBtn.style.display = 'none';
            if (btnSP) {
                btnSP.style.background = '#4caf50';
                btnSP.style.color = '#ffffff';
                btnSP.style.border = '2px solid #4caf50';
            }
            if (btnRUN) {
                btnRUN.style.background = 'rgba(255,255,255,0.05)';
                btnRUN.style.color = '#aaaaaa';
                btnRUN.style.border = '1px solid rgba(255,255,255,0.2)';
            }
        }
    };

    /**
     * TRASMISSIONE CQ DELL'UTENTE IN MODALITÀ RUN MODE
     * (Simula Pile-Up con 2 - 4 stazioni chiamanti su frequenze attorno al VFO)
     */
    window.triggerCacciaQsoRunCq = function() {
        const state = window.cacciaQsoState;
        if (!state.radioOn || state.isUserTransmitting) return;

        const myCallInput = document.getElementById('cacciaQsoMyCallInput');
        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "IU2XYZ");

        // Protocollo Contest Reale: CQ TEST [MY_CALL] [MY_CALL] TEST
        const cqText = `CQ TEST ${myCall} ${myCall} TEST`;
        state.currentQsoStep = 'IDLE';
        state.activeStation = null;

        // Pulisce eventuali vecchie stazioni già completate
        state.stations = state.stations.filter(st => !st.completed);

        window.playCacciaQsoUserSidetone(cqText, () => {
            setTimeout(() => {
                if (!state.radioOn || state.subMode !== 'run') return;

                // Se ci sono già chiamanti rimasti dal pile-up precedente, aggiungi al massimo 1-2 nuovi chiamanti
                const existingCount = state.stations.length;
                const numNewCallers = existingCount > 0
                    ? Math.floor(Math.random() * 2) // 0 o 1 nuovo chiamante
                    : Math.floor(2 + Math.random() * 3); // 2, 3 o 4 chiamanti iniziali

                const userWpm = window.getCacciaQsoWpm();
                const rstReports = ['5NN', '5NN', '5NN', '58N', '57N', '5NN'];

                for (let k = 0; k < numNewCallers; k++) {
                    let callsign = (typeof window.generateRealisticCallsign === 'function')
                        ? window.generateRealisticCallsign().split('/')[0]
                        : `IK2${String.fromCharCode(65 + Math.floor(Math.random()*26))}${String.fromCharCode(65 + Math.floor(Math.random()*26))}`;

                    // Evita duplicati nel pile-up attivo
                    while (state.stations.some(s => s.callsign === callsign)) {
                        callsign = (typeof window.generateRealisticCallsign === 'function')
                            ? window.generateRealisticCallsign().split('/')[0]
                            : `I4${Math.floor(100 + Math.random()*899)}`;
                    }

                    // Offset realistico rispetto al VFO (-220 Hz .. +220 Hz)
                    const randomOffsetHz = Math.floor(-220 + Math.random() * 440);
                    const callerSt = {
                        id: `run_st_${Date.now()}_${k}_${Math.random()}`,
                        callsign: callsign,
                        freqHz: state.vfoFreqHz + randomOffsetHz,
                        wpm: userWpm,
                        toneHz: Math.floor(550 + Math.random() * 250),
                        sMeterBase: Math.floor(5 + Math.random() * 5),
                        qsbSpeedSec: parseFloat((3 + Math.random() * 4).toFixed(1)),
                        rst: rstReports[Math.floor(Math.random() * rstReports.length)],
                        serialNum: String(Math.floor(1 + Math.random() * 85)).padStart(3, '0'),
                        isCallingCq: false,
                        isPlayingMorse: false,
                        isPartialRepeat: false,
                        playToken: 0,
                        completed: false
                    };
                    state.stations.push(callerSt);
                }

                if (state.stations.length > 0) {
                    state.currentQsoStep = 'LISTENING';
                    // Tutte le stazioni del pile-up chiamano simultaneamente con un leggero sfasamento naturale (0-250ms)
                    state.stations.forEach((st, idx) => {
                        setTimeout(() => {
                            if (state.radioOn && state.subMode === 'run' && state.currentQsoStep === 'LISTENING' && !st.completed) {
                                const freqDiff = Math.abs(st.freqHz - state.vfoFreqHz);
                                window.playCacciaQsoStationMorse(st, freqDiff, 1.0);
                            }
                        }, idx * 85);
                    });
                }
            }, 400);
        });
    };

    /**
     * GENERATORE PROCEDURALE DI STAZIONI RADIO 40M (7.000 MHz - 7.200 MHz) - USATO IN S&P MODE
     */
    window.generateCacciaQsoStations = function() {
        const count = 22;
        let newStations = [];
        const userWpm = window.getCacciaQsoWpm();
        const isRunMode = window.cacciaQsoState.subMode === 'run';

        if (isRunMode) {
            window.cacciaQsoState.stations = [];
            return;
        }

        for (let i = 0; i < count; i++) {
            let callsign = (typeof window.generateRealisticCallsign === 'function')
                ? window.generateRealisticCallsign()
                : `IU2XYZ_${i}`;

            callsign = callsign.split('/')[0];

            let freqHz = Math.floor(7002000 + Math.random() * 196000);

            // SIMULATORE PILE-UP ADIACENTE: Il 30% delle stazioni si genera a 110-290 Hz da un'altra
            if (i > 0 && Math.random() < 0.30) {
                const partnerFreq = newStations[Math.floor(Math.random() * newStations.length)].freqHz;
                const offset = (Math.random() < 0.5 ? 1 : -1) * Math.floor(110 + Math.random() * 180);
                freqHz = partnerFreq + offset;
            }

            const toneHz = Math.floor(550 + Math.random() * 250);
            const sMeterBase = Math.floor(3 + Math.random() * 7);
            const qsbSpeedSec = (3 + Math.random() * 5).toFixed(1);
            const rstReports = ['5NN', '58N', '57N', '55N', '5NN', '5NN', '47N'];
            const rst = rstReports[Math.floor(Math.random() * rstReports.length)];
            const serialNum = String(Math.floor(1 + Math.random() * 85)).padStart(3, '0');

            newStations.push({
                id: `st_${Date.now()}_${i}`,
                callsign: callsign,
                freqHz: freqHz,
                wpm: userWpm,
                toneHz: toneHz,
                sMeterBase: sMeterBase,
                qsbSpeedSec: parseFloat(qsbSpeedSec),
                rst: rst,
                serialNum: serialNum,
                isCallingCq: true,
                isPlayingMorse: false,
                isPartialRepeat: false,
                playToken: 0,
                completed: false
            });
        }

        window.cacciaQsoState.stations = newStations;
        console.log("Caccia QSO: Generated 40m Band Stations (WPM: " + userWpm + ") ->", newStations);
    };

    /**
     * ACCENSIONE / SPEGNIMENTO RADIO & AUDIO ENGINE
     */
    window.toggleCacciaQsoPower = function(forceState = null) {
        const state = window.cacciaQsoState;
        state.radioOn = (forceState !== null) ? forceState : !state.radioOn;

        const powerBtn = document.getElementById('cacciaQsoPowerBtn');
        const displayEl = document.getElementById('cacciaQsoFreqDisplay');
        const dialEl = document.getElementById('cacciaQsoVfoCanvas');

        if (state.radioOn) {
            if (powerBtn) {
                powerBtn.classList.remove('btn-danger');
                powerBtn.classList.add('btn-success');
                powerBtn.textContent = '📻 RADIO ACCESA [ON]';
            }
            if (displayEl) displayEl.style.opacity = '1';
            if (dialEl) dialEl.style.opacity = '1';

            window.initCacciaQsoAudioEngine();
            window.startCacciaQsoAudioLoop();
            window.startCacciaQsoTimer();
        } else {
            if (powerBtn) {
                powerBtn.classList.remove('btn-success');
                powerBtn.classList.add('btn-danger');
                powerBtn.textContent = '📻 ACCENDI RADIO [OFF]';
            }
            if (displayEl) displayEl.style.opacity = '0.3';
            if (dialEl) dialEl.style.opacity = '0.3';

            window.stopCacciaQsoAudioEngine();
            if (state.timerInterval) {
                clearInterval(state.timerInterval);
                state.timerInterval = null;
            }
        }
    };

    /**
     * AUDIO ENGINE - RUMORE DI FONDO RADIO (QRN) CONTINUO E INDIPENDENTE
     */
    window.initCacciaQsoAudioEngine = function() {
        const state = window.cacciaQsoState;
        if (!state.audioCtx) {
            state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }

        if (state.noiseNode) return;

        try {
            const bufferSize = state.audioCtx.sampleRate * 2;
            const noiseBuffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = (Math.random() * 2 - 1) * 0.18;
            }

            state.noiseNode = state.audioCtx.createBufferSource();
            state.noiseNode.buffer = noiseBuffer;
            state.noiseNode.loop = true;

            state.noiseFilter = state.audioCtx.createBiquadFilter();
            state.noiseFilter.type = 'bandpass';
            state.noiseFilter.frequency.value = 600;
            state.noiseFilter.Q.value = 2.8;

            state.noiseGain = state.audioCtx.createGain();
            state.noiseGain.gain.value = 0.08;

            state.noiseNode.connect(state.noiseFilter);
            state.noiseFilter.connect(state.noiseGain);
            state.noiseGain.connect(state.audioCtx.destination);

            state.noiseNode.start();
        } catch (e) {
            console.warn("Caccia QSO: Audio Engine Init Error:", e);
        }
    };

    window.stopCacciaQsoAudioEngine = function() {
        const state = window.cacciaQsoState;
        if (state.noiseNode) {
            try { state.noiseNode.stop(); } catch(e){}
            state.noiseNode = null;
        }
        window.clearCacciaQsoStationAudio();
    };

    window.clearCacciaQsoStationAudio = function() {
        const state = window.cacciaQsoState;
        state.stations.forEach(st => {
            st.playToken = (st.playToken || 0) + 1;
            st.isPlayingMorse = false;
        });
    };

    /**
     * AUDIO LOOP & MONITOR S-METER REALISTICO
     */
    window.startCacciaQsoAudioLoop = function() {
        if (window.cacciaQsoAudioInterval) clearInterval(window.cacciaQsoAudioInterval);

        window.cacciaQsoAudioInterval = setInterval(() => {
            const state = window.cacciaQsoState;
            if (!state.radioOn || !state.audioCtx) return;

            const vfo = state.vfoFreqHz;
            const timeSec = Date.now() / 1000;

            // SILENZIO TOTALE RICEZIONE DURANTE TRASMISSIONE OPERATORE (QSK / PTT)
            if (state.isUserTransmitting) {
                if (state.noiseGain) {
                    try {
                        state.noiseGain.gain.setValueAtTime(0, state.audioCtx.currentTime);
                    } catch(e){}
                }
                window.updateCacciaQsoSMeter(10);
                return;
            }

            // FLUTTUAZIONE RUMORE DI FONDO QRN
            const qrnFluctuation = 0.05 + 0.06 * Math.sin(timeSec * 0.3) + 0.03 * Math.random();
            if (state.noiseGain) {
                try {
                    state.noiseGain.gain.setValueAtTime(qrnFluctuation, state.audioCtx.currentTime);
                } catch(e){}
            }

            let qrnSValue = Math.round(1 + (qrnFluctuation * 12));
            let totalSignalVal = qrnSValue;
            let currentSintonizedStation = null;

            const isQsoActive = (state.activeStation && (state.currentQsoStep === 'CALL_MATCHED' || state.currentQsoStep === 'COMPLETED'));

            state.stations.forEach(st => {
                if (st.completed) return;
                if (isQsoActive && st !== state.activeStation) return;

                const freqDiffHz = Math.abs(st.freqHz - vfo);

                // SELETTIVITÀ FILTRO CW RICEVITORE
                let proximityFactor = 0;
                if (freqDiffHz <= 100) {
                    proximityFactor = 1.0;
                } else if (freqDiffHz <= 320) {
                    const normOff = (freqDiffHz - 100) / 220;
                    proximityFactor = Math.max(0, 1 - (normOff * normOff));
                }

                if (proximityFactor > 0) {
                    const qsbPhase = timeSec * (2 * Math.PI / st.qsbSpeedSec);
                    const qsbFactor = 0.15 + 0.85 * Math.abs(Math.sin(qsbPhase));

                    const effectiveS = Math.round(st.sMeterBase * proximityFactor * qsbFactor);
                    totalSignalVal = Math.max(totalSignalVal, effectiveS);

                    if (freqDiffHz <= 160) {
                        currentSintonizedStation = st;
                    }

                    // In S&P Mode le stazioni chiamano CQ in loop finché non vengono agganciate
                    if (state.subMode === 'search_pounce' && st.isCallingCq && proximityFactor > 0.05 && !st.isPlayingMorse) {
                        window.playCacciaQsoStationMorse(st, freqDiffHz, proximityFactor * qsbFactor);
                    }
                }
            });

            window.updateCacciaQsoSMeter(totalSignalVal);

            // Aggiorna la stazione sintonizzata in S&P mode solo se non siamo già nel mezzo di un QSO
            if (state.subMode === 'search_pounce' && !isQsoActive && currentSintonizedStation !== state.activeStation) {
                state.activeStation = currentSintonizedStation;
                if (currentSintonizedStation) {
                    state.currentQsoStep = 'LISTENING';
                } else {
                    state.currentQsoStep = 'IDLE';
                }
            }
        }, 120);
    };

    /**
     * SINTESI SUONO MORSE STAZIONE (CONFORMITÀ PROTOCOLLO CONTEST CW)
     */
    window.playCacciaQsoStationMorse = function(station, initialFreqDiffHz, initialVolume) {
        const state = window.cacciaQsoState;
        if (!state.radioOn || !state.audioCtx || station.isPlayingMorse || state.isUserTransmitting) return;

        station.isPlayingMorse = true;
        station.playToken = (station.playToken || 0) + 1;
        const currentToken = station.playToken;

        const myCallInput = document.getElementById('cacciaQsoMyCallInput');
        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "IU2XYZ");

        let textToPlay = "";

        if (state.currentQsoStep === 'CALL_MATCHED' && state.activeStation === station) {
            if (state.subMode === 'run') {
                // RUN MODE: La stazione chiamata conferma e manda il suo exchange -> R [RST] [SERIAL]
                textToPlay = `R ${station.rst} ${station.serialNum}`;
            } else {
                // S&P MODE: La stazione CQer risponde al tuo nominativo -> [MY_CALL] [RST] [SERIAL]
                textToPlay = `${myCall} ${station.rst} ${station.serialNum}`;
            }
        } else if (state.currentQsoStep === 'COMPLETED' && state.activeStation === station) {
            if (state.subMode === 'run') {
                // RUN MODE: La stazione chiamata ha finito, non trasmette più nulla
                textToPlay = "";
            } else {
                // S&P MODE: La stazione CQer ringrazia e si rimette in ascolto -> TU [STATION_CALL] TEST
                textToPlay = `TU ${station.callsign} TEST`;
            }
        } else if (station.isPartialRepeat) {
            // RISPOSTA A CHIAMATA PARZIALE ("XYZ ?"): La stazione ripete due volte il suo nominativo completo
            textToPlay = `${station.callsign} ${station.callsign}`;
            station.isPartialRepeat = false;
        } else if (state.subMode === 'run') {
            // RUN MODE: Risposta al CQ dell'utente -> invia solo il proprio nominativo
            textToPlay = `${station.callsign}`;
        } else {
            // S&P MODE: Chiamata CQ Contest standard -> CQ CQ TEST [STATION_CALL] [STATION_CALL] TEST
            textToPlay = `CQ CQ TEST ${station.callsign} ${station.callsign} TEST`;
        }

        if (!textToPlay) {
            station.isPlayingMorse = false;
            return;
        }

        const currentWpm = window.getCacciaQsoWpm();
        const unitSec = 1.2 / currentWpm;
        let delayMs = 0;

        const cleanText = textToPlay.toUpperCase();
        const morseDict = window.morseDict || {};

        for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText[i];
            if (char === ' ') {
                delayMs += unitSec * 4 * 1000;
                continue;
            }

            const code = morseDict[char] || morseDict[char.toUpperCase()];
            if (!code) continue;

            for (let j = 0; j < code.length; j++) {
                const symbol = code[j];
                const durMs = (symbol === '-') ? (unitSec * 3 * 1000) : (unitSec * 1000);

                setTimeout(() => {
                    if (currentToken !== station.playToken || !state.radioOn || !state.audioCtx || state.isUserTransmitting) return;

                    const realTimeFreqDiff = Math.abs(station.freqHz - state.vfoFreqHz);
                    let realTimeProximity = 0;

                    if (realTimeFreqDiff <= 100) {
                        realTimeProximity = 1.0;
                    } else if (realTimeFreqDiff <= 320) {
                        const normOff = (realTimeFreqDiff - 100) / 220;
                        realTimeProximity = Math.max(0, 1 - (normOff * normOff));
                    }

                    if (realTimeProximity <= 0) return;

                    try {
                        const timeSec = Date.now() / 1000;
                        const qsbPhase = timeSec * (2 * Math.PI / station.qsbSpeedSec);
                        const qsbFactor = 0.15 + 0.85 * Math.abs(Math.sin(qsbPhase));

                        const beatTone = Math.max(300, Math.min(1200, 600 + (station.freqHz - state.vfoFreqHz)));
                        const osc = state.audioCtx.createOscillator();
                        const gain = state.audioCtx.createGain();
                        osc.type = 'sine';
                        osc.frequency.value = beatTone;

                        const targetVol = 0.15 * realTimeProximity * qsbFactor;
                        const now = state.audioCtx.currentTime;
                        const start = now + 0.005;
                        const durSec = durMs / 1000;
                        const end = start + durSec;

                        gain.gain.setValueAtTime(0.001, start);
                        gain.gain.linearRampToValueAtTime(targetVol, start + 0.005);
                        gain.gain.setValueAtTime(targetVol, Math.max(start + 0.006, end - 0.005));
                        gain.gain.linearRampToValueAtTime(0.001, end);

                        osc.connect(gain);
                        gain.connect(state.audioCtx.destination);

                        osc.start(start);
                        osc.stop(end);
                    } catch(e){}
                }, delayMs);

                delayMs += durMs + (unitSec * 1000);
            }
            delayMs += unitSec * 2 * 1000;
        }

        // Pausa tra una ripetizione e l'altra (più breve in RUN mode, standard in S&P CQ)
        const pauseAfterMsgMs = (state.subMode === 'search_pounce' && state.currentQsoStep !== 'CALL_MATCHED' && state.currentQsoStep !== 'COMPLETED') ? 1600 : 700;

        setTimeout(() => {
            if (currentToken === station.playToken) {
                station.isPlayingMorse = false;
                if (state.currentQsoStep === 'COMPLETED' && state.activeStation === station) {
                    station.completed = true;
                    state.currentQsoStep = 'IDLE';
                    state.activeStation = null;
                }
            }
        }, delayMs + pauseAfterMsgMs);
    };

    /**
     * SINTESI MORSE TRASMISSIONE LOCALE OPERATORE (SIDETONE TASTO UTENTE)
     */
    window.playCacciaQsoUserSidetone = function(text, onCompleteCallback) {
        const state = window.cacciaQsoState;
        const inputEl = document.getElementById('cacciaQsoCallInput');

        state.isUserTransmitting = true;

        if (!state.radioOn || !state.audioCtx) {
            state.isUserTransmitting = false;
            if (onCompleteCallback) onCompleteCallback();
            return;
        }

        if (inputEl) inputEl.disabled = true;

        const cleanText = String(text || "").toUpperCase();
        const morseDict = window.morseDict || {};
        const wpm = window.getCacciaQsoWpm();
        const unitSec = 1.2 / wpm;
        const sidetoneFreq = 650;
        let delayMs = 0;

        for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText[i];
            if (char === ' ') {
                delayMs += unitSec * 4 * 1000;
                continue;
            }

            const code = morseDict[char] || morseDict[char.toUpperCase()];
            if (!code) continue;

            for (let j = 0; j < code.length; j++) {
                const symbol = code[j];
                const durMs = (symbol === '-') ? (unitSec * 3 * 1000) : (unitSec * 1000);

                setTimeout(() => {
                    if (state.radioOn && state.audioCtx) {
                        try {
                            const osc = state.audioCtx.createOscillator();
                            const gain = state.audioCtx.createGain();
                            osc.type = 'sine';
                            osc.frequency.value = sidetoneFreq;

                            const targetVol = 0.22;
                            const now = state.audioCtx.currentTime;
                            const start = now + 0.005;
                            const durSec = durMs / 1000;
                            const end = start + durSec;

                            gain.gain.setValueAtTime(0.001, start);
                            gain.gain.linearRampToValueAtTime(targetVol, start + 0.005);
                            gain.gain.setValueAtTime(targetVol, Math.max(start + 0.006, end - 0.005));
                            gain.gain.linearRampToValueAtTime(0.001, end);

                            osc.connect(gain);
                            gain.connect(state.audioCtx.destination);

                            osc.start(start);
                            osc.stop(end);

                            window.updateCacciaQsoSMeter(10);
                        } catch(e){}
                    }
                }, delayMs);

                delayMs += durMs + (unitSec * 1000);
            }
            delayMs += unitSec * 2 * 1000;
        }

        setTimeout(() => {
            state.isUserTransmitting = false;
            if (inputEl) {
                inputEl.disabled = false;
                // Mantieni il focus sul campo appropriato dopo la trasmissione
                if (state.currentQsoStep !== 'CALL_MATCHED') {
                    inputEl.focus();
                }
            }
            if (onCompleteCallback) onCompleteCallback();
        }, delayMs + 250);
    };

    /**
     * MORSE RUNNER STILE: GESTIONE INVIO NOMINATIVO (EXACT, PARTIAL CON "?", MISS)
     */
    window.handleCacciaQsoCallEnter = function(e) {
        if (e && (e.key === 'Enter' || e.key === 'Tab')) {
            if (e.preventDefault) e.preventDefault();
        }

        const state = window.cacciaQsoState;
        if (!state.radioOn || state.isUserTransmitting) return;

        // Se siamo già in CALL_MATCHED, Invio/Tab completa il QSO
        if (state.currentQsoStep === 'CALL_MATCHED') {
            window.handleCacciaQsoSubmit();
            return;
        }

        const callInput = document.getElementById('cacciaQsoCallInput');
        const rstInput = document.getElementById('cacciaQsoRstInput');
        const nrInput = document.getElementById('cacciaQsoNrInput');
        const myCallInput = document.getElementById('cacciaQsoMyCallInput');

        if (!callInput) return;

        const val = callInput.value.trim().toUpperCase();
        if (!val) return;

        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "IU2XYZ");
        const mySerialFormatted = String(state.mySerialNum).padStart(3, '0');

        // Cerca la stazione con il miglior punteggio di corrispondenza in banda passante (<= 350 Hz)
        const candidateStations = state.stations.filter(st => !st.completed && Math.abs(st.freqHz - state.vfoFreqHz) <= 350);
        let bestSt = null;
        let bestMatch = { exact: false, partial: false, score: 0 };

        candidateStations.forEach(st => {
            const matchRes = evaluateCallMatch(val, st.callsign);
            if (matchRes.score > bestMatch.score) {
                bestMatch = matchRes;
                bestSt = st;
            }
        });

        // Determina cosa trasmette l'operatore in base al modo e al tipo di match
        let txMessage = "";
        if (bestSt && bestMatch.exact) {
            // Nominativo esatto:
            // In RUN mode mando subito "[CALL] 5NN [SERIAL]"
            // In S&P mode mando il mio nominativo "[MY_CALL]"
            txMessage = (state.subMode === 'run') ? `${val} 5NN ${mySerialFormatted}` : `${myCall}`;
        } else if (bestSt && bestMatch.partial) {
            // Nominativo parziale (es. "XYZ"): mando "[PARZIALE] ?" per chiedere conferma
            txMessage = `${val} ?`;
        } else {
            // Nessun match: in RUN mando comunque quello che ho digitato con "?", in S&P chiamo comunque con il mio nominativo
            txMessage = (state.subMode === 'run') ? `${val} ?` : `${myCall}`;
        }

        // Silenzia immediatamente le stazioni in ricezione mentre trasmetto
        window.clearCacciaQsoStationAudio();

        window.playCacciaQsoUserSidetone(txMessage, () => {
            // CASO A: NOMINATIVO ESATTO (100% MATCH)
            if (bestSt && bestMatch.exact) {
                state.activeStation = bestSt;
                state.currentQsoStep = 'CALL_MATCHED';
                bestSt.isPlayingMorse = false;
                bestSt.isPartialRepeat = false;

                if (rstInput) rstInput.value = '5NN';
                if (nrInput) {
                    nrInput.value = '';
                    nrInput.focus();
                }

                // La stazione risponde con il suo exchange
                setTimeout(() => {
                    if (state.radioOn && state.activeStation === bestSt) {
                        window.playCacciaQsoStationMorse(bestSt, 0, 1.0);
                    }
                }, 350);
            }
            // CASO B: NOMINATIVO PARZIALE (es. suffisso o prefisso copiato nel pile-up)
            else if (bestSt && bestMatch.partial) {
                state.activeStation = bestSt;
                state.currentQsoStep = 'LISTENING';
                bestSt.isPlayingMorse = false;
                bestSt.isPartialRepeat = true; // Ripeterà "[FULL_CALL] [FULL_CALL]"

                if (callInput) callInput.focus();

                setTimeout(() => {
                    if (state.radioOn) {
                        window.playCacciaQsoStationMorse(bestSt, 0, 1.0);
                    }
                }, 350);
            }
            // CASO C: NESSUNA CORRISPONDENZA VALIDA
            else {
                if (state.subMode === 'search_pounce') {
                    state.activeStation = null;
                    state.currentQsoStep = 'IDLE';
                }
                if (callInput) callInput.focus();
            }
        });
    };

    window.handleCacciaQsoRstEnter = function(e) {
        if (e && (e.key === 'Enter' || e.key === 'Tab')) {
            if (e.preventDefault) e.preventDefault();
        }
        const nrInput = document.getElementById('cacciaQsoNrInput');
        if (nrInput && document.activeElement !== nrInput) {
            nrInput.focus();
        } else {
            window.handleCacciaQsoSubmit();
        }
    };

    window.handleCacciaQsoNrEnter = function(e) {
        if (e && (e.key === 'Enter' || e.key === 'Tab')) {
            if (e.preventDefault) e.preventDefault();
        }
        window.handleCacciaQsoSubmit();
    };

    window.handleCacciaQsoSubmit = function() {
        const state = window.cacciaQsoState;
        if (!state.radioOn || state.isUserTransmitting) return;

        const callInput = document.getElementById('cacciaQsoCallInput');
        const rstInput = document.getElementById('cacciaQsoRstInput');
        const nrInput = document.getElementById('cacciaQsoNrInput');
        const badgeEl = document.getElementById('cacciaQsoMySerialBadge');
        const myCallInput = document.getElementById('cacciaQsoMyCallInput');

        if (!callInput) return;

        const callVal = callInput.value.trim().toUpperCase();
        const rstRcvdVal = rstInput ? rstInput.value.trim().toUpperCase() : '5NN';
        const nrRcvdVal = nrInput ? nrInput.value.trim().toUpperCase() : '';

        if (!callVal) {
            callInput.focus();
            return;
        }

        // Se non abbiamo ancora ricevuto l'exchange dalla stazione, esegui prima la chiamata
        if (state.currentQsoStep !== 'CALL_MATCHED' || !state.activeStation) {
            window.handleCacciaQsoCallEnter(null);
            return;
        }

        const st = state.activeStation;

        // STEP FINALE:
        // - In RUN mode: l'utente ha già inviato "5NN [SERIAL]", ora chiude con "TU [MY_CALL]"
        // - In S&P mode: l'utente invia il proprio exchange "5NN [MY_SERIAL]"
        const mySerialFormatted = String(state.mySerialNum).padStart(3, '0');
        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "IU2XYZ");

        const exchangeText = (state.subMode === 'run') ? `TU ${myCall}` : `5NN ${mySerialFormatted}`;
        st.playToken = (st.playToken || 0) + 1;
        st.isPlayingMorse = false;

        window.playCacciaQsoUserSidetone(exchangeText, () => {
            state.currentQsoStep = 'COMPLETED';
            st.completed = true;
            st.isPlayingMorse = false;

            // VERIFICA CORRISPONDENZA EXCHANGE INSERITO DALL'UTENTE
            const normRstUser = rstRcvdVal.replace(/599/g, "5NN");
            const normRstStation = String(st.rst).toUpperCase().replace(/599/g, "5NN");

            const normNrUser = parseInt(nrRcvdVal, 10) || 0;
            const normNrStation = parseInt(st.serialNum, 10) || 0;

            const isRstOk = (normRstUser === normRstStation);
            const isNrOk = (normNrUser === normNrStation && nrRcvdVal !== '');
            const isExchangeCorrect = isRstOk && isNrOk;

            let errDetail = '';
            if (!isRstOk && !isNrOk) errDetail = 'ERR: RST+NR';
            else if (!isRstOk) errDetail = 'ERR: RST';
            else if (!isNrOk) errDetail = 'ERR: NR';

            const ptsGain = isExchangeCorrect ? Math.round(100 + (st.wpm * 2) + (st.sMeterBase * 5)) : 0;

            state.totalPoints += ptsGain;
            state.qsoCompletedCount++;

            const logEntry = {
                num: state.qsoCompletedCount,
                time: new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}),
                callsign: st.callsign,
                freqKhz: (st.freqHz / 1000).toFixed(1),
                rstSent: '599',
                serialSent: mySerialFormatted,
                rstRcvd: rstRcvdVal || '---',
                serialRcvd: nrRcvdVal ? String(normNrUser).padStart(3, '0') : '---',
                pts: ptsGain,
                errDetail: errDetail
            };

            state.logbook.unshift(logEntry);
            state.mySerialNum++;

            if (badgeEl) badgeEl.textContent = String(state.mySerialNum).padStart(3, '0');
            if (rstInput) rstInput.value = '5NN';
            if (nrInput) nrInput.value = '';
            if (callInput) {
                callInput.value = '';
                callInput.focus();
            }

            window.renderCacciaQsoLogbook();
            window.updateCacciaQsoScoreUI();

            if (state.subMode !== 'run') {
                // S&P: la stazione chiude con "TU [CALL] TEST"
                setTimeout(() => {
                    if (state.radioOn) {
                        window.playCacciaQsoStationMorse(st, 0, 1.0);
                    }
                }, 300);

                // Rigenera nuove stazioni ogni 4 QSO in S&P
                if (state.qsoCompletedCount % 4 === 0) {
                    setTimeout(() => {
                        if (state.radioOn && state.subMode !== 'run') {
                            window.generateCacciaQsoStations();
                        }
                    }, 2500);
                }
            } else {
                // RUN MODE: Controlla se ci sono altre stazioni rimaste nel pile-up attivo
                state.currentQsoStep = 'IDLE';
                state.activeStation = null;
                const remainingCallers = state.stations.filter(s => !s.completed);

                if (remainingCallers.length > 0) {
                    // Altre stazioni del pile-up richiamano subito dopo il tuo "TU [MY_CALL]"
                    setTimeout(() => {
                        if (state.radioOn && state.subMode === 'run' && state.currentQsoStep === 'IDLE') {
                            state.currentQsoStep = 'LISTENING';
                            remainingCallers.forEach((remSt, idx) => {
                                setTimeout(() => {
                                    if (state.radioOn && state.subMode === 'run' && state.currentQsoStep === 'LISTENING' && !remSt.completed) {
                                        const freqDiff = Math.abs(remSt.freqHz - state.vfoFreqHz);
                                        window.playCacciaQsoStationMorse(remSt, freqDiff, 1.0);
                                    }
                                }, idx * 90);
                            });
                        }
                    }, 500);
                } else {
                    // Pile-up esaurito: l'operatore rilancia automaticamente CQ TEST
                    setTimeout(() => {
                        if (state.radioOn && state.subMode === 'run' && state.currentQsoStep === 'IDLE') {
                            window.triggerCacciaQsoRunCq();
                        }
                    }, 900);
                }
            }
        });
    };

    /**
     * SINTONIA VFO & GESTIONE DIAL FLUIDA (TOUCH / MOUSE / WHEEL)
     */
    window.initCacciaQsoUI = function() {
        const dialCanvas = document.getElementById('cacciaQsoVfoCanvas');
        if (!dialCanvas) return;

        const ctx = dialCanvas.getContext('2d');
        window.drawCacciaQsoDial(ctx, window.cacciaQsoState.vfoKnobAngle);

        const handleStart = (e) => {
            window.cacciaQsoState.isVfoDragging = true;
            const rect = dialCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const x = clientX - (rect.left + rect.width / 2);
            const y = clientY - (rect.top + rect.height / 2);

            window.cacciaQsoState.vfoLastTouchAngle = Math.atan2(y, x);
        };

        const handleMove = (e) => {
            if (!window.cacciaQsoState.isVfoDragging) return;
            const rect = dialCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const x = clientX - (rect.left + rect.width / 2);
            const y = clientY - (rect.top + rect.height / 2);

            const currentTouchAngle = Math.atan2(y, x);
            let angleDelta = currentTouchAngle - window.cacciaQsoState.vfoLastTouchAngle;

            if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
            if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

            window.cacciaQsoState.vfoLastTouchAngle = currentTouchAngle;
            window.cacciaQsoState.vfoKnobAngle += angleDelta;

            const freqStep = Math.round((angleDelta / (2 * Math.PI)) * 10000);
            window.tuneCacciaQsoVfoBy(freqStep);

            window.drawCacciaQsoDial(ctx, window.cacciaQsoState.vfoKnobAngle);
        };

        const handleEnd = () => {
            window.cacciaQsoState.isVfoDragging = false;
        };

        dialCanvas.onmousedown = dialCanvas.ontouchstart = handleStart;

        if (!window._cacciaQsoListenersBound) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('touchmove', handleMove, { passive: true });
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchend', handleEnd);
            window._cacciaQsoListenersBound = true;
        }

        dialCanvas.onwheel = (e) => {
            e.preventDefault();
            const step = e.deltaY < 0 ? 50 : -50;
            window.tuneCacciaQsoVfoBy(step);
            window.cacciaQsoState.vfoKnobAngle += (step > 0 ? 0.1 : -0.1);
            window.drawCacciaQsoDial(ctx, window.cacciaQsoState.vfoKnobAngle);
        };

        window.updateCacciaQsoFreqDisplay();
    };

    window.drawCacciaQsoDial = function(ctx, angle) {
        if (!ctx) return;
        const w = ctx.canvas.width = 160;
        const h = ctx.canvas.height = 160;
        const cx = w / 2, cy = h / 2, r = 70;

        ctx.clearRect(0, 0, w, h);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#222';
        ctx.fill();
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.arc(0, -r + 18, 10, 0, 2 * Math.PI);
        ctx.fillStyle = '#00bcd4';
        ctx.fill();

        for (let a = 0; a < 360; a += 30) {
            const rad = a * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rad) * (r - 12), Math.sin(rad) * (r - 12));
            ctx.lineTo(Math.cos(rad) * (r - 4), Math.sin(rad) * (r - 4));
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    };

    window.tuneCacciaQsoVfoBy = function(stepHz) {
        window.tuneCacciaQsoVfoTo(window.cacciaQsoState.vfoFreqHz + stepHz);
    };

    window.tuneCacciaQsoVfoTo = function(targetFreqHz) {
        const clamped = Math.max(7000000, Math.min(7200000, targetFreqHz));
        window.cacciaQsoState.vfoFreqHz = clamped;
        window.updateCacciaQsoFreqDisplay();
    };

    window.updateCacciaQsoFreqDisplay = function() {
        const freqEl = document.getElementById('cacciaQsoFreqDisplay');
        if (!freqEl) return;

        const hz = window.cacciaQsoState.vfoFreqHz;
        const mhz = (hz / 1000000).toFixed(5);
        const parts = mhz.split('.');
        const formatted = `0${parts[0]}.${parts[1].substring(0,3)}.${parts[1].substring(3,5)} MHz`;
        freqEl.textContent = formatted;
    };

    /**
     * UPDATE LANCETTA S-METER
     */
    window.updateCacciaQsoSMeter = function(sVal) {
        const needle = document.getElementById('cacciaQsoSMeterNeedle');
        const valText = document.getElementById('cacciaQsoSMeterText');
        if (!needle) return;

        const clampedS = Math.max(0, Math.min(10, sVal));
        const angle = -45 + (clampedS * 9);
        needle.style.transform = `rotate(${angle}deg)`;

        if (valText) {
            valText.textContent = clampedS >= 9 ? "S9+" : `S${clampedS}`;
        }
    };

    /**
     * RENDERING TABELLA LOGBOOK
     */
    window.renderCacciaQsoLogbook = function() {
        const bodyEl = document.getElementById('cacciaQsoLogTableBody');
        if (!bodyEl) return;

        bodyEl.innerHTML = '';
        window.cacciaQsoState.logbook.forEach(row => {
            const tr = document.createElement('tr');
            const statusLabel = row.pts > 0 ? `+${row.pts}` : `0 (${row.errDetail || 'ERR'})`;
            tr.innerHTML = `
                <td><b>${row.num}</b></td>
                <td>${row.time}</td>
                <td><b style="color:var(--link-color);">${row.callsign}</b></td>
                <td>${row.freqKhz} kHz</td>
                <td>${row.rstSent} / ${row.serialSent}</td>
                <td>${row.rstRcvd} / ${row.serialRcvd}</td>
                <td><b style="color:${row.pts > 0 ? '#4caf50' : '#f44336'};">${statusLabel}</b></td>
            `;
            bodyEl.appendChild(tr);
        });
    };

    window.updateCacciaQsoScoreUI = function() {
        const ptsEl = document.getElementById('cacciaQsoPointsDisplay');
        const qsoEl = document.getElementById('cacciaQsoCountDisplay');
        if (ptsEl) ptsEl.textContent = `Punti Contest: ${window.cacciaQsoState.totalPoints}`;
        if (qsoEl) qsoEl.textContent = `QSO: ${window.cacciaQsoState.qsoCompletedCount}`;
    };

    /**
     * TIMER CONTEST & FINE PARTITA
     */
    window.startCacciaQsoTimer = function() {
        if (window.cacciaQsoState.timerInterval) clearInterval(window.cacciaQsoState.timerInterval);

        window.cacciaQsoState.timerInterval = setInterval(() => {
            const state = window.cacciaQsoState;
            state.timeRemainingSec--;

            const timerEl = document.getElementById('cacciaQsoTimerDisplay');
            if (timerEl) {
                const mins = Math.floor(state.timeRemainingSec / 60);
                const secs = state.timeRemainingSec % 60;
                timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

                if (state.timeRemainingSec <= 60) {
                    timerEl.style.color = '#f44336';
                } else {
                    timerEl.style.color = 'var(--champ-color)';
                }
            }

            if (state.timeRemainingSec <= 0) {
                window.finishCacciaQsoGame();
            }
        }, 1000);
    };

    window.finishCacciaQsoGame = function() {
        const state = window.cacciaQsoState;
        if (state.timerInterval) clearInterval(state.timerInterval);
        if (window.cacciaQsoAudioInterval) clearInterval(window.cacciaQsoAudioInterval);

        window.toggleCacciaQsoPower(false);

        const msg = `🏁 CONTEST CONCLUSO!\n\nQSO Completati: ${state.qsoCompletedCount}\nPunti Totali: ${state.totalPoints} pt`;
        if (window.tg && window.tg.showAlert) window.tg.showAlert(msg); else alert(msg);

        // Salvataggio Unico Finale su Firebase
        if (state.totalPoints > 0 && window.myId && window.db) {
            const todayStr = (typeof window.getLocalDateString === 'function') ? window.getLocalDateString() : new Date().toISOString().split('T')[0];
            window.db.ref(`leaderboard/caccia_qso/${todayStr}/${window.myId}`).set({
                name: window.myName || "Operatore HF",
                score: state.totalPoints,
                qsos: state.qsoCompletedCount,
                durationMin: Math.round(state.sessionDurationSec / 60),
                date: todayStr,
                ts: Date.now()
            }).catch(() => {});
        }

        window.goBackToMenu();
    };

})();