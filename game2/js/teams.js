// ============================================================================
// TEAMS.JS - SQUADRE, RECLUTAMENTO E CHAT DI SQUADRA
// ============================================================================

import { appState, listeners } from './state.js';
import { els, showScreen, showToast } from './ui.js';
import { setupChat } from './chat.js';

export function checkMyTeamStatus() {
    appState.db.ref('teams').once('value', snap => {
        appState.myTeamId = null; 
        appState.isTeamCaptain = false; 
        appState.myTeamName = "";
        snap.forEach(team => { 
            if (team.child('members').hasChild(appState.myId)) { 
                appState.myTeamId = team.key; 
                appState.myTeamName = team.val().name; 
                appState.isTeamCaptain = (team.val().captainId === appState.myId); 
            } 
        });
        if (appState.myTeamId) { 
            if (els.noTeamView) els.noTeamView.style.display = 'none'; 
            if (els.myTeamView) els.myTeamView.style.display = 'flex'; 
            listenToMyTeam(); 
            listenToAllTeams(true); 
            switchTeamTab('gest'); 
        } else { 
            if (els.myTeamView) els.myTeamView.style.display = 'none'; 
            if (els.noTeamView) els.noTeamView.style.display = 'flex'; 
            listenToAllTeams(false); 
            switchTeamTab('gest'); 
        }
    });
}

export function switchTeamTab(tab) {
    [els.tabTeamGestBtn, els.tabAllTeamsBtn, els.tabTournamentsBtn].forEach(b => { if (b) b.classList.remove('active-tab'); });
    if (els.noTeamView) els.noTeamView.style.display = 'none'; 
    if (els.myTeamView) els.myTeamView.style.display = 'none'; 
    if (els.allTeamsArea) els.allTeamsArea.style.display = 'none'; 
    if (els.tournamentsArea) els.tournamentsArea.style.display = 'none';
    
    if (tab === 'gest') { 
        if (els.tabTeamGestBtn) els.tabTeamGestBtn.classList.add('active-tab'); 
        if (appState.myTeamId) { if (els.myTeamView) els.myTeamView.style.display = 'flex'; }
        else { if (els.noTeamView) els.noTeamView.style.display = 'flex'; }
    } else if (tab === 'allteams') { 
        if (els.tabAllTeamsBtn) els.tabAllTeamsBtn.classList.add('active-tab'); 
        if (els.allTeamsArea) els.allTeamsArea.style.display = 'flex'; 
        listenToAllTeams(!!appState.myTeamId); 
    } else { 
        if (els.tabTournamentsBtn) els.tabTournamentsBtn.classList.add('active-tab'); 
        if (els.tournamentsArea) els.tournamentsArea.style.display = 'flex'; 
        if (window.listenToTournaments) window.listenToTournaments(); 
    }
}

export function joinTeam(tId) { 
    appState.db.ref(`teams/${tId}/members/${appState.myId}`).set({ name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername }).then(() => checkMyTeamStatus()); 
}

export function listenToAllTeams(isAlreadyInTeam) {
    if (listeners.allTeams) appState.db.ref('teams').off('value', listeners.allTeams);
    listeners.allTeams = appState.db.ref('teams').on('value', snap => {
        if (els.openTeamsList) els.openTeamsList.innerHTML = ''; 
        if (els.globalAllTeamsList) els.globalAllTeamsList.innerHTML = '';
        snap.forEach(child => {
            const t = child.val(); 
            const count = Object.keys(t.members || {}).length; 
            if (t.status === 'retired' || count === 0) return;
            const liAll = document.createElement('li'); liAll.style.flexDirection = 'column'; liAll.style.alignItems = 'flex-start';
            const topDiv = document.createElement('div'); topDiv.style.cssText = "width:100%; display:flex; justify-content:space-between;";
            if (!isAlreadyInTeam && t.status !== 'closed') { topDiv.style.cursor = 'pointer'; topDiv.onclick = () => joinTeam(child.key); }
            const spanTitle = document.createElement('span');
            const bTitle = document.createElement('b'); bTitle.textContent = t.name;
            const smCount = document.createElement('small'); smCount.textContent = ` (${count} mem.)`;
            spanTitle.appendChild(bTitle); spanTitle.appendChild(smCount); topDiv.appendChild(spanTitle);
            if (!isAlreadyInTeam && t.status !== 'closed') {
                const spanJoin = document.createElement('span'); spanJoin.style.cssText = "color:var(--link-color); font-size:0.8em; font-weight:bold;"; spanJoin.textContent = "+ Unisciti"; topDiv.appendChild(spanJoin);
            }
            const memDiv = document.createElement('div'); memDiv.style.cssText = "margin-top:3px; padding-left:5px; border-left:2px solid var(--link-color);";
            Object.values(t.members || {}).forEach(m => {
                const spanM = document.createElement('span'); spanM.style.cssText = "display:inline-block; margin-right:5px; font-size:0.85em; color:var(--hint-color);"; spanM.textContent = `- ${m.name}`; memDiv.appendChild(spanM);
            });
            liAll.appendChild(topDiv); liAll.appendChild(memDiv);
            if (els.globalAllTeamsList) els.globalAllTeamsList.appendChild(liAll);
            if (!isAlreadyInTeam && t.status !== 'closed' && els.openTeamsList) {
                const liOpen = document.createElement('li'); liOpen.style.cursor = 'pointer'; liOpen.onclick = () => joinTeam(child.key);
                const leftOpen = document.createElement('span'); const bOpen = document.createElement('b'); bOpen.textContent = t.name; const smallOpen = document.createElement('small'); smallOpen.textContent = ` (${count} mem.)`; leftOpen.appendChild(bOpen); leftOpen.appendChild(smallOpen);
                const rightOpen = document.createElement('span'); rightOpen.style.color = 'var(--link-color)'; rightOpen.style.fontWeight = 'bold'; rightOpen.textContent = "+ Unisciti";
                liOpen.appendChild(leftOpen); liOpen.appendChild(rightOpen); els.openTeamsList.appendChild(liOpen);
            }
        });
    });
}

function listenToMyTeam() {
    if (listeners.team) appState.db.ref(`teams/${appState.myTeamId}`).off('value', listeners.team);
    listeners.team = appState.db.ref(`teams/${appState.myTeamId}`).on('value', snap => {
        if (!snap.exists() || snap.val().status === 'retired') return checkMyTeamStatus();
        const team = snap.val(); 
        if (els.myTeamNameDisplay) els.myTeamNameDisplay.textContent = team.name; 
        if (els.teamStatusText) els.teamStatusText.innerHTML = team.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';
        if (els.captainName) els.captainName.innerHTML = ''; 
        if (els.teamOthersList) els.teamOthersList.innerHTML = '';
        Object.entries(team.members || {}).forEach(([id, mem]) => {
            const span = document.createElement('span'); span.textContent = mem.name;
            if (id === team.captainId) { if (els.captainName) els.captainName.appendChild(span); }
            else { 
                if (els.teamOthersList && els.teamOthersList.children.length > 0) { 
                    const sep = document.createElement('span'); sep.style.color = 'var(--hint-color)'; sep.textContent = ' | '; els.teamOthersList.appendChild(sep); 
                } 
                if (els.teamOthersList) els.teamOthersList.appendChild(span); 
            }
        });
        if (els.captainActions) els.captainActions.style.display = appState.isTeamCaptain ? 'block' : 'none';
        if (els.toggleTeamLockBtn) {
            els.toggleTeamLockBtn.textContent = team.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni"; 
            els.toggleTeamLockBtn.onclick = () => appState.db.ref(`teams/${appState.myTeamId}/status`).set(team.status === 'open' ? 'closed' : 'open');
        }
        setupChat(appState.db.ref(`teams/${appState.myTeamId}/chat`), 'teamChatMessages', null);
    });
}

export function initTeamListeners() {
    if (els.createTeamBtn) {
        els.createTeamBtn.addEventListener('click', () => {
            const tName = els.newTeamName ? els.newTeamName.value.trim() : ""; 
            if (!tName) return;
            appState.db.ref('teams').push().set({ name: tName, captainId: appState.myId, status: 'open', members: { [appState.myId]: { name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername } } }).then(() => checkMyTeamStatus());
        });
    }
    if (els.clearTeamChatBtn) {
        els.clearTeamChatBtn.addEventListener('click', () => { 
            if (confirm('Vuoi cancellare la chat di squadra?')) if (appState.myTeamId) appState.db.ref(`teams/${appState.myTeamId}/chat`).remove(); 
        });
    }
    if (els.sendTeamChatBtn) {
        els.sendTeamChatBtn.addEventListener('click', () => { 
            const txt = els.teamChatInput.value.trim(); 
            if (!txt || !appState.myTeamId) return; 
            appState.db.ref(`teams/${appState.myTeamId}/chat`).push({ name: appState.myName, username: appState.myPrivacy ? "" : appState.tgUsername, text: txt, ts: window.firebase.database.ServerValue.TIMESTAMP }); 
            els.teamChatInput.value = ''; 
        });
    }
    if (els.leaveTeamBtn) {
        els.leaveTeamBtn.addEventListener('click', () => {
            if (confirm("Vuoi abbandonare la squadra?")) {
                appState.db.ref(`teams/${appState.myTeamId}`).once('value', snap => {
                    const team = snap.val();
                    if (appState.isTeamCaptain) {
                        let others = Object.keys(team.members).filter(id => id !== appState.myId);
                        if (others.length > 0) appState.db.ref(`teams/${appState.myTeamId}/captainId`).set(others[0]).then(() => appState.db.ref(`teams/${appState.myTeamId}/members/${appState.myId}`).remove().then(() => checkMyTeamStatus()));
                        else appState.db.ref(`teams/${appState.myTeamId}/status`).set('retired').then(() => appState.db.ref(`teams/${appState.myTeamId}/members/${appState.myId}`).remove().then(() => checkMyTeamStatus()));
                    } else {
                        appState.db.ref(`teams/${appState.myTeamId}/members/${appState.myId}`).remove().then(() => checkMyTeamStatus());
                    }
                });
            }
        });
    }
}
