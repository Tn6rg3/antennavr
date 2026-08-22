// game4/common/init.js

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260821_v4_full";

const firebaseConfig = {
    apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
    authDomain: "cwapp-da3a4.firebaseapp.com",
    databaseURL: "https://cwapp-da3a4-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "cwapp-da3a4",
    storageBucket: "cwapp-da3a4.appspot.com",
    messagingSenderId: "338276189578",
    appId: "1:338276189578:web:753046757f58ec0d97036d",
    measurementId: "G-GZ0L6G6Z70"
};

// Global state
window.currentLang = localStorage.getItem('gameLang') || 'it';
window.db = null;
window.auth = null;
window.tg = null;
window.myId = "";
window.myName = "";
window.tgUsername = "";
window.isAdmin = false;

// Determine ROOT_PATH for resources
(function() {
    const path = window.location.pathname;
    // Se siamo in una sottocartella di games, servono due livelli su
    if (path.includes('/games/')) {
        window.ROOT_PATH = "../../";
    }
    // Se siamo in un modulo di primo livello (profile, course, ecc.), serve un livello su
    else if (path.includes('/course/') || path.includes('/profile/') || path.includes('/leaderboard/') || path.includes('/participation/') || path.includes('/privacy/') || path.includes('/teams/')) {
        window.ROOT_PATH = "../";
    }
    // Altrimenti siamo nella root
    else {
        window.ROOT_PATH = "";
    }
    console.log("Init: ROOT_PATH set to", window.ROOT_PATH);
})();

// Function to check admin status via Firebase permissions
window.checkAdminStatus = function() {
    return new Promise((resolve) => {
        if (!window.db) return resolve(false);
        window.db.ref('bugReports').limitToLast(1).once('value').then(() => {
            window.isAdmin = true;
            resolve(true);
        }).catch((error) => {
            if (error.code === 'PERMISSION_DENIED') {
                window.isAdmin = false;
            }
            resolve(false);
        });
    });
};


// Initialize Telegram
if (window.Telegram && window.Telegram.WebApp) {
    window.tg = window.Telegram.WebApp;
    window.tg.ready();
    window.tg.expand();
    const user = window.tg.initDataUnsafe?.user;
    if (user) {
        window.myId = user.id.toString();
        window.myName = user.first_name;
        window.tgUsername = user.username || "";
    }
}

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    window.db = firebase.database();
    window.auth = firebase.auth();
}

window.showToast = function(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    const container = document.getElementById('toastContainer') || document.body;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
};

window.setLanguage = function(lang) {
    window.currentLang = lang;
    localStorage.setItem('gameLang', lang);
    if (window.updateUI) window.updateUI();

    // Propagate to iframe if we are in the Portal
    const iframe = document.getElementById('gameIframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({type: 'setLanguage', lang: lang}, '*');
    }
};

// Listen for language updates from Parent/Portal
window.addEventListener('message', (event) => {
    if (event.data?.type === 'setLanguage') {
        // Update local state without re-triggering postMessage to avoid loops if any
        window.currentLang = event.data.lang;
        localStorage.setItem('gameLang', window.currentLang);
        if (window.updateUI) window.updateUI();
    }
});
