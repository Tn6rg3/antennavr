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
    console.log("RPG: Initializing progression for ID:", myId);
    if (!myId) {
        console.warn("RPG: myId not ready, retrying...");
        setTimeout(window.initProgression, 500);
        return;
    }

    db.ref(`users/${myId}/progression`).on('value', snap => {
        const data = snap.val() || { xp: 0, level: 1, dailyMissions: {} };
        console.log("RPG: Data received from Firebase:", data);
        window.userProgression = data;

        // --- LOGICA AUTO-LEVEL UP (Se XP > Needed) ---
        let level = data.level || 1;
        let xp = data.xp || 0;
        let needed = window.getXPForNextLevel(level);
        let changed = false;

        while (xp >= needed && level < 100) {
            xp -= (needed); // Sottraiamo l'XP usato per il livello attuale
            level++;
            needed = window.getXPForNextLevel(level);
            changed = true;
        }

        if (changed) {
            console.log("RPG: Auto-leveling user to:", level, "with remainder XP:", xp);
            db.ref(`users/${myId}/progression`).update({ level: level, xp: xp });
            window.showLevelUpOverlay(level);
            return;
        }

        window.renderXPBar();
        window.checkDailyMissionsStatus();
        window.updateMissionsBadge();
    }, err => {
        console.error("RPG: Firebase Permission/Read Error:", err);
    });
};

window.addXP = function(amount, reason = "") {
    if (!myId) return;
    db.ref(`users/${myId}/progression`).transaction(curr => {
        if (!curr) curr = { xp: 0, level: 1 };
        curr.xp = (curr.xp || 0) + amount;

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
    const level = data.level || 1;
    const xp = data.xp || 0;
    const needed = window.getXPForNextLevel(level);
    const perc = Math.min(100, (xp / needed) * 100);

    const reversedTitles = [...OPERATOR_TITLES].reverse();
    const titleObj = reversedTitles.find(t => level >= t.level) || OPERATOR_TITLES[0];
    const titleText = currentLang === 'it' ? titleObj.it : titleObj.en;

    const fill = document.getElementById('xpBarFill');
    const lvDisp = document.getElementById('userLevelDisplay');
    const titleDisp = document.getElementById('userTitleDisplay');
    const xpDisp = document.getElementById('xpTextDisplay');

    if (fill) fill.style.width = perc + "%";
    if (lvDisp) lvDisp.textContent = `Liv. ${level}`;
    if (titleDisp) titleDisp.textContent = titleText;
    if (xpDisp) xpDisp.textContent = `${Math.floor(xp)} / ${needed} XP`;
};

window.showLevelUpOverlay = function(newLevel) {
    const reversedTitles = [...OPERATOR_TITLES].reverse();
    const titleObj = reversedTitles.find(t => newLevel >= t.level) || OPERATOR_TITLES[0];
    const titleText = currentLang === 'it' ? titleObj.it : titleObj.en;
    showToast(`🆙 LIVELLO SUPERATO! Sei ora Livello ${newLevel}: ${titleText}`);
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
            }).then(() => {
                if (window.userProgression) {
                    window.userProgression.dailyMissions = { date: today, list: missions };
                    window.renderMissionsUI();
                }
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
    } else {
        window.renderMissionsUI();
    }
};

window.renderMissionsUI = function() {
    const container = document.getElementById('missionsContainer');
    if (!container) return;
    const missions = window.userProgression?.dailyMissions?.list || [];
    container.innerHTML = '';

    if (missions.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--hint-color); font-size:0.8em;">Nessuna missione disponibile.</p>';
        window.updateMissionsBadge();
        return;
    }

    missions.forEach(m => {
        const div = document.createElement('div');
        div.className = 'mission-item' + (m.completed ? ' completed' : '');

        // Colore dinamico in base allo stato
        const borderColor = m.completed ? "#4caf50" : "#ff9800";
        const bgColor = m.completed ? "rgba(76, 175, 80, 0.1)" : "var(--sec-bg-color)";

        div.style.cssText = `background:${bgColor}; padding:8px; border-radius:8px; margin-bottom:5px; border-left:4px solid ${borderColor}; transition: all 0.3s ease;`;

        const perc = Math.min(100, (m.current / m.target) * 100);

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85em; margin-bottom:4px;">
                <span style="${m.completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${currentLang === 'it' ? m.it : m.en}</span>
                <b style="color:${m.completed ? '#4caf50' : 'var(--champ-color)'}">${m.completed ? '✅ FATTO' : '+' + m.xp + ' XP'}</b>
            </div>
            <div style="width:100%; height:6px; background:var(--bg-color); border-radius:3px; overflow:hidden;">
                <div style="width:${perc}%; height:100%; background:${borderColor}; transition: width 0.5s ease;"></div>
            </div>
            <div style="text-align:right; font-size:0.7em; color:var(--hint-color); margin-top:2px;">${m.current}/${m.target}</div>
        `;
        container.appendChild(div);
    });
    window.updateMissionsBadge();
};

window.updateMissionsBadge = function() {
    const badge = document.getElementById('missionsBadge');
    if (!badge) return;
    const missions = window.userProgression?.dailyMissions?.list || [];
    const pendingCount = missions.filter(m => !m.completed).length;

    if (pendingCount > 0) {
        badge.style.display = 'flex';
        badge.style.position = 'absolute';
        badge.style.top = '-5px';
        badge.style.right = '-5px';
        badge.style.zIndex = '999';
        badge.textContent = pendingCount;
    } else {
        badge.style.display = 'none';
    }
};
