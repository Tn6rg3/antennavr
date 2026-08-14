// js/profile_manager.js

window.getWeekNumber = function(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0');
};

window.updateActivity = function(won = false) {
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    ['daily/'+dKey, 'weekly/'+wKey, 'monthly/'+mKey].forEach(path => {
        db.ref(`activity/${path}/${myId}`).transaction(data => {
            if (!data) return { name: myName, games: 1, wins: won ? 1 : 0, lastPlayed: firebase.database.ServerValue.TIMESTAMP };
            data.games = (data.games || 0) + 1;
            if (won) data.wins = (data.wins || 0) + 1;
            data.name = myName;
            data.lastPlayed = firebase.database.ServerValue.TIMESTAMP;
            return data;
        }).then(() => { if (path.startsWith('daily')) window.checkActivityAndAwardMedals(); });
    });
};

window.checkActivityAndAwardMedals = async function() {
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    try {
        const [dSnap, wSnap, mSnap, uMedals] = await Promise.all([ db.ref(`activity/daily/${dKey}/${myId}`).once('value'), db.ref(`activity/weekly/${wKey}/${myId}`).once('value'), db.ref(`activity/monthly/${mKey}/${myId}`).once('value'), db.ref(`users/${myId}/medals`).once('value') ]);
        const dData = dSnap.val() || { games: 0 }, wData = wSnap.val() || { games: 0 }, mData = mSnap.val() || { games: 0 };
        let myMedals = uMedals.val() || {};

        const validKeys = [dKey, wKey, mKey, 'daily_champ'];
        for (let id in myMedals) {
            if (!validKeys.includes(myMedals[id].periodKey)) {
                await db.ref(`users/${myId}/medals/${id}`).remove();
                delete myMedals[id];
            }
        }

        const check = (count, thresh, id, title, desc, icon, pKey) => {
            if (count >= thresh && (!myMedals[id] || myMedals[id].periodKey !== pKey)) {
                window.awardMedal(id, title, desc, icon, pKey);
                myMedals[id] = { periodKey: pKey };
                return true;
            }
            return false;
        };

        check(dData.games, 3, 'd_bronze', "Bronzo Giornaliero", "Hai giocato 3 partite oggi!", "🥉", dKey);
        check(dData.games, 7, 'd_silver', "Argento Giornaliero", "Sei un veterano! 7 partite oggi!", "🥈", dKey);
        check(dData.games, 15, 'd_gold', "Oro Giornaliero", "Incredibile! 15 partite in un giorno!", "🥇", dKey);
        check(wData.games, 20, 'w_active', "Stakanovista Settimanale", "20 partite questa settimana!", "🎖️", wKey);
        check(wData.games, 50, 'w_pro', "Campione Settimanale", "50 partite! Una leggenda questa settimana!", "🏆", wKey);
        check(mData.games, 150, 'm_legend', "Titano del Mese", "150 partite! Il gioco non ha segreti per te.", "💎", mKey);
    } catch(e) { console.error("Medals Logic Error:", e); }
    window.updateMedalGallery();
};

window.awardMedal = function(id, title, desc, icon, periodKey) {
    db.ref(`users/${myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon, periodKey });
    if (els.overlayMedalIcon) els.overlayMedalIcon.textContent = icon;
    if (els.overlayMedalTitle) els.overlayMedalTitle.textContent = title;
    if (els.overlayMedalDesc) els.overlayMedalDesc.textContent = desc;
    if (els.medalOverlay) els.medalOverlay.style.display = 'flex';
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle'; const now = audioCtx.currentTime; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8); osc.start(now); osc.stop(now + 0.8);
    window.updateMedalGallery();
};

window.updateMedalGallery = function() {
    if (!els.myMedalsContainer) return;
    db.ref(`users/${myId}/medals`).once('value', snap => {
        if (!snap.exists()) return els.myMedalsContainer.innerHTML = '<span style="font-size:0.6em; color:var(--hint-color);">Nessuna medaglia.</span>';
        els.myMedalsContainer.innerHTML = '';
        Object.values(snap.val()).forEach(m => {
            const span = document.createElement('span');
            span.textContent = (m.count && m.count > 1) ? `${m.count}x ${m.icon}` : m.icon;
            span.title = `${m.title} (${m.date})`;
            span.onclick = () => showToast(`${m.title} - ${m.date}`);
            span.style.cursor = "pointer";
            els.myMedalsContainer.appendChild(span);
        });
    });
};

window.switchActTab = function(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab'));
    if (els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`]) {
        els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`].classList.add('active-tab');
    }
    const now = new Date();
    let key = period === 'daily' ? now.toISOString().split('T')[0] : period === 'weekly' ? window.getWeekNumber(now) : now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    if (els.actListTitle) {
        els.actListTitle.textContent = period === 'daily' ? "I più attivi di Oggi" : period === 'weekly' ? "I più attivi della Settimana" : "I più attivi del Mese";
    }
    window.renderActivityRankings(period, key);
    window.updateMedalGallery();
};

window.renderActivityRankings = function(period, key) {
    if (!els.activityRankList) return;
    els.activityRankList.innerHTML = '';
    const loadLi = document.createElement('li'); loadLi.style.cssText = "justify-content:center; color:var(--hint-color);"; loadLi.textContent = "Caricamento..."; els.activityRankList.appendChild(loadLi);

    db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = '';
        let users = [];
        if (snap.exists()) snap.forEach(child => { const u = child.val(); if (u && typeof u === 'object') users.push({ id: child.key, ...u }); });
        users.sort((a, b) => (b.games || 0) - (a.games || 0)); users = users.slice(0, 50);
        if (users.length === 0) {
            const empLi = document.createElement('li'); empLi.style.cssText = "justify-content:center; color:var(--hint-color);"; empLi.textContent = "Nessuna attività registrata."; els.activityRankList.appendChild(empLi); return;
        }
        users.forEach((u, idx) => {
            let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;
            const li = document.createElement('li');
            const nameSpan = document.createElement('span'); nameSpan.appendChild(document.createTextNode(medal + " ")); const nameB = document.createElement('b'); nameB.textContent = u.name || "Anonimo"; nameSpan.appendChild(nameB);
            const statsSpan = document.createElement('span'); const gamesB = document.createElement('b'); gamesB.textContent = u.games || 0; statsSpan.appendChild(gamesB); statsSpan.appendChild(document.createTextNode(" part. "));
            const winsSmall = document.createElement('small'); winsSmall.style.color = '#4caf50'; winsSmall.textContent = `(${u.wins || 0} v.)`; statsSpan.appendChild(winsSmall);
            li.appendChild(nameSpan); li.appendChild(statsSpan); els.activityRankList.appendChild(li);
        });
    }).catch(err => {
        els.activityRankList.innerHTML = '';
        const errLi = document.createElement('li'); errLi.style.cssText = "justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;";
        const eSpan = document.createElement('span'); eSpan.textContent = "Errore nel caricamento."; errLi.appendChild(eSpan);
        const eSmall = document.createElement('small'); eSmall.style.cssText = "font-size:0.7em; opacity:0.7;"; eSmall.textContent = err.message; errLi.appendChild(eSmall);
        els.activityRankList.appendChild(errLi);
    });
};

// --- NUOVA GESTIONE PROFILO E STATISTICHE ANALITICHE ---

window.switchProfileTab = function(tabId) {
    const infoBtn = document.getElementById('btnTabProfile');
    const statsBtn = document.getElementById('btnTabStats');
    const infoArea = document.getElementById('profileInfoArea');
    const statsArea = document.getElementById('profileStatsArea');
    const courseArea = document.getElementById('profileCourseArea');
    const tabsHeader = document.getElementById('profileTabsHeader');

    if (infoBtn) infoBtn.classList.remove('active-tab');
    if (statsBtn) statsBtn.classList.remove('active-tab');

    if (infoArea) infoArea.style.display = 'none';
    if (statsArea) statsArea.style.display = 'none';
    if (courseArea) courseArea.style.display = 'none';

    if (tabId === 'info') {
        if (tabsHeader) tabsHeader.style.display = 'flex';
        if (infoBtn) infoBtn.classList.add('active-tab');
        if (infoArea) infoArea.style.display = 'flex';
        window.loadProfileInfo();
    } else if (tabId === 'stats') {
        if (tabsHeader) tabsHeader.style.display = 'flex';
        if (statsBtn) statsBtn.classList.add('active-tab');
        if (statsArea) statsArea.style.display = 'flex';
        document.getElementById('bigramThresholdInput')?.addEventListener('change', window.loadAdvancedStats);
        document.getElementById('wordThresholdInput')?.addEventListener('change', window.loadAdvancedStats);
        window.loadAdvancedStats();
    } else if (tabId === 'course') {
        // Nascondiamo l'header dei tab principali per vedere solo Dashboard e Trasmissione
        if (tabsHeader) tabsHeader.style.display = 'none';
        if (courseArea) courseArea.style.display = 'flex';
        if (typeof window.hideCourseMessageBadge === 'function') window.hideCourseMessageBadge();
        if (typeof window.renderCourseTabView === 'function') window.renderCourseTabView();
    }
};

window.loadProfileInfo = function() {
    const list = document.getElementById('matchHistoryList');
    if (list) list.innerHTML = '<li style="justify-content:center;">Caricamento...</li>';

    if (!myId) return;

    db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(10).once('value').then(snap => {
        const listContainer = document.getElementById('matchHistoryList');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        userMatchHistory = [];
        snap.forEach(child => { userMatchHistory.push({ key: child.key, ...child.val() }); });
        userMatchHistory.reverse();

        if (userMatchHistory.length === 0) {
            listContainer.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna partita.</li>';
            return;
        }

        userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now());
            const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            let modeIcon = match.mode === 'callsign' ? '🎙️' : match.mode === 'pingpong' ? '🏓' : match.mode === 'chars' ? '⌨️' : (match.mode === 'daily_challenge' ? '📅' : '🔤');

            const li = document.createElement('li');
            li.style.cssText = "flex-direction:column; align-items:flex-start; padding:8px;";
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.85em;">
                    <b>${modeIcon} ${(match.mode || "GIOCO").toUpperCase()}</b>
                    <span style="color:var(--hint-color)">${dateStr}</span>
                </div>
                <div style="display:flex; justify-content:space-between; width:100%; margin-top:5px; align-items:center;">
                    <span><b>${match.score} pt</b> <small>(${match.wpm} WPM)</small></span>
                    <div style="display:flex; gap:5px;">
                        <button class="action-btn-small btn-secondary" onclick="window.openMatchDetails('${match.key}')" style="width:auto; padding:2px 10px;">Vedi</button>
                        <button class="action-btn-small btn-danger" onclick="window.deleteHistoryItem('${match.key}')" style="width:auto; padding:2px 6px;">🗑️</button>
                    </div>
                </div>
            `;
            listContainer.appendChild(li);
        });
    }).catch(err => {
        console.error("Profile: Error loading history:", err);
        const listContainer = document.getElementById('matchHistoryList');
        if (listContainer) listContainer.innerHTML = '<li style="justify-content:center; color:red;">Errore caricamento.</li>';
    });
};

window.loadAdvancedStats = function() {
    const wpmContainer = document.getElementById('wpmErrorChartContainer');
    const bigramContainer = document.getElementById('bigramErrorsContainer');
    const wordContainer = document.getElementById('wordErrorsContainer');

    const bigramTh = parseInt(document.getElementById('bigramThresholdInput')?.value) || 3;
    const wordTh = parseInt(document.getElementById('wordThresholdInput')?.value) || 3;

    if (wpmContainer) wpmContainer.innerHTML = 'Caricamento...';
    if (bigramContainer) bigramContainer.innerHTML = 'Caricamento...';
    if (wordContainer) wordContainer.innerHTML = 'Caricamento...';

    db.ref(`users/${myId}/stats`).once('value', snap => {
        const stats = snap.val() || {};

        // 1. Errori per WPM
        if (wpmContainer) {
            wpmContainer.innerHTML = '';
            const wpmErrs = stats.errorsByWpm || {};
            const sortedWpm = Object.keys(wpmErrs).sort((a,b) => parseInt(b) - parseInt(a));
            if (sortedWpm.length === 0) wpmContainer.innerHTML = '<p style="text-align:center; opacity:0.6;">Nessun dato.</p>';
            sortedWpm.forEach(wpm => {
                const total = Object.values(wpmErrs[wpm]).reduce((a,b) => a+b, 0);
                const div = document.createElement('div');
                div.style.cssText = "display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding:4px 0;";
                div.innerHTML = `<b>${wpm} WPM</b> <span style="color:#d32f2f">${total} err.</span>`;
                wpmContainer.appendChild(div);
            });
        }

        // 2. Bigrammi (Coppie) Sbagliate
        if (bigramContainer) {
            bigramContainer.innerHTML = '';
            const bigrams = stats.bigramErrors || {};
            const filteredBigrams = Object.entries(bigrams).filter(e => {
                const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
                return count >= bigramTh;
            }).sort((a,b) => (b[1].count || b[1]) - (a[1].count || a[1])).slice(0, 20);

            if (filteredBigrams.length === 0) bigramContainer.innerHTML = '<p style="text-align:center; opacity:0.6; font-size:0.8em;">Sotto soglia.</p>';
            filteredBigrams.forEach(([pair, data]) => {
                const count = data.count || data;
                const avgWpm = data.avgWpm || 20;
                const div = document.createElement('div');
                div.className = 'leaderboard-row';
                div.style.cssText = "padding:6px; margin-bottom:4px; font-size:0.85em; flex-direction:column; align-items:flex-start;";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <span><b>${pair}</b> (${count})</span>
                        <button class="action-btn-small btn-secondary" onclick="window.playMorseAudio('${pair}', ${avgWpm}, true)" style="width:30px; padding:2px 0;">🔊</button>
                    </div>
                    <div style="font-size:0.7em; color:var(--hint-color);">Velocità: ${avgWpm} WPM</div>
                `;
                bigramContainer.appendChild(div);
            });
        }

        // 3. Parole Critiche
        if (wordContainer) {
            wordContainer.innerHTML = '';
            const words = stats.wordErrors || {};
            const criticalWords = Object.entries(words).filter(e => {
                const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
                return count >= wordTh;
            }).sort((a,b) => (b[1].count || b[1]) - (a[1].count || a[1]));

            if (criticalWords.length === 0) wordContainer.innerHTML = '<p style="text-align:center; opacity:0.6; font-size:0.8em;">Sotto soglia.</p>';
            criticalWords.forEach(([word, data]) => {
                const count = data.count || data;
                const avgWpm = data.avgWpm || 20;
                const div = document.createElement('div');
                div.className = 'leaderboard-row';
                div.style.cssText = "padding:6px; margin-bottom:4px; font-size:0.85em; flex-direction:column; align-items:flex-start;";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <span style="overflow:hidden; text-overflow:ellipsis;"><b>${word}</b> (${count})</span>
                        <button class="action-btn-small btn-secondary" onclick="window.playMorseAudio('${word}', ${avgWpm}, true)" style="width:30px; padding:2px 0;">🔊</button>
                    </div>
                    <div style="font-size:0.7em; color:var(--hint-color);">Velocità: ${avgWpm} WPM</div>
                `;
                wordContainer.appendChild(div);
            });
        }
    });
};

window.showProfileScreen = function() {
    window.showScreen('profileScreen');
    window.switchProfileTab('info');
};

window.openMatchDetails = function(matchKey) {
    const match = userMatchHistory.find(m => m.key === matchKey);
    if (!match || !els.matchDetailsBody || !els.matchDetailsModal) return;
    els.matchDetailsBody.innerHTML = '';
    const h3 = els.matchDetailsModal.querySelector('h3');
    if (h3) h3.textContent = `Dettagli Match - ${match.mode.toUpperCase()}`;
    (match.details || []).forEach(row => {
        const tr = document.createElement('tr');
        const isCorrect = (row.real === row.typed);
        let color = row.points > 0 ? "#4caf50" : (!isCorrect ? "#d32f2f" : "#999999");

        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td');
        if (typeof window.renderDiffSecure === 'function') {
            window.renderDiffSecure(tdReal, row.real, row.typed || '');
        } else {
            const bReal = document.createElement('b'); bReal.textContent = row.real; tdReal.appendChild(bReal);
        }

        const tdActions = document.createElement('td');
        tdActions.style.textAlign = 'center';

        const ptsSpan = document.createElement('span');
        ptsSpan.style.color = color;
        ptsSpan.style.fontWeight = 'bold';
        ptsSpan.style.display = 'block';
        ptsSpan.textContent = row.points;
        tdActions.appendChild(ptsSpan);

        if (!isCorrect) {
            const replayBtn = document.createElement('button');
            replayBtn.className = 'action-btn-small btn-secondary';
            replayBtn.style.padding = '2px 6px';
            replayBtn.style.marginTop = '2px';
            replayBtn.style.width = 'auto';
            replayBtn.innerHTML = '🔊';
            const replayWpm = row.wpm || match.wpm || 20;
            replayBtn.onclick = () => window.playMorseAudio(row.real, replayWpm, true);
            tdActions.appendChild(replayBtn);
        }

        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdActions);
        els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
};

window.deleteHistoryItem = function(key) {
    if (confirm("Eliminare questa partita?")) {
        db.ref(`users/${myId}/history/${key}`).remove().then(() => window.loadProfileInfo());
    }
};

window.syncUserNameEverywhere = async function(userId, newName, newUsername) {
    // 1. Presenza e Stanza Attiva
    await db.ref(`presence/${userId}`).update({ name: newName, username: newUsername });
    if (roomCode) await db.ref(`rooms/${roomCode}/players/${userId}`).update({ name: newName, username: newUsername });

    // 2. Attività (Storico classifiche partecipazione)
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) {
        const actRef = db.ref(`${path}/${userId}`);
        try {
            const actSnap = await actRef.once('value');
            if (actSnap.exists()) await actRef.update({ name: newName });
        } catch(e) { console.error("Medals Logic Error:", e); }
    }

    // 3. Squadra
    if (myTeamId) await db.ref(`teams/${myTeamId}/members/${userId}`).update({ name: newName, username: newUsername });

    // 4. Corso CW
    try {
        const courseRef = db.ref(`courseActiveEnrollments/${userId}`);
        const snap = await courseRef.once('value');
        if (snap.exists()) await courseRef.update({ name: newName });
    } catch(e) { console.error("Medals Logic Error:", e); }

    // 5. Leaderboard (Fix Privacy & Alias su tutti i record esistenti)
    await window.updateUserInAllLeaderboards(newName, newUsername);
};

window.updateUserInAllLeaderboards = async function(newName, newUsername) {
    console.log("Privacy: Updating all leaderboard entries for user...");

    // Percorsi con struttura fissa CATEGORIA/UID
    const fixedPaths = [
        `leaderboard/callsign/global/${myId}`,
        `leaderboard/arcade/all/${myId}`,
        `leaderboard/arcade/global/${myId}`
    ];

    for (const path of fixedPaths) {
        try {
            const snap = await db.ref(path).once('value');
            if (snap.exists()) await db.ref(path).update({ name: newName, username: newUsername });
        } catch(e) { console.error("Medals Logic Error:", e); }
    }

    // Percorsi con struttura dinamica CATEGORIA/SOTTO_MODO/UID (standard, chars, quiz, pingpong)
    const categories = ['standard', 'chars', 'quiz', 'pingpong'];
    for (const cat of categories) {
        try {
            const catSnap = await db.ref(`leaderboard/${cat}`).once('value');
            if (catSnap.exists()) {
                catSnap.forEach(subNode => {
                    if (subNode.hasChild(myId)) {
                        subNode.child(myId).ref.update({ name: newName, username: newUsername });
                    }
                });
            }
        } catch(e) { console.error("Medals Logic Error:", e); }
    }

    // Sfida Giornaliera (Oggi)
    try {
        const today = new Date().toISOString().split('T')[0];
        const dailyRef = db.ref(`leaderboard/daily_challenge/${today}/${myId}`);
        const dSnap = await dailyRef.once('value');
        if (dSnap.exists()) await dailyRef.update({ name: newName, username: newUsername });
    } catch(e) { console.error("Medals Logic Error:", e); }
};

// --- LOGICA SALVATAGGIO ERRORI AVANZATI ---

window.trackAdvancedErrors = function(realWord, userWord, wpm) {
    if (!myId) return;
    const statsRef = db.ref(`users/${myId}/stats`);

    statsRef.once('value', snap => {
        let stats = snap.val() || {};
        if (!stats.bigramErrors) stats.bigramErrors = {};
        if (!stats.wordErrors) stats.wordErrors = {};

        const real = realWord.toUpperCase();
        const typed = userWord.toUpperCase();

        // 1. Tracciamento Bigrammi
        for (let i = 0; i < real.length - 1; i++) {
            const pair = real.substring(i, i + 2);
            if (typed[i] !== real[i] || typed[i+1] !== real[i+1]) {
                const oldData = stats.bigramErrors[pair] || { count: 0, avgWpm: 0 };
                const oldCount = oldData.count || (typeof oldData === 'number' ? oldData : 0);
                const oldWpm = oldData.avgWpm || wpm;

                const newCount = oldCount + 1;
                // Media mobile WPM
                const newWpm = Math.round(((oldWpm * oldCount) + wpm) / newCount);
                stats.bigramErrors[pair] = { count: newCount, avgWpm: newWpm };
            }
        }

        // 2. Tracciamento Parola
        if (real !== typed) {
            const oldData = stats.wordErrors[real] || { count: 0, avgWpm: 0 };
            const oldCount = oldData.count || (typeof oldData === 'number' ? oldData : 0);
            const oldWpm = oldData.avgWpm || wpm;

            const newCount = oldCount + 1;
            const newWpm = Math.round(((oldWpm * oldCount) + wpm) / newCount);
            stats.wordErrors[real] = { count: newCount, avgWpm: newWpm };
        }

        statsRef.update(stats);
    });
};

// --- AZIONI PULSANTI ---

if (els.saveAliasBtn) {
    els.saveAliasBtn.addEventListener('click', async () => {
        const alias = els.userAliasInput ? els.userAliasInput.value.trim() : "";
        const privacy = els.privacyUsernameCheckbox ? els.privacyUsernameCheckbox.checked : false;

        if (alias) {
            // Nuovi Vincoli: 1 parola, max 10 caratteri
            if (alias.includes(" ")) return alert("L'Alias deve essere una singola parola (senza spazi).");
            if (alias.length > 10) return alert("L'Alias non può superare i 10 caratteri.");
        }

        if (privacy && !alias) return alert("L'Alias è obbligatorio se nascondi lo username Telegram!");
        const newName = alias || tgUser.first_name;
        const currentUsername = privacy ? "" : tgUsername;
        try {
            await db.ref(`users/${myId}`).update({ alias: alias || null, privacyUsername: privacy });
            myName = newName; myPrivacy = privacy;
            if (els.playerName) els.playerName.textContent = myName;
            showToast("Profilo aggiornato!");
            await window.syncUserNameEverywhere(myId, newName, currentUsername);
        } catch(e) {
            alert("Errore durante il salvataggio: " + e.message);
        }
    });
}

if (document.getElementById('resetStatsBtn')) {
    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
        if (confirm("Vuoi azzerare tutte le tue statistiche?")) {
            try {
                await Promise.all([ db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove() ]);
                showToast("Dati azzerati!");
                window.loadProfileInfo();
            } catch(e) { alert("Errore."); }
        }
    });
}

document.getElementById('btnResetErrorStats')?.addEventListener('click', () => {
    if (confirm("Vuoi azzerare solo i dati analitici degli errori (Bigrammi e Parole)? Lo storico rimarrà intatto.")) {
        db.ref(`users/${myId}/stats/bigramErrors`).remove();
        db.ref(`users/${myId}/stats/wordErrors`).remove();
        db.ref(`users/${myId}/stats/charErrors`).remove();
        showToast("Dati errori azzerati!");
        window.loadAdvancedStats();
    }
});

document.getElementById('btnCreateErrorDict')?.addEventListener('click', () => {
    db.ref(`users/${myId}/stats/wordErrors`).once('value', snap => {
        const words = snap.val() || {};
        const wordTh = parseInt(document.getElementById('wordThresholdInput')?.value) || 3;
        const critical = Object.entries(words)
            .filter(e => {
                const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
                return count >= wordTh;
            })
            .map(e => e[0]);

        if (critical.length === 0) return showToast(`Non hai ancora abbastanza parole critiche (min. ${wordTh} errori).`);

        window.customDictionary = critical;
        localStorage.setItem(STORAGE_CUSTOM_DICT_KEY, JSON.stringify(critical));
        showToast(`✅ Creato dizionario con ${critical.length} parole difficili!`);
        showScreen('setupScreen');
        if (els.gameTypeInput) els.gameTypeInput.value = 'single';
        if (els.gameModeInput) {
            els.gameModeInput.value = 'custom';
            window.checkGameTypeUI();
        }
    });
});
