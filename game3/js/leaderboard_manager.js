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
    } else {
        // Gestione dinamica Multi/Single per Parole, Caratteri, Quiz, Ping Pong
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block';

        let baseMode = modeValue.includes('std') ? 'standard' : (modeValue.includes('chars') ? 'chars' : (modeValue.includes('quiz') ? 'quiz' : 'pingpong'));
        let isMulti = modeValue.endsWith('_multi') || modeValue === 'pingpong';

        console.log("LB: BaseMode determined:", baseMode, "isMulti:", isMulti);

        if (isMulti) {
            // Le "Sfide" Multi mostrano la cronologia dei match (recent_matches)
            window.populateDynamicFilters(`recent_matches/${baseMode}${isMulti?'_multi':''}`, '');
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
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false);
        });
        return;
    }

    // 2. SFIDE MULTIPLAYER (Cronologia Match)
    if (tabType.endsWith('_multi') || tabType === 'pingpong') {
        const dbPath = `leaderboard/recent_matches/${tabType}`;
        console.log("LB: Fetching Multi from:", dbPath, "Filter:", filterWordCount);

        db.ref(dbPath).once('value', snapshot => {
            let matches = [];
            if (snapshot.exists()) {
                snapshot.forEach(wcNode => {
                    // wcNode.key è '10', '20', 'all', ecc.
                    if (filterWordCount === 'all' || wcNode.key === filterWordCount) {
                        wcNode.forEach(mNode => {
                            const val = mNode.val();
                            if (val) matches.push(val);
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
        players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
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

window.renderPlayersListHTML = function(players, container, showWordCount, isTeam = false) {
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
