// js/course_ui.js

window.updateCourseUI = function() {
    if (!window.courseData) return;

    const preview = document.getElementById('coursePreviewInfo');
    if (preview) {
        if (window.courseData.active_plan) {
            preview.textContent = `Lezione ${window.courseData.progress.current_lesson} - ${window.courseData.settings.days_per_week}gg/sett`;
        } else {
            preview.textContent = "Attiva il tuo piano di allenamento personalizzato.";
        }
    }

    const btnOpen = document.getElementById('btnOpenCourse');
    if (btnOpen) {
        btnOpen.style.display = 'none'; // Nascondiamo il vecchio bottone Gestisci
    }
};

window.renderCourseTabView = function() {
    const activeView = document.getElementById('courseTabActiveView');
    const initialPrompt = document.getElementById('courseTabInitialPrompt');
    const wizardContainer = document.getElementById('courseWizardContainer');

    console.log("Course UI: Rendering Tab View. Data active_plan:", window.courseData?.active_plan);

    // Reset visualizzazione
    if (activeView) activeView.style.display = 'none';
    if (initialPrompt) initialPrompt.style.display = 'none';
    if (wizardContainer) wizardContainer.style.display = 'none';

    // CONTROLLO RIGOROSO: Se il piano è attivo, mostriamo la dashboard
    if (window.courseData && (window.courseData.active_plan === true || window.courseData.active_plan === "true")) {
        if (activeView) activeView.style.display = 'flex';
        window.renderCourseTabDashboard();

        // Popoliamo i campi impostazioni
        window.populateLessonDropdowns();
        const s = window.courseData.settings;
        const currentLesson = window.courseData.progress.current_lesson;
        if (document.getElementById('courseTabLessonInput')) document.getElementById('courseTabLessonInput').value = currentLesson;
        if (document.getElementById('courseTabDaysInput')) document.getElementById('courseTabDaysInput').value = s.days_per_week;
        if (document.getElementById('courseTabWpmInput')) document.getElementById('courseTabWpmInput').value = s.start_wpm;
        if (document.getElementById('courseTabFarnsworthInput')) document.getElementById('courseTabFarnsworthInput').value = s.farnsworth_wpm;
        if (document.getElementById('courseTabGroupSpacingInput')) document.getElementById('courseTabGroupSpacingInput').value = s.group_spacing || "3.0";
        if (document.getElementById('courseTabPauseIntervalInput')) document.getElementById('courseTabPauseIntervalInput').value = s.pause_interval || 60;
        if (document.getElementById('courseTabPauseDurationInput')) document.getElementById('courseTabPauseDurationInput').value = s.pause_duration || 10;
        if (document.getElementById('courseTabMinZ2')) document.getElementById('courseTabMinZ2').value = s.minutes_z2;

        // Inizializza Chat Corso
        window.initCourseChat();
    } else {
        // Altrimenti mostriamo il prompt iniziale
        if (initialPrompt) initialPrompt.style.display = 'block';
    }
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

            const s = stats[char] || { attempts: 0, errors: 0 };
            const accuracy = s.attempts > 0 ? (s.attempts - s.errors) / s.attempts : 0;

            if (idx >= currentLesson) {
                box.style.backgroundColor = 'rgba(255,255,255,0.05)';
                box.style.opacity = '0.3';
                box.title = "Non ancora sbloccato";
            } else {
                if (s.attempts === 0) {
                    box.style.backgroundColor = 'var(--hint-color)';
                    box.style.color = '#fff';
                } else {
                    box.style.backgroundColor = accuracy >= 0.9 ? '#4caf50' : accuracy >= 0.7 ? '#ff9800' : '#d32f2f';
                    box.style.color = '#fff';
                }
                box.title = `${char}: ${Math.round(accuracy * 100)}% (${s.attempts} tentativi)`;
            }

            box.onclick = () => {
                if (s.attempts > 0) {
                    alert(`${char}: Accurato al ${Math.round(accuracy * 100)}% su ${s.attempts} tentativi.`);
                } else {
                    alert(`${char}: Nessun dato registrato.`);
                }
            };

            heatmap.appendChild(box);
        });

        const activeCharsStr = window.KOCH_SEQUENCE.slice(0, currentLesson).join(", ");
        if (lessonInfo) lessonInfo.textContent = `Caratteri attivi (${currentLesson}): ${activeCharsStr}`;
    }

    // 2. Weekly Plan
    const planList = document.getElementById('courseTabWeeklyPlan');
    if (planList) {
        planList.innerHTML = '';
        const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
        if (!window.courseData.weekly_schedule) window.generateWeeklySchedule();

        window.courseData.weekly_schedule.forEach((session, idx) => {
            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:6px; background:var(--sec-bg-color); border-radius:6px; font-size:0.85em;";

            const label = document.createElement('span');
            label.textContent = `${days[idx]}: `;
            const typeSpan = document.createElement('b');
            const typeCfg = window.COURSE_TYPES[session.type] || { labelIt: 'Riposo', color: '#999' };
            typeSpan.textContent = currentLang === 'it' ? typeCfg.labelIt : typeCfg.labelEn;
            typeSpan.style.color = typeCfg.color;
            label.appendChild(typeSpan);

            const status = document.createElement('span');
            status.textContent = session.completed ? "✅ Fatto" : (session.type === 'REST' ? "😴" : "⏳");

            div.appendChild(label);
            div.appendChild(status);
            planList.appendChild(div);
        });
    }
};

window.generateWeeklySchedule = function() {
    if (!window.courseData || !window.courseData.settings) return;
    const daysPerWeek = parseInt(window.courseData.settings.days_per_week);
    let schedule = Array(7).fill(null).map(() => ({ type: 'REST', completed: false }));

    let workDays = [];
    if (daysPerWeek === 1) workDays = [6];
    else {
        const step = 7 / daysPerWeek;
        for (let i=0; i<daysPerWeek; i++) workDays.push(Math.floor(i * step));
    }

    workDays.forEach((dayIdx, i) => {
        let type = 'WORK';
        if (i === workDays.length - 1) type = 'LONG';
        else if (i % 2 === 0) type = 'Z2';

        schedule[dayIdx] = { type: type, completed: false };
    });

    window.courseData.weekly_schedule = schedule;
    window.saveCourseState();
};

// --- LOGICA WIZARD PASSO-PASSO ---
window.startCourseWizard = function() {
    document.getElementById('courseTabInitialPrompt').style.display = 'none';
    document.getElementById('courseWizardContainer').style.display = 'block';
    window.populateLessonDropdowns();
    window.nextWizardStep(1);
};

window.populateLessonDropdowns = function() {
    const wizardSelect = document.getElementById('wizardStartLesson');
    const settingsSelect = document.getElementById('courseTabLessonInput');

    const populate = (select) => {
        if (!select) return;
        select.innerHTML = '';
        // Sequenza Koch: K M R S U A P T L O W I . N J E F 0 Y V , , G 5 / Q 9 Z H 3 8 B ? 4 2 7 C 1 D 6 X
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
    for(let i=1; i<=4; i++) {
        const el = document.getElementById('wizardStep'+i);
        if(el) el.style.display = (i === step) ? 'block' : 'none';
    }

    // Aggiornamento anteprima durate al passo 4
    if (step === 4) {
        window.updateWizardDurationsPreview();
        const input = document.getElementById('wizardMinZ2');
        if (input) input.oninput = window.updateWizardDurationsPreview;
    }
};

window.updateWizardDurationsPreview = function() {
    const input = document.getElementById('wizardMinZ2');
    if (!input) return;
    const z2 = parseInt(input.value) || 10;
    const work = Math.round(z2 * (20/30));
    const long = Math.round(z2 * (50/30));
    const preview = document.getElementById('wizardDurationsPreview');
    if (preview) preview.textContent = `Base: ${z2} min | Lavoro: ${work} min | Lungo: ${long} min`;
};

window.finishWizard = function() {
    console.log("Course: Finishing Wizard...");
    const z2Input = document.getElementById('wizardMinZ2');
    const lessonInput = document.getElementById('wizardStartLesson');
    const daysInput = document.getElementById('wizardDays');
    const wpmInput = document.getElementById('wizardWpm');
    const farnsworthInput = document.getElementById('wizardFarnsworth');
    const spacingInput = document.getElementById('wizardGroupSpacing');
    const pauseIntInput = document.getElementById('wizardPauseInterval');
    const pauseDurInput = document.getElementById('wizardPauseDuration');

    if (!z2Input || !lessonInput || !daysInput) {
        console.error("Course Wizard: Missing critical inputs", { z2Input, lessonInput, daysInput });
        alert("Errore nel recupero dei dati. Riprova.");
        return;
    }

    const z2 = parseInt(z2Input.value) || 10;
    const startLesson = parseInt(lessonInput.value) || 2;

    window.courseData.active_plan = true;
    window.courseData.progress.current_lesson = startLesson;
    window.courseData.settings = {
        days_per_week: daysInput.value,
        start_wpm: wpmInput ? parseInt(wpmInput.value) : 15,
        farnsworth_wpm: farnsworthInput ? parseInt(farnsworthInput.value) : 12,
        group_spacing: spacingInput ? spacingInput.value : "3.0",
        pause_interval: pauseIntInput ? parseInt(pauseIntInput.value) : 60,
        pause_duration: pauseDurInput ? parseInt(pauseDurInput.value) : 10,
        minutes_z2: z2,
        minutes_work: Math.round(z2 * (20/30)),
        minutes_long: Math.round(z2 * (50/30))
    };

    console.log("Course: Final settings for save:", window.courseData.settings);

    window.generateWeeklySchedule();
    window.renderCourseTabView();
    window.saveCourseState();

    // Pulizia UI
    document.getElementById('courseWizardContainer').style.display = 'none';
    showToast("Corso attivato! Iniziamo l'allenamento. 🚀");
};

window.initCourseChat = function() {
    if (!db) return;
    const chatRef = db.ref('courseChat');
    window.setupChat(chatRef, 'courseChatMessages', null);

    const sendBtn = document.getElementById('sendCourseChatBtn');
    const input = document.getElementById('courseChatInput');
    if (sendBtn && input) {
        sendBtn.onclick = () => {
            const txt = input.value.trim();
            if (!txt) return;
            chatRef.push({
                name: myName,
                username: myPrivacy ? "" : tgUsername,
                text: txt,
                ts: firebase.database.ServerValue.TIMESTAMP
            });
            input.value = '';
        };
        input.onkeypress = (e) => { if (e.key === 'Enter') sendBtn.click(); };
    }

    const clearBtn = document.getElementById('clearCourseChatBtn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            if (confirm("Vuoi cancellare la cronologia della Radio-Aula?")) {
                chatRef.remove();
            }
        };
    }
};

window.attachCourseEventListeners = function() {
    // Toggle Pannelli
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

    const btnSave = document.getElementById('btnTabSavePlan');
    if (btnSave) {
        btnSave.onclick = () => {
            const z2 = parseInt(document.getElementById('courseTabMinZ2').value) || 10;
            window.courseData.progress.current_lesson = parseInt(document.getElementById('courseTabLessonInput').value) || 2;
            window.courseData.settings.days_per_week = document.getElementById('courseTabDaysInput').value;
            window.courseData.settings.start_wpm = document.getElementById('courseTabWpmInput').value;
            window.courseData.settings.farnsworth_wpm = document.getElementById('courseTabFarnsworthInput').value;
            window.courseData.settings.group_spacing = document.getElementById('courseTabGroupSpacingInput').value;
            window.courseData.settings.pause_interval = parseInt(document.getElementById('courseTabPauseIntervalInput').value) || 60;
            window.courseData.settings.pause_duration = parseInt(document.getElementById('courseTabPauseDurationInput').value) || 0;
            window.courseData.settings.minutes_z2 = z2;
            window.courseData.settings.minutes_work = Math.round(z2 * (20/30));
            window.courseData.settings.minutes_long = Math.round(z2 * (50/30));

            // Rigeneriamo il piano per riflettere i cambiamenti
            window.generateWeeklySchedule();
            window.renderCourseTabView();
            window.saveCourseState();
            showToast("Impostazioni salvate e piano aggiornato! 💾");
        };
    }

    const btnExit = document.getElementById('btnTabResetCourse');
    if (btnExit) {
        btnExit.onclick = () => {
            if (confirm("ATTENZIONE: Stai per ABBANDONARE il Corso CW. Tutti i tuoi progressi e le statistiche dei caratteri (Heatmap) verranno CANCELLATI DEFINITIVAMENTE. Vuoi procedere?")) {
                window.courseData = window.getDefaultCourseData();
                window.courseData.active_plan = false; // Forza false per sicurezza

                // Salviamo lo stato "non attivo" su Firebase (questo rimuoverà anche l'utente dal registro iscritti)
                window.saveCourseState();
                window.renderCourseTabView();
                showToast("Corso abbandonato e dati resettati.");
            }
        };
    }

    const btnStart = document.getElementById('btnTabStartCourseSession');
    if (btnStart) {
        btnStart.onclick = () => window.startCourseSessionUI();
    }

    const btnPlayNowModal = document.getElementById('btnPlayCourseNow');
    if (btnPlayNowModal) {
        btnPlayNowModal.onclick = () => {
            const modal = document.getElementById('courseSessionModal');
            if (modal) modal.style.display = 'none';
            window.startCourseSessionUI();
        };
    }
};

window.startCourseSessionUI = function() {
    if (!window.courseData) return;
    const todayIdx = (new Date().getDay() + 6) % 7;
    const session = window.courseData.weekly_schedule ? window.courseData.weekly_schedule[todayIdx] : null;

    if (!session || session.type === 'REST') {
        return alert("Oggi è previsto riposo! Ma puoi comunque fare pratica libera.");
    }

    if (session.completed) {
        return alert("Hai già completato l'allenamento di oggi!");
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (!window.courseData.current_day_session || window.courseData.current_day_session.date !== todayStr) {
        let duration = 15;
        if (session.type === 'Z2') duration = window.courseData.settings.minutes_z2;
        else if (session.type === 'WORK') duration = window.courseData.settings.minutes_work;
        else if (session.type === 'LONG') duration = window.courseData.settings.minutes_long;

        window.courseData.current_day_session = {
            type: session.type,
            total_seconds: duration * 60,
            remaining_seconds: duration * 60,
            completed: false,
            date: todayStr
        };
        window.saveCourseState();
    }

    currentMode = 'course';
    isSinglePlayer = true;
    currentWpm = parseInt(window.courseData.settings.start_wpm);
    requestedWordCount = 999;
    roomCode = "COURSE_" + myId;

    db.ref('rooms/' + roomCode).set({
        status: 'countdown',
        type: 'single',
        mode: 'course',
        wpm: currentWpm,
        tone: 600,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        hostId: myId
    }).then(() => window.joinRoomLogic?.(false));
};

setTimeout(window.attachCourseEventListeners, 2000);
