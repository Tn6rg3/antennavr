// game4/games/tournament/game.js
const els = {
    noTeamArea: document.getElementById('noTeamArea'),
    myTeamArea: document.getElementById('myTeamArea'),
    teamNameInput: document.getElementById('teamNameInput'),
    createTeamBtn: document.getElementById('createTeamBtn'),
    myTeamName: document.getElementById('myTeamName'),
    trnList: document.getElementById('trnList'),
    quitBtn: document.getElementById('quitBtn')
};

function initTournament() {
    checkMyTeam();
    listenToTournaments();
}

function checkMyTeam() {
    window.db.ref(`users/${window.myId}/teamId`).on('value', snap => {
        const teamId = snap.val();
        if (teamId) {
            window.db.ref(`teams/${teamId}`).once('value', tSnap => {
                const team = tSnap.val();
                if (team) {
                    els.noTeamArea.style.display = 'none';
                    els.myTeamArea.style.display = 'flex';
                    els.myTeamName.textContent = team.name;
                    window.myTeamId = teamId;
                    window.myTeamName = team.name;
                } else {
                    showNoTeam();
                }
            });
        } else {
            showNoTeam();
        }
    });
}

function showNoTeam() {
    els.noTeamArea.style.display = 'flex';
    els.myTeamArea.style.display = 'none';
}

els.createTeamBtn.onclick = () => {
    const name = els.teamNameInput.value.trim();
    if (!name) return;
    const newTeamRef = window.db.ref('teams').push();
    const teamData = {
        name: name,
        captainId: window.myId,
        members: { [window.myId]: { name: window.myName } },
        status: 'open'
    };
    newTeamRef.set(teamData).then(() => {
        window.db.ref(`users/${window.myId}/teamId`).set(newTeamRef.key);
    });
};

function listenToTournaments() {
    window.db.ref('tournaments').on('value', snap => {
        els.trnList.innerHTML = "";
        snap.forEach(child => {
            const trn = child.val();
            const li = document.createElement('li');
            li.innerHTML = `<b>${trn.name}</b> (${trn.status})`;
            if (trn.status === 'open' && window.myTeamId && (!trn.teams || !trn.teams[window.myTeamId])) {
                const btn = document.createElement('button');
                btn.textContent = "Iscriviti";
                btn.className = "btn-success";
                btn.style.width = "auto";
                btn.style.marginLeft = "10px";
                btn.onclick = () => {
                    window.db.ref(`tournaments/${child.key}/teams/${window.myTeamId}`).set({ name: window.myTeamName });
                    window.db.ref(`tournaments/${child.key}/standings/${window.myTeamId}`).set({ points: 0, name: window.myTeamName });
                };
                li.appendChild(btn);
            }
            els.trnList.appendChild(li);
        });
    });
}

els.quitBtn.onclick = () => {
    window.parent.postMessage('closeModule', '*');
};

initTournament();
