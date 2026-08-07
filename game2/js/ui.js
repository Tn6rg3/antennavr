// ============================================================================
// UI.JS - DOM PROXY, GESTIONE SCHERMATE E TRADUZIONI
// ============================================================================

import { appState, gameState, chatState, uiState, clearAllTimers, STORAGE_KEYS } from './state.js';

export const els = new Proxy({}, { get: (target, id) => document.getElementById(id) });

export function escapeHTML(str) {
    if (!str && str !== 0) return "";
    return String(str).replace(/[&<>'"]/g, match => {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escapeMap[match];
    });
}

export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (els.toastContainer) {
        els.toastContainer.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
    }
}

export function updateMuteBtnUI() {
    if (els.muteGlobalChatBtn) {
        els.muteGlobalChatBtn.textContent = chatState.isMuted 
            ? (appState.currentLang === 'it' ? "🔇 Notifiche Disattivate" : "🔇 Notifications Muted") 
            : (appState.currentLang === 'it' ? "🔊 Notifiche Attive" : "🔊 Notifications Active");
    }
}

export async function loadRegolamento() {
    if (!els.regolamentoContainer) return;
    try {
        const response = await fetch('regolamento.html');
        if (!response.ok) throw new Error("File regolamento non trovato");
        els.regolamentoContainer.innerHTML = await response.text();
        
        if (els.sendFeedbackBtn) {
            els.sendFeedbackBtn.onclick = function() {
                const text = encodeURIComponent("💡 Suggerimento per Sfida Telegrafia: \n\n[Scrivi qui il tuo messaggio...]");
                const shareUrl = `https://t.me/share/url?text=${text}`;
                if (window.Telegram.WebApp.openTelegramLink) {
                    window.Telegram.WebApp.openTelegramLink(shareUrl);
                } else {
                    window.open(shareUrl, '_blank');
                }
            };
        }
    } catch (e) {
        els.regolamentoContainer.innerHTML = `
            <div style="text-align:center; padding: 15px;">
                <h3 style="color: var(--champ-color); margin-top:0;">📜 Regole di Gioco</h3>
                <p style="font-size:0.9em;">Decodifica il codice Morse nel minor tempo possibile e scala le classifiche!</p>
                <hr style="border:0; border-top:1px dashed var(--hint-color); margin:15px 0;">
                <p style="font-size:0.75em; color:var(--hint-color);"><i>Impossibile caricare regolamento.html (${e.message}).</i></p>
            </div>
        `;
    }
}

export async function loadDictionaries() {
    const FALLBACK_WORDS_IT = ["RADIO", "MORSE", "TELEGRAFIA", "SEGNALE", "ANTENNA", "BATTAGLIA", "STAZIONE", "AMICIZIA", "FREQUENZA", "MESSAGGIO"];
    const FALLBACK_WORDS_EN = ["RADIO", "MORSE", "TELEGRAPH", "SIGNAL", "ANTENNA", "BATTLE", "STATION", "FRIENDSHIP", "FREQUENCY", "MESSAGE"];

    async function fetchDict(url, lang) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("Offline");
            const text = await resp.text();
            const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(l => l.length > 2);
            if (lines.length > 10) {
                if (lang === 'it') appState.itDictionary = lines;
                else appState.enDictionary = lines;
                return;
            }
            throw new Error("Short dict");
        } catch(e) {
            if (lang === 'it') appState.itDictionary = FALLBACK_WORDS_IT.map(w => w.toLowerCase());
            else appState.enDictionary = FALLBACK_WORDS_EN.map(w => w.toLowerCase());
        }
    }

    await Promise.all([fetchDict("parole.txt", 'it'), fetchDict("words.txt", 'en')]);
    updateDictionary();
}

export function updateDictionary() { 
    appState.masterDictionary = (appState.currentLang === 'en' && appState.enDictionary.length > 0) 
        ? appState.enDictionary 
        : appState.itDictionary; 
}

export function showScreen(screenId) {
    clearAllTimers();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));
    if (els[screenId]) els[screenId].classList.add('active-screen');
}
