// Advanced logging and error handling utilities
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, 'logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };
        return JSON.stringify(logEntry, null, 2);
    }

    writeToFile(filename, content) {
        const filePath = path.join(this.logDir, filename);
        fs.appendFileSync(filePath, content + '\n');
    }

    info(message, meta = {}) {
        const logMessage = this.formatMessage('INFO', message, meta);
        console.log(`ℹ️ ${message}`);
        this.writeToFile('app.log', logMessage);
    }

    error(message, error = null, meta = {}) {
        const errorMeta = error ? {
            ...meta,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        } : meta;
        
        const logMessage = this.formatMessage('ERROR', message, errorMeta);
        console.error(`❌ ${message}`, error);
        this.writeToFile('error.log', logMessage);
    }

    warn(message, meta = {}) {
        const logMessage = this.formatMessage('WARN', message, meta);
        console.warn(`⚠️ ${message}`);
        this.writeToFile('app.log', logMessage);
    }

    debug(message, meta = {}) {
        if (process.env.NODE_ENV === 'development') {
            const logMessage = this.formatMessage('DEBUG', message, meta);
            console.debug(`🐛 ${message}`);
            this.writeToFile('debug.log', logMessage);
        }
    }
}

class ErrorHandler {
    constructor(logger) {
        this.logger = logger;
    }

    async handleCommandError(interaction, error, commandName) {
        this.logger.error(`Command error in ${commandName}`, error, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName
        });

        const errorMessage = this.getUserFriendlyError(error);
        
        try {
            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            this.logger.error('Failed to send error message to user', replyError);
        }
    }

    getUserFriendlyError(error) {
        const errorMessages = {
            'NETWORK_ERROR': '🌐 Network connection issue. Please try again in a moment.',
            'API_RATE_LIMIT': '⏳ API rate limit reached. Please wait a moment before trying again.',
            'DATABASE_ERROR': '💾 Database temporarily unavailable. Please try again later.',
            'PERMISSION_ERROR': '🔒 Missing required permissions to perform this action.',
            'VALIDATION_ERROR': '❌ Invalid input provided. Please check your command parameters.',
            'TIMEOUT_ERROR': '⏰ Request timed out. Please try again.',
            'DEFAULT': '⚠️ An unexpected error occurred. Please try again or contact support.'
        };

        // Log the actual error for debugging
        console.error('🐛 Detailed error info:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name
        });

        // Determine error type based on error message/type
        let errorType = 'DEFAULT';
        if (error.code === 'NETWORK_ERROR' || error.message.includes('network')) {
            errorType = 'NETWORK_ERROR';
        } else if (error.message.includes('rate limit')) {
            errorType = 'API_RATE_LIMIT';
        } else if (error.message.includes('database') || error.message.includes('connection')) {
            errorType = 'DATABASE_ERROR';
        } else if (error.message.includes('permission')) {
            errorType = 'PERMISSION_ERROR';
        } else if (error.message.includes('timeout')) {
            errorType = 'TIMEOUT_ERROR';
        }

        // In development, show more detailed errors
        if (process.env.NODE_ENV === 'development') {
            return `${errorMessages[errorType]}\n\n🔧 Debug info: ${error.message}`;
        }

        return errorMessages[errorType];
    }

    handleProcessError(error, type) {
        this.logger.error(`Process ${type}`, error, { type });
        
        if (type === 'uncaughtException') {
            // Graceful shutdown for uncaught exceptions
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        }
    }
}

// Performance monitoring
class PerformanceMonitor {
    constructor(logger) {
        this.logger = logger;
        this.metrics = new Map();
    }

    startTimer(name) {
        this.metrics.set(name, Date.now());
    }

    endTimer(name) {
        const startTime = this.metrics.get(name);
        if (startTime) {
            const duration = Date.now() - startTime;
            this.metrics.delete(name);
            this.logger.debug(`Performance: ${name} took ${duration}ms`);
            return duration;
        }
        return null;
    }

    async measureAsync(name, asyncFunction) {
        this.startTimer(name);
        try {
            const result = await asyncFunction();
            this.endTimer(name);
            return result;
        } catch (error) {
            this.endTimer(name);
            throw error;
        }
    }
}

module.exports = {
    Logger,
    ErrorHandler,
    PerformanceMonitor
};
