// CW AI Studio Standalone Version
const APP_IACW_VERSION = "2026.09.07 - V3.2 (IACW)";
console.log(`🚀 CW AI Studio (IACW) Version: ${APP_IACW_VERSION}`);

// Morse Vocabulary matching PyTorch morse_table.py
const VOCAB = ['<BLANK>', ' ', '"', '$', '&', "'", '(', ')', '+', ',', '-', '.', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '=', '?', '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '_', '!', '<AR>', '<BT>', '<KN>', '<SK>', '<VA>', '<AS>', '<SOS>', '<HH>'];

let audioCtx = null;
let currentAudioBuffer = null;
let currentSourceNode = null;
let current10sStart = 0;
let qsoList = [];
let savedPairs = [];
let ortSession = null;

// Microphone Live State
let micStream = null;
let isMicActive = false;
let analyserNode = null;
let liveAnimationFrame = null;

// Initialize Web Audio Context (Native Sample Rate for 100% decodeAudioData Compatibility)
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Load ONNX Model & Full Italian/Radio Dictionary on App Startup
async function initONNXModel() {
    try {
        console.log("Loading ONNX Model (morse_model.onnx)...");
        ortSession = await ort.InferenceSession.create('./morse_model.onnx', { executionProviders: ['wasm', 'webgl'] });
        console.log("ONNX Model loaded successfully!");
    } catch (e) {
        console.warn("ONNX model 'morse_model.onnx' not found yet. Train model using Python backend first!", e);
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

// ============================================================================
// TELEGRAM AUTHENTICATION & FIREBASE APPS SCRIPT INTEGRATION
// ============================================================================
let activeAppsScriptUrl = "";

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

    // Se NON c'è utente Telegram valido o initData: BLOCCO TOTALE DALL'ESTERNO!
    if (!tgUser || !tgUser.id || !rawInitData) {
        console.warn("Security: External access blocked (No Telegram User).");
        const overlay = document.getElementById('telegramAccessOverlay');
        if (overlay) overlay.style.display = 'flex';
        return false;
    }

    console.log("✓ Telegram User Authenticated:", tgUser.first_name, "(ID:", tgUser.id, ")");
    return true;
}

const ALLOWED_FETCH_HOSTS = ["script.google.com", "docs.google.com", "telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app"];

async function safeFetch(rawUrl, paramsObj = null) {
    if (!rawUrl) return Promise.reject("Invalid URL");
    let parsed;
    try {
        parsed = new URL(String(rawUrl).trim());
    } catch(e) {
        return Promise.reject("URL format error");
    }

    const host = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_FETCH_HOSTS.some(h => host === h || host.endsWith("." + h) || host.endsWith(".google.com") || host.endsWith(".googleapis.com"));
    if (parsed.protocol !== "https:" || !isAllowed) {
        return Promise.reject("Host not allowed: " + host);
    }

    if (paramsObj) {
        Object.keys(paramsObj).forEach(k => {
            if (paramsObj[k] !== undefined && paramsObj[k] !== null) {
                parsed.searchParams.set(k, String(paramsObj[k]));
            }
        });
    }

    const req = new Request(parsed.href, { method: 'GET' });
    return fetch(req);
}

async function fetchAppsScriptUrlFromFirebase() {
    if (activeAppsScriptUrl && activeAppsScriptUrl.startsWith('http') && Array.isArray(window.allAppsScriptUrls) && window.allAppsScriptUrls.length > 0) {
        return activeAppsScriptUrl;
    }

    try {
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
                try {
                    await firebase.auth().signInAnonymously();
                } catch(e) {}
            }

            if (firebase.database) {
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
                    activeAppsScriptUrl = foundUrls[0];
                    window.allAppsScriptUrls = [...new Set(foundUrls)];
                    console.log("🔒 Loaded fresh Apps Script URLs dynamically from Firebase Database:", window.allAppsScriptUrls);
                    return activeAppsScriptUrl;
                }
            }
        }
    } catch(e) {
        // Silently handled
    }

    return activeAppsScriptUrl || "";
}

const CACHE_ADDESTRA_QSO_KEY = "cw_addestra_qso_list_cache";

function extractDateFromFilename(filename) {
    if (!filename) return "Senza Data";
    const str = String(filename).trim();

    // MATCH RIGIDO 8 CIFRE: YYYYMMDD (4 cifre anno 2010-2030, 2 cifre mese 01-12, 2 cifre giorno 01-31)
    const m1 = str.match(/(?:^|[^0-9])(20[123]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

    // MATCH YYYY-MM-DD o YYYY_MM_DD
    const m2 = str.match(/(?:^|[^0-9])(20[123]\d)[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

    return "Senza Data";
}

function renderQsoListWithDateFilter(list) {
    const qsoSelect = document.getElementById('qsoSelect');
    const dateSelect = document.getElementById('aiDateSelect');
    const status = document.getElementById('sheetStatus');

    if (!qsoSelect) return;

    qsoList = list || [];
    const dateMap = {};
    const yearMap = {};

    qsoList.forEach((item, idx) => {
        const fname = String(item.filename || "");
        const d = extractDateFromFilename(fname);
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

    // Default: 100% full list
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
}

function filterQsoListByDate() {
    const qsoSelect = document.getElementById('qsoSelect');
    const dateSelect = document.getElementById('aiDateSelect');
    if (!qsoSelect) return;

    const selectedFilter = dateSelect ? dateSelect.value : "";
    qsoSelect.innerHTML = '';

    qsoList.forEach((item, originalIdx) => {
        const fname = String(item.filename || "");
        const itemDate = extractDateFromFilename(fname);
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
    const cached = localStorage.getItem(CACHE_ADDESTRA_QSO_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cachedCount = parsed.length;
                console.log("⚡ Instant loaded QSO list from localStorage cache:", cachedCount, "items");
                renderQsoListWithDateFilter(parsed);
            }
        } catch(e) {}
    }

    const scriptUrl = await fetchAppsScriptUrlFromFirebase();
    if (!scriptUrl) return;
    const targetUrls = [scriptUrl];

    const status = document.getElementById('sheetStatus');
    if (status && cachedCount === 0) {
        status.innerText = "⏳ Scansione elenco QSO dal server Google...";
        status.style.backgroundColor = "#00bcd4";
    }

    for (let url of targetUrls) {
        try {
            let fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=search&q=&limit=10000&uid=${window.tgUser?.id || ""}`;
            logDebug(`🔍 Background Scanning QSO list from Apps Script: ${fetchUrl}`);
            const resp = await fetch(fetchUrl);
            if (!resp.ok) continue;

            const data = await resp.json();
            if (data && data.status === 'success' && Array.isArray(data.results) && data.results.length > 0) {
                const liveCount = data.results.length;
                const mappedResults = data.results.map(r => {
                    let realId = r.id;
                    if (!realId || realId.startsWith('row_')) {
                        const m = (r.streamUrl || r.filename || "").match(/[-\w]{25,}/);
                        if (m) realId = m[0];
                    }
                    return {
                        id: realId || r.id,
                        filename: r.filename,
                        streamUrl: r.streamUrl,
                        transcript: r.filename
                    };
                });

                activeAppsScriptUrl = url;

                if (liveCount !== cachedCount) {
                    console.log(`🔄 Trovati ${liveCount} QSO sul server (Cache ne aveva ${cachedCount}). Aggiornamento in corso...`);
                    localStorage.setItem(CACHE_ADDESTRA_QSO_KEY, JSON.stringify(mappedResults));
                    renderQsoListWithDateFilter(mappedResults);
                } else {
                    console.log(`✓ Elenco QSO allineato (${liveCount} file).`);
                }
                logDebug(`✓ Caricati ${liveCount} QSO da Google Apps Script!`);
                return;
            }
        } catch(e) {
            console.warn("Auto fetch QSO list error for", url, ":", e);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const isAuth = checkTelegramAuthAndLock();
    initONNXModel();
    drawPlaceholderCanvas();
    initSegmentCanvasClick();
    initSegmentCanvasDragSelection();
    initMasterTimeline();

    if (isAuth) {
        autoFetchQsoListFromAppsScript();
    }
});

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

    const handlePointerDown = (clientX, clientY) => {
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

    const handlePointerMove = (clientX, clientY) => {
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
        if (activeDraggingMarker) {
            activeDraggingMarker = null;
        }
    };

    canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
    canvas.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY));
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerUp);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
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

    // FLAG MANIGLIA PUNTI A & B (STILE SOFTWARE EDITING MUSICALE / DAW)
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
    logDebug(`🔍 Zoom timeline a ${timelineZoomFactor.toFixed(1)}x centrato su ${midTime.toFixed(1)}s`);
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
    logDebug(`📍 Punto A impostato al centro della vista: ${markerA.toFixed(2)}s`);
}

function setMarkerBFromCurrent() {
    const duration = currentAudioBuffer ? currentAudioBuffer.duration : 10.0;
    const visibleDuration = duration / timelineZoomFactor;
    markerB = Math.max(markerA + 0.2, Math.min(duration, timelineScrollOffset + (visibleDuration / 2)));
    updateMasterTimelineDisplay();
    logDebug(`📍 Punto B impostato al centro della vista: ${markerB.toFixed(2)}s`);
}

let currentPlaybackSpeed = 1.0;

function changePlaybackSpeed(event) {
    const sel = document.getElementById('playbackSpeedSelect');
    if (sel) {
        currentPlaybackSpeed = parseFloat(sel.value) || 1.0;
        if (currentSourceNode) {
            try { currentSourceNode.playbackRate.value = currentPlaybackSpeed; } catch(e){}
        }
        logDebug(`🐢 Velocità di riproduzione audio impostata a: ${currentPlaybackSpeed}x`);
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

    // Esegue l'analisi IA/DSP solo all'avvio della riproduzione Play
    if (typeof runInferenceOnSegment === 'function') {
        runInferenceOnSegment();
    }
}

function initSegmentCanvasClick() {
    const canvas = document.getElementById('segmentCanvas');
    if (!canvas) return;

    canvas.addEventListener('click', (e) => {
        if (!currentAudioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = clickX / canvas.width;

        const duration = currentAudioBuffer.duration;
        current10sStart = Math.max(0, Math.min(duration - currentWindowDuration, current10sStart + (ratio * currentWindowDuration) - (currentWindowDuration / 2)));
        updateSegmentDisplay();
        logDebug(`🎯 Posizione audio impostata a: ${current10sStart.toFixed(2)}s`);
    });
}

let isDraggingCanvas = false;
let dragStartX = 0;
let dragEndX = 0;

function initSegmentCanvasDragSelection() {
    const canvas = document.getElementById('segmentCanvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
        if (!currentAudioBuffer) return;
        isDraggingCanvas = true;
        const rect = canvas.getBoundingClientRect();
        dragStartX = e.clientX - rect.left;
        dragEndX = dragStartX;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDraggingCanvas || !currentAudioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        dragEndX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
        drawSegmentWaveform();
        drawSelectionBox(canvas.getContext('2d'), dragStartX, dragEndX, canvas.height);
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!isDraggingCanvas || !currentAudioBuffer) return;
        isDraggingCanvas = false;

        const rect = canvas.getBoundingClientRect();
        const endX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));

        const minX = Math.min(dragStartX, endX);
        const maxX = Math.max(dragStartX, endX);

        const duration = currentAudioBuffer.duration;

        if (maxX - minX > 3) {
            const regionA = (minX / canvas.width) * duration;
            const regionB = (maxX / canvas.width) * duration;

            current10sStart = Math.max(0, regionA);
            currentWindowDuration = Math.max(0.2, Math.min(duration - current10sStart, regionB - regionA));

            updateSegmentDisplay();
            logDebug(`📍 [Punto A-B] Selezionato tratto preciso: ${regionA.toFixed(2)}s -> ${regionB.toFixed(2)}s (Durata: ${currentWindowDuration.toFixed(2)}s)`);
        } else {
            const clickRatio = minX / canvas.width;
            current10sStart = Math.max(0, Math.min(duration - currentWindowDuration, clickRatio * duration));
            updateSegmentDisplay();
            logDebug(`🎯 [Punto A] Spostato a: ${current10sStart.toFixed(2)}s`);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        isDraggingCanvas = false;
    });
}

function drawSelectionBox(ctx, startX, endX, height) {
    ctx.fillStyle = 'rgba(0, 188, 212, 0.25)';
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 1;
    const minX = Math.min(startX, endX);
    const w = Math.abs(endX - startX);
    ctx.fillRect(minX, 0, w, height);
    ctx.strokeRect(minX, 0, w, height);
}

// Switch Navigation Tabs
function switchTab(tabId) {
    const contents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < contents.length; i++) {
        contents[i].style.display = 'none';
        contents[i].classList.remove('active');
    }

    const btns = document.getElementsByClassName('tab-btn');
    for (let i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
    }

    const targetContent = document.getElementById(tabId);
    if (targetContent) {
        targetContent.style.display = 'block';
        targetContent.classList.add('active');
    }

    const activeBtn = document.querySelector(`button[onclick*="${tabId}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function logDebug(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${msg}`;
    console.log(formatted);
    const box = document.getElementById('debugConsoleBox');
    if (box) {
        if (box.innerText.includes('In attesa di')) {
            box.innerText = formatted;
        } else {
            box.innerText += `\n${formatted}`;
        }
        box.scrollTop = box.scrollHeight;
    }
}

// 1. CSV & Google Sheets Upload & QSO Selection
function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    logDebug(`File CSV selezionato dall'utente: "${file.name}" (${file.size} bytes)`);
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        logDebug(`Lettura file CSV completata. Inizio parsing...`);
        parseCSVData(text);
        document.getElementById('csvStatus').innerText = `Caricato: ${file.name} (${qsoList.length} voci)`;
        document.getElementById('csvStatus').style.backgroundColor = '#1b5e20';
    };
    reader.readAsText(file);
}

// Direct Google Sheets Import
async function loadGoogleSheetData() {
    const input = document.getElementById('googleSheetUrlInput').value.trim();
    const status = document.getElementById('sheetStatus');

    if (!input) {
        alert("Incolla un link valido di un Foglio Google!");
        return;
    }

    logDebug(`Inizio importazione da Foglio Google: "${input}"`);
    if (status) { status.innerText = "⏳ Importazione Foglio Google in corso..."; status.style.backgroundColor = "#00bcd4"; }

    const sheetIdMatch = input.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!sheetIdMatch) {
        alert("Link Foglio Google non valido.");
        return;
    }

    await autoFetchQsoListFromAppsScript();
}

function parseCSVData(csvText) {
    const lines = csvText.split(/\r?\n/);
    qsoList = [];
    const select = document.getElementById('qsoSelect');
    select.innerHTML = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let delimiter = ',';
        if (line.includes(';') && (line.split(';').length > line.split(',').length)) {
            delimiter = ';';
        } else if (line.includes('\t') && (line.split('\t').length > line.split(',').length)) {
            delimiter = '\t';
        }

        const parts = line.split(delimiter).map(p => p.replace(/^["']|["']$/g, '').trim());

        if (i === 0 && parts.some(p => ['filename', 'url', 'link', 'audio', 'transcript', 'elenco', 'qso', 'titolo'].includes(p.toLowerCase()))) {
            continue;
        }

        let audioSource = parts[0] || '';
        let transcript = parts[1] || '';

        if (audioSource) {
            qsoList.push({ filename: audioSource, transcript: transcript });
            const opt = document.createElement('option');
            opt.value = qsoList.length - 1;
            opt.innerText = `[QSO #${qsoList.length}] ${audioSource}`;
            select.appendChild(opt);
        }
    }

    if (qsoList.length > 0) {
        select.selectedIndex = 0;
        loadSelectedQSO();
    }
}

let localAudioFilesMap = {};
let localAudioFilesList = [];

function handleLocalAudioFilesUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    localAudioFilesList = Array.from(files);
    const selectGroup = document.getElementById('localAudioSelectGroup');
    const select = document.getElementById('localAudioSelect');

    if (select) {
        select.innerHTML = '';
        localAudioFilesList.forEach((file, idx) => {
            localAudioFilesMap[file.name] = file;
            const baseName = file.name.replace(/^.*[\\\/]/, '');
            localAudioFilesMap[baseName] = file;

            const opt = document.createElement('option');
            opt.value = idx;
            opt.innerText = `[File #${idx + 1}] ${file.name}`;
            select.appendChild(opt);
        });
    }

    if (selectGroup) selectGroup.style.display = 'block';

    const badge = document.getElementById('audioStatus') || document.getElementById('sheetStatus');
    if (badge) {
        badge.innerText = `Caricati ${files.length} file audio dal PC`;
        badge.style.backgroundColor = '#1b5e20';
    }

    loadSelectedLocalAudio();
}

async function loadSelectedLocalAudio() {
    const select = document.getElementById('localAudioSelect');
    const idx = parseInt(select.value);
    const statusElem = document.getElementById('audioLoadStatus');

    if (isNaN(idx) || !localAudioFilesList[idx]) return;

    const file = localAudioFilesList[idx];
    if (statusElem) { statusElem.innerText = `⏳ Lettura file locale dal PC: ${file.name}...`; statusElem.style.color = "#00bcd4"; }

    try {
        const arrayBuf = await file.arrayBuffer();
        const ctx = getAudioContext();
        currentAudioBuffer = await ctx.decodeAudioData(arrayBuf);
        current10sStart = 0;
        if (statusElem) { statusElem.innerText = `✓ Audio PC Caricato: ${file.name} (${currentAudioBuffer.duration.toFixed(1)}s)`; statusElem.style.color = "#00ff66"; }
        updateSegmentDisplay();
    } catch (e) {
        console.error("Errore decodifica audio locale:", e);
        if (statusElem) { statusElem.innerText = `⚠️ Impossibile decodificare il file audio ${file.name}`; statusElem.style.color = "#ff5252"; }
    }
}

// Load selected QSO Audio via Google Apps Script Proxy
async function loadSelectedQSO() {
    const select = document.getElementById('qsoSelect');
    const idx = parseInt(select.value);
    if (isNaN(idx) || !qsoList[idx]) return;

    const item = qsoList[idx];
    current10sStart = 0;

    logDebug(`▶️ Selezionato QSO #${idx + 1}: Sorgente = "${item.filename}"`);

    if (editingPairIndex < 0) {
        const userBox = document.getElementById('userCorrectionText');
        const aiBox = document.getElementById('aiPredictionText');
        if (userBox) userBox.value = item.transcript || '';
        if (aiBox) aiBox.value = 'In attesa dell\'analisi automatica...';
    }

    const statusElem = document.getElementById('audioLoadStatus');
    const trimmedSource = item.filename.trim();

    // 1. SCARICAMENTO AUDIO VIA GOOGLE APPS SCRIPT PROXY
    let fileId = item.id;
    if (!fileId || fileId.startsWith('row_')) {
        const m = (item.streamUrl || item.filename || trimmedSource || "").match(/[-\w]{25,}/);
        if (m) fileId = m[0];
    }

    const driveUrl = fileId ? `https://docs.google.com/uc?export=download&id=${fileId}` : item.streamUrl;

    // Preparazione dello streaming HTML5 temporizzato (Identico al gioco principale)
    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl) {
        audioEl.src = driveUrl;
        audioEl.load();
    }

    const activeUrl = activeAppsScriptUrl || (await fetchAppsScriptUrlFromFirebase());
    const proxyCandidateUrls = [
        activeUrl,
        "https://script.google.com/macros/s/AKfycbxAPRxGRb_I4qoByBd5KjjE67z5yETgSrMwNT2Ivq7buJEH75V_NEOZilfb6oKWP5fK/exec",
        "https://script.google.com/macros/s/AKfycbxL6meHkCoKXmTOR0IUJYPHNXLTNDgzmaf4Op5v9W3Lz1tFzzKaeAtnEEXQxxu90B1g/exec",
        ...(window.allAppsScriptUrls || []),
        window.qsoAudioServerUrl,
        localStorage.getItem('cwgame_qso_audio_url')
    ].filter(u => u && typeof u === 'string' && u.startsWith('http'));
    const uniqueProxyUrls = [...new Set(proxyCandidateUrls)];

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.tgUser?.id || window.myId || "";

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

                    const ctx = getAudioContext();
                    currentAudioBuffer = await ctx.decodeAudioData(bytes.buffer);

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

    if (localAudioFilesList.length > 0) {
        const localSelect = document.getElementById('localAudioSelect');
        if (localSelect) {
            const targetIdx = idx < localAudioFilesList.length ? idx : 0;
            localSelect.selectedIndex = targetIdx;
            loadSelectedLocalAudio();
            return;
        }
    }

    if (statusElem) { statusElem.innerText = "🎧 Player Pronto (Usa ▶️ Riproduci per l'ascolto)"; statusElem.style.color = "#00bcd4"; }
}

// Flexible Window Duration Controls
let currentWindowDuration = 10;

function changeWindowDuration() {
    const sel = document.getElementById('windowDurationSelect');
    if (sel) {
        currentWindowDuration = parseInt(sel.value) || 10;
    }

    const prevBtn = document.getElementById('prevBtn');
    const playBtn = document.getElementById('playBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (prevBtn) prevBtn.innerText = `◄◄ -${currentWindowDuration} Sec`;
    if (playBtn) playBtn.innerText = `▶️ Riproduci (${currentWindowDuration}s)`;
    if (nextBtn) nextBtn.innerText = `+${currentWindowDuration} Sec ►►`;

    updateSegmentDisplay();
}

function updateSegmentDisplay() {
    if (!currentAudioBuffer) return;
    const duration = currentAudioBuffer.duration;
    const end = Math.min(duration, current10sStart + currentWindowDuration);

    const formatTime = (sec) => {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m.toString().padStart(2, '0')}:${s < 10 ? '0' + s : s}`;
    };

    document.getElementById('timePosDisplay').innerText = `${formatTime(current10sStart)} - ${formatTime(end)}`;

    const scrubber = document.getElementById('audioScrubber');
    if (scrubber) {
        scrubber.max = duration;
        scrubber.value = current10sStart;
        const startLab = document.getElementById('scrubStartLabel');
        const endLab = document.getElementById('scrubEndLabel');
        if (startLab) startLab.innerText = formatTime(current10sStart);
        if (endLab) endLab.innerText = formatTime(end);
    }

    drawSegmentWaveform();
    updateMasterTimelineDisplay();
}

function onAudioScrubberInput(event) {
    if (!currentAudioBuffer) return;
    current10sStart = parseFloat(event.target.value) || 0;
    updateSegmentDisplay();
}

function prevSegment() {
    if (!currentAudioBuffer) return;
    current10sStart = Math.max(0, current10sStart - currentWindowDuration);
    updateSegmentDisplay();
}

function nextSegment() {
    if (!currentAudioBuffer) return;
    if (current10sStart + currentWindowDuration < currentAudioBuffer.duration) {
        current10sStart += currentWindowDuration;
        updateSegmentDisplay();
    }
}

function playCurrentSegment() {
    const winLen = currentWindowDuration;
    const start = current10sStart;
    const buf = currentAudioBuffer;
    const rate = currentPlaybackSpeed || 1.0;

    // 1. Riproduzione di precisione WebAudio Buffer
    if (buf) {
        const ctx = getAudioContext();
        if (currentSourceNode) {
            try { currentSourceNode.stop(); } catch(e){}
        }

        currentSourceNode = ctx.createBufferSource();
        currentSourceNode.buffer = buf;
        currentSourceNode.playbackRate.value = rate;
        currentSourceNode.connect(ctx.destination);
        currentSourceNode.start(0, start, winLen / rate);
        logDebug(`▶️ Riproduzione WebAudio (${rate}x): da ${start.toFixed(1)}s a ${(start + winLen).toFixed(1)}s`);
        return;
    }

    // 2. Fallback Streaming HTML5 Audio temporizzato
    const audioEl = document.getElementById('aiAudioHtmlEl');
    if (audioEl && audioEl.src) {
        if (window.aiAudioTimer) clearTimeout(window.aiAudioTimer);

        audioEl.currentTime = start;
        audioEl.playbackRate = rate;
        audioEl.play().then(() => {
            logDebug(`▶️ Riproduzione HTML5 Stream (${rate}x): da ${start.toFixed(1)}s a ${(start + winLen).toFixed(1)}s`);
            window.aiAudioTimer = setTimeout(() => {
                audioEl.pause();
            }, (winLen / rate) * 1000);
        }).catch(err => {
            console.warn("HTML5 Audio play warning:", err);
        });
    }
}

function drawPlaceholderCanvas() {
    const canvas = document.getElementById('segmentCanvas') || document.getElementById('masterTimelineCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8e9bb0';
    ctx.font = '14px Segoe UI';
    ctx.fillText('Nessun file audio selezionato', canvas.width / 2 - 80, canvas.height / 2 + 4);
}

function drawSegmentWaveform() {
    const canvas = document.getElementById('segmentCanvas');
    if (!canvas || !currentAudioBuffer) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, width, height);

    if (!currentAudioBuffer) return;

    const data = currentAudioBuffer.getChannelData(0);
    const sr = currentAudioBuffer.sampleRate;
    const startIdx = Math.floor(current10sStart * sr);
    const endIdx = Math.min(data.length, Math.floor((current10sStart + 10) * sr));
    const step = Math.ceil((endIdx - startIdx) / width);

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
}

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
        const absVal = Math.abs(filteredSamples[i]);
        if (absVal > maxAbs) maxAbs = absVal;
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
    if (validTones.length === 0) {
        const lowThreshold = avgEnergy * 1.05;
        for (let f = 0; f < numFrames; f++) {
            if (energies[f] > lowThreshold) {
                validTones.push({ tone: true, durationFrames: 5 });
            }
        }
        if (validTones.length === 0) return "K";
    }

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

    const res = decodedText.trim();
    if (res === ":" || res === "." || res === "," || res === "-") return "";
    return res;
}

function decodeMicroSliceDSP(samples, sampleRate = 16000) {
    if (!samples || samples.length === 0) return "";

    let maxAbs = 0.0;
    for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > maxAbs) maxAbs = Math.abs(samples[i]);
    }
    if (maxAbs < 0.0005) return "";

    const norm = samples.map(s => s / maxAbs);
    const frameSize = Math.floor(sampleRate * 0.005);
    const numFrames = Math.floor(norm.length / frameSize);
    const energies = [];

    let maxE = 0;
    for (let f = 0; f < numFrames; f++) {
        let sum = 0;
        for (let i = 0; i < frameSize; i++) {
            const val = norm[f * frameSize + i] || 0;
            sum += val * val;
        }
        const rms = Math.sqrt(sum / frameSize);
        energies.push(rms);
        if (rms > maxE) maxE = rms;
    }

    const threshold = Math.max(0.05, maxE * 0.20);
    let morse = "";
    let isTone = energies[0] > threshold;
    let count = 0;

    for (let rms of energies) {
        const active = rms > threshold;
        if (active === isTone) {
            count++;
        } else {
            if (isTone && count >= 2) {
                morse += (count <= 7) ? "." : "-";
            }
            isTone = active;
            count = 1;
        }
    }
    if (isTone && count >= 2) {
        morse += (count <= 7) ? "." : "-";
    }

    const MORSE_MAP_EXACT = {
        '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
        '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
        '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
        '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
        '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
        '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3',
        '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8',
        '----.': '9', '.-.-.-': '.', '--..--': ',', '..--..': '?', '-..-.': '/'
    };

    return MORSE_MAP_EXACT[morse] || morse || "K";
}

async function runInferenceOnSegment() {
    const aiBox = document.getElementById('aiPredictionText');
    aiBox.value = "⚡ Analisi in corso...";

    if (!currentAudioBuffer) {
        aiBox.value = "⚠️ Carica o seleziona un file audio prima di eseguire l'analisi.";
        return;
    }

    try {
        const duration = Math.min(currentWindowDuration, currentAudioBuffer.duration - current10sStart);
        if (duration <= 0) {
            aiBox.value = "⚠️ Posizione audio non valida.";
            return;
        }

        const audio16k = await resampleAudioBufferTo16k(currentAudioBuffer, current10sStart, duration);

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

        let rawOutput = "";
        if (duration < 3.5) {
            rawOutput = decodeMicroSliceDSP(audio16k, 16000);
        } else {
            const cleanAi = aiResult.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim();
            const cleanDsp = dspResult.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim();
            rawOutput = cleanAi || cleanDsp;
        }

        aiBox.value = rawOutput || "NESSUN SEGNALE DETETTATO";

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
            logDebug(`🤖 [Auto-Apprendimento] Segmento auto-validato e salvato: "${reconstructedText}"`);
        }
    } catch (e) {
        console.error("Analysis Error:", e);
        aiBox.value = "ERRORE ANALISI AUDIO";
    }
}

let isAutoLearningEnabled = false;
let isRawOnlyMode = false;

function toggleAutoLearning(event) {
    isAutoLearningEnabled = event.target.checked;
    logDebug(`🤖 Modalità Auto-Apprendimento ${isAutoLearningEnabled ? 'ATTIVATA' : 'DISATTIVATA'}`);
}

function toggleRawOnlyMode(event) {
    isRawOnlyMode = event.target.checked;
    logDebug(`🔤 Modalità 'Solo Caratteri Grezzi' ${isRawOnlyMode ? 'ATTIVATA' : 'DISATTIVATA'}`);
}

let ITALIAN_RADIO_DICTIONARY = [
    "CIAO", "BUONGIORNO", "BUONASERA", "BUONANOTTE", "GRAZIE", "MOLTO", "BENE", "BENISSIMO",
    "ROMA", "MILANO", "TORINO", "NAPOLI", "FIRENZE", "BOLOGNA", "GENOVA", "PALERMO", "VENEZIA",
    "CQ", "DE", "QSO", "QTH", "QSL", "QRM", "QRN", "QSB", "QRT", "QRZ", "QSY", "RST", "WATTS",
    "ANTENNA", "DIPOLE", "VERTICAL", "YAGI", "BEAM", "RIG", "TRANSCEIVER", "NAME", "OPERATOR",
    "TEMP", "WEATHER", "BUREAU", "LOTW", "CONTEST", "BEST", "DX", "73", "88", "BK", "SK", "AR",
    "BT", "KN", "PSE", "HW", "CPI", "FB", "VY", "TNX", "TU", "GM", "GA", "GE", "GN", "OM", "YL"
];

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
        logDebug(`✨ Applicata correzione da Dizionario Italiano/Radio: "${dictBox.value}"`);
    }
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

let editingPairIndex = -1;

function saveVerifiedPair() {
    const select = document.getElementById('qsoSelect');
    const idx = parseInt(select.value);
    const qsoItem = (idx >= 0 && qsoList[idx]) ? qsoList[idx] : null;
    const fullQsoSource = qsoItem ? qsoItem.filename : (select.options[select.selectedIndex]?.text || "QSO_Clip");

    const aiPred = document.getElementById('aiPredictionText').value;
    const userCorr = document.getElementById('userCorrectionText').value.trim();

    if (!userCorr) {
        alert("Inserisci il testo corretto nella TextBox 2 prima di salvare!");
        return;
    }

    if (editingPairIndex >= 0 && editingPairIndex < savedPairs.length) {
        savedPairs[editingPairIndex].filename = fullQsoSource;
        savedPairs[editingPairIndex].timePos = document.getElementById('timePosDisplay').innerText;
        savedPairs[editingPairIndex].aiPrediction = aiPred;
        savedPairs[editingPairIndex].userCorrection = userCorr;

        logDebug(`✏️ Aggiornato segmento #${editingPairIndex + 1}: "${userCorr}"`);
        cancelEditMode();
    } else {
        const pair = {
            id: savedPairs.length + 1,
            filename: fullQsoSource,
            timePos: document.getElementById('timePosDisplay').innerText,
            aiPrediction: aiPred,
            userCorrection: userCorr
        };
        savedPairs.push(pair);
        logDebug(`💾 Salvato nuovo segmento #${savedPairs.length}: "${userCorr}"`);

        syncPairToGoogleCloudSheet(pair);
        document.getElementById('userCorrectionText').value = '';
    }

    persistSavedPairs();
    updateSavedTable();

    const msg = document.getElementById('saveMessage');
    msg.innerText = `✓ Salvato e sincronizzato sul Foglio ADDESTRA (#${savedPairs.length})!`;
    setTimeout(() => { msg.innerText = ''; }, 3000);
}

async function editSavedPair(idx) {
    if (idx < 0 || idx >= savedPairs.length) return;
    const p = savedPairs[idx];
    editingPairIndex = idx;

    const btn = document.getElementById('savePairBtn');
    if (btn) btn.innerText = `✏️ Aggiorna Segmento #${idx + 1}`;

    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    logDebug(`✏️ Inizio modifica segmento #${idx + 1}: "${p.userCorrection}"`);

    const timeMatch = p.timePos.match(/(\d+):(\d+)/);
    if (timeMatch) {
        const mins = parseInt(timeMatch[1]);
        const secs = parseInt(timeMatch[2]);
        current10sStart = mins * 60 + secs;
    }

    const select = document.getElementById('qsoSelect');
    if (select && qsoList && qsoList.length > 0) {
        let matchedIdx = -1;
        for (let i = 0; i < qsoList.length; i++) {
            const q = qsoList[i];
            if (q.filename === p.filename || p.filename.includes(q.filename) || (q.transcript && p.filename.includes(q.transcript))) {
                matchedIdx = i;
                break;
            }
        }
        if (matchedIdx !== -1) {
            select.selectedIndex = matchedIdx;
            await loadSelectedQSO();
        }
    }

    document.getElementById('aiPredictionText').value = p.aiPrediction || "";
    document.getElementById('userCorrectionText').value = p.userCorrection || "";

    updateSegmentDisplay();
    updateSavedTable();
}

function cancelEditMode() {
    editingPairIndex = -1;

    document.getElementById('aiPredictionText').value = '';
    document.getElementById('userCorrectionText').value = '';

    const btn = document.getElementById('savePairBtn');
    if (btn) btn.innerText = "💾 Salva & Aggiungi al Dataset di Affinamento";

    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    logDebug("🚫 Modifica annullata. Ritorno alla modalità inserimento normale.");
    updateSavedTable();
}

function deleteSavedPair(idx) {
    if (idx < 0 || idx >= savedPairs.length) return;
    const removed = savedPairs.splice(idx, 1)[0];
    logDebug(`❌ Eliminato segmento #${idx + 1}: "${removed.userCorrection}"`);

    savedPairs.forEach((p, i) => p.id = i + 1);

    if (editingPairIndex === idx) {
        cancelEditMode();
    }

    persistSavedPairs();
    updateSavedTable();
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
        uid: window.tgUser?.id || ""
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
