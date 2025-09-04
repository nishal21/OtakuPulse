// Security middleware and utilities
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

class SecurityManager {
    constructor() {
        this.trustedOrigins = [
            'https://discord.com',
            'https://discordapp.com',
            process.env.FRONTEND_URL || 'http://localhost:3000'
        ];
    }

    // Rate limiting middleware
    createRateLimit(windowMs = 15 * 60 * 1000, max = 100) {
        return rateLimit({
            windowMs,
            max,
            message: {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: Math.ceil(windowMs / 1000)
            },
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => {
                // Skip rate limiting for localhost in development
                return process.env.NODE_ENV === 'development' && 
                       req.ip === '127.0.0.1' || req.ip === '::1';
            }
        });
    }

    // CORS configuration
    getCorsOptions() {
        return cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (like mobile apps or curl requests)
                if (!origin) return callback(null, true);
                
                if (this.trustedOrigins.includes(origin)) {
                    return callback(null, true);
                }
                
                callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        });
    }

    // Helmet security headers
    getHelmetOptions() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:", "https:", "http:"],
                    scriptSrc: ["'self'"],
                    connectSrc: ["'self'", "https://discord.com", "https://discordapp.com"]
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        });
    }

    // Input validation and sanitization
    validateDiscordId(id) {
        const discordIdRegex = /^\d{17,19}$/;
        return discordIdRegex.test(id);
    }

    validateChannelId(id) {
        return this.validateDiscordId(id);
    }

    validateGuildId(id) {
        return this.validateDiscordId(id);
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove potential XSS characters
        return input
            .replace(/[<>\"']/g, '')
            .trim()
            .substring(0, 2000); // Discord message limit
    }

    // Session security
    getSessionOptions() {
        const isProduction = process.env.NODE_ENV === 'production';
        
        return {
            secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
            resave: false,
            saveUninitialized: false,
            name: 'otaku-session',
            cookie: {
                secure: isProduction, // Only secure in production (HTTPS)
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                sameSite: 'lax' // Use 'lax' for better OAuth compatibility
            },
            // Additional production settings
            proxy: isProduction, // Trust proxy in production
            rolling: true // Reset expiration on activity
        };
    }

    // Middleware to check if user is authenticated
    requireAuth(req, res, next) {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                redirectUrl: '/oauth/login'
            });
        }
        next();
    }

    // Middleware to check if user has admin permissions for a guild
    async requireGuildAdmin(req, res, next) {
        const { guildId } = req.params;
        const userId = req.session?.user?.id;

        if (!userId || !guildId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            // Check if user has admin permissions in the guild
            const userGuilds = req.session.guilds || [];
            const guild = userGuilds.find(g => g.id === guildId);
            
            if (!guild) {
                return res.status(403).json({ error: 'Guild not found or access denied' });
            }

            // Check for admin permissions (permission value 8 = ADMINISTRATOR)
            const hasAdminPerms = (parseInt(guild.permissions) & 0x8) === 0x8;
            const isOwner = guild.owner === true;

            if (!hasAdminPerms && !isOwner) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }

            req.guild = guild;
            next();
        } catch (error) {
            res.status(500).json({ error: 'Permission check failed' });
        }
    }
}

module.exports = SecurityManager;
