// Premium features and subscription management
const { pool } = require('../db');

class PremiumManager {
    constructor(logger) {
        this.logger = logger;
        this.enabled = process.env.ENABLE_PREMIUM_FEATURES === 'true';
        this.initTables();
    }

    async initTables() {
        if (!this.enabled) return;

        try {
            // Premium subscriptions table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS premium_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(32) NOT NULL,
                    guild_id VARCHAR(32),
                    subscription_type VARCHAR(20) NOT NULL, -- 'basic', 'premium', 'ultimate'
                    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_date TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'active', -- 'active', 'expired', 'cancelled'
                    features TEXT[],
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, guild_id)
                );
            `);

            // Usage tracking for premium features
            await pool.query(`
                CREATE TABLE IF NOT EXISTS premium_usage (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(32) NOT NULL,
                    guild_id VARCHAR(32),
                    feature_name VARCHAR(50) NOT NULL,
                    usage_count INTEGER DEFAULT 1,
                    reset_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 month'),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, guild_id, feature_name)
                );
            `);

            this.logger.info('Premium tables initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize premium tables', error);
        }
    }

    // Feature definitions
    getFeatureDefinitions() {
        return {
            free: {
                commands_per_hour: 20,
                daily_quotes: true,
                basic_search: true,
                airing_notifications: true,
                features: ['quotes', 'search', 'airing', 'manga']
            },
            basic: {
                commands_per_hour: 100,
                daily_quotes: true,
                advanced_search: true,
                airing_notifications: true,
                custom_notifications: true,
                ai_recommendations: true,
                features: ['quotes', 'search', 'airing', 'manga', 'recommendations', 'custom_alerts']
            },
            premium: {
                commands_per_hour: 500,
                daily_quotes: true,
                advanced_search: true,
                airing_notifications: true,
                custom_notifications: true,
                ai_recommendations: true,
                character_analysis: true,
                custom_commands: true,
                priority_support: true,
                analytics: true,
                features: ['quotes', 'search', 'airing', 'manga', 'recommendations', 'custom_alerts', 'ai_analysis', 'analytics']
            },
            ultimate: {
                commands_per_hour: -1, // Unlimited
                daily_quotes: true,
                advanced_search: true,
                airing_notifications: true,
                custom_notifications: true,
                ai_recommendations: true,
                character_analysis: true,
                custom_commands: true,
                priority_support: true,
                analytics: true,
                custom_webhooks: true,
                api_access: true,
                white_label: true,
                features: ['quotes', 'search', 'airing', 'manga', 'recommendations', 'custom_alerts', 'ai_analysis', 'analytics', 'webhooks', 'api']
            }
        };
    }

    async getUserSubscription(userId, guildId = null) {
        // Check if user is the bot owner - give unlimited access
        if (this.isOwner(userId)) {
            return { 
                type: 'owner', 
                ...this.getOwnerFeatures(),
                subscription: {
                    subscription_type: 'owner',
                    status: 'active',
                    end_date: '2099-12-31T23:59:59.000Z'
                }
            };
        }

        if (!this.enabled) {
            return { type: 'free', ...this.getFeatureDefinitions().free };
        }

        try {
            const { rows } = await pool.query(`
                SELECT * FROM premium_subscriptions 
                WHERE user_id = $1 AND (guild_id = $2 OR guild_id IS NULL)
                AND status = 'active' AND end_date > CURRENT_TIMESTAMP
                ORDER BY end_date DESC
                LIMIT 1
            `, [userId, guildId]);

            const subscription = rows[0];
            if (!subscription) {
                return { type: 'free', ...this.getFeatureDefinitions().free };
            }

            const features = this.getFeatureDefinitions()[subscription.subscription_type];
            return {
                type: subscription.subscription_type,
                ...features,
                subscription
            };
        } catch (error) {
            this.logger.error('Failed to get user subscription', error);
            return { type: 'free', ...this.getFeatureDefinitions().free };
        }
    }

    isOwner(userId) {
        const ownerIds = [
            process.env.BOT_OWNER_ID,
            '1234567890123456789' // Fallback owner ID if env not set
        ].filter(Boolean);
        
        return ownerIds.includes(userId);
    }

    getOwnerFeatures() {
        return {
            commands_per_hour: -1, // Unlimited
            daily_quotes: true,
            advanced_search: true,
            airing_notifications: true,
            custom_notifications: true,
            ai_recommendations: true,
            character_analysis: true,
            custom_commands: true,
            priority_support: true,
            analytics: true,
            custom_webhooks: true,
            api_access: true,
            white_label: true,
            admin_access: true,
            unlimited_everything: true,
            features: ['quotes', 'search', 'airing', 'manga', 'recommendations', 'custom_alerts', 'ai_analysis', 'analytics', 'webhooks', 'api', 'admin', 'owner']
        };
    }

    async checkFeatureAccess(userId, featureName, guildId = null) {
        // Owner always has access to everything
        if (this.isOwner(userId)) {
            return true;
        }
        
        const subscription = await this.getUserSubscription(userId, guildId);
        return subscription.features.includes(featureName);
    }

    async checkRateLimit(userId, guildId = null) {
        // Owner has unlimited access
        if (this.isOwner(userId)) {
            return { 
                allowed: true, 
                remaining: -1, 
                limit: -1, 
                resetTime: null,
                ownerOverride: true 
            };
        }
        
        const subscription = await this.getUserSubscription(userId, guildId);
        
        if (subscription.commands_per_hour === -1) {
            return { allowed: true, remaining: -1 };
        }

        try {
            // Check usage in the last hour
            const { rows } = await pool.query(`
                SELECT COUNT(*) as usage_count
                FROM command_usage
                WHERE user_id = $1 AND used_at > NOW() - INTERVAL '1 hour'
            `, [userId]);

            const currentUsage = parseInt(rows[0]?.usage_count || 0);
            const remaining = subscription.commands_per_hour - currentUsage;

            return {
                allowed: remaining > 0,
                remaining: Math.max(0, remaining),
                limit: subscription.commands_per_hour,
                resetTime: new Date(Date.now() + 3600000) // 1 hour from now
            };
        } catch (error) {
            this.logger.error('Failed to check rate limit', error);
            return { allowed: true, remaining: 10 }; // Fallback
        }
    }

    async trackFeatureUsage(userId, featureName, guildId = null) {
        if (!this.enabled) return;

        try {
            await pool.query(`
                INSERT INTO premium_usage (user_id, guild_id, feature_name, usage_count)
                VALUES ($1, $2, $3, 1)
                ON CONFLICT (user_id, guild_id, feature_name) DO UPDATE SET
                    usage_count = premium_usage.usage_count + 1
            `, [userId, guildId, featureName]);
        } catch (error) {
            this.logger.error('Failed to track feature usage', error);
        }
    }

    async createSubscription(userId, subscriptionType, guildId = null, durationMonths = 1) {
        if (!this.enabled) return false;

        try {
            const features = this.getFeatureDefinitions()[subscriptionType]?.features || [];
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + durationMonths);

            await pool.query(`
                INSERT INTO premium_subscriptions (user_id, guild_id, subscription_type, end_date, features)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id, guild_id) DO UPDATE SET
                    subscription_type = EXCLUDED.subscription_type,
                    end_date = EXCLUDED.end_date,
                    features = EXCLUDED.features,
                    status = 'active'
            `, [userId, guildId, subscriptionType, endDate, features]);

            this.logger.info(`Created ${subscriptionType} subscription for user ${userId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to create subscription', error);
            return false;
        }
    }

    async cancelSubscription(userId, guildId = null) {
        if (!this.enabled) return false;

        try {
            await pool.query(`
                UPDATE premium_subscriptions 
                SET status = 'cancelled'
                WHERE user_id = $1 AND (guild_id = $2 OR guild_id IS NULL)
            `, [userId, guildId]);

            return true;
        } catch (error) {
            this.logger.error('Failed to cancel subscription', error);
            return false;
        }
    }

    generatePremiumEmbed(userSubscription) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('💎 Premium Features')
            .setColor('#FFD700');

        // Special handling for owner
        if (userSubscription.type === 'owner') {
            embed.setTitle('👑 Owner Access - Unlimited Everything!')
                .setDescription('**You have OWNER ACCESS with unlimited features!**')
                .addFields([
                    {
                        name: '🔥 Owner Benefits',
                        value: '• ♾️ Unlimited commands\n• 🤖 All AI features unlocked\n• 📊 Full analytics access\n• 🛠️ Admin commands\n• 🚀 Priority everything\n• 💎 All premium features',
                        inline: false
                    },
                    {
                        name: '👑 Special Status',
                        value: `**Type:** Bot Owner\n**Access Level:** Maximum\n**Expires:** Never\n**Status:** Permanent`,
                        inline: true
                    }
                ])
                .setFooter({ text: 'Thanks for being the awesome bot owner! 🎌' })
                .setColor('#FF6B35'); // Special orange color for owner
            return embed;
        }

        if (userSubscription.type === 'free') {
            embed.setDescription('Upgrade to unlock premium features!')
                .addFields([
                    {
                        name: '🆓 Free Plan (Current)',
                        value: `• ${userSubscription.commands_per_hour} commands/hour\n• Basic search & quotes\n• Airing notifications`,
                        inline: false
                    },
                    {
                        name: '⭐ Basic Plan - $2.99/month',
                        value: '• 100 commands/hour\n• AI recommendations\n• Custom notifications\n• Advanced search',
                        inline: true
                    },
                    {
                        name: '💎 Premium Plan - $4.99/month',
                        value: '• 500 commands/hour\n• Character analysis\n• Custom commands\n• Analytics dashboard\n• Priority support',
                        inline: true
                    },
                    {
                        name: '🚀 Ultimate Plan - $9.99/month',
                        value: '• Unlimited commands\n• API access\n• Custom webhooks\n• White-label options\n• All features included',
                        inline: true
                    }
                ])
                .setFooter({ text: 'Use /premium upgrade to get started!' });
        } else {
            const sub = userSubscription.subscription;
            embed.setDescription(`You have **${userSubscription.type.toUpperCase()}** plan access!`)
                .addFields([
                    {
                        name: '✅ Your Features',
                        value: userSubscription.features.map(f => `• ${f}`).join('\n'),
                        inline: false
                    },
                    {
                        name: '📅 Subscription Info',
                        value: `**Type:** ${userSubscription.type}\n**Expires:** ${new Date(sub.end_date).toLocaleDateString()}\n**Status:** ${sub.status}`,
                        inline: true
                    }
                ]);
        }

        return embed;
    }

    async getUpgradeOptions(currentType = 'free') {
        const plans = this.getFeatureDefinitions();
        const planOrder = ['free', 'basic', 'premium', 'ultimate'];
        const currentIndex = planOrder.indexOf(currentType);
        
        return planOrder.slice(currentIndex + 1).map(type => ({
            type,
            ...plans[type],
            price: this.getPlanPrice(type)
        }));
    }

    getPlanPrice(type) {
        const prices = {
            basic: 2.99,
            premium: 4.99,
            ultimate: 9.99
        };
        return prices[type] || 0;
    }
}

module.exports = PremiumManager;
