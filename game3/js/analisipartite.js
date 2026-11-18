// js/analisipartite.js - Modulo Diagnostica ed Analisi Dettagliata Match Post-Partita (Dynamic Rhythmic Edition)

window.showPostMatchAnalysisButton = function(mode, detailsList, parentContainer) {
    const isAllowed = ['daily_challenge', 'tri_daily', 'weekly_callsign', 'callsign', 'standard', 'standard_plus', 'code_groups'].includes(mode);
    if (!isAllowed || !detailsList || !Array.isArray(detailsList) || detailsList.length === 0) return;

    window.lastMatchDetailsForAnalysis = [...detailsList];

    // Mostra il pulsante anche nel modal del commento a caldo se visibile
    const modalCommentBtn = document.getElementById('btnCommentModalAnalysis');
    if (modalCommentBtn) modalCommentBtn.style.display = 'block';

    let btnAnalysis = document.getElementById('btnOpenPostMatchAnalysis');
    if (!btnAnalysis) {
        btnAnalysis = document.createElement('button');
        btnAnalysis.id = 'btnOpenPostMatchAnalysis';
        btnAnalysis.className = 'btn-success';
        btnAnalysis.style.cssText = 'width:100%; margin-top:8px; padding:12px; font-weight:bold; background:#9575cd; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:0.95em; box-shadow:0 4px 10px rgba(0,0,0,0.3); display:block;';
        btnAnalysis.textContent = '📊 Analisi Dettagliata Match';
        btnAnalysis.onclick = () => window.openPostMatchAnalysisModal();
        if (parentContainer) parentContainer.appendChild(btnAnalysis);
    } else {
        btnAnalysis.style.display = 'block';
        btnAnalysis.onclick = () => window.openPostMatchAnalysisModal();
    }
};

window.hidePostMatchAnalysisButton = function() {
    const btn = document.getElementById('btnOpenPostMatchAnalysis');
    if (btn) btn.style.display = 'none';

    const modalCommentBtn = document.getElementById('btnCommentModalAnalysis');
    if (modalCommentBtn) modalCommentBtn.style.display = 'none';
};

window.openPostMatchAnalysisModal = function() {
    const modal = document.getElementById('postMatchAnalysisModal');
    if (!modal) return;
    modal.style.display = 'flex';
    window.recalculatePostMatchAnalysis();
};

window.closePostMatchAnalysisModal = function() {
    const modal = document.getElementById('postMatchAnalysisModal');
    if (modal) modal.style.display = 'none';
};

window.recalculatePostMatchAnalysis = function() {
    const details = window.lastMatchDetailsForAnalysis || window.matchDetailsArray || [];
    const styleSelect = document.getElementById('analysisTypingStyleSelect');
    const selectedStyle = styleSelect ? styleSelect.value : 'full_receive';

    const container = document.getElementById('postMatchAnalysisContent');
    if (!container) return;

    if (!details || details.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--hint-color); padding:20px;">Nessun dato di dettaglio disponibile per questa partita.</p>';
        return;
    }

    container.innerHTML = window.generatePostMatchAnalysisHTML(details, selectedStyle);
};

window.generatePostMatchAnalysisHTML = function(details, selectedStyle) {
    if (!details || !Array.isArray(details) || details.length === 0) return '';

    // Helper per frasi randomiche
    const randomPhrase = (arr) => arr[Math.floor(Math.random() * arr.length)];

    let totalWords = details.length;
    let perfectWords = 0;
    let totalChars = 0;
    let correctChars = 0;

    let posErrors = { inizio: 0, centro: 0, fine: 0 };
    let totalPosErrors = 0;

    let omittedChars = 0;
    let substitutedChars = 0;
    let confusionMatrix = {};

    let matchSectionStats = {
        sec1: { total: 0, exact: 0, accuracySum: 0 },
        sec2: { total: 0, exact: 0, accuracySum: 0 },
        sec3: { total: 0, exact: 0, accuracySum: 0 }
    };

    let maxErrorStreak = 0;
    let currentErrorStreak = 0;

    let totalMs = 0;
    let validTimingWords = 0;

    const sec1Boundary = Math.ceil(totalWords / 3);
    const sec2Boundary = Math.ceil((totalWords * 2) / 3);

    details.forEach((item, index) => {
        const real = String(item.real || "").toUpperCase();
        const typed = String(item.typed || "").toUpperCase();
        const isExact = (real === typed);
        const wordLen = real.length;
        const maxLen = Math.max(wordLen, typed.length, 1);

        if (isExact) {
            perfectWords++;
            currentErrorStreak = 0;
        } else {
            currentErrorStreak++;
            if (currentErrorStreak > maxErrorStreak) maxErrorStreak = currentErrorStreak;
        }

        const levDist = (typeof window.getLevenshteinDistance === 'function')
            ? window.getLevenshteinDistance(real, typed)
            : (isExact ? 0 : Math.abs(real.length - typed.length) + 1);

        const partialAcc = Math.max(0, 1 - (levDist / maxLen));

        totalChars += maxLen;
        correctChars += Math.max(0, maxLen - levDist);

        let secCat = index < sec1Boundary ? 'sec1' : (index < sec2Boundary ? 'sec2' : 'sec3');
        matchSectionStats[secCat].total++;
        if (isExact) matchSectionStats[secCat].exact++;
        matchSectionStats[secCat].accuracySum += partialAcc;

        if (!isExact) {
            for (let i = 0; i < wordLen; i++) {
                const rChar = real[i];
                const tChar = typed[i] || '';

                if (rChar !== tChar) {
                    if (!tChar) {
                        omittedChars++;
                    } else if (rChar) {
                        substitutedChars++;
                        const pair = `${rChar} ➔ ${tChar}`;
                        confusionMatrix[pair] = (confusionMatrix[pair] || 0) + 1;
                    }

                    if (wordLen <= 1) {
                        posErrors.centro++;
                    } else if (i < Math.floor(wordLen / 3)) {
                        posErrors.inizio++;
                    } else if (i < Math.ceil((wordLen * 2) / 3)) {
                        posErrors.centro++;
                    } else {
                        posErrors.fine++;
                    }
                    totalPosErrors++;
                }
            }
        }

        if (item.ms && Number(item.ms) > 0) {
            totalMs += Number(item.ms);
            validTimingWords++;
        }
    });

    const overallExactPct = Math.round((perfectWords / Math.max(totalWords, 1)) * 100);
    const overallCharPct = Math.round((correctChars / Math.max(totalChars, 1)) * 100);

    const posInizioPct = totalPosErrors > 0 ? Math.round((posErrors.inizio / totalPosErrors) * 100) : 0;
    const posCentroPct = totalPosErrors > 0 ? Math.round((posErrors.centro / totalPosErrors) * 100) : 0;
    const posFinePct = totalPosErrors > 0 ? Math.round((posErrors.fine / totalPosErrors) * 100) : 0;

    const sec1AccPct = matchSectionStats.sec1.total > 0 ? Math.round((matchSectionStats.sec1.accuracySum / matchSectionStats.sec1.total) * 100) : 100;
    const sec2AccPct = matchSectionStats.sec2.total > 0 ? Math.round((matchSectionStats.sec2.accuracySum / matchSectionStats.sec2.total) * 100) : 100;
    const sec3AccPct = matchSectionStats.sec3.total > 0 ? Math.round((matchSectionStats.sec3.accuracySum / matchSectionStats.sec3.total) * 100) : 100;

    const avgMsPerChar = totalChars > 0 ? Math.round(totalMs / totalChars) : 0;

    // SCELTA FRASI DINAMICHE PER STILE E TEMPI
    let styleFeedback = "";
    let styleStatusClass = "color:#4caf50;";

    if (selectedStyle === 'realtime') {
        if (avgMsPerChar <= 500) {
            styleFeedback = randomPhrase([
                "⚡ Copia istantanea eccellente! Segui il ritmo alla perfezione.",
                "⚡ Riflessi fulminei. Stai mappando i suoni direttamente sulla tastiera.",
                "⚡ Sincronia perfetta tra orecchio e dita. Ottimo flow!"
            ]);
        } else if (avgMsPerChar <= 800) {
            styleFeedback = randomPhrase([
                "👍 Buona copia istantanea, ma con qualche piccola trattenuta ritmica.",
                "👍 Reattività solida, a tratti esiti un istante di troppo.",
                "👍 Stai tenendo il passo, cerca solo di ammorbidire le tensioni sulle dita."
            ]);
            styleStatusClass = "color:#ff9800;";
        } else {
            styleFeedback = randomPhrase([
                "🐢 Tendi ad accumulare ritardo sul segnale in tempo reale.",
                "🐢 Stai lottando per restare in sincrono. Non forzare, lascia scorrere il suono.",
                "🐢 Il buffer mentale si satura. Ascolta senza tradurre e reagisci d'istinto."
            ]);
            styleStatusClass = "color:#f44336;";
        }
    } else if (selectedStyle === 'short_delay') {
        if (avgMsPerChar <= 700) {
            styleFeedback = randomPhrase([
                "⚡ Ottima reattività e ritenzione del suono nel breve periodo!",
                "⚡ Coda d'ascolto perfetta, mantieni la melodia attiva in mente.",
                "⚡ Transizione fluida e pulita tra la fine del suono e la digitazione."
            ]);
        } else if (avgMsPerChar <= 1000) {
            styleFeedback = randomPhrase([
                "👍 Buona cadenza di coda, copia abbastanza fluida.",
                "👍 Mantieni bene il suono, ma potresti scaricarlo sulla tastiera un po' più in fretta.",
                "👍 Discreta ritenzione ritmica, cerca di non prolungare troppo l'attesa."
            ]);
            styleStatusClass = "color:#ff9800;";
        } else {
            styleFeedback = randomPhrase([
                "🐢 Lieve ritardo, attento a non trascinare l'ascolto sulle lettere successive.",
                "🐢 Stai trattenendo il suono troppo a lungo, col rischio di sovrapporlo al nuovo segnale.",
                "🐢 Esitazione eccessiva in chiusura: fidati del primo suono che hai percepito."
            ]);
            styleStatusClass = "color:#f44336;";
        }
    } else {
        // full_receive
        if (avgMsPerChar <= 1000) {
            styleFeedback = randomPhrase([
                "⚡ Eccellente buffer mentale: trattieni la melodia intera e la scarichi velocemente!",
                "⚡ Ottima memoria a breve termine. Costruisci la parola in mente con sicurezza.",
                "⚡ Ricezione globale impeccabile. Il suono della parola è chiaro e nitido nella tua testa."
            ]);
        } else if (avgMsPerChar <= 1500) {
            styleFeedback = randomPhrase([
                "👍 Buona ricezione globale della parola, trascrizione abbastanza fluida.",
                "👍 Trattieni bene il gruppo di suoni, ma esiti lievemente prima di scriverli.",
                "👍 Ascolto completo pulito, cerca solo di velocizzare il momento in cui tocchi la tastiera."
            ]);
            styleStatusClass = "color:#4caf50;";
        } else {
            styleFeedback = randomPhrase([
                "⏱️ Esiti troppo prima di digitare: fidati della tua memoria auditiva.",
                "⏱️ C'è un vuoto troppo lungo a fine parola. Non rimettere in dubbio ciò che hai sentito.",
                "⏱️ Tempo di trascrizione lungo: la melodia evapora se non la scarichi subito."
            ]);
            styleStatusClass = "color:#ff9800;";
        }
    }

    const sortedConfusions = Object.entries(confusionMatrix).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let confusionsHTML = '';
    if (sortedConfusions.length > 0) {
        confusionsHTML = sortedConfusions.map(([pair, cnt]) =>
            `<span style="background:rgba(244, 67, 54, 0.15); border:1px solid rgba(244, 67, 54, 0.4); padding:2px 6px; border-radius:4px; font-size:0.85em;"><b>${pair}</b> (${cnt}x)</span>`
        ).join(' ');
    }

    // SCELTA FRASI DINAMICHE PER I TIPS E I CONSIGLI
    let tips = [];

    if (maxErrorStreak >= 3) {
        tips.push(randomPhrase([
            `🌊 <b>Gestione dell'Errore</b>: Hai sbagliato <b>${maxErrorStreak} parole consecutive</b>. È il classico "effetto valanga". Quando perdi un suono, lascialo andare o perderai anche le melodie successive.`,
            `🌊 <b>Effetto Valanga</b>: Segnalate <b>${maxErrorStreak} mancate di fila</b>. Se un suono ti sfugge, resetta la mente all'istante senza rimuginarci su.`,
            `🌊 <b>Reset Mentale</b>: Ben <b>${maxErrorStreak} errori consecutivi</b>. Non restare aggrappato al carattere perso, sfrutta lo spazio bianco per rimetterti in ascolto.`
        ]));
    }

    if (sortedConfusions.length > 0) {
        tips.push(randomPhrase([
            `🔤 <b>Confusioni Ritmiche</b>: Il tuo cervello sta scambiando melodie simili (${confusionsHTML}). <b>Non analizzare!</b> Tratta il suono come un'unica nota musicale complessa.`,
            `🔤 <b>Scambi di Suono</b>: Tendi a confondere queste impronte ritmiche: ${confusionsHTML}. Concentrati sull'ascolto passivo, senza forzare la traduzione logica.`,
            `🔤 <b>Riflessi Inesatti</b>: Attenzione alle associazioni di questi suoni: ${confusionsHTML}. Fidati del tuo primo riflesso uditivo.`
        ]));
    }

    if (omittedChars > substitutedChars * 1.5) {
        tips.push(randomPhrase([
            "💨 <b>Omissioni Frequenti</b>: Stai saltando molti caratteri anziché scriverli sbagliati. Prova ad aumentare un po' la spaziatura di Farnsworth per dare respiro al cervello.",
            "💨 <b>Vuoti di Ricezione</b>: Molte lettere lasciate in bianco. Se il suono sfugge sistematicamente, diminuisci lievemente i WPM.",
            "💨 <b>Buchi Neri Ritmici</b>: Il cervello non fa in tempo a processare tutto. Rallenta un attimo o usa il Farnsworth per interiorizzare meglio i suoni di base."
        ]));
    }

    if (totalPosErrors > 0) {
        if (posInizioPct >= 40) {
            tips.push(randomPhrase([
                "🎯 <b>Attacco del Suono</b>: Il <b>" + posInizioPct + "%</b> degli errori avviene all'inizio. Tendi a farti cogliere di sorpresa: mantieni un'allerta costante nello spazio bianco.",
                "🎯 <b>Anticipo Ritmico</b>: Il <b>" + posInizioPct + "%</b> degli errori è sul primo suono. Cerca di essere più reattivo appena termina lo spazio inter-parola.",
                "🎯 <b>Partenza Lenta</b>: Sbagli il <b>" + posInizioPct + "%</b> degli attacchi. Concentrati focalizzando l'orecchio sull'inizio netto del segnale."
            ]));
        } else if (posCentroPct >= 45) {
            tips.push(randomPhrase([
                "🎯 <b>Corpo Centrale</b>: Il <b>" + posCentroPct + "%</b> degli errori si concentra al centro. Probabilmente perdi il ritmo a metà parola: cerca una copia più fluida.",
                "🎯 <b>Fluidità Spezzata</b>: Perdi il <b>" + posCentroPct + "%</b> delle lettere nel mezzo. Non frammentare l'ascolto, lascia che la parola scorra interamente.",
                "🎯 <b>Incertezza Centrale</b>: Il <b>" + posCentroPct + "%</b> degli errori cade a metà parola. Mantieni costante l'attenzione ritmica senza picchi o cali."
            ]));
        } else if (posFinePct >= 40) {
            tips.push(randomPhrase([
                "🎯 <b>Coda della Parola</b>: Il <b>" + posFinePct + "%</b> degli errori è nella parte finale. Stai anticipando mentalmente la fine prima che il trasmettitore abbia finito.",
                "🎯 <b>Fretta di Chiudere</b>: Sbagli il <b>" + posFinePct + "%</b> dei finali. Ascolta fino all'ultimo respiro del segnale, non completare la parola tu mentalmente.",
                "🎯 <b>Taglio del Suono</b>: Il <b>" + posFinePct + "%</b> degli errori si trova sulle code. Attendi la netta chiusura del suono prima di pensare alla parola successiva."
            ]));
        }
    }

    if (sec3AccPct < sec1AccPct - 12) {
        tips.push(randomPhrase([
            "📉 <b>Stanchezza Neurale</b>: Precisione crollata dal <b>" + sec1AccPct + "%</b> iniziale al <b>" + sec3AccPct + "%</b> finale. Ascoltare CW brucia energie, fai sessioni più brevi.",
            "📉 <b>Calo di Attenzione</b>: Nel finale sei passato dal <b>" + sec1AccPct + "%</b> al <b>" + sec3AccPct + "%</b>. La riserva di concentrazione si sta esaurendo, fermati per una pausa.",
            "📉 <b>Affaticamento Uditivo</b>: Tendi a spegnerti a fine match (calo al <b>" + sec3AccPct + "%</b>). È normale in CW: meglio 3 match da 2 minuti che 1 da 6 minuti."
        ]));
    }

    if (tips.length === 0) {
        tips.push(randomPhrase([
            "🌟 <b>Copia Solida e Ritmica!</b> Ottima memoria auditiva e nessuna esitazione evidente. Il tuo riflesso condizionato suono ➔ tastiera è formidabile.",
            "🌟 <b>Trascrizione Impeccabile!</b> Un flow perfetto. Hai mantenuto lucidità, ritmo ed efficienza per tutto il tempo.",
            "🌟 <b>Prestazione di Altissimo Livello!</b> Ricezione pulitissima. Stai davvero ascoltando la musica del Codice Morse."
        ]));
    }

    // Costruzione HTML (Rimasta invariata)
    return `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">
            <div style="background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:8px; text-align:center; border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:0.75em; color:var(--hint-color); display:block;">Parole Copiate al 100%</span>
                <b style="font-size:1.2em; color:var(--champ-color);">${perfectWords} / ${totalWords} (${overallExactPct}%)</b>
            </div>
            <div style="background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:8px; text-align:center; border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:0.75em; color:var(--hint-color); display:block;">Accuratezza Singoli Suoni</span>
                <b style="font-size:1.2em; color:#00bcd4;">${overallCharPct}%</b>
            </div>
        </div>

        <!-- 1. SOSTITUZIONI VS OMISSIONI & MATRICE -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:#00bcd4; margin-bottom:6px;">
                🔍 Diagnostica Errori CW:
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:8px;">
                <span>Suoni persi (Omissioni): <b style="color:#f44336;">${omittedChars}</b></span>
                <span>Suoni scambiati (Sostituzioni): <b style="color:#ff9800;">${substitutedChars}</b></span>
            </div>
            ${confusionsHTML ? `
            <div style="font-size:0.8em; margin-top:8px;">
                <span style="color:var(--hint-color); display:block; margin-bottom:4px;">Scambi Ritmici più frequenti:</span>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">${confusionsHTML}</div>
            </div>
            ` : ''}
        </div>

        <!-- 2. POSIZIONE ERRORI NELLA PAROLA -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:#9575cd; margin-bottom:6px;">
                📌 Posizione Errori all'interno della Parola:
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:4px;">
                <span>Attacco: <b>${posInizioPct}%</b></span>
                <span>Corpo: <b>${posCentroPct}%</b></span>
                <span>Coda: <b>${posFinePct}%</b></span>
            </div>
            <div style="width:100%; height:8px; background:rgba(0,0,0,0.3); border-radius:4px; overflow:hidden; display:flex;">
                <div style="width:${posInizioPct}%; background:#f44336;" title="Inizio: ${posInizioPct}%"></div>
                <div style="width:${posCentroPct}%; background:#ff9800;" title="Centro: ${posCentroPct}%"></div>
                <div style="width:${posFinePct}%; background:#2196f3;" title="Fine: ${posFinePct}%"></div>
            </div>
        </div>

        <!-- 3. ANDAMENTO NELLA PARTITA -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:#ff9800; margin-bottom:6px;">
                📉 Tenuta Neurale durante il Match:
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8em;">
                <span>Inizio: <b style="color:#4caf50;">${sec1AccPct}%</b></span>
                <span>Metà: <b style="color:#ff9800;">${sec2AccPct}%</b></span>
                <span>Fine: <b style="color:${sec3AccPct < 80 ? '#f44336' : '#2196f3'};">${sec3AccPct}%</b></span>
            </div>
        </div>

        <!-- 4. TEMPI DI REAZIONE (NORMALIZZATI) -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:var(--champ-color); margin-bottom:4px;">
                ⏳ Tempi di Digitazione e Reazione:
            </div>
            <div style="font-size:0.82em; margin-bottom:4px;">
                Ritardo medio per singolo suono: <b>${avgMsPerChar} ms</b>
            </div>
            <div style="font-size:0.78em; ${styleStatusClass} font-weight:bold;">
                ${styleFeedback}
            </div>
        </div>

        <!-- 5. CONSIGLI & ISTRUZIONI PRATICHE -->
        <div style="background:rgba(149, 117, 205, 0.1); border:1px solid #9575cd; border-radius:8px; padding:10px;">
            <div style="font-size:0.88em; font-weight:bold; color:#9575cd; margin-bottom:6px; display:flex; align-items:center; gap:4px;">
                🎧 Feedback di Copia Dinamico:
            </div>
            <div style="font-size:0.8em; line-height:1.45; display:flex; flex-direction:column; gap:6px;">
                ${tips.map(t => `<div style="background:rgba(0,0,0,0.2); padding:6px 8px; border-radius:6px;">${t}</div>`).join('')}
            </div>
        </div>
    `;
};