// Versione corretta di app.js con fix sintassi e log di debug avanzati
// ... (resto del file sopra invariato) ...

async function sendPushNotification(targetId, text) {
    if (!VALIDATION_SERVER_URL || !targetId) return;
    // Messaggio generico per la privacy
    const genericText = "Hai nuovi messaggi su Sfida Telegrafia! 📻";
    const url = `${VALIDATION_SERVER_URL}?action=notify&targetId=${targetId}&text=${encodeURIComponent(genericText)}`;
    try {
        fetch(url, { mode: 'no-cors' });
        console.log("Push: Richiesta inviata per " + targetId);
    } catch(e) { console.error("Push Error:", e); }
}

window.requestTelegramPushPermissions = function() {
    const btn = document.getElementById('pushNotifBtn');

    // Se sono già attive, le disattiviamo
    if (window.myPushNotifs) {
        window.myPushNotifs = false;
        if (window.db && window.myId) db.ref(`users/${window.myId}/pushNotifications`).set(false);
        localStorage.setItem(STORAGE_PUSH_NOTIFS_KEY, "false");
        showToast("🔕 Notifiche disattivate");
        updatePushBtnUI(btn);
        return;
    }

    // Se sono disattivate, chiediamo il permesso e attiviamo
    if (tg.requestWriteAccess) {
        tg.requestWriteAccess((allowed) => {
            if (allowed) {
                window.myPushNotifs = true;
                if (window.db && window.myId) {
                    db.ref(`users/${window.myId}/pushNotifications`).set(true);
                    db.ref(`users/${window.myId}/pushEnabled`).set(true);
                }
                localStorage.setItem(STORAGE_PUSH_NOTIFS_KEY, "true");
                showToast("✅ Notifiche di Sistema attivate!");
                updatePushBtnUI(btn);
            }
        });
    } else {
        showToast("⚠️ Funzionalità non supportata da questa versione di Telegram.");
    }
};

window.updatePushBtnUI = function(btn) {
    if (!btn) btn = document.getElementById('pushNotifBtn');
    if (!btn) return;

    if (window.myPushNotifs) {
        btn.textContent = "🔔 Notifiche: ATTIVE";
        btn.style.backgroundColor = "var(--btn-success-bg, #28a745)";
        btn.style.color = "#fff";
    } else {
        btn.textContent = "🔕 Notifiche: DISATTIVATE";
        btn.style.backgroundColor = "var(--btn-secondary-bg, #6c757d)";
        btn.style.color = "#fff";
    }
};

window.startApp = startApp;

function initGame() {
    const firebaseConfig = {
        apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
        authDomain: "telegrafiabot.firebaseapp.com",
        databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "telegrafiabot",
        storageBucket: "telegrafiabot.firebasestorage.app",
        messagingSenderId: "575790683327",
        appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    // --- ESPORTAZIONE GLOBALE PER CONSOLE E DEBUG ---
    window.db = firebase.database();
    window.auth = firebase.auth();
    db = window.db;
    auth = window.auth;

    isGlobalChatMuted = localStorage.getItem(STORAGE_CHAT_MUTED_KEY) === 'true';
    if (els.startWpmInput) els.startWpmInput.value = localStorage.getItem(STORAGE_PREF_WPM) || 20;
    if (els.wordCountInput) els.wordCountInput.value = localStorage.getItem(STORAGE_PREF_WORDS) || 10;
    if (els.toneInput) els.toneInput.value = localStorage.getItem(STORAGE_PREF_TONE) || 600;

    // RIPRISTINO IMPOSTAZIONI AGGIUNTIVE
    if (els.charSpaceInput) els.charSpaceInput.value = localStorage.getItem(STORAGE_PREF_CHAR_SPACE) || "";
    if (els.wordSpaceSelect) els.wordSpaceSelect.value = localStorage.getItem(STORAGE_PREF_WORD_SPACE) || "1.0";
    if (els.fixedSpeedCheckbox) els.fixedSpeedCheckbox.checked = localStorage.getItem(STORAGE_PREF_FIXED) === 'true';
    if (els.easyModeCheckbox) els.easyModeCheckbox.checked = localStorage.getItem(STORAGE_PREF_EASY) === 'true';
    if (els.allowSpectatorsCheckbox) els.allowSpectatorsCheckbox.checked = localStorage.getItem(STORAGE_PREF_SPECTATE) === 'true';

    // SALVATAGGIO AUTOMATICO DELLE PREFERENZE AL CAMBIO
    const savePref = (key, val) => localStorage.setItem(key, val);
    els.startWpmInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_WPM, e.target.value));
    els.wordCountInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORDS, e.target.value));
    els.toneInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_TONE, e.target.value));
    els.charSpaceInput?.addEventListener('change', (e) => savePref(STORAGE_PREF_CHAR_SPACE, e.target.value));
    els.wordSpaceSelect?.addEventListener('change', (e) => savePref(STORAGE_PREF_WORD_SPACE, e.target.value));
    els.fixedSpeedCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_FIXED, e.target.checked));
    els.easyModeCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_EASY, e.target.checked));
    els.allowSpectatorsCheckbox?.addEventListener('change', (e) => savePref(STORAGE_PREF_SPECTATE, e.target.checked));

    isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
    chatCwWpm = parseInt(localStorage.getItem(STORAGE_CHAT_CW_WPM)) || 20;
    chatCwTone = parseInt(localStorage.getItem(STORAGE_CHAT_CW_TONE)) || 600;

    // RIPRISTINO VALORI INPUT CHAT CW
    if (els.chatCwWpmInput) els.chatCwWpmInput.value = chatCwWpm;
    if (els.chatCwToneInput) els.chatCwToneInput.value = chatCwTone;

    // SALVATAGGIO AUTOMATICO IMPOSTAZIONI CHAT CW
    els.chatCwWpmInput?.addEventListener('change', (e) => {
        chatCwWpm = parseInt(e.target.value) || 20;
        localStorage.setItem(STORAGE_CHAT_CW_WPM, chatCwWpm);
    });
    els.chatCwToneInput?.addEventListener('change', (e) => {
        chatCwTone = parseInt(e.target.value) || 600;
        localStorage.setItem(STORAGE_CHAT_CW_TONE, chatCwTone);
    });

    if (els.toggleChatCwBtn) {
        const updateBtn = () => {
            // Sincronizzazione variabile globale con stato reale
            isChatCwEnabled = localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true';
            els.toggleChatCwBtn.textContent = isChatCwEnabled ? "📻 CW: ON" : "📻 CW: OFF";
            els.toggleChatCwBtn.className = isChatCwEnabled ? "btn btn-success" : "btn btn-secondary";
            if (els.chatCwSettingsPanel) els.chatCwSettingsPanel.style.display = isChatCwEnabled ? 'block' : 'none';
        };
        updateBtn();
        els.toggleChatCwBtn.onclick = () => {
            const newState = !(localStorage.getItem(STORAGE_CHAT_CW_ENABLED) === 'true');
            localStorage.setItem(STORAGE_CHAT_CW_ENABLED, newState);
            isChatCwEnabled = newState; // Forza aggiornamento variabile globale
            updateBtn();
            if (typeof listenToChat === 'function') listenToChat();
        };
    }

    auth.signInAnonymously().then(async () => {
        window.myId = tgUser.id.toString();
        console.log("CW Game: Auth success, Telegram ID:", window.myId);

        // --- SISTEMA DI MAPPING E PRESENZA ---
        db.ref('.info/connected').on('value', async (s) => {
            if (s.val() === true && window.myId) {
                console.log("App: Connessione stabilita, ripristino mapping e presenza...");

                // 1. Ripristina il mapping di sicurezza (Fondamentale per le regole Firebase)
                try {
                    const mappingRef = db.ref(`uid_mapping/${firebase.auth().currentUser.uid}`);
                    await mappingRef.set(window.myId);
                    mappingRef.onDisconnect().remove();
                } catch (e) { console.error("Mapping Error:", e); }

                // 2. Ripristina la presenza online
                const pRef = db.ref(`presence/${window.myId}`);
                pRef.onDisconnect().remove();
                const presenceData = {
                    name: window.myName || tgUser.first_name,
                    username: window.myPrivacy ? "" : tgUsername,
                    status: 'online',
                    uid: firebase.auth().currentUser.uid,
                    ts: firebase.database.ServerValue.TIMESTAMP,
                    lastActive: firebase.database.ServerValue.TIMESTAMP
                };
                if (window.userProgression?.level) presenceData.level = window.userProgression.level;
                pRef.set(presenceData);

                // 3. Forza il ricontrollo dei permessi Admin al ripristino della connessione
                if (typeof window.setupBugSystem === 'function') {
                    window.setupBugSystem();
                }
            }
        });

        const userRef = db.ref(`users/${window.myId}`);
        const snap = await userRef.once('value');
        const data = snap.val() || {};

        // --- PROTEZIONE ANTI-SPAM (USERNAME GATE) ---
        // Se l'utente non ha username E non esiste ancora nel database, lo blocchiamo
        if (!tgUsername && !snap.exists()) {
            if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
            if (els.noUsernameScreen) els.noUsernameScreen.classList.add('active-screen');
            return; // Interrompiamo l'avvio
        }

        // --- GESTIONE ALIAS E PRIVACY DI DEFAULT ---
        let needsUpdate = false;
        const updates = {};

        // VALIDAZIONE RIGOROSA NOMINATIVO (Max 1 icona, min 2 testo)
        let rawName = data.alias || tgUser.first_name || "Operatore";
        const isValid = window.isNameValid(rawName);

        if (!isValid) {
            // Se l'utente ha già un nome assegnato dal sistema in passato, lo riusiamo
            if (data.assignedDefaultName) {
                window.myName = data.assignedDefaultName;
                if (data.alias !== window.myName) {
                    updates.alias = window.myName;
                    needsUpdate = true;
                }
            } else {
                // Generiamo un nuovo nome GiocatoreX
                try {
                    const result = await db.ref('appConfig/userCounter').transaction(curr => (curr || 0) + 1);
                    const newCount = result.snapshot.val();
                    window.myName = "Giocatore" + newCount;
                    updates.assignedDefaultName = window.myName;
                    updates.alias = window.myName;
                    needsUpdate = true;

                    setTimeout(() => {
                        tg.showAlert("⚠️ Il tuo nome non è valido (richiesto testo e max 1 icona). Ti è stato assegnato il nome: " + window.myName + ". Puoi cambiarlo nel Profilo.");
                    }, 3000);
                } catch(e) {
                    console.error("Counter Error:", e);
                    window.myName = "Giocatore";
                }
            }
        } else {
            window.myName = rawName;
            if (!data.alias) {
                updates.alias = window.myName;
                needsUpdate = true;
            }
        }

        if (data.privacyUsername === undefined) {
            window.myPrivacy = true;
            updates.privacyUsername = true;
            needsUpdate = true;
        } else {
            window.myPrivacy = data.privacyUsername;
        }

        if (data.privacyOnline === undefined) {
            window.myPrivacyOnline = false; // Default: visibile online
            updates.privacyOnline = false;
            needsUpdate = true;
        } else {
            window.myPrivacyOnline = data.privacyOnline;
        }

        if (data.privacyLeaderboard === undefined) {
            window.myPrivacyLeaderboard = false; // Default: visibile in classifica
            updates.privacyLeaderboard = false;
            needsUpdate = true;
        } else {
            window.myPrivacyLeaderboard = data.privacyLeaderboard;
        }

        if (data.pushNotifications === undefined) {
            window.myPushNotifs = true;
            updates.pushNotifications = true;
            needsUpdate = true;
        } else {
            window.myPushNotifs = data.pushNotifications;
        }

        if (needsUpdate) {
            await userRef.update(updates);
            console.log("Privacy: Applied default settings (Privacy ON, Alias set).");
        }

        if (!snap.exists() || !data.welcomed) {
            // Aggiorniamo welcomed e i dati base
            await userRef.update({ welcomed: true, createdAt: firebase.database.ServerValue.TIMESTAMP });
            window.isNewUserWaitingWelcome = true; // Flag per coordinare la sfida giornaliera
            if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'flex';
        }

        if (els.playerName) els.playerName.textContent = window.myName;

        // --- SISTEMA LAZY CLEANUP GIORNALIERO ---
        try {
            const cleanupRef = db.ref('appConfig/lastCleanupTs');
            cleanupRef.once('value', snap => {
                const lastCleanup = snap.val() || 0;
                const now = Date.now();
                const ONE_DAY_MS = 24 * 60 * 60 * 1000;

                if (now - lastCleanup > ONE_DAY_MS) {
                    console.log("CW Game: Running daily chat cleanup...");
                    // Svuotiamo le chat principali per mantenere il DB leggero
                    db.ref('globalChat').remove();
                    db.ref('courseChat').remove();
                    db.ref('courseChats').remove(); // Pulizia aule tutor
                    cleanupRef.set(now);
                }
            });
        } catch(e) { console.warn("Cleanup error:", e); }

        // --- PULIZIA SESSIONI PRECEDENTI (SOLO SE VECCHIE) ---
        db.ref('rooms').orderByChild('hostId').equalTo(window.myId).once('value', s => {
            const now = Date.now() + serverTimeOffset;
            s.forEach(roomSnap => {
                const room = roomSnap.val();
                // Eliminiamo solo se la stanza è in waiting da più di 1 minuto
                // Questo permette di cambiare dispositivo senza killare la stanza appena creata
                if (room.status === 'waiting' && (!room.createdAt || (now - room.createdAt) > 60000)) {
                    roomSnap.ref.remove();
                    db.ref(`public_lobby_rooms/${roomSnap.key}`).remove();
                }
            });
        });

        // --- SBLOCCO UI CRITICO ---
        if (els.loadingText) els.loadingText.style.display = 'none';
        if (els.createRoomBtn) {
            els.createRoomBtn.disabled = false;
            console.log("CW Game: UI Unlocked.");
        }

        db.ref('.info/connected').on('value', s => {
            if (!s.val()) return;
            const pRef = db.ref(`presence/${myId}`);
            pRef.onDisconnect().remove();
            const presenceData = {
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                status: 'online',
                uid: firebase.auth().currentUser.uid,
                ts: firebase.database.ServerValue.TIMESTAMP,
                lastActive: firebase.database.ServerValue.TIMESTAMP
            };

            if (window.userProgression && window.userProgression.level) {
                presenceData.level = window.userProgression.level;
            }

            pRef.set(presenceData);
        });

        // --- MONITORAGGIO INATTIVITÀ ---
        const updateActivity = () => { lastActivityTs = Date.now(); };
        ['mousedown', 'keydown', 'touchstart', 'input'].forEach(evt => window.addEventListener(evt, updateActivity));

        setInterval(() => {
            const now = Date.now();
            if (now - lastActivityTs > INACTIVITY_TIMEOUT_MS) {
                console.log("Inattività rilevata (15 min). Chiusura sessione.");
                if (roomCode) {
                    window.showToast?.(currentLang === 'it' ? "Sessione chiusa per inattività." : "Session closed due to inactivity.");
                    window.exitRoomCleanly?.(false, true);
                }
                // Rimuoviamo anche la presenza per sicurezza
                db.ref(`presence/${myId}`).remove();
                // Fermiamo l'aggiornamento automatico fino alla prossima interazione
            } else if (db && myId) {
                // Aggiorna il timestamp sul server ogni minuto per mostrare che siamo vivi
                db.ref(`presence/${myId}/lastActive`).set(firebase.database.ServerValue.TIMESTAMP);
            }
        }, 60000); // Controllo ogni minuto

        if (startParam) {
            if (startParam.startsWith('team_')) window.processTeamInvite?.(startParam.replace('team_', ''));
            else if (startParam.startsWith('room_')) window.joinSpecificRoom?.(startParam.replace('room_', ''));
        } else {
            const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
            if (lastRoom) {
                db.ref(`rooms/${lastRoom}`).once('value', s => {
                    if (s.exists() && s.val().status !== 'finished') {
                        roomCode = lastRoom; if (els.rejoinContainer) els.rejoinContainer.style.display = 'block';
                        showScreen('setupScreen');
                    } else { localStorage.removeItem(STORAGE_ROOM_KEY); showScreen('setupScreen'); }
                });
            } else showScreen('setupScreen');
        }

        const savedLang = localStorage.getItem('gameLang');
        if (savedLang) window.setLanguage(savedLang); else updateMuteBtnUI();
        
        window.loadDictionaries().then(() => {
            let today = new Date().toISOString().split('T')[0];

            if (startParam) return;

            // Verifichiamo se l'utente ha già giocato o iniziato la sfida OGGI
            db.ref(`users/${myId}`).once('value', userSnap => {
                const userData = userSnap.val() || {};
                const history = userData.history || {};
                const lastAttemptDate = userData.daily_attempt || "";

                let alreadyPlayedToday = (lastAttemptDate === today);

                if (!alreadyPlayedToday) {
                    Object.values(history).forEach(m => {
                        if (!m.date) return;
                        const mDate = new Date(m.date).toISOString().split('T')[0];
                        if (m.mode === 'daily_challenge' && mDate === today) alreadyPlayedToday = true;
                    });
                }

                const alreadyShownToday = localStorage.getItem(STORAGE_DAILY_STATUS_KEY) === today;

                if (!alreadyPlayedToday && !alreadyShownToday && els.dailyChallengeModal) {
                    // Se l'utente è nuovo, aspettiamo che chiuda il benvenuto
                    if (window.isNewUserWaitingWelcome) {
                        window.pendingDailyChallengeShow = true;
                    } else {
                        els.dailyChallengeModal.style.display = 'flex';
                    }
                } else if (alreadyPlayedToday) {
                    // Aggiorniamo il cache locale se Firebase dice che abbiamo giocato
                    localStorage.setItem(STORAGE_DAILY_STATUS_KEY, today);
                }
            });
        });

        const savedCustom = localStorage.getItem(STORAGE_CUSTOM_DICT_KEY);
        if (savedCustom) { try { window.customDictionary = JSON.parse(savedCustom); window.updateCustomDictStatus?.(); } catch(e) { console.error("Local Storage Error:", e); } }

        window.listenToRooms?.();
        window.listenToOnlineUsers?.();
        window.listenToInvites?.();

        // --- ATTIVAZIONE SISTEMA SFIDE (Fix Avvio Simultaneo) ---
        if (typeof window.listenToInviteAccepted === 'function') {
            window.listenToInviteAccepted();
        }

        window.initBattleRoyaleScheduler?.();
        window.initGlobalNotificationListener?.(); // AVVIO LISTENER BACKGROUND
        window.loadRegolamento();
        window.initProgression?.();
        window.initCourseManager?.();
        window.initQuizManager?.();
        window.setupBugSystem?.();
        window.initAdminAnnouncementListener();
        window.checkBugFeedback();

        // --- GESTIONE VERSIONI E BANNER AGGIORNAMENTO ---
        const updateVers = () => {
            if (els.appVersionDisplay) els.appVersionDisplay.textContent = "v" + APP_VERSION;
            const footer = document.getElementById('appVersionFooter');
            if (footer) footer.textContent = APP_VERSION;
        };
        updateVers();
        setTimeout(updateVers, 1500); // Forza dopo caricamento altri script

        db.ref('appConfig/latestVersion').on('value', snap => {
            const latestStr = snap.val() ? String(snap.val()).trim() : "";
            const currentStr = String(APP_VERSION).trim();
            if (latestStr && latestStr !== currentStr) {
                if (els.updateBanner) els.updateBanner.style.display = 'block';
            } else {
                if (els.updateBanner) els.updateBanner.style.display = 'none';
            }
        });
    }).catch(err => {
        console.error("CW Game: Auth Error", err);
        const statusText = document.getElementById('initStatusText');
        if (statusText) {
            statusText.textContent = "Errore di connessione al server Morse. Ricarica l'app o riprova più tardi.";
            statusText.style.color = "#f44336";
        }
    });

    window.populateGameModesUI?.();
    window.checkGameTypeUI?.();
    setTimeout(() => { window.checkGameTypeUI?.(); }, 1200);
}

/**
 * LISTENER ANNUNCI AMMINISTRATORE (Global Popup)
 */
window.initAdminAnnouncementListener = function() {
    if (!db) return;

    db.ref('admin_announcement').on('value', snap => {
        const data = snap.val();
        if (!data || !data.active || !data.text) {
            if (els.adminAnnouncementModal) els.adminAnnouncementModal.style.display = 'none';
            return;
        }

        const annId = data.id || "default";
        const lastSeen = localStorage.getItem(STORAGE_LAST_ANNOUNCEMENT_ID);

        // Se l'ID è diverso da quello salvato, mostriamo il popup
        if (annId !== lastSeen) {
            if (els.adminAnnouncementModal && els.adminAnnouncementText) {
                if (els.adminAnnouncementTitle) els.adminAnnouncementTitle.textContent = data.title || "Comunicazione";
                els.adminAnnouncementText.innerHTML = data.text.replace(/\n/g, '<br>');
                els.adminAnnouncementModal.style.display = 'flex';

                // Bottone di conferma
                if (els.btnConfirmAnnouncement) {
                    els.btnConfirmAnnouncement.onclick = () => {
                        localStorage.setItem(STORAGE_LAST_ANNOUNCEMENT_ID, annId);
                        els.adminAnnouncementModal.style.display = 'none';
                    };
                }
            }
        }
    });
};

window.closeWelcomeAndCheckDaily = function() {
    if (els.welcomeNewUserModal) els.welcomeNewUserModal.style.display = 'none';
    window.isNewUserWaitingWelcome = false;

    // Se c'è una sfida giornaliera in attesa, mostrala ora
    if (window.pendingDailyChallengeShow && els.dailyChallengeModal) {
        setTimeout(() => {
            els.dailyChallengeModal.style.display = 'flex';
            window.pendingDailyChallengeShow = false;
        }, 500);
    }
};

// --- SISTEMA BUG E ADMIN ---
window.setupBugSystem = function() {
    const badge = document.getElementById('bugsBadge');
    if (!db) return;

    // Rilevamento Admin basato su Permessi Firebase
    // Tentiamo di leggere bugReports: se Firebase lo permette, siamo admin.
    db.ref('bugReports').limitToLast(1).once('value').then(snap => {
        window.isAdmin = true;
        if (els.adminBugPanel) els.adminBugPanel.style.display = 'block';
        window.updateAdminBadge();

        // 2. Tutor Requests Listener (Attivo solo se siamo effettivamente admin)
        db.ref('tutorRequests').off('value');
        db.ref('tutorRequests').on('value', () => {
            window.updateAdminBadge();
        });
    }).catch((error) => {
        // Nascondiamo il pannello SOLO se l'errore è esplicitamente di permessi mancanti
        // e se siamo effettivamente collegati (per evitare falsi positivi durante il freeze)
        if (error.code === 'PERMISSION_DENIED') {
            window.isAdmin = false;
            if (els.adminBugPanel) els.adminBugPanel.style.display = 'none';
            if (badge) badge.style.display = 'none';
        }
    });

    // 3. Invio Bug (Per tutti)
    if (document.getElementById('btnSendBugReport')) {
        document.getElementById('btnSendBugReport').onclick = () => {
            const textarea = document.getElementById('bugReportText');
            if (!textarea) return;
            const text = textarea.value.trim();
            if (text.length < 5) return showToast("Messaggio troppo breve!");

            db.ref('bugReports').push({
                from: myName,
                fromId: myId,
                username: tgUsername || "N/A",
                msg: text,
                ts: firebase.database.ServerValue.TIMESTAMP,
                date: new Date().toLocaleString('it-IT')
            }).then(() => {
                showToast("Segnalazione inviata! Grazie.");
                textarea.value = "";
            }).catch(() => showToast("Errore nell'invio."));
        };
    }

    // 4. Lettori (Solo Admin)
    if (els.btnReadAllBugs) {
        els.btnReadAllBugs.onclick = () => window.loadAdminBugs();
    }
    if (els.btnReadTutorRequests) {
        els.btnReadTutorRequests.onclick = () => window.loadAdminTutorRequests();
    }

    // --- GESTIONE INVIO ANNUNCIO GLOBALE (ADMIN) ---
    if (els.btnAdminSendAnnouncement) {
        els.btnAdminSendAnnouncement.onclick = () => {
            const title = els.adminAnnTitleInput?.value.trim() || "Comunicazione";
            const text = els.adminAnnTextInput?.value.trim();

            if (!text || text.length < 5) return showToast("Testo annuncio troppo breve!");

            if (confirm("Inviare questo annuncio a TUTTI gli utenti?")) {
                const newId = "ann_" + Date.now(); // ID automatico basato sul tempo
                db.ref('admin_announcement').set({
                    active: true,
                    id: newId,
                    title: title,
                    text: text,
                    ts: firebase.database.ServerValue.TIMESTAMP
                }).then(() => {
                    // Segnamo l'annuncio come già letto per l'admin stesso, così non gli appare il pop-up
                    localStorage.setItem(STORAGE_LAST_ANNOUNCEMENT_ID, newId);
                    showToast("Annuncio pubblicato con successo! 🚀");
                    if (els.adminAnnTitleInput) els.adminAnnTitleInput.value = "";
                    if (els.adminAnnTextInput) els.adminAnnTextInput.value = "";
                }).catch(err => {
                    console.error("Admin: Error publishing announcement", err);
                    showToast("Errore durante la pubblicazione.");
                });
            }
        };
    }

    if (els.btnAdminClearAnnouncement) {
        els.btnAdminClearAnnouncement.onclick = () => {
            if (confirm("Rimuovere l'annuncio attivo? Non apparirà più a nessuno.")) {
                db.ref('admin_announcement').update({ active: false }).then(() => {
                    showToast("Annuncio rimosso.");
                });
            }
        };
    }

    // --- TASTO DEV: RESET SFIDA GIORNALIERA ---
    if (els.btnDevResetDaily) {
        els.btnDevResetDaily.onclick = async () => {
            if (!confirm("Sei lo Sviluppatore. Vuoi resettare la tua sfida di oggi?")) return;
            const today = new Date().toISOString().split('T')[0];

            try {
                // 1. Rimuove dalla classifica
                await db.ref(`leaderboard/daily_challenge/${today}/${myId}`).remove();

                // 2. Rimuove dallo storico
                const hSnap = await db.ref(`users/${myId}/history`).orderByChild('mode').equalTo('daily_challenge').once('value');
                hSnap.forEach(s => {
                    const val = s.val();
                    if (val && val.date && new Date(val.date).toISOString().split('T')[0] === today) {
                        s.ref.remove();
                    }
                });

                // 3. Pulisce cache locale
                localStorage.removeItem(STORAGE_DAILY_STATUS_KEY);

                showToast("Sfida resettata! Ricarica l'app.");
                setTimeout(() => location.reload(), 1000);
            } catch(e) { alert("Errore: " + e.message); }
        };
    }
};

window.updateAdminBadge = async function() {
    const badge = document.getElementById('bugsBadge');
    if (!badge || !db) return;

    try {
        const lastSeenBugTs = parseInt(localStorage.getItem('cw_last_bug_ts') || 0);

        // Contiamo bug nuovi e tutor requests pendenti
        const [bugsSnap, tutorSnap] = await Promise.all([
            db.ref('bugReports').once('value'),
            db.ref('tutorRequests').once('value')
        ]);

        let count = 0;
        if (bugsSnap.exists()) {
            bugsSnap.forEach(c => { if (c.val().ts > lastSeenBugTs) count++; });
        }
        if (tutorSnap.exists()) {
            count += Object.keys(tutorSnap.val()).length;
        }

        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch(e) { console.error("Firebase Security Logic Error:", e); }
};

window.loadAdminBugs = function() {
    const list = document.getElementById('adminBugList');
    if (!list) return;

    localStorage.setItem('cw_last_bug_ts', Date.now());
    window.updateAdminBadge();

    list.innerHTML = "Caricamento...";
    db.ref('bugReports').once('value', snap => {
        list.innerHTML = "";
        if (!snap.exists()) { list.innerHTML = "Nessuna segnalazione."; return; }
        snap.forEach(child => {
            const bug = child.val();
            const item = document.createElement('div');
            item.style.padding = "8px";
            item.style.borderBottom = "1px solid var(--hint-color)";

            // Header: Utente
            const header = document.createElement('div');
            header.style.color = "var(--link-color)";
            header.style.fontWeight = "bold";
            header.textContent = `👤 ${bug.from || "Anonimo"} (@${bug.username || "N/A"})`;

            // Data
            const dateDiv = document.createElement('div');
            dateDiv.style.fontSize = "0.7em";
            dateDiv.style.color = "var(--hint-color)";
            dateDiv.textContent = bug.date || "";

            // Messaggio
            const msgDiv = document.createElement('div');
            msgDiv.style.marginTop = "4px";
            msgDiv.style.whiteSpace = "pre-wrap";
            msgDiv.textContent = bug.msg || "";

            // Area Bottoni
            const btnArea = document.createElement('div');
            btnArea.style.display = "flex";
            btnArea.style.gap = "8px";
            btnArea.style.marginTop = "5px";

            // Tasto Rispondi
            const replyBtn = document.createElement('button');
            replyBtn.style.cssText = "flex:1; font-size:0.7em; background:var(--link-color); color:white; border:none; border-radius:4px; padding:6px; cursor:pointer;";
            replyBtn.textContent = "Rispondi";
            replyBtn.onclick = () => window.openBugReply(child.key, bug.fromId, bug.msg);

            // Tasto Elimina
            const delBtn = document.createElement('button');
            delBtn.style.cssText = "flex:1; font-size:0.7em; background:#d32f2f; color:white; border:none; border-radius:4px; padding:6px; cursor:pointer;";
            delBtn.textContent = "Elimina";
            delBtn.onclick = () => {
                if (confirm('Eliminare definitivamente questa segnalazione?')) {
                    db.ref(`bugReports/${child.key}`).remove().then(() => {
                        item.remove();
                        showToast('Eliminato');
                        window.updateAdminBadge();
                    }).catch(e => {
                        console.error("Delete Error:", e);
                        alert("Errore permessi Firebase: " + e.message);
                    });
                }
            };

            item.appendChild(header);
            item.appendChild(dateDiv);
            item.appendChild(msgDiv);
            btnArea.appendChild(replyBtn);
            btnArea.appendChild(delBtn);
            item.appendChild(btnArea);
            list.prepend(item);
        });
    });
};

window.openBugReply = function(bugKey, userId, originalMsg) {
    if (!userId) return alert("Impossibile rispondere: ID utente mancante.");
    const replyText = prompt(`Invia feedback per: "${originalMsg.substring(0, 30)}..."\n\nScrivi la tua risposta (es: Risolto, Grazie, ecc.):`);
    if (!replyText || replyText.trim() === "") return;

    db.ref(`users/${userId}/bugFeedback`).push({
        reply: replyText.trim(),
        originalMsg: originalMsg,
        ts: firebase.database.ServerValue.TIMESTAMP,
        date: new Date().toLocaleString('it-IT')
    }).then(() => {
        showToast("Risposta inviata!");
    }).catch(e => alert("Errore invio: " + e.message));
};

window.checkBugFeedback = function() {
    if (!myId) return;
    db.ref(`users/${myId}/bugFeedback`).once('value', snap => {
        if (!snap.exists()) return;

        snap.forEach(child => {
            const feedback = child.val();
            const modal = document.getElementById('bugFeedbackModal');
            const origMsg = document.getElementById('feedbackOriginalMsg');
            const replyText = document.getElementById('feedbackReplyText');
            const closeBtn = document.getElementById('btnCloseFeedbackModal');

            if (modal && origMsg && replyText && closeBtn) {
                origMsg.textContent = `"${feedback.originalMsg}"`;
                replyText.textContent = feedback.reply;

                setTimeout(() => {
                    modal.style.display = 'flex';
                }, 2000);

                closeBtn.onclick = () => {
                    modal.style.display = 'none';
                    db.ref(`users/${myId}/bugFeedback/${child.key}`).remove();
                };
            }
        });
    });
};

window.loadAdminTutorRequests = function() {
    const list = document.getElementById('adminBugList');
    if (!list) return;
    list.innerHTML = "Caricamento richieste...";

    db.ref('tutorRequests').once('value', snap => {
        list.innerHTML = "";
        if (!snap.exists()) {
            list.innerHTML = "Nessuna richiesta pendente.";
            return;
        }
        snap.forEach(child => {
            const req = child.val();
            const item = document.createElement('div');
            item.style.padding = "10px";
            item.style.borderBottom = "1px solid #673ab7";
            item.style.background = "rgba(103, 58, 183, 0.05)";

            const title = document.createElement('div');
            title.style.fontWeight = "bold";
            title.style.color = "#9575cd";
            title.textContent = `🎓 Richiesta da: ${req.name || "Anonimo"}`;

            const info = document.createElement('div');
            info.style.fontSize = "0.75em";
            info.style.color = "var(--hint-color)";
            info.textContent = `ID: ${req.uid || ""} | @${req.username || "N/A"}`;

            const btnArea = document.createElement('div');
            btnArea.style.display = "flex";
            btnArea.style.gap = "10px";
            btnArea.style.marginTop = "8px";

            const approveBtn = document.createElement('button');
            approveBtn.style.cssText = "flex:1; background:#4caf50; color:white; border:none; border-radius:4px; padding:5px; cursor:pointer; font-size:0.8em;";
            approveBtn.textContent = "APPROVA ✅";
            approveBtn.onclick = () => window.approveTutor(child.key, req.uid, req.name);

            const rejectBtn = document.createElement('button');
            rejectBtn.style.cssText = "flex:1; background:#d32f2f; color:white; border:none; border-radius:4px; padding:5px; cursor:pointer; font-size:0.8em;";
            rejectBtn.textContent = "RIFIUTA ❌";
            rejectBtn.onclick = () => {
                if (confirm('Rifiutare questa richiesta?')) {
                    db.ref(`tutorRequests/${child.key}`).remove().then(() => {
                        window.updateAdminBadge();
                        item.remove();
                    });
                }
            };

            btnArea.appendChild(approveBtn);
            btnArea.appendChild(rejectBtn);
            item.appendChild(title);
            item.appendChild(info);
            item.appendChild(btnArea);
            list.prepend(item);
        });
    });
};

window.approveTutor = function(reqId, uid, name) {
    if (!confirm(`Approvare ${name} come TUTOR?`)) return;

    // 1. Imposta ruolo nell'utente
    db.ref(`users/${uid}/course`).update({
        role: 'tutor',
        active_plan: true,
        enrolledAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        // 2. Registra nell'elenco globale iscritti (per visibilità tutor)
        db.ref(`courseActiveEnrollments/${uid}`).set({
            name: name,
            role: 'tutor',
            ts: firebase.database.ServerValue.TIMESTAMP
        });
        // 3. Rimuovi la richiesta
        db.ref(`tutorRequests/${reqId}`).remove();
        showToast(`Operatore ${name} approvato come Tutor!`);
        document.getElementById('btnReadTutorRequests').click(); // Refresh
    }).catch(e => {
        showToast("Errore durante l'approvazione.");
    });
};

// --- SFIDA GIORNALIERA ---
if (els.btnPlayDailyNow) {
    els.btnPlayDailyNow.onclick = () => {
        if (els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';

        // Reset preventivo per evitare conflitti con altre modalità (es. corso)
        window.resetGameState();

        currentMode = 'daily_challenge';
        window.isSinglePlayer = true;
        currentWpm = baseWpm = 15;
        requestedWordCount = 20;

        // USA ID UNIVOC_O ANCHE PER LA SFIDA GIORNALIERA
        roomCode = "DAILY_" + window.myId;
        gameWords = window.getGameWords(requestedWordCount, currentMode);
        currentTone = parseInt(localStorage.getItem(STORAGE_PREF_TONE)) || 600;

        const startDaily = () => {
            // SEGNIAMO IL TENTATIVO IMMEDIATAMENTE PER EVITARE REPLAY IN CASO DI ABBANDONO/RELOAD
            let today = new Date().toISOString().split('T')[0];
            db.ref(`users/${myId}/daily_attempt`).set(today);
            localStorage.setItem(STORAGE_DAILY_STATUS_KEY, today);

            const dailyData = {
                status: 'countdown',
                type: 'single',
                mode: currentMode,
                wpm: currentWpm,
                tone: currentTone,
                wordCount: requestedWordCount,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                hostId: myId,
                fixedSpeed: false,
                easyMode: false,
                game_words: gameWords // Inseriamo le parole atomicamente
            };

            db.ref('rooms/' + roomCode).set(dailyData).then(() => {
                window.joinRoomLogic?.(false);
            })
            .catch(err => {
                console.error("Daily Challenge Start Error:", err);
                showToast("Errore avvio sfida. Riprova tra un istante.");
            });
        };

        // Per utenti nuovi, diamo un piccolo margine extra per la propagazione dei permessi Firebase
        if (window.isNewUserWaitingWelcome === false) {
            setTimeout(startDaily, 800);
        } else {
            startDaily();
        }
    };
}
if (els.btnShareDaily) {
    els.btnShareDaily.onclick = () => {
        const text = `🏆 Ho completato la Sfida Giornaliera Morse!\n🎯 Punteggio: ${totalScore} pt\n🚀 Velocità di picco: ${peakWpm} WPM\n\nProva anche tu su Sfida Telegrafia! 📻`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`)}&text=${encodeURIComponent(text)}`;
        if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    };
}

if (els.btnPlayDailyLater) els.btnPlayDailyLater.onclick = () => { if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none'; };
if (els.btnDeclineDaily) els.btnDeclineDaily.onclick = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(STORAGE_DAILY_STATUS_KEY, today);
    db.ref(`users/${myId}/daily_attempt`).set(today); // Sincronizziamo il rifiuto
    if(els.dailyChallengeModal) els.dailyChallengeModal.style.display = 'none';
};

// --- CONDIVISIONE ---
window.shareAppToFriends = function() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}`)}&text=${encodeURIComponent("📻 Unisciti a me su Sfida Telegrafia!")}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
};

window.inviteFriendsToRoom = function() {
    if (!roomCode) return showToast("Nessuna stanza attiva.");
    const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=room_${roomCode}`)}&text=${encodeURIComponent(`📻 Unisciti alla mia stanza su Sfida Telegrafia!\nCodice Stanza: #${roomCode}`)}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
};

// --- LISTENER PULSANTI CHAT ---
if (els.inviteFriendsBtn) {
    els.inviteFriendsBtn.onclick = () => window.inviteFriendsToRoom();
}

if (els.sendChatBtn) {
    els.sendChatBtn.onclick = async () => {
        const now = Date.now();
        if (now - window.lastChatSentTs < 2000) return showToast("🐌 Vai più piano! Attendi 2 secondi.");

        if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
        const txt = els.chatInput?.value.trim();
        if (!txt) return;
        if (txt.length > 200) return showToast(currentLang === 'it' ? "⚠️ Messaggio troppo lungo (max 200 car.)" : "⚠️ Message too long (max 200 chars)");

        window.lastChatSentTs = now;
        const rc = window.roomCode;
        const ctx = window.activeChatContext;
        let ref = (ctx === 'room' && rc) ? db.ref(`rooms/${rc}/chat`).push() : db.ref('globalChat').push();
        ref.set({
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            text: txt,
            ts: firebase.database.ServerValue.TIMESTAMP,
            senderId: myId // Necessario per eliminazione e sicurezza
        });

        // --- INVIO NOTIFICHE PUSH AGLI OFFLINE/DISTRAI (SOLO IN STANZA) ---
        if (ctx === 'room' && rc) {
            console.log("DEBUG_PUSH: Controllo destinatari per stanza " + rc);
            db.ref(`rooms/${rc}/players`).once('value', (snap) => {
                if (!snap.exists()) { console.log("DEBUG_PUSH: Nessun giocatore trovato nella stanza."); return; }
                snap.forEach((pSnap) => {
                    const pId = pSnap.key;
                    if (pId !== myId) {
                        db.ref(`presence/${pId}`).once('value', (presSnap) => {
                            const presData = presSnap.val() || {};
                            const now = Date.now();

                            const isFocused = presData.isFocused !== false;
                            const lastActiveDiff = now - (presData.lastActive || 0);
                            const isTimedOut = lastActiveDiff > 35000;

                            console.log(`DEBUG_PUSH: Utente ${pId} -> isFocused: ${isFocused}, LastActive: ${Math.round(lastActiveDiff/1000)}s fa`);

                            const isAppNotAccessible = !presSnap.exists() || !isFocused || isTimedOut;

                            if (isAppNotAccessible) {
                                console.log("DEBUG_PUSH: Utente inattivo. Controllo preferenze push...");
                                db.ref(`users/${pId}/pushNotifications`).once('value', (prefSnap) => {
                                    if (prefSnap.val() !== false) {
                                        sendPushNotification(pId, txt);
                                    } else {
                                        console.log("DEBUG_PUSH: L'utente ha disattivato le notifiche nel profilo.");
                                    }
                                });
                            } else {
                                console.log("DEBUG_PUSH: Utente attivo nell'app, push saltata.");
                            }
                        });
                    }
                });
            });
        }

        if (els.chatInput) els.chatInput.value = '';
    };
}

if (els.chatInput) {
    els.chatInput.onkeypress = (e) => {
        if (e.key === 'Enter') els.sendChatBtn?.click();
    };
}

if (els.sendLobbyChatBtn) {
    els.sendLobbyChatBtn.onclick = async () => {
    
        const now = Date.now();
        if (now - window.lastChatSentTs < 2000) return showToast("🐌 Vai più piano! Attendi 2 secondi.");

        if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
        const txt = els.lobbyChatInput?.value.trim();
        const rc = window.roomCode;
        if (!txt || !rc) return;
        if (txt.length > 200) return showToast(currentLang === 'it' ? "⚠️ Messaggio troppo lungo (max 200 car.)" : "⚠️ Message too long (max 200 chars)");

        window.lastChatSentTs = now;
        db.ref(`rooms/${rc}/chat`).push().set({
            name: myName,
            username: myPrivacy ? "" : tgUsername,
            text: txt,
            ts: firebase.database.ServerValue.TIMESTAMP,
            senderId: myId
        });

        // --- NOTIFICHE PUSH ANCHE PER LA LOBBY ---
        db.ref(`rooms/${rc}/players`).once('value', (snap) => {
            console.log("DEBUG_PUSH: Controllo lobby per stanza " + rc);
            snap.forEach((pSnap) => {
                const pId = pSnap.key;
                if (pId !== myId) {
                    db.ref(`presence/${pId}`).once('value', (presSnap) => {
                        const presData = presSnap.val() || {};
                        const now = Date.now();
                        const isFocused = presData.isFocused !== false;
                        const lastActiveDiff = now - (presData.lastActive || 0);
                        const isTimedOut = lastActiveDiff > 35000;

                        console.log(`DEBUG_PUSH_LOBBY: Utente ${pId} -> isFocused: ${isFocused}, LastActive: ${Math.round(lastActiveDiff/1000)}s fa`);

                        const isAppNotAccessible = !presSnap.exists() || !isFocused || isTimedOut;

                        if (isAppNotAccessible) {
                            db.ref(`users/${pId}/pushNotifications`).once('value', (prefSnap) => {
                                if (prefSnap.val() !== false) {
                                    sendPushNotification(pId, txt);
                                }
                            });
                        }
                    });
                }
            });
        });

        if (els.lobbyChatInput) els.lobbyChatInput.value = '';
    };
}

if (els.lobbyChatInput) {
    els.lobbyChatInput.onkeypress = (e) => {
        if (e.key === 'Enter') els.sendLobbyChatBtn?.click();
    };
}
}
if (els.clearChatBtn) {
    els.clearChatBtn.onclick = () => {
        if (confirm('Vuoi cancellare la cronologia?')) {
            if (activeChatContext === 'room' && roomCode) db.ref(`rooms/${roomCode}/chat`).remove();
            else if (activeChatContext === 'team' && myTeamId) db.ref(`teams/${myTeamId}/chat`).remove();
            else db.ref('globalChat').remove();
        }
    };
}
if (els.muteGlobalChatBtn) {
    els.muteGlobalChatBtn.onclick = () => {
        isGlobalChatMuted = !isGlobalChatMuted;
        localStorage.setItem(STORAGE_CHAT_MUTED_KEY, isGlobalChatMuted);
        updateMuteBtnUI();
        showToast(isGlobalChatMuted ? "Notifiche silenziate." : "Notifiche riattivate.");
    };
}

// --- CREAZIONE STANZA ---
if (els.createRoomBtn) {
    els.createRoomBtn.onclick = () => {
        const gType = els.gameTypeInput.value, gMode = els.gameModeInput.value;
        if (gType === 'tournament') { window.showScreen('teamsScreen'); return; }
        if (gMode === 'custom' && window.customDictionary.length === 0) return showToast("Carica un file!");

        // Reset preventivo PRIMA di impostare i nuovi parametri della sessione
        window.resetGameState();

        window.isChallenging = false;
        window.outgoingChallengeId = null;
        window.incomingChallengeId = null;
        window.currentMode = gMode || 'standard';
        window.isSinglePlayer = (gType === 'single');
        window.currentWpm = window.baseWpm = (window.currentMode === 'callsign' ? 25 : (parseInt(els.startWpmInput?.value) || 20));
        window.requestedWordCount = (window.currentMode === 'callsign' ? 25 : (parseInt(els.wordCountInput?.value) || 10));
        window.currentTone = parseInt(els.toneInput?.value) || 600;

        if (gType === 'transmission') {
            window.startTransmissionFree(gMode);
            return;
        }

        // --- LETTURA OPZIONI AVANZATE ---
        const isFixed = window.isSinglePlayer && els.fixedSpeedCheckbox?.checked;
        const isEasy = window.isSinglePlayer && els.easyModeCheckbox?.checked;
        const allowSpectators = window.isSinglePlayer && els.allowSpectatorsCheckbox?.checked;

        // Se l'input è vuoto o non siamo in Solo, impostiamo 0 (spaziatura automatica proporzionale)
        let cSpace = (window.isSinglePlayer && els.charSpaceInput?.value) ? parseInt(els.charSpaceInput.value) : 0;
        let wSpace = window.isSinglePlayer && els.wordSpaceSelect?.value ? parseFloat(els.wordSpaceSelect.value) : 1.0;

        window.roomCode = window.isSinglePlayer ? "SOLO_" + window.myId : Math.floor(1000 + Math.random() * 9000).toString();
        window.gameWords = window.getGameWords(window.requestedWordCount, window.currentMode);

        const expires = window.isSinglePlayer ? null : Date.now() + ((parseInt(els.roomTimerInput?.value) || 5) * 60000);

        const roomRef = db.ref('rooms/' + window.roomCode);
        const roomData = {
            status: window.isSinglePlayer ? 'countdown' : 'waiting',
            type: window.isSinglePlayer ? 'single' : (gType === 'coop' ? 'coop' : 'multi'),
            mode: window.currentMode,
            wpm: window.currentWpm,
            tone: window.currentTone,
            wordCount: window.requestedWordCount,
            fixedSpeed: !!isFixed,
            easyMode: !!isEasy,
            allowSpectators: !!allowSpectators,
            charSpaceWpm: cSpace,
            wordSpaceMult: wSpace,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: expires,
            hostId: window.myId,
            game_words: window.gameWords // Inseriamo le parole atomicamente
        };

        roomRef.set(roomData).then(() => {
            if (!window.isSinglePlayer) {
                // PULIZIA AUTOMATICA: Se l'Host si disconnette completamente da Firebase, rimuovi la stanza
                roomRef.onDisconnect().remove();

                const lobbyRef = db.ref(`public_lobby_rooms/${window.roomCode}`);
                lobbyRef.set({
                    mode: window.currentMode,
                    pCount: 1,
                    wpm: window.currentWpm,
                    status: 'waiting',
                    expiresAt: expires,
                    hostId: window.myId // Fondamentale per identificare la propria stanza in bacheca
                });
                lobbyRef.onDisconnect().remove();
            }

            if (window.isSinglePlayer && allowSpectators) {
                db.ref(`presence/${window.myId}`).update({
                    allowSpectators: true,
                    activeRoomCode: window.roomCode
                });
            }

            window.joinRoomLogic?.(false);
        });
    };
}

// --- LISTA STANZE (SPOSTATO IN SOCIAL_MANAGER.JS) ---
