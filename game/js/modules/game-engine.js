/**
 * GameEngine - Logica core del game (punteggio, word submission, game loop)
 */

window.GameEngine = {
  /**
   * Calcola distanza Levenshtein tra due stringhe
   */
  levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  },

  /**
   * Calcola punteggio basato su risposta e modalità
   */
  calculateScore(userWord, currentWord, wpm, isReplay = false) {
    const levDist = this.levenshteinDistance(currentWord, userWord);
    const reactionMs = Date.now() - GameState.game.lastWordStartTime;

    if (GameState.room.mode === 'chars') {
      // Modalità Caratteri: basata su ms
      if (userWord === currentWord) {
        const points = Math.max(100, Math.floor(1000 - reactionMs / 2));
        return { points, color: '#4caf50' };
      } else {
        return { points: 0, color: '#d32f2f' };
      }
    }

    // Modalità Parole / Nominativi / Ping Pong
    const basePoints = (Math.pow(wpm, 2) * currentWord.length) / (10 * Math.pow(levDist + 1, 2));

    const estimatedAudioMs = (currentWord.length * 60 / wpm) * 1000;
    const gracePeriod = 2000;
    let timeMultiplier = 1.0;

    if (reactionMs > estimatedAudioMs + gracePeriod) {
      const delay = reactionMs - (estimatedAudioMs + gracePeriod);
      timeMultiplier = Math.max(0.5, 1.0 - delay / 20000);
    } else if (reactionMs < estimatedAudioMs && levDist === 0) {
      timeMultiplier = 1.1;
    }

    let points = Math.round(basePoints * timeMultiplier);

    let color = '';
    if (levDist === 0) color = isReplay ? '#999999' : '#4caf50';
    else if (levDist === 1) color = '#ff9800';
    else color = '#d32f2f';

    if (isReplay) points = Math.round(points * 0.2);

    return { points, color };
  },

  /**
   * Gestisce la sottomissione di una parola
   */
  handleWordSubmission(userWord) {
    const currentWord = GameState.game.words[GameState.game.wordIndex].toUpperCase();
    const { points, color } = this.calculateScore(
      userWord,
      currentWord,
      GameState.room.wpm,
      GameState.game.usedReplay
    );

    // Aggiorna statistiche errori
    if (userWord !== currentWord) {
      const levDist = this.levenshteinDistance(currentWord, userWord);
      if (levDist > 0) {
        for (let i = 0; i < Math.max(currentWord.length, userWord.length); i++) {
          if (userWord[i] !== currentWord[i] && currentWord[i]) {
            const char = currentWord[i];
            if (char !== '__proto__' && char !== 'constructor' && char !== 'prototype') {
              GameState.errors.sessionCharErrors[char] = 
                (GameState.errors.sessionCharErrors[char] || 0) + 1;

              if (!GameState.errors.sessionErrorsByWpm[GameState.room.wpm]) {
                GameState.errors.sessionErrorsByWpm[GameState.room.wpm] = {};
              }
              GameState.errors.sessionErrorsByWpm[GameState.room.wpm][char] = 
                (GameState.errors.sessionErrorsByWpm[GameState.room.wpm][char] || 0) + 1;
            }
          }
        }
      }
    }

    // Aggiorna velocità adattiva
    if (!GameState.room.isFixedSpeed && GameState.room.mode !== 'chars') {
      const levDist = this.levenshteinDistance(currentWord, userWord);
      if (levDist === 0 && !GameState.game.usedReplay) {
        GameState.room.wpm += 2;
      } else if (levDist === 1) {
        GameState.room.wpm -= 1;
      } else if (levDist > 1) {
        GameState.room.wpm -= 2;
      }
      GameState.room.wpm = Math.max(10, GameState.room.wpm);
    }

    GameState.game.totalScore += points;
    GameState.game.matchDetails.push({
      real: currentWord,
      typed: userWord,
      points: points,
      wpm: GameState.room.wpm,
      ms: Date.now() - GameState.game.lastWordStartTime
    });

    // Aggiorna UI se non pingpong
    if (GameState.room.mode !== 'pingpong') {
      const tr = document.createElement('tr');

      const tdTyped = document.createElement('td');
      tdTyped.textContent = userWord;

      const tdReal = document.createElement('td');
      const bReal = document.createElement('b');
      bReal.textContent = currentWord;
      tdReal.appendChild(bReal);

      const tdPoints = document.createElement('td');
      tdPoints.style.color = color;
      tdPoints.style.fontWeight = 'bold';

      if (GameState.room.mode === 'chars') {
        tdPoints.textContent = points + ' (' + (Date.now() - GameState.game.lastWordStartTime) + 'ms)';
      } else {
        tdPoints.textContent = GameState.game.usedReplay ? '0 (Replay)' : (points > 0 ? '+' + points : points);
      }

      tr.appendChild(tdTyped);
      tr.appendChild(tdReal);
      tr.appendChild(tdPoints);
      document.getElementById('tableBody').appendChild(tr);

      const tableWrapper = document.getElementById('tableWrapper');
      tableWrapper.scrollTop = tableWrapper.scrollHeight;
    }

    document.getElementById('wpmDisplay').textContent = 
      `WPM: ${GameState.room.wpm}${GameState.room.isFixedSpeed ? ' (Fix)' : ''}`;
    document.getElementById('scoreDisplay').textContent = `Punti: ${GameState.game.totalScore}`;

    // Aggiorna Firebase
    if (GameState.room.code) {
      FirebaseDB.updateScore(
        GameState.room.code,
        GameState.game.totalScore,
        GameState.room.wpm,
        GameState.game.wordIndex + 1
      );
    }

    GameState.game.usedReplay = false;
    GameState.game.wordIndex++;

    return { points, color };
  },

  /**
   * Genera parole casuali
   */
  getGameWords(num, mode, masterDictionary, customDictionary) {
    if (mode === 'callsign') {
      return Array.from({ length: num }, () => this.generateCallsign());
    }
    if (mode === 'pingpong') {
      return [];
    }
    if (mode === 'chars') {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return Array.from({ length: num }, () => chars[Math.floor(Math.random() * chars.length)]);
    }
    if (mode === 'custom') {
      if (customDictionary.length === 0) return [];
      return [...customDictionary]
        .sort(() => 0.5 - Math.random())
        .slice(0, num)
        .map(w => w.toUpperCase());
    }

    const dict = masterDictionary.length > 0 ? masterDictionary : [];
    return dict
      .sort(() => 0.5 - Math.random())
      .slice(0, num)
      .map(w => w.toUpperCase());
  },

  /**
   * Genera callsign random
   */
  generateCallsign() {
    const prefixes = ['I', 'IK', 'IZ', 'IN', 'IT', 'IS', 'IU', 'IW', 'W', 'K', 'N', 'A', 'WA', 'WB', 'DL', 'DJ', 'DK', 'DO', 'EA', 'EB', 'EC', 'F', 'G', 'M', 'GW', 'GM', '9A', 'S5', 'OK', 'OM'];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    let prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    let digit = Math.floor(Math.random() * 10);
    let rand = Math.random();
    let suffixLen = rand > 0.9 ? 1 : rand > 0.7 ? 2 : 3;
    let suffix = '';

    for (let i = 0; i < suffixLen; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }

    let callsign = prefix + digit + suffix;

    if (Math.random() > 0.9) {
      const modifiers = ['/QRP', '/P', '/M', '/AM', '/MM'];
      callsign += modifiers[Math.floor(Math.random() * modifiers.length)];
    }

    return callsign;
  }
};
