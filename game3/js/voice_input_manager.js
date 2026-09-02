// js/voice_input_manager.js

window.voiceInputState = {
    recognition: null,
    isListening: false,
    isAvailable: false
};

window.initVoiceInput = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition non supportato in questo browser.");
        window.voiceInputState.isAvailable = false;
        return;
    }

    window.voiceInputState.recognition = new SpeechRecognition();
    window.voiceInputState.isAvailable = true;

    // Configurazione
    window.voiceInputState.recognition.continuous = false;
    window.voiceInputState.recognition.interimResults = false;
    window.voiceInputState.recognition.lang = 'it-IT'; // Default italiano

    window.voiceInputState.recognition.onstart = () => {
        window.voiceInputState.isListening = true;
        console.log("VoiceInput: In ascolto...");
        const input = document.getElementById('permanentGameInput');
        if (input) {
            input.placeholder = "🎤 Parla ora...";
            input.style.borderColor = "#ff5722";
            input.style.boxShadow = "0 0 10px rgba(255, 87, 34, 0.5)";
        }
    };

    window.voiceInputState.recognition.onresult = (event) => {
        const result = event.results[0][0].transcript;
        console.log("VoiceInput: Risultato ->", result);

        // Inseriamo il testo nell'input e inviamo
        const input = document.getElementById('permanentGameInput');
        if (input) {
            input.value = result;
            if (typeof window.handleWordSubmission === 'function') {
                window.handleWordSubmission(result);
            }
        }
    };

    window.voiceInputState.recognition.onerror = (event) => {
        console.warn("VoiceInput: Errore riconoscimento", event.error);
        window.stopVoiceInput();
    };

    window.voiceInputState.recognition.onend = () => {
        window.voiceInputState.isListening = false;
        console.log("VoiceInput: Fine ascolto.");
        const input = document.getElementById('permanentGameInput');
        if (input) {
            input.placeholder = i18n[currentLang]?.input_placeholder || "Digita qui...";
            input.style.borderColor = "";
            input.style.boxShadow = "";
        }
    };
};

window.startVoiceInput = function() {
    if (typeof gameRunning !== 'undefined' && !gameRunning) return;
    if (!window.voiceInputState.isAvailable && !window.voiceInputState.recognition) {
        window.initVoiceInput();
    }

    if (!window.voiceInputState.isAvailable) return;
    if (window.voiceInputState.isListening) return;

    try {
        // Impostiamo la lingua in base a quella del gioco
        window.voiceInputState.recognition.lang = (currentLang === 'it') ? 'it-IT' : 'en-US';
        window.voiceInputState.recognition.start();
    } catch(e) {
        console.error("VoiceInput: Errore start", e);
    }
};

window.stopVoiceInput = function() {
    if (window.voiceInputState.recognition && window.voiceInputState.isListening) {
        window.voiceInputState.recognition.stop();
    }
};

// Inizializzazione al caricamento
setTimeout(window.initVoiceInput, 3000);
