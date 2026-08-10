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
    window.loadCourseState();
};

window.loadCourseState = async function() {
    if (!myId) return;
    const snap = await db.ref(`users/${myId}/course`).once('value');
    window.courseData = snap.val() || window.getDefaultCourseData();
    window.updateCourseUI();
};

window.getDefaultCourseData = function() {
    return {
        active_plan: false,
        settings: {
            days_per_week: 3,
            start_wpm: 20,
            farnsworth_wpm: 12,
            group_spacing: "2.0",
            minutes_z2: 10,
            minutes_work: 15,
            minutes_long: 30
        },
        progress: {
            current_lesson: 2,
            weekly_completed_days: 0,
            last_session_date: "",
            total_xp: 0,
            char_stats: {},
            last_z2_accuracy: 1.0 // Inizializzato a 100%
        },
        current_day_session: null
    };
};

window.saveCourseState = function() {
    if (!myId || !window.courseData) return;
    db.ref(`users/${myId}/course`).set(window.courseData);
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
        let totalWeight = weights.reduce((acc, w) => acc + w.weight, 0);
        let random = Math.random() * totalWeight;
        for (let w of weights) {
            random -= w.weight;
            if (random <= 0) {
                // Limite: max 3 caratteri uguali per gruppo
                const count = (group.match(new RegExp(w.char, "g")) || []).length;
                if (count < 3) {
                    group += w.char;
                    break;
                } else {
                    // Se troppo ripetuto, riprova con un altro estraendo un nuovo random
                    totalWeight -= w.weight;
                    random = Math.random() * totalWeight;
                    continue;
                }
            }
        }
        // Fallback se il loop sopra fallisce per filtri
        if (group.length <= i) group += activeChars[Math.floor(Math.random() * activeChars.length)];
    }
    return group;
};

window.startCourseSessionSequence = function() {
    window.showScreen('gameArea');
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Sessione Corso";

    // Inizializziamo il timer della sessione
    window.updateCourseTimerUI();
    courseSessionTimer = setInterval(() => {
        if (!gameRunning || !window.courseData.current_day_session) return;

        window.courseData.current_day_session.remaining_seconds--;
        window.updateCourseTimerUI();

        if (window.courseData.current_day_session.remaining_seconds <= 0) {
            clearInterval(courseSessionTimer);
            window.finishCourseSession();
        }
    }, 1000);

    setTimeout(() => { if (els.permanentGameInput) els.permanentGameInput.focus(); }, 200);
    setTimeout(() => { if (gameRunning) window.playNextCourseGroup(); }, 800);
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

    if (session.type === 'WORK') {
        const bonus = lastAccuracy >= 1.0 ? 3 : lastAccuracy >= 0.9 ? 2 : 0;
        return baseWpm + bonus;
    }

    if (session.type === 'LONG') {
        const total = session.total_seconds;
        const remaining = session.remaining_seconds;
        const elapsed = total - remaining;

        // Split 1/3 Base, 1/3 Work Logic, 1/3 Base
        if (elapsed < total / 3) return baseWpm;
        if (elapsed < (2 * total) / 3) {
            const bonus = lastAccuracy >= 1.0 ? 3 : lastAccuracy >= 0.9 ? 2 : 0;
            return baseWpm + bonus;
        }
        return baseWpm;
    }

    return baseWpm;
};

window.playNextCourseGroup = function() {
    if (!gameRunning || !isCourseMode) return;
    inputActive = true;
    const group = window.generateAdaptiveGroup();
    gameWords[wordIndex] = group;

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
    if (window.courseData.current_day_session.type === 'Z2') {
        // Calcolo accuratezza sessione per influenzare i prossimi 'Work'
        const stats = window.courseData.progress.char_stats || {};
        const activeChars = window.KOCH_SEQUENCE.slice(0, window.courseData.progress.current_lesson);
        let totalAttempts = 0, totalErrors = 0;
        activeChars.forEach(char => {
            const s = stats[char] || { attempts: 0, errors: 0 };
            totalAttempts += s.attempts;
            totalErrors += s.errors;
        });
        window.courseData.progress.last_z2_accuracy = totalAttempts > 0 ? (totalAttempts - totalErrors) / totalAttempts : 1.0;
    }

    window.courseData.current_day_session.completed = true;
    window.courseData.current_day_session.remaining_seconds = 0;

    // Segniamo come completato nel piano settimanale
    const todayIdx = (new Date().getDay() + 6) % 7; // Lunedì = 0
    if (window.courseData.weekly_schedule[todayIdx]) {
        window.courseData.weekly_schedule[todayIdx].completed = true;
    }

    // --- LOGICA DI AVANZAMENTO (KOCH) ---
    const stats = window.courseData.progress.char_stats || {};
    const currentLesson = window.courseData.progress.current_lesson;
    const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);

    let canAdvance = true;
    activeChars.forEach(char => {
        const s = stats[char] || { attempts: 0, errors: 0 };
        if (s.attempts < 50) canAdvance = false; // Serve un campione minimo
        else {
            const accuracy = (s.attempts - s.errors) / s.attempts;
            if (accuracy < 0.9) canAdvance = false;
        }
    });

    if (canAdvance && currentLesson < window.KOCH_SEQUENCE.length) {
        window.courseData.progress.current_lesson++;
        alert(`CONGRATULAZIONI! Hai dominato la lezione attuale.\nAggiunto nuovo carattere: ${window.KOCH_SEQUENCE[currentLesson]}`);
    }

    window.saveCourseState();
    alert("Sessione completata! Ottimo lavoro.");
    window.finishGame();
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
    });
};

window.checkCourseStartupNotification = function() {
    if (!window.courseData || !window.courseData.active_plan) return;

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
