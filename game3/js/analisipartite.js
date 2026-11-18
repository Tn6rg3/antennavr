// js/analisipartite.js - Modulo Diagnostica ed Analisi Dettagliata Match Post-Partita

window.showPostMatchAnalysisButton = function(mode, detailsList, parentContainer) {
    const isAllowed = ['daily_challenge', 'tri_daily', 'weekly_callsign', 'callsign', 'standard', 'standard_plus', 'code_groups'].includes(mode);
    if (!isAllowed || !detailsList || !Array.isArray(detailsList) || detailsList.length === 0) return;

    window.lastMatchDetailsForAnalysis = [...detailsList];
    let btnAnalysis = document.getElementById('btnOpenPostMatchAnalysis');
    if (!btnAnalysis) {
        btnAnalysis = document.createElement('button');
        btnAnalysis.id = 'btnOpenPostMatchAnalysis';
        btnAnalysis.className = 'btn-success';
        btnAnalysis.style.cssText = 'width:100%; margin-top:8px; padding:10px; font-weight:bold; background:#9575cd; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:0.92em; box-shadow:0 4px 10px rgba(0,0,0,0.3);';
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

    let totalWords = details.length;
    let perfectWords = 0;
    let totalChars = 0;
    let correctChars = 0;

    // 1. Posizione Errori nella Parola (Inizio, Centro, Fine)
    let posErrors = { inizio: 0, centro: 0, fine: 0 };
    let totalPosErrors = 0;

    // 2. Lunghezza Parole (Corte: 1-3, Medie: 4-6, Lunghe: 7+)
    let lenStats = {
        corte: { total: 0, exact: 0, accuracySum: 0 },
        medie: { total: 0, exact: 0, accuracySum: 0 },
        lunghe: { total: 0, exact: 0, accuracySum: 0 }
    };

    // 3. Concentrazione Errori nella Partita (Inizio 0-33%, Centro 33-66%, Fine 66-100%)
    let matchSectionStats = {
        sec1: { total: 0, exact: 0, accuracySum: 0 },
        sec2: { total: 0, exact: 0, accuracySum: 0 },
        sec3: { total: 0, exact: 0, accuracySum: 0 }
    };

    // 4. Tempi di reazione e WPM
    let totalMs = 0;
    let msCount = 0;
    let charErrorMap = {};

    const sec1Boundary = Math.ceil(totalWords / 3);
    const sec2Boundary = Math.ceil((totalWords * 2) / 3);

    details.forEach((item, index) => {
        const real = String(item.real || "").toUpperCase();
        const typed = String(item.typed || "").toUpperCase();
        const isExact = (real === typed);

        if (isExact) perfectWords++;

        // Levenshtein distance & Partial Accuracy
        const levDist = (typeof window.getLevenshteinDistance === 'function')
            ? window.getLevenshteinDistance(real, typed)
            : (isExact ? 0 : Math.abs(real.length - typed.length) + 1);

        const wordLen = real.length;
        const maxLen = Math.max(wordLen, typed.length, 1);
        const partialAcc = Math.max(0, 1 - (levDist / maxLen));

        totalChars += maxLen;
        correctChars += Math.max(0, maxLen - levDist);

        // A. Categoria per Lunghezza Parola
        let lenCat = wordLen <= 3 ? 'corte' : (wordLen <= 6 ? 'medie' : 'lunghe');
        lenStats[lenCat].total++;
        if (isExact) lenStats[lenCat].exact++;
        lenStats[lenCat].accuracySum += partialAcc;

        // B. Sezione Partita (Inizio, Centro, Fine)
        let secCat = index < sec1Boundary ? 'sec1' : (index < sec2Boundary ? 'sec2' : 'sec3');
        matchSectionStats[secCat].total++;
        if (isExact) matchSectionStats[secCat].exact++;
        matchSectionStats[secCat].accuracySum += partialAcc;

        // C. Analisi Posizionale degli Errori (Inizio, Centro, Fine della Parola)
        if (!isExact) {
            for (let i = 0; i < wordLen; i++) {
                const rChar = real[i];
                const tChar = typed[i] || '';

                if (rChar !== tChar) {
                    if (rChar) {
                        charErrorMap[rChar] = (charErrorMap[rChar] || 0) + 1;
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

        // D. Tempi di Reazione
        if (item.ms && Number(item.ms) > 0) {
            totalMs += Number(item.ms);
            msCount++;
        }
    });

    // Calcolo Percentuali
    const overallExactPct = Math.round((perfectWords / Math.max(totalWords, 1)) * 100);
    const overallCharPct = Math.round((correctChars / Math.max(totalChars, 1)) * 100);

    // Posizioni errori %
    const posInizioPct = totalPosErrors > 0 ? Math.round((posErrors.inizio / totalPosErrors) * 100) : 0;
    const posCentroPct = totalPosErrors > 0 ? Math.round((posErrors.centro / totalPosErrors) * 100) : 0;
    const posFinePct = totalPosErrors > 0 ? Math.round((posErrors.fine / totalPosErrors) * 100) : 0;

    // Lunghezza %
    const corteAccPct = lenStats.corte.total > 0 ? Math.round((lenStats.corte.accuracySum / lenStats.corte.total) * 100) : 100;
    const medieAccPct = lenStats.medie.total > 0 ? Math.round((lenStats.medie.accuracySum / lenStats.medie.total) * 100) : 100;
    const lungheAccPct = lenStats.lunghe.total > 0 ? Math.round((lenStats.lunghe.accuracySum / lenStats.lunghe.total) * 100) : 100;

    // Sezioni Match %
    const sec1AccPct = matchSectionStats.sec1.total > 0 ? Math.round((matchSectionStats.sec1.accuracySum / matchSectionStats.sec1.total) * 100) : 100;
    const sec2AccPct = matchSectionStats.sec2.total > 0 ? Math.round((matchSectionStats.sec2.accuracySum / matchSectionStats.sec2.total) * 100) : 100;
    const sec3AccPct = matchSectionStats.sec3.total > 0 ? Math.round((matchSectionStats.sec3.accuracySum / matchSectionStats.sec3.total) * 100) : 100;

    // Tempi e Stile
    const avgMsVal = msCount > 0 ? Math.round(totalMs / msCount) : 0;
    const avgSecVal = (avgMsVal / 1000).toFixed(1);

    let styleFeedback = "";
    let styleStatusClass = "color:#4caf50;";
    if (selectedStyle === 'realtime') {
        if (avgMsVal <= 2500) styleFeedback = "⚡ Ottima sincronia e digitazione al volo durante l'ascolto!";
        else if (avgMsVal <= 4000) { styleFeedback = "👍 Buona digitazione al volo, ma con qualche piccola esitazione."; styleStatusClass = "color:#ff9800;"; }
        else { styleFeedback = "🐢 Tempo alto per la digitazione al volo: prova ad allenare il ritmo fluido."; styleStatusClass = "color:#f44336;"; }
    } else if (selectedStyle === 'short_delay') {
        if (avgMsVal <= 3500) styleFeedback = "⚡ Ottima reattività: ascolto e digitazione immediata!";
        else if (avgMsVal <= 5000) { styleFeedback = "👍 Buona cadenza tra inizio ascolto e invio."; styleStatusClass = "color:#ff9800;"; }
        else { styleFeedback = "🐢 Lieve ritardo tra ricezione iniziale ed esecuzione."; styleStatusClass = "color:#f44336;"; }
    } else {
        // full_receive
        if (avgMsVal <= 4500) styleFeedback = "⚡ Eccellente memoria di lavoro e trascrizione rapida dopo l'ascolto!";
        else if (avgMsVal <= 6500) { styleFeedback = "👍 Ottimo ascolto completo della parola prima di digitare."; styleStatusClass = "color:#4caf50;"; }
        else { styleFeedback = "⏱️ Tempo di trascrizione lungo: esercitati sulla velocizzazione del tasto."; styleStatusClass = "color:#ff9800;"; }
    }

    // Caratteri più sbagliati
    const sortedCharErrors = Object.entries(charErrorMap).sort((a, b) => b[1] - a[1]);
    const topCharErrors = sortedCharErrors.slice(0, 4).map(([ch, cnt]) => `<b>${ch}</b> (${cnt}x)`).join(', ');

    // Consigli & Istruzioni personalizzate
    let tips = [];

    if (overallExactPct < 85) {
        tips.push("💡 <b>Valutazione Parziale</b>: La tua accuratezza complessiva sulle parole è del <b>" + overallExactPct + "%</b>, ma l'accuratezza sui singoli caratteri è del <b>" + overallCharPct + "%</b>. Molte parole sbagliate differiscono per 1 sola lettera.");
    }

    if (totalPosErrors > 0) {
        if (posInizioPct >= 40) {
            tips.push("🎯 <b>Attacco della Parola</b>: Il <b>" + posInizioPct + "%</b> degli errori avviene all'inizio delle parole. Concentrati sui primi dAH/dIT del primo carattere.");
        } else if (posCentroPct >= 45) {
            tips.push("🎯 <b>Corpo Centrale</b>: Il <b>" + posCentroPct + "%</b> degli errori si concentra al centro delle parole. Mantieni la cadenza costante senza accelerare.");
        } else if (posFinePct >= 40) {
            tips.push("🎯 <b>Chiusura della Parola</b>: Il <b>" + posFinePct + "%</b> degli errori avviene nella parte finale. Evita di anticipare la risposta prima che il segnale sia terminato.");
        }
    }

    if (sec3AccPct < sec1AccPct - 12) {
        tips.push("📉 <b>Calo di Resistenza</b>: La tua accuratezza è scesa dal <b>" + sec1AccPct + "%</b> dell'inizio al <b>" + sec3AccPct + "%</b> nella parte finale del match. Fai pause brevi tra le sessioni per prevenire la stanchezza mentale.");
    }

    if (lungheAccPct < corteAccPct - 15) {
        tips.push("📏 <b>Gestione Parole Lunghe</b>: La precisione sulle parole corte è del <b>" + corteAccPct + "%</b>, mentre sulle lunghe scende al <b>" + lungheAccPct + "%</b>. Prova a dividere mentalmente i gruppi di caratteri corti.");
    }

    if (topCharErrors) {
        tips.push("🔤 <b>Caratteri Critici</b>: I caratteri con più errori in questo match sono stati: " + topCharErrors + ". Svolgi una sessione di Allenamento Mirato su questi caratteri.");
    }

    if (tips.length === 0) {
        tips.push("🌟 <b>Partita Eccellente!</b> Hai mantenuto un'ottima precisione ed una cadenza costante lungo tutto lo svolgimento del match. Continua così!");
    }

    // Costruzione HTML
    return `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">
            <div style="background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:8px; text-align:center; border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:0.75em; color:var(--hint-color); display:block;">Parole 100% Corrette</span>
                <b style="font-size:1.2em; color:var(--champ-color);">${perfectWords} / ${totalWords} (${overallExactPct}%)</b>
            </div>
            <div style="background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:8px; text-align:center; border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:0.75em; color:var(--hint-color); display:block;">Accuratezza Caratteri</span>
                <b style="font-size:1.2em; color:#00bcd4;">${overallCharPct}%</b>
            </div>
        </div>

        <!-- 1. POSIZIONE ERRORI NELLA PAROLA -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:#9575cd; margin-bottom:6px;">
                📌 Posizione Errori all'interno della Parola:
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:4px;">
                <span>Inizio: <b>${posInizioPct}%</b></span>
                <span>Centro: <b>${posCentroPct}%</b></span>
                <span>Fine: <b>${posFinePct}%</b></span>
            </div>
            <div style="width:100%; height:8px; background:rgba(0,0,0,0.3); border-radius:4px; overflow:hidden; display:flex;">
                <div style="width:${posInizioPct}%; background:#f44336;" title="Inizio: ${posInizioPct}%"></div>
                <div style="width:${posCentroPct}%; background:#ff9800;" title="Centro: ${posCentroPct}%"></div>
                <div style="width:${posFinePct}%; background:#2196f3;" title="Fine: ${posFinePct}%"></div>
            </div>
        </div>

        <!-- 2. LUNGHEZZA PAROLE -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:#00bcd4; margin-bottom:6px;">
                📏 Accuratezza per Lunghezza Parola (Valutazione Parziale):
            </div>
            <div style="font-size:0.8em; display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; justify-content:space-between;">
                    <span>Corte (1-3 car.): <b>${corteAccPct}%</b></span>
                    <span style="opacity:0.7;">(${lenStats.corte.total} parole)</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Medie (4-6 car.): <b>${medieAccPct}%</b></span>
                    <span style="opacity:0.7;">(${lenStats.medie.total} parole)</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Lunghe (7+ car.): <b>${lungheAccPct}%</b></span>
                    <span style="opacity:0.7;">(${lenStats.lunghe.total} parole)</span>
                </div>
            </div>
        </div>

        <!-- 3. ANDAMENTO NELLA PARTITA -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:#ff9800; margin-bottom:6px;">
                📉 Tenuta di Concentrazione durante il Match:
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8em;">
                <span>Inizio Match: <b style="color:#4caf50;">${sec1AccPct}%</b></span>
                <span>Centro Match: <b style="color:#ff9800;">${sec2AccPct}%</b></span>
                <span>Fine Match: <b style="color:${sec3AccPct < 80 ? '#f44336' : '#2196f3'};">${sec3AccPct}%</b></span>
            </div>
        </div>

        <!-- 4. TEMPI DI REAZIONE & CADENZA -->
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.85em; font-weight:bold; color:var(--champ-color); margin-bottom:4px;">
                ⏳ Tempi di Digitazione & Reazione:
            </div>
            <div style="font-size:0.82em; margin-bottom:2px;">
                Tempo medio per parola: <b>${avgSecVal} sec</b>
            </div>
            <div style="font-size:0.78em; ${styleStatusClass} font-weight:bold;">
                ${styleFeedback}
            </div>
        </div>

        <!-- 5. CONSIGLI & ISTRUZIONI PRATICHE -->
        <div style="background:rgba(149, 117, 205, 0.1); border:1px solid #9575cd; border-radius:8px; padding:10px;">
            <div style="font-size:0.88em; font-weight:bold; color:#9575cd; margin-bottom:6px; display:flex; align-items:center; gap:4px;">
                💡 Istruzioni e Consigli Personalizzati:
            </div>
            <div style="font-size:0.8em; line-height:1.45; display:flex; flex-direction:column; gap:6px;">
                ${tips.map(t => `<div style="background:rgba(0,0,0,0.2); padding:6px 8px; border-radius:6px;">${t}</div>`).join('')}
            </div>
        </div>
    `;
};
