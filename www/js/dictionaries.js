// --- DIZIONARI ROBUSTI CON FALLBACK PIÃ™ RICCHI ---
const FALLBACK_WORDS_IT = [
    "RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA", "BATTAGLIA", "STAZIONE",
    "AMICIZIA", "FREQUENZA", "MESSAGGIO", "ASCOLTO", "TRASMISSIONE", "CIRCUITO", "OPERATORE"
];
const FALLBACK_WORDS_EN = [
    "RADIO", "MORSE", "TELEGRAPH", "SIGNAL", "ANTENNA", "BATTLE", "STATION",
    "FRIENDSHIP", "FREQUENCY", "MESSAGE", "LISTENING", "TRANSMISSION", "CIRCUIT", "OPERATOR"
];

async function loadDictionaries() {
    await Promise.all([
        fetchDictionary("parole.txt", 'it'),
        fetchDictionary("words.txt", 'en')
    ]);
    updateDictionary();
}

async function fetchDictionary(url, lang) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Offline o file non trovato");
        const text = await resp.text();
        const lines = text.split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 2);

        if (lines.length > 10) {
            if (lang === 'it') itDictionary = lines;
            else enDictionary = lines;
            return;
        }
        throw new Error("Dizionario troppo corto");
    } catch(e) {
        if (lang === 'it') itDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
        else enDictionary = FALLBACK_WORDS_EN.map(w => w.toLowerCase());
    }
}

function updateDictionary() {
    masterDictionary = (currentLang === 'en' && enDictionary.length > 0) ? enDictionary : itDictionary;
}

// --- CARICAMENTO REGOLAMENTO E PRIVACY ---
async function loadRegolamento() {
    if (!els.regolamentoContainer) return;
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error("File regolamento non trovato");
        els.regolamentoContainer.innerHTML = await response.text();

        // Riattiva il bottone feedback se presente all'interno dell'HTML caricato
        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = function() {
                const text = encodeURIComponent("ðŸ’¡ Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
                const shareUrl = `https://t.me/share/url?text=${text}`;
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(shareUrl);
                } else {
                    window.open(shareUrl, '_blank');
                }
            };
        }
    } catch (e) {
        // Fallback di sicurezza in caso di errore di rete o file mancante
        els.regolamentoContainer.innerHTML = `
            <div style="text-align:center; padding: 15px;">
                <h3 style="color: var(--champ-color); margin-top:0;">ðŸ“œ Regole di Gioco</h3>
                <p style="font-size:0.9em;">Decodifica il codice Morse nel minor tempo possibile e scala le classifiche!</p>
                <ul style="text-align:left; font-size:0.85em; color: var(--text-color); margin-top:10px;">
                    <li><b>Parole Comuni & Nominativi:</b> PiÃ¹ sei veloce e preciso, piÃ¹ punti ottieni.</li>
                    <li><b>Conquista (Co-op):</b> Collabora con la tua squadra per portare la barra al 100%.</li>
                    <li><b>Battaglia Serale:</b> Ogni giorno alle 21:30 ad eliminazione diretta (3 vite).</li>
                </ul>
                <hr style="border:0; border-top:1px dashed var(--hint-color); margin:15px 0;">
                <p style="font-size:0.75em; color:var(--hint-color);">
                    <i>Nota: Impossibile caricare il file regolamento.html esteso (${e.message}).</i>
                </p>
            </div>
        `;
    }
}


