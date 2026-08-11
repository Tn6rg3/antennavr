// js/course_manager.js

window.KOCH_SEQUENCE = "KMRSUAPTLOWI.NJEF0YV,,G5/Q9ZH38B?427C1D6X".split("");

window.COURSE_TYPES = {
    Z2: { id: 'Z2', labelIt: 'Base (Z2)', labelEn: 'Base (Z2)', color: '#4caf50', weight: 0.3 },
    WORK: { id: 'WORK', labelIt: 'Lavoro (Nuovi)', labelEn: 'Work (New)', color: '#ff9800', weight: 0.2 },
    LONG: { id: 'LONG', labelIt: 'Lungo (Full)', labelEn: 'Long (Full)', color: '#9c27b0', weight: 0.5 }
};

window.initCourseManager = function() {
    console.log("Course: Initializing...");

    if (!myId || !db) {
        console.warn("Course Init: Missing Auth or DB, retrying in 500ms...");
        setTimeout(window.initCourseManager, 500);
        return;
    }
    window.loadCourseState().then(() => {
        console.log("Course: State loaded, rendering view...");
        window.renderCourseTabView();
        window.checkWeeklyReview();
        window.checkCourseStartupNotification();
        window.listenToCourseEnrollment();
    });
};

window.loadCourseState = async function() {
    if (!myId || !db) return;
    try {
        const snap = await db.ref(`users/${myId}/course`).once('value');
        let data = snap.val();

        console.log("Course Manager: Raw data from Firebase:", data);

        if (data) {
            // Normalizzazione flag active_plan (può essere stringa o boolean)
            if (data.active_plan === "true") data.active_plan = true;
            if (data.active_plan === "false") data.active_plan = false;
            window.courseData = data;
        } else {
            window.courseData = window.getDefaultCourseData();
        }

        // Sincronizzazione registro iscritti
        if (window.courseData.active_plan === true) {
            db.ref('courseActiveEnrollments/' + myId).set({
                name: myName,
                ts: firebase.database.ServerValue.TIMESTAMP
            });
        }
    } catch (e) {
        console.error("Course Manager: Error loading course state:", e);
    }
};

window.getDefaultCourseData = function() {
    return {
        active_plan: false,
        settings: {
            days_per_week: 3,
            start_wpm: 15,
            farnsworth_wpm: 12,
            group_spacing: "3.0",
            pause_interval: 60,
            pause_duration: 10,
            minutes_z2: 10,
            minutes_work: 7,
            minutes_long: 17
        },
        progress: {
            current_lesson: 2,
            weekly_completed_days: 0,
            last_session_date: "",
            total_xp: 0,
            char_stats: {},
            last_z2_accuracy: 1.0
        },
        current_day_session: null
    };
};

window.saveCourseState = function() {
    if (!myId || !db || !window.courseData) {
        console.error("Course Manager: Cannot save, missing context.");
        return;
    }

    console.log("Course Manager: Saving state to Firebase...", window.courseData);

    db.ref(`users/${myId}/course`).set(window.courseData).then(() => {
        console.log("Course Manager: State saved successfully.");
        const activeRef = db.ref('courseActiveEnrollments/' + myId);
        if (window.courseData.active_plan === true) {
            activeRef.set({
                name: myName,
                ts: firebase.database.ServerValue.TIMESTAMP
            });
        } else {
            activeRef.remove();
        }
    }).catch(err => {
        console.error("Course Manager: Save error:", err);
    });
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

window.generateAdaptiveGroup = function() {
    if (!window.courseData) return "ERROR";
    const currentLesson = window.courseData.progress.current_lesson;
    const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);
    const sessionType = window.courseData.current_day_session?.type || 'LONG';

    if (sessionType === 'Z2') {
        let group = "";
        for(let i=0; i<5; i++) group += activeChars[Math.floor(Math.random() * activeChars.length)];
        return group;
    }

    const stats = window.courseData.progress.char_stats || {};
    let weights = activeChars.map(char => {
        const charStat = stats[char] || { attempts: 0, errors: 0 };
        let weight = 1.0;
        if (charStat.attempts > 5) {
            const errorRate = charStat.errors / charStat.attempts;
            weight += errorRate * 5;
        }
        return { char, weight };
    });

    if (sessionType === 'WORK') {
        const lastChar = activeChars[activeChars.length - 1];
        const lastWeight = weights.find(w => w.char === lastChar);
        if (lastWeight) lastWeight.weight *= 3;
    }

    let group = "";
    for (let i = 0; i < 5; i++) {
        let currentWeights = [...weights];
        let found = false;

        while (currentWeights.length > 0) {
            let totalWeight = currentWeights.reduce((acc, w) => acc + w.weight, 0);
            let random = Math.random() * totalWeight;
            let selectedIdx = -1;

            for (let j = 0; j < currentWeights.length; j++) {
                random -= currentWeights[j].weight;
                if (random <= 0) {
                    selectedIdx = j;
                    break;
                }
            }

            if (selectedIdx === -1) selectedIdx = currentWeights.length - 1;
            const selected = currentWeights[selectedIdx];

            const safeChar = selected.char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const count = (group.match(new RegExp(safeChar, "g")) || []).length;

            if (count < 3) {
                group += selected.char;
                found = true;
                break;
            } else {
                currentWeights.splice(selectedIdx, 1);
            }
        }

        if (!found) group += activeChars[Math.floor(Math.random() * activeChars.length)];
    }
    return group;
};

window.preGenerateCourseGroups = function() {
    if (!window.courseData || !window.courseData.current_day_session) return;

    const session = window.courseData.current_day_session;
    const farnsworth = parseInt(window.courseData.settings.farnsworth_wpm) || 12;
    const spacing = parseFloat(window.courseData.settings.group_spacing) || 3.0;

    const estimatedSecPerGroup = (60 / farnsworth) + (spacing * 2);
    const numGroups = Math.ceil((session.total_seconds / estimatedSecPerGroup) * 1.5);

    console.log(`Course: Pre-generating ${numGroups} groups for session...`);

    gameWords = [];
    for (let i = 0; i < numGroups; i++) {
        gameWords.push(window.generateAdaptiveGroup());
    }
    requestedWordCount = gameWords.length;
};

window.startCourseSessionSequence = function() {
    window.showScreen('gameArea');

    // RESET UI E INPUT PER EVITARE RESIDUI
    if (els.permanentGameInput) {
        els.permanentGameInput.value = "";
        els.permanentGameInput.disabled = false;
        setTimeout(() => els.permanentGameInput.focus(), 500);
    }
    if (els.tableBody) els.tableBody.innerHTML = "";
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Sessione Corso";

    if (courseSessionTimer) clearInterval(courseSessionTimer);

    window.courseSessionTotalSec = window.courseData.current_day_session.total_seconds;
    window.courseSessionPauseDuration = parseInt(window.courseData.settings.pause_duration) || 0;
    window.courseSessionPauseInterval = parseInt(window.courseData.settings.pause_interval) || 60;
    window.courseSessionNextPauseTs = Date.now() + (window.courseSessionPauseInterval * 1000);
    window.courseIsPaused = false;
    window.coursePausePending = false;

    window.preGenerateCourseGroups();
    wordIndex = 0;

    window.updateCourseTimerUI();
    courseSessionTimer = setInterval(() => {
        if (!gameRunning || !window.courseData.current_day_session) return;

        if (window.courseIsPaused || document.hidden) return;

        window.courseData.current_day_session.remaining_seconds--;
        window.updateCourseTimerUI();

        // Se scade l'intervallo, segnaliamo che la prossima pausa è pronta
        if (window.courseSessionPauseDuration > 0 && Date.now() >= window.courseSessionNextPauseTs) {
            window.coursePausePending = true;
        }

        if (window.courseData.current_day_session.remaining_seconds <= 0) {
            clearInterval(courseSessionTimer);
            window.finishCourseSession();
        }
    }, 1000);

    setTimeout(() => { if (gameRunning) window.playNextCourseGroup(); }, 800);
};

window.triggerCoursePause = function() {
    console.log("Course: Triggering Pause...");
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    window.courseIsPaused = true;
    inputActive = false;

    if (els.permanentGameInput) {
        els.permanentGameInput.value = "";
        els.permanentGameInput.placeholder = "PAUSA CAFFÈ...";
        els.permanentGameInput.disabled = true;
    }

    let timeLeft = window.courseSessionPauseDuration;
    const updatePauseUI = () => {
        if (els.scoreDisplay) els.scoreDisplay.innerHTML = `<span style="color:#ff9800; font-weight:bold; animation: pulse 1s infinite;">☕ PAUSA: ${timeLeft}s</span>`;
    };

    updatePauseUI();
    let pauseInterval = setInterval(() => {
        if (!gameRunning || !isCourseMode) {
            clearInterval(pauseInterval);
            return;
        }

        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(pauseInterval);
            window.courseIsPaused = false;
            window.courseSessionNextPauseTs = Date.now() + (window.courseSessionPauseInterval * 1000);

            if (els.scoreDisplay) els.scoreDisplay.textContent = "Sessione Corso";
            if (els.permanentGameInput) {
                els.permanentGameInput.disabled = false;
                els.permanentGameInput.placeholder = "Digita qui...";
                els.permanentGameInput.focus();
            }

            inputActive = true;
            if (gameRunning) window.playNextCourseGroup();
        } else {
            updatePauseUI();
        }
    }, 1000);
};

window.updateCourseTimerUI = function() {
    if (!window.courseData.current_day_session || !els.wpmDisplay) return;
    const s = window.courseData.current_day_session.remaining_seconds;
    const min = Math.floor(s / 60);
    const sec = s % 60;

    let displayWpm = window.calculateDynamicCourseWpm();
    els.wpmDisplay.textContent = `⏱️ ${min}:${sec.toString().padStart(2, '0')} | WPM: ${displayWpm}`;
};

window.calculateDynamicCourseWpm = function() {
    if (!window.courseData || !window.courseData.current_day_session) return currentWpm;
    const session = window.courseData.current_day_session;
    const baseWpm = parseInt(window.courseData.settings.start_wpm);
    const lastAccuracy = window.courseData.progress.last_z2_accuracy || 0;

    if (session.type === 'Z2') return baseWpm;

    const calculateBonus = (acc) => {
        if (acc >= 1.0) return 3;
        if (acc >= 0.9) return 2;
        if (acc >= 0.8) return 1;
        return 0;
    };

    if (session.type === 'WORK') {
        return baseWpm + calculateBonus(lastAccuracy);
    }

    if (session.type === 'LONG') {
        const total = session.total_seconds;
        const remaining = session.remaining_seconds;
        const elapsed = total - remaining;

        if (elapsed < total / 3) return baseWpm;
        if (elapsed < (2 * total) / 3) {
            return baseWpm + calculateBonus(lastAccuracy);
        }
        return baseWpm;
    }

    return baseWpm;
};

window.playNextCourseGroup = function() {
    if (!gameRunning || !isCourseMode) return;
    if (wordIndex >= requestedWordCount) return window.finishCourseSession();

    inputActive = true;
    let group = gameWords[wordIndex];
    if (!group) {
        group = window.generateAdaptiveGroup();
        gameWords[wordIndex] = group;
    }

    const charWpm = window.calculateDynamicCourseWpm();
    const farnsworthWpm = parseInt(window.courseData.settings.farnsworth_wpm);
    const groupSpacingMult = parseFloat(window.courseData.settings.group_spacing || 2.0);

    window.charSpaceWpm = farnsworthWpm;
    window.wordSpaceMult = groupSpacingMult;
    currentWpm = charWpm;

    if (typeof playMorseAudio === 'function') {
        setTimeout(() => {
            if (gameRunning && isCourseMode) playMorseAudio(group, charWpm);
        }, 300);
    }
    lastWordStartTime = Date.now();
};

window.finishCourseSession = function() {
    const stats = window.courseData.progress.char_stats || {};
    const currentLesson = window.courseData.progress.current_lesson;
    const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);
    let totalAttempts = 0, totalErrors = 0;
    let worstChars = [];

    activeChars.forEach(char => {
        const s = stats[char] || { attempts: 0, errors: 0 };
        totalAttempts += s.attempts;
        totalErrors += s.errors;
        if (s.attempts > 0 && (s.errors / s.attempts) > 0.2) {
            worstChars.push({ char, rate: Math.round((s.errors / s.attempts) * 100) });
        }
    });

    const accuracy = totalAttempts > 0 ? ((totalAttempts - totalErrors) / totalAttempts) : 1.0;

    if (window.courseData.current_day_session.type === 'Z2') {
        window.courseData.progress.last_z2_accuracy = accuracy;
    }

    window.courseData.current_day_session.completed = true;

    const todayIdx = (new Date().getDay() + 6) % 7;
    if (window.courseData.weekly_schedule && window.courseData.weekly_schedule[todayIdx]) {
        window.courseData.weekly_schedule[todayIdx].completed = true;
    }

    let canAdvance = true;
    activeChars.forEach(char => {
        const s = stats[char] || { attempts: 0, errors: 0 };
        if (s.attempts < 50 || (s.attempts - s.errors) / s.attempts < 0.9) canAdvance = false;
    });

    let advanceMsg = "";
    if (canAdvance && currentLesson < window.KOCH_SEQUENCE.length) {
        window.courseData.progress.current_lesson++;
        advanceMsg = `\n\n🚀 NUOVO CARATTERE SBLOCCATO: ${window.KOCH_SEQUENCE[window.courseData.progress.current_lesson - 1]}!`;
    }

    window.saveCourseState();

    const quotes = [
        "Ottimo lavoro! La costanza è la chiave del successo.",
        "Stai costruendo i tuoi riflessi Morse, continua così!",
        "Ogni minuto di pratica ti avvicina alla padronanza totale.",
        "Il tuo 'orecchio' sta migliorando sessione dopo sessione!",
        "Non mollare! Anche i grandi maestri hanno iniziato da qui."
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];

    let focusMsg = "";
    if (worstChars.length > 0) {
        focusMsg = `\n\nFocus per la prossima volta: ${worstChars.slice(0,3).map(c => `${c.char} (${c.rate}% err)`).join(", ")}`;
    }

    setTimeout(() => {
        const fullMsg = `🏆 SESSIONE COMPLETATA!\n\n${quote}\n\nAccuratezza: ${Math.round(accuracy * 100)}%${advanceMsg}${focusMsg}\n\nTorna domani per la prossima sfida!`;
        alert(fullMsg);
        window.finishGame();
    }, 500);
};

window.checkWeeklyReview = function() {
    if (!window.courseData || !window.courseData.active_plan) return;

    const now = new Date();
    const lastReview = window.courseData.progress.last_weekly_review || "";
    const currentWeek = window.getWeekNumber(now);

    if (lastReview !== currentWeek && window.courseData.weekly_schedule) {
        const completedCount = window.courseData.weekly_schedule.filter(s => s.completed || s.type === 'REST').length;
        if (completedCount === 7) {
            if (confirm("Settimana completata con successo! 🏆\nVuoi aumentare il volume di allenamento (minuti) del 10% per la prossima settimana?")) {
                window.courseData.settings.minutes_z2 = Math.round(window.courseData.settings.minutes_z2 * 1.1);
                window.courseData.settings.minutes_work = Math.round(window.courseData.settings.minutes_work * 1.1);
                window.courseData.settings.minutes_long = Math.round(window.courseData.settings.minutes_long * 1.1);
            }
        }
        window.courseData.progress.last_weekly_review = currentWeek;
        window.generateWeeklySchedule();
    }
};

window.listenToCourseEnrollment = function() {
    const enrollmentRef = db.ref('courseActiveEnrollments');
    enrollmentRef.on('value', snap => {
        const enrollments = snap.val() || {};
        const count = Object.keys(enrollments).length;
        const badge = document.getElementById('courseEnrollmentBadgeGlobal');
        if (badge) {
            badge.innerText = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
        db.ref('appConfig/courseEnrollmentCount').set(count);
    });
};

window.checkCourseStartupNotification = function() {
    if (!window.courseData || window.courseData.active_plan !== true) return;
    const todayIdx = (new Date().getDay() + 6) % 7;
    const session = window.courseData.weekly_schedule ? window.courseData.weekly_schedule[todayIdx] : null;

    if (session && session.type !== 'REST' && !session.completed) {
        const modal = document.getElementById('courseSessionModal');
        const text = document.getElementById('courseModalText');
        if (modal && text) {
            const typeCfg = window.COURSE_TYPES[session.type];
            const label = currentLang === 'it' ? typeCfg.labelIt : typeCfg.labelEn;
            text.innerHTML = `Oggi il tuo piano prevede una sessione di <b>${label}</b>.<br>Sei pronto per allenarti?`;
            modal.style.display = 'flex';
        }
    }
};
