const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

// Enhanced utilities and features
const { Logger, ErrorHandler, PerformanceMonitor } = require('./utils/logger');
const SecurityManager = require('./utils/security');
const AIFeatures = require('./features/ai');
const AnalyticsManager = require('./features/analytics');
const PremiumManager = require('./features/premium');
const AdvancedCommands = require('./commands/advanced');

// Initialize enhanced utilities
const logger = new Logger();
const errorHandler = new ErrorHandler(logger);
const performanceMonitor = new PerformanceMonitor(logger);
const securityManager = new SecurityManager();
const aiFeatures = new AIFeatures(logger);
const analyticsManager = new AnalyticsManager(logger);
const premiumManager = new PremiumManager(logger);

logger.info('🚀 Starting OtakuPulse Discord Bot with Enhanced Features');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize Express app with security
const app = express();

// Apply security middleware
app.use(securityManager.getHelmetOptions());
app.use(securityManager.getCorsOptions());
app.use(securityManager.createRateLimit());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Enhanced session configuration
app.use(session(securityManager.getSessionOptions()));

// Wire up dashboard feature selection route (after guildSettings is declared)
const dashboardSettingsRouter = require('./dashboard-settings');
app.use(dashboardSettingsRouter);

// Session middleware (already configured above)

// Neon DB integration
const { ensureGuildSettingsTable, getGuildSettings, setGuildSettings, isMangaUpdateNotified, recordMangaUpdate, isTrailerNotified, recordTrailerNotification } = require('./db');

// Ensure DB table exists at startup
ensureGuildSettingsTable().catch(error => {
    logger.error('Failed to ensure database tables', error);
});

// Helper: get all bot guild settings from DB
async function getAllGuildSettings() {
    // Get all guilds the bot is in
    const botGuilds = Array.from(client.guilds.cache.values());
    const settingsMap = new Map();
    for (const guild of botGuilds) {
        const settings = await getGuildSettings(guild.id);
        if (settings) settingsMap.set(guild.id, settings);
    }
    return settingsMap;
}

// Patch dashboard-settings.js to use Neon DB (if needed)
// ...existing code...

// API Configuration
const ANILIST_API = 'https://graphql.anilist.co';
const ANIMECHAN_API_BASE = 'https://api.animechan.io/v1';
const QUOTES_API_BASE = 'https://api.api-ninjas.com/v1/quotes';

// Rate limiting for API calls
const rateLimiter = {
    anilist: { lastCall: 0, delay: 667 }, // 90 requests per minute = 667ms delay
    animechan: { lastCall: 0, delay: 500 }, // 0.5 second delay for Animechan
    quotes: { lastCall: 0, delay: 100 } // 0.1 second delay for Quotes API
};

// Rate limiting helper
async function rateLimit(api) {
    const now = Date.now();
    const timeSinceLastCall = now - rateLimiter[api].lastCall;
    
    if (timeSinceLastCall < rateLimiter[api].delay) {
        await new Promise(resolve => setTimeout(resolve, rateLimiter[api].delay - timeSinceLastCall));
    }
    
    rateLimiter[api].lastCall = Date.now();
}

// GraphQL query helper
async function queryAniList(query, variables = {}) {
    try {
        await rateLimit('anilist');
        const response = await axios.post(ANILIST_API, {
            query,
            variables
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });
        return response.data.data;
    } catch (error) {
        console.error('❌ AniList API Error:', error.response?.data || error.message);
        return null;
    }
}

// API Helper Functions
class AnimeAPI {
    // Get currently airing anime
    static async getCurrentlyAiring() {
        const query = `
            query ($perPage: Int) {
                Page(perPage: $perPage) {
                    media(type: ANIME, status: RELEASING, sort: TRENDING_DESC) {
                        id
                        title { romaji }
                        nextAiringEpisode {
                            airingAt
                            episode
                        }
                        coverImage { large }
                        averageScore
                        episodes
                        status
                    }
                }
            }
        `;
        const data = await queryAniList(query, { perPage: 10 });
        return data?.Page?.media || [];
    }

    // Get anime by ID
    static async getAnimeById(id) {
        const query = `
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji }
                    description(asHtml: false)
                    episodes
                    averageScore
                    coverImage { large }
                    trailer {
                        id
                        site
                        thumbnail
                    }
                    status
                    format
                    genres
                    studios {
                        nodes {
                            name
                        }
                    }
                }
            }
        `;
        const data = await queryAniList(query, { id });
        return data?.Media || null;
    }

    // Get anime videos/trailers
    static async getAnimeVideos(id) {
        const anime = await this.getAnimeById(id);
        if (!anime?.trailer) return null;
        
        return {
            promo: [{
                title: `${anime.title.romaji} Trailer`,
                trailer: {
                    url: anime.trailer.site === 'youtube' 
                        ? `https://www.youtube.com/watch?v=${anime.trailer.id}`
                        : null,
                    thumbnail: anime.trailer.thumbnail
                }
            }]
        };
    }

    // Get top anime
    static async getTopAnime() {
        const query = `
            query ($perPage: Int) {
                Page(perPage: $perPage) {
                    media(type: ANIME, sort: POPULARITY_DESC) {
                        id
                        title { romaji }
                        episodes
                        coverImage { large }
                        averageScore
                        format
                        status
                    }
                }
            }
        `;
        const data = await queryAniList(query, { perPage: 5 });
        return data?.Page?.media || [];
    }

    // Search anime
    static async searchAnime(query) {
        const queryGraphQL = `
            query ($search: String, $perPage: Int) {
                Page(perPage: $perPage) {
                    media(search: $search, type: ANIME) {
                        id
                        title { romaji }
                        coverImage { large }
                        description(asHtml: false)
                        episodes
                        averageScore
                        status
                    }
                }
            }
        `;
        const data = await queryAniList(queryGraphQL, { search: query, perPage: 5 });
        return data?.Page?.media || [];
    }

    // Get anime quotes
    static async getAnimeQuote(anime = null) {
        try {
            await rateLimit('animechan');
            let url;
            if (anime) {
                url = `${ANIMECHAN_API_BASE}/quotes/random?anime=${encodeURIComponent(anime)}`;
            } else {
                url = `${ANIMECHAN_API_BASE}/quotes/random`;
            }
            
            const response = await axios.get(url);
            console.log('AnimeChan API Response:', JSON.stringify(response.data, null, 2));
            
            let quoteData = null;
            
            // Handle different response formats from AnimeChan.io API
            if (response.data) {
                if (Array.isArray(response.data)) {
                    // If response is an array, take the first element
                    quoteData = response.data[0];
                } else if (response.data.data) {
                    // If response has a 'data' property
                    quoteData = response.data.data;
                } else if (response.data.quote && response.data.anime && response.data.character) {
                    // Direct quote object
                    quoteData = response.data;
                }
            }
            
            // Ensure we have valid quote data and convert everything to strings
            if (quoteData && quoteData.quote && quoteData.anime && quoteData.character) {
                const result = {
                    quote: String(quoteData.quote || '').trim(),
                    anime: String(quoteData.anime || '').trim(),
                    character: String(quoteData.character || '').trim()
                };
                
                // Validate that none of the fields are empty or invalid
                if (result.quote && result.anime && result.character && 
                    result.quote !== 'undefined' && result.anime !== 'undefined' && result.character !== 'undefined') {
                    return result;
                }
            }
            
            // If API call fails or returns invalid data, throw error to use fallback
            throw new Error('Invalid or empty quote data from API');
            
        } catch (error) {
            console.error('Error fetching anime quote from API:', error.message);
            
            // Return fallback quote if all API calls fail
            const fallbackQuotes = [
                { quote: "To know sorrow is not terrifying. What is terrifying is to know you can't go back to happiness you could have.", anime: "Bleach", character: "Matsumoto Rangiku" },
                { quote: "No one knows what the future holds. That's why its potential is infinite.", anime: "Steins;Gate", character: "Rintarou Okabe" },
                { quote: "It's not the face that makes someone a monster; it's the choices they make with their lives.", anime: "Naruto", character: "Naruto Uzumaki" },
                { quote: "People's lives don't end when they die. It ends when they lose faith.", anime: "Naruto", character: "Itachi Uchiha" },
                { quote: "Hard work is absolutely necessary, but in the end, ability decides everything.", anime: "Naruto", character: "Madara Uchiha" },
                { quote: "The world isn't perfect. But it's there for us, doing the best it can. And that's what makes it so damn beautiful.", anime: "Fullmetal Alchemist", character: "Roy Mustang" },
                { quote: "I'm not going there to die. I'm going to find out if I'm really alive.", anime: "Cowboy Bebop", character: "Spike Spiegel" },
                { quote: "Even if we forget the faces of our friends, we will never forget the bonds that were carved into our souls.", anime: "Sword Art Online", character: "Kirito" },
                { quote: "If you don't take risks, you can't create a future.", anime: "One Piece", character: "Monkey D. Luffy" },
                { quote: "Power comes in response to a need, not a desire.", anime: "Dragon Ball Z", character: "Goku" }
            ];
            return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
        }
    }

    // Get inspirational quotes
    static async getInspirationalQuote() {
        try {
            await rateLimit('animechan');
            const response = await axios.get(`${ANIMECHAN_API_BASE}/quotes/random`);
            // New AnimeChan.io API returns { data: { anime, character, quote } }
            if (response.data && response.data.data) {
                return {
                    quote: response.data.data.quote,
                    author: `${response.data.data.character} (${response.data.data.anime})`
                };
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error fetching inspirational quote from AnimeChan:', error.message);
            // Fallback anime quotes
            const fallbackQuotes = [
                { quote: "To know sorrow is not terrifying. What is terrifying is to know you can't go back to happiness you could have.", author: "Matsumoto Rangiku (Bleach)" },
                { quote: "No one knows what the future holds. That's why its potential is infinite.", author: "Rintarou Okabe (Steins;Gate)" },
                { quote: "It's not the face that makes someone a monster; it's the choices they make with their lives.", author: "Naruto Uzumaki (Naruto)" }
            ];
            return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
        }
    }

    // Search for manga
    static async searchManga(query) {
        await rateLimit('anilist');
        const queryGraphQL = `
            query ($search: String, $perPage: Int) {
                Page(perPage: $perPage) {
                    media(search: $search, type: MANGA) {
                        id
                        title { romaji }
                        coverImage { large }
                        description(asHtml: false)
                        chapters
                        volumes
                        averageScore
                        status
                        updatedAt
                    }
                }
            }
        `;
        const data = await queryAniList(queryGraphQL, { search: query, perPage: 5 });
        return data?.Page?.media || [];
    }

    // Get recently updated manga
    static async getRecentlyUpdatedManga() {
        await rateLimit('anilist');
        const queryGraphQL = `
            query ($perPage: Int) {
                Page(perPage: $perPage) {
                    media(type: MANGA, status: RELEASING, sort: UPDATED_AT_DESC) {
                        id
                        title { romaji }
                        coverImage { large }
                        description(asHtml: false)
                        chapters
                        volumes
                        averageScore
                        status
                        updatedAt
                    }
                }
            }
        `;
        const data = await queryAniList(queryGraphQL, { perPage: 10 });
        return data?.Page?.media || [];
    }

    // Get latest anime with trailers
    static async getLatestAnimeWithTrailers() {
        await rateLimit('anilist');
        const query = `
            query ($perPage: Int, $season: MediaSeason, $seasonYear: Int) {
                Page(perPage: $perPage) {
                    media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC], season: $season, seasonYear: $seasonYear) {
                        id
                        title { romaji }
                        coverImage { large }
                        description(asHtml: false)
                        episodes
                        averageScore
                        status
                        format
                        genres
                        trailer {
                            id
                            site
                            thumbnail
                        }
                        studios {
                            nodes {
                                name
                            }
                        }
                    }
                }
            }
        `;
        const currentSeason = this.getCurrentSeason();
        const data = await queryAniList(query, { 
            perPage: 15, 
            season: currentSeason.season, 
            seasonYear: currentSeason.year 
        });
        // Filter to only include anime with trailers
        return data?.Page?.media?.filter(anime => anime.trailer && anime.trailer.site === 'youtube') || [];
    }

    // Get trending anime with trailers (alternative source)
    static async getTrendingAnimeWithTrailers() {
        await rateLimit('anilist');
        const query = `
            query ($perPage: Int) {
                Page(perPage: $perPage) {
                    media(type: ANIME, sort: TRENDING_DESC, status_in: [RELEASING, FINISHED, NOT_YET_RELEASED]) {
                        id
                        title { romaji }
                        coverImage { large }
                        description(asHtml: false)
                        episodes
                        averageScore
                        status
                        format
                        genres
                        trailer {
                            id
                            site
                            thumbnail
                        }
                        studios {
                            nodes {
                                name
                            }
                        }
                    }
                }
            }
        `;
        const data = await queryAniList(query, { perPage: 20 });
        // Filter to only include anime with trailers
        return data?.Page?.media?.filter(anime => anime.trailer && anime.trailer.site === 'youtube') || [];
    }

    // Helper function to get current season
    static getCurrentSeason() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // getMonth() returns 0-11
        
        let season;
        if (month >= 1 && month <= 3) {
            season = 'WINTER';
        } else if (month >= 4 && month <= 6) {
            season = 'SPRING';
        } else if (month >= 7 && month <= 9) {
            season = 'SUMMER';
        } else {
            season = 'FALL';
        }
        
        return { season, year };
    }

    // Get popular releasing manga
    static async getPopularManga() {
        await rateLimit('anilist');
        const queryGraphQL = `
            query ($perPage: Int) {
                Page(perPage: $perPage) {
                    media(type: MANGA, status: RELEASING, sort: POPULARITY_DESC) {
                        id
                        title { romaji }
                        coverImage { large }
                        description(asHtml: false)
                        chapters
                        volumes
                        averageScore
                        status
                        updatedAt
                    }
                }
            }
        `;
        const data = await queryAniList(queryGraphQL, { perPage: 10 });
        return data?.Page?.media || [];
    }
}

// Initialize advanced commands after AnimeAPI class is defined
const advancedCommands = new AdvancedCommands(AnimeAPI, aiFeatures, analyticsManager, premiumManager, logger);

// Slash commands (enhanced with new commands)
const baseCommands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Set up OtakuPulse for this server')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for notifications')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get an anime quote (random or from a specific anime)')
        .addStringOption(option =>
            option.setName('anime')
                .setDescription('Specific anime to get quote from (optional)')
                .setRequired(false)
        ),
    
    new SlashCommandBuilder()
        .setName('airing')
        .setDescription('Check currently airing anime'),
    
    new SlashCommandBuilder()
        .setName('top-anime')
        .setDescription('Get top anime list'),
    
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for anime')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Anime to search for')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('trailer')
        .setDescription('Get anime trailer')
        .addStringOption(option =>
            option.setName('anime')
                .setDescription('Anime name to get trailer for')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('manga')
        .setDescription('Search for manga or get latest chapters')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Manga to search for (optional - shows popular manga if not provided)')
                .setRequired(false)
        ),
    
    new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View current server settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands')
];

// Combine base commands with advanced commands
const commands = [...baseCommands, ...advancedCommands.getCommands()];

// Discord bot event handlers
client.once('ready', async () => {
    logger.info(`🤖 ${client.user.tag} is online with enhanced features!`);
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        logger.info('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
            body: commands
        });
        logger.info(`Successfully reloaded ${commands.length} application (/) commands.`);
    } catch (error) {
        logger.error('Error registering commands', error);
    }
    
    // Start scheduled tasks
    startScheduledTasks();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;
    const startTime = Date.now();
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    try {
        // Check rate limits for premium users
        const rateLimit = await premiumManager.checkRateLimit(userId, guildId);
        if (!rateLimit.allowed) {
            const message = rateLimit.ownerOverride ? 
                '👑 Welcome back, owner! You have unlimited access to everything!' :
                `⏳ Rate limit exceeded. You can use ${rateLimit.remaining} more commands. Limit resets at ${rateLimit.resetTime?.toLocaleTimeString()}. Upgrade to premium for higher limits!`;
            
            return await interaction.reply({
                content: message,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        // Handle commands
        switch (commandName) {
            case 'setup':
                await handleSetup(interaction);
                break;
            case 'quote':
                await handleQuote(interaction);
                break;
            case 'airing':
                await handleAiring(interaction);
                break;
            case 'top-anime':
                await handleTopAnime(interaction);
                break;
            case 'search':
                await handleSearch(interaction);
                break;
            case 'trailer':
                await handleTrailer(interaction);
                break;
            case 'manga':
                await handleManga(interaction);
                break;
            case 'settings':
                await handleSettings(interaction);
                break;
            case 'help':
                await handleHelp(interaction);
                break;
            // Advanced commands
            case 'recommend':
                await advancedCommands.handleRecommend(interaction);
                break;
            case 'character':
                await advancedCommands.handleCharacter(interaction);
                break;
            case 'trivia':
                await advancedCommands.handleTrivia(interaction);
                break;
            case 'preferences':
                await advancedCommands.handlePreferences(interaction);
                break;
            case 'analytics':
                await advancedCommands.handleAnalytics(interaction);
                break;
            case 'premium':
                await advancedCommands.handlePremium(interaction);
                break;
            case 'admin':
                await advancedCommands.handleAdmin(interaction);
                break;
            case 'advanced-search':
                await handleAdvancedSearch(interaction);
                break;
            case 'watchlist':
                await handleWatchlist(interaction);
                break;
            case 'random':
                await handleRandom(interaction);
                break;
            case 'schedule':
                await handleSchedule(interaction);
                break;
            case 'compare':
                await handleCompare(interaction);
                break;
            default:
                await interaction.editReply('Unknown command!');
        }

        // Track successful command execution
        const executionTime = Date.now() - startTime;
        await analyticsManager.trackCommand(commandName, userId, guildId, executionTime, true);

    } catch (error) {
        const executionTime = Date.now() - startTime;
        await analyticsManager.trackCommand(commandName, userId, guildId, executionTime, false, error.message);
        await errorHandler.handleCommandError(interaction, error, commandName);
    }
});

// Command handlers
async function handleSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;
    
    // Save to Neon DB instead of in-memory map
    const settings = {
        notification_channel: channel.id,
        daily_quotes_channel: channel.id,
        airing_alerts_channel: channel.id,
        trailer_notifications_channel: channel.id,
        top_anime_rankings_channel: channel.id,
        anime_search_channel: channel.id,
        manga_updates_channel: channel.id,
        daily_quotes: true,
        airing_alerts: true,
        trailer_notifications: true,
        top_anime_rankings: true,
        anime_search: true,
        manga_updates: true
    };
    
    await setGuildSettings(guildId, settings);
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Setup Complete!')
        .setDescription(`OtakuPulse has been configured for this server.\n\n**Notification Channel:** ${channel}\n**Daily Quotes:** Enabled\n**Airing Alerts:** Enabled\n**Trailer Notifications:** Enabled\n**Top Anime Rankings:** Enabled\n**Anime Search:** Enabled\n**Manga Updates:** Enabled`)
        .setColor('#00FF00')
        .setFooter({ text: 'OtakuPulse • Setup Complete' })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleQuote(interaction) {
    const anime = interaction.options.getString('anime');
    const quote = await AnimeAPI.getAnimeQuote(anime);
    
    if (!quote) {
        await interaction.editReply('Could not fetch anime quote at this time. Please try again later.');
        return;
    }
    
    // Determine if this was a specific anime search or random
    const isSpecificSearch = anime && anime.trim().length > 0;
    const title = isSpecificSearch ? 
        `🎌 ${anime} Quote` : 
        '🎌 Random Anime Quote';
    
    // Professional embed styling
    const embed = new EmbedBuilder()
        .setColor('#7f00ff')
        .setTitle(title)
        .setDescription(`> "${quote.quote || quote.content}"`)
        .addFields(
            { name: 'Character', value: `🎭 ${quote.character || 'Unknown'}`, inline: true },
            { name: 'Anime', value: `📺 ${quote.anime || 'Unknown'}`, inline: true }
        )
        .setFooter({ text: 'Powered by AnimeChan • OtakuPulse', iconURL: 'https://animechan.vercel.app/assets/logo.png' })
        .setTimestamp()
        .setThumbnail('https://animechan.vercel.app/assets/logo.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    
    // Add a note if the requested anime wasn't found but we showed a random quote
    if (isSpecificSearch && quote.anime && !quote.anime.toLowerCase().includes(anime.toLowerCase())) {
        embed.setFooter({ 
            text: `No quotes found for "${anime}". Showing random quote instead • OtakuPulse`, 
            iconURL: 'https://animechan.vercel.app/assets/logo.png' 
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleAiring(interaction) {
    const airingAnime = await AnimeAPI.getCurrentlyAiring();
    
    if (airingAnime.length === 0) {
        await interaction.editReply('Could not fetch currently airing anime. Please try again later.');
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#FFD93D')
        .setTitle('📺 Currently Airing Anime')
        .setDescription('Here are the top currently airing anime:')
        .setFooter({ text: 'OtakuPulse • AniList API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    airingAnime.slice(0, 5).forEach((anime, index) => {
        embed.addFields({
            name: `#${index + 1} • ${anime.title.romaji}`,
            value: `⭐ **Score:** ${anime.averageScore || 'N/A'}\n📺 **Episodes:** ${anime.episodes || 'Ongoing'}\n🟢 **Status:** ${anime.status || 'N/A'}`,
            inline: true
        });
    });
    await interaction.editReply({ embeds: [embed] });
}

async function handleTopAnime(interaction) {
    const topAnime = await AnimeAPI.getTopAnime();

    if (topAnime.length === 0) {
        await interaction.editReply('Could not fetch top anime. Please try again later.');
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#6C5CE7')
        .setTitle('🏆 Top Anime')
        .setDescription('Here are the top-rated anime:')
        .setFooter({ text: 'OtakuPulse • AniList API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail(topAnime[0]?.coverImage?.large)
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    topAnime.forEach((anime, index) => {
        embed.addFields({
            name: `#${index + 1} • ${anime.title.romaji}`,
            value: `⭐ **Score:** ${anime.averageScore || 'N/A'}\n📺 **Episodes:** ${anime.episodes || 'N/A'}\n📡 **Status:** ${anime.status || 'N/A'}`,
            inline: true
        });
    });
    await interaction.editReply({ embeds: [embed] });
}

async function handleSearch(interaction) {
    const query = interaction.options.getString('query');
    const searchResults = await AnimeAPI.searchAnime(query);

    if (searchResults.length === 0) {
        await interaction.editReply(`No anime found for "${query}".`);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setColor('#A29BFE')
        .setTimestamp();

    searchResults.slice(0, 5).forEach((anime, index) => {
        embed.addFields({
            name: `${index + 1}. ${anime.title.romaji}`,
            value: `**Score:** ${anime.averageScore || 'N/A'}\n**Episodes:** ${anime.episodes || 'N/A'}\n**Status:** ${anime.status || 'N/A'}`,
            inline: true
        });
    });

    await interaction.editReply({ embeds: [embed] });
}

async function handleTrailer(interaction) {
    const animeName = interaction.options.getString('anime');
    const searchResults = await AnimeAPI.searchAnime(animeName);

    if (searchResults.length === 0) {
        await interaction.editReply(`No anime found for "${animeName}".`);
        return;
    }

    const anime = searchResults[0];
    const videos = await AnimeAPI.getAnimeVideos(anime.id);

    if (!videos || !videos.promo || videos.promo.length === 0) {
        await interaction.editReply(`No trailers found for "${anime.title.romaji}".`);
        return;
    }

    const trailer = videos.promo[0];

    const embed = new EmbedBuilder()
        .setColor('#FF7675')
        .setTitle(`🎬 ${anime.title.romaji} - Trailer`)
        .setDescription(`**${trailer.title}**`)
        .setURL(trailer.trailer.url)
        .setImage(trailer.trailer.thumbnail)
        .setFooter({ text: 'OtakuPulse • AniList API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleManga(interaction) {
    const query = interaction.options.getString('query');
    
    let mangaResults;
    let embedTitle;
    let embedDescription;
    
    if (query) {
        // Search for specific manga
        mangaResults = await AnimeAPI.searchManga(query);
        embedTitle = `📚 Search Results for "${query}"`;
        embedDescription = mangaResults.length > 0 ? 
            `Found ${mangaResults.length} result${mangaResults.length > 1 ? 's' : ''} for your search.` :
            `No manga found for "${query}". Please try a different search term.`;
    } else {
        // Show popular manga
        mangaResults = await AnimeAPI.getPopularManga();
        embedTitle = '📚 Popular Manga';
        embedDescription = 'Here are some popular manga series currently being released:';
    }

    if (mangaResults.length === 0) {
        await interaction.editReply(query ? 
            `No manga found for "${query}". Please try a different search term.` :
            'Could not fetch popular manga at this time. Please try again later.');
        return;
    }

    if (query && mangaResults.length === 1) {
        // Show detailed view for single search result
        const manga = mangaResults[0];
        const description = manga.description ? 
            (manga.description.length > 300 ? 
                manga.description.substring(0, 300) + '...' : 
                manga.description) : 
            'No description available.';

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle(`📚 ${manga.title.romaji}`)
            .setDescription(description)
            .setThumbnail(manga.coverImage?.large || 'https://cdn-icons-png.flaticon.com/512/906/906175.png')
            .addFields([
                { 
                    name: '📊 Rating', 
                    value: manga.averageScore ? `${manga.averageScore}/100` : 'N/A', 
                    inline: true 
                },
                { 
                    name: '📖 Chapters', 
                    value: manga.chapters ? manga.chapters.toString() : 'Ongoing', 
                    inline: true 
                },
                { 
                    name: '📚 Volumes', 
                    value: manga.volumes ? manga.volumes.toString() : 'N/A', 
                    inline: true 
                },
                { 
                    name: '🟢 Status', 
                    value: manga.status || 'Unknown', 
                    inline: true 
                }
            ])
            .setFooter({ text: 'OtakuPulse • AniList API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
            .setTimestamp()
            .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });

        await interaction.editReply({ embeds: [embed] });
    } else {
        // Show list view for multiple results or popular manga
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle(embedTitle)
            .setDescription(embedDescription)
            .setFooter({ text: 'OtakuPulse • AniList API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
            .setTimestamp()
            .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });

        // Add manga fields (limit to 10 for readability)
        mangaResults.slice(0, 10).forEach((manga, index) => {
            embed.addFields([{
                name: `${index + 1}. ${manga.title.romaji}`,
                value: `⭐ **Score:** ${manga.averageScore || 'N/A'}\n📖 **Chapters:** ${manga.chapters || 'Ongoing'}\n🟢 **Status:** ${manga.status || 'Unknown'}`,
                inline: true
            }]);
        });

        if (mangaResults[0]?.coverImage?.large) {
            embed.setThumbnail(mangaResults[0].coverImage.large);
        }

        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleSettings(interaction) {
    const guildId = interaction.guildId;
    const settings = await getGuildSettings(guildId);
    
    if (!settings) {
        await interaction.editReply('No settings found for this server. Use `/setup` to configure the bot.');
        return;
    }
    
    const channel = interaction.guild.channels.cache.get(settings.notification_channel);
    
    const embed = new EmbedBuilder()
        .setColor('#74B9FF')
        .setTitle('⚙️ Server Settings')
        .addFields(
            { name: 'Notification Channel', value: channel ? channel.toString() : 'Not found', inline: true },
            { name: 'Daily Quotes', value: settings.daily_quotes ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Airing Alerts', value: settings.airing_alerts ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Trailer Notifications', value: settings.trailer_notifications ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Top Anime Rankings', value: settings.top_anime_rankings ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Anime Search', value: settings.anime_search ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Manga Updates', value: settings.manga_updates ? '✅ Enabled' : '❌ Disabled', inline: true }
        )
        .setFooter({ text: 'OtakuPulse • Server Settings', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleHelp(interaction) {
    const userId = interaction.user.id;
    const isOwner = premiumManager.isOwner(userId);
    
    const embed = new EmbedBuilder()
        .setColor('#00CEC9')
        .setTitle('📖 OtakuPulse Help - Enhanced Edition')
        .setDescription('Here are all available commands:')
        .addFields(
            { name: '**🔧 Setup & Management**', value: '`/setup` - Set up bot for server (Admin)\n`/settings` - View server settings (Admin)\n`/preferences` - Set your anime preferences', inline: false },
            { name: '**🎌 Anime & Quotes**', value: '`/quote [anime]` - Get anime quotes\n`/search <query>` - Search for anime\n`/advanced-search` - Search with filters\n`/airing` - Currently airing anime\n`/top-anime` - Top-rated anime', inline: false },
            { name: '**📚 Manga**', value: '`/manga [query]` - Search manga or popular\n`/watchlist` - Manage your watchlist', inline: false },
            { name: '**🎬 Media**', value: '`/trailer <anime>` - Get anime trailers\n`/random` - Random anime recommendation\n`/schedule` - Airing schedule', inline: false },
            { name: '**🤖 AI Features (Premium)**', value: '`/recommend` - AI-powered recommendations\n`/character <name> <anime>` - Character analysis\n`/trivia` - Anime trivia game', inline: false },
            { name: '**📊 Analytics & Premium**', value: '`/analytics` - Server analytics (Premium)\n`/premium status` - Check premium status\n`/premium upgrade` - View upgrade options', inline: false },
            { name: '**🛠️ Utilities**', value: '`/compare <anime1> <anime2>` - Compare anime\n`/help` - Show this help message', inline: false }
        )
        .setFooter({ 
            text: '💎 Premium features marked | OtakuPulse Enhanced', 
            iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' 
        })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ 
            name: 'OtakuPulse Bot - Enhanced Edition', 
            iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' 
        });

    // Add owner commands if user is owner
    if (isOwner) {
        embed.addFields({
            name: '**👑 Owner Commands (Unlimited Access)**',
            value: '`/admin grant-premium <user> <tier>` - Grant premium to user\n`/admin revoke-premium <user>` - Revoke premium access\n`/admin stats` - View global bot statistics',
            inline: false
        });
        embed.setColor('#FF6B35'); // Special orange color for owner
        embed.setTitle('👑 OtakuPulse Help - Owner Edition');
        embed.setFooter({ 
            text: '👑 You have unlimited access to everything! | OtakuPulse Enhanced', 
            iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' 
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

// Additional handler functions for new commands
async function handleAdvancedSearch(interaction) {
    const query = interaction.options.getString('query');
    const genre = interaction.options.getString('genre');
    const year = interaction.options.getInteger('year');
    const minScore = interaction.options.getInteger('min-score');
    
    // Use AI to enhance search if available
    const enhancedSearch = await aiFeatures.smartSearch(query, { genre, year, minScore });
    
    const searchResults = await AnimeAPI.searchAnime(enhancedSearch.enhancedQuery || query);
    
    // Filter results based on criteria
    let filteredResults = searchResults;
    if (minScore) {
        filteredResults = filteredResults.filter(anime => anime.averageScore >= minScore);
    }
    if (year) {
        // This would need to be implemented in the API call
    }

    if (filteredResults.length === 0) {
        await interaction.editReply(`No anime found matching your criteria.`);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(`🔍 Advanced Search Results`)
        .setColor('#A29BFE')
        .setDescription(`Found ${filteredResults.length} results for "${query}"`)
        .setTimestamp();

    if (enhancedSearch.suggestions?.length > 0) {
        embed.addFields({
            name: '💡 AI Suggestions',
            value: enhancedSearch.suggestions.join(', '),
            inline: false
        });
    }

    filteredResults.slice(0, 5).forEach((anime, index) => {
        embed.addFields({
            name: `${index + 1}. ${anime.title.romaji}`,
            value: `**Score:** ${anime.averageScore || 'N/A'}\n**Episodes:** ${anime.episodes || 'N/A'}\n**Status:** ${anime.status || 'N/A'}`,
            inline: true
        });
    });

    await interaction.editReply({ embeds: [embed] });
}

async function handleWatchlist(interaction) {
    // Implementation would require a database table for user watchlists
    await interaction.editReply('Watchlist feature coming soon! This will allow you to save and track your anime watching progress.');
}

async function handleRandom(interaction) {
    const genre = interaction.options.getString('genre');
    const format = interaction.options.getString('format');
    
    // Get random anime from top anime list
    const topAnime = await AnimeAPI.getTopAnime();
    if (topAnime.length === 0) {
        await interaction.editReply('Could not fetch anime for random selection.');
        return;
    }
    
    const randomAnime = topAnime[Math.floor(Math.random() * topAnime.length)];
    
    const embed = new EmbedBuilder()
        .setTitle('🎲 Random Anime Recommendation')
        .setColor('#FF6B6B')
        .addFields([
            { name: 'Title', value: randomAnime.title.romaji, inline: true },
            { name: 'Score', value: `${randomAnime.averageScore || 'N/A'}/100`, inline: true },
            { name: 'Episodes', value: randomAnime.episodes?.toString() || 'N/A', inline: true },
            { name: 'Status', value: randomAnime.status || 'N/A', inline: true },
            { name: 'Format', value: randomAnime.format || 'N/A', inline: true }
        ])
        .setTimestamp();
    
    if (randomAnime.coverImage?.large) {
        embed.setThumbnail(randomAnime.coverImage.large);
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleSchedule(interaction) {
    const day = interaction.options.getString('day');
    
    // Get currently airing anime (this could be enhanced to filter by day)
    const airingAnime = await AnimeAPI.getCurrentlyAiring();
    
    const embed = new EmbedBuilder()
        .setTitle(`📅 Anime Airing Schedule${day ? ` - ${day.charAt(0).toUpperCase() + day.slice(1)}` : ''}`)
        .setColor('#FFD93D')
        .setDescription('Currently airing anime')
        .setTimestamp();
    
    airingAnime.slice(0, 10).forEach((anime, index) => {
        embed.addFields({
            name: `${anime.title.romaji}`,
            value: `**Score:** ${anime.averageScore || 'N/A'}\n**Episode:** ${anime.nextAiringEpisode?.episode || 'N/A'}`,
            inline: true
        });
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleCompare(interaction) {
    const anime1Name = interaction.options.getString('anime1');
    const anime2Name = interaction.options.getString('anime2');
    
    const [results1, results2] = await Promise.all([
        AnimeAPI.searchAnime(anime1Name),
        AnimeAPI.searchAnime(anime2Name)
    ]);
    
    if (results1.length === 0 || results2.length === 0) {
        await interaction.editReply('Could not find one or both anime for comparison.');
        return;
    }
    
    const anime1 = results1[0];
    const anime2 = results2[0];
    
    const embed = new EmbedBuilder()
        .setTitle('⚔️ Anime Comparison')
        .setColor('#6C5CE7')
        .addFields([
            { name: '📺 Titles', value: `**${anime1.title.romaji}** vs **${anime2.title.romaji}**`, inline: false },
            { name: '⭐ Scores', value: `${anime1.averageScore || 'N/A'} vs ${anime2.averageScore || 'N/A'}`, inline: true },
            { name: '📊 Episodes', value: `${anime1.episodes || 'N/A'} vs ${anime2.episodes || 'N/A'}`, inline: true },
            { name: '🟢 Status', value: `${anime1.status || 'N/A'} vs ${anime2.status || 'N/A'}`, inline: true }
        ])
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// Scheduled tasks
function startScheduledTasks() {
    console.log('Starting scheduled tasks...');
    // Daily anime quotes at 8 AM and 9 PM
    cron.schedule('0 8,21 * * *', async () => {
        try {
            // Cache last quote and timestamp
            if (!startScheduledTasks.lastQuote) {
                startScheduledTasks.lastQuote = null;
                startScheduledTasks.lastTimestamp = 0;
            }
            const now = Date.now();
            let quote;
            // Use cached quote if less than 1 hour old
            if (startScheduledTasks.lastQuote && (now - startScheduledTasks.lastTimestamp) < 3600000) {
                quote = startScheduledTasks.lastQuote;
            } else {
                // Fetch quote from animechan API
                try {
                    const response = await axios.get('https://animechan.vercel.app/api/random');
                    if (response.data && response.data.quote) {
                        quote = {
                            quote: response.data.quote,
                            anime: response.data.anime,
                            character: response.data.character
                        };
                        startScheduledTasks.lastQuote = quote;
                        startScheduledTasks.lastTimestamp = now;
                    }
                } catch (apiError) {
                    console.error('Error fetching quote from animechan API:', apiError);
                }
                // Fallback to local quotes if API fails
                if (!quote) {
                    // If you have a local quotes.json, you can load and use it here
                    // For now, fallback to hardcoded quotes
                    const fallbackQuotes = [
                        { quote: "To know sorrow is not terrifying. What is terrifying is to know you can't go back to happiness you could have.", anime: "Bleach", character: "Matsumoto Rangiku" },
                        { quote: "No one knows what the future holds. That's why its potential is infinite.", anime: "Steins;Gate", character: "Rintarou Okabe" },
                        { quote: "It's not the face that makes someone a monster; it's the choices they make with their lives.", anime: "Naruto", character: "Naruto Uzumaki" },
                        { quote: "People's lives don't end when they die. It ends when they lose faith.", anime: "Naruto", character: "Itachi Uchiha" },
                        { quote: "Hard work is absolutely necessary, but in the end, ability decides everything.", anime: "Naruto", character: "Madara Uchiha" },
                        { quote: "The world isn't perfect. But it's there for us, doing the best it can. And that's what makes it so damn beautiful.", anime: "Fullmetal Alchemist", character: "Roy Mustang" },
                        { quote: "I'm not going there to die. I'm going to find out if I'm really alive.", anime: "Cowboy Bebop", character: "Spike Spiegel" },
                        { quote: "Even if we forget the faces of our friends, we will never forget the bonds that were carved into our souls.", anime: "Sword Art Online", character: "Kirito" },
                        { quote: "If you don't take risks, you can't create a future.", anime: "One Piece", character: "Monkey D. Luffy" },
                        { quote: "Power comes in response to a need, not a desire.", anime: "Dragon Ball Z", character: "Goku" }
                    ];
                    quote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
                    startScheduledTasks.lastQuote = quote;
                    startScheduledTasks.lastTimestamp = now;
                }
            }
            if (!quote) {
                console.error('Invalid quote data:', quote);
                return;
            }
           
            // Send to all configured servers using Neon DB
            const botGuilds = Array.from(client.guilds.cache.values());
            for (const guild of botGuilds) {
                const settings = await getGuildSettings(guild.id);
                if (!settings || !settings.daily_quotes) continue;
                try {
                    const channelId = settings.daily_quotes_channel || settings.notification_channel;
                    const channel = guild.channels.cache.get(channelId);
                    if (!channel) {
                        console.error('Daily quote channel not found or bot lacks access:', channelId);
                        continue;
                    }
                    
                    // Create the embed for this quote
                    const embed = new EmbedBuilder()
                        .setTitle('🌅 Daily Anime Quote')
                        .setDescription(`*"${quote.quote}"*`)
                        .addFields(
                            { name: 'Character', value: `🎭 ${quote.character}`, inline: true },
                            { name: 'Anime', value: `📺 ${quote.anime}`, inline: true }
                        )
                        .setColor('#FF6B6B')
                        .setFooter({ text: 'OtakuPulse • Daily Quotes' })
                        .setTimestamp();
                    
                    console.log(`Sending daily quote to channel ${channel.id} in server ${guild.id}`);
                    await channel.send({ embeds: [embed] });
                    console.log(`Successfully sent daily quote to channel ${channel.id}`);
                } catch (error) {
                    console.error('Failed to send daily quote message:', error);
                }
            }
        } catch (error) {
            console.error('Error in daily quote posting:', error);
        }
    });
    // Check for new episodes every 6 hours
    cron.schedule('0 */6 * * *', async () => {
        console.log('Checking for new episodes...');
        await checkNewEpisodes();
    });
    // Weekly top anime updates on Sundays at 10 AM
    cron.schedule('0 10 * * 0', async () => {
        console.log('Sending weekly top anime...');
        await sendWeeklyTopAnime();
    });
    
    // Check for manga updates every 4 hours
    cron.schedule('0 */4 * * *', async () => {
        console.log('Checking for manga updates...');
        await checkMangaUpdates();
    });
    
    // Send latest anime trailers every 8 hours
    cron.schedule('0 */8 * * *', async () => {
        console.log('Sending latest anime trailers...');
        await sendLatestTrailers();
    });
}

async function sendDailyQuotes() {
    const botGuilds = Array.from(client.guilds.cache.values());
    for (const guild of botGuilds) {
        const settings = await getGuildSettings(guild.id);
        if (!settings || !settings.daily_quotes) continue;
        try {
            const channelId = settings.daily_quotes_channel || settings.notification_channel;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;
            const animeQuote = await AnimeAPI.getAnimeQuote();
            if (animeQuote) {
                const embed = new EmbedBuilder()
                    .setTitle('🌅 Daily Anime Quote')
                    .setDescription(`*"${animeQuote.quote}"*`)
                    .addFields(
                        { name: 'Character', value: animeQuote.character, inline: true },
                        { name: 'Anime', value: animeQuote.anime, inline: true }
                    )
                    .setColor('#FF6B6B')
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`Error sending daily quotes to guild ${guild.id}:`, error);
        }
    }
}

async function checkNewEpisodes() {
    const airingAnime = await AnimeAPI.getCurrentlyAiring();
    
    if (!airingAnime || airingAnime.length === 0) {
        console.log('No airing anime data available for episode check');
        return;
    }
    
    const botGuilds = Array.from(client.guilds.cache.values());
    for (const guild of botGuilds) {
        const settings = await getGuildSettings(guild.id);
        if (!settings || !settings.airing_alerts) continue;
        try {
            const channelId = settings.airing_alerts_channel || settings.notification_channel;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;
            // Get random currently airing anime for notification
            const randomAnime = airingAnime[Math.floor(Math.random() * Math.min(airingAnime.length, 5))];
            if (randomAnime) {
                const embed = new EmbedBuilder()
                    .setTitle('📺 Anime Update')
                    .setDescription(`**${randomAnime.title?.romaji || 'Unknown Anime'}** is currently airing!`)
                    .addFields(
                        { name: 'Status', value: randomAnime.status || 'Unknown', inline: true },
                        { name: 'Score', value: randomAnime.averageScore?.toString() || 'N/A', inline: true },
                        { name: 'Episodes', value: randomAnime.episodes?.toString() || 'Ongoing', inline: true }
                    )
                    .setColor('#FFD93D')
                    .setTimestamp();
                if (randomAnime.coverImage?.large) {
                    embed.setThumbnail(randomAnime.coverImage.large);
                }
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`Error checking new episodes for guild ${guild.id}:`, error);
        }
    }
}

async function sendWeeklyTopAnime() {
    const topAnime = await AnimeAPI.getTopAnime();
    
    if (!topAnime || topAnime.length === 0) {
        console.log('No top anime data available for weekly rankings');
        return;
    }
    
    const botGuilds = Array.from(client.guilds.cache.values());
    for (const guild of botGuilds) {
        const settings = await getGuildSettings(guild.id);
        if (!settings || !settings.top_anime_rankings) continue;
        try {
            const channelId = settings.top_anime_rankings_channel || settings.notification_channel;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;
            
            const embed = new EmbedBuilder()
                .setTitle('🏆 Weekly Top Anime')
                .setDescription('Here are this week\'s top-rated anime:')
                .setColor('#6C5CE7')
                .setTimestamp()
                .setFooter({ text: 'OtakuPulse • AniList API' });
                
            topAnime.slice(0, 5).forEach((anime, index) => {
                embed.addFields({
                    name: `#${index + 1} • ${anime.title?.romaji || 'Unknown Anime'}`,
                    value: `⭐ **Score:** ${anime.averageScore || 'N/A'}\n📺 **Episodes:** ${anime.episodes || 'N/A'}\n📡 **Status:** ${anime.status || 'N/A'}`,
                    inline: true
                });
            });
            
            if (topAnime.length > 0 && topAnime[0].coverImage?.large) {
                embed.setThumbnail(topAnime[0].coverImage.large);
            }
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Error sending weekly top anime to guild ${guild.id}:`, error);
        }
    }
}

async function checkMangaUpdates() {
    try {
        const recentManga = await AnimeAPI.getRecentlyUpdatedManga();
        
        if (!recentManga || recentManga.length === 0) {
            console.log('No recent manga updates found');
            return;
        }
        
        const botGuilds = Array.from(client.guilds.cache.values());
        for (const guild of botGuilds) {
            const settings = await getGuildSettings(guild.id);
            if (!settings || !settings.manga_updates) continue;
            
            try {
                const channelId = settings.manga_updates_channel || settings.notification_channel;
                const channel = guild.channels.cache.get(channelId);
                if (!channel) continue;
                
                // Check for new/interesting manga to notify about
                const notifyManga = [];
                for (const manga of recentManga.slice(0, 3)) {
                    const mangaId = manga.id.toString();
                    const chapterId = `${mangaId}-${Date.now()}`;
                    
                    // Check if we already notified about this manga recently (within 24 hours)
                    const alreadyNotified = await isMangaUpdateNotified(mangaId, chapterId);
                    if (!alreadyNotified) {
                        notifyManga.push(manga);
                        // Record that we're notifying about this manga
                        await recordMangaUpdate(
                            mangaId, 
                            chapterId, 
                            manga.title?.romaji || 'Unknown Manga', 
                            'Recent Update', 
                            'Latest'
                        );
                    }
                }
                
                if (notifyManga.length > 0) {
                    for (const manga of notifyManga) {
                        const description = manga.description ? 
                            (manga.description.length > 200 ? 
                                manga.description.substring(0, 200) + '...' : 
                                manga.description) : 
                            'Recently updated manga worth checking out!';
                        
                        const embed = new EmbedBuilder()
                            .setTitle('📚 Manga Update')
                            .setDescription(`**${manga.title?.romaji || 'Unknown Manga'}** has been updated!`)
                            .addFields([
                                { 
                                    name: '📖 Details', 
                                    value: description, 
                                    inline: false 
                                },
                                { 
                                    name: '📊 Rating', 
                                    value: manga.averageScore ? `${manga.averageScore}/100` : 'N/A', 
                                    inline: true 
                                },
                                { 
                                    name: '📚 Chapters', 
                                    value: manga.chapters ? manga.chapters.toString() : 'Ongoing', 
                                    inline: true 
                                },
                                { 
                                    name: '🟢 Status', 
                                    value: manga.status || 'Unknown', 
                                    inline: true 
                                }
                            ])
                            .setColor('#FF6B6B')
                            .setTimestamp()
                            .setFooter({ text: 'OtakuPulse • Manga Updates' });
                            
                        if (manga.coverImage?.large) {
                            embed.setThumbnail(manga.coverImage.large);
                        }
                        
                        await channel.send({ embeds: [embed] });
                        
                        // Small delay between messages to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } catch (error) {
                console.error(`Error sending manga updates to guild ${guild.id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in checkMangaUpdates:', error);
    }
}

// Send latest anime trailers
async function sendLatestTrailers() {
    try {
        // Try to get latest anime with trailers from current season
        let latestAnime = await AnimeAPI.getLatestAnimeWithTrailers();
        
        // If no current season anime with trailers, get trending anime with trailers
        if (!latestAnime || latestAnime.length === 0) {
            latestAnime = await AnimeAPI.getTrendingAnimeWithTrailers();
        }
        
        if (!latestAnime || latestAnime.length === 0) {
            console.log('No anime with trailers found for notifications');
            return;
        }
        
        const botGuilds = Array.from(client.guilds.cache.values());
        for (const guild of botGuilds) {
            const settings = await getGuildSettings(guild.id);
            if (!settings || !settings.trailer_notifications) continue;
            
            try {
                const channelId = settings.trailer_notifications_channel || settings.notification_channel;
                const channel = guild.channels.cache.get(channelId);
                if (!channel) continue;
                
                // Select 1-3 random anime with trailers for notification
                const notifyAnime = [];
                
                // Check each anime for new trailers (not previously notified)
                for (const anime of latestAnime.slice(0, 10)) { // Check first 10 anime
                    const animeId = anime.id.toString();
                    const trailerId = anime.trailer.id;
                    
                    // Check if we already notified about this trailer
                    const alreadyNotified = await isTrailerNotified(animeId, trailerId);
                    if (!alreadyNotified) {
                        notifyAnime.push(anime);
                        // Record that we're notifying about this trailer
                        await recordTrailerNotification(
                            animeId, 
                            trailerId, 
                            anime.title?.romaji || 'Unknown Anime'
                        );
                        
                        // Limit to 2 trailers per notification cycle
                        if (notifyAnime.length >= 2) break;
                    }
                }
                
                if (notifyAnime.length === 0) continue;
                
                for (const anime of notifyAnime) {
                    const description = anime.description ? 
                        (anime.description.length > 200 ? 
                            anime.description.substring(0, 200) + '...' : 
                            anime.description) : 
                        'Check out this awesome anime trailer!';
                    
                    const trailerUrl = anime.trailer.site === 'youtube' 
                        ? `https://www.youtube.com/watch?v=${anime.trailer.id}`
                        : null;
                    
                    if (!trailerUrl) continue;
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🎬 Latest Anime Trailer')
                        .setDescription(`**${anime.title?.romaji || 'Unknown Anime'}** - Official Trailer`)
                        .addFields([
                            { 
                                name: '📖 Synopsis', 
                                value: description, 
                                inline: false 
                            },
                            { 
                                name: '📊 Rating', 
                                value: anime.averageScore ? `${anime.averageScore}/100` : 'N/A', 
                                inline: true 
                            },
                            { 
                                name: '📺 Episodes', 
                                value: anime.episodes ? anime.episodes.toString() : 'TBA', 
                                inline: true 
                            },
                            { 
                                name: '🟢 Status', 
                                value: anime.status || 'Unknown', 
                                inline: true 
                            },
                            {
                                name: '🎥 Watch Trailer',
                                value: `[Click here to watch](${trailerUrl})`,
                                inline: false
                            }
                        ])
                        .setColor('#FF7675')
                        .setTimestamp()
                        .setFooter({ text: 'OtakuPulse • Latest Trailers' })
                        .setURL(trailerUrl);
                        
                    if (anime.coverImage?.large) {
                        embed.setThumbnail(anime.coverImage.large);
                    }
                    
                    if (anime.trailer.thumbnail) {
                        embed.setImage(anime.trailer.thumbnail);
                    }
                    
                    await channel.send({ embeds: [embed] });
                    
                    // Small delay between messages to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`Error sending trailer updates to guild ${guild.id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in sendLatestTrailers:', error);
    }
}

// OAuth2 Routes
app.get('/oauth/login', (req, res) => {
    console.log('🔐 OAuth login initiated');
    console.log('CLIENT_ID:', process.env.CLIENT_ID ? 'Set' : 'Missing');
    console.log('REDIRECT_URI:', process.env.REDIRECT_URI);
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    console.log('🔗 Redirecting to:', authUrl);
    res.redirect(authUrl);
});

app.get('/oauth/callback', async (req, res) => {
    const { code } = req.query;
    console.log('📞 OAuth callback received');
    console.log('Code:', code ? 'Present' : 'Missing');
    
    if (!code) {
        console.error('❌ No authorization code provided');
        return res.status(400).send('No authorization code provided');
    }
    
    try {
        console.log('🔄 Exchanging code for access token...');
        // Exchange code for access token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        const { access_token } = tokenResponse.data;
        console.log('✅ Access token received');
        
        // Get user info
        console.log('👤 Fetching user info...');
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        
        // Get user guilds
        console.log('🏰 Fetching user guilds...');
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        
        req.session.user = userResponse.data;
        req.session.guilds = guildsResponse.data;
        req.session.accessToken = access_token;
        
        console.log('✅ Session saved, redirecting to dashboard');
        console.log('User:', userResponse.data.username);
        res.redirect('/dashboard');
        
    } catch (error) {
        console.error('❌ OAuth callback error:', error.response?.data || error.message);
        res.status(500).send('Authentication failed');
    }
});


app.get('/dashboard', async (req, res) => {
    console.log('📊 Dashboard accessed');
    console.log('Session user:', req.session.user ? 'Present' : 'Missing');
    
    if (!req.session.user) {
        console.log('🔒 No user session, redirecting to login');
        return res.redirect('/oauth/login');
    }
    
    console.log('✅ User authenticated:', req.session.user.username);
    console.log('🏰 Loading bot guilds...');
    // Show all bot-joined servers and allow feature selection
    const botGuilds = Array.from(client.guilds.cache.values());
    // Fetch settings for all guilds from Neon DB
    const settingsMap = new Map();
    for (const guild of botGuilds) {
        const settings = await getGuildSettings(guild.id);
        if (settings) settingsMap.set(guild.id, settings);
    }
    res.send(`
        <html>
<head>
    <title>OtakuPulse Dashboard</title>
    <link rel="icon" href="/1.ico" type="image/x-icon">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', Arial, sans-serif;
            background: linear-gradient(120deg, #16211c 0%, #10151c 100%);
            color: #e6e6e6;
            min-height: 100vh;
            overflow-x: hidden;
            position: relative;
        }
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(120deg, rgba(40,60,50,0.7) 0%, rgba(20,30,24,0.9) 100%);
            z-index: -1;
        }
        .grid-bg {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 0;
            pointer-events: none;
            background: repeating-linear-gradient(0deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px),
                        repeating-linear-gradient(90deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px);
        }
        .navbar {
            position: absolute;
            top: 32px; left: 0; width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 48px;
            z-index: 2;
        }
        .navbar-glass {
            background: rgba(30, 40, 36, 0.7);
            border-radius: 32px;
            box-shadow: 0 2px 24px #10151c44;
            padding: 12px 32px;
            display: flex;
            align-items: center;
            gap: 32px;
        }
        .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #e6e6e6;
            letter-spacing: -1px;
        }
        .nav-links {
            display: flex;
            gap: 24px;
        }
        .nav-link {
            color: #b0b8c1;
            font-size: 1rem;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
        }
        .nav-link:hover {
            color: #7fffd4;
        }
        .header {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
        }
        .header-glow {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            background: radial-gradient(circle at 50% 30%, #7fffd433 0%, #0000 70%);
            z-index: 0;
        }
        .header-content {
            position: relative;
            z-index: 1;
            margin-top: 80px;
        }
        .header-title {
            font-size: 3.2rem;
            font-weight: 700;
            letter-spacing: -2px;
            margin-bottom: 0.2em;
            color: #fff;
            text-shadow: 0 2px 32px #7fffd444;
        }
        .user-info {
            background: rgba(30, 40, 36, 0.85);
            border-radius: 24px;
            padding: 32px;
            margin: 32px auto;
            max-width: 900px;
            box-shadow: 0 2px 32px #10151c44;
            border: 1px solid #7fffd4;
            position: relative;
            z-index: 2;
        }
        .user-info h2 {
            color: #7fffd4;
            font-size: 1.8rem;
            margin-bottom: 0.5em;
            font-weight: 700;
        }
        .user-info p {
            color: #b0b8c1;
            font-size: 1.15rem;
            opacity: 0.85;
        }
        .dashboard-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 48px 32px;
            position: relative;
            z-index: 2;
        }
        .section-title {
            color: #7fffd4;
            font-size: 1.7rem;
            margin-bottom: 1em;
            font-weight: 700;
            text-align: center;
        }
        .guild-card {
            background: rgba(30, 40, 36, 0.85);
            border-radius: 24px;
            padding: 32px;
            margin: 24px 0;
            box-shadow: 0 2px 32px #10151c44;
            border: 1px solid rgba(127, 255, 212, 0.3);
            backdrop-filter: blur(2px);
        }
        .guild-card h4 {
            color: #fff;
            font-size: 1.5rem;
            margin-bottom: 0.5em;
            font-weight: 700;
        }
        .guild-card p {
            color: #b0b8c1;
            font-size: 1.08rem;
            margin-bottom: 0.3em;
            opacity: 0.85;
        }
        .feature-select {
            margin-top: 24px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            align-items: start;
        }
        .channel-group {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        .feature-select label {
            color: #e6e6e6;
            font-size: 1.08rem;
            font-weight: 500;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 16px;
            width: 100%;
        }
        .feature-select select {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid #7fffd4;
            border-radius: 8px;
            color: #e6e6e6;
            padding: 8px 12px;
            font-size: 1rem;
            backdrop-filter: blur(2px);
            width: 100%;
            max-width: 300px;
        }
        .feature-select select:focus {
            outline: none;
            border-color: #7fffd4;
            box-shadow: 0 0 0 2px rgba(127, 255, 212, 0.2);
        }
        .feature-select select option {
            background: #1a1a1a;
            color: #ffffff;
            padding: 8px 12px;
        }
        .feature-select input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: #7fffd4;
        }
        .btn {
            background: rgba(255,255,255,0.08);
            color: #e6e6e6;
            padding: 18px 38px;
            border: 1px solid #7fffd4;
            border-radius: 32px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 24px #7fffd433;
            transition: background 0.2s, box-shadow 0.2s, color 0.2s;
            text-decoration: none;
            display: inline-block;
            backdrop-filter: blur(2px);
            margin-top: 20px;
        }
        .btn:hover {
            background: rgba(127,255,212,0.12);
            color: #7fffd4;
            box-shadow: 0 4px 32px #7fffd455;
        }
        .stats-section {
            background: rgba(30, 40, 36, 0.85);
            border-radius: 24px;
            padding: 32px;
            margin: 48px auto;
            max-width: 900px;
            box-shadow: 0 2px 32px #10151c44;
            border: 1px solid rgba(127, 255, 212, 0.3);
            backdrop-filter: blur(2px);
        }
        .stats-section h3 {
            color: #7fffd4;
            font-size: 1.7rem;
            margin-bottom: 1em;
            font-weight: 700;
        }
        .stats-section p {
            color: #e6e6e6;
            font-size: 1.15rem;
            margin-bottom: 0.7em;
            opacity: 0.95;
        }
        .no-servers {
            text-align: center;
            color: #b0b8c1;
            font-size: 1.15rem;
            opacity: 0.7;
            padding: 48px 32px;
        }
        .status-configured {
            color: #7fffd4;
            font-weight: 600;
        }
        .status-not-configured {
            color: #ff6b6b;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="grid-bg"></div>
    <div class="navbar">
        <div class="navbar-glass">
            <span class="logo">OtakuPulse</span>            <div class="nav-links">
                <a href="/features" class="nav-link">Features</a>
                <a href="/getting-started" class="nav-link">Getting Started</a>
                <a href="/commands" class="nav-link">Commands</a>
                <a href="/logout" class="nav-link">Logout</a>
            </div>
        </div>
    </div>
    
    <div class="header">
        <div class="header-glow"></div>
        <div class="header-content">
            <div class="header-title">🎌 OtakuPulse Dashboard</div>
        </div>
    </div>
    
    <div class="user-info">
        <h2>Welcome, ${req.session.user.username}!</h2>
        <p>Manage your anime bot settings below.</p>
    </div>
    
    <div class="dashboard-content">
        <h3 class="section-title">Bot-Joined Servers</h3>
        ${botGuilds.length === 0 ? `<div class="no-servers">The bot is not in any servers.</div>` : botGuilds.map(guild => {
            const settings = settingsMap.get(guild.id) || {};
            const guildObj = client.guilds.cache.get(guild.id);
            let channelDropdowns = { dailyQuotes: '', airingAlerts: '', trailerNotifications: '', topAnimeRankings: '', animeSearch: '', mangaUpdates: '' };
            if (guildObj) {
                const textChannels = guildObj.channels.cache.filter(ch => ch.type === 0); // 0 = GuildText
                const options = Array.from(textChannels.values()).map(ch => ch);
                channelDropdowns.dailyQuotes = options.map(ch => `<option value="${ch.id}" ${(settings.daily_quotes_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.airingAlerts = options.map(ch => `<option value="${ch.id}" ${(settings.airing_alerts_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.trailerNotifications = options.map(ch => `<option value="${ch.id}" ${(settings.trailer_notifications_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.topAnimeRankings = options.map(ch => `<option value="${ch.id}" ${(settings.top_anime_rankings_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.animeSearch = options.map(ch => `<option value="${ch.id}" ${(settings.anime_search_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.mangaUpdates = options.map(ch => `<option value="${ch.id}" ${(settings.manga_updates_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
            }
            // Fallback for notification_channel: use first selected channel or first available
            let fallbackChannel = settings.daily_quotes_channel || settings.airing_alerts_channel || settings.trailer_notifications_channel || settings.top_anime_rankings_channel || settings.anime_search_channel || settings.manga_updates_channel;
            if (!fallbackChannel && guildObj) {
                const textChannels = guildObj.channels.cache.filter(ch => ch.type === 0);
                fallbackChannel = textChannels.size > 0 ? Array.from(textChannels.values())[0].id : null;
            }
            return `
            <div class="guild-card">
                <h4>${guild.name}</h4>
                <p>ID: ${guild.id}</p>
                <p>Status: ${(settings.notification_channel || fallbackChannel) ? '<span class="status-configured">✅ Configured</span>' : '<span class="status-not-configured">❌ Not configured</span>'}</p>
                <form method="POST" action="/dashboard/settings" class="feature-select">
                    <input type="hidden" name="guildId" value="${guild.id}" />
                    <div class="channel-group">
                        <label>📺 Airing Alerts Channel:
                            <select name="airingAlertsChannel">${channelDropdowns.airingAlerts}</select>
                        </label>
                    </div>
                    <div class="channel-group">
                        <label>🎬 Latest Trailers Channel:
                            <select name="trailerNotificationsChannel">${channelDropdowns.trailerNotifications}</select>
                        </label>
                    </div>
                    <div class="channel-group">
                        <label>🎌 Daily Anime Quotes Channel:
                            <select name="dailyQuotesChannel">${channelDropdowns.dailyQuotes}</select>
                        </label>
                    </div>
                    <div class="channel-group">
                        <label>🏆 Top Anime Rankings Channel:
                            <select name="topAnimeRankingsChannel">${channelDropdowns.topAnimeRankings}</select>
                        </label>
                    </div>
                    <div class="channel-group">
                        <label>🔍 Anime Search Channel:
                            <select name="animeSearchChannel">${channelDropdowns.animeSearch}</select>
                        </label>
                    </div>
                    <div class="channel-group">
                        <label>📚 Manga Updates Channel:
                            <select name="mangaUpdatesChannel">${channelDropdowns.mangaUpdates}</select>
                        </label>
                    </div>
                    <label><input type="checkbox" name="airingAlerts" ${settings.airing_alerts ? 'checked' : ''}/> 📺 Real-time Anime Updates</label>
                    <label><input type="checkbox" name="trailerNotifications" ${settings.trailer_notifications ? 'checked' : ''}/> 🎬 Latest Trailers</label>
                    <label><input type="checkbox" name="dailyQuotes" ${settings.daily_quotes ? 'checked' : ''}/> 🎌 Daily Anime Quotes</label>
                    <label><input type="checkbox" name="topAnimeRankings" ${settings.top_anime_rankings ? 'checked' : ''}/> 🏆 Top Anime Rankings</label>
                    <label><input type="checkbox" name="animeSearch" ${settings.anime_search ? 'checked' : ''}/> 🔍 Anime Search</label>
                    <label><input type="checkbox" name="mangaUpdates" ${settings.manga_updates ? 'checked' : ''}/> 📚 Manga Updates</label>
                    <button class="btn" type="submit">Save Features</button>
                </form>
            </div>
            `;
        }).join('')}
    </div>
    
    <div class="stats-section">
        <h3>Bot Statistics</h3>
        <p>Servers: ${client.guilds.cache.size}</p>
        <p>Configured Servers: ${settingsMap.size}</p>
        <p>Total Users: ${client.users.cache.size}</p>
    </div>
</body>
</html>
    `);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Features page
app.get('/features', (req, res) => {
    res.send(`
    <html>
      <head>
        <title>Features - OtakuPulse Bot</title>
        <link rel="icon" href="/1.ico" type="image/x-icon">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', Arial, sans-serif;
            background: linear-gradient(120deg, #16211c 0%, #10151c 100%);
            color: #e6e6e6;
            min-height: 100vh;
            overflow-x: hidden;
          }
          .grid-bg {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 0;
            pointer-events: none;
            background: repeating-linear-gradient(0deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px),
                        repeating-linear-gradient(90deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px);
          }
          .navbar {
            position: fixed;
            top: 32px; left: 0; width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0 48px;
            z-index: 2;
          }
          .navbar-glass {
            background: rgba(30, 40, 36, 0.7);
            border-radius: 32px;
            box-shadow: 0 2px 24px #10151c44;
            padding: 12px 32px;
            display: flex;
            align-items: center;
            gap: 32px;
            backdrop-filter: blur(10px);
          }
          .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #e6e6e6;
            letter-spacing: -1px;
            text-decoration: none;
          }
          .nav-links {
            display: flex;
            gap: 24px;
          }
          .nav-link {
            color: #b0b8c1;
            font-size: 1rem;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
          }
          .nav-link:hover, .nav-link.active {
            color: #7fffd4;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 120px 32px 80px;
            position: relative;
            z-index: 1;
          }
          .page-header {
            text-align: center;
            margin-bottom: 80px;
          }
          .page-title {
            font-size: 3.5rem;
            font-weight: 700;
            color: #fff;
            margin-bottom: 24px;
            text-shadow: 0 2px 32px #7fffd444;
          }
          .page-subtitle {
            font-size: 1.3rem;
            color: #b0b8c1;
            opacity: 0.85;
          }
          .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 32px;
            margin-bottom: 80px;
          }
          .feature-card {
            background: rgba(30, 40, 36, 0.85);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 2px 32px #10151c44;
            border: 1px solid rgba(127, 255, 212, 0.3);
            backdrop-filter: blur(2px);
            transition: transform 0.3s, box-shadow 0.3s;
          }
          .feature-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 40px #10151c66;
          }
          .feature-icon {
            font-size: 3rem;
            margin-bottom: 24px;
            display: block;
          }
          .feature-title {
            font-size: 1.6rem;
            font-weight: 700;
            color: #7fffd4;
            margin-bottom: 16px;
          }
          .feature-description {
            font-size: 1.1rem;
            color: #e6e6e6;
            line-height: 1.6;
            opacity: 0.9;
          }
          .feature-benefits {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(127, 255, 212, 0.2);
          }
          .feature-benefits ul {
            margin: 0;
            padding: 0;
            list-style: none;
          }
          .feature-benefits li {
            margin-bottom: 8px;
            color: #b0b8c1;
            font-size: 1rem;
          }
          .feature-benefits li::before {
            content: "✨ ";
            color: #7fffd4;
            margin-right: 8px;
          }
          .cta-section {
            text-align: center;
            background: rgba(30, 40, 36, 0.85);
            border-radius: 32px;
            padding: 60px 40px;
            border: 1px solid #7fffd4;
            box-shadow: 0 2px 32px #10151c44;
          }
          .cta-title {
            font-size: 2.2rem;
            font-weight: 700;
            color: #fff;
            margin-bottom: 16px;
          }
          .cta-text {
            font-size: 1.2rem;
            color: #b0b8c1;
            margin-bottom: 32px;
          }
          .btn {
            background: rgba(255,255,255,0.08);
            color: #e6e6e6;
            padding: 18px 38px;
            border: 1px solid #7fffd4;
            border-radius: 32px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 24px #7fffd433;
            transition: background 0.2s, box-shadow 0.2s, color 0.2s;
            text-decoration: none;
            display: inline-block;
            backdrop-filter: blur(2px);
            margin: 0 12px;
          }
          .btn:hover {
            background: rgba(127,255,212,0.12);
            color: #7fffd4;
            box-shadow: 0 4px 32px #7fffd455;
          }
        </style>
      </head>
      <body>
        <div class="grid-bg"></div>
        <div class="navbar">
          <div class="navbar-glass">
            <a href="/" class="logo">OtakuPulse</a>
            <div class="nav-links">
              <a href="/features" class="nav-link active">Features</a>
              <a href="/getting-started" class="nav-link">Getting Started</a>
              <a href="/commands" class="nav-link">Commands</a>
              <a href="/oauth/login" class="nav-link">Sign In</a>
            </div>
          </div>
        </div>
        
        <div class="container">
          <div class="page-header">
            <h1 class="page-title">🔥 Powerful Features</h1>
            <p class="page-subtitle">Everything you need to bring your anime community together</p>
          </div>
          
          <div class="features-grid">
            <div class="feature-card">
              <span class="feature-icon">📺</span>
              <h3 class="feature-title">Real-time Anime Updates</h3>
              <p class="feature-description">Stay updated with the latest anime releases and currently airing shows. Get instant notifications when new episodes are available.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Automatic episode notifications</li>
                  <li>Currently airing anime tracking</li>
                  <li>Customizable update frequency</li>
                  <li>Multiple anime series monitoring</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">🎬</span>
              <h3 class="feature-title">Latest Trailers & Promos</h3>
              <p class="feature-description">Access the newest anime trailers, promotional videos, and teasers as soon as they're released.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Official trailer links</li>
                  <li>High-quality video thumbnails</li>
                  <li>Direct YouTube integration</li>
                  <li>Instant trailer notifications</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">🎌</span>
              <h3 class="feature-title">Daily Anime Quotes</h3>
              <p class="feature-description">Inspire your community with beautiful anime quotes from beloved characters across hundreds of anime series.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Thousands of curated quotes</li>
                  <li>Character and anime attribution</li>
                  <li>Beautiful embed formatting</li>
                  <li>Daily automated posting</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">🏆</span>
              <h3 class="feature-title">Top Anime Rankings</h3>
              <p class="feature-description">Discover the highest-rated anime series with weekly rankings based on popularity and user scores.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Weekly top anime updates</li>
                  <li>Popularity-based rankings</li>
                  <li>Detailed anime information</li>
                  <li>Score and episode data</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">🔍</span>
              <h3 class="feature-title">Comprehensive Search</h3>
              <p class="feature-description">Find any anime instantly with our powerful search functionality powered by the AniList database.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Lightning-fast search results</li>
                  <li>Detailed anime descriptions</li>
                  <li>Rating and episode information</li>
                  <li>Multiple search parameters</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">⚙️</span>
              <h3 class="feature-title">Server Customization</h3>
              <p class="feature-description">Tailor the bot's behavior to fit your server's needs with extensive customization options.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Channel-specific notifications</li>
                  <li>Feature enable/disable toggles</li>
                  <li>Custom notification schedules</li>
                  <li>Admin-only configuration</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">📱</span>
              <h3 class="feature-title">Web Dashboard</h3>
              <p class="feature-description">Manage your bot settings through an intuitive web interface with Discord OAuth2 authentication.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Secure Discord login</li>
                  <li>Real-time server management</li>
                  <li>User-friendly interface</li>
                  <li>Mobile-responsive design</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">🚀</span>
              <h3 class="feature-title">Performance & Reliability</h3>
              <p class="feature-description">Built with modern technology stack ensuring high performance, reliability, and minimal downtime.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Rate limiting protection</li>
                  <li>Database persistence</li>
                  <li>Error handling & fallbacks</li>
                  <li>24/7 uptime monitoring</li>
                </ul>
              </div>
            </div>
            
            <div class="feature-card">
              <span class="feature-icon">📚</span>
              <h3 class="feature-title">Real-time Manga Updates</h3>
              <p class="feature-description">Stay updated with the latest manga releases and chapter updates from your favorite series with automated notifications.</p>
              <div class="feature-benefits">
                <ul>
                  <li>Automatic chapter notifications</li>
                  <li>Popular manga tracking</li>
                  <li>Comprehensive manga search</li>
                  <li>Detailed manga information</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div class="cta-section">
            <h2 class="cta-title">Ready to Transform Your Server?</h2>
            <p class="cta-text">Join thousands of anime communities already using OtakuPulse</p>
            <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands" class="btn">Add Bot to Server</a>
            <a href="/getting-started" class="btn">Getting Started Guide</a>
          </div>
        </div>
      </body>
    </html>
    `);
});

// Getting Started page
app.get('/getting-started', (req, res) => {
    res.send(`
    <html>
      <head>
        <title>Getting Started - OtakuPulse Bot</title>
        <link rel="icon" href="/1.ico" type="image/x-icon">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', Arial, sans-serif;
            background: linear-gradient(120deg, #16211c 0%, #10151c 100%);
            color: #e6e6e6;
            min-height: 100vh;
            overflow-x: hidden;
          }
          .grid-bg {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 0;
            pointer-events: none;
            background: repeating-linear-gradient(0deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px),
                        repeating-linear-gradient(90deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px);
          }
          .navbar {
            position: fixed;
            top: 32px; left: 0; width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0 48px;
            z-index: 2;
          }
          .navbar-glass {
            background: rgba(30, 40, 36, 0.7);
            border-radius: 32px;
            box-shadow: 0 2px 24px #10151c44;
            padding: 12px 32px;
            display: flex;
            align-items: center;
            gap: 32px;
            backdrop-filter: blur(10px);
          }
          .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #e6e6e6;
            letter-spacing: -1px;
            text-decoration: none;
          }
          .nav-links {
            display: flex;
            gap: 24px;
          }
          .nav-link {
            color: #b0b8c1;
            font-size: 1rem;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
          }
          .nav-link:hover, .nav-link.active {
            color: #7fffd4;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 120px 32px 80px;
            position: relative;
            z-index: 1;
          }
          .page-header {
            text-align: center;
            margin-bottom: 80px;
          }
          .page-title {
            font-size: 3.5rem;
            font-weight: 700;
            color: #fff;
            margin-bottom: 24px;
            text-shadow: 0 2px 32px #7fffd444;
          }
          .page-subtitle {
            font-size: 1.3rem;
            color: #b0b8c1;
            opacity: 0.85;
          }
          .step-container {
            margin-bottom: 40px;
          }
          .step-card {
            background: rgba(30, 40, 36, 0.85);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 2px 32px #10151c44;
            border: 1px solid rgba(127, 255, 212, 0.3);
            backdrop-filter: blur(2px);
            margin-bottom: 24px;
          }
          .step-header {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
          }
          .step-number {
            background: #7fffd4;
            color: #0d1117;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1.2rem;
            margin-right: 20px;
          }
          .step-title {
            font-size: 1.8rem;
            font-weight: 700;
            color: #7fffd4;
            margin: 0;
          }
          .step-description {
            font-size: 1.1rem;
            color: #e6e6e6;
            line-height: 1.6;
            margin-bottom: 20px;
          }
          .step-details {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
            padding: 20px;
            border-left: 4px solid #7fffd4;
          }
          .step-details ul {
            margin: 0;
            padding-left: 20px;
          }
          .step-details li {
            margin-bottom: 8px;
            color: #b0b8c1;
          }
          .code-block {
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
            padding: 16px;
            font-family: 'Courier New', monospace;
            color: #7fffd4;
            margin: 16px 0;
            overflow-x: auto;
          }
          .btn {
            background: rgba(255,255,255,0.08);
            color: #e6e6e6;
            padding: 18px 38px;
            border: 1px solid #7fffd4;
            border-radius: 32px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 24px #7fffd433;
            transition: background 0.2s, box-shadow 0.2s, color 0.2s;
            text-decoration: none;
            display: inline-block;
            backdrop-filter: blur(2px);
            margin: 8px;
          }
          .btn:hover {
            background: rgba(127,255,212,0.12);
            color: #7fffd4;
            box-shadow: 0 4px 32px #7fffd455;
          }
          .btn-primary {
            background: #7fffd4;
            color: #0d1117;
          }
          .btn-primary:hover {
            background: #6ee7c7;
            color: #0d1117;
          }
          .info-box {
            background: rgba(127, 255, 212, 0.1);
            border: 1px solid rgba(127, 255, 212, 0.3);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .info-box-title {
            color: #7fffd4;
            font-weight: 700;
            margin-bottom: 8px;
          }
        </style>
      </head>
      <body>
        <div class="grid-bg"></div>
        <div class="navbar">
          <div class="navbar-glass">
            <a href="/" class="logo">OtakuPulse</a>
            <div class="nav-links">
              <a href="/features" class="nav-link">Features</a>
              <a href="/getting-started" class="nav-link active">Getting Started</a>
              <a href="/commands" class="nav-link">Commands</a>
              <a href="/oauth/login" class="nav-link">Sign In</a>
            </div>
          </div>
        </div>
        
        <div class="container">
          <div class="page-header">
            <h1 class="page-title">🚀 Getting Started</h1>
            <p class="page-subtitle">Set up OtakuPulse in just a few simple steps</p>
          </div>
          
          <div class="step-container">
            <div class="step-card">
              <div class="step-header">
                <div class="step-number">1</div>
                <h2 class="step-title">Add Bot to Your Server</h2>
              </div>
              <p class="step-description">Click the button below to invite OtakuPulse to your Discord server. You'll need "Manage Server" permissions to add the bot.</p>
              <div class="step-details">
                <p><strong>Required Permissions:</strong></p>
                <ul>
                  <li>Send Messages</li>
                  <li>Use Slash Commands</li>
                  <li>Embed Links</li>
                  <li>Read Message History</li>
                  <li>Connect</li>
                </ul>
              </div>
              <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands" class="btn btn-primary">Add Bot to Server</a>
            </div>
            
            <div class="step-card">
              <div class="step-header">
                <div class="step-number">2</div>
                <h2 class="step-title">Run Initial Setup</h2>
              </div>
              <p class="step-description">Use the setup command to configure OtakuPulse for your server. This will enable all features and set a default notification channel.</p>
              <div class="code-block">/setup #your-anime-channel</div>
              <div class="step-details">
                <p><strong>What this does:</strong></p>
                <ul>
                  <li>Enables all anime features (quotes, alerts, rankings)</li>
                  <li>Sets your chosen channel for notifications</li>
                  <li>Configures default settings</li>
                  <li>Creates database entry for your server</li>
                </ul>
              </div>
            </div>
            
            <div class="step-card">
              <div class="step-header">
                <div class="step-number">3</div>
                <h2 class="step-title">Customize Your Settings</h2>
              </div>
              <p class="step-description">Access the web dashboard to fine-tune your bot settings. You can enable/disable specific features and assign different channels for different types of notifications.</p>
              <div class="step-details">
                <p><strong>Dashboard Features:</strong></p>
                <ul>
                  <li>Enable/disable specific features per server</li>
                  <li>Set different channels for different notification types</li>
                  <li>View bot statistics and server status</li>
                  <li>Secure Discord OAuth2 authentication</li>
                </ul>
              </div>
              <a href="/oauth/login" class="btn">Access Dashboard</a>
            </div>
            
            <div class="step-card">
              <div class="step-header">
                <div class="step-number">4</div>
                <h2 class="step-title">Explore Commands</h2>
              </div>
              <p class="step-description">Try out the various commands to see what OtakuPulse can do. Start with a simple quote or search for your favorite anime!</p>
              <div class="step-details">
                <p><strong>Quick Start Commands:</strong></p>
                <ul>
                  <li><code>/quote</code> - Get a random anime quote</li>
                  <li><code>/airing</code> - See currently airing anime</li>
                  <li><code>/search attack on titan</code> - Search for anime</li>
                  <li><code>/manga</code> - Browse popular manga</li>
                  <li><code>/help</code> - View all available commands</li>
                </ul>
              </div>
              <a href="/commands" class="btn">View All Commands</a>
            </div>
          </div>
          
          <div class="info-box">
            <div class="info-box-title">💡 Pro Tips</div>
            <ul>
              <li>Create dedicated channels for different types of notifications (e.g., #anime-quotes, #anime-updates)</li>
              <li>Use the web dashboard to enable only the features your community wants</li>
              <li>Check the <code>/settings</code> command to review your current configuration</li>
              <li>Daily quotes are automatically posted at 8 AM and 9 PM server time</li>
              <li>Weekly rankings are posted every Sunday at 10 AM</li>
            </ul>
          </div>
          
          <div class="info-box">
            <div class="info-box-title">🆘 Need Help?</div>
            <p>If you encounter any issues or have questions:</p>
            <ul>
              <li>Use <code>/help</code> to see all available commands</li>
              <li>Check your bot permissions if commands aren't working</li>
              <li>Make sure the bot has access to your notification channels</li>
              <li>Join our support Discord server for assistance</li>
            </ul>
            <a href="https://discord.gg/qrzdHN8mu2" class="btn">Join Support Server</a>
          </div>
        </div>
      </body>
    </html>
    `);
});

// Commands page
app.get('/commands', (req, res) => {
    res.send(`
    <html>
      <head>
        <title>Commands - OtakuPulse Bot</title>
        <link rel="icon" href="/1.ico" type="image/x-icon">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', Arial, sans-serif;
            background: linear-gradient(120deg, #16211c 0%, #10151c 100%);
            color: #e6e6e6;
            min-height: 100vh;
            overflow-x: hidden;
          }
          .grid-bg {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 0;
            pointer-events: none;
            background: repeating-linear-gradient(0deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px),
                        repeating-linear-gradient(90deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px);
          }
          .navbar {
            position: fixed;
            top: 32px; left: 0; width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0 48px;
            z-index: 2;
          }
          .navbar-glass {
            background: rgba(30, 40, 36, 0.7);
            border-radius: 32px;
            box-shadow: 0 2px 24px #10151c44;
            padding: 12px 32px;
            display: flex;
            align-items: center;
            gap: 32px;
            backdrop-filter: blur(10px);
          }
          .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #e6e6e6;
            letter-spacing: -1px;
            text-decoration: none;
          }
          .nav-links {
            display: flex;
            gap: 24px;
          }
          .nav-link {
            color: #b0b8c1;
            font-size: 1rem;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
          }
          .nav-link:hover, .nav-link.active {
            color: #7fffd4;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 120px 32px 80px;
            position: relative;
            z-index: 1;
          }
          .page-header {
            text-align: center;
            margin-bottom: 80px;
          }
          .page-title {
            font-size: 3.5rem;
            font-weight: 700;
            color: #fff;
            margin-bottom: 24px;
            text-shadow: 0 2px 32px #7fffd444;
          }
          .page-subtitle {
            font-size: 1.3rem;
            color: #b0b8c1;
            opacity: 0.85;
          }
          .commands-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 24px;
            margin-bottom: 60px;
          }
          .command-card {
            background: rgba(30, 40, 36, 0.85);
            border-radius: 20px;
            padding: 32px;
            box-shadow: 0 2px 32px #10151c44;
            border: 1px solid rgba(127, 255, 212, 0.3);
            backdrop-filter: blur(2px);
            transition: transform 0.3s, box-shadow 0.3s;
          }
          .command-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 36px #10151c66;
          }
          .command-header {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
          }
          .command-icon {
            font-size: 2rem;
            margin-right: 16px;
          }
          .command-name {
            font-family: 'Courier New', monospace;
            font-size: 1.4rem;
            font-weight: 700;
            color: #7fffd4;
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 8px;
            margin: 0;
          }
          .command-description {
            font-size: 1.1rem;
            color: #e6e6e6;
            line-height: 1.5;
            margin-bottom: 20px;
          }
          .command-usage {
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            border-left: 4px solid #7fffd4;
          }
          .command-usage-title {
            font-size: 0.9rem;
            color: #7fffd4;
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .command-usage-text {
            font-family: 'Courier New', monospace;
            color: #fff;
            font-size: 1rem;
          }
          .command-examples {
            margin-top: 16px;
          }
          .command-examples-title {
            font-size: 0.9rem;
            color: #b0b8c1;
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .example {
            font-family: 'Courier New', monospace;
            background: rgba(0, 0, 0, 0.2);
            padding: 6px 10px;
            border-radius: 6px;
            margin-bottom: 6px;
            color: #b0b8c1;
            font-size: 0.95rem;
          }
          .permission-badge {
            display: inline-block;
            background: rgba(255, 107, 107, 0.2);
            color: #ff6b6b;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
            margin-top: 8px;
          }
          .category-section {
            margin-bottom: 60px;
          }
          .category-title {
            font-size: 2rem;
            font-weight: 700;
            color: #7fffd4;
            margin-bottom: 32px;
            text-align: center;
          }
          .btn {
            background: rgba(255,255,255,0.08);
            color: #e6e6e6;
            padding: 18px 38px;
            border: 1px solid #7fffd4;
            border-radius: 32px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 24px #7fffd433;
            transition: background 0.2s, box-shadow 0.2s, color 0.2s;
            text-decoration: none;
            display: inline-block;
            backdrop-filter: blur(2px);
            margin: 8px;
          }
          .btn:hover {
            background: rgba(127,255,212,0.12);
            color: #7fffd4;
            box-shadow: 0 4px 32px #7fffd455;
          }
        </style>
      </head>
      <body>
        <div class="grid-bg"></div>
        <div class="navbar">
          <div class="navbar-glass">
            <a href="/" class="logo">OtakuPulse</a>
            <div class="nav-links">
              <a href="/features" class="nav-link">Features</a>
              <a href="/getting-started" class="nav-link">Getting Started</a>
              <a href="/commands" class="nav-link active">Commands</a>
              <a href="/oauth/login" class="nav-link">Sign In</a>
            </div>
          </div>
        </div>
        
        <div class="container">
          <div class="page-header">
            <h1 class="page-title">📖 Command Reference</h1>
            <p class="page-subtitle">Complete guide to all OtakuPulse commands</p>
          </div>
          
          <div class="category-section">
            <h2 class="category-title">🛠️ Setup & Configuration</h2>
            <div class="commands-grid">
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">⚙️</span>
                  <h3 class="command-name">/setup</h3>
                </div>
                <p class="command-description">Configure OtakuPulse for your server. This command sets up all features and designates a notification channel.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/setup #channel</div>
                </div>
                <div class="command-examples">
                  <div class="command-examples-title">Examples</div>
                  <div class="example">/setup #anime-updates</div>
                  <div class="example">/setup #general</div>
                </div>
                <span class="permission-badge">Admin Only</span>
              </div>
              
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">📊</span>
                  <h3 class="command-name">/settings</h3>
                </div>
                <p class="command-description">View current bot configuration for your server, including enabled features and notification channels.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/settings</div>
                </div>
                <span class="permission-badge">Admin Only</span>
              </div>
            </div>
          </div>
          
          <div class="category-section">
            <h2 class="category-title">🎌 Anime Content</h2>
            <div class="commands-grid">
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">💬</span>
                  <h3 class="command-name">/quote</h3>
                </div>
                <p class="command-description">Get inspiring anime quotes from beloved characters. You can request random quotes or quotes from specific anime series.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/quote [anime]</div>
                </div>
                <div class="command-examples">
                  <div class="command-examples-title">Examples</div>
                  <div class="example">/quote</div>
                  <div class="example">/quote Naruto</div>
                  <div class="example">/quote "Attack on Titan"</div>
                </div>
              </div>
              
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">📺</span>
                  <h3 class="command-name">/airing</h3>
                </div>
                <p class="command-description">Display the top currently airing anime series with their current status, scores, and episode counts.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/airing</div>
                </div>
              </div>
              
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">🏆</span>
                  <h3 class="command-name">/top-anime</h3>
                </div>
                <p class="command-description">View the highest-rated anime series based on popularity and user scores from the AniList database.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/top-anime</div>
                </div>
              </div>
              
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">🔍</span>
                  <h3 class="command-name">/search</h3>
                </div>
                <p class="command-description">Search for any anime series in the comprehensive AniList database. Get detailed information including ratings and episode counts.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/search &lt;query&gt;</div>
                </div>
                <div class="command-examples">
                  <div class="command-examples-title">Examples</div>
                  <div class="example">/search demon slayer</div>
                  <div class="example">/search "jujutsu kaisen"</div>
                  <div class="example">/search studio ghibli</div>
                </div>
              </div>
              
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">🎬</span>
                  <h3 class="command-name">/trailer</h3>
                </div>
                <p class="command-description">Get official trailers and promotional videos for anime series. Links directly to YouTube videos when available.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/trailer &lt;anime&gt;</div>
                </div>
                <div class="command-examples">
                  <div class="command-examples-title">Examples</div>
                  <div class="example">/trailer "spirited away"</div>
                  <div class="example">/trailer one piece</div>
                  <div class="example">/trailer "your name"</div>
                </div>
              </div>
              
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">📚</span>
                  <h3 class="command-name">/manga</h3>
                </div>
                <p class="command-description">Search for manga series and get detailed information, or browse popular manga when no search term is provided.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/manga [query]</div>
                </div>
                <div class="command-examples">
                  <div class="command-examples-title">Examples</div>
                  <div class="example">/manga</div>
                  <div class="example">/manga "one piece"</div>
                  <div class="example">/manga attack on titan</div>
                  <div class="example">/manga demon slayer</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="category-section">
            <h2 class="category-title">ℹ️ Information & Help</h2>
            <div class="commands-grid">
              <div class="command-card">
                <div class="command-header">
                  <span class="command-icon">❓</span>
                  <h3 class="command-name">/help</h3>
                </div>
                <p class="command-description">Display a comprehensive help message with all available commands and their descriptions.</p>
                <div class="command-usage">
                  <div class="command-usage-title">Usage</div>
                  <div class="command-usage-text">/help</div>
                </div>
              </div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 60px;">
            <h2 style="color: #7fffd4; margin-bottom: 16px;">Ready to start using commands?</h2>
            <p style="color: #b0b8c1; margin-bottom: 32px;">Add OtakuPulse to your server and try these commands today!</p>
            <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands" class="btn">Add Bot to Server</a>
            <a href="/getting-started" class="btn">Setup Guide</a>
          </div>
        </div>
      </body>
    </html>
    `);
});

app.get('/', (req, res) => {
    res.send(`
    <html>
      <head>
        <title>OtakuPulse Bot</title>
        <link rel="icon" href="/1.ico" type="image/x-icon">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', Arial, sans-serif;
            background: linear-gradient(120deg, #16211c 0%, #10151c 100%);
            color: #e6e6e6;
            min-height: 100vh;
            overflow-x: hidden;
          }
          .grid-bg {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 0;
            pointer-events: none;
            background: repeating-linear-gradient(0deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px),
                        repeating-linear-gradient(90deg, #1e2a22 0px, #1e2a22 1px, transparent 1px, transparent 40px);
          }
          .navbar {
            position: absolute;
            top: 32px; left: 0; width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 48px;
            z-index: 2;
          }
          .navbar-glass {
            background: rgba(30, 40, 36, 0.7);
            border-radius: 32px;
            box-shadow: 0 2px 24px #10151c44;
            padding: 12px 32px;
            display: flex;
            align-items: center;
            gap: 32px;
          }
          .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #e6e6e6;
            letter-spacing: -1px;
          }
          .nav-links {
            display: flex;
            gap: 24px;
          }
          .nav-link {
            color: #b0b8c1;
            font-size: 1rem;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
          }
          .nav-link:hover {
            color: #7fffd4;
          }
          .hero {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            background: linear-gradient(120deg, rgba(40,60,50,0.7) 0%, rgba(20,30,24,0.9) 100%);
          }
          .hero-glow {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            background: radial-gradient(circle at 50% 30%, #7fffd433 0%, #0000 70%);
            z-index: 0;
          }
          .hero-content {
            position: relative;
            z-index: 1;
            margin-top: 80px;
          }
          .hero-title {
            font-size: 3.2rem;
            font-weight: 700;
            letter-spacing: -2px;
            margin-bottom: 0.2em;
            color: #fff;
            text-shadow: 0 2px 32px #7fffd444;
          }
          .hero-subtitle {
            font-size: 2rem;
            font-weight: 400;
            color: #b0b8c1;
            margin-bottom: 1.5em;
            opacity: 0.85;
          }
          .hero-desc {
            font-size: 1.15rem;
            color: #b0b8c1;
            margin-bottom: 2em;
            opacity: 0.7;
          }
          .hero-buttons {
            display: flex;
            gap: 24px;
            justify-content: center;
            margin-bottom: 2.5em;
          }
          .btn {
            background: rgba(255,255,255,0.08);
            color: #e6e6e6;
            padding: 18px 38px;
            border: 1px solid #7fffd4;
            border-radius: 32px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 24px #7fffd433;
            transition: background 0.2s, box-shadow 0.2s, color 0.2s;
            text-decoration: none;
            display: inline-block;
            backdrop-filter: blur(2px);
          }
          .btn:hover {
            background: rgba(127,255,212,0.12);
            color: #7fffd4;
            box-shadow: 0 4px 32px #7fffd455;
          }
         
          }
          @keyframes floatBot {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-18px); }
          }
          .features-section {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(30,40,36,0.85);
            border-radius: 24px;
            padding: 48px 32px;
            box-shadow: 0 2px 32px #10151c44;
            margin-top: -60px;
            position: relative;
            z-index: 2;
          }
          .features-section h3 {
            color: #7fffd4;
            font-size: 1.7rem;
            margin-bottom: 1em;
            font-weight: 700;
          }
          .features-list {
            text-align: left;
            margin-bottom: 2em;
            columns: 2;
            column-gap: 48px;
          }
          .features-list li {
            margin-bottom: 0.7em;
            font-size: 1.15rem;
            color: #e6e6e6;
            opacity: 0.95;
          }
          .getting-started {
            margin-bottom: 2em;
          }
          .commands-list {
            text-align: left;
          }
          .commands-list li {
            margin-bottom: 0.5em;
            font-size: 1.08rem;
            color: #b0b8c1;
          }
        </style>
      </head>
      <body>
        <div class="grid-bg"></div>
        <div class="navbar">
          <div class="navbar-glass">
            <span class="logo">OtakuPulse</span>
            <div class="nav-links">
              <a href="/features" class="nav-link">Features</a>
              <a href="/getting-started" class="nav-link">Getting Started</a>
              <a href="/commands" class="nav-link">Commands</a>
              <a href="/oauth/login" class="nav-link">Sign In</a>
            </div>
          </div>
        </div>
        <div class="hero">
          <div class="hero-glow"></div>
          <div class="hero-content">
            <div style="margin-bottom: 32px;">
              
            </div>
            <div class="hero-title">Auto anime updates, quotes, and more</div>
            <div class="hero-subtitle">with your exclusive Discord bot</div>
            <div class="hero-desc">OtakuPulse provides real-time anime alerts, daily quotes, trailers, rankings, and more.<br>Manage everything from the dashboard, delivered straight to your Discord server.</div>
            <div class="hero-buttons">
              <a href="/oauth/login" class="btn">Sign up</a>
              <a href="https://discord.gg/qrzdHN8mu2" class="btn" target="_blank">Join our Discord</a>
            </div>
            
          </div>
        </div>
        
        <div style="text-align: center; padding: 80px 32px; max-width: 900px; margin: 0 auto;">
          <h2 style="color: #7fffd4; font-size: 2.2rem; margin-bottom: 24px; font-weight: 700;">🎌 Your All-In-One Anime Hub</h2>
          <p style="color: #b0b8c1; font-size: 1.2rem; margin-bottom: 40px; opacity: 0.85;">Join thousands of Discord communities already using OtakuPulse for their anime content needs.</p>
          <div style="display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;">
            <a href="/features" class="btn">Explore Features</a>
            <a href="/getting-started" class="btn">Get Started</a>
            <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands" class="btn">Add to Server</a>
          </div>
        </div>
        <br>
      </body>
    </html>
    `);
});

// Enhanced error handling for process events
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', error);
    errorHandler.handleProcessError(error, 'unhandledRejection');
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    errorHandler.handleProcessError(error, 'uncaughtException');
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Start the bot and web server
const PORT = process.env.PORT || 3000;

client.login(process.env.DISCORD_TOKEN).then(() => {
    logger.info('✅ Discord bot logged in successfully');
    app.listen(PORT, () => {
        logger.info(`🌐 Web server running on port ${PORT}`);
        logger.info(`📱 Dashboard: http://localhost:${PORT}`);
        logger.info(`🔗 Bot invite: https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands`);
        logger.info('🚀 OtakuPulse Enhanced is ready to serve!');
    });
}).catch(error => {
    logger.error('❌ Failed to login to Discord', error);
    process.exit(1);
});
