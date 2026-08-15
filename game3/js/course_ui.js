// js/course_ui.js

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
        window.initCourseChat();

        // Di default mostriamo la dashboard
        window.switchCourseSubTab('dash');
    } else {
        if (initialPrompt) initialPrompt.style.display = 'block';
    }
};

window.switchCourseSubTab = function(tabId) {
    const dashBtn = document.getElementById('btnCourseSubTabDash');
    const txBtn = document.getElementById('btnCourseSubTabTx');
    const dashView = document.getElementById('courseDashboardView');
    const txView = document.getElementById('courseTransmissionView');

    // NOTA: dashView nel file HTML è diventato courseTabDashboardView per evitare duplicati
    const realDashView = document.getElementById('courseTabDashboardView') || dashView;

    if (tabId === 'dash') {
        dashBtn?.classList.add('active-tab');
        txBtn?.classList.remove('active-tab');
        if (realDashView) realDashView.style.display = 'flex';
        if (txView) txView.style.display = 'none';
    } else if (tabId === 'tx') {
        dashBtn?.classList.remove('active-tab');
        txBtn?.classList.add('active-tab');
        if (realDashView) realDashView.style.display = 'none';
        if (txView) txView.style.display = 'flex';

        // Inizializziamo il manager della trasmissione
        if (typeof window.initTransmissionManager === 'function') {
            window.initTransmissionManager();
        }
    }
};

window.renderTutorPanel = function() {
    const list = document.getElementById('tutorStudentList');
    if (!list || !db) return;

    if (listeners.tutorPanel) db.ref('courseActiveEnrollments').off('value', listeners.tutorPanel);

    list.innerHTML = '<p style="font-size:0.75em; color:var(--hint-color); text-align:center;">Sincronizzazione corsisti...</p>';

    listeners.tutorPanel = db.ref('courseActiveEnrollments').on('value', async (snap) => {
        const enrollments = snap.val() || {};
        list.innerHTML = '';

        const uids = Object.keys(enrollments);
        if (uids.length === 0) {
            list.innerHTML = '<p style="font-size:0.75em; color:var(--hint-color); text-align:center;">Nessun corsista attivo al momento.</p>';
            return;
        }

        for (const uid of uids) {
            if (uid === myId) continue;
            const enroll = enrollments[uid];

            // FILTRO: Mostriamo solo i corsisti assegnati a questo tutor
            if (enroll.role === 'tutor' || enroll.tutorId !== myId) continue;

            // Carichiamo i progressi (Koch) per ogni iscritto
            const userDataSnap = await db.ref(`users/${uid}/course/progress`).once('value');
            const p = userDataSnap.val() || {};

            const lesson = p.current_lesson || 2;
            const lastDate = p.last_session_date || "Mai";
            const accuracy = p.last_z2_accuracy ? Math.round(p.last_z2_accuracy * 100) : 0;
            const reminders = p.reminders_count || 0;

            // --- COSTRUZIONE SICURA DOM (XSS Fix) ---
            const tutorRow = document.createElement('div');
            tutorRow.style.cssText = "padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; border-left:4px solid #673ab7; font-size:0.8em; display:flex; flex-direction:column; gap:5px;";

            const headerRow = document.createElement('div');
            headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center;";

            const nameB = document.createElement('b');
            nameB.style.color = "#b39ddb";
            nameB.style.cursor = "pointer";
            nameB.style.textDecoration = "underline";
            nameB.textContent = `👤 ${enroll.name || 'Anonimo'} `;
            nameB.onclick = () => window.showStudentStats(uid, enroll.name || 'Anonimo');

            if (enroll.roomCode) {
                const liveBadge = document.createElement('span');
                liveBadge.style.cssText = "background:#f44336; color:white; padding:1px 4px; border-radius:4px; font-size:0.7em; animation:pulse 1s infinite;";
                liveBadge.textContent = "LIVE 🔴";
                nameB.appendChild(liveBadge);
            }
            headerRow.appendChild(nameB);

            const actionDiv = document.createElement('div');
            actionDiv.style.cssText = "display:flex; gap:5px; align-items:center;";

            const remSpan = document.createElement('span');
            remSpan.style.color = reminders > 0 ? '#f44336' : '#4caf50';
            remSpan.textContent = `⚠️ ${reminders}`;
            actionDiv.appendChild(remSpan);

            if (enroll.roomCode) {
                const watchBtn = document.createElement('button');
                watchBtn.style.cssText = "width:auto; margin:0; padding:2px 8px; font-size:0.8em; background:#673ab7;";
                watchBtn.textContent = "OSSERVA";
                watchBtn.onclick = () => window.watchStudentSession(enroll.roomCode, enroll.name || 'Anonimo');
                actionDiv.appendChild(watchBtn);
            }
            headerRow.appendChild(actionDiv);

            const gridDiv = document.createElement('div');
            gridDiv.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.9em; color:var(--hint-color);";

            const infoItems = [
                `Lez: ${lesson}`, `Acc: ${accuracy}%`,
                `XP: ${p.total_xp || 0}`, `Data: ${lastDate}`
            ];
            infoItems.forEach(txt => {
                const s = document.createElement('span');
                s.textContent = txt;
                gridDiv.appendChild(s);
            });

            tutorRow.appendChild(headerRow);
            tutorRow.appendChild(gridDiv);
            list.appendChild(tutorRow);
        }
    }, (error) => {
        list.innerHTML = '<p style="color:#f44336; font-size:0.75em;">Errore nel caricamento dati.</p>';
    });
};

window.watchStudentSession = function(targetRoomCode, studentName) {
    if (!targetRoomCode) return;
    if (!confirm(`Vuoi entrare come spettatore nell'allenamento di ${studentName}?`)) return;

    // Usciamo da eventuali stanze attuali
    if (typeof window.exitRoomCleanly === 'function') window.exitRoomCleanly(false);

    // Utilizziamo la funzione nativa degli spettatori per abilitare audio e monitoraggio
    } else {
        showToast("Errore: Funzione spettatore non disponibile.");
    }
};

window.showStudentStats = async function(uid, studentName) {
    const modal = document.getElementById('studentStatsModal');
    const content = document.getElementById('studentStatsContent');
    const title = document.getElementById('studentStatsTitle');

    if (!modal || !content || !db) return;

    title.textContent = "Analisi Progressi: " + studentName;
    content.innerHTML = '<p style="text-align:center; padding:20px;">Caricamento dati...</p>';
    modal.style.display = 'flex';

    try {
        const snap = await db.ref(`users/${uid}/course`).once('value');
        const data = snap.val();

        if (!data) {
            content.innerHTML = '<p style="text-align:center; color:var(--hint-color);">Nessun dato disponibile per questo utente.</p>';
            return;
        }

        const p = data.progress || {};
        const s = data.settings || {};

        // --- COSTRUZIONE DASHBOARD STATISTICHE ---
        let html = `
            <div class="box-panel" style="margin-bottom:15px; border-color:#673ab7;">
                <h4 style="margin-top:0; color:#b39ddb;">📈 Stato Generale</h4>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.85em;">
                    <div><b>Lezione Attuale:</b> ${p.current_lesson || 2}</div>
                    <div><b>XP Totali:</b> ${p.total_xp || 0}</div>
                    <div><b>Accuratezza Z2:</b> ${p.last_z2_accuracy ? Math.round(p.last_z2_accuracy*100) : 0}%</div>
                    <div><b>Ultima Sessione:</b> ${p.last_session_date || 'N/A'}</div>
                </div>
            </div>

            <div class="box-panel" style="margin-bottom:15px;">
                <h4 style="margin-top:0; color:var(--link-color);">⚙️ Impostazioni Utente</h4>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.85em;">
                    <div><b>WPM:</b> ${s.start_wpm || 15}</div>
                    <div><b>Farnsworth:</b> ${s.farnsworth_wpm || 12}</div>
                    <div><b>GG/Sett:</b> ${s.days_per_week || 3}</div>
                    <div><b>Modalità Elite:</b> ${data.elite_mode ? 'SÌ ⚡' : 'NO'}</div>
                </div>
            </div>

            <div class="box-panel">
                <h4 style="margin-top:0; color:var(--champ-color);">📊 Padronanza Caratteri (Heatmap)</h4>
                <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px;">
        `;

        const charStats = p.char_stats || {};
        window.KOCH_SEQUENCE.forEach((char, idx) => {
            const dbChar = window.firebaseEscape(char);
            const cs = charStats[dbChar] || { attempts: 0, errors: 0 };
            const acc = cs.attempts > 0 ? (cs.attempts - cs.errors) / cs.attempts : 0;

            let color = 'rgba(255,255,255,0.05)';
            if (idx < (p.current_lesson || 2)) {
                color = cs.attempts === 0 ? 'var(--hint-color)' : (acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f');
            }

            html += `<div style="width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.7em; font-weight:bold; background:${color}; color:#fff; border-radius:4px; opacity:${idx < (p.current_lesson || 2) ? 1 : 0.3};" title="${char}: ${Math.round(acc*100)}%">${char}</div>`;
        });

        html += `
                </div>
            </div>

            <div class="box-panel" style="margin-top:15px;">
                <h4 style="margin-top:0;">📜 Storico Ultime Sessioni</h4>
                <div id="studentHistoryList" style="font-size:0.8em; display:flex; flex-direction:column; gap:5px;">
                    <!-- Caricamento history... -->
                </div>
            </div>
        `;

        content.innerHTML = html;

        // Carichiamo anche le ultime 5 partite del corso dalla history generale
        db.ref(`users/${uid}/history`).orderByChild('mode').equalTo('course').limitToLast(10).once('value', hSnap => {
            const historyCont = document.getElementById('studentHistoryList');
            if (!historyCont) return;

            const hist = hSnap.val() || {};
            const entries = Object.values(hist).sort((a,b) => b.date - a.date);

            if (entries.length === 0) {
                historyCont.innerHTML = '<p style="text-align:center; opacity:0.6;">Nessuna sessione registrata.</p>';
                return;
            }

            historyCont.innerHTML = '';
            entries.forEach(m => {
                const dateStr = new Date(m.date).toLocaleDateString();
                const div = document.createElement('div');
                div.style.cssText = "display:flex; justify-content:space-between; padding:5px; background:rgba(255,255,255,0.03); border-radius:4px;";
                div.innerHTML = `<span>📅 ${dateStr}</span> <span><b>${m.wpm}</b> WPM</span> <span><b>${m.score}</b> PT</span>`;
                historyCont.appendChild(div);
            });
        });

    } catch (e) {
        console.error("Show Student Stats Error:", e);
        content.innerHTML = '<p style="text-align:center; color:#f44336;">Errore nel caricamento dei dati.</p>';
    }
};

window.selectWizardRole = function(role) {
    window.tempWizardRole = role;
    if (role === 'tutor') {
        window.requestTutorRole();
    } else {
        window.nextWizardStep('Tutor');
    }
};

window.requestTutorRole = function() {
    if (!confirm("Vuoi inviare una richiesta all'amministratore per diventare TUTOR?\nPotrai accedere al corso solo dopo l'approvazione.")) return;

    db.ref('tutorRequests').push({
        uid: myId,
        name: myName,
        username: tgUsername || "N/A",
        ts: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        alert("Richiesta inviata! Riceverai l'abilitazione non appena l'amministratore avrà approvato il tuo profilo.");
        // Non attiviamo il piano ora, l'utente resta "non iscritto"
        goBackToMenu();
    }).catch(e => {
        showToast("Errore nell'invio della richiesta.");
    });
};

window.toggleVisibility = function(contentId, btnId) {
    const el = document.getElementById(contentId);
    const btn = document.getElementById(btnId);
    if (!el || !btn) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'Nascondi' : 'Mostra';
};

window.populateCourseSettingsInputs = function() {
    window.populateLessonDropdowns();
    const s = window.courseData.settings;
    const currentLesson = window.courseData.progress.current_lesson;
    if (els.courseTabLessonInput) els.courseTabLessonInput.value = currentLesson;
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
        const currentLesson = window.courseData.progress.current_lesson;

        window.KOCH_SEQUENCE.forEach((char, idx) => {
            const box = document.createElement('div');
            box.style.cssText = "width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:0.75em; font-weight:bold; border-radius:4px; border:1px solid rgba(255,255,255,0.1); cursor:pointer;";
            box.textContent = char;

            const dbChar = (typeof firebaseEscape === 'function') ? firebaseEscape(char) : char.replace(/\./g, '_dot_');
            const s = stats[dbChar] || { attempts: 0, errors: 0 };
            const accuracy = s.attempts > 0 ? (s.attempts - s.errors) / s.attempts : 0;

            if (idx >= currentLesson) {
                box.style.backgroundColor = 'rgba(255,255,255,0.05)';
                box.style.opacity = '0.3';
                box.title = "Non ancora sbloccato";
            } else {
                if (s.attempts === 0) {
                    box.style.backgroundColor = 'var(--hint-color)';
                } else {
                    box.style.backgroundColor = accuracy >= 0.9 ? '#4caf50' : accuracy >= 0.7 ? '#ff9800' : '#d32f2f';
                }
                box.style.color = '#fff';
                box.title = `${char}: ${Math.round(accuracy * 100)}% (${s.attempts} tentativi)`;
            }

            box.onclick = () => {
                window.renderAdvancedCourseStats(char);
            };
            heatmap.appendChild(box);
        });

        const activeCharsStr = window.KOCH_SEQUENCE.slice(0, currentLesson).join(", ");
        if (lessonInfo) lessonInfo.textContent = `Caratteri attivi (${currentLesson}): ${activeCharsStr}`;

        // Render iniziale statistiche (primo carattere sbloccato)
        window.renderAdvancedCourseStats(window.KOCH_SEQUENCE[0]);
    }

    // 2. Weekly Plan
    const planList = document.getElementById('courseTabWeeklyPlan');
    if (planList) {
        planList.innerHTML = '';
        const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
        if (!window.courseData.weekly_schedule) window.generateWeeklySchedule();

        window.courseData.weekly_schedule.forEach((dayData, idx) => {
            const sessions = dayData.sessions || [];
            const dayDiv = document.createElement('div');
            dayDiv.style.cssText = "display:flex; flex-direction:column; gap:4px; padding:8px; background:var(--sec-bg-color); border-radius:8px;";

            const title = document.createElement('b');
            title.style.fontSize = "0.85em";
            title.textContent = days[idx];
            dayDiv.appendChild(title);

            sessions.forEach(session => {
                const div = document.createElement('div');
                div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:rgba(255,255,255,0.03); border-radius:6px; font-size:0.8em;";

                const typeCfg = window.COURSE_TYPES[session.type] || { labelIt: 'Riposo', color: '#999' };
                const label = document.createElement('span');
                const typeSpan = document.createElement('b');
                typeSpan.textContent = (currentLang === 'it' ? typeCfg.labelIt : typeCfg.labelEn) + (session.elite ? " ⚡" : "");
                typeSpan.style.color = typeCfg.color;
                label.appendChild(typeSpan);

                const status = document.createElement('span');
                status.textContent = session.completed ? "✅ Fatto" : (session.type === 'REST' ? "😴" : "⏳");

                div.appendChild(label);
                div.appendChild(status);
                dayDiv.appendChild(div);
            });

            planList.appendChild(dayDiv);
        });
    }

    // 3. Aggiornamento Bottone Avvio Sessione
    const startBtn = document.getElementById('btnTabStartCourseSession');
    if (startBtn) {
        const todayIdx = (new Date().getDay() + 6) % 7;
        const dayData = window.courseData.weekly_schedule[todayIdx];
        const mandatoryDone = !dayData || dayData.sessions.every(s => s.completed || s.type === 'REST');

        if (mandatoryDone) {
            startBtn.textContent = "AVVIA SESSIONE EXTRA 🏆";
            startBtn.classList.remove('btn-success');
            startBtn.classList.add('btn-champ');
        } else {
            startBtn.textContent = "AVVIA SESSIONE ODIERNA 🚀";
            startBtn.classList.remove('btn-champ');
            startBtn.classList.add('btn-success');
        }
    }
};

window.renderAdvancedCourseStats = function(selectedChar) {
    const panel = document.getElementById('courseAdvancedStatsPanel');
    const container = document.getElementById('courseAdvancedStats');
    if (!container || !panel) return;

    panel.style.display = 'block';
    container.innerHTML = '';

    const statsByType = window.courseData.progress.char_stats_by_type || { Z2: {}, WORK: {}, LONG: {} };
    const dbChar = window.firebaseEscape(selectedChar);

    const title = document.createElement('div');
    title.style.cssText = "font-size: 1.1em; font-weight: bold; text-align: center; margin-bottom: 10px; color: var(--champ-color); text-shadow: 0 0 5px rgba(255,152,0,0.3);";
    title.textContent = `Analisi Carattere: ${selectedChar}`;
    container.appendChild(title);

    const types = [
        { id: 'Z2', label: 'Base', icon: '🟢' },
        { id: 'WORK', label: 'Lavoro', icon: '🟡' },
        { id: 'LONG', label: 'Lungo', icon: '🟣' }
    ];

    types.forEach(type => {
        const s = (statsByType[type.id] && statsByType[type.id][dbChar]) ? statsByType[type.id][dbChar] : { attempts: 0, errors: 0 };
        const accuracy = s.attempts > 0 ? (s.attempts - s.errors) / s.attempts : 0;
        const perc = Math.round(accuracy * 100);

        const row = document.createElement('div');
        row.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;";

        const labelRow = document.createElement('div');
        labelRow.style.cssText = "display: flex; justify-content: space-between; font-size: 0.8em; font-weight: bold;";
        labelRow.innerHTML = `<span>${type.icon} ${type.label}</span> <span style="color:var(--hint-color)">${s.attempts} tentativi</span>`;

        const barContainer = document.createElement('div');
        barContainer.style.cssText = "height: 18px; background: rgba(255,255,255,0.05); border-radius: 9px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; position: relative;";

        const bar = document.createElement('div');
        bar.style.width = s.attempts > 0 ? `${perc}%` : "0%";
        bar.style.height = "100%";
        bar.style.background = s.attempts === 0 ? '#444' : (accuracy >= 0.9 ? '#4caf50' : accuracy >= 0.7 ? '#ff9800' : '#d32f2f');
        bar.style.boxShadow = "inset 0 0 10px rgba(0,0,0,0.3)";
        bar.style.transition = "width 0.8s cubic-bezier(0.17, 0.67, 0.83, 0.67)";

        const percLabel = document.createElement('span');
        percLabel.style.cssText = "position: absolute; width: 100%; text-align: center; font-size: 0.7em; font-weight: bold; color: #fff; text-shadow: 1px 1px 2px #000;";
        percLabel.textContent = s.attempts > 0 ? `${perc}%` : "NESSUN DATO";

        barContainer.appendChild(bar);
        barContainer.appendChild(percLabel);
        row.appendChild(labelRow);
        row.appendChild(barContainer);
        container.appendChild(row);
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.startCourseWizard = function() {
    if (els.courseTabInitialPrompt) els.courseTabInitialPrompt.style.display = 'none';
    if (els.courseWizardContainer) els.courseWizardContainer.style.display = 'block';
    window.populateLessonDropdowns();
    window.nextWizardStep(1);
};

window.populateLessonDropdowns = function() {
    const wizardSelect = document.getElementById('wizardStartLesson');
    const settingsSelect = document.getElementById('courseTabLessonInput');

    const populate = (select) => {
        if (!select) return;
        select.innerHTML = '';
        for (let i = 2; i <= window.KOCH_SEQUENCE.length; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Lezione ${i} (${window.KOCH_SEQUENCE[i-1]})`;
            select.appendChild(opt);
        }
    };
    populate(wizardSelect);
    populate(settingsSelect);

    if (wizardSelect) {
        wizardSelect.onchange = () => {
            const num = parseInt(wizardSelect.value);
            const chars = window.KOCH_SEQUENCE.slice(0, num).join(", ");
            const info = document.getElementById('wizardLessonChars');
            if (info) info.textContent = `Caratteri: ${chars}`;
        };
        wizardSelect.onchange();
    }
};

window.nextWizardStep = function(step) {
    const steps = ['Role', 'Tutor', '1', '2', '3', '4'];
    steps.forEach(s => {
        const el = document.getElementById('wizardStep' + s);
        if (el) el.style.display = 'none';
    });

    let currentStepId = 'wizardStep' + step;
    if (step === 0) currentStepId = 'wizardStepRole';

    const currentEl = document.getElementById(currentStepId);
    if (currentEl) currentEl.style.display = 'block';

    if (step === 'Tutor') {
        window.renderTutorSelection();
    }
    if (step === 4) {
        window.updateWizardDurationsPreview();
        if (els.wizardMinZ2) els.wizardMinZ2.oninput = window.updateWizardDurationsPreview;
    }
};

window.renderTutorSelection = function() {
    const list = document.getElementById('tutorSelectionList');
    const confirmBtn = document.getElementById('btnConfirmTutor');
    if (!list || !db) return;

    list.innerHTML = '<p style="font-size:0.75em; color:var(--hint-color); text-align:center;">Ricerca tutor disponibili...</p>';

    db.ref('courseActiveEnrollments').once('value', snap => {
        const enrollments = snap.val() || {};
        list.innerHTML = '';
        let foundTutors = 0;

        Object.entries(enrollments).forEach(([uid, data]) => {
            if (data.role === 'tutor' && uid !== myId) {
                foundTutors++;
                const div = document.createElement('div');
                div.className = 'box-panel';
                div.style.cssText = "padding:10px; cursor:pointer; border:1px solid var(--hint-color); transition:all 0.2s;";
                div.innerHTML = `<b>🎓 ${data.name}</b>`;

                div.onclick = () => {
                    // Deseleziona altri
                    Array.from(list.children).forEach(c => c.style.borderColor = 'var(--hint-color)');
                    div.style.borderColor = 'var(--link-color)';
                    div.style.background = 'rgba(33,150,243,0.1)';

                    window.tempSelectedTutorId = uid;
                    if (confirmBtn) {
                        confirmBtn.disabled = false;
                        confirmBtn.onclick = () => {
                            window.courseData.tutor_id = uid;
                            window.nextWizardStep(1);
                        };
                    }
                };
                list.appendChild(div);
            }
        });

        if (foundTutors === 0) {
            list.innerHTML = '<p style="font-size:0.8em; color:var(--hint-color); text-align:center;">Nessun tutor disponibile al momento.<br><br>Puoi comunque iniziare il corso e sceglierne uno in seguito.</p>';
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Continua senza Tutor";
                confirmBtn.onclick = () => {
                    window.courseData.tutor_id = null;
                    window.nextWizardStep(1);
                };
            }
        }
    });
};

window.updateWizardDurationsPreview = function() {
    const z2 = parseInt(els.wizardMinZ2?.value) || 10;
    const work = Math.round(z2 * (20/30));
    const long = Math.round(z2 * (50/30));
    const preview = document.getElementById('wizardDurationsPreview');
    if (preview) preview.textContent = `Base: ${z2} min | Lavoro: ${work} min | Lungo: ${long} min`;
};

window.finishWizard = function() {
    const role = window.tempWizardRole || 'corsista';
    const z2 = parseInt(els.wizardMinZ2?.value) || 10;
    const startLesson = parseInt(els.wizardStartLesson?.value) || 2;
    const isElite = document.getElementById('wizardEliteMode')?.checked === true;

    if (!window.courseData) window.courseData = window.getDefaultCourseData();
    window.courseData.active_plan = true;
    window.courseData.role = role;
    window.courseData.init_date = new Date().toISOString().split('T')[0];

    if (role === 'corsista') {
        // Il tutor_id viene salvato nello step 'Tutor' (window.tempSelectedTutorId)
        window.courseData.tutor_id = window.tempSelectedTutorId || null;
        window.courseData.elite_mode = isElite;
        window.courseData.progress.current_lesson = startLesson;
        window.courseData.settings = {
            days_per_week: els.wizardDays.value,
            start_wpm: parseInt(els.wizardWpm?.value) || 15,
            farnsworth_wpm: parseInt(els.wizardFarnsworth?.value) || 12,
            group_spacing: els.wizardGroupSpacing?.value || "3.0",
            pause_interval: parseInt(els.wizardPauseInterval?.value) || 60,
            pause_duration: parseInt(els.wizardPauseDuration?.value) || 10,
            minutes_z2: z2,
            minutes_work: Math.round(z2 * (20/30)),
            minutes_long: Math.round(z2 * (50/30))
        };
        window.generateWeeklySchedule();
    } else {
        // Tutor non ha settings di studio
        window.courseData.elite_mode = false;
        window.courseData.tutor_id = null;
    }

    window.saveCourseState();
    window.updateGlobalEnrollmentRecord(true); // Aggiorna contatore globale iscritti
    window.renderCourseTabView();

    if (role === 'tutor') {
        showToast("Profilo TUTOR attivato! 🎓");
    } else {
        showToast(isElite ? "Piano ELITE attivato! ⚡" : "Corso attivato con successo! 🚀");
    }
};
};

window.finishCourseSession = function() {
    const stats = window.courseData.progress.char_stats || {};
    const statsByType = window.courseData.progress.char_stats_by_type || { Z2: {}, WORK: {}, LONG: {} };
    const currentLesson = window.courseData.progress.current_lesson;
    const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);
    const sessionType = window.courseData.current_day_session.type;
    let totalAttempts = 0, totalErrors = 0;
    let worstChars = [];

    activeChars.forEach(char => {
        const dbChar = window.firebaseEscape(char);
        const s = stats[dbChar] || { attempts: 0, errors: 0 };
        totalAttempts += s.attempts;
        totalErrors += s.errors;

        if (!statsByType[sessionType]) statsByType[sessionType] = {};
        if (!statsByType[sessionType][dbChar]) statsByType[sessionType][dbChar] = { attempts: 0, errors: 0 };

        if (s.attempts > 0 && (s.errors / s.attempts) > 0.15) {
            worstChars.push(char);
        }
    });

    const accuracy = totalAttempts > 0 ? ((totalAttempts - totalErrors) / totalAttempts) : 1.0;

    // --- ASSEGNAZIONE XP SPECIFICI CORSO ---
    let sessionBaseXP = 50; // Default Z2
    if (sessionType === 'WORK') sessionBaseXP = 100;
    else if (sessionType === 'LONG') sessionBaseXP = 200;

    // Gli XP guadagnati sono proporzionali all'accuratezza
    const sessionEarnedXP = Math.round(sessionBaseXP * accuracy);

    if (!window.courseData.progress.total_xp) window.courseData.progress.total_xp = 0;
    window.courseData.progress.total_xp += sessionEarnedXP;

    // Sincronizziamo anche con il livello globale dell'RPG
    if (typeof window.addXP === 'function') {
        window.addXP(sessionEarnedXP, `Course Session ${sessionType}`);
    }

    if (window.courseData.current_day_session.type === 'Z2') {
        window.courseData.progress.last_z2_accuracy = accuracy;
    }

    window.courseData.current_day_session.completed = true;
    requestedWordCount = wordIndex;

    const todayIdx = (new Date().getDay() + 6) % 7;
    const dayData = window.courseData.weekly_schedule[todayIdx];
    if (dayData && dayData.sessions) {
        const sessionObj = dayData.sessions.find(s => s.type === sessionType && !s.completed);
        if (sessionObj) sessionObj.completed = true;
    }

    let canAdvance = true;
    activeChars.forEach(char => {
        const dbChar = window.firebaseEscape(char);
        const s = stats[dbChar] || { attempts: 0, errors: 0 };
        if (s.attempts < 50 || (s.attempts - s.errors) / s.attempts < 0.9) canAdvance = false;
    });

    let advanceMsg = "";
    const isExtra = window.courseData.current_day_session.isExtra === true;

    if (!isExtra && canAdvance && currentLesson < window.KOCH_SEQUENCE.length) {
        window.courseData.progress.current_lesson++;
        advanceMsg = `\n\n🚀 NUOVO CARATTERE SBLOCCATO: ${window.KOCH_SEQUENCE[window.courseData.progress.current_lesson - 1]}!`;
    }

    if (isExtra) {
        advanceMsg = "\n\n✨ Allenamento Extra completato. Ottimo per la tua memoria muscolare!";
    }

    window.courseData.progress.char_stats_by_type = statsByType;

    // --- GESTIONE RICHIAMI E GIORNI CONSECUTIVI ---
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const lastSession = window.courseData.progress.last_session_date;

    if (lastSession) {
        const lastDate = new Date(lastSession);
        const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            window.courseData.progress.consecutive_days = (window.courseData.progress.consecutive_days || 0) + 1;
        } else if (diffDays > 1) {
            window.courseData.progress.consecutive_days = 1;
        }
    } else {
        window.courseData.progress.consecutive_days = 1;
    }

    // Se fatti 2 giorni consecutivi, scali un richiamo (se presente)
    if (window.courseData.progress.consecutive_days > 0 && window.courseData.progress.consecutive_days % 2 === 0) {
        if ((window.courseData.progress.reminders_count || 0) > 0) {
            window.courseData.progress.reminders_count--;
            showToast(currentLang === 'it' ? "Bravo! Per la tua costanza ti è stato rimosso un richiamo." : "Well done! A reminder has been removed due to your consistency.");
        }
    }

    window.courseData.progress.last_session_date = todayStr;
    window.saveCourseState();

    // Rimuoviamo il segnale LIVE per i tutor a fine sessione
    db.ref(`courseActiveEnrollments/${myId}`).update({ roomCode: null });
    db.ref(`courseActiveEnrollments/${myId}`).child('roomCode').onDisconnect().cancel();

    // --- VISUALIZZAZIONE DEBRIEFING GRAFICO ---
    const modal = document.getElementById('courseResultsModal');
    const accTxt = document.getElementById('courseResultsAccuracy');
    const msgDiv = document.getElementById('courseResultsMessage');
    const focusP = document.getElementById('courseResultsFocus');

    if (modal && accTxt && msgDiv && focusP) {
        accTxt.textContent = `Accuratezza Finale: ${Math.round(accuracy * 100)}%`;
        accTxt.style.color = accuracy >= 0.9 ? '#4caf50' : accuracy >= 0.7 ? '#ff9800' : '#d32f2f';

        const debriefing = window.getCourseDebriefing(accuracy, worstChars.slice(0, 3));

        // Messa in sicurezza debriefing (XSS Fix)
        msgDiv.innerHTML = "";
        msgDiv.appendChild(document.createTextNode(`"${debriefing}"`));
        if (advanceMsg) {
            const advDiv = document.createElement('div');
            advDiv.style.marginTop = "10px";
            advDiv.style.color = "var(--link-color)";
            advDiv.style.fontWeight = "bold";
            advDiv.textContent = advanceMsg.trim();
            msgDiv.appendChild(advDiv);
        }

        if (worstChars.length > 0) {
            focusP.innerHTML = "";
            const b = document.createElement('b');
            b.textContent = "⚠️ Focus per domani: ";
            focusP.appendChild(b);
            focusP.appendChild(document.createTextNode(worstChars.slice(0, 5).join(", ")));
        } else {
            focusP.textContent = "Ottima sessione, nessun carattere critico rilevato.";
        }

        modal.style.display = 'flex';

        document.getElementById('btnCloseCourseResults').onclick = () => {
            modal.style.display = 'none';
            window.showProfileScreen();
            window.switchProfileTab('course');
        };
    } else {
        alert(`Sessione completata! Accuratezza: ${Math.round(accuracy * 100)}%`);
        window.finishGame();
    }
};

window.initCourseChat = function() {
    if (!db) return;

    // SETUP CHAT SCOPED PER TUTOR (Classe)
    const tutorId = window.courseData?.tutor_id;
    const isTutor = window.courseData?.role === 'tutor';
    const effectiveTutorId = isTutor ? myId : tutorId;

    if (!effectiveTutorId) {
        const messagesCont = document.getElementById('courseChatMessages');
        if (messagesCont) messagesCont.innerHTML = '<p style="text-align:center; font-size:0.8em; color:var(--hint-color); padding:20px;">Scegli un Tutor per sbloccare la Radio-Aula.</p>';
        if (els.sendCourseChatBtn) els.sendCourseChatBtn.disabled = true;
        return;
    }

    if (els.sendCourseChatBtn) els.sendCourseChatBtn.disabled = false;
    const chatPath = `courseClassrooms/${effectiveTutorId}/chat`;
    const chatRef = db.ref(chatPath);
    const messagesCont = document.getElementById('courseChatMessages');

    if (listeners.courseChat) chatRef.off('value', listeners.courseChat);

    listeners.courseChat = chatRef.limitToLast(50).on('value', async (snap) => {
        if (!messagesCont) return;
        const data = snap.val() || {};
        messagesCont.innerHTML = '';

        const entries = Object.entries(data);
        for (const [key, msg] of entries) {
            const div = document.createElement('div');
            div.style.marginBottom = '5px';

            // Timestamp
            const timeSpan = document.createElement('span');
            timeSpan.style.cssText = "font-size:0.8em; color:var(--hint-color);";
            timeSpan.textContent = new Date(msg.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + " ";
            div.appendChild(timeSpan);

            // Tag Tutor
            if (msg.role === 'tutor') {
                const roleTag = document.createElement('b');
                roleTag.style.cssText = "color:#673ab7; font-size:0.7em; background:#eee; padding:1px 4px; border-radius:4px; margin-right:4px;";
                roleTag.textContent = "TUTOR";
                div.appendChild(roleTag);
            }

            // Nome Mittente
            const nameB = document.createElement('b');
            nameB.style.cssText = "color:var(--link-color); font-size:0.9em;";
            nameB.textContent = msg.name + ": ";
            div.appendChild(nameB);

            // TASTO ELIMINA (XSS Safe)
            if (msg.senderId === myId) {
                const delBtn = document.createElement('span');
                delBtn.innerHTML = " 🗑️";
                delBtn.style.cursor = 'pointer';
                delBtn.onclick = () => {
                    if (confirm("Eliminare?")) db.ref(`${chatPath}/${key}`).remove();
                };
                div.appendChild(delBtn);
            }

            // Testo Messaggio (XSS Safe via textContent)
            const textSpan = document.createElement('span');
            textSpan.style.fontSize = "0.95em";
            textSpan.textContent = msg.text;
            div.appendChild(textSpan);

            messagesCont.appendChild(div);
        }
        messagesCont.scrollTop = messagesCont.scrollHeight;
    });

    if (els.sendCourseChatBtn && els.courseChatInput) {
        els.sendCourseChatBtn.onclick = async () => {
            const now = Date.now();
            if (window.lastChatSentTs && now - window.lastChatSentTs < 2000) {
                return alert("🐌 Vai più piano! Attendi 2 secondi.");
            }

            if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
            const txt = els.courseChatInput.value.trim();
            if (!txt) return;
            if (txt.length > 200) return alert(currentLang === 'it' ? "⚠️ Messaggio troppo lungo (max 200 car.)" : "⚠️ Message too long (max 200 chars)");

            window.lastChatSentTs = now;
            chatRef.push({
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                text: txt,
                ts: firebase.database.ServerValue.TIMESTAMP,
                senderId: myId,
                role: window.courseData?.role || 'corsista'
            });
            els.courseChatInput.value = '';
        };
        els.courseChatInput.onkeypress = (e) => { if (e.key === 'Enter') els.sendCourseChatBtn.click(); };
    }

    if (els.clearCourseChatBtn) {
        els.clearCourseChatBtn.onclick = () => {
            if (!isTutor) return alert("Solo il Tutor può cancellare l'aula.");
            if (confirm("Vuoi cancellare la cronologia della Radio-Aula per TUTTA LA TUA CLASSE?")) {
                chatRef.remove().then(() => showToast("Aula pulita"));
            }
        };
    }
};

window.attachCourseUIListeners = function() {
    const togglePairs = [
        { btn: 'btnToggleCourseChat', content: 'courseChatContent' },
        { btn: 'btnToggleCourseSettings', content: 'courseTabSettingsContent' },
        { btn: 'btnToggleCourseHeatmap', content: 'courseTabHeatmapContent' },
        { btn: 'btnToggleCoursePlan', content: 'courseTabWeeklyPlanContent' }
    ];

    togglePairs.forEach(p => {
        const btn = document.getElementById(p.btn);
        const content = document.getElementById(p.content);
        if (btn && content) {
            btn.onclick = () => {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? (p.content.includes('Content') ? 'flex' : 'block') : 'none';
                btn.textContent = isHidden ? 'Nascondi' : 'Mostra';
            };
        }
    });

    if (els.btnCloseAdvancedStats) {
        els.btnCloseAdvancedStats.onclick = () => {
            if (els.courseAdvancedStatsPanel) els.courseAdvancedStatsPanel.style.display = 'none';
        };
    }

    if (els.btnTabSavePlan) {
        els.btnTabSavePlan.onclick = () => {
            const z2 = parseInt(els.courseTabMinZ2.value) || 10;
            window.courseData.progress.current_lesson = parseInt(els.courseTabLessonInput.value) || 2;
            window.courseData.elite_mode = els.courseTabEliteInput?.checked === true;
            window.courseData.settings.days_per_week = els.courseTabDaysInput.value;
            window.courseData.settings.start_wpm = els.courseTabWpmInput.value;
            window.courseData.settings.farnsworth_wpm = els.courseTabFarnsworthInput.value;
            window.courseData.settings.group_spacing = els.courseTabGroupSpacingInput.value;
            window.courseData.settings.pause_interval = parseInt(els.courseTabPauseIntervalInput.value) || 60;
            window.courseData.settings.pause_duration = parseInt(els.courseTabPauseDurationInput.value) || 0;
            window.courseData.settings.minutes_z2 = z2;
            window.courseData.settings.minutes_work = Math.round(z2 * (20/30));
            window.courseData.settings.minutes_long = Math.round(z2 * (50/30));

            window.generateWeeklySchedule();
            window.renderCourseTabView();
            showToast("Impostazioni salvate! 💾");
        };
    }

    if (els.btnTabResetCourse) {
        els.btnTabResetCourse.onclick = () => {
            if (confirm("ATTENZIONE: Stai per ABBANDONARE il Corso. I progressi verranno resettati. Vuoi procedere?")) {
                window.updateGlobalEnrollmentRecord(false); // Sottrae dal contatore globale
                window.courseData = window.getDefaultCourseData();
                window.saveCourseState();
                window.renderCourseTabView();
                showToast("Corso abbandonato.");
            }
        };
    }

    if (els.btnTabExitTutor) {
        els.btnTabExitTutor.onclick = () => {
            if (confirm("Vuoi davvero rinunciare al ruolo di TUTOR?\nNon avrai più accesso ai dati dei corsisti.")) {
                window.updateGlobalEnrollmentRecord(false);
                window.courseData = window.getDefaultCourseData();
                window.saveCourseState();
                window.renderCourseTabView();
                showToast("Ruolo Tutor rimosso.");
            }
        };
    }

    if (els.btnTabStartCourseSession) {
        els.btnTabStartCourseSession.onclick = () => {
             const todayIdx = (new Date().getDay() + 6) % 7;
             const dayData = window.courseData.weekly_schedule[todayIdx];

             // Cerchiamo la prima sessione non completata
             let session = dayData ? dayData.sessions.find(s => !s.completed && s.type !== 'REST') : null;
             let isExtra = false;

             if (!session) {
                 // Se tutte completate o giorno di riposo, offriamo sessione extra
                 session = { type: 'Z2', completed: false };
                 isExtra = true;
             }

             if (!isExtra && dayData.sessions.filter(s => !s.completed).length > 1) {
                 const label = session.elite ? "ELITE (Base Z2)" : "STANDARD";
                 if (!confirm(`Oggi hai doppia sessione! Vuoi iniziare la sessione ${label}?`)) return;
             }

             const todayStr = new Date().toISOString().split('T')[0];

             // Durata sessione
             let duration = 10; // Default extra
             if (!isExtra) {
                if (session.type === 'Z2') duration = window.courseData.settings.minutes_z2;
                else if (session.type === 'WORK') duration = window.courseData.settings.minutes_work;
                else if (session.type === 'LONG') duration = window.courseData.settings.minutes_long;
             }

             window.courseData.current_day_session = {
                 type: session.type, total_seconds: duration * 60,
                 remaining_seconds: duration * 60, completed: false, date: todayStr,
                 isExtra: isExtra
             };
             window.saveCourseState();

             // MOSTRA IL MODALE CON IL WARM-UP
             if (typeof window.showCourseSessionModal === 'function') {
                 window.showCourseSessionModal(window.courseData.current_day_session, isExtra);
             } else {
                 window.actualStartCourseGame();
             }
        };
    }

    if (els.btnPlayCourseNow) {
        els.btnPlayCourseNow.onclick = () => {
            if (els.courseSessionModal) els.courseSessionModal.style.display = 'none';
            window.actualStartCourseGame();
        };
    }
};

window.actualStartCourseGame = function() {
    if (!window.courseData.current_day_session) return;

    // Chiudiamo il modale esplicitamente
    const modal = document.getElementById('courseSessionModal');
    if (modal) modal.style.display = 'none';

    currentMode = 'course';
    isSinglePlayer = true;
    currentWpm = parseInt(window.courseData.settings.start_wpm);
    roomCode = "COURSE_" + myId;

    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    // Inizializzazione audio contesto
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Segnaliamo il roomCode ai tutor e impostiamo pulizia automatica al distacco
    const enrollmentRef = db.ref(`courseActiveEnrollments/${myId}`);
    enrollmentRef.update({ roomCode: roomCode });
    enrollmentRef.child('roomCode').onDisconnect().set(null);

    db.ref('rooms/' + roomCode).set({
        status: 'countdown', type: 'single', mode: 'course', wpm: currentWpm, tone: 600,
        createdAt: firebase.database.ServerValue.TIMESTAMP, hostId: myId
    }).then(() => {
        if (typeof window.joinRoomLogic === 'function') {
            window.joinRoomLogic(false);
        }
    });
};

setTimeout(window.attachCourseUIListeners, 2000);

window.initTutorCourseChatNotification = function() {
    if (!db || !myId) return;

    // Solo per Tutor
    const isTutor = window.courseData && window.courseData.role === 'tutor';
    if (!isTutor) return;

    const chatPath = `courseClassrooms/${myId}/chat`;
    const chatRef = db.ref(chatPath);
    let initialLoad = true;

    if (listeners.courseChatNotif) chatRef.off('child_added', listeners.courseChatNotif);

    listeners.courseChatNotif = chatRef.limitToLast(1).on('child_added', snap => {
        if (initialLoad) {
            initialLoad = false;
            return;
        }

        const msg = snap.val();
        if (!msg) return;

        // Se il messaggio è mio, non notificare
        if (msg.senderId === myId) return;

        // Se siamo già nel tab corso e l'aula è visibile, non mostrare il badge
        const courseArea = document.getElementById('profileCourseArea');
        const isViewingCourse = (courseArea && courseArea.style.display === 'flex');

        if (!isViewingCourse) {
            const badge = document.getElementById('courseMessageBadge');
            if (badge) {
                badge.style.display = 'flex';
                // Effetto pulsante per attirare attenzione
                badge.classList.add('badge-pulse');
            }
        }
    }, (error) => {
        console.error("Course Chat Notif Error:", error);
    });
};

window.hideCourseMessageBadge = function() {
    const badge = document.getElementById('courseMessageBadge');
    if (badge) {
        badge.style.display = 'none';
        badge.classList.remove('badge-pulse');
    }
};
