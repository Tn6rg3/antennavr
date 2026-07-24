/**
 * UIManager - Gestione centralizzata dell'interfaccia utente
 */

window.UIManager = {
  /**
   * Mostra una schermata (screen)
   */
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.remove('active-screen');
    });

    const screenEl = document.getElementById(screenId);
    if (screenEl) {
      screenEl.classList.add('active-screen');
    }

    GameState.set('ui.activeScreen', screenId);
    this.handleScreenTransition(screenId);
  },

  /**
   * Logica specifica per ogni transizione di schermata
   */
  handleScreenTransition(screenId) {
    this.hideChat();
    document.getElementById('matchDetailsModal').style.display = 'none';

    switch (screenId) {
      case 'teamsScreen':
        GameState.set('ui.activeChatContext', 'team');
        this.checkMyTeamStatus();
        break;
      case 'lobbyScreen':
      case 'gameArea':
        GameState.set('ui.activeChatContext', 'room');
        this.listenToChat();
        break;
      case 'participationScreen':
        this.switchActTab('daily');
        GameState.set('ui.activeChatContext', null);
        break;
      default:
        GameState.set('ui.activeChatContext', 'global');
        this.listenToChat();
    }

    if (screenId === 'setupScreen') {
      const lastRoom = localStorage.getItem('cwgame_last_room');
      if (!lastRoom) {
        document.getElementById('rejoinContainer').style.display = 'none';
      }
    }
  },

  /**
   * Mostra un toast (notifica breve)
   */
  showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  },

  /**
   * Toggle chat drawer
   */
  toggleChat() {
    const drawer = document.getElementById('chatDrawer');
    const isOpen = drawer.style.display !== 'none';
    
    if (!isOpen) {
      drawer.style.display = 'flex';
      GameState.set('ui.chatOpen', true);
      document.getElementById('chatMessages').scrollTop = 
        document.getElementById('chatMessages').scrollHeight;
    } else {
      drawer.style.display = 'none';
      GameState.set('ui.chatOpen', false);
    }
  },

  /**
   * Nascondi chat
   */
  hideChat() {
    document.getElementById('chatDrawer').style.display = 'none';
    GameState.set('ui.chatOpen', false);
    FirebaseDB.detachListener('chat');
  },

  /**
   * Setup chat listener basato su contesto
   */
  listenToChat() {
    const context = GameState.get('ui.activeChatContext');
    
    if (context === 'room' && GameState.room.code) {
      this.setupChatListener(
        `rooms/${GameState.room.code}/chat`,
        'room_chat',
        '💬 Chat Stanza'
      );
    } else {
      this.setupChatListener('globalChat', 'global_chat', '🌎 Chat Globale');
    }
  },

  /**
   * Setup listener per chat generica
   */
  setupChatListener(path, key, title) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    document.getElementById('chatTitle').textContent = title;

    let initialLoad = true;
    let lastTs = Date.now();

    const callback = (snapshot) => {
      container.innerHTML = '';
      let newMsgsCount = 0;
      let latestMsg = null;
      let maxTs = lastTs;

      snapshot.forEach(child => {
        const msg = child.val();
        const div = document.createElement('div');
        div.style.marginBottom = '6px';

        if (msg.ts) {
          const d = new Date(msg.ts);
          const dateSmall = document.createElement('small');
          dateSmall.style.color = 'var(--hint-color)';
          dateSmall.style.fontSize = '0.75em';
          dateSmall.textContent = `[${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
          })}] `;
          div.appendChild(dateSmall);
          if (msg.ts > maxTs) maxTs = msg.ts;
        }

        const nameB = document.createElement('b');
        nameB.style.color = 'var(--link-color)';
        nameB.textContent = msg.name + ':';
        div.appendChild(nameB);

        div.appendChild(document.createTextNode(' ' + msg.text));
        container.appendChild(div);

        if (!initialLoad && msg.ts && msg.ts > lastTs && msg.name !== GameState.player.name) {
          newMsgsCount++;
          latestMsg = msg;
        }
      });

      lastTs = maxTs;
      container.scrollTop = container.scrollHeight;

      if (!initialLoad && newMsgsCount > 0 && latestMsg) {
        this.showToast(`💬 Nuovo messaggio da ${latestMsg.name}`);
      }

      initialLoad = false;
    };

    FirebaseDB.attachListener(path, key, callback);
  },

  /**
   * Mostra modal con dettagli partita
   */
  showMatchDetailsModal(name, details) {
    const modal = document.getElementById('matchDetailsModal');
    const body = document.getElementById('matchDetailsBody');
    body.innerHTML = '';

    modal.querySelector('h3').textContent = 
      `${GameState.get('game.currentLang') === 'it' ? 'Dettagli Partita di' : 'Match Details for'} ${name}`;

    details.forEach(row => {
      const tr = document.createElement('tr');
      let color = row.points > 0 ? '#4caf50' : 
                  (row.points === 0 && row.typed !== row.real ? '#d32f2f' : '#999999');

      const tdTyped = document.createElement('td');
      tdTyped.textContent = row.typed || '-';

      const tdReal = document.createElement('td');
      const bReal = document.createElement('b');
      this.renderDiffSecure(bReal, row.real, row.typed || '');
      tdReal.appendChild(bReal);

      const tdPoints = document.createElement('td');
      tdPoints.style.color = color;
      tdPoints.style.fontWeight = 'bold';
      tdPoints.textContent = row.points;

      tr.appendChild(tdTyped);
      tr.appendChild(tdReal);
      tr.appendChild(tdPoints);
      body.appendChild(tr);
    });

    modal.style.display = 'flex';
  },

  /**
   * Renderizza differenza tra testo reale e digitato (colorato)
   */
  renderDiffSecure(container, real, typed) {
    const max = Math.max(real.length, typed.length);
    for (let i = 0; i < max; i++) {
      if (!real[i]) continue;
      const span = document.createElement('span');
      if (!typed[i] || typed[i] !== real[i]) {
        span.style.color = '#d32f2f'; // Rosso per errore
      }
      span.textContent = real[i];
      container.appendChild(span);
    }
  },

  /**
   * Attiva tab attività
   */
  switchActTab(period) {
    document.querySelectorAll('#participationScreen .tab-btn').forEach(b => {
      b.classList.remove('active-tab');
    });

    const tabId = `tab${period.charAt(0).toUpperCase() + period.slice(1)}Act`;
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.classList.add('active-tab');

    const now = new Date();
    let key = '';
    let title = '';

    if (period === 'daily') {
      key = now.toISOString().split('T')[0];
      title = 'I più attivi di Oggi';
    } else if (period === 'weekly') {
      key = this.getWeekNumber(now);
      title = 'I più attivi della Settimana';
    } else {
      key = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');
      title = 'I più attivi del Mese';
    }

    document.getElementById('actListTitle').textContent = title;
    this.renderActivityRankings(period, key);
  },

  /**
   * Helper: calcola settimana ISO
   */
  getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + '-W' + (weekNo < 10 ? '0' + weekNo : weekNo);
  },

  /**
   * Renderizza classifica attività
   */
  renderActivityRankings(period, key) {
    const list = document.getElementById('activityRankList');
    list.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Caricamento...</li>';

    FirebaseDB.db.ref(`activity/${period}/${key}`).once('value').then(snap => {
      list.innerHTML = '';
      let users = [];

      if (snap.exists()) {
        snap.forEach(child => {
          const u = child.val();
          if (u && typeof u === 'object') {
            users.push({ id: child.key, ...u });
          }
        });
      }

      users.sort((a, b) => (b.games || 0) - (a.games || 0));
      users = users.slice(0, 50);

      if (users.length === 0) {
        list.innerHTML = '<li style="justify-content:center; color:var(--hint-color);">Nessuna attività registrata.</li>';
        return;
      }

      users.forEach((u, idx) => {
        const li = document.createElement('li');
        let medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

        const nameSpan = document.createElement('span');
        const medalText = document.createTextNode(medal + ' ');
        nameSpan.appendChild(medalText);
        const nameB = document.createElement('b');
        nameB.textContent = u.name || 'Anonimo';
        nameSpan.appendChild(nameB);

        const statsSpan = document.createElement('span');
        const gamesB = document.createElement('b');
        gamesB.textContent = u.games || 0;
        statsSpan.appendChild(gamesB);
        statsSpan.appendChild(document.createTextNode(' part. '));
        const winsSmall = document.createElement('small');
        winsSmall.style.color = '#4caf50';
        winsSmall.textContent = `(${u.wins || 0} v.)`;
        statsSpan.appendChild(winsSmall);

        li.appendChild(nameSpan);
        li.appendChild(statsSpan);
        list.appendChild(li);
      });
    }).catch(err => {
      list.innerHTML = `<li style="justify-content:center; color:var(--hint-color); flex-direction:column; text-align:center;">
        <span>Errore nel caricamento.</span>
        <small style="font-size:0.7em; opacity:0.7;">Firebase: ${err.message}</small>
      </li>`;
    });
  },

  checkMyTeamStatus() {
    // Placeholder - verrà implementato
  }
};
