// Analytics and user statistics tracking
const { pool } = require('../db');

class AnalyticsManager {
    constructor(logger) {
        this.logger = logger;
        this.enabled = process.env.ENABLE_ANALYTICS === 'true';
        this.initTables();
    }

    async initTables() {
        if (!this.enabled) return;

        try {
            // Command usage tracking
            await pool.query(`
                CREATE TABLE IF NOT EXISTS command_usage (
                    id SERIAL PRIMARY KEY,
                    command_name VARCHAR(50) NOT NULL,
                    user_id VARCHAR(32) NOT NULL,
                    guild_id VARCHAR(32),
                    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    execution_time_ms INTEGER,
                    success BOOLEAN DEFAULT TRUE,
                    error_message TEXT
                );
            `);

            // User preferences and behavior
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id VARCHAR(32) PRIMARY KEY,
                    favorite_genres TEXT[],
                    preferred_anime_type VARCHAR(20),
                    language_preference VARCHAR(10) DEFAULT 'en',
                    notification_frequency VARCHAR(20) DEFAULT 'daily',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Server statistics
            await pool.query(`
                CREATE TABLE IF NOT EXISTS server_stats (
                    guild_id VARCHAR(32) PRIMARY KEY,
                    total_commands_used INTEGER DEFAULT 0,
                    active_users_count INTEGER DEFAULT 0,
                    most_used_command VARCHAR(50),
                    setup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Popular content tracking
            await pool.query(`
                CREATE TABLE IF NOT EXISTS content_popularity (
                    id SERIAL PRIMARY KEY,
                    content_type VARCHAR(20) NOT NULL, -- 'anime', 'manga', 'character'
                    content_id VARCHAR(100) NOT NULL,
                    content_name VARCHAR(500) NOT NULL,
                    search_count INTEGER DEFAULT 1,
                    last_searched TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(content_type, content_id)
                );
            `);

            this.logger.info('Analytics tables initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize analytics tables', error);
        }
    }

    async trackCommand(commandName, userId, guildId, executionTime, success = true, error = null) {
        if (!this.enabled) return;

        try {
            await pool.query(`
                INSERT INTO command_usage (command_name, user_id, guild_id, execution_time_ms, success, error_message)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [commandName, userId, guildId, executionTime, success, error]);

            // Update server stats
            if (guildId) {
                await this.updateServerStats(guildId, commandName);
            }
        } catch (error) {
            this.logger.error('Failed to track command usage', error);
        }
    }

    async updateServerStats(guildId, commandName) {
        try {
            await pool.query(`
                INSERT INTO server_stats (guild_id, total_commands_used, most_used_command, last_activity)
                VALUES ($1, 1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id) DO UPDATE SET
                    total_commands_used = server_stats.total_commands_used + 1,
                    most_used_command = $2,
                    last_activity = CURRENT_TIMESTAMP
            `, [guildId, commandName]);
        } catch (error) {
            this.logger.error('Failed to update server stats', error);
        }
    }

    async trackContentSearch(contentType, contentId, contentName) {
        if (!this.enabled) return;

        try {
            await pool.query(`
                INSERT INTO content_popularity (content_type, content_id, content_name, search_count, last_searched)
                VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP)
                ON CONFLICT (content_type, content_id) DO UPDATE SET
                    search_count = content_popularity.search_count + 1,
                    last_searched = CURRENT_TIMESTAMP
            `, [contentType, contentId, contentName]);
        } catch (error) {
            this.logger.error('Failed to track content search', error);
        }
    }

    async getUserPreferences(userId) {
        if (!this.enabled) return null;

        try {
            const { rows } = await pool.query(
                'SELECT * FROM user_preferences WHERE user_id = $1',
                [userId]
            );
            return rows[0] || null;
        } catch (error) {
            this.logger.error('Failed to get user preferences', error);
            return null;
        }
    }

    async updateUserPreferences(userId, preferences) {
        if (!this.enabled) return;

        try {
            await pool.query(`
                INSERT INTO user_preferences (user_id, favorite_genres, preferred_anime_type, language_preference, notification_frequency, updated_at)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET
                    favorite_genres = EXCLUDED.favorite_genres,
                    preferred_anime_type = EXCLUDED.preferred_anime_type,
                    language_preference = EXCLUDED.language_preference,
                    notification_frequency = EXCLUDED.notification_frequency,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                userId,
                preferences.favoriteGenres || [],
                preferences.preferredAnimeType || 'any',
                preferences.languagePreference || 'en',
                preferences.notificationFrequency || 'daily'
            ]);
        } catch (error) {
            this.logger.error('Failed to update user preferences', error);
        }
    }

    async getServerAnalytics(guildId) {
        if (!this.enabled) return null;

        try {
            // Get basic server stats
            const { rows: serverStats } = await pool.query(
                'SELECT * FROM server_stats WHERE guild_id = $1',
                [guildId]
            );

            // Get top commands for this server
            const { rows: topCommands } = await pool.query(`
                SELECT command_name, COUNT(*) as usage_count
                FROM command_usage
                WHERE guild_id = $1 AND used_at > NOW() - INTERVAL '30 days'
                GROUP BY command_name
                ORDER BY usage_count DESC
                LIMIT 5
            `, [guildId]);

            // Get active users count
            const { rows: activeUsers } = await pool.query(`
                SELECT COUNT(DISTINCT user_id) as active_users
                FROM command_usage
                WHERE guild_id = $1 AND used_at > NOW() - INTERVAL '7 days'
            `, [guildId]);

            return {
                serverStats: serverStats[0] || null,
                topCommands,
                activeUsersWeek: activeUsers[0]?.active_users || 0
            };
        } catch (error) {
            this.logger.error('Failed to get server analytics', error);
            return null;
        }
    }

    async getGlobalAnalytics() {
        if (!this.enabled) return null;

        try {
            // Most popular content
            const { rows: popularAnime } = await pool.query(`
                SELECT content_name, search_count
                FROM content_popularity
                WHERE content_type = 'anime'
                ORDER BY search_count DESC
                LIMIT 10
            `);

            const { rows: popularManga } = await pool.query(`
                SELECT content_name, search_count
                FROM content_popularity
                WHERE content_type = 'manga'
                ORDER BY search_count DESC
                LIMIT 10
            `);

            // Command usage statistics
            const { rows: commandStats } = await pool.query(`
                SELECT command_name, COUNT(*) as total_uses, 
                       AVG(execution_time_ms) as avg_execution_time
                FROM command_usage
                WHERE used_at > NOW() - INTERVAL '30 days'
                GROUP BY command_name
                ORDER BY total_uses DESC
            `);

            // Error rates
            const { rows: errorStats } = await pool.query(`
                SELECT command_name, 
                       COUNT(*) as total_executions,
                       SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as error_count
                FROM command_usage
                WHERE used_at > NOW() - INTERVAL '7 days'
                GROUP BY command_name
                HAVING COUNT(*) > 0
            `);

            return {
                popularAnime,
                popularManga,
                commandStats,
                errorStats
            };
        } catch (error) {
            this.logger.error('Failed to get global analytics', error);
            return null;
        }
    }

    async generateReport(guildId = null) {
        if (!this.enabled) return 'Analytics disabled';

        try {
            const analytics = guildId ? 
                await this.getServerAnalytics(guildId) : 
                await this.getGlobalAnalytics();

            if (!analytics) return 'No analytics data available';

            if (guildId) {
                return this.formatServerReport(analytics);
            } else {
                return this.formatGlobalReport(analytics);
            }
        } catch (error) {
            this.logger.error('Failed to generate analytics report', error);
            return 'Failed to generate report';
        }
    }

    formatServerReport(analytics) {
        const { serverStats, topCommands, activeUsersWeek } = analytics;
        
        let report = '📊 **Server Analytics Report**\n\n';
        
        if (serverStats) {
            report += `📈 **Total Commands Used:** ${serverStats.total_commands_used}\n`;
            report += `👥 **Active Users (7 days):** ${activeUsersWeek}\n`;
            report += `🏆 **Most Used Command:** ${serverStats.most_used_command}\n\n`;
        }

        if (topCommands.length > 0) {
            report += '🔥 **Top Commands (30 days):**\n';
            topCommands.forEach((cmd, index) => {
                report += `${index + 1}. \`${cmd.command_name}\` - ${cmd.usage_count} uses\n`;
            });
        }

        return report;
    }

    formatGlobalReport(analytics) {
        const { popularAnime, popularManga, commandStats } = analytics;
        
        let report = '🌍 **Global Analytics Report**\n\n';
        
        if (popularAnime.length > 0) {
            report += '🏆 **Most Searched Anime:**\n';
            popularAnime.slice(0, 5).forEach((anime, index) => {
                report += `${index + 1}. ${anime.content_name} (${anime.search_count} searches)\n`;
            });
            report += '\n';
        }

        if (commandStats.length > 0) {
            report += '⚡ **Command Usage Stats:**\n';
            commandStats.slice(0, 5).forEach((cmd) => {
                const avgTime = Math.round(cmd.avg_execution_time || 0);
                report += `\`${cmd.command_name}\` - ${cmd.total_uses} uses (${avgTime}ms avg)\n`;
            });
        }

        return report;
    }
}

module.exports = AnalyticsManager;
