// js/leaderboard_manager.js

window.lbGroups = {
    daily: [
        { val: 'daily_challenge', it: '📅 Sfida Giornaliera', en: '📅 Daily Challenge' },
        { val: 'room', it: '🏁 Risultati Ultima Partita', en: '🏁 Last Match Results' }
    ],
    multi: [
        { val: 'std_multi', it: '⚔️ Sfide Parole (Multi)', en: '⚔️ Words Challenges' },
        { val: 'chars_multi', it: '⚔️ Sfide Caratteri (Multi)', en: '⚔️ Chars Challenges' },
        { val: 'quiz_multi', it: '⚔️ Sfide Quiz (Multi)', en: '⚔️ Quiz Challenges' },
        { val: 'pingpong', it: '🏓 Sfide Ping Pong', en: '🏓 Ping Pong Challenges' },
        { val: 'trn_global', it: '🏆 Classifica Tornei (Team)', en: '🏆 Tournament Standings' }
    ],
    single: [
        { val: 'std_single', it: '👤 Allenamento Parole', en: '👤 Words Practice' },
        { val: 'chars_single', it: '👤 Allenamento Caratteri', en: '👤 Chars Practice' },
        { val: 'quiz_single', it: '👤 Allenamento Quiz', en: '👤 Quiz Practice' }
    ],
    special: [
        { val: 'cwfreak', it: '🎙️ Nominativi (CW Freak)', en: '🎙️ Callsigns (CW Freak)' }
    ]
};

window.switchLBGroup = function(groupId) {
    // Aggiorna UI tab
    document.querySelectorAll('#lbCategoryTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
    const activeBtn = document.getElementById('tab' + groupId.charAt(0).toUpperCase() + groupId.slice(1) + 'LB');
    if (activeBtn) activeBtn.classList.add('active-tab');

    // Popola select sotto-modi
    const select = document.getElementById('lbModeSelect');
    if (!select) return;

    select.innerHTML = '';
    const modes = window.lbGroups[groupId] || [];
    modes.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.val;
        opt.textContent = currentLang === 'it' ? m.it : m.en;
        select.appendChild(opt);
    });

    // Avvia caricamento del primo modo del gruppo
    if (modes.length > 0) {
        select.value = modes[0].val;
        window.showLeaderboardTab(modes[0].val);
    }
};

window.showLeaderboardTab = function(modeValue) {
    if (els.trnSubTabs) els.trnSubTabs.style.display = 'none';
    if (els.lbFilterArea) els.lbFilterArea.style.display = 'none';
    if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none';
    if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';

    if (modeValue === 'room') {
        els.roomWinnerBanner.style.display = 'block';
        els.leaderboardContainer.innerHTML = '';
        if (roomCode) {
            db.ref(`rooms/${roomCode}/players`).once('value', snap => window.renderRoomLeaderboard(snap.val() || {}));
        } else {
            els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Nessuna partita attiva.':'No active match.'}</p>`;
        }
    } else if (modeValue === 'daily_challenge') {
        window.fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else if (modeValue === 'trn_global') {
        els.trnSubTabs.style.display = 'flex';
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
        if (els.btnTrnGlobalLB) els.btnTrnGlobalLB.classList.add('active-tab');
        window.fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeValue === 'cwfreak') {
        window.fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (modeValue === 'pingpong') {
        els.lbFilterArea.style.display = 'block';
        window.populateDynamicFilters('pingpong', '');
        window.fetchAndRenderGlobalLeaderboard('pingpong', els.lbWordFilter ? els.lbWordFilter.value : 'all');
    } else {
        // Modalità standard (multi/single)
        els.lbFilterArea.style.display = 'block';
        let isMulti = modeValue.endsWith('_multi');
        let type = isMulti ? 'multi' : 'single';
        let baseMode = modeValue.split('_')[0]; // standard, chars, quiz

        let filterPath = isMulti ? `recent_matches/${baseMode}_multi` : baseMode;
        window.populateDynamicFilters(filterPath, isMulti ? '' : 'single');
        window.fetchAndRenderGlobalLeaderboard(`${baseMode}_${type}`, els.lbWordFilter ? els.lbWordFilter.value : 'all');
    }
};

window.populateDynamicFilters = function(modePath, subTypeFilter = "") {
    if (!els.lbWordFilter) return;
    const currentValue = els.lbWordFilter.value;
    db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
        let options = [`<option value="all">${currentLang==='it'?'Tutte le categorie':'All categories'}</option>`];
        let counts = [];
        snapshot.forEach(wordCountNode => {
            const key = wordCountNode.key;
            if (modePath.startsWith('recent_matches')) {
                if (key !== 'unknown' && !counts.includes(key)) counts.push(key);
            } else {
                if (!subTypeFilter || key.startsWith(subTypeFilter + "_")) {
                    const count = key.split('_').pop();
                    if (!counts.includes(count)) counts.push(count);
                }
            }
        });
        counts.sort((a,b) => parseInt(a) - parseInt(b)).forEach(c => options.push(`<option value="${c}">${c} ${currentLang==='it'?'Stringhe':'Strings'}</option>`));
        els.lbWordFilter.innerHTML = options.join('');
        if (counts.includes(currentValue) || currentValue === 'all') els.lbWordFilter.value = currentValue;
    });
};

window.listenToRoomLeaderboard = function() {
    if (!roomCode) return;
    if (listeners.roomLb) db.ref(`rooms/${roomCode}`).off('value', listeners.roomLb);
    listeners.roomLb = db.ref(`rooms/${roomCode}`).on('value', snap => {
        if (!snap.exists()) return;
        const roomData = snap.val(), players = roomData.players || {};
        if (document.getElementById('lbModeSelect')?.value === "room") window.renderRoomLeaderboard(players);

        let allFinished = true;
        Object.values(players).forEach(p => { if (!p.finished) allFinished = false; });
        if (allFinished && roomData.status !== 'finished' && Object.keys(players).length > 0) {
            db.ref(`rooms/${roomCode}/status`).set('finished');
            if (Object.keys(players).length >= 2 && ['multi', 'pingpong', 'chars', 'quiz'].includes(roomData.type || currentMode)) {
                window.saveMatchToGlobalHistory(players, roomData);
            }
            if (roomCode.startsWith("TRN_")) {
                const matchId = roomCode.replace("TRN_", "");
                let highestScore = -1, winnerTeamId = null;
                Object.values(players).forEach(p => {
                    if (p.score > highestScore) { highestScore = p.score; winnerTeamId = p.teamId; }
                    else if (p.score === highestScore) winnerTeamId = "tie";
                });
                if (winnerTeamId && activeTrnId) {
                    db.ref(`tournaments/${activeTrnId}/matches/${matchId}`).update({ status: 'finished', winnerTeamId: winnerTeamId }).then(() => checkTournamentCompletion(activeTrnId));
                    if (winnerTeamId !== "tie") {
                        db.ref(`tournaments/${activeTrnId}/standings/${winnerTeamId}`).transaction(t => {
                            if (t) t.points = (t.points || 0) + 1;
                            return t;
                        });
                    }
                }
                setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 15000);
            } else if (roomData.hostId === myId) {
                setTimeout(() => { if (roomCode) db.ref(`rooms/${roomCode}`).remove(); }, 30000);
            }
        }
    });
};

window.renderRoomLeaderboard = function(players) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = '';
    let allFinished = true;
    const playersArray = Object.entries(players).map(([id, data]) => ({
        id,
        name: data.name || "Sconosciuto",
        username: data.username,
        score: data.score || 0,
        wpm: data.wpm || 0,
        finished: data.finished,
        matchDetails: data.matchDetails || []
    }));
    if (playersArray.length === 0) return;
    playersArray.forEach(p => { if (!p.finished) allFinished = false; });
    if (els.waitingOthersText) els.waitingOthersText.style.display = allFinished ? 'none' : 'block';

    if (allFinished && (roomCode && (roomCode.startsWith("TRN_") || currentMode === 'pingpong' || playersArray.length > 1))) {
        window.renderHeadToHeadView(playersArray, els.leaderboardContainer);
    } else {
        playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, index) => {
            const row = document.createElement('div'); row.className = 'leaderboard-row';
            let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const leftSpan = document.createElement('span'); leftSpan.appendChild(document.createTextNode(medal + " "));
            if (player.username && String(player.username).trim() !== "") {
                const nameLink = document.createElement('span');
                nameLink.style.color = 'var(--link-color)';
                nameLink.style.cursor = 'pointer';
                nameLink.style.textDecoration = 'underline';
                nameLink.textContent = player.name;
                nameLink.onclick = () => openTelegramProfile(player.username);
                leftSpan.appendChild(nameLink);
            } else {
                leftSpan.appendChild(document.createTextNode(player.name));
            }
            leftSpan.appendChild(document.createElement('br'));
            const wpmSmall = document.createElement('small');
            wpmSmall.style.color = 'var(--hint-color)';
            wpmSmall.textContent = `(${player.wpm || 0} WPM)`;
            leftSpan.appendChild(wpmSmall);
            const rightSpan = document.createElement('span');
            const scoreB = document.createElement('b'); scoreB.textContent = `${player.score} pt`; rightSpan.appendChild(scoreB);
            row.appendChild(leftSpan); row.appendChild(rightSpan); els.leaderboardContainer.appendChild(row);
        });
    }
    if (allFinished && playersArray.length > 0 && els.roomWinnerBanner) {
        els.roomWinnerBanner.textContent = roomCode.startsWith("TRN_") ? `🏆 Vince il match: ${playersArray[0].name}` : `🏆 Vincitore: ${playersArray[0].name}`;
    }
};

window.renderHeadToHeadView = function(players, container) {
    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    players.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm));
    const maxScore = players[0].score;
    players.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');

        const nameDiv = document.createElement('div'); nameDiv.className = 'h2h-name'; nameDiv.textContent = p.name;
        if (p.id === myId) {
            const meSmall = document.createElement('small'); meSmall.textContent = ` (${currentLang === 'it' ? 'Tu' : 'You'})`; nameDiv.appendChild(meSmall);
        }
        card.appendChild(nameDiv);

        const statsDiv = document.createElement('div'); statsDiv.className = 'h2h-stats';

        const rowPt = document.createElement('div'); rowPt.className = 'h2h-stat-row';
        const sPtLbl = document.createElement('span'); sPtLbl.textContent = currentLang === 'it' ? 'Punti:' : 'Points:';
        const sPtVal = document.createElement('span'); sPtVal.className = 'h2h-val'; sPtVal.style.color = '#4caf50'; sPtVal.textContent = p.score;
        rowPt.appendChild(sPtLbl); rowPt.appendChild(sPtVal); statsDiv.appendChild(rowPt);

        const rowSp = document.createElement('div'); rowSp.className = 'h2h-stat-row';
        const sSpLbl = document.createElement('span'); sSpLbl.textContent = currentLang === 'it' ? 'Velocità:' : 'Speed:';
        const sSpVal = document.createElement('span'); sSpVal.className = 'h2h-val'; sSpVal.style.color = 'var(--link-color)'; sSpVal.textContent = `${p.wpm} WPM`;
        rowSp.appendChild(sSpLbl); rowSp.appendChild(sSpVal); statsDiv.appendChild(rowSp);

        card.appendChild(statsDiv);

        const hintDiv = document.createElement('div'); hintDiv.className = 'h2h-hint';
        hintDiv.textContent = p.id === myId ? (currentLang === 'it' ? 'Clicca per dettagli' : 'Click for details') : (currentLang === 'it' ? 'Dettagli privati' : 'Details are private');
        card.appendChild(hintDiv);

        if (p.id !== myId) hintDiv.style.opacity = "0.5";
        card.onclick = () => {
            if (p.id !== myId) return showToast(currentLang === 'it' ? "Puoi vedere solo i tuoi dettagli." : "You can only view your own details.");
            if (p.matchDetails && p.matchDetails.length > 0) window.showPlayerDetailsModal(p.name, p.matchDetails);
            else if (p.id === myId && matchDetailsArray.length > 0) window.showPlayerDetailsModal(p.name, matchDetailsArray);
            else showToast(currentLang === 'it' ? "Dettagli non disponibili" : "Details not available");
        };
        h2h.appendChild(card);
    });
    container.appendChild(h2h);
};

window.showPlayerDetailsModal = function(name, details) {
    if (!els.matchDetailsBody || !els.matchDetailsModal) return;
    els.matchDetailsBody.innerHTML = '';
    const h3 = els.matchDetailsModal.querySelector('h3');
    if (h3) h3.textContent = `${currentLang === 'it' ? 'Dettagli Partita di' : 'Match Details for'} ${name}`;
    details.forEach(row => {
        const tr = document.createElement('tr');
        let color = row.points > 0 ? "#4caf50" : (row.points === 0 && row.typed !== row.real ? "#d32f2f" : "#999999");
        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); renderDiffSecure(bReal, row.real, row.typed || ''); tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
};

window.saveMatchToGlobalHistory = function(players, roomData) {
    if (myId !== roomData.hostId) return;
    const matchId = Date.now().toString();
    let modePath = ['pingpong', 'chars', 'quiz'].includes(currentMode) ? (currentMode === 'pingpong' ? 'pingpong' : `${currentMode}_multi`) : 'standard_multi';
    const matchData = {
        players: Object.entries(players).map(([id, data]) => ({ id, name: data.name, username: data.username || "", score: data.score || 0, wpm: data.wpm || 0, matchDetails: data.matchDetails || [] })),
        mode: currentMode,
        wordCount: roomData.wordCount,
        date: new Date().toLocaleDateString('it-IT'),
        ts: firebase.database.ServerValue.TIMESTAMP
    };
    db.ref(`leaderboard/recent_matches/${modePath}/${roomData.wordCount || 'all'}/${matchId}`).set(matchData);
};

window.fetchAndRenderGlobalLeaderboard = function(tabType, filterWordCount) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Caricamento classifica...':'Loading standings...'}</p>`;

    if (tabType === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        db.ref(`leaderboard/daily_challenge/${todayStr}`)
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, false);
        });
        return;
    }

    if (['standard_multi', 'chars_multi', 'quiz_multi'].includes(tabType)) {
        let dbPath = `leaderboard/recent_matches/${tabType}`;
        console.log("RPG: Fetching matches from:", dbPath, "with filter:", filterWordCount);
        db.ref(dbPath).once('value', snapshot => {
            let matches = [];
            snapshot.forEach(wcNode => {
                if (filterWordCount === 'all' || wcNode.key === filterWordCount) {
                    wcNode.forEach(mNode => matches.push(mNode.val()));
                }
            });
            matches.sort((a,b) => (b.ts || 0) - (a.ts || 0));
            window.renderMatchesHistoryHTML(matches.slice(0, 20), els.leaderboardContainer);
        });
        return;
    }

    if (tabType === 'pingpong') {
        if (filterWordCount !== 'all') {
            db.ref(`leaderboard/pingpong/${filterWordCount}`)
              .orderByChild('score')
              .limitToLast(50)
              .once('value', snapshot => {
                let players = [];
                if (snapshot.exists()) {
                    snapshot.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                }
                players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
            });
        } else {
            db.ref(`leaderboard/pingpong`).once('value', snapshot => {
                let players = [];
                if (snapshot.exists()) {
                    snapshot.forEach(wordCountNode => {
                        wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                    });
                }
                players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
            });
        }
        return;
    }

    if (tabType === 'callsign') {
        db.ref('leaderboard/callsign/global')
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let players = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            }
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, false);
        });
        return;
    }

    if (tabType === 'tournaments') {
        db.ref('leaderboard/tournaments')
          .orderByChild('score')
          .limitToLast(50)
          .once('value', snapshot => {
            let teams = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => { if (child.val()) teams.push(child.val()); });
            }
            teams.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(teams.slice(0, 50), els.leaderboardContainer, false, true);
        });
        return;
    }

    if (tabType === 'active_tournament') {
        if (!activeTrnId) {
            els.leaderboardContainer.innerHTML = '';
            const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color); padding:20px;"; p.textContent = currentLang === 'it' ? "Non sei iscritto a nessun torneo attivo." : "You are not enrolled in any active tournament.";
            els.leaderboardContainer.appendChild(p);
        } else {
            db.ref(`tournaments/${activeTrnId}`).once('value', snap => {
                const trn = snap.val();
                if (trn && trn.standings) {
                    els.leaderboardContainer.innerHTML = '';
                    const header = document.createElement('div'); header.style.cssText = "text-align:center; margin-bottom:10px; padding:5px; background:var(--sec-bg-color); border-radius:8px;";
                    const hSmall = document.createElement('small'); hSmall.style.color = "var(--hint-color)"; hSmall.textContent = currentLang === 'it' ? 'Torneo Attivo:' : 'Active Tournament:';
                    const hB = document.createElement('b'); hB.style.cssText = "color:var(--champ-color); font-size:1.1em;"; hB.textContent = trn.name;
                    header.appendChild(hSmall); header.appendChild(document.createElement('br')); header.appendChild(hB);
                    els.leaderboardContainer.appendChild(header);

                    let std = Object.entries(trn.standings).map(([id, data]) => ({ name: data.name, score: data.points, date: currentLang === 'it' ? "In corso" : "In progress" }));
                    std.sort((a,b) => (Number(b.score) || 0) - (Number(a.score) || 0));
                    const listCont = document.createElement('div');
                    window.renderPlayersListHTML(std.slice(0, 50), listCont, false, true);
                    els.leaderboardContainer.appendChild(listCont);
                } else {
                    els.leaderboardContainer.innerHTML = '';
                    const p = document.createElement('p'); p.style.cssText = "text-align:center; color:var(--hint-color); padding:20px;"; p.textContent = currentLang === 'it' ? 'Dati torneo non disponibili.' : 'Tournament data unavailable.';
                    els.leaderboardContainer.appendChild(p);
                }
            });
        }
        return;
    }

    // Modalità standard singolo
    let baseMode = tabType.split('_')[0];
    db.ref(`leaderboard/${baseMode}`).once('value', snapshot => {
        let players = [];
        if (snapshot.exists()) {
            snapshot.forEach(wordCountNode => {
                const key = wordCountNode.key;
                // Se filterWordCount è 'all', prendiamo tutto quello che inizia con 'single_'
                // Se è specifico, cerchiamo 'single_10', 'single_20' ecc.
                const targetKeyPrefix = 'single_';
                if (filterWordCount === 'all') {
                    if (key.startsWith(targetKeyPrefix)) {
                        wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                    }
                } else if (key === targetKeyPrefix + filterWordCount) {
                    wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                }
            });
        }
        players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
    });
};

window.renderMatchesHistoryHTML = function(matches, container) {
    container.innerHTML = '';
    if (matches.length === 0) {
        const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.style.padding = '20px'; p.textContent = currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.'; container.appendChild(p); return;
    }
    matches.forEach(match => {
        const mw = document.createElement('div'); mw.style.marginBottom = "25px"; mw.style.borderBottom = "1px dashed var(--hint-color)"; mw.style.paddingBottom = "15px";
        const infoDiv = document.createElement('div'); infoDiv.style.textAlign = 'center'; infoDiv.style.fontSize = '0.8em'; infoDiv.style.color = 'var(--hint-color)'; infoDiv.style.marginBottom = '8px';
        infoDiv.textContent = `📅 ${match.date} - ${match.wordCount} Stringhe`; mw.appendChild(infoDiv);
        window.renderHeadToHeadView(match.players, mw); container.appendChild(mw);
    });
};

window.renderPlayersListHTML = function(players, container, showWordCount, isTeam = false) {
    container.innerHTML = '';
    if (players.length === 0) {
        const p = document.createElement('p'); p.style.textAlign = 'center'; p.style.color = 'var(--hint-color)'; p.style.padding = '20px';
        p.textContent = currentLang === 'it' ? 'Nessun record trovato.' : 'No records found.';
        container.appendChild(p); return;
    }

    players.forEach((player, index) => {
        const row = document.createElement('div'); row.className = 'leaderboard-row'; row.style.padding = "8px 10px"; row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        const mainDiv = document.createElement('div'); mainDiv.style.display = 'flex'; mainDiv.style.alignItems = 'center'; mainDiv.style.gap = '8px'; mainDiv.style.flexGrow = '1';

        const medalDiv = document.createElement('div'); medalDiv.style.fontSize = '1.2em'; medalDiv.style.minWidth = '1.5em'; medalDiv.style.textAlign = 'center';
        if (index === 0) medalDiv.textContent = "🥇"; else if (index === 1) medalDiv.textContent = "🥈"; else if (index === 2) medalDiv.textContent = "🥉";
        else { const span = document.createElement('span'); span.style.color = 'var(--hint-color)'; span.style.fontSize = '0.8em'; span.textContent = (index + 1) + "."; medalDiv.appendChild(span); }

        const infoDiv = document.createElement('div'); infoDiv.style.display = 'flex'; infoDiv.style.flexDirection = 'column';
        const nameDiv = document.createElement('div'); nameDiv.style.display = 'flex'; nameDiv.style.alignItems = 'center';

        if (player.username && String(player.username).trim() !== "" && !isTeam) {
            const nameLink = document.createElement('span'); nameLink.style.color = 'var(--link-color)'; nameLink.style.cursor = 'pointer'; nameLink.style.textDecoration = 'underline'; nameLink.style.fontWeight = 'bold'; nameLink.textContent = player.name; nameLink.onclick = () => openTelegramProfile(player.username);
            nameDiv.appendChild(nameLink);
        } else {
            const nameSpan = document.createElement('span'); nameSpan.style.fontWeight = 'bold'; nameSpan.textContent = player.name; nameDiv.appendChild(nameSpan);
        }

        if (showWordCount && player.wordCount) {
            const wcSpan = document.createElement('span'); wcSpan.style.background = 'var(--hint-color)'; wcSpan.style.color = 'var(--bg-color)'; wcSpan.style.padding = '1px 4px'; wcSpan.style.borderRadius = '3px'; wcSpan.style.fontSize = '0.8em'; wcSpan.style.marginLeft = '4px'; wcSpan.textContent = player.wordCount + " str."; nameDiv.appendChild(wcSpan);
        }

        const dateDiv = document.createElement('div'); dateDiv.style.fontSize = '0.75em'; dateDiv.style.color = 'var(--hint-color)'; dateDiv.textContent = (player.date || "") + " ";
        if (!isTeam && player.wpm) {
            const wpmSpan = document.createElement('span'); wpmSpan.style.color = 'var(--champ-color)'; wpmSpan.style.fontWeight = 'bold'; wpmSpan.textContent = player.wpm + " WPM"; dateDiv.appendChild(wpmSpan);
        }

        infoDiv.appendChild(nameDiv); infoDiv.appendChild(dateDiv);
        mainDiv.appendChild(medalDiv); mainDiv.appendChild(infoDiv);

        const scoreDiv = document.createElement('div'); scoreDiv.style.textAlign = 'right';
        const scoreB = document.createElement('b'); scoreB.style.fontSize = '1.1em'; scoreB.style.color = 'var(--link-color)'; scoreB.textContent = player.score;
        const ptSpan = document.createElement('span'); ptSpan.style.fontSize = '0.7em'; ptSpan.style.color = 'var(--hint-color)'; ptSpan.style.marginLeft = '2px'; ptSpan.textContent = 'pt';
        scoreDiv.appendChild(scoreB); scoreDiv.appendChild(ptSpan);

        row.appendChild(mainDiv); row.appendChild(scoreDiv); container.appendChild(row);
    });
};

// Listeners eventi UI
if (document.getElementById('lbModeSelect')) {
    document.getElementById('lbModeSelect').addEventListener('change', e => {
        window.showLeaderboardTab(e.target.value);
    });
}
if (els.btnTrnGlobalLB) {
    els.btnTrnGlobalLB.addEventListener('click', () => {
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
        els.btnTrnGlobalLB.classList.add('active-tab');
        window.fetchAndRenderGlobalLeaderboard('tournaments', null);
    });
}
if (els.btnTrnActiveLB) {
    els.btnTrnActiveLB.addEventListener('click', () => {
        document.querySelectorAll('#trnSubTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
        els.btnTrnActiveLB.classList.add('active-tab');
        window.fetchAndRenderGlobalLeaderboard('active_tournament', null);
    });
}
if (els.lbWordFilter) {
    els.lbWordFilter.addEventListener('change', () => {
        const currentMode = document.getElementById('lbModeSelect')?.value;
        if (currentMode) window.showLeaderboardTab(currentMode);
    });
}

// Inizializzazione predefinita all'apertura dello schermo
setTimeout(() => {
    if (document.getElementById('lbCategoryTabs')) {
        window.switchLBGroup('daily');
    }
}, 500);
