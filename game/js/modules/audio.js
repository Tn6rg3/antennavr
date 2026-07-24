/**
 * AudioManager - Gestione centralizzata dell'audio (Morse, beep, feedback)
 */

window.AudioManager = {
  ctx: null,
  morseDict: {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.',
    'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..', 
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '/': '-..-.', 
    'À': '.--.-', 'È': '.-..-', 'É': '..-..', 'Ì': '.---.', 'Ò': '---.', 'Ù': '..---'
  },

  /**
   * Inizializza il contesto audio al primo uso
   */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  },

  /**
   * Riproduce un beep semplice
   * @param {number} freq - Frequenza in Hz (default 600)
   * @param {number} duration - Durata in secondi (default 0.2)
   */
  beep(freq = 600, duration = 0.2) {
    if (!this.ctx) this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const time = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
      gain.gain.setValueAtTime(0.5, time + duration - 0.005);
      gain.gain.linearRampToValueAtTime(0, time + duration);

      osc.start(time);
      osc.stop(time + duration);
    } catch (e) {
      console.warn("Audio beep error:", e);
    }
  },

  /**
   * Riproduce codice Morse
   * @param {string} text - Testo da convertire in Morse
   * @param {number} wpm - Velocità in parole al minuto
   * @returns {Promise} Risolve quando l'audio finisce
   */
  async playMorse(text, wpm) {
    return new Promise(resolve => {
      if (!this.ctx || !GameState.game.running) {
        resolve();
        return;
      }

      this.init();
      const unitDuration = 1.2 / wpm;
      let time = this.ctx.currentTime + 0.05;

      for (let char of text) {
        if (!GameState.game.running) break;

        if (this.morseDict[char]) {
          for (let symbol of this.morseDict[char]) {
            if (!GameState.game.running) break;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.value = GameState.room.tone;
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            const duration = (symbol === '-') ? (3 * unitDuration) : unitDuration;
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.5, time + 0.005);
            gain.gain.setValueAtTime(0.5, time + duration - 0.005);
            gain.gain.linearRampToValueAtTime(0, time + duration);

            osc.start(time);
            osc.stop(time + duration);
            time += duration + unitDuration;
          }
          time += 2 * unitDuration;
        } else if (char === ' ') {
          time += 4 * unitDuration;
        }
      }

      const totalDurationMs = (time - this.ctx.currentTime) * 1000;
      setTimeout(resolve, totalDurationMs);
    });
  },

  /**
   * Riproduce sequenza beep per medal award
   */
  playMedalSound() {
    if (!this.ctx) this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'triangle';
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.5); // C6
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

    osc.start(now);
    osc.stop(now + 0.8);
  },

  /**
   * Stop dell'audio context
   */
  stop() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }
};
