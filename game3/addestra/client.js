// CLIENT.JS - VERSIONE STANDALONE CON CONNESSIONE AL SERVER LOCALE O INFERENZA ONNX

document.addEventListener('DOMContentLoaded', () => {
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnMic = document.getElementById('btnMic');
    const micBtnText = document.getElementById('micBtnText');

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

    let currentData = null;
    let is3sMode = true;
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

    // Server API base URL (supporta sia localhost che serverless)
    const SERVER_API_URL = "http://localhost:8000";

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
                updateStatus('active', '🎙️ Microfono In Ascolto (ANC Attivo)');

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
                        const samplesToProcess = micPcmSamples.slice();
                        const overlapCount = Math.floor(micAudioContext.sampleRate * 2.0);
                        micPcmSamples = micPcmSamples.slice(micPcmSamples.length - overlapCount);

                        const wavBuffer = encodeWAV(samplesToProcess, micAudioContext.sampleRate);
                        await decodeAudioBufferOrWav(wavBuffer, true);
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

    async function decodeAudioBufferOrWav(arrayBuffer, isLive = false) {
        try {
            updateStatus('processing', '⚡ Elaborazione acustica IA in corso...');

            const response = await fetch(`${SERVER_API_URL}/api/decode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: arrayBuffer
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Errore di decodifica');

            currentData = data;
            renderResults(data, isLive);
            updateStatus('active', 'Decodifica IA Completata!');

        } catch (error) {
            console.error('Errore decodifica:', error);
            if (!isLive) {
                updateStatus('error', `Errore: ${error.message}`);
                decodedTextBox.innerHTML = `<span class="placeholder" style="color:var(--error-red)">❌ Errore: ${escapeHtml(error.message)} (Assicurati che il server Python sia avviato con python web/server.py)</span>`;
            }
        }
    }

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

    const startPlayAction = () => {
        safePlayAudio(audioPlayer);
        if (btnPlay) btnPlay.textContent = '▶ In Riproduzione';
        start60FpsCanvasAnimation();
    };

    const pausePlayAction = () => {
        try { audioPlayer.pause(); } catch (e) {}
        if (btnPlay) btnPlay.textContent = '▶ Avvia Audio';
        stop60FpsCanvasAnimation();
    };

    const stopPlayAction = () => {
        try {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        } catch (e) {}
        if (btnPlay) btnPlay.textContent = '▶ Avvia Audio';
        stop60FpsCanvasAnimation();
        renderCanvasesAtCurrentTime();
    };

    btnPlay.addEventListener('click', startPlayAction);
    btnPause.addEventListener('click', pausePlayAction);
    btnStop.addEventListener('click', stopPlayAction);

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
        btnView3s.classList.add('active');
        btnViewFull.classList.remove('active');
        renderCanvasesAtCurrentTime();
    });

    btnViewFull.addEventListener('click', () => {
        is3sMode = false;
        btnViewFull.classList.add('active');
        btnView3s.classList.remove('active');
        renderCanvasesAtCurrentTime();
    });

    async function processFile(file) {
        if (isMicRecording) toggleMicrophoneStream();

        updateStatus('processing', `Elaborazione di '${file.name}'...`);
        fileNameDisplay.textContent = file.name;

        const audioUrl = URL.createObjectURL(file);
        audioPlayer.src = audioUrl;

        audioSection.classList.remove('hidden');
        resultCard.classList.remove('hidden');
        visualizerCard.classList.remove('hidden');
        decodedTextBox.innerHTML = `<span class="placeholder">⚡ Elaborazione acustica IA in corso...</span>`;

        try {
            const arrayBuffer = await file.arrayBuffer();
            await decodeAudioBufferOrWav(arrayBuffer, false);
        } catch (error) {
            console.error('Errore:', error);
            updateStatus('error', `Errore: ${error.message}`);
            decodedTextBox.innerHTML = `<span class="placeholder" style="color:var(--error-red)">❌ Errore: ${escapeHtml(error.message)}</span>`;
        }
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

        let specStartTime = Math.max(0, curTime - 1.0);
        let specEndTime = Math.min(totalDuration, specStartTime + 3.0);
        if (specEndTime - specStartTime < 3.0 && specStartTime > 0) {
            specStartTime = Math.max(0, specEndTime - 3.0);
        }

        let waveStartTime = 0;
        let waveEndTime = totalDuration;

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
    }

    function drawWaveformWindow(waveform, startTime, endTime, totalDuration) {
        if (!waveform || waveform.length === 0) return;

        const ctx = waveformCanvas.getContext('2d');
        const parentW = waveformCanvas.parentElement.clientWidth || 1000;
        const width = waveformCanvas.width = Math.max(300, parentW);
        const height = waveformCanvas.height = 90;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

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

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
});
