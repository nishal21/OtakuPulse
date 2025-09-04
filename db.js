// Neon DB connection and helpers for OtakuPulse
const { Pool } = require('@neondatabase/serverless');
const { WebSocket } = require('ws');
global.WebSocket = WebSocket;

// Validate DATABASE_URL
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === 'postgresql://username:password@hostname/database?sslmode=require') {
    console.error('❌ DATABASE_URL is not configured properly!');
    console.error('Please set your actual Neon database connection string in the .env file');
    console.error('Example: DATABASE_URL=postgresql://user:pass@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL // Neon Postgres connection string
});

// Test database connection
async function testDatabaseConnection() {
    try {
        console.log('🔌 Testing database connection...');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Database connected successfully at:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('Check your DATABASE_URL in .env file');
        return false;
    }
}

// Create table if not exists (run once at startup)
async function ensureGuildSettingsTable() {
    try {
        // First test the connection
        const isConnected = await testDatabaseConnection();
        if (!isConnected) {
            throw new Error('Database connection test failed');
        }

        console.log('📋 Creating database tables...');
        
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
        
        // Create user watchlist table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_watchlist (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(32) NOT NULL,
                anime_id VARCHAR(100) NOT NULL,
                anime_title VARCHAR(500) NOT NULL,
                anime_cover_image TEXT,
                status VARCHAR(20) DEFAULT 'plan_to_watch',
                episodes_watched INTEGER DEFAULT 0,
                total_episodes INTEGER DEFAULT 0,
                score INTEGER DEFAULT 0,
                notes TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, anime_id)
            );
        `);
        
        // Create watchlist sharing table (for friends/server sharing)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS watchlist_sharing (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(32) NOT NULL,
                guild_id VARCHAR(32),
                is_public BOOLEAN DEFAULT false,
                allow_recommendations BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        console.log('✅ Database tables created successfully');
    } catch (error) {
        console.error('❌ Failed to create database tables:', error.message);
        throw error;
    }
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

// Watchlist functions
async function addToWatchlist(userId, animeData) {
    const { id, title, coverImage, episodes, status = 'plan_to_watch' } = animeData;
    
    await pool.query(`
        INSERT INTO user_watchlist (user_id, anime_id, anime_title, anime_cover_image, total_episodes, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, anime_id) 
        DO UPDATE SET 
            anime_title = EXCLUDED.anime_title,
            anime_cover_image = EXCLUDED.anime_cover_image,
            total_episodes = EXCLUDED.total_episodes,
            updated_at = CURRENT_TIMESTAMP
    `, [userId, id, title, coverImage, episodes || 0, status]);
}

async function removeFromWatchlist(userId, animeId) {
    const { rows } = await pool.query(`
        DELETE FROM user_watchlist 
        WHERE user_id = $1 AND anime_id = $2 
        RETURNING *
    `, [userId, animeId]);
    return rows.length > 0;
}

async function getUserWatchlist(userId, status = null) {
    let query = `
        SELECT * FROM user_watchlist 
        WHERE user_id = $1
    `;
    let params = [userId];
    
    if (status) {
        query += ` AND status = $2`;
        params.push(status);
    }
    
    query += ` ORDER BY updated_at DESC`;
    
    const { rows } = await pool.query(query, params);
    return rows;
}

async function updateWatchlistEntry(userId, animeId, updates) {
    const setClause = [];
    const values = [userId, animeId];
    let paramIndex = 3;
    
    if (updates.status) {
        setClause.push(`status = $${paramIndex++}`);
        values.push(updates.status);
    }
    if (updates.episodes_watched !== undefined) {
        setClause.push(`episodes_watched = $${paramIndex++}`);
        values.push(updates.episodes_watched);
    }
    if (updates.score !== undefined) {
        setClause.push(`score = $${paramIndex++}`);
        values.push(updates.score);
    }
    if (updates.notes !== undefined) {
        setClause.push(`notes = $${paramIndex++}`);
        values.push(updates.notes);
    }
    
    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    
    const { rows } = await pool.query(`
        UPDATE user_watchlist 
        SET ${setClause.join(', ')}
        WHERE user_id = $1 AND anime_id = $2
        RETURNING *
    `, values);
    
    return rows[0] || null;
}

async function getWatchlistEntry(userId, animeId) {
    const { rows } = await pool.query(`
        SELECT * FROM user_watchlist 
        WHERE user_id = $1 AND anime_id = $2
    `, [userId, animeId]);
    return rows[0] || null;
}

async function getWatchlistStats(userId) {
    const { rows } = await pool.query(`
        SELECT 
            status,
            COUNT(*) as count,
            AVG(score) as avg_score
        FROM user_watchlist 
        WHERE user_id = $1 
        GROUP BY status
    `, [userId]);
    
    const stats = {
        plan_to_watch: 0,
        watching: 0,
        completed: 0,
        on_hold: 0,
        dropped: 0,
        total: 0,
        avg_score: 0
    };
    
    let totalCount = 0;
    let totalScore = 0;
    let scoredCount = 0;
    
    rows.forEach(row => {
        stats[row.status] = parseInt(row.count);
        totalCount += parseInt(row.count);
        if (row.avg_score && row.avg_score > 0) {
            totalScore += parseFloat(row.avg_score) * parseInt(row.count);
            scoredCount += parseInt(row.count);
        }
    });
    
    stats.total = totalCount;
    stats.avg_score = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : 0;
    
    return stats;
}

module.exports = {
    pool,
    testDatabaseConnection,
    ensureGuildSettingsTable,
    getGuildSettings,
    setGuildSettings,
    isMangaUpdateNotified,
    recordMangaUpdate,
    isTrailerNotified,
    recordTrailerNotification,
    // Watchlist functions
    addToWatchlist,
    removeFromWatchlist,
    getUserWatchlist,
    updateWatchlistEntry,
    getWatchlistEntry,
    getWatchlistStats
};
