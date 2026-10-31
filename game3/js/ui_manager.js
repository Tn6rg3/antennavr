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
        // Le sfide giornaliere (tri_daily e daily_challenge) sono avviabili solo via Popup/Hub
        if (mode.id === 'tri_daily' || mode.id === 'daily_challenge') return;

        // --- LOGICA FILTRI ---
        if (isSingle) {
            // QSO, modalità Arcade (Pioggia, Torre, Memory CW), Tx/Rx e Gruppi non sono ammesse in Solo
            if (mode.id === 'qso' || mode.id === 'code_groups' || mode.id === 'pingpong' || mode.id === 'conquest' || mode.id === 'arcade' || mode.id === 'la_torre' || mode.id === 'memory_cw' || mode.id === 'groups_tx' || mode.id === 'real_tx' || mode.id === 'qso_audio_search' || mode.id === 'addestra_ia') return;
        } else if (isMulti) {
            // Modalità ammesse in Multi
            if (mode.id === 'code_groups' || mode.id === 'perfection' || mode.id === 'conquest' || mode.id === 'arcade' || mode.id === 'la_torre' || mode.id === 'memory_cw' || mode.id === 'groups_tx' || mode.id === 'real_tx' || mode.id === 'qso_audio_search' || mode.id === 'addestra_ia') return;
        } else if (isCoop) {
            if (mode.id !== 'conquest') return;
        } else if (isTx) {
            // Mostriamo Standard, Gruppi 5 Chars, Gruppi Tx, Ricezione Audio e Ascolto QSO Reali
            if (mode.id !== 'standard' && mode.id !== 'code_groups' && mode.id !== 'groups_tx' && mode.id !== 'real_tx' && mode.id !== 'qso_audio_search') return;
        } else {
            if (mode.id === 'code_groups' || mode.id === 'qso_audio_search' || mode.id === 'groups_tx' || mode.id === 'real_tx' || mode.id === 'addestra_ia') return;
            if (typeInput.value === 'arcade' && mode.id !== 'arcade' && mode.id !== 'la_torre') return;
            if (typeInput.value === 'tournament') return; // Gestito da optgroup
        }

        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.id = 'txt_opt_' + mode.id;

        // Rinominazione etichette per modalità Trasmissione
        if (isTx) {
            if (mode.id === 'standard') opt.textContent = lang === 'it' ? "Esercizio Singolo (Koch)" : "Single Exercise (Koch)";
            else if (mode.id === 'code_groups') opt.textContent = lang === 'it' ? "Esercizio Gruppi (5 Chars)" : "Code Groups Exercise (5 Chars)";
            else if (mode.id === 'groups_tx') opt.textContent = lang === 'it' ? "Trasmissione Gruppi" : "Groups Transmission";
            else if (mode.id === 'real_tx') opt.textContent = lang === 'it' ? "Ricezione Audio (Tasto Reale)" : "Audio Reception (Real Key)";
            else if (mode.id === 'qso_audio_search') opt.textContent = lang === 'it' ? "Ascolto QSO Reali 🎧" : "Listen Real QSOs 🎧";
            else return;
        } else {
            opt.textContent = lang === 'it' ? mode.titleIt : mode.titleEn;
        }

        select.appendChild(opt);
    });

    // Ripristiniamo il valore se ancora valido, altrimenti standard
    if (window.GAME_MODES && window.GAME_MODES[currentVal]) {
        if (isSingle && currentVal === 'pingpong') select.value = 'standard';
        else if (isTx && currentVal !== 'standard' && currentVal !== 'code_groups' && currentVal !== 'groups_tx' && currentVal !== 'real_tx' && currentVal !== 'qso_audio_search') select.value = 'standard';
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
        modeInput.innerHTML = `
            <option value="arcade">${currentLang === 'it' ? "Pioggia (Arcade) 🕹️" : "Rain (Arcade) 🕹️"}</option>
            <option value="la_torre">${currentLang === 'it' ? "La Torre (Scalata) 🗼" : "The Tower (Climb) 🗼"}</option>
            <option value="memory_cw">${currentLang === 'it' ? "Gioco delle Coppie (Memory CW) 🧩" : "Memory CW (Card Pairs) 🧩"}</option>
        `;
        if (currentVal === 'la_torre' || currentVal === 'memory_cw') modeInput.value = currentVal;
        else modeInput.value = "arcade";
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
        speak: document.getElementById('speakModeContainer'),
        voiceInput: document.getElementById('voiceInputContainer'),
        autoAdvance: document.getElementById('autoAdvanceContainer'),
        voiceRate: document.getElementById('voiceRateDiv'),
        arcadeBtn: document.getElementById('startArcadeBtn'),
        btn: document.getElementById('createRoomBtn'),
        startWpm: document.getElementById('startWpmInput'),
        wordCount: document.getElementById('wordCountInput'),
        wordsPerGroup: document.getElementById('wordsPerGroupContainer'),
        wordLen: document.getElementById('wordLengthContainer'),
        groupCharSet: document.getElementById('groupCharSetContainer'),
        koch: document.getElementById('setupKochLevelContainer'),
        memoryCards: document.getElementById('memoryCardCountContainer'),
        keyer: document.getElementById('mainMenuKeyerConfig')
    };

    if (containers.timeout) containers.timeout.style.display = (isSingle || isTrn || isCoop || isArcadeType || isTx || selectedMode === 'qso') ? 'none' : 'block';

    const isFixedAllowed = (isSingle || isTx) && selectedMode !== 'qso' && selectedMode !== 'real_tx' && selectedMode !== 'groups_tx' && selectedMode !== 'qso_audio_search';
    const isEasyAllowed = isFixedAllowed && selectedMode !== 'daily_challenge' && selectedMode !== 'tri_daily' && selectedMode !== 'code_groups' && selectedMode !== 'quiz';
    if (containers.fixed) containers.fixed.style.display = isFixedAllowed ? 'flex' : 'none';
    if (containers.easy) containers.easy.style.display = isEasyAllowed ? 'flex' : 'none';
    if (!isEasyAllowed && document.getElementById('easyModeCheckbox')) {
        document.getElementById('easyModeCheckbox').checked = false;
    }
    if (containers.spacing) containers.spacing.style.display = isFixedAllowed ? 'flex' : 'none';
    if (containers.custom) containers.custom.style.display = (selectedMode === 'custom') ? 'flex' : 'none';
    if (containers.spectator) containers.spectator.style.display = (isSingle && !isTx && selectedMode !== 'qso') ? 'flex' : 'none';
    if (containers.wordsPerGroup) containers.wordsPerGroup.style.display = (selectedMode === 'standard_plus') ? 'block' : 'none';
    if (containers.wordLen) containers.wordLen.style.display = (selectedMode === 'standard' || selectedMode === 'standard_plus' || selectedMode === 'perfection') ? 'block' : 'none';
    if (containers.groupCharSet) containers.groupCharSet.style.display = (selectedMode === 'code_groups') ? 'block' : 'none';
    if (containers.memoryCards) containers.memoryCards.style.display = (selectedMode === 'memory_cw') ? 'block' : 'none';

    // --- NUOVA LOGICA ASCOLTO (TTS) + RISPOSTA VOCALE + AVANZAMENTO AUTO ---
    const isSpeakAvailable = isSingle && (selectedMode === 'standard');

    if (containers.speak) containers.speak.style.display = isSpeakAvailable ? 'flex' : 'none';
    if (containers.voiceRate) containers.voiceRate.style.display = isSpeakAvailable ? 'flex' : 'none';

    const chk = document.getElementById('speakModeCheckbox');
    const voiceChk = document.getElementById('voiceInputCheckbox');
    const autoAdvChk = document.getElementById('autoAdvanceCheckbox');

    const isSpeakActive = chk?.checked;

    if (containers.voiceInput) {
        const isVoiceAvailable = isSpeakAvailable && isSpeakActive;
        containers.voiceInput.style.display = isVoiceAvailable ? 'flex' : 'none';
        if (!isVoiceAvailable && voiceChk) {
            voiceChk.checked = false;
        }
    }

    if (containers.autoAdvance) {
        const isAutoAdvAvailable = isSpeakAvailable && isSpeakActive;
        containers.autoAdvance.style.display = isAutoAdvAvailable ? 'flex' : 'none';
        if (!isAutoAdvAvailable && autoAdvChk) {
            autoAdvChk.checked = false;
        }
    }

    // Listener per sblocco voce su mobile al tocco della checkbox
    if (chk && !chk.dataset.listenerAdded) {
        chk.dataset.listenerAdded = "true";
        chk.addEventListener('change', () => {
            if (chk.checked && ('speechSynthesis' in window)) {
                console.log("TTS: Unlocking audio on checkbox toggle...");
                const unlock = new SpeechSynthesisUtterance(" ");
                unlock.volume = 0.001;
                window.speechSynthesis.speak(unlock);
            }
            // Aggiorna istantaneamente la visualizzazione di Risposta Vocale e Avanzamento Auto
            if (typeof window.checkGameTypeUI === 'function') {
                window.checkGameTypeUI();
            }
        });
    }

    if (isTx && containers.koch) {
    }

    if (containers.arcadeBtn) {
        containers.arcadeBtn.style.display = isArcadeType ? 'block' : 'none';
        if (isArcadeType) {
            if (selectedMode === 'la_torre') {
                containers.arcadeBtn.textContent = currentLang === 'it' ? "SCALA LA TORRE 🗼" : "CLIMB THE TOWER 🗼";
            } else if (selectedMode === 'memory_cw') {
                containers.arcadeBtn.textContent = currentLang === 'it' ? "GIOCA MEMORY CW 🧩" : "PLAY MEMORY CW 🧩";
            } else {
                containers.arcadeBtn.textContent = currentLang === 'it' ? "GIOCA SUBITO ARCADE 🕹️" : "PLAY ARCADE NOW 🕹️";
            }
        }
    }
                containers.arcadeBtn.textContent = currentLang === 'it' ? "GIOCA SUBITO ARCADE 🕹️" : "PLAY ARCADE NOW 🕹️";
            }
        }
    }

    if (containers.btn) {
        if (isArcadeType) {
            containers.btn.style.display = 'none';
        } else {
            containers.btn.style.display = 'block';
            if (isCoop) containers.btn.textContent = currentLang === 'it' ? "Crea Stanza Co-op ⚔️" : "Create Co-op Room ⚔️";
            else if (isTrn) containers.btn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
            else if (isTx && selectedMode !== 'code_groups' && selectedMode !== 'standard') containers.btn.textContent = currentLang === 'it' ? "ENTRA IN STAZIONE 📻" : "ENTER STATION 📻";
            else containers.btn.textContent = (isSingle || isTx) ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
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
    if (typeof window.updateDictionary === 'function') {
        window.updateDictionary();
    }
    const t = i18n[lang] || i18n.it;

    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = lang.toUpperCase();

    const textMap = {
        txt_hello: t.hello,
        txt_game_type_label: t.game_type, txt_mode_label: t.mode,
        txt_opt_multi: t.opt_multi, txt_opt_single: t.opt_single,
        txt_opt_coop: t.opt_coop, txt_opt_trn: t.opt_trn, txt_opt_arcade: t.opt_arcade, txt_opt_tx: t.opt_tx,
        txt_opt_std: t.opt_std, txt_opt_call: t.opt_call, txt_opt_pp: t.opt_pp,
        txt_opt_qso: t.opt_qso,
        txt_wpm_label: t.wpm,
        txt_words_label: t.words, txt_tone_label: t.tone,
        txt_word_len_label: t.word_len, txt_word_len_any: t.word_len_any,
        txt_voice_answer: t.voice_answer,
        txt_fixed_speed: t.fixed, txt_easy_mode: t.easy,
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
        tabMonthlyAct: t.monthly, tabTeamGestBtn: t.tab_my_team, tabAllTeamsBtn: t.tab_all_teams,
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
