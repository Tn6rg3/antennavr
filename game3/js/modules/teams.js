/**
 * TEAMS.JS
 * Teams and Tournaments logic and rendering
 */

function processTeamInvite(inviteTeamId) {
    db.ref(`teams/${inviteTeamId}`).once('value', snap => {
        if (snap.exists() && snap.val().status === 'open') {
            db.ref(`teams/${inviteTeamId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername });
            tg.showAlert(`Sei entrato nella squadra ${snap.val().name}!`); if (typeof showScreen === 'function') showScreen('teamsScreen');
        } else { tg.showAlert("Squadra non esistente o chiusa."); if (typeof showScreen === 'function') showScreen('setupScreen'); }
    });
}

function checkMyTeamStatus() {
    db.ref('teams').once('value', snap => {
        myTeamId = null; isTeamCaptain = false; myTeamName = "";
        snap.forEach(team => { if (team.child('members').hasChild(myId)) { myTeamId = team.key; myTeamName = team.val().name; isTeamCaptain = (team.val().captainId === myId); } });
        if (myTeamId) { if (els.noTeamView) els.noTeamView.style.display = 'none'; if (els.myTeamView) els.myTeamView.style.display = 'flex'; if (typeof listenToMyTeam === 'function') listenToMyTeam(); if (typeof listenToTournaments === 'function') listenToTournaments(); if (typeof listenToAllTeams === 'function') listenToAllTeams(true); if (typeof switchTeamTab === 'function') switchTeamTab('gest'); }
        else { if (els.myTeamView) els.myTeamView.style.display = 'none'; if (els.noTeamView) els.noTeamView.style.display = 'flex'; if (typeof listenToAllTeams === 'function') listenToAllTeams(false); if (typeof switchTeamTab === 'function') switchTeamTab('gest'); }
    });
}

function switchTeamTab(tab) {
    [els.tabTeamGestBtn, els.tabAllTeamsBtn, els.tabTournamentsBtn].forEach(b => { if (b) b.classList.remove('active-tab'); });
    if (els.noTeamView) els.noTeamView.style.display = 'none'; if (els.myTeamView) els.myTeamView.style.display = 'none'; if (els.allTeamsArea) els.allTeamsArea.style.display = 'none'; if (els.tournamentsArea) els.tournamentsArea.style.display = 'none';
    if (tab === 'gest') { if (els.tabTeamGestBtn) els.tabTeamGestBtn.classList.add('active-tab'); if (myTeamId) { if (els.myTeamView) els.myTeamView.style.display = 'flex'; } else { if (els.noTeamView) els.noTeamView.style.display = 'flex'; } }
    else if (tab === 'allteams') { if (els.tabAllTeamsBtn) els.tabAllTeamsBtn.classList.add('active-tab'); if (els.allTeamsArea) els.allTeamsArea.style.display = 'flex'; if (typeof listenToAllTeams === 'function') listenToAllTeams(!!myTeamId); }
    else { if (els.tabTournamentsBtn) els.tabTournamentsBtn.classList.add('active-tab'); if (els.tournamentsArea) els.tournamentsArea.style.display = 'flex'; if (typeof listenToTournaments === 'function') listenToTournaments(); }
}

function listenToAllTeams(isAlreadyInTeam) {
    if (listeners.allTeams) db.ref('teams').off('value', listeners.allTeams);
    listeners.allTeams = db.ref('teams').on('value', snap => {
        if (els.openTeamsList) els.openTeamsList.innerHTML = ''; if (els.globalAllTeamsList) els.globalAllTeamsList.innerHTML = '';
        snap.forEach(child => {
            const t = child.val(); const count = Object.keys(t.members || {}).length; if (t.status === 'retired' || count === 0) return;
            const liAll = document.createElement('li'); liAll.style.cssText = 'flex-direction:column; align-items:flex-start;';
            const topDiv = document.createElement('div'); topDiv.style.cssText = "width:100%; display:flex; justify-content:space-between;";
            if (!isAlreadyInTeam && t.status !== 'closed') { topDiv.style.cursor = 'pointer'; topDiv.onclick = () => window.joinTeam(child.key); }
            const spanTitle = document.createElement('span'); const bTitle = document.createElement('b'); bTitle.textContent = t.name; const smCount = document.createElement('small'); smCount.textContent = ` (${count} mem.)`; spanTitle.appendChild(bTitle); spanTitle.appendChild(smCount); topDiv.appendChild(spanTitle);
            if (!isAlreadyInTeam && t.status !== 'closed') { const spanJoin = document.createElement('span'); spanJoin.style.cssText = "color:var(--link-color); font-size:0.8em; font-weight:bold;"; spanJoin.textContent = "+ Unisciti"; topDiv.appendChild(spanJoin); }
            const memDiv = document.createElement('div'); memDiv.style.cssText = "margin-top:3px; padding-left:5px; border-left:2px solid var(--link-color);";
            Object.values(t.members || {}).forEach(m => { const spanM = document.createElement('span'); spanM.style.cssText = "display:inline-block; margin-right:5px; font-size:0.85em; color:var(--hint-color);"; spanM.textContent = `- ${m.name}`; memDiv.appendChild(spanM); });
            liAll.appendChild(topDiv); liAll.appendChild(memDiv); if (els.globalAllTeamsList) els.globalAllTeamsList.appendChild(liAll);
            if (!isAlreadyInTeam && t.status !== 'closed' && els.openTeamsList) {
                const liOpen = document.createElement('li'); liOpen.style.cursor = 'pointer'; liOpen.onclick = () => window.joinTeam(child.key);
                const leftOpen = document.createElement('span'); const bOpen = document.createElement('b'); bOpen.textContent = t.name; const smallOpen = document.createElement('small'); smallOpen.textContent = ` (${count} mem.)`; leftOpen.appendChild(bOpen); leftOpen.appendChild(smallOpen);
                const rightOpen = document.createElement('span'); rightOpen.style.color = 'var(--link-color)'; rightOpen.style.fontWeight = 'bold'; rightOpen.textContent = "+ Unisciti"; liOpen.appendChild(leftOpen); liOpen.appendChild(rightOpen); els.openTeamsList.appendChild(liOpen);
            }
        });
        if (els.openTeamsList && !els.openTeamsList.innerHTML) { const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra aperta."; els.openTeamsList.appendChild(li); }
        if (els.globalAllTeamsList && !els.globalAllTeamsList.innerHTML) { const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra creata."; els.globalAllTeamsList.appendChild(li); }
    });
}

window.joinTeam = function(tId) { db.ref(`teams/${tId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername }).then(() => { if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); }); };

function listenToMyTeam() {
    if (listeners.team) db.ref(`teams/${myTeamId}`).off('value', listeners.team);
    listeners.team = db.ref(`teams/${myTeamId}`).on('value', snap => {
        if (!snap.exists() || snap.val().status === 'retired') return { if (typeof checkMyTeamStatus === 'function') checkMyTeamStatus(); };
        const team = snap.val(); if (els.myTeamNameDisplay) els.myTeamNameDisplay.textContent = team.name; if (els.teamStatusText) els.teamStatusText.innerHTML = team.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';
        if (els.captainName) els.captainName.innerHTML = ''; if (els.teamOthersList) els.teamOthersList.innerHTML = '';
        Object.entries(team.members || {}).forEach(([id, mem]) => {
            const span = document.createElement('span'); span.textContent = mem.name;
            if (mem.username) { span.style.color = 'var(--link-color)'; span.style.cursor = 'pointer'; span.style.textDecoration = 'underline'; span.onclick = () => openTelegramProfile(mem.username); }
            if (id === team.captainId) { if (els.captainName) els.captainName.appendChild(span); }
            else { if (els.teamOthersList && els.teamOthersList.children.length > 0) { const sep = document.createElement('span'); sep.style.color = 'var(--hint-color)'; sep.textContent = ' | '; els.teamOthersList.appendChild(sep); } if (els.teamOthersList) els.teamOthersList.appendChild(span); }
        });
        if (els.captainActions) els.captainActions.style.display = isTeamCaptain ? 'block' : 'none';
        if (els.toggleTeamLockBtn) { els.toggleTeamLockBtn.textContent = team.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni"; els.toggleTeamLockBtn.onclick = () => db.ref(`teams/${myTeamId}/status`).set(team.status === 'open' ? 'closed' : 'open'); }
        if (els.inviteTeamBtn) { els.inviteTeamBtn.onclick = () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=team_${myTeamId}`)}&text=${encodeURIComponent(`Unisciti alla mia squadra: ${team.name}!`)}`); }
        if (typeof setupChat === 'function') setupChat(db.ref(`teams/${myTeamId}/chat`), 'teamChatMessages', null);
    });
}

function listenToTournaments() {
    if (listeners.trn) db.ref('tournaments').off('value', listeners.trn);
    listeners.trn = db.ref('tournaments').on('value', snap => {
        activeTrnId = null; if (els.openTournamentsList) els.openTournamentsList.innerHTML = ''; if (els.pastTournamentsList) els.pastTournamentsList.innerHTML = ''; if (els.createTrnPanel) els.createTrnPanel.style.display = isTeamCaptain ? 'flex' : 'none';
        let foundActive = null;
        snap.forEach(child => {
            const trn = child.val(); const trnId = child.key; const isMember = myTeamId && trn.teams && trn.teams[myTeamId]; const isHost = trn.hostId === myId;
            if ((isMember || isHost) && trn.status !== 'finished') { if (!foundActive) foundActive = child; else if (trn.status === 'playing' && foundActive.val().status !== 'playing') foundActive = child; }
            if (trn.status === 'open') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const countSmall = document.createElement('small'); countSmall.textContent = ` (${Object.keys(trn.teams || {}).length} sq.)`; leftSpan.appendChild(nameB); leftSpan.appendChild(countSmall); li.appendChild(leftSpan);
                if (isTeamCaptain && !isMember) { const btn = document.createElement('button'); btn.className = 'action-btn-small btn-champ'; btn.textContent = 'Iscrivi'; btn.onclick = () => window.joinTournament(trnId); li.appendChild(btn); }
                else if (isMember) { const joinedSmall = document.createElement('small'); joinedSmall.style.color = 'var(--link-color)'; joinedSmall.style.fontWeight = 'bold'; joinedSmall.textContent = ' (Iscritto)'; li.appendChild(joinedSmall); }
                if (els.openTournamentsList) els.openTournamentsList.appendChild(li);
            } else if (trn.status === 'finished') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const statusSmall = document.createElement('small'); statusSmall.textContent = " (Concluso)"; leftSpan.appendChild(nameB); leftSpan.appendChild(statusSmall); li.appendChild(leftSpan);
                const btn = document.createElement('button'); btn.className = 'action-btn-small btn-secondary'; btn.textContent = 'Vedi Risultati'; btn.onclick = () => window.viewTournament(trnId); li.appendChild(btn); if (els.pastTournamentsList) els.pastTournamentsList.appendChild(li);
            }
        });
        if (foundActive) { activeTrnId = foundActive.key; if (typeof renderActiveTournament === 'function') renderActiveTournament(foundActive); }
        else { if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'flex'; if (els.trnActiveArea) els.trnActiveArea.style.display = 'none'; if (els.openTournamentsList && !els.openTournamentsList.innerHTML) { const li1 = document.createElement('li'); li1.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li1.textContent = "Nessun torneo aperto."; els.openTournamentsList.appendChild(li1); } if (els.pastTournamentsList && !els.pastTournamentsList.innerHTML) { const li2 = document.createElement('li'); li2.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li2.textContent = "Nessun torneo concluso."; els.pastTournamentsList.appendChild(li2); } }
    });
}

window.viewTournament = function(tId) { db.ref(`tournaments/${tId}`).once('value', snap => { if (snap.exists()) { activeTrnId = tId; if (typeof renderActiveTournament === 'function') renderActiveTournament(snap); if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none'; if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex'; } }); };
window.joinTournament = function(tId) { if (!isTeamCaptain) return; db.ref(`tournaments/${tId}/teams/${myTeamId}`).set({ name: myTeamName }); db.ref(`tournaments/${tId}/standings/${myTeamId}`).set({ points: 0, name: myTeamName }); };

function renderActiveTournament(trnSnap) {
    if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none'; if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex';
    const trn = trnSnap.val(); if (!trn) return;
    const isFinished = trn.status === 'finished'; if (els.activeTrnTitle) els.activeTrnTitle.textContent = trn.name + (isFinished ? (currentLang === 'it' ? " (Concluso)" : " (Finished)") : "");
    const amIHost = (trn.hostId === myId); if (els.editTrnNameBtn) els.editTrnNameBtn.style.display = (amIHost && !isFinished) ? 'block' : 'none'; if (els.leaveTrnBtn) els.leaveTrnBtn.style.display = (isTeamCaptain && !isFinished) ? 'block' : 'none';
    if (els.trnStandingsBody) {
        els.trnStandingsBody.innerHTML = ''; let std = Object.entries(trn.standings || {}).map(([id, data]) => ({ id, ...data })); std.sort((a, b) => b.points - a.points);
        std.forEach((s, idx) => {
            let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`; const tr = document.createElement('tr'); const tdMed = document.createElement('td'); tdMed.textContent = med; const tdName = document.createElement('td'); const nameB = document.createElement('b'); nameB.textContent = s.name; tdName.appendChild(nameB); if (s.id === myTeamId) tdName.appendChild(document.createTextNode(" " + (currentLang === 'it' ? '(Voi)' : '(You)'))); const tdPts = document.createElement('td'); const ptsB = document.createElement('b'); ptsB.textContent = s.points; tdPts.appendChild(ptsB); tr.appendChild(tdMed); tr.appendChild(tdName); tr.appendChild(tdPts); els.trnStandingsBody.appendChild(tr);
        });
    }
    if (els.trnHostControls) els.trnHostControls.style.display = (amIHost && !isFinished) ? 'block' : 'none';
    if (els.finishTrnBtn) { els.finishTrnBtn.style.display = (amIHost && trn.status === 'playing') ? 'block' : 'none'; els.finishTrnBtn.onclick = () => { if (confirm("Vuoi concludere manualmente il torneo?")) db.ref(`tournaments/${activeTrnId}/status`).set('finished'); }; }
    const teamCount = trn.teams ? Object.keys(trn.teams).length : 0; if (els.trnTeamCountTxt) els.trnTeamCountTxt.textContent = (currentLang === 'it' ? "Squadre Iscritte: " : "Enrolled Teams: ") + teamCount;
    if (els.startTrnBtn) { els.startTrnBtn.disabled = teamCount < 2 || (trn.status !== 'open' && trn.status !== 'playing'); els.startTrnBtn.textContent = trn.status === 'playing' ? (currentLang === 'it' ? "Rigenera Tabellone (Attenzione!)" : "Regenerate Bracket (Warning!)") : (currentLang === 'it' ? "Genera Tabellone e Avvia" : "Generate Bracket and Start"); }
    if (els.trnBracketContainer) {
        els.trnBracketContainer.innerHTML = '';
        if (trn.status === 'open') { const waitP = document.createElement('p'); waitP.style.cssText = 'text-align:center; color:var(--hint-color); font-size:0.9em;'; waitP.textContent = currentLang === 'it' ? "Il torneo è aperto, attendi l'avvio dall'organizzatore." : "The tournament is open, wait for the host to start."; els.trnBracketContainer.appendChild(waitP); }
        else if (trn.matches) {
            Object.entries(trn.matches).forEach(([mId, m]) => {
                const isMyMatch = (m.teamA === myTeamId || m.teamB === myTeamId); const card = document.createElement('div'); card.className = 'match-card'; if (isMyMatch) { card.style.borderColor = "var(--champ-color)"; card.style.borderWidth = "2px"; }
                let aC = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)"); let bC = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
                const mCT = document.createElement('div'); mCT.className = "match-card-teams"; const tA = document.createElement('div'); tA.style.color = aC; const bA = document.createElement('b'); bA.textContent = m.teamAName; tA.appendChild(bA); const mVs = document.createElement('div'); mVs.className = "match-vs"; mVs.textContent = "VS"; const tB = document.createElement('div'); tB.style.color = bC; const bB = document.createElement('b'); bB.textContent = m.teamBName; tB.appendChild(bB); mCT.appendChild(tA); mCT.appendChild(mVs); mCT.appendChild(tB); card.appendChild(mCT);
                if (m.status !== 'finished') {
                    const slotsD = document.createElement('div'); slotsD.style.cssText = 'display:flex; width:100%; gap:8px;';
                    const btnA = document.createElement('button'); btnA.className = 'slot-btn' + (m.playerA ? ' filled' : ''); btnA.style.cssText = "flex:1; min-width:0; margin:0; padding:8px 4px; font-size:0.85em;"; btnA.innerHTML = m.playerA ? `✅ <b>${escapeHTML(m.playerA.name)}</b><br><small>(${escapeHTML(m.teamAName)})</small>` : `🟢 <b>Scegli per ${escapeHTML(m.teamAName)}</b><br><small>(Posto A)</small>`; btnA.onclick = () => window.toggleTrnSlot(mId, 'A', m.teamA, m.teamAName);
                    const btnB = document.createElement('button'); btnB.className = 'slot-btn' + (m.playerB ? ' filled' : ''); btnB.style.cssText = "flex:1; min-width:0; margin:0; padding:8px 4px; font-size:0.85em;"; btnB.innerHTML = m.playerB ? `✅ <b>${escapeHTML(m.playerB.name)}</b><br><small>(${escapeHTML(m.teamBName)})</small>` : `🟢 <b>Scegli per ${escapeHTML(m.teamBName)}</b><br><small>(Posto B)</small>`; btnB.onclick = () => window.toggleTrnSlot(mId, 'B', m.teamB, m.teamBName);
                    slotsD.appendChild(btnA); slotsD.appendChild(btnB); card.appendChild(slotsD);
                    if (m.playerA && m.playerB && (m.playerA.id === myId || m.playerB.id === myId)) { const joinBtn = document.createElement('button'); joinBtn.className = 'btn-success'; joinBtn.style.cssText = 'font-size:0.9em; padding:8px; marginTop:8px;'; joinBtn.textContent = currentLang === 'it' ? '⚡ ENTRA NELLA SFIDA' : '⚡ JOIN MATCH'; joinBtn.onclick = () => window.startTrnMatch(mId); card.appendChild(joinBtn); }
                } else { const finD = document.createElement('div'); finD.style.cssText = 'font-size:0.85em; color:#4caf50; font-weight:bold; margin-top:5px;'; finD.textContent = currentLang === 'it' ? 'Concluso' : 'Finished'; card.appendChild(finD); }
                els.trnBracketContainer.appendChild(card);
            });
        }
    }
}

window.toggleTrnSlot = function(matchId, side, teamId, targetTeamName = "questa squadra") {
    if (teamId !== myTeamId) return alert(`⚠️ Questo posto è riservato alla squadra "${targetTeamName}"!\n\nTu fai parte della squadra "${myTeamName || 'Nessuna'}": premi sul pulsante destinato alla tua squadra.`);
    const slotRef = db.ref(`tournaments/${activeTrnId}/matches/${matchId}/player${side}`);
    slotRef.once('value', snap => { if (!snap.exists()) slotRef.set({ id: myId, name: myName }); else if (snap.val().id === myId) slotRef.remove(); else alert("⚠️ Questo posto è già stato occupato da " + snap.val().name); });
};

window.startTrnMatch = function(matchId) {
    const rc = "TRN_" + matchId;
    db.ref(`rooms/${rc}`).once('value', s => { if (s.exists()) { if (typeof window.joinSpecificRoom === 'function') window.joinSpecificRoom(rc); } else { db.ref('rooms/' + rc).set({ status: 'waiting', type: 'multi', mode: 'pingpong', wpm: 20, tone: 600, wordCount: 20, fixedSpeed: false, createdAt: firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 1800000, hostId: myId }).then(() => { if (typeof window.joinSpecificRoom === 'function') window.joinSpecificRoom(rc); }); } });
};

function checkTournamentCompletion(trnId) {
    db.ref(`tournaments/${trnId}`).once('value', snap => {
        const trn = snap.val(); if (!trn || trn.status === 'finished' || !trn.matches) return;
        let allF = true; Object.values(trn.matches).forEach(m => { if (m.status !== 'finished') allF = false; });
        if (allF) {
            db.ref(`tournaments/${trnId}/status`).set('finished'); showToast("Torneo completato!");
            if (trn.standings) { Object.entries(trn.standings).forEach(([tId, data]) => { if (data.points > 0) { db.ref(`leaderboard/tournaments/${tId}`).transaction(curr => { if (!curr) return { name: data.name, score: data.points, date: new Date().toLocaleDateString('it-IT') }; curr.score = (curr.score || 0) + data.points; curr.date = new Date().toLocaleDateString('it-IT'); return curr; }); } }); }
        }
    });
}

function listenToRoomLeaderboard() {
    if (!roomCode) return; if (listeners.roomLb) db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb);
    listeners.roomLb = db.ref(`rooms/${roomCode}`).on('value', snap => {
        if (!snap.exists()) return; const roomData = snap.val(), players = roomData.players || {};
        if (activeTab === "room") if (typeof renderRoomLeaderboard === 'function') renderRoomLeaderboard(players);
        let allF = true; Object.values(players).forEach(p => { if (!p.finished) allF = false; });
        if (allF && roomData.status !== 'finished' && Object.keys(players).length > 0) {
            db.ref(`rooms/${roomCode}/status`).set('finished'); if (Object.keys(players).length >= 2 && ['multi', 'pingpong', 'chars', 'quiz'].includes(roomData.type || currentMode)) if (typeof saveMatchToGlobalHistory === 'function') saveMatchToGlobalHistory(players, roomData);
            if (roomCode.startsWith("TRN_")) {
                const mId = roomCode.replace("TRN_", ""); let hS = -1, wTI = null;
                Object.values(players).forEach(p => { if (p.score > hS) { hS = p.score; wTI = p.teamId; } else if (p.score === hS) wTI = "tie"; });
                if (wTI && activeTrnId) { db.ref(`tournaments/${activeTrnId}/matches/${mId}`).update({ status: 'finished', winnerTeamId: wTI }).then(() => { if (typeof checkTournamentCompletion === 'function') checkTournamentCompletion(activeTrnId); }); if (wTI !== "tie") db.ref(`tournaments/${activeTrnId}/standings/${wTI}`).transaction(t => { if (t) t.points = (t.points || 0) + 1; return t; }); }
                setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 1500);
            } else if (roomData.hostId === myId) setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 3000);
        }
    });
}

function saveMatchToGlobalHistory(players, roomData) {
    if (myId !== roomData.hostId) return; const mId = Date.now().toString();
    let mP = ['pingpong', 'chars', 'quiz'].includes(currentMode) ? (currentMode === 'pingpong' ? 'pingpong' : `${currentMode}_multi`) : 'standard_multi';
    const mD = { players: Object.entries(players).map(([id, d]) => ({ id, name: d.name, username: d.username || "", score: d.score || 0, wpm: d.wpm || 0, matchDetails: d.matchDetails || [] })), mode: currentMode, wordCount: roomData.wordCount, date: new Date().toLocaleDateString('it-IT'), ts: firebase.database.ServerValue.TIMESTAMP };
    db.ref(`leaderboard/recent_matches/${mP}/${roomData.wordCount || 'all'}/${mId}`).set(mD);
}

function openTeamInviteModal(userId, name) {
    currentInviterId = userId; if (els.inviteModalTitle) els.inviteModalTitle.textContent = "Recluta " + name; if (els.recruitmentStatusText) els.recruitmentStatusText.textContent = "Caricamento...";
    db.ref('teams').once('value', snap => {
        let inT = false, tN = ""; snap.forEach(t => { if (t.child('members').hasChild(userId)) { inT = true; tN = t.val().name; } });
        if (els.recruitmentStatusText) els.recruitmentStatusText.innerHTML = inT ? `⚠️ <b>${name}</b> fa già parte di <b>${tN}</b>` : `💡 <b>${name}</b> non ha ancora una squadra.`;
        if (els.recruitJoinBtn) els.recruitJoinBtn.style.display = (!inT && myTeamId) ? 'block' : 'none';
        if (els.recruitCreateBtn) els.recruitCreateBtn.style.display = inT ? 'none' : 'block';
    });
    if (els.inviteSettings) els.inviteSettings.style.display = 'none'; if (els.teamInviteSettings) els.teamInviteSettings.style.display = 'block'; if (els.incomingInviteArea) els.incomingInviteArea.style.display = 'none'; if (els.incomingTeamInviteArea) els.incomingTeamInviteArea.style.display = 'none'; if (els.outgoingInviteArea) els.outgoingInviteArea.style.display = 'none';
    if (els.inviteModal) els.inviteModal.style.display = 'flex';
}
