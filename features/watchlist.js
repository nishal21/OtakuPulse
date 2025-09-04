// Watchlist management system
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { 
    addToWatchlist, 
    removeFromWatchlist, 
    getUserWatchlist, 
    updateWatchlistEntry, 
    getWatchlistEntry, 
    getWatchlistStats 
} = require('../db');

class WatchlistManager {
    constructor(animeAPI, logger) {
        this.animeAPI = animeAPI;
        this.logger = logger;
        this.statusEmojis = {
            'plan_to_watch': '📋',
            'watching': '👀',
            'completed': '✅',
            'on_hold': '⏸️',
            'dropped': '❌'
        };
        this.statusColors = {
            'plan_to_watch': '#74B9FF',
            'watching': '#00B894',
            'completed': '#6C5CE7',
            'on_hold': '#FDCB6E',
            'dropped': '#E17055'
        };
    }

    async addAnime(userId, animeId, animeTitle) {
        try {
            // Get anime details from API
            const animeData = await this.animeAPI.getAnimeById(animeId);
            if (!animeData) {
                throw new Error('Anime not found');
            }

            const watchlistData = {
                id: animeData.id,
                title: animeData.title.romaji,
                coverImage: animeData.coverImage?.large,
                episodes: animeData.episodes,
                status: 'plan_to_watch'
            };

            await addToWatchlist(userId, watchlistData);
            return { success: true, anime: watchlistData };
        } catch (error) {
            this.logger.error('Failed to add anime to watchlist', error);
            return { success: false, error: error.message };
        }
    }

    async removeAnime(userId, animeId) {
        try {
            const removed = await removeFromWatchlist(userId, animeId);
            return { success: removed, removed };
        } catch (error) {
            this.logger.error('Failed to remove anime from watchlist', error);
            return { success: false, error: error.message };
        }
    }

    async updateStatus(userId, animeId, newStatus, episodesWatched = null, score = null, notes = null) {
        try {
            const updates = { status: newStatus };
            if (episodesWatched !== null) updates.episodes_watched = episodesWatched;
            if (score !== null) updates.score = score;
            if (notes !== null) updates.notes = notes;

            const updated = await updateWatchlistEntry(userId, animeId, updates);
            return { success: !!updated, entry: updated };
        } catch (error) {
            this.logger.error('Failed to update watchlist entry', error);
            return { success: false, error: error.message };
        }
    }

    async getWatchlist(userId, status = null) {
        try {
            const watchlist = await getUserWatchlist(userId, status);
            return { success: true, watchlist };
        } catch (error) {
            this.logger.error('Failed to get user watchlist', error);
            return { success: false, error: error.message };
        }
    }

    async getStats(userId) {
        try {
            const stats = await getWatchlistStats(userId);
            return { success: true, stats };
        } catch (error) {
            this.logger.error('Failed to get watchlist stats', error);
            return { success: false, error: error.message };
        }
    }

    async checkAnimeInWatchlist(userId, animeId) {
        try {
            const entry = await getWatchlistEntry(userId, animeId);
            return { success: true, entry, inWatchlist: !!entry };
        } catch (error) {
            this.logger.error('Failed to check anime in watchlist', error);
            return { success: false, error: error.message };
        }
    }

    generateWatchlistEmbed(watchlist, status = null, page = 1) {
        const itemsPerPage = 10;
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = watchlist.slice(start, end);

        const statusText = status ? `${this.statusEmojis[status]} ${status.replace('_', ' ').toUpperCase()}` : '📚 ALL ANIME';
        const color = status ? this.statusColors[status] : '#74B9FF';

        const embed = new EmbedBuilder()
            .setTitle(`🎌 Your Watchlist - ${statusText}`)
            .setColor(color)
            .setTimestamp();

        if (pageItems.length === 0) {
            embed.setDescription(status ? 
                `No anime found with status: ${status.replace('_', ' ')}` : 
                'Your watchlist is empty! Use `/watchlist add` to add anime.'
            );
            return embed;
        }

        const description = pageItems.map((anime, index) => {
            const globalIndex = start + index + 1;
            const statusEmoji = this.statusEmojis[anime.status] || '📋';
            const progress = anime.total_episodes > 0 ? 
                `${anime.episodes_watched}/${anime.total_episodes}` : 
                `${anime.episodes_watched} eps`;
            const score = anime.score > 0 ? ` • ⭐ ${anime.score}/10` : '';
            
            return `**${globalIndex}.** ${statusEmoji} **${anime.anime_title}**\n` +
                   `└ ${progress}${score}`;
        }).join('\n\n');

        embed.setDescription(description);

        if (watchlist.length > itemsPerPage) {
            const totalPages = Math.ceil(watchlist.length / itemsPerPage);
            embed.setFooter({ text: `Page ${page}/${totalPages} • ${watchlist.length} total anime` });
        } else {
            embed.setFooter({ text: `${watchlist.length} anime in watchlist` });
        }

        return embed;
    }

    generateStatsEmbed(stats) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Your Anime Statistics')
            .setColor('#6C5CE7')
            .setTimestamp();

        const fields = [
            {
                name: '📋 Plan to Watch',
                value: stats.plan_to_watch.toString(),
                inline: true
            },
            {
                name: '👀 Currently Watching',
                value: stats.watching.toString(),
                inline: true
            },
            {
                name: '✅ Completed',
                value: stats.completed.toString(),
                inline: true
            },
            {
                name: '⏸️ On Hold',
                value: stats.on_hold.toString(),
                inline: true
            },
            {
                name: '❌ Dropped',
                value: stats.dropped.toString(),
                inline: true
            },
            {
                name: '📈 Total Anime',
                value: stats.total.toString(),
                inline: true
            }
        ];

        if (stats.avg_score > 0) {
            fields.push({
                name: '⭐ Average Score',
                value: `${stats.avg_score}/10`,
                inline: true
            });
        }

        embed.addFields(fields);

        // Add progress bar visualization
        if (stats.total > 0) {
            const completionRate = ((stats.completed / stats.total) * 100).toFixed(1);
            embed.addFields({
                name: '🎯 Completion Rate',
                value: `${completionRate}% (${stats.completed}/${stats.total})`,
                inline: false
            });
        }

        return embed;
    }

    generateWatchlistButtons(currentStatus = null, page = 1, totalPages = 1) {
        const row1 = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();

        // Status filter buttons
        const statusButtons = [
            { id: 'watchlist_all', label: 'All', emoji: '📚', style: currentStatus === null ? ButtonStyle.Primary : ButtonStyle.Secondary },
            { id: 'watchlist_watching', label: 'Watching', emoji: '👀', style: currentStatus === 'watching' ? ButtonStyle.Primary : ButtonStyle.Secondary },
            { id: 'watchlist_completed', label: 'Completed', emoji: '✅', style: currentStatus === 'completed' ? ButtonStyle.Primary : ButtonStyle.Secondary },
            { id: 'watchlist_ptw', label: 'Plan to Watch', emoji: '📋', style: currentStatus === 'plan_to_watch' ? ButtonStyle.Primary : ButtonStyle.Secondary }
        ];

        statusButtons.forEach(btn => {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(btn.id)
                    .setLabel(btn.label)
                    .setEmoji(btn.emoji)
                    .setStyle(btn.style)
            );
        });

        // Navigation and action buttons
        if (totalPages > 1) {
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId('watchlist_prev')
                    .setLabel('Previous')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1)
            );
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId('watchlist_next')
                    .setLabel('Next')
                    .setEmoji('➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
            );
        }

        row2.addComponents(
            new ButtonBuilder()
                .setCustomId('watchlist_stats')
                .setLabel('Stats')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary)
        );

        return totalPages > 1 ? [row1, row2] : [row1, row2];
    }

    generateStatusSelectMenu() {
        const options = [
            {
                label: 'Plan to Watch',
                value: 'plan_to_watch',
                emoji: '📋',
                description: 'Anime you plan to watch'
            },
            {
                label: 'Currently Watching',
                value: 'watching',
                emoji: '👀',
                description: 'Anime you are currently watching'
            },
            {
                label: 'Completed',
                value: 'completed',
                emoji: '✅',
                description: 'Anime you have finished watching'
            },
            {
                label: 'On Hold',
                value: 'on_hold',
                emoji: '⏸️',
                description: 'Anime you have temporarily stopped watching'
            },
            {
                label: 'Dropped',
                value: 'dropped',
                emoji: '❌',
                description: 'Anime you have dropped'
            }
        ];

        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('watchlist_status_change')
                    .setPlaceholder('Change status...')
                    .addOptions(options)
            );
    }
}

module.exports = WatchlistManager;
