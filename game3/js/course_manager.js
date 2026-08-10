// js/course_manager.js

window.KOCH_SEQUENCE = "KMRSUAPTLOWI.NJEF0YV,,G5/Q9ZH38B?427C1D6X".split("");

window.COURSE_TYPES = {
    Z2: { id: 'Z2', labelIt: 'Base (Z2)', labelEn: 'Base (Z2)', color: '#4caf50', weight: 0.3 },
    WORK: { id: 'WORK', labelIt: 'Lavoro (Nuovi)', labelEn: 'Work (New)', color: '#ff9800', weight: 0.2 },
    LONG: { id: 'LONG', labelIt: 'Lungo (Full)', labelEn: 'Long (Full)', color: '#9c27b0', weight: 0.5 }
};

const STORAGE_COURSE_STATE = "cwgame_course_state";

window.initCourseManager = function() {
    console.log("Course: Initializing...");
    if (!myId || !db) {
        console.warn("Course Init: Missing Auth or DB, retrying in 500ms...");
        setTimeout(window.initCourseManager, 500);
        return;
    }
    window.loadCourseState().then(() => {
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
        const data = snap.val();

        console.log("Course Manager: Loaded data from Firebase:", data);

        if (data) {
            window.courseData = data;
        } else {
            window.courseData = window.getDefaultCourseData();
        }

        window.updateCourseUI();

        // Aggiorniamo il registro iscritti all'accesso per sicurezza
        if (window.courseData && window.courseData.active_plan === true) {
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

    // Salviamo lo stato locale dell'utente
    db.ref(`users/${myId}/course`).set(window.courseData).then(() => {
        console.log("Course Manager: State saved successfully.");
        // Gestione del registro iscritti (per contatore preciso)
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

window.updateCourseUI = function() {
    // Verrà implementata in course_ui.js o qui per semplicità iniziale
    const btn = document.getElementById('btnOpenCourse');
    if (btn) btn.style.display = 'block';
};

window.generateAdaptiveGroup = function() {
    if (!window.courseData) return "ERROR";
    const currentLesson = window.courseData.progress.current_lesson;
    const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);
    const sessionType = window.courseData.current_day_session?.type || 'LONG';

    // In Z2 usiamo distribuzione uniforme per relax
    if (sessionType === 'Z2') {
        let group = "";
        for(let i=0; i<5; i++) group += activeChars[Math.floor(Math.random() * activeChars.length)];
        return group;
    }

    // Calcolo pesi basato su errori (Weighted Random)
    const stats = window.courseData.progress.char_stats || {};
    let weights = activeChars.map(char => {
        const charStat = stats[char] || { attempts: 0, errors: 0 };
        let weight = 1.0;
        if (charStat.attempts > 5) {
            const errorRate = charStat.errors / charStat.attempts;
            weight += errorRate * 5; // Aumenta il peso fino a 6x se l'errore è 100%
        }
        return { char, weight };
    });

    // Se siamo in WORK, diamo un peso enorme all'ULTIMO carattere aggiunto (la novità)
    if (sessionType === 'WORK') {
        const lastChar = activeChars[activeChars.length - 1];
        weights.find(w => w.char === lastChar).weight *= 3;
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

            // Limite: max 3 caratteri uguali per gruppo
            // Usiamo una versione sicura per la regex che gestisce caratteri speciali
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

    // Stima della durata di un gruppo di 5 caratteri (in secondi)
    // Formula approssimativa: (5 caratteri * 50 unit/parola / 1.2 wpm) + spacing
    const estimatedSecPerGroup = (60 / farnsworth) + (spacing * 2);

    // Calcoliamo quanti gruppi servono per coprire l'intera durata + 50% extra di buffer
    const numGroups = Math.ceil((session.total_seconds / estimatedSecPerGroup) * 1.5);

    console.log(`Course: Pre-generating ${numGroups} groups for session...`);

    gameWords = [];
    for (let i = 0; i < numGroups; i++) {
        gameWords.push(window.generateAdaptiveGroup());
    }
    requestedWordCount = gameWords.length;
};

let courseSessionTimer = null;
window.startCourseSessionSequence = function() {
    window.showScreen('gameArea');
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

        // Se siamo in pausa o l'app è in background, non scaliamo il tempo rimanente
        if (window.courseIsPaused || document.hidden) return;

        window.courseData.current_day_session.remaining_seconds--;
        window.updateCourseTimerUI();

        if (window.courseSessionPauseDuration > 0 && Date.now() >= window.courseSessionNextPauseTs) {
            window.coursePausePending = true;
        }

        if (window.courseData.current_day_session.remaining_seconds <= 0) {
            clearInterval(courseSessionTimer);
            window.finishCourseSession();
        }
    }, 1000);

    setTimeout(() => { if (els.permanentGameInput) els.permanentGameInput.focus(); }, 200);
    setTimeout(() => { if (gameRunning) window.playNextCourseGroup(); }, 800);
};

let coursePauseInterval = null;
window.triggerCoursePause = function() {
    if (coursePauseInterval) clearInterval(coursePauseInterval);

    window.courseIsPaused = true;
    inputActive = false;
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    if (els.permanentGameInput) els.permanentGameInput.value = "";

    let timeLeft = window.courseSessionPauseDuration;
    const updatePauseUI = () => {
        if (els.scoreDisplay) els.scoreDisplay.innerHTML = `<span style="color:#ff9800">☕ PAUSA: ${timeLeft}s</span>`;
    };

    updatePauseUI();
    coursePauseInterval = setInterval(() => {
        if (!gameRunning || !isCourseMode) {
            clearInterval(coursePauseInterval);
            return;
        }

        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(coursePauseInterval);
            window.courseIsPaused = false;
            window.courseSessionNextPauseTs = Date.now() + (window.courseSessionPauseInterval * 1000);
            if (els.scoreDisplay) els.scoreDisplay.textContent = "Sessione Corso";
            inputActive = true;
            if (gameRunning) {
                if (els.permanentGameInput) {
                    els.permanentGameInput.focus();
                    els.permanentGameInput.value = "";
                }
                window.playNextCourseGroup();
            }
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

    // Calcoliamo la velocità dinamica per il display
    let displayWpm = currentWpm;
    if (isCourseMode) {
        displayWpm = window.calculateDynamicCourseWpm();
    }

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

        // Split 1/3 Base, 1/3 Work Logic, 1/3 Base
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

    // Se per qualche motivo il buffer è vuoto in questa posizione, generiamo al volo
    if (!group) {
        group = window.generateAdaptiveGroup();
        gameWords[wordIndex] = group;
    }

    const charWpm = window.calculateDynamicCourseWpm();
    const farnsworthWpm = parseInt(window.courseData.settings.farnsworth_wpm);
    const groupSpacingMult = parseFloat(window.courseData.settings.group_spacing || 2.0);

    // Configuriamo l'audio engine
    window.charSpaceWpm = farnsworthWpm;
    window.wordSpaceMult = groupSpacingMult;
    currentWpm = charWpm;

    if (typeof playMorseAudio === 'function') {
        // Aggiungiamo un piccolo delay iniziale per non sovrapporsi all'invio automatico
        setTimeout(() => {
            if (gameRunning && isCourseMode) playMorseAudio(group, charWpm);
        }, 300);
    }
    lastWordStartTime = Date.now();
};

window.finishCourseSession = function() {
    // Calcolo statistiche sessione corrente per il riepilogo
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
    window.courseData.current_day_session.remaining_seconds = 0;

    // Segniamo come completato nel piano settimanale
    const todayIdx = (new Date().getDay() + 6) % 7;
    if (window.courseData.weekly_schedule[todayIdx]) {
        window.courseData.weekly_schedule[todayIdx].completed = true;
    }

    // --- LOGICA DI AVANZAMENTO (KOCH) ---
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

    // --- MESSAGGIO MOTIVAZIONALE DI FINE SESSIONE ---
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
        // Controlliamo se ha fatto tutti i giorni
        const completedCount = window.courseData.weekly_schedule.filter(s => s.completed || s.type === 'REST').length;
        if (completedCount === 7) {
            if (confirm("Settimana completata con successo! 🏆\nVuoi aumentare il volume di allenamento (minuti) del 10% per la prossima settimana?")) {
                window.courseData.settings.minutes_z2 = Math.round(window.courseData.settings.minutes_z2 * 1.1);
                window.courseData.settings.minutes_work = Math.round(window.courseData.settings.minutes_work * 1.1);
                window.courseData.settings.minutes_long = Math.round(window.courseData.settings.minutes_long * 1.1);
            }
        }

        // Reset per la nuova settimana
        window.courseData.progress.last_weekly_review = currentWeek;
        window.generateWeeklySchedule();
    }
};

// Integriamo il controllo settimanale nell'init
window.initCourseManager = function() {
    console.log("Course: Initializing...");
    window.loadCourseState().then(() => {
        window.checkWeeklyReview();
        window.checkCourseStartupNotification();
        window.listenToCourseEnrollment();
    });
};

window.listenToCourseEnrollment = function() {
    console.log("Course: Listening to dynamic enrollment count...");
    // Ascoltiamo il registro reale degli iscritti attivi
    const enrollmentRef = db.ref('courseActiveEnrollments');
    enrollmentRef.on('value', snap => {
        const enrollments = snap.val() || {};
        const count = Object.keys(enrollments).length;
        console.log("Course: Dynamic enrollment count:", count);

        const badge = document.getElementById('courseEnrollmentBadgeGlobal');
        if (badge) {
            badge.innerText = count;
            if (count > 0) {
                badge.style.setProperty('display', 'flex', 'important');
                badge.classList.add('badge-active');
            } else {
                badge.style.display = 'none';
                badge.classList.remove('badge-active');
            }
        }

        // Aggiorniamo anche il contatore testuale in appConfig per retrocompatibilità se serve
        db.ref('appConfig/courseEnrollmentCount').set(count);
    });
};

window.checkCourseStartupNotification = function() {
    // Se il piano non è attivo, usciamo subito per evitare popup fantasma
    if (!window.courseData || window.courseData.active_plan !== true) {
        console.log("Course: No active plan found, skipping startup notification.");
        return;
    }

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

// --- LISTENER PULSANTI ---
window.attachCourseEventListeners = function() {
    const btnStart = document.getElementById('btnStartCourseSession');
    if (btnStart) {
        btnStart.onclick = () => {
            if (!window.courseData.weekly_schedule) window.generateWeeklySchedule();
            const todayIdx = (new Date().getDay() + 6) % 7;
            const session = window.courseData.weekly_schedule[todayIdx];

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

            document.getElementById('courseModal').style.display = 'none';

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
    }
};

setTimeout(window.attachCourseEventListeners, 2000);
