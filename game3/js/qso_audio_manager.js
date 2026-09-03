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
                if (data && data.qsoAudioServerUrl && data.qsoAudioServerUrl.startsWith('http')) {
                    localStorage.setItem('cwgame_qso_audio_url', data.qsoAudioServerUrl);
                    window.qsoAudioServerUrl = data.qsoAudioServerUrl;
                    return data.qsoAudioServerUrl;
                }
            }
        } catch(e) {
            console.warn("Auto QSO Config fetch failed", e);
        }
    }

    // Fallback automatico: Chiede l'URL una sola volta se non ancora rilevato automaticamente
    if (!serverUrl) {
        const inputUrl = prompt("⚙️ Configurazione Server QSO:\nNon è stato rilevato automaticamente l'URL del server QSO.\nIncolla l'URL della tua Web App Google Apps Script:");
        if (inputUrl && inputUrl.trim().startsWith("http")) {
            serverUrl = inputUrl.trim();
            localStorage.setItem('cwgame_qso_audio_url', serverUrl);
            window.qsoAudioServerUrl = serverUrl;
            showToast("URL Server QSO salvato! 💾");
        }
    }

    return serverUrl;
};

window.configureQsoServerUrl = function() {
    const current = window.qsoAudioServerUrl || localStorage.getItem('cwgame_qso_audio_url') || "";
    const url = prompt("⚙️ Configurazione Server QSO (Google Apps Script):\nModifica o incolla l'URL della Web App:", current);
    if (url && url.trim().startsWith("http")) {
        const cleanUrl = url.trim();
        localStorage.setItem('cwgame_qso_audio_url', cleanUrl);
        window.qsoAudioServerUrl = cleanUrl;
        showToast("URL Server QSO aggiornato! 💾");
        return cleanUrl;
    } else if (url !== null) {
        showToast("⚠️ URL non valido.");
    }
    return null;
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
    const audioEl = document.getElementById('qsoHtmlPlayer');
    const titleEl = document.getElementById('qsoPlayerTitle');

    if (!playerArea || !audioEl) return;

    playerArea.style.display = 'block';
    if (titleEl) titleEl.textContent = "🎧 " + title;

    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    // Usa l'URL diretto CDN di Google Drive per la massima compatibilità browser
    let streamUrl = item.streamUrl;
    if (fileId && !fileId.startsWith('row_')) {
        streamUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    }

    audioEl.src = streamUrl;
    audioEl.onerror = () => {
        console.warn("Primary CDN stream failed, fallback to uc download URL...");
        if (fileId) {
            audioEl.src = `https://docs.google.com/uc?export=download&id=${fileId}`;
        }
    };

    audioEl.load();

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            console.warn("Audio Play Error:", err);
            showToast("⚠️ Premere il tasto PLAY ▶️ sul lettore in basso per l'ascolto.");
        });
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
