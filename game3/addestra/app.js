// ==============================================================================
// DEEPCW IA DECODER (100% Client-Side ONNX Web + AudioWorklet Thread)
// ==============================================================================

function screenLog(msg, isErr = false, isWarn = false) {
    if (isErr) console.error(`[DeepCW IA] ${msg}`);
    else if (isWarn) console.warn(`[DeepCW IA] ${msg}`);
    else console.log(`[DeepCW IA] ${msg}`);
}

window.onerror = function(msg, url, line) {
    console.error(`[DeepCW IA JS ERROR] ${msg} (Linea: ${line})`);
    return false;
};

// 48-Class PyTorch Cloned Vocabulary List
const VOCAB = ["<BLANK>", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "É", "À", "Ò", "Ù", ",", ".", "/", "'", "?", "=", " "];

let ortSession = null;
let audioCtx = null;
let streamRef = null;
let workletNode = null;
let isRunning = false;
let isWorkletRegistered = false;
let isProcessingInference = false;
let totalRecordedSamples = 0;

let currentInputGain = 1.0;
let selectedDeviceId = "default";

let currentRmsVolume = 0.0;
let vuMeterAnimationFrame = null;

function drawVuMeterSmooth() {
    if (!isRunning) return;

    const vuBar = document.getElementById('vu-bar');
    const vuVal = document.getElementById('vu-val');
    const volumePct = Math.min(100, Math.round(currentRmsVolume * 400));

    if (vuBar) vuBar.style.width = volumePct + '%';
    if (vuVal) vuVal.innerText = volumePct + '%';

    vuMeterAnimationFrame = requestAnimationFrame(drawVuMeterSmooth);
}

const SAMPLE_RATE = 3200;
const liveBuffer = new Float32Array(SAMPLE_RATE * 5); // 5-second sliding window at 3.2kHz
let bufferPos = 0;
let audioBufferVersion = 0;
let lastProcessedVersion = -1;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

async function changeOnnxModel(event) {
    const selectedFile = event.target.value;
    screenLog(`🤖 Cambio Modello IA selezionato dall'utente: '${selectedFile}'...`);
    await loadONNX(selectedFile);
}

// Load ONNX Model Session
async function loadONNX(forcedModelPath = null) {
    const statusLabel = document.getElementById('model-status');
    try {
        screenLog("Configurazione runtime WASM ONNX...");
        if (statusLabel) {
            statusLabel.innerText = "⏳ Caricamento in RAM...";
            statusLabel.style.backgroundColor = "#451a03";
            statusLabel.style.color = "#facc15";
        }

        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

        const modelCandidates = forcedModelPath ? [forcedModelPath] : ['morse_model8.onnx', 'morse_model_int8.onnx', 'morse_model.onnx'];

        for (let mPath of modelCandidates) {
            try {
                screenLog(`Caricamento modello '${mPath}' in RAM...`);
                ortSession = await ort.InferenceSession.create(mPath, { executionProviders: ['wasm'] });
                screenLog(`✓ Modello ONNX '${mPath}' caricato con successo in RAM!`);
                if (statusLabel) {
                    statusLabel.innerText = `✅ Modello '${mPath}' Pronto!`;
                    statusLabel.style.backgroundColor = "#14532d";
                    statusLabel.style.color = "#4ade80";
                }
                break;
            } catch (e) {
                screenLog(`Tentativo caricamento '${mPath}' non riuscito, provo alternativa...`, false, true);
            }
        }

        if (!ortSession && statusLabel) {
            statusLabel.innerText = "❌ Errore Modello";
            statusLabel.style.backgroundColor = "#7f1d1d";
            statusLabel.style.color = "#f87171";
            screenLog("ERRORE: Impossibile trovare o caricare il file ONNX!", true);
        }
    } catch (err) {
        if (statusLabel) {
            statusLabel.innerText = "❌ Fallito";
            statusLabel.style.backgroundColor = "#7f1d1d";
            statusLabel.style.color = "#f87171";
        }
        screenLog("ERRORE CRITICO ONNX: " + err.message, true);
    }
}

// Enumerate Connected Input Devices
async function populateAudioDevicesList() {
    const select = document.getElementById('audioSourceSelect');
    if (!select) return;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');

        select.innerHTML = '<option value="default" selected>Predefinito / Missaggio Stereo</option>';
        audioInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.innerText = dev.label || `Ingresso Audio #${idx + 1}`;
            select.appendChild(opt);
        });
    } catch (e) {
        screenLog("Avviso elencazione dispositivi audio: " + e.message, false, true);
    }
}

async function startSystem() {
    if (isRunning) return;
    document.getElementById('btn-start').disabled = true;

    try {
        screenLog("Richiesta accesso all'ingresso audio/microfono...");
        const constraints = {
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
        };

        const devSelect = document.getElementById('audioSourceSelect');
        if (devSelect && devSelect.value && devSelect.value !== 'default') {
            constraints.audio.deviceId = { exact: devSelect.value };
        }

        streamRef = await navigator.mediaDevices.getUserMedia(constraints);

        audioCtx = getAudioContext();
        window.__globalMicSource = audioCtx.createMediaStreamSource(streamRef);

        if (!isWorkletRegistered) {
            const workletCode = `
                class MicReader extends AudioWorkletProcessor {
                    process(inputs, outputs) {
                        if (inputs[0] && inputs[0][0] && inputs[0][0].length > 0) {
                            this.port.postMessage(new Float32Array(inputs[0][0]));
                        }
                        if (outputs[0] && outputs[0][0]) {
                            outputs[0][0].fill(0); // Previene ibernazione nodo
                        }
                        return true;
                    }
                }
                registerProcessor('mic-reader', MicReader);
            `;
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            await audioCtx.audioWorklet.addModule(URL.createObjectURL(blob));
            isWorkletRegistered = true;
        }

        workletNode = new AudioWorkletNode(audioCtx, 'mic-reader');
        window.__globalMicSource.connect(workletNode);
        workletNode.connect(audioCtx.destination);

        bufferPos = 0;
        totalRecordedSamples = 0;
        liveBuffer.fill(0);

        workletNode.port.onmessage = (e) => {
            if (!isRunning) return;
            const data = e.data;
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
                let val = data[i] * currentInputGain;
                if (isNaN(val) || !isFinite(val)) val = 0;
                sumSq += val * val;
                liveBuffer[bufferPos] = val;
                bufferPos = (bufferPos + 1) % liveBuffer.length;
            }
            totalRecordedSamples += data.length;
            audioBufferVersion++; // Signal new audio version
            currentRmsVolume = Math.sqrt(sumSq / Math.max(1, data.length));
        };

        isRunning = true;
        isProcessingInference = false;
        document.getElementById('btn-stop').disabled = false;
        document.getElementById('audio-status').innerText = "🟢 Ascolto Live Attivo";
        document.getElementById('audio-status').style.color = "#4ade80";

        const outBox = document.getElementById('output-box');
        if (outBox && (outBox.innerText.includes("In attesa") || outBox.innerText.length === 0)) {
            outBox.innerText = "";
        }

        drawVuMeterSmooth();

        screenLog("Audio connesso ed attivo. Avvio loop di decodifica asincrono...");
        startAsyncDecodeLoop();

    } catch (err) {
        screenLog("ERRORE ACCESSO AUDIO: " + err.message, true);
        document.getElementById('btn-start').disabled = false;
    }
}

function stopSystem() {
    isRunning = false;
    if (workletNode) workletNode.disconnect();
    if (window.__globalMicSource) window.__globalMicSource.disconnect();
    if (streamRef) streamRef.getTracks().forEach(t => t.stop());

    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('audio-status').innerText = "🔴 Fermo";
    document.getElementById('audio-status').style.color = "#f87171";
    document.getElementById('vu-bar').style.width = '0%';
    const vuVal = document.getElementById('vu-val');
    if (vuVal) vuVal.innerText = '0%';
    screenLog("Ascolto audio fermato dall'utente.");
}

function changeAudioSourceDevice(event) {
    selectedDeviceId = event.target.value;
    if (isRunning) {
        stopSystem();
        startSystem();
    }
}

function updateInputGain(event) {
    currentInputGain = parseFloat(event.target.value) || 1.0;
    const label = document.getElementById('inputGainVal');
    if (label) label.innerText = `${Math.round(currentInputGain * 100)}%`;
}

// 2-Pole Butterworth CW Bandpass Filter (300 Hz - 1100 Hz)
function applyCwBandpassFilterJS(audioData, sampleRate = 3200, minFreq = 300, maxFreq = 1100) {
    if (!audioData || audioData.length === 0) return audioData;

    const f0 = (minFreq + maxFreq) / 2.0;
    const bw = maxFreq - minFreq;
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const alpha = Math.sin(w0) * Math.sinh((Math.LN2 / 2) * (bw / f0) * (w0 / Math.sin(w0)));

    const b0 = alpha, b1 = 0, b2 = -alpha;
    const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;

    const filtered = new Float32Array(audioData.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < audioData.length; i++) {
        const x0 = audioData[i];
        const y0 = (b0/a0)*x0 + (b1/a0)*x1 + (b2/a0)*x2 - (a1/a0)*y1 - (a2/a0)*y2;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
        filtered[i] = isNaN(y0) || !isFinite(y0) ? 0 : y0;
    }

    return filtered;
}

// Async Version-Polling Loop (Pure Non-Blocking Version Sync)
async function startAsyncDecodeLoop() {
    while (isRunning) {
        if (audioBufferVersion === lastProcessedVersion || isProcessingInference) {
            await new Promise(r => setTimeout(r, 20));
            continue;
        }

        lastProcessedVersion = audioBufferVersion;

        try {
            isProcessingInference = true;

            // Extract ONLY active recorded samples from circular buffer (prevents unwritten zeros corruption!)
            const activeLen = Math.min(totalRecordedSamples, liveBuffer.length);
            if (activeLen < 3200) { // Wait for at least 1 second of recorded audio
                await new Promise(r => setTimeout(r, 50));
                continue;
            }

            const alignedBuffer = new Float32Array(activeLen);
            const startIdx = (bufferPos - activeLen + liveBuffer.length) % liveBuffer.length;
            for (let i = 0; i < activeLen; i++) {
                alignedBuffer[i] = liveBuffer[(startIdx + i) % liveBuffer.length];
            }

            // 1. Direct Native 3200 Hz Audio Buffer
            let audio3200 = applyCwBandpassFilterJS(alignedBuffer, 3200, 300, 1100);

            // 2. Controllo Automatico di Guadagno RMS (AGC) con Gate di Silenzio
            let sumSq = 0.0;
            let activeSamples = 0;
            for (let i = 0; i < audio3200.length; i++) {
                const val = audio3200[i];
                if (Math.abs(val) > 0.0005) {
                    sumSq += val * val;
                    activeSamples++;
                }
            }

            const rmsVal = Math.sqrt(sumSq / Math.max(1, activeSamples));
            if (rmsVal >= 0.02) { // Se c'è un segnale CW reale sopra il rumore di fondo
                const agcGain = Math.min(10.0, 0.25 / rmsVal);
                for (let i = 0; i < audio3200.length; i++) {
                    audio3200[i] = Math.max(-1.0, Math.min(1.0, audio3200[i] * agcGain));
                }
            } else {
                for (let i = 0; i < audio3200.length; i++) {
                    audio3200[i] *= 0.2;
                }
            }

            // 4. Inferenza ONNX con Spettrogramma 100% PyTorch Identico
            if (ortSession) {
                const melSpec = computeMelSpectrogramJS(audio3200, 3200, 64);
                const inputTensor = new ort.Tensor('float32', melSpec.data, [1, 1, 64, melSpec.timeSteps]);

                const inputName = (ortSession.inputNames && ortSession.inputNames.length > 0) ? ortSession.inputNames[0] : 'spectrogram';
                const feeds = {};
                feeds[inputName] = inputTensor;

                const results = await ortSession.run(feeds);
                const outKey = Object.keys(results)[0];
                const outTensor = results[outKey];

                const resultText = ctcGreedyDecodeJS(outTensor.data, outTensor.dims);

                const cleanText = resultText.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim();

                if (cleanText) {
                    const outBox = document.getElementById('output-box');
                    if (outBox.innerText === "In attesa del segnale audio...") outBox.innerText = "";

                    const words = cleanText.split(/\s+/);
                    const currentText = outBox.innerText.trim();
                    const lastWord = currentText ? currentText.split(/\s+/).pop() : "";

                    for (let w of words) {
                        if (w && w !== lastWord) {
                            outBox.innerText += w + " ";
                            outBox.scrollTop = outBox.scrollHeight;
                        }
                    }
                }
            }
        } catch (e) {
            screenLog("Errore ciclo di decodifica: " + e.message, true);
        } finally {
            isProcessingInference = false;
        }
    }
}

// 100% PyTorch-Identical Real STFT & Mel Spectrogram Transformer at 3,200Hz
function computeMelSpectrogramJS(samples, sampleRate = 3200, nMels = 64) {
    const fftSize = 128;
    const winLength = 64;
    const hopSize = 16;
    const nFreqs = 65; // (128 / 2) + 1

    const hannWindow = new Float32Array(winLength);
    for (let i = 0; i < winLength; i++) {
        hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / winLength));
    }

    function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
    function melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

    const minMel = hzToMel(0.0);
    const maxMel = hzToMel(1600.0); // Nyquist frequency at 3200Hz SR
    const melPoints = new Float32Array(nMels + 2);
    for (let i = 0; i < nMels + 2; i++) {
        melPoints[i] = melToHz(minMel + (i / (nMels + 1)) * (maxMel - minMel));
    }

    const binPoints = new Float32Array(nMels + 2);
    for (let i = 0; i < nMels + 2; i++) {
        binPoints[i] = Math.floor(((fftSize + 1) * melPoints[i]) / sampleRate);
    }

    const filterbank = new Float32Array(nMels * nFreqs);
    for (let m = 0; m < nMels; m++) {
        const fMin = binPoints[m];
        const fCenter = binPoints[m + 1];
        const fMax = binPoints[m + 2];

        for (let k = fMin; k < fCenter; k++) {
            if (k >= 0 && k < nFreqs && (fCenter - fMin) > 0) {
                filterbank[m * nFreqs + k] = (k - fMin) / (fCenter - fMin);
            }
        }
        for (let k = fCenter; k < fMax; k++) {
            if (k >= 0 && k < nFreqs && (fMax - fCenter) > 0) {
                filterbank[m * nFreqs + k] = (fMax - k) / (fMax - fCenter);
            }
        }
    }

    const timeSteps = Math.floor(samples.length / hopSize) + 1;
    const powerSpec = new Float32Array(nFreqs * timeSteps);

    for (let t = 0; t < timeSteps; t++) {
        const frameStart = t * hopSize - Math.floor(winLength / 2);

        for (let k = 0; k < nFreqs; k++) {
            let re = 0.0, im = 0.0;
            const omega = (2 * Math.PI * k) / fftSize;

            for (let n = 0; n < winLength; n++) {
                const sampleIdx = frameStart + n;
                const sampleVal = (sampleIdx >= 0 && sampleIdx < samples.length) ? samples[sampleIdx] : 0.0;
                const windowedVal = sampleVal * hannWindow[n];

                re += windowedVal * Math.cos(omega * n);
                im -= windowedVal * Math.sin(omega * n);
            }

            powerSpec[k * timeSteps + t] = (re * re + im * im);
        }
    }

    const specData = new Float32Array(nMels * timeSteps);
    let sumVal = 0.0, sumSq = 0.0, totalCount = nMels * timeSteps;

    for (let m = 0; m < nMels; m++) {
        for (let t = 0; t < timeSteps; t++) {
            let melEnergy = 0.0;
            for (let k = 0; k < nFreqs; k++) {
                melEnergy += powerSpec[k * timeSteps + t] * filterbank[m * nFreqs + k];
            }
            // AmplitudeToDB (10 * log10(max(1e-10, energy))) matching PyTorch torchaudio.transforms.AmplitudeToDB()
            const dbVal = 10.0 * Math.log10(Math.max(1e-10, melEnergy));
            specData[m * timeSteps + t] = dbVal;

            sumVal += dbVal;
            sumSq += dbVal * dbVal;
        }
    }

    // Z-Score Normalization (spec - mean) / (std + 1e-5) matching PyTorch dataset.py
    const mean = sumVal / Math.max(1, totalCount);
    const variance = (sumSq / Math.max(1, totalCount)) - (mean * mean);
    const std = Math.sqrt(Math.max(1e-5, variance));

    for (let i = 0; i < totalCount; i++) {
        specData[i] = (specData[i] - mean) / (std + 1e-5);
    }

    return { data: specData, timeSteps: timeSteps };
}

// CTC Greedy Decoder (Layout [T, B, C] e [B, T, C])
function ctcGreedyDecodeJS(logitsData, dims) {
    if (!dims || dims.length === 0) return "";

    let T = 1;
    let C = VOCAB.length;

    if (dims.length >= 3) {
        if (dims[0] > dims[1]) {
            T = dims[0]; // PyTorch CRNN export layout [T=188, B=1, C=48]
            C = dims[2];
        } else {
            T = dims[1]; // Standard layout [B=1, T=188, C=48]
            C = dims[2];
        }
    } else if (dims.length === 2) {
        T = dims[0];
        C = dims[1];
    }

    const argmax = new Int32Array(T);
    for (let t = 0; t < T; t++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        for (let c = 0; c < C; c++) {
            const val = logitsData[t * C + c];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = c;
            }
        }
        argmax[t] = maxIdx;
    }

    let decoded = "";
    let prev = -1;
    for (let t = 0; t < T; t++) {
        const idx = argmax[t];
        if (idx !== 0 && idx !== prev) { // 0 = <BLANK>
            if (idx < VOCAB.length && VOCAB[idx] !== "<BLANK>" && VOCAB[idx] !== "<UNK>") {
                decoded += VOCAB[idx];
            }
        }
        prev = idx;
    }

    return decoded;
}

function playTestCwBeep() {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 650;

        const dot = 0.08;
        const dash = 0.24;
        let t = ctx.currentTime + 0.1;

        // C (-.-.)
        t = addBeep(gain, t, dash); t += dot;
        t = addBeep(gain, t, dot); t += dot;
        t = addBeep(gain, t, dash); t += dot;
        t = addBeep(gain, t, dot); t += dash;

        // Q (--.-)
        t = addBeep(gain, t, dash); t += dot;
        t = addBeep(gain, t, dash); t += dot;
        t = addBeep(gain, t, dot); t += dot;
        t = addBeep(gain, t, dash);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + 0.1);
        osc.stop(t + 0.2);

        injectAudioBufferToDecoder(650, (t - ctx.currentTime) + 0.5);
        screenLog("🔊 Generato Bip di Prova CW 'CQ'!");
    } catch (e) {
        screenLog("Avviso Bip Prova: " + e.message, false, true);
    }
}

function addBeep(gain, startTime, duration) {
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.4, startTime + 0.005);
    gain.gain.setValueAtTime(0.4, startTime + duration - 0.005);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    return startTime + duration;
}

function injectAudioBufferToDecoder(freq = 650, durationSec = 2.5) {
    const sr = 3200;
    const numSamples = Math.floor(sr * durationSec);
    const twoPiF = 2 * Math.PI * freq;

    for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin((i / sr) * twoPiF) * 0.4;
        liveBuffer[bufferPos] = sample;
        bufferPos = (bufferPos + 1) % liveBuffer.length;
    }
    audioBufferVersion++;
}

window.onload = function() {
    populateAudioDevicesList();
    loadONNX();
};
