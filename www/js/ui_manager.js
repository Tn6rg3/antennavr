// ============================================================================
// UI_MANAGER.JS - GESTIONE SCHERMATE, NAVIGAZIONE E MODALI
// ============================================================================

function showScreen(screenId) {
    clearAllTimers();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');

    hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';

    const isPlayingScreen = ['lobbyScreen', 'gameArea', 'countdownScreen', 'quizArea', 'brScreen'].includes(screenId);

    if (db && myId) {
        try {
            db.ref(`presence/${myId}`).update({ status: isPlayingScreen ? 'playing' : 'online' });
        } catch(e) {}
    }

    if (screenId === 'setupScreen') {
        const lastRoom = localStorage.getItem(STORAGE_ROOM_KEY);
        if (!lastRoom && els.rejoinContainer) {
            els.rejoinContainer.style.display = 'none';
        } else if (lastRoom && els.rejoinContainer) {
            els.rejoinContainer.style.display = 'block';
            if (els.rejoinGameBtn) {
                els.rejoinGameBtn.onclick = () => {
                    roomCode = lastRoom;
                    isRejoining = true;
                    joinRoomLogic(false);
                };
            }
        }

        listenToOnlineUsers();
        listenToRooms();
    } else {
        if (listeners.presence && listeners.presence.ref) {
            listeners.presence.ref.off('child_added', listeners.presence.onAdded);
            listeners.presence.ref.off('child_changed', listeners.presence.onChanged);
            listeners.presence.ref.off('child_removed', listeners.presence.onRemoved);
            listeners.presence = null;
        }
        if (listeners.roomsList && listeners.roomsList.ref) {
            listeners.roomsList.ref.off('child_added', listeners.roomsList.onAdded);
            listeners.roomsList.ref.off('child_changed', listeners.roomsList.onChanged);
            listeners.roomsList.ref.off('child_removed', listeners.roomsList.onRemoved);
            listeners.roomsList = null;
        }
    }

    if (isPlayingScreen) {
        if (listeners.activeChat['chatMessages']) {
            listeners.activeChat['chatMessages'].ref.off('value', listeners.activeChat['chatMessages'].callback);
            delete listeners.activeChat['chatMessages'];
        }
        if (screenId === 'lobbyScreen' || screenId === 'gameArea') {
            activeChatContext = 'room';
            listenToChat();
        } else {
            activeChatContext = null;
        }
    } else if (screenId === 'teamsScreen') {
        activeChatContext = 'team';
        checkMyTeamStatus();
    } else {
        if (screenId === 'participationScreen') { switchActTab('daily'); }
        if (activeChatContext !== 'global') {
            activeChatContext = 'global';
            listenToChat();
        }
    }
}

window.goBackToMenu = function() {
    if (activeChatContext !== 'team') hideChat();
    if (els.matchDetailsModal) els.matchDetailsModal.style.display = 'none';
    if (els.inviteModal) els.inviteModal.style.display = 'none';

    showScreen('setupScreen');
};

function populateGameModesUI() {
    if (!els.gameModeInput) return;
    const select = els.gameModeInput;
    const trnGroup = els.trn_opt_group;
    const currentVal = select.value || 'standard';
    select.innerHTML = '';

    Object.values(window.GAME_MODES || {}).forEach(mode => {
        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.id = 'txt_opt_' + mode.id;
        opt.textContent = currentLang === 'en' ? mode.titleEn : mode.titleIt;
        select.appendChild(opt);
    });

    if (trnGroup) select.appendChild(trnGroup);
    if (window.GAME_MODES && window.GAME_MODES[currentVal]) select.value = currentVal;
    else select.value = 'standard';
}

function checkGameTypeUI() {
    const isSingle = els.gameTypeInput.value === 'single';
    const isTrn = els.gameTypeInput.value === 'tournament';
    const isCoop = els.gameTypeInput.value === 'coop';
    const select = els.gameModeInput;
    const currentVal = select.value;

    select.innerHTML = '';

    if (isCoop) {
        const opt = document.createElement('option');
        opt.value = "conquest";
        opt.textContent = currentLang === 'en' ? "Conquest (Co-op) ⚔️" : "Conquista (Co-op) ⚔️";
        select.appendChild(opt);
        select.value = "conquest";
    } else if (isTrn) {
        const trnOptions = [
            { val: "trn_create_team", it: "Fonda Squadra", en: "Create Team" },
            { val: "trn_join_team", it: "Unisciti a Squadra", en: "Join Team" },
            { val: "trn_create_trn", it: "Crea Nuovo Torneo", en: "Create Tournament" }
        ];
        trnOptions.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.val;
            opt.textContent = currentLang === 'en' ? item.en : item.it;
            select.appendChild(opt);
        });
        select.value = currentVal.startsWith('trn_') ? currentVal : "trn_join_team";
    } else {
        Object.values(window.GAME_MODES || {}).forEach(mode => {
            if (mode.id !== 'conquest') {
                const opt = document.createElement('option');
                opt.value = mode.id;
                opt.id = 'txt_opt_' + mode.id;
                opt.textContent = currentLang === 'en' ? mode.titleEn : mode.titleIt;
                select.appendChild(opt);
            }
        });
        select.value = (currentVal === 'conquest' || currentVal.startsWith('trn_')) ? 'standard' : (currentVal || 'standard');
    }

    const selectedMode = select.value;
    const modeCfg = window.GAME_MODES ? window.GAME_MODES[selectedMode] : null;
    const isCustom = selectedMode === 'custom';

    els.timeoutDiv.style.display = (isSingle || isTrn) ? 'none' : 'block';

    if (modeCfg) {
        els.fixedSpeedContainer.style.display = (isSingle && modeCfg.fixedSpeedAllowed) ? 'flex' : 'none';
        els.easyModeContainer.style.display = isSingle ? 'flex' : 'none';
        if (els.advancedSpacingContainer) {
            els.advancedSpacingContainer.style.display = (isSingle && modeCfg.spacingConfigurable) ? 'flex' : 'none';
        }
        if (els.startWpmInput) {
            els.startWpmInput.disabled = (modeCfg.wpmConfigurable === false);
            if (modeCfg.wpmConfigurable === false && modeCfg.defaultWpm) els.startWpmInput.value = modeCfg.defaultWpm;
        }
        if (els.wordCountInput) {
            els.wordCountInput.disabled = (modeCfg.wordCountConfigurable === false);
            if (modeCfg.wordCountConfigurable === false && modeCfg.defaultWordCount) els.wordCountInput.value = modeCfg.defaultWordCount;
        }
    }

    if (els.customDictControl) els.customDictControl.style.display = (isSingle && isCustom) ? 'flex' : 'none';
    if (els.spectatorContainer) els.spectatorContainer.style.display = isSingle ? 'flex' : 'none';

    if (isCoop) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Crea Stanza Co-op ⚔️" : "Create Co-op Room ⚔️";
    } else if (isTrn) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
    } else {
        els.createRoomBtn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
    }
}

// --- CARICAMENTO REGOLAMENTO E PRIVACY ---
async function loadRegolamento() {
    if (!els.regolamentoContainer) return;
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error("File regolamento non trovato");
        els.regolamentoContainer.innerHTML = await response.text();

        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = function() {
                const text = encodeURIComponent("💡 Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
                const shareUrl = `https://t.me/share/url?text=${text}`;
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(shareUrl);
                } else {
                    window.open(shareUrl, '_blank');
                }
            };
        }
    } catch (e) {
        els.regolamentoContainer.innerHTML = `
            <div style="text-align:center; padding: 15px;">
                <h3 style="color: var(--champ-color); margin-top:0;">📜 Regole di Gioco</h3>
                <p style="font-size:0.9em;">Decodifica il codice Morse nel minor tempo possibile e scala le classifiche!</p>
                <ul style="text-align:left; font-size:0.85em; color: var(--text-color); margin-top:10px;">
                    <li><b>Parole Comuni & Nominativi:</b> Più sei veloce e preciso, più punti ottieni.</li>
                    <li><b>Conquista (Co-op):</b> Collabora con la tua squadra per portare la barra al 100%.</li>
                    <li><b>Battaglia Serale:</b> Ogni giorno alle 21:30 ad eliminazione diretta (3 vite).</li>
                </ul>
                <hr style="border:0; border-top:1px dashed var(--hint-color); margin:15px 0;">
                <p style="font-size:0.75em; color:var(--hint-color);">
                    <i>Nota: Impossibile caricare il file regolamento.html esteso (${e.message}).</i>
                </p>
            </div>
        `;
    }
}
