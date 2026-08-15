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
        { val: 'callsign_multi', it: '🎙️ Sfide Nominativi (Multi)', en: '🎙️ Callsign Challenges' },
        { val: 'pingpong', it: '🏓 Sfide Ping Pong', en: '🏓 Ping Pong Challenges' },
        { val: 'trn_global', it: '🏆 Classifica Tornei (Team)', en: '🏆 Tournament Standings' }
    ],
    single: [
        { val: 'std_single', it: '👤 Allenamento Parole', en: '👤 Words Practice' },
        { val: 'chars_single', it: '👤 Allenamento Caratteri', en: '👤 Chars Practice' },
        { val: 'quiz_single', it: '👤 Allenamento Quiz', en: '👤 Quiz Practice' }
    ],
    special: [
        { val: 'cwfreak', it: '🎙️ Nominativi (CW Freak)', en: '🎙️ Callsigns (CW Freak)' },
        { val: 'arcade', it: '🕹️ Intercettazione Arcade', en: '🕹️ Arcade Interception' }
    ]
};

window.switchLBGroup = function(groupId) {
    console.log("LB: Switching to group:", groupId);
    document.querySelectorAll('#lbCategoryTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
    const activeBtn = document.getElementById('tab' + groupId.charAt(0).toUpperCase() + groupId.slice(1) + 'LB');
    if (activeBtn) activeBtn.classList.add('active-tab');

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

    if (modes.length > 0) {
        select.value = modes[0].val;
        window.showLeaderboardTab(modes[0].val);
    }
};

window.showLeaderboardTab = function(modeValue) {
    console.log("LB: Showing tab for mode:", modeValue);
    if (els.trnSubTabs) els.trnSubTabs.style.display = 'none';
    if (els.lbFilterArea) els.lbFilterArea.style.display = 'none';
    if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none';
    if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';

    const filterVal = els.lbWordFilter ? els.lbWordFilter.value : 'all';

    if (modeValue === 'room') {
        if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'block';
        if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = '';
        if (roomCode) {
            db.ref(`rooms/${roomCode}/players`).once('value', snap => window.renderRoomLeaderboard(snap.val() || {}));
        } else {
            if (els.leaderboardContainer) els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Nessuna partita attiva.':'No active match.'}</p>`;
        }
    } else if (modeValue === 'daily_challenge') {
        window.fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else if (modeValue === 'trn_global') {
        if (els.trnSubTabs) els.trnSubTabs.style.display = 'flex';
        window.fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeValue === 'cwfreak') {
        window.fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (modeValue === 'arcade') {
        window.fetchAndRenderGlobalLeaderboard('arcade', null);
    } else {
        // Gestione dinamica Multi/Single per Parole, Caratteri, Quiz, Ping Pong
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block';

        let baseMode = modeValue.includes('std') ? 'standard' : (modeValue.includes('chars') ? 'chars' : (modeValue.includes('quiz') ? 'quiz' : (modeValue.includes('callsign') ? 'callsign' : 'pingpong')));
        let isMulti = modeValue.endsWith('_multi') || modeValue === 'pingpong';

        console.log("LB: BaseMode determined:", baseMode, "isMulti:", isMulti);

        if (isMulti) {
            // Le "Sfide" Multi mostrano la cronologia dei match (recent_matches)
            window.populateDynamicFilters(`recent_matches/${baseMode}${isMulti && baseMode !== 'pingpong' ? '_multi' : ''}`, '');
            window.fetchAndRenderGlobalLeaderboard(modeValue, filterVal);
        } else {
            // Le classifiche "Solo" mostrano i record individuali (leaderboard/MODE/single_COUNT)
            window.populateDynamicFilters(baseMode, 'single');
            window.fetchAndRenderGlobalLeaderboard(modeValue, filterVal);
        }
    }
};

window.populateDynamicFilters = function(modePath, subTypeFilter = "") {
    if (!els.lbWordFilter) return;
    console.log("LB: Populating filters for path:", modePath, "filter:", subTypeFilter);
    const currentValue = els.lbWordFilter.value;

    db.ref(`leaderboard/${modePath}`).once('value', snapshot => {
        let options = [`<option value="all">${currentLang==='it'?'Tutte le categorie':'All categories'}</option>`];
        let counts = [];
        snapshot.forEach(node => {
            const key = node.key;
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

window.fetchAndRenderGlobalLeaderboard = function(tabType, filterWordCount) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Caricamento classifica...':'Loading standings...'}</p>`;

    console.log("LB: Fetching -> Type:", tabType, "Filter:", filterWordCount);

    // 1. SFIDA GIORNALIERA
    if (tabType === 'daily_challenge') {
        let todayStr = new Date().toISOString().split('T')[0];
        db.ref(`leaderboard/daily_challenge/${todayStr}`).orderByChild('score').limitToLast(50).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            // Ordinamento: Punteggio decrescente, poi WPM decrescente
            players.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.wpm) - Number(a.wpm)));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false);
        });
        return;
    }

    // 2. SFIDE MULTIPLAYER (Cronologia Match)
    if (tabType.endsWith('_multi') || tabType === 'pingpong') {
        // Correzione Radice: i dati sono in leaderboard/recent_matches/MODE/WORDCOUNT/MATCHID
        let baseMode = tabType.includes('std') ? 'standard' : (tabType.includes('chars') ? 'chars' : (tabType.includes('quiz') ? 'quiz' : 'pingpong'));
        const dbPath = `leaderboard/recent_matches/${baseMode}${tabType !== 'pingpong' ? '_multi' : ''}`;
        console.log("LB: Fetching Multi from:", dbPath, "Filter:", filterWordCount);

        db.ref(dbPath).once('value', snapshot => {
            let matches = [];
            if (snapshot.exists()) {
                snapshot.forEach(wcNode => {
                    // wcNode.key è '10', '20', 'all', ecc.
                    if (filterWordCount === 'all' || wcNode.key === filterWordCount) {
                        wcNode.forEach(mNode => {
                            const val = mNode.val();
                            if (val) {
                                // Aggiungiamo metadati per il rendering
                                val.wordCount = wcNode.key;
                                matches.push(val);
                            }
                        });
                    }
                });
            }
            matches.sort((a,b) => (b.ts || 0) - (a.ts || 0));
            console.log("LB: Matches found:", matches.length);
            window.renderMatchesHistoryHTML(matches.slice(0, 20), els.leaderboardContainer);
        });
        return;
    }

    // 3. NOMINATIVI (CW FREAK)
    if (tabType === 'callsign') {
        db.ref('leaderboard/callsign/global').orderByChild('score').limitToLast(50).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false);
        });
        return;
    }

    // 4. TORNEI
    if (tabType === 'tournaments') {
        db.ref('leaderboard/tournaments').orderByChild('score').limitToLast(50).once('value', snapshot => {
            let teams = [];
            snapshot.forEach(child => { if (child.val()) teams.push(child.val()); });
            teams.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(teams, els.leaderboardContainer, false, true);
        });
        return;
    }

    // 4b. ARCADE
    if (tabType === 'arcade') {
        db.ref('leaderboard/arcade/all').orderByChild('score').limitToLast(50).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => { if (child.val()) players.push(child.val()); });
            // Ordinamento: Punteggio decrescente
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false, false, true);
        });
        return;
    }

    // 5. SOLO PRACTICE (Record Individuali)
    let baseMode = tabType.replace('_single', '');
    if (baseMode === 'std') baseMode = 'standard';

    const dbPath = `leaderboard/${baseMode}`;
    console.log("LB: Fetching Solo from:", dbPath);

    db.ref(dbPath).once('value', snapshot => {
        let players = [];
        snapshot.forEach(wordCountNode => {
            const key = wordCountNode.key;
            if (key.startsWith('single_')) {
                if (filterWordCount === 'all' || key === 'single_' + filterWordCount) {
                    wordCountNode.forEach(userNode => { if (userNode.val()) players.push(userNode.val()); });
                }
            }
        });
        // Ordinamento: Punteggio decrescente, poi WPM decrescente
        players.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.wpm) - Number(a.wpm)));
        window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
    });
};

window.renderMatchesHistoryHTML = function(matches, container) {
    container.innerHTML = '';
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">${currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.'}</p>`;
        return;
    }
    matches.forEach(match => {
        const mw = document.createElement('div'); mw.style.marginBottom = "25px"; mw.style.borderBottom = "1px dashed var(--hint-color)"; mw.style.paddingBottom = "15px";
        const infoDiv = document.createElement('div'); infoDiv.style.textAlign = 'center'; infoDiv.style.fontSize = '0.8em'; infoDiv.style.color = 'var(--hint-color)'; infoDiv.style.marginBottom = '8px';
        infoDiv.textContent = `📅 ${match.date} - ${match.wordCount} Stringhe`; mw.appendChild(infoDiv);
        window.renderHeadToHeadView(match.players, mw); container.appendChild(mw);
    });
};

window.renderPlayersListHTML = function(players, container, showWordCount, isTeam = false, isArcade = false) {
    container.innerHTML = '';
    if (players.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">${currentLang === 'it' ? 'Nessun record trovato.' : 'No records found.'}</p>`;
        return;
    }

    players.forEach((player, index) => {
        const row = document.createElement('div'); row.className = 'leaderboard-row';
        const mainDiv = document.createElement('div'); mainDiv.style.display = 'flex'; mainDiv.style.alignItems = 'center'; mainDiv.style.gap = '8px'; mainDiv.style.flexGrow = '1';

        const medalDiv = document.createElement('div'); medalDiv.style.fontSize = '1.2em'; medalDiv.style.minWidth = '1.5em'; medalDiv.style.textAlign = 'center';
        if (index === 0) medalDiv.textContent = "🥇"; else if (index === 1) medalDiv.textContent = "🥈"; else if (index === 2) medalDiv.textContent = "🥉";
        else { const span = document.createElement('span'); span.style.color = 'var(--hint-color)'; span.style.fontSize = '0.8em'; span.textContent = (index + 1) + "."; medalDiv.appendChild(span); }

        const infoDiv = document.createElement('div'); infoDiv.style.display = 'flex'; infoDiv.style.flexDirection = 'column';
        const nameDiv = document.createElement('div'); nameDiv.style.display = 'flex'; nameDiv.style.alignItems = 'center';

        // PRIVACY: I nomi nelle classifiche non sono più cliccabili
        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = 'bold';
        nameSpan.textContent = player.name || "Anonimo";
        nameDiv.appendChild(nameSpan);

        // AGGIUNTA LIVELLO ACCANTO AL NOME
        if (player.level) {
            const lvSpan = document.createElement('span');
            lvSpan.style.fontSize = '0.7em';
            lvSpan.style.color = 'var(--champ-color)';
            lvSpan.style.marginLeft = '5px';
            lvSpan.style.fontWeight = 'bold';
            lvSpan.textContent = `(${player.level})`;
            nameDiv.appendChild(lvSpan);
        }

        if (showWordCount && player.wordCount) {
            const wcSpan = document.createElement('span');
            wcSpan.style.background = 'var(--hint-color)';
            wcSpan.style.color = 'var(--bg-color)';
            wcSpan.style.padding = '1px 4px';
            wcSpan.style.borderRadius = '3px';
            wcSpan.style.fontSize = '0.8em';
            wcSpan.style.marginLeft = '4px';
            wcSpan.textContent = player.wordCount + " str.";
            nameDiv.appendChild(wcSpan);
        }

        const dateDiv = document.createElement('div');
        dateDiv.style.fontSize = '0.75em';
        dateDiv.style.color = 'var(--hint-color)';
        dateDiv.textContent = (player.date || "") + " ";

        if (!isTeam && player.wpm) {
            const wpmLabel = isArcade ? "Peak " : "";
            const wpmSpan = document.createElement('span');
            wpmSpan.style.color = 'var(--champ-color)';
            wpmSpan.style.fontWeight = 'bold';
            wpmSpan.textContent = wpmLabel + player.wpm + " WPM";
            dateDiv.appendChild(wpmSpan);
        }

        infoDiv.appendChild(nameDiv); infoDiv.appendChild(dateDiv);
        mainDiv.appendChild(medalDiv); mainDiv.appendChild(infoDiv);

        row.appendChild(mainDiv);

        // LIVELLO ARCADE
        if (isArcade) {
            const midDiv = document.createElement('div');
            midDiv.style.cssText = "flex: 0 0 70px; text-align: center; font-weight: bold; color: var(--link-color); border-left: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); margin: 0 5px;";

            const levelLabel = document.createElement('div');
            levelLabel.style.cssText = "font-size:0.65em; color:var(--hint-color); font-weight:normal; text-transform:uppercase;";
            levelLabel.textContent = "Livello";

            midDiv.appendChild(levelLabel);
            midDiv.appendChild(document.createTextNode(player.wave || 1));
            row.appendChild(midDiv);
        }

        const scoreDiv = document.createElement('div'); scoreDiv.style.textAlign = 'right';
        const scoreB = document.createElement('b'); scoreB.style.fontSize = '1.1em'; scoreB.style.color = 'var(--link-color)'; scoreB.textContent = player.score;
        const ptSpan = document.createElement('span'); ptSpan.style.fontSize = '0.7em'; ptSpan.style.color = 'var(--hint-color)'; ptSpan.style.marginLeft = '2px'; ptSpan.textContent = 'pt';
        scoreDiv.appendChild(scoreB); scoreDiv.appendChild(ptSpan);

        row.appendChild(scoreDiv); container.appendChild(row);
    });
};

window.renderRoomLeaderboard = function(players) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = '';
    let allFinished = true;

    // Filtriamo solo chi ha accettato la sfida
    const playersArray = Object.entries(players)
        .filter(([id, data]) => data.accepted)
        .map(([id, data]) => ({
            id,
            name: data.name || "Sconosciuto",
            username: data.username,
            score: data.score || 0,
            wpm: data.wpm || 0,
            finished: !!data.finished,
            abandoned: !!data.abandoned,
            matchDetails: data.matchDetails || []
        }));

    if (playersArray.length === 0) return;
    playersArray.forEach(p => { if (!p.finished) allFinished = false; });
    if (els.waitingOthersText) els.waitingOthersText.style.display = allFinished ? 'none' : 'block';

    // --- FIX: Mostriamo la vista affiancata (H2H) se ci sono più giocatori, anche se non tutti hanno finito ---
    const isMultiOrSpecial = (roomCode && (roomCode.startsWith("TRN_") || currentMode === 'pingpong' || playersArray.length > 1));

    if (isMultiOrSpecial) {
        window.renderHeadToHeadView(playersArray, els.leaderboardContainer);
    } else {
        playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm)).forEach((player, index) => {
            const row = document.createElement('div'); row.className = 'leaderboard-row';
            let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            // ... (rest of individual rendering) ...

            const leftSpan = document.createElement('span');
            leftSpan.appendChild(document.createTextNode(medal + " "));

            if (player.username && String(player.username).trim() !== "") {
                const nameLink = document.createElement('span');
                nameLink.style.color = 'var(--link-color)';
                nameLink.style.cursor = 'pointer';
                nameLink.style.textDecoration = 'underline';
                nameLink.textContent = player.name || "Sconosciuto";
                nameLink.onclick = () => openTelegramProfile(player.username);
                leftSpan.appendChild(nameLink);
            } else {
                leftSpan.appendChild(document.createTextNode(player.name || "Sconosciuto"));
            }

            leftSpan.appendChild(document.createElement('br'));

            const wpmSmall = document.createElement('small');
            wpmSmall.style.color = 'var(--hint-color)';
            wpmSmall.textContent = `(${player.wpm || 0} WPM)`;
            leftSpan.appendChild(wpmSmall);

            const rightSpan = document.createElement('span');
            const scoreB = document.createElement('b');
            scoreB.textContent = `${player.score} pt`;
            rightSpan.appendChild(scoreB);

            row.appendChild(leftSpan);
            row.appendChild(rightSpan);
            els.leaderboardContainer.appendChild(row);
        });
    }
    if (allFinished && playersArray.length > 0 && els.roomWinnerBanner) {
        els.roomWinnerBanner.textContent = roomCode.startsWith("TRN_") ? `🏆 Vince il match: ${playersArray[0].name}` : `🏆 Vincitore: ${playersArray[0].name}`;
    }
};

window.renderHeadToHeadView = function(players, container) {
    if (!players) return;

    // Convertiamo in array se i dati sono arrivati come oggetto (comune in Firebase)
    let playersArray = Array.isArray(players) ? [...players] : Object.values(players);
    if (playersArray.length === 0) return;

    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm));
    const maxScore = playersArray[0].score;
    playersArray.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');

        const nameDiv = document.createElement('div');
        nameDiv.className = 'h2h-name';
        nameDiv.textContent = p.name || "Sconosciuto";

        if (p.id === myId) {
            const meSmall = document.createElement('small');
            meSmall.textContent = ` (${currentLang === 'it' ? 'Tu' : 'You'})`;
            nameDiv.appendChild(meSmall);
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

        if (p.abandoned) {
            const rowAb = document.createElement('div'); rowAb.className = 'h2h-stat-row';
            rowAb.innerHTML = `<span style="color:#d32f2f; font-weight:bold; font-size:0.7em; width:100%; text-align:center; margin-top:5px;">${currentLang==='it'?'ABBANDONATO':'WITHDRAWN'}</span>`;
            statsDiv.appendChild(rowAb);
        } else if (!p.finished) {
            const rowProg = document.createElement('div'); rowProg.className = 'h2h-stat-row';
            rowProg.innerHTML = `<span style="color:#ff9800; font-weight:bold; font-size:0.7em; width:100%; text-align:center; margin-top:5px; animation: pulse 1s infinite;">${currentLang==='it'?'IN CORSO...':'PLAYING...'}</span>`;
            statsDiv.appendChild(rowProg);
        }

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
        const tdReal = document.createElement('td'); const bReal = document.createElement('b'); if (typeof renderDiffSecure === 'function') renderDiffSecure(bReal, row.real, row.typed || ''); else bReal.textContent = row.real; tdReal.appendChild(bReal);
        const tdPoints = document.createElement('td'); tdPoints.style.color = color; tdPoints.style.fontWeight = 'bold'; tdPoints.textContent = row.points;
        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdPoints); els.matchDetailsBody.appendChild(tr);
    });
    els.matchDetailsModal.style.display = 'flex';
};

window.listenToRoomLeaderboard = function() {
    if (!roomCode) return;
    const ref = db.ref(`rooms/${roomCode}`);
    ref.on('value', snap => {
        if (!snap.exists()) return;
        const data = snap.val();
        if (document.getElementById('lbModeSelect')?.value === "room") window.renderRoomLeaderboard(data.players || {});
    });
};

// Listeners
if (document.getElementById('lbModeSelect')) {
    document.getElementById('lbModeSelect').addEventListener('change', e => window.showLeaderboardTab(e.target.value));
}
if (els.lbWordFilter) {
    els.lbWordFilter.addEventListener('change', () => {
        const mode = document.getElementById('lbModeSelect')?.value;
        if (mode) window.showLeaderboardTab(mode);
    });
}
