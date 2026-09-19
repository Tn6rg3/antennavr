// APP.JS - INTERFACCIA WEB CON DECODIFICA ON-DEMAND TRATTO A-B, PULSANTE TORNA A TRACCIA INTERA E TOGGLE IA

document.addEventListener('DOMContentLoaded', () => {
    // DOM ELEMENTS - HEADER & STATUS
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const btnToggleAiDecoding = document.getElementById('btnToggleAiDecoding');

    // DOM ELEMENTS - TABS
    const tabBtn1 = document.getElementById('tabBtn1');
    const tabBtn2 = document.getElementById('tabBtn2');
    const tabBtn3 = document.getElementById('tabBtn3');
    const tabContent1 = document.getElementById('tabContent1');
    const tabContent2 = document.getElementById('tabContent2');
    const tabContent3 = document.getElementById('tabContent3');

    // DOM ELEMENTS - TAB 1 (DECODER & MIC)
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnMic = document.getElementById('btnMic');
    const micBtnText = document.getElementById('micBtnText');

    // DOM ELEMENTS - TAB 2 (FOGLIO1 & CHUNK GENERATOR)
    const foglio1SearchInput = document.getElementById('foglio1SearchInput');
    const foglio1Select = document.getElementById('foglio1Select');
    const btnReloadFoglio1 = document.getElementById('btnReloadFoglio1');
    const btnLoadFoglio1Qso = document.getElementById('btnLoadFoglio1Qso');

    const chunkGeneratorBox = document.getElementById('chunkGeneratorBox');
    const chunkStepSelect = document.getElementById('chunkStepSelect');
    const chunkLimitSelect = document.getElementById('chunkLimitSelect');
    const btnGenerateChunks = document.getElementById('btnGenerateChunks');
    const btnResetFullTrack = document.getElementById('btnResetFullTrack');
    const chunksListContainer = document.getElementById('chunksListContainer');

    // DOM ELEMENTS - REGION / CROPPER CONTROLS
    const fileNameDisplayTab3 = document.getElementById('fileNameDisplayTab3');
    const timeDisplayTab3 = document.getElementById('timeDisplayTab3');
    const btnPlayTab3 = document.getElementById('btnPlayTab3');
    const btnPauseTab3 = document.getElementById('btnPauseTab3');
    const btnStopTab3 = document.getElementById('btnStopTab3');

    const markerAInput = document.getElementById('markerAInput');
    const markerBInput = document.getElementById('markerBInput');
    const btnNudgeALeft = document.getElementById('btnNudgeALeft');
    const btnNudgeARight = document.getElementById('btnNudgeARight');
    const btnNudgeBLeft = document.getElementById('btnNudgeBLeft');
    const btnNudgeBRight = document.getElementById('btnNudgeBRight');

    const btnZoomInWave = document.getElementById('btnZoomInWave');
    const btnZoomOutWave = document.getElementById('btnZoomOutWave');
    const btnZoomRegionAB = document.getElementById('btnZoomRegionAB');

    const btnPlayRegionAB = document.getElementById('btnPlayRegionAB');
    const btnDecodeRegionAB = document.getElementById('btnDecodeRegionAB');
    const decodedTextSingle = document.getElementById('decodedTextSingle');
    const targetTranscriptInput = document.getElementById('targetTranscriptInput');
    const btnSaveToAddestra = document.getElementById('btnSaveToAddestra');

    // DOM ELEMENTS - TAB 3 (ADDESTRA DATASET TABLE)
    const btnSyncAddestra = document.getElementById('btnSyncAddestra');
    const addestraTableBody = document.getElementById('addestraTableBody');

    // DOM ELEMENTS - COMMON AUDIO PLAYER & VISUALIZERS
    const audioSection = document.getElementById('audioSection');
    const audioPlayer = document.getElementById('audioPlayer');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    const btnPlay = document.getElementById('btnPlay');
    const btnPause = document.getElementById('btnPause');
    const btnStop = document.getElementById('btnStop');

    const resultCard = document.getElementById('resultCard');
    const decodedTextBox = document.getElementById('decodedTextBox');
    const btnClearBtn = document.getElementById('btnClearBtn');
    const copyBtn = document.getElementById('copyBtn');

    const visualizerCard = document.getElementById('visualizerCard');
    const btnView3s = document.getElementById('btnView3s');
    const btnViewFull = document.getElementById('btnViewFull');
    const contrastSlider = document.getElementById('contrastSlider');
    const contrastVal = document.getElementById('contrastVal');
    const colorPaletteSelect = document.getElementById('colorPaletteSelect');

    const waveformCanvas = document.getElementById('waveformCanvas');
    const spectrogramCanvas = document.getElementById('spectrogramCanvas');

    const playheads = [
        document.getElementById('playhead1'),
        document.getElementById('playhead2')
    ];

    // STATE VARIABLES
    let currentData = null;
    let currentLoadedQsoFilename = "";
    let foglio1List = [];
    let addestraList = [];
    let audioChunkList = [];
    let visibleChunksCount = 10;
    let currentPlayingChunkIndex = -1;
    let is3sMode = true;
    let isZoomedABMode = false;
    let waveZoomScale = 1.0;
    let contrastGamma = 2.2;
    let selectedPalette = 'cyber';
    let animationFrameId = null;
    let currentEditingUid = null;
    let isAiDecodingEnabled = true;

    // MARKER DRAGGING STATE
    let isDraggingMarkerA = false;
    let isDraggingMarkerB = false;

    // MICROPHONE LIVE WEBAUDIO STATE
    let isMicRecording = false;
    let micAudioContext = null;
    let micScriptProcessor = null;
    let micStream = null;
    let micPcmSamples = [];
    let micDecodeTimer = null;
    let isDecodingBusy = false;
    let liveAccumulatedText = "";

    function updateStatus(state, text) {
        if (statusText) statusText.textContent = text;
        if (statusPill) statusPill.className = `status-pill ${state}`;
    }

    async function safePlayAudio(audioElement) {
        try {
            if (audioElement && audioElement.paused) {
                await audioElement.play();
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.warn("Audio Play Note:", e);
            }
        }
    }

    // TOGGLE AI DECODING GENERAL BUTTON
    if (btnToggleAiDecoding) {
        btnToggleAiDecoding.addEventListener('click', () => {
            isAiDecodingEnabled = !isAiDecodingEnabled;
            if (isAiDecodingEnabled) {
                btnToggleAiDecoding.textContent = '⚡ Decodifica IA: ATTIVA';
                btnToggleAiDecoding.style.background = '#2ea043';
                btnToggleAiDecoding.style.borderColor = '#2ea043';
            } else {
                btnToggleAiDecoding.textContent = '⏸️ Decodifica IA: DISATTIVA';
                btnToggleAiDecoding.style.background = '#8e9bb0';
                btnToggleAiDecoding.style.borderColor = '#8e9bb0';
            }
            alert(`Decodifica IA generale ${isAiDecodingEnabled ? 'ATTIVATA' : 'DISATTIVATA'}`);
        });
    }

    // NAVIGATION TABS SWITCHING
    tabBtn1.addEventListener('click', () => switchTab(1));
    tabBtn2.addEventListener('click', () => switchTab(2));
    tabBtn3.addEventListener('click', () => switchTab(3));

    function switchTab(tabNum) {
        [tabBtn1, tabBtn2, tabBtn3].forEach((b, i) => b.classList.toggle('active', i + 1 === tabNum));
        [tabContent1, tabContent2, tabContent3].forEach((c, i) => c.classList.toggle('active', i + 1 === tabNum));

        const activeTab = document.getElementById(`tabContent${tabNum}`);
        if (activeTab) {
            if (tabNum === 3) {
                const datasetCard = activeTab.querySelector('.dataset-card');
                if (datasetCard) {
                    datasetCard.insertBefore(visualizerCard, datasetCard.firstChild);
                }
                audioSection.classList.add('hidden');
                resultCard.classList.add('hidden');
                if (addestraList.length === 0) {
                    loadAddestraDataset();
                }
            } else {
                activeTab.appendChild(audioSection);
                activeTab.appendChild(resultCard);
                activeTab.appendChild(visualizerCard);
                if (currentData) {
                    audioSection.classList.remove('hidden');
                    resultCard.classList.remove('hidden');
                }
            }
        }

        if (tabNum === 2 && foglio1List.length === 0) {
            loadFoglio1Catalog();
        }
    }

    // CARICAMENTO E RICERCA MULTIPLA INCOMPLETA CATALOGO FOGLIO1 GOOGLE SHEETS
    btnReloadFoglio1.addEventListener('click', loadFoglio1Catalog);

    if (foglio1SearchInput) {
        foglio1SearchInput.addEventListener('input', e => {
            const query = e.target.value.trim().toLowerCase();
            filterFoglio1Select(query);
        });
    }

    async function loadFoglio1Catalog() {
        foglio1Select.innerHTML = `<option value="">⏳ Caricamento catalogo Foglio1 da Google Drive...</option>`;
        try {
            const response = await fetch('/api/foglio1');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success && data.results) {
                foglio1List = data.results;
                const currentQuery = foglio1SearchInput ? foglio1SearchInput.value.trim().toLowerCase() : "";
                filterFoglio1Select(currentQuery);
                updateStatus('active', `Caricati ${foglio1List.length} QSO da Foglio1`);
            }
        } catch (err) {
            console.error("Foglio1 Fetch Error:", err);
            foglio1Select.innerHTML = `<option value="">❌ Errore caricamento Foglio1: ${err.message}</option>`;
        }
    }

    function filterFoglio1Select(query) {
        if (!foglio1List || foglio1List.length === 0) return;
        foglio1Select.innerHTML = "";

        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

        const filtered = tokens.length > 0
            ? foglio1List.filter(item => {
                const fn = (item.filename || "").toLowerCase();
                return tokens.every(token => fn.includes(token));
            })
            : foglio1List;

        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = `-- ${filtered.length} file trovati per '${query || 'Tutti'}' --`;
        foglio1Select.appendChild(defaultOpt);

        filtered.forEach((item, idx) => {
            const opt = document.createElement('option');
            opt.value = item.id || item.filename;
            opt.textContent = `[#${idx + 1}] ${item.filename}`;
            foglio1Select.appendChild(opt);
        });
    }

    btnLoadFoglio1Qso.addEventListener('click', async () => {
        const selectedId = foglio1Select.value;
        if (!selectedId) {
            alert("Seleziona prima un file QSO dal menu a tendina Foglio1!");
            return;
        }

        const selectedItem = foglio1List.find(i => (i.id === selectedId || i.filename === selectedId));
        const fileId = selectedItem ? (selectedItem.id || selectedItem.filename) : selectedId;
        const filename = selectedItem ? selectedItem.filename : selectedId;

        await loadAndDecodeQsoFile(fileId, filename);
    });

    async function loadAndDecodeQsoFile(fileId, filename) {
        updateStatus('processing', `Caricamento QSO da Google Drive: '${filename}'...`);
        currentLoadedQsoFilename = filename;

        visualizerCard.classList.add('hidden');
        audioSection.classList.add('hidden');
        resultCard.classList.remove('hidden');

        if (fileNameDisplay) fileNameDisplay.textContent = `[Foglio1] ${filename}`;
        if (fileNameDisplayTab3) fileNameDisplayTab3.textContent = `[Foglio1] ${filename}`;
        if (decodedTextBox) decodedTextBox.innerHTML = `<span class="placeholder">⚡ Download audio da Google Drive in corso (Caricamento Istantaneo)...</span>`;
        if (decodedTextSingle) decodedTextSingle.value = "⚡ Download in corso...";

        const streamUrl = `/api/stream_qso_audio?id=${encodeURIComponent(fileId)}`;
        audioPlayer.src = streamUrl;
        audioPlayer.load();

        try {
            const response = await fetch('/api/load_gdrive_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: fileId, filename: filename })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success) {
                currentData = data;
                renderResults(data, false);
                markerAInput.value = "0.0";
                markerBInput.value = Math.min(10.0, data.duration).toFixed(1);

                audioSection.classList.remove('hidden');
                visualizerCard.classList.remove('hidden');
                if (chunkGeneratorBox) chunkGeneratorBox.classList.remove('hidden');

                if (addestraList.length === 0) loadAddestraDataset();

                updateStatus('active', 'QSO Caricato da Google Drive! (Traccia pronta)');
                renderCanvasesAtCurrentTime();
            } else {
                throw new Error(data.error || 'Impossibile scaricare audio');
            }
        } catch (err) {
            console.error("GDrive Load Error:", err);
            alert(`Errore caricamento audio da Google Drive: ${err.message}`);
            updateStatus('error', 'Errore Caricamento Google Drive');
        }
    }

    function findMatchingAddestraSegment(filename, startSec, endSec) {
        if (!addestraList || addestraList.length === 0) return null;

        const fnClean = filename.toLowerCase().replace('[foglio1] ', '').trim();

        for (const item of addestraList) {
            const itemFn = (item.filename || "").toLowerCase().trim();
            if (!itemFn || (!itemFn.includes(fnClean) && !fnClean.includes(itemFn))) continue;

            if (item.time_pos && item.time_pos.includes('-')) {
                const parts = item.time_pos.split('-');
                const itemStart = parseTimeToSec(parts[0].trim());
                const itemEnd = parseTimeToSec(parts[1].trim());

                if (Math.abs(startSec - itemStart) <= 3.0 && Math.abs(endSec - itemEnd) <= 3.0) {
                    return item;
                }
            }
        }
        return null;
    }

    if (btnGenerateChunks) {
        btnGenerateChunks.addEventListener('click', generateAudioChunks);
    }

    if (btnResetFullTrack) {
        btnResetFullTrack.addEventListener('click', () => {
            audioChunkList = [];
            if (chunksListContainer) {
                chunksListContainer.innerHTML = "";
            }
            try { stopChunk(); } catch(e) {}
            isZoomedABMode = false;
            waveZoomScale = 1.0;
            if (currentData) {
                markerAInput.value = "0.0";
                markerBInput.value = currentData.duration.toFixed(1);
            }
            updateStatus('active', 'Visualizzazione traccia intera ripristinata');
            renderCanvasesAtCurrentTime();
            alert("Visualizzazione traccia intera ripristinata!");
        });
    }

    async function generateAudioChunks() {
        if (!currentData || !currentData.duration) {
            alert("Carica prima una traccia QSO da Foglio1!");
            return;
        }

        if (addestraList.length === 0) {
            await loadAddestraDataset();
        }

        const filename = currentLoadedQsoFilename || (fileNameDisplay.textContent.replace('[Foglio1] ', '') || "qso_audio.wav");
        const stepSec = parseFloat(chunkStepSelect.value) || 15.0;
        const limitVal = chunkLimitSelect.value;
        const totalDuration = currentData.duration;

        const fnClean = filename.toLowerCase().replace('[foglio1] ', '').trim();

        const savedSegments = [];
        for (const item of addestraList) {
            const itemFn = (item.filename || "").toLowerCase().trim();
            if (itemFn && (itemFn.includes(fnClean) || fnClean.includes(itemFn))) {
                if (item.time_pos && item.time_pos.includes('-')) {
                    const parts = item.time_pos.split('-');
                    const startT = parseTimeToSec(parts[0].trim());
                    const endT = parseTimeToSec(parts[1].trim());
                    savedSegments.push({
                        startSec: startT,
                        endSec: endT,
                        transcript: item.transcript || "",
                        time_pos: item.time_pos,
                        is_already_present: true
                    });
                }
            }
        }

        savedSegments.sort((a, b) => a.startSec - b.startSec);

        audioChunkList = [];
        let currTime = 0.0;
        let idx = 0;

        if (savedSegments.length > 0) {
            for (const saved of savedSegments) {
                while (currTime < saved.startSec - 0.5) {
                    const nextEnd = Math.min(saved.startSec, currTime + stepSec);
                    if (nextEnd - currTime < 0.5) break;

                    audioChunkList.push({
                        idx: idx++,
                        startSec: currTime,
                        endSec: nextEnd,
                        ai_prediction: "",
                        transcript: "",
                        is_already_present: false,
                        existing_time_pos: null
                    });

                    currTime = nextEnd;
                }

                audioChunkList.push({
                    idx: idx++,
                    startSec: saved.startSec,
                    endSec: saved.endSec,
                    ai_prediction: "",
                    transcript: saved.transcript,
                    is_already_present: true,
                    existing_time_pos: saved.time_pos
                });

                currTime = Math.max(currTime, saved.endSec);
            }

            while (currTime < totalDuration - 0.5) {
                const nextEnd = Math.min(totalDuration, currTime + stepSec);
                if (nextEnd - currTime < 0.5) break;

                audioChunkList.push({
                    idx: idx++,
                    startSec: currTime,
                    endSec: nextEnd,
                    ai_prediction: "",
                    transcript: "",
                    is_already_present: false,
                    existing_time_pos: null
                });

                currTime = nextEnd;
            }

        } else {
            for (let t = 0; t < totalDuration; t += stepSec) {
                const endT = Math.min(totalDuration, t + stepSec);
                if (endT - t < 0.5) break;

                const existingMatch = findMatchingAddestraSegment(filename, t, endT);

                audioChunkList.push({
                    idx: idx++,
                    startSec: t,
                    endSec: endT,
                    ai_prediction: "",
                    transcript: existingMatch ? existingMatch.transcript : "",
                    is_already_present: !!existingMatch,
                    existing_time_pos: existingMatch ? existingMatch.time_pos : null
                });
            }
        }

        visibleChunksCount = limitVal === 'all' ? audioChunkList.length : parseInt(limitVal);
        renderAudioChunksList();
    }

    function renderAudioChunksList() {
        if (!chunksListContainer) return;
        chunksListContainer.innerHTML = "";

        if (audioChunkList.length === 0) {
            chunksListContainer.innerHTML = `<p class="placeholder-row">Nessun segmento ancora generato. Fai clic su '✂️ Spezza Traccia in Segmenti'.</p>`;
            return;
        }

        const itemsToRender = audioChunkList.slice(0, visibleChunksCount);

        itemsToRender.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = `chunk-card ${item.is_already_present ? 'already-present' : ''}`;
            card.id = `chunkCard_${i}`;

            const badgeHtml = item.is_already_present
                ? `<span class="badge-present" title="Segmento già presente in ADDESTRA [${item.existing_time_pos}]">✅ GIÀ PRESENTE IN ADDESTRA</span>`
                : '';

            const saveBtnHtml = item.is_already_present
                ? `<button class="ctrl-btn btn-red-save" onclick="saveChunkToAddestra(${i})">💾 Aggiorna su ADDESTRA (Già Presente)</button>`
                : `<button class="ctrl-btn play" onclick="saveChunkToAddestra(${i})">💾 Salva su ADDESTRA</button>`;

            card.innerHTML = `
                <div class="chunk-card-header">
                    <h4>✂️ Segmento #${i + 1} [${formatSecToMin(item.startSec)} - ${formatSecToMin(item.endSec)}] ${badgeHtml}</h4>
                    <div class="player-controls inline">
                        <button class="ctrl-btn play" onclick="playChunk(${i})">▶ Riproduci</button>
                        <button class="ctrl-btn pause" onclick="pauseChunk()">⏸ Pausa</button>
                        <button class="ctrl-btn stop" onclick="stopChunk()">⏹ Stop</button>
                    </div>
                </div>

                <div class="chunk-canvas-row">
                    <div class="mini-canvas-block">
                        <span class="mini-canvas-label">1. FORMA D'ONDA SEGMENTO</span>
                        <canvas id="chunkWave_${i}" height="70"></canvas>
                    </div>
                    <div class="mini-canvas-block">
                        <span class="mini-canvas-label">2. SPETTROGRAMMA MEL SEGMENTO</span>
                        <canvas id="chunkSpec_${i}" height="100"></canvas>
                    </div>
                </div>

                <div class="chunk-controls-row">
                    <div class="input-group">
                        <label>Marker A (sec):</label>
                        <input type="number" id="chunkInputA_${i}" value="${item.startSec.toFixed(1)}" step="0.1" class="num-input" onchange="updateChunkBounds(${i})">
                    </div>
                    <div class="input-group">
                        <label>Marker B (sec):</label>
                        <input type="number" id="chunkInputB_${i}" value="${item.endSec.toFixed(1)}" step="0.1" class="num-input" onchange="updateChunkBounds(${i})">
                    </div>
                    <button class="ctrl-btn play" onclick="decodeChunkIA(${i})">⚡ Decodifica IA</button>
                </div>

                <div class="chunk-transcripts-row">
                    <div class="save-addestra-box" style="flex:1">
                        <label>💬 Decodifica IA:</label>
                        <input type="text" id="chunkAi_${i}" value="${escapeHtml(item.ai_prediction || '')}" class="text-input" readonly>
                    </div>
                    <div class="save-addestra-box" style="flex:1">
                        <label>✏️ Testo Target Verificato (Compilato dall'Utente):</label>
                        <input type="text" id="chunkTarget_${i}" value="${escapeHtml(item.transcript || '')}" class="text-input" placeholder="Inserisci il testo Morse verificato">
                    </div>
                    ${saveBtnHtml}
                </div>
            `;

            chunksListContainer.appendChild(card);
            setTimeout(() => drawChunkCanvas(i), 30);
        });

        // BOTTONE IN FONDO PER CARICARE ALTRI SEGMENTI
        if (visibleChunksCount < audioChunkList.length) {
            const stepVal = parseInt(chunkLimitSelect.value) || 10;
            const remaining = audioChunkList.length - visibleChunksCount;
            const nextBatch = Math.min(stepVal, remaining);

            const loadMoreBox = document.createElement('div');
            loadMoreBox.className = "load-more-chunks-box";
            loadMoreBox.style.cssText = "display:flex; justify-content:center; margin:20px 0;";

            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = "ctrl-btn play";
            loadMoreBtn.style.cssText = "padding:12px 24px; font-size:14px; font-weight:bold;";
            loadMoreBtn.textContent = `⏩ Carica Altri ${nextBatch} Segmenti (${visibleChunksCount} di ${audioChunkList.length} mostrati)`;

            loadMoreBtn.addEventListener('click', () => {
                visibleChunksCount += nextBatch;
                renderAudioChunksList();
            });

            loadMoreBox.appendChild(loadMoreBtn);
            chunksListContainer.appendChild(loadMoreBox);
        }
    }

    window.updateChunkBounds = (i) => {
        const inpA = document.getElementById(`chunkInputA_${i}`);
        const inpB = document.getElementById(`chunkInputB_${i}`);
        if (!inpA || !inpB || !audioChunkList[i]) return;

        const newA = parseFloat(inpA.value) || 0;
        const newB = parseFloat(inpB.value) || 10;

        audioChunkList[i].startSec = newA;
        audioChunkList[i].endSec = newB;

        if (i + 1 < audioChunkList.length && audioChunkList[i + 1]) {
            audioChunkList[i + 1].startSec = newB;
            const nextInpA = document.getElementById(`chunkInputA_${i + 1}`);
            if (nextInpA) {
                nextInpA.value = newB.toFixed(1);
            }
            drawChunkCanvas(i + 1);
        }

        if (i > 0 && audioChunkList[i - 1]) {
            audioChunkList[i - 1].endSec = newA;
            const prevInpB = document.getElementById(`chunkInputB_${i - 1}`);
            if (prevInpB) {
                prevInpB.value = newA.toFixed(1);
            }
            drawChunkCanvas(i - 1);
        }

        drawChunkCanvas(i);
    };

    window.playChunk = async (i) => {
        const item = audioChunkList[i];
        if (!item || !audioPlayer.duration) return;

        currentPlayingChunkIndex = i;
        try {
            audioPlayer.currentTime = item.startSec;
            await safePlayAudio(audioPlayer);
            start60FpsCanvasAnimation();

            // Se la decodifica IA generale è attiva, decodifica automaticamente il chunk in riproduzione
            if (isAiDecodingEnabled && (!item.ai_prediction || item.ai_prediction === "")) {
                decodeChunkIA(i);
            }

            const checkStop = () => {
                if (currentPlayingChunkIndex === i && audioPlayer.currentTime >= (item.endSec - 0.05)) {
                    try {
                        audioPlayer.pause();
                        audioPlayer.currentTime = item.startSec;
                    } catch(e){}
                    currentPlayingChunkIndex = -1;
                    audioPlayer.removeEventListener('timeupdate', checkStop);
                    stop60FpsCanvasAnimation();
                    renderCanvasesAtCurrentTime();
                }
            };
            audioPlayer.addEventListener('timeupdate', checkStop);
        } catch (e) {
            currentPlayingChunkIndex = -1;
        }
    };

    window.pauseChunk = () => {
        try { audioPlayer.pause(); } catch (e) {}
        currentPlayingChunkIndex = -1;
        stop60FpsCanvasAnimation();
        renderCanvasesAtCurrentTime();
    };

    window.stopChunk = () => {
        try {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        } catch (e) {}
        currentPlayingChunkIndex = -1;
        stop60FpsCanvasAnimation();
        renderCanvasesAtCurrentTime();
    };

    window.decodeChunkIA = async (i) => {
        const item = audioChunkList[i];
        if (!item || !currentData) return;

        const aiInp = document.getElementById(`chunkAi_${i}`);
        if (aiInp) aiInp.value = "⚡ Decodifica IA...";

        try {
            const fileId = currentLoadedQsoFilename || foglio1Select.value;
            const response = await fetch('/api/decode_region', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: fileId, start: item.startSec, end: item.endSec })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success) {
                const regionText = data.transcript || "";
                if (aiInp) aiInp.value = regionText;
                item.ai_prediction = regionText;
            } else {
                throw new Error(data.error || 'Errore');
            }
        } catch (err) {
            console.error("Decode Chunk Error:", err);
            if (aiInp) aiInp.value = "❌ Errore IA";
        }
    };

    window.saveChunkToAddestra = async (i) => {
        const item = audioChunkList[i];
        if (!item) return;

        const targetInp = document.getElementById(`chunkTarget_${i}`);
        const aiInp = document.getElementById(`chunkAi_${i}`);
        const inpA = document.getElementById(`chunkInputA_${i}`);
        const inpB = document.getElementById(`chunkInputB_${i}`);

        const currentA = inpA ? (parseFloat(inpA.value) || 0) : item.startSec;
        const currentB = inpB ? (parseFloat(inpB.value) || 10) : item.endSec;

        item.startSec = currentA;
        item.endSec = currentB;

        const transcript = targetInp ? targetInp.value.trim() : item.transcript;
        const aiPrediction = aiInp ? aiInp.value.trim() : item.ai_prediction;

        if (!transcript) {
            alert("Inserisci prima il testo verificato nel campo di testo!");
            return;
        }

        item.transcript = transcript;
        if (aiPrediction) item.ai_prediction = aiPrediction;

        const filename = currentLoadedQsoFilename || (fileNameDisplay.textContent.replace('[Foglio1] ', '') || "qso_audio.wav");

        const timePos = `${formatSecToMin(currentA)} - ${formatSecToMin(currentB)}`;
        const cleanFnUid = filename.replace(/[^a-zA-Z0-9]/g, '_');
        const deterministicUid = `CHUNK_${cleanFnUid}_${i}`;

        updateStatus('processing', `Salvataggio segmento #${i + 1} su Google Sheets ADDESTRA...`);

        try {
            const response = await fetch('/api/save_addestra', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename,
                    time_pos: timePos,
                    transcript: transcript,
                    id: '',
                    uid: deterministicUid
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const res = await response.json();

            if (res.success) {
                alert(`✓ Segmento #${i + 1} salvato/aggiornato con successo su Google Sheets ADDESTRA e CSV locale!\n\nFile: ${filename}\nIntervallo: ${timePos}\nTesto Verificato: "${transcript}"`);
                updateStatus('active', `Segmento #${i + 1} Salvato su ADDESTRA!`);
                item.is_already_present = true;
                item.existing_time_pos = timePos;

                await loadAddestraDataset();
                renderAudioChunksList();
            } else {
                throw new Error(res.error || 'Errore salvataggio');
            }
        } catch (err) {
            console.error("Save Chunk ADDESTRA Error:", err);
            alert(`Errore salvataggio segmento #${i + 1} su ADDESTRA: ${err.message}`);
            updateStatus('error', 'Errore Salvataggio ADDESTRA');
        }
    };

    function drawChunkCanvas(i) {
        const item = audioChunkList[i];
        if (!item || !currentData) return;

        const waveCanvas = document.getElementById(`chunkWave_${i}`);
        const specCanvas = document.getElementById(`chunkSpec_${i}`);

        if (waveCanvas && currentData.waveform) {
            waveCanvas.onclick = (e) => {
                const rect = waveCanvas.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audioPlayer.currentTime = item.startSec + pct * (item.endSec - item.startSec);
                renderCanvasesAtCurrentTime();
            };

            const ctx = waveCanvas.getContext('2d');
            const w = waveCanvas.width = waveCanvas.parentElement.clientWidth || 300;
            const h = waveCanvas.height = 70;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            const startIdx = Math.floor((item.startSec / currentData.duration) * currentData.waveform.length);
            const endIdx = Math.ceil((item.endSec / currentData.duration) * currentData.waveform.length);
            const sliced = currentData.waveform.slice(startIdx, endIdx);

            if (sliced.length > 0) {
                const centerY = h / 2;
                ctx.fillStyle = '#38bdf8';
                const step = w / sliced.length;

                for (let k = 0; k < sliced.length; k++) {
                    const v = Math.abs(sliced[k]);
                    const bh = Math.max(1.5, v * (h / 2) * 1.8);
                    ctx.fillRect(k * step, centerY - bh / 2, step + 0.2, bh);
                }
            }

            const curTime = audioPlayer.currentTime || 0;
            if (currentPlayingChunkIndex === i && !audioPlayer.paused && curTime >= item.startSec && curTime <= item.endSec) {
                const visDur = (item.endSec - item.startSec) || 1e-5;
                const xPlay = Math.max(0, Math.min(w, ((curTime - item.startSec) / visDur) * w));

                ctx.shadowColor = '#ff1744';
                ctx.shadowBlur = 8;
                ctx.strokeStyle = '#ff1744';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(xPlay, 0);
                ctx.lineTo(xPlay, h);
                ctx.stroke();

                ctx.fillStyle = '#ff1744';
                ctx.beginPath();
                ctx.arc(xPlay, 6, 4, 0, 2 * Math.PI);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        if (specCanvas && currentData.spectrogram) {
            drawSpectrogramWindowHDOnCanvas(specCanvas, currentData.spectrogram, item.startSec, item.endSec, currentData.duration, i);
        }
    }

    function drawSpectrogramWindowHDOnCanvas(canvas, specMatrix, startTime, endTime, totalDuration, chunkIndex) {
        if (!specMatrix || specMatrix.length === 0) return;

        const ctx = canvas.getContext('2d');
        const numMels = specMatrix.length;
        const totalFrames = specMatrix[0].length;

        const canvasWidth = canvas.width = canvas.parentElement.clientWidth || 300;
        const canvasHeight = canvas.height = 100;

        const startFrame = Math.floor((startTime / totalDuration) * totalFrames);
        const endFrame = Math.min(totalFrames, Math.ceil((endTime / totalDuration) * totalFrames));
        const visibleFrames = Math.max(1, endFrame - startFrame);

        const imgData = ctx.createImageData(canvasWidth, canvasHeight);
        const pixels = imgData.data;

        let minVal = Infinity, maxVal = -Infinity;
        for (let r = 0; r < numMels; r++) {
            for (let c = startFrame; c < Math.min(totalFrames, startFrame + visibleFrames); c++) {
                const val = specMatrix[r][c];
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
        }
        const range = (maxVal - minVal) || 1e-5;

        for (let x = 0; x < canvasWidth; x++) {
            const frameFloat = startFrame + (x / canvasWidth) * (visibleFrames - 1);
            const frame0 = Math.floor(frameFloat);
            const frame1 = Math.min(totalFrames - 1, frame0 + 1);
            const frameFrac = frameFloat - frame0;

            for (let y = 0; y < canvasHeight; y++) {
                const melBinFloat = ((canvasHeight - 1 - y) / canvasHeight) * (numMels - 1);
                const melR0 = Math.floor(melBinFloat);
                const melR1 = Math.min(numMels - 1, melR0 + 1);
                const melFrac = melBinFloat - melR0;

                const v00 = specMatrix[melR0][frame0];
                const v01 = specMatrix[melR0][frame1];
                const v10 = specMatrix[melR1][frame0];
                const v11 = specMatrix[melR1][frame1];

                const interpTime0 = v00 + frameFrac * (v01 - v00);
                const interpTime1 = v10 + frameFrac * (v11 - v10);
                const interpVal = interpTime0 + melFrac * (interpTime1 - interpTime0);

                const linearVal = (interpVal - minVal) / range;
                const boostedVal = Math.pow(Math.max(0, linearVal), contrastGamma);

                const rgb = getRGBPalette(boostedVal, selectedPalette);
                const pixelIdx = (y * canvasWidth + x) * 4;

                pixels[pixelIdx]     = rgb[0];
                pixels[pixelIdx + 1] = rgb[1];
                pixels[pixelIdx + 2] = rgb[2];
                pixels[pixelIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);

        const curTime = audioPlayer.currentTime || 0;
        if (currentPlayingChunkIndex === chunkIndex && !audioPlayer.paused && curTime >= startTime && curTime <= endTime) {
            const visDur = (endTime - startTime) || 1e-5;
            const xPlay = Math.max(0, Math.min(canvasWidth, ((curTime - startTime) / visDur) * canvasWidth));

            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = '#ff1744';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(xPlay, 0);
            ctx.lineTo(xPlay, canvasHeight);
            ctx.stroke();

            ctx.fillStyle = '#ff1744';
            ctx.beginPath();
            ctx.arc(xPlay, 6, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // REGOLAZIONE FINE MARKER A E B TRAMITE PULSANTI ◄ / ► E FAST ◄◄ / ►►
    const btnNudgeALeftFast = document.getElementById('btnNudgeALeftFast');
    const btnNudgeARightFast = document.getElementById('btnNudgeARightFast');
    const btnNudgeBLeftFast = document.getElementById('btnNudgeBLeftFast');
    const btnNudgeBRightFast = document.getElementById('btnNudgeBRightFast');
    const btnNudgeBRightSuper = document.getElementById('btnNudgeBRightSuper');

    if (btnNudgeALeftFast) {
        btnNudgeALeftFast.addEventListener('click', () => {
            const currentA = parseFloat(markerAInput.value) || 0;
            markerAInput.value = Math.max(0, currentA - 1.0).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeARightFast) {
        btnNudgeARightFast.addEventListener('click', () => {
            const currentA = parseFloat(markerAInput.value) || 0;
            const currentB = parseFloat(markerBInput.value) || (currentData ? currentData.duration : 10);
            markerAInput.value = Math.min(currentB - 0.1, currentA + 1.0).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeBLeftFast) {
        btnNudgeBLeftFast.addEventListener('click', () => {
            const currentA = parseFloat(markerAInput.value) || 0;
            const currentB = parseFloat(markerBInput.value) || 10;
            markerBInput.value = Math.max(currentA + 0.1, currentB - 1.0).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeBRightFast) {
        btnNudgeBRightFast.addEventListener('click', () => {
            const currentB = parseFloat(markerBInput.value) || 10;
            const maxDur = currentData ? currentData.duration : 100;
            markerBInput.value = Math.min(maxDur, currentB + 1.0).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeBRightSuper) {
        btnNudgeBRightSuper.addEventListener('click', () => {
            const currentB = parseFloat(markerBInput.value) || 10;
            const maxDur = currentData ? currentData.duration : 100;
            markerBInput.value = Math.min(maxDur, currentB + 5.0).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    btnNudgeALeft.addEventListener('click', () => {
        const currentA = parseFloat(markerAInput.value) || 0;
        markerAInput.value = Math.max(0, currentA - 0.2).toFixed(1);
        renderCanvasesAtCurrentTime();
    });

    btnNudgeARight.addEventListener('click', () => {
        const currentA = parseFloat(markerAInput.value) || 0;
        const currentB = parseFloat(markerBInput.value) || (currentData ? currentData.duration : 10);
        markerAInput.value = Math.min(currentB - 0.1, currentA + 0.2).toFixed(1);
        renderCanvasesAtCurrentTime();
    });

    btnNudgeBLeft.addEventListener('click', () => {
        const currentA = parseFloat(markerAInput.value) || 0;
        const currentB = parseFloat(markerBInput.value) || 10;
        markerBInput.value = Math.max(currentA + 0.1, currentB - 0.2).toFixed(1);
        renderCanvasesAtCurrentTime();
    });

    btnNudgeBRight.addEventListener('click', () => {
        const currentB = parseFloat(markerBInput.value) || 10;
        const maxDur = currentData ? currentData.duration : 100;
        markerBInput.value = Math.min(maxDur, currentB + 0.2).toFixed(1);
        renderCanvasesAtCurrentTime();
    });

    // CONTROLLI ZOOM +/- PER LA FORMA D'ONDA
    btnZoomInWave.addEventListener('click', () => {
        waveZoomScale = Math.min(8.0, waveZoomScale + 0.5);
        renderCanvasesAtCurrentTime();
    });

    btnZoomOutWave.addEventListener('click', () => {
        waveZoomScale = Math.max(1.0, waveZoomScale - 0.5);
        renderCanvasesAtCurrentTime();
    });

    markerAInput.addEventListener('input', () => renderCanvasesAtCurrentTime());
    markerBInput.addEventListener('input', () => renderCanvasesAtCurrentTime());

    // REGION / TRATTO A-B CONTROLS
    btnPlayRegionAB.addEventListener('click', async () => {
        if (!audioPlayer.duration) return;
        const mA = parseFloat(markerAInput.value) || 0;
        const mB = parseFloat(markerBInput.value) || audioPlayer.duration;

        try {
            audioPlayer.currentTime = mA;
            await safePlayAudio(audioPlayer);
            btnPlay.textContent = '▶ In Riproduzione';
            if (btnPlayTab3) btnPlayTab3.textContent = '▶ In Riproduzione';
            start60FpsCanvasAnimation();

            // Se la decodifica IA generale è attiva, decodifica automaticamente la regione A-B in riproduzione
            if (isAiDecodingEnabled) {
                btnDecodeRegionAB.click();
            }

            const checkStop = () => {
                if (audioPlayer.currentTime >= mB) {
                    try { audioPlayer.pause(); } catch(e){}
                    audioPlayer.removeEventListener('timeupdate', checkStop);
                    btnPlay.textContent = '▶ Avvia Audio';
                    if (btnPlayTab3) btnPlayTab3.textContent = '▶ Avvia Audio';
                    stop60FpsCanvasAnimation();
                }
            };
            audioPlayer.addEventListener('timeupdate', checkStop);
        } catch (e) {}
    });

    btnZoomRegionAB.addEventListener('click', () => {
        isZoomedABMode = !isZoomedABMode;
        if (isZoomedABMode) {
            btnZoomRegionAB.classList.add('active');
            btnZoomRegionAB.textContent = '🔍 Reset Zoom Full';
        } else {
            btnZoomRegionAB.classList.remove('active');
            btnZoomRegionAB.textContent = '🔍 Zoom Tratto A-B';
        }
        renderCanvasesAtCurrentTime();
    });

    btnDecodeRegionAB.addEventListener('click', async () => {
        if (!currentData) return;
        const mA = parseFloat(markerAInput.value) || 0;
        const mB = parseFloat(markerBInput.value) || currentData.duration;

        updateStatus('processing', `Decodifica IA in corso per il tratto A-B (${mA}s - ${mB}s)...`);
        try {
            const fileId = currentLoadedQsoFilename || foglio1Select.value;
            const response = await fetch('/api/decode_region', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: fileId, start: mA, end: mB })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success) {
                const regionText = data.transcript || "";
                if (decodedTextSingle) decodedTextSingle.value = regionText;
                updateStatus('active', 'Decodifica Tratto A-B Completata!');
            } else {
                throw new Error(data.error || 'Errore');
            }
        } catch (err) {
            console.error("Decode Region Error:", err);
            alert(`Errore decodifica tratto A-B: ${err.message}`);
            updateStatus('error', 'Errore');
        }
    });

    // INTERAZIONE TRASCINAMENTO MOUSE DEI MARKER A E MARKER B SUI CANVAS
    function setupCanvasMarkerInteractions(canvas) {
        canvas.addEventListener('mousedown', e => {
            if (!currentData || !currentData.duration) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = clickX / rect.width;

            const totalDuration = currentData.duration;
            let startTime = 0;
            let endTime = totalDuration;

            if (canvas === waveformCanvas && isZoomedABMode) {
                const mA = parseFloat(markerAInput.value) || 0;
                const mB = parseFloat(markerBInput.value) || totalDuration;
                startTime = Math.max(0, mA - 0.5);
                endTime = Math.min(totalDuration, mB + 0.5);
            } else if (canvas === spectrogramCanvas) {
                const curTime = audioPlayer.currentTime || 0;
                const windowLen = 3.0;
                startTime = Math.max(0, curTime - 1.0);
                endTime = Math.min(totalDuration, startTime + windowLen);
                if (endTime - startTime < windowLen && startTime > 0) {
                    startTime = Math.max(0, endTime - windowLen);
                }
            }

            const timeWidth = (endTime - startTime) || 1e-5;
            const clickedTime = Math.max(0, Math.min(totalDuration, startTime + pct * timeWidth));
            const mA = parseFloat(markerAInput.value) || 0;
            const mB = parseFloat(markerBInput.value) || totalDuration;

            const xA = ((mA - startTime) / timeWidth) * rect.width;
            const xB = ((mB - startTime) / timeWidth) * rect.width;

            if (Math.abs(clickX - xA) <= 14) {
                isDraggingMarkerA = true;
            } else if (Math.abs(clickX - xB) <= 14) {
                isDraggingMarkerB = true;
            } else if (e.shiftKey) {
                markerBInput.value = Math.max(mA + 0.1, clickedTime).toFixed(1);
                isDraggingMarkerB = true;
            } else {
                audioPlayer.currentTime = clickedTime;
            }

            renderCanvasesAtCurrentTime();
        });

        window.addEventListener('mousemove', e => {
            if (!isDraggingMarkerA && !isDraggingMarkerB) return;
            if (!currentData || !currentData.duration) return;

            const rect = canvas.getBoundingClientRect();
            const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const pct = mouseX / rect.width;

            const totalDuration = currentData.duration;
            let startTime = 0;
            let endTime = totalDuration;

            if (canvas === waveformCanvas && isZoomedABMode) {
                const mA = parseFloat(markerAInput.value) || 0;
                const mB = parseFloat(markerBInput.value) || totalDuration;
                startTime = Math.max(0, mA - 0.5);
                endTime = Math.min(totalDuration, mB + 0.5);
            } else if (canvas === spectrogramCanvas) {
                const curTime = audioPlayer.currentTime || 0;
                const windowLen = 3.0;
                startTime = Math.max(0, curTime - 1.0);
                endTime = Math.min(totalDuration, startTime + windowLen);
                if (endTime - startTime < windowLen && startTime > 0) {
                    startTime = Math.max(0, endTime - windowLen);
                }
            }

            const newTime = Math.max(0, Math.min(totalDuration, startTime + pct * (endTime - startTime)));

            if (isDraggingMarkerA) {
                const currentB = parseFloat(markerBInput.value) || totalDuration;
                markerAInput.value = Math.min(currentB - 0.1, newTime).toFixed(1);
            } else if (isDraggingMarkerB) {
                const currentA = parseFloat(markerAInput.value) || 0;
                markerBInput.value = Math.max(currentA + 0.1, newTime).toFixed(1);
            }

            renderCanvasesAtCurrentTime();
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingMarkerA || isDraggingMarkerB) {
                isDraggingMarkerA = false;
                isDraggingMarkerB = false;
                renderCanvasesAtCurrentTime();
            }
        });
    }

    setupCanvasMarkerInteractions(waveformCanvas);
    setupCanvasMarkerInteractions(spectrogramCanvas);

    // SALVA E SINCRONIZZA REGIONE SU GOOGLE SHEETS ADDESTRA CON TIMESTAMP ED UID
    btnSaveToAddestra.addEventListener('click', async () => {
        const transcript = targetTranscriptInput.value.trim();
        if (!transcript) {
            alert("Inserisci prima il testo verificato nel campo di testo!");
            return;
        }

        const filename = currentLoadedQsoFilename || (fileNameDisplay.textContent.replace('[Foglio1] ', '') || "qso_audio.wav");

        const mA = parseFloat(markerAInput.value) || 0;
        const mB = parseFloat(markerBInput.value) || 10;
        const timePos = `${formatSecToMin(mA)} - ${formatSecToMin(mB)}`;

        updateStatus('processing', 'Salvataggio segmento su Google Sheets ADDESTRA...');

        try {
            const response = await fetch('/api/save_addestra', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename,
                    time_pos: timePos,
                    transcript: transcript,
                    id: '',
                    uid: currentEditingUid || ''
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const res = await response.json();

            if (res.success) {
                alert(`✓ Segmento salvato/aggiornato con successo su Google Sheets ADDESTRA e CSV locale!\n\nFile: ${filename}\nIntervallo: ${timePos}\nTesto Verificato: "${transcript}"`);
                updateStatus('active', 'Segmento Salvato su Google Sheets ADDESTRA!');
                currentEditingUid = null;
                loadAddestraDataset();
            } else {
                throw new Error(res.error || 'Errore salvataggio');
            }
        } catch (err) {
            console.error("Save ADDESTRA Error:", err);
            alert(`Errore salvataggio su ADDESTRA: ${err.message}`);
            updateStatus('error', 'Errore Salvataggio ADDESTRA');
        }
    });

    // TAB 3: IMPORTA / SINCRONIZZA DATASET ADDESTRA
    btnSyncAddestra.addEventListener('click', loadAddestraDataset);

    async function loadAddestraDataset() {
        if (foglio1List.length === 0) {
            loadFoglio1Catalog();
        }
        addestraTableBody.innerHTML = `<tr><td colspan="6" class="placeholder-row">⏳ Sincronizzazione in corso con la scheda Google Sheets ADDESTRA...</td></tr>`;
        try {
            const response = await fetch('/api/addestra');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success && data.results) {
                addestraList = data.results;
                renderAddestraTable(addestraList);
                updateStatus('active', `Sincronizzati ${addestraList.length} segmenti da ADDESTRA`);
            }
        } catch (err) {
            console.error("ADDESTRA Fetch Error:", err);
            addestraTableBody.innerHTML = `<tr><td colspan="6" class="placeholder-row" style="color:var(--error-red)">❌ Errore sincronizzazione: ${err.message}</td></tr>`;
        }
    }

    function renderAddestraTable(items) {
        if (!items || items.length === 0) {
            addestraTableBody.innerHTML = `<tr><td colspan="6" class="placeholder-row">Nessun segmento ancora presente nella scheda ADDESTRA.</td></tr>`;
            return;
        }

        addestraTableBody.innerHTML = "";
        items.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="cell-id">#${idx + 1}</td>
                <td class="cell-filename" title="${escapeHtml(item.filename || '')}">${escapeHtml(item.filename || 'qso.wav')}</td>
                <td class="cell-time">${escapeHtml(item.time_pos || '00:00 - 00:10')}</td>
                <td><input type="text" value="${escapeHtml(item.transcript || '')}" class="text-input" style="width:100%" onchange="updateAddestraTranscript(${idx}, this.value)"></td>
                <td style="color:var(--primary-hover)">${escapeHtml(item.ai_prediction || '---')}</td>
                <td class="cell-actions">
                    <button type="button" class="copy-btn" onclick="playAddestraRowByIndex(${idx})">▶ Carica & Modifica</button>
                </td>
            `;
            addestraTableBody.appendChild(tr);
        });
    }

    window.updateAddestraTranscript = (idx, newText) => {
        if (addestraList[idx]) {
            addestraList[idx].transcript = newText;
        }
    };

    window.playAddestraRowByIndex = async (idx) => {
        const item = addestraList[idx];
        if (!item) return;

        currentEditingUid = item.uid || `SEG_${idx}`;
        targetTranscriptInput.value = item.transcript || "";

        let startSec = 0.0;
        let endSec = 10.0;

        if (item.time_pos && item.time_pos.includes('-')) {
            const parts = item.time_pos.split('-');
            startSec = parseTimeToSec(parts[0].trim());
            endSec = parseTimeToSec(parts[1].trim());
        }

        if (foglio1List.length === 0) {
            await loadFoglio1Catalog();
        }

        const filename = (item.filename || "").replace('[Foglio1] ', '').trim();
        let fileId = "";

        const found = foglio1List.find(f => {
            const fName = (f.filename || "").trim();
            return fName.toLowerCase() === filename.toLowerCase() || fName.includes(filename) || filename.includes(fName);
        });

        if (found) {
            fileId = found.id || found.filename;
        } else {
            fileId = filename;
        }

        if (!fileId) {
            alert(`Impossibile trovare il file audio '${filename}' nel catalogo Foglio1.`);
            return;
        }

        await loadAndDecodeQsoFile(fileId, filename);

        markerAInput.value = startSec.toFixed(1);
        markerBInput.value = endSec.toFixed(1);

        if (audioPlayer) {
            audioPlayer.currentTime = startSec;
            renderCanvasesAtCurrentTime();
            setTimeout(() => {
                audioPlayer.currentTime = startSec;
                renderCanvasesAtCurrentTime();
                if (btnPlayRegionAB) btnPlayRegionAB.click();
            }, 300);
        }
    };

    function parseTimeToSec(timeStr) {
        if (!timeStr) return 0.0;
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
        }
        return parseFloat(timeStr) || 0.0;
    }

    // EVENT LISTENERS DRAG & DROP & FILE
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });

    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover')));

    dropZone.addEventListener('drop', e => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files.length > 0) processFile(e.target.files[0]);
    });

    btnClearBtn.addEventListener('click', () => {
        liveAccumulatedText = "";
        decodedTextBox.innerHTML = `<span class="placeholder">(Testo cancellato)</span>`;
        if (decodedTextSingle) decodedTextSingle.value = "";
    });

    copyBtn.addEventListener('click', () => {
        const textToCopy = decodedTextBox.textContent || "";
        if (textToCopy && !textToCopy.includes("(Testo cancellato)")) {
            navigator.clipboard.writeText(textToCopy);
            copyBtn.textContent = '✓ Copiato!';
            setTimeout(() => copyBtn.textContent = '📋 Copia Testo', 2000);
        }
    });

    // MICROFONO LIVE CONTROL VIA WEBAUDIO PCM ENCODER
    btnMic.addEventListener('click', toggleMicrophoneStream);

    async function toggleMicrophoneStream() {
        if (!isMicRecording) {
            updateStatus('processing', '🎙️ Richiesta autorizzazione microfono...');
            resultCard.classList.remove('hidden');
            visualizerCard.classList.remove('hidden');

            liveAccumulatedText = "";
            decodedTextBox.innerHTML = `<span class="placeholder">🎙️ In ascolto dal microfono... parla o trasmetti toni Morse!</span>`;
            if (decodedTextSingle) decodedTextSingle.value = "🎙️ In ascolto dal microfono...";
            fileNameDisplay.textContent = "Ascolto Microfono Live";

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Il tuo browser non supporta l'accesso al microfono (getUserMedia non disponibile). Apri http://localhost:8000 su Chrome, Firefox o Edge.");
                updateStatus('error', 'Microfono Non Supportato dal Browser');
                return;
            }

            try {
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                    });
                } catch (e1) {
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }

                isMicRecording = true;
                btnMic.classList.add('recording');
                micBtnText.textContent = '⏳ Calibrazione Rumore Stanza (2s)...';
                updateStatus('processing', '🎙️ Calibrazione Microfono: Profilazione Rumore di Fondo (2s)... resta in silenzio');

                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                micAudioContext = new AudioCtx();
                const source = micAudioContext.createMediaStreamSource(micStream);

                micScriptProcessor = micAudioContext.createScriptProcessor(2048, 1, 1);
                micPcmSamples = [];

                micScriptProcessor.onaudioprocess = e => {
                    if (!isMicRecording) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    for (let i = 0; i < inputData.length; i++) {
                        micPcmSamples.push(inputData[i]);
                    }
                    const maxSamples = micAudioContext.sampleRate * 12.0;
                    if (micPcmSamples.length > maxSamples) {
                        micPcmSamples = micPcmSamples.slice(micPcmSamples.length - maxSamples);
                    }
                };

                source.connect(micScriptProcessor);
                micScriptProcessor.connect(micAudioContext.destination);

                isDecodingBusy = false;

                // 2 SECONDI DI CALIBRAZIONE RUMORE DI STANZA
                setTimeout(async () => {
                    if (!isMicRecording) return;
                    micBtnText.textContent = '⏹ Ferma Microfono Live (ANC Attivo)';
                    updateStatus('active', '🎙️ Microfono In Ascolto (Cancellazione Attiva Rumore Stanza ANC)');

                    if (micPcmSamples.length > 0) {
                        const noiseBuffer = encodeWAV(micPcmSamples.slice(0, micAudioContext.sampleRate * 2.0), micAudioContext.sampleRate);
                        try {
                            await fetch('/api/calibrate_noise', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/octet-stream' },
                                body: noiseBuffer
                            });
                        } catch(e) {}
                    }
                }, 2000);

                micDecodeTimer = setInterval(async () => {
                    if (isDecodingBusy || !isMicRecording) return;

                    // Finestra veloce di 3.0 secondi aggiornata ogni 800ms per bassa latenza in tempo reale
                    if (micPcmSamples.length >= micAudioContext.sampleRate * 3.0) {
                        isDecodingBusy = true;
                        const samplesToProcess = micPcmSamples.slice();
                        const overlapCount = Math.floor(micAudioContext.sampleRate * 2.0);
                        micPcmSamples = micPcmSamples.slice(micPcmSamples.length - overlapCount);

                        const wavBuffer = encodeWAV(samplesToProcess, micAudioContext.sampleRate);

                        try {
                            const response = await fetch('/api/decode', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/octet-stream' },
                                body: wavBuffer
                            });

                            if (response.ok) {
                                const data = await response.json();
                                if (data.success) {
                                    currentData = data;
                                    renderResults(data, true);
                                    renderCanvasesAtCurrentTime();
                                }
                            }
                        } catch (err) {
                            console.error("Live Mic Decode Error:", err);
                        } finally {
                            isDecodingBusy = false;
                        }
                    }
                }, 800);

            } catch (err) {
                console.error("Errore Microfono:", err);
                alert(`Impossibile accedere al microfono: ${err.message || err}`);
                updateStatus('error', 'Accesso Microfono Negato o Non Disponibile');
                btnMic.classList.remove('recording');
                micBtnText.textContent = '🎙️ Attiva Microfono Live (Ascolto dal Vivo)';
                isMicRecording = false;
            }
        } else {
            isMicRecording = false;
            btnMic.classList.remove('recording');
            micBtnText.textContent = '🎙️ Attiva Microfono Live (Ascolto dal Vivo)';
            updateStatus('active', 'Microfono Arrestato');

            if (micDecodeTimer) clearInterval(micDecodeTimer);
            if (micScriptProcessor) {
                try { micScriptProcessor.disconnect(); } catch (e) {}
            }
            if (micAudioContext) {
                try { micAudioContext.close(); } catch (e) {}
            }
            if (micStream) {
                micStream.getTracks().forEach(track => track.stop());
            }
        }
    }

    // ENCODER WAV PCM PER WEBAUDIO (16-BIT PCM MONO)
    function encodeWAV(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return buffer;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // PLAYER CONTROLS (AVVIA, PAUSA, STOP) INTEGRATI CON TAB 3 E ANIMAZIONE 60 FPS
    const startPlayAction = () => {
        safePlayAudio(audioPlayer);
        if (btnPlay) btnPlay.textContent = '▶ In Riproduzione';
        if (btnPlayTab3) btnPlayTab3.textContent = '▶ In Riproduzione';
        start60FpsCanvasAnimation();
    };

    const pausePlayAction = () => {
        try { audioPlayer.pause(); } catch (e) {}
        if (btnPlay) btnPlay.textContent = '▶ Avvia Audio';
        if (btnPlayTab3) btnPlayTab3.textContent = '▶ Avvia Audio';
        stop60FpsCanvasAnimation();
    };

    const stopPlayAction = () => {
        try {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        } catch (e) {}
        if (btnPlay) btnPlay.textContent = '▶ Avvia Audio';
        if (btnPlayTab3) btnPlayTab3.textContent = '▶ Avvia Audio';
        stop60FpsCanvasAnimation();
        renderCanvasesAtCurrentTime();
    };

    btnPlay.addEventListener('click', startPlayAction);
    btnPause.addEventListener('click', pausePlayAction);
    btnStop.addEventListener('click', stopPlayAction);

    if (btnPlayTab3) btnPlayTab3.addEventListener('click', startPlayAction);
    if (btnPauseTab3) btnPauseTab3.addEventListener('click', pausePlayAction);
    if (btnStopTab3) btnStopTab3.addEventListener('click', stopPlayAction);

    function start60FpsCanvasAnimation() {
        stop60FpsCanvasAnimation();
        function loop() {
            renderCanvasesAtCurrentTime();
            if (!audioPlayer.paused && !audioPlayer.ended) {
                animationFrameId = requestAnimationFrame(loop);
            }
        }
        loop();
    }

    function stop60FpsCanvasAnimation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    audioPlayer.addEventListener('play', start60FpsCanvasAnimation);
    audioPlayer.addEventListener('playing', start60FpsCanvasAnimation);
    audioPlayer.addEventListener('pause', stop60FpsCanvasAnimation);
    audioPlayer.addEventListener('ended', () => {
        stop60FpsCanvasAnimation();
        if (btnPlay) btnPlay.textContent = '▶ Avvia Audio';
        if (btnPlayTab3) btnPlayTab3.textContent = '▶ Avvia Audio';
        playheads.forEach(ph => ph.style.display = 'none');
    });

    // CONTRAST SLIDER & PALETTE LISTENERS
    contrastSlider.addEventListener('input', e => {
        contrastGamma = parseFloat(e.target.value);
        contrastVal.textContent = `${contrastGamma.toFixed(1)}x`;
        renderCanvasesAtCurrentTime();
    });

    colorPaletteSelect.addEventListener('change', e => {
        selectedPalette = e.target.value;
        renderCanvasesAtCurrentTime();
    });

    // TOGGLE VIEW MODE (3s SCORREVOLE vs VISTA INTERA)
    btnView3s.addEventListener('click', () => {
        is3sMode = true;
        isZoomedABMode = false;
        btnView3s.classList.add('active');
        btnViewFull.classList.remove('active');
        renderCanvasesAtCurrentTime();
    });

    btnViewFull.addEventListener('click', () => {
        is3sMode = false;
        isZoomedABMode = false;
        btnViewFull.classList.add('active');
        btnView3s.classList.remove('active');
        renderCanvasesAtCurrentTime();
    });

    window.addEventListener('resize', () => {
        renderCanvasesAtCurrentTime();
    });

    // ELABORAZIONE FILE AUDIO VIA API SERVER
    async function processFile(file) {
        if (isMicRecording) toggleMicrophoneStream();

        updateStatus('processing', `Elaborazione di '${file.name}'...`);
        fileNameDisplay.textContent = file.name;
        currentLoadedQsoFilename = file.name;

        const audioUrl = URL.createObjectURL(file);
        audioPlayer.src = audioUrl;

        audioSection.classList.remove('hidden');
        resultCard.classList.remove('hidden');
        visualizerCard.classList.remove('hidden');
        decodedTextBox.innerHTML = `<span class="placeholder">⚡ Elaborazione acustica IA in corso...</span>`;
        if (decodedTextSingle) decodedTextSingle.value = "⚡ Elaborazione acustica IA in corso...";

        try {
            const arrayBuffer = await file.arrayBuffer();

            const response = await fetch('/api/decode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: arrayBuffer
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Errore di decodifica');

            currentData = data;
            renderResults(data, false);
            updateStatus('active', 'Decodifica IA Completata!');

        } catch (error) {
            console.error('Errore:', error);
            updateStatus('error', `Errore: ${error.message}`);
            decodedTextBox.innerHTML = `<span class="placeholder" style="color:var(--error-red)">❌ Errore durante la decodifica: ${escapeHtml(error.message)}</span>`;
            if (decodedTextSingle) decodedTextSingle.value = `❌ Errore: ${error.message}`;
        }
    }

    // ALGORITMO DEDUPLICAZIONE TRASCRIZIONE LIVE MICROFONO
    function deduplicateLiveTranscript(existingText, newText) {
        if (!newText || !newText.trim()) return existingText;
        const cleanNew = newText.trim();
        if (!existingText || !existingText.trim()) return cleanNew;

        const exWords = existingText.trim().split(/\s+/);
        const newWords = cleanNew.split(/\s+/);

        const lastWord = exWords[exWords.length - 1];
        if (newWords[0] === lastWord) {
            newWords.shift();
        }

        if (newWords.length > 0) {
            return (existingText.trim() + " " + newWords.join(" ")).trim();
        }

        return existingText;
    }

    // RENDERING DEI RISULTATI
    function renderResults(data, isLiveMode = false) {
        const newTranscript = (data.transcript || "").trim();

        if (isLiveMode) {
            if (newTranscript.length > 0) {
                liveAccumulatedText = deduplicateLiveTranscript(liveAccumulatedText, newTranscript);
                decodedTextBox.innerHTML = escapeHtml(liveAccumulatedText);
                decodedTextBox.scrollTop = decodedTextBox.scrollHeight;
                if (decodedTextSingle) decodedTextSingle.value = liveAccumulatedText;
            }
        } else {
            if (newTranscript.length > 0) {
                decodedTextBox.innerHTML = escapeHtml(newTranscript);
                if (decodedTextSingle) decodedTextSingle.value = newTranscript;
            } else {
                decodedTextBox.innerHTML = `<span class="placeholder">(Nessun carattere Morse riconosciuto nell'audio)</span>`;
                if (decodedTextSingle) decodedTextSingle.value = "(Nessun carattere Morse riconosciuto)";
            }
        }

        setTimeout(() => {
            renderCanvasesAtCurrentTime();
        }, 50);
    }

    // LOGICA DI RENDERING CANVASES (SCORREVOLE A 60 FPS CON ZOOM REGIONALE E DRAG MARKERS A E B)
    function renderCanvasesAtCurrentTime() {
        if (!currentData) return;

        const curTime = audioPlayer.currentTime || 0;
        const totalDuration = currentData.duration || 1;

        if (timeDisplayTab3) {
            timeDisplayTab3.textContent = `${formatTime(curTime)} / ${formatTime(totalDuration)}`;
        }

        let specStartTime = Math.max(0, curTime - 1.0);
        let specEndTime = Math.min(totalDuration, specStartTime + 3.0);
        if (specEndTime - specStartTime < 3.0 && specStartTime > 0) {
            specStartTime = Math.max(0, specEndTime - 3.0);
        }

        let waveStartTime = 0;
        let waveEndTime = totalDuration;

        if (isZoomedABMode) {
            const mA = parseFloat(markerAInput.value) || 0;
            const mB = parseFloat(markerBInput.value) || totalDuration;
            waveStartTime = Math.max(0, mA - 0.5);
            waveEndTime = Math.min(totalDuration, mB + 0.5);
        } else if (waveZoomScale > 1.0) {
            const visibleWin = totalDuration / waveZoomScale;
            waveStartTime = Math.max(0, curTime - visibleWin / 2);
            waveEndTime = Math.min(totalDuration, waveStartTime + visibleWin);
        }

        const visWaveDur = (waveEndTime - waveStartTime) || 1e-5;
        const visSpecDur = (specEndTime - specStartTime) || 1e-5;

        if (playheads[0]) {
            const pctWave = ((curTime - waveStartTime) / visWaveDur) * 100;
            playheads[0].style.display = 'block';
            playheads[0].style.left = `${Math.max(0, Math.min(100, pctWave))}%`;
        }

        if (playheads[1]) {
            const pctSpec = ((curTime - specStartTime) / visSpecDur) * 100;
            playheads[1].style.display = 'block';
            playheads[1].style.left = `${Math.max(0, Math.min(100, pctSpec))}%`;
        }

        drawWaveformWindow(currentData.waveform, waveStartTime, waveEndTime, totalDuration);
        drawSpectrogramWindowHD(currentData.spectrogram, specStartTime, specEndTime, totalDuration);

        if (audioChunkList && audioChunkList.length > 0) {
            for (let i = 0; i < audioChunkList.length; i++) {
                drawChunkCanvas(i);
            }
        }
    }

    // CANVAS 1: FORMA D'ONDA AUDIO AD ALTA DEFINIZIONE (BARRE DI AMPIEZZA ENERGIA)
    function drawWaveformWindow(waveform, startTime, endTime, totalDuration) {
        if (!waveform || waveform.length === 0) return;

        const ctx = waveformCanvas.getContext('2d');
        const parentW = waveformCanvas.parentElement.clientWidth || 1000;
        const width = waveformCanvas.width = Math.max(300, parentW);
        const height = waveformCanvas.height = 90;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const visibleDuration = (endTime - startTime) || 1e-5;

        ctx.fillStyle = '#8e9bb0';
        ctx.font = '10px "Roboto Mono", monospace';
        const intervalSec = visibleDuration > 30 ? 10 : (visibleDuration > 10 ? 5 : (visibleDuration > 3 ? 1 : 0.5));

        for (let t = Math.floor(startTime / intervalSec) * intervalSec; t <= endTime; t += intervalSec) {
            if (t < 0 || t > totalDuration) continue;
            const x = ((t - startTime) / visibleDuration) * width;
            ctx.strokeStyle = 'rgba(142, 155, 176, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            ctx.fillText(`${t.toFixed(1)}s`, x + 3, 12);
        }

        const startIdx = Math.floor((startTime / totalDuration) * waveform.length);
        const endIdx = Math.ceil((endTime / totalDuration) * waveform.length);
        const slicedWave = waveform.slice(startIdx, endIdx);

        if (slicedWave.length > 0) {
            const centerY = height / 2;
            ctx.fillStyle = '#38bdf8';

            const numSamples = slicedWave.length;
            const barWidth = Math.max(1, width / numSamples);

            for (let i = 0; i < numSamples; i++) {
                const v = Math.abs(slicedWave[i]);
                const barHeight = Math.max(1.5, v * (height / 2) * 1.8);
                const x = (i / numSamples) * width;

                ctx.fillRect(x, centerY - barHeight / 2, barWidth + 0.2, barHeight);
            }
        }

        drawMarkerLines(ctx, width, height, startTime, endTime, totalDuration);
    }

    // CANVAS 2: SPETTROGRAMMA MEL ULTRA HD CON INTERPOLAZIONE BILINEARE 2D SUB-PIXEL
    function drawSpectrogramWindowHD(specMatrix, startTime, endTime, totalDuration) {
        if (!specMatrix || specMatrix.length === 0) return;

        const ctx = spectrogramCanvas.getContext('2d');
        const numMels = specMatrix.length;
        const totalFrames = specMatrix[0].length;

        const parentW = spectrogramCanvas.parentElement.clientWidth || 1000;
        const canvasWidth = spectrogramCanvas.width = Math.max(300, parentW);
        const canvasHeight = spectrogramCanvas.height = 140;

        const startFrame = Math.floor((startTime / totalDuration) * totalFrames);
        const endFrame = Math.min(totalFrames, Math.ceil((endTime / totalDuration) * totalFrames));
        const visibleFrames = Math.max(1, endFrame - startFrame);

        const imgData = ctx.createImageData(canvasWidth, canvasHeight);
        const pixels = imgData.data;

        let minVal = Infinity, maxVal = -Infinity;
        for (let r = 0; r < numMels; r++) {
            for (let c = startFrame; c < Math.min(totalFrames, startFrame + visibleFrames); c++) {
                const val = specMatrix[r][c];
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
        }
        const range = (maxVal - minVal) || 1e-5;

        for (let x = 0; x < canvasWidth; x++) {
            const frameFloat = startFrame + (x / canvasWidth) * (visibleFrames - 1);
            const frame0 = Math.floor(frameFloat);
            const frame1 = Math.min(totalFrames - 1, frame0 + 1);
            const frameFrac = frameFloat - frame0;

            for (let y = 0; y < canvasHeight; y++) {
                const melBinFloat = ((canvasHeight - 1 - y) / canvasHeight) * (numMels - 1);
                const melR0 = Math.floor(melBinFloat);
                const melR1 = Math.min(numMels - 1, melR0 + 1);
                const melFrac = melBinFloat - melR0;

                const v00 = specMatrix[melR0][frame0];
                const v01 = specMatrix[melR0][frame1];
                const v10 = specMatrix[melR1][frame0];
                const v11 = specMatrix[melR1][frame1];

                const interpTime0 = v00 + frameFrac * (v01 - v00);
                const interpTime1 = v10 + frameFrac * (v11 - v10);
                const interpVal = interpTime0 + melFrac * (interpTime1 - interpTime0);

                const linearVal = (interpVal - minVal) / range;
                const boostedVal = Math.pow(Math.max(0, linearVal), contrastGamma);

                const rgb = getRGBPalette(boostedVal, selectedPalette);
                const pixelIdx = (y * canvasWidth + x) * 4;

                pixels[pixelIdx]     = rgb[0];
                pixels[pixelIdx + 1] = rgb[1];
                pixels[pixelIdx + 2] = rgb[2];
                pixels[pixelIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        drawMarkerLines(ctx, canvasWidth, canvasHeight, startTime, endTime, totalDuration);
    }

    // DISEGNO DELLE LINEE DEI MARKER A (VERDE) E B (ARANCIONE) CON MANIGLIE TRASCINABILI
    function drawMarkerLines(ctx, width, height, startTime, endTime, totalDuration) {
        const mA = parseFloat(markerAInput.value) || 0;
        const mB = parseFloat(markerBInput.value) || totalDuration;
        const visDur = (endTime - startTime) || 1e-5;

        if (mA >= startTime && mA <= endTime) {
            const xA = ((mA - startTime) / visDur) * width;
            ctx.strokeStyle = '#2ea043';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(xA, 0);
            ctx.lineTo(xA, height);
            ctx.stroke();

            ctx.fillStyle = '#2ea043';
            ctx.fillRect(xA - 7, 0, 14, 18);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px "Roboto Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('A', xA, 13);
        }

        if (mB >= startTime && mB <= endTime) {
            const xB = ((mB - startTime) / visDur) * width;
            ctx.strokeStyle = '#f0883e';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(xB, 0);
            ctx.lineTo(xB, height);
            ctx.stroke();

            ctx.fillStyle = '#f0883e';
            ctx.fillRect(xB - 7, 0, 14, 18);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px "Roboto Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('B', xB, 13);
        }
    }

    // PALETTE DI COLORI RGB AD ALTO CONTRASTO
    function getRGBPalette(val, palette) {
        const v = Math.max(0, Math.min(1, val));
        let r, g, b;

        if (palette === 'cyber') {
            if (v < 0.25) {
                const t = v / 0.25;
                r = Math.round(3 + t * 40); g = Math.round(7 + t * 10); b = Math.round(18 + t * 80);
            } else if (v < 0.55) {
                const t = (v - 0.25) / 0.30;
                r = Math.round(43 + t * 120); g = Math.round(17 + t * 20); b = Math.round(98 + t * 90);
            } else if (v < 0.85) {
                const t = (v - 0.55) / 0.30;
                r = Math.round(163 - t * 163); g = Math.round(37 + t * 208); b = Math.round(188 + t * 24);
            } else {
                const t = (v - 0.85) / 0.15;
                r = Math.round(t * 255); g = Math.round(245 + t * 10); b = Math.round(212 + t * 43);
            }
        } else if (palette === 'high_contrast') {
            if (v < 0.35) {
                return [0, 0, 0];
            } else {
                const t = (v - 0.35) / 0.65;
                r = 255;
                g = Math.round(215 + t * 40);
                b = Math.round(t * 255);
            }
        } else {
            if (v < 0.25) {
                const t = v / 0.25;
                r = Math.round(15 + t * 65); g = Math.round(10 + t * 10); b = Math.round(40 + t * 80);
            } else if (v < 0.5) {
                const t = (v - 0.25) / 0.25;
                r = Math.round(80 + t * 100); g = Math.round(20 + t * 30); b = Math.round(120 - t * 40);
            } else if (v < 0.75) {
                const t = (v - 0.5) / 0.25;
                r = Math.round(180 + t * 60); g = Math.round(50 + t * 90); b = Math.round(80 - t * 60);
            } else {
                const t = (v - 0.75) / 0.25;
                r = Math.round(240 + t * 15); g = Math.round(140 + t * 115); b = Math.round(20 + t * 200);
            }
        }

        return [r, g, b];
    }

    function getPaletteColor(val, palette) {
        const rgb = getRGBPalette(val, palette);
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    // HELPER UTILS
    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function formatSecToMin(sec) {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(1);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(4, '0')}`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Pre-carica il catalogo Foglio1 all'avvio in background
    loadFoglio1Catalog();
});
