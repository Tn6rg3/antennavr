// ============================================================================
// I18N.JS - TRADUZIONI E GESTIONE LINGUA
// ============================================================================

const i18n = {
    it: {
        hello: "Ciao", lb: "Classifica", profile: "Profilo", activity: "Attività", conn_secure: "Connessione sicura in corso...",
        free_challenge: "⚡ Sfida Libera", play_solo: "Gioca da Solo o Sfida un Amico",
        game_type: "Tipo di Gioco:", mode: "Modalità:", wpm: "WPM:", words: "Parole:", tone: "Tono:", timeout: "Scadenza Stanza (min):",
        opt_multi: "Multiplayer (con Lobby)", opt_single: "Singleplayer (Immediata)",
        opt_std: "Parole Comuni", opt_call: "Nominativi (CW Freak)", opt_pp: "Ping Pong",
        opt_custom: "Personale", fixed: "Fissa", easy: "Semplice", create_room: "Inizia Partita Libera", play_now: "Gioca Subito",
        challenge_board: "Bacheca Sfide ⏳", no_challenges: "Nessuna sfida.",
        online_users: "Utenti Online 🟢", global_chat: "💬 Chat", you_are_alone: "Sei solo.",
        profile_title: "👤 Profilo e Statistiche", alias_label: "Il tuo Alias", save: "Salva", alias_hint: "L'alias sostituirà il tuo nome Telegram nelle classifiche e nelle squadre.",
        privacy_label: "Nascondi mio username Telegram", privacy_hint: "Se attivo, nessuno potrà cliccare sul tuo nome per vedere il tuo profilo. L'Alias diventa obbligatorio.",
        wrong_chars: "📈 Caratteri più sbagliati", wpm_error: "⚠️ Errori per WPM", match_history: "📜 Storico Partite", loading: "Caricamento...",
        back_to_menu: "Torna al Menu Principale", daily: "Oggi", weekly: "Settimana", monthly: "Mese", medals: "Le Mie Medaglie",
        finished: "Concluso", winner: "Vincitore", points: "Punti", history: "Storico Partite",
        chat_title: "💬 Chat", chat_clear: "Cancella", chat_close: "Chiudi", chat_send: "Invia", chat_placeholder: "Scrivi un messaggio...",
        lobby_players: "Giocatori presenti:", lobby_chat: "💬 Chat di Stanza", lobby_invite: "📢 Invita Amici su Telegram",
        act_title: "Classifica Attività", act_loading: "Caricamento...", act_no_data: "Nessuna attività registrata.",
        prepare: "Preparati!", start_via: "VIA!", game_chat: "💬 Chat", quit_game: "Abbandona",
        input_placeholder: "Digita qui...", replay: "🔁 Riascolta", th_typed: "Scritto", th_real: "Reale", th_pts: "Punti",
        teams_btn: "🏆 TORNEI A SQUADRE", delete_data: "🗑️ Elimina Definitivamente i miei Dati",
        tab_this_match: "Questa Partita", tab_trn_lb: "Classifica Tornei", tab_callsigns: "Nominativi", tab_pingpong: "Ping Pong", tab_std_multi: "Parole (Multi)", tab_std_single: "Parole (Single)",
        btn_start_match: "AVVIA PARTITA", btn_delete_room: "ELIMINA STANZA", btn_leave_lobby: "Esci dalla Stanza",
        status_host: "Sei l'Host della partita.", status_guest: "Sei un partecipante. Attendi il via.", lobby_free: "Lobby Stanza Libera", lobby_trn: "Lobby Incontro Torneo 🥊",
        ready_btn: "SONO PRONTO ✅", waiting_host: "In attesa che l'Host avvii...",
        tab_my_team: "La mia Squadra", tab_all_teams: "Tutte le Squadre", tab_tournaments: "I Tornei",
        custom_title: "Dizionario Personale 📖", custom_desc: "Carica un file di testo (.txt) con le tue parole personalizzate.",
        select_file: "Scegli File .txt", custom_hint1: "Le parole possono essere separate da spazio, virgola o a capo.",
        custom_hint2: "Verranno ignorate le parole più corte di 3 caratteri.", custom_hint3: "Il dizionario rimarrà salvato in locale.",
        no_file: "Nessun file caricato.", loaded_words: "Parole caricate: ", manage_custom: "⚙️ Gestisci Dizionario Personale"
    },
    en: {
        hello: "Hello", lb: "Leaderboard", profile: "Profile", activity: "Activity", conn_secure: "Secure connection in progress...",
        free_challenge: "⚡ Free Challenge", play_solo: "Play Solo or Challenge a Friend",
        game_type: "Game Type:", mode: "Mode:", wpm: "WPM:", words: "Words:", tone: "Tone:", timeout: "Room Timeout (min):",
        opt_multi: "Multiplayer (Lobby)", opt_single: "Singleplayer (Immediate)",
        opt_std: "Common Words", opt_call: "Callsigns (CW Freak)", opt_pp: "Ping Pong",
        opt_custom: "Personal", fixed: "Fixed", easy: "Easy", create_room: "Start Free Match", play_now: "Play Now",
        challenge_board: "Challenge Board ⏳", no_challenges: "No challenges.",
        online_users: "Online Users 🟢", global_chat: "💬 Chat", you_are_alone: "You are alone.",
        profile_title: "👤 Profile and Statistics", alias_label: "Your Alias", save: "Save", alias_hint: "The alias will replace your Telegram name in leaderboards and teams.",
        privacy_label: "Hide my Telegram username", privacy_hint: "If active, no one can click your name to see your profile. Alias becomes mandatory.",
        wrong_chars: "📈 Most Mistaken Characters", wpm_error: "⚠️ Errors per WPM", match_history: "📜 Match History", loading: "Loading...",
        back_to_menu: "Back to Main Menu", daily: "Today", weekly: "Week", monthly: "Month", medals: "My Medals",
        finished: "Finished", winner: "Winner", points: "Points", history: "Match History",
        chat_title: "💬 Chat", chat_clear: "Clear", chat_close: "Close", chat_send: "Send", chat_placeholder: "Type a message...",
        lobby_players: "Players present:", lobby_chat: "💬 Room Chat", lobby_invite: "📢 Invite Friends on Telegram",
        act_title: "Activity Rankings", act_loading: "Loading...", act_no_data: "No activity recorded.",
        prepare: "Get Ready!", start_via: "GO!", game_chat: "💬 Chat", quit_game: "Quit",
        input_placeholder: "Type here...", replay: "🔁 Replay", th_typed: "Typed", th_real: "Real", th_pts: "Points",
        teams_btn: "🏆 TEAM TOURNAMENTS", delete_data: "🗑️ Permanently Delete My Data",
        tab_this_match: "This Match", tab_trn_lb: "Tournament Leaderboard", tab_callsigns: "Callsigns", tab_pingpong: "Ping Pong", tab_std_multi: "Words (Multi)", tab_std_single: "Words (Single)",
        btn_start_match: "START MATCH", btn_delete_room: "DELETE ROOM", btn_leave_lobby: "Leave Lobby",
        status_host: "You are the Match Host.", status_guest: "You are a participant. Wait for the start.", lobby_free: "Free Room Lobby", lobby_trn: "Tournament Match Lobby 🥊",
        ready_btn: "I AM READY ✅", waiting_host: "Waiting for Host to start...",
        tab_my_team: "My Team", tab_all_teams: "All Teams", tab_tournaments: "Tournaments",
        custom_title: "Personal Dictionary 📖", custom_desc: "Upload a text file (.txt) with your custom words.",
        select_file: "Choose .txt File", custom_hint1: "Words can be separated by spaces, commas, or newlines.",
        custom_hint2: "Words shorter than 3 characters will be ignored.", custom_hint3: "The dictionary will be saved locally.",
        no_file: "No file uploaded.", loaded_words: "Words loaded: ", manage_custom: "⚙️ Manage Personal Dictionary"
    }
};

window.toggleLanguage = function() {
    const newLang = (currentLang === 'it') ? 'en' : 'it';
    setLanguage(newLang);
    updateDictionary();
    showToast(newLang === 'it' ? "Lingua: Italiano" : "Language: English");
};

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('gameLang', lang);
    const t = i18n[lang] || i18n.it;
    if (els.langBtn) els.langBtn.textContent = lang.toUpperCase();

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
        if (els[key]) els[key].textContent = textMap[key];
    }

    if (els.txt_lb_btn) els.txt_lb_btn.textContent = "🏆 " + t.lb;
    if (els.txt_profile_btn) els.txt_profile_btn.textContent = "👤 " + t.profile;
    if (els.txt_act_btn) els.txt_act_btn.textContent = "🏅 " + t.activity;

    populateGameModesUI();
    checkGameTypeUI();
    updateMuteBtnUI();
}

function updateMuteBtnUI() {
    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.textContent = isGlobalChatMuted
            ? (currentLang === 'it' ? "🔇 Notifiche Disattivate" : "🔇 Notifications Muted")
            : (currentLang === 'it' ? "🔊 Notifiche Attive" : "🔊 Notifications Active");
    }
}
