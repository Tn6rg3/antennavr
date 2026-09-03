// js/qso_audio_manager.js

window.qsoAudioState = {
    allResults: [],
    displayedCount: 0,
    pageSize: 5,
    currentAudioUrl: null
};

window.initQsoAudioModule = function() {
    console.log("QSO Audio: Module Initialized");
    window.qsoAudioState = {
        allResults: [],
        displayedCount: 0,
        pageSize: 5,
        currentAudioUrl: null
    };
};

window.getQsoServerUrlAutomatic = async function() {
    let serverUrl = window.qsoAudioServerUrl || localStorage.getItem('cwgame_qso_audio_url');
    if (serverUrl && serverUrl.startsWith('http')) return serverUrl;

    if (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL && VALIDATION_SERVER_URL.startsWith('http')) {
        try {
            const resp = await fetch(VALIDATION_SERVER_URL + "?action=get_config");
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.qsoAudioServerUrl) {
                    localStorage.setItem('cwgame_qso_audio_url', data.qsoAudioServerUrl);
                    window.qsoAudioServerUrl = data.qsoAudioServerUrl;
                    return data.qsoAudioServerUrl;
                }
            }
        } catch(e) {
            console.warn("Auto QSO Config fetch failed", e);
        }
    }
    return serverUrl;
};

window.searchQsoAudioFiles = async function() {
    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const loadMoreBtn = document.getElementById('btnQsoLoadMore');
    const statusText = document.getElementById('qsoSearchStatusText');

    if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:var(--link-color);">🔍 Connessione al server dei QSO...</p>';

    const serverUrl = await window.getQsoServerUrlAutomatic();

    if (!serverUrl) {
        showToast("⚠️ Impossibile ricavare l'URL del server QSO dal sistema.");
        if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; color:#f44336; padding:20px;">Server QSO non raggiungibile.</p>';
        return;
    }

    const callsign = (document.getElementById('qsoSearchCallsign')?.value || "").trim();
    const qrg = (document.getElementById('qsoSearchQrg')?.value || "").trim();
    const wpm = (document.getElementById('qsoSearchWpm')?.value || "").trim();
    const date = (document.getElementById('qsoSearchDate')?.value || "").trim();
    const tag = (document.getElementById('qsoSearchTag')?.value || "").trim();

    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const loadMoreBtn = document.getElementById('btnQsoLoadMore');
    const statusText = document.getElementById('qsoSearchStatusText');

    if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:var(--link-color);">🔍 Ricerca in corso su Google Drive...</p>';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (statusText) statusText.textContent = "Ricerca in corso...";

    // Costruiamo i parametri per la richiesta HTTP
    const queryParams = new URLSearchParams({
        action: 'search',
        callsign: callsign,
        qrg: qrg,
        wpm: wpm,
        date: date.replace(/-/g, ''), // Formato YYYYMMDD se viene da un datepicker
        tag: tag
    });

    try {
        const response = await fetch(`${serverUrl}?${queryParams.toString()}`);
        if (!response.ok) throw new Error("Errore risposta server Google Script");

        const data = await response.json();

        if (data.status === 'success') {
            window.qsoAudioState.allResults = data.results || [];
            window.qsoAudioState.displayedCount = 0;

            if (resultsContainer) resultsContainer.innerHTML = '';

            if (window.qsoAudioState.allResults.length === 0) {
                if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.6;">Nessun QSO trovato con questi criteri.</p>';
                if (statusText) statusText.textContent = "0 risultati trovati.";
                return;
            }

            if (statusText) statusText.textContent = `Trovati ${window.qsoAudioState.allResults.length} QSO. Mostrati i primi ${Math.min(5, window.qsoAudioState.allResults.length)}:`;

            // Rendering dei primi 5 risultati
            window.renderNextQsoResultsBatch();
        } else {
            showToast("Errore ricerca: " + (data.message || "Errore sconosciuto"));
            if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; color:#f44336; padding:20px;">Errore durante la ricerca.</p>';
        }
    } catch(err) {
        console.error("QSO Search Error:", err);
        showToast("Impossibile contattare il server dei QSO.");
        if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; color:#f44336; padding:20px;">Connessione fallita.</p>';
    }
};

window.renderNextQsoResultsBatch = function() {
    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const loadMoreBtn = document.getElementById('btnQsoLoadMore');
    const statusText = document.getElementById('qsoSearchStatusText');

    if (!resultsContainer) return;

    const all = window.qsoAudioState.allResults;
    const startIndex = window.qsoAudioState.displayedCount;
    const endIndex = Math.min(startIndex + window.qsoAudioState.pageSize, all.length);

    for (let i = startIndex; i < endIndex; i++) {
        const item = all[i];
        const card = window.createQsoResultCard(item, i + 1);
        resultsContainer.appendChild(card);
    }

    window.qsoAudioState.displayedCount = endIndex;

    if (statusText) {
        statusText.textContent = `Mostrati ${window.qsoAudioState.displayedCount} di ${all.length} QSO trovati.`;
    }

    // Gestione visibilità del pulsante "Mostra Altri"
    if (loadMoreBtn) {
        if (window.qsoAudioState.displayedCount < all.length) {
            const remaining = all.length - window.qsoAudioState.displayedCount;
            loadMoreBtn.textContent = `MOSTRA ALTRI RISULTATI (${Math.min(5, remaining)}) 🔽`;
            loadMoreBtn.style.display = 'block';
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }
};

window.createQsoResultCard = function(item, index) {
    const card = document.createElement('div');
    card.className = 'box-panel';
    card.style.cssText = "padding:12px; margin-bottom:10px; border-color:var(--link-color); background:rgba(33, 150, 243, 0.05); display:flex; flex-direction:column; gap:8px;";

    // Parsing del nome del file per estrazione metadati leggibili
    // Formato tipo: 20260822-9k4lsr tt5tkw-45 wpm-qrq-paddle-7030 khz.mp3
    const filename = item.filename || "QSO Audio";
    const cleanName = filename.replace(/\.[^/.]+$/, ""); // Rimuove estensione

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <b style="color:var(--link-color); font-size:0.95em;">#${index} - 📻 ${cleanName}</b>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8em; color:var(--hint-color);">
            <span>📁 MP3 Drive</span>
            <button class="action-btn-small btn-success" style="width:auto; padding:6px 12px; font-weight:bold;">▶️ ASCOLTA QSO</button>
        </div>
    `;

    const playBtn = card.querySelector('button');
    if (playBtn) {
        playBtn.onclick = () => window.playQsoAudioItem(item, cleanName);
    }

    return card;
};

window.playQsoAudioItem = function(item, title) {
    const playerArea = document.getElementById('qsoAudioPlayerArea');
    const audioEl = document.getElementById('qsoHtmlPlayer');
    const titleEl = document.getElementById('qsoPlayerTitle');

    if (!playerArea || !audioEl) return;

    playerArea.style.display = 'block';
    if (titleEl) titleEl.textContent = title;

    audioEl.src = item.streamUrl;
    audioEl.load();

    // Forza riproduzione
    audioEl.play().catch(err => {
        console.warn("Audio Play Error:", err);
        showToast("Premi Play per avviare l'ascolto.");
    });

    playerArea.scrollIntoView({ behavior: 'smooth' });
};

window.resetQsoSearchForm = function() {
    const inputs = ['qsoSearchCallsign', 'qsoSearchQrg', 'qsoSearchWpm', 'qsoSearchDate', 'qsoSearchTag'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const loadMoreBtn = document.getElementById('btnQsoLoadMore');
    const statusText = document.getElementById('qsoSearchStatusText');
    const playerArea = document.getElementById('qsoAudioPlayerArea');
    const audioEl = document.getElementById('qsoHtmlPlayer');

    if (resultsContainer) resultsContainer.innerHTML = '';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (statusText) statusText.textContent = '';
    if (playerArea) playerArea.style.display = 'none';
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }

    window.qsoAudioState = {
        allResults: [],
        displayedCount: 0,
        pageSize: 5,
        currentAudioUrl: null
    };
};
