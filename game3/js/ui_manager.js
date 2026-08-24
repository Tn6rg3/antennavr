// js/ui_manager.js

window.populateGameModesUI = function() {
    console.log("UI: Populating Game Modes...");
    const select = document.getElementById('gameModeInput');
    const typeInput = document.getElementById('gameTypeInput');
    if (!select || !typeInput) return;

    const isSingle = typeInput.value === 'single';
    const isMulti = typeInput.value === 'multi';
    const isCoop = typeInput.value === 'coop';
    const isTx = typeInput.value === 'transmission';
    const lang = (typeof currentLang !== 'undefined') ? currentLang : 'it';
    const currentVal = select.value || 'standard';

    select.innerHTML = '';

    Object.values(window.GAME_MODES || {}).forEach(mode => {
        // --- LOGICA FILTRI ---
        if (isSingle) {
            if (mode.id === 'pingpong' || mode.id === 'conquest' || mode.id === 'arcade' || mode.id === 'groups_tx' || mode.id === 'real_tx') return;
        } else if (isMulti) {
            if (mode.id === 'perfection' || mode.id === 'conquest' || mode.id === 'arcade' || mode.id === 'groups_tx' || mode.id === 'real_tx') return;
        } else if (isCoop) {
            if (mode.id !== 'conquest') return;
        } else if (isTx) {
            // Mostriamo solo Standard, Gruppi e TX Reale (re-interpretati come Singolo, Gruppi Tx e Ricezione Audio)
            if (mode.id !== 'standard' && mode.id !== 'groups_tx' && mode.id !== 'real_tx') return;
        } else {
            if (typeInput.value === 'arcade' && mode.id !== 'arcade') return;
            if (typeInput.value === 'tournament') return; // Gestito da optgroup
        }

        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.id = 'txt_opt_' + mode.id;

        // Rinominazione etichette per modalità Trasmissione
        if (isTx) {
            if (mode.id === 'standard') opt.textContent = lang === 'it' ? "Esercizio Singolo (Koch)" : "Single Exercise (Koch)";
            else if (mode.id === 'groups_tx') opt.textContent = lang === 'it' ? "Trasmissione Gruppi" : "Groups Transmission";
            else if (mode.id === 'real_tx') opt.textContent = lang === 'it' ? "Ricezione Audio (Tasto Reale)" : "Audio Reception (Real Key)";
            else return;
        } else {
            opt.textContent = lang === 'it' ? mode.titleIt : mode.titleEn;
        }

        select.appendChild(opt);
    });

    // Ripristiniamo il valore se ancora valido, altrimenti standard
    if (window.GAME_MODES && window.GAME_MODES[currentVal]) {
        if (isSingle && currentVal === 'pingpong') select.value = 'standard';
        else if (isTx && currentVal !== 'standard' && currentVal !== 'groups_tx' && currentVal !== 'real_tx') select.value = 'standard';
        else select.value = currentVal;
    } else {
        select.value = 'standard';
    }
};

window.toggleVisibility = function(contentId, btnId) {
    const content = document.getElementById(contentId);
    const btn = document.getElementById(btnId);
    if (!content || !btn) return;

    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = btnId === 'btnToggleKeyer' ? "Nascondi 🔼" : "Nascondi";
    } else {
        content.style.display = 'none';
        btn.textContent = btnId === 'btnToggleKeyer' ? "Mostra 🔽" : "Mostra";
    }
};

window.checkGameTypeUI = function() {
    console.log("UI: Checking Game Type UI...");
    const typeInput = document.getElementById('gameTypeInput');
    const modeInput = document.getElementById('gameModeInput');
    if (!typeInput || !modeInput) return;

    const isSingle = typeInput.value === 'single';
    const isTrn = typeInput.value === 'tournament';
    const isCoop = typeInput.value === 'coop';
    const isArcadeType = typeInput.value === 'arcade';

    const currentVal = modeInput.value;

    // Gestione dinamica delle opzioni nel menu "Modo"
    if (isCoop) {
        modeInput.innerHTML = `<option value="conquest">${currentLang === 'it' ? "Conquista (Co-op) ⚔️" : "Conquest (Co-op) ⚔️"}</option>`;
        modeInput.value = "conquest";
    } else if (isArcadeType) {
        modeInput.innerHTML = `<option value="arcade">${currentLang === 'it' ? "Pioggia (Arcade) 🕹️" : "Rain (Arcade) 🕹️"}</option>`;
        modeInput.value = "arcade";
    } else if (isTrn) {
        const trnOptions = [
            { val: "trn_create_team", it: "Fonda Squadra", en: "Create Team" },
            { val: "trn_join_team", it: "Unisciti a Squadra", en: "Join Team" },
            { val: "trn_create_trn", it: "Crea Nuovo Torneo", en: "Create Tournament" }
        ];
        modeInput.innerHTML = trnOptions.map(o => `<option value="${o.val}">${currentLang === 'it' ? o.it : o.en}</option>`).join('');
        if (!modeInput.value.startsWith('trn_')) modeInput.value = "trn_join_team";
    } else {
        // Multiplayer o Solo: popoliamo con le modalità standard applicando i filtri
        window.populateGameModesUI();
    }

    const selectedMode = modeInput.value;
    const modeCfg = window.GAME_MODES ? window.GAME_MODES[selectedMode] : null;

    // --- LOGICA VISIBILITÀ OPZIONI ---
    const isTx = typeInput.value === 'transmission';

    const containers = {
        timeout: document.getElementById('timeoutDiv'),
        fixed: document.getElementById('fixedSpeedContainer'),
        easy: document.getElementById('easyModeContainer'),
        spacing: document.getElementById('advancedSpacingContainer'),
        custom: document.getElementById('customDictControl'),
        spectator: document.getElementById('spectatorContainer'),
        arcadeBtn: document.getElementById('startArcadeBtn'),
        btn: document.getElementById('createRoomBtn'),
        startWpm: document.getElementById('startWpmInput'),
        wordCount: document.getElementById('wordCountInput'),
        koch: document.getElementById('setupKochLevelContainer'),
        keyer: document.getElementById('mainMenuKeyerConfig')
    };

    if (containers.timeout) containers.timeout.style.display = (isSingle || isTrn || isCoop || isArcadeType || isTx) ? 'none' : 'block';

    if (containers.fixed) containers.fixed.style.display = (isSingle && !isTx) ? 'flex' : 'none';
    if (containers.easy) containers.easy.style.display = (isSingle && !isTx) ? 'flex' : 'none';
    if (containers.spacing) containers.spacing.style.display = (isSingle && !isTx) ? 'flex' : 'none';
    if (containers.custom) containers.custom.style.display = (isSingle && !isTx) ? 'flex' : 'none';
    if (containers.spectator) containers.spectator.style.display = (isSingle && !isTx) ? 'flex' : 'none';

    // --- LOGICA TRASMISSIONE ---
    if (containers.koch) containers.koch.style.display = isTx ? 'block' : 'none';
    if (containers.keyer) containers.keyer.style.display = isTx ? 'block' : 'none';

    if (isTx && containers.koch) {
        const kInput = document.getElementById('setupKochLevelInput');
        if (kInput && kInput.options.length === 0) {
            const koch = ["K","M","R","S","U","A","P","T","L","O","W","I",".","N","J","E","F","0","Y",",","V","G","5","/","Q","9","2","H","3","8","B","?","4","7","C","1","D","6","X","="];
            koch.forEach((char, idx) => {
                const opt = document.createElement('option');
                opt.value = idx + 2;
                opt.textContent = `Lezione ${idx + 2} (${char})`;
                kInput.appendChild(opt);
            });
            if (window.courseData?.progress?.current_lesson) kInput.value = window.courseData.progress.current_lesson;
        }
    }

    if (isArcadeType) {
        if (containers.startWpm) {
            containers.startWpm.disabled = true;
            containers.startWpm.value = 20;
        }
        if (containers.wordCount) containers.wordCount.disabled = true;
    } else if (modeCfg) {
        if (containers.fixed) containers.fixed.style.display = (isSingle && modeCfg.fixedSpeedAllowed) ? 'flex' : 'none';
        if (containers.easy) containers.easy.style.display = isSingle ? 'flex' : 'none';
        if (containers.spacing) containers.spacing.style.display = (isSingle && modeCfg.spacingConfigurable) ? 'flex' : 'none';

        if (containers.startWpm) {
            containers.startWpm.disabled = (modeCfg.wpmConfigurable === false);
            if (modeCfg.wpmConfigurable === false && modeCfg.defaultWpm) {
                containers.startWpm.value = modeCfg.defaultWpm;
            } else {
                // RIPRISTINO PREFERENZA UTENTE se la modalità lo permette
                const savedWpm = localStorage.getItem('cwgame_pref_wpm') || 20;
                containers.startWpm.value = savedWpm;
            }
        }
        if (containers.wordCount) {
            containers.wordCount.disabled = (modeCfg.wordCountConfigurable === false);
            if (modeCfg.wordCountConfigurable === false && modeCfg.defaultWordCount) {
                containers.wordCount.value = modeCfg.defaultWordCount;
            } else {
                const savedWords = localStorage.getItem('cwgame_pref_words') || 10;
                containers.wordCount.value = savedWords;
            }
        }
    } else {
        if (containers.fixed) containers.fixed.style.display = 'none';
        if (containers.easy) containers.easy.style.display = isSingle ? 'flex' : 'none';
        if (containers.spacing) containers.spacing.style.display = 'none';
    }

    if (containers.custom) containers.custom.style.display = (isSingle && selectedMode === 'custom') ? 'flex' : 'none';
    if (containers.spectator) containers.spectator.style.display = isSingle ? 'flex' : 'none';

    if (containers.arcadeBtn) {
        containers.arcadeBtn.style.display = isArcadeType ? 'block' : 'none';
    }

    if (containers.btn) {
        if (isArcadeType) {
            containers.btn.style.display = 'none';
        } else {
            containers.btn.style.display = 'block';
            if (isCoop) containers.btn.textContent = currentLang === 'it' ? "Crea Stanza Co-op ⚔️" : "Create Co-op Room ⚔️";
            else if (isTrn) containers.btn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
            else if (isTx) containers.btn.textContent = currentLang === 'it' ? "ENTRA IN STAZIONE 📻" : "ENTER STATION 📻";
            else containers.btn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
        }
    }
};

window.showRoomEventModal = function(title, message) {
    const modal = document.getElementById('roomEventModal');
    const titleEl = document.getElementById('roomEventTitle');
    const textEl = document.getElementById('roomEventText');
    const goToBtn = document.getElementById('goToRoomBtn');

    if (modal && titleEl && textEl) {
        titleEl.textContent = title;
        textEl.textContent = message;
        modal.style.display = 'flex';

        if (goToBtn) {
            goToBtn.onclick = () => {
                modal.style.display = 'none';
                window.joinRoomLogic(true);
            };
        }
    }
};

window.setLanguage = function(lang) {
    currentLang = lang;
    localStorage.setItem('gameLang', lang);
    const t = i18n[lang] || i18n.it;

    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = lang.toUpperCase();

    const textMap = {
        txt_hello: t.hello, txt_free_challenge_title: t.free_challenge, txt_play_solo_title: t.play_solo,
        txt_game_type_label: t.game_type, txt_mode_label: t.mode,
        txt_opt_multi: t.opt_multi, txt_opt_single: t.opt_single,
        txt_opt_coop: t.opt_coop, txt_opt_trn: t.opt_trn, txt_opt_arcade: t.opt_arcade, txt_opt_tx: t.opt_tx,
        txt_opt_std: t.opt_std, txt_opt_call: t.opt_call, txt_opt_pp: t.opt_pp, txt_wpm_label: t.wpm,
        txt_words_label: t.words, txt_tone_label: t.tone, txt_fixed_speed: t.fixed, txt_easy_mode: t.easy,
        txt_room_timeout: t.timeout, txt_challenge_board_title: t.challenge_board, txt_no_challenges: t.no_challenges,
        txt_online_users_title: t.online_users, txt_global_chat_btn: t.global_chat, txt_you_are_alone: t.you_are_alone,
        chatTitle: t.chat_title, clearChatBtn: t.chat_clear, closeChatBtn: t.chat_close, sendChatBtn: t.chat_send,
        txt_lobby_players: t.lobby_players, txt_lobby_chat_title: t.lobby_chat, sendLobbyChatBtn: t.chat_send,
        inviteFriendsBtn: t.lobby_invite, startMultiplayerBtn: t.btn_start_match, deleteRoomBtn: t.btn_delete_room,
        leaveLobbyBtn: t.btn_leave_lobby, readyBtn: t.ready_btn, txt_prepare: t.prepare, txt_th_typed: t.th_typed,
        txt_th_real: t.th_real, txt_th_pts: t.th_pts, replayWordBtn: t.replay, txt_game_chat_btn: t.game_chat,
        quitGameBtn: t.quit_game, txt_profile_title: t.profile_title, txt_alias_title: t.alias_label, saveAliasBtn: t.save,
        txt_alias_hint: t.alias_hint, txt_privacy_label: t.privacy_label, txt_privacy_hint: t.privacy_hint,
        txt_wrong_chars_title: t.wrong_chars, txt_wpm_error_title: t.wpm_error, txt_match_history_title: t.match_history,
        txt_back_btn: t.back_to_menu, deleteDataBtn: t.delete_data, tabDailyAct: t.daily, tabWeeklyAct: t.weekly,
        tabMonthlyAct: t.monthly, goToTeamsBtn: t.teams_btn, tabTeamGestBtn: t.tab_my_team, tabAllTeamsBtn: t.tab_all_teams,
        tabTournamentsBtn: t.tab_tournaments, txt_custom_dict_title: t.custom_title, txt_custom_dict_desc: t.custom_desc,
        txt_select_file_btn: t.select_file, txt_custom_hint1: t.custom_hint1, txt_custom_hint2: t.custom_hint2,
        txt_custom_hint3: t.custom_hint3, txt_close_custom_btn: t.chat_close, txt_manage_custom_btn: t.manage_custom,
        opt_lb_room: t.tab_this_match, opt_lb_trn: t.tab_trn_lb, opt_lb_call: t.tab_callsigns, opt_lb_single: t.tab_std_single,
        startArcadeBtn: t.arcade_start, arcadeLevelTitle: t.arcade_new_level
    };

    for (let key in textMap) {
        const el = document.getElementById(key);
        if (el) el.textContent = textMap[key];
    }

    const lbBtnLabel = document.getElementById('txt_lb_btn_label');
    const profileBtnLabel = document.getElementById('txt_profile_btn_label');
    const actBtnLabel = document.getElementById('txt_act_btn_label');

    if (lbBtnLabel) lbBtnLabel.textContent = "🏆 " + t.lb;
    if (profileBtnLabel) profileBtnLabel.textContent = "👤 " + t.profile;
    if (actBtnLabel) actBtnLabel.textContent = "🏅 " + t.activity;

    const courseBtnLabel = document.getElementById('txt_course_btn_label');
    if (courseBtnLabel) courseBtnLabel.textContent = "📻 " + (lang === 'it' ? "Corso" : "Course");

    window.populateGameModesUI();
    window.checkGameTypeUI();
    if (typeof window.updateMuteBtnUI === 'function') window.updateMuteBtnUI();
};
