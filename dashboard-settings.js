// Express route for dashboard feature selection

const express = require('express');
const router = express.Router();
const { getGuildSettings, setGuildSettings } = require('./db');

router.post('/dashboard/settings', async (req, res) => {
    const {
        guildId,
        dailyQuotes,
        airingAlerts,
        trailerNotifications,
        topAnimeRankings,
        animeSearch,
        mangaUpdates,
        dailyQuotesChannel,
        airingAlertsChannel,
        trailerNotificationsChannel,
        topAnimeRankingsChannel,
        animeSearchChannel,
        mangaUpdatesChannel
    } = req.body;
    if (!guildId) return res.redirect('/dashboard');
    let settings = await getGuildSettings(guildId);
    if (!settings) {
        // If not configured, create default settings using submitted channels or first available
        settings = {
            notification_channel: dailyQuotesChannel || airingAlertsChannel || trailerNotificationsChannel || topAnimeRankingsChannel || animeSearchChannel || mangaUpdatesChannel || null,
            daily_quotes: !!dailyQuotes,
            airing_alerts: !!airingAlerts,
            trailer_notifications: !!trailerNotifications,
            top_anime_rankings: !!topAnimeRankings,
            anime_search: !!animeSearch,
            manga_updates: !!mangaUpdates,
            daily_quotes_channel: dailyQuotesChannel || null,
            airing_alerts_channel: airingAlertsChannel || null,
            trailer_notifications_channel: trailerNotificationsChannel || null,
            top_anime_rankings_channel: topAnimeRankingsChannel || null,
            anime_search_channel: animeSearchChannel || null,
            manga_updates_channel: mangaUpdatesChannel || null
        };
    } else {
        settings.daily_quotes = !!dailyQuotes;
        settings.airing_alerts = !!airingAlerts;
        settings.trailer_notifications = !!trailerNotifications;
        settings.top_anime_rankings = !!topAnimeRankings;
        settings.anime_search = !!animeSearch;
        settings.manga_updates = !!mangaUpdates;
        settings.daily_quotes_channel = dailyQuotesChannel || settings.notification_channel;
        settings.airing_alerts_channel = airingAlertsChannel || settings.notification_channel;
        settings.trailer_notifications_channel = trailerNotificationsChannel || settings.notification_channel;
        settings.top_anime_rankings_channel = topAnimeRankingsChannel || settings.notification_channel;
        settings.anime_search_channel = animeSearchChannel || settings.notification_channel;
        settings.manga_updates_channel = mangaUpdatesChannel || settings.notification_channel;
    }
    await setGuildSettings(guildId, settings);
    res.redirect('/dashboard');
});

module.exports = router;
