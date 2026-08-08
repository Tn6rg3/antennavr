/**
 * UI.JS
 * Screen management, leaderboards, profile, and medals
 */

function showScreen(screenId) {
    if (typeof clearAllTimers === 'function') clearAllTimers();
    if (document.activeElement?.blur) document.activeElement.blur();
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');
    if (typeof hideChat === 'function') hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';
    const isPlayingS = ['lobbyScreen', 'gameArea', 'countdownScreen', 'quizArea', 'brScreen'].includes(screenId);
    if (db && myId) { try { db.ref(`presence/${myId}`).update({ status: isPlayingS ? 'playing' : 'online' }); } catch(e) {} }
    if (screenId === 'setupScreen') {
        const lR = localStorage.getItem(STORAGE_ROOM_KEY);
        if (!lR && els.rejoinContainer) els.rejoinContainer.style.display = 'none';
        else if (lR && els.rejoinContainer) { els.rejoinContainer.style.display = 'block'; if (els.rejoinGameBtn) els.rejoinGameBtn.onclick = () => { roomCode = lR; isRejoining = true; if (typeof joinRoomLogic === 'function') joinRoomLogic(false); }; }
        if (typeof listenToOnlineUsers === 'function') listenToOnlineUsers();
        if (typeof listenToRooms === 'function') listenToRooms();
    } else {
        if (listeners.presence?.ref) { listeners.presence.ref.off('child_added', listeners.presence.onAdded); listeners.presence.ref.off('child_changed', listeners.presence.onChanged); listeners.presence.ref.off('child_removed', listeners.presence.onRemoved); listeners.presence = null; }
        if (listeners.roomsList?.ref) { listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded); listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged); listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved); listeners.roomsList = null; }
    }
    if (isPlayingS) {
        if (listeners.activeChat['chatMessages']) { listeners.activeChat['chatMessages'].ref.off('value', listeners.activeChat['chatMessages'].callback); delete listeners.activeChat['chatMessages']; }
        if (screenId === 'lobbyScreen' || screenId === 'gameArea') { activeChatContext = 'room'; if (typeof listenToChat === 'function') listenToChat(); } else activeChatContext = null;
    } else if (screenId === 'teamsScreen') { activeChatContext = 'team'; if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); }
    else { if (screenId === 'participationScreen') if (typeof switchActTab === 'function') switchActTab('daily'); if (activeChatContext !== 'global') { activeChatContext = 'global'; if (typeof listenToChat === 'function') listenToChat(); } }
}

function hideChat() {
    if (els.chatDrawer) els.chatDrawer.style.display = 'none'; isChatDrawerOpen = false; chatCwAudioQueue = [];
    Object.keys(listeners.activeChat).forEach(k => { if (listeners.activeChat[k]?.ref) listeners.activeChat[k].ref.off('value', listeners.activeChat[k].callback); delete listeners.activeChat[k]; });
}

function showLeaderboardTab(tabId) {
    const mapping = { 'tabRoomBtn': 'room', 'opt_lb_daily': 'daily_challenge', 'tabGlobalTournamentBtn': 'trn_global', 'tabGlobalCWFreakBtn': 'cwfreak', 'tabGlobalPingPongBtn': 'pingpong', 'tabGlobalStandardMultiBtn': 'std_multi', 'tabGlobalStandardSingleBtn': 'std_single', 'tabGlobalCharsMultiBtn': 'chars_multi', 'tabGlobalCharsSingleBtn': 'chars_single', 'tabGlobalQuizMultiBtn': 'quiz_multi', 'tabGlobalQuizSingleBtn': 'quiz_single' };
    let modeV = mapping[tabId] || tabId; if (els.lbModeSelect) els.lbModeSelect.value = modeV;
    if (els.trnSubTabs) els.trnSubTabs.style.display = 'none';
    if (modeV === 'room') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'block'; if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '';
        if (roomCode) db.ref(`rooms/${roomCode}/players`).once('value', snap => { if (typeof renderRoomLeaderboard === 'function') renderRoomLeaderboard(snap.val() || {}); });
        else { if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Nessuna partita attiva.</p>'; if (els.waitingOthersText) els.waitingOthersText.style.display = 'none'; }
    } else if (modeV === 'daily_challenge') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else if (modeV === 'trn_global') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        if (els.trnSubTabs) els.trnSubTabs.style.display = 'flex'; document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab')); if (els.btnTrnGlobalLB) els.btnTrnGlobalLB.classList.add('active-tab');
        if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeV === 'cwfreak') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'none'; if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (modeV === 'pingpong') {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block'; if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        if (typeof populateDynamicFilters === 'function') populateDynamicFilters('pingpong', ''); if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard('pingpong', els.lbWordFilter?.value || 'all');
    } else {
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block'; if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none'; if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
        let isM = modeV.endsWith('_multi'), type = isM ? 'multi' : 'single', baseM = 'standard';
        if (modeV.startsWith('chars')) baseM = 'chars'; if (modeV.startsWith('quiz')) baseM = 'quiz';
        let fP = isM ? `recent_matches/${baseM}_multi` : baseM; if (typeof populateDynamicFilters === 'function') populateDynamicFilters(fP, isM ? '' : 'single');
        if (typeof fetchAndRenderGlobalLeaderboard === 'function') fetchAndRenderGlobalLeaderboard(`${baseM}_${type}`, els.lbWordFilter?.value || 'all');
    }
}

function renderRoomLeaderboard(players) {
    if (!els.leaderboardContainer) return; els.leaderboardContainer.innerHTML = ''; let allF = true;
    const pA = Object.entries(players).map(([id, data]) => ({ id, name: data.name || "Sconosciuto", username: data.username, score: data.score || 0, wpm: data.wpm || 0, finished: data.finished, matchDetails: data.matchDetails || [] }));
    if (pA.length === 0) return; pA.forEach(p => { if (!p.finished) allF = false; });
    if (els.waitingOthersText) els.waitingOthersText.style.display = allF ? 'none' : 'block';
    if (allF && (roomCode && (roomCode.startsWith("TRN_") || currentMode === 'pingpong' || pA.length > 1))) { if (typeof renderHeadToHeadView === 'function') renderHeadToHeadView(pA, els.leaderboardContainer); }
    else {
        pA.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, idx) => {
            const row = document.createElement('div'); row.className = 'leaderboard-row'; let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            const lS = document.createElement('span'); lS.appendChild(document.createTextNode(med + " "));
            if (player.username) { const nL = document.createElement('span'); nL.style.cssText = "color:var(--link-color); cursor:pointer; text-decoration:underline;"; nL.textContent = player.name; nL.onclick = () => { if (typeof openTelegramProfile === 'function') openTelegramProfile(player.username); }; lS.appendChild(nL); }
            else lS.appendChild(document.createTextNode(player.name));
            lS.appendChild(document.createElement('br')); const wS = document.createElement('small'); wS.style.color = 'var(--hint-color)'; wS.textContent = `(${player.wpm || 0} WPM)`; lS.appendChild(wS);
            const rS = document.createElement('span'); const sB = document.createElement('b'); sB.textContent = `${player.score} pt`; rS.appendChild(sB); row.appendChild(lS); row.appendChild(rS); els.leaderboardContainer.appendChild(row);
        });
    }
    if (allF && pA.length > 0 && els.roomWinnerBanner) els.roomWinnerBanner.textContent = roomCode.startsWith("TRN_") ? `🏆 Vince il match: ${pA[0].name}` : `🏆 Vincitore: ${pA[0].name}`;
}

function renderHeadToHeadView(players, container) {
    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)); const maxS = players[0].score;
    players.forEach((p) => {
        const card = document.createElement('div'); card.className = 'h2h-card' + (p.score === maxS && maxS > 0 ? ' winner' : '');
        const nD = document.createElement('div'); nD.className = 'h2h-name'; nD.textContent = p.name; if (p.id === myId) { const mS = document.createElement('small'); mS.textContent = ` (${currentLang === 'it' ? 'Tu' : 'You'})`; nD.appendChild(mS); } card.appendChild(nD);
        const sD = document.createElement('div'); sD.className = 'h2h-stats';
        const rPt = document.createElement('div'); rPt.className = 'h2h-stat-row'; rPt.innerHTML = `<span>${currentLang === 'it' ? 'Punti:' : 'Points:'}</span><span class="h2h-val" style="color:#4caf50;">${p.score}</span>`; sD.appendChild(rPt);
        const rSp = document.createElement('div'); rSp.className = 'h2h-stat-row'; rSp.innerHTML = `<span>${currentLang === 'it' ? 'Velocità:' : 'Speed:'}</span><span class="h2h-val" style="color:var(--link-color);">${p.wpm} WPM</span>`; sD.appendChild(rSp);
        card.appendChild(sD); const hD = document.createElement('div'); hD.className = 'h2h-hint'; hD.textContent = p.id === myId ? (currentLang === 'it' ? 'Clicca per dettagli' : 'Click for details') : (currentLang === 'it' ? 'Dettagli privati' : 'Details are private'); card.appendChild(hD);
        if (p.id !== myId) hD.style.opacity = "0.5";
        card.onclick = () => { if (p.id !== myId) return showToast(currentLang === 'it' ? "Puoi vedere solo i tuoi dettagli." : "You can only view your own details."); if (p.matchDetails?.length > 0) { if (typeof showPlayerDetailsModal === 'function') showPlayerDetailsModal(p.name, p.matchDetails); } else if (p.id === myId && matchDetailsArray.length > 0) { if (typeof showPlayerDetailsModal === 'function') showPlayerDetailsModal(p.name, matchDetailsArray); } else showToast(currentLang === 'it' ? "Dettagli non disponibili" : "Details not available"); };
        h2h.appendChild(card);
    });
    container.appendChild(h2h);
}

function fetchAndRenderGlobalLeaderboard(tabType, filterWordCount) {
    if (!els.leaderboardContainer) return; els.leaderboardContainer.innerHTML = '<p style="text-align:center;">Caricamento...</p>';
    if (tabType === 'daily_challenge') { let tS = new Date().toISOString().split('T')[0]; db.ref(`leaderboard/daily_challenge/${tS}`).orderByChild('score').limitToLast(50).once('value', snapshot => { let p = []; if (snapshot.exists()) snapshot.forEach(c => { if (c.val()) p.push(c.val()); }); p.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(p.slice(0, 50), els.leaderboardContainer, false); }); return; }
    if (['standard_multi', 'chars_multi', 'quiz_multi'].includes(tabType)) { db.ref(`leaderboard/recent_matches/${tabType}`).once('value', snapshot => { let m = []; snapshot.forEach(wcN => { if (filterWordCount === 'all' || wcN.key === filterWordCount) wcN.forEach(mN => m.push(mN.val())); }); m.sort((a,b) => (b.ts || 0) - (a.ts || 0)); if (typeof renderMatchesHistoryHTML === 'function') renderMatchesHistoryHTML(m.slice(0, 20), els.leaderboardContainer); }); return; }
    if (tabType === 'pingpong') {
        if (filterWordCount !== 'all') { db.ref(`leaderboard/pingpong/${filterWordCount}`).orderByChild('score').limitToLast(50).once('value', snapshot => { let p = []; if (snapshot.exists()) snapshot.forEach(uN => { if (uN.val()) p.push(uN.val()); }); p.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(p.slice(0, 50), els.leaderboardContainer, true); }); }
        else { db.ref(`leaderboard/pingpong`).once('value', snapshot => { let p = []; if (snapshot.exists()) snapshot.forEach(wcN => { wcN.forEach(uN => { if (uN.val()) p.push(uN.val()); }); }); p.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(p.slice(0, 50), els.leaderboardContainer, true); }); }
        return;
    }
    if (tabType === 'callsign') { db.ref('leaderboard/callsign/global').orderByChild('score').limitToLast(50).once('value', snapshot => { let p = []; if (snapshot.exists()) snapshot.forEach(c => { if (c.val()) p.push(c.val()); }); p.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(p.slice(0, 50), els.leaderboardContainer, false); }); return; }
    if (tabType === 'tournaments') { db.ref('leaderboard/tournaments').orderByChild('score').limitToLast(50).once('value', snapshot => { let t = []; if (snapshot.exists()) snapshot.forEach(c => { if (c.val()) t.push(c.val()); }); t.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(t.slice(0, 50), els.leaderboardContainer, false, true); }); return; }
    if (tabType === 'active_tournament') {
        if (!activeTrnId) { els.leaderboardContainer.innerHTML = ''; const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color);"; p.textContent = currentLang === 'it' ? "Non sei iscritto a nessun torneo attivo." : "You are not enrolled in any active tournament."; els.leaderboardContainer.appendChild(p); }
        else { db.ref(`tournaments/${activeTrnId}`).once('value', snap => { const trn = snap.val(); if (trn?.standings) { els.leaderboardContainer.innerHTML = ''; const h = document.createElement('div'); h.style.cssText = "text-align:center; margin-bottom:10px; padding:5px; background:var(--sec-bg-color); border-radius:8px;"; h.innerHTML = `<small style="color:var(--hint-color)">${currentLang === 'it' ? 'Torneo Attivo:' : 'Active Tournament:'}</small><br><b style="color:var(--champ-color); font-size:1.1em;">${trn.name}</b>`; els.leaderboardContainer.appendChild(h); let std = Object.entries(trn.standings).map(([id, d]) => ({ name: d.name, score: d.points, date: currentLang === 'it' ? "In corso" : "In progress" })); std.sort((a,b) => (Number(b.score) || 0) - (Number(a.score) || 0)); const lC = document.createElement('div'); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(std.slice(0, 50), lC, false, true); els.leaderboardContainer.appendChild(lC); } else { els.leaderboardContainer.innerHTML = ''; const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color);"; p.textContent = currentLang === 'it' ? 'Dati torneo non disponibili.' : 'Tournament data unavailable.'; els.leaderboardContainer.appendChild(p); } }); }
        return;
    }
    let isQ = tabType.startsWith('quiz'), isC = tabType.startsWith('chars'), mP = isQ ? 'quiz' : (isC ? 'chars' : 'standard'), sT = isQ ? tabType.replace('quiz_', '') : (isC ? tabType.replace('chars_', '') : tabType.replace('standard_', ''));
    if (filterWordCount !== 'all') { db.ref(`leaderboard/${mP}/${sT}_${filterWordCount}`).orderByChild('score').limitToLast(50).once('value', snapshot => { let p = []; if (snapshot.exists()) snapshot.forEach(uN => { if (uN.val()) p.push(uN.val()); }); p.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(p.slice(0, 50), els.leaderboardContainer, true); }); }
    else { db.ref(`leaderboard/${mP}`).once('value', snapshot => { let p = []; if (snapshot.exists()) snapshot.forEach(wcN => { if (!wcN.key.startsWith(sT + "_")) return; wcN.forEach(uN => { if (uN.val()) p.push(uN.val()); }); }); p.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)); if (typeof renderPlayersListHTML === 'function') renderPlayersListHTML(p.slice(0, 50), els.leaderboardContainer, true); }); }
}

function renderMatchesHistoryHTML(matches, container) { container.innerHTML = ''; if (matches.length === 0) { const p = document.createElement('p'); p.style.cssText = 'text-align:center; color:var(--hint-color);'; p.textContent = currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.'; container.appendChild(p); return; } matches.forEach(match => { const mw = document.createElement('div'); mw.style.cssText = "margin-bottom:25px; border-bottom:1px dashed var(--hint-color); padding-bottom:15px;"; const iD = document.createElement('div'); iD.style.cssText = 'text-align:center; font-size:0.8em; color:var(--hint-color); margin-bottom:8px;'; iD.textContent = `📅 ${match.date} - ${match.wordCount} Stringhe`; mw.appendChild(iD); if (typeof renderHeadToHeadView === 'function') renderHeadToHeadView(match.players, mw); container.appendChild(mw); }); }

function renderPlayersListHTML(players, container, showWC, isT = false) {
    container.innerHTML = ''; if (players.length === 0) { const p = document.createElement('p'); p.style.cssText = 'text-align:center; color:var(--hint-color);'; p.textContent = currentLang === 'it' ? 'Nessun record trovato per questa categoria.' : 'No records found for this category.'; container.appendChild(p); return; }
    players.forEach((p, idx) => {
        const row = document.createElement('div'); row.className = 'leaderboard-row'; row.style.cssText = "padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05);";
        const mD = document.createElement('div'); mD.style.cssText = 'display:flex; align-items:center; gap:8px; flex-grow:1;'; const medD = document.createElement('div'); medD.style.cssText = 'font-size:1.2em; min-width:1.5em; text-align:center;'; if (idx === 0) medD.textContent = "🥇"; else if (idx === 1) medD.textContent = "🥈"; else if (idx === 2) medD.textContent = "🥉"; else { medD.innerHTML = `<span style="color:var(--hint-color); font-size:0.8em;">${idx + 1}.</span>`; }
        const iD = document.createElement('div'); iD.style.cssText = 'display:flex; flex-direction:column;'; const nD = document.createElement('div'); nD.style.cssText = 'display:flex; align-items:center;';
        if (p.username && !isT) { const nL = document.createElement('span'); nL.style.cssText = 'color:var(--link-color); cursor:pointer; text-decoration:underline; font-weight:bold;'; nL.textContent = p.name; nL.onclick = () => { if (typeof openTelegramProfile === 'function') openTelegramProfile(p.username); }; nD.appendChild(nL); } else { const nS = document.createElement('span'); nS.style.fontWeight = 'bold'; nS.textContent = p.name; nD.appendChild(nS); }
        if (showWC && p.wordCount) { nD.innerHTML += `<span style="background:var(--hint-color); color:var(--bg-color); padding:1px 4px; border-radius:3px; font-size:0.8em; margin-left:4px;">${p.wordCount} str.</span>`; }
        const dD = document.createElement('div'); dD.style.cssText = 'font-size:0.75em; color:var(--hint-color);'; dD.textContent = (p.date || "") + " "; if (!isT && p.wpm) { dD.innerHTML += `<span style="color:var(--champ-color); font-weight:bold;">${p.wpm} WPM</span>`; }
        iD.appendChild(nD); iD.appendChild(dD); mD.appendChild(medD); mD.appendChild(iD);
        const sD = document.createElement('div'); sD.style.textAlign = 'right'; sD.innerHTML = `<b style="font-size:1.1em; color:var(--link-color);">${p.score}</b><span style="font-size:0.7em; color:var(--hint-color); margin-left:2px;">pt</span>`;
        row.appendChild(mD); row.appendChild(sD); container.appendChild(row);
    });
}

function showPlayerDetailsModal(name, details) { if (!els.matchDetailsBody || !els.matchDetailsModal) return; els.matchDetailsBody.innerHTML = ''; const h3 = els.matchDetailsModal.querySelector('h3'); if (h3) h3.textContent = `${currentLang === 'it' ? 'Dettagli Partita di' : 'Match Details for'} ${name}`; details.forEach(row => { const tr = document.createElement('tr'); let c = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999"); const tdT = document.createElement('td'); tdT.textContent = row.typed || '-'; const tdR = document.createElement('td'); const bR = document.createElement('b'); if (typeof renderDiffSecure === 'function') renderDiffSecure(bR, row.real, row.typed || ''); tdR.appendChild(bR); const tdP = document.createElement('td'); tdP.style.color = c; tdP.style.fontWeight = 'bold'; tdP.textContent = row.points; tr.appendChild(tdT); tr.appendChild(tdR); tr.appendChild(tdP); els.matchDetailsBody.appendChild(tr); }); els.matchDetailsModal.style.display = 'flex'; }

function populateDynamicFilters(modePath, subTypeFilter = "") { if (!els.lbWordFilter) return; const cV = els.lbWordFilter.value; db.ref(`leaderboard/${modePath}`).once('value', snapshot => { let opts = ['<option value="all">Tutte le categorie</option>'], counts = []; snapshot.forEach(wcN => { if (modePath.startsWith('recent_matches')) { if (wcN.key !== 'unknown' && !counts.includes(wcN.key)) counts.push(wcN.key); } else { if (!subTypeFilter || wcN.key.startsWith(subTypeFilter + "_")) { const c = wcN.key.split('_').pop(); if (!counts.includes(c)) counts.push(c); } } }); counts.sort((a,b) => parseInt(a) - parseInt(b)).forEach(c => opts.push(`<option value="${c}">${c} Stringhe</option>`)); els.lbWordFilter.innerHTML = opts.join(''); if (counts.includes(cV) || cV === 'all') els.lbWordFilter.value = cV; }); }

function updateMedalGallery() { if (!els.myMedalsContainer) return; db.ref(`users/${myId}/medals`).once('value', snap => { if (!snap.exists()) return els.myMedalsContainer.innerHTML = '<span style="font-size:0.6em; color:var(--hint-color);">Nessuna medaglia.</span>'; els.myMedalsContainer.innerHTML = ''; Object.values(snap.val()).forEach(m => { const s = document.createElement('span'); s.textContent = (m.count && m.count > 1) ? `${m.count}x ${m.icon}` : m.icon; s.title = `${m.title} (${m.date})`; s.onclick = () => showToast(`${m.title} - ${m.date}`); s.style.cursor = "pointer"; els.myMedalsContainer.appendChild(s); }); }); }

function awardMedal(id, title, desc, icon, periodKey) {
    db.ref(`users/${myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon, periodKey });
    if (els.overlayMedalIcon) els.overlayMedalIcon.textContent = icon; if (els.overlayMedalTitle) els.overlayMedalTitle.textContent = title; if (els.overlayMedalDesc) els.overlayMedalDesc.textContent = desc; if (els.medalOverlay) els.medalOverlay.style.display = 'flex';
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const g = audioCtx.createGain(); osc.connect(g); g.connect(audioCtx.destination); osc.type = 'triangle'; const now = audioCtx.currentTime; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5); g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.8); osc.start(now); osc.stop(now + 0.8);
    if (typeof updateMedalGallery === 'function') updateMedalGallery();
}

function updateActivity(won = false) { const now = new Date(), dK = now.toISOString().split('T')[0], wK = getWeekNumber(now), mK = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0'); ['daily/'+dK, 'weekly/'+wK, 'monthly/'+mK].forEach(p => { db.ref(`activity/${p}/${myId}`).transaction(d => { if (!d) return { name: myName, games: 1, wins: won ? 1 : 0, lastPlayed: firebase.database.ServerValue.TIMESTAMP }; d.games = (d.games || 0) + 1; if (won) d.wins = (d.wins || 0) + 1; d.name = myName; d.lastPlayed = firebase.database.ServerValue.TIMESTAMP; return d; }).then(() => { if (p.startsWith('daily')) if (typeof checkActivityAndAwardMedals === 'function') checkActivityAndAwardMedals(); }); }); }

function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0'); }

async function checkActivityAndAwardMedals() {
    const now = new Date(), dK = now.toISOString().split('T')[0], wK = getWeekNumber(now), mK = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    try {
        const [dS, wS, mS, uM] = await Promise.all([ db.ref(`activity/daily/${dK}/${myId}`).once('value'), db.ref(`activity/weekly/${wK}/${myId}`).once('value'), db.ref(`activity/monthly/${mK}/${myId}`).once('value'), db.ref(`users/${myId}/medals`).once('value') ]);
        const dD = dS.val() || { games: 0 }, wD = wS.val() || { games: 0 }, mD = mS.val() || { games: 0 }; let myM = uM.val() || {};
        const vK = [dK, wK, mK, 'daily_champ']; for (let id in myM) { if (!vK.includes(myM[id].periodKey)) { await db.ref(`users/${myId}/medals/${id}`).remove(); delete myM[id]; } }
        const ch = (c, th, id, t, d, i, p) => { if (c >= th && (!myM[id] || myM[id].periodKey !== p)) { if (typeof awardMedal === 'function') awardMedal(id, t, d, i, p); myM[id] = { periodKey: p }; return true; } return false; };
        ch(dD.games, 3, 'd_bronze', "Bronzo Giornaliero", "Hai giocato 3 partite oggi!", "🥉", dK); ch(dD.games, 7, 'd_silver', "Argento Giornaliero", "Sei un veterano! 7 partite oggi!", "🥈", dK); ch(dD.games, 15, 'd_gold', "Oro Giornaliero", "Incredibile! 15 partite in un giorno!", "🥇", dK); ch(wD.games, 20, 'w_active', "Stakanovista Settimanale", "20 partite questa settimana!", "🎖️", wK); ch(wD.games, 50, 'w_pro', "Campione Settimanale", "50 partite! Una leggenda questa settimana!", "🏆", wK); ch(mD.games, 150, 'm_legend', "Titano del Mese", "150 partite! Il gioco non ha segreti per te.", "💎", mK);
    } catch(e) {} if (typeof updateMedalGallery === 'function') updateMedalGallery();
}

function switchActTab(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab')); if (els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`]) els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`].classList.add('active-tab');
    const now = new Date(); let key = period === 'daily' ? now.toISOString().split('T')[0] : period === 'weekly' ? getWeekNumber(now) : now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
    if (els.actListTitle) els.actListTitle.textContent = period === 'daily' ? "I più attivi di Oggi" : period === 'weekly' ? "I più attivi della Settimana" : "I più attivi del Mese";
    if (typeof renderActivityRankings === 'function') renderActivityRankings(period, key); if (typeof updateMedalGallery === 'function') updateMedalGallery();
}

function renderActivityRankings(period, key) {
    if (!els.activityRankList) return; els.activityRankList.innerHTML = ''; const loadLi = document.createElement('li'); loadLi.style.cssText = "justify-content:center; color:var(--hint-color);"; loadLi.textContent = "Caricamento..."; els.activityRankList.appendChild(loadLi);
    db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = ''; let users = []; if (snap.exists()) snap.forEach(c => { if (c.val() && typeof c.val() === 'object') users.push({ id: c.key, ...c.val() }); }); users.sort((a, b) => (b.games || 0) - (a.games || 0)); users = users.slice(0, 50);
        if (users.length === 0) { const empLi = document.createElement('li'); empLi.style.cssText = "justify-content:center; color:var(--hint-color);"; empLi.textContent = "Nessuna attività registrata."; els.activityRankList.appendChild(empLi); return; }
        users.forEach((u, idx) => { let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`; const li = document.createElement('li'); const nS = document.createElement('span'); nS.appendChild(document.createTextNode(med + " ")); const nB = document.createElement('b'); nB.textContent = u.name || "Anonimo"; nS.appendChild(nB); const sS = document.createElement('span'); sS.innerHTML = `<b>${u.games || 0}</b> part. <small style="color:#4caf50;">(${u.wins || 0} v.)</small>`; li.appendChild(nS); li.appendChild(sS); els.activityRankList.appendChild(li); });
    }).catch(err => { els.activityRankList.innerHTML = ''; const errLi = document.createElement('li'); errLi.style.cssText = "justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;"; errLi.innerHTML = `<span>Errore nel caricamento.</span><small style="font-size:0.7em; opacity:0.7;">${err.message}</small>`; els.activityRankList.appendChild(errLi); });
}

window.showProfileScreen = function() {
    if (typeof showScreen === 'function') showScreen('profileScreen'); if (els.errorChartContainer) els.errorChartContainer.textContent = 'Caricamento...'; if (els.wpmErrorChartContainer) els.wpmErrorChartContainer.textContent = 'Caricamento...'; if (els.matchHistoryList) els.matchHistoryList.textContent = 'Caricamento...';
    db.ref(`users/${myId}/stats/charErrors`).once('value').then(snap => {
        if (!els.errorChartContainer) return; const errors = snap.val() || {}; els.errorChartContainer.innerHTML = ''; const sorted = Object.entries(errors).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) { const p = document.createElement('p'); p.style.cssText = 'text-align:center; color:var(--hint-color);'; p.textContent = 'Nessun errore.'; els.errorChartContainer.appendChild(p); }
        else {
            let maxErr = sorted[0][1];
            sorted.forEach(([char, count]) => {
                const row = document.createElement('div'); row.style.cssText = "display:flex; align-items:center; margin-bottom:4px;";
                const spanChar = document.createElement('span'); spanChar.style.cssText = "width:20px; font-weight:bold;"; spanChar.textContent = char;
                const barWrap = document.createElement('div'); barWrap.style.cssText = "flex-grow:1; background:var(--bg-color); border:1px solid var(--hint-color); border-radius:4px; height:12px; margin:0 5px; overflow:hidden;";
                const barFill = document.createElement('div'); barFill.style.cssText = `width:${(count / maxErr) * 100}%; background:#d32f2f; height:100%;`; barWrap.appendChild(barFill);
                const spanCount = document.createElement('span'); spanCount.style.cssText = "width:25px; text-align:right; font-size:0.9em; font-weight:bold;"; spanCount.textContent = count;
                row.appendChild(spanChar); row.appendChild(barWrap); row.appendChild(spanCount); els.errorChartContainer.appendChild(row);
            });
        }
    });
    db.ref(`users/${myId}/stats/errorsByWpm`).once('value').then(snap => {
        if (!els.wpmErrorChartContainer) return; const wpmErrors = snap.val() || {}; els.wpmErrorChartContainer.innerHTML = '';
        if (Object.keys(wpmErrors).length === 0) { const p = document.createElement('p'); p.style.cssText = 'text-align:center; color:var(--hint-color);'; p.textContent = 'Nessun errore per WPM.'; els.wpmErrorChartContainer.appendChild(p); return; }
        Object.keys(wpmErrors).sort((a,b) => parseInt(b) - parseInt(a)).forEach(wpm => {
            let charsAtWpm = wpmErrors[wpm]; let totalErrs = Object.values(charsAtWpm).reduce((acc, curr) => acc + curr, 0); let topChar = Object.entries(charsAtWpm).sort((a,b) => b[1] - a[1])[0];
            const row = document.createElement('div'); row.style.cssText = "margin-bottom:8px; border-bottom:1px solid var(--hint-color); padding-bottom:4px;";
            const divTop = document.createElement('div'); divTop.style.cssText = "display:flex; justify-content:space-between; font-weight:bold; color:var(--link-color);";
            const spanWpm = document.createElement('span'); spanWpm.textContent = `${wpm} WPM`; const spanTot = document.createElement('span'); spanTot.textContent = `Tot: ${totalErrs} err`; divTop.appendChild(spanWpm); divTop.appendChild(spanTot);
            const divBot = document.createElement('div'); divBot.style.cssText = "font-size:0.85em; color:var(--text-color);"; divBot.innerHTML = `Peggior lettera: <b>${topChar[0]}</b> (${topChar[1]} volte)`; row.appendChild(divTop); row.appendChild(divBot); els.wpmErrorChartContainer.appendChild(row);
        });
    });
    db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(30).once('value').then(snap => {
        if (!els.matchHistoryList) return; els.matchHistoryList.innerHTML = ''; userMatchHistory = []; snap.forEach(child => { userMatchHistory.push({ key: child.key, ...child.val() }); }); userMatchHistory.reverse();
        if (userMatchHistory.length === 0) { const li = document.createElement('li'); li.style.cssText = 'justify-content:center; color:var(--hint-color);'; li.textContent = 'Nessuna partita giocata.'; els.matchHistoryList.appendChild(li); return; }
        userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now()); const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            let modeIcon = match.mode === 'callsign' ? '🎙️ Nom.' : match.mode === 'pingpong' ? '🏓 Ping Pong' : match.mode === 'chars' ? '⌨️ Carat.' : (match.mode === 'daily_challenge' ? '📅 Daily' : match.mode === 'quiz' ? '❓ Quiz' : '🔤 Parole');
            const li = document.createElement('li'); li.style.cssText = 'flex-direction:column; align-items:flex-start;';
            const topDiv = document.createElement('div'); topDiv.style.cssText = "display:flex; justify-content:space-between; width:100%; margin-bottom:5px;"; topDiv.innerHTML = `<span style="font-size:0.85em; font-weight:bold;">${modeIcon} (${match.type})</span><span style="font-size:0.8em; color:var(--hint-color);">${dateStr}</span>`;
            const botDiv = document.createElement('div'); botDiv.style.cssText = "display:flex; justify-content:space-between; width:100%; align-items:center;"; botDiv.innerHTML = `<span><b>${match.score} pt</b><small> (${match.wpm} WPM)</small></span>`;
            const btnDiv = document.createElement('div'); btnDiv.style.cssText = 'display:flex; gap:5px;';
            const vBtn = document.createElement('button'); vBtn.className = "action-btn-small btn-secondary"; vBtn.textContent = "Vedi"; vBtn.onclick = () => { if (typeof openMatchDetails === 'function') openMatchDetails(match.key); };
            const dBtn = document.createElement('button'); dBtn.className = "action-btn-small btn-danger"; dBtn.textContent = "X"; dBtn.onclick = () => { if (typeof deleteHistoryItem === 'function') deleteHistoryItem(match.key); };
            btnDiv.appendChild(vBtn); btnDiv.appendChild(dBtn); botDiv.appendChild(btnDiv); li.appendChild(topDiv); li.appendChild(botDiv); els.matchHistoryList.appendChild(li);
        });
    });
};

window.openMatchDetails = function(matchKey) { const match = userMatchHistory.find(m => m.key === matchKey); if (!match || !els.matchDetailsBody || !els.matchDetailsModal) return; els.matchDetailsBody.innerHTML = ''; (match.details || []).forEach(row => { const tr = document.createElement('tr'); let c = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999"); const tdT = document.createElement('td'); tdT.textContent = row.typed || '-'; const tdR = document.createElement('td'); const bR = document.createElement('b'); if (typeof renderDiffSecure === 'function') renderDiffSecure(bR, row.real, row.typed || ''); tdR.appendChild(bR); const tdP = document.createElement('td'); tdP.style.color = c; tdP.style.fontWeight = 'bold'; tdP.textContent = row.points; tr.appendChild(tdT); tr.appendChild(tdR); tr.appendChild(tdP); els.matchDetailsBody.appendChild(tr); }); els.matchDetailsModal.style.display = 'flex'; };
window.deleteHistoryItem = function(key) { if (confirm("Eliminare questa partita?")) db.ref(`users/${myId}/history/${key}`).remove().then(() => { if (typeof showProfileScreen === 'function') showProfileScreen(); }); };
