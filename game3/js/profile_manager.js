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

    if (!myId) return;

    db.ref(`users/${myId}/history`).orderByChild('date').limitToLast(10).once('value').then(snap => {
        listContainer.innerHTML = '';
        window.userMatchHistory = [];

        snap.forEach(child => { window.userMatchHistory.push({ key: child.key, ...child.val() }); });
        window.userMatchHistory.reverse();

        if (window.userMatchHistory.length === 0) {
            listContainer.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna partita.</li>';
            return;
        }

        const frag = document.createDocumentFragment();
        window.userMatchHistory.forEach(match => {
            const d = new Date(match.date || Date.now());
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
                    <span><b>${match.score} pt</b> <small>(${match.wpm} WPM)</small></span>
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
        listContainer.innerHTML = '<li style="justify-content:center; color:red;">Errore caricamento.</li>';
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

    db.ref(`users/${myId}/stats`).once('value').then(snap => {
        const stats = snap.val() || {};

        // 0. GRAFICO TREND (Sessioni)
        window.renderAccuracyTrend(stats.accuracySessions || {});

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

window.renderAccuracyTrend = function(trendData) {
    const canvas = document.getElementById('accuracyTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Setup canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const entries = Object.entries(trendData).sort((a,b) => a[0].localeCompare(b[0])).slice(-30);
    if (entries.length < 2) {
        ctx.fillStyle = "#999";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Gioca più partite per vedere il grafico", width/2, height/2);
        return;
    }

    const points = entries.map(e => (e[1].sum / e[1].total) * 100);
    const padding = 20;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
    }

    // Line
    ctx.strokeStyle = "var(--link-color)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();

    points.forEach((p, i) => {
        const x = padding + (chartW / (points.length - 1)) * i;
        const y = padding + chartH - (chartH * (p / 100));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Area
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.lineTo(padding, padding + chartH);
    ctx.fillStyle = "rgba(51, 144, 236, 0.1)";
    ctx.fill();

    // Dots
    ctx.fillStyle = "var(--link-color)";
    points.forEach((p, i) => {
        const x = padding + (chartW / (points.length - 1)) * i;
        const y = padding + chartH - (chartH * (p / 100));
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
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

window.showProfileScreen = function() {
    window.showScreen('profileScreen');
    window.switchProfileTab('info');

    if (els.userAliasInput) els.userAliasInput.value = window.myName || "";

    if (els.privacyUsernameCheckbox) els.privacyUsernameCheckbox.checked = window.myPrivacy ?? true;
    if (els.privacyOnlineCheckbox) els.privacyOnlineCheckbox.checked = window.myPrivacyOnline ?? false;
    if (els.privacyLeaderboardCheckbox) els.privacyLeaderboardCheckbox.checked = window.myPrivacyLeaderboard ?? false;
    if (els.pushNotificationsCheckbox) els.pushNotificationsCheckbox.checked = window.myPushNotifs ?? true;

    if (typeof window.updatePushBtnUI === 'function') {
        window.updatePushBtnUI(document.getElementById('pushNotifBtn'));
    }
};

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

        const tdActions = document.createElement('td');
        tdActions.style.textAlign = 'center';

        const ptsSpan = document.createElement('span');
        ptsSpan.style.color = color;
        ptsSpan.style.fontWeight = 'bold';
        ptsSpan.style.display = 'block';
        ptsSpan.textContent = row.points;
        tdActions.appendChild(ptsSpan);

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

            // Raggruppamento delle rimozioni dirette per velocizzare
            const deletePromises = [
                db.ref(`users/${window.myId}`).remove(),
                db.ref(`presence/${window.myId}`).remove(),
                db.ref(`courseActiveEnrollments/${window.myId}`).remove(),
                db.ref(`activity/daily/${dKey}/${window.myId}`).remove(),
                db.ref(`activity/weekly/${wKey}/${window.myId}`).remove(),
                db.ref(`activity/monthly/${mKey}/${window.myId}`).remove(),
                db.ref(`invites/${window.myId}`).remove(),
                db.ref(`invite_accepted/${window.myId}`).remove(),
                db.ref(`leaderboard/callsign/global/${window.myId}`).remove(),
                db.ref(`leaderboard/arcade/all/${window.myId}`).remove(),
                db.ref(`leaderboard/arcade/global/${window.myId}`).remove()
            ];

            if (firebaseUid) deletePromises.push(db.ref(`uid_mapping/${firebaseUid}`).remove());

            // Aggiunta pulizia dalle leaderboard dinamiche
            const categories = ['standard', 'chars', 'quiz', 'pingpong'];
            for (const cat of categories) {
                const catSnap = await db.ref(`leaderboard/${cat}`).once('value');
                if (catSnap.exists()) {
                    catSnap.forEach(subNode => {
                        if (subNode.hasChild(window.myId)) deletePromises.push(subNode.child(window.myId).ref.remove());
                    });
                }
            }

            // Pulizia richieste Tutor
            const tutorReqSnap = await db.ref('tutorRequests').once('value');
            if (tutorReqSnap.exists()) {
                tutorReqSnap.forEach(child => {
                    if (child.val().uid === window.myId) deletePromises.push(child.ref.remove());
                });
            }

            // Gestione Squadra
            if (window.myTeamId) {
                const teamRef = db.ref(`teams/${window.myTeamId}`);
                const teamSnap = await teamRef.once('value');
                if (teamSnap.exists()) {
                    const team = teamSnap.val();
                    const members = team.members || {};
                    const memberIds = Object.keys(members).filter(id => id !== window.myId);

                    if (memberIds.length === 0) {
                        deletePromises.push(teamRef.remove());
                        const trnSnap = await db.ref('tournaments').once('value');
                        if (trnSnap.exists()) {
                            trnSnap.forEach(tSnap => {
                                deletePromises.push(db.ref(`tournaments/${tSnap.key}/teams/${window.myTeamId}`).remove());
                                deletePromises.push(db.ref(`tournaments/${tSnap.key}/standings/${window.myTeamId}`).remove());
                            });
                        }
                    } else if (team.captainId === window.myId) {
                        deletePromises.push(teamRef.update({ captainId: memberIds[0] }));
                        deletePromises.push(teamRef.child(`members/${window.myId}`).remove());
                    } else {
                        deletePromises.push(teamRef.child(`members/${window.myId}`).remove());
                    }
                }
            }

            // Attesa di tutte le rimozioni parallele
            await Promise.all(deletePromises);
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
    title.textContent = d.t;
    text.textContent = d.m;
    modal.style.display = 'flex';
};

/**
 * RENDERING GRAFICO TREND (CANVAS)
 */
window.renderAccuracyTrend = function(trendData) {
    const canvas = document.getElementById('accuracyTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Dimensioni CSS
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Setup risoluzione alta (DPR)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const entries = Object.entries(trendData).sort((a,b) => a[1].ts - b[1].ts).slice(-50);
    if (entries.length < 1) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#999";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Gioca una partita per vedere il grafico", width/2, height/2);
        return;
    }

    const points = entries.map(e => e[1].acc);
    const padding = 25;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    ctx.clearRect(0, 0, width, height);

    // Griglia Orizzontale
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();

        // Etichette %
        ctx.fillStyle = "#aaa";
        ctx.font = "8px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText((100 - i * 25) + "%", padding - 5, y + 3);
    }

    // Linea
    ctx.strokeStyle = "#3390ec";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();

    if (points.length === 1) {
        // Se c'è un solo punto, disegnamo una linea tratteggiata orizzontale
        ctx.setLineDash([5, 5]);
        const y = padding + chartH - (chartH * (points[0] / 100));
        ctx.moveTo(padding, y); ctx.lineTo(width - padding, y);
        ctx.stroke();
        ctx.setLineDash([]);
    } else {
        points.forEach((p, i) => {
            const x = padding + (chartW / (points.length - 1)) * i;
            const y = padding + chartH - (chartH * (p / 100));
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Area sfumata
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.lineTo(padding, padding + chartH);
    const grad = ctx.createLinearGradient(0, padding, 0, padding + chartH);
    grad.addColorStop(0, "rgba(51, 144, 236, 0.2)");
    grad.addColorStop(1, "rgba(51, 144, 236, 0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Punti (Dots)
    ctx.fillStyle = "#3390ec";
    points.forEach((p, i) => {
        const x = padding + (chartW / (points.length - 1)) * i;
        const y = padding + chartH - (chartH * (p / 100));
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
    });
};

/**
 * TRACCIAMENTO ACCURATEZZA SESSIONE (Chiamata da game_core.js a fine partita)
 */
window.trackSessionAccuracy = function(matchDetails) {
    if (!myId || !matchDetails || matchDetails.length === 0) return;

    const correctCount = matchDetails.filter(m => m.points > 0).length;
    const accuracy = Math.round((correctCount / matchDetails.length) * 100);

    const sessionsRef = db.ref(`users/${myId}/stats/accuracySessions`);

    // Aggiungiamo la nuova sessione
    sessionsRef.push({
        ts: firebase.database.ServerValue.TIMESTAMP,
        acc: accuracy
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

    const sessionAccuracy = matchDetails.filter(m => m.points > 0).length / matchDetails.length;

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
