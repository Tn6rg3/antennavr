// addestra/appIACW.js - Standalone CW AI Studio powered by ai_training_manager.js engine
const APP_IACW_VERSION = "2026.09.07 - V4.0 (Direct AI Engine)";
console.log(`🚀 CW AI Studio (IACW) Version: ${APP_IACW_VERSION}`);

// Global State (Direct Mirror of ai_training_manager.js)
window.aiTrainingState = {
    ortSession: null,
    qsoList: [],
    savedPairs: [],
    currentAudioBuffer: null,
    currentSourceNode: null,
    currentWindowStart: 0,
    currentWindowDuration: 10,
    editingPairIndex: -1,
    isMicActive: false,
    micStream: null,
    analyserNode: null,
    isAutoLearningEnabled: false,
    isRawOnlyMode: false
};

// Aliases for standalone compatibility
let audioCtx = null;
let currentAudioBuffer = null;
let currentSourceNode = null;
let current10sStart = 0;
let currentWindowDuration = 10;
let qsoList = [];
let savedPairs = [];
let ortSession = null;
let editingPairIndex = -1;
let isAutoLearningEnabled = false;
let isRawOnlyMode = false;
let activeAppsScriptUrl = "";

const VOCAB = [
    '<BLANK>', ' ',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@',
    '_', '^', '~', '<AR>', '<BT>', '<KN>', '<SK>', '<KA>'
];

let ITALIAN_RADIO_DICTIONARY = [
    "CQ", "DE", "QSO", "QTH", "QSL", "QRM", "QRN", "QSB", "QRT", "QRZ", "QSY", "RST", "WATTS",
    "ANTENNA", "DIPOLE", "VERTICAL", "YAGI", "BEAM", "RIG", "TRANSCEIVER", "NAME", "OPERATOR",
    "TEMP", "WEATHER", "BUREAU", "LOTW", "CONTEST", "BEST", "DX", "73", "88", "BK", "SK", "AR",
    "BT", "KN", "PSE", "HW", "CPI", "FB", "VY", "TNX", "TU", "GM", "GA", "GE", "GN", "OM", "YL",
    "XYL", "DIPOLE", "AMPLIFIER", "BAND", "MEGAHERTZ", "KILOHERTZ", "CALLSIGN", "CIAO", "BUONGIORNO",
    "BUONASERA", "GRAZIE", "MOLTO", "BENE", "ROMA", "MILANO", "TORINO", "NAPOLI", "FIRENZE", "GENOVA"
];

function logDebug(msg) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${msg}`);
}

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// 1. TELEGRAM AUTHENTICATION & FIREBASE INITIALIZATION
function checkTelegramAuthAndLock() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
    }
    const urlParams = new URLSearchParams(window.location.search);
    const rawInitData = tg?.initData || urlParams.get('initData') || urlParams.get('tgWebAppData') || "";
    let tgUser = tg?.initDataUnsafe?.user;

    if (!tgUser && rawInitData) {
        try {
            const decoded = decodeURIComponent(rawInitData);
            const userMatch = decoded.match(/user=([^&]+)/);
            if (userMatch) tgUser = JSON.parse(decodeURIComponent(userMatch[1]));
        } catch(e) {}
    }

    window.tgUser = tgUser;
    window.tgInitData = rawInitData;
    window.myId = tgUser?.id || "";

    if (!tgUser || !tgUser.id || !rawInitData) {
        const overlay = document.getElementById('telegramAccessOverlay');
        if (overlay) overlay.style.display = 'flex';
        return false;
    }

    console.log("✓ Telegram User Authenticated:", tgUser.first_name, "(ID:", tgUser.id, ")");
    return true;
}

function initFirebaseInStudio() {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp({
                apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
                authDomain: "telegrafiabot.firebaseapp.com",
                databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
                projectId: "telegrafiabot",
                storageBucket: "telegrafiabot.firebasestorage.app",
                messagingSenderId: "575790683327",
                appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
            });
        }
        if (firebase.auth && !firebase.auth().currentUser) {
            try { firebase.auth().signInAnonymously(); } catch(e) {}
        }
    }
}

// Exact mirror of window.fetchAddestraUrlFromFirebase in ai_training_manager.js
window.fetchAddestraUrlFromFirebase = async function() {
    if (window.aiActiveAddestraUrl) return window.aiActiveAddestraUrl;
    if (activeAppsScriptUrl) return activeAppsScriptUrl;
    if (window.qsoAudioServerUrl && window.qsoAudioServerUrl.startsWith('http')) {
        window.aiActiveAddestraUrl = window.qsoAudioServerUrl;
        return window.aiActiveAddestraUrl;
    }
    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            let snap = await firebase.database().ref('appConfig/addestra_script_url').once('value').catch(() => null);
            if (!snap || !snap.exists() || !snap.val()) {
                snap = await firebase.database().ref('appConfig/qso_audio_server_url').once('value').catch(() => null);
            }
            if (!snap || !snap.exists() || !snap.val()) {
                snap = await firebase.database().ref('config/addestra_script_url').once('value').catch(() => null);
            }
            if (!snap || !snap.exists() || !snap.val()) {
                snap = await firebase.database().ref('config/qso_audio_server_url').once('value').catch(() => null);
            }
            if (snap && snap.exists() && snap.val()) {
                window.aiActiveAddestraUrl = snap.val().trim();
                activeAppsScriptUrl = window.aiActiveAddestraUrl;
                console.log("🔒 Loaded Apps Script URL dynamically from Firebase Config:", window.aiActiveAddestraUrl);
                return window.aiActiveAddestraUrl;
            }
        }
    } catch(e) {}
    return window.aiActiveAddestraUrl || "";
};

async function fetchAppsScriptUrlFromFirebase() {
    return window.fetchAddestraUrlFromFirebase();
}

// 2. DICTIONARY & ONNX MODEL INITIALIZATION
async function initONNXModel() {
    try {
        console.log("Loading ONNX Model (morse_model.onnx)...");
        ortSession = await ort.InferenceSession.create('./morse_model.onnx', { executionProviders: ['wasm', 'webgl'] });
        window.aiTrainingState.ortSession = ortSession;
        console.log("ONNX Model loaded successfully!");
    } catch (e) {
        console.warn("ONNX model fallback to DSP.", e);
    }
    loadFullProjectDictionary();
}

async function loadFullProjectDictionary() {
    try {
        const resp1 = await fetch('../parole.txt');
        if (resp1.ok) {
            const text1 = await resp1.text();
            const words1 = text1.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
            ITALIAN_RADIO_DICTIONARY = [...new Set([...ITALIAN_RADIO_DICTIONARY, ...words1])];
            logDebug(`💡 Caricato dizionario parole.txt (${words1.length} parole)!`);
        }
        const resp2 = await fetch('../words.txt');
        if (resp2.ok) {
            const text2 = await resp2.text();
            const words2 = text2.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
            ITALIAN_RADIO_DICTIONARY = [...new Set([...ITALIAN_RADIO_DICTIONARY, ...words2])];
            logDebug(`💡 Caricato dizionario words.txt (${words2.length} parole)!`);
        }
    } catch(e) {
        console.warn("Could not load dictionary files:", e);
    }
}

// 3. QSO LIST LOADING (Exact mirror of ai_training_manager.js)
const CACHE_QSO_LIST_KEY = "cwgame_cached_qso_list";

window.extractDateFromFilename = function(filename) {
    if (!filename) return "Senza Data";
    const str = String(filename).trim();

    const m1 = str.match(/(?:^|[^0-9])(20[123]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

    const m2 = str.match(/(?:^|[^0-9])(20[123]\d)[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

    return "Senza Data";
};

function extractDateFromFilename(f) { return window.extractDateFromFilename(f); }

window.renderQsoListWithDateFilter = function(list) {
    const qsoSelect = document.getElementById('qsoSelect') || document.getElementById('aiQsoSelect');
    const dateSelect = document.getElementById('aiDateSelect');
    const status = document.getElementById('sheetStatus') || document.getElementById('aiQsoStatusText');

    if (!qsoSelect) return;

    qsoList = list || [];
    window.aiTrainingState.qsoList = qsoList;

    const dateMap = {};
    const yearMap = {};

    qsoList.forEach((item, idx) => {
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
        dateSelect.innerHTML = `<option value="" selected>Tutte le Date (${qsoList.length} QSO)</option>`;

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

    qsoSelect.innerHTML = '';
    qsoList.forEach((item, originalIdx) => {
        const opt = document.createElement('option');
        opt.value = originalIdx;
        const clean = (item.filename || "QSO").replace(/\.[^/.]+$/, "");
        opt.innerText = `[QSO #${originalIdx + 1}] ${clean}`;
        qsoSelect.appendChild(opt);
    });

    if (status) {
        status.innerText = `✓ Caricati ${qsoList.length} QSO dal Foglio Google!`;
        status.style.backgroundColor = "#1b5e20";
    }

    if (qsoSelect.options.length > 0) {
        qsoSelect.selectedIndex = qsoSelect.options.length - 1;
        loadSelectedQSO();
    }
};

function filterQsoListByDate() {
    const qsoSelect = document.getElementById('qsoSelect') || document.getElementById('aiQsoSelect');
    const dateSelect = document.getElementById('aiDateSelect');
    if (!qsoSelect) return;

    const selectedFilter = dateSelect ? dateSelect.value : "";
    qsoSelect.innerHTML = '';

    qsoList.forEach((item, originalIdx) => {
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
            opt.innerText = `[QSO #${originalIdx + 1}] ${clean}`;
            qsoSelect.appendChild(opt);
        }
    });

    if (qsoSelect.options.length > 0) {
        qsoSelect.selectedIndex = 0;
        loadSelectedQSO();
    } else {
        qsoSelect.innerHTML = '<option value="">Nessun QSO per questa data/anno</option>';
    }
}

async function autoFetchQsoListFromAppsScript() {
    let cachedCount = 0;
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
    const serverUrls = [fbUrl, window.qsoAudioServerUrl].filter(u => u && typeof u === 'string' && u.startsWith('http'));
    const status = document.getElementById('sheetStatus') || document.getElementById('aiQsoStatusText');

    if (status && cachedCount === 0) {
        status.innerText = "⏳ Scansione elenco QSO dal server Google...";
        status.style.backgroundColor = "#00bcd4";
    }

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.tgUser?.id || window.myId || "";

    for (let url of serverUrls) {
        try {
            let fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=search&q=&limit=10000`;
            if (uid) fetchUrl += `&uid=${encodeURIComponent(uid)}`;
            if (token) fetchUrl += `&token=${encodeURIComponent(token)}`;

            console.log("🔍 Background Scanning QSO List from:", fetchUrl);
            const resp = await fetch(fetchUrl);
            if (!resp.ok) continue;

            const data = await resp.json();
            if (data && data.status === 'success' && Array.isArray(data.results) && data.results.length > 0) {
                const liveCount = data.results.length;

                if (liveCount !== cachedCount) {
                    console.log(`🔄 Trovati ${liveCount} QSO sul server (Cache ne aveva ${cachedCount}). Aggiornamento in corso...`);
                    localStorage.setItem(CACHE_QSO_LIST_KEY, JSON.stringify(data.results));
                    window.renderQsoListWithDateFilter(data.results);
                } else {
                    console.log(`✓ Elenco QSO allineato (${liveCount} file).`);
                }
                return;
            }
        } catch(e) {
            console.warn("AI QSO List Scan Error:", e);
        }
    }
}

// 4. AUDIO DOWNLOADING & PROXY (Exact mirror of loadSelectedAiQSO in ai_training_manager.js)
async function loadSelectedQSO() {
    const select = document.getElementById('qsoSelect') || document.getElementById('aiQsoSelect');
    const statusElem = document.getElementById('audioLoadStatus') || document.getElementById('aiAudioLoadStatus');

    if (!select) return;

    const idx = parseInt(select.value);
    if (isNaN(idx) || !qsoList[idx]) return;

    const item = qsoList[idx];
    current10sStart = 0;

    logDebug(`▶️ Selezionato QSO #${idx + 1}: Sorgente = "${item.filename}"`);

    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || item.filename || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    const driveUrl = fileId ? `https://docs.google.com/uc?export=download&id=${fileId}` : item.streamUrl;

    const userBox = document.getElementById('userCorrectionText');
    const aiBox = document.getElementById('aiPredictionText');
    if (userBox && editingPairIndex < 0) userBox.value = '';
    if (aiBox && editingPairIndex < 0) aiBox.value = 'In attesa dell\'analisi automatica...';

    // Preparazione dello streaming HTML5 temporizzato (Identico al gioco)
    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl) {
        audioEl.src = driveUrl;
        audioEl.load();
    }

    // SCARICAMENTO DIRETTO ED ESCLUSIVO VIA PROXY GOOGLE APPS SCRIPT
    const activeUrl = window.aiActiveAddestraUrl || (await window.fetchAddestraUrlFromFirebase());
    const proxyCandidateUrls = [
        activeUrl,
        window.qsoAudioServerUrl
    ].filter(u => u && typeof u === 'string' && u.startsWith('http'));

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.tgUser?.id || window.myId || "";

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

                    const ctx = getAudioContext();
                    currentAudioBuffer = await ctx.decodeAudioData(bytes.buffer);
                    window.aiTrainingState.currentAudioBuffer = currentAudioBuffer;

                    if (statusElem) {
                        statusElem.innerText = `✓ Spezzone Estratto ed Elaborato! (${currentAudioBuffer.duration.toFixed(1)}s) Premi ▶️ Riproduci per l'ascolto.`;
                        statusElem.style.color = "#4caf50";
                    }

                    updateSegmentDisplay();
                    logDebug(`✓ Spezzone pronto! Usa ▶️ Riproduci per ascoltare la parte estratta.`);
                    return;
                }
            }
        } catch(e) {
            console.warn("AI Audio Proxy Fetch Warning for", cleanUrl, ":", e);
        }
    }

    if (statusElem) {
        statusElem.innerText = "🎧 Player Streaming Pronto (Usa ▶️ Riproduci per l'ascolto)";
        statusElem.style.color = "#00bcd4";
    }
}

// 5. MASTER TIMELINE & DAW A-B HANDLE INTERACTION
let markerA = 0.0;
let markerB = 10.0;
let timelineZoomFactor = 1.0;
let timelineScrollOffset = 0.0;
let activeDraggingMarker = null;

function initMasterTimeline() {
    const canvas = document.getElementById('masterTimelineCanvas');
    if (!canvas || canvas.dataset.timelineBound) return;
    canvas.dataset.timelineBound = "true";

    if (currentAudioBuffer) {
        markerB = Math.min(currentAudioBuffer.duration, markerA + currentWindowDuration);
    }

    const handlePointerDown = (clientX) => {
        if (!currentAudioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * (canvas.width / rect.width)));
        const clickRatio = clickX / canvas.width;
        const duration = currentAudioBuffer.duration;
        const visibleDuration = duration / timelineZoomFactor;
        const clickTime = timelineScrollOffset + (clickRatio * visibleDuration);

        const tol = visibleDuration * 0.05;
        if (Math.abs(clickTime - markerA) <= tol) {
            activeDraggingMarker = 'A';
        } else if (Math.abs(clickTime - markerB) <= tol) {
            activeDraggingMarker = 'B';
        } else {
            activeDraggingMarker = 'regionStart';
            markerA = Math.max(0, clickTime);
            markerB = Math.min(duration, markerA + currentWindowDuration);
        }
        updateMasterTimelineDisplay();
    };

    const handlePointerMove = (clientX) => {
        if (!activeDraggingMarker || !currentAudioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const moveX = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * (canvas.width / rect.width)));
        const moveRatio = moveX / canvas.width;
        const duration = currentAudioBuffer.duration;
        const visibleDuration = duration / timelineZoomFactor;
        const moveTime = timelineScrollOffset + (moveRatio * visibleDuration);

        if (activeDraggingMarker === 'A') {
            markerA = Math.max(0, Math.min(markerB - 0.2, moveTime));
        } else if (activeDraggingMarker === 'B') {
            markerB = Math.max(markerA + 0.2, Math.min(duration, moveTime));
        } else if (activeDraggingMarker === 'regionStart') {
            const span = markerB - markerA;
            markerA = Math.max(0, Math.min(duration - span, moveTime));
            markerB = markerA + span;
        }

        current10sStart = markerA;
        currentWindowDuration = Math.max(0.2, markerB - markerA);
        updateMasterTimelineDisplay();
    };

    const handlePointerUp = () => {
        activeDraggingMarker = null;
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
}

function updateMasterTimelineDisplay() {
    const canvas = document.getElementById('masterTimelineCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, width, height);

    if (!currentAudioBuffer) return;

    const data = currentAudioBuffer.getChannelData(0);
    const duration = currentAudioBuffer.duration;
    const visibleDuration = duration / timelineZoomFactor;
    const startSampleTime = timelineScrollOffset;
    const endSampleTime = timelineScrollOffset + visibleDuration;

    const startIdx = Math.floor(startSampleTime * currentAudioBuffer.sampleRate);
    const endIdx = Math.min(data.length, Math.floor(endSampleTime * currentAudioBuffer.sampleRate));
    const step = Math.max(1, Math.ceil((endIdx - startIdx) / width));

    ctx.fillStyle = '#8e9bb0';
    ctx.font = '10px Segoe UI';
    const intervalSec = visibleDuration > 30 ? 10 : (visibleDuration > 10 ? 5 : (visibleDuration > 3 ? 1 : 0.5));

    for (let t = Math.floor(startSampleTime / intervalSec) * intervalSec; t <= endSampleTime; t += intervalSec) {
        if (t < 0 || t > duration) continue;
        const x = ((t - timelineScrollOffset) / visibleDuration) * width;
        ctx.strokeStyle = 'rgba(142, 155, 176, 0.25)';
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

    const timeToX = (t) => ((t - timelineScrollOffset) / visibleDuration) * width;
    const xA = timeToX(markerA);
    const xB = timeToX(markerB);

    ctx.fillStyle = 'rgba(0, 188, 212, 0.3)';
    ctx.fillRect(xA, 0, xB - xA, height);

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

    ctx.fillStyle = '#00ff66';
    ctx.fillRect(Math.max(0, xA - 18), 0, 36, 18);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('[A 📍]', Math.max(2, xA - 14), 13);

    ctx.fillStyle = '#ff9800';
    ctx.fillRect(Math.min(width - 36, xB - 18), 0, 36, 18);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('[B 📍]', Math.min(width - 32, xB - 14), 13);

    const formatPrecise = (sec) => {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m.toString().padStart(2, '0')}:${s < 10 ? '0' + s : s}`;
    };

    const dispA = document.getElementById('markerADisplay');
    const dispB = document.getElementById('markerBDisplay');
    const dispDur = document.getElementById('markerDurationDisplay');
    if (dispA) dispA.innerText = formatPrecise(markerA);
    if (dispB) dispB.innerText = formatPrecise(markerB);
    if (dispDur) dispDur.innerText = `${(markerB - markerA).toFixed(1)}s`;

    current10sStart = markerA;
    currentWindowDuration = Math.max(0.2, markerB - markerA);
}

function zoomAudioTimeline(factor) {
    const duration = currentAudioBuffer ? currentAudioBuffer.duration : 10.0;
    const midTime = (markerA + markerB) / 2;

    timelineZoomFactor = Math.max(1.0, Math.min(200.0, timelineZoomFactor * factor));
    const newVisibleDuration = duration / timelineZoomFactor;

    timelineScrollOffset = Math.max(0, Math.min(duration - newVisibleDuration, midTime - (newVisibleDuration / 2)));
    updateMasterTimelineDisplay();
}

function resetAudioZoom() {
    timelineZoomFactor = 1.0;
    timelineScrollOffset = 0.0;
    if (currentAudioBuffer) {
        markerA = 0.0;
        markerB = Math.min(currentAudioBuffer.duration, 10.0);
    }
    updateMasterTimelineDisplay();
}

function setMarkerAFromCurrent() {
    const duration = currentAudioBuffer ? currentAudioBuffer.duration : 10.0;
    const visibleDuration = duration / timelineZoomFactor;
    markerA = Math.max(0, Math.min(markerB - 0.2, timelineScrollOffset + (visibleDuration / 2)));
    updateMasterTimelineDisplay();
}

function setMarkerBFromCurrent() {
    const duration = currentAudioBuffer ? currentAudioBuffer.duration : 10.0;
    const visibleDuration = duration / timelineZoomFactor;
    markerB = Math.max(markerA + 0.2, Math.min(duration, timelineScrollOffset + (visibleDuration / 2)));
    updateMasterTimelineDisplay();
}

let currentPlaybackSpeed = 1.0;

function changePlaybackSpeed(event) {
    const sel = document.getElementById('playbackSpeedSelect');
    if (sel) {
        currentPlaybackSpeed = parseFloat(sel.value) || 1.0;
        if (currentSourceNode) {
            try { currentSourceNode.playbackRate.value = currentPlaybackSpeed; } catch(e){}
        }
    }
}

function playRegionAB() {
    if (!currentAudioBuffer) return;
    const ctx = getAudioContext();
    if (currentSourceNode) {
        try { currentSourceNode.stop(); } catch(e){}
    }
    currentSourceNode = ctx.createBufferSource();
    currentSourceNode.buffer = currentAudioBuffer;
    currentSourceNode.playbackRate.value = currentPlaybackSpeed;
    currentSourceNode.connect(ctx.destination);
    currentSourceNode.start(0, markerA, markerB - markerA);
    logDebug(`▶️ Riproduzione tratto A-B (${currentPlaybackSpeed}x): ${markerA.toFixed(2)}s -> ${markerB.toFixed(2)}s`);

    if (typeof runInferenceOnSegment === 'function') {
        runInferenceOnSegment();
    }
}

function updateSegmentDisplay() {
    if (!currentAudioBuffer) return;
    updateMasterTimelineDisplay();
}

function playCurrentSegment() {
    playRegionAB();
}

function drawPlaceholderCanvas() {
    const canvas = document.getElementById('masterTimelineCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8e9bb0';
    ctx.font = '14px Segoe UI';
    ctx.fillText('Nessun file audio selezionato', canvas.width / 2 - 80, canvas.height / 2 + 4);
}

// 6. ML & DSP INFERENCE ON A-B REGION
async function resampleAudioBufferTo16k(audioBuffer, startTime, durationSec) {
    const targetSr = 16000;
    const numSamples = Math.floor(targetSr * durationSec);
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, numSamples, targetSr);

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0, startTime, durationSec);

    const resampledBuffer = await offlineCtx.startRendering();
    return resampledBuffer.getChannelData(0);
}

function applyCwBandpassFilter(samples, sampleRate = 16000, centerFreq = 650.0, bandWidth = 250.0) {
    const f0 = centerFreq / sampleRate;
    const bw = bandWidth / sampleRate;
    const R = 1.0 - 3.0 * bw;
    const K = (1.0 - 2.0 * R * Math.cos(2.0 * Math.PI * f0) + R * R) / (2.0 - 2.0 * Math.cos(2.0 * Math.PI * f0));

    const a0 = 1.0 - K;
    const a1 = 2.0 * (K - R) * Math.cos(2.0 * Math.PI * f0);
    const a2 = R * R - K;
    const b1 = 2.0 * R * Math.cos(2.0 * Math.PI * f0);
    const b2 = -R * R;

    const output = new Float32Array(samples.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < samples.length; i++) {
        const x0 = samples[i];
        const y0 = a0 * x0 + a1 * x1 + a2 * x2 + b1 * y1 + b2 * y2;
        output[i] = y0;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
    }
    return output;
}

function decodeMorseDSP(samples, sampleRate = 16000) {
    if (!samples || samples.length === 0) return "";
    const filteredSamples = applyCwBandpassFilter(samples, sampleRate, 650.0, 250.0);

    let maxAbs = 0.0;
    for (let i = 0; i < filteredSamples.length; i++) {
        if (Math.abs(filteredSamples[i]) > maxAbs) maxAbs = Math.abs(filteredSamples[i]);
    }
    if (maxAbs < 0.003) return "";

    const normSamples = new Float32Array(filteredSamples.length);
    for (let i = 0; i < filteredSamples.length; i++) {
        normSamples[i] = filteredSamples[i] / maxAbs;
    }

    const frameSize = Math.floor(sampleRate * 0.01);
    const numFrames = Math.floor(normSamples.length / frameSize);
    const energies = new Float32Array(numFrames);

    let maxEnergy = 0.0;
    let totalEnergySum = 0.0;

    for (let f = 0; f < numFrames; f++) {
        let sum = 0.0;
        const start = f * frameSize;
        for (let i = 0; i < frameSize; i++) {
            const s = normSamples[start + i] || 0;
            sum += s * s;
        }
        const rms = Math.sqrt(sum / frameSize);
        energies[f] = rms;
        totalEnergySum += rms;
        if (rms > maxEnergy) maxEnergy = rms;
    }

    const avgEnergy = totalEnergySum / Math.max(1, numFrames);
    const threshold = avgEnergy + (maxEnergy - avgEnergy) * 0.35;

    const pulses = [];
    let isTone = energies[0] > threshold;
    let count = 0;

    for (let f = 0; f < numFrames; f++) {
        const active = energies[f] > threshold;
        if (active === isTone) {
            count++;
        } else {
            if (isTone && (count < 3 || count > 180)) {
                pulses.push({ tone: false, durationFrames: count });
            } else {
                pulses.push({ tone: isTone, durationFrames: count });
            }
            isTone = active;
            count = 1;
        }
    }
    pulses.push({ tone: isTone && count <= 180, durationFrames: count });

    let validTones = pulses.filter(p => p.tone && p.durationFrames >= 2 && p.durationFrames <= 250);
    if (validTones.length === 0) return "";

    const toneDurations = validTones.map(p => p.durationFrames).sort((a, b) => a - b);
    const ditFrames = Math.max(3, toneDurations[Math.floor(toneDurations.length * 0.25)] || 5);

    let morseCode = "";
    let decodedText = "";

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
        if (p.tone && p.durationFrames >= 3) {
            if (p.durationFrames >= ditFrames * 2.2) {
                morseCode += "-";
            } else {
                morseCode += ".";
            }
        } else if (!p.tone) {
            if (p.durationFrames >= ditFrames * 5.0) {
                if (morseCode) {
                    const char = reverseMap[morseCode] || "";
                    if (char) decodedText += char + " ";
                    morseCode = "";
                }
            } else if (p.durationFrames >= ditFrames * 1.8) {
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

    return decodedText.trim();
}

function computeMelSpectrogramJS(samples, sampleRate, nMels) {
    const timeSteps = Math.floor(samples.length / 160);
    const specData = new Float32Array(nMels * timeSteps);

    for (let t = 0; t < timeSteps; t++) {
        for (let m = 0; m < nMels; m++) {
            const idx = t * 160 + m * 2;
            const val = samples[idx] || 0;
            specData[m * timeSteps + t] = Math.log(Math.abs(val) + 1e-5);
        }
    }
    return { data: specData, timeSteps: timeSteps };
}

function ctcGreedyDecodeJS(probsData, dims) {
    const timeSteps = dims[0];
    const numClasses = dims[2] || VOCAB.length;

    let result = '';
    let lastIdx = -1;

    for (let t = 0; t < timeSteps; t++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        for (let c = 0; c < numClasses; c++) {
            const val = probsData[t * numClasses + c];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = c;
            }
        }

        if (maxIdx !== 0 && maxIdx !== lastIdx) {
            const char = VOCAB[maxIdx] || '';
            if (/[A-Z0-9\/\-\.a-z]/.test(char) || char === ' ' || char.startsWith('<')) {
                result += char;
            }
        }
        lastIdx = maxIdx;
    }
    return result.trim();
}

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function correctTextWithItalianDictionary(text) {
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
                const dist = levenshteinDistance(word, dictWord);
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
}

function applyDictionaryCorrection() {
    const dictBox = document.getElementById('dictionaryCorrectedText');
    const userBox = document.getElementById('userCorrectionText');
    if (dictBox && userBox && dictBox.value) {
        userBox.value = dictBox.value;
        logDebug(`✨ Applicata correzione da Dizionario: "${dictBox.value}"`);
    }
}

async function runInferenceOnSegment() {
    const aiBox = document.getElementById('aiPredictionText');
    if (aiBox) aiBox.value = "⚡ Analisi in corso...";

    if (!currentAudioBuffer) {
        if (aiBox) aiBox.value = "⚠️ Carica o seleziona un file audio prima di eseguire l'analisi.";
        return;
    }

    try {
        const duration = Math.max(0.2, markerB - markerA);
        const audio16k = await resampleAudioBufferTo16k(currentAudioBuffer, markerA, duration);

        let aiResult = "";
        if (ortSession) {
            try {
                const melSpec = computeMelSpectrogramJS(audio16k, 16000, 64);
                const inputTensor = new ort.Tensor('float32', melSpec.data, [1, 1, 64, melSpec.timeSteps]);
                const feeds = { spectrogram: inputTensor };
                const results = await ortSession.run(feeds);
                aiResult = ctcGreedyDecodeJS(results.log_probs.data, results.log_probs.dims);
            } catch (err) {
                console.warn("ONNX Inference fallback:", err);
            }
        }

        const dspResult = decodeMorseDSP(audio16k, 16000);
        const cleanAi = aiResult.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim();
        const cleanDsp = dspResult.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim();
        const rawOutput = cleanAi || cleanDsp || "NESSUN SEGNALE DETETTATO";

        if (aiBox) aiBox.value = rawOutput;

        const reconstructedText = rawOutput ? correctTextWithItalianDictionary(rawOutput) : "";
        const dictBox = document.getElementById('dictionaryCorrectedText');
        if (dictBox) dictBox.value = reconstructedText;

        const userBox = document.getElementById('userCorrectionText');
        if (userBox && (editingPairIndex < 0)) {
            userBox.value = isRawOnlyMode ? rawOutput : (reconstructedText || rawOutput);
        }

        logDebug(`Inference completata. RAW: "${rawOutput}" | Ricostruito: "${reconstructedText}"`);

        if (isAutoLearningEnabled && reconstructedText && reconstructedText.length >= 3) {
            if (userBox) userBox.value = reconstructedText;
            saveVerifiedPair();
        }
    } catch (e) {
        console.error("Analysis Error:", e);
        if (aiBox) aiBox.value = "ERRORE ANALISI AUDIO";
    }
}

function toggleAutoLearning(event) {
    isAutoLearningEnabled = event.target.checked;
}

function toggleRawOnlyMode(event) {
    isRawOnlyMode = event.target.checked;
}

// 7. SAVE & SYNC APPROVED TRAINING PAIRS TO GOOGLE SHEET
function saveVerifiedPair() {
    const select = document.getElementById('qsoSelect') || document.getElementById('aiQsoSelect');
    const idx = parseInt(select.value);
    const qsoItem = (idx >= 0 && qsoList[idx]) ? qsoList[idx] : null;
    const fullQsoSource = qsoItem ? qsoItem.filename : (select.options[select.selectedIndex]?.text || "QSO_Clip");

    const aiPred = document.getElementById('aiPredictionText')?.value || "";
    const userCorr = document.getElementById('userCorrectionText')?.value?.trim() || "";

    if (!userCorr) {
        alert("Inserisci il testo corretto nella TextBox 2 prima di salvare!");
        return;
    }

    if (editingPairIndex >= 0 && editingPairIndex < savedPairs.length) {
        savedPairs[editingPairIndex].filename = fullQsoSource;
        savedPairs[editingPairIndex].timePos = `${markerA.toFixed(1)}s - ${markerB.toFixed(1)}s`;
        savedPairs[editingPairIndex].aiPrediction = aiPred;
        savedPairs[editingPairIndex].userCorrection = userCorr;
        cancelEditMode();
    } else {
        const pair = {
            id: savedPairs.length + 1,
            filename: fullQsoSource,
            timePos: `${markerA.toFixed(1)}s - ${markerB.toFixed(1)}s`,
            aiPrediction: aiPred,
            userCorrection: userCorr
        };
        savedPairs.push(pair);
        syncPairToGoogleCloudSheet(pair);
        const userBox = document.getElementById('userCorrectionText');
        if (userBox) userBox.value = '';
    }

    persistSavedPairs();
    updateSavedTable();

    const msg = document.getElementById('saveMessage');
    if (msg) {
        msg.innerText = `✓ Salvato e sincronizzato sul Foglio ADDESTRA (#${savedPairs.length})!`;
        setTimeout(() => { msg.innerText = ''; }, 3000);
    }
}

async function syncPairToGoogleCloudSheet(pair) {
    if (!pair || !pair.userCorrection) return;
    const scriptUrl = await fetchAppsScriptUrlFromFirebase();
    if (!scriptUrl) return;

    const params = new URLSearchParams({
        action: "save_approved",
        filename: pair.filename || "QSO_Clip",
        time_pos: pair.timePos || "00:00 - 00:10",
        transcript: pair.userCorrection || "",
        ai_prediction: pair.aiPrediction || "",
        uid: window.tgUser?.id || window.myId || ""
    });

    try {
        const resp = await fetch(`${scriptUrl}?${params.toString()}`);
        const res = await resp.json();
        console.log("✓ Sincronizzato con il Foglio Google ADDESTRA in Cloud:", res);
    } catch(err) {
        console.warn("Google Cloud Sheet sync warning:", err);
    }
}

async function syncAllPairsToGoogleSheet() {
    if (!savedPairs || savedPairs.length === 0) {
        alert("Nessun segmento salvato presente nella tabella da sincronizzare.");
        return;
    }

    const scriptUrl = await fetchAppsScriptUrlFromFirebase();
    if (!scriptUrl) {
        alert("URL Google Apps Script non configurato.");
        return;
    }

    const statusMsg = document.getElementById('saveMessage');
    if (statusMsg) {
        statusMsg.innerText = "⏳ Sincronizzazione in corso con il Foglio Google (scheda ADDESTRA)...";
        statusMsg.style.color = "#00bcd4";
    }

    let count = 0;
    for (let pair of savedPairs) {
        await syncPairToGoogleCloudSheet(pair);
        count++;
    }

    if (statusMsg) {
        statusMsg.innerText = `✓ Sincronizzate ${count} righe col Foglio Google!`;
        statusMsg.style.color = "#00ff66";
        setTimeout(() => { statusMsg.innerText = ''; }, 3000);
    }
}

function persistSavedPairs() {
    try {
        localStorage.setItem('cw_refined_pairs_dataset', JSON.stringify(savedPairs));
    } catch(e) {}
}

function loadSavedPairsFromStorage() {
    try {
        const saved = localStorage.getItem('cw_refined_pairs_dataset');
        if (saved) {
            savedPairs = JSON.parse(saved);
            updateSavedTable();
        }
    } catch(e) {}
}

function updateSavedTable() {
    const tbody = document.querySelector('#verifiedTable tbody');
    const countSpan = document.getElementById('savedCount');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (countSpan) countSpan.innerText = savedPairs.length;

    savedPairs.forEach((pair, idx) => {
        const tr = document.createElement('tr');
        if (editingPairIndex === idx) tr.style.backgroundColor = "rgba(0, 188, 212, 0.2)";

        const tdIdx = document.createElement('td'); tdIdx.innerText = idx + 1;
        const tdFile = document.createElement('td');
        const cleanFile = (pair.filename || "").replace(/^.*[\\\/]/, '').substring(0, 35);
        tdFile.innerText = cleanFile + (cleanFile.length >= 35 ? '...' : '');
        tdFile.title = pair.filename;

        const tdTime = document.createElement('td'); tdTime.innerText = pair.timePos;
        const tdAi = document.createElement('td'); tdAi.innerText = pair.aiPrediction || "-";
        const tdUser = document.createElement('td'); tdUser.innerText = pair.userCorrection;
        tdUser.style.fontWeight = "bold";
        tdUser.style.color = "#00bcd4";

        const tdActions = document.createElement('td');
        tdActions.innerHTML = `
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="editSavedPair(${idx})">✏️ Modifica</button>
            <button class="btn btn-accent" style="padding:2px 8px; font-size:0.75rem; background-color:#c62828;" onclick="deleteSavedPair(${idx})">🗑️</button>
        `;

        tr.appendChild(tdIdx);
        tr.appendChild(tdFile);
        tr.appendChild(tdTime);
        tr.appendChild(tdAi);
        tr.appendChild(tdUser);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function cancelEditMode() {
    editingPairIndex = -1;
    const aiBox = document.getElementById('aiPredictionText');
    const userBox = document.getElementById('userCorrectionText');
    if (aiBox) aiBox.value = '';
    if (userBox) userBox.value = '';

    const btn = document.getElementById('savePairBtn');
    if (btn) btn.innerText = "💾 Salva & Aggiungi al Dataset";

    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    updateSavedTable();
}

function deleteSavedPair(idx) {
    if (idx < 0 || idx >= savedPairs.length) return;
    savedPairs.splice(idx, 1);
    savedPairs.forEach((p, i) => p.id = i + 1);

    if (editingPairIndex === idx) cancelEditMode();
    persistSavedPairs();
    updateSavedTable();
}

function handleLocalAudioFilesUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const statusElem = document.getElementById('sheetStatus');
    if (statusElem) { statusElem.innerText = `⏳ Lettura file locale: ${file.name}...`; statusElem.style.color = "#00bcd4"; }

    file.arrayBuffer().then(async (arrayBuf) => {
        const ctx = getAudioContext();
        currentAudioBuffer = await ctx.decodeAudioData(arrayBuf);
        markerA = 0.0;
        markerB = Math.min(currentAudioBuffer.duration, 10.0);
        if (statusElem) { statusElem.innerText = `✓ Audio Locale Caricato: ${file.name} (${currentAudioBuffer.duration.toFixed(1)}s)`; statusElem.style.color = "#00ff66"; }
        updateSegmentDisplay();
    }).catch(e => {
        console.error("Errore decodifica audio locale:", e);
    });
}

// 8. DOM CONTENT LOADED INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
    const isAuth = checkTelegramAuthAndLock();
    initFirebaseInStudio();
    initONNXModel();
    drawPlaceholderCanvas();
    initMasterTimeline();
    loadSavedPairsFromStorage();

    if (isAuth) {
        autoFetchQsoListFromAppsScript();
    }
});
