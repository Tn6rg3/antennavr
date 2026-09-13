// ==============================================================================
// DEEPCW IA STANDALONE WEB DECODER (100% Client-Side WebAudio + ONNX Web + DSP)
// ==============================================================================

const VOCAB = ["<BLANK>", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "É", "À", "Ò", "Ù", ",", ".", "/", "'", "?", "=", " ", "<UNK>"];

const MORSE_CODE_MAP = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F",
    "--.": "G", "....": "H", "..": "I", ".---": "J", "-.-": "K", ".-..": "L",
    "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R",
    "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X",
    "-.--": "Y", "--..": "Z", "-----": "0", ".----": "1", "..---": "2",
    "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7",
    "---..": "8", "----.": "9", ".-..-": "É", ".--.-": "À", "---.": "Ò",
    "..-.-": "Ù", "--..--": ",", ".-.-.-": ".", "-..-.": "/", ".----.": "'",
    "..--..": "?", "-...-": "="
};

let ortSession = null;
let audioCtx = null;
let activeAudioStream = null;
let scriptProcessorNode = null;

let isListening = false;
let isDspEnabled = true;
let isDictEnabled = true;
let isRawOnlyMode = false;

let currentInputGain = 1.0;
let selectedDeviceId = "default";

const liveAudioBuffer = new Float32Array(16000 * 3); // 3-second sliding window at 16kHz
let liveBufferPos = 0;
let liveDecodingInterval = null;

// Initialize ONNX Web Runtime Session
async function initONNXSession() {
    try {
        console.log("🚀 Inizializzazione Modello ONNX Client-Side...");
        ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);

        const modelCandidates = ['morse_model_int8.onnx', 'morse_model.onnx'];
        for (let mPath of modelCandidates) {
            try {
                ortSession = await ort.InferenceSession.create(mPath, { executionProviders: ['wasm'] });
                console.log(`✓ Modello ONNX caricato con successo da '${mPath}'!`);
                break;
            } catch (err) {
                console.warn(`Avviso caricamento ${mPath}:`, err);
            }
        }
    } catch (e) {
        console.error("Errore inizializzazione ONNX:", e);
    }
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

// Enumerate connected audio input devices (Microphones, Stereo Mix, Virtual Cable)
async function populateAudioDevicesList() {
    const select = document.getElementById('audioSourceSelect');
    if (!select) return;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');

        select.innerHTML = '<option value="default" selected>Predefinito / Missaggio Stereo PC</option>';
        audioInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.innerText = dev.label || `Ingresso Audio #${idx + 1}`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn("Dispositivi audio enumeration:", e);
    }
}

async function attachLiveStreamToDecoder(stream) {
    const liveBox = document.getElementById('liveOutputBox');
    const status = document.getElementById('liveStatusBadge');
    const btn = document.getElementById('startListenBtn');

    if (activeAudioStream) {
        activeAudioStream.getTracks().forEach(track => track.stop());
    }

    activeAudioStream = stream;

    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);

    scriptProcessorNode = ctx.createScriptProcessor(4096, 1, 1);
    source.connect(scriptProcessorNode);
    scriptProcessorNode.connect(ctx.destination);

    liveBufferPos = 0;
    liveAudioBuffer.fill(0);

    if (liveBox && (liveBox.innerText.includes("In attesa") || liveBox.innerText.length === 0)) {
        liveBox.innerText = "";
    }

    const nativeSr = ctx.sampleRate;
    const resampleStep = nativeSr / 16000;

    scriptProcessorNode.onaudioprocess = function(e) {
        if (!isListening) return;
        const inputData = e.inputBuffer.getChannelData(0);

        let sumSq = 0.0;
        let srcPos = 0;
        while (srcPos < inputData.length) {
            const idx = Math.floor(srcPos);
            const val = inputData[idx] * currentInputGain;
            sumSq += val * val;
            liveAudioBuffer[liveBufferPos] = val;
            liveBufferPos = (liveBufferPos + 1) % liveAudioBuffer.length;
            srcPos += resampleStep;
        }

        const rms = Math.sqrt(sumSq / Math.max(1, inputData.length));
        const volumePct = Math.min(100, Math.round(rms * 400));

        const vuBar = document.getElementById('signalVuBar');
        const vuVal = document.getElementById('signalVuVal');
        const rmsLabel = document.getElementById('debugRmsVal');

        if (vuBar) vuBar.style.width = `${volumePct}%`;
        if (vuVal) vuVal.innerText = `${volumePct}%`;
        if (rmsLabel) rmsLabel.innerText = `${volumePct}% (RMS: ${rms.toFixed(3)})`;
    };

    isListening = true;

    if (status) {
        status.innerText = "● DECODIFICATORE ATTIVO LIVE";
        status.className = "status-badge status-active";
    }

    if (btn) {
        btn.innerText = "⏹️ Ferma Ascolto Live";
        btn.className = "btn btn-danger";
    }

    startLiveDecodingStream();
}

function stopLiveAudioCapture() {
    const status = document.getElementById('liveStatusBadge');
    const btn = document.getElementById('startListenBtn');

    if (activeAudioStream) {
        activeAudioStream.getTracks().forEach(track => track.stop());
        activeAudioStream = null;
    }

    if (liveDecodingInterval) clearInterval(liveDecodingInterval);
    if (scriptProcessorNode) scriptProcessorNode.disconnect();

    isListening = false;

    if (btn) {
        btn.innerText = "🎙️ Avvia Ascolto Live";
        btn.className = "btn btn-success";
    }

    if (status) {
        status.innerText = "● DECODIFICATORE INATTIVO";
        status.className = "status-badge status-inactive";
    }

    finalizeAndCleanLiveText();
}

async function toggleLiveListening() {
    if (isListening) {
        stopLiveAudioCapture();
    } else {
        try {
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            };

            const devSelect = document.getElementById('audioSourceSelect');
            if (devSelect && devSelect.value && devSelect.value !== 'default') {
                constraints.audio.deviceId = { exact: devSelect.value };
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            attachLiveStreamToDecoder(stream);
        } catch (e) {
            alert("Impossibile accedere all'ingresso audio: " + e.message);
        }
    }
}

function changeAudioSourceDevice(event) {
    selectedDeviceId = event.target.value;
    if (isListening) {
        stopLiveAudioCapture();
        toggleLiveListening();
    }
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
    } catch (e) {
        console.warn("Test CW Beep note:", e);
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
    const sr = 16000;
    const numSamples = Math.floor(sr * durationSec);
    const twoPiF = 2 * Math.PI * freq;

    for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin((i / sr) * twoPiF) * 0.4;
        liveAudioBuffer[liveBufferPos] = sample;
        liveBufferPos = (liveBufferPos + 1) % liveAudioBuffer.length;
    }
}

function updateInputGain(event) {
    currentInputGain = parseFloat(event.target.value) || 1.0;
    const label = document.getElementById('inputGainVal');
    if (label) label.innerText = `${Math.round(currentInputGain * 100)}%`;
}

function toggleDspFallback(event) {
    isDspEnabled = event.target.checked;
}

function toggleDictCorrection(event) {
    isDictEnabled = event.target.checked;
}

function toggleRawOnlyMode(event) {
    isRawOnlyMode = event.target.checked;
}

function clearLiveOutputBox() {
    const liveBox = document.getElementById('liveOutputBox');
    if (liveBox) liveBox.innerText = "";
}

function finalizeAndCleanLiveText() {
    const liveBox = document.getElementById('liveOutputBox');
    if (!liveBox || !liveBox.innerText) return;

    let text = liveBox.innerText.trim();
    if (!text || text.includes("In attesa")) return;

    if (isDictEnabled && !isRawOnlyMode) {
        text = correctTextWithRadioDictionary(text);
    }

    liveBox.innerText = text;
}

// Fast Resampler 16kHz -> 3.2kHz for Stage 7/8/9 ONNX Model
function resampleAudioBufferTo3200FromArray(inputData, srcSr = 16000, targetSr = 3200) {
    if (!inputData || inputData.length === 0) return new Float32Array(0);
    const ratio = srcSr / targetSr;
    const outputLength = Math.floor(inputData.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
        const srcPos = i * ratio;
        const idx0 = Math.floor(srcPos);
        const idx1 = Math.min(inputData.length - 1, idx0 + 1);
        const frac = srcPos - idx0;
        output[i] = inputData[idx0] + frac * (inputData[idx1] - inputData[idx0]);
    }
    return output;
}

// 100% PyTorch-Identical Real STFT & Mel Spectrogram Transformer at 3,200Hz
function computeMelSpectrogramJS(samples, sampleRate = 3200, nMels = 64) {
    const fftSize = 128;
    const winLength = 64;
    const hopSize = 16;
    const nFreqs = 65; // (128 / 2) + 1

    // Pre-computed Hann Window of size 64
    const hannWindow = new Float32Array(winLength);
    for (let i = 0; i < winLength; i++) {
        hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / winLength));
    }

    // Mel Scale Triangular Filterbank Matrix (64 mels x 65 freqs)
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

    // Number of time steps with PyTorch-identical STFT padding
    const timeSteps = Math.floor(samples.length / hopSize) + 1;
    const powerSpec = new Float32Array(nFreqs * timeSteps);

    // Compute Real STFT with Hann Window
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

    // Multiply STFT Power Spec by 64 Mel Filters
    const specData = new Float32Array(nMels * timeSteps);
    let sumVal = 0.0, sumSq = 0.0, totalCount = nMels * timeSteps;

    for (let m = 0; m < nMels; m++) {
        for (let t = 0; t < timeSteps; t++) {
            let melEnergy = 0.0;
            for (let k = 0; k < nFreqs; k++) {
                melEnergy += powerSpec[k * timeSteps + t] * filterbank[m * nFreqs + k];
            }
            // AmplitudeToDB (10 * log10(max(1e-5, energy)))
            const dbVal = 10.0 * Math.log10(Math.max(1e-5, melEnergy));
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

// CTC Greedy Decoder
function ctcGreedyDecodeJS(logitsData, dims) {
    if (!dims || dims.length === 0) return "";

    let T = 1;
    let C = VOCAB.length;

    if (dims.length >= 3) {
        // Handle both [T, B, C] and [B, T, C] layouts
        if (dims[0] > dims[1]) {
            T = dims[0]; // PyTorch CRNN export layout [T=188, B=1, C=49]
            C = dims[2];
        } else {
            T = dims[1]; // Standard layout [B=1, T=188, C=49]
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

// DSP Emergency Morse Decoder (Goertzel 650Hz Bandpass Peak Detection)
function decodeMorseDSP(audioSlice, sampleRate = 3200) {
    if (!audioSlice || audioSlice.length === 0) return "";

    let maxAmp = 0;
    for (let i = 0; i < audioSlice.length; i++) {
        const absA = Math.abs(audioSlice[i]);
        if (absA > maxAmp) maxAmp = absA;
    }
    if (maxAmp < 0.03) return ""; // Gate di silenzio

    const f0 = 650.0;
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const cosW0 = Math.cos(w0);

    const windowSize = Math.floor(sampleRate * 0.035); // 35ms window
    const numWindows = Math.floor(audioSlice.length / windowSize);

    let morseCode = "";
    let currentToneLen = 0;
    let currentSilenceLen = 0;

    for (let w = 0; w < numWindows; w++) {
        let q1 = 0.0, q2 = 0.0;
        const start = w * windowSize;
        for (let k = 0; k < windowSize; k++) {
            const sample = audioSlice[start + k];
            const q0 = sample + 2 * cosW0 * q1 - q2;
            q2 = q1;
            q1 = q0;
        }
        const energy = Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - 2 * cosW0 * q1 * q2)) / windowSize;

        if (energy > 0.08) { // Tono CW 650Hz Rilevato!
            currentToneLen++;
            if (currentSilenceLen > 0) {
                if (currentSilenceLen >= 2 && currentSilenceLen < 6) morseCode += " ";
                else if (currentSilenceLen >= 6) morseCode += " / ";
                currentSilenceLen = 0;
            }
        } else {
            currentSilenceLen++;
            if (currentToneLen > 0) {
                if (currentToneLen >= 2) morseCode += "-";
                else morseCode += ".";
                currentToneLen = 0;
            }
        }
    }

    if (currentToneLen > 0) {
        morseCode += currentToneLen >= 2 ? "-" : ".";
    }

    const words = morseCode.split(" / ");
    let decodedStr = "";

    for (let word of words) {
        const symbols = word.trim().split(" ");
        for (let sym of symbols) {
            if (MORSE_CODE_MAP[sym]) {
                decodedStr += MORSE_CODE_MAP[sym];
            }
        }
        decodedStr += " ";
    }

    return decodedStr.trim();
}

// Radio/Italian Vocabulary Corrector
function correctTextWithRadioDictionary(rawText) {
    if (!rawText) return "";

    const radioReplacements = {
        "5999": "599",
        "5NNN": "5NN",
        "733": "73",
        "888": "88",
        "CQQ": "CQ",
        "DEE": "DE",
        "QTHH": "QTH",
        "RIGG": "RIG",
        "ANTT": "ANT"
    };

    let words = rawText.split(/\s+/);
    let corrected = words.map(w => radioReplacements[w] || w);
    return corrected.join(" ");
}

function extractNewStreamWords(newRawText, previousFullText) {
    if (!newRawText || !newRawText.trim()) return "";

    const cleanNew = newRawText.replace(/\[.*?\]/g, '').trim();
    if (!cleanNew) return "";

    const newWords = cleanNew.split(/\s+/);
    const prevTextClean = (previousFullText || "").replace(/\[.*?\]/g, '').trim();
    const prevWords = prevTextClean ? prevTextClean.split(/\s+/) : [];

    if (prevWords.length === 0) {
        return newWords.join(" ");
    }

    const maxOverlap = Math.min(prevWords.length, newWords.length);
    let overlapLen = 0;

    for (let k = maxOverlap; k >= 1; k--) {
        const prevSuffix = prevWords.slice(prevWords.length - k).join(" ");
        const newPrefix = newWords.slice(0, k).join(" ");
        if (prevSuffix.toUpperCase() === newPrefix.toUpperCase()) {
            overlapLen = k;
            break;
        }
    }

    const addedWords = newWords.slice(overlapLen);
    return addedWords.join(" ");
}

// 1.5s Latency Sliding Window Scheduler
function startLiveDecodingStream() {
    const liveBox = document.getElementById('liveOutputBox');
    if (!liveBox) return;

    let isProcessingInference = false;

    if (liveDecodingInterval) clearInterval(liveDecodingInterval);

    liveDecodingInterval = setInterval(async () => {
        if (!isListening || isProcessingInference) {
            return;
        }

        try {
            isProcessingInference = true;

            const alignedBuffer = new Float32Array(liveAudioBuffer.length);
            for (let i = 0; i < liveAudioBuffer.length; i++) {
                alignedBuffer[i] = liveAudioBuffer[(liveBufferPos + i) % liveAudioBuffer.length];
            }

            const audio3200 = resampleAudioBufferTo3200FromArray(alignedBuffer, 16000, 3200);

            // Normalizzazione Automatica del Picco d'Ampiezza a 1.0 (Full Scale)
            let maxPeak = 0.0;
            for (let i = 0; i < audio3200.length; i++) {
                const absVal = Math.abs(audio3200[i]);
                if (absVal > maxPeak) maxPeak = absVal;
            }

            if (maxPeak > 0.002) {
                const normScale = 1.0 / maxPeak;
                for (let i = 0; i < audio3200.length; i++) {
                    audio3200[i] *= normScale;
                }
            }

            let aiResult = "";

            if (ortSession) {
                try {
                    const melSpec = computeMelSpectrogramJS(audio3200, 3200, 64);
                    const inputTensor = new ort.Tensor('float32', melSpec.data, [1, 1, 64, melSpec.timeSteps]);
                    const feeds = { spectrogram: inputTensor };
                    const results = await ortSession.run(feeds);

                    const outputKeys = Object.keys(results);
                    const outKey = outputKeys.find(k => k.includes('log') || k.includes('prob') || k.includes('out')) || outputKeys[0];
                    const outTensor = results[outKey];

                    aiResult = ctcGreedyDecodeJS(outTensor.data, outTensor.dims);
                } catch (err) {
                    console.warn("Live ONNX Fallback:", err);
                }
            }

            let dspText = "";
            if (isDspEnabled) {
                dspText = decodeMorseDSP(audio3200, 3200);
            }

            const cleanAi = aiResult ? aiResult.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim() : "";
            const cleanDsp = dspText ? dspText.replace(/^[\(\):;=\.,\$\"\'-_]+/g, '').replace(/[\(\):;=\.,\$\"\'-_]+$/g, '').trim() : "";

            const onnxLabel = document.getElementById('debugOnnxVal');
            const dspLabel = document.getElementById('debugDspVal');

            if (onnxLabel) onnxLabel.innerText = cleanAi ? `'${cleanAi}'` : "<SILENZIO>";
            if (dspLabel) dspLabel.innerText = cleanDsp ? `'${cleanDsp}'` : "<SILENZIO>";

            let rawOutput = cleanAi || cleanDsp;

            if (rawOutput && rawOutput.length > 0) {
                const currentFullText = liveBox.innerText || "";
                if (currentFullText.includes("In attesa del segnale")) {
                    liveBox.innerText = "";
                }

                const newWordsToAppend = extractNewStreamWords(rawOutput, liveBox.innerText || "");

                if (newWordsToAppend && newWordsToAppend.trim().length > 0) {
                    const textToAppend = (isDictEnabled && !isRawOnlyMode) ? correctTextWithRadioDictionary(newWordsToAppend) : newWordsToAppend;
                    if (textToAppend && textToAppend.trim()) {
                        liveBox.innerText += textToAppend + " ";
                        liveBox.scrollTop = liveBox.scrollHeight;
                    }
                }
            }
        } catch (e) {
            console.error("Live Stream Error:", e);
        } finally {
            isProcessingInference = false; // Guaranteed unlock!
        }

    }, 1500);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    populateAudioDevicesList();
    initONNXSession();
});
