// js/rating_manager.js

window.getGameRatingKey = function() {
    const mode = window.currentMode || 'standard';
    const type = window.isSinglePlayer ? 'single' : (window.isCoopMode ? 'coop' : 'multi');
    return `${mode}_${type}`;
};

window.checkGameRating = function() {
    console.log("Rating: Checking if modal should be shown...");
    if (!window.myId || !window.db) { console.warn("Rating: Missing ID or DB"); return; }
    const key = window.getGameRatingKey();
    console.log("Rating: Mode Key ->", key, " (Single:", window.isSinglePlayer, "Mode:", window.currentMode, ")");

    // Non chiediamo il voto per il corso, modalità spettatore o sfida giornaliera
    if (key.startsWith('course') || key.startsWith('spectator') || key.startsWith('daily_challenge')) return;

    window.db.ref(`users/${window.myId}/ratings/${key}`).once('value', snap => {
        if (!snap.exists()) {
            console.log("Rating: User hasn't rated yet, showing modal.");
            const modal = document.getElementById('gameRatingModal');
            if (modal) {
                const title = document.getElementById('ratingTitle');
                const modeName = window.GAME_MODES[window.currentMode]?.titleIt || window.currentMode;
                const typeName = window.isSinglePlayer ? "Singolo" : (window.isCoopMode ? "Co-op" : "Multiplayer");

                if (title) {
                    title.textContent = `Ti piace "${modeName}" (${typeName})?`;
                }
                modal.style.display = 'flex';
            } else {
                console.error("Rating: Modal element NOT FOUND!");
            }
        } else {
            console.log("Rating: User already rated this combination.");
        }
    });
};

window.submitGameRating = function(vote) {
    if (!window.myId || !window.db) return;
    const key = window.getGameRatingKey();
    const modal = document.getElementById('gameRatingModal');

    if (modal) modal.style.display = 'none';

    // 1. Salviamo il voto dell'utente
    window.db.ref(`users/${window.myId}/ratings/${key}`).set(vote).then(() => {
        // 2. Aggiorniamo le statistiche globali (incremento anonimo)
        window.db.ref(`ratings/stats/${key}/${vote}`).set(firebase.database.ServerValue.increment(1));
        showToast(vote === 'up' ? "Grazie per il feedback! 👍" : "Grazie per il feedback! 👎");
    });
};

window.loadUserRatings = function() {
    const container = document.getElementById('userRatingsList');
    if (!container || !window.myId || !window.db) return;

    container.innerHTML = '<p style="text-align:center; opacity:0.5;">Caricamento voti...</p>';

    window.db.ref(`users/${window.myId}/ratings`).once('value', snap => {
        container.innerHTML = '';
        if (!snap.exists()) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:0.8em;">Non hai ancora espresso valutazioni.</p>';
            return;
        }

        const ratings = snap.val();
        Object.entries(ratings).forEach(([key, vote]) => {
            const parts = key.split('_');
            const type = parts.pop();
            const mode = parts.join('_');

            const modeCfg = window.GAME_MODES[mode];
            if (!modeCfg) return;

            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:rgba(255,255,255,0.05); border-radius:10px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05); gap:10px;";

            const info = document.createElement('div');
            info.style.cssText = "flex: 1; min-width: 0; text-align: left;";
            info.innerHTML = `<b style="color:var(--link-color); font-size:0.9em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${modeCfg.titleIt}</b><small style="opacity:0.6; font-size:0.7em;">${type.toUpperCase()}</small>`;

            const actions = document.createElement('div');
            actions.style.cssText = "display:flex; gap:5px; flex-shrink:0; background:rgba(0,0,0,0.2); padding:4px 8px; border-radius:20px;";

            const btnUp = document.createElement('button');
            btnUp.innerHTML = '👍';
            btnUp.style.cssText = `background:none; border:none; font-size:1.1em; cursor:pointer; padding:2px; transition:all 0.2s; opacity:${vote === 'up' ? '1' : '0.2'}; transform:${vote === 'up' ? 'scale(1.2)' : 'scale(1)'};`;
            btnUp.onclick = () => window.updateRating(key, 'up');

            const btnDown = document.createElement('button');
            btnDown.innerHTML = '👎';
            btnDown.style.cssText = `background:none; border:none; font-size:1.1em; cursor:pointer; padding:2px; transition:all 0.2s; opacity:${vote === 'down' ? '1' : '0.2'}; transform:${vote === 'down' ? 'scale(1.2)' : 'scale(1)'};`;
            btnDown.onclick = () => window.updateRating(key, 'down');

            actions.appendChild(btnUp);
            actions.appendChild(btnDown);
            div.appendChild(info);
            div.appendChild(actions);
            container.appendChild(div);
        });
    });
};

window.displayGlobalRatings = function() {
    if (!window.db) return;
    window.db.ref('ratings/stats').once('value', snap => {
        const stats = snap.val() || {};
        const modeSelect = document.getElementById('gameModeInput');
        if (!modeSelect) return;

        Array.from(modeSelect.options).forEach(opt => {
            const mode = opt.value;
            const gameType = document.getElementById('gameTypeInput')?.value;
            const type = gameType === 'single' ? 'single' : (gameType === 'coop' ? 'coop' : 'multi');
            const key = `${mode}_${type}`;

            if (stats[key]) {
                const ups = stats[key].up || 0;
                if (ups > 0) {
                    const baseText = opt.textContent.split(' 👍')[0];
                    opt.textContent = `${baseText} 👍 ${ups}`;
                }
            }
        });
    });
};

window.updateRating = function(key, newVote) {
    if (!window.myId || !window.db) return;
    window.db.ref(`users/${window.myId}/ratings/${key}`).once('value', snap => {
        const oldVote = snap.val();
        if (oldVote === newVote) return;

        window.db.ref(`users/${window.myId}/ratings/${key}`).set(newVote).then(() => {
            const updates = {};
            updates[`ratings/stats/${key}/${oldVote}`] = firebase.database.ServerValue.increment(-1);
            updates[`ratings/stats/${key}/${newVote}`] = firebase.database.ServerValue.increment(1);
            window.db.ref().update(updates);

            window.loadUserRatings();
            showToast("Valutazione aggiornata!");
        });
    });
};

// Caricamento statistiche all'avvio del menu
setTimeout(() => {
    if (typeof window.displayGlobalRatings === 'function') window.displayGlobalRatings();
}, 3000);
