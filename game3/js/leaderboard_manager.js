// js/leaderboard_manager.js

window.lbGroups = {
    daily: [
        { val: 'tri_daily', it: '🏆 Sfida Tripla (Oggi)', en: '🏆 Triple Daily (Today)' },
        { val: 'tri_daily_monthly', it: '🏆 Sfida Tripla (Mese - Medagliere)', en: '🏆 Triple Daily (Monthly Medals)' },
        { val: 'daily_challenge', it: '📅 Sfida Giornaliera (Oggi)', en: '📅 Classic Daily (Today)' },
        { val: 'daily_monthly', it: '📅 Sfida Giornaliera (Mese - Medagliere)', en: '📅 Classic Daily (Monthly Medals)' },
        { val: 'cwg_activity_monthly', it: '📻 Activity - CWG (Mese)', en: '📻 Activity - CWG (Monthly)' },
        { val: 'my_history', it: '📜 I Miei Match Recenti', en: '📜 My Recent Matches' },
        { val: 'room', it: '🏁 Ultima Partita (Sessione)', en: '🏁 Last Match (Session)' }
    ],
    single: [
        { val: 'std_single', it: '👤 Record Parole', en: '👤 Words Records' },
        { val: 'std_plus_single', it: '👤 Record Parole +', en: '👤 Words + Records' },
        { val: 'code_groups_single', it: '👤 Record Gruppi (5 Chars)', en: '👤 Code Groups Records' },
        { val: 'target_training_single', it: '👤 Record Mirato (Radar)', en: '👤 Targeted Records (Radar)' },
        { val: 'chars_single', it: '👤 Record Caratteri', en: '👤 Chars Records' },
        { val: 'quiz_single', it: '👤 Record Quiz', en: '👤 Quiz Records' },
        { val: 'custom_single', it: '👤 Record Personale', en: '👤 Personal Records' }
    ],
    multi: [
        { val: 'std_multi', it: '⚔️ Match Parole (Multi)', en: '⚔️ Words Matches' },
        { val: 'std_plus_multi', it: '⚔️ Match Parole + (Multi)', en: '⚔️ Words + Matches' },
        { val: 'code_groups_multi', it: '⚔️ Match Gruppi (5 Chars)', en: '⚔️ Code Groups Matches' },
        { val: 'target_training_multi', it: '⚔️ Match Mirato (Multi)', en: '⚔️ Targeted Matches' },
        { val: 'chars_multi', it: '⚔️ Match Caratteri (Multi)', en: '⚔️ Chars Matches' },
        { val: 'quiz_multi', it: '⚔️ Match Quiz (Multi)', en: '⚔️ Quiz Matches' },
        { val: 'pingpong', it: '🏓 Match Ping Pong', en: '🏓 Ping Pong Matches' },
        { val: 'trn_global', it: '🏆 Classifica Team', en: '🏆 Team Standings' }
    ],
    special: [
        { val: 'la_torre', it: '🗼 La Torre (Scalata)', en: '🗼 The Tower (Climb)' },
        { val: 'arcade', it: '🕹️ Arcade Interception', en: '🕹️ Arcade Interception' },
        { val: 'memory_cw', it: '🧩 Gioco delle Coppie (Memory CW)', en: '🧩 Memory CW (Card Pairs)' },
        { val: 'cwfreak', it: '🎙️ Nominativi (CW Freak)', en: '🎙️ Callsigns (CW Freak)' }
    ],
    ratings: [
        { val: 'game_ratings', it: '👍 Gradimento Modalità', en: '👍 Mode Ratings' }
    ]
};

window.switchLBGroup = async function(groupId) {
    console.log("LB: Switching to group:", groupId);
    document.querySelectorAll('#lbCategoryTabs .tab-btn').forEach(b => b.classList.remove('active-tab'));
    const activeBtn = document.getElementById('tab' + groupId.charAt(0).toUpperCase() + groupId.slice(1) + 'LB');
    if (activeBtn) activeBtn.classList.add('active-tab');

    const select = document.getElementById('lbModeSelect');
    if (!select) return;

    select.innerHTML = '';
    const modes = window.lbGroups[groupId] || [];
    const isBetaTester = (typeof window.isUserCwgBetaTester === 'function') ? await window.isUserCwgBetaTester() : false;

    modes.forEach(m => {
        if (m.val === 'cwg_activity_monthly' && !isBetaTester) return;

        const opt = document.createElement('option');
        opt.value = m.val;
        opt.textContent = currentLang === 'it' ? m.it : m.en;
        select.appendChild(opt);
    });

    if (select.options.length > 0) {
        select.value = select.options[0].value;
        window.showLeaderboardTab(select.options[0].value);
    }
};

window.showLeaderboardTab = function(modeValue) {
    console.log("LB: Showing tab for mode:", modeValue);
    if (els.trnSubTabs) els.trnSubTabs.style.display = 'none';
    if (els.lbFilterArea) els.lbFilterArea.style.display = 'none';
    if (els.roomWinnerBanner) els.roomWinnerBanner.style.display = 'none';
    if (els.waitingOthersText) els.waitingOthersText.style.display = 'none';
    if (els.btnShareDaily) els.btnShareDaily.style.display = 'none';

    const filterVal = els.lbWordFilter ? els.lbWordFilter.value : 'all';

    if (modeValue === 'room') {
        els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Caricamento sessione...':'Loading session...'}</p>`;

        const renderLastMatchOrHistory = (snap) => {
            const playersData = snap.val();
            if (playersData) {
                window.renderRoomLeaderboard(playersData);
            } else {
                // FALLBACK: Se la stanza è stata eliminata o non esiste, usiamo l'ultimo match dallo storico personale
                window.fetchAndRenderLastMatchFromHistory();
            }
        };

        if (roomCode) {
            db.ref(`rooms/${roomCode}/players`).once('value', renderLastMatchOrHistory);
        } else if (window.lastFinishedRoomCode) {
            db.ref(`rooms/${window.lastFinishedRoomCode}/players`).once('value', renderLastMatchOrHistory);
        } else {
            window.fetchAndRenderLastMatchFromHistory();
        }
    } else if (modeValue === 'my_history') {
        window.fetchAndRenderMyHistory();
    } else if (modeValue === 'tri_daily') {
        window.fetchAndRenderTriDailyLeaderboard();
    } else if (modeValue === 'tri_daily_monthly' || modeValue === 'daily_monthly') {
        window.fetchAndRenderMonthlyLeaderboard(modeValue);
    } else if (modeValue === 'cwg_activity_monthly') {
        window.fetchAndRenderCwgActivityMonthlyLeaderboard();
    } else if (modeValue === 'daily_challenge') {
        if (els.btnShareDaily && totalScore > 0 && currentMode === 'daily_challenge') {
            els.btnShareDaily.style.display = 'block';
        }
        window.fetchAndRenderGlobalLeaderboard('daily_challenge', null);
    } else if (modeValue === 'trn_global') {
        if (els.trnSubTabs) els.trnSubTabs.style.display = 'flex';
        window.fetchAndRenderGlobalLeaderboard('tournaments', null);
    } else if (modeValue === 'cwfreak') {
        window.fetchAndRenderGlobalLeaderboard('callsign', null);
    } else if (modeValue === 'arcade') {
        window.fetchAndRenderGlobalLeaderboard('arcade', null);
    } else if (modeValue === 'la_torre') {
        window.fetchAndRenderGlobalLeaderboard('la_torre', null);
    } else if (modeValue === 'game_ratings') {
        window.fetchAndRenderGameRatings();
    } else {
        // Gestione dinamica Multi/Single per Parole, Caratteri, Quiz, Ping Pong
        if (els.lbFilterArea) els.lbFilterArea.style.display = 'block';

        let baseMode = 'standard';
        if (modeValue.includes('std_plus')) baseMode = 'standard_plus';
        else if (modeValue.includes('code_groups')) baseMode = 'code_groups';
        else if (modeValue.includes('target_training')) baseMode = 'target_training';
        else if (modeValue.includes('chars')) baseMode = 'chars';
        else if (modeValue.includes('quiz')) baseMode = 'quiz';
        else if (modeValue.includes('callsign')) baseMode = 'callsign';
        else if (modeValue.includes('custom')) baseMode = 'custom';
        else if (modeValue.includes('pingpong')) baseMode = 'pingpong';

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

window.fetchAndRenderLastMatchFromHistory = function() {
    if (!els.leaderboardContainer) return;

    db.ref(`users/${myId}/history`).limitToLast(1).once('value', snap => {
        if (!snap.exists()) {
            els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Nessun match recente trovato.':'No recent match found.'}</p>`;
            return;
        }

        let lastMatch = null;
        snap.forEach(c => lastMatch = c.val());

        if (!lastMatch) return;

        els.leaderboardContainer.innerHTML = '';

        // Creiamo una visualizzazione simile alla classifica di stanza per l'utente singolo
        const playersArray = [{
            id: myId,
            name: myName,
            username: tgUsername,
            score: lastMatch.score || 0,
            wpm: lastMatch.wpm || 0,
            finished: true,
            matchDetails: lastMatch.details || []
        }];

        // Titolo informativo del fallback
        const info = document.createElement('p');
        info.style.cssText = "text-align:center; font-size:0.75em; color:var(--hint-color); margin-bottom:10px; font-style:italic;";
        const modeName = window.GAME_MODES[lastMatch.mode]?.titleIt || lastMatch.mode;
        info.textContent = `${currentLang==='it'?'Ultima partita salvata:':'Last saved match:'} ${modeName}`;
        els.leaderboardContainer.appendChild(info);

        if (lastMatch.type === 'multi') {
            // Se era un match multiplayer, cerchiamo di recuperare i dati completi se ancora presenti
            window.renderHeadToHeadView(playersArray, els.leaderboardContainer);
        } else {
            window.renderRoomLeaderboard({ [myId]: playersArray[0] });
        }
    });
};

window.fetchAndRenderMyHistory = function() {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Caricamento storico...':'Loading history...'}</p>`;

    db.ref(`users/${myId}/history`).limitToLast(20).once('value', snap => {
        let matches = [];
        snap.forEach(child => {
            const m = child.val();
            if (m) {
                m.id = child.key;
                // Adattiamo il formato per renderHeadToHeadView se necessario,
                // oppure usiamo una visualizzazione specifica per il single player history.
                matches.push(m);
            }
        });
        matches.reverse(); // Più recenti in alto

        if (matches.length === 0) {
            els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Non hai ancora giocato nessuna partita.':'You haven\'t played any matches yet.'}</p>`;
            return;
        }

        els.leaderboardContainer.innerHTML = '';
        matches.forEach(m => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.style.cssText = "margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border-left:4px solid var(--link-color); cursor:pointer;";

            const dateStr = new Date(m.date).toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            const modeName = window.GAME_MODES[m.mode]?.titleIt || m.mode;

            row.innerHTML = `
                <div style="flex-grow:1;">
                    <div style="display:flex; justify-content:space-between;">
                        <b>${modeName}</b>
                        <small style="color:var(--hint-color);">${dateStr}</small>
                    </div>
                    <div style="font-size:0.85em; margin-top:4px; display:flex; gap:10px; color:var(--hint-color);">
                        <span>Punti: <b style="color:#4caf50;">${m.score}</b></span>
                        <span>Velocità: <b style="color:var(--link-color);">${m.wpm} WPM</b></span>
                        <span>${m.wordCount || 0} str.</span>
                    </div>
                </div>
                <div style="margin-left:10px; opacity:0.6;">🔍</div>
            `;

            row.onclick = () => {
                if (m.details) window.showPlayerDetailsModal(myName, m.details);
                else showToast(currentLang === 'it' ? "Dettagli non disponibili per questa build." : "Details not available for this build.");
            };

            els.leaderboardContainer.appendChild(row);
        });
    });
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

window.fetchAndRenderTriDailyLeaderboard = function() {
    const container = els.leaderboardContainer;
    if (!container) return;

    const todayStr = window.getLocalDateString();
    container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">Caricamento Classifica Tripla del ${todayStr}...</p>`;

    db.ref(`leaderboard/tri_daily/${todayStr}`).orderByChild('totalScore').limitToLast(100).once('value', snapshot => {
        if (!snapshot.exists()) {
            container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">Nessun partecipante nella Sfida Tripla di oggi (${todayStr}). Gioca la prima sessione per guidare la classifica! 🚀</p>`;
            return;
        }

        const players = [];
        snapshot.forEach(child => {
            players.push({ id: child.key, ...child.val() });
        });

        players.sort((a, b) => (Number(b.totalScore) - Number(a.totalScore)) || (Number(b.peakWpm) - Number(a.peakWpm)));

        let html = `
            <div style="background:rgba(255,152,0,0.1); padding:10px; border-radius:8px; border:1px solid #ff9800; margin-bottom:12px; text-align:center;">
                <b style="color:#ff9800;">🏆 Sfida Tripla Giornaliera (${todayStr})</b>
                <div style="font-size:0.8em; color:var(--hint-color); margin-top:4px;">Punteggio cumulativo delle 3 sessioni (Mattina, Pomeriggio, Sera)</div>
            </div>
            <table class="leaderboard-table" style="width:100%; border-collapse:collapse; font-size:0.85em;">
                <thead>
                    <tr style="border-bottom:2px solid var(--link-color); text-align:left;">
                        <th style="padding:6px;">#</th>
                        <th style="padding:6px;">Telegrafista</th>
                        <th style="padding:6px; text-align:center;">Sessioni</th>
                        <th style="padding:6px; text-align:right;">Punti Totali</th>
                        <th style="padding:6px; text-align:right;">Picco WPM</th>
                    </tr>
                </thead>
                <tbody>
        `;

        players.forEach((p, idx) => {
            const rank = idx + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const isMe = (p.id === window.myId);
            const name = p.name || 'Telegrafista';
            const slots = `${p.completedSlots || 1}/3`;
            const score = p.totalScore || 0;
            const wpm = p.peakWpm || 20;

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); ${isMe ? 'background:rgba(255,152,0,0.15); font-weight:bold;' : ''}">
                    <td style="padding:8px 6px;">${medal}</td>
                    <td style="padding:8px 6px;">${name}</td>
                    <td style="padding:8px 6px; text-align:center; color:#2e7d32;"><b>${slots}</b></td>
                    <td style="padding:8px 6px; text-align:right; color:#ff9800;"><b>${score} pt</b></td>
                    <td style="padding:8px 6px; text-align:right;">${wpm} WPM</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    });
};

window.fetchAndRenderMonthlyLeaderboard = function(mode) {
    const container = els.leaderboardContainer;
    if (!container) return;

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isTri = (mode === 'tri_daily_monthly');
    const titleText = isTri ? "🏆 Classifica Mensile Sfida Tripla" : "📅 Classifica Mensile Sfida Giornaliera";
    const nodePath = isTri ? "leaderboard/tri_daily" : "leaderboard/daily_challenge";

    container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">Caricamento piazzamenti del mese (${currentMonthStr})...</p>`;

    if (!db) return;

    // Leggiamo tutti i giorni del mese corrente (da 01 fino a oggi)
    const promises = [];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${currentMonthStr}-${String(day).padStart(2, '0')}`;
        promises.push(
            db.ref(`${nodePath}/${dayStr}`).once('value').then(snap => {
                return { dayStr, snap };
            }).catch(() => ({ dayStr, snap: null }))
        );
    }

    Promise.all(promises).then(results => {
        const playerStats = {};

        results.forEach(res => {
            if (!res.snap || !res.snap.exists()) return;
            const dayList = [];
            res.snap.forEach(child => {
                dayList.push({ id: child.key, ...child.val() });
            });

            if (dayList.length === 0) return;

            // Ordinamento giornaliero per determinare i piazzamenti
            if (isTri) {
                dayList.sort((a, b) => (Number(b.totalScore) - Number(a.totalScore)) || (Number(b.peakWpm) - Number(a.peakWpm)));
            } else {
                dayList.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.wpm) - Number(a.wpm)));
            }

            // Punti piazzamento del giorno: 1°=10pt, 2°=8pt, 3°=6pt, 4°=5pt, 5°=4pt, 6°-10°=3..1pt
            const placementPointsTable = [10, 8, 6, 5, 4, 3, 2, 1, 1, 1];

            dayList.forEach((p, idx) => {
                const uid = p.id;
                if (!uid) return;

                if (!playerStats[uid]) {
                    playerStats[uid] = {
                        id: uid,
                        name: p.name || 'Telegrafista',
                        golds: 0,
                        silvers: 0,
                        bronzes: 0,
                        placementPts: 0,
                        daysPlayed: 0
                    };
                }

                playerStats[uid].daysPlayed++;
                const rank = idx + 1;
                const pts = placementPointsTable[idx] || 1;
                playerStats[uid].placementPts += pts;

                if (rank === 1) playerStats[uid].golds++;
                else if (rank === 2) playerStats[uid].silvers++;
                else if (rank === 3) playerStats[uid].bronzes++;
            });
        });

        const players = Object.values(playerStats);

        if (players.length === 0) {
            container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">Nessun piazzamento registrato finora nel mese di ${currentMonthStr}.</p>`;
            return;
        }

        // Ordinamento Mensile: Più Ori 🥇 -> Più Argenti 🥈 -> Più Bronzi 🥉 -> Punti Piazzamento
        players.sort((a, b) =>
            (b.golds - a.golds) ||
            (b.silvers - a.silvers) ||
            (b.bronzes - a.bronzes) ||
            (b.placementPts - a.placementPts) ||
            (b.daysPlayed - a.daysPlayed)
        );

        let html = `
            <div style="background:rgba(255,215,0,0.1); padding:10px; border-radius:8px; border:1px solid var(--champ-color); margin-bottom:12px; text-align:center;">
                <b style="color:var(--champ-color);">${titleText} (${currentMonthStr})</b>
                <div style="font-size:0.8em; color:var(--hint-color); margin-top:4px;">Piazzamento mensile calcolato sui podi giornalieri (🥇 Ori, 🥈 Argenti, 🥉 Bronzi)</div>
            </div>
            <table class="leaderboard-table" style="width:100%; border-collapse:collapse; font-size:0.85em;">
                <thead>
                    <tr style="border-bottom:2px solid var(--link-color); text-align:left;">
                        <th style="padding:6px;">#</th>
                        <th style="padding:6px;">Telegrafista</th>
                        <th style="padding:6px; text-align:center;">🥇</th>
                        <th style="padding:6px; text-align:center;">🥈</th>
                        <th style="padding:6px; text-align:center;">🥉</th>
                        <th style="padding:6px; text-align:center;">Giorni</th>
                        <th style="padding:6px; text-align:right;">Punti Pos.</th>
                    </tr>
                </thead>
                <tbody>
        `;

        players.forEach((p, idx) => {
            const rank = idx + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const isMe = (p.id === window.myId);
            const name = p.name || 'Telegrafista';

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); ${isMe ? 'background:rgba(255,215,0,0.18); font-weight:bold;' : ''}">
                    <td style="padding:8px 6px;">${medal}</td>
                    <td style="padding:8px 6px;">${name}</td>
                    <td style="padding:8px 6px; text-align:center; color:#ffd700;"><b>${p.golds || 0}</b></td>
                    <td style="padding:8px 6px; text-align:center; color:#c0c0c0;"><b>${p.silvers || 0}</b></td>
                    <td style="padding:8px 6px; text-align:center; color:#cd7f32;"><b>${p.bronzes || 0}</b></td>
                    <td style="padding:8px 6px; text-align:center;">${p.daysPlayed}d</td>
                    <td style="padding:8px 6px; text-align:right; color:var(--champ-color);"><b>${p.placementPts} pt</b></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    });
};

window.fetchAndRenderCwgActivityMonthlyLeaderboard = async function() {
    const container = els.leaderboardContainer;
    if (!container) return;

    const isBeta = (typeof window.isUserCwgBetaTester === 'function') ? await window.isUserCwgBetaTester() : false;
    if (!isBeta) {
        container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">⚠️ Questa classifica è attualmente riservata ai Beta Tester autorizzati.</p>`;
        return;
    }

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">Caricamento Classifica Activity - CWG (${currentMonthStr})...</p>`;

    if (!db) return;

    db.ref(`leaderboard/cwg_activity_monthly/${currentMonthStr}`).orderByChild('totalPoints').limitToLast(100).once('value', snap => {
        if (!snap.exists()) {
            container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">Nessun QSO registrato finora nel mese di ${currentMonthStr}.</p>`;
            return;
        }

        const players = [];
        snap.forEach(c => {
            players.push({ id: c.key, ...c.val() });
        });

        // Ordinamento per Punti Totali decrescenti, poi QSO Validi decrescenti
        players.sort((a, b) => (Number(b.totalPoints || 0) - Number(a.totalPoints || 0)) || (Number(b.validQsos || 0) - Number(a.validQsos || 0)));

        let html = `
            <div style="background:rgba(0,188,212,0.1); padding:10px; border-radius:8px; border:1px solid #00bcd4; margin-bottom:12px; text-align:center;">
                <b style="color:#00bcd4;">📻 Classifica Mensile Activity - CWG (${currentMonthStr})</b>
                <div style="font-size:0.8em; color:var(--hint-color); margin-top:4px;">Punti accumulati nei QSO convalidati (1 pt singolo, 2 pt reciproco incrociato)</div>
            </div>
            <table class="leaderboard-table" style="width:100%; border-collapse:collapse; font-size:0.85em;">
                <thead>
                    <tr style="border-bottom:2px solid #00bcd4; text-align:left;">
                        <th style="padding:6px;">#</th>
                        <th style="padding:6px;">Telegrafista</th>
                        <th style="padding:6px; text-align:center;">QSO Tot.</th>
                        <th style="padding:6px; text-align:center;">Reciproci</th>
                        <th style="padding:6px; text-align:right;">Punti Log</th>
                    </tr>
                </thead>
                <tbody>
        `;

        players.forEach((p, idx) => {
            const rank = idx + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const isMe = (p.id === window.myId);
            const name = p.name || 'Telegrafista';

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); ${isMe ? 'background:rgba(0,188,212,0.18); font-weight:bold;' : ''}">
                    <td style="padding:8px 6px;">${medal}</td>
                    <td style="padding:8px 6px;">${name}</td>
                    <td style="padding:8px 6px; text-align:center;">${p.validQsos || 0}</td>
                    <td style="padding:8px 6px; text-align:center; color:#00ff66;"><b>${p.mutualQsos || 0}</b></td>
                    <td style="padding:8px 6px; text-align:right; color:#00bcd4;"><b>${p.totalPoints || 0} pt</b></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    });
};

window.fetchAndRenderGlobalLeaderboard = function(tabType, filterWordCount) {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Caricamento classifica...':'Loading standings...'}</p>`;

    console.log("LB: Fetching -> Type:", tabType, "Filter:", filterWordCount);

    // 1. SFIDA GIORNALIERA
    if (tabType === 'daily_challenge') {
        let todayStr = window.getLocalDateString();
        db.ref(`leaderboard/daily_challenge/${todayStr}`).orderByChild('score').limitToLast(100).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => {
                let p = child.val();
                if (p) {
                    p.id = child.key;
                    p.dbPath = `leaderboard/daily_challenge/${todayStr}/${child.key}`;
                    players.push(p);
                }
            });
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

        // OTTIMIZZAZIONE: Usiamo limitToLast(100) per caricare fino ai primi 100 partecipanti
        db.ref(dbPath).limitToLast(100).once('value', snapshot => {
            let matches = [];
            if (snapshot.exists()) {
                snapshot.forEach(wcNode => {
                    // Se il nodo è una categoria di wordCount (es. '10', '20')
                    if (filterWordCount === 'all' || wcNode.key === filterWordCount) {
                        // Se è un nodo wordCount, i match sono figli
                        wcNode.forEach(mNode => {
                            const val = mNode.val();
                            if (val && typeof val === 'object') {
                                val.id = mNode.key;
                                val.dbPath = `${dbPath}/${wcNode.key}/${mNode.key}`;
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
        db.ref('leaderboard/callsign/global').orderByChild('score').limitToLast(100).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => {
                let p = child.val();
                if (p) {
                    p.id = child.key;
                    p.dbPath = `leaderboard/callsign/global/${child.key}`;
                    players.push(p);
                }
            });
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false);
        });
        return;
    }

    // 4. TORNEI
    if (tabType === 'tournaments') {
        db.ref('leaderboard/tournaments').orderByChild('score').limitToLast(100).once('value', snapshot => {
            let teams = [];
            snapshot.forEach(child => {
                let t = child.val();
                if (t) {
                    t.id = child.key; // ID del Team
                    t.dbPath = `leaderboard/tournaments/${child.key}`;
                    teams.push(t);
                }
            });
            teams.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(teams, els.leaderboardContainer, false, true);
        });
        return;
    }

    // 4b. ARCADE
    if (tabType === 'arcade') {
        db.ref('leaderboard/arcade/all').orderByChild('score').limitToLast(100).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => {
                let p = child.val();
                if (p) {
                    p.id = child.key;
                    p.dbPath = `leaderboard/arcade/all/${child.key}`;
                    players.push(p);
                }
            });
            // Ordinamento: Punteggio decrescente
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false, false, true);
        });
        return;
    }

    // 4c. LA TORRE
    if (tabType === 'la_torre') {
        db.ref('leaderboard/la_torre/all').orderByChild('score').limitToLast(100).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => {
                let p = child.val();
                if (p) {
                    p.id = child.key;
                    p.dbPath = `leaderboard/la_torre/all/${child.key}`;
                    players.push(p);
                }
            });
            // Ordinamento: Piano (score) decrescente
            players.sort((a, b) => (Number(b.score) - Number(a.score)));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false, false, false, true);
        });
        return;
    }

    // 4d. MEMORY CW (GIOCO DELLE COPPIE)
    if (tabType === 'memory_cw') {
        db.ref('leaderboard/arcade/memory_cw').orderByChild('score').limitToLast(100).once('value', snapshot => {
            let players = [];
            snapshot.forEach(child => {
                let p = child.val();
                if (p) {
                    p.id = child.key;
                    p.dbPath = `leaderboard/arcade/memory_cw/${child.key}`;
                    players.push(p);
                }
            });
            players.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            window.renderPlayersListHTML(players, els.leaderboardContainer, false);
        });
        return;
    }

    // 5. SOLO PRACTICE (Record Individuali)
    let baseMode = tabType.replace('_single', '').replace('_multi', '');
    if (baseMode === 'std') baseMode = 'standard';
    if (baseMode === 'std_plus') baseMode = 'standard_plus';

    const dbPath = `leaderboard/${baseMode}`;
    console.log("LB: Fetching Solo from:", dbPath);

    const fetchSoloNode = (nodeKey) => {
        return db.ref(`${dbPath}/${nodeKey}`).orderByChild('score').limitToLast(100).once('value');
    };

    const processSnap = (snapshot, wcKey) => {
        let players = [];
        snapshot.forEach(userNode => {
            let p = userNode.val();
            if (p) {
                p.id = userNode.key;
                p.dbPath = `${dbPath}/${wcKey}/${userNode.key}`;
                players.push(p);
            }
        });
        return players;
    };

    if (filterWordCount !== 'all') {
        fetchSoloNode('single_' + filterWordCount).then(snap => {
            let players = processSnap(snap, 'single_' + filterWordCount);
            players.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.wpm) - Number(a.wpm)));
            window.renderPlayersListHTML(players, els.leaderboardContainer, true);
        });
    } else {
        // OTTIMIZZAZIONE BANDWIDTH: Se 'all', interroghiamo solo i top 30 per categoria invece dell'intero albero storico!
        Promise.all([
            db.ref(`${dbPath}/single_10`).orderByChild('score').limitToLast(30).once('value').catch(() => null),
            db.ref(`${dbPath}/single_20`).orderByChild('score').limitToLast(30).once('value').catch(() => null),
            db.ref(`${dbPath}/single_30`).orderByChild('score').limitToLast(30).once('value').catch(() => null),
            db.ref(`${dbPath}/single_50`).orderByChild('score').limitToLast(30).once('value').catch(() => null)
        ]).then(snaps => {
            let players = [];
            const wcKeys = ['single_10', 'single_20', 'single_30', 'single_50'];
            snaps.forEach((snap, idx) => {
                if (snap && snap.exists()) {
                    const wcKey = wcKeys[idx];
                    snap.forEach(userNode => {
                        let p = userNode.val();
                        if (p) {
                            p.id = userNode.key;
                            p.dbPath = `${dbPath}/${wcKey}/${userNode.key}`;
                            players.push(p);
                        }
                    });
                }
            });
            players.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.wpm) - Number(a.wpm)));
            window.renderPlayersListHTML(players.slice(0, 50), els.leaderboardContainer, true);
        });
    }
};

window.renderMatchesHistoryHTML = function(matches, container) {
    container.innerHTML = '';
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">${currentLang === 'it' ? 'Nessuna sfida recente trovata.' : 'No recent challenges found.'}</p>`;
        return;
    }
    matches.forEach(match => {
        const mw = document.createElement('div'); mw.style.marginBottom = "25px"; mw.style.borderBottom = "1px dashed var(--hint-color)"; mw.style.paddingBottom = "15px"; mw.style.position = "relative";
        const infoDiv = document.createElement('div'); infoDiv.style.textAlign = 'center'; infoDiv.style.fontSize = '0.8em'; infoDiv.style.color = 'var(--hint-color)'; infoDiv.style.marginBottom = '8px';
        infoDiv.textContent = `📅 ${match.date} - ${match.wordCount} Stringhe`; mw.appendChild(infoDiv);

        // BOTTONE CANCELLA MATCH (Se l'utente ha partecipato)
        const hasMe = match.players && (Array.isArray(match.players) ? match.players.some(p => p.id === window.myId) : match.players[window.myId]);
        if (hasMe && match.dbPath) {
            const delBtn = document.createElement('button');
            delBtn.style.cssText = "position:absolute; top:0; right:0; background:none; border:none; color:#f44336; cursor:pointer; font-size:1.1em; padding:5px;";
            delBtn.innerHTML = "🗑️";
            delBtn.title = currentLang === 'it' ? "Elimina dalla cronologia" : "Delete from history";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                window.deleteLeaderboardEntry(match.dbPath);
            };
            mw.appendChild(delBtn);
        }

        window.renderHeadToHeadView(match.players, mw, match.ts); container.appendChild(mw);
    });
};

window.renderPlayersListHTML = function(players, container, showWordCount, isTeam = false, isArcade = false, isTower = false) {
    container.innerHTML = '';
    if (players.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--hint-color); padding:20px;">${currentLang === 'it' ? 'Nessun record trovato.' : 'No records found.'}</p>`;
        return;
    }

    players.forEach((player, index) => {
        // --- FILTRO PRIVACY LEADERBOARD ---
        // Se l'utente ha attivato la privacy, non compare nella classifica globale per gli altri.
        // Permettiamo all'utente stesso di vedersi (con etichetta) per permettergli di gestire il record.
        const isMe = (player.id === window.myId);
        if (player.privacyLeaderboard === true && !isMe) return;

        const row = document.createElement('div'); row.className = 'leaderboard-row';
        if (player.privacyLeaderboard === true && isMe) {
            row.style.background = "rgba(255,152,0,0.05)";
            row.style.borderLeft = "4px solid #ff9800";
        }
        const mainDiv = document.createElement('div'); mainDiv.style.display = 'flex'; mainDiv.style.alignItems = 'center'; mainDiv.style.gap = '8px'; mainDiv.style.flexGrow = '1';

        const medalDiv = document.createElement('div'); medalDiv.style.fontSize = '1.2em'; medalDiv.style.minWidth = '1.5em'; medalDiv.style.textAlign = 'center';
        if (index === 0) medalDiv.textContent = "🥇"; else if (index === 1) medalDiv.textContent = "🥈"; else if (index === 2) medalDiv.textContent = "🥉";
        else { const span = document.createElement('span'); span.style.color = 'var(--hint-color)'; span.style.fontSize = '0.8em'; span.textContent = (index + 1) + "."; medalDiv.appendChild(span); }

        const infoDiv = document.createElement('div'); infoDiv.style.display = 'flex'; infoDiv.style.flexDirection = 'column';
        const nameDiv = document.createElement('div'); nameDiv.style.display = 'flex'; nameDiv.style.alignItems = 'center';

        // PRIVACY: Nome cliccabile solo se privacy disattivata
        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = 'bold';
        nameSpan.textContent = (player.name || "Anonimo") + (player.privacyLeaderboard && isMe ? " (🔒 NASCOSTO)" : "");

        if (player.username && String(player.username).trim() !== "") {
            nameSpan.style.color = 'var(--link-color)';
            nameSpan.style.textDecoration = 'underline';
            nameSpan.style.cursor = 'pointer';
            nameSpan.onclick = () => window.openTelegramProfile(player.username);
        }

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
            const wpmLabel = (isArcade || isTower) ? "Peak " : "";
            const wpmSpan = document.createElement('span');
            wpmSpan.style.color = 'var(--champ-color)';
            wpmSpan.style.fontWeight = 'bold';
            wpmSpan.textContent = wpmLabel + player.wpm + " WPM";
            dateDiv.appendChild(wpmSpan);
        }

        infoDiv.appendChild(nameDiv); infoDiv.appendChild(dateDiv);
        mainDiv.appendChild(medalDiv); mainDiv.appendChild(infoDiv);

        row.appendChild(mainDiv);

        // LIVELLO ARCADE / PIANO TORRE
        if (isArcade || isTower) {
            const midDiv = document.createElement('div');
            midDiv.style.cssText = "flex: 0 0 70px; text-align: center; font-weight: bold; color: var(--link-color); border-left: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); margin: 0 5px;";

            const levelLabel = document.createElement('div');
            levelLabel.style.cssText = "font-size:0.65em; color:var(--hint-color); font-weight:normal; text-transform:uppercase;";
            levelLabel.textContent = isTower ? "Piano" : "Livello";

            midDiv.appendChild(levelLabel);
            midDiv.appendChild(document.createTextNode(isTower ? player.score : (player.wave || 1)));
            row.appendChild(midDiv);
        }

        // CONTENITORE AZIONI E PUNTEGGIO (Per allineamento perfetto)
        const actionsScoreDiv = document.createElement('div');
        actionsScoreDiv.style.cssText = "display:flex; align-items:center; gap:8px; justify-content:flex-end;";

        // BOTTONE CANCELLA (Solo per i propri record) - ORA A SINISTRA DEI PUNTI
        const isMyRecord = player.id === window.myId || (isTeam && player.id === window.myTeamId);
        if (isMyRecord && player.dbPath) {
            const delBtn = document.createElement('button');
            delBtn.style.cssText = "background:none; border:none; color:#f44336; cursor:pointer; font-size:1.1em; padding:4px; display:flex; align-items:center; opacity:0.6; transition: opacity 0.2s;";
            delBtn.innerHTML = "🗑️";
            delBtn.title = currentLang === 'it' ? "Cancella record" : "Delete record";
            delBtn.onmouseover = () => delBtn.style.opacity = "1";
            delBtn.onmouseout = () => delBtn.style.opacity = "0.6";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                window.deleteLeaderboardEntry(player.dbPath);
            };
            actionsScoreDiv.appendChild(delBtn);
        }

        const scoreDiv = document.createElement('div');
        scoreDiv.style.cssText = "text-align:right; min-width:65px;"; // Min-width garantisce l'allineamento dei numeri
        const scoreB = document.createElement('b'); scoreB.style.fontSize = '1.1em'; scoreB.style.color = 'var(--link-color)'; scoreB.textContent = player.score;
        const ptSpan = document.createElement('span'); ptSpan.style.fontSize = '0.7em'; ptSpan.style.color = 'var(--hint-color)'; ptSpan.style.marginLeft = '2px'; ptSpan.textContent = 'pt';
        scoreDiv.appendChild(scoreB); scoreDiv.appendChild(ptSpan);

        actionsScoreDiv.appendChild(scoreDiv);
        row.appendChild(actionsScoreDiv);

        container.appendChild(row);
    });
};

window.deleteLeaderboardEntry = function(path) {
    if (!confirm(currentLang === 'it' ? "Vuoi davvero cancellare questo record dalla classifica?" : "Do you really want to delete this record from the leaderboard?")) return;

    db.ref(path).remove().then(() => {
        showToast(currentLang === 'it' ? "Record rimosso." : "Record removed.");
        // Ricarica la classifica corrente
        const select = document.getElementById('lbModeSelect');
        if (select) window.showLeaderboardTab(select.value);
    }).catch(err => {
        console.error("LB: Error deleting record:", err);
        showToast("Errore durante la rimozione.");
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

window.renderHeadToHeadView = function(players, container, matchTimestamp = null) {
    if (!players) return;

    // Convertiamo in array se i dati sono arrivati come oggetto (comune in Firebase)
    let playersArray = Array.isArray(players) ? [...players] : Object.values(players);
    if (playersArray.length === 0) return;

    const h2h = document.createElement('div'); h2h.className = 'h2h-container';
    playersArray.sort((a, b) => (b.score - a.score) || (b.wpm - a.wpm));
    const maxScore = playersArray[0].score;

    // Un match è considerato "concluso" se è vecchio di più di 5 minuti,
    // anche se qualcuno non ha terminato formalmente (timeout tecnico).
    const isOldMatch = matchTimestamp && (Date.now() - matchTimestamp > 5 * 60 * 1000);

    playersArray.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'h2h-card' + (p.score === maxScore && maxScore > 0 ? ' winner' : '');

        const nameDiv = document.createElement('div');
        nameDiv.className = 'h2h-name';

        let pName = p.name || "Sconosciuto";
        // Fallback se il nome manca per l'utente corrente
        if ((pName === "Sconosciuto" || !pName) && p.id === window.myId) pName = window.myName;
        nameDiv.textContent = pName;

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
            // --- FIX: LOGICA STATO INTELLIGENTE ---
            // Se stiamo guardando lo STORICO (matchTimestamp presente), non mostriamo mai "IN CORSO"
            // Se siamo in una stanza LIVE, mostriamo "IN CORSO" solo se non è passato troppo tempo
            const isHistoryView = (matchTimestamp !== null);

            if (!isHistoryView && !isOldMatch) {
                const rowProg = document.createElement('div'); rowProg.className = 'h2h-stat-row';
                rowProg.innerHTML = `<span style="color:#ff9800; font-weight:bold; font-size:0.7em; width:100%; text-align:center; margin-top:5px; animation: pulse 1s infinite;">${currentLang==='it'?'IN CORSO...':'PLAYING...'}</span>`;
                statsDiv.appendChild(rowProg);
            } else {
                // Se è storico o match scaduto/fantasma, mostriamo che non ha finito
                const rowMissing = document.createElement('div'); rowMissing.className = 'h2h-stat-row';
                rowMissing.innerHTML = `<span style="color:var(--hint-color); font-weight:bold; font-size:0.7em; width:100%; text-align:center; margin-top:5px;">${currentLang==='it'?'NON TERMINATO':'INCOMPLETE'}</span>`;
                statsDiv.appendChild(rowMissing);
            }
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

// LISTENER SOTTO-TAB TORNEI
if (els.btnTrnGlobalLB) {
    els.btnTrnGlobalLB.onclick = () => {
        els.btnTrnGlobalLB.classList.add('active-tab');
        els.btnTrnActiveLB.classList.remove('active-tab');
        window.fetchAndRenderGlobalLeaderboard('tournaments', null);
    };
}
if (els.btnTrnActiveLB) {
    els.btnTrnActiveLB.onclick = () => {
        els.btnTrnActiveLB.classList.add('active-tab');
        els.btnTrnGlobalLB.classList.remove('active-tab');
        window.fetchAndRenderActiveTournamentLeaderboard();
    };
}

window.fetchAndRenderActiveTournamentLeaderboard = function() {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">Ricerca torneo in corso...</p>`;

    db.ref('rooms').orderByChild('type').equalTo('tournament').limitToLast(5).once('value', snap => {
        let activeTrn = null;
        snap.forEach(child => {
            const data = child.val();
            if (data && data.status !== 'finished') activeTrn = { id: child.key, ...data };
        });

        if (activeTrn) {
            db.ref(`rooms/${activeTrn.id}/players`).once('value', pSnap => {
                window.renderRoomLeaderboard(pSnap.val() || {});
            });
        } else {
            els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">Nessun torneo attivo al momento.</p>`;
        }
    });
};

window.fetchAndRenderGameRatings = function() {
    if (!els.leaderboardContainer) return;
    els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">${currentLang==='it'?'Caricamento gradimento...':'Loading ratings...'}</p>`;

    db.ref('ratings/stats').once('value', snap => {
        if (!snap.exists()) {
            els.leaderboardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--hint-color);">Ancora nessuna valutazione ricevuta.</p>`;
            return;
        }

        const stats = snap.val();
        els.leaderboardContainer.innerHTML = '';

        // Convertiamo in array per l'ordinamento
        const list = [];
        Object.entries(stats).forEach(([key, data]) => {
            const parts = key.split('_');
            const type = parts.pop();
            const mode = parts.join('_');
            const modeCfg = window.GAME_MODES[mode];
            if (!modeCfg) return;

            const ups = data.up || 0;
            const downs = data.down || 0;
            const total = ups + downs;
            const score = total > 0 ? (ups / total) * 100 : 0;

            list.push({ mode: modeCfg.titleIt, type, ups, downs, score });
        });

        // Ordiniamo per percentuale di gradimento
        list.sort((a, b) => b.score - a.score || b.ups - a.ups);

        list.forEach(item => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.style.cssText = "margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; display:flex; justify-content:space-between; align-items:center;";

            row.innerHTML = `
                <div style="flex-grow:1;">
                    <b style="color:var(--link-color)">${item.mode}</b><br>
                    <small style="opacity:0.6; font-size:0.75em;">Modo: ${item.type.toUpperCase()}</small>
                </div>
                <div style="text-align:right; min-width:100px;">
                    <div style="font-size:1.1em;">
                        <span style="color:#4caf50">👍 ${item.ups}</span>
                        <span style="color:#d32f2f; margin-left:10px;">👎 ${item.downs}</span>
                    </div>
                    <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin-top:4px; overflow:hidden;">
                        <div style="width:${item.score}%; height:100%; background:#4caf50;"></div>
                    </div>
                </div>
            `;
            els.leaderboardContainer.appendChild(row);
        });
    });
};
