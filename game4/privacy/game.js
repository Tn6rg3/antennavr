// game4/privacy/game.js

document.addEventListener('DOMContentLoaded', () => {
    // Wait slightly to ensure common scripts are ready if needed,
    // though DOMContentLoaded should be enough for basic UI.
    setTimeout(() => {
        window.updateUI();
        loadRegolamento();
        setupBugSystem();
    }, 200);

    document.getElementById('deleteDataBtn').onclick = handleDeleteData;
    document.getElementById('backToMenuBtn').onclick = () => {
        window.parent.postMessage('closeModule', '*');
    };
});

window.updateUI = function() {
    const t = window.i18n[window.currentLang] || window.i18n.it;
    document.getElementById('txt_privacy_title').textContent = t.privacy_title || "📜 Info & Privacy";
    document.getElementById('bugReportText').placeholder = t.bug_placeholder || "Descrivi il problema...";
    document.getElementById('btnSendBugReport').textContent = t.bug_send || "Invia allo Sviluppatore 🚀";
    document.getElementById('deleteDataBtn').textContent = t.delete_data || "🗑️ Elimina i miei Dati";
    document.getElementById('backToMenuBtn').textContent = t.back_to_menu || "Torna al Menu";
};

async function loadRegolamento() {
    const container = document.getElementById('regolamentoContainer');
    if (!container) return;

    // Usiamo ROOT_PATH per trovare il regolamento rispetto alla root del progetto
    const prefix = (typeof window.ROOT_PATH !== 'undefined') ? window.ROOT_PATH : '../';
    const url = prefix + 'regolamento.html?v=' + Date.now();
    console.log("Privacy: Fetching regulation from", url);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Fetch failed with status: " + response.status);
        const html = await response.text();

        // Pulizia script per sicurezza e inserimento diretto
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('script').forEach(s => s.remove());

        container.innerHTML = tempDiv.innerHTML;
        console.log("Privacy: Regulation loaded successfully.");
    } catch (e) {
        console.error("Privacy: Error loading regulation:", e);
        container.innerHTML = `<div style="text-align:center;padding:15px;color:red;"><h3>⚠️ Errore</h3><p>Impossibile caricare il regolamento.<br><small>${e.message}</small></p></div>`;
    }
}

async function setupBugSystem() {
    const db = window.db;
    if (!db) return;

    // Rilevamento Admin basato su Permessi Firebase
    const isAdmin = await window.checkAdminStatus();
    if (isAdmin) {
        document.getElementById('adminBugPanel').style.display = 'block';
    }

    document.getElementById('btnSendBugReport').onclick = () => {
        const textarea = document.getElementById('bugReportText');
        const text = textarea.value.trim();
        if (text.length < 5) return alert("Messaggio troppo breve!");
        db.ref('bugReports').push({
            from: window.myName, fromId: window.myId, username: window.tgUsername || "N/A",
            msg: text, ts: firebase.database.ServerValue.TIMESTAMP, date: new Date().toLocaleString('it-IT')
        }).then(() => {
            alert("Segnalazione inviata!");
            textarea.value = "";
        });
    };

    document.getElementById('btnReadAllBugs').onclick = loadAdminBugs;
    document.getElementById('btnReadTutorRequests').onclick = loadAdminTutorRequests;
}

function loadAdminBugs() {
    const list = document.getElementById('adminBugList');
    list.innerHTML = "Caricamento...";
    window.db.ref('bugReports').once('value', snap => {
        list.innerHTML = "";
        snap.forEach(child => {
            const bug = child.val();
            const div = document.createElement('div');
            div.className = 'bug-item';
            div.innerHTML = `<b>${bug.from} (@${bug.username})</b><br><small>${bug.date}</small><br>${bug.msg}<br><button class="btn-danger" style="padding:4px;width:auto;" onclick="deleteBug('${child.key}')">Elimina</button>`;
            list.prepend(div);
        });
    });
}

window.deleteBug = (key) => {
    if (confirm('Eliminare?')) window.db.ref(`bugReports/${key}`).remove().then(() => loadAdminBugs());
};

function loadAdminTutorRequests() {
    const list = document.getElementById('adminBugList');
    list.innerHTML = "Caricamento...";
    window.db.ref('tutorRequests').once('value', snap => {
        list.innerHTML = "";
        snap.forEach(child => {
            const req = child.val();
            const div = document.createElement('div');
            div.innerHTML = `<b>🎓 ${req.name}</b> (@${req.username})<br><button class="btn-success" onclick="approveTutor('${child.key}','${req.uid}','${req.name}')">OK</button>`;
            list.prepend(div);
        });
    });
}

async function handleDeleteData() {
    if (!confirm("Eliminare DEFINITIVAMENTE tutti i tuoi dati?")) return;
    if (!confirm("CONFERMA FINALE: Sei assolutamente sicuro?")) return;

    const myId = window.myId;
    const db = window.db;
    const paths = [
        `users/${myId}`, `presence/${myId}`, `courseActiveEnrollments/${myId}`,
        `activity/daily`, `activity/weekly`, `activity/monthly`, `teams`
    ];

    for (let p of paths) {
        if (p.includes('activity') || p === 'teams') {
            // Special handling for deeply nested user data
            const snap = await db.ref(p).once('value');
            snap.forEach(child => {
                if (child.hasChild(myId)) child.ref.child(myId).remove();
                // For teams, check inside members
                if (p === 'teams') {
                    child.child('members').forEach(m => { if (m.key === myId) m.ref.remove(); });
                }
            });
        } else {
            await db.ref(p).remove();
        }
    }

    // Leaderboards
    const lbs = ['standard', 'chars', 'quiz', 'pingpong', 'callsign/global', 'arcade/global'];
    for (let lb of lbs) {
        const lbSnap = await db.ref(`leaderboard/${lb}`).once('value');
        lbSnap.forEach(sub => { if (sub.hasChild(myId)) sub.ref.child(myId).remove(); });
    }

    alert("Dati eliminati.");
    localStorage.clear();
    window.parent.postMessage('closeModule', '*');
}
