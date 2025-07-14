const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const session = require('express-session');
const path = require('path');
require('dotenv').config();
// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Wire up dashboard feature selection route (after guildSettings is declared)
const dashboardSettingsRouter = require('./dashboard-settings');
app.use(dashboardSettingsRouter);

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'otakupulse-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));


// Neon DB integration
const { ensureGuildSettingsTable, getGuildSettings, setGuildSettings } = require('./db');

// Ensure DB table exists at startup
ensureGuildSettingsTable().catch(console.error);

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
const JIKAN_API_BASE = 'https://api.jikan.moe/v4';
const ANIMECHAN_API_BASE = 'https://animechan.vercel.app/api';
const QUOTES_API_BASE = 'https://api.api-ninjas.com/v1/quotes';

// Rate limiting for API calls
const rateLimiter = {
    jikan: { lastCall: 0, delay: 1000 }, // 1 second delay for Jikan API
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

// API Helper Functions
class AnimeAPI {
    // Get currently airing anime
    static async getCurrentlyAiring() {
        try {
            await rateLimit('jikan');
            const response = await axios.get(`${JIKAN_API_BASE}/seasons/now`, {
                timeout: 10000
            });
            return response.data.data.slice(0, 10); // Return top 10
        } catch (error) {
            console.error('Error fetching currently airing anime:', error.message);
            return [];
        }
    }

    // Get anime by ID
    static async getAnimeById(id) {
        try {
            await rateLimit('jikan');
            const response = await axios.get(`${JIKAN_API_BASE}/anime/${id}`);
            return response.data.data;
        } catch (error) {
            console.error(`Error fetching anime ${id}:`, error.message);
            return null;
        }
    }

    // Get anime videos/trailers
    static async getAnimeVideos(id) {
        try {
            await rateLimit('jikan');
            const response = await axios.get(`${JIKAN_API_BASE}/anime/${id}/videos`);
            return response.data.data;
        } catch (error) {
            console.error(`Error fetching anime videos for ${id}:`, error.message);
            return null;
        }
    }

    // Get top anime
    static async getTopAnime() {
        try {
            await rateLimit('jikan');
            const response = await axios.get(`${JIKAN_API_BASE}/top/anime`);
            return response.data.data.slice(0, 5);
        } catch (error) {
            console.error('Error fetching top anime:', error.message);
            return [];
        }
    }

    // Search anime
    static async searchAnime(query) {
        try {
            await rateLimit('jikan');
            const response = await axios.get(`${JIKAN_API_BASE}/anime`, {
                params: { q: query, limit: 5 }
            });
            return response.data.data;
        } catch (error) {
            console.error(`Error searching anime "${query}":`, error.message);
            return [];
        }
    }

    // Get anime quotes
    static async getAnimeQuote(anime = null) {
        try {
            await rateLimit('animechan');
            let url;
            if (anime) {
                url = `https://api.animechan.io/v1/quotes/random?anime=${encodeURIComponent(anime)}`;
                try {
                    const response = await axios.get(url);
                    // The endpoint returns a single Quote object
                    if (response.data && response.data.content) {
                        return response.data;
                    } else {
                        console.warn(`No quote found for anime: ${anime}. Falling back to random quote.`);
                        url = 'https://api.animechan.io/v1/quotes/random';
                        const randomResponse = await axios.get(url);
                        if (randomResponse.data.status === 'success') {
                            return randomResponse.data.data;
                        } else {
                            return null;
                        }
                    }
                } catch (err) {
                    if (err.response && err.response.status === 404) {
                        console.warn(`No quote found for anime: ${anime}. Falling back to random quote.`);
                    } else {
                        console.error(`Error fetching quote for anime: ${anime}:`, err.message);
                    }
                    url = 'https://api.animechan.io/v1/quotes/random';
                    const randomResponse = await axios.get(url);
                    if (randomResponse.data.status === 'success') {
                        return randomResponse.data.data;
                    } else {
                        return null;
                    }
                }
            } else {
                url = 'https://api.animechan.io/v1/quotes/random';
                const response = await axios.get(url);
                if (response.data.status === 'success') {
                    return response.data.data;
                } else {
                    return null;
                }
            }
        } catch (error) {
            console.error('Error fetching anime quote:', error.message);
            return null;
        }
    }

    // Get inspirational quotes
    static async getInspirationalQuote() {
        try {
            await rateLimit('animechan');
            const response = await axios.get(`${ANIMECHAN_API_BASE}/random`);
            // Animechan returns { anime, character, quote }
            return {
                quote: response.data.quote,
                author: `${response.data.character} (${response.data.anime})`
            };
        } catch (error) {
            console.error('Error fetching inspirational quote from Animechan:', error.message);
            // Fallback anime quotes
            const fallbackQuotes = [
                { quote: "To know sorrow is not terrifying. What is terrifying is to know you can't go back to happiness you could have.", author: "Matsumoto Rangiku (Bleach)" },
                { quote: "No one knows what the future holds. That's why its potential is infinite.", author: "Rintarou Okabe (Steins;Gate)" },
                { quote: "It's not the face that makes someone a monster; it's the choices they make with their lives.", author: "Naruto Uzumaki (Naruto)" }
            ];
            return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
        }
    }
}

// Slash commands
const commands = [
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
        .setName('settings')
        .setDescription('View current server settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands')
];

// Discord bot event handlers
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
            body: commands
        });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    
    // Start scheduled tasks
    startScheduledTasks();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
        await interaction.deferReply();

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
            case 'settings':
                await handleSettings(interaction);
                break;
            case 'help':
                await handleHelp(interaction);
                break;
            default:
                await interaction.editReply('Unknown command!');
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}:`, error);
        await interaction.editReply('An error occurred while processing your command.');
    }
});

// Command handlers
async function handleSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;
    
    guildSettings.set(guildId, {
        // Default all notification types to the selected channel
        notificationChannel: channel.id,
        dailyQuotesChannel: channel.id,
        airingAlertsChannel: channel.id,
        trailerNotificationsChannel: channel.id,
        topAnimeRankingsChannel: channel.id,
        animeSearchChannel: channel.id,
        dailyQuotes: true,
        airingAlerts: true,
        trailerNotifications: true,
        topAnimeRankings: true,
        animeSearch: true
    });
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Setup Complete!')
        .setDescription(`OtakuPulse has been configured for this server.\n\n**Notification Channel:** ${channel}\n**Daily Quotes:** Enabled\n**Airing Alerts:** Enabled\n**Trailer Notifications:** Enabled`)
        .setColor('#00FF00')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleAnimeQuote(interaction) {
    const anime = interaction.options.getString('anime');
    const quote = await AnimeAPI.getAnimeQuote(anime);
    
    if (!quote) {
        await interaction.editReply('Could not fetch anime quote at this time. Please try again later.');
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎌 Anime Quote')
        .setDescription(`*"${quote.quote}"*`)
        .addFields(
            { name: 'Character', value: quote.character, inline: true },
            { name: 'Anime', value: quote.anime, inline: true }
        )
        .setColor('#FF6B6B')
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
    // Professional embed styling
    const embed = new EmbedBuilder()
        .setColor('#7f00ff')
        .setTitle('🎌 Anime Quote')
        .setDescription(`> "${quote.content}"`)
        .addFields(
            { name: 'Character', value: `🎭 ${quote.character?.name || 'Unknown'}`, inline: true },
            { name: 'Anime', value: `📺 ${quote.anime?.name || 'Unknown'}`, inline: true }
        )
        .setFooter({ text: 'Powered by AnimeChan • OtakuPulse', iconURL: 'https://animechan.vercel.app/assets/logo.png' })
        .setTimestamp()
        .setThumbnail('https://animechan.vercel.app/assets/logo.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
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
        .setFooter({ text: 'OtakuPulse • Jikan API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    airingAnime.slice(0, 5).forEach((anime, index) => {
        embed.addFields({
            name: `#${index + 1} • ${anime.title}`,
            value: `⭐ **Score:** ${anime.score || 'N/A'}\n📺 **Episodes:** ${anime.episodes || 'Ongoing'}\n🟢 **Status:** ${anime.status}`,
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
        .setFooter({ text: 'OtakuPulse • Jikan API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    topAnime.forEach((anime, index) => {
        embed.addFields({
            name: `#${index + 1} • ${anime.title}`,
            value: `⭐ **Score:** ${anime.score}\n🏅 **Rank:** #${anime.rank}\n📺 **Episodes:** ${anime.episodes || 'N/A'}`,
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
            name: `${index + 1}. ${anime.title}`,
            value: `**Score:** ${anime.score || 'N/A'}\n**Episodes:** ${anime.episodes || 'N/A'}\n**Status:** ${anime.status}`,
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
    const videos = await AnimeAPI.getAnimeVideos(anime.mal_id);
    
    if (!videos || !videos.promo || videos.promo.length === 0) {
        await interaction.editReply(`No trailers found for "${anime.title}".`);
        return;
    }
    
    const trailer = videos.promo[0];
    
    const embed = new EmbedBuilder()
        .setColor('#FF7675')
        .setTitle(`🎬 ${anime.title} - Trailer`)
        .setDescription(`**${trailer.title}**`)
        .setURL(trailer.trailer.url)
        .setImage(trailer.trailer.images.large_image_url)
        .setFooter({ text: 'OtakuPulse • Jikan API', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleSettings(interaction) {
    const guildId = interaction.guildId;
    const settings = guildSettings.get(guildId);
    
    if (!settings) {
        await interaction.editReply('No settings found for this server. Use `/setup` to configure the bot.');
        return;
    }
    
    const channel = interaction.guild.channels.cache.get(settings.notificationChannel);
    
    const embed = new EmbedBuilder()
        .setColor('#74B9FF')
        .setTitle('⚙️ Server Settings')
        .addFields(
            { name: 'Notification Channel', value: channel ? channel.toString() : 'Not found', inline: true },
            { name: 'Daily Quotes', value: settings.dailyQuotes ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Airing Alerts', value: settings.airingAlerts ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Trailer Notifications', value: settings.trailerNotifications ? '✅ Enabled' : '❌ Disabled', inline: true }
        )
        .setFooter({ text: 'OtakuPulse • Server Settings', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#00CEC9')
        .setTitle('📖 OtakuPulse Help')
        .setDescription('Here are all available commands:')
        .addFields(
            { name: '/setup', value: 'Set up the bot for your server (Admin only)', inline: false },
            { name: '/quote [anime]', value: 'Get a random anime quote, or from a specific anime (optional)', inline: false },
            { name: '/airing', value: 'Show currently airing anime', inline: false },
            { name: '/top-anime', value: 'Show top-rated anime', inline: false },
            { name: '/search <query>', value: 'Search for anime', inline: false },
            { name: '/trailer <anime>', value: 'Get anime trailer', inline: false },
            { name: '/settings', value: 'View server settings (Admin only)', inline: false },
            { name: '/help', value: 'Show this help message', inline: false }
        )
        .setFooter({ text: 'OtakuPulse - Your All-In-One Anime Hub', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
        .setTimestamp()
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/906/906175.png')
        .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' });
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
                        { quote: "It's not the face that makes someone a monster; it's the choices they make with their lives.", anime: "Naruto", character: "Naruto Uzumaki" }
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
            // Create embed for the quote
            const embed = new EmbedBuilder()
                .setColor('#7f00ff')
                .setTitle('✨ Anime Quote ✨')
                .setDescription(`_"${quote.quote}"_`)
                .addFields(
                    { name: '📺 Anime', value: quote.anime || 'Unknown', inline: true },
                    { name: '🎭 Character', value: quote.character || 'Unknown', inline: true }
                )
                .setFooter({ text: 'Powered by AnimeChan API', iconURL: 'https://animechan.vercel.app/assets/logo.png' })
                .setTimestamp()
                .setThumbnail('https://animechan.vercel.app/assets/logo.png')
                .setAuthor({ name: 'OtakuPulse Bot', iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png' })
                .setImage('https://cdn.wallpapersafari.com/84/3/6Q0Q0Q.jpg')
                .setURL('https://animechan.vercel.app/');
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
                    .setDescription(`**${randomAnime.title}** is currently airing!`)
                    .addFields(
                        { name: 'Status', value: randomAnime.status, inline: true },
                        { name: 'Score', value: randomAnime.score?.toString() || 'N/A', inline: true },
                        { name: 'Episodes', value: randomAnime.episodes?.toString() || 'Ongoing', inline: true }
                    )
                    .setColor('#FFD93D')
                    .setTimestamp();
                if (randomAnime.images?.jpg?.large_image_url) {
                    embed.setImage(randomAnime.images.jpg.large_image_url);
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
    
    const botGuilds = Array.from(client.guilds.cache.values());
    for (const guild of botGuilds) {
        const settings = await getGuildSettings(guild.id);
        if (!settings) continue;
        try {
            const channelId = settings.top_anime_rankings_channel || settings.notification_channel;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;
            const embed = new EmbedBuilder()
                .setTitle('🏆 Weekly Top Anime')
                .setDescription('Here are this week\'s top-rated anime:')
                .setColor('#6C5CE7')
                .setTimestamp();
            topAnime.slice(0, 5).forEach((anime, index) => {
                embed.addFields({
                    name: `${index + 1}. ${anime.title}`,
                    value: `**Score:** ${anime.score}\n**Rank:** #${anime.rank}`,
                    inline: true
                });
            });
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Error sending weekly top anime to guild ${guild.id}:`, error);
        }
    }
}

// OAuth2 Routes
app.get('/oauth/login', (req, res) => {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(authUrl);
});

app.get('/oauth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).send('No authorization code provided');
    }
    
    try {
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
        
        // Get user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        
        // Get user guilds
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        
        req.session.user = userResponse.data;
        req.session.guilds = guildsResponse.data;
        req.session.accessToken = access_token;
        
        res.redirect('/dashboard');
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('Authentication failed');
    }
});


app.get('/dashboard', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/oauth/login');
    }
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
            <span class="logo">OtakuPulse</span>
<div class="nav-links">
                <a href="/#features" class="nav-link">Features</a>
                <a href="/#getting-started" class="nav-link">Getting Started</a>
                <a href="/#commands" class="nav-link">Commands</a>
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
            let channelDropdowns = { dailyQuotes: '', airingAlerts: '', trailerNotifications: '', topAnimeRankings: '', animeSearch: '' };
            if (guildObj) {
                const textChannels = guildObj.channels.cache.filter(ch => ch.type === 0); // 0 = GuildText
                const options = Array.from(textChannels.values()).map(ch => ch);
                channelDropdowns.dailyQuotes = options.map(ch => `<option value="${ch.id}" ${(settings.daily_quotes_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.airingAlerts = options.map(ch => `<option value="${ch.id}" ${(settings.airing_alerts_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.trailerNotifications = options.map(ch => `<option value="${ch.id}" ${(settings.trailer_notifications_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.topAnimeRankings = options.map(ch => `<option value="${ch.id}" ${(settings.top_anime_rankings_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
                channelDropdowns.animeSearch = options.map(ch => `<option value="${ch.id}" ${(settings.anime_search_channel === ch.id) ? 'selected' : ''}>#${ch.name}</option>`).join('');
            }
            // Fallback for notification_channel: use first selected channel or first available
            let fallbackChannel = settings.daily_quotes_channel || settings.airing_alerts_channel || settings.trailer_notifications_channel || settings.top_anime_rankings_channel || settings.anime_search_channel;
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
                    <label><input type="checkbox" name="airingAlerts" ${settings.airing_alerts ? 'checked' : ''}/> 📺 Real-time Anime Updates</label>
                    <label><input type="checkbox" name="trailerNotifications" ${settings.trailer_notifications ? 'checked' : ''}/> 🎬 Latest Trailers</label>
                    <label><input type="checkbox" name="dailyQuotes" ${settings.daily_quotes ? 'checked' : ''}/> 🎌 Daily Anime Quotes</label>
                    <label><input type="checkbox" name="topAnimeRankings" ${settings.top_anime_rankings ? 'checked' : ''}/> 🏆 Top Anime Rankings</label>
                    <label><input type="checkbox" name="animeSearch" ${settings.anime_search ? 'checked' : ''}/> 🔍 Anime Search</label>
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
              <a href="#features" class="nav-link">Features</a>
              <a href="#getting-started" class="nav-link">Getting Started</a>
              <a href="#commands" class="nav-link">Commands</a>
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
        </div><br><br><br><br>
        <div class="features-section" id="features">
          <h3>🔥 Features</h3>
          <ul class="features-list">
            <li>📺 Real-time currently airing anime updates</li>
            <li>🎬 Latest anime trailers and promos</li>
            <li>🎌 Daily anime quotes from your favorite characters</li>
            <li>🏆 Weekly top anime rankings</li>
            <li>🔍 Anime search functionality</li>
            <li>⚙️ Customizable server settings</li>
            <li>📱 Web dashboard for easy management</li>
          </ul>
          <div class="getting-started" id="getting-started">
            <h3>🚀 Getting Started</h3>
            <p><a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands" class="btn">Add Bot to Server</a></p>
          </div>
          <div id="commands">
            <h3>📖 Commands</h3>
            <ul class="commands-list">
              <li><code>/setup</code> - Configure the bot for your server</li>
              <li><code>/anime-quote</code> - Get random anime quotes</li>
              <li><code>/quote</code> - Get inspirational quotes</li>
              <li><code>/airing</code> - Check currently airing anime</li>
              <li><code>/top-anime</code> - View top-rated anime</li>
              <li><code>/search</code> - Search for anime</li>
              <li><code>/trailer</code> - Get anime trailers</li>
              <li><code>/help</code> - Show all commands</li>
            </ul>
          </div>
        </div>
        <br>
      </body>
    </html>
    `);
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Start the bot and web server
const PORT = process.env.PORT || 3000;

client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log('✅ Discord bot logged in successfully');
    app.listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
        console.log(`📱 Dashboard: http://localhost:${PORT}`);
        console.log(`🔗 Bot invite: https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=2048&scope=bot%20applications.commands`);
    });
}).catch(error => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});