/**
 * MODES.JS
 * Special game modes: Conquest (Co-op), Quiz, Battle Royale
 */

// --- CONQUISTA (CO-OP) ---
function startCoopSequence() {
    isCoopMode = true; showScreen('gameArea'); if (els.coopArea) els.coopArea.style.display = 'flex'; if (els.gameInputArea) els.gameInputArea.style.display = 'flex'; if (els.pingPongSendArea) els.pingPongSendArea.style.display = 'none'; if (els.tableWrapper) els.tableWrapper.style.display = 'none';
    if (els.wpmDisplay) els.wpmDisplay.textContent = `WPM: ${currentWpm}`; if (els.scoreDisplay) els.scoreDisplay.textContent = "Obiettivo: 100%";
    coopActiveFreqIndex = 0; if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato"; if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none';
    if (els.permanentGameInput) { els.permanentGameInput.disabled = false; els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴..."; els.permanentGameInput.value = ""; }
    inputActive = false;
    if (myId === roomHostId) { const iW = generateCoopTripleWords(); db.ref(`rooms/${roomCode}/coop_state`).set({ progress: 10, timeRemaining: 300, status: 'playing', activeWords: iW, freqOwners: { 1: null, 2: null, 3: null } }); startCoopHostTimers(); }
    listenToCoopState(); setupCoopFreqButtons();
}

function generateCoopTripleWords() {
    const wE = masterDictionary.filter(w => w.length >= 3 && w.length <= 4); const wM = masterDictionary.filter(w => w.length >= 5 && w.length <= 6); const wH = masterDictionary.filter(w => w.length >= 7);
    const p = (a) => a[Math.floor(Math.random() * a.length)]?.toUpperCase() || "RADIO";
    return [p(wE), p(wM), p(wH)];
}

function startCoopHostTimers() {
    if (coopTimerInterval) clearInterval(coopTimerInterval); if (coopDecayInterval) clearInterval(coopDecayInterval);
    coopTimerInterval = setInterval(() => { db.ref(`rooms/${roomCode}/coop_state/timeRemaining`).transaction(t => { if (t === null || t <= 0) return 0; return t - 1; }); }, 1000);
    coopDecayInterval = setInterval(() => { db.ref(`rooms/${roomCode}/coop_state`).transaction(state => { if (!state || state.status !== 'playing') return state; state.progress = Math.max(0, (state.progress || 0) - 1); if (state.timeRemaining <= 0) state.status = 'lost'; return state; }); }, 2000);
}

function listenToCoopState() {
    db.ref(`rooms/${roomCode}/coop_state`).on('value', snap => {
        const s = snap.val(); if (!s || !gameRunning) return;
        if (els.coopProgressBar) els.coopProgressBar.style.width = `${s.progress}%`; if (els.coopProgressText) els.coopProgressText.textContent = `Conquista: ${s.progress}%`;
        const m = Math.floor(s.timeRemaining / 60).toString().padStart(2, '0'); const sec = (s.timeRemaining % 60).toString().padStart(2, '0'); if (els.coopTimeDisplay) els.coopTimeDisplay.textContent = `⏱️ ${m}:${sec}`;
        if (s.progress >= 100 && s.status !== 'won') { if (myId === roomHostId) db.ref(`rooms/${roomCode}/coop_state/status`).set('won'); finishCoopGame(true); return; }
        else if (s.timeRemaining <= 0 || s.status === 'lost') { finishCoopGame(false); return; }
        const o = s.freqOwners || { 1: null, 2: null, 3: null };
        [1, 2, 3].forEach(n => {
            const btn = els[`btnCoopFreq${n}`]; const oD = els[`coopOwner${n}`]; const oI = o[n]; if (!btn || !oD) return;
            if (!oI) { btn.disabled = false; btn.style.opacity = "1"; oD.textContent = "LIBERA"; oD.style.color = "var(--hint-color)"; }
            else if (oI === myId) { btn.disabled = false; btn.style.opacity = "1"; oD.textContent = "🔒 IN USO DA TE"; oD.style.color = "#4caf50"; }
            else { btn.disabled = true; btn.style.opacity = "0.4"; db.ref(`rooms/${roomCode}/players/${oI}/name`).once('value', s => { oD.textContent = `🔒 ${s.val() || 'ALTRO'}`; }); oD.style.color = "#ff9800"; }
        });
        if (coopActiveFreqIndex > 0 && o[coopActiveFreqIndex] === myId && s.activeWords && s.activeWords.length === 3) {
            const cFW = s.activeWords[coopActiveFreqIndex - 1]; if (cFW && cFW !== gameWords[0]) { gameWords[0] = cFW; inputActive = true; stopAllMorseAudio(); playMorseAudio(cFW, currentWpm); if (els.permanentGameInput) { els.permanentGameInput.value = ""; els.permanentGameInput.focus(); } }
        }
    });
}

function setupCoopFreqButtons() {
    const l = ["🟢 FREQ 1 (3-4 car.)", "🟡 FREQ 2 (5-6 car.)", "🔴 FREQ 3 (7+ car.)"];
    [1, 2, 3].forEach(n => {
        const btn = els[`btnCoopFreq${n}`]; if (!btn) return;
        btn.onclick = () => {
            db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(o => { if (!o) o = { 1: null, 2: null, 3: null }; if (o[n] && o[n] !== myId) return undefined; [1, 2, 3].forEach(x => { if (o[x] === myId) o[x] = null; }); o[n] = myId; return o; }, (err, comm, snap) => {
                if (comm) {
                    const lO = snap.val() || {}; coopActiveFreqIndex = n; if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = `Canale: ${l[n - 1]}`; if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'inline-block';
                    if (els.permanentGameInput) { els.permanentGameInput.disabled = false; els.permanentGameInput.placeholder = "Digita qui..."; els.permanentGameInput.focus(); }
                    inputActive = true; db.ref(`rooms/${roomCode}/coop_state/activeWords`).once('value', s => { const w = s.val(); if (w && w[n - 1] && lO[n] === myId) { gameWords[0] = w[n - 1]; stopAllMorseAudio(); playMorseAudio(w[n - 1], currentWpm); if (els.permanentGameInput) els.permanentGameInput.focus(); } });
                } else showToast("⚠️ Frequenza occupata da un compagno!");
            });
        };
    });
    if (els.btnCoopReleaseFreq) { els.btnCoopReleaseFreq.onclick = () => { db.ref(`rooms/${roomCode}/coop_state/freqOwners`).transaction(o => { if (!o) return o; [1, 2, 3].forEach(n => { if (o[n] === myId) o[n] = null; }); return o; }, () => { coopActiveFreqIndex = 0; inputActive = false; stopAllMorseAudio(); if (els.permanentGameInput) { els.permanentGameInput.placeholder = "Seleziona prima una Frequenza 🟢🟡🔴..."; els.permanentGameInput.value = ""; } if (els.coopActiveFreqLabel) els.coopActiveFreqLabel.textContent = "Canale: Nessuno selezionato"; if (els.btnCoopReleaseFreq) els.btnCoopReleaseFreq.style.display = 'none'; showToast("🔓 Canale rilasciato per i compagni."); }); }; }
}

function finishCoopGame(won) {
    gameRunning = false; clearAllTimers(); if (roomCode) db.ref(`rooms/${roomCode}/coop_state`).off();
    if (roomCode) {
        db.ref(`rooms/${roomCode}/players`).once('value', snap => {
            const players = snap.val() || {}; const nL = Object.values(players).map(p => p.name).join(", "); const fS = won ? 100 : 75;
            const fH2H = { "team_real": { id: myId, name: `👥 ${nL || "Squadra"}`, score: fS, wpm: currentWpm, finished: true }, "team_ai": { id: "ai_enemy", name: "🤖 Disturbo Nemico (AI)", score: won ? 99 : 100, wpm: currentWpm + 5, finished: true } };
            db.ref(`rooms/${roomCode}/players`).set(fH2H); const mId = Date.now().toString(); const mD = { players: Object.values(fH2H), mode: "conquest", wordCount: "Co-op", date: new Date().toLocaleDateString('it-IT'), ts: firebase.database.ServerValue.TIMESTAMP }; db.ref(`leaderboard/recent_matches/conquest_multi/all/${mId}`).set(mD);
        });
    }
    showScreen('leaderboardScreen'); if (els.tableWrapper) els.tableWrapper.style.display = 'block'; if (els.coopArea) els.coopArea.style.display = 'none';
    if (won) { showToast("🏆 VITTORIA DI SQUADRA! Territorio Conquistato!"); if (els.roomWinnerBanner) { els.roomWinnerBanner.textContent = "🏆 MISSIONE COMPIUTA CONTRO IL DISTURBO NEMICO!"; els.roomWinnerBanner.style.color = "#4caf50"; } updateActivity(true); }
    else { showToast("💀 TEMPO SCADUTO! Il disturbo nemico ha vinto."); if (els.roomWinnerBanner) { els.roomWinnerBanner.textContent = "💀 MISSIONE FALLITA: HA VINTO L'AVVERSARIO IRREALE"; els.roomWinnerBanner.style.color = "#d32f2f"; } updateActivity(false); }
}

// --- QUIZ MORSE ---
const FALLBACK_QUIZ_QUESTIONS = [
    { q: "SOS", a: ["Segnale di soccorso", "Saluti operativi", "Fine trasmissione", "Stazione radio"], correct: 0 },
    { q: "CQ", a: ["Chiamata a tutti", "Conferma ricezione", "Cambio frequenza", "Codice segreto"], correct: 0 },
    { q: "QTH", a: ["La mia posizione è...", "Qual è il tuo nome?", "Chiudi la trasmissione", "Segnale disturbato"], correct: 0 },
    { q: "QRS", a: ["Trasmetti più lentamente", "Aumenta velocità", "Frequenza occupata", "Ripeti messaggio"], correct: 0 },
    { q: "QRZ", a: ["Chi mi chiama?", "Come mi ricevi?", "Pronto a trasmettere", "Fine lavoro"], correct: 0 },
    { q: "QSL", a: ["Confermo ricezione", "Negativo", "In attesa", "Disturbo atmosferico"], correct: 0 },
    { q: "73", a: ["Cordiali saluti", "Buona fortuna", "A presto", "Grazie di tutto"], correct: 0 },
    { q: "88", a: ["Amore e baci", "Saluti formali", "Arrivederci", "Codice di chiusura"], correct: 0 },
    { q: "QRT", a: ["Sospendo le trasmissioni", "Inizio trasmissioni", "Cambio canale", "Ripeti di nuovo"], correct: 0 },
    { q: "QRV", a: ["Sei pronto?", "Sono occupato", "Aumenta potenza", "Chiudi stazione"], correct: 0 }
];

function getAvailableQuizQuestions() {
    if (typeof QUIZ_QUESTIONS !== 'undefined' && Array.isArray(QUIZ_QUESTIONS) && QUIZ_QUESTIONS.length > 0) return QUIZ_QUESTIONS;
    if (typeof window.QUIZ_QUESTIONS !== 'undefined' && Array.isArray(window.QUIZ_QUESTIONS) && window.QUIZ_QUESTIONS.length > 0) return window.QUIZ_QUESTIONS;
    return FALLBACK_QUIZ_QUESTIONS;
}

function prepareShuffledQuestion(rawQuestion) {
    if (!rawQuestion || !Array.isArray(rawQuestion.a)) return rawQuestion;
    const correctText = rawQuestion.a[rawQuestion.correct || 0]; const sO = fisherYatesShuffle([...rawQuestion.a]); const nCI = sO.indexOf(correctText);
    return { q: rawQuestion.q, a: sO, correct: nCI >= 0 ? nCI : 0 };
}

function startQuizSequence() {
    showScreen('quizArea'); gameRunning = true; lastLoadedQuizIndex = -1;
    if (els.quizWpmDisplay) els.quizWpmDisplay.textContent = `WPM: ${currentWpm}`; if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    const aQ = getAvailableQuizQuestions();
    if (roomCode && !isSinglePlayer) {
        if (listeners.quizState) db.ref(`rooms/${roomCode}/quiz_state`).off('value', listeners.quizState);
        listeners.quizState = db.ref(`rooms/${roomCode}/quiz_state`).on('value', snap => {
            const s = snap.val(); if (!s || !gameRunning) return; const nI = s.questionIndex || 0;
            if (s.questionsOrder && Array.isArray(s.questionsOrder)) randomizedQuizQuestions = s.questionsOrder.map(idx => aQ[idx % aQ.length]); else randomizedQuizQuestions = aQ;
            if (nI !== lastLoadedQuizIndex) { lastLoadedQuizIndex = nI; quizQuestionIndex = nI; loadNextQuizQuestion(); }
            quizActiveBuzzerId = s.activeBuzzerId || null; renderQuizUI(s);
        });
        if (myId === roomHostId) { const order = fisherYatesShuffle(Array.from({length: aQ.length}, (_, i) => i)); db.ref(`rooms/${roomCode}/quiz_state`).set({ questionIndex: 0, activeBuzzerId: null, status: 'playing', questionsOrder: order }); }
    } else { randomizedQuizQuestions = fisherYatesShuffle(aQ); quizQuestionIndex = 0; loadNextQuizQuestion(); }
}

function loadNextQuizQuestion() {
    const mQ = Math.min(requestedWordCount, randomizedQuizQuestions.length);
    if (quizQuestionIndex >= mQ || quizQuestionIndex >= randomizedQuizQuestions.length) return finishGame();
    const rawQ = randomizedQuizQuestions[quizQuestionIndex];
    if (!rawQ || !rawQ.q) { setTimeout(() => { if (gameRunning) loadNextQuizQuestion(); }, 400); return; }
    currentQuizQuestion = prepareShuffledQuestion(rawQ); setTimeout(() => { if (gameRunning) playQuizAudioSequence(); }, 300);
}

async function playQuizAudioSequence() {
    if (!gameRunning || !currentQuizQuestion) return;
    stopAllMorseAudio(); inputActive = false; disableQuizButtons(true);
    ['A', 'B', 'C', 'D'].forEach(l => { if (els['btnQuiz'+l]) els['btnQuiz'+l].classList.remove('active-choice'); });
    if (els.quizQuestionBox) els.quizQuestionBox.textContent = "Ascolta la domanda...";
    await playMorseAudio(currentQuizQuestion.q, currentWpm); if (!gameRunning) return; await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < 4; i++) {
        const letter = ["A", "B", "C", "D"][i]; if (!gameRunning) return; if (els.quizQuestionBox) els.quizQuestionBox.textContent = `Opzione ${letter}...`;
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.add('active-choice');
        await playMorseAudio(`${letter} ${currentQuizQuestion.a[i]}`, currentWpm);
        if (els['btnQuiz'+letter]) els['btnQuiz'+letter].classList.remove('active-choice'); if (!gameRunning) return; await new Promise(r => setTimeout(r, 1000));
    }
    if (!gameRunning) return; if (els.quizQuestionBox) els.quizQuestionBox.textContent = "SCEGLI LA TUA RISPOSTA!"; enableQuizControls(); startQuizTimer(20);
}

function enableQuizControls() {
    inputActive = true; if (isSinglePlayer) disableQuizButtons(false);
    else { if (els.quizBuzzer) els.quizBuzzer.style.display = 'block'; if (els.quizOptionsContainer) els.quizOptionsContainer.style.opacity = '0.5'; disableQuizButtons(true); }
}

function disableQuizButtons(disabled) { ['A', 'B', 'C', 'D'].forEach(l => { if (els['btnQuiz'+l]) els['btnQuiz'+l].disabled = disabled; }); }

function startQuizTimer(seconds) {
    if (quizTimerInterval) clearInterval(quizTimerInterval); let tL = 100;
    quizTimerInterval = setInterval(() => { tL -= 100 / (seconds * 10); if (els.quizTimerProgress) els.quizTimerProgress.style.width = Math.max(0, tL) + '%'; if (tL <= 0) { clearInterval(quizTimerInterval); if (inputActive) { showToast("Tempo scaduto!"); if (isSinglePlayer || quizActiveBuzzerId === myId) submitQuizAnswer(-1); } } }, 100);
}

function submitQuizAnswer(index) {
    if (!isSinglePlayer && (!inputActive || quizActiveBuzzerId !== myId)) return;
    if (isSinglePlayer && !inputActive) return;
    if (quizTimerInterval) clearInterval(quizTimerInterval); inputActive = false; disableQuizButtons(true);
    if (index === currentQuizQuestion.correct) { totalScore += 100; showToast(`CORRETTO (${["A", "B", "C", "D"][index]})! +100`); }
    else showToast(`SBAGLIATO! Era la ${["A", "B", "C", "D"][currentQuizQuestion.correct]}`);
    if (els.quizScoreDisplay) els.quizScoreDisplay.textContent = `Punti: ${totalScore}`;
    if (roomCode) db.ref(`rooms/${roomCode}/players/${myId}`).update({ score: totalScore, wordIndex: quizQuestionIndex + 1 });
    setTimeout(() => { if (!gameRunning) return; if (roomCode && !isSinglePlayer) { db.ref(`rooms/${roomCode}/quiz_state`).transaction(s => { if (s && s.activeBuzzerId === myId) { s.questionIndex = (s.questionIndex || 0) + 1; s.activeBuzzerId = null; } return s; }); } else if (isSinglePlayer) { quizQuestionIndex++; loadNextQuizQuestion(); } }, 3000);
}

function renderQuizUI(state) {
    if (!els.quizBuzzer || !els.buzzerWinner || !els.quizOptionsContainer) return;
    if (state.activeBuzzerId) { els.quizBuzzer.style.display = 'none'; if (state.activeBuzzerId === myId) { els.buzzerWinner.textContent = "TOCCA A TE!"; els.quizOptionsContainer.style.opacity = '1'; disableQuizButtons(false); } else { els.buzzerWinner.textContent = "L'AVVERSARIO RISPONDE..."; els.quizOptionsContainer.style.opacity = '0.5'; disableQuizButtons(true); } }
    else { els.buzzerWinner.textContent = ""; els.quizBuzzer.style.display = inputActive ? 'block' : 'none'; els.quizOptionsContainer.style.opacity = '0.5'; disableQuizButtons(true); }
}

// --- BATTAGLIA REALE SERALE ---
const BR_H_BANNER = 9, BR_M_BANNER = 54, BR_H_START = 21, BR_M_START = 30;
let brRoomCode = ""; let brIsPlaying = false, brAmIAlive = true;

function initBattleRoyaleScheduler() { checkBattleTime(); if (brCheckInterval) clearInterval(brCheckInterval); brCheckInterval = setInterval(checkBattleTime, 100000); }

window.toggleBattleRoyaleJoin = function() {
    if (!brRoomCode) { const now = new Date(Date.now() + serverTimeOffset); const dK = now.toISOString().split('T')[0].replace(/-/g, ''); brRoomCode = "BR_" + dK; }
    db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', pS => {
        if (pS.exists()) db.ref(`rooms/${brRoomCode}/players/${myId}`).remove().then(() => showToast("Ti sei ritirato dalla sfida serale."));
        else db.ref(`rooms/${brRoomCode}`).update({ status: 'enrolling', type: 'battle_royale', wpm: 25, round: 0, hostId: myId, createdAt: firebase.database.ServerValue.TIMESTAMP }).then(() => { db.ref(`rooms/${brRoomCode}/players/${myId}`).set({ name: myName, lives: 3, status: 'Iscritto ⏳', answered: false }).then(() => showToast("⚔️ Iscrizione registrata! Il banner è ora verde.")); });
    });
};

function checkBattleTime() {
    if (gameRunning || brIsPlaying || brBannerDismissedToday) return;
    const now = new Date(Date.now() + serverTimeOffset); const cH = now.getHours(), cM = now.getMinutes(), cTM = cH * 60 + cM, bTM = BR_H_BANNER * 60 + BR_M_BANNER, sTM = BR_H_START * 60 + BR_M_START;
    const isT = (cTM >= bTM && cTM < sTM); const dK = now.toISOString().split('T')[0].replace(/-/g, ''); brRoomCode = "BR_" + dK;
    if (isT) {
        if (els.brBanner && els.brBanner.style.display === 'none') { els.brBanner.style.display = 'block'; if (brBannerTimeout) clearTimeout(brBannerTimeout); brBannerTimeout = setTimeout(() => { if (els.brBanner) els.brBanner.style.display = 'none'; brBannerDismissedToday = true; db.ref(`rooms/${brRoomCode}/players`).off('value'); }, 10000); }
        if (els.btnJoinBR) { els.btnJoinBR.onclick = () => { window.toggleBattleRoyaleJoin(); if (brBannerTimeout) clearTimeout(brBannerTimeout); brBannerTimeout = setTimeout(() => { if (els.brBanner) els.brBanner.style.display = 'none'; brBannerDismissedToday = true; db.ref(`rooms/${brRoomCode}/players`).off('value'); }, 10000); }; }
        db.ref(`rooms/${brRoomCode}/players`).on('value', snap => {
            const p = snap.val() || {}; const c = Object.keys(p).length;
            if (els.brEnrolledCount) els.brEnrolledCount.textContent = c; if (els.brEnrolledCountCompact) els.brEnrolledCountCompact.textContent = c;
            if (p[myId]) { if (els.brBanner) { els.brBanner.style.backgroundColor = '#4caf50'; els.brBanner.style.borderColor = '#81c784'; els.brBanner.style.padding = '8px 12px'; } if (els.brBannerFullText) els.brBannerFullText.style.display = 'none'; if (els.brCompactCountText) els.brCompactCountText.style.display = 'inline-block'; if (els.btnJoinBR) { els.btnJoinBR.textContent = 'RITIRATI DALLA SFIDA'; els.btnJoinBR.style.color = '#4caf50'; els.btnJoinBR.style.width = 'auto'; els.btnJoinBR.style.flexGrow = '1'; } }
            else { if (els.brBanner) { els.brBanner.style.backgroundColor = '#e53935'; els.brBanner.style.borderColor = '#ff5252'; els.brBanner.style.padding = '15px'; } if (els.brBannerFullText) els.brBannerFullText.style.display = 'block'; if (els.brCompactCountText) els.brCompactCountText.style.display = 'none'; if (els.btnJoinBR) { els.btnJoinBR.textContent = 'PARTECIPA ALLA SFIDA'; els.btnJoinBR.style.color = '#e53935'; els.btnJoinBR.style.width = '100%'; els.btnJoinBR.style.flexGrow = '0'; } }
        });
    } else { if (els.brBanner) els.brBanner.style.display = 'none'; db.ref(`rooms/${brRoomCode}/players`).off('value'); }
    if (cH === BR_H_START && cM === BR_M_START) { db.ref(`rooms/${brRoomCode}/players/${myId}`).once('value', snap => { if (snap.exists() && activeTab !== "br_playing") { activeTab = "br_playing"; lastBRRoundPlayed = -1; showScreen('brScreen'); listenToBattleRoyaleRoom(); } }); startBattleRoyaleSystem(); }
}

function listenToBattleRoyaleRoom() {
    db.ref(`rooms/${brRoomCode}`).on('value', snap => {
        if (!snap.exists()) { showScreen('setupScreen'); alert("La Battaglia è stata annullata o è terminata."); return; }
        const rD = snap.val(); renderBRPlayers(rD.players || {});
        if (rD.status === 'cancelled') { if (els.brStatusText) els.brStatusText.textContent = "Annullata: Giocatori insufficienti (<5)."; setTimeout(() => { showScreen('setupScreen'); activeTab = "room"; }, 4000); return; }
        if (rD.status === 'playing') { brIsPlaying = true; if (els.brWpmDisplay) els.brWpmDisplay.textContent = rD.wpm + " WPM"; const mD = rD.players[myId]; brAmIAlive = mD && mD.lives > 0; const h = ["💀 ELIMINATO", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"]; let sL = mD && mD.lives ? parseInt(mD.lives) : 0; if (sL < 0) sL = 0; if (sL > 5) sL = 5; if (els.brLivesDisplay) els.brLivesDisplay.textContent = brAmIAlive ? h[sL] : "💀 ELIMINATO"; if (rD.roundEndTime && rD.currentWord && rD.round !== lastBRRoundPlayed) { lastBRRoundPlayed = rD.round; handleBRRound(rD); } }
        if (rD.status === 'finished') { brIsPlaying = false; lastBRRoundPlayed = -1; if (els.brStatusText) els.brStatusText.textContent = `Partita Conclusa! Vincitore: ${rD.winner || 'Nessuno'}`; if (els.brInputArea) els.brInputArea.style.display = 'none'; if (els.brTimerContainer) els.brTimerContainer.style.display = 'none'; }
    });
}

function renderBRPlayers(players) {
    if (!els.brPlayersList) return; els.brPlayersList.innerHTML = "";
    Object.values(players).forEach(p => {
        const li = document.createElement('li'); li.style.cssText = "display:flex; justify-content:space-between; padding:5px; border-bottom:1px dashed rgba(255,255,255,0.1);";
        const hL = ["💀", "❤️", "❤️❤️", "❤️❤️❤️", "❤️❤️❤️❤️", "❤️❤️❤️❤️❤️"]; let sPL = p.lives ? parseInt(p.lives) : 0; if (sPL < 0) sPL = 0; if (sPL > 5) sPL = 5;
        const i = document.createElement('span'); i.innerHTML = `<b style="color:var(--link-color);">${escapeHTML(p.name)}</b> <small>${hL[sPL]}</small>`;
        const s = document.createElement('span'); s.style.fontSize = "0.85em"; s.style.color = p.status === 'Corretto!' ? '#4caf50' : (p.status === 'Eliminato' || p.status === 'Errore!' ? '#e53935' : 'var(--hint-color)'); s.textContent = p.status;
        li.appendChild(i); li.appendChild(s); els.brPlayersList.appendChild(li);
    });
}

function startBattleRoyaleSystem() { db.ref(`rooms/${brRoomCode}`).once('value', snap => { const rD = snap.val(); if (rD && rD.hostId === myId) { const pC = Object.keys(rD.players || {}).length; if (pC < 5) db.ref(`rooms/${brRoomCode}/status`).set('cancelled'); else { db.ref(`rooms/${brRoomCode}/status`).set('playing'); hostNextBRRound(rD, 25, 1); } } }); }

function hostNextBRRound(rData, wpm, roundNum) {
    const word = masterDictionary[Math.floor(Math.random() * masterDictionary.length)].toUpperCase(); const eT = Date.now() + 30000; let u = {};
    Object.keys(rData.players || {}).forEach(pid => { if (rData.players[pid].lives > 0) { u[`players/${pid}/answered`] = false; u[`players/${pid}/status`] = 'Ascolto...'; } });
    u['currentWord'] = word; u['wpm'] = wpm; u['round'] = roundNum; u['roundEndTime'] = eT; db.ref(`rooms/${brRoomCode}`).update(u); setTimeout(() => checkBRRoundResults(wpm, roundNum), 31000);
}

function handleBRRound(rData) {
    if (brTimerInterval) clearInterval(brTimerInterval); if (els.brStatusText) els.brStatusText.textContent = `Round ${rData.round}! Attenzione...`;
    if (brAmIAlive && !rData.players[myId].answered) { if (els.brInputArea) els.brInputArea.style.display = 'flex'; if (els.brInput) { els.brInput.disabled = false; els.brInput.placeholder = "Decodifica e scrivi qui..."; els.brInput.value = ''; els.brInput.focus(); } if (els.brTimerContainer) els.brTimerContainer.style.display = 'block'; playMorseAudio(rData.currentWord, rData.wpm); }
    else { if (els.brInputArea) els.brInputArea.style.display = 'none'; if (els.brTimerContainer) els.brTimerContainer.style.display = 'none'; }
    brTimerInterval = setInterval(() => {
        const l = rData.roundEndTime - Date.now();
        if (l <= 0) { clearInterval(brTimerInterval); if (els.brTimerProgress) els.brTimerProgress.style.width = '0%'; if (brAmIAlive && !rData.players[myId].answered) submitBRAnswer(rData.currentWord, true); }
        else { if (els.brTimerProgress) { els.brTimerProgress.style.width = (l / 30000 * 100) + '%'; if (l < 10000) els.brTimerProgress.style.background = '#e53935'; else if (l < 20000) els.brTimerProgress.style.background = '#ff9800'; else els.brTimerProgress.style.background = '#4caf50'; } }
    }, 100);
}

function submitBRAnswer(realWord, isTimeout) {
    if (!brAmIAlive || !els.brInput) return; clearInterval(brTimerInterval); const typed = els.brInput.value.trim().toUpperCase().substring(0, 50); els.brInput.placeholder = isTimeout ? "Tempo scaduto!" : "Risposta inviata! Attendi..."; els.brInput.value = ''; els.brInput.focus(); const isC = !isTimeout && (typed === realWord);
    db.ref(`rooms/${brRoomCode}/players/${myId}`).transaction(p => { if (!p) return p; p.answered = true; if (isC) p.status = 'Corretto!'; else { p.lives -= 1; p.status = p.lives === 0 ? 'Eliminato' : 'Errore!'; } return p; });
}

function checkBRRoundResults(currentWpm, currentRound) {
    db.ref(`rooms/${brRoomCode}`).once('value', snap => {
        const rD = snap.val(); if (rD.hostId !== myId) return; let aC = 0, lAN = "";
        Object.values(rD.players || {}).forEach(p => { if (p.lives > 0) { aC++; lAN = p.name; } });
        if (aC <= 1) { db.ref(`rooms/${brRoomCode}/status`).set('finished'); db.ref(`rooms/${brRoomCode}/winner`).set(aC === 1 ? lAN : 'Nessuno'); }
        else hostNextBRRound(rD, currentWpm + 1, currentRound + 1);
    });
}
