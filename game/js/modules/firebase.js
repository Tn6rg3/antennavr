/**
 * FirebaseDB - Gestione centralizzata di Firebase (database, auth, listeners)
 */

window.FirebaseDB = {
  db: null,
  auth: null,

  /**
   * Inizializza Firebase con config
   */
  init(firebaseConfig) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    this.db = firebase.database();
    this.auth = firebase.auth();
  },

  /**
   * Attach listener con tracking automatico
   * @param {string} path - Percorso Firebase
   * @param {string} key - Chiave univoca per tracciamento
   * @param {Function} callback - Callback per l'evento value
   */
  attachListener(path, key, callback) {
    this.detachListener(key);
    const ref = this.db.ref(path);
    const listener = ref.on('value', callback);
    GameState.listeners[key] = { ref, callback };
    return listener;
  },

  /**
   * Detach singolo listener
   */
  detachListener(key) {
    if (GameState.listeners[key]) {
      GameState.listeners[key].ref.off('value', GameState.listeners[key].callback);
      delete GameState.listeners[key];
    }
  },

  /**
   * Detach tutti i listener (per cleanup)
   */
  detachAllListeners() {
    Object.entries(GameState.listeners).forEach(([key, data]) => {
      if (data && data.ref) {
        data.ref.off('value', data.callback);
      }
    });
    GameState.listeners = {};
  },

  /**
   * Update score giocatore in stanza
   */
  async updateScore(roomCode, score, wpm, wordIndex = null) {
    if (!roomCode || !GameState.player.id) return;
    const updates = { score, wpm };
    if (wordIndex !== null) updates.wordIndex = wordIndex;
    
    return this.db.ref(`rooms/${roomCode}/players/${GameState.player.id}`).update(updates);
  },

  /**
   * Update presenza online
   */
  async updatePresence(status = 'online') {
    if (!GameState.player.id) return;
    return this.db.ref(`presence/${GameState.player.id}`).update({
      name: GameState.player.name,
      username: GameState.player.privacy ? "" : GameState.player.username,
      status: status,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  },

  /**
   * Set listener per disconnessione
   */
  setDisconnectHandler(path, data) {
    this.db.ref(path).onDisconnect().update(data);
  },

  /**
   * Remove su disconnessione
   */
  removeOnDisconnect(path) {
    this.db.ref(path).onDisconnect().remove();
  },

  /**
   * Transazione sicura con rollback automatico
   */
  async transaction(path, updateFn) {
    return this.db.ref(path).transaction(updateFn);
  },

  /**
   * Fetch dati una volta
   */
  async fetchOnce(path) {
    const snap = await this.db.ref(path).once('value');
    return snap.val();
  },

  /**
   * Push documento (per history, messages, etc)
   */
  async push(path, data) {
    const ref = this.db.ref(path).push();
    await ref.set(data);
    return ref.key;
  },

  /**
   * Elimina dati
   */
  async remove(path) {
    return this.db.ref(path).remove();
  },

  /**
   * Set con ServerValue.TIMESTAMP
   */
  async setWithTimestamp(path, data) {
    const withTs = { ...data, ts: firebase.database.ServerValue.TIMESTAMP };
    return this.db.ref(path).set(withTs);
  }
};
