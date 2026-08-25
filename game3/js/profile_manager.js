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

        // --- FIX IPHONE/KEYBOARD: Gestione Enter e Scroll ---
        const bTh = document.getElementById('bigramThresholdInput');
        const wTh = document.getElementById('wordThresholdInput');

        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); // Nasconde la tastiera su iOS
                window.loadAdvancedStats();
            }
        };

        const handleFocus = (e) => {
            // Assicura che l'input sia centrato e visibile quando si apre la tastiera
            setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        };

        if (bTh) {
            bTh.removeEventListener('keydown', handleEnter);
            bTh.addEventListener('keydown', handleEnter);
            bTh.removeEventListener('focus', handleFocus);
            bTh.addEventListener('focus', handleFocus);
            bTh.removeEventListener('change', window.loadAdvancedStats);
            bTh.addEventListener('change', window.loadAdvancedStats);
        }
        if (wTh) {
            wTh.removeEventListener('keydown', handleEnter);
            wTh.addEventListener('keydown', handleEnter);
            wTh.removeEventListener('focus', handleFocus);
            wTh.addEventListener('focus', handleFocus);
            wTh.removeEventListener('change', window.loadAdvancedStats);
            wTh.addEventListener('change', window.loadAdvancedStats);
        }

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

    // Popoliamo gli input con i valori attuali dell'utente
    if (els.userAliasInput) els.userAliasInput.value = myName || "";

    // Toggle Privacy
    if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = window.myPrivacy ?? true;
    if (els.privacyOnlineCheckbox) els.privacyOnlineCheckbox.checked = window.myPrivacyOnline ?? false;
    if (els.privacyLeaderboardCheckbox) els.privacyLeaderboardCheckbox.checked = window.myPrivacyLeaderboard ?? false;
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

window.syncUserNameEverywhere = async function(userId, newName, newUsername, privLb = false) {
    // 1. Presenza e Stanza Attiva
    await db.ref(`presence/${userId}`).update({
        name: newName,
        username: newUsername,
        privacyLeaderboard: privLb
    });
    if (roomCode) await db.ref(`rooms/${roomCode}/players/${userId}`).update({ name: newName, username: newUsername });

    // ... (rest of the function) ...
    // 5. Leaderboard (Fix Privacy & Alias su tutti i record esistenti)
    await window.updateUserInAllLeaderboards(newName, newUsername, privLb);

    // 6. Tornei (Aggiornamento slot nel torneo attivo)
    if (window.activeTrnId) {
        try {
            const trnSnap = await db.ref(`tournaments/${window.activeTrnId}`).once('value');
            if (trnSnap.exists() && trnSnap.val().matches) {
                const matches = trnSnap.val().matches;
                for (const mId in matches) {
                    const match = matches[mId];
                    if (match.playerA && match.playerA.id === userId) {
                        await db.ref(`tournaments/${window.activeTrnId}/matches/${mId}/playerA`).update({ name: newName });
                    }
                    if (match.playerB && match.playerB.id === userId) {
                        await db.ref(`tournaments/${window.activeTrnId}/matches/${mId}/playerB`).update({ name: newName });
                    }
                }
            }
        } catch(e) { console.error("Trn Sync Error:", e); }
    }
};

window.updateUserInAllLeaderboards = async function(newName, newUsername, privLb = false) {
    console.log("Privacy: Updating all leaderboard entries for user (PrivacyLB: " + privLb + ")...");

    // Percorsi con struttura fissa CATEGORIA/UID
    const fixedPaths = [
        `leaderboard/callsign/global/${myId}`,
        `leaderboard/arcade/all/${myId}`,
        `leaderboard/arcade/global/${myId}`,
        `leaderboard/la_torre/all/${myId}`
    ];

    for (const path of fixedPaths) {
        try {
            const snap = await db.ref(path).once('value');
            if (snap.exists()) await db.ref(path).update({ name: newName, username: newUsername, privacyLeaderboard: privLb });
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
                        subNode.child(myId).ref.update({ name: newName, username: newUsername, privacyLeaderboard: privLb });
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
        if (dSnap.exists()) await dailyRef.update({ name: newName, username: newUsername, privacyLeaderboard: privLb });
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
        const privacy = els.privacyUsernameCheckbox ? els.privacyUsernameCheckbox.checked : true;
        const privacyOnline = els.privacyOnlineCheckbox ? els.privacyOnlineCheckbox.checked : false;
        const privacyLeaderboard = els.privacyLeaderboardCheckbox ? els.privacyLeaderboardCheckbox.checked : false;

        if (alias) {
            const isValid = (typeof window.isNameValid === 'function') ? window.isNameValid(alias) : true;
            if (!isValid) return alert("L'Alias non è valido. Deve contenere almeno 2 caratteri di testo e massimo 1 icona.");
            if (alias.length > 15) return alert("L'Alias non può superare i 15 caratteri.");
        }

        if (privacy && !alias) return alert("L'Alias è obbligatorio se nascondi lo username Telegram!");

        const newName = alias || (window.tgUser ? window.tgUser.first_name : "Operatore");
        const currentUsername = privacy ? "" : window.tgUsername;

        try {
            const updates = {
                alias: alias || null,
                privacyUsername: privacy,
                privacyOnline: privacyOnline,
                privacyLeaderboard: privacyLeaderboard
            };

            await db.ref(`users/${window.myId}`).update(updates);

            // Aggiornamento stato locale
            window.myName = newName;
            window.myPrivacy = privacy;
            window.myPrivacyOnline = privacyOnline;
            window.myPrivacyLeaderboard = privacyLeaderboard;

            if (els.playerName) els.playerName.textContent = window.myName;
            showToast("Profilo aggiornato!");

            // Sincronizziamo nome e privacy nel nodo presence
            if (db && myId) {
                await db.ref(`presence/${myId}`).update({
                    name: newName,
                    username: currentUsername,
                    privacyOnline: privacyOnline,
                    privacyLeaderboard: privacyLeaderboard
                });
            }

            await window.syncUserNameEverywhere(window.myId, newName, currentUsername, privacyLeaderboard);
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

if (els.deleteDataBtn) {
    els.deleteDataBtn.onclick = async () => {
        if (!confirm("ATTENZIONE: Questa azione eliminerà DEFINITIVAMENTE tutto il tuo profilo, i progressi del corso, le statistiche e lo storico. Non potrai tornare indietro.\n\nVuoi procedere?")) return;
        if (!confirm("CONFERMA FINALE: Sei assolutamente sicuro? Tutti i record in classifica verranno rimossi.")) return;

        showToast("Eliminazione dati in corso...");

        try {
            // 1. Dati Utente, Presenza e Iscrizione Corso
            await db.ref(`users/${window.myId}`).remove();
            await db.ref(`presence/${window.myId}`).remove();
            await db.ref(`courseActiveEnrollments/${window.myId}`).remove();

            // 2. Mappatura di Sicurezza (ID Firebase -> ID Telegram)
            const firebaseUid = firebase.auth().currentUser?.uid;
            if (firebaseUid) {
                await db.ref(`uid_mapping/${firebaseUid}`).remove();
            }

            // 3. Richieste Amministrative (Tutor)
            const tutorReqSnap = await db.ref('tutorRequests').once('value');
            if (tutorReqSnap.exists()) {
                tutorReqSnap.forEach(child => {
                    if (child.val().uid === window.myId) child.ref.remove();
                });
            }

            // 4. Attività (Storico classifiche partecipazione)
            const now = new Date();
            const dKey = now.toISOString().split('T')[0];
            const wKey = window.getWeekNumber(now);
            const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

            await Promise.all([
                db.ref(`activity/daily/${dKey}/${window.myId}`).remove(),
                db.ref(`activity/weekly/${wKey}/${window.myId}`).remove(),
                db.ref(`activity/monthly/${mKey}/${window.myId}`).remove()
            ]);

            // 3. Rimozione da tutte le Leaderboard (Standard, Chars, etc)
            const categories = ['standard', 'chars', 'quiz', 'pingpong'];
            for (const cat of categories) {
                try {
                    const catSnap = await db.ref(`leaderboard/${cat}`).once('value');
                    if (catSnap.exists()) {
                        catSnap.forEach(subNode => {
                            if (subNode.hasChild(window.myId)) {
                                subNode.child(window.myId).ref.remove();
                            }
                        });
                    }
                } catch(e) { console.warn(`Clean LB ${cat} error:`, e); }
            }

            // Leaderboard con percorsi fissi
            await db.ref(`leaderboard/callsign/global/${window.myId}`).remove();
            await db.ref(`leaderboard/arcade/all/${window.myId}`).remove();
            await db.ref(`leaderboard/arcade/global/${window.myId}`).remove();

            // 4. Rimozione da Battaglia Serale (Battle Royale) se iscritto
            try {
                const brDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
                const brCode = "BR_" + brDate;
                await db.ref(`rooms/${brCode}/players/${window.myId}`).remove();
            } catch(e) { console.warn("Clean BR error:", e); }

            // 5. Rimozione Inviti e Sfide pendenti
            await db.ref(`invites/${window.myId}`).remove();
            await db.ref(`invite_accepted/${window.myId}`).remove();

            // 6. Gestione Squadra (Uscita o Eliminazione totale)
            if (window.myTeamId) {
                const teamRef = db.ref(`teams/${window.myTeamId}`);
                const teamSnap = await teamRef.once('value');
                if (teamSnap.exists()) {
                    const team = teamSnap.val();
                    const members = team.members || {};
                    const memberIds = Object.keys(members).filter(id => id !== window.myId);

                    if (memberIds.length === 0) {
                        // Se ero l'ultimo membro, elimina tutta la squadra
                        console.log("Delete Data: Removing empty team", window.myTeamId);
                        await teamRef.remove();
                        // Rimuovi anche riferimenti dai tornei
                        const trnSnap = await db.ref('tournaments').once('value');
                        if (trnSnap.exists()) {
                            trnSnap.forEach(tSnap => {
                                db.ref(`tournaments/${tSnap.key}/teams/${window.myTeamId}`).remove();
                                db.ref(`tournaments/${tSnap.key}/standings/${window.myTeamId}`).remove();
                            });
                        }
                    } else if (team.captainId === window.myId) {
                        // Se ero il capitano ma ci sono altri, passa il comando al prossimo
                        const nextCaptain = memberIds[0];
                        await teamRef.update({ captainId: nextCaptain });
                        await teamRef.child(`members/${window.myId}`).remove();
                    } else {
                        // Membro semplice, rimuovi solo me
                        await teamRef.child(`members/${window.myId}`).remove();
                    }
                }
            }

            showToast("Profilo eliminato con successo.");

            // 5. Pulizia Locale e Chiusura App
            localStorage.clear();
            setTimeout(() => {
                if (window.tg && typeof window.tg.close === 'function') {
                    window.tg.close();
                } else {
                    location.reload(); // Fallback se non siamo in ambiente Telegram
                }
            }, 1500);

        } catch (e) {
            console.error("Delete Data Error:", e);
            alert("Errore durante l'eliminazione: " + e.message);
        }
    };
}
