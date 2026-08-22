// game4/leaderboard/game.js

const lbGroups = {
    daily: [
        { val: 'daily_challenge', it: '📅 Sfida Giornaliera', en: '📅 Daily Challenge', sub: 'challenge' },
        { val: 'room', it: '🏁 Risultati Ultima Partita', en: '🏁 Last Match Results', sub: 'room' }
    ],
    multi: [
        { val: 'standard', it: '⚔️ Sfide Parole (Multi)', en: '⚔️ Words Challenges', sub: 'multi' },
        { val: 'chars', it: '⚔️ Sfide Caratteri (Multi)', en: '⚔️ Chars Challenges', sub: 'multi' },
        { val: 'quiz', it: '⚔️ Sfide Quiz (Multi)', en: '⚔️ Quiz Challenges', sub: 'multi' },
        { val: 'callsign', it: '🎙️ Sfide Nominativi (Multi)', en: '🎙️ Callsign Challenges', sub: 'multi' },
        { val: 'pingpong', it: '🏓 Sfide Ping Pong', en: '🏓 Ping Pong Challenges', sub: 'multi' },
        { val: 'tournaments', it: '🏆 Classifica Tornei (Team)', en: '🏆 Tournament Standings', sub: 'global' }
    ],
    solo: [
        { val: 'standard', it: '👤 Allenamento Parole', en: '👤 Words Practice', sub: 'solo' },
        { val: 'chars', it: '👤 Allenamento Caratteri', en: '👤 Chars Practice', sub: 'solo' },
        { val: 'quiz', it: '👤 Allenamento Quiz', en: '👤 Quiz Practice', sub: 'solo' }
    ],
    special: [
        { val: 'callsign', it: '🎙️ Nominativi (CW Freak)', en: '🎙️ Callsigns (CW Freak)', sub: 'global' },
        { val: 'arcade', it: '🕹️ Intercettazione Arcade', en: '🕹️ Arcade Interception', sub: 'all' }
    ]
};

let currentGroupId = 'daily';

function switchLBGroup(groupId) {
    currentGroupId = groupId;
    console.log("LB: Switching to group:", groupId);

    document.querySelectorAll('#lbCategoryTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
    const activeBtn = document.getElementById('tab' + groupId.charAt(0).toUpperCase() + groupId.slice(1) + 'LB');
    if (activeBtn) activeBtn.classList.add('active-tab');

    const select = document.getElementById('lbModeSelect');
    if (!select) return;

    select.innerHTML = '';
    const modes = lbGroups[groupId] || [];
    modes.forEach(m => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({cat: m.val, sub: m.sub});
        opt.textContent = window.currentLang === 'it' ? m.it : m.en;
        select.appendChild(opt);
    });

    // Toggle filter area visibility
    const filterArea = document.getElementById('lbFilterArea');
    if (groupId === 'solo' || groupId === 'multi') {
        filterArea.style.display = 'flex';
    } else {
        filterArea.style.display = 'none';
    }

    if (modes.length > 0) {
        fetchLeaderboard();
    }
}

async function fetchLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    const select = document.getElementById('lbModeSelect');
    const wordFilter = document.getElementById('lbWordFilter').value;

    if (!container || !select.value) return;

    container.innerHTML = `<div class="loading">${window.currentLang === 'it' ? 'Caricamento...' : 'Loading...'}</div>`;

    const config = JSON.parse(select.value);
    const category = config.cat;
    const submode = config.sub;

    // Requirement: Fetch and display rankings from Firebase leaderboard/CATEGORY/SUBMODE/all
    // For solo/multi we might want to respect the word count filter if implemented in DB
    // But the prompt says /all, so we'll fetch that.

    let dbPath = `leaderboard/${category}/${submode}/all`;

    // Special handling for daily challenge if it uses dates like in game3
    if (currentGroupId === 'daily') {
        const todayStr = new Date().toISOString().split('T')[0];
        dbPath = `leaderboard/daily_challenge/${todayStr}`;
    }

    console.log("LB: Fetching from", dbPath);

    try {
        const snapshot = await window.db.ref(dbPath).orderByChild('score').limitToLast(50).once('value');
        const players = [];
        snapshot.forEach(child => {
            const p = child.val();
            if (p) {
                p.id = child.key;
                players.push(p);
            }
        });

        // Sort descending
        players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

        renderLeaderboard(players);
    } catch (error) {
        console.error("LB: Error fetching data", error);
        container.innerHTML = `<div class="empty">Errore caricamento dati.</div>`;
    }
}

function renderLeaderboard(players) {
    const container = document.getElementById('leaderboardContainer');
    container.innerHTML = '';

    if (players.length === 0) {
        container.innerHTML = `<div class="empty">${window.currentLang === 'it' ? 'Nessun record trovato.' : 'No records found.'}</div>`;
        return;
    }

    players.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';

        let medal = (index + 1) + ".";
        if (index === 0) medal = "🥇";
        else if (index === 1) medal = "🥈";
        else if (index === 2) medal = "🥉";

        const name = player.name || (window.currentLang === 'it' ? "Anonimo" : "Anonymous");
        const level = player.level ? `(Lv.${player.level})` : "";
        const wpm = player.wpm ? `${player.wpm} WPM` : "";
        const date = player.date || "";

        row.innerHTML = `
            <div class="rank">${medal}</div>
            <div class="user-info">
                <div class="user-name">${name} <span style="font-size:0.8em; color:var(--champ-color)">${level}</span></div>
                <div class="user-meta">${date} ${wpm ? '• ' + wpm : ''}</div>
            </div>
            <div class="score">
                <b>${player.score}</b><span>pt</span>
            </div>
        `;
        container.appendChild(row);
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    // Wait for init.js to set up window.db
    const checkDb = setInterval(() => {
        if (window.db) {
            clearInterval(checkDb);
            switchLBGroup('daily');
        }
    }, 100);

    document.getElementById('lbModeSelect').addEventListener('change', fetchLeaderboard);
    document.getElementById('lbWordFilter').addEventListener('change', fetchLeaderboard);
});
