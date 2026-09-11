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
    window.initLayoutCustomizer();
    await window.scanAddestraFolderModels();

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

window.scanAddestraFolderModels = async function() {
    const select = document.getElementById('aiModelSelect');
    if (!select) return;

    let foundModels = [];

    // 1. Scansione dinamica via GitHub API per 'game3/addestra' e 'addestra'
    try {
        const match = window.location.href.match(/https:\/\/([^.]+)\.github\.io\/([^\/]+)/i);
        if (match) {
            const owner = match[1];
            const repo = match[2];
            const pathsToScan = [`game3/addestra`, `addestra`].map(p => `https://api.github.com/repos/${owner}/${repo}/contents/${p}`);

            for (let apiUrl of pathsToScan) {
                try {
                    console.log("🔍 Scanning GitHub repository folder for ONNX models:", apiUrl);
                    const resp = await fetch(apiUrl);
                    if (resp.ok) {
                        const files = await resp.json();
                        if (Array.isArray(files)) {
                            files.filter(f => f.name && f.name.endsWith('.onnx'))
                                 .forEach(f => foundModels.push(`addestra/${f.name}`));
                        }
                    }
                } catch(err) {}
            }
        }
    } catch(e) {
        console.warn("GitHub API scan warning:", e);
    }

    // 2. Tenta la lettura dal file di indice locale addestra/models.json se presente
    if (foundModels.length === 0) {
        try {
            const resp = await fetch('addestra/models.json');
            if (resp.ok) {
                const list = await resp.json();
                if (Array.isArray(list)) {
                    foundModels = list.map(m => m.startsWith('addestra/') ? m : `addestra/${m}`);
                }
            }
        } catch(e) {}
    }

    // 3. Tenta la lettura da Firebase appConfig/addestra_models se presente
    if (foundModels.length === 0 && typeof firebase !== 'undefined' && firebase.database) {
        try {
            const snap = await firebase.database().ref('appConfig/addestra_models').once('value');
            if (snap.exists() && Array.isArray(snap.val())) {
                foundModels = snap.val().map(m => m.startsWith('addestra/') ? m : `addestra/${m}`);
            }
        } catch(e) {}
    }

    // 4. Aggiunge i modelli salvati in localStorage dall'utente
    const customStored = localStorage.getItem('cwgame_custom_onnx_models');
    if (customStored) {
        try {
            const customList = JSON.parse(customStored);
            if (Array.isArray(customList)) {
                foundModels.push(...customList);
            }
        } catch(e) {}
    }

    // Fallback con modello di base se nessun altro e stato rilevato
    if (foundModels.length === 0) {
        foundModels = ['addestra/morse_model.onnx'];
    }

    const uniqueModels = [...new Set(foundModels)];
    const currentVal = select.value || uniqueModels[0];
    select.innerHTML = '';

    uniqueModels.forEach(modelPath => {
        const opt = document.createElement('option');
        opt.value = modelPath;
        const fileName = modelPath.split('/').pop();
        opt.textContent = fileName + (modelPath === 'addestra/morse_model.onnx' ? ' (Standard)' : '');
        if (modelPath === currentVal) opt.selected = true;
        select.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__ADD_CUSTOM__';
    customOpt.textContent = '➕ Inserisci nuovo modello .onnx...';
    select.appendChild(customOpt);
};

window.setLayoutWidth = function(mode) {
    document.body.classList.remove('layout-mode-compact', 'layout-mode-medium', 'layout-mode-fullscreen');
    if (mode === 'compact') {
        document.body.classList.add('layout-mode-compact');
    } else if (mode === 'medium') {
        document.body.classList.add('layout-mode-medium');
    } else {
        document.body.classList.add('layout-mode-fullscreen');
    }
    localStorage.setItem('cwgame_layout_mode', mode);

    setTimeout(() => {
        if (typeof window.updateMasterTimelineDisplay === 'function') {
            window.updateMasterTimelineDisplay();
        }
    }, 100);
};

window.changeLayoutScale = function(deltaPercent) {
    let currentScale = window.aiTrainingState.layoutScalePercent || 100;
    currentScale = Math.max(80, Math.min(160, currentScale + deltaPercent));
    window.aiTrainingState.layoutScalePercent = currentScale;

    document.body.style.zoom = `${currentScale}%`;
    localStorage.setItem('cwgame_layout_scale', currentScale);

    setTimeout(() => {
        if (typeof window.updateMasterTimelineDisplay === 'function') {
            window.updateMasterTimelineDisplay();
        }
    }, 100);
};

window.initLayoutCustomizer = function() {
    const savedMode = localStorage.getItem('cwgame_layout_mode') || 'fullscreen';
    window.setLayoutWidth(savedMode);

    const savedScale = parseInt(localStorage.getItem('cwgame_layout_scale'));
    if (!isNaN(savedScale) && savedScale >= 80 && savedScale <= 160) {
        window.aiTrainingState.layoutScalePercent = savedScale;
        document.body.style.zoom = `${savedScale}%`;
    }
};

// =========================================================================
// BATCH AUTO-STUDIO MULTI-BLOCCO ENGINE
// =========================================================================
window.toggleBatchStudio = function() {
    const panel = document.getElementById('aiBatchStudioPanel');
    if (!panel) return;

    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
        if ((!window.aiTrainingState.batchBlocks || window.aiTrainingState.batchBlocks.length === 0) && window.aiTrainingState.currentAudioBuffer) {
            window.generateBatchAudioBlocks();
        }
    } else {
        panel.style.display = 'none';
    }
};

window.generateBatchAudioBlocks = function() {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf) {
        if (typeof showToast === 'function') showToast("⚠️ Carica o seleziona prima un file QSO audio.");
        return;
    }

    const countInput = document.getElementById('aiBatchCountInput');
    const durSelect = document.getElementById('aiBatchDurationSelect');

    const requestedCount = parseInt(countInput?.value) || 10;
    const requestedDur = parseInt(durSelect?.value) || 15;
    const totalDuration = buf.duration;

    const step = Math.min(requestedDur, Math.max(2, totalDuration / requestedCount));

    window.aiTrainingState.batchBlocks = [];

    for (let i = 0; i < requestedCount; i++) {
        const start = i * step;
        if (start >= totalDuration) break;
        const end = Math.min(totalDuration, start + requestedDur);

        window.aiTrainingState.batchBlocks.push({
            id: i + 1,
            markerA: start,
            markerB: end,
            aiText: "⚡ In corso...",
            userText: "",
            isSent: false
        });
    }

    const summary = document.getElementById('aiBatchSummaryText');
    if (summary) {
        summary.textContent = `Generati ${window.aiTrainingState.batchBlocks.length} blocchi (${requestedDur}s ciascuno).`;
    }

    window.renderBatchRows();
    window.runBatchInferenceAll();
};

window.renderBatchRows = function() {
    const container = document.getElementById('aiBatchRowsContainer');
    if (!container) return;

    const blocks = window.aiTrainingState.batchBlocks || [];
    if (blocks.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--hint-color); padding:15px;">Nessun blocco generato. Premere '✂️ DIVIDI E GENERA RIGHE'.</div>`;
        return;
    }

    const fmt = (sec) => {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    };

    container.innerHTML = '';

    blocks.forEach(b => {
        const rowDiv = document.createElement('div');
        rowDiv.id = `batchRow_${b.id}`;
        rowDiv.className = 'box-panel';
        rowDiv.style.cssText = `padding:10px; border-color:${b.isSent ? '#d32f2f' : '#ff9800'}; background:#080d12; margin:0;`;

        rowDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
                <b style="color:#ff9800; font-size:0.85em;">Blocco #${b.id}</b>
                <span style="font-size:0.75em; color:var(--text-color); display:inline-flex; align-items:center; gap:3px;">
                    📍 A: <input type="number" id="batchMarkerAInput_${b.id}" value="${b.markerA.toFixed(1)}" step="0.1" min="0" onchange="window.updateBatchBlockMarkersFromInput(${b.id})" style="width:60px; padding:2px 4px; font-size:0.85em; font-weight:bold; background:#ffffff; color:#000000; border:2px solid #00ff66; border-radius:4px; text-align:center;">s |
                    📍 B: <input type="number" id="batchMarkerBInput_${b.id}" value="${b.markerB.toFixed(1)}" step="0.1" min="0" onchange="window.updateBatchBlockMarkersFromInput(${b.id})" style="width:60px; padding:2px 4px; font-size:0.85em; font-weight:bold; background:#ffffff; color:#000000; border:2px solid #ff9800; border-radius:4px; text-align:center;">s |
                    ⏱️ <strong id="batchDur_${b.id}" style="color:#00bcd4;">${(b.markerB - b.markerA).toFixed(1)}s</strong>
                </span>
            </div>

            <div style="width:100%; height:70px; background:#030508; border-radius:4px; border:1px solid #1e293b; margin-bottom:6px; overflow:hidden;">
                <canvas id="batchCanvas_${b.id}" width="800" height="70" style="width:100%; height:100%; display:block; cursor:crosshair;"></canvas>
            </div>

            <div style="display:flex; flex-direction:column; gap:6px; width:100%; box-sizing:border-box;">
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; width:100%; box-sizing:border-box;">
                    <button onclick="window.playBatchBlock(${b.id})" class="action-btn-small btn-success" style="padding:6px 10px; font-size:0.8em; font-weight:bold;">▶️ Ascolta #${b.id}</button>
                    <input type="text" id="batchAiText_${b.id}" readonly value="${b.aiText}" placeholder="Predizione IA..." style="flex:1; min-width:120px; padding:6px 8px; font-size:0.85em; font-family:monospace; font-weight:bold; background:#ffffff; color:#000000; border:2px solid #00bcd4; border-radius:4px; box-sizing:border-box;">
                    <button onclick="window.copyBatchAiToUser(${b.id})" class="action-btn-small btn-secondary" style="padding:6px 10px; font-size:0.75em;" title="Copia suggerimento IA">📋 Copia</button>
                </div>

                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; width:100%; box-sizing:border-box;">
                    <input type="text" id="batchUserText_${b.id}" value="${b.userText}" oninput="window.aiTrainingState.batchBlocks[${b.id-1}].userText=this.value" placeholder="Scrivi/correggi qui la trascrizione reale dell'audio..." style="flex:1; min-width:140px; padding:6px 8px; font-size:0.85em; font-family:monospace; font-weight:bold; background:#ffffff; color:#000000; border:2px solid ${b.isSent ? '#d32f2f' : '#ff9800'}; border-radius:4px; box-sizing:border-box;">
                    <button id="batchSendBtn_${b.id}" onclick="window.sendBatchBlockToCloud(${b.id})" class="action-btn-small ${b.isSent ? 'btn-danger' : 'btn-success'}" style="padding:6px 12px; font-weight:bold; font-size:0.8em; background:${b.isSent ? '#d32f2f' : '#4caf50'}; border-color:${b.isSent ? '#ff5252' : '#81c784'}; box-sizing:border-box; flex-shrink:0;">
                        ${b.isSent ? `🔴 INVIATO (#${b.id})` : `💾 INVIA FOGLIO GOOGLE`}
                    </button>
                </div>
            </div>
        `;

        container.appendChild(rowDiv);
        setTimeout(() => {
            window.drawBatchRowCanvas(b);
            window.initBatchRowCanvasEvents(b);
        }, 50);
    });
};

window.drawBatchRowCanvas = function(b) {
    const canvas = document.getElementById(`batchCanvas_${b.id}`);
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!canvas || !buf) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && canvas.width !== Math.floor(rect.width)) {
        canvas.width = Math.floor(rect.width);
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, width, height);

    const duration = buf.duration;
    const blockSpan = Math.max(0.5, b.markerB - b.markerA);
    const margin = blockSpan * 0.2;
    const viewStart = Math.max(0, b.markerA - margin);
    const viewEnd = Math.min(duration, b.markerB + margin);
    const viewSpan = viewEnd - viewStart;

    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const startIdx = Math.floor(viewStart * sr);
    const endIdx = Math.min(data.length, Math.floor(viewEnd * sr));
    const step = Math.max(1, Math.ceil((endIdx - startIdx) / width));

    ctx.lineWidth = 1;
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

    const timeToX = (t) => ((t - viewStart) / viewSpan) * width;
    const xA = timeToX(b.markerA);
    const xB = timeToX(b.markerB);

    ctx.fillStyle = b.isSent ? 'rgba(211, 47, 47, 0.25)' : 'rgba(255, 152, 0, 0.25)';
    ctx.fillRect(xA, 0, xB - xA, height);

    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xA, 0); ctx.lineTo(xA, height); ctx.stroke();

    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xB, 0); ctx.lineTo(xB, height); ctx.stroke();
};

window.initBatchRowCanvasEvents = function(b) {
    const canvas = document.getElementById(`batchCanvas_${b.id}`);
    if (!canvas || canvas.dataset.eventsBound) return;
    canvas.dataset.eventsBound = "true";

    const getCanvasTimeFromX = (clientX) => {
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!buf) return 0;
        const rect = canvas.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * (canvas.width / rect.width)));
        const duration = buf.duration;
        const blockSpan = Math.max(0.5, b.markerB - b.markerA);
        const margin = blockSpan * 0.2;
        const viewStart = Math.max(0, b.markerA - margin);
        const viewEnd = Math.min(duration, b.markerB + margin);
        return viewStart + ((clickX / canvas.width) * (viewEnd - viewStart));
    };

    let activeDrag = null;
    let startClientX = 0, startA = 0, startB = 0;

    const handleDown = (clientX) => {
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!buf) return;
        const clickTime = getCanvasTimeFromX(clientX);
        const tol = 1.0;

        startClientX = clientX;
        startA = b.markerA;
        startB = b.markerB;

        if (Math.abs(clickTime - b.markerA) <= tol) {
            activeDrag = 'A';
        } else if (Math.abs(clickTime - b.markerB) <= tol) {
            activeDrag = 'B';
        } else if (clickTime > b.markerA && clickTime < b.markerB) {
            activeDrag = 'center';
        }
    };

    const handleMove = (clientX, isTouch = false) => {
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!activeDrag || !buf) return;
        const duration = buf.duration;

        const blockSpan = Math.max(0.5, startB - startA);
        const margin = blockSpan * 0.2;
        const viewStart = Math.max(0, startA - margin);
        const viewEnd = Math.min(duration, startB + margin);
        const viewSpan = viewEnd - viewStart;

        const rect = canvas.getBoundingClientRect();
        const cssWidth = rect.width || 300;

        const sensitivity = isTouch ? 0.40 : 1.0;
        const deltaPixels = clientX - startClientX;
        const deltaSec = (deltaPixels / cssWidth) * viewSpan * sensitivity;

        if (activeDrag === 'A') {
            b.markerA = Math.max(0, Math.min(startB - 0.2, startA + deltaSec));
        } else if (activeDrag === 'B') {
            b.markerB = Math.max(startA + 0.2, Math.min(duration, startB + deltaSec));
        } else if (activeDrag === 'center') {
            const span = startB - startA;
            b.markerA = Math.max(0, Math.min(duration - span, startA + deltaSec));
            b.markerB = b.markerA + span;
        }

        const inputA = document.getElementById(`batchMarkerAInput_${b.id}`);
        const inputB = document.getElementById(`batchMarkerBInput_${b.id}`);
        const dispDur = document.getElementById(`batchDur_${b.id}`);

        if (inputA && document.activeElement !== inputA) inputA.value = b.markerA.toFixed(1);
        if (inputB && document.activeElement !== inputB) inputB.value = b.markerB.toFixed(1);
        if (dispDur) dispDur.innerText = `${(b.markerB - b.markerA).toFixed(1)}s`;

        window.drawBatchRowCanvas(b);
    };

    const handleUp = () => {
        if (activeDrag) {
            activeDrag = null;
            window.runBatchInferenceForBlock(b);
        }
    };

    canvas.addEventListener('mousedown', (e) => handleDown(e.clientX));
    canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, false));
    canvas.addEventListener('mouseup', handleUp);
    canvas.addEventListener('mouseleave', handleUp);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
            if (e.cancelable) e.preventDefault();
            handleDown(e.touches[0].clientX);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (activeDrag) {
            if (e.cancelable) e.preventDefault();
        }
        if (e.touches && e.touches[0]) handleMove(e.touches[0].clientX, true);
    }, { passive: false });

    canvas.addEventListener('touchend', handleUp);
};

window.playBatchBlock = function(blockId) {
    const blocks = window.aiTrainingState.batchBlocks || [];
    const b = blocks.find(x => x.id === blockId);
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!b || !buf) return;

    const duration = Math.max(0.2, b.markerB - b.markerA);
    const rate = window.aiTrainingState.playbackRate || 1.0;

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (audioCtx.state === 'suspended') audioCtx.resume();

    window.stopCurrentAiAudio();

    window.aiTrainingState.currentSourceNode = audioCtx.createBufferSource();
    window.aiTrainingState.currentSourceNode.buffer = buf;
    window.aiTrainingState.currentSourceNode.playbackRate.value = rate;
    window.aiTrainingState.currentSourceNode.connect(audioCtx.destination);
    window.aiTrainingState.currentSourceNode.start(0, b.markerA, duration / rate);
};

window.copyBatchAiToUser = function(blockId) {
    const aiInput = document.getElementById(`batchAiText_${blockId}`);
    const userInput = document.getElementById(`batchUserText_${blockId}`);
    if (aiInput && userInput && aiInput.value) {
        userInput.value = aiInput.value;
        const blocks = window.aiTrainingState.batchBlocks || [];
        const b = blocks.find(x => x.id === blockId);
        if (b) b.userText = aiInput.value;
        if (typeof showToast === 'function') showToast(`✨ Copiato testo suggerito nel Blocco #${blockId}`);
    }
};

window.runBatchInferenceForBlock = async function(b) {
    const buf = window.aiTrainingState.currentAudioBuffer;
    if (!buf || !b) return;

    const aiInput = document.getElementById(`batchAiText_${b.id}`);
    if (aiInput) aiInput.value = "⚡ Analisi...";

    try {
        const duration = Math.max(0.2, b.markerB - b.markerA);
        const audio16k = await resampleAudioBufferTo16k(buf, b.markerA, duration);

        let rawResult = "";
        if (window.aiTrainingState.ortSession) {
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

            const probsData = results.log_probs.data;
            const dims = results.log_probs.dims;
            let T = dims && dims.length === 3 ? (dims[0] === 1 ? dims[1] : dims[0]) : (dims ? dims[0] : 0);
            let C = dims && dims.length === 3 ? dims[2] : (dims ? dims[1] : AI_VOCAB.length);

            let lastIdx = -1, blankCount = 0;
            for (let t = 0; t < T; t++) {
                let maxVal = -Infinity, maxIdx = 0;
                for (let c = 0; c < C; c++) {
                    const val = probsData[t * C + c];
                    if (val > maxVal) { maxVal = val; maxIdx = c; }
                }
                if (maxIdx === 0) {
                    blankCount++;
                    if (blankCount >= 4 && rawResult.length > 0 && !rawResult.endsWith(' ')) rawResult += ' ';
                } else {
                    blankCount = 0;
                    if (maxIdx !== lastIdx) {
                        const char = AI_VOCAB[maxIdx] || '';
                        if (char !== '<BLANK>' && char !== '') rawResult += char;
                    }
                }
                lastIdx = maxIdx;
            }
        }

        const dspResult = decodeMorseDSP(audio16k, 16000);
        const text = rawResult.trim() || dspResult.trim();
        const cleanText = text.replace(/[*():;=.,\s]+$/g, "").replace(/^[*():;=.,\s]+/g, "").trim();

        b.aiText = cleanText || "NESSUN SEGNALE";

        if (typeof window.cleanAndInterpretMorseText === 'function' && cleanText) {
            b.aiText = window.cleanAndInterpretMorseText(cleanText);
        }

        if (aiInput) aiInput.value = b.aiText;
    } catch(e) {
        console.warn(`Batch Inference Error for block #${b.id}:`, e);
        if (aiInput) aiInput.value = "ERRORE ANALISI";
    }
};

window.runBatchInferenceAll = async function() {
    const blocks = window.aiTrainingState.batchBlocks || [];
    for (let b of blocks) {
        await window.runBatchInferenceForBlock(b);
    }
};

window.sendBatchBlockToCloud = function(blockId) {
    const blocks = window.aiTrainingState.batchBlocks || [];
    const b = blocks.find(x => x.id === blockId);
    if (!b) return;

    const userInput = document.getElementById(`batchUserText_${blockId}`);
    const userText = (userInput ? userInput.value : b.userText || "").trim();

    if (!userText) {
        if (typeof showToast === 'function') showToast(`⚠️ Inserisci la trascrizione corretta per il Blocco #${blockId} prima di inviare!`);
        return;
    }

    b.userText = userText;

    const select = document.getElementById('aiQsoSelect');
    const idx = parseInt(select ? select.value : -1);
    const qsoItem = (idx >= 0 && window.aiTrainingState.qsoList[idx]) ? window.aiTrainingState.qsoList[idx] : null;
    const fullQsoSource = qsoItem ? qsoItem.filename : (window.aiTrainingState.currentLocalFileName || "QSO_Clip");

    const fmt = (sec) => {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    };

    const timePos = `${fmt(b.markerA)} - ${fmt(b.markerB)}`;

    const pair = {
        id: b.id,
        filename: fullQsoSource,
        timePos: timePos,
        aiPrediction: b.aiText || "",
        userCorrection: userText
    };

    window.syncPairToGoogleCloudSheet(pair);

    b.isSent = true;

    const sendBtn = document.getElementById(`batchSendBtn_${blockId}`);
    if (sendBtn) {
        sendBtn.className = "action-btn-small btn-danger";
        sendBtn.style.background = "#d32f2f";
        sendBtn.style.borderColor = "#ff5252";
        sendBtn.innerHTML = `🔴 INVIATO (#${b.id})`;
    }

    const rowDiv = document.getElementById(`batchRow_${blockId}`);
    if (rowDiv) rowDiv.style.borderColor = "#d32f2f";

    window.drawBatchRowCanvas(b);

    if (typeof showToast === 'function') showToast(`🔴 Blocco #${blockId} inviato e sincronizzato sul Foglio ADDESTRA!`);
};

window.changeAiModel = async function() {
    const sel = document.getElementById('aiModelSelect');
    if (!sel || !sel.value) return;

    if (sel.value === '__ADD_CUSTOM__') {
        const newName = prompt("Inserisci il nome del file .onnx caricato nella cartella 'addestra/' (es. morse_model_v2.onnx):");
        if (newName && newName.trim().length > 0) {
            let cleanName = newName.trim();
            if (!cleanName.startsWith('addestra/')) cleanName = 'addestra/' + cleanName;
            if (!cleanName.endsWith('.onnx')) cleanName += '.onnx';

            let customList = [];
            try {
                customList = JSON.parse(localStorage.getItem('cwgame_custom_onnx_models') || '[]');
            } catch(e){}
            if (!customList.includes(cleanName)) {
                customList.push(cleanName);
                localStorage.setItem('cwgame_custom_onnx_models', JSON.stringify(customList));
            }

            await window.scanAddestraFolderModels();
            sel.value = cleanName;
            window.changeAiModel();
            return;
        } else {
            sel.selectedIndex = 0;
            return;
        }
    }

    const modelPath = sel.value;
    if (typeof showToast === 'function') showToast(`⏳ Caricamento modello IA (${modelPath.split('/').pop()})...`);

    try {
        const modelUrl = new URL(modelPath, window.location.href).href;
        console.log("Loading selected ONNX Model from:", modelUrl);
        window.aiTrainingState.ortSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm', 'webgl'] });
        console.log("ONNX Model switched successfully to:", modelPath);
        if (typeof showToast === 'function') showToast(`🧠 Modello IA attivo: ${modelPath.split('/').pop()}`);
        if (typeof window.runInferenceOnSegment === 'function') {
            window.runInferenceOnSegment();
        }
    } catch (e) {
        console.warn("Selected ONNX Model load warning:", e);
        if (typeof showToast === 'function') showToast(`⚠️ Modello ${modelPath.split('/').pop()} non presente in 'addestra/', uso DSP.`);
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

    const localStoredUrl = localStorage.getItem('cwgame_addestra_url');
    if (localStoredUrl && localStoredUrl.startsWith('http')) {
        window.aiActiveAddestraUrl = localStoredUrl;
        if (!window.aiAllFirebaseUrls) window.aiAllFirebaseUrls = [localStoredUrl];
    }

    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            const [snapAdd1, snapAdd2, snapVal, snapQso1, snapQso2] = await Promise.all([
                firebase.database().ref('appConfig/addestra_script_url').once('value').catch(() => null),
                firebase.database().ref('config/addestra_script_url').once('value').catch(() => null),
                firebase.database().ref('appConfig/validation_server_url').once('value').catch(() => null),
                firebase.database().ref('appConfig/qso_audio_server_url').once('value').catch(() => null),
                firebase.database().ref('config/qso_audio_server_url').once('value').catch(() => null)
            ]);

            const foundUrls = [
                snapAdd1 ? snapAdd1.val() : null,
                snapAdd2 ? snapAdd2.val() : null,
                snapVal ? snapVal.val() : null,
                snapQso1 ? snapQso1.val() : null,
                snapQso2 ? snapQso2.val() : null
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

    let startClientX = 0;

    const handlePointerDown = (clientX) => {
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!buf) return;
        const duration = buf.duration;
        const clickTime = getCanvasTimeFromX(clientX);
        const visibleDuration = duration / (window.aiTrainingState.timelineZoomFactor || 1.0);

        let markerA = window.aiTrainingState.markerA !== undefined ? window.aiTrainingState.markerA : 0;
        let markerB = window.aiTrainingState.markerB !== undefined ? window.aiTrainingState.markerB : Math.min(duration, 10);
        const tol = Math.max(0.4, visibleDuration * 0.08);

        startClientX = clientX;
        window.aiTrainingState.dragStartMarkerA = markerA;
        window.aiTrainingState.dragStartMarkerB = markerB;

        if (Math.abs(clickTime - markerA) <= tol) {
            window.aiTrainingState.activeDraggingMarker = 'A';
        } else if (Math.abs(clickTime - markerB) <= tol) {
            window.aiTrainingState.activeDraggingMarker = 'B';
        } else if (clickTime > markerA && clickTime < markerB) {
            window.aiTrainingState.activeDraggingMarker = 'center';
        } else {
            const span = Math.max(0.5, markerB - markerA);
            window.aiTrainingState.markerA = Math.max(0, Math.min(duration - span, clickTime - (span / 2)));
            window.aiTrainingState.markerB = Math.min(duration, window.aiTrainingState.markerA + span);
            window.aiTrainingState.activeDraggingMarker = 'center';
            window.aiTrainingState.dragStartMarkerA = window.aiTrainingState.markerA;
            window.aiTrainingState.dragStartMarkerB = window.aiTrainingState.markerB;
        }
        window.updateMasterTimelineDisplay();
    };

    const handlePointerMove = (clientX, isTouch = false) => {
        const mode = window.aiTrainingState.activeDraggingMarker;
        const buf = window.aiTrainingState.currentAudioBuffer;
        if (!mode || !buf) return;

        const duration = buf.duration;
        const visibleDuration = duration / (window.aiTrainingState.timelineZoomFactor || 1.0);
        const rect = canvas.getBoundingClientRect();
        const cssWidth = rect.width || 300;

        const sensitivity = isTouch ? 0.40 : 1.0;
        const deltaPixels = clientX - startClientX;
        const deltaSec = (deltaPixels / cssWidth) * visibleDuration * sensitivity;

        const startA = window.aiTrainingState.dragStartMarkerA;
        const startB = window.aiTrainingState.dragStartMarkerB;

        if (mode === 'A') {
            window.aiTrainingState.markerA = Math.max(0, Math.min(startB - 0.2, startA + deltaSec));
        } else if (mode === 'B') {
            window.aiTrainingState.markerB = Math.max(startA + 0.2, Math.min(duration, startB + deltaSec));
        } else if (mode === 'center') {
            const span = startB - startA;
            window.aiTrainingState.markerA = Math.max(0, Math.min(duration - span, startA + deltaSec));
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
    canvas.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, false));
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerUp);

    canvas.addEventListener('wheel', (e) => {
        if (!window.aiTrainingState.currentAudioBuffer) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.3 : 0.75;
        window.zoomAiAudioTimeline(factor);
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
            if (e.cancelable) e.preventDefault();
            handlePointerDown(e.touches[0].clientX);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (window.aiTrainingState.activeDraggingMarker) {
            if (e.cancelable) e.preventDefault();
        }
        if (e.touches && e.touches[0]) handlePointerMove(e.touches[0].clientX, true);
    }, { passive: false });

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

    // Aggiornamento etichette ed input HTML manuali
    const inputA = document.getElementById('aiMarkerAInput');
    const inputB = document.getElementById('aiMarkerBInput');
    const dispDur = document.getElementById('markerDurationDisplay');

    if (inputA && document.activeElement !== inputA) inputA.value = markerA.toFixed(1);
    if (inputB && document.activeElement !== inputB) inputB.value = markerB.toFixed(1);
    if (dispDur) dispDur.innerText = `${(markerB - markerA).toFixed(1)}s`;
};

window.updateMarkersFromManualInput = function() {
    const inputA = document.getElementById('aiMarkerAInput');
    const inputB = document.getElementById('aiMarkerBInput');
    const buf = window.aiTrainingState.currentAudioBuffer;

    if (!inputA || !inputB) return;

    let valA = parseFloat(inputA.value);
    let valB = parseFloat(inputB.value);

    if (isNaN(valA) || valA < 0) valA = 0;
    if (buf && valA > buf.duration) valA = Math.max(0, buf.duration - 0.5);

    if (isNaN(valB) || valB <= valA) valB = valA + 10.0;
    if (buf && valB > buf.duration) valB = buf.duration;

    window.aiTrainingState.markerA = valA;
    window.aiTrainingState.markerB = valB;
    window.aiTrainingState.currentWindowStart = valA;
    window.aiTrainingState.currentWindowDuration = Math.max(0.2, valB - valA);

    window.updateMasterTimelineDisplay();

    if (window.aiTrainingState.manualInputTimeout) clearTimeout(window.aiTrainingState.manualInputTimeout);
    window.aiTrainingState.manualInputTimeout = setTimeout(() => {
        if (typeof window.runInferenceOnSegment === 'function') {
            window.runInferenceOnSegment();
        }
    }, 250);
};

window.updateBatchBlockMarkersFromInput = function(blockId) {
    const blocks = window.aiTrainingState.batchBlocks || [];
    const b = blocks.find(x => x.id === blockId);
    if (!b) return;

    const inputA = document.getElementById(`batchMarkerAInput_${blockId}`);
    const inputB = document.getElementById(`batchMarkerBInput_${blockId}`);
    const buf = window.aiTrainingState.currentAudioBuffer;

    if (!inputA || !inputB) return;

    let valA = parseFloat(inputA.value);
    let valB = parseFloat(inputB.value);

    if (isNaN(valA) || valA < 0) valA = 0;
    if (buf && valA > buf.duration) valA = Math.max(0, buf.duration - 0.5);

    if (isNaN(valB) || valB <= valA) valB = valA + 5.0;
    if (buf && valB > buf.duration) valB = buf.duration;

    b.markerA = valA;
    b.markerB = valB;

    const dispDur = document.getElementById(`batchDur_${blockId}`);
    if (dispDur) dispDur.innerText = `${(b.markerB - b.markerA).toFixed(1)}s`;

    window.drawBatchRowCanvas(b);

    if (window.aiTrainingState.batchManualTimeout) clearTimeout(window.aiTrainingState.batchManualTimeout);
    window.aiTrainingState.batchManualTimeout = setTimeout(() => {
        if (typeof window.runBatchInferenceForBlock === 'function') {
            window.runBatchInferenceForBlock(b);
        }
    }, 250);
};

window.zoomAiAudioTimeline = function(factor) {
    const state = window.aiTrainingState;
    const oldZoom = state.timelineZoomFactor || 1.0;
    const newZoom = Math.max(0.5, Math.min(500, oldZoom * factor));

    const buf = state.currentAudioBuffer;
    if (buf) {
        // Mantiene la posizione centrale del loop A-B durante lo zoom ad alta risoluzione
        const duration = buf.duration;
        const centerTime = (state.markerA !== undefined && state.markerB !== undefined)
            ? (state.markerA + state.markerB) / 2
            : (state.timelineScrollOffset || 0) + ((duration / oldZoom) / 2);

        const newVisibleDuration = duration / newZoom;
        state.timelineScrollOffset = Math.max(0, Math.min(duration - newVisibleDuration, centerTime - (newVisibleDuration / 2)));
    }

    state.timelineZoomFactor = newZoom;
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
            if (p.durationFrames >= ditFrames * 3.0) {
                if (morseCode) {
                    const char = reverseMap[morseCode] || "";
                    if (char) decodedText += char;
                    morseCode = "";
                }
                if (decodedText.length > 0 && !decodedText.endsWith(" ")) {
                    decodedText += " ";
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

                // CTC greedy decode con analisi dinamica delle dimensioni del tensore ONNX [batch, time_steps, classes]
                const probsData = results.log_probs.data;
                const dims = results.log_probs.dims;

                let T = 0, C = AI_VOCAB.length;
                let isBatchFirst = true;

                if (dims && dims.length === 3) {
                    if (dims[0] === 1) {
                        // Shape: [1, T, C] (Batch first)
                        T = dims[1];
                        C = dims[2];
                        isBatchFirst = true;
                    } else {
                        // Shape: [T, 1, C] (Time first)
                        T = dims[0];
                        C = dims[2];
                        isBatchFirst = false;
                    }
                } else if (dims && dims.length === 2) {
                    // Shape: [T, C]
                    T = dims[0];
                    C = dims[1];
                }

                console.log(`🤖 CTC Decoding: T=${T} time steps, C=${C} classes, dims=[${dims ? dims.join(',') : 'unknown'}]`);

                let lastIdx = -1;
                let blankFramesCount = 0;

                for (let t = 0; t < T; t++) {
                    let maxVal = -Infinity, maxIdx = 0;
                    const baseOffset = isBatchFirst ? (t * C) : (t * 1 * C);
                    for (let c = 0; c < C; c++) {
                        const val = probsData[baseOffset + c];
                        if (val > maxVal) {
                            maxVal = val;
                            maxIdx = c;
                        }
                    }

                    if (maxIdx === 0) {
                        // Token <BLANK> (silenzio/pausa tra i caratteri/parole)
                        blankFramesCount++;
                        if (blankFramesCount >= 4) {
                            if (aiResult.length > 0 && !aiResult.endsWith(' ')) {
                                aiResult += ' ';
                            }
                        }
                    } else {
                        blankFramesCount = 0;
                        if (maxIdx !== lastIdx) {
                            const char = AI_VOCAB[maxIdx] || '';
                            if (char === ' ') {
                                if (aiResult.length > 0 && !aiResult.endsWith(' ')) {
                                    aiResult += ' ';
                                }
                            } else if (char !== '<BLANK>' && char !== '') {
                                if (char.startsWith('<') && char.endsWith('>')) {
                                    // Prosegni radio ufficiali (es. <AR>, <BT>, <SK>, <KN>)
                                    aiResult += ' ' + char + ' ';
                                } else if (/[A-Z0-9\/\-\.=\?a-z]/.test(char)) {
                                    aiResult += char;
                                }
                            }
                        }
                    }
                    lastIdx = maxIdx;
                }
                aiResult = aiResult.replace(/\s+/g, ' ').trim();
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

        if (finalOutput) {
            if (typeof window.loadRadioDictionaries === 'function' && !window.aiTrainingState.dictionaryLoaded) {
                await window.loadRadioDictionaries();
            }
        }

        // Ricostruzione ed interpretazione del senso con il dizionario esteso ed il pulitore di artefatti Morse
        const reconstructedText = finalOutput ? window.cleanAndInterpretMorseText(finalOutput) : "";
        const dictBox = document.getElementById('aiDictionaryCorrectedText');
        if (dictBox) dictBox.value = reconstructedText || "NESSUN TESTO RICOSTRUITO";

    } catch (e) {
        console.error("AI Analysis Error:", e);
        if (aiBox) aiBox.value = "ERRORE ANALISI AUDIO";
    }
};

window.changeAiDictLanguage = function() {
    const sel = document.getElementById('aiDictLangSelect');
    if (!sel) return;
    const lang = sel.value || 'it';
    window.aiTrainingState.dictLanguage = lang;
    localStorage.setItem('cwgame_dict_lang', lang);

    if (typeof showToast === 'function') {
        const labels = { it: '🇮🇹 Italiano', en: '🇬🇧 Inglese / CW', all: '🌐 Misto (IT + EN)' };
        showToast(`📖 Dizionario impostato su: ${labels[lang] || lang}`);
    }

    if (typeof window.runInferenceOnSegment === 'function') {
        window.runInferenceOnSegment();
    }
};

window.loadRadioDictionaries = async function() {
    if (window.aiTrainingState.dictionaryLoaded) return;

    console.log("📖 Loading radio dictionaries (parole.txt, parole2.txt, words.txt)...");
    const italianSet = new Set(ITALIAN_RADIO_DICTIONARY);
    const englishSet = new Set(ITALIAN_RADIO_DICTIONARY);
    const combinedSet = new Set(ITALIAN_RADIO_DICTIONARY);

    const loadFile = async (filename, targetSet) => {
        try {
            const resp = await fetch(filename);
            if (resp.ok) {
                const text = await resp.text();
                const words = text.split(/[\r\n,\s]+/);
                for (let w of words) {
                    const clean = w.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (clean.length >= 2) {
                        targetSet.add(clean);
                        combinedSet.add(clean);
                    }
                }
            }
        } catch(e) {
            console.warn("Dictionary fetch warning for", filename, ":", e);
        }
    };

    await Promise.all([
        loadFile('parole.txt', italianSet),
        loadFile('parole2.txt', italianSet),
        loadFile('words.txt', englishSet)
    ]);

    window.aiTrainingState.italianDictSet = italianSet;
    window.aiTrainingState.italianDictList = Array.from(italianSet);

    window.aiTrainingState.englishDictSet = englishSet;
    window.aiTrainingState.englishDictList = Array.from(englishSet);

    window.aiTrainingState.combinedDictionarySet = combinedSet;
    window.aiTrainingState.combinedDictionaryList = Array.from(combinedSet);

    window.aiTrainingState.dictionaryLoaded = true;
    console.log("📖 Dictionaries loaded: IT =", italianSet.size, "EN =", englishSet.size, "Total =", combinedSet.size);

    const savedLang = localStorage.getItem('cwgame_dict_lang') || 'it';
    window.aiTrainingState.dictLanguage = savedLang;
    const sel = document.getElementById('aiDictLangSelect');
    if (sel) sel.value = savedLang;
};

window.splitAttachedWords = function(token, dictSet, dictList) {
    if (!token || token.length < 4) return [token];

    const cleanToken = token.replace(/[^A-Z0-9]/g, '');

    // Mantiene intatti nominativi radioamatoriali reali (es. IZ1XXX, K1ABC)
    if (/^[A-Z0-9]{3,7}$/.test(cleanToken) && /[A-Z]/.test(cleanToken) && /\d/.test(cleanToken) && cleanToken.length <= 6) {
        return [token];
    }
    if (/^\d+$/.test(cleanToken)) return [token];

    // 1. SEPARAZIONE NUMERI/CIFRE EMBEDDED DENTRO LE LETTERE (es. DOERGLI80TTORA -> DOERGLI + 80 + TTORA)
    if (/\d+/.test(cleanToken) && /[A-Z]+/.test(cleanToken)) {
        const parts = cleanToken.replace(/(\d+)/g, ' $1 ').trim().split(/\s+/);
        let subRes = [];
        for (let p of parts) {
            if (/^\d+$/.test(p)) {
                subRes.push(p);
            } else if (p.length >= 4) {
                subRes.push(...window.splitAttachedWords(p, dictSet, dictList));
            } else if (p.length > 0) {
                subRes.push(p);
            }
        }
        return subRes;
    }

    // Se e gia una parola intera valida nel dizionario
    if (dictSet.has(cleanToken)) return [token];

    const len = cleanToken.length;
    const list = dictList || Array.from(dictSet);

    const findMatchingWord = (sub) => {
        if (sub.length < 3) return null;
        if (dictSet.has(sub)) return sub;

        if (sub.length >= 3) {
            const maxThreshold = sub.length <= 5 ? 2 : (sub.length <= 8 ? 3 : 4);
            for (let idx = 0; idx < list.length; idx++) {
                const dictWord = list[idx];
                const dLen = dictWord.length;
                if (Math.abs(dLen - sub.length) <= maxThreshold) {
                    const dist = (typeof window.getLevenshteinDistance === 'function')
                        ? window.getLevenshteinDistance(sub, dictWord)
                        : Math.abs(sub.length - dictWord.length);
                    if (dist <= maxThreshold) return dictWord;
                }
            }
        }
        return null;
    };

    const extractedWords = [];
    let i = 0;
    let unmatchedChunk = "";

    // Scansione ingorda con CONSERVAZIONE INTEGRALE di tutti i caratteri (Zero Perdita)
    while (i < len) {
        let matchFound = false;

        for (let j = Math.min(len, i + 14); j >= i + 3; j--) {
            const sub = cleanToken.substring(i, j);
            const matched = findMatchingWord(sub);
            if (matched) {
                if (unmatchedChunk.length > 0) {
                    extractedWords.push(unmatchedChunk);
                    unmatchedChunk = "";
                }
                extractedWords.push(matched);
                i = j; // avanza al punto in cui e finita la parola trovata!
                matchFound = true;
                break;
            }
        }

        if (!matchFound) {
            unmatchedChunk += cleanToken[i];
            i++;
        }
    }

    if (unmatchedChunk.length > 0) {
        extractedWords.push(unmatchedChunk);
    }

    if (extractedWords.length > 0) {
        return extractedWords;
    }

    return [token];
};

window.correctTextWithFullDictionary = function(text) {
    if (!text || text.trim().length === 0) return "";

    const lang = window.aiTrainingState.dictLanguage || localStorage.getItem('cwgame_dict_lang') || 'it';

    let dictSet = window.aiTrainingState.combinedDictionarySet || new Set(ITALIAN_RADIO_DICTIONARY);
    let dictList = window.aiTrainingState.combinedDictionaryList || ITALIAN_RADIO_DICTIONARY;

    if (lang === 'it' && window.aiTrainingState.italianDictSet) {
        dictSet = window.aiTrainingState.italianDictSet;
        dictList = window.aiTrainingState.italianDictList;
    } else if (lang === 'en' && window.aiTrainingState.englishDictSet) {
        dictSet = window.aiTrainingState.englishDictSet;
        dictList = window.aiTrainingState.englishDictList;
    }

    let tokens = text.trim().toUpperCase().split(/\s+/).map(t => t.replace(/[^A-Z0-9\/\-]/g, '')).filter(t => t.length > 0);

    // =========================================================================
    // PASSO 1: UNIONE A 3 FRAMMENTI (es. "COL" + "LE" + "ZIONE" -> "COLLEZIONE")
    // =========================================================================
    let pass1Tokens = [];
    let i = 0;
    while (i < tokens.length) {
        if (i + 2 < tokens.length) {
            const combined3 = tokens[i] + tokens[i + 1] + tokens[i + 2];
            if (combined3.length >= 3 && dictSet.has(combined3)) {
                pass1Tokens.push(combined3);
                i += 3; // salta i 3 frammenti uniti
                continue;
            }
        }
        pass1Tokens.push(tokens[i]);
        i++;
    }

    // =========================================================================
    // PASSO 2: UNIONE A 2 FRAMMENTI (es. "RI" + "CORDO" -> "RICORDO")
    // =========================================================================
    let pass2Tokens = [];
    let j = 0;
    while (j < pass1Tokens.length) {
        if (j + 1 < pass1Tokens.length) {
            const combined2 = pass1Tokens[j] + pass1Tokens[j + 1];
            if (combined2.length >= 3 && dictSet.has(combined2)) {
                pass2Tokens.push(combined2);
                j += 2; // salta i 2 frammenti uniti
                continue;
            }
        }
        pass2Tokens.push(pass1Tokens[j]);
        j++;
    }

    // =========================================================================
    // SEPARAZIONE PAROLE ATTACCATE SENZA SPAZI E CON NUMERI EMBEDDED (Fuzzy Word Break)
    // es. "DOERGLI80TTORAHOAGGIUNTOVNCHEDUE" -> "PER", "GLI", "80", "ORA", "HO", "AGGIUNTO", "ANCHE", "DUE"
    // =========================================================================
    let segmentedTokens = [];
    for (let tok of pass2Tokens) {
        if (tok.length >= 4 && !dictSet.has(tok) && !(/^[A-Z0-9]{3,7}$/.test(tok) && /[A-Z]/.test(tok) && /\d/.test(tok))) {
            const splits = window.splitAttachedWords(tok, dictSet, dictList);
            segmentedTokens.push(...splits);
        } else {
            segmentedTokens.push(tok);
        }
    }

    // =========================================================================
    // PASSO 3: CORREZIONE SINGOLA (es. "TKUEL" -> "QUEL")
    // =========================================================================
    const finalWords = segmentedTokens.map(word => {
        const cleanWord = word.replace(/[^A-Z0-9\/\-]/g, '');
        if (cleanWord.length <= 1) return word;

        // Mantiene intatti nominativi radioamatoriali (es. IZ1XXX, K1ABC) e numeri
        if (/^[A-Z0-9]{3,7}$/.test(cleanWord) && /\d/.test(cleanWord)) return word;
        if (/^\d+$/.test(cleanWord)) return word;

        // Mantiene intatta la parola se e gia presente nel dizionario
        if (dictSet.has(cleanWord)) return word;

        let bestMatch = word;
        let minDistance = Infinity;

        const wordLen = cleanWord.length;
        const maxDistThreshold = wordLen <= 5 ? 2 : (wordLen <= 8 ? 3 : 4);

        for (let idx = 0; idx < dictList.length; idx++) {
            const dictWord = dictList[idx];
            const dLen = dictWord.length;

            if (Math.abs(dLen - wordLen) <= maxDistThreshold) {
                const dist = (typeof window.getLevenshteinDistance === 'function')
                    ? window.getLevenshteinDistance(cleanWord, dictWord)
                    : Math.abs(cleanWord.length - dictWord.length);

                if (dist < minDistance && dist <= maxDistThreshold) {
                    minDistance = dist;
                    bestMatch = dictWord;
                    if (dist === 1) break;
                }
            }
        }
        return bestMatch;
    });

    return finalWords.join(" ");
};

window.cleanAndInterpretMorseText = function(text) {
    if (!text || text.trim().length === 0) return "";

    let raw = text.toUpperCase();

    // 1. COLLAPSE RIPETIZIONI DI LETTERE LUNGHE DA RUMORE / NOTA CONTINUA (es. EEEEEEE -> E, TTTTTTT -> T)
    raw = raw.replace(/([A-Z])\1{2,}/g, '$1');

    let initialTokens = raw.split(/\s+/).map(t => t.replace(/[^A-Z0-9\/\-\<\>]/g, '')).filter(t => t.length > 0);

    // 2. RIASSEMBLAGGIO DELLE LETTERE SINGOLE ISOLATE SEPARATE DA SPAZI (es. "C O L A R O V A" -> "COLAROVA")
    let reassembledTokens = [];
    let singleCharBuffer = [];

    for (let i = 0; i < initialTokens.length; i++) {
        const tok = initialTokens[i];
        if (tok.length === 1 && /[A-Z]/.test(tok)) {
            singleCharBuffer.push(tok);
        } else {
            if (singleCharBuffer.length >= 2) {
                reassembledTokens.push(singleCharBuffer.join(''));
                singleCharBuffer = [];
            } else if (singleCharBuffer.length === 1) {
                reassembledTokens.push(singleCharBuffer[0]);
                singleCharBuffer = [];
            }
            reassembledTokens.push(tok);
        }
    }
    if (singleCharBuffer.length >= 2) {
        reassembledTokens.push(singleCharBuffer.join(''));
    } else if (singleCharBuffer.length === 1) {
        reassembledTokens.push(singleCharBuffer[0]);
    }

    let tokens = reassembledTokens;
    let cleanedTokens = [];

    const dictSet = window.aiTrainingState.combinedDictionarySet || new Set(ITALIAN_RADIO_DICTIONARY);
    const validSingleChars = new Set(['A', 'E', 'I', 'O', 'U', 'R', 'K']); // Vocali e comandi CW validi

    // 3. FILTRAGGIO O UNIONE CONSONANTI ISOLATE SENZA SENSO (es. L, T, S, B, D, F, M, P)
    for (let i = 0; i < tokens.length; i++) {
        let tok = tokens[i];
        if (!tok) continue;

        // Se e una consonante singola isolata
        if (tok.length === 1 && !validSingleChars.has(tok)) {
            // Tenta l'unione con la parola successiva se forma una parola valida nel dizionario
            if (i + 1 < tokens.length) {
                const nextTok = tokens[i + 1].replace(/[^A-Z0-9]/g, '');
                const combined = tok + nextTok;
                if (dictSet.has(combined)) {
                    tokens[i + 1] = combined;
                    continue; // Unita con successo alla parola successiva!
                }
            }
            // Scarta la consonante singola isolata rumorosa
            continue;
        }

        cleanedTokens.push(tok);
    }

    // 4. ESEGUE IL PIPELINE A 3 FASI (UNIONE -> SEPARAZIONE -> CORREZIONE LEVENSHTEIN)
    const textToProcess = cleanedTokens.join(" ");
    let reconstructed = window.correctTextWithFullDictionary(textToProcess);

    return reconstructed.replace(/\s+/g, " ").trim();
};

window.correctTextWithRadioDictionary = function(text) {
    return window.cleanAndInterpretMorseText(text);
};

window.applyAiDictionaryCorrection = function() {
    const dictBox = document.getElementById('aiDictionaryCorrectedText');
    const userBox = document.getElementById('aiUserCorrectionText');
    if (dictBox && userBox && dictBox.value && dictBox.value !== "NESSUN TESTO RICOSTRUITO") {
        userBox.value = dictBox.value;
        if (typeof showToast === 'function') showToast("✨ Applicato suggerimento dal dizionario esteso!");
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

window.syncPairToGoogleCloudSheet = async function(pair) {
    if (!pair || !pair.userCorrection) return;

    // Raccoglie tutti i possibili URL di Google Apps Script salvati o presenti in Firebase
    const candidateUrls = [
        window.aiActiveAddestraUrl,
        localStorage.getItem('cwgame_addestra_url'),
        (typeof VALIDATION_SERVER_URL !== 'undefined' ? VALIDATION_SERVER_URL : null),
        "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec",
        window.qsoAudioServerUrl,
        localStorage.getItem('cwgame_qso_audio_url')
    ].filter(u => u && typeof u === 'string' && u.trim().startsWith('http')).map(u => u.trim());

    const uniqueUrls = [...new Set(candidateUrls)];
    const candidateActions = ["save_approved", "save", "save_transcript", "save_pair", "addestra", "approve"];

    const token = window.aiAuthToken || localStorage.getItem('cwgame_ai_auth_token') || "";
    const uid = window.myId || "";

    const trySync = async (urlIdx, actionIdx) => {
        if (urlIdx >= uniqueUrls.length) {
            console.error("❌ Impossibile sincronizzare sul Foglio Google: Tutti gli URL Apps Script e le azioni hanno fallito.");
            if (typeof showToast === 'function') showToast("⚠️ Errore sincronizzazione Cloud. Verificare URL script su Firebase.");
            return;
        }

        const targetUrl = uniqueUrls[urlIdx];
        const act = candidateActions[actionIdx];

        const params = new URLSearchParams({
            action: act,
            filename: pair.filename || "QSO_Clip",
            time_pos: pair.timePos || "00:00 - 00:10",
            transcript: pair.userCorrection || "",
            ai_prediction: pair.aiPrediction || "",
            text: pair.userCorrection || "",
            qso_name: pair.filename || "QSO_Clip"
        });

        if (uid) params.append("uid", uid);
        if (token) params.append("token", token);

        try {
            const resp = await fetch(`${targetUrl}?${params.toString()}`);
            const res = await resp.json();

            if (res && res.status === 'error' && res.message && res.message.includes('Azione non valida')) {
                console.warn(`⚠️ URL '${targetUrl.substring(0, 45)}...' action '${act}' rejected. Proviamo prossima azione/URL...`);
                if (actionIdx + 1 < candidateActions.length) {
                    await trySync(urlIdx, actionIdx + 1);
                } else {
                    await trySync(urlIdx + 1, 0); // Passa al prossimo URL Apps Script!
                }
            } else {
                console.log(`✓ Sincronizzato con successo sul Foglio Google ADDESTRA (url=${targetUrl.substring(0, 40)}..., action=${act}):`, res);
                window.aiActiveAddestraUrl = targetUrl;
                localStorage.setItem('cwgame_addestra_url', targetUrl);
                if (typeof showToast === 'function') {
                    showToast("✅ Sincronizzato con successo sul Cloud ADDESTRA!");
                }
            }
        } catch(err) {
            console.warn(`Tentativo sync fallito per URL ${targetUrl.substring(0, 40)}... (${act}):`, err);
            if (actionIdx + 1 < candidateActions.length) {
                await trySync(urlIdx, actionIdx + 1);
            } else {
                await trySync(urlIdx + 1, 0);
            }
        }
    };

    await trySync(0, 0);
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
