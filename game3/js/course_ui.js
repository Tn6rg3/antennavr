// js/course_ui.js

/**
 * RENDERIZZAZIONE PRINCIPALE DEL TAB CORSO
 */
window.renderCourseTabView = function() {
    const activeView = document.getElementById('courseTabActiveView');
    const initialPrompt = document.getElementById('courseTabInitialPrompt');
    const wizardContainer = document.getElementById('courseWizardContainer');

    if (activeView) activeView.style.display = 'none';
    if (initialPrompt) initialPrompt.style.display = 'none';
    if (wizardContainer) wizardContainer.style.display = 'none';

    if (window.courseData && window.courseData.active_plan === true) {
        if (activeView) activeView.style.display = 'flex';

        // Gestione Vista in base al Ruolo
        const isTutor = window.courseData.role === 'tutor';
        const trainingControls = document.getElementById('courseTrainingControls');
        const tutorPanel = document.getElementById('courseTutorPanel');

        if (trainingControls) trainingControls.style.display = isTutor ? 'none' : 'flex';
        if (tutorPanel) {
            tutorPanel.style.display = isTutor ? 'block' : 'none';
            if (isTutor) window.renderTutorPanel();
        }

        window.renderCourseTabDashboard();
        window.populateCourseSettingsInputs();
        window.renderTutorSelectionList(); // Popola select in settings e wizard
        window.initCourseChat();
        window.initTutorCourseChatNotification(); // Aggiorna listener notifiche

        // Di default mostriamo la dashboard
        window.switchCourseSubTab('dash');
    } else {
        if (initialPrompt) initialPrompt.style.display = 'block';
    }
};

/**
 * SWITCH SOTTO-TAB (DASHBOARD / TRASMISSIONE)
 */
window.switchCourseSubTab = function(tabId) {
    const dashBtn = document.getElementById('btnCourseSubTabDash');
    const txBtn = document.getElementById('btnCourseSubTabTx');
    const dashView = document.getElementById('courseTabDashboardView');
    const txView = document.getElementById('courseTransmissionView');

    if (tabId === 'dash') {
        dashBtn?.classList.add('active-tab');
        txBtn?.classList.remove('active-tab');
        if (dashView) dashView.style.display = 'flex';
        if (txView) txView.style.display = 'none';
    } else if (tabId === 'tx') {
        dashBtn?.classList.remove('active-tab');
        txBtn?.classList.add('active-tab');
        if (dashView) dashView.style.display = 'none';
        if (txView) txView.style.display = 'flex';

        if (typeof window.initTransmissionManager === 'function') {
            setTimeout(() => window.initTransmissionManager(), 50);
        }
    }
};

/**
 * AVVIO WIZARD ISCRIZIONE
 */
window.startCourseWizard = function() {
    const prompt = document.getElementById('courseTabInitialPrompt');
    const wizard = document.getElementById('courseWizardContainer');
    if (prompt) prompt.style.display = 'none';
    if (wizard) {
        wizard.style.display = 'block';
        window.nextWizardStep(0);
        window.renderTutorSelectionList('wizardTutorList');
        window.populateLessonDropdowns();
    }
};

/**
 * PANNELLO TUTOR: Lista corsisti assegnati
 */
window.renderTutorPanel = function() {
    const list = document.getElementById('tutorStudentList');
    if (!list || !db) return;

    // Pulizia listener esistente
    if (window.listeners && window.listeners.tutorPanelRef) {
        window.listeners.tutorPanelRef.off('value', window.listeners.tutorPanelCallback);
    }

    list.innerHTML = '<p style="font-size:0.75em; color:var(--hint-color); text-align:center;">Sincronizzazione corsisti...</p>';

    const ref = db.ref('courseActiveEnrollments');
    const callback = async (snap) => {
        const enrollments = snap.val() || {};
        list.innerHTML = '';

        const uids = Object.keys(enrollments);
        if (uids.length === 0) {
            list.innerHTML = '<p style="font-size:0.75em; color:var(--hint-color); text-align:center;">Nessun corsista attivo al momento.</p>';
            return;
        }

        let foundAny = false;
        for (const uid of uids) {
            if (uid === window.myId) continue;

            const userDataSnap = await db.ref(`users/${uid}/course`).once('value');
            const cData = userDataSnap.val() || {};

            // FILTRO AULA: Mostra solo corsisti assegnati a questo tutor
            if (cData.tutor_id !== window.myId) continue;
            foundAny = true;

            const p = cData.progress || {};
            const enroll = enrollments[uid];
            const lesson = p.current_lesson || 2;
            const accuracy = p.last_z2_accuracy ? Math.round(p.last_z2_accuracy * 100) : 0;
            const lastSess = p.last_session_date || null;

            let inactivityLabel = "";
            if (lastSess) {
                const diffDays = Math.floor((new Date() - new Date(lastSess)) / (1000 * 60 * 60 * 24));
                if (diffDays >= 2) inactivityLabel = `<span style="color:#f44336; font-weight:bold; font-size:0.8em;">⚠️ INATTIVO ${diffDays} GG</span>`;
            } else {
                inactivityLabel = `<span style="color:var(--hint-color); font-size:0.8em;">MAI ALLENATO</span>`;
            }

            const row = document.createElement('div');
            row.style.cssText = "padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; border-left:4px solid #673ab7; font-size:0.8em; display:flex; flex-direction:column; gap:5px; cursor:pointer;";

            row.onclick = (e) => {
                if (e.target.closest('.live-badge')) return;
                window.showStudentDetailedStats(uid, enroll.name || 'Corsista');
            };

            const liveBadgeHtml = enroll.roomCode
                ? `<span class="live-badge" style="background:#f44336; color:white; padding:1px 6px; border-radius:4px; font-size:0.7em; cursor:pointer; animation:pulse 1s infinite; display:flex; align-items:center; gap:3px;" onclick="window.watchSpecificRoom('${enroll.roomCode}', '${enroll.name || 'Corsista'}')">LIVE 🔴</span>`
                : '';

            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <b style="color:#b39ddb;">👤 ${enroll.name || 'Anonimo'}</b>
                    <div style="display:flex; gap:5px; align-items:center;">
                        ${inactivityLabel}
                        <span style="color:${p.reminders_count > 0 ? '#f44336' : '#4caf50'}">⚠️ ${p.reminders_count || 0}</span>
                        ${liveBadgeHtml}
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.9em; color:var(--hint-color);">
                    <span>Lez: ${lesson}</span><span>Acc: ${accuracy}%</span>
                    <span>XP: ${p.total_xp || 0}</span><span>Ultima: ${lastSess || '---'}</span>
                </div>
            `;
            list.appendChild(row);
        }

        if (!foundAny) {
            list.innerHTML = '<p style="font-size:0.75em; color:var(--hint-color); text-align:center;">Non hai ancora corsisti assegnati alla tua aula.</p>';
        }
    };

    ref.on('value', callback);
    if (!window.listeners) window.listeners = {};
    window.listeners.tutorPanelRef = ref;
    window.listeners.tutorPanelCallback = callback;
};

/**
 * MODALE STATISTICHE STUDENTE (DETTAGLIO PER TUTOR)
 */
window.showStudentDetailedStats = function(uid, name) {
    const modal = document.getElementById('tutorStudentStatsModal');
    if (!modal) return;
    document.getElementById('tutorStudentStatsTitle').textContent = `Statistiche: ${name}`;
    modal.style.display = 'flex';

    // Reset dettagli precedenti per pulizia UI
    const charArea = document.getElementById('tutorCharDetailArea');
    const sessArea = document.getElementById('tutorSessionDetailArea');
    const heatmap = document.getElementById('tutorStudentHeatmap');
    const historyCont = document.getElementById('tutorStudentHistory');
    const trendCont = document.getElementById('tutorStudentTrend');

    if (charArea) charArea.style.display = 'none';
    if (sessArea) sessArea.style.display = 'none';
    if (heatmap) heatmap.innerHTML = '<p style="text-align:center; padding:10px;">Caricamento...</p>';
    if (historyCont) historyCont.innerHTML = '';
    if (trendCont) trendCont.innerHTML = '';

    // Carichiamo i nodi separatamente per efficienza
    Promise.all([
        db.ref(`users/${uid}/course/progress`).once('value'),
        db.ref(`users/${uid}/history`).orderByChild('mode').equalTo('course').limitToLast(15).once('value')
    ]).then(([progSnap, histSnap]) => {
        const p = progSnap.val() || {};
        const historyData = histSnap.val() || {};

        // 1. HEATMAP INTERATTIVA
        const hm = document.getElementById('tutorStudentHeatmap');
        if (hm) {
            hm.innerHTML = '';
            const stats = p.char_stats || {};
            window.KOCH_SEQUENCE.forEach((char, idx) => {
                const box = document.createElement('div');
                box.style.cssText = "width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.7em; font-weight:bold; border-radius:3px; cursor:pointer; transition: transform 0.1s; position:relative;";
                box.textContent = char;
                const dbChar = window.firebaseEscape(char);
                const s = stats[dbChar] || { attempts: 0, errors: 0 };
                const acc = s.attempts > 0 ? (s.attempts - s.errors) / s.attempts : 0;

                if (idx >= (p.current_lesson || 2)) {
                    box.style.backgroundColor = 'rgba(255,255,255,0.05)';
                    box.style.opacity = '0.3';
                } else {
                    box.style.backgroundColor = s.attempts === 0 ? '#444' : (acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f');
                    box.style.color = '#fff';
                }

                box.onclick = () => {
                    const detailArea = document.getElementById('tutorCharDetailArea');
                    const detailTitle = document.getElementById('tutorCharDetailTitle');
                    const detailContent = document.getElementById('tutorCharDetailContent');
                    if (!detailArea || !detailTitle || !detailContent) return;

                    detailArea.style.display = 'block';
                    detailTitle.textContent = `Dettaglio Carattere: ${char}`;

                    const accuracy = s.attempts > 0 ? Math.round(acc * 100) : 0;
                    detailContent.innerHTML = `
                        <div class="stat-box" style="background:rgba(0,0,0,0.2); padding:5px; border-radius:4px;">Tentativi: <b>${s.attempts}</b></div>
                        <div class="stat-box" style="background:rgba(0,0,0,0.2); padding:5px; border-radius:4px;">Errori: <b style="color:#f44336;">${s.errors}</b></div>
                        <div class="stat-box" style="background:rgba(0,0,0,0.2); padding:5px; border-radius:4px;">Precisione: <b style="color:${accuracy > 80 ? '#4caf50' : '#ff9800'}">${accuracy}%</b></div>
                        <div class="stat-box" style="background:rgba(0,0,0,0.2); padding:5px; border-radius:4px;">Morse: <b style="letter-spacing:2px; color:var(--link-color);">${window.morseDict[char] || '--'}</b></div>
                    `;
                    detailArea.scrollIntoView({ behavior: 'smooth' });
                };
                hm.appendChild(box);
            });
        }

        // 2. STORIA SESSIONI CON DRILL-DOWN
        const hs = document.getElementById('tutorStudentHistory');
        if (hs) {
            hs.innerHTML = '';
            const history = Object.values(historyData).sort((a,b) => (b.date || 0) - (a.date || 0));

            if (history.length === 0) {
                hs.innerHTML = '<p style="text-align:center; opacity:0.5; padding:10px;">Nessuna sessione registrata.</p>';
            } else {
                let totalAcc = 0, totalWpm = 0, count = 0;

                history.forEach(h => {
                    const details = h.details || [];
                    let sessAcc = 0;
                    if (details.length > 0) {
                        const correct = details.filter(d => d.points > 0).length;
                        sessAcc = Math.round((correct / details.length) * 100);
                        totalAcc += sessAcc;
                        totalWpm += (h.wpm || 20);
                        count++;
                    }

                    const div = document.createElement('div');
                    div.style.cssText = "padding:8px; background:rgba(255,255,255,0.05); border-radius:6px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; border:1px solid rgba(255,255,255,0.05);";

                    const dateStr = h.date ? new Date(h.date).toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : 'Data ignota';

                    div.innerHTML = `
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold; font-size:0.9em;">${dateStr}</span>
                            <small style="color:var(--hint-color);">${h.score || 0} XP | ${h.wpm || 20} WPM</small>
                        </div>
                        <div style="text-align:right; display:flex; align-items:center; gap:8px;">
                            <b style="color:${sessAcc >= 90 ? '#4caf50' : sessAcc >= 70 ? '#ff9800' : '#d32f2f'}">${sessAcc}%</b>
                            <span style="opacity:0.6;">🔍</span>
                        </div>
                    `;

                    div.onclick = () => {
                        const detailArea = document.getElementById('tutorSessionDetailArea');
                        const detailContent = document.getElementById('tutorSessionDetailContent');
                        if (!detailArea || !detailContent) return;

                        detailArea.style.display = 'block';
                        document.getElementById('tutorSessionDetailTitle').textContent = `Dettaglio del ${new Date(h.date).toLocaleDateString()}`;

                        if (details.length === 0) {
                            detailContent.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">Dati di dettaglio non disponibili.</p>';
                        } else {
                            let html = '<table style="width:100%; border-collapse:collapse; font-size:0.95em; color:var(--text-color);">';
                            html += '<thead style="border-bottom:1px solid rgba(255,255,255,0.1); color:var(--hint-color);"><tr><th style="text-align:left; padding:4px;">Target</th><th style="text-align:left; padding:4px;">Input</th><th style="padding:4px;">Esito</th></tr></thead><tbody>';
                            details.forEach(d => {
                                const isCorrect = d.points > 0;
                                html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                    <td style="padding:6px 4px; font-weight:bold; color:var(--link-color);">${d.real}</td>
                                    <td style="padding:6px 4px;">${d.typed || '-'}</td>
                                    <td style="text-align:center; padding:6px 4px; color:${isCorrect ? '#4caf50' : '#f44336'}; font-weight:bold;">${isCorrect ? 'OK' : 'ERR'}</td>
                                </tr>`;
                            });
                            html += '</tbody></table>';
                            detailContent.innerHTML = html;
                        }
                        detailArea.scrollIntoView({ behavior: 'smooth' });
                    };
                    hs.appendChild(div);
                });

                // 3. TREND E ANALISI
                const tr = document.getElementById('tutorStudentTrend');
                if (tr && count > 0) {
                    const avgA = Math.round(totalAcc / count);
                    const avgW = Math.round(totalWpm / count);
                    tr.innerHTML = `
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
                            <div class="box-panel" style="margin:0; padding:10px; text-align:center; border-color:${avgA >= 85 ? '#4caf50' : '#ff9800'};">
                                <small style="display:block; color:var(--hint-color); text-transform:uppercase; font-size:0.7em;">Accuratezza Media</small>
                                <b style="font-size:1.3em; color:${avgA >= 85 ? '#4caf50' : '#ff9800'}">${avgA}%</b>
                            </div>
                            <div class="box-panel" style="margin:0; padding:10px; text-align:center; border-color:var(--link-color);">
                                <small style="display:block; color:var(--hint-color); text-transform:uppercase; font-size:0.7em;">Velocità Media</small>
                                <b style="font-size:1.3em; color:var(--link-color);">${avgW} WPM</b>
                            </div>
                        </div>
                    `;
                }
            }
        }
    }).catch(err => {
        console.error("Tutor Stats Error:", err);
        if (heatmap) heatmap.innerHTML = '<p style="color:red; text-align:center;">Errore caricamento dati.</p>';
    });
};

/**
 * CHAT RADIO-AULA: Gestione messaggi classe/tutor
 */
window.courseChatMode = 'aula'; // 'aula' o 'global'

window.switchCourseChatMode = function(mode) {
    window.courseChatMode = mode;
    const btnAula = document.getElementById('btnCourseChatAula');
    const btnGlobal = document.getElementById('btnCourseChatGlobal');

    if (mode === 'aula') {
        if (btnAula) { btnAula.style.color = 'var(--champ-color)'; btnAula.style.borderBottom = '2px solid var(--champ-color)'; }
        if (btnGlobal) { btnGlobal.style.color = 'var(--hint-color)'; btnGlobal.style.borderBottom = 'none'; }
    } else {
        if (btnAula) { btnAula.style.color = 'var(--hint-color)'; btnAula.style.borderBottom = 'none'; }
        if (btnGlobal) { btnGlobal.style.color = 'var(--champ-color)'; btnGlobal.style.borderBottom = '2px solid var(--champ-color)'; }
    }

    // Pulizia pallino rosso del tab appena selezionato
    const targetBtnId = mode === 'aula' ? 'btnCourseChatAula' : 'btnCourseChatGlobal';
    const targetBtn = document.getElementById(targetBtnId);
    if (targetBtn) {
        const dot = targetBtn.querySelector('.tab-dot');
        if (dot) dot.remove();
    }

    window.initCourseChat();
};

window.initCourseChat = function() {
    if (!db || !window.courseData) return;

    const isTutor = window.courseData.role === 'tutor';
    const currentUid = window.myId;

    let chatPath = 'courseChat';
    if (window.courseChatMode === 'aula') {
        const tutorId = isTutor ? currentUid : (window.courseData.tutor_id || null);
        chatPath = tutorId ? `courseChats/${tutorId}` : 'courseChat';
    }

    const messagesCont = document.getElementById('courseChatMessages');
    const inputField = document.getElementById('courseChatInput');

    if (inputField) {
        inputField.placeholder = window.courseChatMode === 'aula' ? "Scrivi alla classe..." : "Scrivi a tutti (Generale)...";
    }

    // Pulizia listener centralizzata
    if (window.listeners && window.listeners.courseChatRef) {
        window.listeners.courseChatRef.off('value', window.listeners.courseChatCallback);
    }

    const chatRef = db.ref(chatPath);
    const chatCallback = async (snap) => {
        if (!messagesCont) return;
        const data = snap.val() || {};
        messagesCont.innerHTML = '';

        const entries = Object.entries(data).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

        if (entries.length === 0) {
            messagesCont.innerHTML = '<p style="text-align:center; opacity:0.4; font-size:0.8em; margin-top:20px;">Nessun messaggio in questa aula.<br>Inizia la conversazione!</p>';
            return;
        }

        for (const [key, msg] of entries) {
            const div = document.createElement('div');
            div.style.marginBottom = '5px';
            div.style.wordBreak = 'break-word';

            const timeStr = new Date(msg.ts || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

            div.innerHTML = `
                <span style="font-size:0.75em; color:var(--hint-color);">${timeStr} </span>
                ${msg.role === 'tutor' ? '<b style="color:#673ab7; font-size:0.65em; background:#eee; padding:1px 4px; border-radius:4px; margin-right:4px;">TUTOR</b>' : ''}
                <b style="color:var(--link-color); font-size:0.85em;">${msg.name || 'Anonimo'}: </b>
                <span style="font-size:0.9em;"> ${msg.text || ""}</span>
            `;

            // Tasto elimina per il mittente o per il tutor dell'aula
            if (msg.senderId === currentUid || isTutor) {
                const delBtn = document.createElement('span');
                delBtn.innerHTML = " 🗑️";
                delBtn.style.cssText = "cursor:pointer; font-size:0.8em; opacity:0.5; margin-left:5px;";
                delBtn.onclick = () => {
                    if (confirm("Eliminare questo messaggio?")) db.ref(`${chatPath}/${key}`).remove();
                };
                div.querySelector('b:last-of-type').appendChild(delBtn);
            }

            messagesCont.appendChild(div);
        }
        messagesCont.scrollTop = messagesCont.scrollHeight;
    };

    chatRef.limitToLast(50).on('value', chatCallback);

    if (!window.listeners) window.listeners = {};
    window.listeners.courseChatRef = chatRef;
    window.listeners.courseChatCallback = chatCallback;

    // Bottone Invia
    if (els.sendCourseChatBtn && els.courseChatInput) {
        els.sendCourseChatBtn.onclick = async () => {
            const now = Date.now();
            if (window.lastChatSentTs && now - window.lastChatSentTs < 1000) return;

            const txt = els.courseChatInput.value.trim();
            if (!txt) return;

            // Controllo XP/Piano tramite canUserChat (social_manager.js)
            if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;

            if (txt.length > 200) return alert("Messaggio troppo lungo!");

            window.lastChatSentTs = now;

            const newMsg = {
                name: window.myName,
                text: txt,
                ts: firebase.database.ServerValue.TIMESTAMP,
                senderId: currentUid,
                role: window.courseData.role || 'corsista'
            };

            console.log("Course Chat: Sending to", chatPath);
            chatRef.push(newMsg).then(() => {
                els.courseChatInput.value = '';
            }).catch(err => {
                console.error("Course Chat: Push error", err);
                showToast("Errore invio: " + err.message);
            });
        };

        els.courseChatInput.onkeypress = (e) => {
            if (e.key === 'Enter') els.sendCourseChatBtn.click();
        };
    }

    // Bottone Pulisci Aula (Solo Tutor)
    if (els.clearCourseChatBtn) {
        els.clearCourseChatBtn.style.display = isTutor ? 'block' : 'none';
        els.clearCourseChatBtn.onclick = () => {
            if (confirm("Vuoi cancellare TUTTA la cronologia di questa aula?")) {
                chatRef.remove().then(() => showToast("Aula pulita."));
            }
        };
    }
};

/**
 * WIZARD ISCRIZIONE: Step e Scelta Ruolo
 */
window.selectWizardRole = function(role) {
    window.tempWizardRole = role;
    if (role === 'tutor') {
        window.requestTutorRole();
    } else {
        // Mostriamo la scelta del tutor prima dei passi successivi
        window.nextWizardStep(0.5);
    }
};

window.requestTutorRole = function() {
    if (!confirm("Inviare richiesta per diventare TUTOR all'amministratore?")) return;
    db.ref('tutorRequests').push({
        uid: window.myId,
        name: window.myName,
        username: window.tgUsername || "N/A",
        ts: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        alert("Richiesta inviata! Verrai abilitato dopo l'approvazione.");
        goBackToMenu();
    }).catch(() => showToast("Errore nell'invio della richiesta."));
};

window.nextWizardStep = function(step) {
    const steps = { 0: 'wizardStepRole', 0.5: 'wizardStepTutor', 1: 'wizardStep1', 2: 'wizardStep2', 3: 'wizardStep3', 4: 'wizardStep4' };
    Object.values(steps).forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const curr = document.getElementById(steps[step]);
    if (curr) curr.style.display = 'block';

    if (step === 4) {
        window.updateWizardDurationsPreview();
        if (els.wizardMinZ2) els.wizardMinZ2.oninput = window.updateWizardDurationsPreview;
    }
};

window.renderTutorSelectionList = function(containerId = null) {
    const container = containerId ? document.getElementById(containerId) : null;
    const select = document.getElementById('courseTabTutorSelect');
    if (!container && !select) return;

    // OTTIMIZZAZIONE: Usiamo courseActiveEnrollments (più piccolo) invece dell'intero nodo users
    db.ref('courseActiveEnrollments').once('value', snap => {
        const tutors = Object.entries(snap.val() || {})
            .filter(([u, d]) => d.role === 'tutor')
            .map(([u, d]) => ({ id: u, name: d.name || "Tutor" }));

        if (container) {
            container.innerHTML = tutors.length === 0 ? '<p style="font-size:0.8em; text-align:center; opacity:0.5;">Nessun Tutor disponibile.</p>' : '';
            if (tutors.length === 0) {
                const b = document.getElementById('btnConfirmTutor');
                if (b) { b.disabled = false; b.onclick = () => { window.tempSelectedTutorId = null; window.nextWizardStep(1); }; }
                return;
            }
            tutors.forEach(t => {
                const b = document.createElement('button');
                b.className = 'action-btn-small btn-secondary';
                b.style.cssText = "width:100%; text-align:left; padding:10px; margin-bottom:5px; background:rgba(255,255,255,0.05); border:1px solid var(--link-color);";
                b.innerHTML = `🎓 <b>${t.name}</b>`;
                b.onclick = () => {
                    document.querySelectorAll('#wizardTutorList button').forEach(x => x.style.background = 'rgba(255,255,255,0.05)');
                    b.style.background = 'var(--link-color)';
                    window.tempSelectedTutorId = t.id;
                    const cb = document.getElementById('btnConfirmTutor'); if (cb) cb.disabled = false;
                };
                container.appendChild(b);
            });
        }

        if (select) {
            const curr = window.courseData?.tutor_id;
            select.innerHTML = '<option value="">Aula Globale</option>';
            tutors.forEach(t => {
                const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
                if (t.id === curr) o.selected = true;
                select.appendChild(o);
            });
            select.onchange = () => {
                window.courseData.tutor_id = select.value || null;
                window.saveCourseState();
                window.initCourseChat();
                showToast("Aula aggiornata!");
            };
        }
    });
};

/**
 * COMPLETAMENTO WIZARD E SALVATAGGIO INIZIALE
 */
window.finishWizard = function() {
    const role = window.tempWizardRole || 'corsista';
    const z2 = parseInt(els.wizardMinZ2?.value) || 10;
    const isElite = document.getElementById('wizardEliteMode')?.checked === true;

    window.courseData.active_plan = true;
    window.courseData.role = role;
    window.courseData.enrollment_date = new Date().toISOString();

    if (role === 'corsista') {
        window.courseData.tutor_id = window.tempSelectedTutorId || null;
        window.courseData.elite_mode = isElite;
        window.courseData.progress.current_lesson = parseInt(els.wizardStartLesson?.value) || 2;
        window.courseData.settings = {
            days_per_week: els.wizardDays.value,
            start_wpm: parseInt(els.wizardWpm?.value) || 15,
            farnsworth_wpm: parseInt(els.wizardFarnsworth?.value) || 12,
            group_spacing: els.wizardGroupSpacing?.value || "3.0",
            pause_interval: parseInt(els.wizardPauseInterval?.value) || 60,
            pause_duration: parseInt(els.wizardPauseDuration?.value) || 10,
            minutes_z2: z2,
            minutes_work: Math.round(z2 * 0.66),
            minutes_long: Math.round(z2 * 1.66)
        };
        window.generateWeeklySchedule();
    }

    window.updateGlobalEnrollmentRecord(true);
    window.renderCourseTabView();
    showToast(role === 'tutor' ? "Profilo TUTOR attivato! 🎓" : "Corso attivato! 🚀");
};

/**
 * UTILS E HELPERS UI
 */
window.toggleVisibility = function(contId, btnId) {
    const cont = document.getElementById(contId);
    const btn = document.getElementById(btnId);
    if (!cont || !btn) return;
    const vis = cont.style.display === 'none';
    cont.style.display = vis ? (contId.includes('Content') ? 'flex' : 'block') : 'none';
    btn.textContent = vis ? 'Nascondi' : 'Mostra';
};

window.populateLessonDropdowns = function() {
    const wSelect = document.getElementById('wizardStartLesson');
    const sSelect = document.getElementById('courseTabLessonInput');
    const pop = (sel) => {
        if (!sel) return; sel.innerHTML = '';
        for (let i = 2; i <= window.KOCH_SEQUENCE.length; i++) {
            const o = document.createElement('option'); o.value = i; o.textContent = `Lezione ${i} (${window.KOCH_SEQUENCE[i-1]})`;
            sel.appendChild(o);
        }
    };
    pop(wSelect); pop(sSelect);
    if (wSelect) wSelect.onchange = () => {
        const n = parseInt(wSelect.value);
        const info = document.getElementById('wizardLessonChars');
        if (info) info.textContent = `Caratteri: ${window.KOCH_SEQUENCE.slice(0, n).join(", ")}`;
    };
};

window.updateWizardDurationsPreview = function() {
    const z = parseInt(els.wizardMinZ2?.value) || 10;
    const p = document.getElementById('wizardDurationsPreview');
    if (p) p.textContent = `Base: ${z} min | Lavoro: ${Math.round(z*0.66)} min | Lungo: ${Math.round(z*1.66)} min`;
};

window.populateCourseSettingsInputs = function() {
    if (!window.courseData || !window.courseData.settings) return;
    window.populateLessonDropdowns();
    const s = window.courseData.settings, p = window.courseData.progress;
    if (els.courseTabLessonInput) els.courseTabLessonInput.value = p.current_lesson;
    if (els.courseTabDaysInput) els.courseTabDaysInput.value = s.days_per_week;
    if (els.courseTabWpmInput) els.courseTabWpmInput.value = s.start_wpm;
    if (els.courseTabFarnsworthInput) els.courseTabFarnsworthInput.value = s.farnsworth_wpm;
    if (els.courseTabGroupSpacingInput) els.courseTabGroupSpacingInput.value = s.group_spacing || "3.0";
    if (els.courseTabPauseIntervalInput) els.courseTabPauseIntervalInput.value = s.pause_interval || 60;
    if (els.courseTabPauseDurationInput) els.courseTabPauseDurationInput.value = s.pause_duration || 10;
    if (els.courseTabMinZ2) els.courseTabMinZ2.value = s.minutes_z2;
    if (els.courseTabEliteInput) els.courseTabEliteInput.checked = window.courseData.elite_mode === true;
};

window.renderCourseTabDashboard = function() {
    // 1. Heatmap
    const heatmap = document.getElementById('courseTabHeatmap');
    const lessonInfo = document.getElementById('courseTabLessonInfo');
    if (heatmap) {
        heatmap.innerHTML = '';
        const stats = window.courseData.progress.char_stats || {};
        const lesson = window.courseData.progress.current_lesson;
        window.KOCH_SEQUENCE.forEach((char, idx) => {
            const box = document.createElement('div');
            box.style.cssText = "width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:0.75em; font-weight:bold; border-radius:4px; border:1px solid rgba(255,255,255,0.1); cursor:pointer;";
            box.textContent = char;
            const dbChar = window.firebaseEscape(char);
            const s = stats[dbChar] || { attempts: 0, errors: 0 };
            const acc = s.attempts > 0 ? (s.attempts - s.errors) / s.attempts : 0;
            if (idx >= lesson) { box.style.backgroundColor = 'rgba(255,255,255,0.05)'; box.style.opacity = '0.3'; }
            else { box.style.backgroundColor = s.attempts === 0 ? 'var(--hint-color)' : (acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f'); box.style.color = '#fff'; }
            box.onclick = () => window.renderAdvancedCourseStats(char);
            heatmap.appendChild(box);
        });
        if (lessonInfo) lessonInfo.textContent = `Caratteri attivi (${lesson}): ${window.KOCH_SEQUENCE.slice(0, lesson).join(", ")}`;
        window.renderAdvancedCourseStats(window.KOCH_SEQUENCE[0]);
    }

    // 2. Piano Settimanale
    const planList = document.getElementById('courseTabWeeklyPlan');
    if (planList) {
        planList.innerHTML = '';
        const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
        if (!window.courseData.weekly_schedule) window.generateWeeklySchedule();
        window.courseData.weekly_schedule.forEach((dayData, idx) => {
            const dayDiv = document.createElement('div');
            dayDiv.style.cssText = "display:flex; flex-direction:column; gap:4px; padding:8px; background:var(--sec-bg-color); border-radius:8px;";
            dayDiv.innerHTML = `<b style="font-size:0.85em;">${days[idx]}</b>`;
            (dayData.sessions || []).forEach(session => {
                const div = document.createElement('div');
                div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:0.8em;";
                const typeCfg = window.COURSE_TYPES[session.type] || { labelIt: 'Riposo', color: '#999' };
                div.innerHTML = `<span style="color:${typeCfg.color}"><b>${currentLang === 'it' ? typeCfg.labelIt : typeCfg.labelEn}${session.elite ? " ⚡" : ""}</b></span><span>${session.completed ? "✅ Fatto" : (session.type === 'REST' ? "😴" : "⏳")}</span>`;
                dayDiv.appendChild(div);
            });
            planList.appendChild(dayDiv);
        });
    }

    // 3. Bottone Avvio
    const startBtn = document.getElementById('btnTabStartCourseSession');
    if (startBtn) {
        const todayIdx = (new Date().getDay() + 6) % 7;
        const dayData = window.courseData.weekly_schedule ? window.courseData.weekly_schedule[todayIdx] : null;
        const done = dayData ? dayData.sessions.every(s => s.completed || s.type === 'REST') : true;
        startBtn.textContent = done ? "INIZIA SESSIONE EXTRA 🧪" : "AVVIA SESSIONE ODIERNA 🚀";
        startBtn.className = done ? "btn-secondary" : "btn-success";
    }
};

window.renderAdvancedCourseStats = function(selectedChar) {
    const panel = document.getElementById('courseAdvancedStatsPanel');
    const container = document.getElementById('courseAdvancedStats');
    if (!container || !panel) return;
    panel.style.display = 'block';
    container.innerHTML = `<div style="font-size:1.1em; font-weight:bold; text-align:center; margin-bottom:10px; color:var(--champ-color);">Analisi Carattere: ${selectedChar}</div>`;
    const statsByType = window.courseData.progress.char_stats_by_type || { Z2: {}, WORK: {}, LONG: {} };
    const dbChar = window.firebaseEscape(selectedChar);
    [{ id: 'Z2', label: 'Base', icon: '🟢' }, { id: 'WORK', label: 'Lavoro', icon: '🟡' }, { id: 'LONG', label: 'Lungo', icon: '🟣' }].forEach(type => {
        const s = (statsByType[type.id] && statsByType[type.id][dbChar]) ? statsByType[type.id][dbChar] : { attempts: 0, errors: 0 };
        const acc = s.attempts > 0 ? (s.attempts - s.errors) / s.attempts : 0;
        const perc = Math.round(acc * 100);
        const row = document.createElement('div');
        row.style.cssText = "display:flex; flex-direction:column; gap:4px; margin-bottom:8px;";
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.8em; font-weight:bold;">
                <span>${type.icon} ${type.label}</span><span style="color:var(--hint-color)">${s.attempts} tentativi</span>
            </div>
            <div style="height:18px; background:rgba(255,255,255,0.05); border-radius:9px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; position:relative;">
                <div style="width:${s.attempts > 0 ? perc : 0}%; height:100%; background:${s.attempts === 0 ? '#444' : (acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f')}; transition:width 0.8s;"></div>
                <span style="position:absolute; width:100%; text-align:center; font-size:0.7em; font-weight:bold; color:#fff;">${s.attempts > 0 ? perc + '%' : 'NESSUN DATO'}</span>
            </div>
        `;
        container.appendChild(row);
    });
};

window.toggleCoursePresentation = function() {
    const content = document.getElementById('courseTabPresentationContent');
    const btn = document.getElementById('btnTogglePresentation');
    if (!content || !btn) return;

    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = 'Nascondi ▲';
    } else {
        content.style.display = 'none';
        btn.textContent = 'Mostra ▼';
    }
};

/**
 * GESTIONE SESSIONE DI GIOCO (START / FINISH)
 */
window.finishCourseSession = function() {
    const p = window.courseData.progress, s = p.char_stats || {}, st = p.char_stats_by_type || { Z2: {}, WORK: {}, LONG: {} };
    const lesson = p.current_lesson, active = window.KOCH_SEQUENCE.slice(0, lesson), type = window.courseData.current_day_session.type;
    let attempts = 0, errors = 0, worst = [];

    active.forEach(c => {
        const dbC = window.firebaseEscape(c), sc = s[dbC] || { attempts: 0, errors: 0 };
        attempts += sc.attempts; errors += sc.errors;
        if (!st[type]) st[type] = {}; if (!st[type][dbC]) st[type][dbC] = { attempts: 0, errors: 0 };
        if (sc.attempts > 0 && (sc.errors/sc.attempts) > 0.15) worst.push(c);
    });

    const acc = attempts > 0 ? (attempts - errors) / attempts : 1.0;
    const xp = Math.round((type === 'WORK' ? 100 : type === 'LONG' ? 200 : 50) * acc);

    p.total_xp = (p.total_xp || 0) + xp;
    if (typeof window.addXP === 'function') window.addXP(xp, `Course ${type}`);
    if (type === 'Z2') p.last_z2_accuracy = acc;

    window.courseData.current_day_session.completed = true;
    const todayIdx = (new Date().getDay() + 6) % 7, dayData = window.courseData.weekly_schedule[todayIdx];
    if (dayData) { const sess = dayData.sessions.find(s => s.type === type && !s.completed); if (sess) sess.completed = true; }

    let canAdv = true;
    active.forEach(c => { const sc = s[window.firebaseEscape(c)] || { attempts: 0, errors: 0 }; if (sc.attempts < 50 || (sc.attempts - sc.errors)/sc.attempts < 0.9) canAdv = false; });

    let msg = "";
    if (window.courseData.current_day_session.isExtra) msg = "\n\n✨ Allenamento Extra completato!";
    else if (canAdv && lesson < window.KOCH_SEQUENCE.length) { p.current_lesson++; msg = `\n\n🚀 NUOVO CARATTERE: ${window.KOCH_SEQUENCE[p.current_lesson-1]}!`; }

    const today = new Date().toISOString().split('T')[0];
    if (p.last_session_date) {
        const diff = Math.floor((new Date(today) - new Date(p.last_session_date))/(1000*60*60*24));
        if (diff === 1) p.consecutive_days = (p.consecutive_days || 0) + 1; else if (diff > 1) p.consecutive_days = 1;
    } else p.consecutive_days = 1;

    if (p.consecutive_days % 2 === 0 && p.reminders_count > 0) { p.reminders_count--; showToast("Richiamo rimosso!"); }

    p.last_session_date = today;
    window.courseData.current_day_session = null; // PULIZIA SESSIONE COMPLETATA PER PERMETTERE NUOVI EXTRA
    window.saveCourseState();
    db.ref(`courseActiveEnrollments/${window.myId}`).update({ roomCode: null });

    const m = document.getElementById('courseResultsModal'), a = document.getElementById('courseResultsAccuracy'), ms = document.getElementById('courseResultsMessage'), f = document.getElementById('courseResultsFocus');
    if (m && a && ms && f) {
        a.textContent = `Accuratezza: ${Math.round(acc*100)}%`;
        a.style.color = acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f';
        ms.innerHTML = `"${window.getCourseDebriefing(acc, worst.slice(0,3))}"${msg ? '<div style="margin-top:10px; color:var(--link-color); font-weight:bold;">'+msg+'</div>' : ''}`;
        f.textContent = worst.length > 0 ? "⚠️ Focus: " + worst.slice(0,5).join(", ") : "Ottima sessione!";
        m.style.display = 'flex';
        document.getElementById('btnCloseCourseResults').onclick = () => { m.style.display = 'none'; window.showProfileScreen(); window.switchProfileTab('course'); };
    } else {
        alert(`Sessione completata! Accuratezza: ${Math.round(acc*100)}%`);
        window.finishGame();
    }
};

window.actualStartCourseGame = function() {
    if (!window.courseData.current_day_session) return;
    const modal = document.getElementById('courseSessionModal');
    if (modal) modal.style.display = 'none';

    currentMode = 'course';
    isSinglePlayer = true;
    currentWpm = parseInt(window.courseData.settings.start_wpm);
    roomCode = "COURSE_" + window.myId;

    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    db.ref(`courseActiveEnrollments/${window.myId}`).update({ roomCode: roomCode });
    db.ref(`courseActiveEnrollments/${window.myId}`).child('roomCode').onDisconnect().set(null);

    db.ref('rooms/' + roomCode).set({
        status: 'countdown', type: 'single', mode: 'course', wpm: currentWpm, tone: 600,
        createdAt: firebase.database.ServerValue.TIMESTAMP, hostId: window.myId
    }).then(() => {
        // PULIZIA AUTOMATICA: Se l'utente chiude l'app, la stanza temporanea del corso viene rimossa
        db.ref('rooms/' + roomCode).onDisconnect().remove();
        if (typeof window.joinRoomLogic === 'function') window.joinRoomLogic(false);
    });
};

/**
 * EVENT LISTENERS UI
 */
window.attachCourseUIListeners = function() {
    // Accordion / Toggle
    const pairs = [
        { b: 'btnToggleCourseChat', c: 'courseChatContent' },
        { b: 'btnToggleCourseSettings', c: 'courseTabSettingsContent' },
        { b: 'btnToggleCourseHeatmap', c: 'courseTabHeatmapContent' },
        { b: 'btnToggleCoursePlan', c: 'courseTabWeeklyPlanContent' }
    ];
    pairs.forEach(p => {
        const btn = document.getElementById(p.b), cont = document.getElementById(p.c);
        if (btn && cont) btn.onclick = () => {
            const vis = cont.style.display === 'none';
            cont.style.display = vis ? (p.c.includes('Content') ? 'flex' : 'block') : 'none';
            btn.textContent = vis ? 'Nascondi' : 'Mostra';
        };
    });

    if (els.btnCloseAdvancedStats) els.btnCloseAdvancedStats.onclick = () => { if (els.courseAdvancedStatsPanel) els.courseAdvancedStatsPanel.style.display = 'none'; };

    // Salvataggio Impostazioni
    if (els.btnTabSavePlan) {
        els.btnTabSavePlan.onclick = () => {
            const z = parseInt(els.courseTabMinZ2.value) || 10;
            window.courseData.progress.current_lesson = parseInt(els.courseTabLessonInput.value) || 2;
            window.courseData.elite_mode = els.courseTabEliteInput?.checked === true;
            window.courseData.settings = {
                ...window.courseData.settings,
                days_per_week: els.courseTabDaysInput.value,
                start_wpm: els.courseTabWpmInput.value,
                farnsworth_wpm: els.courseTabFarnsworthInput.value,
                group_spacing: els.courseTabGroupSpacingInput.value,
                pause_interval: parseInt(els.courseTabPauseIntervalInput.value) || 60,
                pause_duration: parseInt(els.courseTabPauseDurationInput.value) || 10,
                minutes_z2: z,
                minutes_work: Math.round(z * 0.66),
                minutes_long: Math.round(z * 1.66)
            };
            window.generateWeeklySchedule();
            window.saveCourseState(); // Forza salvataggio immediato
            window.renderCourseTabView();
            showToast("Impostazioni salvate! 💾");
        };
    }

    if (els.btnTabResetCourse) {
        els.btnTabResetCourse.onclick = () => {
            const warn = currentLang === 'it'
                ? "⚠️ ATTENZIONE: Questa azione cancellerà DEFINITIVAMENTE il tuo piano di studi, la lezione attuale e tutti i progressi del corso.\n\nVuoi davvero procedere con la CANCELLAZIONE TOTALE?"
                : "⚠️ WARNING: This will PERMANENTLY DELETE your study plan, current lesson, and all course progress.\n\nDo you really want to proceed with TOTAL DELETION?";

            if (confirm(warn)) {
                window.updateGlobalEnrollmentRecord(false);
                window.courseData = window.getDefaultCourseData();
                window.saveCourseState();
                window.renderCourseTabView();
                showToast(currentLang === 'it' ? "Iscrizione Cancellata." : "Enrollment Deleted.");
            }
        };
    }
    if (els.btnTabExitTutor) els.btnTabExitTutor.onclick = () => { if (confirm("Rinunciare al ruolo TUTOR?")) { window.updateGlobalEnrollmentRecord(false); window.courseData = window.getDefaultCourseData(); window.saveCourseState(); window.renderCourseTabView(); showToast("Ruolo rimosso."); } };

    // Avvio Sessione
    if (els.btnTabStartCourseSession) {
        els.btnTabStartCourseSession.onclick = () => {
             const todayIdx = (new Date().getDay() + 6) % 7, dayData = window.courseData.weekly_schedule[todayIdx];
             let sess = dayData ? dayData.sessions.find(s => !s.completed) : null, extra = false;
             if (!sess || (dayData && dayData.sessions[0].type === 'REST')) { sess = { type: 'Z2', completed: false }; extra = true; }
             if (!extra && dayData.sessions.filter(s => !s.completed).length > 1) if (!confirm(`Iniziare sessione ${sess.elite ? "ELITE" : "STANDARD"}?`)) return;
             const dur = (sess.type==='Z2' ? window.courseData.settings.minutes_z2 : sess.type==='WORK' ? window.courseData.settings.minutes_work : window.courseData.settings.minutes_long);
             window.courseData.current_day_session = { type: sess.type, total_seconds: dur*60, remaining_seconds: dur*60, completed: false, date: new Date().toISOString().split('T')[0], isExtra: extra };
             window.saveCourseState(); if (extra) els.btnTabStartCourseSession.textContent = "INIZIA EXTRA";
             if (typeof window.showCourseSessionModal === 'function') window.showCourseSessionModal(window.courseData.current_day_session, extra); else window.actualStartCourseGame();
        };
    }
    if (els.btnPlayCourseNow) els.btnPlayCourseNow.onclick = () => { if (els.courseSessionModal) els.courseSessionModal.style.display = 'none'; window.actualStartCourseGame(); };
};

/**
 * NOTIFICHE CHAT TUTOR (Badge)
 * Ascolta sia l'aula privata che il canale generale.
 */
window.initTutorCourseChatNotification = function() {
    if (!db || !window.myId) return;

    // Pulizia listener esistenti
    if (window.listeners) {
        if (window.listeners.aulaNotifRef) window.listeners.aulaNotifRef.off('child_added', window.listeners.aulaNotifCallback);
        if (window.listeners.globalNotifRef) window.listeners.globalNotifRef.off('child_added', window.listeners.globalNotifCallback);
    } else {
        window.listeners = {};
    }

    const isTutor = window.courseData && window.courseData.role === 'tutor';
    const tutorId = isTutor ? window.myId : (window.courseData?.tutor_id || null);

    // 1. Percorso Aula
    if (tutorId) {
        const aulaPath = `courseChats/${tutorId}`;
        const aulaRef = db.ref(aulaPath);
        let initAula = true;

        const aulaCallback = snap => {
            if (initAula) { initAula = false; return; }
            const m = snap.val(); if (!m || m.senderId === window.myId) return;
            window.processCourseNotification('aula');
        };

        aulaRef.limitToLast(1).on('child_added', aulaCallback);
        window.listeners.aulaNotifRef = aulaRef;
        window.listeners.aulaNotifCallback = aulaCallback;
    }

    // 2. Percorso Generale
    const globalPath = 'courseChat';
    const globalRef = db.ref(globalPath);
    let initGlobal = true;

    const globalCallback = snap => {
        if (initGlobal) { initGlobal = false; return; }
        const m = snap.val(); if (!m || m.senderId === window.myId) return;
        window.processCourseNotification('global');
    };

    globalRef.limitToLast(1).on('child_added', globalCallback);
    window.listeners.globalNotifRef = globalRef;
    window.listeners.globalNotifCallback = globalCallback;
};

/**
 * Gestisce la logica di visualizzazione del badge in base a dove si trova l'utente
 */
window.processCourseNotification = function(source) {
    const area = document.getElementById('profileCourseArea');
    const isCourseVisible = (area && area.style.display === 'flex');
    const currentSubTab = window.courseChatMode; // 'aula' o 'global'

    // Se la sezione corso è chiusa, mostriamo sempre il badge sul bottone principale
    if (!isCourseVisible) {
        const b = document.getElementById('courseMessageBadge');
        if (b) b.style.display = 'flex';
        return;
    }

    // Se siamo già nella tab Corso, verifichiamo se il messaggio è per il sub-tab nascosto
    if (source !== currentSubTab) {
        // Mostriamo il badge sul bottone del sub-tab corrispondente
        const btnId = source === 'aula' ? 'btnCourseChatAula' : 'btnCourseChatGlobal';
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.style.position = 'relative';
            // Se non c'è già un pallino rosso, aggiungiamolo
            if (!btn.querySelector('.tab-dot')) {
                const dot = document.createElement('span');
                dot.className = 'tab-dot';
                dot.style.cssText = "position:absolute; top:-2px; right:-5px; width:8px; height:8px; background:#f44336; border-radius:50%; border:1px solid white;";
                btn.appendChild(dot);
            }
        }

        // Mostriamo comunque il badge sul bottone principale "Corso" in basso
        const b = document.getElementById('courseMessageBadge');
        if (b) b.style.display = 'flex';
    }
};

window.hideCourseMessageBadge = function() {
    const b = document.getElementById('courseMessageBadge');
    if (b) b.style.display = 'none';
};

// Avvio listener iniziali
setTimeout(window.attachCourseUIListeners, 2000);
