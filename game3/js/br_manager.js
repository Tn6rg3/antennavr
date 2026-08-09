// js/br_manager.js

const BR_H_BANNER = 9;
const BR_M_BANNER = 54;
const BR_H_START = 21;
const BR_M_START = 30;

let brRoomCode = "";
let brIsPlaying = false, brAmIAlive = true;

window.initBattleRoyaleScheduler = function() {
    window.checkBattleTime();
    if (brCheckInterval) clearInterval(brCheckInterval);
    brCheckInterval = setInterval(window.checkBattleTime, 100000);
};

window.toggleBattleRoyaleJoin = function() {
    if (!brRoomCode) {
        const now = new Date(Date.now() + serverTimeOffset);
        const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
        brRoomCode = "BR_" + dKey;
    }

    db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', pSnap => {
        if (pSnap.exists()) {
            db.ref(`rooms/${brRoomCode}/players/${myId}`).remove().then(() => {
                showToast("Ti sei ritirato dalla sfida serale.");
            });
        } else {
            db.ref(`rooms/${brRoomCode}`).update({
                status: 'enrolling',
                type: 'battle_royale',
                wpm: 25,
                round: 0,
                hostId: myId,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

            db.ref(`rooms/${brRoomCode}/players/${myId}`).set({
                name: myName,
                lives: 3,
                status: 'Iscritto ⏳',
                answered: false
            }).then(() => {
                showToast("⚔️ Iscrizione registrata! Il banner è ora verde.");
            });
        }
    });
};

window.checkBattleTime = function() {
    if (gameRunning || brIsPlaying || brBannerDismissedToday) return;

    const now = new Date(Date.now() + serverTimeOffset);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const bannerTotalMinutes = BR_H_BANNER * 60 + BR_M_BANNER;
    const startTotalMinutes = BR_H_START * 60 + BR_M_START;

    const isTime = (currentTotalMinutes >= bannerTotalMinutes && currentTotalMinutes < startTotalMinutes);

    const dKey = now.toISOString().split('T')[0].replace(/-/g, '');
    brRoomCode = "BR_" + dKey;

    if (isTime) {
        if (els.brBanner && els.brBanner.style.display === 'none') {
            els.brBanner.style.display = 'block';

            if (brBannerTimeout) clearTimeout(brBannerTimeout);
            brBannerTimeout = setTimeout(() => {
                if (els.brBanner) els.brBanner.style.display = 'none';
                brBannerDismissedToday = true;
                db.ref(`rooms/${brRoomCode}/players`).off('value');
            }, 10000);
        }

        if (els.btnJoinBR) {
            els.btnJoinBR.onclick = () => {
                window.toggleBattleRoyaleJoin();
                if (brBannerTimeout) clearTimeout(brBannerTimeout);
                brBannerTimeout = setTimeout(() => {
                    if (els.brBanner) els.brBanner.style.display = 'none';
                    brBannerDismissedToday = true;
                    db.ref(`rooms/${brRoomCode}/players`).off('value');
                }, 10000);
            };
        }

        db.ref(`rooms/${brRoomCode}/players`).on('value', snap => {
            const players = snap.val() || {};
            const count = Object.keys(players).length;

            if (els.brEnrolledCount) els.brEnrolledCount.textContent = count;
            if (els.brEnrolledCountCompact) els.brEnrolledCountCompact.textContent = count;

            if (players[myId]) {
                if (els.brBanner) {
                    els.brBanner.style.backgroundColor = '#4caf50';
                    els.brBanner.style.borderColor = '#81c784';
                    els.brBanner.style.padding = '8px 12px';
                }
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'none';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'inline-block';

                if (els.btnJoinBR) {
                    els.btnJoinBR.textContent = 'RITIRATI DALLA SFIDA';
                    els.btnJoinBR.style.color = '#4caf50';
                    els.btnJoinBR.style.width = 'auto';
                    els.btnJoinBR.style.flexGrow = '1';
                }
            } else {
                if (els.brBanner) {
                    els.brBanner.style.backgroundColor = '#e53935';
                    els.brBanner.style.borderColor = '#ff5252';
                    els.brBanner.style.padding = '15px';
                }
                if (els.brBannerFullText) els.brBannerFullText.style.display = 'block';
                if (els.brCompactCountText) els.brCompactCountText.style.display = 'none';

                if (els.btnJoinBR) {
                    els.btnJoinBR.textContent = 'PARTECIPA ALLA SFIDA';
                    els.btnJoinBR.style.color = '#e53935';
                    els.btnJoinBR.style.width = '100%';
                    els.btnJoinBR.style.flexGrow = '0';
                }
            }
        });
    } else {
        if (els.brBanner) els.brBanner.style.display = 'none';
        db.ref(`rooms/${brRoomCode}/players`).off('value');
    }

    if (currentHour === BR_H_START && currentMinute === BR_M_START) {
        db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', snap => {
            if (snap.exists() && activeTab !== "br_playing") {
                activeTab = "br_playing";
                lastBRRoundPlayed = -1;
                showScreen('brScreen');
                window.listenToBattleRoyaleRoom();
            }
        });
        window.startBattleRoyaleSystem();
    }
};

window.listenToBattleRoyaleRoom = function() {
    db.ref(`rooms/${brRoomCode}`).on('value', snap => {
        if (!snap.exists()) {
            showScreen('setupScreen');
            alert("La Battaglia è stata annullata o è terminata.");
            return;
        }
        const rData = snap.val();

        window.renderBRPlayers(rData.players || {});

        if (rData.status === 'cancelled') {
            if (els.brStatusText) els.brStatusText.textContent = "Annullata: Giocatori insufficienti (<5).";
            setTimeout(() => { showScreen('setupScreen'); activeTab = "room"; }, 4000);
            return;
        }

        if (rData.status === 'playing') {
            brIsPlaying = true;
            if (els.brWpmDisplay) els.brWpmDisplay.textContent = rData.wpm + " WPM";

            const myData = rData.players[myId];
            brAmIAlive = myData && myData.lives > 0;

            const hearts = ["💀 ELIMINATO", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
            let safeLives = myData && myData.lives ? parseInt(myData.lives) : 0;
            if (safeLives < 0) safeLives = 0;
            if (safeLives > 5) safeLives = 5;
            if (els.brLivesDisplay) els.brLivesDisplay.textContent = brAmIAlive ? hearts[safeLives] : "💀 ELIMINATO";

            if (rData.roundEndTime && rData.currentWord && rData.round !== lastBRRoundPlayed) {
                lastBRRoundPlayed = rData.round;
                window.handleBRRound(rData);
            }
        }

        if (rData.status === 'finished') {
            brIsPlaying = false;
            lastBRRoundPlayed = -1;
            if (els.brStatusText) els.brStatusText.textContent = `Partita Conclusa! Vincitore: ${rData.winner || 'Nessuno'}`;
            if (els.brInputArea) els.brInputArea.style.display = 'none';
            if (els.brTimerContainer) els.brTimerContainer.style.display = 'none';
        }
    });
};

window.renderBRPlayers = function(players) {
    if (!els.brPlayersList) return;
    els.brPlayersList.innerHTML = "";
    Object.values(players).forEach(p => {
        const li = document.createElement('li');
        li.style.cssText = "display:flex; justify-content:space-between; padding:5px; border-bottom:1px dashed rgba(255,255,255,0.1);";

        const info = document.createElement('span');
        const heartsList = ["💀", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"];
        let safePLives = p.lives ? parseInt(p.lives) : 0;
        if (safePLives < 0) safePLives = 0;
        if (safePLives > 5) safePLives = 5;
        let icon = heartsList[safePLives];

        info.innerHTML = `<b style="color:var(--link-color);">${escapeHTML(p.name)}</b> <small>${icon}</small>`;

        const status = document.createElement('span');
        status.style.fontSize = "0.85em";
        status.style.color = p.status === 'Corretto!' ? '#4caf50' : (p.status === 'Eliminato' || p.status === 'Errore!' ? '#e53935' : 'var(--hint-color)');
        status.textContent = p.status;

        li.appendChild(info); li.appendChild(status);
        els.brPlayersList.appendChild(li);
    });
};

window.startBattleRoyaleSystem = function() {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData && rData.hostId === myId) {
            const pCount = Object.keys(rData.players || {}).length;
            if (pCount < 5) {
                db.ref(`rooms/${brRoomCode}/status`).set('cancelled');
            } else {
                db.ref(`rooms/${brRoomCode}/status`).set('playing');
                window.hostNextBRRound(rData, 25, 1);
            }
        }
    });
};

window.hostNextBRRound = function(rData, wpm, roundNum) {
    const word = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase();
    const endTime = Date.now() + 30000;

    let updates = {};
    Object.keys(rData.players || {}).forEach(pid => {
        if (rData.players[pid].lives > 0) {
            updates[`players/${pid}/answered`] = false;
            updates[`players/${pid}/status`] = 'Ascolto...';
        }
    });
    updates['currentWord'] = word;
    updates['wpm'] = wpm;
    updates['round'] = roundNum;
    updates['roundEndTime'] = endTime;

    db.ref(`rooms/${brRoomCode}`).update(updates);

    setTimeout(() => window.checkBRRoundResults(wpm, roundNum), 31000);
};

window.handleBRRound = function(rData) {
    if (brTimerInterval) clearInterval(brTimerInterval);

    if (els.brStatusText) els.brStatusText.textContent = `Round ${rData.round}! Attenzione...`;

    if (brAmIAlive && !rData.players[myId].answered) {
        if (els.brInputArea) els.brInputArea.style.display = 'flex';
        if (els.brInput) {
            els.brInput.disabled = false;
            els.brInput.placeholder = "Decodifica e scrivi qui...";
            els.brInput.value = '';
            els.brInput.focus();
        }
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'block';
        playMorseAudio(rData.currentWord, rData.wpm);
    } else {
        if (els.brInputArea) els.brInputArea.style.display = 'none';
        if (els.brTimerContainer) els.brTimerContainer.style.display = 'none';
    }

    brTimerInterval = setInterval(() => {
        const left = rData.roundEndTime - Date.now();
        if (left <= 0) {
            clearInterval(brTimerInterval);
            if (els.brTimerProgress) els.brTimerProgress.style.width = '0%';
            if (brAmIAlive && !rData.players[myId].answered) window.submitBRAnswer(rData.currentWord, true);
        } else {
            if (els.brTimerProgress) {
                els.brTimerProgress.style.width = (left / 30000 * 100) + '%';
                if (left < 10000) els.brTimerProgress.style.background = '#e53935';
                else if (left < 20000) els.brTimerProgress.style.background = '#ff9800';
                else els.brTimerProgress.style.background = '#4caf50';
            }
        }
    }, 100);
};

window.submitBRAnswer = function(realWord, isTimeout) {
    if (!brAmIAlive || !els.brInput) return;
    clearInterval(brTimerInterval);

    const typed = els.brInput.value.trim().toUpperCase().substring(0, 50);

    els.brInput.placeholder = isTimeout ? "Tempo scaduto!" : "Risposta inviata! Attendi...";
    els.brInput.value = '';
    els.brInput.focus();

    const isCorrect = !isTimeout && (typed === realWord);

    db.ref(`rooms/${brRoomCode}/players/${myId}`).transaction(p => {
        if (!p) return p;
        p.answered = true;
        if (isCorrect) {
            p.status = 'Corretto!';
        } else {
            p.lives -= 1;
            p.status = p.lives === 0 ? 'Eliminato' : 'Errore!';
        }
        return p;
    });
};

window.checkBRRoundResults = function(currentWpm, currentRound) {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rData = snap.val();
        if (rData.hostId !== myId) return;

        let aliveCount = 0;
        let lastAliveName = "";

        Object.values(rData.players || {}).forEach(p => {
            if (p.lives > 0) { aliveCount++; lastAliveName = p.name; }
        });

        if (aliveCount <= 1) {
            db.ref(`rooms/${brRoomCode}/status`).set('finished');
            db.ref(`rooms/${brRoomCode}/winner`).set(aliveCount === 1 ? lastAliveName : 'Nessuno');
        } else {
            window.hostNextBRRound(rData, currentWpm + 1, currentRound + 1);
        }
    });
};
