// Participation Module Logic

window.getWeekNumber = function(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0');
};

window.updateUI = function() {
    const t = window.i18n[window.currentLang] || window.i18n.it;
    document.getElementById('txt_participation_title').textContent = t.act_title || "🏅 Attività";
    document.getElementById('tabDaily').textContent = t.act_tab_daily || "Oggi";
    document.getElementById('tabWeekly').textContent = t.act_tab_weekly || "Settimana";
    document.getElementById('tabMonthly').textContent = t.act_tab_monthly || "Mese";
    document.getElementById('txt_medals_title').textContent = t.medals || "🎖️ Medaglie";
    document.getElementById('btn_close').textContent = t.chat_close || "Chiudi";
    switchTab(window.currentTab || 'daily');
};

function switchTab(period) {
    window.currentTab = period;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
    const btn = document.getElementById('tab' + period.charAt(0).toUpperCase() + period.slice(1));
    if (btn) btn.classList.add('active-tab');

    const now = new Date();
    const t = window.i18n[window.currentLang] || window.i18n.it;
    let key = "";
    let title = "";

    if (period === 'daily') {
        key = now.toISOString().split('T')[0];
        title = t.daily_active || "I più attivi di Oggi";
    } else if (period === 'weekly') {
        key = window.getWeekNumber(now);
        title = t.weekly_active || "I più attivi della Settimana";
    } else if (period === 'monthly') {
        key = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
        title = t.monthly_active || "I più attivi del Mese";
    }

    const titleEl = document.getElementById('actListTitle');
    if (titleEl) titleEl.textContent = title;

    renderRankings(period, key);
}

function renderRankings(period, key) {
    const list = document.getElementById('activityRankList');
    if (!list) return;
    list.innerHTML = '<li style="justify-content:center;">...</li>';

    window.db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        list.innerHTML = '';
        let users = [];
        snap.forEach(child => {
            const u = child.val();
            if (u && typeof u === 'object') users.push({ id: child.key, ...u });
        });
        users.sort((a, b) => (b.games || 0) - (a.games || 0));
        users.slice(0, 50).forEach((u, idx) => {
            let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            const li = document.createElement('li');
            li.innerHTML = `<span>${medal} <b>${u.name || "Anonimo"}</b></span><span><b>${u.games || 0}</b> <small>(${u.wins || 0} v.)</small></span>`;
            list.appendChild(li);
        });
        if (users.length === 0) list.innerHTML = '<li style="justify-content:center;">Nessuna attività.</li>';
    });
}

function updateMedalsUI() {
    const container = document.getElementById('myMedalsContainer');
    if (!container || !window.myId) return;
    window.db.ref(`users/${window.myId}/medals`).on('value', snap => {
        container.innerHTML = '';
        if (!snap.exists()) { container.innerHTML = '<small>Nessuna medaglia.</small>'; return; }
        snap.forEach(child => {
            const m = child.val();
            const span = document.createElement('span');
            span.textContent = m.icon;
            span.title = `${m.title} (${m.date})`;
            container.appendChild(span);
        });
    });
}

function closeModule() {
    window.parent.postMessage('closeModule', '*');
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.db && window.myId) {
            window.updateUI();
            updateMedalsUI();
        }
    }, 500);
});
