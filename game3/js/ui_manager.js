// js/ui_manager.js

window.populateGameModesUI = function() {
    console.log("UI: Populating Game Modes...");
    const select = document.getElementById('gameModeInput');
    const typeInput = document.getElementById('gameTypeInput');
    if (!select || !typeInput) return;

    const isSingle = typeInput.value === 'single';
    const isMulti = typeInput.value === 'multi';
    const currentVal = select.value || 'standard';

    select.innerHTML = '';

    Object.values(window.GAME_MODES || {}).forEach(mode => {
        // FILTRO 1: In Solo non mostriamo Ping Pong
        if (isSingle && mode.id === 'pingpong') return;

        // FILTRO 2: Conquest è solo per CO-OP (gestito in checkGameTypeUI)
        if (mode.id === 'conquest') return;

        // FILTRO 3: Arcade è solo per tipo ARCADE
        if (mode.id === 'arcade') return;

        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.id = 'txt_opt_' + mode.id;
        opt.textContent = currentLang === 'it' ? mode.titleIt : mode.titleEn;
        select.appendChild(opt);
    });

    // Ripristiniamo il valore se ancora valido, altrimenti standard
    if (window.GAME_MODES && window.GAME_MODES[currentVal]) {
        // Se avevamo Ping Pong e passiamo a Solo, resettiamo a standard
        if (isSingle && currentVal === 'pingpong') select.value = 'standard';
        else select.value = currentVal;
    } else {
        select.value = 'standard';
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
        wordCount: document.getElementById('wordCountInput')
    };

    if (containers.timeout) containers.timeout.style.display = (isSingle || isTrn || isCoop || isArcadeType) ? 'none' : 'block';

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
            if (modeCfg.wpmConfigurable === false && modeCfg.defaultWpm) containers.startWpm.value = modeCfg.defaultWpm;
        }
        if (containers.wordCount) {
            containers.wordCount.disabled = (modeCfg.wordCountConfigurable === false);
            if (modeCfg.wordCountConfigurable === false && modeCfg.defaultWordCount) containers.wordCount.value = modeCfg.defaultWordCount;
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
            else containers.btn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
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
        txt_opt_coop: t.opt_coop, txt_opt_trn: t.opt_trn, txt_opt_arcade: t.opt_arcade,
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
        startArcadeBtn: t.arcade_start, txt_arcade_new_level: t.arcade_new_level
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
