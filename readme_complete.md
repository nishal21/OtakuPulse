# 🎌 OtakuPulse Discord Bot

**OtakuPulse** is a comprehensive Discord bot that brings the anime community together with real-time updates, quotes, and interactive features. Built with Discord.js and powered by multiple anime APIs.

## ✨ Features

- **📺 Real-time Anime Updates**: Get notifications about currently airing anime
- **🎬 Latest Trailers**: Access the newest anime trailers and promotional videos
- **🎌 Daily Anime Quotes**: Inspirational quotes from your favorite anime characters
- **💫 Motivational Quotes**: Daily inspirational quotes to keep your community motivated
- **🏆 Top Anime Rankings**: Weekly updates on top-rated anime
- **🔍 Anime Search**: Comprehensive anime search functionality
- **⚙️ Customizable Settings**: Configure notifications and preferences per server
- **📱 Web Dashboard**: Easy-to-use web interface for bot management
- **🔐 OAuth2 Authentication**: Secure login system via Discord

## 🚀 APIs Used

- **[Jikan API](https://jikan.moe/)**: Unofficial MyAnimeList REST API for anime data
- **[Animechan API](https://animechan.vercel.app/)**: Curated anime quotes database
- **[API Ninjas](https://api.api-ninjas.com/)**: Inspirational quotes (optional)

## 📋 Prerequisites

- Node.js (v16.0.0 or higher)
- Discord Application (Bot Token)
- Basic knowledge of Discord bot setup

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/otakupulse-bot.git
cd otakupulse-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token
5. In "OAuth2" section, add redirect URI: `http://localhost:3000/oauth/callback`
6. Note down your Client ID and Client Secret

### 4. Environment Configuration

Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_client_id
CLIENT_SECRET=your_discord_application_client_secret

# OAuth2 Configuration
REDIRECT_URI=http://localhost:3000/oauth/callback
SESSION_SECRET=your_random_secret_key_here

# API Keys (Optional)
API_NINJAS_KEY=your_api_ninjas_key_for_quotes

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 5. Get API Keys (Optional)

- **API Ninjas**: Sign up at [API Ninjas](https://api.api-ninjas.com/) for enhanced quote features
- The bot works without API keys using fallback data

### 6. Bot Permissions

When inviting the bot to your server, ensure these permissions:
- `Send Messages`
- `Use Slash Commands`
- `Embed Links`
- `Read Message History`
- `Connect`

## 🎯 Usage

### 1. Start the Bot

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### 2. Invite Bot to Server

Use this URL (replace CLIENT_ID with your actual client ID):
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2048&scope=bot%20applications.commands
```

### 3. Configure in Discord

Run `/setup` command in your Discord server to configure the bot.

### 4. Access Web Dashboard

Visit `http://localhost:3000` to access the web dashboard.

## 📖 Commands

| Command | Description | Usage |
|---------|-------------|--------|
| `/setup` | Configure bot for your server | `/setup #channel` |
| `/anime-quote` | Get random anime quote | `/anime-quote [anime_name]` |
| `/quote` | Get inspirational quote | `/quote` |
| `/airing` | Show currently airing anime | `/airing` |
| `/top-anime` | Show top-rated anime | `/top-anime` |
| `/search` | Search for anime | `/search attack on titan` |
| `/trailer` | Get anime trailer | `/trailer demon slayer` |
| `/settings` | View server settings | `/settings` |
| `/help` | Show all commands | `/help` |

## 🔧 Advanced Configuration

### Scheduled Tasks

The bot automatically runs these scheduled tasks:

- **Daily Quotes**: 9:00 AM daily
- **Episode Checks**: Every 6 hours
- **Weekly Top Anime**: Sundays at 10:00 AM

### Customization

You can modify the scheduled tasks in the `startScheduledTasks()` function:

```javascript
// Daily quotes at 9 AM
cron.schedule('0 9 * * *', async () => {
    await sendDailyQuotes();
});
```

### Database Integration

For production use, consider integrating with a database:

```javascript
// Example with MongoDB
const mongoose = require('mongoose');

const GuildSchema = new mongoose.Schema({
    guildId: String,
    notificationChannel: String,
    dailyQuotes: Boolean,
    airingAlerts: Boolean,
    trailerNotifications: Boolean
});
```

## 🌐 Deployment

### Heroku Deployment

1. Create a Heroku app
2. Set environment variables in Heroku dashboard
3. Connect GitHub repository
4. Deploy

### Railway Deployment

1. Connect GitHub repository to Railway
2. Set environment variables
3. Deploy automatically

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit `.env` files
2. **Token Security**: Keep bot tokens secret
3. **Rate Limiting**: Implement rate limiting for production
4. **Input Validation**: Validate all user inputs
5. **Error Handling**: Implement comprehensive error handling

## 🛡️ Error Handling

The bot includes comprehensive error handling:

```javascript
// Global error handlers
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});
```

## 📊 Monitoring

### Logging

The bot logs important events:
- Command executions
- API calls
- Error occurrences
- Scheduled task runs

### Health Checks

Implement health check endpoints:

```javascript
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines

- Follow ES6+ standards
- Use meaningful variable names
- Add comments for complex logic
- Test all features before submitting
- Update documentation as needed

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Common Issues

**Bot not responding to commands:**
- Check bot permissions
- Verify token is correct
- Ensure bot is online

**API errors:**
- Check API rate limits
- Verify API endpoints are accessible
- Check network connectivity

**OAuth errors:**
- Verify redirect URI matches exactly
- Check client ID and secret
- Ensure proper scopes are set

### Getting Help

- Open an issue on GitHub
- Check existing documentation
- Review Discord.js documentation
- Join Discord support servers

## 🎉 Acknowledgments

- [Discord.js](https://discord.js.org/) - Discord API library
- [Jikan API](https://jikan.moe/) - Anime data provider
- [Animechan](https://animechan.vercel.app/) - Anime quotes API
- [API Ninjas](https://api.api-ninjas.com/) - Quotes API

## 📈 Roadmap

- [ ] Database integration
- [ ] User favorite anime tracking
- [ ] Advanced notification settings
- [ ] Anime recommendation system
- [ ] Multi-language support
- [ ] Mobile app companion
- [ ] Premium features
- [ ] Analytics dashboard

---

**OtakuPulse** - Bringing anime communities together, one quote at a time! 🎌

*Made with ❤️ by anime enthusiasts, for anime enthusiasts.*