// game4/common/globals.js
// Variabili globali comuni a tutto il progetto

window.BOT_USERNAME = "cwappgame_bot";
window.WEBAPP_NAME = "cwgame";
window.APP_VERSION = "20260807.223_v4";

// URL della Web App di Google Apps Script per la validazione identità
window.VALIDATION_SERVER_URL = "https://script.google.com/macros/s/AKfycbyQWLxiT_tcvjYZg8ntkwPUTsUhLv4MGx0wGDnC3d2JDKuiuT6nmzS3fuX1_R-t0v7tjg/exec";

// --- STATO GLOBALE CONDIVISO ---
window.myName = "";
window.myId = "";
window.myPrivacy = false;
window.myTeamId = null;
window.myTeamName = "";
window.isTeamCaptain = false;
window.db = null;
window.auth = null;
window.currentLang = 'it';

// Altre variabili che potrebbero servire in vari moduli
window.roomCode = "";
window.roomHostId = null;
window.gameRunning = false;
