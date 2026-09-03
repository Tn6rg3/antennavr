// js/qso_audio_manager.js

window.qsoAudioState = {
    allResults: [],
    currentPage: 1,
    pageSize: 5,
    currentAudioUrl: null
};

window.initQsoAudioModule = function() {
    console.log("QSO Audio: Module Initialized");
    window.qsoAudioState = {
        allResults: [],
        currentPage: 1,
        pageSize: 5,
        currentAudioUrl: null
    };
};

window.toggleQsoSearchPanel = function() {
    const content = document.getElementById('qsoSearchFormContent');
    const btn = document.getElementById('btnToggleQsoSearch');
    if (!content || !btn) return;

    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = 'Nascondi ▲';
    } else {
        content.style.display = 'none';
        btn.textContent = 'Mostra ▼';
    }
};

window.getQsoServerUrlAutomatic = async function() {
    let serverUrl = window.qsoAudioServerUrl || localStorage.getItem('cwgame_qso_audio_url');
    if (serverUrl && serverUrl.startsWith('http')) return serverUrl;

    if (typeof VALIDATION_SERVER_URL !== 'undefined' && VALIDATION_SERVER_URL && VALIDATION_SERVER_URL.startsWith('http')) {
        try {
            const resp = await fetch(`${VALIDATION_SERVER_URL}?action=get_config`);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.qsoAudioServerUrl && data.qsoAudioServerUrl.startsWith('http')) {
                    localStorage.setItem('cwgame_qso_audio_url', data.qsoAudioServerUrl);
                    window.qsoAudioServerUrl = data.qsoAudioServerUrl;
                    return data.qsoAudioServerUrl;
                }
            }
        } catch(e) {
            console.warn("QSO Config fetch error:", e);
        }
    }

    return window.qsoAudioServerUrl || localStorage.getItem('cwgame_qso_audio_url');
};

window.searchQsoAudioFiles = async function() {
    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const paginationControls = document.getElementById('qsoPaginationControls');
    const statusText = document.getElementById('qsoSearchStatusText');

    if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:15px; color:var(--link-color);">🔍 Connessione al server dei QSO...</p>';
    if (paginationControls) paginationControls.style.display = 'none';

    const serverUrl = await window.getQsoServerUrlAutomatic();

    if (!serverUrl) {
        showToast("⚠️ Autenticazione Telegram richiesta per l'archivio QSO.");
        if (resultsContainer) {
            resultsContainer.innerHTML = '<p style="text-align:center; color:#ff9800; padding:15px;">⚠️ Accesso riservato agli utenti autenticati tramite Telegram.</p>';
        }
        return;
    }

    const callsign = (document.getElementById('qsoSearchCallsign')?.value || "").trim();
    const qrg = (document.getElementById('qsoSearchQrg')?.value || "").trim();
    const wpm = (document.getElementById('qsoSearchWpm')?.value || "").trim();
    const date = (document.getElementById('qsoSearchDate')?.value || "").trim();
    const tag = (document.getElementById('qsoSearchTag')?.value || "").trim();

    if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:15px; color:var(--link-color);">🔍 Ricerca in corso su Google Drive...</p>';
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
            window.qsoAudioState.currentPage = 1;

            if (resultsContainer) resultsContainer.innerHTML = '';

            if (window.qsoAudioState.allResults.length === 0) {
                if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; padding:15px; opacity:0.6;">Nessun QSO trovato con questi criteri.</p>';
                if (statusText) statusText.textContent = "0 risultati trovati.";
                return;
            }

            // Richiudiamo il pannello di ricerca per dare massimo spazio ai risultati
            const content = document.getElementById('qsoSearchFormContent');
            const btn = document.getElementById('btnToggleQsoSearch');
            if (content && btn) {
                content.style.display = 'none';
                btn.textContent = 'Mostra ▼';
            }

            // Rendering della prima pagina (5 risultati)
            window.renderQsoPage(1);
        } else {
            showToast("Errore ricerca: " + (data.message || "Errore sconosciuto"));
            if (resultsContainer) resultsContainer.innerHTML = '<p style="text-align:center; color:#f44336; padding:15px;">Errore durante la ricerca.</p>';
        }
    } catch(err) {
        console.error("QSO Search Error:", err);
        showToast("⚠️ Errore CORS o permessi Google Script.");
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="box-panel" style="border-color:#f44336; padding:10px; font-size:0.8em; text-align:left;">
                    <b style="color:#f44336;">⚠️ Errore di Accesso al Server Google Script</b><br><br>
                    La chiamata è stata bloccata. Verifica nello script Google:<br>
                    1. <b>Distribuisci ➔ Gestisci distribuzioni</b><br>
                    2. Modifica ➔ <b>Versione: Nuova versione</b><br>
                    3. Verifica <b>Chi ha accesso ➔ Chiunque</b> (Anyone)
                </div>
            `;
        }
    }
};

window.renderQsoPage = function(pageNumber) {
    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const paginationControls = document.getElementById('qsoPaginationControls');
    const statusText = document.getElementById('qsoSearchStatusText');
    const prevBtn = document.getElementById('btnQsoPrevPage');
    const nextBtn = document.getElementById('btnQsoNextPage');
    const indicator = document.getElementById('qsoPageIndicator');

    if (!resultsContainer) return;

    const all = window.qsoAudioState.allResults;
    const pageSize = window.qsoAudioState.pageSize;
    const totalPages = Math.ceil(all.length / pageSize) || 1;

    let page = Math.max(1, Math.min(pageNumber, totalPages));
    window.qsoAudioState.currentPage = page;

    resultsContainer.innerHTML = '';

    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, all.length);

    for (let i = startIndex; i < endIndex; i++) {
        const item = all[i];
        const card = window.createQsoResultCard(item, i + 1);
        resultsContainer.appendChild(card);
    }

    if (statusText) {
        statusText.textContent = `Trovati ${all.length} QSO (Mostrando ${startIndex + 1}-${endIndex}):`;
    }

    // Paginazione con frecce (⬅️ | Pagina X di Y | ➡️)
    if (paginationControls) {
        if (totalPages > 1) {
            paginationControls.style.display = 'flex';
            if (indicator) indicator.textContent = `Pagina ${page} di ${totalPages}`;
            if (prevBtn) prevBtn.disabled = (page <= 1);
            if (nextBtn) nextBtn.disabled = (page >= totalPages);
        } else {
            paginationControls.style.display = 'none';
        }
    }
};

window.changeQsoPage = function(delta) {
    const newPage = window.qsoAudioState.currentPage + delta;
    window.renderQsoPage(newPage);
};

window.createQsoResultCard = function(item, index) {
    const card = document.createElement('div');
    card.className = 'box-panel';
    card.style.cssText = "padding:8px 10px; margin-bottom:4px; border-color:var(--link-color); background:rgba(33, 150, 243, 0.05); display:flex; justify-content:space-between; align-items:center; font-size:0.85em; gap:6px;";

    const filename = item.filename || "QSO Audio";
    const cleanName = filename.replace(/\.[^/.]+$/, "");

    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    const driveDirectLink = fileId ? `https://drive.google.com/file/d/${fileId}/view` : item.streamUrl;

    card.innerHTML = `
        <div style="display:flex; flex-direction:column; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:68%;">
            <b style="color:var(--link-color); font-size:0.9em; overflow:hidden; text-overflow:ellipsis;">#${index} - 📻 ${cleanName}</b>
            <a href="${driveDirectLink}" target="_blank" style="color:var(--hint-color); text-decoration:underline; font-size:0.75em; margin-top:2px;">🌐 Apri su Drive</a>
        </div>
        <button class="action-btn-small btn-success" style="width:auto; padding:5px 10px; font-weight:bold; font-size:0.8em; flex-shrink:0;">▶️ ASCOLTA</button>
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
        if (iframeEl) {
            iframeEl.src = `https://drive.google.com/file/d/${fileId}/preview`;
            iframeEl.style.display = 'block';
        }
        if (audioEl) audioEl.style.display = 'none';
    } else {
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

window.closeQsoPlayer = function() {
    const playerArea = document.getElementById('qsoAudioPlayerArea');
    const iframeEl = document.getElementById('qsoDriveIframe');
    const audioEl = document.getElementById('qsoHtmlPlayer');

    if (playerArea) playerArea.style.display = 'none';
    if (iframeEl) { iframeEl.style.display = 'none'; iframeEl.src = ''; }
    if (audioEl) { audioEl.style.display = 'none'; audioEl.pause(); audioEl.src = ''; }
};

window.resetQsoSearchForm = function() {
    const inputs = ['qsoSearchCallsign', 'qsoSearchQrg', 'qsoSearchWpm', 'qsoSearchDate', 'qsoSearchTag'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const resultsContainer = document.getElementById('qsoSearchResultsContainer');
    const paginationControls = document.getElementById('qsoPaginationControls');
    const statusText = document.getElementById('qsoSearchStatusText');

    if (resultsContainer) resultsContainer.innerHTML = '';
    if (paginationControls) paginationControls.style.display = 'none';
    if (statusText) statusText.textContent = '';

    window.closeQsoPlayer();

    window.qsoAudioState = {
        allResults: [],
        currentPage: 1,
        pageSize: 5,
        currentAudioUrl: null
    };
};
