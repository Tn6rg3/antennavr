// js/ai_training_manager.js

window.aiTrainingState = {
    ortSession: null,
    qsoList: [],
    savedPairs: [],
    currentAudioBuffer: null,
    currentSourceNode: null,
    currentWindowStart: 0,
    currentWindowDuration: 20, // Default 20s (variabile 20s - 60s)
    markerA: 0.0,
    markerB: 10.0,
    timelineZoomFactor: 1.0,
    timelineScrollOffset: 0.0,
    activeDraggingMarker: null,
    dragStartClickTime: 0,
    dragStartMarkerA: 0,
    dragStartMarkerB: 0,
    editingPairIndex: -1,
    isMicActive: false,
    micStream: null,
    analyserNode: null,
    scriptProcessorNode: null,
    liveAnimationFrame: null,
    liveAudioBuffer: new Float32Array(16000 * 3),
    liveBufferPos: 0,
    lastDecodedText: "",
    silenceDurationSec: 0,
    liveDecodingInterval: null,
    isAutoLearningEnabled: false
};

const AI_VOCAB = [
    '<BLANK>', ' ',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@',
    '_', '^', '~', '<AR>', '<BT>', '<KN>', '<SK>', '<KA>'
];

const ITALIAN_RADIO_DICTIONARY = [
    "CQ", "DE", "QSO", "QTH", "QSL", "QRM", "QRN", "QSB", "QRT", "QRZ", "QSY", "RST", "WATTS",
    "ANTENNA", "DIPOLE", "VERTICAL", "YAGI", "BEAM", "RIG", "TRANSCEIVER", "NAME", "OPERATOR",
    "TEMP", "WEATHER", "BUREAU", "LOTW", "CONTEST", "BEST", "DX", "73", "88", "BK", "SK", "AR",
    "BT", "KN", "PSE", "HW", "CPI", "FB", "VY", "TNX", "TU", "GM", "GA", "GE", "GN", "OM", "YL",
    "XYL", "DIPOLE", "AMPLIFIER", "BAND", "MEGAHERTZ", "KILOHERTZ", "CALLSIGN", "CIAO", "BUONGIORNO",
    "BUONASERA", "GRAZIE", "MOLTO", "BENE", "ROMA", "MILANO", "TORINO", "NAPOLI", "FIRENZE", "GENOVA",
    "RADIO", "STAZIONE", "ASCOLTO", "PROVA", "SOPRATTUTTO", "TUTTO", "PRESTO", "PROPAGAZIONE"
];

window.openStandaloneAiStudio = function() {
    const uid = window.myId || (window.tgUser ? window.tgUser.id : "");
    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const tgInitData = window.tgInitData || (window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : "");

    let baseUrl = window.location.href.split('?')[0].split('#')[0];
    if (!baseUrl.endsWith('.html') && !baseUrl.endsWith('/')) {
        baseUrl += '/appcw.html';
    } else if (baseUrl.endsWith('/')) {
        baseUrl += 'appcw.html';
    }

    let targetUrl = `${baseUrl}?mode=addestra_ia`;
    if (uid) targetUrl += `&uid=${encodeURIComponent(uid)}`;
    if (token) targetUrl += `&token=${encodeURIComponent(token)}`;
    if (tgInitData) targetUrl += `&initData=${encodeURIComponent(tgInitData)}`;

    console.log("🚀 Opening Standalone AI Studio in new browser tab:", targetUrl);
    const win = window.open(targetUrl, '_blank');
    if (!win && window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
        window.Telegram.WebApp.openLink(targetUrl);
    }
};

window.initAiTrainingModule = async function() {
    console.log("AI Training: Initializing ONNX & Audio Studio...");

    // 1. Verifico se nell'URL ci sono parametri di autenticazione (es. da Telegram Web o Nuova Scheda)
    const urlParams = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));
    const urlUid = urlParams.get('uid');
    const urlToken = urlParams.get('token');
    if (urlUid) window.myId = urlUid;
    if (urlToken) {
        window.aiAuthToken = urlToken;
        localStorage.setItem('cwgame_ai_auth_token', urlToken);
    }

    // 2. Protezione di Sicurezza: L'autenticazione deve SEMPRE avvenire
    const isAuth = !!(window.myId || window.tgUser || window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user));
    if (!isAuth) {
        showToast("⚠️ Accesso riservato agli utenti autenticati del gioco.");
        if (typeof window.goBackToMenu === 'function') window.goBackToMenu();
        return;
    }

    // Se si accede via ?mode=addestra_ia, si apre direttamente la schermata aiTrainingScreen
    if (urlParams.get('mode') === 'addestra_ia' || urlParams.get('screen') === 'ai_training') {
        if (typeof window.showScreen === 'function') window.showScreen('aiTrainingScreen');
        // Nasconde il pulsante "Apri in Nuova Scheda" quando siamo già nella nuova scheda browser
        setTimeout(() => {
            const newTabBtn = document.querySelector('button[onclick="window.openStandaloneAiStudio()"]');
            if (newTabBtn && newTabBtn.parentElement) {
                newTabBtn.parentElement.style.display = 'none';
            }
        }, 100);
    }

    window.aiTrainingState.savedPairs = [];
    window.loadAiSavedPairsFromStorage();

    // Inizializza modello ONNX selezionato dal menu se la libreria ort è presente
    if (typeof ort !== 'undefined' && !window.aiTrainingState.ortSession) {
        const selectedModel = document.getElementById('aiModelSelect')?.value || 'addestra/morse_model.onnx';
        try {
            const modelUrl = new URL(selectedModel, window.location.href).href;
            console.log("Loading ONNX Model from:", modelUrl);
            window.aiTrainingState.ortSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm', 'webgl'] });
            console.log("ONNX Model loaded successfully!");
        } catch (e) {
            console.warn("ONNX Model not loaded yet or ONNX Web not supported, using DSP fallback.", e);
        }
    }

    window.drawAiPlaceholderCanvas();
    window.loadQsoListFromGameSheet();
    window.initMasterTimelineCanvas();
};

window.changeAiModel = async function() {
    const sel = document.getElementById('aiModelSelect');
    if (!sel || !sel.value) return;

    const modelPath = sel.value;
    if (typeof showToast === 'function') showToast(`⏳ Caricamento modello IA (${modelPath})...`);

    try {
        const modelUrl = new URL(modelPath, window.location.href).href;
        console.log("Loading selected ONNX Model from:", modelUrl);
        window.aiTrainingState.ortSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm', 'webgl'] });
        console.log("ONNX Model switched successfully to:", modelPath);
        if (typeof showToast === 'function') showToast(`🧠 Modello IA attivo: ${modelPath}`);
        if (typeof window.runInferenceOnSegment === 'function') {
            window.runInferenceOnSegment();
        }
    } catch (e) {
        console.warn("Selected ONNX Model load warning:", e);
        if (typeof showToast === 'function') showToast(`⚠️ Modello ${modelPath} non presente in 'addestra/', uso DSP.`);
    }
};

window.switchAiTab = function(tabId) {
    const refTab = document.getElementById('aiRefinementTab');
    const realTab = document.getElementById('aiRealtimeTab');
    const btnRef = document.getElementById('btnAiTabRefinement');
    const btnReal = document.getElementById('btnAiTabRealtime');

    if (tabId === 'refinement') {
        if (refTab) refTab.style.display = 'block';
        if (realTab) realTab.style.display = 'none';
        if (btnRef) btnRef.className = 'tab-btn active-tab';
        if (btnReal) btnReal.className = 'tab-btn';
    } else {
        if (refTab) refTab.style.display = 'none';
        if (realTab) realTab.style.display = 'block';
        if (btnRef) btnRef.className = 'tab-btn';
        if (btnReal) btnReal.className = 'tab-btn active-tab';
    }
};

window.fetchAddestraUrlFromFirebase = async function() {
    if (window.aiActiveAddestraUrl && Array.isArray(window.aiAllFirebaseUrls) && window.aiAllFirebaseUrls.length > 0) {
        return window.aiActiveAddestraUrl;
    }

    const localStoredUrl = localStorage.getItem('cwgame_addestra_url') || localStorage.getItem('cwgame_qso_audio_url');
    if (localStoredUrl && localStoredUrl.startsWith('http')) {
        window.aiActiveAddestraUrl = localStoredUrl;
        if (!window.aiAllFirebaseUrls) window.aiAllFirebaseUrls = [localStoredUrl];
    }

    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            const [snap1, snap2, snap3, snap4] = await Promise.all([
                firebase.database().ref('appConfig/qso_audio_server_url').once('value').catch(() => null),
                firebase.database().ref('appConfig/addestra_script_url').once('value').catch(() => null),
                firebase.database().ref('config/qso_audio_server_url').once('value').catch(() => null),
                firebase.database().ref('config/addestra_script_url').once('value').catch(() => null)
            ]);

            const foundUrls = [
                snap1 ? snap1.val() : null,
                snap2 ? snap2.val() : null,
                snap3 ? snap3.val() : null,
                snap4 ? snap4.val() : null
            ].filter(u => u && typeof u === 'string' && u.trim().startsWith('http')).map(u => u.trim());

            if (foundUrls.length > 0) {
                window.aiAllFirebaseUrls = [...new Set(foundUrls)];
                window.aiActiveAddestraUrl = window.aiAllFirebaseUrls[0];
                localStorage.setItem('cwgame_addestra_url', window.aiActiveAddestraUrl);
                console.log("🔒 Loaded fresh Apps Script URLs dynamically from Firebase Config:", window.aiAllFirebaseUrls);
                return window.aiActiveAddestraUrl;
            }
        }
    } catch(e) {
        console.warn("Firebase Config Fetch Warning:", e);
    }

    const fallbackUrl = "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";
    if (!window.aiActiveAddestraUrl) {
        window.aiActiveAddestraUrl = fallbackUrl;
        if (!window.aiAllFirebaseUrls) window.aiAllFirebaseUrls = [fallbackUrl];
    }
    return window.aiActiveAddestraUrl;
};

window.saveFirebaseConfigUrl = function(key, newUrl) {
    if (!key || !newUrl) return;
    if (typeof firebase !== 'undefined' && firebase.database) {
        firebase.database().ref(`config/${key}`).set(newUrl.trim()).then(() => {
            if (key === 'addestra_script_url') window.aiActiveAddestraUrl = newUrl.trim();
            if (typeof showToast === 'function') showToast(`🔒 Config '${key}' salvato su Firebase!`);
            console.log(`✓ Firebase Config '${key}' updated:`, newUrl);
        });
    }
};

const CACHE_QSO_LIST_KEY = "cwgame_cached_qso_list";

window.extractDateFromFilename = function(filename) {
    if (!filename) return "Senza Data";
    const str = String(filename).trim();

    // MATCH RIGIDO 8 CIFRE: YYYYMMDD (4 cifre anno 2010-2030, 2 cifre mese 01-12, 2 cifre giorno 01-31)
    const m1 = str.match(/(?:^|[^0-9])(20[123]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

    // MATCH YYYY-MM-DD o YYYY_MM_DD
    const m2 = str.match(/(?:^|[^0-9])(20[123]\d)[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

    return "Senza Data";
};

window.renderQsoListWithDateFilter = function(qsoList) {
    const qsoSelect = document.getElementById('aiQsoSelect');
    const dateSelect = document.getElementById('aiDateSelect');
    const status = document.getElementById('aiQsoStatusText');

    if (!qsoSelect) return;

    window.aiTrainingState.qsoList = qsoList || [];
    const fullList = window.aiTrainingState.qsoList;

    const dateMap = {};
    const yearMap = {};

    fullList.forEach((item, idx) => {
        const fname = String(item.filename || "");
        const d = window.extractDateFromFilename(fname);
        if (d !== "Senza Data") {
            if (!dateMap[d]) dateMap[d] = 0;
            dateMap[d]++;

            const year = d.split('-')[0];
            if (year && year.length === 4) {
                if (!yearMap[year]) yearMap[year] = 0;
                yearMap[year]++;
            }
        }
    });

    const dates = Object.keys(dateMap).sort().reverse();
    const years = Object.keys(yearMap).sort().reverse();

    if (dateSelect) {
        dateSelect.innerHTML = `<option value="" selected>Tutte le Date (${fullList.length} QSO)</option>`;

        // Sezione Filtro per Anno
        if (years.length > 0) {
            const optGrpYears = document.createElement('optgroup');
            optGrpYears.label = "─── PER ANNO ───";
            years.forEach(yr => {
                const opt = document.createElement('option');
                opt.value = `YEAR:${yr}`;
                opt.textContent = `📅 Anno ${yr} (${yearMap[yr]} QSO)`;
                optGrpYears.appendChild(opt);
            });
            dateSelect.appendChild(optGrpYears);
        }

        // Sezione Filtro per Data Specifica
        if (dates.length > 0) {
            const optGrpDates = document.createElement('optgroup');
            optGrpDates.label = "─── PER DATA SPECIFICA ───";
            dates.forEach(d => {
                if (d !== "Senza Data") {
                    const opt = document.createElement('option');
                    opt.value = d;
                    opt.textContent = `${d} (${dateMap[d]} QSO)`;
                    optGrpDates.appendChild(opt);
                }
            });
            dateSelect.appendChild(optGrpDates);
        }
    }

    // DI DEFAULT MOSTRA L'INTERO ELENCO AL 100%
    qsoSelect.innerHTML = '';
    fullList.forEach((item, originalIdx) => {
        const opt = document.createElement('option');
        opt.value = originalIdx;
        const clean = (item.filename || "QSO").replace(/\.[^/.]+$/, "");
        opt.textContent = `[QSO #${originalIdx + 1}] ${clean}`;
        qsoSelect.appendChild(opt);
    });

    if (qsoSelect.options.length > 0) {
        qsoSelect.selectedIndex = qsoSelect.options.length - 1;
        window.loadSelectedAiQSO();
    }

    if (status) status.textContent = `Caricati ${fullList.length} QSO dal Foglio Google.`;
};

window.filterQsoListByDate = function() {
    const qsoSelect = document.getElementById('aiQsoSelect');
    const dateSelect = document.getElementById('aiDateSelect');
    if (!qsoSelect) return;

    const selectedFilter = dateSelect ? dateSelect.value : "";
    const fullList = window.aiTrainingState.qsoList || [];

    qsoSelect.innerHTML = '';

    fullList.forEach((item, originalIdx) => {
        const fname = String(item.filename || "");
        const itemDate = window.extractDateFromFilename(fname);
        let match = false;

        if (!selectedFilter) {
            match = true;
        } else if (selectedFilter.startsWith("YEAR:")) {
            const yr = selectedFilter.replace("YEAR:", "");
            match = itemDate.startsWith(yr);
        } else {
            match = (itemDate === selectedFilter);
        }

        if (match) {
            const opt = document.createElement('option');
            opt.value = originalIdx;
            const clean = (item.filename || "QSO").replace(/\.[^/.]+$/, "");
            opt.textContent = `[QSO #${originalIdx + 1}] ${clean}`;
            qsoSelect.appendChild(opt);
        }
    });

    if (qsoSelect.options.length > 0) {
        qsoSelect.selectedIndex = 0;
        window.loadSelectedAiQSO();
    } else {
        qsoSelect.innerHTML = '<option value="">Nessun QSO per questa data/anno</option>';
    }
};

window.loadQsoListFromGameSheet = async function() {
    let cachedCount = 0;
    // 1. CARICAMENTO ISTANTANEO DA CACHE LOCALSTORAGE (Se già presente)
    const cached = localStorage.getItem(CACHE_QSO_LIST_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cachedCount = parsed.length;
                console.log("⚡ Instant loaded QSO list from localStorage cache:", cachedCount, "items");
                window.renderQsoListWithDateFilter(parsed);
            }
        } catch(e) {}
    }

    const fbUrl = await window.fetchAddestraUrlFromFirebase();
    const fallbackUrl = "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

    const candidateUrls = [
        ...(window.aiAllFirebaseUrls || []),
        fbUrl,
        window.qsoAudioServerUrl,
        localStorage.getItem('cwgame_addestra_url'),
        localStorage.getItem('cwgame_qso_audio_url'),
        fallbackUrl
    ].filter(u => u && typeof u === 'string' && u.startsWith('http'));

    const serverUrls = [...new Set(candidateUrls)];
    const status = document.getElementById('aiQsoStatusText');

    if (status && cachedCount === 0) status.textContent = "⏳ Scansione elenco QSO dal server Google...";

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.myId || "";

    for (let url of serverUrls) {
        try {
            let fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=search&q=&limit=10000`;
            if (uid) fetchUrl += `&uid=${encodeURIComponent(uid)}`;
            if (token) fetchUrl += `&token=${encodeURIComponent(token)}`;

            console.log("🔍 Background Scanning QSO List from:", fetchUrl);
            const resp = await fetch(fetchUrl);
            if (!resp.ok) continue;

            const data = await resp.json();
            console.log("📡 Scanned QSO Data length:", data?.results?.length);

            if (data && data.status === 'success' && Array.isArray(data.results) && data.results.length > 0) {
                const liveCount = data.results.length;

                // SE TROVA DIFFERENZE (Numero di file cambiato o cache assente): Riscarica e aggiorna!
                if (liveCount !== cachedCount) {
                    console.log(`🔄 Trovate ${liveCount} registrazioni sul server (Cache ne aveva ${cachedCount}). Aggiornamento in corso...`);
                    localStorage.setItem(CACHE_QSO_LIST_KEY, JSON.stringify(data.results));
                    window.renderQsoListWithDateFilter(data.results);
                    if (status) status.textContent = `✓ Elenco aggiornato: ${liveCount} QSO dal Foglio Google.`;
                    showToast(`🔄 Elenco QSO aggiornato! Trovate ${liveCount} registrazioni nel Foglio Google.`);
                } else {
                    console.log(`✓ Elenco QSO allineato (${liveCount} file). Nessuna modifica.`);
                    if (status) status.textContent = `✓ Elenco allineato: ${liveCount} QSO dal Foglio Google.`;
                }
                return;
            }
        } catch(e) {
            console.warn("AI QSO List Background Scan Error for", url, ":", e);
        }
    }

    if (cachedCount === 0 && status) status.textContent = "⚠️ Nessun QSO trovato nel Foglio. Carica file locale col tasto '📁 Carica Audio Locale'.";
};

window.loadSelectedAiQSO = async function() {
    const select = document.getElementById('aiQsoSelect');
    const statusElem = document.getElementById('aiAudioLoadStatus');

    if (!select) return;

    const idx = parseInt(select.value);
    if (isNaN(idx) || !window.aiTrainingState.qsoList[idx]) return;

    const item = window.aiTrainingState.qsoList[idx];
    window.aiTrainingState.currentWindowStart = 0;

    if (statusElem) {
        statusElem.textContent = `⏳ Scaricamento automatico audio QSO #${idx + 1}...`;
        statusElem.style.color = "var(--link-color)";
    }

    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    const driveUrl = fileId ? `https://docs.google.com/uc?export=download&id=${fileId}` : item.streamUrl;

    const userBox = document.getElementById('aiUserCorrectionText');
    const aiBox = document.getElementById('aiPredictionText');
    if (userBox && window.aiTrainingState.editingPairIndex < 0) userBox.value = '';
    if (aiBox && window.aiTrainingState.editingPairIndex < 0) aiBox.value = 'Premi "Esegui Analisi IA" per decodificare...';

    // Preparazione dello streaming HTML5 temporizzato
    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl) {
        audioEl.src = driveUrl;
        audioEl.load();
    }

    // SCARICAMENTO DIRETTO ED ESCLUSIVO VIA PROXY GOOGLE APPS SCRIPT (Senza blocchi CORS / 403)
    const activeUrl = window.aiActiveAddestraUrl || (await window.fetchAddestraUrlFromFirebase());
    const proxyCandidateUrls = [
        ...(window.aiAllFirebaseUrls || []),
        activeUrl,
        window.qsoAudioServerUrl,
        localStorage.getItem('cwgame_qso_audio_url')
    ].filter(u => u && typeof u === 'string' && u.startsWith('http'));
    const uniqueProxyUrls = [...new Set(proxyCandidateUrls)];

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.myId || "";

    for (let cleanUrl of uniqueProxyUrls) {
        if (cleanUrl.includes('/edit')) cleanUrl = cleanUrl.split('/edit')[0] + '/exec';
        if (cleanUrl.endsWith('/dev')) cleanUrl = cleanUrl.slice(0, -4) + '/exec';

        try {
            let proxyUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=proxy_audio&id=${fileId}`;
            if (uid) proxyUrl += `&uid=${encodeURIComponent(uid)}`;
            if (token) proxyUrl += `&token=${encodeURIComponent(token)}`;

            console.log("🚀 Starting AI Audio Download via Proxy:", proxyUrl);

            const resp = await fetch(proxyUrl);
            if (resp.ok) {
                const text = await resp.text();
                let data = null;
                try { data = JSON.parse(text); } catch(e) { console.warn("Proxy JSON error:", e); }

                if (data && data.status === 'success' && data.base64) {
                    console.log("✓ Received Base64 Audio Payload! Length:", data.base64.length, "chars");

                    const binaryStr = atob(data.base64);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }

                    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                    if (audioCtx.state === 'suspended') await audioCtx.resume();

                    window.aiTrainingState.currentAudioBuffer = await audioCtx.decodeAudioData(bytes.buffer);

                    if (statusElem) {
                        statusElem.textContent = `✓ Spezzone Estratto ed Elaborato! (${window.aiTrainingState.currentAudioBuffer.duration.toFixed(1)}s) Premi ▶️ Riproduci per l'ascolto.`;
                        statusElem.style.color = "#4caf50";
                    }

                    window.updateAiSegmentDisplay();
                    showToast("✓ Spezzone pronto! Usa ▶️ Riproduci per ascoltare la parte estratta.");
                    return;
                }
            }
        } catch(e) {
            console.warn("AI Audio Proxy Fetch Warning for", cleanUrl, ":", e);
        }
    }

    // 2. TENTATIVO DI DOWNLOAD DIRETTO PER WEBAUDIO SE IL PROXY NON HA RESTITUITO BASE64
    if (!window.aiTrainingState.currentAudioBuffer && fileId) {
        try {
            const directUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
            console.log("AI Audio Direct Fetching for WebAudio:", directUrl);
            const resp = await fetch(directUrl);
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();

                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                if (audioCtx.state === 'suspended') await audioCtx.resume();

                window.aiTrainingState.currentAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);

                if (statusElem) {
                    statusElem.textContent = `✓ Spezzone Estratto ed Elaborato! (${window.aiTrainingState.currentAudioBuffer.duration.toFixed(1)}s) Premi ▶️ Riproduci per l'ascolto.`;
                    statusElem.style.color = "#4caf50";
                }

                window.updateAiSegmentDisplay();
                showToast("✓ Spezzone pronto! Usa ▶️ Riproduci per ascoltare la parte estratta.");
                return;
            }
        } catch(e) {
            console.warn("Direct fetch for WebAudio warning:", e);
        }
    }

    if (statusElem) {
        statusElem.textContent = `✓ Spezzone Pronto! Premi '▶️ Riproduci (${window.aiTrainingState.currentWindowDuration}s)' per l'ascolto.`;
        statusElem.style.color = "#4caf50";
    }
};

window.handleAiLocalAudioUpload = async function(event) {
    const file = event.target.files ? event.target.files[0] : null;
    const statusElem = document.getElementById('aiAudioLoadStatus');

    if (!file) return;

    if (statusElem) {
        statusElem.textContent = `⏳ Lettura file locale: ${file.name}...`;
        statusElem.style.color = "var(--link-color)";
    }

    try {
        const arrayBuf = await file.arrayBuffer();

        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        window.aiTrainingState.currentAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);
        window.aiTrainingState.currentWindowStart = 0;
        window.aiTrainingState.currentLocalFileName = file.name;

        if (statusElem) {
            statusElem.textContent = `✓ File Audio Locale Caricato: ${file.name} (${window.aiTrainingState.currentAudioBuffer.duration.toFixed(1)}s)`;
            statusElem.style.color = "#4caf50";
        }

        window.updateAiSegmentDisplay();
        showToast("File audio locale pronto per l'analisi e il taglio 10s-60s!");
    } catch(e) {
        console.error("AI Local Audio Upload Error:", e);
        if (statusElem) {
            statusElem.textContent = "⚠️ Errore decodifica file audio locale.";
            statusElem.style.color = "#f44336";
        }
    }
};

window.changeAiWindowDuration = function() {
    const sel = document.getElementById('aiWindowDurationSelect');
    if (sel) {
        window.aiTrainingState.currentWindowDuration = parseInt(sel.value) || 20;
    }

    const dur = window.aiTrainingState.currentWindowDuration;
    const prevBtn = document.getElementById('btnAiPrevSegment');
    const playBtn = document.getElementById('btnAiPlaySegment');
    const nextBtn = document.getElementById('btnAiNextSegment');

    if (prevBtn) prevBtn.textContent = `◄◄ -${dur}s`;
    if (playBtn) playBtn.textContent = `▶️ Riproduci (${dur}s)`;
    if (nextBtn) nextBtn.textContent = `+${dur}s ►►`;

    window.updateAiSegmentDisplay();
};

window.updateAiSegmentDisplay = function() {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) return;

    const dur = buf.duration;
    const winLen = window.aiTrainingState.currentWindowDuration;
    const start = window.aiTrainingState.currentWindowStart;
    const end = Math.min(dur, start + winLen);

    if (window.aiTrainingState.markerA === undefined || window.aiTrainingState.markerA === 0) {
        window.aiTrainingState.markerA = start;
    }
    if (window.aiTrainingState.markerB === undefined || window.aiTrainingState.markerB <= window.aiTrainingState.markerA) {
        window.aiTrainingState.markerB = end;
    }

    const fmt = (sec) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const disp = document.getElementById('aiTimePosDisplay');
    if (disp) disp.textContent = `${fmt(start)} - ${fmt(end)}`;

    window.drawAiSegmentWaveform();
    window.updateMasterTimelineDisplay();

    // ANALISI IA AUTOMATICA AL CAMBIO DI SEGMENTO
    if (window.aiTrainingState.autoInferenceTimeout) clearTimeout(window.aiTrainingState.autoInferenceTimeout);
    window.aiTrainingState.autoInferenceTimeout = setTimeout(() => {
        if (typeof window.runInferenceOnSegment === 'function') {
            window.runInferenceOnSegment();
        }
    }, 250);
};

// MASTER TIMELINE CANVAS INTERACTION & DRAGGING (Handles A, B e Loop Centrale)
window.initMasterTimelineCanvas = function() {
    const canvas = document.getElementById('aiMasterTimelineCanvas');
    if (!canvas || canvas.dataset.timelineBound) return;
    canvas.dataset.timelineBound = "true";

    const getCanvasTimeFromX = (clientX) => {
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!buf) return 0;
        const rect = canvas.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * (canvas.width / rect.width)));
        const clickRatio = clickX / canvas.width;
        const duration = buf.duration;
        const visibleDuration = duration / (window.aiTrainingState.timelineZoomFactor || 1.0);
        return (window.aiTrainingState.timelineScrollOffset || 0.0) + (clickRatio * visibleDuration);
    };

    const handlePointerDown = (clientX) => {
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!buf) return;
        const duration = buf.duration;
        const clickTime = getCanvasTimeFromX(clientX);
        const visibleDuration = duration / (window.aiTrainingState.timelineZoomFactor || 1.0);

        let markerA = window.aiTrainingState.markerA !== undefined ? window.aiTrainingState.markerA : 0;
        let markerB = window.aiTrainingState.markerB !== undefined ? window.aiTrainingState.markerB : Math.min(duration, 10);
        const tol = Math.max(0.3, visibleDuration * 0.04);

        if (Math.abs(clickTime - markerA) <= tol) {
            window.aiTrainingState.activeDraggingMarker = 'A';
        } else if (Math.abs(clickTime - markerB) <= tol) {
            window.aiTrainingState.activeDraggingMarker = 'B';
        } else if (clickTime > markerA && clickTime < markerB) {
            window.aiTrainingState.activeDraggingMarker = 'center';
            window.aiTrainingState.dragStartClickTime = clickTime;
            window.aiTrainingState.dragStartMarkerA = markerA;
            window.aiTrainingState.dragStartMarkerB = markerB;
        } else {
            // Clic all'esterno: centra il loop sulla nuova posizione
            const span = Math.max(0.5, markerB - markerA);
            window.aiTrainingState.markerA = Math.max(0, Math.min(duration - span, clickTime - (span / 2)));
            window.aiTrainingState.markerB = Math.min(duration, window.aiTrainingState.markerA + span);
            window.aiTrainingState.activeDraggingMarker = 'center';
            window.aiTrainingState.dragStartClickTime = clickTime;
            window.aiTrainingState.dragStartMarkerA = window.aiTrainingState.markerA;
            window.aiTrainingState.dragStartMarkerB = window.aiTrainingState.markerB;
        }
        window.updateMasterTimelineDisplay();
    };

    const handlePointerMove = (clientX) => {
        const mode = window.aiTrainingState.activeDraggingMarker;
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!mode || !buf) return;

        const duration = buf.duration;
        const moveTime = getCanvasTimeFromX(clientX);

        if (mode === 'A') {
            window.aiTrainingState.markerA = Math.max(0, Math.min(window.aiTrainingState.markerB - 0.2, moveTime));
        } else if (mode === 'B') {
            window.aiTrainingState.markerB = Math.max(window.aiTrainingState.markerA + 0.2, Math.min(duration, moveTime));
        } else if (mode === 'center') {
            const delta = moveTime - window.aiTrainingState.dragStartClickTime;
            const span = window.aiTrainingState.dragStartMarkerB - window.aiTrainingState.dragStartMarkerA;
            window.aiTrainingState.markerA = Math.max(0, Math.min(duration - span, window.aiTrainingState.dragStartMarkerA + delta));
            window.aiTrainingState.markerB = window.aiTrainingState.markerA + span;
        }

        window.aiTrainingState.currentWindowStart = window.aiTrainingState.markerA;
        window.aiTrainingState.currentWindowDuration = Math.max(0.2, window.aiTrainingState.markerB - window.aiTrainingState.markerA);
        window.updateMasterTimelineDisplay();
    };

    const handlePointerUp = () => {
        if (window.aiTrainingState.activeDraggingMarker) {
            window.aiTrainingState.activeDraggingMarker = null;
            window.updateAiSegmentDisplay();
        }
    };

    canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX));
    canvas.addEventListener('mousemove', (e) => handlePointerMove(e.clientX));
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerUp);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) handlePointerDown(e.touches[0].clientX);
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) handlePointerMove(e.touches[0].clientX);
    }, { passive: true });
    canvas.addEventListener('touchend', handlePointerUp);
};

window.updateMasterTimelineDisplay = function() {
    const canvas = document.getElementById('aiMasterTimelineCanvas');
    if (!canvas) return;
    window.initMasterTimelineCanvas();

    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && canvas.width !== Math.floor(rect.width)) {
        canvas.width = Math.floor(rect.width);
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, width, height);

    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) {
        ctx.fillStyle = '#8e9bb0';
        ctx.font = '12px sans-serif';
        ctx.fillText('Nessuna traccia QSO caricata', width / 2 - 80, height / 2 + 4);
        return;
    }

    const duration = buf.duration;
    const zoom = window.aiTrainingState.timelineZoomFactor || 1.0;
    const scroll = window.aiTrainingState.timelineScrollOffset || 0.0;
    const visibleDuration = duration / zoom;

    const markerA = window.aiTrainingState.markerA !== undefined ? window.aiTrainingState.markerA : 0;
    const markerB = window.aiTrainingState.markerB !== undefined ? window.aiTrainingState.markerB : Math.min(duration, 10);

    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const startIdx = Math.floor(scroll * sr);
    const endIdx = Math.min(data.length, Math.floor((scroll + visibleDuration) * sr));
    const step = Math.max(1, Math.ceil((endIdx - startIdx) / width));

    // Righello Temporale
    ctx.fillStyle = '#8e9bb0';
    ctx.font = '10px Segoe UI, sans-serif';
    const intervalSec = visibleDuration > 30 ? 10 : (visibleDuration > 10 ? 5 : (visibleDuration > 3 ? 1 : 0.5));

    for (let t = Math.floor(scroll / intervalSec) * intervalSec; t <= scroll + visibleDuration; t += intervalSec) {
        if (t < 0 || t > duration) continue;
        const x = ((t - scroll) / visibleDuration) * width;
        ctx.strokeStyle = 'rgba(142, 155, 176, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        const formatRulerTime = (sec) => {
            const m = Math.floor(sec / 60);
            const s = (sec % 60).toFixed(1);
            return `${m}:${s < 10 ? '0' + s : s}`;
        };
        ctx.fillText(formatRulerTime(t), x + 3, 12);
    }

    // Forma d'onda verde
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#00ff66';
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
        const sampleIdx = startIdx + (i * step);
        if (sampleIdx >= endIdx || sampleIdx >= data.length) break;
        const val = data[sampleIdx];
        const y = (1 - val) * (height / 2);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Evidenziazione Tratto A-B
    const timeToX = (t) => ((t - scroll) / visibleDuration) * width;
    const xA = timeToX(markerA);
    const xB = timeToX(markerB);

    ctx.fillStyle = 'rgba(0, 188, 212, 0.3)';
    ctx.fillRect(xA, 0, xB - xA, height);

    // Barra centrale di trascinamento loop
    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.fillRect(xA, 0, xB - xA, 4);

    // Linee Verticali
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xA, 0);
    ctx.lineTo(xA, height);
    ctx.stroke();

    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xB, 0);
    ctx.lineTo(xB, height);
    ctx.stroke();

    // Flag A
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(Math.max(0, xA - 18), 0, 36, 16);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('[A 📍]', Math.max(2, xA - 14), 12);

    // Flag B
    ctx.fillStyle = '#ff9800';
    ctx.fillRect(Math.min(width - 36, xB - 18), 0, 36, 16);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('[B 📍]', Math.min(width - 32, xB - 14), 12);

    // Aggiornamento etichette HTML
    const formatPrecise = (sec) => {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    };

    const dispA = document.getElementById('markerADisplay');
    const dispB = document.getElementById('markerBDisplay');
    const dispDur = document.getElementById('markerDurationDisplay');

    if (dispA) dispA.innerText = formatPrecise(markerA);
    if (dispB) dispB.innerText = formatPrecise(markerB);
    if (dispDur) dispDur.innerText = `${(markerB - markerA).toFixed(1)}s`;
};

window.zoomAiAudioTimeline = function(factor) {
    const state = window.aiTrainingState;
    state.timelineZoomFactor = Math.max(0.5, Math.min(20, (state.timelineZoomFactor || 1.0) * factor));
    window.updateMasterTimelineDisplay();
};

window.zoomToFitLoop = function() {
    const state = window.aiTrainingState;
    const buf = state.currentAudioBuffer;
    if (!buf) return;

    const duration = buf.duration;
    const markerA = state.markerA !== undefined ? state.markerA : 0;
    const markerB = state.markerB !== undefined ? state.markerB : Math.min(duration, 10);
    const loopSpan = Math.max(0.2, markerB - markerA);

    // Imposta lo scroll offset all'inizio del loop (markerA) e la durata visibile pari a loopSpan
    state.timelineScrollOffset = markerA;
    state.timelineZoomFactor = duration / loopSpan;

    window.updateMasterTimelineDisplay();
    if (typeof showToast === 'function') showToast("🔍 Loop A-B ingrandito a tutto lo spettro!");
};

window.resetAiAudioZoom = function() {
    window.aiTrainingState.timelineZoomFactor = 1.0;
    window.aiTrainingState.timelineScrollOffset = 0.0;
    window.updateMasterTimelineDisplay();
    if (typeof showToast === 'function') showToast("🌐 Vista traccia intera ripristinata.");
};

window.setMarkerAFromCurrent = function() {
    const state = window.aiTrainingState;
    if (!state.currentAudioBuffer) return;
    state.markerA = Math.max(0, state.currentWindowStart);
    if (state.markerB <= state.markerA) {
        state.markerB = Math.min(state.currentAudioBuffer.duration, state.markerA + 10);
    }
    window.updateMasterTimelineDisplay();
};

window.setMarkerBFromCurrent = function() {
    const state = window.aiTrainingState;
    if (!state.currentAudioBuffer) return;
    state.markerB = Math.min(state.currentAudioBuffer.duration, state.currentWindowStart + state.currentWindowDuration);
    if (state.markerA >= state.markerB) {
        state.markerA = Math.max(0, state.markerB - 10);
    }
    window.updateMasterTimelineDisplay();
};

window.playRegionAB = function() {
    const state = window.aiTrainingState;
    const buf = state.currentAudioBuffer;
    if (!buf) return;

    const start = state.markerA !== undefined ? state.markerA : 0;
    const end = state.markerB !== undefined ? state.markerB : Math.min(buf.duration, start + 10);
    const duration = Math.max(0.2, end - start);
    const rate = state.playbackRate || 1.0;

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (audioCtx.state === 'suspended') audioCtx.resume();

    window.stopCurrentAiAudio();

    state.currentSourceNode = audioCtx.createBufferSource();
    state.currentSourceNode.buffer = buf;
    state.currentSourceNode.playbackRate.value = rate;
    state.currentSourceNode.connect(audioCtx.destination);
    state.currentSourceNode.start(0, start, duration / rate);
};

window.prevAiSegment = function() {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) return;
    const mA = window.aiTrainingState.markerA || 0;
    const mB = window.aiTrainingState.markerB || 10;
    const span = Math.max(0.5, mB - mA);

    window.aiTrainingState.markerA = Math.max(0, mA - span);
    window.aiTrainingState.markerB = window.aiTrainingState.markerA + span;
    window.aiTrainingState.currentWindowStart = window.aiTrainingState.markerA;

    window.updateMasterTimelineDisplay();
    window.playRegionAB();
};

window.nextAiSegment = function() {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) return;
    const mA = window.aiTrainingState.markerA || 0;
    const mB = window.aiTrainingState.markerB || 10;
    const span = Math.max(0.5, mB - mA);

    if (mA + span < buf.duration) {
        window.aiTrainingState.markerA = Math.min(buf.duration - span, mA + span);
        window.aiTrainingState.markerB = window.aiTrainingState.markerA + span;
        window.aiTrainingState.currentWindowStart = window.aiTrainingState.markerA;
    }

    window.updateMasterTimelineDisplay();
    window.playRegionAB();
};

window.drawAiPlaceholderCanvas = function() {
    window.updateMasterTimelineDisplay();
};

window.drawAiSegmentWaveform = function() {
    window.updateMasterTimelineDisplay();
};

window.stopCurrentAiAudio = function() {
    if (window.aiTrainingState.currentSourceNode) {
        try {
            window.aiTrainingState.currentSourceNode.stop();
            window.aiTrainingState.currentSourceNode.disconnect();
            window.aiTrainingState.currentSourceNode = null;
        } catch(e) {}
    }

    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl) {
        try {
            audioEl.pause();
            audioEl.currentTime = window.aiTrainingState.currentWindowStart || 0;
        } catch(e) {}
    }

    if (window.aiAudioTimer) {
        clearTimeout(window.aiAudioTimer);
        window.aiAudioTimer = null;
    }
};

window.changeAiPlaybackRate = function() {
    const sel = document.getElementById('aiPlaybackRateSelect');
    if (sel) {
        window.aiTrainingState.playbackRate = parseFloat(sel.value) || 1.0;
    }
    const rate = window.aiTrainingState.playbackRate || 1.0;
    if (window.aiTrainingState.currentSourceNode) {
        try {
            window.aiTrainingState.currentSourceNode.playbackRate.value = rate;
        } catch(e) {}
    }
    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl) {
        try { audioEl.playbackRate = rate; } catch(e) {}
    }
};

window.playCurrentAiSegment = function(offsetSec = 0) {
    const winLen = window.aiTrainingState.currentWindowDuration;
    const baseStart = window.aiTrainingState.currentWindowStart;
    const start = baseStart + offsetSec;
    const playDuration = Math.max(0.5, winLen - offsetSec);
    const buf = window.aiTrainingState.currentAudioBuffer;
    const rate = window.aiTrainingState.playbackRate || 1.0;

    window.aiTrainingState.playheadRatio = offsetSec / winLen;

    // 1. RIPRODUZIONE DI PRECISIONE VIA WEBAUDIO BUFFER
    if (buf) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        if (audioCtx.state === 'suspended') audioCtx.resume();

        if (window.aiTrainingState.currentSourceNode) {
            try { window.aiTrainingState.currentSourceNode.stop(); } catch(e){}
        }

        window.aiTrainingState.currentSourceNode = audioCtx.createBufferSource();
        window.aiTrainingState.currentSourceNode.buffer = buf;
        window.aiTrainingState.currentSourceNode.playbackRate.value = rate;
        window.aiTrainingState.currentSourceNode.connect(audioCtx.destination);
        window.aiTrainingState.currentSourceNode.start(0, start, playDuration / rate);
        window.drawAiSegmentWaveform();
        return;
    }

    // 2. FALLBACK STREAMING HTML5 CON TIMER DI PRECISIONE TEMPORIZZATO
    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl && audioEl.src) {
        if (window.aiAudioTimer) clearTimeout(window.aiAudioTimer);

        audioEl.currentTime = start;
        audioEl.playbackRate = rate;
        audioEl.play().then(() => {
            window.aiAudioTimer = setTimeout(() => {
                audioEl.pause();
            }, (playDuration / rate) * 1000);
            window.drawAiSegmentWaveform();
        }).catch(err => {
            console.warn("HTML5 Audio play warning:", err);
        });
    }
};

window.drawAiPlaceholderCanvas = function() {
    window.updateMasterTimelineDisplay();
};

window.drawAiSegmentWaveform = function() {
    window.updateMasterTimelineDisplay();
};

// Resample audio segment to 16kHz with Mono Stereo Mix-Down
function resampleAudioBufferTo16k(audioBuffer, startTime, durationSec) {
    if (!audioBuffer) return new Float32Array(0);

    const srcSr = audioBuffer.sampleRate;
    const targetSr = 16000;

    const numChannels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(startTime * srcSr);
    const endSample = Math.min(audioBuffer.length, Math.floor((startTime + durationSec) * srcSr));
    const srcLength = endSample - startSample;

    if (srcLength <= 0) return new Float32Array(0);

    // Unione di tutti i canali audio (Mono Mix-Down per non perdere i canali L/R)
    const monoSamples = new Float32Array(srcLength);
    for (let c = 0; c < numChannels; c++) {
        const chanData = audioBuffer.getChannelData(c);
        for (let i = 0; i < srcLength; i++) {
            monoSamples[i] += (chanData[startSample + i] || 0) / numChannels;
        }
    }

    // Resampling Lineare Istantaneo a 16000Hz (Zero WebAudio Bugs)
    const targetLength = Math.floor(durationSec * targetSr);
    const resampled = new Float32Array(targetLength);
    const ratio = srcLength / targetLength;

    for (let i = 0; i < targetLength; i++) {
        const srcIdx = i * ratio;
        const index0 = Math.floor(srcIdx);
        const index1 = Math.min(srcLength - 1, index0 + 1);
        const frac = srcIdx - index0;

        const val0 = monoSamples[index0] || 0;
        const val1 = monoSamples[index1] || 0;
        resampled[i] = val0 + frac * (val1 - val0);
    }

    return resampled;
}

// DSP Envelope Decoder
function decodeMorseDSP(samples, sampleRate = 16000) {
    if (!samples || samples.length === 0) return "";

    let maxAbs = 0.0;
    for (let i = 0; i < samples.length; i++) {
        const absVal = Math.abs(samples[i]);
        if (absVal > maxAbs) maxAbs = absVal;
    }
    if (maxAbs < 0.0001) return "";

    const normSamples = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        normSamples[i] = samples[i] / maxAbs;
    }

    const frameSize = Math.floor(sampleRate * 0.01); // 10ms frames
    const numFrames = Math.floor(normSamples.length / frameSize);
    const energies = new Float32Array(numFrames);

    let maxEnergy = 0.0, sumEnergy = 0.0, minEnergy = Infinity;
    for (let f = 0; f < numFrames; f++) {
        let sum = 0.0;
        const start = f * frameSize;
        for (let i = 0; i < frameSize; i++) {
            const s = normSamples[start + i] || 0;
            sum += s * s;
        }
        const rms = Math.sqrt(sum / frameSize);
        energies[f] = rms;
        sumEnergy += rms;
        if (rms > maxEnergy) maxEnergy = rms;
        if (rms < minEnergy) minEnergy = rms;
    }

    const avgEnergy = sumEnergy / Math.max(1, numFrames);
    const threshold = minEnergy + (maxEnergy - minEnergy) * 0.15;

    const pulses = [];
    let isTone = energies[0] > threshold;
    let count = 0;

    for (let f = 0; f < numFrames; f++) {
        const active = energies[f] > threshold;
        if (active === isTone) {
            count++;
        } else {
            if (isTone && (count < 2 || count > 200)) {
                pulses.push({ tone: false, durationFrames: count });
            } else {
                pulses.push({ tone: isTone, durationFrames: count });
            }
            isTone = active;
            count = 1;
        }
    }
    pulses.push({ tone: isTone && count <= 200, durationFrames: count });

    const validTones = pulses.filter(p => p.tone && p.durationFrames >= 2 && p.durationFrames <= 200);
    if (validTones.length === 0) return "";

    const toneDurations = validTones.map(p => p.durationFrames).sort((a, b) => a - b);
    const ditFrames = Math.max(2, toneDurations[Math.floor(toneDurations.length * 0.20)] || 4);

    let morseCode = "", decodedText = "";
    const reverseMap = {
        '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
        '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
        '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
        '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
        '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
        '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3',
        '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8',
        '----.': '9', '.-.-.-': '.', '--..--': ',', '..--..': '?', '-..-.': '/'
    };

    for (let p of pulses) {
        if (p.tone && p.durationFrames >= 2) {
            if (p.durationFrames >= ditFrames * 2.0) morseCode += "-";
            else morseCode += ".";
        } else if (!p.tone) {
            if (p.durationFrames >= ditFrames * 3.5) {
                if (morseCode) {
                    const char = reverseMap[morseCode] || "";
                    if (char) decodedText += char + " ";
                    morseCode = "";
                }
            } else if (p.durationFrames >= ditFrames * 1.2) {
                if (morseCode) {
                    const char = reverseMap[morseCode] || "";
                    if (char) decodedText += char;
                    morseCode = "";
                }
            }
        }
    }
    if (morseCode) {
        const char = reverseMap[morseCode] || "";
        if (char) decodedText += char;
    }

    let cleanRes = decodedText.replace(/^[():;=.,\s]+|[():;=.,\s]+$/g, "").trim();
    cleanRes = cleanRes.replace(/\b\.\b/g, "").replace(/\s+/g, " ").trim();
    if (cleanRes === ":" || cleanRes === "." || cleanRes === "," || cleanRes === "(" || cleanRes === ")") return "";
    return cleanRes;
}

window.runInferenceOnSegment = async function() {
    const aiBox = document.getElementById('aiPredictionText');
    if (aiBox) aiBox.value = "⚡ Analisi IA in corso...";

    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) {
        if (aiBox) aiBox.value = "⚠️ Nessun audio QSO caricato.";
        return;
    }

    try {
        const start = window.aiTrainingState.markerA !== undefined ? window.aiTrainingState.markerA : window.aiTrainingState.currentWindowStart;
        const end = window.aiTrainingState.markerB !== undefined ? window.aiTrainingState.markerB : Math.min(buf.duration, start + (window.aiTrainingState.currentWindowDuration || 20));
        const duration = Math.max(0.2, Math.min(buf.duration - start, end - start));

        if (duration <= 0) {
            if (aiBox) aiBox.value = "⚠️ Posizione audio non valida.";
            return;
        }

        const audio16k = await resampleAudioBufferTo16k(buf, start, duration);

        let aiResult = "";
        if (window.aiTrainingState.ortSession) {
            try {
                // computeMelSpectrogramJS
                const timeSteps = Math.floor(audio16k.length / 160);
                const specData = new Float32Array(64 * timeSteps);
                for (let t = 0; t < timeSteps; t++) {
                    for (let m = 0; m < 64; m++) {
                        const idx = t * 160 + m * 2;
                        specData[m * timeSteps + t] = Math.log(Math.abs(audio16k[idx] || 0) + 1e-5);
                    }
                }
                const inputTensor = new ort.Tensor('float32', specData, [1, 1, 64, timeSteps]);
                const results = await window.aiTrainingState.ortSession.run({ spectrogram: inputTensor });

                // CTC greedy decode
                const probsData = results.log_probs.data;
                const dims = results.log_probs.dims;
                let lastIdx = -1;
                for (let t = 0; t < dims[0]; t++) {
                    let maxVal = -Infinity, maxIdx = 0;
                    for (let c = 0; c < (dims[2] || AI_VOCAB.length); c++) {
                        const val = probsData[t * (dims[2] || AI_VOCAB.length) + c];
                        if (val > maxVal) { maxVal = val; maxIdx = c; }
                    }
                    if (maxIdx !== 0 && maxIdx !== lastIdx) {
                        const char = AI_VOCAB[maxIdx] || '';
                        // Consente unicamente lettere, numeri, prosegni e punteggiatura radio valida (escludendo '*')
                        if (/[A-Z0-9\/\-\.a-z]/.test(char) || char === ' ' || char.startsWith('<')) {
                            aiResult += char;
                        }
                    }
                    lastIdx = maxIdx;
                }
                aiResult = aiResult.trim();
            } catch (err) {
                console.warn("ONNX Inference fallback:", err);
            }
        }

        const dspResult = decodeMorseDSP(audio16k, 16000);
        const rawText = aiResult.trim() || dspResult.trim();
        let cleanText = rawText.replace(/[*():;=.,\s]+$/g, "").replace(/^[*():;=.,\s]+/g, "").trim();
        cleanText = cleanText.replace(/\*/g, "").replace(/\b\.\b/g, "").replace(/\s+/g, " ").trim();

        // Se la stringa è composta unicamente da trattini e punti (es. "--.-..-----"), scarta la portante continua
        if (/^[.\-\s]+$/.test(cleanText)) {
            cleanText = "";
        }

        const finalOutput = (cleanText === ":" || cleanText === "." || cleanText === "," || cleanText === "=" || cleanText === "(" || cleanText === ")" || cleanText === "*") ? "" : cleanText;

        if (aiBox) aiBox.value = finalOutput || "NESSUN SEGNALE DETETTATO";

        // Ricostruzione da dizionario
        const reconstructedText = finalOutput ? window.correctTextWithRadioDictionary(finalOutput) : "";
        const dictBox = document.getElementById('aiDictionaryCorrectedText');
        if (dictBox) dictBox.value = reconstructedText;

    } catch (e) {
        console.error("AI Analysis Error:", e);
        if (aiBox) aiBox.value = "ERRORE ANALISI AUDIO";
    }
};

window.correctTextWithRadioDictionary = function(text) {
    if (!text || text.trim().length === 0) return "";
    const words = text.trim().toUpperCase().split(/\s+/);
    const correctedWords = words.map(word => {
        if (word.length <= 1) return word;
        if (/^[I|W|K|F|G|D|EA|HB|ON|OE|M]\d[A-Z0-9]{2,5}$/.test(word) || /^\d+$/.test(word)) return word;
        if (ITALIAN_RADIO_DICTIONARY.includes(word)) return word;

        let bestMatch = word;
        let minDistance = Infinity;

        for (let dictWord of ITALIAN_RADIO_DICTIONARY) {
            if (Math.abs(dictWord.length - word.length) <= 2) {
                const dist = (typeof window.getLevenshteinDistance === 'function') ? window.getLevenshteinDistance(word, dictWord) : Math.abs(word.length - dictWord.length);
                const maxDistThreshold = word.length <= 4 ? 1 : 2;
                if (dist < minDistance && dist <= maxDistThreshold) {
                    minDistance = dist;
                    bestMatch = dictWord;
                }
            }
        }
        return bestMatch;
    });
    return correctedWords.join(" ");
};

window.applyAiDictionaryCorrection = function() {
    const dictBox = document.getElementById('aiDictionaryCorrectedText');
    const userBox = document.getElementById('aiUserCorrectionText');
    if (dictBox && userBox && dictBox.value) {
        userBox.value = dictBox.value;
        showToast("✨ Applicata correzione da dizionario!");
    }
};

window.saveVerifiedAiPair = function() {
    const select = document.getElementById('aiQsoSelect');
    const idx = parseInt(select.value);
    const qsoItem = (idx >= 0 && window.aiTrainingState.qsoList[idx]) ? window.aiTrainingState.qsoList[idx] : null;
    const fullQsoSource = qsoItem ? qsoItem.filename : (select.options[select.selectedIndex]?.text || "QSO_Clip");

    const aiPred = document.getElementById('aiPredictionText')?.value || "";
    const userCorr = (document.getElementById('aiUserCorrectionText')?.value || "").trim();

    if (!userCorr) {
        showToast("⚠️ Inserisci il testo corretto nella TextBox 2 prima di salvare!");
        return;
    }

    const formatPrecise = (sec) => {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    };

    const startA = window.aiTrainingState.markerA !== undefined ? window.aiTrainingState.markerA : 0;
    const endB = window.aiTrainingState.markerB !== undefined ? window.aiTrainingState.markerB : (startA + 10);
    const timePos = `${formatPrecise(startA)} - ${formatPrecise(endB)}`;

    const pair = {
        id: window.aiTrainingState.savedPairs.length + 1,
        filename: fullQsoSource,
        timePos: timePos,
        aiPrediction: aiPred,
        userCorrection: userCorr
    };

    window.aiTrainingState.savedPairs.push(pair);
    window.persistAiSavedPairs();
    window.updateAiSavedTable();

    // Sincronizza direttamente col Foglio Google nella scheda 'ADDESTRA' (NON salva file audio sul telefono!)
    window.syncPairToGoogleCloudSheet(pair);

    showToast("💾 Segmento salvato e sincronizzato su Foglio ADDESTRA!");
    const userBox = document.getElementById('aiUserCorrectionText');
    if (userBox) userBox.value = '';
};

window.syncPairToGoogleCloudSheet = function(pair) {
    if (!pair || !pair.userCorrection) return;
    const appsScriptUrl = window.aiActiveAddestraUrl || "";

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.myId || "";

    const params = new URLSearchParams({
        action: "save_approved",
        filename: pair.filename || "QSO_Clip",
        time_pos: pair.timePos || "00:00 - 00:10",
        transcript: pair.userCorrection || "",
        ai_prediction: pair.aiPrediction || ""
    });

    if (uid) params.append("uid", uid);
    if (token) params.append("token", token);

    fetch(`${appsScriptUrl}?${params.toString()}`)
        .then(r => r.json())
        .then(res => console.log("✓ Sincronizzato con il Foglio Google ADDESTRA in Cloud:", res))
        .catch(err => console.warn("Google Cloud Sheet sync warning:", err));
};

window.persistAiSavedPairs = function() {
    try {
        localStorage.setItem('cw_verified_pairs', JSON.stringify(window.aiTrainingState.savedPairs));
    } catch(e){}
};

window.loadAiSavedPairsFromStorage = function() {
    try {
        const stored = localStorage.getItem('cw_verified_pairs');
        if (stored) {
            window.aiTrainingState.savedPairs = JSON.parse(stored);
            window.updateAiSavedTable();
        }
    } catch(e){}
};

window.updateAiSavedTable = function() {
    const countEl = document.getElementById('aiSavedCount');
    if (countEl) countEl.textContent = window.aiTrainingState.savedPairs.length;

    const tbody = document.querySelector('#aiVerifiedTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    window.aiTrainingState.savedPairs.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.id}</td>
            <td style="font-size:0.8em; overflow:hidden; text-overflow:ellipsis;">${p.filename}</td>
            <td>${p.timePos}</td>
            <td style="color:#4caf50;">${p.aiPrediction}</td>
            <td style="color:var(--champ-color); font-weight:bold;">${p.userCorrection}</td>
            <td>
                <button class="action-btn-small btn-danger" style="padding:2px 6px; font-size:0.75em;" onclick="window.deleteAiSavedPair(${idx})">❌</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.deleteAiSavedPair = function(idx) {
    if (idx < 0 || idx >= window.aiTrainingState.savedPairs.length) return;
    window.aiTrainingState.savedPairs.splice(idx, 1);
    window.aiTrainingState.savedPairs.forEach((p, i) => p.id = i + 1);
    window.persistAiSavedPairs();
    window.updateAiSavedTable();
    showToast("Segmento rimosso.");
};

// Real-Time Microphone & Waterfall Spectrogram
window.toggleAiMicrophone = async function() {
    const btn = document.getElementById('btnStartAiMic');
    const status = document.getElementById('aiLiveStatus');
    const liveBox = document.getElementById('aiLiveOutputBox');

    if (window.aiTrainingState.isMicActive) {
        if (window.aiTrainingState.micStream) {
            window.aiTrainingState.micStream.getTracks().forEach(track => track.stop());
        }
        cancelAnimationFrame(window.aiTrainingState.liveAnimationFrame);
        if (window.aiTrainingState.liveDecodingInterval) clearInterval(window.aiTrainingState.liveDecodingInterval);
        if (window.aiTrainingState.scriptProcessorNode) window.aiTrainingState.scriptProcessorNode.disconnect();

        window.aiTrainingState.isMicActive = false;
        if (btn) btn.textContent = "🎙️ Avvia Microfono Live";
        if (status) { status.textContent = "Inattivo"; status.style.color = "var(--hint-color)"; }
    } else {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            window.aiTrainingState.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = audioCtx.createMediaStreamSource(window.aiTrainingState.micStream);

            window.aiTrainingState.analyserNode = audioCtx.createAnalyser();
            window.aiTrainingState.analyserNode.fftSize = 512;
            source.connect(window.aiTrainingState.analyserNode);

            window.aiTrainingState.scriptProcessorNode = audioCtx.createScriptProcessor(4096, 1, 1);
            source.connect(window.aiTrainingState.scriptProcessorNode);
            window.aiTrainingState.scriptProcessorNode.connect(audioCtx.destination);

            window.aiTrainingState.liveBufferPos = 0;
            window.aiTrainingState.liveAudioBuffer.fill(0);
            if (liveBox) liveBox.textContent = "";

            window.aiTrainingState.scriptProcessorNode.onaudioprocess = function(e) {
                if (!window.aiTrainingState.isMicActive) return;
                const inputData = e.inputBuffer.getChannelData(0);
                for (let i = 0; i < inputData.length; i += 2) {
                    window.aiTrainingState.liveAudioBuffer[window.aiTrainingState.liveBufferPos] = inputData[i];
                    window.aiTrainingState.liveBufferPos = (window.aiTrainingState.liveBufferPos + 1) % window.aiTrainingState.liveAudioBuffer.length;
                }
            };

            window.aiTrainingState.isMicActive = true;
            if (btn) btn.textContent = "⏹️ Ferma Microfono";
            if (status) { status.textContent = "● LIVE MICROFONO ATTIVO"; status.style.color = "#4caf50"; }

            window.drawAiWaterfallLoop();
            window.startAiLiveDecodingStream();
        } catch(e) {
            alert("Impossibile accedere al microfono: " + e.message);
        }
    }
};

window.drawAiWaterfallLoop = function() {
    if (!window.aiTrainingState.isMicActive) return;

    const canvas = document.getElementById('aiWaterfallCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const freqData = new Uint8Array(window.aiTrainingState.analyserNode.frequencyBinCount);
    window.aiTrainingState.analyserNode.getByteFrequencyData(freqData);

    const imgData = ctx.getImageData(0, 0, width, height - 2);
    ctx.putImageData(imgData, 0, 2);

    const binWidth = width / freqData.length;
    for (let i = 0; i < freqData.length; i++) {
        const val = freqData[i];
        ctx.fillStyle = `rgb(${val}, ${val > 128 ? 255 : val * 2}, ${255 - val})`;
        ctx.fillRect(i * binWidth, 0, binWidth, 2);
    }

    window.aiTrainingState.liveAnimationFrame = requestAnimationFrame(window.drawAiWaterfallLoop);
};

window.startAiLiveDecodingStream = function() {
    const liveBox = document.getElementById('aiLiveOutputBox');

    window.aiTrainingState.liveDecodingInterval = setInterval(() => {
        if (!window.aiTrainingState.isMicActive) {
            clearInterval(window.aiTrainingState.liveDecodingInterval);
            return;
        }

        const alignedBuffer = new Float32Array(window.aiTrainingState.liveAudioBuffer.length);
        for (let i = 0; i < window.aiTrainingState.liveAudioBuffer.length; i++) {
            alignedBuffer[i] = window.aiTrainingState.liveAudioBuffer[(window.aiTrainingState.liveBufferPos + i) % window.aiTrainingState.liveAudioBuffer.length];
        }

        const dspText = decodeMorseDSP(alignedBuffer, 16000);

        if (dspText && dspText.length > 0) {
            window.aiTrainingState.silenceDurationSec = 0;

            if (dspText !== window.aiTrainingState.lastDecodedText) {
                let newPart = dspText;
                if (dspText.startsWith(window.aiTrainingState.lastDecodedText)) {
                    newPart = dspText.substring(window.aiTrainingState.lastDecodedText.length);
                }

                if (newPart.trim()) {
                    const correctedNewPart = window.correctTextWithRadioDictionary(newPart);
                    if (liveBox) {
                        liveBox.textContent += correctedNewPart + " ";
                        liveBox.scrollTop = liveBox.scrollHeight;
                    }
                }
                window.aiTrainingState.lastDecodedText = dspText;
            }
        } else {
            window.aiTrainingState.silenceDurationSec += 1.2;
            if (window.aiTrainingState.silenceDurationSec >= 3.0 && liveBox && !liveBox.textContent.endsWith("\n\n")) {
                liveBox.textContent += "\n\n";
                window.aiTrainingState.lastDecodedText = "";
                liveBox.scrollTop = liveBox.scrollHeight;
            }
        }
    }, 1200);
};

// Auto-launch trigger se aperto via URL ?mode=addestra_ia o in una nuova scheda
(function autoLaunchAiModuleFromUrl() {
    const checkAndLaunch = () => {
        const urlParams = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));
        if (urlParams.get('mode') === 'addestra_ia' || urlParams.get('screen') === 'ai_training') {
            console.log("⚡ Auto-launching AI Training Studio from URL mode=addestra_ia...");
            if (typeof window.initAiTrainingModule === 'function') {
                window.initAiTrainingModule();
            }
        }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(checkAndLaunch, 100);
    } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(checkAndLaunch, 100));
    }
})();
