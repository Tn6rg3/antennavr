// js/profile_manager.js

window.getWeekNumber = function(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear() + "-W" + Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7).toString().padStart(2, '0');
};

window.updateActivity = function(won = false) {
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

    const increment = firebase.database.ServerValue.increment(1);

    ['daily/'+dKey, 'weekly/'+wKey, 'monthly/'+mKey].forEach(path => {
        const updates = {
            games: increment,
            name: myName,
            lastPlayed: firebase.database.ServerValue.TIMESTAMP
        };
        if (won) updates.wins = increment;

        db.ref(`activity/${path}/${myId}`).update(updates).then(() => {
            if (path.startsWith('daily')) window.checkActivityAndAwardMedals();
        }).catch(err => console.error("Error updating activity:", err));
    });
};

window.checkActivityAndAwardMedals = async function() {
    const now = new Date();
    const dKey = now.toISOString().split('T')[0];
    const wKey = window.getWeekNumber(now);
    const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

    try {
        const [dSnap, wSnap, mSnap, uMedals] = await Promise.all([
            db.ref(`activity/daily/${dKey}/${myId}`).once('value'),
            db.ref(`activity/weekly/${wKey}/${myId}`).once('value'),
            db.ref(`activity/monthly/${mKey}/${myId}`).once('value'),
            db.ref(`users/${myId}/medals`).once('value')
        ]);

        const dData = dSnap.val() || { games: 0 }, wData = wSnap.val() || { games: 0 }, mData = mSnap.val() || { games: 0 };
        let myMedals = uMedals.val() || {};

        const validKeys = [dKey, wKey, mKey, 'daily_champ'];
        for (let id in myMedals) {
            if (!validKeys.includes(myMedals[id].periodKey)) {
                await db.ref(`users/${myId}/medals/${id}`).remove();
                delete myMedals[id];
            }
        }

        const check = (count, thresh, id, title, desc, icon, pKey) => {
            if (count >= thresh && (!myMedals[id] || myMedals[id].periodKey !== pKey)) {
                window.awardMedal(id, title, desc, icon, pKey);
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
    } catch(e) { console.error("Medals Logic Error:", e); }
    window.updateMedalGallery();
};

window.awardMedal = function(id, title, desc, icon, periodKey) {
    db.ref(`users/${myId}/medals/${id}`).set({ title, date: new Date().toLocaleDateString('it-IT'), icon, periodKey });
    if (els.overlayMedalIcon) els.overlayMedalIcon.textContent = icon;
    if (els.overlayMedalTitle) els.overlayMedalTitle.textContent = title;
    if (els.overlayMedalDesc) els.overlayMedalDesc.textContent = desc;
    if (els.medalOverlay) els.medalOverlay.style.display = 'flex';
    if (!window.audioCtx) window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    } catch(e) { console.warn("Audio Context error:", e); }

    window.updateMedalGallery();
};

window.updateMedalGallery = function() {
    if (!els.myMedalsContainer) return;
    db.ref(`users/${myId}/medals`).once('value', snap => {
        if (!snap.exists()) {
            els.myMedalsContainer.innerHTML = '<span style="font-size:0.6em; color:var(--hint-color);">Nessuna medaglia.</span>';
            return;
        }
        els.myMedalsContainer.innerHTML = '';
        const frag = document.createDocumentFragment();

        Object.values(snap.val()).forEach(m => {
            const span = document.createElement('span');
            span.textContent = (m.count && m.count > 1) ? `${m.count}x ${m.icon}` : m.icon;
            span.title = `${m.title} (${m.date})`;
            span.onclick = () => showToast(`${m.title} - ${m.date}`);
            span.style.cursor = "pointer";
            frag.appendChild(span);
        });
        els.myMedalsContainer.appendChild(frag);
    });
};

window.switchActTab = function(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => b.classList.remove('active-tab'));
    const targetTab = els[`tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`];
    if (targetTab) targetTab.classList.add('active-tab');

    const now = new Date();
    let key = period === 'daily' ? now.toISOString().split('T')[0] :
              period === 'weekly' ? window.getWeekNumber(now) :
              now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');

    if (els.actListTitle) {
        els.actListTitle.textContent = period === 'daily' ? "I più attivi di Oggi" :
                                       period === 'weekly' ? "I più attivi della Settimana" : "I più attivi del Mese";
    }
    window.renderActivityRankings(period, key);
    window.updateMedalGallery();
};

window.renderActivityRankings = function(period, key) {
    if (!els.activityRankList) return;
    els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Caricamento...</li>';

    db.ref(`activity/${period}/${key}`).once('value').then(snap => {
        els.activityRankList.innerHTML = '';
        let users = [];
        if (snap.exists()) {
            snap.forEach(child => {
                const u = child.val();
                if (u && typeof u === 'object') users.push({ id: child.key, ...u });
            });
        }

        users.sort((a, b) => (b.games || 0) - (a.games || 0));
        users = users.slice(0, 50);

        if (users.length === 0) {
            els.activityRankList.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna attività registrata.</li>';
            return;
        }

        const frag = document.createDocumentFragment();
        users.forEach((u, idx) => {
            let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`;
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.appendChild(document.createTextNode(medal + " "));
            const nameB = document.createElement('b');
            nameB.textContent = u.name || "Anonimo";
            nameSpan.appendChild(nameB);

            const statsSpan = document.createElement('span');
            const gamesB = document.createElement('b');
            gamesB.textContent = u.games || 0;
            statsSpan.appendChild(gamesB);
            statsSpan.appendChild(document.createTextNode(" part. "));

            const winsSmall = document.createElement('small');
            winsSmall.style.color = '#4caf50';
            winsSmall.textContent = `(${u.wins || 0} v.)`;
            statsSpan.appendChild(winsSmall);

            li.appendChild(nameSpan);
            li.appendChild(statsSpan);
            frag.appendChild(li);
        });
        els.activityRankList.appendChild(frag);
    }).catch(err => {
        els.activityRankList.innerHTML = `
            <li style="justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;">
                <span>Errore nel caricamento.</span>
                <small style="font-size:0.7em; opacity:0.7;">${err.message}</small>
            </li>`;
    });
};

// --- NUOVA GESTIONE PROFILO E STATISTICHE ANALITICHE ---

// Funzioni handler isolate per non creare duplicati in memoria ad ogni switch di tab
const handleStatsInputEnter = (e) => {
    if (e.key === 'Enter') {
        e.target.blur();
        window.loadAdvancedStats();
    }
};

const handleStatsInputFocus = (e) => {
    setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
};

window.switchProfileTab = function(tabId) {
    const infoBtn = document.getElementById('btnTabProfile');
    const statsBtn = document.getElementById('btnTabStats');
    const ratingsBtn = document.getElementById('btnTabRatings');
    const infoArea = document.getElementById('profileInfoArea');
    const statsArea = document.getElementById('profileStatsArea');
    const ratingsArea = document.getElementById('profileRatingsArea');
    const courseArea = document.getElementById('profileCourseArea');
    const tabsHeader = document.getElementById('profileTabsHeader');

    if (infoBtn) infoBtn.classList.remove('active-tab');
    if (statsBtn) statsBtn.classList.remove('active-tab');
    if (ratingsBtn) ratingsBtn.classList.remove('active-tab');

    if (infoArea) infoArea.style.display = 'none';
    if (statsArea) statsArea.style.display = 'none';
    if (ratingsArea) ratingsArea.style.display = 'none';
    if (courseArea) courseArea.style.display = 'none';

    if (tabId === 'info') {
        if (els.statsActionButtons) els.statsActionButtons.style.display = 'none';
        if (tabsHeader) tabsHeader.style.display = 'flex';
        if (infoBtn) infoBtn.classList.add('active-tab');
        if (infoArea) infoArea.style.display = 'flex';
        window.loadProfileInfo();
    } else if (tabId === 'stats') {
        if (els.statsActionButtons) els.statsActionButtons.style.display = 'flex';
        if (tabsHeader) tabsHeader.style.display = 'flex';
        if (statsBtn) statsBtn.classList.add('active-tab');
        if (statsArea) statsArea.style.display = 'flex';
        window.loadAdvancedStats();
    } else if (tabId === 'ratings') {
        if (els.statsActionButtons) els.statsActionButtons.style.display = 'none';
        if (tabsHeader) tabsHeader.style.display = 'flex';
        if (ratingsBtn) ratingsBtn.classList.add('active-tab');
        if (ratingsArea) ratingsArea.style.display = 'flex';
        if (typeof window.loadUserRatings === 'function') window.loadUserRatings();
    } else if (tabId === 'course') {
        if (els.statsActionButtons) els.statsActionButtons.style.display = 'none';
        if (tabsHeader) tabsHeader.style.display = 'none';
        if (courseArea) courseArea.style.display = 'flex';
        if (typeof window.hideCourseMessageBadge === 'function') window.hideCourseMessageBadge();
        if (typeof window.renderCourseTabView === 'function') window.renderCourseTabView();
    }
};

window.loadProfileInfo = function() {
    const listContainer = document.getElementById('matchHistoryList');
    if (!listContainer) return;
    listContainer.innerHTML = '<li style="justify-content:center;">Caricamento...</li>';

    const userId = window.myId || (typeof myId !== 'undefined' && myId ? myId : null);
    if (!userId || !db) {
        listContainer.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Autenticazione in corso...</li>';
        return;
    }

    db.ref(`users/${userId}/history`).once('value').then(snap => {
        listContainer.innerHTML = '';
        window.userMatchHistory = [];

        if (snap.exists()) {
            snap.forEach(child => {
                window.userMatchHistory.push({ key: child.key, ...child.val() });
            });
        }

        window.userMatchHistory.sort((a,b) => {
            const tsA = a.ts || (a.date ? (typeof a.date === 'number' ? a.date : new Date(a.date).getTime()) : 0);
            const tsB = b.ts || (b.date ? (typeof b.date === 'number' ? b.date : new Date(b.date).getTime()) : 0);
            return tsB - tsA;
        });

        if (window.userMatchHistory.length === 0) {
            listContainer.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna partita.</li>';
            return;
        }

        const frag = document.createDocumentFragment();
        window.userMatchHistory.slice(0, 15).forEach(match => {
            const d = new Date(match.date || match.ts || Date.now());
            const dateStr = `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}`;
            let modeIcon = match.mode === 'callsign' ? '🎙️' : match.mode === 'pingpong' ? '🏓' : match.mode === 'chars' ? '⌨️' : (match.mode === 'daily_challenge' ? '📅' : '🔤');

            const li = document.createElement('li');
            li.style.cssText = "flex-direction:column; align-items:flex-start; padding:8px;";
            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.85em;">
                    <b>${modeIcon} ${(match.mode || "GIOCO").toUpperCase()}</b>
                    <span style="color:var(--hint-color)">${dateStr}</span>
                </div>
                <div style="display:flex; justify-content:space-between; width:100%; margin-top:5px; align-items:center;">
                    <span><b>${match.score || 0} pt</b> <small>(${match.wpm || 20} WPM)</small></span>
                    <div style="display:flex; gap:5px;">
                        <button class="action-btn-small btn-secondary" onclick="window.openMatchDetails('${match.key}')" style="width:auto; padding:2px 10px;">Vedi</button>
                        <button class="action-btn-small btn-danger" onclick="window.deleteHistoryItem('${match.key}')" style="width:auto; padding:2px 6px;">🗑️</button>
                    </div>
                </div>
            `;
            frag.appendChild(li);
        });
        listContainer.appendChild(frag);
    }).catch(err => {
        console.error("Profile: Error loading history:", err);
        listContainer.innerHTML = '<li style="justify-content:center; color:#d32f2f;">Errore caricamento.</li>';
    });
};

window.loadAdvancedStats = function() {
    const wpmContainer = document.getElementById('wpmErrorChartContainer');
    const bigramContainer = document.getElementById('bigramErrorsContainer');
    const trigramContainer = document.getElementById('trigramErrorsContainer');
    const quadgramContainer = document.getElementById('quadgramErrorsContainer');
    const wordContainer = document.getElementById('wordErrorsContainer');

    const bigramTh = parseInt(document.getElementById('bigramThresholdInput')?.value) || 3;
    const trigramTh = parseInt(document.getElementById('trigramThresholdInput')?.value) || 2;
    const quadgramTh = parseInt(document.getElementById('quadgramThresholdInput')?.value) || 2;
    const wordTh = parseInt(document.getElementById('wordThresholdInput')?.value) || 3;

    if (wpmContainer) wpmContainer.innerHTML = 'Caricamento...';
    if (bigramContainer) bigramContainer.innerHTML = 'Caricamento...';
    if (trigramContainer) trigramContainer.innerHTML = 'Caricamento...';
    if (quadgramContainer) quadgramContainer.innerHTML = 'Caricamento...';
    if (wordContainer) wordContainer.innerHTML = 'Caricamento...';

    const userId = window.myId || (typeof myId !== 'undefined' && myId ? myId : null);
    if (!userId || !db) {
        console.warn("loadAdvancedStats: userId or db not available yet.");
        return;
    }

    Promise.all([
        db.ref(`users/${userId}/stats`).once('value').catch(() => null),
        db.ref(`users/${userId}/history`).once('value').catch(() => null)
    ]).then(([statsSnap, histSnap]) => {
        const stats = (statsSnap && statsSnap.exists()) ? statsSnap.val() : {};
        let historyData = [];

        if (histSnap && histSnap.exists()) {
            histSnap.forEach(child => {
                historyData.push({ key: child.key, ...child.val() });
            });
        }

        if (historyData.length === 0 && Array.isArray(window.userMatchHistory) && window.userMatchHistory.length > 0) {
            historyData = window.userMatchHistory;
        } else {
            window.userMatchHistory = historyData;
        }

        window.renderAccuracyTrend(stats.accuracySessions || {}, historyData);
        window.renderGamePhaseAnalysis(historyData);

        // 0b. MIGLIORAMENTO MIRATO
        window.renderTargetedImprovement(stats);

        // A. DIAGNOSTICA LUNGHEZZA
        const lengthCont = document.getElementById('lengthStatsContainer');
        if (lengthCont) {
            lengthCont.innerHTML = '';
            const lData = stats.lengthStats || {};
            const sortedLens = Object.keys(lData).sort((a,b) => parseInt(a)-parseInt(b));
            if (sortedLens.length === 0) {
                lengthCont.innerHTML = '<p style="font-size:0.7em; color:#666;">Dati insufficienti.</p>';
            } else {
                const frag = document.createDocumentFragment();
                sortedLens.forEach(len => {
                    const d = lData[len];
                    const acc = Math.round(((d.total - d.errors) / d.total) * 100);
                    const color = acc > 85 ? '#2e7d32' : acc > 70 ? '#f57f17' : '#d32f2f';
                    const row = document.createElement('div');
                    row.style.cssText = "display:flex; align-items:center; gap:8px; font-size:0.75em; color: #000;";
                    row.innerHTML = `<span style="width:55px; color: #333; font-weight: bold;">${len} Car.</span>
                        <div style="flex-grow:1; height:8px; background:rgba(0,0,0,0.1); border-radius:4px; overflow:hidden;">
                            <div style="width:${acc}%; height:100%; background:${color}; transition: width 0.5s ease-out;"></div>
                        </div>
                        <span style="width:35px; text-align:right; font-weight:bold; color:${color}">${acc}%</span>`;
                    frag.appendChild(row);
                });
                lengthCont.appendChild(frag);
            }
        }

        // B. DIAGNOSTICA POSIZIONALE
        const pData = stats.positionalErrors || { start:0, mid:0, end:0, totalErrors:0 };
        const realTotal = pData.totalErrors || ((pData.start || 0) + (pData.mid || 0) + (pData.end || 0)) || 1;
        const calcP = (val) => Math.round(((val || 0) / realTotal) * 100) + "%";

        if (document.getElementById('posStartStat')) document.getElementById('posStartStat').querySelector('b').textContent = calcP(pData.start);
        if (document.getElementById('posMidStat')) document.getElementById('posMidStat').querySelector('b').textContent = calcP(pData.mid);
        if (document.getElementById('posEndStat')) document.getElementById('posEndStat').querySelector('b').textContent = calcP(pData.end);

        // 1. Errori per WPM
        if (wpmContainer) {
            wpmContainer.innerHTML = '';
            const wpmErrs = stats.errorsByWpm || {};
            const sortedWpm = Object.keys(wpmErrs).sort((a,b) => parseInt(b) - parseInt(a));
            if (sortedWpm.length === 0) {
                wpmContainer.innerHTML = '<p style="text-align:center; color: var(--hint-color);">Nessun dato.</p>';
            } else {
                const frag = document.createDocumentFragment();
                sortedWpm.forEach(wpm => {
                    const total = Object.values(wpmErrs[wpm]).reduce((a,b) => a+b, 0);
                    const div = document.createElement('div');
                    div.style.cssText = "display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.05); padding:4px 0; color: var(--text-color);";
                    div.innerHTML = `<b>${wpm} WPM</b> <span style="color:#d32f2f; font-weight: bold;">${total} err.</span>`;
                    frag.appendChild(div);
                });
                wpmContainer.appendChild(frag);
            }
        }

        // --- MATRICE CONFUSIONE E BLOCCHI COGNITIVI ---
        const matrixCont = document.getElementById('confusionMatrixContainer');
        const blocksCont = document.getElementById('cognitiveBlocksContainer');

        if (matrixCont) {
            matrixCont.innerHTML = '';
            const matrix = stats.confusionMatrix || {};
            const sortedMatrix = Object.entries(matrix).sort((a,b) => b[1] - a[1]).slice(0, 15);
            if (sortedMatrix.length === 0) {
                matrixCont.innerHTML = '<p style="text-align:center; color:var(--hint-color); font-size:0.8em; margin-top:20px;">Dati in raccolta...</p>';
            } else {
                sortedMatrix.forEach(([key, count]) => {
                    let [real, typed] = key.split('->');
                    const unescapeKey = (k) => {
                        if (k === 'SPACE') return "Spazio";
                        if (k === 'OMESSO') return "Mancante";
                        if (typeof window.firebaseUnescape === 'function') return window.firebaseUnescape(k);
                        return k.replace(/_dot_/g, '.').replace(/_hash_/g, '#').replace(/_dollar_/g, '$').replace(/_lbrac_/g, '[').replace(/_rbrac_/g, ']');
                    };
                    real = unescapeKey(real);
                    typed = unescapeKey(typed);
                    const div = document.createElement('div');
                    div.style.cssText = "display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(0,0,0,0.03);";
                    div.innerHTML = `<span><b>${real}</b> <small>scambiato per</small> <b>${typed}</b></span> <b style="color:#d32f2f;">${count}</b>`;
                    matrixCont.appendChild(div);
                });
            }
        }

        if (blocksCont) {
            blocksCont.innerHTML = '';
            const charStats = stats.charStats || {};
            const criticalChars = Object.entries(charStats)
                .map(([char, d]) => {
                    const dbChar = (typeof window.firebaseUnescape === 'function') ? window.firebaseUnescape(char) : char.replace(/_dot_/g, '.');
                    return { char: dbChar, acc: (d.attempts > 0 ? (d.attempts - d.errors) / d.attempts : 1), attempts: d.attempts };
                })
                .filter(c => c.attempts >= 5 && c.acc < 0.85)
                .sort((a,b) => a.acc - b.acc)
                .slice(0, 10);

            if (criticalChars.length === 0) {
                blocksCont.innerHTML = '<p style="text-align:center; color:var(--hint-color); font-size:0.8em; margin-top:20px;">Nessun blocco critico.</p>';
            } else {
                criticalChars.forEach(c => {
                    const perc = Math.round(c.acc * 100);
                    const div = document.createElement('div');
                    div.style.cssText = "margin-bottom:8px;";
                    div.innerHTML = `
                        <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:2px;">
                            <b>${c.char}</b> <span style="color:#d32f2f;">${perc}% acc.</span>
                        </div>
                        <div style="width:100%; height:4px; background:rgba(0,0,0,0.1); border-radius:2px; overflow:hidden;">
                            <div style="width:${perc}%; height:100%; background:#d32f2f;"></div>
                        </div>
                    `;
                    blocksCont.appendChild(div);
                });
            }
        }

        // RENDERING N-GRAMMI (Coppie, Triple, Quadruple)
        window.renderNGramTable(stats.bigramErrors, bigramContainer, bigramTh);
        window.renderNGramTable(stats.trigramErrors, trigramContainer, trigramTh);
        window.renderNGramTable(stats.quadgramErrors, quadgramContainer, quadgramTh);

        // 3. Parole Critiche
        if (wordContainer) {
            wordContainer.innerHTML = '';
            const words = stats.wordErrors || {};
            const criticalWords = Object.entries(words).filter(e => {
                const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
                return count >= wordTh;
            }).sort((a,b) => (b[1].count || b[1]) - (a[1].count || a[1]));

            if (criticalWords.length === 0) {
                wordContainer.innerHTML = '<p style="text-align:center; color: var(--hint-color); font-size:0.8em;">Sotto soglia.</p>';
            } else {
                const frag = document.createDocumentFragment();
                criticalWords.forEach(([word, data]) => {
                    const count = data.count || data;
                    const avgWpm = data.avgWpm || 20;
                    const div = document.createElement('div');
                    div.className = 'leaderboard-row';
                    div.style.cssText = "padding:6px; margin-bottom:4px; font-size:0.85em; flex-direction:column; align-items:flex-start; background: rgba(0,0,0,0.03); color: var(--text-color);";
                    div.innerHTML = `
                        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                            <span style="overflow:hidden; text-overflow:ellipsis;"><b style="color: #d32f2f;">${word}</b> <small style="color: var(--hint-color);">(${count})</small></span>
                            <button class="action-btn-small btn-secondary" onclick="window.playMorseAudio('${word}', ${avgWpm}, true)" style="width:30px; padding:2px 0;">🔊</button>
                        </div>
                        <div style="font-size:0.7em; color: var(--hint-color);">Velocità media errore: ${avgWpm} WPM</div>
                    `;
                    frag.appendChild(div);
                });
                wordContainer.appendChild(frag);
            }
        }
    }).catch(err => {
        console.error("loadAdvancedStats error:", err);
        const fallbackHistory = window.userMatchHistory || [];
        window.renderAccuracyTrend({}, fallbackHistory);
        window.renderGamePhaseAnalysis(fallbackHistory);
    });
};

window.renderNGramTable = function(dataNode, container, threshold) {
    if (!container) return;
    container.innerHTML = '';
    const items = dataNode || {};
    const filtered = Object.entries(items).filter(e => {
        const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
        return count >= threshold;
    }).sort((a,b) => (b[1].count || b[1]) - (a[1].count || a[1])).slice(0, 15);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--hint-color); font-size:0.7em; margin-top:10px;">Sotto soglia.</p>';
        return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(([seq, data]) => {
        const count = data.count || data;
        const avgWpm = data.avgWpm || 20;
        const div = document.createElement('div');
        div.className = 'leaderboard-row';
        div.style.cssText = "padding:4px; margin-bottom:2px; font-size:0.8em; flex-direction:column; align-items:flex-start; background: rgba(0,0,0,0.02); color: var(--text-color);";
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                <span><b style="color: #d32f2f;">${seq}</b> <small style="color: var(--hint-color);">(${count})</small></span>
                <button class="action-btn-small btn-secondary" onclick="window.playMorseAudio('${seq}', ${avgWpm}, true)" style="width:25px; padding:1px 0; font-size:0.7em;">🔊</button>
            </div>
        `;
        frag.appendChild(div);
    });
    container.appendChild(frag);
};

// --- LISTENERS SOGLIE ANALISI ---
['bigramThresholdInput', 'trigramThresholdInput', 'quadgramThresholdInput', 'wordThresholdInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => window.loadAdvancedStats());
        el.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.target.blur(); window.loadAdvancedStats(); } });
    }
});

window.renderAccuracyTrend = function(trendData, historyMatches = []) {
    const canvas = document.getElementById('accuracyTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth || 300;
    const height = canvas.offsetHeight || 180;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const periodSel = document.getElementById('chartPeriodSelect');
    const period = periodSel ? periodSel.value : 'history';

    // Raccoglie lo storico globale sia da window.userMatchHistory che da historyMatches
    let rawMatches = [];
    if (Array.isArray(historyMatches) && historyMatches.length > 0) {
        rawMatches = [...historyMatches];
    } else if (Array.isArray(window.userMatchHistory) && window.userMatchHistory.length > 0) {
        rawMatches = [...window.userMatchHistory];
    }

    const getMatchTs = (m) => {
        if (!m) return 0;
        if (typeof m.ts === 'number' && m.ts > 0) return m.ts;
        if (typeof m.date === 'number' && m.date > 0) return m.date;
        if (typeof m.date === 'string') {
            const parsed = new Date(m.date).getTime();
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        return 0;
    };

    const allowedModes = new Set(['standard', 'callsign', 'daily_challenge']);

    let allMatches = rawMatches.filter(m => {
        if (!m) return false;
        const mode = (m.mode || 'standard').toLowerCase();
        return allowedModes.has(mode);
    }).sort((a,b) => getMatchTs(a) - getMatchTs(b));

    let sessions = [];

    if (period === 'last_match') {
        // Modalita Ultima Partita: parola per parola dell'ultima partita giocata
        if (allMatches.length > 0) {
            const lastMatch = allMatches[allMatches.length - 1]; // L'ULTIMA PARTITA PIU' RECENTE
            const details = (lastMatch ? (lastMatch.details || lastMatch.matchDetails) : []) || [];

            if (details.length > 0) {
                details.forEach((d, idx) => {
                    const isCorrect = (d.real || "").toUpperCase() === (d.typed || "").toUpperCase() && !d.usedReplay;
                    const wordWpm = d.wpm || lastMatch.wpm || 20;
                    sessions.push({
                        acc: isCorrect ? 100 : 0,
                        wpm: wordWpm,
                        ts: idx + 1
                    });
                });
            } else {
                const matchWpm = lastMatch.wpm || 20;
                const matchAcc = (typeof lastMatch.score === 'number' && lastMatch.score > 0) ? 85 : 0;
                sessions.push({ acc: matchAcc, wpm: matchWpm, ts: 1 });
            }
        }
    } else {
        // Modalita Storico / Giornaliero: Unione completa tra stats.accuracySessions e historyMatches
        let sessionMap = new Map();

        // 1. Dallo storico partite Firebase
        if (allMatches.length > 0) {
            allMatches.forEach((m, idx) => {
                if (m) {
                    let acc = -1;
                    const detailsArr = m.details || m.matchDetails || [];
                    if (detailsArr.length > 0) {
                        const correctCount = detailsArr.filter(d => (d.real || "").toUpperCase() === (d.typed || "").toUpperCase() && !d.usedReplay).length;
                        acc = Math.round((correctCount / detailsArr.length) * 100);
                    } else if (typeof m.accuracy === 'number') {
                        acc = m.accuracy;
                    } else if (typeof m.score === 'number' && m.score >= 0) {
                        acc = 80;
                    }

                    const wpm = m.wpm || (detailsArr[0] ? detailsArr[0].wpm : 20);
                    const ts = getMatchTs(m) || (Date.now() + idx);

                    if (acc >= 0 && wpm > 0) {
                        sessionMap.set(`m_${idx}_${ts}`, { acc, wpm, ts });
                    }
                }
            });
        }

        // 2. Da stats.accuracySessions
        if (trendData && typeof trendData === 'object') {
            Object.values(trendData).forEach((s, sIdx) => {
                if (s) {
                    let acc = -1;
                    if (typeof s.acc === 'number') acc = s.acc;
                    else if (s.sum && s.total) acc = Math.round((s.sum / s.total) * 100);

                    let wpm = s.wpm || s.speed || 20;
                    let ts = s.ts || (Date.now() + sIdx);

                    if (acc >= 0 && acc <= 100) {
                        sessionMap.set(`s_${sIdx}_${ts}`, { acc, wpm, ts });
                    }
                }
            });
        }

        sessions = Array.from(sessionMap.values());

        // Filtro Giornaliero (Oggi)
        if (period === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0,0,0,0);
            const todayMs = todayStart.getTime();
            const todaySessions = sessions.filter(s => s.ts >= todayMs);
            if (todaySessions.length > 0) sessions = todaySessions;
        }

        sessions.sort((a,b) => (a.ts || 0) - (b.ts || 0));
        sessions = sessions.slice(-35);
    }

    const badgeAvgWpm = document.getElementById('badgeAvgWpm');
    const badgePeakWpm = document.getElementById('badgePeakWpm');
    const badgeAvgAcc = document.getElementById('badgeAvgAcc');
    const badgeWpmGrowth = document.getElementById('badgeWpmGrowth');

    if (sessions.length === 0) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#999";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Gioca più partite per vedere la progressione WPM ed accuratezza", width/2, height/2);

        if (badgeAvgWpm) badgeAvgWpm.textContent = "-- WPM";
        if (badgePeakWpm) badgePeakWpm.textContent = "-- WPM";
        if (badgeAvgAcc) badgeAvgAcc.textContent = "-- %";
        if (badgeWpmGrowth) badgeWpmGrowth.textContent = "-- WPM";
        return;
    }

    // Statistiche Summary Badges
    const totalWpmSum = sessions.reduce((s, x) => s + x.wpm, 0);
    const avgWpm = Math.round(totalWpmSum / sessions.length);
    const peakWpm = Math.max(...sessions.map(x => x.wpm));

    const totalAccSum = sessions.reduce((s, x) => s + x.acc, 0);
    const avgAcc = Math.round(totalAccSum / sessions.length);

    let growthStr = "0 WPM";
    if (sessions.length >= 4) {
        const half = Math.min(5, Math.floor(sessions.length / 2));
        const firstAvg = sessions.slice(0, half).reduce((s,x)=>s+x.wpm,0) / half;
        const lastAvg = sessions.slice(-half).reduce((s,x)=>s+x.wpm,0) / half;
        const diff = Math.round(lastAvg - firstAvg);
        growthStr = (diff >= 0 ? `+${diff}` : `${diff}`) + " WPM " + (diff > 0 ? "↗️" : (diff < 0 ? "↘️" : "➡️"));
    }

    if (badgeAvgWpm) badgeAvgWpm.textContent = `${avgWpm} WPM`;
    if (badgePeakWpm) badgePeakWpm.textContent = `${peakWpm} WPM`;
    if (badgeAvgAcc) badgeAvgAcc.textContent = `${avgAcc}%`;
    if (badgeWpmGrowth) badgeWpmGrowth.textContent = growthStr;

    if (sessions.length < 2) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#999";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Completa almeno 2 partite per tracciare il grafico", width/2, height/2);
        return;
    }

    // RENDERING GRAFICO DUAL-AXIS (Accuratezza % SX, WPM DX)
    const paddingLeft = 32;
    const paddingRight = 32;
    const paddingTop = 20;
    const paddingBottom = 25;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    ctx.clearRect(0, 0, width, height);

    const minWpm = Math.max(5, Math.min(...sessions.map(x => x.wpm)) - 5);
    const maxWpm = Math.max(minWpm + 15, Math.max(...sessions.map(x => x.wpm)) + 5);
    const wpmRange = maxWpm - minWpm;

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "9px sans-serif";

    for (let i = 0; i <= 4; i++) {
        const y = paddingTop + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();

        const accLabel = 100 - i * 25;
        ctx.textAlign = "right";
        ctx.fillText(`${accLabel}%`, paddingLeft - 4, y + 3);

        const wpmLabel = Math.round(maxWpm - (i / 4) * wpmRange);
        ctx.textAlign = "left";
        ctx.fillText(`${wpmLabel}`, width - paddingRight + 4, y + 3);
    }

    // LINEA 1: ACCURATEZZA % (BLU #1976d2)
    ctx.strokeStyle = "#1976d2";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.beginPath();

    sessions.forEach((s, i) => {
        const x = paddingLeft + (chartW / (sessions.length - 1)) * i;
        const y = paddingTop + chartH - (chartH * (s.acc / 100));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lastX = paddingLeft + chartW;
    ctx.lineTo(lastX, paddingTop + chartH);
    ctx.lineTo(paddingLeft, paddingTop + chartH);
    ctx.fillStyle = "rgba(25, 118, 210, 0.08)";
    ctx.fill();

    // LINEA 2: VELOCITA' WPM (ARANCIONE #ff9800)
    ctx.strokeStyle = "#ff9800";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.beginPath();

    sessions.forEach((s, i) => {
        const x = paddingLeft + (chartW / (sessions.length - 1)) * i;
        const yRatio = (s.wpm - minWpm) / wpmRange;
        const y = paddingTop + chartH - (chartH * yRatio);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // DENTI / PUNTI SUL GRAFICO
    sessions.forEach((s, i) => {
        const x = paddingLeft + (chartW / (sessions.length - 1)) * i;

        // Punto Accuratezza (Blu)
        const yAcc = paddingTop + chartH - (chartH * (s.acc / 100));
        ctx.fillStyle = "#1976d2";
        ctx.beginPath();
        ctx.arc(x, yAcc, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Punto WPM (Arancione)
        const yRatio = (s.wpm - minWpm) / wpmRange;
        const yWpm = paddingTop + chartH - (chartH * yRatio);
        ctx.fillStyle = "#ff9800";
        ctx.beginPath();
        ctx.arc(x, yWpm, 3.5, 0, Math.PI * 2);
        ctx.fill();
    });
};

window.renderGamePhaseAnalysis = function(historyMatches = []) {
    const container = document.getElementById('gamePhaseContainer');
    if (!container) return;

    const allowedModes = new Set(['standard', 'callsign', 'daily_challenge']);

    const filteredMatches = (Array.isArray(historyMatches) ? historyMatches : []).filter(m => {
        if (!m) return false;
        const mode = (m.mode || 'standard').toLowerCase();
        return allowedModes.has(mode);
    });

    if (filteredMatches.length === 0) {
        container.innerHTML = '<p style="font-size:0.75em; color:#888; text-align:center; margin:10px 0;">Gioca almeno 1 partita ufficiale (Parole Comuni, Nominativi o Sfida) per sbloccare l\'analisi delle fasi.</p>';
        return;
    }

    let phase1Acc = [], phase2Acc = [], phase3Acc = [];
    let phase1Wpm = [], phase2Wpm = [], phase3Wpm = [];

    filteredMatches.forEach(m => {
        const details = (m.details || m.matchDetails || []);
        if (details.length >= 3) {
            const len = details.length;
            const p1End = Math.floor(len / 3);
            const p2End = Math.floor((len * 2) / 3);

            const calcAcc = (arr) => {
                if (arr.length === 0) return 0;
                const correct = arr.filter(d => (d.real || "").toUpperCase() === (d.typed || "").toUpperCase() && !d.usedReplay).length;
                return Math.round((correct / arr.length) * 100);
            };

            const calcWpm = (arr) => {
                if (arr.length === 0) return 20;
                return Math.round(arr.reduce((s, x) => s + (x.wpm || m.wpm || 20), 0) / arr.length);
            };

            const arr1 = details.slice(0, p1End);
            const arr2 = details.slice(p1End, p2End);
            const arr3 = details.slice(p2End);

            if (arr1.length > 0) { phase1Acc.push(calcAcc(arr1)); phase1Wpm.push(calcWpm(arr1)); }
            if (arr2.length > 0) { phase2Acc.push(calcAcc(arr2)); phase2Wpm.push(calcWpm(arr2)); }
            if (arr3.length > 0) { phase3Acc.push(calcAcc(arr3)); phase3Wpm.push(calcWpm(arr3)); }
        }
    });

    if (phase1Acc.length === 0) {
        container.innerHTML = '<p style="font-size:0.75em; color:#888; text-align:center; margin:10px 0;">Completa partite di almeno 3 parole per sbloccare l\'analisi delle fasi.</p>';
        return;
    }

    const avgP1Acc = Math.round(phase1Acc.reduce((a,b)=>a+b,0) / phase1Acc.length);
    const avgP2Acc = Math.round(phase2Acc.reduce((a,b)=>a+b,0) / phase2Acc.length);
    const avgP3Acc = Math.round(phase3Acc.reduce((a,b)=>a+b,0) / phase3Acc.length);

    const avgP1Wpm = Math.round(phase1Wpm.reduce((a,b)=>a+b,0) / phase1Wpm.length);
    const avgP2Wpm = Math.round(phase2Wpm.reduce((a,b)=>a+b,0) / phase2Wpm.length);
    const avgP3Wpm = Math.round(phase3Wpm.reduce((a,b)=>a+b,0) / phase3Wpm.length);

    const dropOff = avgP1Acc - avgP3Acc;

    let adviceText = "🌟 Tenuta mentale eccellente! Nessun calo significativo di concentrazione.";
    let adviceColor = "#2e7d32";

    if (dropOff >= 8) {
        adviceText = `⚠️ Calo di tenuta nel finale (-${dropOff}% di accuratezza). Consiglio: fai brevi pause tra le sessioni per evitare l'affaticamento acustico.`;
        adviceColor = "#d32f2f";
    } else if (avgP2Acc < avgP1Acc - 6 && avgP2Acc < avgP3Acc - 6) {
        adviceText = "⚠️ Calo di ritmo nella fase intermedia. Mantieni un respiro costante durante i gruppi centrali.";
        adviceColor = "#f57f17";
    }

    const renderBar = (label, acc, wpm, icon) => {
        const color = acc >= 85 ? '#2e7d32' : (acc >= 70 ? '#f57f17' : '#d32f2f');
        return `
            <div style="display:flex; flex-direction:column; gap:2px; font-size:0.75em; color:#000;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:#333;">${icon} ${label}</span>
                    <span><strong style="color:${color};">${acc}% Acc</strong> | <strong style="color:#ff9800;">${wpm} WPM</strong></span>
                </div>
                <div style="width:100%; height:8px; background:rgba(0,0,0,0.08); border-radius:4px; overflow:hidden;">
                    <div style="width:${acc}%; height:100%; background:${color}; transition: width 0.5s ease-out;"></div>
                </div>
            </div>
        `;
    };

    container.innerHTML = `
        ${renderBar('Inizio Partita (0% - 33%)', avgP1Acc, avgP1Wpm, '🚀')}
        ${renderBar('Fase Intermedia (33% - 66%)', avgP2Acc, avgP2Wpm, '⚡')}
        ${renderBar('Finale Partita (66% - 100%)', avgP3Acc, avgP3Wpm, '🔥')}
        <div style="margin-top:6px; padding:6px 8px; background:#f0fdf4; border:1px solid ${adviceColor}; border-radius:6px; font-size:0.72em; color:${adviceColor}; font-weight:bold;">
            ${adviceText}
        </div>
    `;
};

window.showStatInfo = function(type) {
    const modal = document.getElementById('statInfoModal');
    const title = document.getElementById('statInfoTitle');
    const text = document.getElementById('statInfoText');
    if (!modal || !title || !text) return;

    const info = {
        trend: {
            t: "Andamento Accuratezza",
            m: "Mostra la tua precisione media giornaliera negli ultimi 30 giorni di gioco. Una linea che sale indica un miglioramento nel riconoscimento dei caratteri."
        },
        diagnostics: {
            t: "Diagnostica Operatore",
            m: "Analisi basata sulla lunghezza delle parole e sulla posizione degli errori. Ti aiuta a capire se hai difficoltà con le parole lunghe o se perdi la concentrazione a metà parola."
        },
        wpm_errors: {
            t: "Errori per Velocità",
            m: "Identifica a quale velocità (WPM) commetti più errori. Utile per trovare il tuo 'muro' attuale e su cosa lavorare per superarlo."
        },
        confusion: {
            t: "Matrice di Confusione",
            m: "Rivela quali caratteri il tuo cervello tende a scambiare tra loro. Ad esempio, se scambi spesso la 'S' (...) con la 'H' (....), indica una difficoltà nel conteggio rapido dei punti."
        },
        blocks: {
            t: "Blocchi Cognitivi",
            m: "Caratteri che hanno un'accuratezza inferiore all'85%. Sono i tuoi punti deboli 'fissi' che richiedono esercizio mirato."
        },
        ngrams: {
            t: "Analisi Sequenze (N-Grammi)",
            m: "Le coppie, triple e quadruple mostrano sequenze di caratteri in cui il tuo ritmo di ricezione si spezza. Spesso l'errore non è sulla lettera, ma sul 'legame' tra esse."
        },
        targeted: {
            t: "Focus Miglioramento Mirato",
            m: "Confronta i risultati delle tue sessioni di Allenamento Mirato. Mostra se la tua precisione sui caratteri critici sta aumentando rispetto alle partite passate."
        }
    };

    const d = info[type] || { t: "Informazione", m: "Dettagli non disponibili." };
    title.textContent = d.t;
    text.textContent = d.m;
    modal.style.display = 'flex';
};

function showProfileScreen() {
    window.showScreen('profileScreen');
    if (typeof window.switchProfileTab === 'function') {
        window.switchProfileTab('info');
    }

    if (els.userAliasInput) els.userAliasInput.value = window.myName || "";

    if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = window.myPrivacy ?? true;
    if (els.privacyOnlineCheckbox) els.privacyOnlineCheckbox.checked = window.myPrivacyOnline ?? false;
    if (els.privacyLeaderboardCheckbox) els.privacyLeaderboardCheckbox.checked = window.myPrivacyLeaderboard ?? false;
    if (els.pushNotificationsCheckbox) els.pushNotificationsCheckbox.checked = window.myPushNotifs ?? true;

    if (typeof window.updatePushBtnUI === 'function') {
        window.updatePushBtnUI(document.getElementById('pushNotifBtn'));
    }
}
window.showProfileScreen = showProfileScreen;

window.openMatchDetails = function(matchKey) {
    if (!window.userMatchHistory) return;
    const match = window.userMatchHistory.find(m => m.key === matchKey);
    if (!match || !els.matchDetailsBody || !els.matchDetailsModal) return;

    els.matchDetailsBody.innerHTML = '';
    const h3 = els.matchDetailsModal.querySelector('h3');
    if (h3) h3.textContent = `Dettagli Match - ${match.mode.toUpperCase()}`;

    const frag = document.createDocumentFragment();
    (match.details || []).forEach(row => {
        const tr = document.createElement('tr');
        const isCorrect = (row.real === row.typed);
        let color = row.points > 0 ? "#4caf50" : (!isCorrect ? "#d32f2f" : "#999999");

        const tdTyped = document.createElement('td'); tdTyped.textContent = row.typed || '-';
        const tdReal = document.createElement('td');

        if (typeof window.renderDiffSecure === 'function') {
            window.renderDiffSecure(tdReal, row.real, row.typed || '');
        } else {
            const bReal = document.createElement('b'); bReal.textContent = row.real; tdReal.appendChild(bReal);
        }

        const tdWpm = document.createElement('td');
        tdWpm.style.textAlign = 'center';
        tdWpm.style.fontWeight = 'bold';
        tdWpm.style.color = '#ff9800';
        tdWpm.style.fontSize = '0.85em';
        tdWpm.textContent = `${row.wpm || match.wpm || 20} WPM`;

        const tdActions = document.createElement('td');
        tdActions.style.textAlign = 'center';

        const ptsSpan = document.createElement('span');
        ptsSpan.style.color = color;
        ptsSpan.style.fontWeight = 'bold';
        ptsSpan.style.display = 'block';
        ptsSpan.textContent = row.points > 0 ? `+${row.points}` : row.points;
        tdActions.appendChild(ptsSpan);

        tr.appendChild(tdTyped);
        tr.appendChild(tdReal);
        tr.appendChild(tdWpm);
        tr.appendChild(tdActions);

        if (!isCorrect) {
            const replayBtn = document.createElement('button');
            replayBtn.className = 'action-btn-small btn-secondary';
            replayBtn.style.padding = '2px 6px';
            replayBtn.style.marginTop = '2px';
            replayBtn.style.width = 'auto';
            replayBtn.innerHTML = '🔊';
            const replayWpm = row.wpm || match.wpm || 20;
            replayBtn.onclick = () => window.playMorseAudio(row.real, replayWpm, true);
            tdActions.appendChild(replayBtn);
        }

        tr.appendChild(tdTyped); tr.appendChild(tdReal); tr.appendChild(tdActions);
        frag.appendChild(tr);
    });

    els.matchDetailsBody.appendChild(frag);
    els.matchDetailsModal.style.display = 'flex';
};

window.deleteHistoryItem = function(key) {
    if (confirm("Eliminare questa partita?")) {
        db.ref(`users/${myId}/history/${key}`).remove().then(() => window.loadProfileInfo());
    }
};

window.syncUserNameEverywhere = async function(userId, newName, newUsername, privLb = false) {
    // 1. Presenza
    await db.ref(`presence/${userId}`).update({
        name: newName,
        username: newUsername,
        privacyLeaderboard: privLb
    });

    if (window.roomCode) {
        await db.ref(`rooms/${window.roomCode}/players/${userId}`).update({ name: newName, username: newUsername });
    }

    // 5. Leaderboard
    await window.updateUserInAllLeaderboards(newName, newUsername, privLb);

    // 6. Tornei
    if (window.activeTrnId) {
        try {
            const trnSnap = await db.ref(`tournaments/${window.activeTrnId}/matches`).once('value');
            if (trnSnap.exists()) {
                const matches = trnSnap.val();
                const updates = {};
                for (const mId in matches) {
                    const match = matches[mId];
                    if (match.playerA && match.playerA.id === userId) updates[`${mId}/playerA/name`] = newName;
                    if (match.playerB && match.playerB.id === userId) updates[`${mId}/playerB/name`] = newName;
                }
                if (Object.keys(updates).length > 0) {
                    await db.ref(`tournaments/${window.activeTrnId}/matches`).update(updates);
                }
            }
        } catch(e) { console.error("Trn Sync Error:", e); }
    }
};

window.updateUserInAllLeaderboards = async function(newName, newUsername, privLb = false) {
    console.log("Privacy: Updating all leaderboard entries for user...");
    const updates = { name: newName, username: newUsername, privacyLeaderboard: privLb };

    const fixedPaths = [
        `leaderboard/callsign/global/${myId}`,
        `leaderboard/arcade/all/${myId}`,
        `leaderboard/arcade/global/${myId}`,
        `leaderboard/la_torre/all/${myId}`
    ];

    const today = new Date().toISOString().split('T')[0];
    fixedPaths.push(`leaderboard/daily_challenge/${today}/${myId}`);

    for (const path of fixedPaths) {
        db.ref(path).once('value').then(snap => {
            if (snap.exists()) db.ref(path).update(updates);
        }).catch(()=> {});
    }

    const categories = ['standard', 'chars', 'quiz', 'pingpong'];
    for (const cat of categories) {
        db.ref(`leaderboard/${cat}`).once('value').then(catSnap => {
            if (catSnap.exists()) {
                catSnap.forEach(subNode => {
                    if (subNode.hasChild(myId)) {
                        subNode.child(myId).ref.update(updates);
                    }
                });
            }
        }).catch(e => console.warn(`Clean LB ${cat} error:`, e));
    }
};

// --- LOGICA SALVATAGGIO ERRORI AVANZATI OTTIMIZZATA ---

window.trackAdvancedErrors = function(realWord, userWord, wpm) {
    if (!myId || !realWord) return;

    const realWords = realWord.toUpperCase().split(' ').filter(w => w.length > 0);
    const typedWords = userWord.toUpperCase().split(' ').filter(w => w.length > 0);
    const statsBase = db.ref(`users/${myId}/stats`);
    const today = new Date().toISOString().split('T')[0];

    realWords.forEach((real, wordIdx) => {
        const typed = typedWords[wordIdx] || "";
        const isWordError = (real !== typed);
        const len = real.length;

        statsBase.child(`lengthStats/${len}/total`).set(firebase.database.ServerValue.increment(1));

        for (let char of real) {
            let dbChar = (typeof window.firebaseEscape === 'function') ? window.firebaseEscape(char) : char.replace(/\./g, '_dot_');
            statsBase.child(`charStats/${dbChar}/attempts`).set(firebase.database.ServerValue.increment(1));
        }

        if (isWordError) {
            statsBase.child(`lengthStats/${len}/errors`).set(firebase.database.ServerValue.increment(1));

            for (let i = 0; i < real.length; i++) {
                if (real[i] !== typed[i]) {
                    const pos = i / (real.length - 1 || 1);
                    statsBase.child(`positionalErrors/totalErrors`).set(firebase.database.ServerValue.increment(1));
                    if (pos <= 0.33) statsBase.child(`positionalErrors/start`).set(firebase.database.ServerValue.increment(1));
                    else if (pos >= 0.66) statsBase.child(`positionalErrors/end`).set(firebase.database.ServerValue.increment(1));
                    else statsBase.child(`positionalErrors/mid`).set(firebase.database.ServerValue.increment(1));

                    const realChar = real[i];
                    const typedChar = typed[i] || "OMESSO";
                    const safeKey = (char) => {
                        if (char === ' ') return "SPACE";
                        if (typeof window.firebaseEscape === 'function') return window.firebaseEscape(char);
                        return char.replace(/\./g, '_dot_').replace(/#/g, '_hash_').replace(/\$/g, '_dollar_').replace(/\[/g, '_lbrac_').replace(/\]/g, '_rbrac_');
                    };
                    let dbReal = safeKey(realChar);
                    let dbTyped = safeKey(typedChar);
                    statsBase.child(`charStats/${dbReal}/errors`).set(firebase.database.ServerValue.increment(1));
                    statsBase.child(`confusionMatrix/${dbReal}->${dbTyped}`).set(firebase.database.ServerValue.increment(1));
                    statsBase.child(`errorsByWpm/${wpm}/${dbReal}`).set(firebase.database.ServerValue.increment(1));
                }
            }

            statsBase.child(`wordErrors/${real}`).transaction(data => {
                if (!data) return { count: 1, avgWpm: wpm };
                const oldCount = data.count || (typeof data === 'number' ? data : 0);
                const oldWpm = data.avgWpm || wpm;
                const newCount = oldCount + 1;
                return { count: newCount, avgWpm: Math.round(((oldWpm * oldCount) + wpm) / newCount) };
            });
        }

        // N-Grammi (Bigrammi, Trigrammi, Quadrigrammi)
        const processNGram = (n, nodeName) => {
            for (let i = 0; i <= real.length - n; i++) {
                const subReal = real.substring(i, i + n);
                const subTyped = typed.substring(i, i + n);
                if (subReal !== subTyped) {
                    statsBase.child(`${nodeName}/${subReal}`).transaction(data => {
                        if (!data) return { count: 1, avgWpm: wpm };
                        const oldCount = data.count || (typeof data === 'number' ? data : 0);
                        const oldWpm = data.avgWpm || wpm;
                        return { count: oldCount + 1, avgWpm: Math.round(((oldWpm * oldCount) + wpm) / (oldCount + 1)) };
                    });
                }
            }
        };

        processNGram(2, 'bigramErrors');
        processNGram(3, 'trigramErrors');
        processNGram(4, 'quadgramErrors');
    });
};

// --- AZIONI PULSANTI ---

if (els.saveAliasBtn) {
    els.saveAliasBtn.addEventListener('click', async () => {
        const alias = els.userAliasInput ? els.userAliasInput.value.trim() : "";
        const privacy = els.privacyUsernameCheckbox ? els.privacyUsernameCheckbox.checked : true;
        const privacyOnline = els.privacyOnlineCheckbox ? els.privacyOnlineCheckbox.checked : false;
        const privacyLeaderboard = els.privacyLeaderboardCheckbox ? els.privacyLeaderboardCheckbox.checked : false;
        const pushNotifs = els.pushNotificationsCheckbox ? els.pushNotificationsCheckbox.checked : true;

        if (alias) {
            const isValid = (typeof window.isNameValid === 'function') ? window.isNameValid(alias) : true;
            if (!isValid) return alert("L'Alias non è valido. Deve contenere almeno 2 caratteri di testo e massimo 1 icona.");
            if (alias.length > 15) return alert("L'Alias non può superare i 15 caratteri.");
        }

        if (privacy && !alias) return alert("L'Alias è obbligatorio se nascondi lo username Telegram!");

        const newName = alias || (window.tgUser ? window.tgUser.first_name : "Operatore");
        const currentUsername = privacy ? "" : window.tgUsername;

        try {
            await db.ref(`users/${window.myId}`).update({
                alias: alias || null,
                privacyUsername: privacy,
                privacyOnline: privacyOnline,
                privacyLeaderboard: privacyLeaderboard,
                pushNotifications: pushNotifs
            });

            window.myName = newName;
            window.myPrivacy = privacy;
            window.myPrivacyOnline = privacyOnline;
            window.myPrivacyLeaderboard = privacyLeaderboard;
            window.myPushNotifs = pushNotifs;
            if (typeof STORAGE_PUSH_NOTIFS_KEY !== 'undefined') localStorage.setItem(STORAGE_PUSH_NOTIFS_KEY, pushNotifs);
            else localStorage.setItem("cwgame_push_notifs", pushNotifs);

            if (els.playerName) els.playerName.textContent = window.myName;
            showToast("Profilo aggiornato!");

            await window.syncUserNameEverywhere(window.myId, newName, currentUsername, privacyLeaderboard);
        } catch(e) {
            alert("Errore durante il salvataggio: " + e.message);
        }
    });
}

if (document.getElementById('resetStatsBtn')) {
    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
        if (confirm("Vuoi azzerare tutte le tue statistiche?")) {
            try {
                await Promise.all([ db.ref(`users/${myId}/stats`).remove(), db.ref(`users/${myId}/history`).remove() ]);
                showToast("Dati azzerati!");
                window.loadProfileInfo();
            } catch(e) { alert("Errore."); }
        }
    });
}

const btnResetErrorStats = document.getElementById('btnResetErrorStats');
if (btnResetErrorStats) {
    btnResetErrorStats.addEventListener('click', () => {
        if (confirm("Vuoi azzerare TUTTI i dati analitici degli errori? Lo storico rimarrà intatto.")) {
            db.ref(`users/${myId}/stats`).remove().then(() => {
                showToast("Dati errori azzerati!");
                window.loadAdvancedStats();
            });
        }
    });
}

const btnCreateErrorDict = document.getElementById('btnCreateErrorDict');
if (btnCreateErrorDict) {
    btnCreateErrorDict.addEventListener('click', () => {
        db.ref(`users/${myId}/stats/wordErrors`).once('value', snap => {
            const words = snap.val() || {};
            const wordTh = parseInt(document.getElementById('wordThresholdInput')?.value) || 3;
            const critical = Object.entries(words)
                .filter(e => {
                    const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
                    return count >= wordTh;
                })
                .map(e => e[0]);

            if (critical.length === 0) return showToast(`Non hai ancora abbastanza parole critiche (min. ${wordTh} errori).`);

            window.customDictionary = critical;
            localStorage.setItem(window.STORAGE_CUSTOM_DICT_KEY || 'customDict', JSON.stringify(critical));
            showToast(`✅ Creato dizionario con ${critical.length} parole difficili!`);
            window.showScreen('setupScreen');
            if (els.gameTypeInput) els.gameTypeInput.value = 'single';
            if (els.gameModeInput) {
                els.gameModeInput.value = 'custom';
                if (typeof window.checkGameTypeUI === 'function') window.checkGameTypeUI();
            }
        });
    });
}

if (els.deleteDataBtn) {
    els.deleteDataBtn.onclick = async () => {
        if (!confirm("ATTENZIONE: Questa azione eliminerà DEFINITIVAMENTE tutto il tuo profilo.\nVuoi procedere?")) return;
        if (!confirm("CONFERMA FINALE: Sei assolutamente sicuro? Tutti i record in classifica verranno rimossi.")) return;

        showToast("Eliminazione dati in corso...");

        try {
            const now = new Date();
            const dKey = now.toISOString().split('T')[0];
            const wKey = window.getWeekNumber(now);
            const mKey = now.getFullYear() + "-" + (now.getMonth() + 1).toString().padStart(2, '0');
            const firebaseUid = firebase.auth().currentUser?.uid;

            const safeRemove = (ref) => ref.remove().catch(e => console.warn("Safe remove note:", e));

            // 1. Pulizia Classifiche e Leaderboard (Mentre uid_mapping e attivo)
            const categories = ['standard', 'chars', 'quiz', 'pingpong', 'callsign', 'arcade', 'la_torre'];
            for (const cat of categories) {
                try {
                    const catSnap = await db.ref(`leaderboard/${cat}`).once('value');
                    if (catSnap.exists()) {
                        catSnap.forEach(subNode => {
                            if (subNode.hasChild(window.myId)) {
                                safeRemove(subNode.child(window.myId).ref);
                            }
                        });
                    }
                } catch(e) {}
            }

            // 2. Pulizia Richieste Tutor
            try {
                const tutorReqSnap = await db.ref('tutorRequests').once('value');
                if (tutorReqSnap.exists()) {
                    tutorReqSnap.forEach(child => {
                        if (child.val() && child.val().uid === window.myId) {
                            safeRemove(child.ref);
                        }
                    });
                }
            } catch(e) {}

            // 3. Gestione Squadra
            if (window.myTeamId) {
                try {
                    const teamRef = db.ref(`teams/${window.myTeamId}`);
                    const teamSnap = await teamRef.once('value');
                    if (teamSnap.exists()) {
                        const team = teamSnap.val();
                        const members = team.members || {};
                        const memberIds = Object.keys(members).filter(id => id !== window.myId);

                        if (memberIds.length === 0) {
                            safeRemove(teamRef);
                        } else if (team.captainId === window.myId) {
                            teamRef.update({ captainId: memberIds[0] }).catch(() => {});
                            safeRemove(teamRef.child(`members/${window.myId}`));
                        } else {
                            safeRemove(teamRef.child(`members/${window.myId}`));
                        }
                    }
                } catch(e) {}
            }

            // 4. Rimozione Dati Utente Principali (Mentre uid_mapping e ancora attivo!)
            await Promise.all([
                safeRemove(db.ref(`users/${window.myId}`)),
                safeRemove(db.ref(`presence/${window.myId}`)),
                safeRemove(db.ref(`courseActiveEnrollments/${window.myId}`)),
                safeRemove(db.ref(`activity/daily/${dKey}/${window.myId}`)),
                safeRemove(db.ref(`activity/weekly/${wKey}/${window.myId}`)),
                safeRemove(db.ref(`activity/monthly/${mKey}/${window.myId}`)),
                safeRemove(db.ref(`invites/${window.myId}`)),
                safeRemove(db.ref(`invite_accepted/${window.myId}`))
            ]);

            // 5. Rimozione uid_mapping SOLTANTO COME ULTIMISSIMO PASSAGGIO!
            if (firebaseUid) {
                await safeRemove(db.ref(`uid_mapping/${firebaseUid}`));
            }

            showToast("Profilo eliminato con successo.");

            localStorage.clear();
            setTimeout(() => {
                if (window.tg && typeof window.tg.close === 'function') window.tg.close();
                else location.reload();
            }, 1500);

        } catch (e) {
            console.error("Delete Data Error:", e);
            alert("Errore durante l'eliminazione: " + e.message);
        }
    };
}
        }
    };
}

/**
 * LOGICA INFO STATISTICHE (TOOLTIPS)
 */
window.showStatInfo = function(type) {
    const modal = document.getElementById('statInfoModal');
    const title = document.getElementById('statInfoTitle');
    const text = document.getElementById('statInfoText');
    if (!modal || !title || !text) return;

    const info = {
        trend: {
            t: "Andamento Accuratezza",
            m: "Mostra la tua precisione media giornaliera negli ultimi 30 giorni di gioco. Una linea che sale indica un miglioramento nel riconoscimento dei caratteri."
        },
        diagnostics: {
            t: "Diagnostica Operatore",
            m: "Analisi basata sulla lunghezza delle parole e sulla posizione degli errori. Ti aiuta a capire se hai difficoltà con le parole lunghe o se perdi la concentrazione a metà parola."
        },
        wpm_errors: {
            t: "Errori per Velocità",
            m: "Identifica a quale velocità (WPM) commetti più errori. Utile per trovare il tuo 'muro' attuale e su cosa lavorare per superarlo."
        },
        confusion: {
            t: "Matrice di Confusione",
            m: "Rivela quali caratteri il tuo cervello tende a scambiare tra loro. Ad esempio, se scambi spesso la 'S' (...) con la 'H' (....), indica una difficoltà nel conteggio rapido dei punti."
        },
        blocks: {
            t: "Blocchi Cognitivi",
            m: "Caratteri che hanno un'accuratezza inferiore all'85%. Sono i tuoi punti deboli 'fissi' che richiedono esercizio mirato."
        },
        ngrams: {
            t: "Analisi Sequenze (N-Grammi)",
            m: "Le coppie, triple e quadruple mostrano sequenze di caratteri in cui il tuo ritmo di ricezione si spezza. Spesso l'errore non è sulla lettera, ma sul 'legame' tra esse."
        },
        targeted: {
            t: "Focus Miglioramento Mirato",
            m: "Confronta i risultati delle tue sessioni di Allenamento Mirato. Mostra se la tua precisione sui caratteri critici sta aumentando rispetto alle partite passate."
        }
    };

    const d = info[type] || { t: "Informazione", m: "Dettagli non disponibili." };
};

/**
 * TRACCIAMENTO ACCURATEZZA SESSIONE (Chiamata da game_core.js a fine partita)
 */
window.trackSessionAccuracy = function(matchDetails) {
    if (!myId || !matchDetails || matchDetails.length === 0) return;

    // Calcolo accuratezza REALE: solo parole identiche al 100% e senza aiuto (replay)
    const correctCount = matchDetails.filter(m => {
        // Se abbiamo il flag 'correct' salvato da game_core usiamolo,
        // altrimenti fallback sulla comparazione stringhe (più lenta ma sicura)
        if (m.hasOwnProperty('correct')) return m.correct;
        return (m.real || "").toUpperCase() === (m.typed || "").toUpperCase() && !m.usedReplay;
    }).length;

    const accuracy = Math.round((correctCount / matchDetails.length) * 100);

    const sessionsRef = db.ref(`users/${myId}/stats/accuracySessions`);

    const activeWpmVal = window.currentWpm || (matchDetails[0] ? matchDetails[0].wpm : 20);

    // Aggiungiamo la nuova sessione con Accuratezza % e Velocita WPM
    sessionsRef.push({
        ts: firebase.database.ServerValue.TIMESTAMP,
        acc: accuracy,
        wpm: activeWpmVal
    }).then(() => {
        // Pulizia: manteniamo solo le ultime 50 sessioni nel DB
        sessionsRef.once('value', snap => {
            if (snap.numChildren() > 60) { // Margine di 10 per non cancellare ad ogni partita
                let count = 0;
                const total = snap.numChildren();
                const toDelete = total - 50;
                snap.forEach(child => {
                    if (count < toDelete) child.ref.remove();
                    count++;
                });
            }
        });
    });
};

/**
 * TRACCIAMENTO SESSIONE MIRATA (CHIAMATA DA GAME_CORE)
 */
window.trackTargetedTrainingSession = function(matchDetails) {
    if (!matchDetails || matchDetails.length === 0) return;

    let charStats = {};
    matchDetails.forEach(m => {
        const real = m.real.toUpperCase();
        const typed = m.typed.toUpperCase();
        for (let i = 0; i < real.length; i++) {
            const c = real[i];
            if (!charStats[c]) charStats[c] = { attempts: 0, errors: 0 };
            charStats[c].attempts++;
            if (real[i] !== typed[i]) charStats[c].errors++;
        }
    });

    const sessionAccuracy = matchDetails.filter(m => {
        if (m.hasOwnProperty('correct')) return m.correct;
        return (m.real || "").toUpperCase() === (m.typed || "").toUpperCase() && !m.usedReplay;
    }).length / matchDetails.length;

    db.ref(`users/${myId}/stats/targetedHistory`).push({
        ts: firebase.database.ServerValue.TIMESTAMP,
        accuracy: sessionAccuracy,
        charStats: charStats
    });
};

/**
 * RENDERING MIGLIORAMENTO MIRATO
 */
window.renderTargetedImprovement = function(stats) {
    const panel = document.getElementById('targetedImprovementPanel');
    const content = document.getElementById('targetedImprovementContent');
    if (!panel || !content) return;

    const history = stats.targetedHistory || {};
    const sessions = Object.values(history).sort((a,b) => a.ts - b.ts);

    if (sessions.length < 2) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex';
    const last = sessions[sessions.length - 1];
    const prev = sessions[sessions.length - 2];

    const diff = (last.accuracy - prev.accuracy) * 100;
    const color = diff >= 0 ? "#4caf50" : "#d32f2f";
    const arrow = diff >= 0 ? "▲" : "▼";

    let html = `
        <div style="font-size:1.2em; font-weight:bold; color:${color}; margin-bottom:10px;">
            ${arrow} ${Math.abs(Math.round(diff))}% <small>rispetto a ultima sessione</small>
        </div>
        <div style="text-align:left; border-top:1px solid rgba(0,0,0,0.05); padding-top:10px;">
            <b style="font-size:0.8em; color:var(--hint-color); text-transform:uppercase;">Top Progressi Caratteri:</b>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:5px;">
    `;

    // Calcoliamo miglioramento sui singoli caratteri
    let charDiffs = [];
    Object.keys(last.charStats).forEach(c => {
        if (prev.charStats[c]) {
            const lastAcc = (last.charStats[c].attempts - last.charStats[c].errors) / last.charStats[c].attempts;
            const prevAcc = (prev.charStats[c].attempts - prev.charStats[c].errors) / prev.charStats[c].attempts;
            const d = (lastAcc - prevAcc) * 100;
            if (Math.abs(d) > 1) charDiffs.push({ char: c, diff: d });
        }
    });

    charDiffs.sort((a,b) => b.diff - a.diff).slice(0, 5).forEach(cd => {
        const cColor = cd.diff > 0 ? "#4caf50" : "#d32f2f";
        html += `<span style="background:rgba(0,0,0,0.03); padding:4px 8px; border-radius:4px; font-size:0.9em;">
            <b>${cd.char}</b>: <span style="color:${cColor}; font-weight:bold;">${cd.diff > 0 ? '+' : ''}${Math.round(cd.diff)}%</span>
        </span>`;
    });

    if (charDiffs.length === 0) html += `<small style="color:var(--hint-color);">Dati insufficienti per il dettaglio caratteri.</small>`;

    html += `</div></div>`;
    content.innerHTML = html;
};

/**
 * RENDERING TABELLE N-GRAMMI
 */
window.renderNGramTable = function(dataNode, container, threshold) {
    if (!container) return;
    container.innerHTML = '';
    const items = dataNode || {};
    const filtered = Object.entries(items).filter(e => {
        const count = e[1].count || (typeof e[1] === 'number' ? e[1] : 0);
        return count >= threshold;
    }).sort((a,b) => (b[1].count || b[1]) - (a[1].count || a[1])).slice(0, 15);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--hint-color); font-size:0.7em; margin-top:10px;">Dati in raccolta...</p>';
        return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(([seq, data]) => {
        const count = data.count || data;
        const avgWpm = data.avgWpm || 20;
        const div = document.createElement('div');
        div.className = 'leaderboard-row';
        div.style.cssText = "padding:6px; margin-bottom:4px; font-size:0.8em; flex-direction:column; align-items:flex-start; background: rgba(0,0,0,0.03); color: var(--text-color); border-radius:6px; border:none;";
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                <span><b style="color: #d32f2f; font-family: monospace; font-size: 1.1em;">${seq}</b> <small style="color: var(--hint-color);">(${count})</small></span>
                <button class="action-btn-small btn-secondary" onclick="window.playMorseAudio('${seq}', ${avgWpm}, true)" style="width:30px; padding:3px 0; font-size:0.8em; border-radius:50%;">🔊</button>
            </div>
        `;
        frag.appendChild(div);
    });
    container.appendChild(frag);
};

// --- LISTENERS SOGLIE ANALISI ---
['bigramThresholdInput', 'trigramThresholdInput', 'quadgramThresholdInput', 'wordThresholdInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => window.loadAdvancedStats());
        el.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.target.blur(); window.loadAdvancedStats(); } });
    }
});
