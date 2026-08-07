// ============================================================================
// TOURNAMENTS.JS - GESTIONE TORNEI A SQUADRE E TABELLONI
// ============================================================================

import { appState, uiState, listeners } from './state.js';
import { els, escapeHTML, showToast } from './ui.js';

export function listenToTournaments() {
    if (listeners.trn) appState.db.ref('tournaments').off('value', listeners.trn);
    listeners.trn = appState.db.ref('tournaments').on('value', snap => {
        uiState.activeTrnId = null; 
        if (els.openTournamentsList) els.openTournamentsList.innerHTML = ''; 
        if (els.pastTournamentsList) els.pastTournamentsList.innerHTML = '';
        if (els.createTrnPanel) els.createTrnPanel.style.display = appState.isTeamCaptain ? 'flex' : 'none';
        
        let foundActive = null;
        snap.forEach(child => {
            const trn = child.val(); const trnId = child.key; const isMember = appState.myTeamId && trn.teams && trn.teams[appState.myTeamId]; const isHost = trn.hostId === appState.myId;
            if ((isMember || isHost) && trn.status !== 'finished') { 
                if (!foundActive) foundActive = child; 
                else if (trn.status === 'playing' && foundActive.val().status !== 'playing') foundActive = child; 
            }
            if (trn.status === 'open') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const countSmall = document.createElement('small'); countSmall.textContent = ` (${Object.keys(trn.teams || {}).length} sq.)`; leftSpan.appendChild(nameB); leftSpan.appendChild(countSmall); li.appendChild(leftSpan);
                if (appState.isTeamCaptain && !isMember) { 
                    const btn = document.createElement('button'); btn.className = 'action-btn-small btn-champ'; btn.textContent = 'Iscrivi'; btn.onclick = () => joinTournament(trnId); li.appendChild(btn); 
                } else if (isMember) { 
                    const joinedSmall = document.createElement('small'); joinedSmall.style.color = 'var(--link-color)'; joinedSmall.style.fontWeight = 'bold'; joinedSmall.textContent = ' (Iscritto)'; li.appendChild(joinedSmall); 
                }
                if (els.openTournamentsList) els.openTournamentsList.appendChild(li);
            } else if (trn.status === 'finished') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const statusSmall = document.createElement('small'); statusSmall.textContent = " (Concluso)"; leftSpan.appendChild(nameB); leftSpan.appendChild(statusSmall); li.appendChild(leftSpan);
                const btn = document.createElement('button'); btn.className = 'action-btn-small btn-secondary'; btn.textContent = 'Vedi Risultati'; btn.onclick = () => viewTournament(trnId);
                li.appendChild(btn); 
                if (els.pastTournamentsList) els.pastTournamentsList.appendChild(li);
            }
        });
        if (foundActive) { 
            uiState.activeTrnId = foundActive.key; 
            renderActiveTournament(foundActive); 
        } else { 
            if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'flex'; 
            if (els.trnActiveArea) els.trnActiveArea.style.display = 'none'; 
        }
    });
}

export function viewTournament(tId) { 
    appState.db.ref(`tournaments/${tId}`).once('value', snap => { 
        if (snap.exists()) { 
            uiState.activeTrnId = tId; 
            renderActiveTournament(snap); 
            if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none'; 
            if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex'; 
        } 
    }); 
}

export function joinTournament(tId) { 
    if (!appState.isTeamCaptain) return; 
    appState.db.ref(`tournaments/${tId}/teams/${appState.myTeamId}`).set({ name: appState.myTeamName }); 
    appState.db.ref(`tournaments/${tId}/standings/${appState.myTeamId}`).set({ points: 0, name: appState.myTeamName }); 
}

export function renderActiveTournament(trnSnap) {
    if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none'; 
    if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex'; 
    const trn = trnSnap.val(); 
    if (!trn) return;

    const isFinished = trn.status === 'finished'; 
    if (els.activeTrnTitle) {
        els.activeTrnTitle.textContent = trn.name + (isFinished ? " (Concluso)" : "");
    }

    const amIHost = (trn.hostId === appState.myId); 
    if (els.editTrnNameBtn) els.editTrnNameBtn.style.display = (amIHost && !isFinished) ? 'block' : 'none'; 
    if (els.leaveTrnBtn) els.leaveTrnBtn.style.display = (appState.isTeamCaptain && !isFinished) ? 'block' : 'none';
    
    if (els.trnStandingsBody) {
        els.trnStandingsBody.innerHTML = ''; 
        let std = Object.entries(trn.standings || {}).map(([id, data]) => ({ id, ...data })); 
        std.sort((a, b) => b.points - a.points);
        std.forEach((s, idx) => {
            let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            const tr = document.createElement('tr'); 
            const tdMed = document.createElement('td'); tdMed.textContent = med; 
            const tdName = document.createElement('td'); const nameB = document.createElement('b'); nameB.textContent = s.name; tdName.appendChild(nameB);
            if (s.id === appState.myTeamId) tdName.appendChild(document.createTextNode(" (Voi)"));
            const tdPts = document.createElement('td'); const ptsB = document.createElement('b'); ptsB.textContent = s.points; tdPts.appendChild(ptsB);
            tr.appendChild(tdMed); tr.appendChild(tdName); tr.appendChild(tdPts); 
            els.trnStandingsBody.appendChild(tr);
        });
    }

    if (els.trnBracketContainer) {
        els.trnBracketContainer.innerHTML = '';
        if (trn.status === 'open') {
            const waitP = document.createElement('p'); 
            waitP.style.cssText = 'text-align:center; color:var(--hint-color); font-size:0.9em;'; 
            waitP.textContent = "Il torneo è aperto, attendi l'avvio dall'organizzatore."; 
            els.trnBracketContainer.appendChild(waitP);
        } else if (trn.matches) {
            Object.entries(trn.matches).forEach(([mId, m]) => {
                const isMyMatch = (m.teamA === appState.myTeamId || m.teamB === appState.myTeamId); 
                const card = document.createElement('div'); card.className = 'match-card';
                if (isMyMatch) { card.style.borderColor = "var(--champ-color)"; card.style.borderWidth = "2px"; }
                
                let aColor = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)"); 
                let bColor = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
                
                const matchCardTeams = document.createElement('div'); matchCardTeams.className = "match-card-teams";
                const tA = document.createElement('div'); tA.style.color = aColor; const bA = document.createElement('b'); bA.textContent = m.teamAName; tA.appendChild(bA);
                const mVs = document.createElement('div'); mVs.className = "match-vs"; mVs.textContent = "VS";
                const tB = document.createElement('div'); tB.style.color = bColor; const bB = document.createElement('b'); bB.textContent = m.teamBName; tB.appendChild(bB);
                matchCardTeams.appendChild(tA); matchCardTeams.appendChild(mVs); matchCardTeams.appendChild(tB);
                card.appendChild(matchCardTeams);

                if (m.status !== 'finished') {
                    const slotsDiv = document.createElement('div'); slotsDiv.style.cssText = 'display:flex; width:100%; gap:8px;';
                    
                    const btnA = document.createElement('button'); btnA.className = 'slot-btn' + (m.playerA ? ' filled' : '');
                    btnA.style.cssText = "flex:1; min-width:0; margin:0; padding:8px 4px; font-size:0.85em;";
                    btnA.innerHTML = m.playerA ? `✅ <b>${escapeHTML(m.playerA.name)}</b><br><small>(${escapeHTML(m.teamAName)})</small>` : `🟢 <b>Scegli per ${escapeHTML(m.teamAName)}</b><br><small>(Posto A)</small>`; 
                    btnA.onclick = () => toggleTrnSlot(mId, 'A', m.teamA, m.teamAName);
                    
                    const btnB = document.createElement('button'); btnB.className = 'slot-btn' + (m.playerB ? ' filled' : '');
                    btnB.style.cssText = "flex:1; min-width:0; margin:0; padding:8px 4px; font-size:0.85em;";
                    btnB.innerHTML = m.playerB ? `✅ <b>${escapeHTML(m.playerB.name)}</b><br><small>(${escapeHTML(m.teamBName)})</small>` : `🟢 <b>Scegli per ${escapeHTML(m.teamBName)}</b><br><small>(Posto B)</small>`; 
                    btnB.onclick = () => toggleTrnSlot(mId, 'B', m.teamB, m.teamBName);
                    
                    slotsDiv.appendChild(btnA); slotsDiv.appendChild(btnB); card.appendChild(slotsDiv);
                    
                    if (m.playerA && m.playerB && (m.playerA.id === appState.myId || m.playerB.id === appState.myId)) {
                        const joinBtn = document.createElement('button'); joinBtn.className = 'btn-success'; joinBtn.style.cssText = 'font-size:0.9em; padding:8px; margin-top:8px;'; joinBtn.textContent = '⚡ ENTRA NELLA SFIDA'; 
                        joinBtn.onclick = () => startTrnMatch(mId); 
                        card.appendChild(joinBtn);
                    }
                } else { 
                    const finDiv = document.createElement('div'); finDiv.style.cssText = 'font-size:0.85em; color:#4caf50; font-weight:bold; margin-top:5px;'; finDiv.textContent = 'Concluso'; 
                    card.appendChild(finDiv); 
                }
                els.trnBracketContainer.appendChild(card);
            });
        }
    }
}

export function toggleTrnSlot(matchId, side, teamId, targetTeamName = "questa squadra") {
    if (teamId !== appState.myTeamId) {
        return alert(`⚠️ Questo posto è riservato alla squadra "${targetTeamName}"!\n\nTu fai parte della squadra "${appState.myTeamName || 'Nessuna'}".`);
    }
    const slotRef = appState.db.ref(`tournaments/${uiState.activeTrnId}/matches/${matchId}/player${side}`);
    slotRef.once('value', snap => { 
        if (!snap.exists()) slotRef.set({ id: appState.myId, name: appState.myName }); 
        else if (snap.val().id === appState.myId) slotRef.remove();
        else alert("⚠️ Questo posto è già stato occupato da " + snap.val().name); 
    });
}

export function startTrnMatch(matchId) {
    const rc = "TRN_" + matchId;
    appState.db.ref(`rooms/${rc}`).once('value', s => {
        if (s.exists()) {
            if (window.joinSpecificRoom) window.joinSpecificRoom(rc);
        } else {
            appState.db.ref('rooms/' + rc).set({ 
                status: 'waiting', type: 'multi', mode: 'pingpong', wpm: 20, tone: 600, wordCount: 20, fixedSpeed: false, 
                createdAt: window.firebase.database.ServerValue.TIMESTAMP, expiresAt: Date.now() + 1800000, hostId: appState.myId 
            }).then(() => { if (window.joinSpecificRoom) window.joinSpecificRoom(rc); });
        }
    });
}
