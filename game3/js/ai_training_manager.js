// js/ai_training_manager.js

window.aiTrainingState = {
    ortSession: null,
    qsoList: [],
    savedPairs: [],
    currentAudioBuffer: null,
    currentSourceNode: null,
    currentWindowStart: 0,
    currentWindowDuration: 20, // Default 20s (variabile 20s - 60s)
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

window.initAiTrainingModule = async function() {
    console.log("AI Training: Initializing ONNX & Audio Studio...");

    // Protezione di Sicurezza: Accessibile solo agli utenti autenticati nel gioco
    const isAuth = !!(window.myId || window.tgUser || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user));
    if (!isAuth) {
        showToast("⚠️ Accesso riservato agli utenti autenticati del gioco.");
        if (typeof window.goBackToMenu === 'function') window.goBackToMenu();
        return;
    }

    window.aiTrainingState.savedPairs = [];
    window.loadAiSavedPairsFromStorage();

    // Inizializza modello ONNX se la libreria ort è presente
    if (typeof ort !== 'undefined' && !window.aiTrainingState.ortSession) {
        try {
            const modelUrl = new URL('addestra/morse_model.onnx', window.location.href).href;
            console.log("Loading ONNX Model from:", modelUrl);
            window.aiTrainingState.ortSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm', 'webgl'] });
            console.log("ONNX Model loaded successfully!");
        } catch (e) {
            console.warn("ONNX Model not loaded yet or ONNX Web not supported, using DSP fallback.", e);
        }
    }

    window.drawAiPlaceholderCanvas();
    window.loadQsoListFromGameSheet();
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
    if (window.aiActiveAddestraUrl) return window.aiActiveAddestraUrl;
    if (window.qsoAudioServerUrl && window.qsoAudioServerUrl.startsWith('http')) {
        window.aiActiveAddestraUrl = window.qsoAudioServerUrl;
        return window.aiActiveAddestraUrl;
    }
    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            let snap = await firebase.database().ref('appConfig/addestra_script_url').once('value');
            if (!snap.exists() || !snap.val()) {
                snap = await firebase.database().ref('appConfig/qso_audio_server_url').once('value');
            }
            if (!snap.exists() || !snap.val()) {
                snap = await firebase.database().ref('config/addestra_script_url').once('value');
            }
            if (!snap.exists() || !snap.val()) {
                snap = await firebase.database().ref('config/qso_audio_server_url').once('value');
            }
            if (snap.exists() && snap.val()) {
                window.aiActiveAddestraUrl = snap.val().trim();
                console.log("🔒 Loaded Apps Script URL dynamically from Firebase Config:", window.aiActiveAddestraUrl);
                return window.aiActiveAddestraUrl;
            }
        }
    } catch(e) {
        console.warn("Firebase Config Fetch Warning:", e);
    }
    return window.aiActiveAddestraUrl || "";
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
    const serverUrls = [fbUrl, window.qsoAudioServerUrl].filter(u => u && u.startsWith('http'));
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
        activeUrl,
        window.qsoAudioServerUrl
    ].filter(u => u && u.startsWith('http'));

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.myId || "";

    for (let cleanUrl of proxyCandidateUrls) {
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

    const fmt = (sec) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const disp = document.getElementById('aiTimePosDisplay');
    if (disp) disp.textContent = `${fmt(start)} - ${fmt(end)}`;

    window.drawAiSegmentWaveform();

    // ANALISI IA AUTOMATICA AL CAMBIO DI SEGMENTO
    if (window.aiTrainingState.autoInferenceTimeout) clearTimeout(window.aiTrainingState.autoInferenceTimeout);
    window.aiTrainingState.autoInferenceTimeout = setTimeout(() => {
        if (typeof window.runInferenceOnSegment === 'function') {
            window.runInferenceOnSegment();
        }
    }, 250);
};

window.prevAiSegment = function() {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) return;
    const winLen = window.aiTrainingState.currentWindowDuration;
    window.aiTrainingState.currentWindowStart = Math.max(0, window.aiTrainingState.currentWindowStart - winLen);
    window.updateAiSegmentDisplay();
};

window.nextAiSegment = function() {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) return;
    const winLen = window.aiTrainingState.currentWindowDuration;
    if (window.aiTrainingState.currentWindowStart + winLen < buf.duration) {
        window.aiTrainingState.currentWindowStart += winLen;
        window.updateAiSegmentDisplay();
    }
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
    const canvas = document.getElementById('aiSegmentCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'var(--hint-color)';
    ctx.font = '13px sans-serif';
    ctx.fillText('Nessun file audio QSO caricato', canvas.width / 2 - 80, canvas.height / 2 + 4);
};

window.drawAiSegmentWaveform = function() {
    const canvas = document.getElementById('aiSegmentCanvas');
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!canvas || !buf) return;

    window.setupAiCanvasInteractiveEvents();

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, width, height);

    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const winLen = window.aiTrainingState.currentWindowDuration;
    const startIdx = Math.floor(window.aiTrainingState.currentWindowStart * sr);
    const endIdx = Math.min(data.length, Math.floor((window.aiTrainingState.currentWindowStart + winLen) * sr));
    const step = Math.ceil((endIdx - startIdx) / width);

    // Forma d'onda Verde
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#00ff66';
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
        const sampleIdx = startIdx + (i * step);
        if (sampleIdx >= endIdx) break;
        const val = data[sampleIdx];
        const y = (1 - val) * (height / 2);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // BARRA MOBILE / CURSORE DI SCORRIMENTO TEMPO
    const ratio = window.aiTrainingState.playheadRatio || 0;
    if (ratio >= 0 && ratio <= 1) {
        const playheadX = ratio * width;

        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();

        const offsetSec = (ratio * winLen).toFixed(1);
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(Math.min(width - 45, Math.max(0, playheadX - 20)), 2, 45, 14);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`+${offsetSec}s`, Math.min(width - 40, Math.max(5, playheadX - 16)), 13);
    }
};

window.setupAiCanvasInteractiveEvents = function() {
    const canvas = document.getElementById('aiSegmentCanvas');
    if (!canvas || canvas.dataset.eventsBound) return;
    canvas.dataset.eventsBound = "true";

    const handleCanvasSeek = (e) => {
        if (e.cancelable) e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clickX = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * (canvas.width / rect.width)));

        const ratio = clickX / canvas.width;
        const winLen = window.aiTrainingState.currentWindowDuration;
        const offsetSec = ratio * winLen;

        window.aiTrainingState.playheadRatio = ratio;
        window.drawAiSegmentWaveform();
        window.playCurrentAiSegment(offsetSec);
    };

    canvas.addEventListener('click', handleCanvasSeek, { passive: false });
    let isDragging = false;
    canvas.addEventListener('mousedown', (e) => { isDragging = true; handleCanvasSeek(e); }, { passive: false });
    canvas.addEventListener('mousemove', (e) => { if (isDragging) handleCanvasSeek(e); }, { passive: false });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('touchstart', (e) => { isDragging = true; handleCanvasSeek(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { if (isDragging) handleCanvasSeek(e); }, { passive: false });
    canvas.addEventListener('touchend', () => { isDragging = false; });
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
        const winLen = window.aiTrainingState.currentWindowDuration;
        const start = window.aiTrainingState.currentWindowStart;
        const duration = Math.min(winLen, buf.duration - start);

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

    const timePos = document.getElementById('aiTimePosDisplay')?.textContent || "00:00 - 00:10";

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
