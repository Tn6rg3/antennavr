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
        mode: 'B', // 'A', 'B', 'V' (Verticale)
        wpm: 20,
        tone: 600,
        keyDit: '.',
        keyDah: ',',
        keyVert: '', // Tasto verticale
        paddlesSwapped: false, // Flag per inversione mouse/tasti
        isDitDown: false,
        isDahDown: false,
        isVertDown: false,
        currentSymbol: null,
        nextSymbol: null,
        lastSymbolSent: 'dah', // Per gestire l'alternanza iniziale
        timer: null,
        mappingTarget: null
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
        startTime: 0,
        stats: {
            dotAccs: [],
            dashAccs: [],
            charSpaceAccs: [],
            wordSpaceAccs: []
        }
    };
}

window.initTransmissionManager = function() {
    try {
        console.log("TX_DEBUG: initTransmissionManager START");

        window.isKeyerAllowed = function() {
            // 1. Controllo Schermate Attive
            const setupScreen = document.getElementById('setupScreen');
            const txScreen = document.getElementById('transmissionScreen');
            const profileScreen = document.getElementById('profileScreen');
            const qsoArea = document.getElementById('qsoArea');

            const isSetupActive = setupScreen && setupScreen.classList.contains('active-screen');
            const isTxActive = txScreen && txScreen.classList.contains('active-screen');
            const isProfileActive = profileScreen && profileScreen.classList.contains('active-screen');
            const isQsoActive = qsoArea && qsoArea.classList.contains('active-screen');

            // Nel menu setup, disabilitiamo il keyer globale (mouse/paddles) per evitare
            // interferenze con la UI, a meno che non ci sia una sessione attiva (molto raro qui).
            if (isSetupActive) {
                return (window.transmissionState.sessionRunning || window.groupTxState.running);
            }

            // Nella Stazione Radio standalone o QSO, il keyer è sempre ammesso
            if (isTxActive || isQsoActive) return true;

            // Nel Profilo (Corso), ammesso solo se la vista Trasmissione è visibile
            if (isProfileActive) {
                const txView = document.getElementById('courseTransmissionView');
                return txView && txView.style.display !== 'none';
            }

            return false;
        };

        // Sincronizziamo WPM e Tono con quelli globali del menu se siamo in standalone
        if (!window.transmissionState.sessionRunning && !window.groupTxState.running) {
             const startWpm = parseInt(document.getElementById('startWpmInput')?.value);
             if (startWpm) window.keyerState.wpm = startWpm;
             const startTone = parseInt(document.getElementById('toneInput')?.value);
             if (startTone) window.keyerState.tone = startTone;
        }

        window.loadKeyerSettings();

        const keyBtn = document.getElementById('morseKeyBtn');
        if (keyBtn) {
            // Rimuoviamo eventuali vecchi listener se presenti (versione pulita senza clonazione distruttiva)
            keyBtn.removeEventListener('mousedown', window.handleStraightKeyDown);
            keyBtn.removeEventListener('touchstart', window.handleStraightKeyDown);
            window.removeEventListener('mouseup', window.handleStraightKeyUp);
            window.removeEventListener('touchend', window.handleStraightKeyUp);

            window.handleStraightKeyDown = (e) => {
                if (e && e.cancelable && e.preventDefault) {
                    const isAnySessionRunning = window.transmissionState.sessionRunning || window.groupTxState.running;
                    const isKeyBtn = e.target && (e.target.id === 'morseKeyBtn' || e.target.closest('#morseKeyBtn') || e.target.id === 'morseKeyBtnGroups' || e.target.closest('#morseKeyBtnGroups'));

                    // Impediamo il comportamento di default SOLO se siamo sul bottone specifico o in sessione (blocco totale)
                    if (isAnySessionRunning || isKeyBtn) {
                        e.preventDefault();
                    }
                }
                if (window.transmissionState.isDown) return;
                window.transmissionState.isDown = true;
                const now = Date.now();

                // GESTIONE TRASMISSIONE GRUPPI (Avanzamento guidato dall'utente)
                if (window.groupTxState.running && window.groupTxState.sequence.length > 0) {
                    const wpm = window.keyerState.enabled ? window.keyerState.wpm : (parseInt(window.courseData?.settings?.start_wpm) || 20);
                    const unit = 1200 / wpm;
                    const gap = now - window.transmissionState.lastEventTime;

                    // Se il silenzio è > 2 unità, l'utente sta iniziando un NUOVO carattere.
                    // Finalizziamo quello precedente prima di registrare il nuovo segnale.
                    if (gap > unit * 2.0) {
                        window.finalizeGroupCharacter(gap);
                    }
                }

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
                const btn = document.getElementById('morseKeyBtn');
                if (btn) {
                    btn.style.transform = "scale(0.92)";
                    btn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.8), inset 0 2px 5px rgba(255,255,255,0.1)";
                    const inner = btn.querySelector('span');
                    if (inner) inner.style.opacity = "0.6";
                }

                // --- QSO BUTTON FEEDBACK ---
                const qsoBtn = document.getElementById('qsoMorseKeyBtn');
                if (qsoBtn) {
                    qsoBtn.style.transform = "scale(0.92)";
                    const qsoInner = qsoBtn.querySelector('span');
                    if (qsoInner) qsoInner.style.opacity = "0.6";
                }
            };

            window.handleStraightKeyUp = (e) => {
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
                const btn = document.getElementById('morseKeyBtn');
                if (btn) {
                    btn.style.transform = "scale(1)";
                    btn.style.boxShadow = "0 10px 20px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.1)";
                    const inner = btn.querySelector('span');
                    if (inner) inner.style.opacity = "0.2";
                }

                // --- QSO BUTTON FEEDBACK ---
                const qsoBtn = document.getElementById('qsoMorseKeyBtn');
                if (qsoBtn) {
                    qsoBtn.style.transform = "scale(1)";
                    const qsoInner = qsoBtn.querySelector('span');
                    if (qsoInner) qsoInner.style.opacity = "0.2";
                }
            };

            keyBtn.addEventListener('mousedown', window.handleStraightKeyDown);
            keyBtn.addEventListener('touchstart', window.handleStraightKeyDown, {passive: false});
            window.addEventListener('mouseup', window.handleStraightKeyUp);
            window.addEventListener('touchend', window.handleStraightKeyUp, {passive: false});
        }

        const qsoKeyBtn = document.getElementById('qsoMorseKeyBtn');
        if (qsoKeyBtn) {
            qsoKeyBtn.addEventListener('mousedown', window.handleStraightKeyDown);
            qsoKeyBtn.addEventListener('touchstart', window.handleStraightKeyDown, {passive: false});
        }

        const keyBtnGroups = document.getElementById('morseKeyBtnGroups');
        if (keyBtnGroups) {
            keyBtnGroups.addEventListener('mousedown', window.handleStraightKeyDown);
            keyBtnGroups.addEventListener('touchstart', window.handleStraightKeyDown, {passive: false});
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

    // BINDING SERIALE / USB
    window.connectSerial = async function() {
        let serialAPI = navigator.serial;
        if (!serialAPI) return alert("Browser o Sistema non supportato per USB (Usa Chrome/Edge su Desktop).");

        try {
            const port = await serialAPI.requestPort({
                filters: [
                    { usbVendorId: 0x2341 }, { usbVendorId: 0x1B4F },
                    { usbVendorId: 0x239A }, { usbVendorId: 0x1A86 }
                ]
            });
            await port.open({ baudRate: 500000 });
            await port.setSignals({ dataTerminalReady: true, requestToSend: true });

            showToast("USB Connessa! 🟢");
            const btn = document.getElementById('btnConnectUsbGlobal');
            if (btn) { btn.textContent = "✅ USB OK"; btn.classList.replace('btn-success', 'btn-secondary'); }

            window.readSerialData(port);
        } catch (e) {
            console.error(e);
            alert("Nessuna porta selezionata o errore di connessione.");
        }
    };

    window.readSerialData = async function(port) {
        const reader = port.readable.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) { reader.releaseLock(); break; }

                const source = document.getElementById('mainInputSourceSelect')?.value;
                if (source !== 'serial') continue;

                for (let i = 0; i < value.length; i++) {
                    const byte = value[i];
                    // Logica Arduino Standard: 1 o '1' (49) o 'D' (68) -> Dot, 2 o 'L' (76) -> Dash, 0 o '0' (48) -> Stop
                    if (byte === 1 || byte === 49 || byte === 68) {
                        if (typeof window.startTone === 'function') window.startTone(window.keyerState.tone);
                        window.handleKeyerEvent('on', 50); // Durata fittizia per trigger
                    }
                    else if (byte === 2 || byte === 76) {
                        if (typeof window.startTone === 'function') window.startTone(window.keyerState.tone);
                        window.handleKeyerEvent('on', 150);
                    }
                    else if (byte === 0 || byte === 48) {
                        if (typeof window.stopTone === 'function') window.stopTone();
                        window.handleKeyerEvent('off', 50);
                    }
                }
            }
        } catch(err) { console.error("Serial Read Error:", err); }
    };

    // CONFIGURAZIONE KEYER
    const kToggle = document.getElementById('keyerEnableToggle');
    const kType = document.getElementById('keyerTypeSelect');
    const kWpmIn = document.getElementById('keyerWpmInput');
    const kToneIn = document.getElementById('keyerToneInput');

    if (kToggle) {
        kToggle.checked = window.keyerState.enabled;
        kToggle.onchange = (e) => {
            window.keyerState.enabled = e.target.checked;
            window.saveKeyerSettings();
            console.log("KEYER: State ->", window.keyerState.enabled);
        };
    }
    if (kType) {
        kType.value = window.keyerState.mode;
        kType.onchange = (e) => {
            window.keyerState.mode = e.target.value;
            window.updateKeyerUI();
            window.saveKeyerSettings();
        };
    }
    if (kWpmIn) {
        kWpmIn.value = window.keyerState.wpm;
        kWpmIn.onchange = (e) => {
            window.keyerState.wpm = parseInt(e.target.value) || 20;
            window.saveKeyerSettings();
        };
    }
    if (kToneIn) {
        kToneIn.value = window.keyerState.tone || 600;
        kToneIn.onchange = (e) => {
            window.keyerState.tone = parseInt(e.target.value) || 600;
            window.currentTone = window.keyerState.tone;
            window.saveKeyerSettings();
        };
    }

    // BINDING KEYER MENU PRINCIPALE
    const mKType = document.getElementById('mainKeyerTypeSelect');
    if (mKType) {
        mKType.value = window.keyerState.mode; // Sincronizziamo UI menu principale
        mKType.onchange = (e) => {
            window.keyerState.mode = e.target.value;
            window.updateKeyerUI();
            window.saveKeyerSettings();
        };
    }
    const btnMSwap = document.getElementById('btnMainSwapPaddles');
    if (btnMSwap) {
        btnMSwap.onclick = () => {
            window.keyerState.paddlesSwapped = !window.keyerState.paddlesSwapped;
            window.saveKeyerSettings();
            showToast(window.keyerState.paddlesSwapped ? "Comandi Invertiti!" : "Comandi Standard");
        };
    }

    // MAPPA TASTI MENU PRINCIPALE
    setupButtonLocal('btnMainMapDit', () => {
        window.keyerState.mappingTarget = 'dit';
        const b = document.getElementById('btnMainMapDit');
        if (b) { b.textContent = "Premi..."; b.classList.add('pulse'); }
    });
    setupButtonLocal('btnMainMapDah', () => {
        window.keyerState.mappingTarget = 'dah';
        const b = document.getElementById('btnMainMapDah');
        if (b) { b.textContent = "Premi..."; b.classList.add('pulse'); }
    });
    setupButtonLocal('btnMainMapVert', () => {
        window.keyerState.mappingTarget = 'vert';
        const b = document.getElementById('btnMainMapVert');
        if (b) { b.textContent = "Premi..."; b.classList.add('pulse'); }
    });

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
    setupButtonLocal('btnMapKeyVert', () => {
        window.keyerState.mappingTarget = 'vert';
        const b = document.getElementById('btnMapKeyVert');
        if (b) { b.textContent = "Premi un tasto..."; b.classList.add('pulse'); }
    });
    setupButtonLocal('btnSwapDitDah', () => {
        const oldDit = window.keyerState.keyDit;
        window.keyerState.keyDit = window.keyerState.keyDah;
        window.keyerState.keyDah = oldDit;

        // Inverte anche la logica del mouse
        window.keyerState.paddlesSwapped = !window.keyerState.paddlesSwapped;

        window.updateKeyerUI();
        window.saveKeyerSettings();
        showToast(window.keyerState.paddlesSwapped ? "Comandi Invertiti!" : "Comandi Standard");
    });

    window.updateKeyerUI();

        if (!window.transmissionGlobalListenersReadyV2) {
            console.log("TX_DEBUG: Attaching Global Listeners V2");
            window.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                // PROTEZIONE CONTESTO: Se non siamo in una zona di trasmissione, ignoriamo i tasti del keyer
                if (!window.isKeyerAllowed || !window.isKeyerAllowed()) return;

                // Resume Audio Context se necessario
                if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();

            // Rilevamento Mapping
            if (window.keyerState.mappingTarget) {
                e.preventDefault();
                const k = e.key;
                console.log("TX_DEBUG: Mapped key ->", k);
                if (window.keyerState.mappingTarget === 'dit') window.keyerState.keyDit = k;
                else if (window.keyerState.mappingTarget === 'dah') window.keyerState.keyDah = k;
                else if (window.keyerState.mappingTarget === 'vert') window.keyerState.keyVert = k;

                window.keyerState.mappingTarget = null;
                window.updateKeyerUI();
                window.saveKeyerSettings();
                showToast("Tasto assegnato: " + (k === " " ? "Spazio" : k));
                return;
            }

            if (!window.keyerState.enabled) return;

            // Logica Tasto Verticale (Straight Key)
            if (window.keyerState.mode === 'V') {
                if (e.key === window.keyerState.keyVert) {
                    if (typeof window.handleStraightKeyDown === 'function') window.handleStraightKeyDown(e);
                }
                return;
            }

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

            if (window.keyerState.mode === 'V') {
                if (e.key === window.keyerState.keyVert) {
                    if (typeof window.handleStraightKeyUp === 'function') window.handleStraightKeyUp(e);
                }
                return;
            }

            if (e.key === window.keyerState.keyDit) window.keyerState.isDitDown = false;
            if (e.key === window.keyerState.keyDah) window.keyerState.isDahDown = false;
        });

        // --- AGGIUNTA: SUPPORTO MOUSE PER TRASMISSIONE ---
        window.addEventListener('mousedown', (e) => {
            const isQsoActive = typeof window.currentMode !== 'undefined' && window.currentMode === 'qso' && gameRunning;
            const isAnySessionRunning = window.transmissionState.sessionRunning || window.groupTxState.running || isQsoActive;

            // 0. ESCLUSIONE RIGOROSA ELEMENTI INTERATTIVI
            const interactiveTags = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'LABEL', 'OPTION', 'A', 'SPAN', 'CANVAS'];
            if (interactiveTags.includes(e.target.tagName) || e.target.closest('button') || e.target.closest('.box-panel')) {
                // Se stiamo cliccando su un elemento UI, permettiamo l'interazione normale e usciamo dal keyer
                return;
            }

            // PROTEZIONE CONTESTO: Il mouse risponde al keyer solo se permesso
            const keyerAllowed = window.isKeyerAllowed && window.isKeyerAllowed();

            // 1. GESTIONE PULSANTI STOP (Sempre attivi e prioritari)
            if (e.target.closest('#btnStopTxSession') || e.target.closest('#btnStopGroupTx')) {
                // Se clicchiamo STOP, forziamo il rilascio di tutti i tasti Morse per sicurezza
                window.keyerState.isDitDown = false;
                window.keyerState.isDahDown = false;
                window.keyerState.isVertDown = false;
                window.transmissionState.isDown = false;
                return;
            }

            // 2. SE LA SESSIONE È IN CORSO: Blocchiamo ogni altro clic (inclusi input/tastiera)
            // Impedisce anche il tasto "Indietro" del mouse su Android (tasto destro)
            if (isAnySessionRunning) {
                e.preventDefault();
                e.stopPropagation();
            } else {
                // SE NON SIAMO IN SESSIONE E NON È PERMESSO IL KEYER (o è disattivato), USCIAMO
                if (!keyerAllowed && !isQsoActive) return;
                if (window.keyerState.mode !== 'V' && !window.keyerState.enabled && !isQsoActive) return;
            }

            // --- GESTIONE BLOCCO MOUSE SOFTWARE ---
            if (isAnySessionRunning) {
                document.body.style.cursor = 'none';
                let shield = document.getElementById('txMouseShield');
                if (!shield) {
                    shield = document.createElement('div');
                    shield.id = 'txMouseShield';
                    // User-select e touch-action impediscono drag-drop o zoom accidentali durante la trasmissione
                    shield.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; z-index:10000; cursor:none; background:transparent; user-select:none; -webkit-user-select:none; touch-action:none;";
                    document.body.appendChild(shield);
                }
                // Assicuriamoci che i tasti STOP rimangano cliccabili sopra lo scudo
                const s1 = document.getElementById('btnStopTxSession'), s2 = document.getElementById('btnStopGroupTx');
                if (s1) s1.style.setProperty('z-index', '10001', 'important');
                if (s2) s2.style.setProperty('z-index', '10001', 'important');
            }

            // Sblocco di emergenza con tasto centrale (rotellina)
            if (e.button === 1) {
                window.stopTxSession();
                window.stopGroupTx();
                return;
            }

            // Resume audio
            if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();

            if (window.keyerState.mode === 'V') {
                // In modalità Verticale, accetta qualsiasi tasto del mouse come manipolatore
                if (typeof window.handleStraightKeyDown === 'function') window.handleStraightKeyDown(e);
            } else {
                const isSwapped = window.keyerState.paddlesSwapped;
                const btnDit = isSwapped ? 2 : 0;
                const btnDah = isSwapped ? 0 : 2;

                if (e.button === btnDit) { // Punto
                    if (!window.keyerState.isDitDown) {
                        window.keyerState.isDitDown = true;
                        window.processKeyerInput();
                    }
                } else if (e.button === btnDah) { // Linea
                    if (!window.keyerState.isDahDown) {
                        window.keyerState.isDahDown = true;
                        window.processKeyerInput();
                    }
                }
            }
        });

        window.addEventListener('mouseup', (e) => {
            const isQsoActive = typeof window.currentMode !== 'undefined' && window.currentMode === 'qso' && gameRunning;
            if (!window.keyerState.enabled && !isQsoActive) return;
            if (window.keyerState.mode === 'V') {
                if (typeof window.handleStraightKeyUp === 'function') window.handleStraightKeyUp(e);
            } else {
                const isSwapped = window.keyerState.paddlesSwapped;
                if (e.button === (isSwapped ? 2 : 0)) window.keyerState.isDitDown = false;
                else if (e.button === (isSwapped ? 0 : 2)) window.keyerState.isDahDown = false;
            }
        });

        // Impedisce RIGOROSAMENTE il menu contestuale durante la sessione
        window.addEventListener('contextmenu', (e) => {
            const isAnySessionRunning = window.transmissionState.sessionRunning || window.groupTxState.running;
            if (isAnySessionRunning) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            // Fuori sessione, blocca solo se non siamo su input/bottoni
            if (window.keyerState.enabled && window.keyerState.mode !== 'V') {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('button')) {
                    e.preventDefault();
                }
            }
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

// --- AUTO-SBLOCCO MOUSE AL CAMBIO SCHERMATA ---
setInterval(() => {
    const txView = document.getElementById('courseTransmissionView');
    const isVisible = txView && txView.style.display !== 'none';
    const isAnySessionRunning = window.transmissionState.sessionRunning || window.groupTxState.running;

    // Se siamo usciti dalla scheda o la sessione è ferma, puliamo tutto
    if (!isVisible || !isAnySessionRunning) {
        if (document.body.style.cursor === 'none') {
            document.body.style.cursor = 'default';
            if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e) {}
            const shield = document.getElementById('txMouseShield');
            if (shield) shield.remove();
        }
    }
}, 500);

window.stopTxSession = function() {
    window.logDebug("TX: Executing stopTxSession");
    window.transmissionState.sessionRunning = false;
    window.transmissionState.active = false;

    // Ripristino cursori e rimozione scudo
    document.body.style.cursor = 'default';
    if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e) {}
    const shield = document.getElementById('txMouseShield');
    if (shield) shield.remove();

    // Reset z-index tasti
    const btnStop1 = document.getElementById('btnStopTxSession');
    if (btnStop1) btnStop1.style.zIndex = "";

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
 * PERSISTENZA IMPOSTAZIONI
 */
window.saveKeyerSettings = function() {
    const settings = {
        enabled: window.keyerState.enabled,
        mode: window.keyerState.mode,
        wpm: window.keyerState.wpm,
        tone: window.keyerState.tone,
        keyDit: window.keyerState.keyDit,
        keyDah: window.keyerState.keyDah,
        keyVert: window.keyerState.keyVert,
        paddlesSwapped: window.keyerState.paddlesSwapped
    };
    localStorage.setItem('cw_keyer_settings', JSON.stringify(settings));
    console.log("KEYER: Settings saved to local storage.");
};

window.loadKeyerSettings = function() {
    const saved = localStorage.getItem('cw_keyer_settings');
    if (saved) {
        try {
            const s = JSON.parse(saved);
            window.keyerState.enabled = s.enabled || false;
            window.keyerState.mode = s.mode || 'B';
            window.keyerState.wpm = s.wpm || 20;
            window.keyerState.tone = s.tone || 600;
            window.keyerState.keyDit = s.keyDit || '.';
            window.keyerState.keyDah = s.keyDah || ',';
            window.keyerState.keyVert = s.keyVert || '';
            window.keyerState.paddlesSwapped = s.paddlesSwapped || false;
            console.log("KEYER: Settings loaded from local storage.");
        } catch (e) {
            console.error("KEYER: Error parsing saved settings.");
        }
    }
};

window.updateKeyerUI = function() {
    const btnDit = document.getElementById('btnMapKeyDit');
    const btnDah = document.getElementById('btnMapKeyDah');
    const btnVert = document.getElementById('btnMapKeyVert');

    if (btnDit) {
        btnDit.textContent = "Tasto: " + (window.keyerState.keyDit === " " ? "Spazio" : (window.keyerState.keyDit || "Nessuno"));
        btnDit.classList.remove('pulse');
    }
    if (btnDah) {
        btnDah.textContent = "Tasto: " + (window.keyerState.keyDah === " " ? "Spazio" : (window.keyerState.keyDah || "Nessuno"));
        btnDah.classList.remove('pulse');
    }
    if (btnVert) {
        btnVert.textContent = "Tasto: " + (window.keyerState.keyVert === " " ? "Spazio" : (window.keyerState.keyVert || "Nessuno"));
        btnVert.classList.remove('pulse');
    }

    // UI MENU PRINCIPALE
    const mDit = document.getElementById('btnMainMapDit');
    const mDah = document.getElementById('btnMainMapDah');
    const mVert = document.getElementById('btnMainMapVert');
    if (mDit) { mDit.textContent = "Tasto: " + (window.keyerState.keyDit === " " ? "Spazio" : (window.keyerState.keyDit || ".")); mDit.classList.remove('pulse'); }
    if (mDah) { mDah.textContent = "Tasto: " + (window.keyerState.keyDah === " " ? "Spazio" : (window.keyerState.keyDah || ",")); mDah.classList.remove('pulse'); }
    if (mVert) { mVert.textContent = "Tasto: " + (window.keyerState.keyVert === " " ? "Spazio" : (window.keyerState.keyVert || "Nessuno")); mVert.classList.remove('pulse'); }

    // Mostra/Nascondi aree in base al modo
    const paddleArea = document.getElementById('btnSwapDitDah')?.parentElement;
    const verticalArea = document.getElementById('verticalKeyMappingArea');
    const groupVertArea = document.getElementById('groupTxVerticalArea');

    if (window.keyerState.mode === 'V') {
        if (paddleArea) paddleArea.style.opacity = "0.4";
        if (verticalArea) verticalArea.style.opacity = "1";
        if (groupVertArea) groupVertArea.style.display = "flex";
    } else {
        if (paddleArea) paddleArea.style.opacity = "1";
        if (verticalArea) verticalArea.style.opacity = "0.4";
        if (groupVertArea) groupVertArea.style.display = "none";
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
    // Logica Squeeze (Iambic): se entrambi premuti, alterna l'ultimo inviato
    if (window.keyerState.nextSymbol) {
        symbol = window.keyerState.nextSymbol;
        window.keyerState.nextSymbol = null;
    } else if (window.keyerState.isDitDown && window.keyerState.isDahDown) {
        symbol = (window.keyerState.lastSymbolSent === 'dit') ? 'dah' : 'dit';
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
    window.keyerState.lastSymbolSent = symbol;

    const unit = 1200 / window.keyerState.wpm;
    const duration = (symbol === 'dah') ? (unit * 3) : unit;

    if (typeof window.startTone === 'function') window.startTone(window.keyerState.tone);
    window.handleKeyerEvent('on', duration);

    // Monitoriamo se durante questo elemento l'utente tocca l'altra paletta (Squeeze durante segnale)
    let oppositeTouched = false;
    const monitor = setInterval(() => {
        if (symbol === 'dit' && window.keyerState.isDahDown) oppositeTouched = true;
        if (symbol === 'dah' && window.keyerState.isDitDown) oppositeTouched = true;
    }, 10);

    setTimeout(() => {
        clearInterval(monitor);
        if (typeof window.stopTone === 'function') window.stopTone();
        window.handleKeyerEvent('off', unit);

        // Logica Mode B: se l'opposto è stato toccato e ora non c'è nulla premuto,
        // inseriamo un elemento opposto in coda (effetto memoria Iambic B).
        if (window.keyerState.mode === 'B' && oppositeTouched) {
            if (!window.keyerState.isDitDown && !window.keyerState.isDahDown) {
                window.keyerState.nextSymbol = (symbol === 'dit') ? 'dah' : 'dit';
            }
        }

        // Spazio obbligatorio tra elementi (1 unità)
        setTimeout(() => {
            window.keyerState.currentSymbol = null;
            window.playKeyerSymbol();
        }, unit);
    }, duration);
};

window.handleKeyerEvent = function(type, duration) {
    if (!window.groupTxState.running && !window.transmissionState.active) return;

    const now = Date.now();
    const wpm = window.keyerState.enabled ? window.keyerState.wpm : (parseInt(window.courseData?.settings?.start_wpm) || 20);
    const unit = 1200 / wpm;

    if (window.groupTxState.running) {
        // Se iniziamo un nuovo segnale dopo un silenzio lungo, finalizziamo il carattere precedente
        if (type === 'on') {
            const gap = window.transmissionState.lastEventTime > 0 ? (now - window.transmissionState.lastEventTime) : 0;
            if (gap > unit * 2.0 && window.groupTxState.sequence.length > 0) {
                window.finalizeGroupCharacter(gap);
            }
        }
        window.groupTxState.sequence.push({ type: type, duration: duration });
        if (type === 'off') window.processGroupInput();
    }

    if (window.transmissionState.active) {
        window.transmissionState.sequence.push({ type: type, duration: duration });
        if (type === 'on') window.checkTransmissionCompletion();
    }

    window.transmissionState.lastEventTime = now;
};

/**
 * TRASMISSIONE GRUPPI
 */
window.startGroupTx = function() {
    try {
        console.log("GROUP_TX: Starting exercise...");
        window.groupTxState.running = true;
        window.groupTxState.phase = 'PROMPT';
        window.groupTxState.targetText = "VVV="; // Rimosso spazio per facilitare il confronto logico
        window.groupTxState.currentIndex = 0;
        window.groupTxState.consecutiveErrors = 0;
        window.groupTxState.sequence = [];
        window.groupTxState.startTime = Date.now();
        window.groupTxState.stats = {
            dotAccs: [],
            dashAccs: [],
            charSpaceAccs: [],
            wordSpaceAccs: []
        };

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
            prompt.textContent = "VVV ="; // Mantenuto spazio solo visivo
            prompt.style.color = "var(--link-color)";
            prompt.style.display = "block";
        }
        if (feedback) {
            feedback.textContent = "Trasmetti VVV = per iniziare";
            feedback.style.display = "block";
            feedback.style.color = "var(--link-color)";
        }
        if (analysis) analysis.style.display = 'none';

        const countInput = document.getElementById('groupCountInput');
        const numGroups = countInput ? parseInt(countInput.value) : 4;
        window.generateRandomGroups(numGroups);
        window.renderGroupContent();
    } catch (err) {
        console.error("GROUP_TX Error:", err);
        showToast("Errore avvio: " + err.message);
    }
};

window.stopGroupTx = function() {
    // Finalizziamo l'ultimo carattere se presente in memoria
    if (window.groupTxState.running && window.groupTxState.sequence.length > 0) {
        window.finalizeGroupCharacter(0);
    }

    window.groupTxState.running = false;
    if (window.groupTxState.timeout) clearTimeout(window.groupTxState.timeout);

    // Ripristino cursori e rimozione scudo
    document.body.style.cursor = 'default';
    if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e) {}
    const shield = document.getElementById('txMouseShield');
    if (shield) shield.remove();

    // Stop immediato di ogni suono residuo
    if (typeof window.stopTone === 'function') window.stopTone();
    if (typeof window.stopAllMorseAudio === 'function') window.stopAllMorseAudio();

    // Reset stati tasti per evitare loop infiniti (incantamento)
    window.keyerState.isDitDown = false;
    window.keyerState.isDahDown = false;
    window.keyerState.currentSymbol = null;
    window.keyerState.nextSymbol = null;

    const bStart = document.getElementById('btnStartGroupTx');
    const bStop = document.getElementById('btnStopGroupTx');
    const display = document.getElementById('groupTxDisplay');

    if (bStart) bStart.style.setProperty('display', 'block', 'important');
    if (bStop) bStop.style.setProperty('display', 'none', 'important');
    if (display) display.style.setProperty('display', 'none', 'important');
};

window.generateRandomGroups = function(numGroups = 4) {
    console.log("GROUP_TX: Generating random groups:", numGroups);
    const typeSelect = document.getElementById('groupTypeSelect');
    const type = typeSelect ? typeSelect.value : 'LETTERS';

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    let pool = letters;

    let text = "";

    if (type === 'ITALIAN') {
        // Usa il dizionario principale (Italiano) o quello personalizzato se presente
        let dict = (window.customDictionary && window.customDictionary.length > 0)
                   ? window.customDictionary
                   : (window.itDictionary || []);

        if (dict.length > 0) {
            let selectedWords = [];
            for (let i = 0; i < numGroups; i++) {
                let word = dict[Math.floor(Math.random() * dict.length)];
                selectedWords.push(word.toUpperCase());
            }
            text = selectedWords.join(" ");
        } else {
            // Fallback se il dizionario non è ancora caricato
            text = "PAROLA TEST ESERCIZIO CW";
        }
    } else {
        if (type === 'NUMBERS') pool = numbers;
        else if (type === 'ALPHANUM') pool = letters + numbers;

        for (let g = 0; g < numGroups; g++) {
            for (let c = 0; c < 5; c++) {
                text += pool[Math.floor(Math.random() * pool.length)];
            }
            if (g < numGroups - 1) text += " ";
        }
    }
    window.groupTxState.fullText = text;
};

window.renderGroupContent = function() {
    const cont = document.getElementById('groupTxContent');
    if (!cont) return;
    cont.innerHTML = '';

    const text = window.groupTxState.fullText;
    const words = text.split(" ");

    let charIndex = 0;
    words.forEach((word, wIdx) => {
        // Creiamo un contenitore per la singola parola/gruppo
        const wordSpan = document.createElement('span');
        wordSpan.style.display = "inline-block";
        wordSpan.style.whiteSpace = "nowrap";
        wordSpan.style.margin = "5px"; // Spazio tra le parole

        for (let i = 0; i < word.length; i++) {
            const charSpan = document.createElement('span');
            charSpan.textContent = word[i];
            charSpan.style.color = "#ffc107";
            charSpan.style.padding = "0 1px";
            charSpan.style.borderRadius = "3px";
            charSpan.id = "gtx_char_" + charIndex;
            wordSpan.appendChild(charSpan);
            charIndex++;
        }

        cont.appendChild(wordSpan);

        // Aggiungiamo uno spazio invisibile (o un marker) per la logica interna se necessario,
        // ma non mostriamo uno span fisico per lo spazio per non rompere il layout
        if (wIdx < words.length - 1) {
            charIndex++; // Incrementiamo l'indice per saltare lo spazio nel testo originale
        }
    });
};

window.updateGroupHighlight = function() {
    // Rimosso effetto invasivo: l'utente vede solo il cambio colore del carattere battuto (verde/rosso)
};

window.processGroupInput = function() {
    if (!window.groupTxState.running) return;
    if (window.groupTxState.timeout) clearTimeout(window.groupTxState.timeout);

    const wpm = window.keyerState.enabled ? window.keyerState.wpm : (parseInt(window.courseData?.settings?.start_wpm) || 20);
    const unit = 1200 / wpm;

    // Riduciamo il tempo di attesa da 3000ms a unit * 6 (circa 400ms a 20 WPM).
    // Questo rende il feedback molto più reattivo: appena smetti di battere,
    // dopo un tempo pari a due spazi tra lettere, il carattere viene validato.
    window.groupTxState.timeout = setTimeout(() => {
        if (window.groupTxState.running && window.groupTxState.sequence.length > 0) {
            window.finalizeGroupCharacter(unit * 6);
        }
    }, unit * 6);
};

window.finalizeGroupCharacter = function(actualGap = 0) {
    if (!window.groupTxState.running) return;

    const phase = window.groupTxState.phase;
    const targetText = (phase === 'PROMPT') ? window.groupTxState.targetText : window.groupTxState.fullText;

    // Saltiamo gli spazi nel testo target (avanzamento automatico dell'indice)
    while (window.groupTxState.currentIndex < targetText.length && targetText[window.groupTxState.currentIndex] === " ") {
        window.groupTxState.currentIndex++;
    }

    // Se abbiamo già finito tutto il testo, resettiamo e usciamo
    if (window.groupTxState.currentIndex >= targetText.length) {
        window.groupTxState.sequence = [];
        return;
    }

    const seq = window.groupTxState.sequence;
    const onElements = seq.filter(s => s.type === 'on');
    if (onElements.length === 0) {
        // Se non ci sono segnali utili, puliamo e usciamo
        window.groupTxState.sequence = [];
        return;
    }

    const wpm = window.keyerState.enabled ? window.keyerState.wpm : (parseInt(window.courseData?.settings?.start_wpm) || 20);
    const unit = 1200 / wpm;

    // --- DECODIFICA ---
    let detectedCode = "";
    onElements.forEach(el => {
        detectedCode += (el.duration > unit * 2.0) ? "-" : ".";
        const ideal = (el.duration > unit * 2.0) ? (unit * 3) : unit;
        const acc = Math.max(0, 100 - (Math.abs(el.duration - ideal) / ideal * 100));
        if (el.duration > unit * 2.0) window.groupTxState.stats.dashAccs.push(acc);
        else window.groupTxState.stats.dotAccs.push(acc);
    });

    const offElements = seq.filter(s => s.type === 'off');
    offElements.forEach(el => {
        const acc = Math.max(0, 100 - (Math.abs(el.duration - unit) / unit * 100));
        window.groupTxState.stats.charSpaceAccs.push(acc);
    });

    if (actualGap > 0 && window.groupTxState.currentIndex > 0) {
        const isNewWord = (targetText[window.groupTxState.currentIndex - 1] === " ");
        const idealGap = isNewWord ? (unit * 7) : (unit * 3);
        const gapAcc = Math.max(0, 100 - (Math.abs(actualGap - idealGap) / idealGap * 100));
        if (isNewWord) window.groupTxState.stats.wordSpaceAccs.push(gapAcc);
        else window.groupTxState.stats.charSpaceAccs.push(gapAcc);
    }

    const targetChar = targetText[window.groupTxState.currentIndex];
    const targetCode = window.morseDict[targetChar] || "";
    const isCorrect = (detectedCode === targetCode);

    const feedbackEl = document.getElementById('groupTxFeedback');

    if (phase === 'PROMPT') {
        if (isCorrect) {
            window.groupTxState.currentIndex++;
            if (window.groupTxState.currentIndex >= targetText.length) {
                window.groupTxState.phase = 'GROUPS';
                window.groupTxState.currentIndex = 0;
                const pEl = document.getElementById('groupTxPrompt');
                if (pEl) pEl.style.display = 'none';
                if (feedbackEl) feedbackEl.textContent = "BENE! ORA I GRUPPI...";
            } else {
                if (feedbackEl) feedbackEl.textContent = "Prossimo: " + targetText[window.groupTxState.currentIndex];
            }
        } else {
            if (feedbackEl) feedbackEl.textContent = "Ripeti " + targetChar + " (fatto: " + detectedCode + ")";
        }
    } else {
        const charEl = document.getElementById("gtx_char_" + window.groupTxState.currentIndex);
        if (charEl) {
            charEl.style.color = isCorrect ? "#4caf50" : "#f44336";
            charEl.style.textShadow = isCorrect ? "none" : "0 0 5px #f44336";
        }
        if (feedbackEl) {
            feedbackEl.innerHTML = isCorrect ? `<span style="color:#4caf50">OK</span>` : `<span style="color:#f44336">ERR (${detectedCode})</span>`;
        }
        window.groupTxState.currentIndex++;
        if (window.groupTxState.currentIndex >= targetText.length) {
            window.finishGroupTx();
        }
    }

    window.groupTxState.sequence = [];
    if (window.groupTxState.timeout) {
        clearTimeout(window.groupTxState.timeout);
        window.groupTxState.timeout = null;
    }
};

window.MANIPULATION_ADVICE = [
    "Mantieni un ritmo costante, come un metronomo.",
    "La linea deve durare esattamente tre volte il punto.",
    "Non affrettare i punti, lasciali respirare.",
    "Lo spazio tra gli elementi di una lettera deve essere pari a un punto.",
    "Lo spazio tra le lettere deve essere pari a tre punti.",
    "Lo spazio tra le parole deve essere pari a sette punti.",
    "Evita di 'trascinare' le linee, sii netto nel rilascio.",
    "Rilassa il polso, la manipolazione deve essere fluida.",
    "Se i punti sono troppo corti, il suono risulterà nervoso.",
    "Linee troppo lunghe appesantiscono la ricezione altrui.",
    "La costanza è più importante della velocità pura.",
    "Esercitati a velocità bassa prima di aumentare i WPM.",
    "Sii preciso nel chiudere i caratteri prima di spaziare.",
    "Un tocco leggero aiuta a mantenere il controllo sui paddle.",
    "Ascolta sempre il tuo sidetone con orecchio critico.",
    "Se sbagli una lettera, non fermarti, riprendi il ritmo subito.",
    "La spaziatura irregolare è la causa principale di errori di decodifica.",
    "Cerca di visualizzare il ritmo musicale del carattere.",
    "Non forzare la mano, lascia che il keyer faccia il lavoro.",
    "Assicurati che la tua interfaccia non abbia rimbalzi (bounce).",
    "I punti devono essere tutti della stessa identica durata.",
    "Le linee non devono variare di lunghezza durante la sessione.",
    "Impara a 'sentire' lo spazio di tre unità tra le lettere.",
    "Lo spazio di sette unità tra i gruppi definisce la parola.",
    "Se le linee sono corte, verranno scambiate per punti.",
    "Se i punti sono lunghi, il codice diventa ambiguo.",
    "La precisione millimetrica distingue l'esperto dal principiante.",
    "Mantieni la stessa pressione sui paddle per DIT e DAH.",
    "Il silenzio tra i segnali è importante quanto il suono.",
    "Sincronizza il respiro con la cadenza dei gruppi.",
    "Non anticipare il carattere successivo, finisci quello attuale.",
    "La manipolazione iambica richiede coordinazione, non forza.",
    "Se ti senti stanco, riduci i WPM e cura la forma.",
    "Immagina di scrivere nell'aria con un pennello.",
    "Evita di accorciare lo spazio tra i gruppi per la fretta.",
    "La chiarezza viene prima della velocità in ogni trasmissione.",
    "Un buon operatore si riconosce dalla perfezione degli spazi.",
    "Le linee 'pigre' rendono il morse difficile da leggere.",
    "I punti 'staccati' troppo presto possono sparire nel rumore.",
    "Fissa un obiettivo di accuratezza del 95% prima di salire.",
    "Analizza i tuoi errori: sono quasi sempre legati al tempo.",
    "Usa il corpo per assecondare il ritmo del braccio.",
    "Non cambiare impugnatura durante una sessione intensa.",
    "La tua mano deve essere un'estensione del circuito elettrico.",
    "Il CW è musica: ogni carattere ha la sua melodia specifica.",
    "Sii spietato con te stesso sulla durata del DAH.",
    "Lo spazio tra le parole è il respiro della frase.",
    "Se il ritmo è spezzato, la mente di chi riceve si stanca.",
    "Cura la fine del carattere, non lasciare code sonore.",
    "La perfezione tecnica si ottiene con la ripetizione lenta."
];

window.finishGroupTx = function() {
    window.groupTxState.running = false;

    // Stop audio residuo
    if (typeof window.stopTone === 'function') window.stopTone();

    document.getElementById('groupTxFeedback').textContent = "ESERCIZIO COMPLETATO! 🏆";
    const bStop = document.getElementById('btnStopGroupTx');
    const bStart = document.getElementById('btnStartGroupTx');
    if (bStop) bStop.style.display = 'none';
    if (bStart) bStart.style.display = 'block';

    const analysis = document.getElementById('groupTxAnalysis');
    const analysisText = document.getElementById('groupTxAnalysisText');
    if (analysis && analysisText) {
        analysis.style.display = 'block';

        const s = window.groupTxState.stats;
        const avgCharSpace = s.charSpaceAccs.length > 0 ? Math.round(s.charSpaceAccs.reduce((a,b)=>a+b,0)/s.charSpaceAccs.length) : 0;
        const avgWordSpace = s.wordSpaceAccs.length > 0 ? Math.round(s.wordSpaceAccs.reduce((a,b)=>a+b,0)/s.wordSpaceAccs.length) : 0;

        let report = `<b style="font-size:1.1em; color:var(--champ-color);">📊 Analisi Tecnica Finale:</b><br><br>`;
        report += `• <b>Spaziatura Caratteri:</b> ${avgCharSpace}%<br>`;
        if (avgWordSpace > 0) report += `• <b>Spaziatura Gruppi:</b> ${avgWordSpace}%<br>`;

        // Selezione di due consigli casuali dalla lista delle 50 frasi
        const advice1 = window.MANIPULATION_ADVICE[Math.floor(Math.random() * window.MANIPULATION_ADVICE.length)];
        let advice2 = window.MANIPULATION_ADVICE[Math.floor(Math.random() * window.MANIPULATION_ADVICE.length)];
        while (advice1 === advice2) advice2 = window.MANIPULATION_ADVICE[Math.floor(Math.random() * window.MANIPULATION_ADVICE.length)];

        let evaluation = "";
        const totalAvg = avgWordSpace > 0 ? (avgCharSpace + avgWordSpace) / 2 : avgCharSpace;
        if (totalAvg > 90) evaluation = "🔥 Eccellente! Sei un operatore di classe A.";
        else if (totalAvg > 75) evaluation = "👍 Buona prova, ma serve più costanza.";
        else evaluation = "⚠️ Devi lavorare molto sul ritmo e sulla precisione dei tempi.";

        analysisText.innerHTML = `${report}<br><b style="color:var(--link-color);">${evaluation}</b><br><br><i style="font-size:0.9em; opacity:0.8;">💡 Consigli dell'istruttore:</i><br>1. ${advice1}<br>2. ${advice2}`;
    }
};
