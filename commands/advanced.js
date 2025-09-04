// Advanced slash commands for enhanced functionality
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class AdvancedCommands {
    constructor(animeAPI, aiFeatures, analyticsManager, premiumManager, logger) {
        this.animeAPI = animeAPI;
        this.aiFeatures = aiFeatures;
        this.analytics = analyticsManager;
        this.premium = premiumManager;
        this.logger = logger;
    }

    getCommands() {
        return [
            // AI-powered recommendations
            new SlashCommandBuilder()
                .setName('recommend')
                .setDescription('Get AI-powered anime recommendations based on your preferences')
                .addStringOption(option =>
                    option.setName('genres')
                        .setDescription('Preferred genres (e.g., action, romance, comedy)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('watched')
                        .setDescription('Anime you\'ve already watched (comma separated)')
                        .setRequired(false)
                ),

            // Character analysis
            new SlashCommandBuilder()
                .setName('character')
                .setDescription('Get detailed character analysis')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Character name')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('anime')
                        .setDescription('Anime name')
                        .setRequired(true)
                ),

            // Anime trivia
            new SlashCommandBuilder()
                .setName('trivia')
                .setDescription('Play anime trivia game')
                .addStringOption(option =>
                    option.setName('difficulty')
                        .setDescription('Difficulty level')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Easy', value: 'easy' },
                            { name: 'Medium', value: 'medium' },
                            { name: 'Hard', value: 'hard' }
                        )
                )
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('Trivia category')
                        .setRequired(false)
                        .addChoices(
                            { name: 'General', value: 'general' },
                            { name: 'Shonen', value: 'shonen' },
                            { name: 'Romance', value: 'romance' },
                            { name: 'Studio Ghibli', value: 'ghibli' }
                        )
                ),

            // User preferences
            new SlashCommandBuilder()
                .setName('preferences')
                .setDescription('Set your anime preferences for better recommendations')
                .addStringOption(option =>
                    option.setName('genres')
                        .setDescription('Your favorite genres (comma separated)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Preferred anime type')
                        .setRequired(false)
                        .addChoices(
                            { name: 'TV Series', value: 'tv' },
                            { name: 'Movies', value: 'movie' },
                            { name: 'OVA', value: 'ova' },
                            { name: 'Any', value: 'any' }
                        )
                ),

            // Analytics command
            new SlashCommandBuilder()
                .setName('analytics')
                .setDescription('View server analytics and statistics')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ADMINISTRATOR

            // Premium management
            new SlashCommandBuilder()
                .setName('premium')
                .setDescription('Manage premium features')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('Check your premium status')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('upgrade')
                        .setDescription('View upgrade options')
                ),

            // Owner-only admin commands
            new SlashCommandBuilder()
                .setName('admin')
                .setDescription('Bot owner admin commands')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('grant-premium')
                        .setDescription('Grant premium access to a user')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('User to grant premium to')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('tier')
                                .setDescription('Premium tier to grant')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Basic', value: 'basic' },
                                    { name: 'Premium', value: 'premium' },
                                    { name: 'Ultimate', value: 'ultimate' }
                                )
                        )
                        .addIntegerOption(option =>
                            option.setName('months')
                                .setDescription('Duration in months')
                                .setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('revoke-premium')
                        .setDescription('Revoke premium access from a user')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('User to revoke premium from')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('stats')
                        .setDescription('View global bot statistics')
                ),

            // Advanced search with filters
            new SlashCommandBuilder()
                .setName('advanced-search')
                .setDescription('Search anime with advanced filters')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Search query')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('genre')
                        .setDescription('Filter by genre')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('Release year')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('min-score')
                        .setDescription('Minimum score (1-100)')
                        .setRequired(false)
                ),

            // Watchlist management
            new SlashCommandBuilder()
                .setName('watchlist')
                .setDescription('Manage your anime watchlist')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add anime to watchlist')
                        .addStringOption(option =>
                            option.setName('anime')
                                .setDescription('Anime name')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove anime from watchlist')
                        .addStringOption(option =>
                            option.setName('anime')
                                .setDescription('Anime name')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('view')
                        .setDescription('View your watchlist')
                ),

            // Random anime generator
            new SlashCommandBuilder()
                .setName('random')
                .setDescription('Get a random anime recommendation')
                .addStringOption(option =>
                    option.setName('genre')
                        .setDescription('Filter by genre')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('format')
                        .setDescription('Anime format')
                        .setRequired(false)
                        .addChoices(
                            { name: 'TV', value: 'TV' },
                            { name: 'Movie', value: 'MOVIE' },
                            { name: 'OVA', value: 'OVA' },
                            { name: 'Special', value: 'SPECIAL' }
                        )
                ),

            // Schedule command
            new SlashCommandBuilder()
                .setName('schedule')
                .setDescription('View anime airing schedule')
                .addStringOption(option =>
                    option.setName('day')
                        .setDescription('Day of the week')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Monday', value: 'monday' },
                            { name: 'Tuesday', value: 'tuesday' },
                            { name: 'Wednesday', value: 'wednesday' },
                            { name: 'Thursday', value: 'thursday' },
                            { name: 'Friday', value: 'friday' },
                            { name: 'Saturday', value: 'saturday' },
                            { name: 'Sunday', value: 'sunday' }
                        )
                ),

            // Compare anime
            new SlashCommandBuilder()
                .setName('compare')
                .setDescription('Compare two anime series')
                .addStringOption(option =>
                    option.setName('anime1')
                        .setDescription('First anime')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('anime2')
                        .setDescription('Second anime')
                        .setRequired(true)
                )
        ];
    }

    async handleRecommend(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // Check premium access
            const hasAccess = await this.premium.checkFeatureAccess(userId, 'recommendations', guildId);
            if (!hasAccess) {
                return await interaction.editReply({
                    content: '💎 This feature requires a premium subscription. Use `/premium upgrade` to unlock AI recommendations!',
                    ephemeral: true
                });
            }

            const genres = interaction.options.getString('genres');
            const watched = interaction.options.getString('watched');

            const preferences = {
                genres: genres ? genres.split(',').map(g => g.trim()) : [],
                watchedAnime: watched ? watched.split(',').map(a => a.trim()) : []
            };

            const recommendations = await this.aiFeatures.getAnimeRecommendations(preferences, preferences.watchedAnime);

            const embed = new EmbedBuilder()
                .setTitle('🤖 AI-Powered Recommendations')
                .setDescription('Based on your preferences, here are some anime you might enjoy:')
                .setColor('#7fffd4')
                .setTimestamp();

            recommendations.slice(0, 5).forEach((rec, index) => {
                embed.addFields({
                    name: `${index + 1}. ${rec.title}`,
                    value: `${rec.description}\n\n**Why you'll like it:** ${rec.reason}\n**Rating:** ${rec.rating}`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });
            await this.premium.trackFeatureUsage(userId, 'recommendations', guildId);
            await this.analytics.trackCommand('recommend', userId, guildId, Date.now() - startTime);

        } catch (error) {
            await this.analytics.trackCommand('recommend', userId, guildId, Date.now() - startTime, false, error.message);
            throw error;
        }
    }

    async handleCharacter(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // Check premium access
            const hasAccess = await this.premium.checkFeatureAccess(userId, 'ai_analysis', guildId);
            if (!hasAccess) {
                return await interaction.editReply({
                    content: '💎 Character analysis requires a premium subscription. Use `/premium upgrade` to unlock this feature!',
                    ephemeral: true
                });
            }

            const characterName = interaction.options.getString('name');
            const animeName = interaction.options.getString('anime');

            const analysis = await this.aiFeatures.getCharacterAnalysis(characterName, animeName);

            const embed = new EmbedBuilder()
                .setTitle(`🎭 Character Analysis: ${analysis.character}`)
                .setDescription(`**From:** ${analysis.anime}`)
                .addFields({
                    name: '📝 Analysis',
                    value: analysis.analysis,
                    inline: false
                })
                .setColor('#A29BFE')
                .setFooter({ 
                    text: analysis.type === 'ai_generated' ? 'Generated by AI' : 'OtakuPulse Database',
                    iconURL: 'https://cdn-icons-png.flaticon.com/512/906/906175.png'
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await this.premium.trackFeatureUsage(userId, 'ai_analysis', guildId);
            await this.analytics.trackCommand('character', userId, guildId, Date.now() - startTime);

        } catch (error) {
            await this.analytics.trackCommand('character', userId, guildId, Date.now() - startTime, false, error.message);
            throw error;
        }
    }

    async handleTrivia(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            const difficulty = interaction.options.getString('difficulty') || 'medium';
            const category = interaction.options.getString('category') || 'general';

            const trivia = await this.aiFeatures.generateTrivia(difficulty, category);

            const embed = new EmbedBuilder()
                .setTitle(`🧠 Anime Trivia - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`)
                .setDescription(trivia.question)
                .addFields(
                    {
                        name: '📝 Options',
                        value: Array.isArray(trivia.options) ? trivia.options.join('\n') : trivia.options,
                        inline: false
                    }
                )
                .setColor('#FFD93D')
                .setFooter({ text: 'React with the correct letter! (A, B, C, or D)' })
                .setTimestamp();

            const message = await interaction.editReply({ embeds: [embed] });

            // Add reaction buttons
            await message.react('🇦');
            await message.react('🇧');
            await message.react('🇨');
            await message.react('🇩');

            // Wait for user reaction
            const filter = (reaction, user) => {
                return ['🇦', '🇧', '🇨', '🇩'].includes(reaction.emoji.name) && user.id === userId;
            };

            const collected = await message.awaitReactions({ filter, max: 1, time: 30000 });

            if (collected.size > 0) {
                const reaction = collected.first();
                const userAnswer = ['🇦', '🇧', '🇨', '🇩'].indexOf(reaction.emoji.name);
                const correctIndex = trivia.correctAnswer.charCodeAt(0) - 65; // Convert A,B,C,D to 0,1,2,3

                const resultEmbed = new EmbedBuilder()
                    .setTitle(userAnswer === correctIndex ? '✅ Correct!' : '❌ Wrong!')
                    .setDescription(`The correct answer was: **${trivia.correctAnswer}**`)
                    .addFields({
                        name: '💡 Fun Fact',
                        value: trivia.funFact || 'Thanks for playing!',
                        inline: false
                    })
                    .setColor(userAnswer === correctIndex ? '#00FF00' : '#FF0000');

                await interaction.followUp({ embeds: [resultEmbed] });
            } else {
                await interaction.followUp('⏰ Time\'s up! Try again with `/trivia`');
            }

            await this.analytics.trackCommand('trivia', userId, guildId, Date.now() - startTime);

        } catch (error) {
            await this.analytics.trackCommand('trivia', userId, guildId, Date.now() - startTime, false, error.message);
            throw error;
        }
    }

    async handlePreferences(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            const genres = interaction.options.getString('genres');
            const type = interaction.options.getString('type');

            const preferences = {
                favoriteGenres: genres ? genres.split(',').map(g => g.trim()) : [],
                preferredAnimeType: type || 'any'
            };

            await this.analytics.updateUserPreferences(userId, preferences);

            const embed = new EmbedBuilder()
                .setTitle('✅ Preferences Updated')
                .setDescription('Your anime preferences have been saved!')
                .addFields([
                    {
                        name: '🎭 Favorite Genres',
                        value: preferences.favoriteGenres.length > 0 ? preferences.favoriteGenres.join(', ') : 'None set',
                        inline: true
                    },
                    {
                        name: '📺 Preferred Type',
                        value: preferences.preferredAnimeType,
                        inline: true
                    }
                ])
                .setColor('#7fffd4')
                .setFooter({ text: 'These will be used for better recommendations!' });

            await interaction.editReply({ embeds: [embed] });
            await this.analytics.trackCommand('preferences', userId, guildId, Date.now() - startTime);

        } catch (error) {
            await this.analytics.trackCommand('preferences', userId, guildId, Date.now() - startTime, false, error.message);
            throw error;
        }
    }

    async handleAnalytics(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            console.log('📊 Analytics command called by:', interaction.user.username);
            console.log('📊 User ID:', userId);
            
            // Check if user is owner first
            const isOwner = await this.premium.isOwner(userId);
            console.log('📊 Is owner:', isOwner);
            
            // Check premium access (owners get automatic access)
            const hasAccess = isOwner || await this.premium.checkFeatureAccess(userId, 'analytics', guildId);
            console.log('📊 Has analytics access:', hasAccess);
            
            if (!hasAccess) {
                return await interaction.editReply({
                    content: '💎 Analytics require a premium subscription. Use `/premium upgrade` to unlock detailed analytics!',
                    ephemeral: true
                });
            }

            // Check if analytics is enabled
            if (!this.analytics.enabled) {
                console.log('❌ Analytics is disabled');
                return await interaction.editReply({
                    content: '📊 Server Analytics\n\n❌ **Analytics disabled**\n\nAnalytics are currently disabled. Contact the bot administrator to enable this feature.',
                    ephemeral: true
                });
            }

            console.log('📊 Generating analytics report...');
            const report = await this.analytics.generateReport(guildId);
            console.log('📊 Report generated:', report);

            const embed = new EmbedBuilder()
                .setTitle('📊 Server Analytics')
                .setDescription(report)
                .setColor('#74B9FF')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            if (this.analytics.enabled) {
                await this.premium.trackFeatureUsage(userId, 'analytics', guildId);
                await this.analytics.trackCommand('analytics', userId, guildId, Date.now() - startTime);
            }

        } catch (error) {
            console.error('❌ Analytics command error:', error);
            if (this.analytics.enabled) {
                await this.analytics.trackCommand('analytics', userId, guildId, Date.now() - startTime, false, error.message);
            }
            throw error;
        }
    }

    async handlePremium(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'status') {
                const subscription = await this.premium.getUserSubscription(userId, guildId);
                const embed = this.premium.generatePremiumEmbed(subscription);
                
                // Add special owner message
                if (subscription.type === 'owner') {
                    embed.setDescription(`**Welcome back, ${interaction.user.username}! 👑**\n\nYou have OWNER ACCESS with unlimited everything!`);
                }
                
                await interaction.editReply({ embeds: [embed] });
            } else if (subcommand === 'upgrade') {
                const currentSub = await this.premium.getUserSubscription(userId, guildId);
                
                if (currentSub.type === 'owner') {
                    const embed = new EmbedBuilder()
                        .setTitle('👑 Owner Status')
                        .setDescription('You already have the highest possible access level!')
                        .setColor('#FF6B35')
                        .addFields({
                            name: '🔥 Your Status',
                            value: 'Bot Owner - Maximum Access Level\nYou have unlimited access to all features!',
                            inline: false
                        });
                    return await interaction.editReply({ embeds: [embed] });
                }
                
                const upgradeOptions = await this.premium.getUpgradeOptions(currentSub.type);

                const embed = new EmbedBuilder()
                    .setTitle('💎 Upgrade Your Plan')
                    .setDescription('Choose a premium plan to unlock advanced features!')
                    .setColor('#FFD700');

                upgradeOptions.forEach(option => {
                    embed.addFields({
                        name: `${option.type.toUpperCase()} - $${option.price}/month`,
                        value: `• ${option.commands_per_hour === -1 ? 'Unlimited' : option.commands_per_hour} commands/hour\n• ${option.features.length} features included`,
                        inline: true
                    });
                });

                embed.setFooter({ text: 'Contact support to upgrade your subscription!' });
                await interaction.editReply({ embeds: [embed] });
            }

            await this.analytics.trackCommand('premium', userId, guildId, Date.now() - startTime);

        } catch (error) {
            await this.analytics.trackCommand('premium', userId, guildId, Date.now() - startTime, false, error.message);
            throw error;
        }
    }

    async handleAdmin(interaction) {
        const startTime = Date.now();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // Check if user is owner
            if (!this.premium.isOwner(userId)) {
                return await interaction.editReply({
                    content: '👑 This command is only available to the bot owner.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'grant-premium') {
                const targetUser = interaction.options.getUser('user');
                const tier = interaction.options.getString('tier');
                const months = interaction.options.getInteger('months') || 1;

                const success = await this.premium.createSubscription(targetUser.id, tier, guildId, months);

                if (success) {
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Premium Granted')
                        .setDescription(`Successfully granted **${tier.toUpperCase()}** premium access to ${targetUser.username}`)
                        .addFields([
                            { name: 'User', value: targetUser.username, inline: true },
                            { name: 'Tier', value: tier.toUpperCase(), inline: true },
                            { name: 'Duration', value: `${months} month${months > 1 ? 's' : ''}`, inline: true }
                        ])
                        .setColor('#00FF00')
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply('❌ Failed to grant premium access. Check logs for details.');
                }

            } else if (subcommand === 'revoke-premium') {
                const targetUser = interaction.options.getUser('user');
                const success = await this.premium.cancelSubscription(targetUser.id, guildId);

                if (success) {
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Premium Revoked')
                        .setDescription(`Successfully revoked premium access from ${targetUser.username}`)
                        .setColor('#FF6B6B')
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply('❌ Failed to revoke premium access. Check logs for details.');
                }

            } else if (subcommand === 'stats') {
                const globalStats = await this.analytics.generateReport();
                
                const embed = new EmbedBuilder()
                    .setTitle('👑 Global Bot Statistics')
                    .setDescription('**Owner-Only Statistics Dashboard**')
                    .addFields({
                        name: '📊 Statistics',
                        value: globalStats || 'No statistics available',
                        inline: false
                    })
                    .setColor('#FF6B35')
                    .setTimestamp()
                    .setFooter({ text: 'Owner Access - Confidential Data' });

                await interaction.editReply({ embeds: [embed] });
            }

            await this.analytics.trackCommand('admin', userId, guildId, Date.now() - startTime);

        } catch (error) {
            await this.analytics.trackCommand('admin', userId, guildId, Date.now() - startTime, false, error.message);
            throw error;
        }
    }
}

module.exports = AdvancedCommands;
