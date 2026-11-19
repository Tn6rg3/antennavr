// js/caccia_qso_manager.js - Simulatore Radio HF 40m & Contest "Caccia QSO"

(function() {
    'use strict';

    // State globale della Stazione Radio Caccia QSO
    window.cacciaQsoState = {
        radioOn: false,
        vfoFreqHz: 7034000, // 7.034.00 MHz in Hz (Banda 40m CW)
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
        vfoKnobAngle: 0, // Angolo accumulato della manopola VFO
        vfoLastTouchAngle: 0, // Ultimo angolo touch registrato
        mySerialNum: 1
    };

    /**
     * INIZIALIZZAZIONE & AVVIO MODALITÀ
     */
    window.startCacciaQsoGame = function() {
        console.log("Caccia QSO: Starting game mode...");
        window.showScreen('cacciaQsoScreen');

        // Legge la durata scelta dall'utente (5 - 30 min)
        const durSelect = document.getElementById('cacciaQsoDurationSelect');
        const minutes = durSelect ? (parseInt(durSelect.value) || 10) : 10;

        window.cacciaQsoState.sessionDurationSec = minutes * 60;
        window.cacciaQsoState.timeRemainingSec = minutes * 60;
        window.cacciaQsoState.qsoCompletedCount = 0;
        window.cacciaQsoState.totalPoints = 0;
        window.cacciaQsoState.mySerialNum = 1;
        window.cacciaQsoState.logbook = [];
        window.cacciaQsoState.currentQsoStep = 'IDLE';
        window.cacciaQsoState.activeStation = null;
        window.cacciaQsoState.vfoFreqHz = 7034000;
        window.cacciaQsoState.vfoKnobAngle = 0;

        window.generateCacciaQsoStations();
        window.initCacciaQsoUI();
        window.startCacciaQsoTimer();

        // Accende automaticamente la radio all'avvio
        if (!window.cacciaQsoState.radioOn) {
            window.toggleCacciaQsoPower(true);
        }
    };

    /**
     * GENERATORE PROCEDURALE DI STAZIONI RADIO 40M (7.000 MHz - 7.200 MHz)
     * (Sfrutta window.generateRealisticCallsign di dictionary_manager.js con Pile-Up e refresh ogni 4 QSO)
     */
    window.generateCacciaQsoStations = function() {
        const count = 22; // 22 stazioni sparse nell'intera banda 40 metri (7000 - 7200 kHz)
        let newStations = [];

        for (let i = 0; i < count; i++) {
            // Sfruttiamo il generatore di nominativi gia esistente nel progetto (dictionary_manager.js)
            let callsign = (typeof window.generateRealisticCallsign === 'function')
                ? window.generateRealisticCallsign()
                : `IU2XYZ_${i}`;

            // Puliamo eventuali modificatori tipo /P o /QRP per brevita nei contest
            callsign = callsign.split('/')[0];

            // Frequenza casuale tra 7.002.000 Hz e 7.198.000 Hz (Banda estesa 7.000 - 7.200 MHz)
            let freqHz = Math.floor(7002000 + Math.random() * 196000);

            // SIMULATORE PILE-UP: Il 30% delle stazioni si genera a soli 100-250 Hz da un'altra stazione!
            if (i > 0 && Math.random() < 0.30) {
                const partnerFreq = newStations[Math.floor(Math.random() * newStations.length)].freqHz;
                const offset = (Math.random() < 0.5 ? 1 : -1) * Math.floor(110 + Math.random() * 180);
                freqHz = partnerFreq + offset;
            }

            const wpm = Math.floor(18 + Math.random() * 11); // 18 - 28 WPM
            const toneHz = Math.floor(550 + Math.random() * 250); // 550 - 800 Hz
            const sMeterBase = Math.floor(2 + Math.random() * 8); // S2 - S9+
            const qsbSpeedSec = (3 + Math.random() * 5).toFixed(1); // Fading period 3-8 sec
            const rstReports = ['599', '589', '579', '559', '599', '599', '479'];
            const rst = rstReports[Math.floor(Math.random() * rstReports.length)];
            const serialNum = String(Math.floor(1 + Math.random() * 55)).padStart(3, '0');

            newStations.push({
                id: `st_${Date.now()}_${i}`,
                callsign: callsign,
                freqHz: freqHz,
                wpm: wpm,
                toneHz: toneHz,
                sMeterBase: sMeterBase,
                qsbSpeedSec: parseFloat(qsbSpeedSec),
                rst: rst,
                serialNum: serialNum,
                isCallingCq: true,
                completed: false
            });
        }

        window.cacciaQsoState.stations = newStations;
        console.log("Caccia QSO: Generated 40m Extended Band Stations (7.000-7.200 MHz) ->", newStations);
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
            if (typeof window.showToast === 'function') window.showToast("📻 Ricevitore 40m Acceso");
        } else {
            if (powerBtn) {
                powerBtn.classList.remove('btn-success');
                powerBtn.classList.add('btn-danger');
                powerBtn.textContent = '📻 RADIO SPENTA [OFF]';
            }
            if (displayEl) displayEl.style.opacity = '0.3';
            if (dialEl) dialEl.style.opacity = '0.3';

            window.stopCacciaQsoAudioEngine();
            if (typeof window.showToast === 'function') window.showToast("Radio Spenta");
        }
    };

    /**
     * AUDIO ENGINE - RUMORE DI FONDO RADIO (QRN) VARIABILE & FILTRO PASSABANDA
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
            // Buffer rumore bianco per il fruscio di banda HF
            const bufferSize = state.audioCtx.sampleRate * 2;
            const noiseBuffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = (Math.random() * 2 - 1) * 0.20;
            }

            state.noiseNode = state.audioCtx.createBufferSource();
            state.noiseNode.buffer = noiseBuffer;
            state.noiseNode.loop = true;

            // Filtro Passabanda CW Selettivo (300Hz - 800Hz)
            state.noiseFilter = state.audioCtx.createBiquadFilter();
            state.noiseFilter.type = 'bandpass';
            state.noiseFilter.frequency.value = 600;
            state.noiseFilter.Q.value = 3.0;

            state.noiseGain = state.audioCtx.createGain();
            state.noiseGain.gain.value = 0.10; // Fruscio di partenza

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
        Object.keys(state.activeToneOscillators).forEach(key => {
            try {
                const osc = state.activeToneOscillators[key];
                if (osc && osc.stop) osc.stop();
            } catch(e){}
        });
        state.activeToneOscillators = {};
    };

    /**
     * AUDIO LOOP & MONITOR S-METER REALISTICO
     * (Fluttuazione QRN variabile + Attenuazione selettiva della frequenza VFO)
     */
    window.startCacciaQsoAudioLoop = function() {
        if (window.cacciaQsoAudioInterval) clearInterval(window.cacciaQsoAudioInterval);

        window.cacciaQsoAudioInterval = setInterval(() => {
            const state = window.cacciaQsoState;
            if (!state.radioOn || !state.audioCtx) return;

            const vfo = state.vfoFreqHz;

            // FLUTTUAZIONE DINAMICA RUMORE DI FONDO (QRN / MASCHERAMENTO MASCHERANTE)
            const timeSec = Date.now() / 1000;
            const qrnFluctuation = 0.06 + 0.08 * Math.sin(timeSec * 0.4) + 0.04 * Math.random();
            if (state.noiseGain) {
                state.noiseGain.gain.value = qrnFluctuation;
            }

            // Rumore di fondo minimo espresso in scala S (tra S1 e S3)
            let qrnSValue = Math.round(1 + (qrnFluctuation * 15));
            let totalSignalVal = qrnSValue;
            let currentSintonizedStation = null;

            state.stations.forEach(st => {
                if (st.completed) return;

                // Calcolo dello spostamento di frequenza (offset VFO vs Stazione)
                const freqDiffHz = Math.abs(st.freqHz - vfo);

                // CURVA DI SELETTIVITÀ FILTRO CW RICEVITORE REALISTICO:
                // entro ± 120 Hz -> Segnale al 100%
                // tra 120 Hz e 400 Hz -> Il segnale crolla vertiginosamente fino a 0
                // oltre 400 Hz -> Segnale completamente tagliato (0%)
                let proximityFactor = 0;
                if (freqDiffHz <= 120) {
                    proximityFactor = 1.0;
                } else if (freqDiffHz <= 400) {
                    const normOff = (freqDiffHz - 120) / 280;
                    proximityFactor = Math.max(0, 1 - (normOff * normOff)); // Crollo quadratico rapido del volume
                }

                if (proximityFactor > 0) {
                    // Fading QSB sinusoidale nel tempo
                    const qsbPhase = timeSec * (2 * Math.PI / st.qsbSpeedSec);
                    const qsbFactor = 0.4 + 0.6 * Math.sin(qsbPhase); // Tra 0.4 e 1.0

                    const effectiveS = Math.round(st.sMeterBase * proximityFactor * qsbFactor);
                    totalSignalVal = Math.max(totalSignalVal, effectiveS);

                    // Se siamo ben centrati sulla sintonia (entro ± 180 Hz)
                    if (freqDiffHz <= 180) {
                        currentSintonizedStation = st;
                    }

                    // Riproduce la trasmissione Morse della stazione se visibile nel filtro
                    if (st.isCallingCq && proximityFactor > 0.05) {
                        window.playCacciaQsoStationMorse(st, freqDiffHz, proximityFactor * qsbFactor);
                    }
                }
            });

            // Aggiorna la lancetta dell'S-Meter
            window.updateCacciaQsoSMeter(totalSignalVal);

            // Aggiorna lo stato della stazione sintonizzata
            if (currentSintonizedStation !== state.activeStation) {
                state.activeStation = currentSintonizedStation;
                if (currentSintonizedStation && state.currentQsoStep === 'IDLE') {
                    state.currentQsoStep = 'LISTENING';
                }
            }
        }, 120);
    };

    /**
     * SINTESI SUONO MORSE DEDICATA PER LA STAZIONE SINTONIZZATA
     */
    window.playCacciaQsoStationMorse = function(station, freqDiffHz, volumeFactor) {
        const state = window.cacciaQsoState;
        if (!state.radioOn || !state.audioCtx || station.isPlayingMorse) return;

        station.isPlayingMorse = true;

        // Testo da trasmettere a seconda dello stato
        let textToPlay = "";
        if (state.currentQsoStep === 'CALL_MATCHED' && state.activeStation === station) {
            const playerCall = window.myName || "OPERATOR";
            textToPlay = `${playerCall} DE ${station.callsign} UR ${station.rst} ${station.serialNum} BK`;
        } else if (state.currentQsoStep === 'COMPLETED' && state.activeStation === station) {
            textToPlay = `TU 73 ${station.callsign} SK`;
        } else {
            textToPlay = `CQ CQ DE ${station.callsign} PSE K`;
        }

        // Tono audio udibile (frequenza eterodina regolata su 600Hz in centro sintonia)
        const beatTone = Math.max(300, Math.min(1200, 600 + (station.freqHz - state.vfoFreqHz)));
        const unitSec = 1.2 / station.wpm;
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
                    if (state.radioOn && state.audioCtx) {
                        try {
                            const osc = state.audioCtx.createOscillator();
                            const gain = state.audioCtx.createGain();
                            osc.type = 'sine';
                            osc.frequency.value = beatTone;

                            gain.gain.value = 0.12 * volumeFactor;

                            osc.connect(gain);
                            gain.connect(state.audioCtx.destination);

                            osc.start();
                            osc.stop(state.audioCtx.currentTime + (durMs / 1000));
                        } catch(e){}
                    }
                }, delayMs);

                delayMs += durMs + (unitSec * 1000);
            }
            delayMs += unitSec * 2 * 1000;
        }

        setTimeout(() => {
            station.isPlayingMorse = false;
        }, delayMs + 1500); // Pausa tra chiamate CQ
    };

    /**
     * SINTONIA VFO & GESTIONE DIAL FLUIDA (TOUCH / MOUSE / WHEEL SENZA SALTI)
     */
    window.initCacciaQsoUI = function() {
        const dialCanvas = document.getElementById('cacciaQsoVfoCanvas');
        if (!dialCanvas) return;

        const ctx = dialCanvas.getContext('2d');
        window.drawCacciaQsoDial(ctx, window.cacciaQsoState.vfoKnobAngle);

        // Eventi Drag e Rotation VFO fluida
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

            // Correzione salto -PI / +PI
            if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
            if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

            window.cacciaQsoState.vfoLastTouchAngle = currentTouchAngle;
            window.cacciaQsoState.vfoKnobAngle += angleDelta;

            // 1 Giro completo (2*PI) = 10.000 Hz di cambio frequenza
            const freqStep = Math.round((angleDelta / (2 * Math.PI)) * 10000);
            window.tuneCacciaQsoVfoBy(freqStep);

            window.drawCacciaQsoDial(ctx, window.cacciaQsoState.vfoKnobAngle);
        };

        window.onmouseup = window.ontouchend = () => {
            window.cacciaQsoState.isVfoDragging = false;
        };

        // Supporto Rotellina Mouse sul Dial
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

        // Corpo Dial VFO
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#222';
        ctx.fill();
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Incavo/Tacche sulla Manopola
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
        // Limiti Banda 40m CW Estesa: 7.000.000 Hz - 7.200.000 Hz
        const clamped = Math.max(7000000, Math.min(7200000, targetFreqHz));
        window.cacciaQsoState.vfoFreqHz = clamped;
        window.updateCacciaQsoFreqDisplay();
    };

    window.updateCacciaQsoFreqDisplay = function() {
        const freqEl = document.getElementById('cacciaQsoFreqDisplay');
        if (!freqEl) return;

        const hz = window.cacciaQsoState.vfoFreqHz;
        const mhz = (hz / 1000000).toFixed(5); // es. 07.034.00 MHz
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

        // Angolo da -45deg (S0) a +45deg (S9+)
        const clampedS = Math.max(0, Math.min(10, sVal));
        const angle = -45 + (clampedS * 9);
        needle.style.transform = `rotate(${angle}deg)`;

        if (valText) {
            valText.textContent = clampedS >= 9 ? "S9+" : `S${clampedS}`;
        }
    };

    /**
     * GESTIONE SUBMISSION CONTEST EXCHANGE (TEXTBOX)
     */
    window.handleCacciaQsoSubmit = function() {
        const inputEl = document.getElementById('cacciaQsoInput');
        if (!inputEl) return;

        const val = inputEl.value.trim().toUpperCase();
        if (!val) return;

        inputEl.value = '';
        const state = window.cacciaQsoState;

        if (!state.activeStation) {
            if (typeof showToast === 'function') showToast("⚠️ Nessuna stazione sintonizzata sul VFO!");
            return;
        }

        const st = state.activeStation;

        // FASE 1: Inserimento Nominativo Sentito
        if (state.currentQsoStep === 'LISTENING' || state.currentQsoStep === 'IDLE') {
            if (val === st.callsign) {
                state.currentQsoStep = 'CALL_MATCHED';
                if (typeof showToast === 'function') showToast(`✅ Nominativo ${st.callsign} Corretto! La stazione ti risponde...`);
            } else {
                if (typeof showToast === 'function') showToast(`❌ Nominativo Errato (Sintonizzato su ${st.callsign})`);
            }
            return;
        }

        // FASE 2: Inserimento Tuo Rapporto e Progressivo (es. 599 001)
        if (state.currentQsoStep === 'CALL_MATCHED') {
            const mySerialFormatted = String(state.mySerialNum).padStart(3, '0');
            state.currentQsoStep = 'COMPLETED';
            st.completed = true;

            // Assegnazione Punti Contest
            const ptsGain = Math.round(100 + (st.wpm * 2) + (st.sMeterBase * 5));
            state.totalPoints += ptsGain;
            state.qsoCompletedCount++;

            // Inserimento nel Logbook di Stazione
            const logEntry = {
                num: state.qsoCompletedCount,
                time: new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}),
                callsign: st.callsign,
                freqKhz: (st.freqHz / 1000).toFixed(1),
                rstSent: '599',
                serialSent: mySerialFormatted,
                rstRcvd: st.rst,
                serialRcvd: st.serialNum,
                pts: ptsGain
            };

            state.logbook.unshift(logEntry);
            state.mySerialNum++;

            window.renderCacciaQsoLogbook();
            window.updateCacciaQsoScoreUI();

            if (typeof showToast === 'function') showToast(`🏆 QSO Concluso con ${st.callsign}! +${ptsGain} pt`);

            // RIGENERAZIONE AUTOMATICA BANDA OGNI 4 QSO
            if (state.qsoCompletedCount % 4 === 0) {
                setTimeout(() => {
                    window.generateCacciaQsoStations();
                    if (typeof showToast === 'function') showToast("🔄 Banda 40m Rigenerata con Nuove Stazioni!");
                }, 2000);
            }

            setTimeout(() => {
                state.currentQsoStep = 'IDLE';
                state.activeStation = null;
            }, 3000);
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
                <td><b style="color:#4caf50;">+${row.pts}</b></td>
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
