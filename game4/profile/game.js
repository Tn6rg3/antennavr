// game4/profile/game.js

const XP_PER_LEVEL_BASE = 500;
const XP_GROWTH_FACTOR = 1.2;

const OPERATOR_TITLES = [
    { level: 1, it: "Recluta Morse", en: "Morse Recruit" },
    { level: 5, it: "Apprendista Segnalatore", en: "Signal Apprentice" },
    { level: 10, it: "Operatore Radio Junior", en: "Junior Radio Operator" },
    { level: 20, it: "Telegrafista Navale", en: "Naval Telegraphist" },
    { level: 30, it: "Telegrafista Militare", en: "Military Telegrapher" },
    { level: 35, it: "Esperto d'Intercettazione", en: "Interception Expert" },
    { level: 50, it: "Maestro del Tasto", en: "Key Master" },
    { level: 75, it: "Leggenda dell'Etere", en: "Legend of the Ether" },
    { level: 100, it: "Gran Maestro Telegrafista", en: "Grand Morse Master" }
];

let userMatchHistory = [];

window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.db && window.myId) {
            initProgression();
            loadProfileInfo();
            window.updateUI();
            db.ref(`users/${myId}/privacyUsername`).once('value', snap => {
                document.getElementById('privacyUsernameCheckbox').checked = snap.val() || false;
            });
            db.ref(`users/${myId}/alias`).once('value', snap => {
                document.getElementById('userAliasInput').value = snap.val() || "";
            });
        }
    }, 500);
});

window.updateUI = function() {
    const t = window.i18n[window.currentLang] || window.i18n.it;
    document.getElementById('btnTabProfile').textContent = "👤 " + (t.profile || "Profilo");
    document.getElementById('btnTabStats').textContent = "📊 " + (t.profile_tab_stats || "Statistiche");
    document.getElementById('txt_daily_missions').textContent = "🎯 " + (t.profile_tab_missions || "Missioni");
    document.getElementById('txt_alias_label').textContent = "🏷️ " + (t.alias_label || "Il tuo Alias");
    document.getElementById('txt_privacy_label').textContent = t.privacy_label || "Nascondi username";
    document.getElementById('txt_match_history').textContent = "📜 " + (t.match_history || "Storico");
    renderXPBar();
    renderMissionsUI();
};

function initProgression() {
    db.ref(`users/${myId}/progression`).on('value', snap => {
        const data = snap.val() || { xp: 0, level: 1, dailyMissions: {} };
        window.userProgression = data;
        let level = data.level || 1;
        let xp = data.xp || 0;
        let needed = getXPForNextLevel(level);
        let changed = false;
        while (xp >= needed && level < 100) { xp -= needed; level++; needed = getXPForNextLevel(level); changed = true; }
        if (changed) { db.ref(`users/${myId}/progression`).update({ level: level, xp: xp }); return; }
        renderXPBar();
        checkDailyMissionsStatus();
    });
}

function getXPForNextLevel(level) { return Math.floor(XP_PER_LEVEL_BASE * Math.pow(XP_GROWTH_FACTOR, level - 1)); }

function renderXPBar() {
    const data = window.userProgression || { xp: 0, level: 1 };
    const level = data.level || 1;
    const xp = data.xp || 0;
    const needed = getXPForNextLevel(level);
    const perc = Math.min(100, (xp / needed) * 100);
    const titleObj = [...OPERATOR_TITLES].reverse().find(t => level >= t.level) || OPERATOR_TITLES[0];
    document.getElementById('xpBarFill').style.width = perc + "%";
    document.getElementById('userLevelDisplay').textContent = `Liv. ${level}`;
    document.getElementById('userTitleDisplay').textContent = window.currentLang === 'it' ? titleObj.it : titleObj.en;
    document.getElementById('xpTextDisplay').textContent = `${Math.floor(xp)} / ${needed} XP`;
}

function checkDailyMissionsStatus() {
    const today = new Date().toISOString().split('T')[0];
    if (window.userProgression?.dailyMissions?.date !== today) generateDailyMissions();
    else renderMissionsUI();
}

function generateDailyMissions() {
    const today = new Date().toISOString().split('T')[0];
    const missions = [
        { id: 'm1', type: 'count', target: 50, current: 0, xp: 100, it: "Indovina 50 parole totali", en: "Guess 50 total words" },
        { id: 'm2', type: 'wpm_min', target: 5, wpm: 30, current: 0, xp: 150, it: "Indovina 5 parole a >30 WPM", en: "Guess 5 words at >30 WPM" },
        { id: 'm3', type: 'streak', target: 10, current: 0, xp: 200, it: "Fai una striscia di 10 parole", en: "Get a 10 word streak" }
    ];
    db.ref(`users/${myId}/progression/dailyMissions`).set({ date: today, list: missions });
}

function renderMissionsUI() {
    const container = document.getElementById('missionsContainer');
    if (!container) return;
    const missions = window.userProgression?.dailyMissions?.list || [];
    container.innerHTML = '';
    missions.forEach(m => {
        const perc = Math.min(100, (m.current / m.target) * 100);
        const div = document.createElement('div');
        div.style.cssText = `background:rgba(0,0,0,0.05); padding:8px; border-radius:8px; margin-bottom:5px; border-left:4px solid ${m.completed ? '#4caf50' : '#ff9800'}`;
        div.innerHTML = `<div style="display:flex; justify-content:space-between; font-size:0.85em;"><span>${window.currentLang === 'it' ? m.it : m.en}</span><b>${m.completed ? '✅' : '+' + m.xp + ' XP'}</b></div>
                         <div style="width:100%; height:6px; background:#ddd; border-radius:3px; margin:4px 0;"><div style="width:${perc}%; height:100%; background:${m.completed ? '#4caf50' : '#ff9800'}"></div></div>
                         <div style="text-align:right; font-size:0.7em;">${m.current}/${m.target}</div>`;
        container.appendChild(div);
    });
}

window.switchProfileTab = function(tabId) {
    document.getElementById('profileInfoArea').style.display = tabId === 'info' ? 'flex' : 'none';
    document.getElementById('profileStatsArea').style.display = tabId === 'stats' ? 'flex' : 'none';
    document.getElementById('btnTabProfile').classList.toggle('active-tab', tabId === 'info');
    document.getElementById('btnTabStats').classList.toggle('active-tab', tabId === 'stats');
    if (tabId === 'stats') loadAdvancedStats();
};

function loadProfileInfo() {
    const list = document.getElementById('matchHistoryList');
    db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(10).once('value', snap => {
        list.innerHTML = '';
        userMatchHistory = [];
        snap.forEach(child => userMatchHistory.push({ key: child.key, ...child.val() }));
        userMatchHistory.reverse().forEach(match => {
            const li = document.createElement('li');
            li.innerHTML = `<div style="display:flex; justify-content:space-between; width:100%;"><b>${match.mode.toUpperCase()}</b> <small>${new Date(match.date).toLocaleDateString()}</small></div>
                            <div style="display:flex; justify-content:space-between; width:100%; margin-top:5px;"><span>${match.score} pt (${match.wpm} WPM)</span>
                            <div><button onclick="openMatchDetails('${match.key}')">Vedi</button><button onclick="deleteHistoryItem('${match.key}')">🗑️</button></div></div>`;
            list.appendChild(li);
        });
    });
}

window.openMatchDetails = function(key) {
    const m = userMatchHistory.find(x => x.key === key);
    if (!m) return;
    const body = document.getElementById('matchDetailsBody');
    body.innerHTML = '';
    (m.details || []).forEach(row => {
        body.innerHTML += `<tr><td>${row.typed || '-'}</td><td><b>${row.real}</b></td><td style="color:${row.points > 0 ? '#4caf50' : '#d32f2f'}">${row.points}</td></tr>`;
    });
    document.getElementById('matchDetailsModal').style.display = 'flex';
};

window.deleteHistoryItem = (key) => { if (confirm("Eliminare?")) db.ref(`users/${myId}/history/${key}`).remove().then(() => loadProfileInfo()); };

document.getElementById('saveAliasBtn').onclick = async () => {
    const alias = document.getElementById('userAliasInput').value.trim();
    const privacy = document.getElementById('privacyUsernameCheckbox').checked;

    // VALIDAZIONE ALIAS (ALFANUMERICO, MAX 12 CARATTERI)
    const validAliasRegex = /^[a-zA-Z0-9 ]+$/;
    if (alias.length > 0) {
        if (alias.length > 12) {
            alert(window.currentLang === 'it' ? "L'Alias non può superare i 12 caratteri!" : "Alias cannot exceed 12 characters!");
            return;
        }
        if (!validAliasRegex.test(alias)) {
            alert(window.currentLang === 'it' ? "L'Alias può contenere solo lettere, numeri e spazi!" : "Alias can only contain letters, numbers and spaces!");
            return;
        }
    }

    await db.ref(`users/${myId}`).update({ alias: alias || null, privacyUsername: privacy });
    const newName = alias || window.myName;
    const currentUsername = privacy ? "" : window.tgUsername;
    if (window.syncUserNameEverywhere) {
        await window.syncUserNameEverywhere(window.myId, newName, currentUsername);
    }
    alert(window.currentLang === 'it' ? "Salvato!" : "Saved!");
};

function loadAdvancedStats() {
    db.ref(`users/${myId}/stats`).once('value', snap => {
        const s = snap.val() || {};
        document.getElementById('wpmErrorChartContainer').innerHTML = Object.entries(s.errorsByWpm || {}).map(([w,e]) => `<div>${w} WPM: ${Object.values(e).reduce((a,b)=>a+b,0)} err.</div>`).join('');
        document.getElementById('bigramErrorsContainer').innerHTML = Object.entries(s.bigramErrors || {}).sort((a,b)=>(b[1].count||b[1])-(a[1].count||a[1])).slice(0,10).map(([k,v])=>`<div>${k}: ${v.count||v}</div>`).join('');
    });
}

window.goBackToMenu = () => window.parent.postMessage('closeModule', '*');
