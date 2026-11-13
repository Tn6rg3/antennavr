// js/cwg_activity_manager.js - Gestore Attività Activity - CWG (Log QSO, Handshake Corrispondenza, Chat Privata & Chiavi A/B)

window.cwgQsoTimerInterval = null;
window.cwgExchangeTimerInterval = null;
window.cwgQsoTimerSeconds = 0;
window.cwgExchangeSecondsLeft = 120; // 2 Minuti per lo scambio chiavi
window.cwgGeneratedTxKey = "";
window.cwgLiveQsoListenerRef = null;
window.cwgCqAcceptedListenerRef = null;
window.cwgPrivateChatRef = null;
window.isCwgInitiator = false; // true se l'utente è Utente A (chi avvia per primo)
window.cwgMyHandshakeTs = 0;
window.cwgQsoStartTimestamp = 0;

window.cleanCallsignString = function(str) {
    if (!str) return "";
    let s = String(str).trim();
    if (s.startsWith('@')) s = s.substring(1);
    return s.toUpperCase().replace(/\s+/g, '');
};

window.saveMyActivityCallPreference = function(newCall) {
    const cleanCall = window.cleanCallsignString(newCall);
    if (!cleanCall || cleanCall.length < 2) return;
    localStorage.setItem('cwgame_activity_call', cleanCall);
    if (db && window.myId) {
        db.ref(`users/${window.myId}/activity_call`).set(cleanCall).catch(() => {});
        db.ref(`activity_cwg/registered_calls/${cleanCall}`).set(true).catch(() => {});
    }
    if (typeof window.listenToCwgDirectInvites === 'function') {
        window.listenToCwgDirectInvites();
    }
};

window.listenToCwgDirectInvites = async function() {
    const isBeta = (typeof window.isUserCwgBetaTester === 'function') ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) return;

    let myCall = window.cleanCallsignString(localStorage.getItem('cwgame_activity_call') || window.myName || "");
    if (!myCall || !db || window.isCwgDirectInviteListenerActive) return;
    window.isCwgDirectInviteListenerActive = true;

    db.ref(`activity_cwg/direct_invites/${myCall}`).on('value', snap => {
        if (!snap.exists()) return;
        const inv = snap.val() || {};

        const activeScreen = document.querySelector('.screen.active-screen')?.id;
        const isActivityScreenOpen = (activeScreen === 'cwgActivityScreen');
        const isQsoActive = (window.cwgQsoActiveInGame || !!window.cwgQsoTimerInterval || localStorage.getItem('cwgame_active_qso_session') !== null);

        // REGOLE DI NON DISTURBO RIGIDE:
        // 1. Se l'utente sta giocando una partita normale o del corso
        // 2. Se l'utente ha GIÀ la schermata dell'Activity aperta
        // 3. Se l'utente sta GIÀ facendo un QSO con un altro operatore
        // 4. Se l'invito è più vecchio di 2 minuti
        if (window.gameRunning || window.isCourseMode || isActivityScreenOpen || isQsoActive || (Date.now() - (inv.ts || 0) > 120000)) {
            return;
        }

        const fromCall = inv.fromCall;
        const band = (inv.band || '40m').toLowerCase();

        // VERIFICA RIGIDA: La notifica compare SOLO SE l'utente A (fromCall) è FISICAMENTE ONLINE ED IN ACTIVITY!
        db.ref(`activity_cwg/handshake/${fromCall}_${myCall}_${band}`).once('value', hSnap => {
            if (!hSnap.exists()) {
                db.ref(`activity_cwg/direct_invites/${myCall}`).remove().catch(() => {});
                return;
            }

            const hData = hSnap.val() || {};
            const isSenderInactive = (hData.appStatus === 'app_closed' || (Date.now() - (hData.ts || 0) > 20000));
            if (isSenderInactive) {
                db.ref(`activity_cwg/direct_invites/${myCall}`).remove().catch(() => {});
                return;
            }

            const modal = document.getElementById('cwgActivityInviteModal');
            const modalText = document.getElementById('cwgActivityInviteText');
            const acceptBtn = document.getElementById('btnAcceptCwgActivityInvite');

            if (modal && modalText) {
                modalText.innerHTML = `<b>${fromCall}</b> è attualmente in Activity sulla banda <b>${band.toUpperCase()}</b> e ti sta aspettando!<br><br>Vuoi accedere all'Activity per avviare il QSO?`;
                modal.style.display = 'flex';

                if (acceptBtn) {
                    acceptBtn.onclick = async () => {
                        modal.style.display = 'none';
                        db.ref(`activity_cwg/direct_invites/${myCall}`).remove().catch(() => {});

                        if (typeof window.openCwgActivityScreen === 'function') {
                            await window.openCwgActivityScreen();
                            const partnerInput = document.getElementById('cwgLogPartnerCall');
                            const bandSelect = document.getElementById('cwgLogBandSelect');
                            if (partnerInput) partnerInput.value = fromCall;
                            if (bandSelect && band) bandSelect.value = band.toLowerCase();
                            window.checkCwgDoubleHandshakeMatch();
                        }
                    };
                }
            }
        });
    });
};

window.openCwgActivityScreenImpl = async function() {
    const isBeta = typeof window.isUserCwgBetaTester === 'function' ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) {
        return alert("⚠️ Questa modalità è attualmente riservata ai Beta Tester autorizzati.");
    }

    let myActivityCall = localStorage.getItem('cwgame_activity_call');

    if (!myActivityCall && db && window.myId) {
        try {
            const snap = await db.ref(`users/${window.myId}/activity_call`).once('value');
            if (snap.exists() && snap.val()) {
                myActivityCall = snap.val().trim().toUpperCase();
                localStorage.setItem('cwgame_activity_call', myActivityCall);
            }
        } catch(e) {}
    }

    if (!myActivityCall || myActivityCall.length < 2) {
        const inputCall = prompt("📻 REGISTRAZIONE NOMINATIVO ACTIVITY:\n\nInserisci il tuo Call / Nominativo radioamatoriale per le sfide Activity (es. IU2XYZ o IK1ABC):");
        if (!inputCall || inputCall.trim().length < 2) {
            alert("⚠️ Per accedere alla modalità Activity è necessario registrare il proprio Nominativo.");
            return;
        }
        myActivityCall = window.cleanCallsignString(inputCall);
        window.saveMyActivityCallPreference(myActivityCall);
    }

    if (typeof window.showScreen === 'function') {
        window.showScreen('cwgActivityScreen');
    }

    if (typeof window.listenToCwgDirectInvites === 'function') {
        window.listenToCwgDirectInvites();
    }

    if (typeof window.initCwgSettingsRealtimeListener === 'function') {
        window.initCwgSettingsRealtimeListener();
    }

    if (typeof window.updateCwgTimerDisplaysUI === 'function') {
        window.updateCwgTimerDisplaysUI();
    }

    // Attiviamo l'ascolto della tabella dei QSO in corso nel gioco
    if (typeof window.listenToCwgLiveQsosTable === 'function') {
        window.listenToCwgLiveQsosTable();
    }

    // Controlliamo se qualcuno ha risposto ad un nostro Spot CQ recentemente (senza query non indicizzate)
    if (db && myActivityCall) {
        db.ref('activity_cwg/cq_accepted').once('value', snap => {
            if (snap.exists()) {
                snap.forEach(c => {
                    const val = c.val();
                    if (val && val.spotCall === myActivityCall && val.responderCall && (Date.now() - (val.ts || 0) < 300000)) {
                        const partnerInput = document.getElementById('cwgLogPartnerCall');
                        const bandSelect = document.getElementById('cwgLogBandSelect');

                        if (partnerInput && (!partnerInput.value || partnerInput.value.trim() === "")) {
                            partnerInput.value = val.responderCall;
                        }
                        if (bandSelect && val.band) {
                            bandSelect.value = val.band.toLowerCase();
                        }
                        window.checkCwgDoubleHandshakeMatch();
                    }
                });
            }
        }).catch(() => {});
    }

    // Controlliamo se c'è una sessione QSO già attiva da ripristinare anziché azzerare
    const activeSessionRaw = localStorage.getItem('cwgame_active_qso_session');
    if (activeSessionRaw) {
        try {
            const session = JSON.parse(activeSessionRaw);
            const elapsed = Math.floor((Date.now() - session.qsoStartTs) / 1000);

            if (elapsed < 360) { // Entro i 6 minuti totali (4 min QSO + 2 min Scambio)
                if (document.getElementById('cwgLogMyCall')) document.getElementById('cwgLogMyCall').value = session.myCall;
                if (document.getElementById('cwgLogPartnerCall')) document.getElementById('cwgLogPartnerCall').value = session.partnerCall;
                if (document.getElementById('cwgLogBandSelect')) document.getElementById('cwgLogBandSelect').value = session.band;
                if (document.getElementById('cwgLogStartTime')) document.getElementById('cwgLogStartTime').value = session.startTime;

                if (elapsed < 240) {
                    window.runCwgQsoTimerCountdown(elapsed, session.isInitiator);
                } else {
                    window.isCwgInitiator = session.isInitiator;
                    window.startCwgKeysExchangePhase();
                }
                return;
            }
        } catch(e) {
            localStorage.removeItem('cwgame_active_qso_session');
        }
    }

    window.resetCwgForm();
};

window.openCwgActivityScreen = window.openCwgActivityScreenImpl;

window.resetCwgForm = function() {
    if (window.cwgQsoTimerInterval) {
        clearInterval(window.cwgQsoTimerInterval);
        window.cwgQsoTimerInterval = null;
    }
    if (window.cwgExchangeTimerInterval) {
        clearInterval(window.cwgExchangeTimerInterval);
        window.cwgExchangeTimerInterval = null;
    }
    window.cwgQsoTimerSeconds = 0;
    window.cwgExchangeSecondsLeft = 120;
    window.cwgGeneratedTxKey = "";
    window.isCwgInitiator = false;
    window.cwgQsoActiveInGame = false;
    window.cwgQsoStartTimestamp = 0;
    localStorage.removeItem('cwgame_active_qso_session');

    if (window.cwgLiveQsoListenerRef) {
        try { window.cwgLiveQsoListenerRef.off(); } catch(e) {}
        window.cwgLiveQsoListenerRef = null;
    }

    if (window.cwgCqAcceptedListenerRef) {
        try { window.cwgCqAcceptedListenerRef.off(); } catch(e) {}
        window.cwgCqAcceptedListenerRef = null;
    }

    if (window.cwgMyPresenceKey && db) {
        try { db.ref(`activity_cwg/handshake/${window.cwgMyPresenceKey}`).remove(); } catch(e) {}
        window.cwgMyPresenceKey = null;
    }

    window.cleanCwgPrivateChat();

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const keysSec = document.getElementById('cwgKeysSection');
    const txBox = document.getElementById('cwgTxKeyDisplayBox');
    const saveBtn = document.getElementById('btnSaveCwgQso');
    const startBtn = document.getElementById('btnCwgStartTimer');
    const cancelBtn = document.getElementById('btnCwgCancelQso');
    const rxInput = document.getElementById('cwgRxKeyInput');
    const stepHelp = document.getElementById('cwgKeysStepHelpText');
    const statusBox = document.getElementById('cwgHandshakeStatusBox');

    if (statusBox) statusBox.style.display = "none";
    if (fillBar) fillBar.style.width = "0%";
    if (keysSec) keysSec.style.display = "none";
    if (txBox) txBox.style.display = "none";
    if (saveBtn) saveBtn.disabled = true;

    if (typeof window.updateCwgTimerDisplaysUI === 'function') {
        window.updateCwgTimerDisplaysUI();
    }
    if (cancelBtn) cancelBtn.style.display = "none";
    if (rxInput) {
        rxInput.value = "";
        rxInput.disabled = false;
    }
    if (stepHelp) stepHelp.textContent = "";

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "▶️ AVVIA QSO & TIMER 4 MINUTI";
    }

    const savedCall = localStorage.getItem('cwgame_activity_call') || "";
    const myCallInput = document.getElementById('cwgLogMyCall');
    if (myCallInput) {
        myCallInput.value = window.cleanCallsignString(savedCall);
    }

    if (document.getElementById('cwgLogPartnerCall')) document.getElementById('cwgLogPartnerCall').value = "";
    if (document.getElementById('cwgLogStartTime')) document.getElementById('cwgLogStartTime').value = "";
    if (document.getElementById('cwgLogEndTime')) document.getElementById('cwgLogEndTime').value = "";
    if (document.getElementById('cwgPrivateChatSection')) document.getElementById('cwgPrivateChatSection').style.display = "none";
};

window.cancelCwgQso = function() {
    if (confirm("Sei sicuro di voler annullare questo QSO? I dati ed il timer verranno azzerati.")) {
        window.resetCwgForm();
        if (typeof showToast === 'function') showToast("QSO annullato.");
    }
};

window.sendCwgCqSpotInChat = function() {
    if (!db || !window.myId) return alert("⚠️ Connessione non attiva.");
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || window.myName || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toUpperCase();

    if (!myCall || myCall.length < 2) return alert("⚠️ Inserisci prima il tuo Nominativo / Call.");

    if (confirm(`Lanciare il CQ SPOT per ${myCall} sulla banda ${band} in Bacheca e Chat Globale?`)) {
        window.removeCwgCqSpot(true, band);

        const text = `📡 [SPOT CQ ACTIVITY]: ${myCall} sta facendo chiamata CQ Activity - CWG sulla banda ${band}! 📻`;

        const chatRef = db.ref('globalChat').push();
        window.lastCqSpotMsgKey = chatRef.key;

        chatRef.set({
            senderId: window.myId,
            name: myCall,
            senderName: myCall,
            text: text,
            isCqSpot: true,
            spotCall: myCall,
            spotBand: band,
            ts: firebase.database.ServerValue.TIMESTAMP
        }).catch(() => {});

        const spotId = `cq_spot_${myCall}_${band}`;
        const spotRef = db.ref(`public_lobby_rooms/${spotId}`);

        spotRef.onDisconnect().remove();

        spotRef.set({
            isCqSpot: true,
            status: 'waiting',
            mode: 'cwg_activity',
            spotCall: myCall,
            spotBand: band,
            hostName: myCall,
            expiresAt: Date.now() + 3600000,
            ts: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            if (typeof showToast === 'function') showToast(`📡 CQ SPOT inviato sulla banda ${band}!`);
        }).catch(err => {
            console.error("CQ Spot Error:", err);
            alert("Errore invio spot.");
        });

        // ASCOLTO IN TEMPO REALE: Ascoltiamo quando qualcuno risponde al nostro Spot CQ per inserirlo automaticamente!
        if (window.cwgCqAcceptedListenerRef) {
            try { window.cwgCqAcceptedListenerRef.off(); } catch(e) {}
        }

        const acceptedRef = db.ref(`activity_cwg/cq_accepted/${myCall}_${band}`);
        window.cwgCqAcceptedListenerRef = acceptedRef;

        acceptedRef.on('value', snap => {
            if (!snap.exists()) return;
            const data = snap.val() || {};
            const responderCall = data.responderCall;

            if (responderCall && responderCall !== myCall) {
                console.log(`CWG: Spot accepted by ${responderCall}! Auto-filling partnerCall and triggering handshake.`);

                const partnerInput = document.getElementById('cwgLogPartnerCall');
                if (partnerInput) {
                    partnerInput.value = responderCall;
                }

                // Se l'ideatore dello spot non si trova nella schermata Activity CWG, la apriamo subito in automatico!
                const activeScreen = document.querySelector('.screen.active-screen')?.id;
                if (activeScreen !== 'cwgActivityScreen' && typeof window.showScreen === 'function') {
                    window.showScreen('cwgActivityScreen');
                }

                if (typeof showToast === 'function') {
                    showToast(`📡 ${responderCall} ha risposto al tuo Spot CQ su ${band}! Avvio QSO...`);
                }

                alert(`📡 ${responderCall} HA RISPOSTO AL TUO SPOT CQ SULLA BANDA ${band}!\n\nIl suo Call (${responderCall}) è stato inserito automaticamente. Il QSO parte in automatico!`);

                const startBtn = document.getElementById('btnCwgStartTimer');
                const cancelBtn = document.getElementById('btnCwgCancelQso');
                if (startBtn) {
                    startBtn.disabled = true;
                    startBtn.textContent = "⏳ IN ATTESA DEL CORRISPONDENTE...";
                }
                if (cancelBtn) cancelBtn.style.display = "block";

                window.checkCwgDoubleHandshakeMatch();
            }
        });
    }
};

window.removeCwgCqSpot = function(silent = false, targetBand = null) {
    if (!db || !window.myId) return;
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || window.myName || "");
    const band = targetBand || (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toUpperCase();

    if (!myCall || myCall.length < 2) return;

    if (!silent && !confirm(`Rimuovere lo Spot CQ per ${myCall} dalla Bacheca e dalla Chat Globale?`)) {
        return;
    }

    const spotId = `cq_spot_${myCall}_${band}`;
    db.ref(`public_lobby_rooms/${spotId}`).remove().catch(() => {});
    db.ref(`activity_cwg/cq_accepted/${myCall}_${band}`).remove().catch(() => {});

    if (window.cwgCqAcceptedListenerRef) {
        try { window.cwgCqAcceptedListenerRef.off(); } catch(e) {}
        window.cwgCqAcceptedListenerRef = null;
    }

    if (window.lastCqSpotMsgKey) {
        db.ref(`globalChat/${window.lastCqSpotMsgKey}`).remove().catch(() => {});
        window.lastCqSpotMsgKey = null;
    }

    db.ref('globalChat').orderByChild('spotCall').equalTo(myCall).once('value', snap => {
        if (snap.exists()) {
            snap.forEach(c => {
                const val = c.val();
                if (val && val.isCqSpot && (!targetBand || val.spotBand === band)) {
                    db.ref(`globalChat/${c.key}`).remove().catch(() => {});
                }
            });
        }
    });

    if (!silent && typeof showToast === 'function') showToast(`📡 Spot CQ rimosso con successo!`);
};

window.addEventListener('beforeunload', () => {
    try { window.removeCwgCqSpot(true); } catch(e) {}
    try { window.cleanCwgPrivateChat(); } catch(e) {}
});

window.joinCqSpotActivity = async function(spotCall, spotBand) {
    if (!spotCall) return;
    const isBeta = typeof window.isUserCwgBetaTester === 'function' ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) {
        return alert("⚠️ La modalità Activity - CWG è attualmente riservata ai Beta Tester autorizzati.");
    }

window.listenToCwgLiveQsosTable = function() {
    if (!db) return;
    const tableBody = document.getElementById('cwgLiveQsosTableBody');
    if (!tableBody) return;

    if (window.cwgLiveQsosRef) {
        try { window.cwgLiveQsosRef.off(); } catch(e) {}
    }

    window.cwgLiveQsosRef = db.ref('activity_cwg/handshake').limitToLast(15);
    window.cwgLiveQsosRef.on('value', snap => {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (!snap.exists()) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--hint-color); padding:10px;">Nessun QSO attualmente in corso.</td></tr>';
            return;
        }

        const now = Date.now();
        const activePairs = {};

        snap.forEach(child => {
            const data = child.val();
            if (data && data.myCall && data.partnerCall && (now - (data.ts || 0) < 360000)) {
                const sortedKey = [data.myCall, data.partnerCall].sort().join('_') + '_' + (data.band || '40m');
                if (!activePairs[sortedKey]) {
                    activePairs[sortedKey] = {
                        callA: data.myCall,
                        callB: data.partnerCall,
                        band: (data.band || '40m').toUpperCase(),
                        ts: data.ts
                    };
                }
            }
        });

        const list = Object.values(activePairs);
        if (list.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--hint-color); padding:10px;">Nessun QSO attualmente in corso.</td></tr>';
            return;
        }

        list.forEach(qso => {
            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom:1px solid rgba(255,255,255,0.05);";

            const tdA = document.createElement('td');
            tdA.style.cssText = "padding:6px; font-weight:bold; color:#00ff66;";
            tdA.textContent = qso.callA;

            const tdB = document.createElement('td');
            tdB.style.cssText = "padding:6px; font-weight:bold; color:#00bcd4;";
            tdB.textContent = qso.callB;

            const tdBand = document.createElement('td');
            tdBand.style.cssText = "padding:6px; text-align:center; font-weight:bold; color:#ff9800;";
            tdBand.textContent = qso.band;

            const tdStatus = document.createElement('td');
            tdStatus.style.cssText = "padding:6px; text-align:right; color:#4caf50; font-size:0.9em;";
            tdStatus.textContent = "🟢 In Corso";

            tr.appendChild(tdA);
            tr.appendChild(tdB);
            tr.appendChild(tdBand);
            tr.appendChild(tdStatus);
            tableBody.appendChild(tr);
        });
    });
};

    const cleanSpotCall = window.cleanCallsignString(spotCall);
    const cleanSpotBand = (spotBand || "40m").trim().toLowerCase();
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || localStorage.getItem('cwgame_activity_call') || window.myName || "");

    // 1. Notifichiamo l'ideatore dello spot (spotCall) che NOI (myCall) abbiamo accettato la sua chiamata!
    if (db && myCall) {
        const acceptedRef = db.ref(`activity_cwg/cq_accepted/${cleanSpotCall}_${cleanSpotBand.toUpperCase()}`);
        acceptedRef.onDisconnect().remove();
        acceptedRef.set({
            responderCall: myCall,
            spotCall: cleanSpotCall,
            band: cleanSpotBand,
            ts: Date.now()
        }).catch(() => {});
    }

    // 2. Rimuoviamo immediatamente lo spot spottato sia dalla Bacheca che dalla Chat Globale!
    if (db) {
        const spotId = `cq_spot_${cleanSpotCall}_${cleanSpotBand.toUpperCase()}`;
        db.ref(`public_lobby_rooms/${spotId}`).remove().catch(() => {});

        db.ref('globalChat').orderByChild('spotCall').equalTo(cleanSpotCall).once('value', snap => {
            if (snap.exists()) {
                snap.forEach(c => {
                    const val = c.val();
                    if (val && val.isCqSpot && val.spotBand === cleanSpotBand.toUpperCase()) {
                        db.ref(`globalChat/${c.key}`).remove().catch(() => {});
                    }
                });
            }
        }).catch(() => {});
    }

    if (typeof window.openCwgActivityScreen === 'function') {
        await window.openCwgActivityScreen();
    }

    const partnerInput = document.getElementById('cwgLogPartnerCall');
    const bandSelect = document.getElementById('cwgLogBandSelect');

    if (partnerInput) partnerInput.value = cleanSpotCall;
    if (bandSelect && cleanSpotBand) bandSelect.value = cleanSpotBand;

    const startBtn = document.getElementById('btnCwgStartTimer');
    const cancelBtn = document.getElementById('btnCwgCancelQso');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "⏳ IN ATTESA DEL CORRISPONDENTE...";
    }
    if (cancelBtn) cancelBtn.style.display = "block";

    window.checkCwgDoubleHandshakeMatch();
};

// --- CHAT PRIVATA TEMPORANEA DI SERVIZIO QSO ---
window.initCwgPrivateChat = function(myCall, partnerCall, band) {
    if (!db) return;
    const chatSection = document.getElementById('cwgPrivateChatSection');
    if (chatSection) chatSection.style.display = "block";

    const chatKey = [myCall, partnerCall].sort().join('_') + '_' + band;

    if (window.cwgPrivateChatRef) {
        try { window.cwgPrivateChatRef.off(); } catch(e) {}
    }

    window.cwgPrivateChatRef = db.ref(`activity_cwg/live_chat/${chatKey}`);

    window.cwgPrivateChatRef.on('value', snap => {
        const container = document.getElementById('cwgPrivateChatMessages');
        if (!container) return;

        container.innerHTML = '';
        if (!snap.exists()) {
            container.innerHTML = '<p style="color:var(--hint-color); text-align:center; margin:4px 0;">Chat di servizio aperta tra i due operatori.</p>';
            return;
        }

        snap.forEach(child => {
            const m = child.val();
            if (m && typeof m === 'object') {
                const msgDiv = document.createElement('div');
                msgDiv.style.cssText = "margin-bottom:4px; word-break:break-word;";

                const isMe = (m.sender === myCall);
                const nameSpan = document.createElement('b');
                nameSpan.style.color = isMe ? "#008ba3" : "#d32f2f";
                nameSpan.textContent = m.sender + ": ";

                const textSpan = document.createElement('span');
                textSpan.style.color = "#000000";
                textSpan.style.fontWeight = "bold";
                textSpan.textContent = m.text;

                msgDiv.appendChild(nameSpan);
                msgDiv.appendChild(textSpan);
                container.appendChild(msgDiv);
            }
        });

        container.scrollTop = container.scrollHeight;
    });
};

window.sendCwgPrivateChatMessage = function() {
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || window.myName || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!myCall || !partnerCall) {
        if (typeof showToast === 'function') showToast("⚠️ Inserisci prima il Call del corrispondente per chattare.");
        return;
    }

    if (!window.cwgPrivateChatRef && db) {
        window.initCwgPrivateChat(myCall, partnerCall, band);
    }

    if (!window.cwgPrivateChatRef) return;

    const input = document.getElementById('cwgPrivateChatInput');
    const txt = input ? input.value.trim() : "";
    if (!txt) return;

    const rxInput = document.getElementById('cwgRxKeyInput');
    const rxKey = rxInput ? rxInput.value.trim().toUpperCase() : "";
    const txKey = window.cwgGeneratedTxKey ? window.cwgGeneratedTxKey.toUpperCase() : "";

    const cleanTxtUpper = txt.toUpperCase().replace(/\s+/g, '');

    // BLOCCO RIGIDO DI SICUREZZA: Impossibile inviare la Chiave di Convalida in Chat
    const containsTxKey = (txKey.length === 8 && cleanTxtUpper.includes(txKey));
    const containsRxKey = (rxKey.length === 8 && cleanTxtUpper.includes(rxKey));

    if (containsTxKey || containsRxKey) {
        alert("🔒 SICUREZZA ACTIVITY - CWG:\n\nNon è consentito inviare la Chiave di Convalida nella Chat Privata!\n\nTrasmetti la tua chiave in codice Morse!");
        if (input) input.value = "";
        return;
    }

    window.cwgPrivateChatRef.push({
        sender: myCall,
        text: txt,
        ts: Date.now()
    }).then(() => {
        if (input) input.value = "";
    }).catch(e => {
        console.error("Chat Send Error:", e);
    });
};

window.cleanCwgPrivateChat = function() {
    if (window.cwgPrivateChatRef) {
        window.cwgPrivateChatRef.remove().catch(() => {});
        try { window.cwgPrivateChatRef.off(); } catch(e) {}
        window.cwgPrivateChatRef = null;
    }
    const chatSection = document.getElementById('cwgPrivateChatSection');
    if (chatSection) chatSection.style.display = "none";
};

window.toggleCwgPrivateChatBody = function() {
    const chatBody = document.getElementById('cwgPrivateChatBody');
    const btn = document.getElementById('btnToggleCwgPrivateChat');
    if (!chatBody || !btn) return;

    if (chatBody.style.display === 'none') {
        chatBody.style.display = 'block';
        btn.textContent = '🔼 Riduci';
    } else {
        chatBody.style.display = 'none';
        btn.textContent = '🔽 Espandi';
    }
};

window.checkCwgDoubleHandshakeMatch = async function() {
    if (!db) return;

    const myCallInput = document.getElementById('cwgLogMyCall');
    const partnerCallInput = document.getElementById('cwgLogPartnerCall');

    if (myCallInput) myCallInput.value = window.cleanCallsignString(myCallInput.value);
    if (partnerCallInput) partnerCallInput.value = window.cleanCallsignString(partnerCallInput.value);

    const myCall = myCallInput ? myCallInput.value : "";
    const partnerCall = partnerCallInput ? partnerCallInput.value : "";
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();
    const statusBox = document.getElementById('cwgHandshakeStatusBox');

    if (!myCall || myCall.length < 2 || !partnerCall || partnerCall.length < 2 || myCall === partnerCall) {
        if (statusBox) statusBox.style.display = "none";
        return;
    }

    // CHECK RIGIDO ANTI-DUPLICATO SU FIREBASE PER LA GIORNATA ODIERNA
    const now = new Date();
    const year = now.getFullYear();
    const monthStr = year + "-" + String(now.getMonth() + 1).padStart(2, '0');
    const dayStr = monthStr + "-" + String(now.getDate()).padStart(2, '0');

    const callsArray = [myCall, partnerCall].sort();
    const sharedQsoKey = callsArray.join("_") + "_" + band;

    try {
        const checkQsoSnap = await db.ref(`activity_cwg/qsos/${monthStr}/${dayStr}/${sharedQsoKey}`).once('value');
        if (checkQsoSnap.exists()) {
            if (statusBox) {
                statusBox.style.display = "block";
                statusBox.style.background = "#ffffff";
                statusBox.style.border = "2px solid #d32f2f";
                statusBox.textContent = "";

                const span = document.createElement('span');
                span.style.color = "#d32f2f";
                span.style.fontWeight = "bold";
                span.style.fontSize = "0.85em";
                span.textContent = `⚠️ QSO GIÀ REGISTRATO OGGI! Hai già registrato un QSO sulla banda ${band.toUpperCase()} oggi con ${partnerCall}. Non è possibile effettuare un secondo QSO sulla stessa banda nello stesso giorno.`;
                statusBox.appendChild(span);
            }
            return;
        }
    } catch(e) {}

    // Inserisce il segnale di invito diretto per il partner
    if (db && partnerCall && partnerCall.length >= 2 && myCall) {
        db.ref(`activity_cwg/direct_invites/${partnerCall}`).set({
            fromCall: myCall,
            band: band,
            ts: firebase.database.ServerValue.TIMESTAMP
        }).catch(() => {});
    }

    // Inizializza immediatamente la Chat Privata tra i due Call
    if (typeof window.initCwgPrivateChat === 'function') {
        window.initCwgPrivateChat(myCall, partnerCall, band);
    }

    if (window.cwgLiveQsoListenerRef) {
        try { window.cwgLiveQsoListenerRef.off(); } catch(e) {}
        window.cwgLiveQsoListenerRef = null;
    }

    const nowTs = Date.now();
    window.cwgMyHandshakeTs = nowTs;

    const myPresenceKey = `${myCall}_${partnerCall}_${band}`;
    window.cwgMyPresenceKey = myPresenceKey;
    const myPresenceRef = db.ref(`activity_cwg/handshake/${myPresenceKey}`);
    myPresenceRef.onDisconnect().update({ appStatus: 'app_closed', ts: Date.now() });
    myPresenceRef.set({
        myCall: myCall,
        partnerCall: partnerCall,
        band: band,
        appStatus: document.hidden ? 'app_paused' : 'active',
        ts: nowTs
    }).catch(() => {});

    const partnerPresenceKey = `${partnerCall}_${myCall}_${band}`;
    const partnerPresenceRef = db.ref(`activity_cwg/handshake/${partnerPresenceKey}`);
    window.cwgLiveQsoListenerRef = partnerPresenceRef;

    db.ref(`activity_cwg/registered_calls/${partnerCall}`).once('value', uSnap => {
        let isRegistered = uSnap.exists();

        if (statusBox && !window.cwgQsoActiveInGame) {
            statusBox.style.display = "block";
            statusBox.style.background = "#ffffff";
            statusBox.style.border = "2px solid #ff9800";
            statusBox.textContent = "";

            const span = document.createElement('span');
            span.style.fontSize = "0.85em";
            span.style.fontWeight = "bold";
            span.style.color = "#000000";

            const regText = isRegistered ? " (✅ Registrato)" : " (⚠️ Non ancora registrato)";
            span.textContent = `⏳ STANDBY: In attesa che ${partnerCall}${regText} inserisca il tuo Call (${myCall}) sulla banda ${band.toUpperCase()} per avviare il QSO...`;
            statusBox.appendChild(span);
        }
    });

    partnerPresenceRef.on('value', snap => {
        if (!snap.exists()) {
            // SE IL QSO ERA IN CORSO E IL CORRISPONDENTE ANNULLA O SI SCOLLEGA:
            if (window.cwgQsoTimerInterval || window.cwgQsoActiveInGame) {
                alert(`⚠️ Il corrispondente ${partnerCall} ha annullato il QSO.\n\nIl collegamento è stato annullato (0 Punti).`);
                window.resetCwgForm();
            }
            return;
        }

        const data = snap.val() || {};
        const partnerTs = data.ts || 0;
        const partnerStatus = data.appStatus || 'active';
        const partnerDiff = Date.now() - partnerTs;
        const isPartnerAppClosed = (partnerStatus === 'app_closed' || partnerDiff > 25000);

        // VERIFICA DI FRESCHEZZA STRETTA: Entrambi i timestamp devono essere stati creati a meno di 60 secondi di distanza!
        if (Math.abs(nowTs - partnerTs) <= 60000) {
            window.cwgQsoActiveInGame = true;

            // 1. AGGIORNIAMO SUBITO IL BOX DI STATO PER ENTRAMBI I DISPOSITIVI!
            if (statusBox) {
                statusBox.style.display = "block";
                if (isPartnerAppClosed) {
                    statusBox.style.background = "#fff3cd";
                    statusBox.style.border = "2px solid #ff9800";
                    statusBox.textContent = "";

                    const span = document.createElement('span');
                    span.style.color = "#b78103";
                    span.style.fontSize = "0.85em";
                    span.style.fontWeight = "bold";
                    span.textContent = `⚠️ ATTENZIONE: ${partnerCall} ha minimizzato l'app o chiuso Telegram! Avvisalo via radio per farlo rientrare! (Timer QSO in corso)`;
                    statusBox.appendChild(span);
                } else {
                    statusBox.style.background = "#ffffff";
                    statusBox.style.border = "2px solid #4caf50";
                    statusBox.textContent = "";

                    const span = document.createElement('span');
                    span.style.color = "#000000";
                    span.style.fontSize = "0.85em";
                    span.style.fontWeight = "bold";
                    span.textContent = `🟢 CORRISPONDENZA CONFERMATA CON ${partnerCall}! QSO AVVIATO! (Partner in App)`;
                    statusBox.appendChild(span);
                }
            }

            // 2. Inizializza la Chat Privata di Servizio per questo QSO
            if (typeof window.initCwgPrivateChat === 'function') {
                window.initCwgPrivateChat(myCall, partnerCall, band);
            }

            // 3. Avvia il Timer per entrambi calcolando il tempo reale trascorso se la sessione era gia attiva
            if (!window.cwgQsoTimerInterval && window.cwgQsoTimerSeconds === 0) {
                let initialElapsed = 0;
                let isInitiatorVal = (nowTs <= partnerTs);

                const activeSessionRaw = localStorage.getItem('cwgame_active_qso_session');
                if (activeSessionRaw) {
                    try {
                        const session = JSON.parse(activeSessionRaw);
                        if (session && session.partnerCall === partnerCall && session.band === band) {
                            const calcElapsed = Math.floor((Date.now() - (session.qsoStartTs || Date.now())) / 1000);
                            if (calcElapsed < 360) {
                                initialElapsed = calcElapsed;
                                if (session.isInitiator !== undefined) isInitiatorVal = session.isInitiator;
                            }
                        }
                    } catch(e) {}
                }

                if (typeof showToast === 'function' && initialElapsed === 0) {
                    showToast(`🟢 Corrispondenza confermata tra ${myCall} e ${partnerCall}! Timer avviato.`);
                }

                window.runCwgQsoTimerCountdown(initialElapsed, isInitiatorVal);
            }
        }
    });
};

window.startCwgQsoTimer = function() {
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!myCall || myCall.length < 2) {
        return alert("⚠️ Inserisci prima il tuo Nominativo (Call) valido.");
    }
    if (!partnerCall || partnerCall.length < 2) {
        return alert("⚠️ Inserisci il Nominativo (Call) del corrispondente prima di avviare il QSO.");
    }
    if (myCall === partnerCall) {
        return alert("⚠️ Non puoi effettuare un QSO Activity con te stesso.");
    }

    const year = new Date().getFullYear();
    const monthStr = year + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
    const dayStr = monthStr + "-" + String(new Date().getDate()).padStart(2, '0');

    const callsArray = [myCall, partnerCall].sort();
    const sharedQsoKey = callsArray.join("_") + "_" + band;

    if (db) {
        db.ref(`activity_cwg/qsos/${monthStr}/${dayStr}/${sharedQsoKey}`).once('value', snap => {
            if (snap.exists()) {
                alert(`⚠️ Risulta già registrato un QSO per la banda ${band.toUpperCase()} oggi tra ${myCall} e ${partnerCall}!\n\nNon è possibile effettuare un secondo QSO sulla stessa banda nello stesso giorno.`);
                window.resetCwgForm();
                return;
            }

            const cancelBtn = document.getElementById('btnCwgCancelQso');
            const startBtn = document.getElementById('btnCwgStartTimer');
            if (startBtn) {
                startBtn.disabled = true;
                startBtn.textContent = "⏳ IN ATTESA DEL CORRISPONDENTE...";
            }
            if (cancelBtn) cancelBtn.style.display = "block";

            window.checkCwgDoubleHandshakeMatch();
        });
    } else {
        window.checkCwgDoubleHandshakeMatch();
    }
};

window.initCwgSettingsRealtimeListener = function() {
    if (!db || window.isCwgSettingsListenerActive) return;
    window.isCwgSettingsListenerActive = true;

    db.ref('appConfig/cwg_activity_settings').on('value', snap => {
        if (snap.exists() && snap.val()) {
            window.cwgSettingsCache = snap.val();
            if (typeof window.updateCwgTimerDisplaysUI === 'function') {
                window.updateCwgTimerDisplaysUI();
            }
        }
    });
};

window.fetchCwgSettingsAsync = async function() {
    window.initCwgSettingsRealtimeListener();
    if (window.cwgSettingsCache && typeof window.cwgSettingsCache === 'object' && window.cwgSettingsCache.qsoDurationMinutes) {
        return window.cwgSettingsCache;
    }
    try {
        if (db) {
            const snap = await db.ref('appConfig/cwg_activity_settings').once('value');
            if (snap.exists() && snap.val()) {
                window.cwgSettingsCache = snap.val();
                return snap.val();
            }
        }
    } catch(e) {}
    return {};
};

window.getCwgQsoDurationMinutes = function() {
    return window.cwgSettingsCache?.qsoDurationMinutes || 4;
};

window.getCwgKeysDurationMinutes = function() {
    return window.cwgSettingsCache?.keysDurationMinutes || 2;
};

window.updateCwgTimerDisplaysUI = async function() {
    await window.fetchCwgSettingsAsync();
    const targetQsoMinutes = window.getCwgQsoDurationMinutes();
    const totalMinsStr = String(targetQsoMinutes).padStart(2, '0');

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const startBtn = document.getElementById('btnCwgStartTimer');

    if (timerDisp && (!window.cwgQsoTimerInterval || window.cwgQsoTimerSeconds === 0)) {
        timerDisp.textContent = `00:00 / ${totalMinsStr}:00 (STANDBY)`;
    }

    if (startBtn && (!startBtn.disabled || startBtn.textContent.includes('AVVIA'))) {
        startBtn.textContent = `▶️ AVVIA QSO & TIMER ${targetQsoMinutes} MINUTI`;
    }
};

window.runCwgQsoTimerCountdown = function(initialElapsedSeconds = 0, isInitiator = true) {
    window.isCwgInitiator = isInitiator;

    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const startTimeInput = document.getElementById('cwgLogStartTime');
    if (startTimeInput && (!startTimeInput.value || startTimeInput.value.trim() === "")) {
        startTimeInput.value = `${hh}:${mm}`;
    }

    const startBtn = document.getElementById('btnCwgStartTimer');
    const cancelBtn = document.getElementById('btnCwgCancelQso');

    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "🟢 QSO IN CORSO...";
    }
    if (cancelBtn) cancelBtn.style.display = "block";

    const qsoStartTs = Date.now() - (Number(initialElapsedSeconds) * 1000);
    window.cwgQsoStartTimestamp = qsoStartTs;

    localStorage.setItem('cwgame_active_qso_session', JSON.stringify({
        myCall: myCall,
        partnerCall: partnerCall,
        band: band,
        startTime: startTimeInput ? startTimeInput.value : `${hh}:${mm}`,
        qsoStartTs: qsoStartTs,
        isInitiator: isInitiator
    }));

    if (window.cwgQsoTimerInterval) clearInterval(window.cwgQsoTimerInterval);

    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');

    const targetQsoMinutes = window.getCwgQsoDurationMinutes();
    const targetQsoSeconds = targetQsoMinutes * 60;

    const updateTimerUI = () => {
        const curNow = Date.now();
        const realSecs = Math.floor((curNow - window.cwgQsoStartTimestamp) / 1000);
        window.cwgQsoTimerSeconds = Math.max(0, realSecs);
        const currentSecs = window.cwgQsoTimerSeconds;

        const mins = String(Math.floor(currentSecs / 60)).padStart(2, '0');
        const secs = String(currentSecs % 60).padStart(2, '0');
        const totalMinsStr = String(targetQsoMinutes).padStart(2, '0');

        if (timerDisp) {
            timerDisp.textContent = `${mins}:${secs} / ${totalMinsStr}:00`;
            timerDisp.style.color = "#00ff66";
        }

        const perc = Math.min(100, (currentSecs / targetQsoSeconds) * 100);
        if (fillBar) {
            fillBar.style.width = `${perc}%`;
            fillBar.style.background = "#00ff66";
        }

        if (currentSecs >= targetQsoSeconds) {
            if (window.cwgQsoTimerInterval) {
                clearInterval(window.cwgQsoTimerInterval);
                window.cwgQsoTimerInterval = null;
            }

            const endNow = new Date();
            const endHh = String(endNow.getHours()).padStart(2, '0');
            const endMm = String(endNow.getMinutes()).padStart(2, '0');
            const endTimeInput = document.getElementById('cwgLogEndTime');
            if (endTimeInput && (!endTimeInput.value || endTimeInput.value.trim() === "")) {
                endTimeInput.value = `${endHh}:${endMm}`;
            }

            window.startCwgKeysExchangePhase();
        }
    };

    updateTimerUI();
    window.cwgQsoTimerInterval = setInterval(() => {
        updateTimerUI();
    }, 1000);
};

window.startCwgKeysExchangePhase = function() {
    const keysSec = document.getElementById('cwgKeysSection');
    const timerDisp = document.getElementById('cwgQsoTimerDisplay');
    const fillBar = document.getElementById('cwgTimerProgressFill');
    const stepHelp = document.getElementById('cwgKeysStepHelpText');
    const txBox = document.getElementById('cwgTxKeyDisplayBox');

    const keysMinutes = window.getCwgKeysDurationMinutes();
    const keysTotalSeconds = keysMinutes * 60;
    const qsoMinutes = window.getCwgQsoDurationMinutes();
    const qsoTotalSeconds = qsoMinutes * 60;
    const maxTotalSeconds = qsoTotalSeconds + keysTotalSeconds;

    if (keysSec) keysSec.style.display = "block";

    if (window.isCwgInitiator) {
        window.requestCwgTxKey();
        if (stepHelp) {
            stepHelp.textContent = `① Trasmetti la tua Chiave TX in Morse a B, e scrivi qui sotto la Chiave RX che B ti invierà entro ${keysMinutes} minut${keysMinutes === 1 ? 'o' : 'i'}!`;
            stepHelp.style.color = "#ffffff";
        }
    } else {
        if (txBox) txBox.style.display = "none";
        if (stepHelp) {
            stepHelp.textContent = `① Ricevi la Chiave Morse di A ed inseriscila nel campo qui sotto entro ${keysMinutes} minut${keysMinutes === 1 ? 'o' : 'i'} per sbloccare la tua Chiave TX!`;
            stepHelp.style.color = "#ffffff";
        }
    }

    if (window.cwgExchangeTimerInterval) clearInterval(window.cwgExchangeTimerInterval);

    window.cwgExchangeTimerInterval = setInterval(() => {
        const totalElapsed = Math.floor((Date.now() - (window.cwgQsoStartTimestamp || Date.now())) / 1000);
        window.cwgExchangeSecondsLeft = Math.max(0, maxTotalSeconds - totalElapsed);
        const left = window.cwgExchangeSecondsLeft;

        const mins = String(Math.floor(left / 60)).padStart(2, '0');
        const secs = String(left % 60).padStart(2, '0');

        if (timerDisp) {
            timerDisp.textContent = `⏱️ SCAMBIO CHIAVI (${keysMinutes}m): ${mins}:${secs}`;
            timerDisp.style.color = left < 30 ? "#ff5252" : "#ffffff";
        }

        const perc = Math.max(0, (left / keysTotalSeconds) * 100);
        if (fillBar) {
            fillBar.style.width = `${perc}%`;
            fillBar.style.background = left < 30 ? "#ff5252" : "#ffffff";
        }

        if (left <= 0) {
            clearInterval(window.cwgExchangeTimerInterval);
            window.cwgExchangeTimerInterval = null;

            const rxInput = document.getElementById('cwgRxKeyInput');
            const rxKey = rxInput ? rxInput.value.trim() : "";

            if (rxKey.length === 8) {
                showToast("⏱️ Tempo di scambio scaduto. Salvataggio automatico del Log...");
                window.saveCwgQsoLog();
            } else {
                alert(`⏱️ TEMPO LIMITE SCADUTO (${keysMinutes} Minut${keysMinutes === 1 ? 'o' : 'i'} superat${keysMinutes === 1 ? 'o' : 'i'})!\n\nNon è stata inserita una Chiave valida entro il tempo limite. Il QSO viene annullato (0 Punti).`);
                window.resetCwgForm();
            }
        }
    }, 1000);
};

window.onCwgRxKeyInputChanged = function() {
    const rxInput = document.getElementById('cwgRxKeyInput');
    const rxKey = rxInput ? rxInput.value.trim().toUpperCase() : "";
    const confirmBtn = document.getElementById('btnConfirmCwgKey');

    if (rxKey.length === 8) {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.background = "#4caf50";
        }
    } else {
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.background = "rgba(255,255,255,0.2)";
        }
    }
};

window.confirmCwgRxKey = function() {
    const rxInput = document.getElementById('cwgRxKeyInput');
    const rxKey = rxInput ? rxInput.value.trim().toUpperCase() : "";
    const confirmBtn = document.getElementById('btnConfirmCwgKey');

    if (rxKey.length !== 8) {
        return alert("⚠️ Inserisci una chiave a 8 caratteri prima di confermare.");
    }

    if (rxInput) rxInput.disabled = true;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "CHIAVE CONFERMATA ✅";
        confirmBtn.style.background = "#00bcd4";
    }

    if (!window.isCwgInitiator || !window.cwgGeneratedTxKey) {
        window.requestCwgTxKey();
    }

    window.publishCwgExchangeKeyStatus(rxKey, true);
};

window.publishCwgExchangeKeyStatus = function(rxKey, isConfirmed = false) {
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();
    const year = new Date().getFullYear();
    const dateStr = year + "-" + String(new Date().getMonth() + 1).padStart(2, '0') + "-" + String(new Date().getDate()).padStart(2, '0');

    if (!myCall || !partnerCall || !db) return;

    const callsArray = [myCall, partnerCall].sort();
    const sharedQsoKey = callsArray.join('_') + '_' + band + '_' + dateStr;
    window.cwgActiveSharedKey = sharedQsoKey;

    if (window.cwgExchangeListenerRef) {
        try { window.cwgExchangeListenerRef.off(); } catch(e) {}
    }

    const exchangeRef = db.ref(`activity_cwg/keys_exchange/${sharedQsoKey}/${myCall}`);
    exchangeRef.onDisconnect().remove();
    exchangeRef.set({
        myCall: myCall,
        partnerCall: partnerCall,
        rxKey: rxKey,
        confirmed: isConfirmed,
        txKey: window.cwgGeneratedTxKey || "",
        ts: Date.now()
    }).catch(() => {});

    // Ascolto del nodo dell'altro operatore
    const partnerExchangeRef = db.ref(`activity_cwg/keys_exchange/${sharedQsoKey}/${partnerCall}`);
    window.cwgExchangeListenerRef = partnerExchangeRef;

    partnerExchangeRef.on('value', snap => {
        const saveBtn = document.getElementById('btnSaveCwgQso');
        const stepHelp = document.getElementById('cwgKeysStepHelpText');
        const pData = (snap.exists() && snap.val()) ? snap.val() : {};

        const partnerConfirmed = (pData.confirmed === true && pData.rxKey && pData.rxKey.length === 8);

        if (isConfirmed && partnerConfirmed) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.background = "#00ff66";
                saveBtn.style.color = "#000000";
                saveBtn.textContent = "💾 TERMINA E CONVALIDA QSO (+2 PT)";
            }
            if (stepHelp) {
                stepHelp.textContent = `🟢 ENTRAMBI GLI OPERATORI HANNO CONFERMATO LE CHIAVI! Clicca su "TERMINA E CONVALIDA QSO" per registrare +2 Punti ciascuno!`;
                stepHelp.style.color = "#00ff66";
            }
        } else if (isConfirmed) {
            if (saveBtn) saveBtn.disabled = true;
            if (stepHelp) {
                stepHelp.textContent = `⏳ CHIAVE CONFERMATA. In attesa che anche ${partnerCall} inserisca e confermi la sua chiave...`;
                stepHelp.style.color = "#ff9800";
            }
        } else {
            if (saveBtn) saveBtn.disabled = true;
            if (stepHelp) {
                stepHelp.textContent = `① Inserisci la chiave ricevuta e clicca "CONFERMA CHIAVE" per procedere!`;
                stepHelp.style.color = "#ffffff";
            }
        }
    });

    // Ascolta anche se l'altro operatore ha già inviato il salvataggio definitivo sul server
    const savedRef = db.ref(`activity_cwg/keys_exchange/${sharedQsoKey}/saved`);
    window.cwgSavedListenerRef = savedRef;
    savedRef.on('value', sSnap => {
        if (sSnap.exists() && sSnap.val() && sSnap.val().by !== myCall) {
            const data = sSnap.val();
            alert(`✅ QSO CONCLUSO E CONVALIDATO DALL'ALTRO OPERATORE (${data.by})!\n\nPunti Assegnati: +${data.points || 2} pt a ciascun telegrafista!`);
            window.resetCwgForm();
            if (typeof window.showScreen === 'function') window.showScreen('setupScreen');
        }
    });
};

window.requestCwgTxKey = async function() {
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();
    const startTime = (document.getElementById('cwgLogStartTime')?.value || "").trim();

    if (!partnerCall || partnerCall.length < 2) return;

    const txBox = document.getElementById('cwgTxKeyDisplayBox');
    const txText = document.getElementById('cwgTxKeyText');

    if (txText) txText.textContent = "Generazione...";
    if (txBox) txBox.style.display = "block";

    const serverUrl = (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL)
        ? VALIDATION_SERVER_URL
        : "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    try {
        const url = `${serverUrl}?action=generate_cwg_key&userId=${window.myId}&partnerCall=${encodeURIComponent(partnerCall)}&band=${encodeURIComponent(band)}&startTime=${encodeURIComponent(startTime)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data && data.status === 'ok' && data.key) {
            window.cwgGeneratedTxKey = data.key;
            if (txText) txText.textContent = data.key;
        } else {
            if (txText) txText.textContent = "ERRORE";
        }
    } catch(e) {
        console.error("CWG Key Fetch Error:", e);
        const fallbackKey = "K" + String(Date.now()).slice(-7);
        window.cwgGeneratedTxKey = fallbackKey;
        if (txText) txText.textContent = fallbackKey;
    }
};

window.saveCwgQsoLog = async function() {
    const myCall = window.cleanCallsignString(document.getElementById('cwgLogMyCall')?.value || "");
    const partnerCall = window.cleanCallsignString(document.getElementById('cwgLogPartnerCall')?.value || "");
    const band = (document.getElementById('cwgLogBandSelect')?.value || "40m").trim().toLowerCase();

    if (!myCall || myCall.length < 2) return alert("⚠️ Inserisci prima il tuo Nominativo / Call.");

    window.saveMyActivityCallPreference(myCall);

    let endTimeInput = document.getElementById('cwgLogEndTime');
    if (endTimeInput && (!endTimeInput.value || endTimeInput.value.trim() === "")) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        endTimeInput.value = `${hh}:${mm}`;
    }

    const startTime = (document.getElementById('cwgLogStartTime')?.value || "").trim();
    const endTime = endTimeInput ? endTimeInput.value.trim() : "";
    const rstTx = (document.getElementById('cwgLogRstTx')?.value || "599").trim();
    const rstRx = (document.getElementById('cwgLogRstRx')?.value || "599").trim();
    const rxKey = (document.getElementById('cwgRxKeyInput')?.value || "").trim().toUpperCase();
    const txKey = window.cwgGeneratedTxKey;

    if (!partnerCall || partnerCall.length < 2) return alert("⚠️ Inserisci un Call del corrispondente valido.");
    if (rxKey.length !== 8) return alert("⚠️ La Chiave Ricevuta deve contenere esattamente 8 caratteri.");
    if (!txKey) return alert("⚠️ Chiave di Trasmissione non ancora generata.");

    if (window.cwgExchangeTimerInterval) {
        clearInterval(window.cwgExchangeTimerInterval);
        window.cwgExchangeTimerInterval = null;
    }

    if (!confirm(`CONFERMA SALVATAGGIO DEFINITIVO:\n\nQSO con: ${partnerCall}\nBanda: ${band}\nOra Inizio: ${startTime} | Ora Fine: ${endTime}\nChiave RX: ${rxKey}\nChiave TX: ${txKey}\n\nATTENZIONE: Una volta salvato, il Log NON potrà più essere modificato o eliminato. Procedere?`)) {
        return;
    }

    if (typeof showToast === 'function') showToast("Salvataggio Log QSO in corso...");

    const serverUrl = (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL)
        ? VALIDATION_SERVER_URL
        : "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    try {
        const saveUrl = `${serverUrl}?action=save_cwg_qso&userId=${window.myId}&userName=${encodeURIComponent(myCall)}&partnerCall=${encodeURIComponent(partnerCall)}&band=${encodeURIComponent(band)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&rstTx=${encodeURIComponent(rstTx)}&rstRx=${encodeURIComponent(rstRx)}&rxKey=${encodeURIComponent(rxKey)}&txKey=${encodeURIComponent(txKey)}`;
        const resp = await fetch(saveUrl);
        const resData = await resp.json();

        if (resData && resData.status === 'ok') {
            window.monthlyLeaderboardCache = {};
            window.maxWpmRecordsCache = {};

            // Notifichiamo all'altro operatore che il QSO e stato salvato con successo dal server!
            const year = new Date().getFullYear();
            const dateStr = year + "-" + String(new Date().getMonth() + 1).padStart(2, '0') + "-" + String(new Date().getDate()).padStart(2, '0');
            const callsArray = [myCall, partnerCall].sort();
            const sharedQsoKey = callsArray.join('_') + '_' + band + '_' + dateStr;

            db.ref(`activity_cwg/keys_exchange/${sharedQsoKey}/saved`).set({
                by: myCall,
                points: resData.points || 2,
                ts: Date.now()
            }).catch(() => {});

            alert(`✅ QSO CONVALIDATO E SALVATO!\n\nPunti Assegnati: +${resData.points || 2} pt a ciascun telegrafista!\n\n${resData.message || ""}`);
            window.resetCwgForm();
            if (typeof window.showScreen === 'function') window.showScreen('setupScreen');
        } else {
            alert("⚠️ " + (resData.message || "Errore durante il salvataggio del QSO."));
        }
    } catch(e) {
        console.error("CWG Save Error:", e);
        alert("Errore di connessione durante il salvataggio. Riprova tra poco.");
    }
};

window.resumeCwgQsoOnWake = function() {
    const activeSessionRaw = localStorage.getItem('cwgame_active_qso_session');
    if (!activeSessionRaw) return;

    try {
        const session = JSON.parse(activeSessionRaw);
        const now = Date.now();
        const elapsed = Math.floor((now - session.qsoStartTs) / 1000);

        if (elapsed < 360) {
            console.log(`CWG: Resuming active QSO on phone wake. Real elapsed: ${elapsed}s`);

            const screen = document.getElementById('cwgActivityScreen');
            if (screen && screen.style.display === 'none') {
                if (typeof window.showScreen === 'function') window.showScreen('cwgActivityScreen');
            }

            if (typeof window.checkCwgDoubleHandshakeMatch === 'function') {
                window.checkCwgDoubleHandshakeMatch();
            }

            if (elapsed < 240) {
                window.runCwgQsoTimerCountdown(elapsed, session.isInitiator);
            } else {
                window.isCwgInitiator = session.isInitiator;
                window.startCwgKeysExchangePhase();
            }
        } else {
            localStorage.removeItem('cwgame_active_qso_session');
        }
    } catch(e) {}
};

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) window.resumeCwgQsoOnWake();
});
window.addEventListener('pageshow', () => window.resumeCwgQsoOnWake());
window.addEventListener('focus', () => window.resumeCwgQsoOnWake());
