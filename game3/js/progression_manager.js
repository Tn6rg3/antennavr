// js/progression_manager.js

const XP_PER_WORD = 10;
const XP_BONUS_STREAK = 5;
const XP_PER_LEVEL_BASE = 500;
const XP_GROWTH_FACTOR = 1.2;

const OPERATOR_TITLES = [
    { level: 1, it: "Recluta Morse", en: "Morse Recruit" },
    { level: 5, it: "Apprendista Segnalatore", en: "Signal Apprentice" },
    { level: 10, it: "Operatore Radio Junior", en: "Junior Radio Operator" },
    { level: 20, it: "Telegrafista Navale", en: "Naval Telegraphist" },
    { level: 35, it: "Esperto d'Intercettazione", en: "Interception Expert" },
    { level: 50, it: "Maestro del Tasto", en: "Key Master" },
    { level: 75, it: "Leggenda dell'Etere", en: "Legend of the Ether" },
    { level: 100, it: "Gran Maestro Telegrafista", en: "Grand Morse Master" }
];

window.initProgression = function() {
    if (!myId) {
        console.warn("Progression: myId not ready, retrying...");
        setTimeout(window.initProgression, 500);
        return;
    }
    db.ref(`users/${myId}/progression`).on('value', snap => {
        const data = snap.val() || { xp: 0, level: 1, dailyMissions: {} };
        window.userProgression = data;
        window.renderXPBar();
        window.checkDailyMissionsStatus();
        window.updateMissionsBadge();
    });
};

window.addXP = function(amount, reason = "") {
    if (!myId) return;
    db.ref(`users/${myId}/progression`).transaction(curr => {
        if (!curr) curr = { xp: 0, level: 1 };
        curr.xp = (curr.xp || 0) + amount;

        // Calcolo Livello (Progressione Esponenziale semplice)
        let needed = window.getXPForNextLevel(curr.level);
        while (curr.xp >= needed) {
            curr.xp -= needed;
            curr.level++;
            needed = window.getXPForNextLevel(curr.level);
            window.showLevelUpOverlay(curr.level);
        }
        return curr;
    }).then(() => {
        if (reason) console.log(`XP Added: ${amount} for ${reason}`);
    });
};

window.getXPForNextLevel = function(level) {
    return Math.floor(XP_PER_LEVEL_BASE * Math.pow(XP_GROWTH_FACTOR, level - 1));
};

window.renderXPBar = function() {
    const data = window.userProgression || { xp: 0, level: 1 };
    const needed = window.getXPForNextLevel(data.level);
    const perc = Math.min(100, (data.xp / needed) * 100);

    const titleObj = [...OPERATOR_TITLES].reverse().find(t => data.level >= t.level);
    const titleText = currentLang === 'it' ? titleObj.it : titleObj.en;

    if (els.xpBarFill) {
        els.xpBarFill.style.width = perc + "%";
    }
    if (els.userLevelDisplay) {
        els.userLevelDisplay.textContent = `Liv. ${data.level}`;
    }
    if (els.userTitleDisplay) {
        els.userTitleDisplay.textContent = titleText;
    }
    if (els.xpTextDisplay) {
        els.xpTextDisplay.textContent = `${Math.floor(data.xp)} / ${needed} XP`;
    }
};

window.showLevelUpOverlay = function(newLevel) {
    const titleObj = [...OPERATOR_TITLES].reverse().find(t => newLevel >= t.level);
    const titleText = currentLang === 'it' ? titleObj.it : titleObj.en;

    showToast(`🆙 LIVELLO SUPERATO! Sei ora Livello ${newLevel}: ${titleText}`);
    // Potremmo aggiungere un effetto grafico dedicato
};

// --- DAILY MISSIONS ---
window.generateDailyMissions = function() {
    const today = new Date().toISOString().split('T')[0];
    const missions = [
        { id: 'm1', type: 'count', target: 50, current: 0, xp: 100, it: "Indovina 50 parole totali", en: "Guess 50 total words" },
        { id: 'm2', type: 'wpm_min', target: 5, wpm: 30, current: 0, xp: 150, it: "Indovina 5 parole a >30 WPM", en: "Guess 5 words at >30 WPM" },
        { id: 'm3', type: 'streak', target: 10, current: 0, xp: 200, it: "Fai una striscia di 10 parole", en: "Get a 10 word streak" }
    ];

    db.ref(`users/${myId}/progression/dailyMissions`).once('value', snap => {
        const data = snap.val() || {};
        if (data.date !== today) {
            db.ref(`users/${myId}/progression/dailyMissions`).set({
                date: today,
                list: missions
            });
        }
    });
};

window.updateMissionProgress = function(type, value = 1) {
    if (!window.userProgression || !window.userProgression.dailyMissions) return;
    const missions = window.userProgression.dailyMissions.list;
    if (!missions) return;

    let updated = false;
    missions.forEach(m => {
        if (m.type === type && !m.completed) {
            if (type === 'streak') {
                if (value >= m.target) {
                    m.current = m.target;
                    m.completed = true;
                    window.addXP(m.xp, "Mission Completed");
                    showToast(`🎯 MISSIONE COMPIUTA: ${currentLang === 'it' ? m.it : m.en}`);
                    updated = true;
                }
            } else if (type === 'wpm_min') {
                if (value >= m.wpm) {
                    m.current++;
                    if (m.current >= m.target) {
                        m.completed = true;
                        window.addXP(m.xp, "Mission Completed");
                        showToast(`🎯 MISSIONE COMPIUTA: ${currentLang === 'it' ? m.it : m.en}`);
                    }
                    updated = true;
                }
            } else {
                m.current += value;
                if (m.current >= m.target) {
                    m.current = m.target;
                    m.completed = true;
                    window.addXP(m.xp, "Mission Completed");
                    showToast(`🎯 MISSIONE COMPIUTA: ${currentLang === 'it' ? m.it : m.en}`);
                }
                updated = true;
            }
        }
    });

    if (updated) {
        db.ref(`users/${myId}/progression/dailyMissions/list`).set(missions);
    }
};

window.checkDailyMissionsStatus = function() {
    const today = new Date().toISOString().split('T')[0];
    if (window.userProgression?.dailyMissions?.date !== today) {
        window.generateDailyMissions();
    }
    window.renderMissionsUI();
};

window.renderMissionsUI = function() {
    if (!els.missionsContainer) return;
    const missions = window.userProgression?.dailyMissions?.list || [];
    els.missionsContainer.innerHTML = '';

    missions.forEach(m => {
        const div = document.createElement('div');
        div.className = 'mission-item' + (m.completed ? ' completed' : '');
        div.style.cssText = "background:var(--sec-bg-color); padding:8px; border-radius:8px; margin-bottom:5px; border-left:4px solid " + (m.completed ? "#4caf50" : "#ff9800");

        const perc = Math.min(100, (m.current / m.target) * 100);

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.85em; margin-bottom:4px;">
                <span>${currentLang === 'it' ? m.it : m.en}</span>
                <b style="color:var(--champ-color)">+${m.xp} XP</b>
            </div>
            <div style="width:100%; height:6px; background:var(--bg-color); border-radius:3px; overflow:hidden;">
                <div style="width:${perc}%; height:100%; background:${m.completed ? "#4caf50" : "#ff9800"};"></div>
            </div>
            <div style="text-align:right; font-size:0.7em; color:var(--hint-color); margin-top:2px;">${m.current}/${m.target}</div>
        `;
        els.missionsContainer.appendChild(div);
    });
    window.updateMissionsBadge();
};

window.updateMissionsBadge = function() {
    if (!els.missionsBadge) return;
    const missions = window.userProgression?.dailyMissions?.list || [];
    const pendingCount = missions.filter(m => !m.completed).length;

    if (pendingCount > 0) {
        els.missionsBadge.style.display = 'flex';
        els.missionsBadge.textContent = pendingCount;
    } else {
        els.missionsBadge.style.display = 'none';
    }
};
