// AI-powered features for enhanced user experience
const axios = require('axios');

class AIFeatures {
    constructor(logger) {
        this.logger = logger;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.enabled = !!this.openaiApiKey && process.env.ENABLE_AI_FEATURES === 'true';
    }

    // AI-powered anime recommendations
    async getAnimeRecommendations(userPreferences, watchedAnime = []) {
        if (!this.enabled) {
            return this.getFallbackRecommendations();
        }

        try {
            const prompt = this.buildRecommendationPrompt(userPreferences, watchedAnime);
            const response = await this.callOpenAI(prompt);
            return this.parseRecommendations(response);
        } catch (error) {
            this.logger.error('AI recommendation error', error);
            return this.getFallbackRecommendations();
        }
    }

    // AI-powered character analysis
    async getCharacterAnalysis(characterName, animeName) {
        if (!this.enabled) {
            return this.getFallbackCharacterAnalysis(characterName, animeName);
        }

        try {
            const prompt = `Provide a detailed character analysis of ${characterName} from ${animeName}. Include:
1. Personality traits
2. Character development
3. Role in the story
4. Notable quotes or moments
5. Why fans love this character

Keep it under 500 words and engaging.`;

            const response = await this.callOpenAI(prompt);
            return {
                character: characterName,
                anime: animeName,
                analysis: response,
                type: 'ai_generated'
            };
        } catch (error) {
            this.logger.error('AI character analysis error', error);
            return this.getFallbackCharacterAnalysis(characterName, animeName);
        }
    }

    // AI-powered quote generation
    async generateInspirationalQuote(theme = 'general') {
        if (!this.enabled) {
            return this.getFallbackQuote();
        }

        try {
            const prompt = `Generate an inspirational quote in the style of popular anime characters about ${theme}. 
The quote should be:
- Motivational and uplifting
- Sound like it could be from an anime
- Be original but feel authentic
- Include the fictional character name and anime title

Format: "Quote" - Character Name (Anime Title)`;

            const response = await this.callOpenAI(prompt);
            return this.parseGeneratedQuote(response);
        } catch (error) {
            this.logger.error('AI quote generation error', error);
            return this.getFallbackQuote();
        }
    }

    // AI-powered anime trivia
    async generateTrivia(difficulty = 'medium', category = 'general') {
        if (!this.enabled) {
            return this.getFallbackTrivia();
        }

        try {
            const prompt = `Create an anime trivia question with ${difficulty} difficulty about ${category}.
Include:
1. The question
2. 4 multiple choice options (A, B, C, D)
3. The correct answer
4. A fun fact about the answer

Format as JSON with: question, options, correctAnswer, funFact`;

            const response = await this.callOpenAI(prompt);
            return JSON.parse(response);
        } catch (error) {
            this.logger.error('AI trivia generation error', error);
            return this.getFallbackTrivia();
        }
    }

    // Smart anime search with context understanding
    async smartSearch(query, context = {}) {
        if (!this.enabled) {
            return { enhancedQuery: query, suggestions: [] };
        }

        try {
            const prompt = `User is searching for anime with query: "${query}"
Context: ${JSON.stringify(context)}

Help improve their search by:
1. Suggesting alternative search terms
2. Identifying if they might be looking for a specific genre, year, or studio
3. Correcting potential misspellings

Return JSON with: enhancedQuery, suggestions, searchTips`;

            const response = await this.callOpenAI(prompt);
            return JSON.parse(response);
        } catch (error) {
            this.logger.error('AI smart search error', error);
            return { enhancedQuery: query, suggestions: [] };
        }
    }

    async callOpenAI(prompt, maxTokens = 500) {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are an anime expert AI assistant helping Discord users with anime-related content.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: maxTokens,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${this.openaiApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    }

    buildRecommendationPrompt(preferences, watchedAnime) {
        return `Based on user preferences: ${JSON.stringify(preferences)}
Anime they've already watched: ${watchedAnime.join(', ')}

Recommend 5 anime they might enjoy. For each recommendation include:
- Title
- Brief description
- Why it matches their preferences
- Rating/popularity

Format as JSON array.`;
    }

    parseRecommendations(response) {
        try {
            return JSON.parse(response);
        } catch {
            // Fallback parsing
            return this.getFallbackRecommendations();
        }
    }

    parseGeneratedQuote(response) {
        const match = response.match(/"([^"]+)"\s*-\s*([^(]+)\s*\(([^)]+)\)/);
        if (match) {
            return {
                quote: match[1],
                character: match[2].trim(),
                anime: match[3].trim(),
                type: 'ai_generated'
            };
        }
        return this.getFallbackQuote();
    }

    getFallbackRecommendations() {
        return [
            {
                title: "Demon Slayer",
                description: "A young boy becomes a demon slayer to save his sister",
                reason: "Popular action anime with great animation",
                rating: "9.0/10"
            },
            {
                title: "Your Name",
                description: "A beautiful story about body swapping and fate",
                reason: "Critically acclaimed anime movie",
                rating: "8.9/10"
            }
        ];
    }

    getFallbackCharacterAnalysis(character, anime) {
        return {
            character,
            anime,
            analysis: `${character} is a memorable character from ${anime} known for their unique personality and important role in the story. This character has captured the hearts of many fans through their development and memorable moments.`,
            type: 'fallback'
        };
    }

    getFallbackQuote() {
        const quotes = [
            { quote: "The only way to truly escape the mundane is to constantly seek what is beyond it.", character: "AI Assistant", anime: "Digital Realm", type: 'ai_generated' },
            { quote: "Every ending is just a new beginning in disguise.", character: "AI Assistant", anime: "Digital Realm", type: 'ai_generated' }
        ];
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    getFallbackTrivia() {
        return {
            question: "Which anime features a protagonist who can defeat any enemy with one punch?",
            options: ["A) Naruto", "B) One Piece", "C) One Punch Man", "D) Dragon Ball"],
            correctAnswer: "C",
            funFact: "One Punch Man was originally created as a webcomic by ONE as a hobby!"
        };
    }
}

module.exports = AIFeatures;
