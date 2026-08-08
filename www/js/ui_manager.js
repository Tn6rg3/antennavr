// --- PRNG E SHUFFLE PER SFIDA GIORNALIERA ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function getDailyWords(num) {
    let todayStr = new Date().toISOString().split('T')[0];
    let seed = parseInt(todayStr.replace(/-/g, ''));
    let prng = mulberry32(seed);
    let dict = [...masterDictionary];
    for (let i = dict.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [dict[i], dict[j]] = [dict[j], dict[i]];
    }
    return dict.slice(0, num).map(w => w.toUpperCase());
}

function getGameWords(num, mode) {
    if (mode === 'daily_challenge') return getDailyWords(num);
    if (window.GAME_MODES && window.GAME_MODES[mode] && typeof window.GAME_MODES[mode].generateWords === 'function') {
        return window.GAME_MODES[mode].generateWords(num, { master: masterDictionary, custom: customDictionary });
    }
    return fisherYatesShuffle(masterDictionary).slice(0, num).map(w => w.toUpperCase());
}

// --- UI E MODALITÃ€ ---
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
        opt.textContent = currentLang === 'en' ? "Conquest (Co-op) âš”ï¸" : "Conquista (Co-op) âš”ï¸";
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
    const isChars = selectedMode === 'chars';
    const isPP = selectedMode === 'pingpong';

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
        els.createRoomBtn.textContent = currentLang === 'it' ? "Crea Stanza Co-op âš”ï¸" : "Create Co-op Room âš”ï¸";
    } else if (isTrn) {
        els.createRoomBtn.textContent = currentLang === 'it' ? "Vai all'Area Tornei" : "Go to Tournaments";
    } else {
        els.createRoomBtn.textContent = isSingle ? (currentLang==='it'?"Gioca Subito":"Play Now") : (currentLang==='it'?"Inizia Partita Libera":"Start Free Match");
    }
}

if(els.gameModeInput) els.gameModeInput.addEventListener('change', e => checkGameTypeUI());
if(els.gameTypeInput) els.gameTypeInput.addEventListener('change', checkGameTypeUI);

