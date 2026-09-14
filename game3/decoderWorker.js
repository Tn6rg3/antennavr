// ==============================================================================
// DEEPCW IA BACKGROUND DECODER WORKER THREAD (0% Main Thread UI Lock)
// ==============================================================================

importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');

let ortSession = null;

// 48-Class PyTorch Cloned Vocabulary List
const VOCAB = ["<BLANK>", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "É", "À", "Ò", "Ù", ",", ".", "/", "'", "?", "=", " "];

async function initWorkerONNX(modelPath) {
    try {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = false;
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        ortSession = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
        self.postMessage({ type: 'ONNX_READY', modelPath: modelPath });
    } catch (e) {
        self.postMessage({ type: 'ONNX_ERROR', error: e.message });
    }
}

self.onmessage = async function(e) {
    const data = e.data;
    if (data.type === 'INIT') {
        await initWorkerONNX(data.modelPath);
    } else if (data.type === 'INFER') {
        if (!ortSession) {
            self.postMessage({ type: 'INFER_RESULT', text: '' });
            return;
        }

        try {
            const melSpec = computeMelSpectrogramJS(data.audio3200, 3200, 64);
            const inputTensor = new ort.Tensor('float32', melSpec.data, [1, 1, 64, melSpec.timeSteps]);

            const inputName = (ortSession.inputNames && ortSession.inputNames.length > 0) ? ortSession.inputNames[0] : 'spectrogram';
            const feeds = {};
            feeds[inputName] = inputTensor;

            const results = await ortSession.run(feeds);
            const outKey = Object.keys(results)[0];
            const outTensor = results[outKey];

            const resultText = ctcGreedyDecodeJS(outTensor.data, outTensor.dims);
            self.postMessage({ type: 'INFER_RESULT', text: resultText });
        } catch (err) {
            self.postMessage({ type: 'INFER_ERROR', error: err.message });
        }
    }
};

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
