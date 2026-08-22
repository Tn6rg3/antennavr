// game4/common/firebase_init.js

const firebaseConfig = {
    apiKey: "AIzaSyAfddNQb_G-sCe0thi36LgpBlj_c-Lerzk",
    authDomain: "telegrafiabot.firebaseapp.com",
    databaseURL: "https://telegrafiabot-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "telegrafiabot",
    storageBucket: "telegrafiabot.firebasestorage.app",
    messagingSenderId: "575790683327",
    appId: "1:575790683327:web:db333b0316c8e8ec63a20a"
};

// Inizializza Firebase se non è già stato fatto
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

window.db = firebase.database();
window.auth = firebase.auth();
