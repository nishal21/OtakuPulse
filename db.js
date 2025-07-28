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
            manga_updates_channel VARCHAR(32),
            daily_quotes BOOLEAN,
            airing_alerts BOOLEAN,
            trailer_notifications BOOLEAN,
            top_anime_rankings BOOLEAN,
            anime_search BOOLEAN,
            manga_updates BOOLEAN
        );
    `);
    
    // Create manga updates tracking table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS manga_updates (
            id SERIAL PRIMARY KEY,
            manga_id VARCHAR(100),
            chapter_id VARCHAR(100),
            title VARCHAR(500),
            chapter_title VARCHAR(500),
            chapter_number VARCHAR(50),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(manga_id, chapter_id)
        );
    `);
    
    // Create trailer notifications tracking table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS trailer_notifications (
            id SERIAL PRIMARY KEY,
            anime_id VARCHAR(100),
            trailer_id VARCHAR(100),
            title VARCHAR(500),
            notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(anime_id, trailer_id)
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
            guild_id, notification_channel, daily_quotes_channel, airing_alerts_channel, trailer_notifications_channel, top_anime_rankings_channel, anime_search_channel, manga_updates_channel,
            daily_quotes, airing_alerts, trailer_notifications, top_anime_rankings, anime_search, manga_updates
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (guild_id) DO UPDATE SET
            notification_channel = EXCLUDED.notification_channel,
            daily_quotes_channel = EXCLUDED.daily_quotes_channel,
            airing_alerts_channel = EXCLUDED.airing_alerts_channel,
            trailer_notifications_channel = EXCLUDED.trailer_notifications_channel,
            top_anime_rankings_channel = EXCLUDED.top_anime_rankings_channel,
            anime_search_channel = EXCLUDED.anime_search_channel,
            manga_updates_channel = EXCLUDED.manga_updates_channel,
            daily_quotes = EXCLUDED.daily_quotes,
            airing_alerts = EXCLUDED.airing_alerts,
            trailer_notifications = EXCLUDED.trailer_notifications,
            top_anime_rankings = EXCLUDED.top_anime_rankings,
            anime_search = EXCLUDED.anime_search,
            manga_updates = EXCLUDED.manga_updates;
    `, [
        guildId,
        settings.notification_channel,
        settings.daily_quotes_channel,
        settings.airing_alerts_channel,
        settings.trailer_notifications_channel,
        settings.top_anime_rankings_channel,
        settings.anime_search_channel,
        settings.manga_updates_channel,
        settings.daily_quotes,
        settings.airing_alerts,
        settings.trailer_notifications,
        settings.top_anime_rankings,
        settings.anime_search,
        settings.manga_updates
    ]);
}

// Check if manga update has been notified
async function isMangaUpdateNotified(mangaId, chapterId) {
    const { rows } = await pool.query(
        'SELECT id FROM manga_updates WHERE manga_id = $1 AND chapter_id = $2',
        [mangaId, chapterId]
    );
    return rows.length > 0;
}

// Record manga update notification
async function recordMangaUpdate(mangaId, chapterId, title, chapterTitle, chapterNumber) {
    await pool.query(`
        INSERT INTO manga_updates (manga_id, chapter_id, title, chapter_title, chapter_number)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (manga_id, chapter_id) DO NOTHING
    `, [mangaId, chapterId, title, chapterTitle, chapterNumber]);
}

// Check if trailer has been notified
async function isTrailerNotified(animeId, trailerId) {
    const { rows } = await pool.query(
        'SELECT id FROM trailer_notifications WHERE anime_id = $1 AND trailer_id = $2',
        [animeId, trailerId]
    );
    return rows.length > 0;
}

// Record trailer notification
async function recordTrailerNotification(animeId, trailerId, title) {
    await pool.query(`
        INSERT INTO trailer_notifications (anime_id, trailer_id, title)
        VALUES ($1, $2, $3)
        ON CONFLICT (anime_id, trailer_id) DO NOTHING
    `, [animeId, trailerId, title]);
}

module.exports = {
    pool,
    ensureGuildSettingsTable,
    getGuildSettings,
    setGuildSettings,
    isMangaUpdateNotified,
    recordMangaUpdate,
    isTrailerNotified,
    recordTrailerNotification
};
