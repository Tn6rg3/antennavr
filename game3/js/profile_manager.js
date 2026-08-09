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
    } catch(e) {}
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

window.showProfileScreen = function() {
    showScreen('profileScreen');
    if (els.errorChartContainer) els.errorChartContainer.textContent = 'Caricamento...';
    if (els.wpmErrorChartContainer) els.wpmErrorChartContainer.textContent = 'Caricamento...';
    if (els.matchHistoryList) els.matchHistoryList.textContent = 'Caricamento...';

    db.ref(`users/${myId}/stats/charErrors`).once('value').then(snap => {
        if (!els.errorChartContainer) return;
        const errors = snap.val() || {};
        els.errorChartContainer.innerHTML = '';
        const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) {
            const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore.'; els.errorChartContainer.appendChild(p);
        } else {
            let maxErr = sorted[0][1];
            sorted.forEach(([char, count]) => {
                const row = document.createElement('div'); row.style.cssText = "display:flex; align-items:center; margin-bottom:4px;";
                const spanChar = document.createElement('span'); spanChar.style.cssText = "width:20px; font-weight:bold;"; spanChar.textContent = char;
                const barWrap = document.createElement('div'); barWrap.style.cssText = "flex-grow:1; background:var(--bg-color); border:1px solid var(--hint-color); border-radius:4px; height:12px; margin:0 5px; overflow:hidden;";
                const barFill = document.createElement('div'); barFill.style.cssText = `width:${(count / maxErr) * 100}%; background:#d32f2f; height:100%;`;
                barWrap.appendChild(barFill);
                const spanCount = document.createElement('span'); spanCount.style.cssText = "width:25px; text-align:right; font-size:0.9em; font-weight:bold;"; spanCount.textContent = count;
                row.appendChild(spanChar); row.appendChild(barWrap); row.appendChild(spanCount);
                els.errorChartContainer.appendChild(row);
            });
        }
    });

    db.ref(`users/${myId}/stats/errorsByWpm`).once('value').then(snap => {
        if (!els.wpmErrorChartContainer) return;
        const wpmErrors = snap.val() || {};
        els.wpmErrorChartContainer.innerHTML = '';
        if (Object.keys(wpmErrors).length === 0) {
            const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.textContent = 'Nessun errore per WPM.'; els.wpmErrorChartContainer.appendChild(p);
            return;
        }
        Object.keys(wpmErrors).sort((a,b) => parseInt(b) - parseInt(a)).forEach(wpm => {
            let charsAtWpm = wpmErrors[wpm];
            let totalErrs = Object.values(charsAtWpm).reduce((acc, curr) => acc + curr, 0);
            let topChar = Object.entries(charsAtWpm).sort((a,b) => b[1] - a[1])[0];
            const row = document.createElement('div'); row.style.cssText = "margin-bottom:8px; border-bottom:1px solid var(--hint-color); padding-bottom:4px;";
            const divTop = document.createElement('div'); divTop.style.cssText = "display:flex; justify-content:space-between; font-weight:bold; color:var(--link-color);";
            const spanWpm = document.createElement('span'); spanWpm.textContent = `${wpm} WPM`;
            const spanTot = document.createElement('span'); spanTot.textContent = `Tot: ${totalErrs} err`;
            divTop.appendChild(spanWpm); divTop.appendChild(spanTot);
            const divBot = document.createElement('div'); divBot.style.cssText = "font-size:0.85em; color:var(--text-color);";
            divBot.appendChild(document.createTextNode("Peggior lettera: "));
            const bChar = document.createElement('b'); bChar.textContent = topChar[0]; divBot.appendChild(bChar); divBot.appendChild(document.createTextNode(` (${topChar[1]} volte)`));
            row.appendChild(divTop); row.appendChild(divBot);
            els.wpmErrorChartContainer.appendChild(row);
        });
    });

    db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(30).once('value').then(snap => {
        if (!els.matchHistoryList) return;
        els.matchHistoryList.innerHTML = '';
        userMatchHistory = [];
        snap.forEach(child => { userMatchHistory.push({ key: child.key, ...child.val() }); });
        userMatchHistory.reverse();
        if (userMatchHistory.length === 0) {
            const li = document.createElement('li'); li.style.justifyContent = 'center'; li.style.color = 'var(--hint-color)'; li.textContent = 'Nessuna partita giocata.'; els.matchHistoryList.appendChild(li);
            return;
        }
        userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now());
            const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            let modeIcon = match.mode === 'callsign' ? '🎙️ Nom.' : match.mode === 'pingpong' ? '🏓 Ping Pong' : match.mode === 'chars' ? '⌨️ Carat.' : (match.mode === 'daily_challenge' ? '📅 Daily' : match.mode === 'quiz' ? '❓ Quiz' : '🔤 Parole');
            const li = document.createElement('li'); li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';

            const topDiv = document.createElement('div'); topDiv.style.cssText = "display:flex; justify-content:space-between; width:100%; margin-bottom:5px;";
            const spanLeft = document.createElement('span'); spanLeft.style.cssText = "font-size:0.85em; font-weight:bold;"; spanLeft.textContent = `${modeIcon} (${match.type})`;
            const spanRight = document.createElement('span'); spanRight.style.cssText = "font-size:0.8em; color:var(--hint-color);"; spanRight.textContent = dateStr;
            topDiv.appendChild(spanLeft); topDiv.appendChild(spanRight);

            const botDiv = document.createElement('div'); botDiv.style.cssText = "display:flex; justify-content:space-between; width:100%; align-items:center;";
            const spanScore = document.createElement('span'); const bScore = document.createElement('b'); bScore.textContent = `${match.score} pt`; const smallWpm = document.createElement('small'); smallWpm.textContent = ` (${match.wpm} WPM)`;
            spanScore.appendChild(bScore); spanScore.appendChild(smallWpm);

            const btnDiv = document.createElement('div'); btnDiv.style.display = 'flex'; btnDiv.style.gap = '5px';
            const vBtn = document.createElement('button'); vBtn.className = "action-btn-small btn-secondary"; vBtn.textContent = "Vedi"; vBtn.onclick = () => openMatchDetails(match.key);
            const dBtn = document.createElement('button'); dBtn.className = "action-btn-small btn-danger"; dBtn.textContent = "X"; dBtn.onclick = () => deleteHistoryItem(match.key);
            btnDiv.appendChild(vBtn); btnDiv.appendChild(dBtn); botDiv.appendChild(spanScore); botDiv.appendChild(btnDiv);
            li.appendChild(topDiv); li.appendChild(botDiv); els.matchHistoryList.appendChild(li);
        });
    });
};

window.openMatchDetails = function(matchKey) {
    const match = userMatchHistory.find(m => m.key === matchKey);
    if (!match || !els.matchDetailsBody || !els.matchDetailsModal) return;
    els.matchDetailsBody.innerHTML = '';
    (match.details || []).forEach(row => {
        const tr = document.createElement('tr');
        let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
};

window.deleteHistoryItem = function(key) {
    if (confirm("Eliminare questa partita?")) {
        db.ref(`users/${myId}/history/${key}`).remove().then(() => window.showProfileScreen());
    }
};

window.syncUserNameEverywhere = async function(userId, newName, newUsername) {
    await db.ref(`presence/${userId}`).update({ name: newName, username: newUsername });
    if (roomCode) await db.ref(`rooms/${roomCode}/players/${userId}`).update({ name: newName, username: newUsername });
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) {
        const actRef = db.ref(`${path}/${userId}`);
        const actSnap = await actRef.once('value');
        if (actSnap.exists()) await actRef.update({ name: newName });
    }
    if (myTeamId) await db.ref(`teams/${myTeamId}/members/${userId}`).update({ name: newName, username: newUsername });

    const trnsSnap = await db.ref('tournaments').once('value');
    if (trnsSnap.exists()) {
        const trns = trnsSnap.val();
        for (let trnId in trns) {
            if (trns[trnId].status !== 'finished' && trns[trnId].matches) {
                for (let mId in trns[trnId].matches) {
                    const m = trns[trnId].matches[mId];
                    if (m.playerA && m.playerA.id === userId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerA`).update({ name: newName, username: newUsername });
                    if (m.playerB && m.playerB.id === userId) await db.ref(`tournaments/${trnId}/matches/${mId}/playerB`).update({ name: newName, username: newUsername });
                }
            }
        }
    }
    for (const path of ['callsign/global', 'standard', 'pingpong', 'chars', 'quiz']) {
        const snap = await db.ref(`leaderboard/${path}`).once('value');
        if (snap.exists()) {
            snap.forEach(subNode => {
                if (path === 'callsign/global') {
                    if (subNode.key === userId) subNode.ref.update({ name: newName, username: newUsername });
                } else {
                    subNode.forEach(userRecord => {
                        if (userRecord.key === userId) userRecord.ref.update({ name: newName, username: newUsername });
                    });
                }
            });
        }
    }
};
