const QUIZ_QUESTIONS = [
    {
        q: "QUAL E IL SEGNALE DI SOCCORSO INTERNAZIONALE?",
        a: ["SOS", "CQD", "MAYDAY", "QRR"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL CODICE Q QTH?",
        a: ["LA MIA POSIZIONE E", "IL MIO NOME E", "SONO PRONTO", "CHIUDO LA STAZIONE"],
        correct: 0
    },
    {
        q: "QUALE ABBREVIAZIONE SI USA PER BUONGIORNO?",
        a: ["GM", "GA", "GN", "GE"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL CODICE Q QRS?",
        a: ["TRASMETTETE PIU PIANO", "AUMENTATE LA VELOCITA", "IL SEGNALE E FORTE", "CAMBIO FREQUENZA"],
        correct: 0
    },
    {
        q: "QUAL E L ABBREVIAZIONE DI BEST REGARDS?",
        a: ["73", "88", "DX", "GL"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL CODICE Q QRV?",
        a: ["SONO PRONTO", "SONO OCCUPATO", "VADO FUORI ONDA", "RIPETETE IL MESSAGGIO"],
        correct: 0
    },
    {
        q: "QUALE CARATTERE MORSE CORRISPONDE ALLA LETTERA E?",
        a: [".", "-", "..", ".-"],
        correct: 0
    },
    {
        q: "QUALE CARATTERE MORSE CORRISPONDE ALLA LETTERA T?",
        a: ["-", ".", "--", "-."],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA L ABBREVIAZIONE OM?",
        a: ["OLD MAN", "OPERATOR MODE", "ONLY MORSE", "OFFICIAL MEMBER"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL CODICE Q QSL?",
        a: ["CONFERMO LA RICEZIONE", "NON RICEVO BENE", "LA MIA FREQUENZA E", "SPOSTATEVI"],
        correct: 0
    },
    // --- ELETTROTECNICA ---
    {
        q: "QUALE FORMULA ESPRIME LA PRIMA LEGGE DI OHM?",
        a: ["V = R * I", "P = V * I", "R = V * P", "I = R / V"],
        correct: 0
    },
    {
        q: "QUAL E L UNITA DI MISURA DELLA FREQUENZA?",
        a: ["HERTZ", "WATT", "OHM", "AMPERE"],
        correct: 0
    },
    {
        q: "COSA MISURA IL WATT?",
        a: ["POTENZA", "TENSIONE", "RESISTENZA", "CORRENTE"],
        correct: 0
    },
    {
        q: "QUALE COMPONENTE ACCUMULA ENERGIA IN UN CAMPO ELETTRICO?",
        a: ["CONDENSATORE", "INDUTTORE", "RESISTORE", "DIODO"],
        correct: 0
    },
    {
        q: "COSA SUCCEDE SE DUE RESISTENZE UGUALI SONO IN PARALLELO?",
        a: ["LA RESISTENZA DIMEZZA", "LA RESISTENZA RADDOPPIA", "LA TENSIONE SI SOMMA", "NON SUCCEDE NULLA"],
        correct: 0
    },
    {
        q: "QUAL E L UNITA DI MISURA DELLA CAPACITA?",
        a: ["FARAD", "HENRY", "VOLT", "TESLA"],
        correct: 0
    },
    {
        q: "QUALE COMPONENTE PERMETTE IL PASSAGGIO DI CORRENTE IN UN SOLO VERSO?",
        a: ["DIODO", "TRANSISTOR", "RELE", "FUSIBILE"],
        correct: 0
    },
    {
        q: "COSA MISURA UN TESTER IMPOSTATO SU OHM?",
        a: ["RESISTENZA", "TENSIONE ALTERNATA", "CAPACITA", "GUADAGNO"],
        correct: 0
    },
    {
        q: "QUAL E IL SIMBOLO CHIMICO DEL PIOMBO NELLE BATTERIE?",
        a: ["PB", "CU", "AG", "AU"],
        correct: 0
    },
    {
        q: "A QUANTI MILLIAMPERE CORRISPONDE 1 AMPERE?",
        a: ["1000", "100", "10000", "10"],
        correct: 0
    },
    // --- PROPAGAZIONE ---
    {
        q: "QUALE STRATO IONOSFERICO E RESPONSABILE DELLA PROPAGAZIONE NOTTURNA HF?",
        a: ["STRATO F", "STRATO D", "STRATO E", "STRATO C"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA SWR?",
        a: ["RAPPORTO ONDE STAZIONARIE", "POTENZA DI USCITA", "GUADAGNO ANTENNA", "SENSIBILITA RICEVITORE"],
        correct: 0
    },
    {
        q: "QUALE FREQUENZA FA PARTE DELLA BANDA VHF?",
        a: ["145 MHZ", "7 MHZ", "3.5 MHZ", "28 MHZ"],
        correct: 0
    },
    {
        q: "LA PROPAGAZIONE VIA IONOSFERA SI CHIAMA ANCHE?",
        a: ["ONDA DI SPAZIO", "ONDA DI TERRA", "ONDA DI SUPERFICIE", "ONDA DIRETTA"],
        correct: 0
    },
    {
        q: "QUALE CICLO SOLARE DURA CIRCA 11 ANNI?",
        a: ["CICLO DELLE MACCHIE SOLARI", "CICLO LUNARE", "CICLO DELLE MAREE", "CICLO DI IONIZZAZIONE"],
        correct: 0
    },
    {
        q: "COSA SUCCEDE ALL ONDA RADIO SE LA FREQUENZA E SOPRA LA MUF?",
        a: ["L ONDA ATTRAVERSA LA IONOSFERA", "L ONDA VIENE RIFLESSA", "L ONDA VIENE ASSORBITA", "L ONDA RADDOPPIA"],
        correct: 0
    },
    {
        q: "QUAL E L ANTENNA PIU SEMPLICE E USATA DAI RADIOAMATORI?",
        a: ["DIPOLO", "YAGI", "VERTICALE", "QUAD"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL TERMINE DX?",
        a: ["COLLEGAMENTO A LUNGA DISTANZA", "COLLEGAMENTO LOCALE", "BASSA POTENZA", "DIRETTA"],
        correct: 0
    },
    {
        q: "LO STRATO E SPORADICO SI MANIFESTA SOPRATTUTTO IN?",
        a: ["ESTATE", "INVERNO", "AUTUNNO", "NOTTE"],
        correct: 0
    },
    {
        q: "QUALE BANDA HF E NOTA COME BANDA DEI 40 METRI?",
        a: ["7 MHZ", "14 MHZ", "21 MHZ", "3.5 MHZ"],
        correct: 0
    },
    // --- PRATICA OPERATIVA ---
    {
        q: "COSA SIGNIFICA IL CODICE Q QRM?",
        a: ["INTERFERENZA DA ALTRE STAZIONI", "INTERFERENZA ATMOSFERICA", "SEGNALE DEBOLE", "DISTORSIONE AUDIO"],
        correct: 0
    },
    {
        q: "QUALE PREFISSO IDENTIFICA LE STAZIONI ITALIANE?",
        a: ["I", "K", "DL", "EA"],
        correct: 0
    },
    {
        q: "COSA SI USA PER CONFERMARE UN CONTATTO VIA POSTA O DIGITALE?",
        a: ["CARTOLINA QSL", "LOG DI STAZIONE", "DIPLOMA", "RICEVUTA"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA L ABBREVIAZIONE YL?",
        a: ["GIOVANE SIGNORA", "VECCHIO AMICO", "OPERATORE ESPERTO", "NUOVO SOCIO"],
        correct: 0
    },
    {
        q: "QUALE MODO DIGITALE E MOLTO POPOLARE PER IL DX DEBOLE?",
        a: ["FT8", "CW", "RTTY", "AM"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL CODICE Q QRZ?",
        a: ["CHI MI CHIAMA?", "SONO PRONTO", "CHIUDO LA STAZIONE", "AUMENTATE POTENZA"],
        correct: 0
    },
    {
        q: "QUAL E LA POTENZA MASSIMA PER UN NOMINATIVO ORDINARIO IN ITALIA?",
        a: ["500 WATT", "100 WATT", "1000 WATT", "10 WATT"],
        correct: 0
    },
    {
        q: "IN CW COSA SIGNIFICA L ABBREVIAZIONE SK?",
        a: ["FINE DELLE TRASMISSIONI", "SONO PRONTO", "RIPETETE", "BUONA FORTUNA"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL TERMINE QRP?",
        a: ["BASSA POTENZA", "ALTA POTENZA", "FREQ. LIBERA", "STAZIONE MOBILE"],
        correct: 0
    },
    {
        q: "QUALE TIPO DI CAVO HA IMPEDENZA TIPICA DI 50 OHM?",
        a: ["CAVO COASSIALE", "DOPPINO TELEFONICO", "PIATTINA", "CAVO ELETTRICO"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA IL CODICE Q QSO?",
        a: ["COLLEGAMENTO RADIO", "NOME DELLA STAZIONE", "ORARIO ESATTO", "METEO"],
        correct: 0
    },
    {
        q: "QUALE BANDA E DEFINITA DEI 20 METRI?",
        a: ["14 MHZ", "7 MHZ", "28 MHZ", "21 MHZ"],
        correct: 0
    },
    {
        q: "COSA MISURA IL RAPPORTO S NEI SEGNALI RADIO?",
        a: ["FORZA DEL SEGNALE", "QUALITA AUDIO", "DISTORSIONE", "LARGHEZZA BANDA"],
        correct: 0
    },
    {
        q: "QUALE COMPONENTE SI USA PER ACCORDARE UN ANTENNA?",
        a: ["ACCORDATORE", "AMPLIFICATORE", "FILTRO", "MODULATORE"],
        correct: 0
    },
    {
        q: "COSA SIGNIFICA L ABBREVIAZIONE WX?",
        a: ["CONDIZIONI METEO", "LAVORO IN CORSO", "STAZIONE REMOTA", "FREQ. OCCUPATA"],
        correct: 0
    }
];
