// Neon DB connection and helpers for OtakuPulse
const { Pool } = require('@neondatabase/serverless');
const { WebSocket } = require('ws');
global.WebSocket = WebSocket;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL // Neon Postgres connection string
});

// Create table if not exists (run once at startup)
async function ensureGuildSettingsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id VARCHAR(32) PRIMARY KEY,
            notification_channel VARCHAR(32),
            daily_quotes_channel VARCHAR(32),
            airing_alerts_channel VARCHAR(32),
            trailer_notifications_channel VARCHAR(32),
            top_anime_rankings_channel VARCHAR(32),
            anime_search_channel VARCHAR(32),
            daily_quotes BOOLEAN,
            airing_alerts BOOLEAN,
            trailer_notifications BOOLEAN,
            top_anime_rankings BOOLEAN,
            anime_search BOOLEAN
        );
    `);
}

// Get settings for a guild
async function getGuildSettings(guildId) {
    const { rows } = await pool.query('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
    return rows[0] || null;
}

// Set/update settings for a guild
async function setGuildSettings(guildId, settings) {
    await pool.query(`
        INSERT INTO guild_settings (
            guild_id, notification_channel, daily_quotes_channel, airing_alerts_channel, trailer_notifications_channel, top_anime_rankings_channel, anime_search_channel,
            daily_quotes, airing_alerts, trailer_notifications, top_anime_rankings, anime_search
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT (guild_id) DO UPDATE SET
            notification_channel = EXCLUDED.notification_channel,
            daily_quotes_channel = EXCLUDED.daily_quotes_channel,
            airing_alerts_channel = EXCLUDED.airing_alerts_channel,
            trailer_notifications_channel = EXCLUDED.trailer_notifications_channel,
            top_anime_rankings_channel = EXCLUDED.top_anime_rankings_channel,
            anime_search_channel = EXCLUDED.anime_search_channel,
            daily_quotes = EXCLUDED.daily_quotes,
            airing_alerts = EXCLUDED.airing_alerts,
            trailer_notifications = EXCLUDED.trailer_notifications,
            top_anime_rankings = EXCLUDED.top_anime_rankings,
            anime_search = EXCLUDED.anime_search;
    `, [
        guildId,
        settings.notification_channel,
        settings.daily_quotes_channel,
        settings.airing_alerts_channel,
        settings.trailer_notifications_channel,
        settings.top_anime_rankings_channel,
        settings.anime_search_channel,
        settings.daily_quotes,
        settings.airing_alerts,
        settings.trailer_notifications,
        settings.top_anime_rankings,
        settings.anime_search
    ]);
}

module.exports = {
    pool,
    ensureGuildSettingsTable,
    getGuildSettings,
    setGuildSettings
};
