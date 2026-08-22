// game4/common/telegram_init.js

if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    window.tg = window.Telegram.WebApp;
    window.tgUser = window.tg.initDataUnsafe?.user;
    window.tgUsername = window.tgUser?.username || "";

    if (typeof window.tg.disableVerticalSwipes === 'function') {
        window.tg.disableVerticalSwipes();
    }
} else {
    console.warn("Telegram WebApp non rilevata. Assicurati di essere dentro Telegram.");
}
