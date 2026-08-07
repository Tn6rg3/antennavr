// ============================================================================
// LEADERBOARD.JS - CLASSIFICHE GLOBALI, MEDAGLIE, STORICO E PROFILO
// ============================================================================

import { appState, gameState, uiState, clearAllTimers } from './state.js';
import { els, escapeHTML, showToast, showScreen } from './ui.js';
import { playBeep } from './audio.js';

export function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); 
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0');
}

export function updateActivity(won = false) {
    const now = new Date(); 
    const dKey = now.toISOString().split('T')[0]; 
    const wKey = getWeekNumber(now); 
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    ['daily/'+dKey, 'weekly/'+wKey, 'monthly/'+mKey].forEach(path => {
        appState.db.ref(`activity/${path}/${appState.myId}`).transaction(data => {
            if (!data) return { name: appState.myName, games: 1, wins: won ? 1 : 0, lastPlayed: window.firebase.database.ServerValue.TIMESTAMP };
            data.games = (data.games || 0) + 1; 
            if (won) data.wins = (data.wins || 0) + 1; 
            data.name = appState.myName; 
            data.lastPlayed = window.firebase.database.ServerValue.TIMESTAMP; 
            return data;
        }).then(() => { if (path.startsWith('daily')) checkActivityAndAwardMedals(); });
    });
}

export async function checkActivityAndAwardMedals() {
    const now = new Date(); 
    const dKey = now.toISOString().split('T')[0]; 
    const wKey = getWeekNumber(now); 
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    try {
        const [dSnap, wSnap, mSnap, uMedals] = await Promise.all([
            appState.db.ref(`activity/daily/${dKey}/${appState.myId}`).once('value'),
            appState.db.ref(`activity/weekly/${wKey}/${appState.myId}`).once('value'),
            appState.db.ref(`activity/monthly/${mKey}/${appState.myId}`).once('value'),
            appState.db.ref(`users/${appState.myId}/medals`).once('value')
        ]);
        const dData = dSnap.val() || { games: 0 }, wData = wSnap.val() || { games: 0 }, mData = mSnap.val() || { games: 0 };
        let myMedals = uMedals.val() || {};

        const validKeys = [dKey, wKey, mKey, 'daily_champ'];
        for (let id in myMedals) {
            if (!validKeys.includes(myMedals[id].periodKey)) {
                await appState.db.ref(`users/${appState.myId}/medals/${id}`).remove();
                delete myMedals[id];
            }
        }

        const check = (count, thresh, id, title, desc, icon, pKey) => { 
            if (count >= thresh && (!myMedals[id] || myMedals[id].periodKey !== pKey)) { 
                awardMedal(id, title, desc, icon, pKey); 
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
    updateMedalGallery();
}

export function awardMedal(id, title, desc, icon, periodKey) {
    appState.db.ref(`users/${appState.myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon, periodKey });
    if (els.overlayMedalIcon) els.overlayMedalIcon.textContent = icon; 
    if (els.overlayMedalTitle) els.overlayMedalTitle.textContent = title; 
    if (els.overlayMedalDesc) els.overlayMedalDesc.textContent = desc; 
    if (els.medalOverlay) els.medalOverlay.style.display = 'flex';
    playBeep(880, 0.15);
    updateMedalGallery();
}

export function updateMedalGallery() {
    if (!els.myMedalsContainer) return;
    appState.db.ref(`users/${appState.myId}/medals`).once('value', snap => {
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
}

export function switchActTab(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab')); 
    if (els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`]) {
        els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`].classList.add('active-tab');
    }
    const now = new Date(); 
    let key = period === 'daily' ? now.toISOString().split('T')[0] : period === 'weekly' ? getWeekNumber(now) : now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    if (els.actListTitle) {
        els.actListTitle.textContent = period === 'daily' ? "I più attivi di Oggi" : period === 'weekly' ? "I più attivi della Settimana" : "I più attivi del Mese";
    }
    renderActivityRankings(period, key); 
    updateMedalGallery();
}

function renderActivityRankings(period, key) {
    if (!els.activityRankList) return;
    els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Caricamento...</li>';
    appState.db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = ''; 
        let users = [];
        if (snap.exists()) snap.forEach(child => { const u = child.val(); if (u && typeof u === 'object') users.push({ id: child.key, ...u }); });
        users.sort((a, b) => (b.games || 0) - (a.games || 0)); users = users.slice(0, 50);
        if (users.length === 0) {
            els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna attività registrata.</li>'; return;
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
        els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Errore nel caricamento.</li>';
    });
}

export function showLeaderboardTab(tabId) {
    const mapping = {
        'tabRoomBtn': 'room', 'opt_lb_daily': 'daily_challenge', 'tabGlobalTournamentBtn': 'trn_global',
        'tabGlobalCWFreakBtn': 'cwfreak', 'tabGlobalPingPongBtn': 'pingpong', 'tabGlobalStandardMultiBtn': 'std_multi',
        'tabGlobalStandardSingleBtn': 'std_single', 'tabGlobalCharsMultiBtn': 'chars_multi',
        'tabGlobalCharsSingleBtn': 'chars_single', 'tabGlobalQuizMultiBtn': 'quiz_multi', 'tabGlobalQuizSingleBtn': 'quiz_single'
    };
    let modeValue = mapping[tabId] || tabId;
    if (els.lbModeSelect) els.lbModeSelect.value = modeValue;
    if (els.trnSubTabs) els.trnSubTabs.style.display = 'none';

    if (modeValue === 'room') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'block'; 
        if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '';
        if (gameState.roomCode) appState.db.ref(`rooms/${gameState.roomCode}/players`).once('value', snap => renderRoomLeaderboard(snap.val() || {}));
        else if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Nessuna partita attiva.</p>';
    } else if (modeValue === 'daily_challenge') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block'; 
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; 
        let isMulti = modeValue.endsWith('_multi');
        let type = isMulti ? 'multi' : 'single';
        let baseMode = modeValue.startsWith('chars') ? 'chars' : (modeValue.startsWith('quiz') ? 'quiz' : 'standard');
        let filterPath = isMulti ? `recent_matches/${baseMode}_multi` : baseMode;
        populateDynamicFilters(filterPath, isMulti ? '' : 'single');
        fetchAndRenderGlobalLeaderboard(`${baseMode}_${type}`, els.lbWordFilter ? els.lbWordFilter.value : 'all');
    }
}

export function populateDynamicFilters(modePath, subTypeFilter = "") {
    if (!els.lbWordFilter) return;
    const currentValue = els.lbWordFilter.value;
    appState.db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
        let options = ['<option value="all">Tutte le categorie</option>']; 
        let counts = [];
        snapshot.forEach(wordCountNode => {
            const key = wordCountNode.key;
            if (modePath.startsWith('recent_matches')) { 
                if (key !== 'unknown' && !counts.includes(key)) counts.push(key); 
            } else if (!subTypeFilter || key.startsWith(subTypeFilter + "_")) { 
                const count = key.split('_').pop(); 
                if (!counts.includes(count)) counts.push(count); 
            }
        });
        counts.sort((a,b) => parseInt(a) - parseInt(b)).forEach(c => options.push(`<option value="${c}">${c} Stringhe</option>`));
        els.lbWordFilter.innerHTML = options.join(''); 
        if (counts.includes(currentValue) || currentValue === 'all') els.lbWordFilter.value = currentValue;
    });
}

export function renderRoomLeaderboard(players) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = ''; 
    let allFinished = true;
    const playersArray = Object.entries(players).map(([id, data]) => ({ 
        id, name: data.name || "Sconosciuto", username: data.username, score: data.score || 0, wpm: data.wpm || 0, finished: data.finished, matchDetails: data.matchDetails || [] 
    }));
    if (playersArray.length === 0) return;
    playersArray.forEach(p => { if (!p.finished) allFinished = false; });

    if (allFinished && (gameState.roomCode && (gameState.roomCode.startsWith("TRN_") || gameState.mode === 'pingpong' || playersArray.length > 1))) {
        renderHeadToHeadView(playersArray, els.leaderboardContainer);
    } else {
        playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, index) => {
            const row = document.createElement('div'); row.className = 'leaderboard-row';
            let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const leftSpan = document.createElement('span'); leftSpan.appendChild(document.createTextNode(medal + " " + player.name));
            leftSpan.appendChild(document.createElement('br')); 
            const wpmSmall = document.createElement('small'); wpmSmall.style.color = 'var(--hint-color)'; wpmSmall.textContent = `(${player.wpm || 0} WPM)`;
            leftSpan.appendChild(wpmSmall);
            const rightSpan = document.createElement('span');
            const scoreB = document.createElement('b'); scoreB.textContent = `${player.score} pt`; rightSpan.appendChild(scoreB);
            row.appendChild(leftSpan); row.appendChild(rightSpan); els.leaderboardContainer.appendChild(row);
        });
    }
}

export function renderHeadToHeadView(players, container) {
    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)); 
    const maxScore = players[0].score;
    players.forEach((p) => {
        const card = document.createElement('div'); 
        card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');
        const nameDiv = document.createElement('div'); nameDiv.className = 'h2h-name'; nameDiv.textContent = p.name;
        card.appendChild(nameDiv);
        const statsDiv = document.createElement('div'); statsDiv.className = 'h2h-stats';
        const rowPt = document.createElement('div'); rowPt.className = 'h2h-stat-row'; 
        rowPt.innerHTML = `<span>Punti:</span><span class="h2h-val" style="color:#4caf50">${p.score}</span>`; statsDiv.appendChild(rowPt);
        const rowSp = document.createElement('div'); rowSp.className = 'h2h-stat-row'; 
        rowSp.innerHTML = `<span>Velocità:</span><span class="h2h-val" style="color:var(--link-color)">${p.wpm} WPM</span>`; statsDiv.appendChild(rowSp);
        card.appendChild(statsDiv);
        card.onclick = () => {
            if (p.id !== appState.myId) return showToast("Puoi vedere solo i tuoi dettagli.");
            if (p.matchDetails && p.matchDetails.length > 0) showPlayerDetailsModal(p.name, p.matchDetails);
            else if (p.id === appState.myId && gameState.matchDetails.length > 0) showPlayerDetailsModal(p.name, gameState.matchDetails);
        };
        h2h.appendChild(card);
    });
    container.appendChild(h2h);
}

export function showPlayerDetailsModal(name, details) {
    if (!els.matchDetailsBody || !els.matchDetailsModal) return;
    els.matchDetailsBody.innerHTML = '';
    details.forEach(row => {
        const tr = document.createElement('tr'); 
        let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        tr.innerHTML = `<td>${escapeHTML(row.typed || '-')}</td><td><b>${escapeHTML(row.real || '')}</b></td><td style="color:${color};font-weight:bold;">${row.points}</td>`;
        els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
}

export function showProfileScreen() {
    showScreen('profileScreen'); 
    if (els.errorChartContainer) els.errorChartContainer.textContent = 'Caricamento...'; 
    if (els.matchHistoryList) els.matchHistoryList.textContent = 'Caricamento...';
    
    appState.db.ref(`users/${appState.myId}/stats/charErrors`).once('value').then(snap => {
        if (!els.errorChartContainer) return;
        const errors = snap.val() || {}; 
        els.errorChartContainer.innerHTML = ''; 
        const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) { 
            els.errorChartContainer.innerHTML = '<p style="text-align:center; color:var(--hint-color);">Nessun errore.</p>'; 
        } else {
            let maxErr = sorted[0][1];
            sorted.forEach(([char, count]) => {
                const row = document.createElement('div'); row.style.cssText = "display:flex; align-items:center; margin-bottom:4px;";
                row.innerHTML = `<span style="width:20px; font-weight:bold;">${escapeHTML(char)}</span><div style="flex-grow:1; background:var(--bg-color); border:1px solid var(--hint-color); border-radius:4px; height:12px; margin:0 5px; overflow:hidden;"><div style="width:${(count / maxErr) * 100}%; background:#d32f2f; height:100%;"></div></div><span style="width:25px; text-align:right; font-size:0.9em; font-weight:bold;">${count}</span>`;
                els.errorChartContainer.appendChild(row);
            });
        }
    });

    appState.db.ref(`users/${appState.myId}/history`).orderByChild('date').limitToLast(30).once('value').then(snap => {
        if (!els.matchHistoryList) return;
        els.matchHistoryList.innerHTML = ''; 
        appState.userMatchHistory = [];
        snap.forEach(child => { appState.userMatchHistory.push({ key: child.key, ...child.val() }); }); 
        appState.userMatchHistory.reverse();
        if (appState.userMatchHistory.length === 0) { 
            els.matchHistoryList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna partita giocata.</li>'; return; 
        }
        appState.userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now()); 
            const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            const li = document.createElement('li'); li.style.cssText = "flex-direction:column; align-items:flex-start;";
            li.innerHTML = `<div style="display:flex; justify-content:space-between; width:100%; margin-bottom:5px;"><span style="font-size:0.85em; font-weight:bold;">${escapeHTML(match.mode)} (${escapeHTML(match.type)})</span><span style="font-size:0.8em; color:var(--hint-color);">${dateStr}</span></div><div style="display:flex; justify-content:space-between; width:100%; align-items:center;"><span><b>${match.score} pt</b> <small>(${match.wpm} WPM)</small></span></div>`;
            els.matchHistoryList.appendChild(li);
        });
    });
}

export async function syncUserNameEverywhere(userId, newName, newUsername) {
    await appState.db.ref(`presence/${userId}`).update({ name: newName, username: newUsername });
    if (gameState.roomCode) await appState.db.ref(`rooms/${gameState.roomCode}/players/${userId}`).update({ name: newName, username: newUsername });
    const now = new Date(); 
    const dKey = now.toISOString().split('T')[0]; 
    const wKey = getWeekNumber(now); 
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    for (const path of [`activity/daily/${dKey}`, `activity/weekly/${wKey}`, `activity/monthly/${mKey}`]) { 
        const actRef = appState.db.ref(`${path}/${userId}`); 
        const actSnap = await actRef.once('value'); 
        if (actSnap.exists()) await actRef.update({ name: newName }); 
    }
}
