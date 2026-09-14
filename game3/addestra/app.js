// ==============================================================================
// DEEPCW IA DECODER - DUAL PATH ARCHITECTURE
// ==============================================================================

function screenLog(msg, isErr = false, isWarn = false) {
    if (isErr) console.error(`[DeepCW] ${msg}`);
    else console.log(`[DeepCW] ${msg}`);
}

const VOCAB = ["<BLANK>", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "É", "À", "Ò", "Ù", ",", ".", "/", "'", "?", "=", " "];

let ortSession = null;
let audioCtx = null;
let streamRef = null;
let workletNode = null;
let analyserNode = null;
let isRunning = false;
let isWorkletRegistered = false;
let isProcessingInference = false;
let waterfallAnimationFrame = null;

let currentInputGain = 1.0;
let selectedDeviceId = "default";

const SAMPLE_RATE = 3200;
const liveBuffer = new Float32Array(SAMPLE_RATE * 5); // 5 secondi di finestra
let bufferPos = 0;
let decoderWorker = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

async function changeOnnxModel(event) {
    const selectedFile = event.target.value;
    if (decoderWorker) decoderWorker.postMessage({ type: 'INIT', modelPath: selectedFile });
}

function loadCustomONNX(event) {
    const file = event.target.files[0];
    if (file) {
        const objectUrl = URL.createObjectURL(file);
        document.getElementById('model-status').innerText = `⏳ Caricamento ${file.name}...`;
        loadONNX(objectUrl);
    }
}

async function loadONNX(forcedModelPath = null) {
    const statusLabel = document.getElementById('model-status');
    const targetModel = forcedModelPath || 'morse_model8.onnx';

    try {
        if (statusLabel) {
            statusLabel.innerText = "⏳ Caricamento in RAM...";
            statusLabel.style.backgroundColor = "#451a03";
            statusLabel.style.color = "#facc15";
        }

        if (!decoderWorker) {
            decoderWorker = new Worker('decoderWorker.js');
            decoderWorker.onmessage = function(e) {
                const data = e.data;
                if (data.type === 'ONNX_READY') {
                    if (statusLabel) {
                        statusLabel.innerText = `✅ Modello Pronto!`;
                        statusLabel.style.backgroundColor = "#14532d";
                        statusLabel.style.color = "#4ade80";
                    }
                } else if (data.type === 'INFER_RESULT') {
                    handleWorkerInferResult(data.text);
                }
            };
        }
        decoderWorker.postMessage({ type: 'INIT', modelPath: targetModel });
    } catch (err) {
        screenLog("Errore WebWorker: " + err.message, true);
    }
}

// FUSIONE TESTO: Algoritmo Overlap-Add per impedire ripetizioni e balbuzie
function handleWorkerInferResult(aiResult) {
    const liveBox = document.getElementById('output-box');
    if (!liveBox) return;

    let newText = (typeof aiResult === 'string') ? aiResult.trim() : "";
    if (!newText) return;

    if (liveBox.innerText.includes("In attesa")) liveBox.innerText = "";

    let currentWords = liveBox.innerText.trim().split(/\s+/).filter(w => w.length > 0);
    let newWords = newText.split(/\s+/).filter(w => w.length > 0);

    let maxOverlap = 0;
    let checkLength = Math.min(currentWords.length, newWords.length);
    
    // Cerca l'esatta sovrapposizione tra le stringhe
    for (let i = 1; i <= checkLength; i++) {
        let match = true;
        for (let j = 0; j < i; j++) {
            if (currentWords[currentWords.length - i + j] !== newWords[j]) {
                match = false; break;
            }
        }
        if (match) maxOverlap = i;
    }

    let wordsToAdd = newWords.slice(maxOverlap);
    if (wordsToAdd.length > 0) {
        liveBox.innerText += (currentWords.length > 0 ? " " : "") + wordsToAdd.join(" ");
        liveBox.scrollTop = liveBox.scrollHeight;
    }
}

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
    } catch (e) {}
}

let lastWaterfallTime = performance.now();
let waterfallPixelAccumulator = 0;
let cwEnvelope = 0; // Ammortizzatore logico per punti/linee continui

// GRAFICA: Disegna solo i blocchi del Morse
function drawWaterfallLoop() {
    if (!isRunning || !analyserNode) return;

    const canvas = document.getElementById('waterfallCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d', { alpha: false });
        const width = canvas.width;
        const height = canvas.height;

        const now = performance.now();
        const dt = (now - lastWaterfallTime) / 1000.0;
        lastWaterfallTime = now;

        const pxPerSec = width / 10.0; // 10 secondi visibili
        waterfallPixelAccumulator += dt * pxPerSec;
        let step = Math.floor(waterfallPixelAccumulator);

        if (step >= 1) {
            waterfallPixelAccumulator -= step;
            
            const fftBins = analyserNode.frequencyBinCount;
            const freqData = new Uint8Array(fftBins);
            analyserNode.getByteFrequencyData(freqData);

            // Scorrimento hardware a sinistra
            ctx.drawImage(canvas, step, 0, width - step, height, 0, 0, width - step, height);
            ctx.fillStyle = '#020617'; 
            ctx.fillRect(width - step, 0, step, height);

            const binWidth = (audioCtx.sampleRate / 2) / fftBins;
            let minBin = Math.floor(300 / binWidth);
            let maxBin = Math.floor(1100 / binWidth);
            let signalPeak = 0;
            
            for (let i = minBin; i <= maxBin; i++) {
                if (freqData[i] > signalPeak) signalPeak = freqData[i];
            }

            // Inviluppo per eliminare lo sfarfallio
            if (signalPeak > 110) { 
                cwEnvelope = Math.min(1.0, cwEnvelope + 0.5); // Attacco rapido
            } else {
                cwEnvelope = Math.max(0.0, cwEnvelope - 0.25); // Rilascio morbido
            }

            if (cwEnvelope > 0.1) {
                ctx.fillStyle = '#4ade80';
                ctx.fillRect(width - step, (height - 80) / 2, step, 80);
            }
        }
    }
    waterfallAnimationFrame = requestAnimationFrame(drawWaterfallLoop);
}

async function startSystem() {
    if (isRunning) return;
    document.getElementById('btn-start').disabled = true;

    try {
        const constraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } };
        const devSelect = document.getElementById('audioSourceSelect');
        if (devSelect && devSelect.value !== 'default') constraints.audio.deviceId = { exact: devSelect.value };

        streamRef = await navigator.mediaDevices.getUserMedia(constraints);
        audioCtx = getAudioContext();
        window.__globalMicSource = audioCtx.createMediaStreamSource(streamRef);

        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;
        analyserNode.smoothingTimeConstant = 0.65; // Stabilizza la lettura FFT per il Canvas
        analyserNode.minDecibels = -90; 
        analyserNode.maxDecibels = -10; 
        window.__globalMicSource.connect(analyserNode);

        if (!isWorkletRegistered) {
            const workletCode = `
                class MicReader extends AudioWorkletProcessor {
                    process(inputs, outputs) {
                        if (inputs[0] && inputs[0][0]) this.port.postMessage(new Float32Array(inputs[0][0]));
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
        liveBuffer.fill(0);

        workletNode.port.onmessage = (e) => {
            if (!isRunning) return;
            const data = e.data;
            for (let i = 0; i < data.length; i++) {
                liveBuffer[bufferPos] = data[i] * currentInputGain;
                bufferPos = (bufferPos + 1) % liveBuffer.length;
            }
        };

        isRunning = true;
        document.getElementById('btn-stop').disabled = false;
        document.getElementById('audio-status').innerText = "🟢 Ascolto";
        document.getElementById('audio-status').style.color = "#4ade80";

        drawWaterfallLoop();
        startAsyncDecodeLoop();

    } catch (err) {
        document.getElementById('btn-start').disabled = false;
    }
}

function stopSystem() {
    isRunning = false;
    if (waterfallAnimationFrame) cancelAnimationFrame(waterfallAnimationFrame);
    if (workletNode) workletNode.disconnect();
    if (analyserNode) analyserNode.disconnect();
    if (window.__globalMicSource) window.__globalMicSource.disconnect();
    if (streamRef) streamRef.getTracks().forEach(t => t.stop());

    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('audio-status').innerText = "🔴 Fermo";
    document.getElementById('audio-status').style.color = "#f87171";
}

function changeAudioSourceDevice(event) {
    selectedDeviceId = event.target.value;
    if (isRunning) { stopSystem(); startSystem(); }
}

function updateInputGain(event) {
    currentInputGain = parseFloat(event.target.value) || 1.0;
    document.getElementById('inputGainVal').innerText = `${Math.round(currentInputGain * 100)}%`;
}

function applyCwBandpassFilterJS(audioData, sampleRate = 3200, minFreq = 300, maxFreq = 1100) {
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
        x2 = x1; x1 = x0; y2 = y1; y1 = y0;
        filtered[i] = isNaN(y0) ? 0 : y0;
    }
    return filtered;
}

async function startAsyncDecodeLoop() {
    while (isRunning) {
        await new Promise(r => setTimeout(r, 1200));
        if (!isRunning || isProcessingInference) continue;

        try {
            isProcessingInference = true;
            const alignedBuffer = new Float32Array(liveBuffer.length);
            for (let i = 0; i < liveBuffer.length; i++) {
                alignedBuffer[i] = liveBuffer[(bufferPos + i) % liveBuffer.length];
            }

            let audio3200 = applyCwBandpassFilterJS(alignedBuffer, 3200, 300, 1100);

            // AGC Morbido (Niente Zero Assoluto)
            let sumSq = 0;
            for (let i = 0; i < audio3200.length; i++) sumSq += audio3200[i] * audio3200[i];
            const rmsVal = Math.sqrt(sumSq / audio3200.length);

            if (rmsVal > 0.001) {
                const agcGain = Math.min(6.0, 0.25 / rmsVal);
                for (let i = 0; i < audio3200.length; i++) {
                    audio3200[i] = Math.max(-1.0, Math.min(1.0, audio3200[i] * agcGain));
                }
            }

            if (decoderWorker) {
                decoderWorker.postMessage({ type: 'INFER', audio3200: audio3200 });
            }
        } catch (e) {} finally {
            isProcessingInference = false;
        }
    }
}

function playTestCwBeep() {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 650;
        const dot = 0.08; const dash = 0.24;
        let t = ctx.currentTime + 0.1;

        // C (-.-.)
        t = addBeep(gain, t, dash); t += dot; t = addBeep(gain, t, dot); t += dot;
        t = addBeep(gain, t, dash); t += dot; t = addBeep(gain, t, dot); t += dash;
        // Q (--.-)
        t = addBeep(gain, t, dash); t += dot; t = addBeep(gain, t, dash); t += dot;
        t = addBeep(gain, t, dot); t += dot; t = addBeep(gain, t, dash);

        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + 0.1); osc.stop(t + 0.2);

        injectAudioBufferToDecoder(650, (t - ctx.currentTime) + 0.5);
    } catch (e) {}
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
        liveBuffer[bufferPos] = Math.sin((i / sr) * twoPiF) * 0.4;
        bufferPos = (bufferPos + 1) % liveBuffer.length;
    }
}

window.onload = function() {
    populateAudioDevicesList();
    loadONNX();
};
