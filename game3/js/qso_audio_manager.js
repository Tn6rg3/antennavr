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
    // L'URL è accessibile ESCLUSIVAMENTE se fornito dallo script di autenticazione Telegram
    let serverUrl = window.qsoAudioServerUrl || localStorage.getItem('cwgame_qso_audio_url');
    if (serverUrl && serverUrl.startsWith('http')) return serverUrl;

    return null;
};

window.searchQsoAudioFiles = async function() {
    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const loadMoreBtn = document.getElementById('btnQsoLoadMore');
    const statusText = document.getElementById('qsoSearchStatusText');

    if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:var(--link-color);">🔍 Connessione al server dei QSO...</p>';

    const serverUrl = await window.getQsoServerUrlAutomatic();

    if (!serverUrl) {
        showToast("⚠️ Autenticazione Telegram richiesta per l'archivio QSO.");
        if (resultsContainer) {
            resultsContainer.innerHTML = '<p style="text-align:center; color:#ff9800; padding:20px;">⚠️ Accesso riservato agli utenti autenticati tramite Telegram.</p>';
        }
        return;
    }

    const callsign = (document.getElementById('qsoSearchCallsign')?.value || "").trim();
    const qrg = (document.getElementById('qsoSearchQrg')?.value || "").trim();
    const wpm = (document.getElementById('qsoSearchWpm')?.value || "").trim();
    const date = (document.getElementById('qsoSearchDate')?.value || "").trim();
    const tag = (document.getElementById('qsoSearchTag')?.value || "").trim();

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
        let cleanServerUrl = serverUrl.trim();
        if (cleanServerUrl.includes('/edit')) {
            cleanServerUrl = cleanServerUrl.split('/edit')[0] + '/exec';
        }
        if (cleanServerUrl.endsWith('/dev')) {
            cleanServerUrl = cleanServerUrl.slice(0, -4) + '/exec';
        }

        const separator = cleanServerUrl.includes('?') ? '&' : '?';
        const fullUrl = `${cleanServerUrl}${separator}${queryParams.toString()}`;
        console.log("QSO Search Requesting URL:", fullUrl);

        const response = await fetch(fullUrl, {
            method: 'GET',
            mode: 'cors',
            redirect: 'follow'
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

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
        showToast("⚠️ Errore CORS o permessi Google Script.");
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="box-panel" style="border-color:#f44336; padding:12px; font-size:0.85em; text-align:left;">
                    <b style="color:#f44336;">⚠️ Errore di Accesso al Server Google Script</b><br><br>
                    La chiamata da <code>tn6rg3.github.io</code> è stata bloccata. Verifica nello script Google:<br>
                    1. Clicca su <b>Distribuisci ➔ Gestisci distribuzioni</b><br>
                    2. Clicca sull'icona della matita ✏️ in alto a destra e seleziona <b>"Nuova versione"</b><br>
                    3. Verifica che <b>Chi ha accesso</b> sia impostato su <b>"Chiunque"</b> (Anyone)<br>
                    4. Verifica che l'ID della cartella Google Drive nel codice sia corretto.
                </div>
            `;
        }
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

    const filename = item.filename || "QSO Audio";
    const cleanName = filename.replace(/\.[^/.]+$/, "");

    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    const driveDirectLink = fileId ? `https://drive.google.com/file/d/${fileId}/view` : item.streamUrl;

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <b style="color:var(--link-color); font-size:0.95em;">#${index} - 📻 ${cleanName}</b>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8em; color:var(--hint-color); flex-wrap:wrap; gap:6px;">
            <a href="${driveDirectLink}" target="_blank" style="color:var(--hint-color); text-decoration:underline;">🌐 Apri su Drive</a>
            <button class="action-btn-small btn-success" style="width:auto; padding:6px 14px; font-weight:bold;">▶️ ASCOLTA QSO</button>
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
    const iframeEl = document.getElementById('qsoDriveIframe');
    const audioEl = document.getElementById('qsoHtmlPlayer');
    const titleEl = document.getElementById('qsoPlayerTitle');

    if (!playerArea) return;

    playerArea.style.display = 'block';
    if (titleEl) titleEl.textContent = "🎧 " + title;

    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    if (fileId && !fileId.startsWith('row_')) {
        // Player 1: Google Drive Embedded Preview (Decodifica sia .ogg/opus di Telegram sia .mp3/.wav su iOS/Chrome/Safari)
        if (iframeEl) {
            iframeEl.src = `https://drive.google.com/file/d/${fileId}/preview`;
            iframeEl.style.display = 'block';
        }
        if (audioEl) audioEl.style.display = 'none';
    } else {
        // Player 2: Fallback HTML5 audio element per URL diretti
        if (iframeEl) iframeEl.style.display = 'none';
        if (audioEl) {
            audioEl.style.display = 'block';
            audioEl.src = item.streamUrl;
            audioEl.load();
            audioEl.play().catch(err => console.warn("HTML5 Audio Play Error:", err));
        }
    }

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
    const iframeEl = document.getElementById('qsoDriveIframe');
    const audioEl = document.getElementById('qsoHtmlPlayer');

    if (resultsContainer) resultsContainer.innerHTML = '';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (statusText) statusText.textContent = '';
    if (playerArea) playerArea.style.display = 'none';
    if (iframeEl) { iframeEl.style.display = 'none'; iframeEl.src = ''; }
    if (audioEl) { audioEl.style.display = 'none'; audioEl.pause(); audioEl.src = ''; }

    window.qsoAudioState = {
        allResults: [],
        displayedCount: 0,
        pageSize: 5,
        currentAudioUrl: null
    };
};
