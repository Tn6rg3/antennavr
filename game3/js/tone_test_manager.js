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

    // Sicurezza: inizializziamo audioCtx se non esiste
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
        input.oninput = window.handleToneTestInput;
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
        status.textContent = "Ascolta e digita...";
        status.style.color = "inherit";
    }

    const input = document.getElementById('toneTestInput');
    if (input) {
        input.value = "";
        input.style.borderColor = "var(--link-color)";
    }

    // Usiamo una variabile locale per il tono durante la sessione di test
    // per evitare conflitti con il sistema globale se resettato troppo in fretta
    const originalTone = window.currentTone;
    window.currentTone = window.currentTestTone;

    if (typeof playMorseAudio === 'function') {
        // Non usiamo await qui per non bloccare la UI,
        // ma playMorseAudio è sincrona nella fase di scheduling
        playMorseAudio(window.currentTestChar, window.currentTestWpm, true);
    }

    // Ripristiniamo dopo un piccolo delay per sicurezza dello scheduling
    setTimeout(() => {
        window.currentTone = originalTone;
    }, 100);
};

window.handleToneTestInput = function(e) {
    if (!window.isToneTestRunning) return;
    const val = e.target.value.trim().toUpperCase();
    if (val.length === 0) return;

    const isGood = (val === window.currentTestChar);
    window.recordToneFeedback(isGood);
};

window.recordToneFeedback = function(isGood) {
    if (!window.isToneTestRunning) return;

    window.toneTestResultsData.push({
        freq: window.currentTestTone,
        wpm: window.currentTestWpm,
        good: isGood
    });

    const countEl = document.getElementById('toneTestCount');
    const errorEl = document.getElementById('toneTestErrors');
    const input = document.getElementById('toneTestInput');
    const status = document.getElementById('toneTestStatus');

    countEl.textContent = window.toneTestResultsData.length;
    if (!isGood) {
        errorEl.textContent = window.toneTestResultsData.filter(d => !d.good).length;
        input.style.borderColor = "#f44336";
        status.textContent = `❌ Errato! (Era ${window.currentTestChar})`;
        status.style.color = "#f44336";
    } else {
        input.style.borderColor = "#4caf50";
        status.textContent = "✅ Corretto!";
        status.style.color = "#4caf50";
    }

    // Passiamo alla prossima parola dopo un breve delay
    setTimeout(() => {
        if (window.isToneTestRunning) {
            window.playNextTestSample();
            if (input) input.focus();
        }
    }, 800);
};

window.stopToneTest = function() {
    window.isToneTestRunning = false;
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    if (window.toneTestResultsData.length < 5) {
        alert("Fai almeno 5 prove per avere un'analisi attendibile.");
        window.openToneTest();
        return;
    }

    window.analyzeToneResults();
};

window.analyzeToneResults = function() {
    document.getElementById('toneTestRunning').style.display = 'none';
    document.getElementById('toneTestResults').style.display = 'block';

    const data = window.toneTestResultsData;
    const buckets = {};

    data.forEach(d => {
        const bucket = Math.round(d.freq / 50) * 50;
        if (!buckets[bucket]) buckets[bucket] = { total: 0, good: 0, score: 0 };
        buckets[bucket].total++;
        if (d.good) {
            buckets[bucket].good++;
            buckets[bucket].score += (d.wpm / 10);
        } else {
            buckets[bucket].score -= 5; // Penalità più severa per l'errore oggettivo
        }
    });

    let bestFreq = 600;
    let maxScore = -999;

    Object.keys(buckets).forEach(f => {
        if (buckets[f].score > maxScore) {
            maxScore = buckets[f].score;
            bestFreq = parseInt(f);
        }
    });

    const verdict = document.getElementById('toneTestVerdict');
    const correctCount = data.filter(d => d.good).length;
    const accuracy = Math.round((correctCount / data.length) * 100);

    verdict.innerHTML = `Accuratezza totale: <b>${accuracy}%</b><br>` +
                       `Tono consigliato: <b style="color:var(--champ-color); font-size:1.5em;">${bestFreq} Hz</b>.<br><br>` +
                       `<small>Il tuo orecchio ha decodificato meglio a questa frequenza nonostante le variazioni di velocità.</small>`;

    document.getElementById('btnApplyBestTone').onclick = () => {
        const toneInput = document.getElementById('toneInput');
        if (toneInput) toneInput.value = bestFreq;
        window.currentTone = bestFreq;
        localStorage.setItem('cwgame_pref_tone', bestFreq);
        showToast(`Tono impostato a ${bestFreq}Hz! 📻`);
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
