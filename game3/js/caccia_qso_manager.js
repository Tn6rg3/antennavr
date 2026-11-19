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
     * RECUPERO E AGGIORNAMENTO VELOCITÀ WPM DINAMICA (15 - 60 WPM)
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
        // Permette di cambiare la durata solo a radio spenta o prima dell'avvio
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

        // Pre-compila la casella "Tuo Nominativo" con il nome dell'utente
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

        window.cacciaQsoState.sessionDurationSec = 600; // Predefinito: 10 minuti
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

        // Legge la modalita (S&P vs RUN)
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
        window.cacciaQsoState.subMode = newSubMode;
        const cqBtn = document.getElementById('btnCacciaQsoCallCq');
        const btnSP = document.getElementById('btnSubModeSP');
        const btnRUN = document.getElementById('btnSubModeRUN');
        const selectEl = document.getElementById('cacciaQsoSubModeSelect');

        if (selectEl) selectEl.value = newSubMode;

        // In RUN mode le stazioni NON devono chiamare CQ da sole!
        window.cacciaQsoState.stations.forEach(st => {
            if (newSubMode === 'run') st.isCallingCq = false;
            else st.isCallingCq = true;
        });

        if (newSubMode === 'run') {
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
     * (Simula Pile-Up con 2 - 4 stazioni chiamanti su frequenze CASUALI attorno al VFO)
     */
    window.triggerCacciaQsoRunCq = function() {
        const state = window.cacciaQsoState;
        if (!state.radioOn || state.isUserTransmitting) return;

        const myCallInput = document.getElementById('cacciaQsoMyCallInput');
        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "IU2XYZ");

        // L'utente chiama CQ in Morse: CQ TEST [MY_CALL] [MY_CALL] K
        const cqText = `CQ TEST ${myCall} ${myCall} K`;
        state.currentQsoStep = 'IDLE';
        state.activeStation = null;

        window.playCacciaQsoUserSidetone(cqText, () => {
            // Dopo la chiamata CQ in RUN mode, si genera un PILE-UP di 2 - 4 stazioni che trasmettono SOLO il proprio nominativo!
            setTimeout(() => {
                if (!state.radioOn || state.subMode !== 'run') return;

                const numCallers = Math.floor(2 + Math.random() * 3); // 2, 3 o 4 chiamanti
                let pileUpCallers = [];
                const userWpm = window.getCacciaQsoWpm();

                for (let k = 0; k < numCallers; k++) {
                    const callsign = (typeof window.generateRealisticCallsign === 'function')
                        ? window.generateRealisticCallsign().split('/')[0]
                        : `CALL_${k}`;

                    // Frequenza CASUALE sfalsata tra -280 Hz e +280 Hz rispetto al VFO
                    const randomOffsetHz = Math.floor(-280 + Math.random() * 560);
                    const callerSt = {
                        id: `run_st_${Date.now()}_${k}_${Math.random()}`,
                        callsign: callsign,
                        freqHz: state.vfoFreqHz + randomOffsetHz,
                        wpm: userWpm, // STESSA VELOCITÀ WPM IMPOSTATA DALL'UTENTE!
                        toneHz: Math.floor(550 + Math.random() * 250), // Tono audio 550-800Hz
                        sMeterBase: Math.floor(4 + Math.random() * 6), // S4 - S9
                        qsbSpeedSec: parseFloat((3 + Math.random() * 4).toFixed(1)),
                        rst: '5NN',
                        serialNum: String(Math.floor(1 + Math.random() * 75)).padStart(3, '0'),
                        isCallingCq: false, // In RUN mode le stazioni NON chiamano MAI CQ!
                        isPlayingMorse: false,
                        playToken: 0,
                        completed: false
                    };
                    state.stations.push(callerSt);
                    pileUpCallers.push(callerSt);
                }

                state.activeStation = pileUpCallers[0];
                state.currentQsoStep = 'LISTENING';

                // Le stazioni del pile-up trasmettono SIMULTANEAMENTE il proprio nominativo alla velocita WPM dell'utente!
                pileUpCallers.forEach(st => {
                    const freqDiff = Math.abs(st.freqHz - state.vfoFreqHz);
                    window.playCacciaQsoStationMorse(st, freqDiff, 1.0);
                });
            }, 500);
        });
    };

    /**
     * GENERATORE PROCEDURALE DI STAZIONI RADIO 40M (7.000 MHz - 7.200 MHz)
     */
    window.generateCacciaQsoStations = function() {
        const count = 22; // 22 stazioni sparse in 40m
        let newStations = [];
        const userWpm = window.getCacciaQsoWpm();
        const isRunMode = window.cacciaQsoState.subMode === 'run';

        for (let i = 0; i < count; i++) {
            let callsign = (typeof window.generateRealisticCallsign === 'function')
                ? window.generateRealisticCallsign()
                : `IU2XYZ_${i}`;

            callsign = callsign.split('/')[0];

            let freqHz = Math.floor(7002000 + Math.random() * 196000);

            // SIMULATORE PILE-UP: Il 30% delle stazioni si genera a soli 100-250 Hz da un'altra stazione!
            if (i > 0 && Math.random() < 0.30) {
                const partnerFreq = newStations[Math.floor(Math.random() * newStations.length)].freqHz;
                const offset = (Math.random() < 0.5 ? 1 : -1) * Math.floor(110 + Math.random() * 180);
                freqHz = partnerFreq + offset;
            }

            const toneHz = Math.floor(550 + Math.random() * 250); // 550 - 800 Hz
            const sMeterBase = Math.floor(3 + Math.random() * 7); // S3 - S9+
            const qsbSpeedSec = (3 + Math.random() * 5).toFixed(1); // Fading period 3-8 sec
            const rstReports = ['5NN', '58N', '57N', '55N', '5NN', '5NN', '47N'];
            const rst = rstReports[Math.floor(Math.random() * rstReports.length)];
            const serialNum = String(Math.floor(1 + Math.random() * 85)).padStart(3, '0');

            newStations.push({
                id: `st_${Date.now()}_${i}`,
                callsign: callsign,
                freqHz: freqHz,
                wpm: userWpm, // STESSA VELOCITÀ WPM DELL'UTENTE!
                toneHz: toneHz,
                sMeterBase: sMeterBase,
                qsbSpeedSec: parseFloat(qsbSpeedSec),
                rst: rst,
                serialNum: serialNum,
                isCallingCq: !isRunMode, // In RUN mode le stazioni NON chiamano mai CQ!
                isPlayingMorse: false,
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
            st.playToken++;
            st.isPlayingMorse = false;
        });
    };

    /**
     * AUDIO LOOP & MONITOR S-METER REALISTICO CON SILENZIAMENTO ISOLATO DURANTE QSO
     */
    window.startCacciaQsoAudioLoop = function() {
        if (window.cacciaQsoAudioInterval) clearInterval(window.cacciaQsoAudioInterval);

        window.cacciaQsoAudioInterval = setInterval(() => {
            const state = window.cacciaQsoState;
            if (!state.radioOn || !state.audioCtx) return;

            const vfo = state.vfoFreqHz;
            const timeSec = Date.now() / 1000;

            // SE L'UTENTE STA TRASMETTENDO IN LOCAL, SILENZIA SIA IL RUMORE DI FONDO QRN CHE LE STAZIONI (SILENZIO TOTALE PTT)!
            if (state.isUserTransmitting) {
                if (state.noiseGain) {
                    try {
                        state.noiseGain.gain.setValueAtTime(0, state.audioCtx.currentTime);
                    } catch(e){}
                }
                window.updateCacciaQsoSMeter(10);
                return;
            }

            // FLUTTUAZIONE RUMORE DI FONDO QRN (SE NON IN TRASMISSIONE OPERATORE)
            const qrnFluctuation = 0.05 + 0.06 * Math.sin(timeSec * 0.3) + 0.03 * Math.random();
            if (state.noiseGain) {
                try {
                    state.noiseGain.gain.setValueAtTime(qrnFluctuation, state.audioCtx.currentTime);
                } catch(e){}
            }

            let qrnSValue = Math.round(1 + (qrnFluctuation * 12));
            let totalSignalVal = qrnSValue;
            let currentSintonizedStation = null;

            // SE SIAMO IN UN QSO ATTIVO CON UNA STAZIONE BERSAGLIO, ISOLIAMO L'AUDIO ED IGNORIAMO LE ALTRE STAZIONI!
            const isQsoActive = (state.activeStation && (state.currentQsoStep === 'CALL_MATCHED' || state.currentQsoStep === 'COMPLETED'));

            state.stations.forEach(st => {
                // LA STAZIONE GIA' COLLEGATA COMPLETA VIENE RIMOSTA E TACITATA DEFINITIVAMENTE DALLA FREQUENZA!
                if (st.completed) return;

                // Se c'e un QSO attivo con la stazione bersaglio, silenzi le altre stazioni adiacenti
                if (isQsoActive && st !== state.activeStation) return;

                const freqDiffHz = Math.abs(st.freqHz - vfo);

                // SELETTIVITÀ FILTRO CW RICEVITORE:
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

                    // IN RUN MODE LE STAZIONI NON CHIAMANO MAI CQ AUTONOMAMENTE!
                    if (state.subMode === 'run') {
                        if (st === state.activeStation && !st.isPlayingMorse) {
                            window.playCacciaQsoStationMorse(st, freqDiffHz, proximityFactor * qsbFactor);
                        }
                    } else {
                        // S&P Mode (Caccia CQ)
                        if (st.isCallingCq && proximityFactor > 0.05 && !st.isPlayingMorse) {
                            window.playCacciaQsoStationMorse(st, freqDiffHz, proximityFactor * qsbFactor);
                        }
                    }
                }
            });

            // Aggiorna l'S-Meter
            window.updateCacciaQsoSMeter(totalSignalVal);

            // Aggiorna la stazione attiva sintonizzata in S&P mode
            if (state.subMode === 'search_pounce' && currentSintonizedStation !== state.activeStation) {
                state.activeStation = currentSintonizedStation;
                if (currentSintonizedStation && state.currentQsoStep === 'IDLE') {
                    state.currentQsoStep = 'LISTENING';
                }
            }
        }, 120);
    };

    /**
     * SINTESI SUONO MORSE STAZIONE (MORSE RUNNER CONTEST PROTOCOL)
     */
    window.playCacciaQsoStationMorse = function(station, initialFreqDiffHz, initialVolume) {
        const state = window.cacciaQsoState;
        if (!state.radioOn || !state.audioCtx || station.isPlayingMorse || state.isUserTransmitting) return;

        station.isPlayingMorse = true;
        station.playToken = (station.playToken || 0) + 1;
        const currentToken = station.playToken;

        const myCallInput = document.getElementById('cacciaQsoMyCallInput');
        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "OPERATOR");

        let textToPlay = "";
        if (state.currentQsoStep === 'CALL_MATCHED' && state.activeStation === station) {
            // STEP 3 MORSE RUNNER: [MY_CALL] 5NN [SERIAL_STAZIONE]
            textToPlay = `${myCall} ${station.rst} ${station.serialNum}`;
        } else if (state.currentQsoStep === 'COMPLETED' && state.activeStation === station) {
            if (state.subMode === 'run') {
                // IN RUN MODE: La stazione NON ripete nulla, si tace per sempre!
                textToPlay = "";
            } else {
                // STEP 5 MORSE RUNNER S&P: TU [STATION_CALL] K
                textToPlay = `TU ${station.callsign} K`;
            }
        } else if (state.subMode === 'run' && state.activeStation === station) {
            // IN RUN MODE: La stazione risponde al CQ dell'utente trasmettendo SOLO ED ESCLUSIVAMENTE il proprio nominativo!
            textToPlay = `${station.callsign}`;
        } else {
            // STEP 1 MORSE RUNNER S&P: CQ CQ CQ TEST [STATION_CALL] [STATION_CALL] K
            textToPlay = `CQ CQ CQ TEST ${station.callsign} ${station.callsign} K`;
        }

        if (!textToPlay) {
            station.isPlayingMorse = false;
            return;
        }

        const currentWpm = window.getCacciaQsoWpm(); // UGUALE ALLA VELOCITÀ IMPOSTATA DALL'UTENTE!
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

        setTimeout(() => {
            if (currentToken === station.playToken) {
                station.isPlayingMorse = false;
                // Se abbiamo appena completato il QSO, la stazione e ufficialmente completata e viene RIMOSTA dalla frequenza!
                if (state.currentQsoStep === 'COMPLETED' && state.activeStation === station) {
                    station.completed = true; // Rimuove definitivamente la stazione collegata
                    state.currentQsoStep = 'IDLE';
                    state.activeStation = null;
                }
            }
        }, delayMs + 1000);
    };

    /**
     * SINTESI MORSE TRASMISSIONE LOCALE OPERATORE (SIDETONE TASTO UTENTE CON SILENZIAMENTO RUMORE DI FONDO)
     */
    window.playCacciaQsoUserSidetone = function(text, onCompleteCallback) {
        const state = window.cacciaQsoState;
        const inputEl = document.getElementById('cacciaQsoCallInput');

        state.isUserTransmitting = true; // SILENZIA RUMORE DI FONDO QRN E ALTRE STAZIONI!

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
            state.isUserTransmitting = false; // SBLOCCA LA RICEZIONE PER LA RISPOSTA DELLA STAZIONE
            if (inputEl) inputEl.disabled = false;
            if (onCompleteCallback) onCompleteCallback();
        }, delayMs + 300);
    };

    /**
     * MORSE RUNNER STILE: AUTO-TAB & SUBMISSION PER I 3 CAMPI CONTEST (CALL - RST RX - NR RX)
     */
    window.handleCacciaQsoCallEnter = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        const callInput = document.getElementById('cacciaQsoCallInput');
        const rstInput = document.getElementById('cacciaQsoRstInput');
        const nrInput = document.getElementById('cacciaQsoNrInput');
        const myCallInput = document.getElementById('cacciaQsoMyCallInput');

        if (!callInput) return;

        const val = callInput.value.trim().toUpperCase();
        if (!val) return;

        const state = window.cacciaQsoState;
        const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "OPERATOR");

        // Trova la stazione corrispondente al nominativo inserito vicina al VFO
        let targetSt = state.activeStation;
        if (!targetSt || targetSt.callsign !== val) {
            targetSt = state.stations.find(st => !st.completed && st.callsign === val && Math.abs(st.freqHz - state.vfoFreqHz) <= 400);
        }

        if (!targetSt) {
            return;
        }

        // SILENZIA ED INTERROMPE TUTTE LE ALTRE STAZIONI IN FREQUENZA!
        state.stations.forEach(s => {
            s.playToken++;
            s.isPlayingMorse = false;
        });

        state.activeStation = targetSt;

        // 1. STEP 2 MORSE RUNNER: L'UTENTE TRASMETTE IL NOMINATIVO BERSAGLIO IN MORSE (es. DL3ABC)
        window.playCacciaQsoUserSidetone(val, () => {
            if (val === targetSt.callsign) {
                state.currentQsoStep = 'CALL_MATCHED';
                targetSt.isPlayingMorse = false;

                // Svuota i campi 2 e 3 per far compilare all'utente a orecchio
                if (rstInput) rstInput.value = '5NN';
                if (nrInput) {
                    nrInput.value = '';
                    nrInput.focus();
                }

                // STEP 3 MORSE RUNNER: LA STAZIONE BERSAGLIO RISPONDE IN MORSE -> [MY_CALL] 5NN [STATION_SERIAL]
                setTimeout(() => {
                    window.playCacciaQsoStationMorse(targetSt, 0, 1.0);
                }, 400);
            }
        });
    };

    window.handleCacciaQsoRstEnter = function(e) {
        if (e && (e.key === 'Enter' || e.key === 'Tab')) {
            if (e.preventDefault) e.preventDefault();
        }
        const state = window.cacciaQsoState;
        if (state.currentQsoStep === 'CALL_MATCHED') {
            window.handleCacciaQsoSubmit();
        } else {
            const nrInput = document.getElementById('cacciaQsoNrInput');
            if (nrInput) nrInput.focus();
        }
    };

    window.handleCacciaQsoNrEnter = function(e) {
        if (e && (e.key === 'Enter' || e.key === 'Tab')) {
            if (e.preventDefault) e.preventDefault();
        }
        window.handleCacciaQsoSubmit();
    };

    window.handleCacciaQsoSubmit = function() {
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

        const state = window.cacciaQsoState;
        if (!state.activeStation) {
            return;
        }

        const st = state.activeStation;

        // Se siamo ancora nello stato iniziale e l'utente clicca direttamente il pulsante grande
        if (state.currentQsoStep === 'LISTENING' || state.currentQsoStep === 'IDLE') {
            window.handleCacciaQsoCallEnter(null);
            return;
        }

        // STEP 4 MORSE RUNNER: L'UTENTE TRASMETTE IL PROPRIO EXCHANGE (5NN + MIO SERIALE PROGRESSIVO AUTOMATICO)
        if (state.currentQsoStep === 'CALL_MATCHED') {
            const mySerialFormatted = String(state.mySerialNum).padStart(3, '0');
            const myCall = (myCallInput && myCallInput.value.trim()) ? myCallInput.value.trim().toUpperCase() : (window.myName || "IU2XYZ");

            // IN RUN MODE L'UTENTE TRASMETTE "[MY_CALL] TU", IN S&P MODE TRASMETTE "5NN [MY_SERIAL]"
            const exchangeText = (state.subMode === 'run') ? `${myCall} TU` : `5NN ${mySerialFormatted}`;
            st.playToken++;
            st.isPlayingMorse = false;

            window.playCacciaQsoUserSidetone(exchangeText, () => {
                state.currentQsoStep = 'COMPLETED';
                st.completed = true; // Segna immediatamente la stazione come completata!
                st.isPlayingMorse = false;

                // VERIFICA CORRISPONDENZA EXCHANGE INSERITO DALL'UTENTE
                const normRstUser = rstRcvdVal.replace(/599/g, "5NN");
                const normRstStation = String(st.rst).toUpperCase().replace(/599/g, "5NN");

                const normNrUser = String(parseInt(nrRcvdVal) || 0);
                const normNrStation = String(parseInt(st.serialNum) || 0);

                const isExchangeCorrect = (normRstUser === normRstStation) && (normNrUser === normNrStation);
                const ptsGain = isExchangeCorrect ? Math.round(100 + (st.wpm * 2) + (st.sMeterBase * 5)) : 0;

                state.totalPoints += ptsGain;
                state.qsoCompletedCount++;

                // Inserimento nel Logbook
                const logEntry = {
                    num: state.qsoCompletedCount,
                    time: new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}),
                    callsign: st.callsign,
                    freqKhz: (st.freqHz / 1000).toFixed(1),
                    rstSent: '599',
                    serialSent: mySerialFormatted,
                    rstRcvd: rstRcvdVal || st.rst,
                    serialRcvd: nrRcvdVal || st.serialNum,
                    pts: ptsGain
                };

                state.logbook.unshift(logEntry);
                state.mySerialNum++;

                // Aggiorna Badge del mio progressivo e svuota i campi per il prossimo QSO
                if (badgeEl) badgeEl.textContent = String(state.mySerialNum).padStart(3, '0');
                if (nrInput) nrInput.value = '';
                if (callInput) {
                    callInput.value = '';
                    callInput.focus();
                }

                window.renderCacciaQsoLogbook();
                window.updateCacciaQsoScoreUI();

                // In S&P mode la stazione invia un breve "TU [CALL] K", in RUN mode l'utente riprende il CQ in automatico!
                if (state.subMode !== 'run') {
                    setTimeout(() => {
                        window.playCacciaQsoStationMorse(st, 0, 1.0);
                    }, 350);
                } else {
                    state.currentQsoStep = 'IDLE';
                    state.activeStation = null;

                    // --- AUTO-RUN LOOP CONTEST: IL GIOCATORE RIPRENDE IN AUTOMATICO LA PROPRIA CHIAMATA CQ ---
                    setTimeout(() => {
                        if (state.radioOn && state.subMode === 'run') {
                            window.triggerCacciaQsoRunCq();
                        }
                    }, 1200);
                }

                // RIGENERAZIONE AUTOMATICA BANDA OGNI 4 QSO
                if (state.qsoCompletedCount % 4 === 0) {
                    setTimeout(() => {
                        window.generateCacciaQsoStations();
                    }, 2500);
                }
            });
        }
    };

    /**
     * SINTONIA VFO & GESTIONE DIAL FLUIDA (TOUCH / MOUSE / WHEEL)
     */
    window.initCacciaQsoUI = function() {
        const dialCanvas = document.getElementById('cacciaQsoVfoCanvas');
        if (!dialCanvas) return;

        const ctx = dialCanvas.getContext('2d');
        window.drawCacciaQsoDial(ctx, window.cacciaQsoState.vfoKnobAngle);

        dialCanvas.onmousedown = dialCanvas.ontouchstart = (e) => {
            window.cacciaQsoState.isVfoDragging = true;
            const rect = dialCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const x = clientX - (rect.left + rect.width / 2);
            const y = clientY - (rect.top + rect.height / 2);

            window.cacciaQsoState.vfoLastTouchAngle = Math.atan2(y, x);
        };

        window.onmousemove = window.ontouchmove = (e) => {
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

        window.onmouseup = window.ontouchend = () => {
            window.cacciaQsoState.isVfoDragging = false;
        };

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
            ctx.moveTo(Math.cos(rad) * (r - 12), Math.sin(rad) * (r - 4));
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
            tr.innerHTML = `
                <td><b>${row.num}</b></td>
                <td>${row.time}</td>
                <td><b style="color:var(--link-color);">${row.callsign}</b></td>
                <td>${row.freqKhz} kHz</td>
                <td>${row.rstSent} / ${row.serialSent}</td>
                <td>${row.rstRcvd} / ${row.serialRcvd}</td>
                <td><b style="color:${row.pts > 0 ? '#4caf50' : '#f44336'};">${row.pts > 0 ? '+' + row.pts : '0 (ERR)'}</b></td>
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
