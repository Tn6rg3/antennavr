// js/tone_test_manager.js

window.toneTestResultsData = [];
window.isToneTestRunning = false;
window.currentTestTone = 0;
window.currentTestWpm = 0;
window.currentTestChar = "";

window.openToneTest = function() {
    const modal = document.getElementById('toneTestModal');
    if (!modal) return;

    document.getElementById('toneTestSetup').style.display = 'block';
    document.getElementById('toneTestRunning').style.display = 'none';
    document.getElementById('toneTestResults').style.display = 'none';

    modal.style.display = 'flex';
};

window.startToneTest = function() {
    if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();

    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    window.toneTestResultsData = [];
    window.isToneTestRunning = true;

    const setupArea = document.getElementById('toneTestSetup');
    const runningArea = document.getElementById('toneTestRunning');
    const countEl = document.getElementById('toneTestCount');
    const errorEl = document.getElementById('toneTestErrors');

    if (setupArea) setupArea.style.display = 'none';
    if (runningArea) runningArea.style.display = 'block';
    if (countEl) countEl.textContent = '0';
    if (errorEl) errorEl.textContent = '0';

    const input = document.getElementById('toneTestInput');
    if (input) {
        input.value = "";
        // Rimuoviamo oninput automatico, ora usiamo i bottoni
        input.oninput = null;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') e.target.blur(); // Chiude tastiera su mobile
        };
        setTimeout(() => input.focus(), 500);
    }

    window.playNextTestSample();
};

window.playNextTestSample = function() {
    if (!window.isToneTestRunning) return;

    const minFreq = parseInt(document.getElementById('toneTestMinFreq')?.value) || 350;
    const maxFreq = parseInt(document.getElementById('toneTestMaxFreq')?.value) || 900;
    const minWpm = parseInt(document.getElementById('toneTestMinWpm')?.value) || 15;
    const maxWpm = parseInt(document.getElementById('toneTestMaxWpm')?.value) || 30;

    window.currentTestTone = Math.floor(Math.random() * (maxFreq - minFreq + 1)) + minFreq;
    window.currentTestWpm = Math.floor(Math.random() * (maxWpm - minWpm + 1)) + minWpm;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    window.currentTestChar = chars[Math.floor(Math.random() * chars.length)];

    const status = document.getElementById('toneTestStatus');
    if (status) {
        status.textContent = "Cosa hai sentito?";
        status.style.color = "inherit";
    }

    const input = document.getElementById('toneTestInput');
    if (input) {
        input.value = "";
        input.style.borderColor = "var(--link-color)";
        input.placeholder = "?";
        input.focus();
    }

    const originalTone = window.currentTone;
    window.currentTone = window.currentTestTone;
    if (typeof playMorseAudio === 'function') {
        playMorseAudio(window.currentTestChar, window.currentTestWpm, true);
    }
    setTimeout(() => { window.currentTone = originalTone; }, 100);
};

window.recordToneFeedback = function(isLimpidoSubjective) {
    if (!window.isToneTestRunning) return;

    const input = document.getElementById('toneTestInput');
    const userVal = input ? input.value.trim().toUpperCase() : "";

    if (!userVal) {
        showToast("Scrivi prima il carattere!");
        return;
    }

    const isCorrectObjective = (userVal === window.currentTestChar);

    window.toneTestResultsData.push({
        freq: window.currentTestTone,
        wpm: window.currentTestWpm,
        correct: isCorrectObjective,
        limpido: isLimpidoSubjective
    });

    const countEl = document.getElementById('toneTestCount');
    const errorEl = document.getElementById('toneTestErrors');
    const status = document.getElementById('toneTestStatus');

    if (countEl) countEl.textContent = window.toneTestResultsData.length;

    if (!isCorrectObjective) {
        if (errorEl) errorEl.textContent = window.toneTestResultsData.filter(d => !d.correct).length;
        if (input) input.style.borderColor = "#f44336";
        if (status) {
            status.textContent = `Era: ${window.currentTestChar}`;
            status.style.color = "#f44336";
        }
    } else {
        if (input) input.style.borderColor = "#4caf50";
        if (status) {
            status.textContent = isLimpidoSubjective ? "✨ Perfetto!" : "👍 Capito (ma faticoso)";
            status.style.color = "#4caf50";
        }
    }

    // Delay per feedback prima del prossimo
    setTimeout(() => {
        if (window.isToneTestRunning) {
            window.playNextTestSample();
        }
    }, 1000);
};

window.analyzeToneResults = function() {
    document.getElementById('toneTestRunning').style.display = 'none';
    document.getElementById('toneTestResults').style.display = 'block';

    const data = window.toneTestResultsData;
    const buckets = {};

    data.forEach(d => {
        const bucket = Math.round(d.freq / 50) * 50;
        if (!buckets[bucket]) buckets[bucket] = { total: 0, score: 0 };
        buckets[bucket].total++;

        // Punteggio pesato:
        // + Corretto e Limpido: 10 punti * (WPM/10)
        // + Corretto ma Sgradevole: 4 punti
        // - Errato: -10 punti
        if (d.correct) {
            if (d.limpido) buckets[bucket].score += (10 * (d.wpm / 15));
            else buckets[bucket].score += 4;
        } else {
            buckets[bucket].score -= 10;
        }
    });

    let bestFreq = 600, maxScore = -999;
    Object.keys(buckets).forEach(f => {
        if (buckets[f].score > maxScore) {
            maxScore = buckets[f].score;
            bestFreq = parseInt(f);
        }
    });

    const verdict = document.getElementById('toneTestVerdict');
    const acc = Math.round((data.filter(d => d.correct).length / data.length) * 100);
    const limpidoPerc = Math.round((data.filter(d => d.limpido).length / data.length) * 100);

    verdict.innerHTML = `Precisione: <b>${acc}%</b> | Gradimento: <b>${limpidoPerc}%</b><br>` +
                       `Tono consigliato: <b style="color:var(--champ-color); font-size:1.5em;">${bestFreq} Hz</b>.<br><br>` +
                       `<small>Questa frequenza offre il miglior bilanciamento tra chiarezza e piacevolezza d'ascolto.</small>`;

    document.getElementById('btnApplyBestTone').onclick = () => {
        const toneInput = document.getElementById('toneInput');
        if (toneInput) toneInput.value = bestFreq;
        window.currentTone = bestFreq;
        localStorage.setItem('cwgame_pref_tone', bestFreq);
        showToast(`Tono ${bestFreq}Hz applicato! 📻`);
        document.getElementById('toneTestModal').style.display = 'none';
    };

    window.renderToneChart(buckets, bestFreq);
};

window.renderToneChart = function(buckets, best) {
    const chart = document.getElementById('toneTestChart');
    if (!chart) return;
    chart.innerHTML = '';

    const frequencies = Object.keys(buckets).sort((a,b) => a-b);
    let minScore = 0, maxScore = 1;
    Object.values(buckets).forEach(b => {
        if (b.score < minScore) minScore = b.score;
        if (b.score > maxScore) maxScore = b.score;
    });

    const range = maxScore - minScore;

    frequencies.forEach(f => {
        const b = buckets[f];
        const bar = document.createElement('div');
        // Normalizziamo l'altezza rispetto al range dei punteggi
        const normalizedScore = (b.score - minScore) / range;
        const height = Math.max(5, normalizedScore * 100);

        const color = parseInt(f) === best ? 'var(--champ-color)' : (b.score > 0 ? 'var(--link-color)' : '#f44336');

        bar.style.cssText = `flex:1; height:${height}%; background:${color}; border-top-left-radius:3px; border-top-right-radius:3px; transition: height 0.5s; position:relative;`;
        bar.title = `${f}Hz (Score: ${b.score.toFixed(1)})`;

        if (parseInt(f) % 100 === 0) {
            const label = document.createElement('span');
            label.style.cssText = "position:absolute; bottom:-18px; left:50%; transform:translateX(-50%); font-size:0.6em; color:var(--hint-color);";
            label.textContent = f;
            bar.appendChild(label);
        }

        chart.appendChild(bar);
    });
};
