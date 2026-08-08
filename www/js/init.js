// ============================================================================
// INIT.JS - TRIGGER DI AVVIO DELL'APPLICAZIONE
// ============================================================================

(function() {
    console.log("Inizializzazione gioco in corso...");

    if (!tgUser) {
        if (els.loadingScreen) els.loadingScreen.classList.remove('active-screen');
        if (els.errorScreen) els.errorScreen.classList.add('active-screen');
    } else {
        myName = tgUser.first_name;
        myId = tgUser.id.toString();

        // La funzione initGame è definita in firebase_manager.js
        if (typeof initGame === 'function') {
            initGame();
        } else {
            console.error("ERRORE: initGame non trovata! Verifica l'ordine dei file JS.");
            if (els.initStatusText) els.initStatusText.textContent = "Errore fatale: initGame non caricata.";
        }
    }
})();
