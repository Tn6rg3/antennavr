// game4/js/app.js

window.GAME_MODES = {
    "standard": { id: "standard", titleIt: "Parole Comuni", titleEn: "Common Words", defaultWpm: 20, defaultWordCount: 10, wpmConfigurable: true, wordCountConfigurable: true, fixedSpeedAllowed: true, spacingConfigurable: true },
    "perfection": { id: "perfection", titleIt: "Perfezione (Zero Errori)", titleEn: "Perfection (Zero Errors)", defaultWpm: 20, defaultWordCount: 20, wpmConfigurable: true, wordCountConfigurable: true },
    "conquest": { id: "conquest", titleIt: "Conquista (Co-op) ⚔️", titleEn: "Conquest (Co-op) ⚔️", defaultWpm: 20, defaultWordCount: 50, wpmConfigurable: true, wordCountConfigurable: false },
    "callsign": { id: "callsign", titleIt: "Nominativi (CW Freak)", titleEn: "Callsigns (CW Freak)", defaultWpm: 25, defaultWordCount: 25, wpmConfigurable: false, wordCountConfigurable: false },
    "pingpong": { id: "pingpong", titleIt: "Ping Pong", titleEn: "Ping Pong", defaultWpm: 20, defaultWordCount: 10, wpmConfigurable: true, wordCountConfigurable: true },
    "quiz": { id: "quiz", titleIt: "Quiz", titleEn: "Quiz", defaultWpm: 20, defaultWordCount: 10, wpmConfigurable: true, wordCountConfigurable: true },
    "custom": { id: "custom", titleIt: "Personale", titleEn: "Personal", defaultWpm: 20, defaultWordCount: 10, wpmConfigurable: true, wordCountConfigurable: true },
    "arcade": { id: "arcade", titleIt: "Arcade 🕹️", titleEn: "Arcade 🕹️", defaultWpm: 20, defaultWordCount: 0, wpmConfigurable: false, wordCountConfigurable: false },
    "groups_tx": { id: "groups_tx", titleIt: "Trasmissione Gruppi", titleEn: "Groups Transmission", defaultWpm: 20, defaultWordCount: 4, wpmConfigurable: true, wordCountConfigurable: true }
};

window.populateGameModesUI = function() {
    const select = document.getElementById('gameModeInput');
    const typeInput = document.getElementById('gameTypeInput');
    if (!select || !typeInput) return;

    const isSingle = typeInput.value === 'single';
    const isMulti = typeInput.value === 'multi';
    const isCoop = typeInput.value === 'coop';
    const isTx = typeInput.value === 'transmission';
    const lang = window.currentLang;
    const currentVal = select.value || 'standard';

    select.innerHTML = '';

    Object.values(window.GAME_MODES).forEach(mode => {
        if (isSingle) {
            if (mode.id === 'pingpong' || mode.id === 'conquest' || mode.id === 'arcade') return;
        } else if (isMulti) {
            if (mode.id === 'perfection' || mode.id === 'conquest' || mode.id === 'arcade') return;
        } else if (isCoop) {
            if (mode.id !== 'conquest') return;
        } else if (isTx) {
            if (mode.id !== 'standard' && mode.id !== 'groups_tx') return;
        } else {
            if (typeInput.value === 'arcade' && mode.id !== 'arcade') return;
        }

        const opt = document.createElement('option');
        opt.value = mode.id;
        if (isTx) {
            opt.textContent = lang === 'it' ? (mode.id === 'standard' ? "Esercizio Singolo (Koch)" : "Trasmissione Gruppi") : (mode.id === 'standard' ? "Single Exercise (Koch)" : "Groups Transmission");
        } else {
            opt.textContent = lang === 'it' ? mode.titleIt : mode.titleEn;
        }
        select.appendChild(opt);
    });
    select.value = window.GAME_MODES[currentVal] ? currentVal : 'standard';
};

window.checkGameTypeUI = function() {
    const typeInput = document.getElementById('gameTypeInput');
    const modeInput = document.getElementById('gameModeInput');
    if (!typeInput || !modeInput) return;

    const isTrn = typeInput.value === 'tournament';
    const isCoop = typeInput.value === 'coop';
    const isArcadeType = typeInput.value === 'arcade';

    if (isCoop) {
        modeInput.innerHTML = `<option value="conquest">${window.currentLang === 'it' ? "Conquista (Co-op) ⚔️" : "Conquest (Co-op) ⚔️"}</option>`;
        modeInput.value = "conquest";
    } else if (isArcadeType) {
        modeInput.innerHTML = `<option value="arcade">${window.currentLang === 'it' ? "Pioggia (Arcade) 🕹️" : "Rain (Arcade) 🕹️"}</option>`;
        modeInput.value = "arcade";
    } else if (isTrn) {
        const trnOptions = [
            { val: "trn_join_team", it: "Unisciti a Squadra", en: "Join Team" },
            { val: "trn_create_team", it: "Fonda Squadra", en: "Create Team" },
            { val: "trn_create_trn", it: "Crea Nuovo Torneo", en: "Create Tournament" }
        ];
        modeInput.innerHTML = trnOptions.map(o => `<option value="${o.val}">${window.currentLang === 'it' ? o.it : o.en}</option>`).join('');
        modeInput.value = "trn_join_team";
    } else {
        window.populateGameModesUI();
    }

    const startWpm = document.getElementById('startWpmInput');
    const wordCount = document.getElementById('wordCountInput');
    const createRoomBtn = document.getElementById('createRoomBtn');

    if (isArcadeType) {
        if (startWpm) { startWpm.disabled = true; startWpm.value = 20; }
        if (wordCount) wordCount.disabled = true;
    } else {
        const modeCfg = window.GAME_MODES[modeInput.value];
        if (modeCfg) {
            if (startWpm) {
                startWpm.disabled = modeCfg.wpmConfigurable === false;
                if (modeCfg.wpmConfigurable === false) startWpm.value = modeCfg.defaultWpm;
            }
            if (wordCount) {
                wordCount.disabled = modeCfg.wordCountConfigurable === false;
                if (modeCfg.wordCountConfigurable === false) wordCount.value = modeCfg.defaultWordCount;
            }
        }
    }

    if (createRoomBtn) {
        if (isArcadeType) createRoomBtn.textContent = window.currentLang === 'it' ? "GIOCA ORA ARCADE 🕹️" : "PLAY ARCADE NOW 🕹️";
        else if (isTrn) createRoomBtn.textContent = window.currentLang === 'it' ? "VAI AI TORNEI 🏆" : "GO TO TOURNAMENTS 🏆";
        else createRoomBtn.textContent = typeInput.value === 'single' ? (window.currentLang === 'it' ? "Gioca Ora" : "Play Now") : (window.currentLang === 'it' ? "Inizia Partita" : "Start Match");
    }
};

window.updateUI = function() {
    const t = window.i18n[window.currentLang] || window.i18n.it;
    const mapping = {
        txt_info_btn_label: t.info || "Info",
        txt_act_btn_label: "🏅 " + (t.activity || "Attività"),
        txt_profile_btn_label: "👤 " + (t.profile || "Profilo"),
        txt_course_btn_label: "📻 " + (t.course || "Corso"),
        txt_lb_btn_label: "🏆 " + (t.lb || "Classifica"),
        txt_free_challenge_title: t.free_challenge,
        txt_play_solo_title: t.play_solo,
        txt_game_type_label: t.game_type,
        txt_mode_label: t.mode,
        txt_wpm_label: t.wpm,
        txt_words_label: t.words,
        txt_tone_label: t.tone,
        txt_challenge_board_title: t.challenge_board,
        txt_online_users_title: t.online_users,
        txt_no_challenges: t.no_challenges,
        txt_you_are_alone: t.you_are_alone,
        txt_opt_multi: t.opt_multi,
        txt_opt_single: t.opt_single,
        txt_opt_coop: t.opt_coop,
        txt_opt_trn: t.opt_trn,
        txt_opt_arcade: t.opt_arcade,
        txt_opt_tx: t.opt_tx
    };

    for (let id in mapping) {
        const el = document.getElementById(id);
        if (el) el.textContent = mapping[id];
    }
    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = window.currentLang.toUpperCase();

    window.populateGameModesUI();
    window.checkGameTypeUI();
};

window.toggleLanguage = function() {
    const newLang = window.currentLang === 'it' ? 'en' : 'it';
    window.setLanguage(newLang);
};

window.openModule = function(path) {
    const iframe = document.getElementById('gameIframe');
    let url = "";
    let status = "online";
    if (path === 'info') { url = "privacy/index.html"; status = "privacy"; }
    else if (path === 'participation') { url = "participation/index.html"; status = "participation"; }
    else if (path === 'profile') { url = "profile/index.html"; status = "profile"; }
    else if (path === 'course') { url = "course/index.html"; status = "course"; }
    else if (path === 'leaderboard') { url = "leaderboard/index.html"; status = "leaderboard"; }
    else if (path === 'teams') { url = "games/tournament/index.html"; status = "teams"; }

    if (url) {
        iframe.src = url + "?v=" + Date.now();
        iframe.style.display = 'block';
        if (window.db && window.myId) {
            window.db.ref(`presence/${window.myId}/status`).set(status);
        }
        window.tg?.BackButton.show();
        window.tg?.BackButton.onClick(() => window.closeModule());
    }
};

window.closeModule = function() {
    const iframe = document.getElementById('gameIframe');
    iframe.style.display = 'none';
    iframe.src = "about:blank";
    if (window.db && window.myId) {
        window.db.ref(`presence/${window.myId}/status`).set("online");
    }
    window.tg?.BackButton.hide();
};

window.addEventListener('message', (event) => {
    if (event.data === 'closeModule' || event.data?.type === 'closeModule') {
        window.closeModule();
    }
});

// Firebase Listeners for Online Users and Rooms
window.initListeners = function() {
    if (!window.db) return;

    // Online Users
    window.db.ref('presence').limitToLast(50).on('value', snap => {
        const list = document.getElementById('onlineUsersList');
        if (!list) return;
        list.innerHTML = '';
        let count = 0;
        snap.forEach(child => {
            const u = child.val();
            if (child.key === window.myId) return;
            count++;
            const li = document.createElement('li');
            li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:4px 8px; margin-bottom:3px;";
            li.innerHTML = `<span><b>${u.name || "Anonimo"}</b><br><small style="color:var(--champ-color)">Lv. ${u.level || 1}</small></span>`;
            const btn = document.createElement('button');
            btn.className = "action-btn-small btn-success";
            btn.textContent = window.currentLang === 'it' ? 'Sfida' : 'Challenge';
            btn.onclick = () => window.showToast("Funzione Sfida in fase di migrazione...");
            li.appendChild(btn);
            list.appendChild(li);
        });
        if (count === 0) {
            list.innerHTML = `<li id="txt_you_are_alone" style="justify-content: center; color: var(--hint-color); background: none; border: none;">${window.currentLang === 'it' ? "Sei solo." : "You are alone."}</li>`;
        }
    });

    // Waiting Rooms
    window.db.ref('public_lobby_rooms').orderByChild('status').equalTo('waiting').limitToLast(10).on('value', snap => {
        const list = document.getElementById('waitingRoomsList');
        if (!list) return;
        list.innerHTML = '';
        let count = 0;
        snap.forEach(child => {
            const room = child.val();
            count++;
            const li = document.createElement('li');
            li.innerHTML = `<span><b>#${child.key}</b><br><small>${room.wpm} WPM | ${room.mode}</small></span>`;
            const btn = document.createElement('button');
            btn.className = "action-btn-small";
            btn.textContent = window.currentLang === 'it' ? 'Entra' : 'Join';
            btn.onclick = () => window.showToast("Entrata in stanza in fase di migrazione...");
            li.appendChild(btn);
            list.appendChild(li);
        });
        if (count === 0) {
            list.innerHTML = `<li id="txt_no_challenges" style="justify-content: center; color: var(--hint-color); background: none; border: none;">${window.currentLang === 'it' ? "Nessuna sfida." : "No challenges."}</li>`;
        }
    });

    window.initBadgeListeners();
    window.initDailyChallenge();
};

window.initBadgeListeners = function() {
    if (!window.db || !window.myId) return;

    // Missions Badge
    window.db.ref(`users/${window.myId}/progression/dailyMissions`).on('value', snap => {
        const missions = snap.val()?.list || [];
        const badge = document.getElementById('missionsBadge');
        if (!badge) return;
        const pending = missions.filter(m => !m.completed).length;
        if (pending > 0) {
            badge.textContent = pending;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });

    // Admin Badge (Bug reports)
    window.checkAdminStatus().then(isAdmin => {
        if (isAdmin) {
            window.db.ref('bugReports').on('value', snap => {
                const badge = document.getElementById('bugsBadge');
                if (!badge) return;
                const count = snap.numChildren();
                if (count > 0) {
                    badge.textContent = count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            });
        }
    });

    // Course Message Badge
    window.db.ref(`users/${window.myId}/course/unreadMessages`).on('value', snap => {
        const unread = snap.val() || 0;
        const badge = document.getElementById('courseMessageBadge');
        if (!badge) return;
        if (unread > 0) {
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
};

window.initDailyChallenge = function() {
    const btnPlay = document.getElementById('btnPlayDailyNow');
    const btnLater = document.getElementById('btnPlayDailyLater');
    const btnDecline = document.getElementById('btnDeclineDaily');
    const modal = document.getElementById('dailyChallengeModal');

    if (!modal) return;

    let today = new Date().toISOString().split('T')[0];
    const STORAGE_DAILY_STATUS_KEY = "cwgame_daily_shown";

    // Check if played today
    window.db.ref(`users/${window.myId}/history`).orderByChild('date').limitToLast(10).once('value', snap => {
        let played = false;
        snap.forEach(mSnap => {
            const m = mSnap.val();
            if (m.mode === 'daily_challenge' && m.date && m.date.startsWith(today)) played = true;
        });

        const shown = localStorage.getItem(STORAGE_DAILY_STATUS_KEY) === today;

        if (!played && !shown) {
            modal.style.display = 'flex';
        }
    });

    if (btnPlay) {
        btnPlay.onclick = () => {
            modal.style.display = 'none';
            // Start daily challenge
            const iframe = document.getElementById('gameIframe');
            iframe.src = "games/standard/index.html?mode=daily_challenge&v=" + Date.now();
            iframe.style.display = 'block';
        };
    }
    if (btnLater) btnLater.onclick = () => modal.style.display = 'none';
    if (btnDecline) btnDecline.onclick = () => {
        localStorage.setItem(STORAGE_DAILY_STATUS_KEY, today);
        modal.style.display = 'none';
    };
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    // Wait for init.js to finish
    setTimeout(() => {
        if (window.db) {
            if (window.loadDictionaries) window.loadDictionaries();
            window.initListeners();
            window.updateUI();
            document.getElementById('loadingScreen').classList.remove('active-screen');
            document.getElementById('setupScreen').classList.add('active-screen');
        }
    }, 1500);
});

document.getElementById('gameTypeInput').onchange = window.checkGameTypeUI;
document.getElementById('gameModeInput').onchange = window.checkGameTypeUI;
document.getElementById('langBtn').onclick = window.toggleLanguage;

document.getElementById('createRoomBtn').onclick = () => {
    const gType = document.getElementById('gameTypeInput').value;
    const gMode = document.getElementById('gameModeInput').value;
    const wpm = parseInt(document.getElementById('startWpmInput').value) || 20;
    const words = parseInt(document.getElementById('wordCountInput').value) || 10;
    const tone = parseInt(document.getElementById('toneInput').value) || 600;

    if (gType === 'tournament') {
        window.openModule('teams');
        return;
    }

    if (gMode === 'custom' && (!window.customDictionary || window.customDictionary.length === 0)) {
        window.showToast(window.currentLang === 'it' ? "Carica un file nel profilo!" : "Upload a file in profile!");
        return;
    }

    const isSingle = (gType === 'single');
    const roomCode = isSingle ? "SOLO_" + window.myId : Math.floor(1000 + Math.random() * 9000).toString();

    // Generazione parole centralizzata (PRNG seed if daily)
    const gameWords = window.getGameWords(words, gMode);

    const roomData = {
        status: isSingle ? 'countdown' : 'waiting',
        type: isSingle ? 'single' : (gType === 'coop' ? 'coop' : 'multi'),
        mode: gMode,
        wpm: wpm,
        tone: tone,
        wordCount: words,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        hostId: window.myId,
        game_words: gameWords
    };

    localStorage.setItem('game_config', JSON.stringify({ type: gType, mode: gMode, roomCode: roomCode }));

    window.db.ref('rooms/' + roomCode).set(roomData).then(() => {
        // Se non è single, pubblica in bacheca
        if (!isSingle) {
            window.db.ref('public_lobby_rooms/' + roomCode).set({
                mode: gMode, wpm: wpm, hostName: window.myName, status: 'waiting', pCount: 1
            });
        }

        // Aggiungi host come giocatore
        window.db.ref(`rooms/${roomCode}/players/${window.myId}`).set({
            name: window.myName, username: window.tgUsername || "", score: 0, wpm: wpm, accepted: true, online: true
        });

        const iframe = document.getElementById('gameIframe');
        let url = "games/standard/index.html";
        if (gType === 'arcade') url = "games/arcade/index.html";
        else if (gMode === 'quiz') url = "games/quiz/index.html";
        else if (gType === 'transmission') url = "games/transmission/index.html";
        else if (gType === 'coop') url = "games/coop/index.html";

        iframe.src = url + "?room=" + roomCode + "&v=" + Date.now();
        iframe.style.display = 'block';
    });
};
