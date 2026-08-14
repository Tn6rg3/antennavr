// js/teams_manager.js

window.checkMyTeamStatus = async function() {
    // OTTIMIZZAZIONE: Cerchiamo prima il teamId nel profilo utente per evitare di scaricare TUTTI i team
    let tId = null;
    try {
        const uSnap = await db.ref(`users/${myId}/teamId`).once('value');
        tId = uSnap.val();
    } catch(e) {}

    if (tId) {
        db.ref(`teams/${tId}`).once('value', snap => {
            const team = snap.val();
            if (team && team.members && team.members[myId] && team.status !== 'retired') {
                myTeamId = tId;
                myTeamName = team.name;
                isTeamCaptain = (team.captainId === myId);

                if (els.noTeamView) els.noTeamView.style.display = 'none';
                if (els.myTeamView) els.myTeamView.style.display = 'flex';
                window.listenToMyTeam();
                window.listenToTournaments();
                window.listenToAllTeams(true);
                window.switchTeamTab('gest');
                return;
            } else {
                // Se il team non esiste o non siamo più membri, puliamo il riferimento
                db.ref(`users/${myId}/teamId`).remove();
                window.checkMyTeamStatusFallback();
            }
        });
    } else {
        window.checkMyTeamStatusFallback();
    }
};

window.checkMyTeamStatusFallback = function() {
    // Vecchio metodo (scansione) come fallback o per utenti vecchi
    db.ref('teams').once('value', snap => {
        myTeamId = null; isTeamCaptain = false; myTeamName = "";
        snap.forEach(team => {
            if (team.child('members').hasChild(myId)) {
                myTeamId = team.key;
                myTeamName = team.val().name;
                isTeamCaptain = (team.val().captainId === myId);
                // Salviamo per la prossima volta
                db.ref(`users/${myId}/teamId`).set(myTeamId);
            }
        });
        if (myTeamId) {
            if (els.noTeamView) els.noTeamView.style.display = 'none';
            if (els.myTeamView) els.myTeamView.style.display = 'flex';
            window.listenToMyTeam();
            window.listenToTournaments();
            window.listenToAllTeams(true);
            window.switchTeamTab('gest');
        } else {
            if (els.myTeamView) els.myTeamView.style.display = 'none';
            if (els.noTeamView) els.noTeamView.style.display = 'flex';
            window.listenToAllTeams(false);
            window.switchTeamTab('gest');
        }
    });
};

window.switchTeamTab = function(tab) {
    [els.tabTeamGestBtn, els.tabAllTeamsBtn, els.tabTournamentsBtn].forEach(b => { if (b) b.classList.remove('active-tab'); });
    if (els.noTeamView) els.noTeamView.style.display = 'none';
    if (els.myTeamView) els.myTeamView.style.display = 'none';
    if (els.allTeamsArea) els.allTeamsArea.style.display = 'none';
    if (els.tournamentsArea) els.tournamentsArea.style.display = 'none';

    // OTTIMIZZAZIONE: Spegniamo i listener delle tab non attive
    if (tab !== 'allteams' && listeners.allTeams) {
        db.ref('teams').off('value', listeners.allTeams);
        listeners.allTeams = null;
    }
    if (tab !== 'tournaments' && listeners.trn) {
        db.ref('tournaments').off('value', listeners.trn);
        listeners.trn = null;
    }

    if (tab === 'gest') {
        if (els.tabTeamGestBtn) els.tabTeamGestBtn.classList.add('active-tab');
        if (myTeamId) { if (els.myTeamView) els.myTeamView.style.display = 'flex'; }
        else { if (els.noTeamView) els.noTeamView.style.display = 'flex'; }
    } else if (tab === 'allteams') {
        if (els.tabAllTeamsBtn) els.tabAllTeamsBtn.classList.add('active-tab');
        if (els.allTeamsArea) els.allTeamsArea.style.display = 'flex';
        window.listenToAllTeams(!!myTeamId);
    } else {
        if (els.tabTournamentsBtn) els.tabTournamentsBtn.classList.add('active-tab');
        if (els.tournamentsArea) els.tournamentsArea.style.display = 'flex';
        window.listenToTournaments();
    }
};

window.listenToAllTeams = function(isAlreadyInTeam) {
    if (listeners.allTeams) return; // Già attivo

    // OTTIMIZZAZIONE: Limitiamo a 30 squadre invece di scaricare tutto il database
    const teamsRef = db.ref('teams').limitToLast(30);
    listeners.allTeams = teamsRef.on('value', snap => {
        if (els.openTeamsList) els.openTeamsList.innerHTML = '';
        if (els.globalAllTeamsList) els.globalAllTeamsList.innerHTML = '';

        snap.forEach(child => {
            const t = child.val();
            const count = Object.keys(t.members || {}).length;
            if (t.status === 'retired' || count === 0) return;

            const liAll = document.createElement('li'); liAll.style.flexDirection = 'column'; liAll.style.alignItems = 'flex-start';
            const topDiv = document.createElement('div'); topDiv.style.cssText = "width:100%; display:flex; justify-content:space-between;";
            if (!isAlreadyInTeam && t.status !== 'closed') { topDiv.style.cursor = 'pointer'; topDiv.onclick = () => window.joinTeam(child.key); }

            const spanTitle = document.createElement('span');
            const bTitle = document.createElement('b'); bTitle.textContent = t.name;
            const smCount = document.createElement('small'); smCount.textContent = ` (${count} mem.)`;
            spanTitle.appendChild(bTitle); spanTitle.appendChild(smCount);
            topDiv.appendChild(spanTitle);

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
                const liOpen = document.createElement('li'); liOpen.style.cursor = 'pointer'; liOpen.onclick = () => window.joinTeam(child.key);
                const leftOpen = document.createElement('span'); const bOpen = document.createElement('b'); bOpen.textContent = t.name; const smallOpen = document.createElement('small'); smallOpen.textContent = ` (${count} mem.)`; leftOpen.appendChild(bOpen); leftOpen.appendChild(smallOpen);
                const rightOpen = document.createElement('span'); rightOpen.style.color = 'var(--link-color)'; rightOpen.style.fontWeight = 'bold'; rightOpen.textContent = "+ Unisciti";
                liOpen.appendChild(leftOpen); liOpen.appendChild(rightOpen); els.openTeamsList.appendChild(liOpen);
            }
        });
        if (els.openTeamsList && !els.openTeamsList.innerHTML) {
            const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra aperta."; els.openTeamsList.appendChild(li);
        }
        if (els.globalAllTeamsList && !els.globalAllTeamsList.innerHTML) {
            const li = document.createElement('li'); li.style.cssText = "color:var(--hint-color); justify-content:center; border:none;"; li.textContent = "Nessuna squadra creata."; els.globalAllTeamsList.appendChild(li);
        }
    });
};

window.joinTeam = function(tId) {
    db.ref(`teams/${tId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername }).then(() => {
        db.ref(`users/${myId}/teamId`).set(tId);
        window.checkMyTeamStatus();
    });
};

window.listenToMyTeam = function() {
    if (listeners.team) db.ref(`teams/${myTeamId}`).off('value', listeners.team);
    listeners.team = db.ref(`teams/${myTeamId}`).on('value', snap => {
        if (!snap.exists() || snap.val().status === 'retired') return window.checkMyTeamStatus();
        const team = snap.val();
        if (els.myTeamNameDisplay) els.myTeamNameDisplay.textContent = team.name;
        if (els.teamStatusText) els.teamStatusText.innerHTML = team.status === 'open' ? '🟢 Adesioni Aperte' : '🔴 Adesioni Chiuse';
        if (els.captainName) els.captainName.innerHTML = '';
        if (els.teamOthersList) els.teamOthersList.innerHTML = '';

        Object.entries(team.members || {}).forEach(([id, mem]) => {
            const span = document.createElement('span');
            span.textContent = mem.name;

            // --- PRIVACY DINAMICA ---
            if (mem.username && String(mem.username).trim() !== "") {
                span.style.color = 'var(--link-color)';
                span.style.cursor = 'pointer';
                span.style.textDecoration = 'underline';
                span.style.fontWeight = 'bold';
                span.onclick = () => openTelegramProfile(mem.username);
            } else {
                span.style.fontWeight = 'bold';
            }

            if (id === team.captainId) {
                if (els.captainName) els.captainName.appendChild(span);
            } else {
                if (els.teamOthersList && els.teamOthersList.children.length > 0) {
                    const sep = document.createElement('span'); sep.style.color = 'var(--hint-color)'; sep.textContent = ' | '; els.teamOthersList.appendChild(sep);
                }
                if (els.teamOthersList) els.teamOthersList.appendChild(span);
            }
        });
        if (els.captainActions) els.captainActions.style.display = isTeamCaptain ? 'block' : 'none';
        if (els.toggleTeamLockBtn) {
            els.toggleTeamLockBtn.textContent = team.status === 'open' ? "Chiudi Adesioni" : "Riapri Adesioni";
            els.toggleTeamLockBtn.onclick = () => db.ref(`teams/${myTeamId}/status`).set(team.status === 'open' ? 'closed' : 'open');
        }
        if (els.inviteTeamBtn) {
            els.inviteTeamBtn.onclick = () => tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${BOT_USERNAME}/${WEBAPP_NAME}?startapp=team_${myTeamId}`)}&text=${encodeURIComponent(`Unisciti alla mia squadra: ${team.name}!`)}`);
        }
        window.setupChat(db.ref(`teams/${myTeamId}/chat`), 'teamChatMessages', null);
    });
};

window.listenToTournaments = function() {
    if (listeners.trn) return; // Già attivo

    // OTTIMIZZAZIONE: Limitiamo ai 20 tornei più recenti
    const trnRef = db.ref('tournaments').limitToLast(20);
    listeners.trn = trnRef.on('value', snap => {
        activeTrnId = null;
        if (els.openTournamentsList) els.openTournamentsList.innerHTML = '';
        if (els.pastTournamentsList) els.pastTournamentsList.innerHTML = '';
        if (els.createTrnPanel) els.createTrnPanel.style.display = isTeamCaptain ? 'flex' : 'none';

        let foundActive = null;
        snap.forEach(child => {
            const trn = child.val(); const trnId = child.key; const isMember = myTeamId && trn.teams && trn.teams[myTeamId]; const isHost = trn.hostId === myId;
            if ((isMember || isHost) && trn.status !== 'finished') {
                if (!foundActive) foundActive = child;
                else if (trn.status === 'playing' && foundActive.val().status !== 'playing') foundActive = child;
            }
            if (trn.status === 'open') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const countSmall = document.createElement('small'); countSmall.textContent = ` (${Object.keys(trn.teams || {}).length} sq.)`; leftSpan.appendChild(nameB); leftSpan.appendChild(countSmall); li.appendChild(leftSpan);
                if (isTeamCaptain && !isMember) {
                    const btn = document.createElement('button'); btn.className = 'action-btn-small btn-champ'; btn.textContent = 'Iscrivi'; btn.onclick = () => window.joinTournament(trnId); li.appendChild(btn);
                } else if (isMember) {
                    const joinedSmall = document.createElement('small'); joinedSmall.style.color = 'var(--link-color)'; joinedSmall.style.fontWeight = 'bold'; joinedSmall.textContent = ' (Iscritto)'; li.appendChild(joinedSmall);
                }
                if (els.openTournamentsList) els.openTournamentsList.appendChild(li);
            } else if (trn.status === 'finished') {
                const li = document.createElement('li'); const leftSpan = document.createElement('span'); const nameB = document.createElement('b'); nameB.textContent = trn.name; const statusSmall = document.createElement('small'); statusSmall.textContent = " (Concluso)"; leftSpan.appendChild(nameB); leftSpan.appendChild(statusSmall); li.appendChild(leftSpan);
                const btn = document.createElement('button'); btn.className = 'action-btn-small btn-secondary'; btn.textContent = 'Vedi Risultati'; btn.onclick = () => window.viewTournament(trnId);
                li.appendChild(btn);
                if (els.pastTournamentsList) els.pastTournamentsList.appendChild(li);
            }
        });
        if (foundActive) {
            activeTrnId = foundActive.key;
            window.renderActiveTournament(foundActive);
        } else {
            if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'flex';
            if (els.trnActiveArea) els.trnActiveArea.style.display = 'none';
            if (els.openTournamentsList && !els.openTournamentsList.innerHTML) {
                const li1 = document.createElement('li'); li1.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li1.textContent = "Nessun torneo aperto."; els.openTournamentsList.appendChild(li1);
            }
            if (els.pastTournamentsList && !els.pastTournamentsList.innerHTML) {
                const li2 = document.createElement('li'); li2.style.cssText="color:var(--hint-color); justify-content:center; border:none;"; li2.textContent = "Nessun torneo concluso."; els.pastTournamentsList.appendChild(li2);
            }
        }
    });
};

window.viewTournament = function(tId) {
    db.ref(`tournaments/${tId}`).once('value', snap => {
        if (snap.exists()) {
            activeTrnId = tId;
            window.renderActiveTournament(snap);
            if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none';
            if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex';
        }
    });
};

window.joinTournament = function(tId) {
    if (!isTeamCaptain) return;
    db.ref(`tournaments/${tId}/teams/${myTeamId}`).set({ name: myTeamName });
    db.ref(`tournaments/${tId}/standings/${myTeamId}`).set({ points: 0, name: myTeamName });
};

window.renderActiveTournament = function(trnSnap) {
    if (els.trnLobbyArea) els.trnLobbyArea.style.display = 'none';
    if (els.trnActiveArea) els.trnActiveArea.style.display = 'flex';
    const trn = trnSnap.val();
    if (!trn) return;

    const isFinished = trn.status === 'finished';
    if (els.activeTrnTitle) {
        els.activeTrnTitle.textContent = trn.name + (isFinished ? (currentLang === 'it' ? " (Concluso)" : " (Finished)") : "");
    }

    if (els.editTrnNameBtn) {
        els.editTrnNameBtn.style.display = (amIHost && !isFinished) ? 'block' : 'none';
        els.editTrnNameBtn.onclick = () => {
            const currentTrnId = window.activeTrnId;
            if (!currentTrnId) {
                console.error("Tournament: activeTrnId is null");
                return showToast("Errore: ID Torneo non trovato.");
            }
            console.log("Tournament: Requesting rename for:", currentTrnId);
            const currentName = trn.name || "";
            const newName = prompt(currentLang === 'it' ? "Nuovo nome del torneo:" : "New tournament name:", currentName);
            if (newName && newName.trim() !== "" && newName !== currentName) {
                db.ref(`tournaments/${currentTrnId}/name`).set(newName.trim()).then(() => {
                    showToast("Nome torneo aggiornato!");
                }).catch(e => console.error("Trn Rename Error:", e));
            }
        };
    }

    if (els.leaveTrnBtn) {
        els.leaveTrnBtn.style.display = (isTeamCaptain && !isFinished) ? 'block' : 'none';
        els.leaveTrnBtn.onclick = () => {
            if (confirm(currentLang === 'it' ? "Vuoi ritirare la tua squadra dal torneo?" : "Do you want to withdraw your team from the tournament?")) {
                if (activeTrnId && myTeamId) {
                    db.ref(`tournaments/${activeTrnId}/teams/${myTeamId}`).remove();
                    db.ref(`tournaments/${activeTrnId}/standings/${myTeamId}`).remove();
                    showToast(currentLang === 'it' ? "Ritiro effettuato." : "Withdrawn successfully.");
                }
            }
        };
    }

    if (els.trnStandingsBody) {
        els.trnStandingsBody.innerHTML = '';
        let std = Object.entries(trn.standings || {}).map(([id, data]) => ({ id, ...data }));
        std.sort((a, b) => b.points - a.points);

        std.forEach((s, idx) => {
            let med = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            const tr = document.createElement('tr');
            const tdMed = document.createElement('td'); tdMed.textContent = med;
            const tdName = document.createElement('td'); const nameB = document.createElement('b'); nameB.textContent = s.name; tdName.appendChild(nameB);
            if (s.id === myTeamId) tdName.appendChild(document.createTextNode(" " + (currentLang === 'it' ? '(Voi)' : '(You)')));
            const tdPts = document.createElement('td'); const ptsB = document.createElement('b'); ptsB.textContent = s.points; tdPts.appendChild(ptsB);
            tr.appendChild(tdMed); tr.appendChild(tdName); tr.appendChild(tdPts);
            els.trnStandingsBody.appendChild(tr);
        });
    }

    if (els.trnHostControls) els.trnHostControls.style.display = (amIHost && !isFinished) ? 'block' : 'none';
    if (els.finishTrnBtn) {
        els.finishTrnBtn.style.display = (amIHost && trn.status === 'playing') ? 'block' : 'none';
        els.finishTrnBtn.onclick = () => {
            if (confirm("Vuoi concludere manualmente il torneo?")) {
                db.ref(`tournaments/${activeTrnId}/status`).set('finished');
            }
        };
    }

    const teamCount = trn.teams ? Object.keys(trn.teams).length : 0;
    if (els.trnTeamCountTxt) {
        els.trnTeamCountTxt.textContent = (currentLang === 'it' ? "Squadre Iscritte: " : "Enrolled Teams: ") + teamCount;
    }

    if (els.startTrnBtn) {
        els.startTrnBtn.disabled = teamCount < 2 || (trn.status !== 'open' && trn.status !== 'playing');
        els.startTrnBtn.textContent = trn.status === 'playing'
            ? (currentLang === 'it' ? "Rigenera Tabellone (Attenzione!)" : "Regenerate Bracket (Warning!)")
            : (currentLang === 'it' ? "Genera Tabellone e Avvia" : "Generate Bracket and Start");
    }

    if (els.trnBracketContainer) {
        els.trnBracketContainer.innerHTML = '';
        if (trn.status === 'open') {
            const waitP = document.createElement('p');
            waitP.style.textAlign = 'center';
            waitP.style.color = 'var(--hint-color)';
            waitP.style.fontSize = '0.9em';
            waitP.textContent = currentLang === 'it' ? "Il torneo è aperto, attendi l'avvio dall'organizzatore." : "The tournament is open, wait for the host to start.";
            els.trnBracketContainer.appendChild(waitP);
        } else if (trn.matches) {
            Object.entries(trn.matches).forEach(([mId, m]) => {
                const isMyMatch = (m.teamA === myTeamId || m.teamB === myTeamId);
                const card = document.createElement('div');
                card.className = 'match-card';
                if (isMyMatch) {
                    card.style.borderColor = "var(--champ-color)";
                    card.style.borderWidth = "2px";
                }

                let aColor = m.winnerTeamId === m.teamA ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");
                let bColor = m.winnerTeamId === m.teamB ? "#4caf50" : (m.winnerTeamId ? "#999" : "var(--text-color)");

                const matchCardTeams = document.createElement('div'); matchCardTeams.className = "match-card-teams";
                const tA = document.createElement('div'); tA.style.color = aColor; const bA = document.createElement('b'); bA.textContent = m.teamAName; tA.appendChild(bA);
                const mVs = document.createElement('div'); mVs.className = "match-vs"; mVs.textContent = "VS";
                const tB = document.createElement('div'); tB.style.color = bColor; const bB = document.createElement('b'); bB.textContent = m.teamBName; tB.appendChild(bB);
                matchCardTeams.appendChild(tA); matchCardTeams.appendChild(mVs); matchCardTeams.appendChild(tB);
                card.appendChild(matchCardTeams);

                if (m.status !== 'finished') {
                    const slotsDiv = document.createElement('div');
                    slotsDiv.style.display = 'flex';
                    slotsDiv.style.width = '100%';
                    slotsDiv.style.gap = '8px';

                    const btnA = document.createElement('button');
                    btnA.className = 'slot-btn' + (m.playerA ? ' filled' : '');
                    btnA.style.flex = "1";
                    btnA.style.minWidth = "0";
                    btnA.style.margin = "0";
                    btnA.style.padding = "8px 4px";
                    btnA.style.fontSize = "0.85em";
                    btnA.innerHTML = m.playerA
                        ? `✅ <b>${window.escapeHtml(m.playerA.name)}</b><br><small>(${window.escapeHtml(m.teamAName)})</small>`
                        : `🟢 <b>Scegli per ${window.escapeHtml(m.teamAName)}</b><br><small>(Posto A)</small>`;
                    btnA.onclick = () => window.toggleTrnSlot(mId, 'A', m.teamA, m.teamAName);

                    const btnB = document.createElement('button');
                    btnB.className = 'slot-btn' + (m.playerB ? ' filled' : '');
                    btnB.style.flex = "1";
                    btnB.style.minWidth = "0";
                    btnB.style.margin = "0";
                    btnB.style.padding = "8px 4px";
                    btnB.style.fontSize = "0.85em";
                    btnB.innerHTML = m.playerB
                        ? `✅ <b>${window.escapeHtml(m.playerB.name)}</b><br><small>(${window.escapeHtml(m.teamBName)})</small>`
                        : `🟢 <b>Scegli per ${window.escapeHtml(m.teamBName)}</b><br><small>(Posto B)</small>`;
                    btnB.onclick = () => window.toggleTrnSlot(mId, 'B', m.teamB, m.teamBName);

                    slotsDiv.appendChild(btnA);
                    slotsDiv.appendChild(btnB);
                    card.appendChild(slotsDiv);

                    if (m.playerA && m.playerB && (m.playerA.id === myId || m.playerB.id === myId)) {
                        const joinBtn = document.createElement('button');
                        joinBtn.className = 'btn-success';
                        joinBtn.style.fontSize = '0.9em';
                        joinBtn.style.padding = '8px';
                        joinBtn.style.marginTop = '8px';
                        joinBtn.textContent = currentLang === 'it' ? '⚡ ENTRA NELLA SFIDA' : '⚡ JOIN MATCH';
                        joinBtn.onclick = () => window.startTrnMatch(mId);
                        card.appendChild(joinBtn);
                    }
                } else {
                    const finDiv = document.createElement('div');
                    finDiv.style.fontSize = '0.85em';
                    finDiv.style.color = '#4caf50';
                    finDiv.style.fontWeight = 'bold';
                    finDiv.style.marginTop = '5px';
                    finDiv.textContent = currentLang === 'it' ? 'Concluso' : 'Finished';
                    card.appendChild(finDiv);
                }
                els.trnBracketContainer.appendChild(card);
            });
        }
    }
};

if (els.goToTeamsBtn) els.goToTeamsBtn.addEventListener('click', () => window.showScreen('teamsScreen'));

window.processTeamInvite = function(inviteTeamId) {
    db.ref(`teams/${inviteTeamId}`).once('value', snap => {
        if (snap.exists() && snap.val().status === 'open') {
            db.ref(`teams/${inviteTeamId}/members/${myId}`).set({ name: myName, username: myPrivacy ? "" : tgUsername });
            tg.showAlert(`Sei entrato nella squadra ${snap.val().name}!`);
            window.showScreen('teamsScreen');
        } else {
            tg.showAlert("Squadra non esistente o chiusa.");
            window.showScreen('setupScreen');
        }
    });
};

if (els.createTeamBtn) {
    els.createTeamBtn.addEventListener('click', () => {
        const tName = els.newTeamName ? els.newTeamName.value.trim() : "";
        if (!tName) return;
        const newTeamRef = db.ref('teams').push();
        newTeamRef.set({
            name: tName,
            captainId: myId,
            status: 'open',
            members: { [myId]: { name: myName, username: myPrivacy ? "" : tgUsername } }
        }).then(() => {
            db.ref(`users/${myId}/teamId`).set(newTeamRef.key);
            window.checkMyTeamStatus();
        });
    });
}

if (els.clearTeamChatBtn) {
    els.clearTeamChatBtn.addEventListener('click', () => {
        if (confirm('Vuoi cancellare la chat di squadra?')) if (myTeamId) db.ref(`teams/${myTeamId}/chat`).remove();
    });
}
if (els.sendTeamChatBtn) {
    els.sendTeamChatBtn.addEventListener('click', async () => {
        if (typeof window.canUserChat === 'function' && !(await window.canUserChat())) return;
        const txt = els.teamChatInput.value.trim();
        if (!txt || !myTeamId) return;
        db.ref(`teams/${myTeamId}/chat`).push({ name: myName, username: myPrivacy ? "" : tgUsername, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
        els.teamChatInput.value = '';
    });
}
if (els.teamChatInput) {
    els.teamChatInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && els.sendTeamChatBtn) els.sendTeamChatBtn.click();
    });
}
if (els.leaveTeamBtn) {
    els.leaveTeamBtn.addEventListener('click', () => {
        if (confirm("Vuoi abbandonare la squadra?")) {
            db.ref(`teams/${myTeamId}`).once('value', snap => {
                const team = snap.val();
                db.ref(`users/${myId}/teamId`).remove(); // OTTIMIZZAZIONE
                if (isTeamCaptain) {
                    let others = Object.keys(team.members).filter(id => id !== myId);
                    if (others.length > 0) db.ref(`teams/${myTeamId}/captainId`).set(others[0]).then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => window.checkMyTeamStatus()));
                    else db.ref(`teams/${myTeamId}/status`).set('retired').then(() => db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => window.checkMyTeamStatus()));
                } else {
                    db.ref(`teams/${myTeamId}/members/${myId}`).remove().then(() => window.checkMyTeamStatus());
                }
            });
        }
    });
}

if (els.createTrnBtn) {
    els.createTrnBtn.addEventListener('click', () => {
        if (!isTeamCaptain) return;
        const n = els.newTrnName ? els.newTrnName.value.trim() : "";
        if (n) {
            db.ref('tournaments').push().set({
                name: n,
                hostId: myId,
                status: 'open',
                teams: { [myTeamId]: { name: myTeamName } },
                standings: { [myTeamId]: { points: 0, name: myTeamName } }
            });
        }
    });
}
window.joinTournament = function(tId) {
    if (!isTeamCaptain) return;
    db.ref(`tournaments/${tId}/teams/${myTeamId}`).set({ name: myTeamName });
    db.ref(`tournaments/${tId}/standings/${myTeamId}`).set({ points: 0, name: myTeamName });
};

window.toggleTrnSlot = function(matchId, side, teamId, targetTeamName = "questa squadra") {
    if (teamId !== myTeamId) {
        return alert(`⚠️ Questo posto è riservato alla squadra "${targetTeamName}"!\n\nTu fai parte della squadra "${myTeamName || 'Nessuna'}": premi sul pulsante destinato alla tua squadra.`);
    }
    const slotRef = db.ref(`tournaments/${activeTrnId}/matches/${matchId}/player${side}`);
    slotRef.once('value', snap => {
        if (!snap.exists()) {
            slotRef.set({ id: myId, name: myName });
        } else if (snap.val().id === myId) {
            slotRef.remove();
        } else {
            alert("⚠️ Questo posto è già stato occupato da " + snap.val().name);
        }
    });
};

window.startTrnMatch = function(matchId) {
    const rc = "TRN_" + matchId;
    db.ref(`rooms/${rc}`).once('value', s => {
        if (s.exists()) {
            window.joinSpecificRoom(rc);
        } else {
            db.ref('rooms/' + rc).set({
                status: 'waiting',
                type: 'multi',
                mode: 'pingpong',
                wpm: 20,
                tone: 600,
                wordCount: 20,
                fixedSpeed: false,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                expiresAt: Date.now() + 1800000,
                hostId: myId
            }).then(() => window.joinSpecificRoom(rc));
        }
    });
};

window.checkTournamentCompletion = function(trnId) {
    db.ref(`tournaments/${trnId}`).once('value', snap => {
        const trn = snap.val();
        if (!trn || trn.status === 'finished' || !trn.matches) return;
        let allFinished = true;
        Object.values(trn.matches).forEach(m => { if (m.status !== 'finished') allFinished = false; });
        if (allFinished) {
            db.ref(`tournaments/${trnId}/status`).set('finished');
            showToast("Torneo completato! Spostato in archivio.");
            if (trn.standings) {
                Object.entries(trn.standings).forEach(([tId, data]) => {
                    if (data.points > 0) {
                        db.ref(`leaderboard/tournaments/${tId}`).transaction(currentG => {
                            if (!currentG) return { name: data.name, score: data.points, date: new Date().toLocaleDateString('it-IT') };
                            currentG.score = (currentG.score || 0) + data.points;
                            currentG.date = new Date().toLocaleDateString('it-IT');
                            return currentG;
                        });
                    }
                });
            }
        }
    });
};
