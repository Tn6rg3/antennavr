// game4/course/game.js

window.KOCH_SEQUENCE = "KMRSUAPTLOWI.NJEF0YV,,G5/Q9ZH38B?427C1D6X".split("");

let courseData = null;
window.currentSubTab = 'dash';

window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.db && window.myId) {
            loadCourseState();
            window.updateUI();
            initTransmissionManager();
        }
    }, 500);
});

window.updateUI = function() {
    const t = window.i18n[window.currentLang] || window.i18n.it;
    document.getElementById('txt_course_title').textContent = "📻 " + (t.course || "Corso");
    document.getElementById('btnCourseSubTabDash').textContent = "📊 " + (t.course_tab_dash || "Dashboard");
    document.getElementById('btnCourseSubTabTx').textContent = "📻 " + (t.course_tab_tx || "Trasmissione");
    document.getElementById('btnCourseSubTabTutor').textContent = "🎓 " + (t.course_tab_tutor || "Tutor");
    document.getElementById('btn_close').textContent = t.chat_close || "Chiudi";
};

function loadCourseState() {
    db.ref(`users/${myId}/course`).on('value', snap => {
        courseData = snap.val() || { active_plan: false };
        renderCourseUI();
    });
}

function renderCourseUI() {
    const dash = document.getElementById('courseTabActiveView');
    const prompt = document.getElementById('courseTabInitialPrompt');
    if (courseData.active_plan) {
        dash.style.display = 'flex';
        prompt.style.display = 'none';
        const isTutor = courseData.role === 'tutor';
        document.getElementById('btnCourseSubTabTutor').style.display = isTutor ? 'block' : 'none';
        switchCourseSubTab(window.currentSubTab);
    } else {
        dash.style.display = 'none';
        prompt.style.display = 'block';
    }
}

window.switchCourseSubTab = function(tab) {
    window.currentSubTab = tab;
    document.getElementById('courseTabDashboardView').style.display = tab === 'dash' ? 'block' : 'none';
    document.getElementById('courseTransmissionView').style.display = tab === 'tx' ? 'block' : 'none';
    document.getElementById('courseTutorPanel').style.display = tab === 'tutor' ? 'block' : 'none';

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
    if (tab === 'dash') {
        document.getElementById('btnCourseSubTabDash').classList.add('active-tab');
        renderDashboard();
    } else if (tab === 'tx') {
        document.getElementById('btnCourseSubTabTx').classList.add('active-tab');
    } else if (tab === 'tutor') {
        document.getElementById('btnCourseSubTabTutor').classList.add('active-tab');
        renderTutorPanel();
    }
};

function renderDashboard() {
    const heatmap = document.getElementById('courseTabHeatmap');
    const lesson = courseData.progress?.current_lesson || 2;
    heatmap.innerHTML = KOCH_SEQUENCE.map((c, i) => {
        const stats = courseData.progress?.char_stats?.[c] || { attempts: 0, errors: 0 };
        const acc = stats.attempts > 0 ? (stats.attempts - stats.errors) / stats.attempts : 0;
        const color = i >= lesson ? '#444' : (acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f');
        return `<div class="heatmap-box" style="background:${color}; opacity:${i < lesson ? 1 : 0.3}">${c}</div>`;
    }).join('');

    const plan = document.getElementById('courseTabWeeklyPlan');
    const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    plan.innerHTML = (courseData.weekly_schedule || []).map((day, i) => {
        const type = day.sessions?.[0]?.type || 'REST';
        return `<div style="display:flex; justify-content:space-between; padding:4px; border-bottom:1px solid rgba(0,0,0,0.05);"><span>${dayNames[i]}</span> <b>${type}</b></div>`;
    }).join('');
}

// Transmission Logic
let isDown = false;
function initTransmissionManager() {
    const key = document.getElementById('morseKeyBtn');
    if (!key) return;
    const down = () => { if (isDown) return; isDown = true; window.startTone(); };
    const up = () => { if (!isDown) return; isDown = false; window.stopTone(); };
    key.addEventListener('mousedown', down);
    key.addEventListener('touchstart', (e) => { e.preventDefault(); down(); });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
}

window.startTxSession = () => {
    document.getElementById('btnStartTxSession').style.display = 'none';
    document.getElementById('btnStopTxSession').style.display = 'block';
    pickNextTxTarget();
};

window.stopTxSession = () => {
    document.getElementById('btnStartTxSession').style.display = 'block';
    document.getElementById('btnStopTxSession').style.display = 'none';
    document.getElementById('txTargetChar').textContent = '?';
};

function pickNextTxTarget() {
    const chars = KOCH_SEQUENCE.slice(0, courseData.progress?.current_lesson || 2);
    const target = chars[Math.floor(Math.random() * chars.length)];
    document.getElementById('txTargetChar').textContent = target;
    window.playMorseAudio(target, 20);
}

// Tutor Panel
function renderTutorPanel() {
    const list = document.getElementById('tutorStudentList');
    list.innerHTML = 'Caricamento...';
    db.ref('courseActiveEnrollments').once('value', async snap => {
        list.innerHTML = '';
        const enrollments = snap.val() || {};
        let found = false;
        for (let uid in enrollments) {
            const enroll = enrollments[uid];
            if (enroll.role === 'corsista') {
                const uSnap = await db.ref(`users/${uid}/course`).once('value');
                const uCourse = uSnap.val() || {};
                if (uCourse.tutor_id === myId) {
                    found = true;
                    const row = document.createElement('div');
                    row.className = 'box-panel';
                    row.style.cursor = 'pointer';
                    row.innerHTML = `<b>👤 ${enroll.name}</b><br><small>Lezione: ${uCourse.progress?.current_lesson || 2} | Acc: ${Math.round((uCourse.progress?.last_z2_accuracy || 0)*100)}%</small>`;
                    row.onclick = () => showStudentStats(uid, enroll.name);
                    list.appendChild(row);
                }
            }
        }
        if (!found) list.innerHTML = '<p style="text-align:center; opacity:0.5;">Nessun allievo assegnato.</p>';
    });
}

async function showStudentStats(uid, name) {
    const modal = document.getElementById('tutorStudentStatsModal');
    document.getElementById('tutorStudentStatsTitle').textContent = `Statistiche: ${name}`;
    modal.style.display = 'flex';

    const uSnap = await db.ref(`users/${uid}`).once('value');
    const u = uSnap.val() || {};
    const p = u.course?.progress || {};

    const hm = document.getElementById('tutorStudentHeatmap');
    hm.innerHTML = window.KOCH_SEQUENCE.map((c, i) => {
        const stats = p.char_stats?.[c] || { attempts: 0, errors: 0 };
        const acc = stats.attempts > 0 ? (stats.attempts - stats.errors) / stats.attempts : 0;
        const color = i >= (p.current_lesson || 2) ? '#444' : (acc >= 0.9 ? '#4caf50' : acc >= 0.7 ? '#ff9800' : '#d32f2f');
        return `<div class="heatmap-box" style="background:${color}; opacity:${i < (p.current_lesson || 2) ? 1 : 0.3}">${c}</div>`;
    }).join('');

    const hs = document.getElementById('tutorStudentHistory');
    const history = Object.values(u.history || {}).filter(h => h.mode === 'course').slice(-10).reverse();
    hs.innerHTML = history.length ? history.map(h => `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #333;"><span>${new Date(h.date).toLocaleDateString()}</span><b>${h.score} XP</b></div>`).join('') : "Nessuna sessione.";

    document.getElementById('tutorStudentTrend').textContent = `Richiami: ${p.reminders_count || 0}/3. Lezione attuale: ${p.current_lesson || 2}`;
}

window.startCourseWizard = () => {
    // Simplified wizard for this demo
    if (confirm("Attivare piano di studi standard (3 giorni)?")) {
        const newData = {
            active_plan: true, role: 'corsista', enrollment_date: new Date().toISOString(),
            settings: { days_per_week: 3, start_wpm: 15, farnsworth_wpm: 12, group_spacing: "3.0", minutes_z2: 10 },
            progress: { current_lesson: 2, char_stats: {}, last_session_date: "" },
            weekly_schedule: Array(7).fill({ sessions: [{ type: 'REST' }] })
        };
        [0, 3, 5].forEach(i => newData.weekly_schedule[i] = { sessions: [{ type: i === 5 ? 'LONG' : 'Z2' }] });
        db.ref(`users/${myId}/course`).set(newData);
    }
};
