// game4/common/firebase_init.js

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

// Inizializza Firebase se non è già stato fatto
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

window.db = firebase.database();
window.auth = firebase.auth();
