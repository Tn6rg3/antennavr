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
        window.renderCourseTabDashboard();
        window.populateCourseSettingsInputs();
        window.initCourseChat();
    } else {
        if (initialPrompt) initialPrompt.style.display = 'block';
    }
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
                } else {
                    box.style.backgroundColor = accuracy >= 0.9 ? '#4caf50' : accuracy >= 0.7 ? '#ff9800' : '#d32f2f';
                }
                box.style.color = '#fff';
                box.title = `${char}: ${Math.round(accuracy * 100)}% (${s.attempts} tentativi)`;
            }

            box.onclick = () => {
                if (s.attempts > 0) alert(`${char}: Accurato al ${Math.round(accuracy * 100)}% su ${s.attempts} tentativi.`);
                else alert(`${char}: Nessun dato registrato.`);
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
            const typeCfg = window.COURSE_TYPES[session.type] || { labelIt: 'Riposo', color: '#999' };
            const typeSpan = document.createElement('b');
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
    for(let i=1; i<=4; i++) {
        const el = document.getElementById('wizardStep'+i);
        if(el) el.style.display = (i === step) ? 'block' : 'none';
    }
    if (step === 4) {
        window.updateWizardDurationsPreview();
        if (els.wizardMinZ2) els.wizardMinZ2.oninput = window.updateWizardDurationsPreview;
    }
};

window.updateWizardDurationsPreview = function() {
    const z2 = parseInt(els.wizardMinZ2?.value) || 10;
    const work = Math.round(z2 * (20/30));
    const long = Math.round(z2 * (50/30));
    const preview = document.getElementById('wizardDurationsPreview');
    if (preview) preview.textContent = `Base: ${z2} min | Lavoro: ${work} min | Lungo: ${long} min`;
};

window.finishWizard = function() {
    const z2 = parseInt(els.wizardMinZ2?.value) || 10;
    const startLesson = parseInt(els.wizardStartLesson?.value) || 2;

    window.courseData.active_plan = true;
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
    window.renderCourseTabView();
    showToast("Corso attivato con successo! 🚀");
};

window.initCourseChat = function() {
    if (!db) return;
    const chatRef = db.ref('courseChat');
    if (typeof window.setupChat === 'function') window.setupChat(chatRef, 'courseChatMessages', null);

    if (els.sendCourseChatBtn && els.courseChatInput) {
        els.sendCourseChatBtn.onclick = () => {
            const txt = els.courseChatInput.value.trim();
            if (!txt) return;
            chatRef.push({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
            els.courseChatInput.value = '';
        };
        els.courseChatInput.onkeypress = (e) => { if (e.key === 'Enter') els.sendCourseChatBtn.click(); };
    }
    if (els.clearCourseChatBtn) {
        els.clearCourseChatBtn.onclick = () => {
            if (confirm("Vuoi cancellare la cronologia della Radio-Aula?")) chatRef.remove();
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

    if (els.btnTabSavePlan) {
        els.btnTabSavePlan.onclick = () => {
            const z2 = parseInt(els.courseTabMinZ2.value) || 10;
            window.courseData.progress.current_lesson = parseInt(els.courseTabLessonInput.value) || 2;
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
                window.courseData = window.getDefaultCourseData();
                window.saveCourseState();
                window.renderCourseTabView();
                showToast("Corso abbandonato.");
            }
        };
    }

    if (els.btnTabStartCourseSession) {
        els.btnTabStartCourseSession.onclick = () => {
             const todayIdx = (new Date().getDay() + 6) % 7;
             const session = window.courseData.weekly_schedule[todayIdx];
             if (!session || session.type === 'REST') return alert("Oggi è previsto riposo!");
             if (session.completed) return alert("Allenamento completato!");

             const todayStr = new Date().toISOString().split('T')[0];
             if (!window.courseData.current_day_session || window.courseData.current_day_session.date !== todayStr) {
                 let duration = 15;
                 if (session.type === 'Z2') duration = window.courseData.settings.minutes_z2;
                 else if (session.type === 'WORK') duration = window.courseData.settings.minutes_work;
                 else if (session.type === 'LONG') duration = window.courseData.settings.minutes_long;

                 window.courseData.current_day_session = {
                     type: session.type, total_seconds: duration * 60,
                     remaining_seconds: duration * 60, completed: false, date: todayStr
                 };
                 window.saveCourseState();
             }

             currentMode = 'course';
             isSinglePlayer = true;
             currentWpm = parseInt(window.courseData.settings.start_wpm);
             roomCode = "COURSE_" + myId;
             db.ref('rooms/' + roomCode).set({
                 status: 'countdown', type: 'single', mode: 'course', wpm: currentWpm, tone: 600,
                 createdAt: firebase.database.ServerValue.TIMESTAMP, hostId: myId
             }).then(() => window.joinRoomLogic?.(false));
        };
    }

    if (els.btnPlayCourseNow) {
        els.btnPlayCourseNow.onclick = () => {
            if (els.courseSessionModal) els.courseSessionModal.style.display = 'none';
            if (els.btnTabStartCourseSession) els.btnTabStartCourseSession.click();
        };
    }
};

setTimeout(window.attachCourseUIListeners, 2000);
