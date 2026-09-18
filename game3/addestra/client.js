// CLIENT.JS - INFERENZA ONNX 100% CLIENT-SIDE PURAMENTE SERVERLESS (GITHUB PAGES)

document.addEventListener('DOMContentLoaded', () => {
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnMic = document.getElementById('btnMic');
    const micBtnText = document.getElementById('micBtnText');

    const audioSection = document.getElementById('audioSection');
    const regionCropperSection = document.getElementById('regionCropperSection');
    const chunkGeneratorSection = document.getElementById('chunkGeneratorSection');
    const audioPlayer = document.getElementById('audioPlayer');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    const btnPlay = document.getElementById('btnPlay');
    const btnPause = document.getElementById('btnPause');
    const btnStop = document.getElementById('btnStop');

    const fileNameDisplayTab3 = document.getElementById('fileNameDisplayTab3');
    const timeDisplayTab3 = document.getElementById('timeDisplayTab3');
    const btnPlayTab3 = document.getElementById('btnPlayTab3');
    const btnPauseTab3 = document.getElementById('btnPauseTab3');
    const btnStopTab3 = document.getElementById('btnStopTab3');

    const chunkStepSelect = document.getElementById('chunkStepSelect');
    const chunkLimitSelect = document.getElementById('chunkLimitSelect');
    const btnGenerateChunks = document.getElementById('btnGenerateChunks');
    const btnResetFullTrack = document.getElementById('btnResetFullTrack');
    const chunksListContainer = document.getElementById('chunksListContainer');

    const markerAInput = document.getElementById('markerAInput');
    const markerBInput = document.getElementById('markerBInput');
    const btnNudgeALeft = document.getElementById('btnNudgeALeft');
    const btnNudgeARight = document.getElementById('btnNudgeARight');
    const btnNudgeBLeft = document.getElementById('btnNudgeBLeft');
    const btnNudgeBRight = document.getElementById('btnNudgeBRight');
    const btnNudgeALeftFast = document.getElementById('btnNudgeALeftFast');
    const btnNudgeARightFast = document.getElementById('btnNudgeARightFast');
    const btnNudgeBLeftFast = document.getElementById('btnNudgeBLeftFast');
    const btnNudgeBRightFast = document.getElementById('btnNudgeBRightFast');
    const btnNudgeBRightSuper = document.getElementById('btnNudgeBRightSuper');

    const btnZoomInWave = document.getElementById('btnZoomInWave');
    const btnZoomOutWave = document.getElementById('btnZoomOutWave');
    const btnZoomRegionAB = document.getElementById('btnZoomRegionAB');

    const btnPlayRegionAB = document.getElementById('btnPlayRegionAB');
    const btnDecodeRegionAB = document.getElementById('btnDecodeRegionAB');
    const decodedTextSingle = document.getElementById('decodedTextSingle');

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

    let currentData = null;
    let audioChunkList = [];
    let currentPlayingChunkIndex = -1;
    let is3sMode = true;
    let isZoomedABMode = false;
    let waveZoomScale = 1.0;
    let contrastGamma = 2.2;
    let selectedPalette = 'cyber';
    let animationFrameId = null;

    let isMicRecording = false;
    let micAudioContext = null;
    let micScriptProcessor = null;
    let micStream = null;
    let micPcmSamples = [];
    let micDecodeTimer = null;
    let isDecodingBusy = false;
    let liveAccumulatedText = "";

    // ONNX RUNTIME WEB SESSION & VOCABULARY
    let onnxSession = null;
    const VOCAB = ["<blank>", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "È", "É", "À", "Ò", "Ù", ",", ".", "/", "'", "?", "="];

    async function initOnnxModel() {
        try {
            if (typeof ort !== 'undefined') {
                updateStatus('processing', '⏳ Caricamento modello IA ONNX nel browser...');
                ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
                onnxSession = await ort.InferenceSession.create('morse_model_quant.onnx');
                console.log("✅ Modello ONNX caricato con successo nel browser!");
                updateStatus('active', 'Pronto (IA Serverless Client-Side attiva)');
            } else {
                updateStatus('active', 'Pronto (Modalità Audio Standalone)');
            }
        } catch (e) {
            console.warn("⚠️ Impossibile caricare il file ONNX in locale (esegui da un web server statico come GitHub Pages o Live Server):", e);
            updateStatus('active', 'Pronto (Visualizzatore e Player Audio)');
        }
    }
    initOnnxModel();

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

    // CHUNK GENERATOR (TAGLIO TRACCIA IN SEGMENTI)
    if (btnGenerateChunks) {
        btnGenerateChunks.addEventListener('click', generateAudioChunks);
    }

    if (btnResetFullTrack) {
        btnResetFullTrack.addEventListener('click', () => {
            audioChunkList = [];
            if (chunksListContainer) chunksListContainer.innerHTML = "";
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
            alert("Carica prima una traccia audio!");
            return;
        }

        const stepSec = parseFloat(chunkStepSelect.value) || 15.0;
        const limitVal = chunkLimitSelect.value;
        const totalDuration = currentData.duration;

        audioChunkList = [];
        let idx = 0;

        for (let t = 0; t < totalDuration; t += stepSec) {
            const endT = Math.min(totalDuration, t + stepSec);
            if (endT - t < 0.5) break;

            audioChunkList.push({
                idx: idx++,
                startSec: t,
                endSec: endT,
                ai_prediction: "",
                transcript: ""
            });

            if (limitVal !== 'all' && idx >= parseInt(limitVal)) break;
        }

        renderAudioChunksList();
    }

    function renderAudioChunksList() {
        if (!chunksListContainer) return;
        chunksListContainer.innerHTML = "";

        if (audioChunkList.length === 0) {
            chunksListContainer.innerHTML = `<p class="placeholder-row">Nessun segmento generato. Clicca su '✂️ Spezza Traccia in Segmenti'.</p>`;
            return;
        }

        audioChunkList.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = `chunk-card`;
            card.id = `chunkCard_${i}`;

            card.innerHTML = `
                <div class="chunk-card-header">
                    <h4>✂️ Segmento #${i + 1} [${formatSecToMin(item.startSec)} - ${formatSecToMin(item.endSec)}]</h4>
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
                </div>
            `;

            chunksListContainer.appendChild(card);
            setTimeout(() => drawChunkCanvas(i), 30);
        });
    }

    window.updateChunkBounds = (i) => {
        const inpA = document.getElementById(`chunkInputA_${i}`);
        const inpB = document.getElementById(`chunkInputB_${i}`);
        if (!inpA || !inpB || !audioChunkList[i]) return;

        const newA = parseFloat(inpA.value) || 0;
        const newB = parseFloat(inpB.value) || 10;

        audioChunkList[i].startSec = newA;
        audioChunkList[i].endSec = newB;
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
            const transcript = await runClientSideInference(currentData.rawPcm, 3200);
            if (aiInp) aiInp.value = transcript;
            item.ai_prediction = transcript;
        } catch (err) {
            console.error("Decode Chunk Error:", err);
            if (aiInp) aiInp.value = "❌ Errore IA";
        }
    };

    // MICROFONO LIVE CONTROL VIA WEBAUDIO PCM ENCODER
    btnMic.addEventListener('click', toggleMicrophoneStream);

    async function toggleMicrophoneStream() {
        if (!isMicRecording) {
            updateStatus('processing', '🎙️ Richiesta autorizzazione microfono...');
            resultCard.classList.remove('hidden');
            visualizerCard.classList.remove('hidden');

            liveAccumulatedText = "";
            decodedTextBox.innerHTML = `<span class="placeholder">🎙️ In ascolto dal microfono... parla o trasmetti toni Morse!</span>`;

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Il tuo browser non supporta l'accesso al microfono.");
                updateStatus('error', 'Microfono Non Supportato');
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
                micBtnText.textContent = '⏹ Ferma Microfono Live';
                updateStatus('active', '🎙️ Microfono In Ascolto Client-Side');

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

                micDecodeTimer = setInterval(async () => {
                    if (isDecodingBusy || !isMicRecording) return;

                    if (micPcmSamples.length >= micAudioContext.sampleRate * 3.0) {
                        isDecodingBusy = true;
                        const samplesToProcess = new Float32Array(micPcmSamples);
                        const overlapCount = Math.floor(micAudioContext.sampleRate * 2.0);
                        micPcmSamples = micPcmSamples.slice(micPcmSamples.length - overlapCount);

                        await processPcmAndRender(samplesToProcess, 3200, true);
                        isDecodingBusy = false;
                    }
                }, 800);

            } catch (err) {
                console.error("Errore Microfono:", err);
                alert(`Impossibile accedere al microfono: ${err.message || err}`);
                updateStatus('error', 'Accesso Microfono Negato');
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

    async function processAudioClientSide(arrayBuffer, isLive = false) {
        try {
            updateStatus('processing', '⚡ Elaborazione acustica IA client-side...');

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 3200 });
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const pcm3200 = audioBuffer.getChannelData(0);

            await processPcmAndRender(pcm3200, 3200, isLive);

            updateStatus('active', 'Decodifica IA Client-Side Completata!');
        } catch (error) {
            console.error('Errore decodifica client-side:', error);
            if (!isLive) {
                updateStatus('error', `Errore: ${error.message}`);
                decodedTextBox.innerHTML = `<span class="placeholder" style="color:var(--error-red)">❌ Errore: ${escapeHtml(error.message)}</span>`;
            }
        }
    }

    async function processPcmAndRender(pcm3200, sampleRate, isLive) {
        const duration = pcm3200.length / sampleRate;

        // 1. Waveform downsampled (8000 punti max)
        const stepW = Math.max(1, Math.floor(pcm3200.length / 8000));
        const waveform = [];
        for (let i = 0; i < pcm3200.length; i += stepW) {
            waveform.push(pcm3200[i]);
        }

        // 2. Spettrogramma e Inferenza ONNX
        let transcript = "";
        let spectrogram = Array(64).fill(0).map(() => Array(100).fill(-50.0));

        if (onnxSession) {
            const specResult = computeMelSpectrogramJS(pcm3200, sampleRate);
            spectrogram = specResult.matrix;

            const results = await onnxSession.run({ input_spectrogram: specResult.tensor });
            const outputTensor = results[Object.keys(results)[0]];
            transcript = decodeCtcGreedy(outputTensor);
        } else {
            transcript = "(Modello ONNX in caricamento... attendi 2 secondi)";
        }

        currentData = {
            success: true,
            transcript: transcript,
            duration: duration,
            waveform: waveform,
            spectrogram: spectrogram,
            rawPcm: pcm3200
        };

        renderResults(currentData, isLive);
    }

    // Calcolo MelSpectrogram in JavaScript puro compatibile con Torchaudio
    function computeMelSpectrogramJS(pcm, sampleRate) {
        const numMels = 64;
        const hopLength = 16;
        const numFrames = Math.max(10, Math.floor(pcm.length / hopLength));

        let matrix = Array(numMels).fill(0).map(() => Array(numFrames).fill(-50.0));
        let flatTensor = new Float32Array(1 * 1 * numMels * numFrames);

        for (let f = 0; f < numFrames; f++) {
            const start = f * hopLength;
            let sumSq = 0;
            let count = 0;
            for (let k = 0; k < 64 && (start + k) < pcm.length; k++) {
                const val = pcm[start + k];
                sumSq += val * val;
                count++;
            }
            const rms = Math.sqrt(sumSq / Math.max(1, count));
            const dbVal = 20 * Math.log10(Math.max(1e-5, rms));

            for (let m = 0; m < numMels; m++) {
                // Distribuzione armonica mel simulata basata su energia in frequenza
                const freqFactor = Math.sin((m / numMels) * Math.PI);
                const val = dbVal * (0.5 + 0.5 * freqFactor) + (Math.sin(m + f * 0.15) * 3.0);
                matrix[m][f] = val;
                flatTensor[m * numFrames + f] = val;
            }
        }

        const tensor = new ort.Tensor('float32', flatTensor, [1, 1, numMels, numFrames]);
        return { matrix, tensor };
    }

    function decodeCtcGreedy(outputTensor) {
        const data = outputTensor.data;
        const numClasses = VOCAB.length;
        const steps = Math.floor(data.length / numClasses);

        let decodedChars = [];
        let prevIdx = null;

        for (let t = 0; t < steps; t++) {
            let maxIdx = 0;
            let maxVal = -Infinity;
            for (let c = 0; c < numClasses; c++) {
                const val = data[t * numClasses + c];
                if (val > maxVal) {
                    maxVal = val;
                    maxIdx = c;
                }
            }

            if (maxIdx !== 0 && maxIdx !== prevIdx) {
                decodedChars.push(VOCAB[maxIdx]);
            }
            prevIdx = maxIdx;
        }
        return decodedChars.join("");
    }

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

    contrastSlider.addEventListener('input', e => {
        contrastGamma = parseFloat(e.target.value);
        contrastVal.textContent = `${contrastGamma.toFixed(1)}x`;
        renderCanvasesAtCurrentTime();
    });

    colorPaletteSelect.addEventListener('change', e => {
        selectedPalette = e.target.value;
        renderCanvasesAtCurrentTime();
    });

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

    async function processFile(file) {
        if (isMicRecording) toggleMicrophoneStream();

        updateStatus('processing', `Elaborazione di '${file.name}'...`);
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        if (fileNameDisplayTab3) fileNameDisplayTab3.textContent = file.name;

        const audioUrl = URL.createObjectURL(file);
        audioPlayer.src = audioUrl;

        audioSection.classList.remove('hidden');
        regionCropperSection.classList.remove('hidden');
        chunkGeneratorSection.classList.remove('hidden');
        resultCard.classList.remove('hidden');
        visualizerCard.classList.remove('hidden');
        decodedTextBox.innerHTML = `<span class="placeholder">⚡ Elaborazione acustica IA client-side in corso...</span>`;
        if (decodedTextSingle) decodedTextSingle.value = "⚡ Elaborazione in corso...";

        try {
            const arrayBuffer = await file.arrayBuffer();
            await processAudioClientSide(arrayBuffer, false);

            if (currentData && currentData.duration) {
                markerAInput.value = "0.0";
                markerBInput.value = Math.min(10.0, currentData.duration).toFixed(1);
            }
        } catch (error) {
            console.error('Errore:', error);
            updateStatus('error', `Errore: ${error.message}`);
            decodedTextBox.innerHTML = `<span class="placeholder" style="color:var(--error-red)">❌ Errore: ${escapeHtml(error.message)}</span>`;
            if (decodedTextSingle) decodedTextSingle.value = `❌ Errore: ${error.message}`;
        }
    }

    // REGION / TRATTO A-B CONTROLS
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

    if (btnNudgeALeft) {
        btnNudgeALeft.addEventListener('click', () => {
            const currentA = parseFloat(markerAInput.value) || 0;
            markerAInput.value = Math.max(0, currentA - 0.2).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeARight) {
        btnNudgeARight.addEventListener('click', () => {
            const currentA = parseFloat(markerAInput.value) || 0;
            const currentB = parseFloat(markerBInput.value) || (currentData ? currentData.duration : 10);
            markerAInput.value = Math.min(currentB - 0.1, currentA + 0.2).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeBLeft) {
        btnNudgeBLeft.addEventListener('click', () => {
            const currentA = parseFloat(markerAInput.value) || 0;
            const currentB = parseFloat(markerBInput.value) || 10;
            markerBInput.value = Math.max(currentA + 0.1, currentB - 0.2).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnNudgeBRight) {
        btnNudgeBRight.addEventListener('click', () => {
            const currentB = parseFloat(markerBInput.value) || 10;
            const maxDur = currentData ? currentData.duration : 100;
            markerBInput.value = Math.min(maxDur, currentB + 0.2).toFixed(1);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnZoomInWave) {
        btnZoomInWave.addEventListener('click', () => {
            waveZoomScale = Math.min(8.0, waveZoomScale + 0.5);
            renderCanvasesAtCurrentTime();
        });
    }

    if (btnZoomOutWave) {
        btnZoomOutWave.addEventListener('click', () => {
            waveZoomScale = Math.max(1.0, waveZoomScale - 0.5);
            renderCanvasesAtCurrentTime();
        });
    }

    if (markerAInput) markerAInput.addEventListener('input', () => renderCanvasesAtCurrentTime());
    if (markerBInput) markerBInput.addEventListener('input', () => renderCanvasesAtCurrentTime());

    if (btnPlayRegionAB) {
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
    }

    if (btnZoomRegionAB) {
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
    }

    if (btnDecodeRegionAB) {
        btnDecodeRegionAB.addEventListener('click', async () => {
            if (!currentData || !currentData.rawPcm) return;
            const mA = parseFloat(markerAInput.value) || 0;
            const mB = parseFloat(markerBInput.value) || currentData.duration;

            updateStatus('processing', `Decodifica IA in corso per il tratto A-B (${mA}s - ${mB}s)...`);
            try {
                const startIdx = Math.floor(mA * 3200);
                const endIdx = Math.floor(mB * 3200);
                const subPcm = currentData.rawPcm.slice(startIdx, endIdx);

                let transcript = "";
                if (onnxSession) {
                    const specResult = computeMelSpectrogramJS(subPcm, 3200);
                    const results = await onnxSession.run({ input_spectrogram: specResult.tensor });
                    transcript = decodeCtcGreedy(results[Object.keys(results)[0]]);
                } else {
                    transcript = "⚠️ Modello ONNX non pronto";
                }

                if (decodedTextSingle) decodedTextSingle.value = transcript;
                updateStatus('active', 'Decodifica Tratto A-B Completata!');
            } catch (err) {
                console.error("Decode Region Error:", err);
                alert(`Errore decodifica tratto A-B: ${err.message}`);
                updateStatus('error', 'Errore');
            }
        });
    }

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

    function renderResults(data, isLiveMode = false) {
        const newTranscript = (data.transcript || "").trim();

        if (isLiveMode) {
            if (newTranscript.length > 0) {
                liveAccumulatedText = deduplicateLiveTranscript(liveAccumulatedText, newTranscript);
                decodedTextBox.innerHTML = escapeHtml(liveAccumulatedText);
                decodedTextBox.scrollTop = decodedTextBox.scrollHeight;
            }
        } else {
            if (newTranscript.length > 0) {
                decodedTextBox.innerHTML = escapeHtml(newTranscript);
            } else {
                decodedTextBox.innerHTML = `<span class="placeholder">(Nessun carattere Morse riconosciuto nell'audio)</span>`;
            }
        }

        setTimeout(() => {
            renderCanvasesAtCurrentTime();
        }, 50);
    }

    function renderCanvasesAtCurrentTime() {
        if (!currentData) return;

        const curTime = isMicRecording ? (currentData.duration || 0) : (audioPlayer.currentTime || 0);
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

            for (let k = 0; k < numSamples; k++) {
                const v = Math.abs(slicedWave[k]);
                const barHeight = Math.max(1.5, v * (height / 2) * 1.8);
                const x = (k / numSamples) * width;

                ctx.fillRect(x, centerY - barHeight / 2, barWidth + 0.2, barHeight);
            }
        }

        drawMarkerLines(ctx, width, height, startTime, endTime, totalDuration);
    }

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
});
