// js/course_manager.js

window.KOCH_SEQUENCE = "KMRSUAPTLOWI.NJEF0YV,,G5/Q9ZH38B?427C1D6X".split("");

window.COURSE_TYPES = {
    Z2: { id: 'Z2', labelIt: 'Base (Z2)', labelEn: 'Base (Z2)', color: '#4caf50', weight: 0.3 },
    WORK: { id: 'WORK', labelIt: 'Lavoro (Nuovi)', labelEn: 'Work (New)', color: '#ff9800', weight: 0.2 },
    LONG: { id: 'LONG', labelIt: 'Lungo (Full)', labelEn: 'Long (Full)', color: '#9c27b0', weight: 0.5 }
};

window.COURSE_BRIEFING_PHRASES = {
    Z2: [
        "Sessione Base (Z2): focalizzati sulla fluidità di {chars}.",
        "Oggi l'obiettivo è il consolidamento dei caratteri {chars}.",
        "Allenamento di routine. Sintonizza l'orecchio su {chars}.",
        "Z2 in corso. I caratteri {chars} devono diventare istintivi.",
        "Costruiamo le fondamenta. Radar puntato su {chars}.",
        "Ritmo costante e orecchio rilassato per decodificare {chars}.",
        "Pratica quotidiana Z2. Caratteri: {chars}.",
        "Manteniamo caldi i riflessi su {chars}.",
        "Base Z2: nessun errore ammesso su {chars}.",
        "Riscaldamento Morse su {chars}. Let's go!",
        "Senza fretta ma senza sosta su {chars}.",
        "Solidità è la parola d'ordine per {chars}.",
        "Sessione di ossigenazione per il tuo orecchio: {chars}.",
        "Ripassiamo i fondamentali: {chars}.",
        "Z2: il ritmo del cuore batte per {chars}.",
        "Pensa al suono, non ai punti. Focus su {chars}.",
        "Base operativa attivata. Obiettivo: {chars}.",
        "Fluire con il Codice. Oggi: {chars}.",
        "Costruiamo la memoria muscolare per {chars}.",
        "Pura tecnica su {chars}. Concentrati.",
        "Z2: sintonizzati sulla frequenza di {chars}."
    ],
    WORK: [
        "Nuova sfida! Diamo il benvenuto ai caratteri {chars}.",
        "Oggi si lavora duro sui nuovi suoni: {chars}.",
        "Sessione WORK: massima allerta per intercettare {chars}.",
        "Dati in arrivo. I protagonisti del tuo studio oggi sono {chars}.",
        "Alziamo l'asticella. Vediamo come te la cavi con {chars}.",
        "Nuovo addestramento: i caratteri {chars} ti metteranno alla prova.",
        "Espandiamo la tua conoscenza di {chars}.",
        "Attacco frontale ai nuovi caratteri: {chars}.",
        "Sessione WORK: non mollare su {chars}.",
        "Nuovi suoni all'orizzonte! Ecco {chars}.",
        "Sblocchiamo il potenziale dei caratteri {chars}.",
        "Dacci dentro con {chars}. L'errore è parte del processo.",
        "Oggi si scrive la storia del tuo addestramento su {chars}.",
        "WORK: intensità massima per {chars}.",
        "Il metodo Koch ti sfida su {chars}.",
        "Ascolta con attenzione: {chars} stanno arrivando.",
        "Nuovi mattoni per la tua casa Morse: {chars}.",
        "Nessuna paura di {chars}. Dominazione totale.",
        "Allenamento intensivo: focus speciale su {chars}.",
        "Studia le pause e i suoni di {chars}.",
        "Il segreto è la ripetizione. Oggi: {chars}."
    ],
    LONG: [
        "Sessione LUNGA: resistenza e precisione su tutto il set {chars}.",
        "Oggi mettiamo alla prova tutto quello che sai su {chars}.",
        "Maratona Morse! Gestisci il flusso costante di {chars}.",
        "Nessun carattere escluso: {chars} in arrivo a velocità sostenuta.",
        "Dimostra la tua maestria su tutto l'alfabeto sbloccato: {chars}.",
        "Intercettazione totale in corso. Obiettivo: {chars}.",
        "Sfida di resistenza su {chars}.",
        "Il set completo {chars} metterà a dura prova il tuo orecchio.",
        "Maratona Morse: tieni il passo di {chars}.",
        "Sessione LUNGA: dove i veri operatori si vedono su {chars}.",
        "Non perdere un colpo su {chars}.",
        "Lungo raggio attivato. Radar sintonizzato su {chars}.",
        "Gestire la stanchezza con {chars} è l'obiettivo di oggi.",
        "Nessuno spazio per i dubbi su {chars}.",
        "Tutto quello che hai imparato finora: {chars}.",
        "Sessione Full-Set: {chars} in arrivo veloci.",
        "Mantieni la calma sotto il fuoco di {chars}.",
        "L'etere è affollato oggi: riconosci {chars}.",
        "Test di durata operativa su {chars}.",
        "Decodifica continua: non farti sfuggire {chars}.",
        "Sei pronto per il lungo viaggio tra i caratteri {chars}?"
    ],
    GENERIC: [
        "Briefing operativo: l'aria vibra per i caratteri {chars}.",
        "Pronto per l'invio? I target di oggi sono {chars}."
    ]
};

window.COURSE_DEBRIEFING_PHRASES = {
    EXCELLENT: [
        "Accuratezza chirurgica! Hai dominato {chars} senza esitazioni.",
        "Ottimo lavoro, operatore. Il tuo orecchio per {chars} è perfetto.",
        "Performance da manuale. Sei pronto per alzare la velocità!",
        "Zero sbavature. La tua padronanza di {chars} è impressionante.",
        "Missione compiuta con lode. Continua così!",
        "Riflessi pronti e zero errori. Sei una leggenda dell'etere.",
        "Eccezionale! Hai danzato tra {chars}.",
        "Maestria assoluta. {chars} non hanno segreti.",
        "Record di precisione! {chars} decodificati alla perfezione.",
        "Incredibile operatore. Sei il re di {chars}.",
        "Riflessi da Jedi su {chars}. Impressionante.",
        "Livello Elite raggiunto su {chars}. Continua così.",
        "Orecchio d'oro per {chars}. Velocità consigliata: +1!",
        "Performance perfetta. {chars} sono ormai istinto.",
        "Hai reso il Morse un'arte oggi con {chars}.",
        "Vittoria totale contro il silenzio. Brava gestione di {chars}.",
        "Nessun errore rilevato su {chars}. Sei una macchina!",
        "Top Player! {chars} sono stati intercettati con stile.",
        "Hai dominato ogni singolo bit di {chars}.",
        "Accuratezza 100%. {chars} sono tuoi schiavi.",
        "Sei sulla strada per la gloria Morse. Ottimo su {chars}."
    ],
    GOOD: [
        "Ben fatto, ma il carattere {chars} ha mostrato qualche incertezza.",
        "Dati ricevuti. Hai avuto piccoli intoppi su {chars}. Ripassali.",
        "Solidità operativa discreta. Focus per domani: {chars}.",
        "Buona media, ma occhio a non confondere i suoni di {chars}.",
        "XP guadagnati! Domani martelleremo di più su {chars}.",
        "Sessione positiva. Solo {chars} ti hanno fatto rallentare.",
        "Buona sessione, ma {chars} hanno avuto qualche incertezza.",
        "Stai crescendo! {chars} però richiedono un piccolo ripasso.",
        "Operativo e affidabile, tranne che su {chars}.",
        "Molto bene! Domani battiamo di più su {chars}.",
        "Hai perso qualche colpo su {chars}, ma la base è solida.",
        "Il radar è quasi pulito. Solo {chars} hanno creato disturbo.",
        "Punti bonus per la costanza! Occhio a {chars}.",
        "Ti stai avvicinando alla perfezione. Focus su {chars}.",
        "Bella prova! {chars} sono stati i tuoi ostacoli oggi.",
        "Dati ricevuti. Hai il controllo di {chars}, quasi.",
        "Buona media. Non farti fregare da {chars}.",
        "Stai costruendo i tuoi riflessi. {chars} sono quasi pronti.",
        "XP guadagnati! Hai superato la prova su {chars}.",
        "Solidità discreta. Le orecchie iniziano a capire {chars}.",
        "Non fermarti ora. {chars} sono il prossimo target."
    ],
    STRUGGLING: [
        "Sessione ostica. {chars} sono stati i tuoi punti deboli oggi.",
        "Analisi post-operazione: i caratteri {chars} richiedono più studio.",
        "Non abbatterti, operatore. {chars} saranno prioritari domani.",
        "Rilevate criticità su {chars}. Li riproporremo con più insistenza.",
        "L'addestramento serve a questo. Concentriamoci meglio su {chars}.",
        "Oggi {chars} ti hanno battuto. Domani sarà un'altra storia.",
        "Sessione difficile, ma {chars} saranno i tuoi maestri domani.",
        "Non mollare! {chars} sono ostici per tutti all'inizio.",
        "Cadere fa parte del volo. Domani ripartiamo da {chars}.",
        "Troppi errori su {chars}. Riduciamo i WPM e riproviamo?",
        "L'addestramento è una salita. {chars} sono la tua pendenza oggi.",
        "Focus totale necessario per domani: {chars}.",
        "Nessuno è nato imparato. Martelleremo su {chars} finché non cederanno.",
        "Rilevata stanchezza operativa su {chars}. Riposa e riprova.",
        "Analisi post-match: {chars} hanno vinto oggi. Ma non domani.",
        "Usa la heatmap per studiare {chars}. Torna più forte.",
        "Lezione imparata: {chars} hanno bisogno di più amore.",
        "Ritenta, sarai più fortunato (e preparato) su {chars}.",
        "Il Morse è pazienza. {chars} ti stanno insegnando questo.",
        "Nessuna resa su {chars}. La persistenza paga.",
        "Oggi è andata così. Domani {chars} saranno un ricordo."
    ]
};

window.COURSE_REMINDERS = [
    "Operatore, l'etere non aspetta! Hai saltato l'allenamento ieri. Non perdere il ritmo.",
    "Il tasto Morse sta prendendo polvere. Torna subito in postazione!",
    "La costanza è l'anima della telegrafia. Ieri ti sei assentato, non farlo più.",
    "Riceviamo segnali deboli... la tua memoria muscolare sta svanendo. Allenati ora!",
    "Attenzione: un giorno senza pratica è un passo indietro. Ti aspettiamo in aula.",
    "Soldato, il Codice Koch richiede disciplina! Ieri non ti sei presentato.",
    "Sintonizzati! Ieri la tua frequenza era muta. Riprendi l'esercizio.",
    "Non farti battere dalla pigrizia. Il Morse si impara giorno dopo giorno.",
    "Abbiamo notato la tua assenza. Il corso procede, non restare indietro!",
    "Ricorda: il genio è 1% talento e 99% esercizio. Torna a battere!",
    "S.O.S. - Il tuo addestramento è in pericolo! Riprendi subito gli allenamenti.",
    "Ieri il tuo manipolatore è rimasto muto. Recupera il tempo perduto.",
    "Le orecchie si arrugginiscono in fretta. Non saltare le sessioni!",
    "Un vero telegrafista non abbandona mai il campo. Ti abbiamo cercato ieri.",
    "Riprendi il filo... o meglio, il punto e la linea! Allenamento mancato ieri.",
    "Messaggio prioritario: la tua progressione è ferma. Torna operativo.",
    "La velocità si conquista con la fatica quotidiana. Ieri hai riposato troppo.",
    "Non lasciare che i nuovi caratteri vincano. Torna a studiare!",
    "La Radio-Aula è aperta. Ieri il tuo banco era vuoto. Non mancare oggi.",
    "Ultimo avviso prima del declino: riprendi l'allenamento e salva il tuo piano."
];

window.getCourseBriefing = function(typeId, chars) {
    const pool = window.COURSE_BRIEFING_PHRASES[typeId] || window.COURSE_BRIEFING_PHRASES.GENERIC;
    const p = pool[Math.floor(Math.random() * pool.length)];
    return p.replace('{chars}', chars).replace('{type}', typeId);
};

window.getCourseDebriefing = function(accuracy, worstChars) {
    let pool = window.COURSE_DEBRIEFING_PHRASES.GOOD;
    if (accuracy >= 0.95) pool = window.COURSE_DEBRIEFING_PHRASES.EXCELLENT;
    else if (accuracy < 0.8) pool = window.COURSE_DEBRIEFING_PHRASES.STRUGGLING;

    const p = pool[Math.floor(Math.random() * pool.length)];
    const charStr = worstChars.length > 0 ? worstChars.join(", ") : "tutti i caratteri";
    return p.replace('{chars}', charStr);
};

window.firebaseEscape = function(key) {
    if (!key) return key;
    return key.toString()
        .replace(/\./g, '_dot_')
        .replace(/\//g, '_slash_')
        .replace(/#/g, '_hash_')
        .replace(/\$/g, '_dollar_')
        .replace(/\[/g, '_lbrac_')
        .replace(/\]/g, '_rbrac_')
        .replace(/\?/g, '_ques_');
};



window.initCourseManager = function() {
    console.log("Course: Initializing...");

    if (!myId || !db) {
        console.warn("Course Init: Missing Auth or DB, retrying in 500ms...");
        setTimeout(window.initCourseManager, 500);
        return;
    }

    // Iniziamo subito l'ascolto degli iscritti globali
    window.listenToCourseEnrollment();

    window.loadCourseState().then(() => {
        console.log("Course: State loaded, rendering view...");
        window.renderCourseTabView();
        window.checkWeeklyReview();
        window.checkCourseInactivity(); // NUOVO: Controllo richiami per inattività
        window.checkCourseStartupNotification();
    });
};

window.checkCourseInactivity = function() {
    if (!window.courseData || window.courseData.active_plan !== true) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Evitiamo controlli multipli nello stesso giorno
    if (window.courseData.progress.last_inactivity_check === todayStr) return;

    const lastSession = window.courseData.progress.last_session_date;
    if (!lastSession) {
        window.courseData.progress.last_inactivity_check = todayStr;
        window.saveCourseState();
        return;
    }

    const lastDate = new Date(lastSession);
    const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays >= 2) {
        // L'utente ha saltato almeno ieri (diffDays 1 = ieri allenato, diffDays 2 = ieri saltato)
        // Verifichiamo se ieri era un giorno di allenamento nel piano
        const yesterdayIdx = (today.getDay() + 5) % 7; // GetDay 0=Dom, 1=Lun... yesterdayIdx 0=Lun, 6=Dom
        const dayData = window.courseData.weekly_schedule ? window.courseData.weekly_schedule[yesterdayIdx] : null;

        if (dayData && dayData.sessions.some(s => s.type !== 'REST')) {
            window.courseData.progress.reminders_count = (window.courseData.progress.reminders_count || 0) + 1;
            window.courseData.progress.consecutive_days = 0; // Reset dei giorni consecutivi

            if (window.courseData.progress.reminders_count >= 3) {
                // ESPULSIONE DAL CORSO
                alert("OPERATORE LICENZIATO PER INATTIVITÀ.\nHai accumulato 3 richiami formali senza riprendere l'addestramento. Il tuo piano è stato revocato.");
                window.updateGlobalEnrollmentRecord(false);
                window.courseData = window.getDefaultCourseData();
                window.saveCourseState();
                window.renderCourseTabView();
                return;
            } else {
                // MOSTRA RICHIAMO
                const msg = window.COURSE_REMINDERS[Math.floor(Math.random() * window.COURSE_REMINDERS.length)];
                window.showCourseReminderModal(window.courseData.progress.reminders_count, msg);
            }
        }
    }

    window.courseData.progress.last_inactivity_check = todayStr;
    window.saveCourseState();
};

window.showCourseReminderModal = function(count, message) {
    const modal = document.getElementById('courseReminderModal');
    const countTxt = document.getElementById('courseReminderCount');
    const msgP = document.getElementById('courseReminderText');

    if (modal && countTxt && msgP) {
        countTxt.textContent = `Richiamo ${count} di 3`;
        msgP.textContent = message;
        modal.style.display = 'flex';
    }
};

window.loadCourseState = async function() {
    if (!myId || !db) return;

    // Rimuoviamo eventuali listener precedenti se questa funzione viene chiamata più volte
    db.ref(`users/${myId}/course`).off('value');

    // Cambiamo in un listener (.on) per aggiornamenti in tempo reale (es. approvazione tutor)
    db.ref(`users/${myId}/course`).on('value', snap => {
        let data = snap.val();

        if (data) {
            if (data.active_plan === "true") data.active_plan = true;
            if (data.active_plan === "false") data.active_plan = false;

            // Retrocompatibilità: inizializziamo init_date se manca
            if (data.active_plan === true && !data.init_date) {
                data.init_date = new Date().toISOString().split('T')[0];
            }

            window.courseData = data;
        } else {
            window.courseData = window.getDefaultCourseData();
        }

        if (window.courseData.active_plan === true) {
            window.updateGlobalEnrollmentRecord(true);
            // Se l'utente è nel tab corso, rinfreschiamo la vista
            if (els.courseTabActiveView && els.courseTabActiveView.offsetParent) {
                window.renderCourseTabView();
            }
        }
    }, (error) => {
        console.error("Course Manager: Error syncing course state:", error);
    });
};

window.getDefaultCourseData = function() {
    return {
        active_plan: false,
        elite_mode: false,
        role: 'corsista',
        tutor_id: null,
        init_date: new Date().toISOString().split('T')[0],
        settings: {
            days_per_week: 3,
            start_wpm: 15,
            farnsworth_wpm: 12,
            group_spacing: "3.0",
            pause_interval: 60,
            pause_duration: 10,
            minutes_z2: 10,
            minutes_work: 7,
            minutes_long: 17
        },
        progress: {
            current_lesson: 2,
            weekly_completed_days: 0,
            last_session_date: "",
            last_inactivity_check: "",
            reminders_count: 0,
            consecutive_days: 0,
            total_xp: 0,
            char_stats: {},
            char_stats_by_type: { Z2: {}, WORK: {}, LONG: {} },
            last_z2_accuracy: 1.0
        },
        current_day_session: null
    };
};

window.saveCourseState = function() {
    if (!myId || !db || !window.courseData) return;
    db.ref(`users/${myId}/course`).set(window.courseData);
};

window.updateGlobalEnrollmentRecord = function(isActive) {
    if (!myId || !db) return;
    const activeRef = db.ref('courseActiveEnrollments/' + myId);

    if (isActive) {
        activeRef.once('value', snap => {
            const updateData = {
                name: myName,
                role: window.courseData?.role || 'corsista',
                tutorId: window.courseData?.tutor_id || null,
                ts: firebase.database.ServerValue.TIMESTAMP
            };

            if (!snap.exists()) {
                activeRef.set(updateData);
            } else {
                activeRef.update(updateData);
            }
        });
    } else {
        activeRef.once('value', snap => {
            if (snap.exists()) {
                activeRef.remove();
            }
        });
    }
};

window.generateWeeklySchedule = function() {
    if (!window.courseData || !window.courseData.settings) return;
    const daysPerWeek = parseInt(window.courseData.settings.days_per_week);
    const isElite = window.courseData.elite_mode === true;
    let schedule = Array(7).fill(null).map(() => ({ sessions: [{ type: 'REST', completed: false }] }));

    let workDays = [];
    if (daysPerWeek === 1) workDays = [6];
    else {
        const step = 7 / daysPerWeek;
        for (let i=0; i<daysPerWeek; i++) workDays.push(Math.floor(i * step));
    }

    workDays.forEach((dayIdx, i) => {
        let type = 'WORK';
        if (i === workDays.length - 1) type = 'LONG';
        else if (i % 2 === 0) type = 'Z2';

        // REGOLA: Se siamo nella settimana di inizio e non è ancora lunedì, forziamo Z2
        if (window.isFirstPartialWeek()) {
            type = 'Z2';
        }

        let sessions = [{ type: type, completed: false }];
        if (isElite) {
            sessions.push({ type: 'Z2', completed: false, elite: true });
        }
        schedule[dayIdx] = { sessions: sessions };
    });

    window.courseData.weekly_schedule = schedule;
    window.saveCourseState();
};

window.isFirstPartialWeek = function() {
    if (!window.courseData || !window.courseData.init_date) return false;
    const initDate = new Date(window.courseData.init_date);
    const today = new Date();

    // Calcoliamo il lunedì successivo alla data di inizio
    const firstMonday = new Date(initDate);
    firstMonday.setDate(initDate.getDate() + (1 + 7 - initDate.getDay()) % 7);
    if (initDate.getDay() === 1) firstMonday.setDate(initDate.getDate() + 7); // Se ha iniziato di lunedì, la regola non si applica (inizia subito bene)

    firstMonday.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    return today < firstMonday;
};

window.generateAdaptiveGroup = function() {
    if (!window.courseData) return "ERROR";
    const currentLesson = window.courseData.progress.current_lesson;
    const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);
    const sessionType = window.courseData.current_day_session?.type || 'LONG';

    if (sessionType === 'Z2') {
        let group = "";
        for(let i=0; i<5; i++) group += activeChars[Math.floor(Math.random() * activeChars.length)];
        return group;
    }

    const stats = window.courseData.progress.char_stats || {};
    let weights = activeChars.map(char => {
        const dbChar = window.firebaseEscape(char);
        const charStat = stats[dbChar] || { attempts: 0, errors: 0 };
        let weight = 1.0;
        if (charStat.attempts > 5) {
            const errorRate = charStat.errors / charStat.attempts;
            weight += errorRate * 5;
        }
        return { char, weight };
    });

    if (sessionType === 'WORK') {
        const lastChar = activeChars[activeChars.length - 1];
        const lastWeight = weights.find(w => w.char === lastChar);
        if (lastWeight) lastWeight.weight *= 3;
    }

    let group = "";
    for (let i = 0; i < 5; i++) {
        let currentWeights = [...weights];
        let found = false;
        while (currentWeights.length > 0) {
            let totalWeight = currentWeights.reduce((acc, w) => acc + w.weight, 0);
            let random = Math.random() * totalWeight;
            let selectedIdx = -1;
            for (let j = 0; j < currentWeights.length; j++) {
                random -= currentWeights[j].weight;
                if (random <= 0) { selectedIdx = j; break; }
            }
            if (selectedIdx === -1) selectedIdx = currentWeights.length - 1;
            const selected = currentWeights[selectedIdx];
            const count = group.split(selected.char).length - 1;
            if (count < 3) {
                group += selected.char;
                found = true;
                break;
            } else {
                currentWeights.splice(selectedIdx, 1);
            }
        }
        if (!found) group += activeChars[Math.floor(Math.random() * activeChars.length)];
    }
    return group;
};

window.preGenerateCourseGroups = function() {
    if (!window.courseData || !window.courseData.current_day_session) return;
    const session = window.courseData.current_day_session;
    const farnsworth = parseInt(window.courseData.settings.farnsworth_wpm) || 12;
    const spacing = parseFloat(window.courseData.settings.group_spacing) || 3.0;
    const estimatedSecPerGroup = (60 / farnsworth) + (spacing * 2);
    const numGroups = Math.ceil((session.total_seconds / estimatedSecPerGroup) * 1.5);
    gameWords = [];
    for (let i = 0; i < numGroups; i++) {
        gameWords.push(window.generateAdaptiveGroup());
    }
    requestedWordCount = gameWords.length;
};

window.startCourseSessionSequence = function() {
    window.showScreen('gameArea');
    if (els.permanentGameInput) {
        els.permanentGameInput.value = "";
        els.permanentGameInput.disabled = false;
        setTimeout(() => els.permanentGameInput.focus(), 500);
    }
    if (els.tableBody) els.tableBody.innerHTML = "";
    if (els.scoreDisplay) els.scoreDisplay.textContent = "Sessione Corso";
    if (courseSessionTimer) { clearInterval(courseSessionTimer); courseSessionTimer = null; }

    window.courseSessionTotalSec = window.courseData.current_day_session.total_seconds;
    window.courseSessionPauseDuration = parseInt(window.courseData.settings.pause_duration) || 0;
    window.courseSessionPauseInterval = parseInt(window.courseData.settings.pause_interval) || 60;
    window.courseSessionNextPauseTs = Date.now() + (window.courseSessionPauseInterval * 1000);
    window.courseIsPaused = false;
    window.coursePausePending = false;

    window.preGenerateCourseGroups();
    wordIndex = 0;
    window.courseTimeIsUp = false; // Reset flag fine tempo
    window.updateCourseTimerUI();
    courseSessionTimer = setInterval(() => {
        if (!gameRunning || !window.courseData.current_day_session) return;
        if (window.courseIsPaused || document.hidden) return;
        window.courseData.current_day_session.remaining_seconds--;
        window.updateCourseTimerUI();
        if (window.courseSessionPauseDuration > 0 && Date.now() >= window.courseSessionNextPauseTs) {
            window.coursePausePending = true;
        }
        if (window.courseData.current_day_session.remaining_seconds <= 0) {
            clearInterval(courseSessionTimer);
            window.courseTimeIsUp = true;
            // Non chiamiamo subito finishCourseSession, aspettiamo l'invio dell'ultima parola
            showToast(currentLang === 'it' ? "Tempo scaduto! Finisci l'ultima parola." : "Time's up! Finish the last word.");
        }
    }, 1000);

    setTimeout(() => { if (gameRunning) window.playNextCourseGroup(); }, 800);
};

window.triggerCoursePause = function() {
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();
    window.courseIsPaused = true;
    inputActive = false;
    if (els.permanentGameInput) {
        els.permanentGameInput.value = "";
        els.permanentGameInput.placeholder = "PAUSA CAFFÈ...";
        els.permanentGameInput.disabled = true;
    }
    let timeLeft = window.courseSessionPauseDuration;
    const updatePauseUI = () => {
        if (els.scoreDisplay) els.scoreDisplay.innerHTML = `<span style="color:#ff9800; font-weight:bold; animation: pulse 1s infinite;">☕ PAUSA: ${timeLeft}s</span>`;
    };
    updatePauseUI();
    if (coursePauseInterval) clearInterval(coursePauseInterval);
    coursePauseInterval = setInterval(() => {
        if (!gameRunning || !isCourseMode) {
            clearInterval(coursePauseInterval);
            coursePauseInterval = null;
            return;
        }
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(coursePauseInterval);
            coursePauseInterval = null;
            window.courseIsPaused = false;
            window.courseSessionNextPauseTs = Date.now() + (window.courseSessionPauseInterval * 1000);
            if (els.scoreDisplay) els.scoreDisplay.textContent = "Sessione Corso";
            if (els.permanentGameInput) {
                els.permanentGameInput.disabled = false;
                els.permanentGameInput.placeholder = "Digita qui...";
                els.permanentGameInput.focus();
            }
            inputActive = true;
            if (gameRunning) window.playNextCourseGroup();
        } else {
            updatePauseUI();
        }
    }, 1000);
};

window.updateCourseTimerUI = function() {
    if (!window.courseData.current_day_session || !els.wpmDisplay) return;
    const s = window.courseData.current_day_session.remaining_seconds;
    const min = Math.floor(s / 60);
    const sec = s % 60;
    let displayWpm = window.calculateDynamicCourseWpm();
    els.wpmDisplay.textContent = `⏱️ ${min}:${sec.toString().padStart(2, '0')} | WPM: ${displayWpm}`;
};

window.calculateDynamicCourseWpm = function() {
    if (!window.courseData || !window.courseData.current_day_session) return currentWpm;
    const session = window.courseData.current_day_session;
    const baseWpm = parseInt(window.courseData.settings.start_wpm);
    const lastAccuracy = window.courseData.progress.last_z2_accuracy || 0;
    if (session.type === 'Z2') return baseWpm;
    const calculateBonus = (acc) => {
        if (acc >= 1.0) return 3;
        if (acc >= 0.9) return 2;
        if (acc >= 0.8) return 1;
        return 0;
    };
    if (session.type === 'WORK') return baseWpm + calculateBonus(lastAccuracy);
    if (session.type === 'LONG') {
        const total = session.total_seconds;
        const elapsed = total - session.remaining_seconds;
        if (elapsed < total / 3) return baseWpm;
        if (elapsed < (2 * total) / 3) return baseWpm + calculateBonus(lastAccuracy);
        return baseWpm;
    }
    return baseWpm;
};

window.playNextCourseGroup = function() {
    if (!gameRunning || !isCourseMode) return;
    if (window.coursePausePending) {
        window.coursePausePending = false;
        window.triggerCoursePause();
        return;
    }
    let group = gameWords[wordIndex];
    if (!group) {
        group = window.generateAdaptiveGroup();
        gameWords[wordIndex] = group;
        requestedWordCount = gameWords.length;
    }
    inputActive = true;
    const charWpm = window.calculateDynamicCourseWpm();
    const farnsworthWpm = parseInt(window.courseData.settings.farnsworth_wpm);
    const groupSpacingMult = parseFloat(window.courseData.settings.group_spacing || 2.0);
    window.charSpaceWpm = farnsworthWpm;
    window.wordSpaceMult = groupSpacingMult;
    currentWpm = charWpm;
    if (typeof playMorseAudio === 'function') {
        setTimeout(() => { if (gameRunning && isCourseMode) playMorseAudio(group, charWpm); }, 300);
    }

    // --- AGGIORNAMENTO LIVE AUDIO PER TUTOR (SPETTATORI) ---
    if (roomCode) {
        db.ref(`rooms/${roomCode}/liveAudio`).set({
            word: group,
            wpm: charWpm,
            ts: Date.now(),
            wordId: wordIndex
        });
    }

    lastWordStartTime = Date.now();
};

window.checkWeeklyReview = function() {
    if (!window.courseData || !window.courseData.active_plan) return;
    const now = new Date();
    const lastReview = window.courseData.progress.last_weekly_review || "";
    const currentWeek = window.getWeekNumber(now);
    if (lastReview !== currentWeek && window.courseData.weekly_schedule) {
        const completedCount = window.courseData.weekly_schedule.filter(day => {
            return day.sessions.every(s => s.completed || s.type === 'REST');
        }).length;
        if (completedCount === 7) {
            if (confirm("Settimana completata con successo! 🏆\nVuoi aumentare il volume di allenamento (minuti) del 10% per la prossima settimana?")) {
                window.courseData.settings.minutes_z2 = Math.round(window.courseData.settings.minutes_z2 * 1.1);
                window.courseData.settings.minutes_work = Math.round(window.courseData.settings.minutes_work * 1.1);
                window.courseData.settings.minutes_long = Math.round(window.courseData.settings.minutes_long * 1.1);
            }
        }
        window.courseData.progress.last_weekly_review = currentWeek;
        window.generateWeeklySchedule();
    }
};

window.listenToCourseEnrollment = function() {
    const activeRef = db.ref('courseActiveEnrollments');
    activeRef.on('value', snap => {
        const data = snap.val() || {};
        const entries = Object.values(data);

        // Contiamo come "corsisti" tutti coloro che NON sono esplicitamente tutor
        // (Includendo i vecchi record che non hanno ancora il campo 'role')
        const studentCount = entries.filter(e => e.role !== 'tutor').length;

        const badge = document.getElementById('courseEnrollmentBadgeGlobal');
        if (badge) {
            badge.textContent = studentCount;
            if (studentCount > 0) {
                badge.style.display = 'flex';
                badge.classList.add('badge-active');
            } else {
                badge.style.display = 'none';
                badge.classList.remove('badge-active');
            }
            console.log("Course Real-time Count (Students + Legacy):", studentCount);
        }
    });
};

window.checkCourseStartupNotification = function() {
    if (!window.courseData || window.courseData.active_plan !== true) return;

    // Se l'utente è un Tutor, non ha sessioni programmate da mostrare allo startup
    if (window.courseData.role === 'tutor') return;

    const todayIdx = (new Date().getDay() + 6) % 7;
    const dayData = window.courseData.weekly_schedule ? window.courseData.weekly_schedule[todayIdx] : null;

    // Cerchiamo la prima sessione non completata (NON extra)
    let session = dayData ? dayData.sessions.find(s => !s.completed && s.type !== 'REST') : null;

    // NOTA: Se session è null (allenamento finito), non mostriamo nulla allo startup.
    // L'allenamento extra viene proposto solo se l'utente clicca esplicitamente nel tab Corso.

    if (session) {
        // Inizializziamo la sessione corrente nei dati globali così il tasto "Inizia" sa cosa avviare
        if (!window.courseData.current_day_session || window.courseData.current_day_session.type !== session.type) {
            let duration = 15;
            if (session.type === 'Z2') duration = window.courseData.settings.minutes_z2;
            else if (session.type === 'WORK') duration = window.courseData.settings.minutes_work;
            else if (session.type === 'LONG') duration = window.courseData.settings.minutes_long;

            window.courseData.current_day_session = {
                type: session.type, total_seconds: duration * 60,
                remaining_seconds: duration * 60, completed: false,
                date: new Date().toISOString().split('T')[0]
            };
            window.saveCourseState();
        }

        window.showCourseSessionModal(session, false);
    }
};

window.showCourseSessionModal = function(session, isExtra = false) {
    const modal = document.getElementById('courseSessionModal');
    const text = document.getElementById('courseModalText');
    const warmupCont = document.getElementById('courseModalWarmupContainer');

    if (modal && text) {
        const currentLesson = window.courseData.progress.current_lesson;
        const activeChars = window.KOCH_SEQUENCE.slice(0, currentLesson);

        // MOSTRA SOLO GLI ULTIMI 2 CARATTERI (I NUOVI) PER IL WARM-UP
        // Se siamo alla prima lezione (2 caratteri), li mostriamo entrambi.
        const newChars = (currentLesson <= 2) ? activeChars : activeChars.slice(-2);

        const charStr = activeChars.join(", ");

        if (isExtra) {
            text.innerHTML = `Hai completato gli allenamenti programmati per oggi! 🏆<br><br>Vuoi fare una sessione di <b>Allenamento Extra</b> sui caratteri sbloccati?`;
        } else {
            const typeCfg = window.COURSE_TYPES[session.type];
            const typeLabel = currentLang === 'it' ? typeCfg.labelIt : typeCfg.labelEn;
            const briefing = window.getCourseBriefing(session.type, charStr);

            // Messa in sicurezza briefing (XSS Fix)
            text.innerHTML = `Oggi il tuo piano prevede una sessione di <b>${typeLabel}</b>.<br><br>`;
            const bDiv = document.createElement('div');
            bDiv.style.cssText = "background:var(--sec-bg-color); padding:10px; border-radius:8px; border-left:4px solid var(--link-color); font-style:italic; font-size:0.9em; text-align:left;";
            bDiv.textContent = `"${briefing}"`;
            text.appendChild(bDiv);
        }

        // Popola area Warm-up (Sempre visibile se ci sono caratteri)
        if (warmupCont) {
            warmupCont.style.display = 'block';
            window.populateCourseWarmup(newChars);
        }

        modal.style.display = 'flex';
    }
};

window.populateCourseWarmup = function(chars) {
    const container = document.getElementById('courseModalWarmup');
    if (!container) return;
    container.innerHTML = '';

    chars.forEach(char => {
        const btn = document.createElement('button');
        btn.style.cssText = "width:50px; height:50px; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.4em; font-weight:bold; background:rgba(255,255,255,0.1); border:2px solid var(--link-color); color:var(--link-color); border-radius:12px; cursor:pointer; box-shadow: 0 0 10px rgba(0,0,0,0.2);";
        btn.textContent = char;
        btn.onclick = (e) => {
            e.stopPropagation();
            // Forza inizializzazione audio al click (necessario per alcuni browser/Telegram)
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

            const wpm = parseInt(window.courseData?.settings?.start_wpm) || 20;
            // IMPORTANTE: forcePlay = true per suonare fuori dal gameRunning
            if (typeof playMorseAudio === 'function') {
                playMorseAudio(char, wpm, true);
            }
        };
        container.appendChild(btn);
    });
};
