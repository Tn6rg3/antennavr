// game4/common/init.js

const BOT_USERNAME = "cwappgame_bot";
const WEBAPP_NAME = "cwgame";
const APP_VERSION = "20260821_v4_full";

const firebaseConfig = {
    apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
    authDomain: "telegrafiabot.firebaseapp.com",
    databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "telegrafiabot",
    storageBucket: "telegrafiabot.firebasestorage.app",
    messagingSenderId: "575790683327",
    appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
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
    if (path.includes('/games/') || path.includes('/course/') || path.includes('/profile/') || path.includes('/leaderboard/') || path.includes('/participation/') || path.includes('/privacy/') || path.includes('/teams/')) {
        window.ROOT_PATH = "../../";
    } else {
        window.ROOT_PATH = "../"; // For top-level modules if they were moved
    }
    // Correct for portal root
    if (path.endsWith('index.html') && !path.includes('/')) {
        window.ROOT_PATH = "";
    }
    // Final check for the specific structure of game4
    if (path.includes('/game4/index.html') || path.endsWith('/game4/')) {
        window.ROOT_PATH = "";
    }
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

    let user = window.tg.initDataUnsafe?.user;

    // If we are in an iframe and tg user is not available, try parent
    if (!user && window.parent && window.parent.tg) {
        user = window.parent.tg.initDataUnsafe?.user;
        window.tg = window.parent.tg;
    }

    if (user) {
        window.myId = user.id.toString();
        window.myName = user.first_name;
        window.tgUsername = user.username || "";
    }
}

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        console.log("Init: Initializing Firebase with URL", firebaseConfig.databaseURL);
        firebase.initializeApp(firebaseConfig);
    }
    window.db = firebase.database();
    window.auth = firebase.auth();

    // --- AUTHENTICATION & MAPPING (Required by Firebase Rules) ---
    window.auth.signInAnonymously().then(async (userCredential) => {
        const uid = userCredential.user.uid;
        console.log("Init: Auth Success, Firebase UID:", uid);

        // System mapping when connected
        window.db.ref('.info/connected').on('value', async (snap) => {
            if (snap.val() === true && window.myId) {
                try {
                    // 1. Create UID -> TelegramID mapping (Crucial for Rules)
                    const mappingRef = window.db.ref(`uid_mapping/${uid}`);
                    await mappingRef.set(window.myId);
                    mappingRef.onDisconnect().remove();

                    // 2. Set Presence
                    const pRef = window.db.ref(`presence/${window.myId}`);
                    pRef.onDisconnect().remove();
                    pRef.update({
                        name: window.myName,
                        username: window.tgUsername || "",
                        status: 'online',
                        uid: uid,
                        ts: firebase.database.ServerValue.TIMESTAMP
                    });

                    // 3. Detect Admin status via permissions (No hardcoded ID)
                    window.checkAdminStatus();
                } catch (e) {
                    console.error("Init: Mapping/Presence Error:", e);
                }
            }
        });
    }).catch(err => {
        console.error("Init: Auth Error:", err);
    });
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
