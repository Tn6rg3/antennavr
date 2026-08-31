// js/rating_manager.js

window.getGameRatingKey = function() {
    const mode = window.window.currentMode || 'standard';
    const type = window.isSinglePlayer ? 'single' : (window.isCoopMode ? 'coop' : 'multi');
    return `${mode}_${type}`;
};

window.checkGameRating = function() {
    if (!myId) return;
    const key = window.getGameRatingKey();

    // Non chiediamo il voto per il corso o modalità temporanee
    if (key.startsWith('course') || key.startsWith('spectator')) return;

    db.ref(`users/${myId}/ratings/${key}`).once('value', snap => {
        if (!snap.exists()) {
            const modal = document.getElementById('gameRatingModal');
            if (modal) {
                const title = document.getElementById('ratingTitle');
                const modeCfg = window.GAME_MODES[window.window.currentMode];
                if (title && modeCfg) {
                    title.textContent = `Ti piace "${modeCfg.titleIt}"?`;
                }
                modal.style.display = 'flex';
            }
        }
    });
};

window.submitGameRating = function(vote) {
    if (!myId) return;
    const key = window.getGameRatingKey();
    const modal = document.getElementById('gameRatingModal');

    if (modal) modal.style.display = 'none';

    // 1. Salviamo il voto dell'utente
    db.ref(`users/${myId}/ratings/${key}`).set(vote).then(() => {
        // 2. Aggiorniamo le statistiche globali (incremento anonimo)
        db.ref(`ratings/stats/${key}/${vote}`).set(firebase.database.ServerValue.increment(1));
        showToast(vote === 'up' ? "Grazie per il feedback! 👍" : "Grazie per il feedback! 👎");
    });
};

window.loadUserRatings = function() {
    const container = document.getElementById('userRatingsList');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; opacity:0.5;">Caricamento voti...</p>';

    db.ref(`users/${myId}/ratings`).once('value', snap => {
        container.innerHTML = '';
        if (!snap.exists()) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:0.8em;">Non hai ancora espresso valutazioni.</p>';
            return;
        }

        const ratings = snap.val();
        Object.entries(ratings).forEach(([key, vote]) => {
            const [mode, type] = key.split('_');
            const modeCfg = window.GAME_MODES[mode];
            if (!modeCfg) return;

            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.05);";

            const info = document.createElement('div');
            info.innerHTML = `<b style="color:var(--link-color)">${modeCfg.titleIt}</b><br><small style="opacity:0.6; font-size:0.75em;">Modo: ${type.toUpperCase()}</small>`;

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '10px';

            const btnUp = document.createElement('button');
            btnUp.innerHTML = '👍';
            btnUp.style.cssText = `background:none; border:none; font-size:1.2em; cursor:pointer; opacity:${vote === 'up' ? '1' : '0.3'}; transform:${vote === 'up' ? 'scale(1.2)' : 'scale(1)'};`;
            btnUp.onclick = () => window.updateRating(key, 'up');

            const btnDown = document.createElement('button');
            btnDown.innerHTML = '👎';
            btnDown.style.cssText = `background:none; border:none; font-size:1.2em; cursor:pointer; opacity:${vote === 'down' ? '1' : '0.3'}; transform:${vote === 'down' ? 'scale(1.2)' : 'scale(1)'};`;
            btnDown.onclick = () => window.updateRating(key, 'down');

            actions.appendChild(btnUp);
            actions.appendChild(btnDown);
            div.appendChild(info);
            div.appendChild(actions);
            container.appendChild(div);
        });
    });
};

window.updateRating = function(key, newVote) {
    db.ref(`users/${myId}/ratings/${key}`).once('value', snap => {
        const oldVote = snap.val();
        if (oldVote === newVote) return;

        // Aggiorniamo il voto dell'utente
        db.ref(`users/${myId}/ratings/${key}`).set(newVote).then(() => {
            // Decrementiamo il vecchio contatore globale e incrementiamo il nuovo
            const updates = {};
            updates[`ratings/stats/${key}/${oldVote}`] = firebase.database.ServerValue.increment(-1);
            updates[`ratings/stats/${key}/${newVote}`] = firebase.database.ServerValue.increment(1);
            db.ref().update(updates);

            window.loadUserRatings();
            showToast("Valutazione aggiornata!");
        });
    });
};
