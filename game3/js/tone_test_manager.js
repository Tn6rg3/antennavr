// js/tone_test_manager.js

window.toneTestResultsData = [];
window.isToneTestRunning = false;
window.currentTestTone = 0;
window.currentTestWpm = 0;

window.openToneTest = function() {
    const modal = document.getElementById('toneTestModal');
    if (!modal) return;

    document.getElementById('toneTestSetup').style.display = 'block';
    document.getElementById('toneTestRunning').style.display = 'none';
    document.getElementById('toneTestResults').style.display = 'none';

    modal.style.display = 'flex';
};

window.startToneTest = function() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    window.toneTestResultsData = [];
    window.isToneTestRunning = true;

    document.getElementById('toneTestSetup').style.display = 'none';
    document.getElementById('toneTestRunning').style.display = 'block';
    document.getElementById('toneTestCount').textContent = '0';

    window.playNextTestSample();
};

window.playNextTestSample = function() {
    if (!window.isToneTestRunning) return;

    const minFreq = parseInt(document.getElementById('toneTestMinFreq').value) || 350;
    const maxFreq = parseInt(document.getElementById('toneTestMaxFreq').value) || 900;
    const minWpm = parseInt(document.getElementById('toneTestMinWpm').value) || 15;
    const maxWpm = parseInt(document.getElementById('toneTestMaxWpm').value) || 30;

    // Scegliamo un tono e una velocità casuali nel range
    window.currentTestTone = Math.floor(Math.random() * (maxFreq - minFreq + 1)) + minFreq;
    window.currentTestWpm = Math.floor(Math.random() * (maxWpm - minWpm + 1)) + minWpm;

    // Scegliamo un carattere o numero casuale
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const char = chars[Math.floor(Math.random() * chars.length)];

    document.getElementById('toneTestStatus').textContent = "Ascolta il segnale...";

    // Salviamo il tono globale, suoniamo, e ripristiniamo (per non interferire con il gioco)
    const originalTone = window.currentTone;
    window.currentTone = window.currentTestTone;

    if (typeof playMorseAudio === 'function') {
        playMorseAudio(char, window.currentTestWpm, true);
    }

    window.currentTone = originalTone;
};

window.recordToneFeedback = function(isGood) {
    if (!window.isToneTestRunning) return;

    window.toneTestResultsData.push({
        freq: window.currentTestTone,
        wpm: window.currentTestWpm,
        good: isGood
    });

    document.getElementById('toneTestCount').textContent = window.toneTestResultsData.length;

    // Piccolo feedback visivo
    const status = document.getElementById('toneTestStatus');
    status.textContent = isGood ? "✅ Ricevuto Bene" : "❌ Ricevuto Male";
    status.style.color = isGood ? "#4caf50" : "#f44336";

    setTimeout(() => {
        if (window.isToneTestRunning) {
            status.style.color = "inherit";
            window.playNextTestSample();
        }
    }, 600);
};

window.stopToneTest = function() {
    window.isToneTestRunning = false;
    if (typeof stopAllMorseAudio === 'function') stopAllMorseAudio();

    if (window.toneTestResultsData.length < 5) {
        alert("Raccogli almeno 5 campioni per avere un'analisi attendibile.");
        window.openToneTest();
        return;
    }

    window.analyzeToneResults();
};

window.analyzeToneResults = function() {
    document.getElementById('toneTestRunning').style.display = 'none';
    document.getElementById('toneTestResults').style.display = 'block';

    const data = window.toneTestResultsData;

    // Dividiamo il range in "secchi" da 50Hz per l'analisi
    const buckets = {};
    data.forEach(d => {
        const bucket = Math.round(d.freq / 50) * 50;
        if (!buckets[bucket]) buckets[bucket] = { total: 0, good: 0, score: 0 };
        buckets[bucket].total++;
        if (d.good) {
            buckets[bucket].good++;
            // Più è alto il WPM, più "pesa" il voto positivo
            buckets[bucket].score += (d.wpm / 10);
        } else {
            buckets[bucket].score -= 2;
        }
    });

    let bestFreq = 600;
    let maxScore = -999;

    // Troviamo il secchio con lo score migliore
    Object.keys(buckets).forEach(f => {
        if (buckets[f].score > maxScore) {
            maxScore = buckets[f].score;
            bestFreq = parseInt(f);
        }
    });

    const verdict = document.getElementById('toneTestVerdict');
    verdict.innerHTML = `Il tuo tono ideale rilevato è <b style="color:var(--champ-color); font-size:1.5em;">${bestFreq} Hz</b>.<br><br>` +
                       `<small>Analisi basata su ${data.length} campioni con velocità fino a ${Math.max(...data.map(d=>d.wpm))} WPM.</small>`;

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
    const maxVal = Math.max(...Object.values(buckets).map(b => Math.abs(b.score))) || 1;

    frequencies.forEach(f => {
        const b = buckets[f];
        const bar = document.createElement('div');
        const height = Math.max(10, (Math.abs(b.score) / maxVal) * 100);
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
