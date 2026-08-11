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

        // FILTRO 2: Conquest è solo per CO-OP, Arcade è gestito a parte
        if (mode.id === 'conquest' || mode.id === 'arcade') return;

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
    const typeInput = document.getElementById('gameTypeInput');
    const modeInput = document.getElementById('gameModeInput');
    if (!typeInput || !modeInput) return;

    const gType = typeInput.value;

    // FORZATURA ARCADE: Se il tipo è arcade, svuota e imposta solo arcade
    if (gType === 'arcade') {
        modeInput.innerHTML = `<option value="arcade">Intercettazione Arcade 🕹️</option>`;
        modeInput.value = "arcade";
        window.currentMode = "arcade"; // Forza variabile globale
    } else if (gType === 'coop') {
        modeInput.innerHTML = `<option value="conquest">Conquista (Co-op) ⚔️</option>`;
        modeInput.value = "conquest";
    } else if (gType === 'tournament') {
        modeInput.innerHTML = `
            <option value="trn_join_team">Unisciti a Squadra</option>
            <option value="trn_create_team">Fonda Squadra</option>
            <option value="trn_create_trn">Crea Nuovo Torneo</option>`;
    } else {
        window.populateGameModesUI();
    }

    const isArcade = (gType === 'arcade');
    const isSingle = (gType === 'single');
    const isTrn = (gType === 'tournament');
    const isCoop = (gType === 'coop');

    const containers = {
        timeout: document.getElementById('timeoutDiv'),
        fixed: document.getElementById('fixedSpeedContainer'),
        easy: document.getElementById('easyModeContainer'),
        spacing: document.getElementById('advancedSpacingContainer'),
        btn: document.getElementById('createRoomBtn'),
        startWpm: document.getElementById('startWpmInput'),
        wordCount: document.getElementById('wordCountInput')
    };

    if (containers.timeout) containers.timeout.style.display = (isSingle || isTrn || isCoop || isArcade) ? 'none' : 'block';

    // Nascondi tutto se arcade
    if (isArcade) {
        if (containers.fixed) containers.fixed.style.display = 'none';
        if (containers.easy) containers.easy.style.display = 'none';
        if (containers.spacing) containers.spacing.style.display = 'none';
        if (containers.startWpm) containers.startWpm.disabled = true;
        if (containers.wordCount) containers.wordCount.disabled = true;
        if (containers.btn) containers.btn.textContent = "Gioca Subito Arcade 🕹️";
    } else {
        // ... logica normale per le altre modalità ...
        if (containers.btn) containers.btn.textContent = isSingle ? "Gioca Subito" : "Inizia Partita Libera";
    }
};
};

window.setLanguage = function(lang) {
    currentLang = lang;
    localStorage.setItem('gameLang', lang);
    const t = i18n[lang] || i18n.it;

    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = lang.toUpperCase();

    const textMap = {
        txt_hello: t.hello, txt_free_challenge_title: t.free_challenge, txt_play_solo_title: t.play_solo,
        txt_game_type_label: t.game_type, txt_mode_label: t.mode, txt_opt_multi: t.opt_multi, txt_opt_single: t.opt_single,
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
        opt_lb_room: t.tab_this_match, opt_lb_trn: t.tab_trn_lb, opt_lb_call: t.tab_callsigns, opt_lb_single: t.tab_std_single
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
