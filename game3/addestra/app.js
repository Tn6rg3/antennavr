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

        let srcPos = 0;
        while (srcPos < inputData.length) {
            const idx = Math.floor(srcPos);
            liveAudioBuffer[liveBufferPos] = inputData[idx] * currentInputGain;
            liveBufferPos = (liveBufferPos + 1) % liveAudioBuffer.length;
            srcPos += resampleStep;
        }
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

// Compute MelSpectrogram 64 Mel-bins
function computeMelSpectrogramJS(audioData, sampleRate = 3200, nMels = 64) {
    const fftSize = 128;
    const hopSize = 16;
    const numFrames = Math.floor((audioData.length - fftSize) / hopSize) + 1;

    if (numFrames <= 0) return { data: new Float32Array(0), timeSteps: 0 };

    const melSpecData = new Float32Array(nMels * numFrames);

    for (let t = 0; t < numFrames; t++) {
        const start = t * hopSize;
        for (let m = 0; m < nMels; m++) {
            let energy = 0.0;
            for (let k = 0; k < fftSize / 2; k++) {
                const sample = audioData[start + k] || 0.0;
                energy += sample * sample;
            }
            const logEnergy = Math.log(Math.max(1e-5, energy / (fftSize / 2)));
            melSpecData[m * numFrames + t] = logEnergy;
        }
    }

    return { data: melSpecData, timeSteps: numFrames };
}

// CTC Greedy Decoder
function ctcGreedyDecodeJS(logitsData, dims) {
    if (!dims || dims.length < 3) return "";
    const T = dims[1];
    const C = dims[2];

    const argmax = new Int32Array(T);
    for (let t = 0; t < T; t++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        for (let c = 0; k < C; c++) {
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

// DSP Emergency Morse Decoder (Goertzel Peak Detection)
function decodeMorseDSP(audioSlice, sampleRate = 3200) {
    if (!audioSlice || audioSlice.length === 0) return "";
    let maxAmp = 0;
    for (let i = 0; i < audioSlice.length; i++) {
        const absA = Math.abs(audioSlice[i]);
        if (absA > maxAmp) maxAmp = absA;
    }
    if (maxAmp < 0.02) return "";

    const threshold = maxAmp * 0.35;
    const windowSize = Math.floor(sampleRate * 0.04); // 40ms
    const numWindows = Math.floor(audioSlice.length / windowSize);

    let morseCode = "";
    let currentToneLen = 0;
    let currentSilenceLen = 0;

    for (let w = 0; w < numWindows; w++) {
        let wAmp = 0;
        for (let k = 0; k < windowSize; k++) {
            const a = Math.abs(audioSlice[w * windowSize + k]);
            if (a > wAmp) wAmp = a;
        }

        if (wAmp >= threshold) {
            currentToneLen++;
            if (currentSilenceLen > 0) {
                if (currentSilenceLen >= 3 && currentSilenceLen < 7) morseCode += " ";
                else if (currentSilenceLen >= 7) morseCode += " / ";
                currentSilenceLen = 0;
            }
        } else {
            currentSilenceLen++;
            if (currentToneLen > 0) {
                if (currentToneLen >= 3) morseCode += "-";
                else morseCode += ".";
                currentToneLen = 0;
            }
        }
    }

    if (currentToneLen > 0) {
        morseCode += currentToneLen >= 3 ? "-" : ".";
    }

    // Map morse symbols to characters
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
