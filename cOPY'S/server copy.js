require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const Papa = require('papaparse');
const { kv } = require('@vercel/kv');
// Add YouTube transcript library
const youtubeCaptionsScraper = require('youtube-captions-scraper');

const app = express();

// Add basic request logging
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        url: req.url
    });
    next();
});

// JSON body parser with explicit error handling
app.use((req, res, next) => {
    if (req.method === 'POST' && req.headers['content-type'] === 'application/json') {
        let body = [];
        req.on('data', chunk => {
            body.push(chunk);
        }).on('end', () => {
            body = Buffer.concat(body).toString('utf8');
            // Handle empty body case
            if (body.trim() === '') {
                req.body = {};
                next();
            } else {
                try {
                    req.body = JSON.parse(body);
                    next();
                } catch (error) {
                    console.error('Error parsing buffer:', error.message);
                    res.status(400).json({ error: 'Invalid JSON body' });
                }
            }
        }).on('error', (err) => {
            console.error('Stream error:', err.message);
            res.status(500).json({ error: 'Stream error' });
        });
    } else {
        next();
    }
});

app.use(cors());
app.use(express.static(path.join(__dirname), {
    maxAge: '1h'
}));

// Project data cache with default empty values
const projectData = {
    guidelines: '',
    writingStyle: '',
    database: [],
    lastLoaded: 0
};

// Cache duration - 1 hour
const CACHE_DURATION = 3600000;

// Get random items from an array
function getRandomItems(array, count) {
    if (!array || !Array.isArray(array) || array.length === 0) {
        return [];
    }
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
}

// Get random section of text
function getRandomTextSegment(text, length) {
    if (!text || typeof text !== 'string' || text.length <= length) {
        return text || '';
    }

    const maxStart = text.length - length;
    const start = Math.floor(Math.random() * maxStart);
    const breakpoints = ['.', '!', '?', '\n'];
    let adjustedStart = start;

    for (let i = start; i < start + 100 && i < text.length; i++) {
        if (breakpoints.includes(text[i])) {
            adjustedStart = i + 1;
            break;
        }
    }

    return text.slice(adjustedStart, adjustedStart + length);
}

// Streamlined file loading
async function loadProjectFiles(forceReload = false) {
    const now = Date.now();

    if (!forceReload && projectData.lastLoaded > 0 && (now - projectData.lastLoaded) < CACHE_DURATION) {
        console.log('Using cached project data');
        return projectData;
    }

    console.log('Loading project files');

    try {
        projectData.guidelines = await fs.readFile(path.join(process.cwd(), 'projectGuidelines'), 'utf8')
            .catch(() => 'Write a script based on the user input.');

        console.log('Loaded project guidelines:',
            projectData.guidelines ? `${projectData.guidelines.length} characters` : 'Default fallback');

        projectData.lastLoaded = now;

        await Promise.allSettled([
            fs.readFile(path.join(process.cwd(), 'scripts_5million_basic_punctuated'), 'utf8')
                .then(data => {
                    projectData.writingStyle = data;
                })
                .catch(() => {
                    projectData.writingStyle = 'Default style: casual and conversational.';
                }),

            fs.readFile(path.join(process.cwd(), 'Database.csv'), 'utf8')
                .then(csvData => {
                    Papa.parse(csvData, {
                        header: true,
                        skipEmptyLines: true,
                        complete: results => {
                            if (results.data && results.data.length > 0) {
                                projectData.database = results.data;
                            }
                        }
                    });
                })
                .catch(() => {
                    projectData.database = [{ script: 'Sample script', views: '1000', script_length: '1200' }];
                })
        ]).catch(err => console.error('Error loading additional files:', err.message));

        return projectData;
    } catch (error) {
        console.error('Error loading project files:', error.message);

        if (projectData.lastLoaded === 0) {
            projectData.guidelines = 'Write a script based on the user input.';
            projectData.writingStyle = 'Default style: casual and conversational.';
            projectData.database = [{ script: 'Sample script', views: '1000', script_length: '1200' }];
            projectData.lastLoaded = now;
        }

        return projectData;
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'online_viewer_net.html'));
});

// Restored original Vercel KV access code validation
app.post('/api/validate-code', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Access code is required' });
    }

    try {
        const isCodeValid = await kv.get(`code:${code}`);

        if (isCodeValid === null) {
            return res.status(401).json({ error: 'Invalid or expired access code' });
        }

        await kv.del(`code:${code}`);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error validating code:', error.message);
        return res.status(500).json({ error: 'Server error during code validation' });
    }
});

// New YouTube transcript API using dedicated library
app.post('/api/youtube-transcript', async (req, res) => {
    const { url, additionalContent } = req.body;

    console.log('YouTube transcript request:', { url, additionalContent });

    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        console.error('Invalid URL provided:', url);
        return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
    }

    try {
        const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^/]+\/|(?:v|e(?:mbed)?)|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
            console.error('Failed to extract video ID from URL:', url);
            return res.status(400).json({ error: 'Could not extract video ID from URL' });
        }

        console.log(`Fetching transcript for video ID: ${videoId}`);

        const transcriptItems = await youtubeCaptionsScraper.getSubtitles({
            videoID: videoId,
            lang: 'en'
        });
        
        if (!transcriptItems || transcriptItems.length === 0) {
            console.error('No transcript found for video ID:', videoId);
            return res.status(404).json({ error: `No transcripts available for this video: ${videoId}` });
        }

        const transcript = transcriptItems
            .map(item => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .replace(/♪/g, '')
            .trim();

        console.log(`Processed transcript length: ${transcript.length}, first 100 chars:`, transcript.substring(0, 100));
        return res.status(200).json({ transcript });
    } catch (error) {
        console.error('Error fetching YouTube transcript:', error.message, error.stack);
        return res.status(500).json({
            error: 'Failed to fetch transcript',
            details: error.message
        });
    }
});

// New endpoint to save a script directly
app.post('/api/save-script', async (req, res) => {
    const { scriptContent, timestamp } = req.body;

    if (!scriptContent) {
        return res.status(400).json({ error: 'Script content is required' });
    }

    try {
        // Extract script content from between markers if needed
        let content = scriptContent;
        const scriptMatch = scriptContent.match(/=== SCRIPT START ===\n([\s\S]*?)\n=== SCRIPT END ===/);
        if (scriptMatch && scriptMatch[1]) {
            content = scriptMatch[1].trim();
        }

        let savedScripts = await kv.get('saved_scripts');
        if (!savedScripts || !Array.isArray(savedScripts)) {
            savedScripts = [];
        }
        
        savedScripts.push({
            content: content,
            timestamp: timestamp || new Date().toISOString()
        });
        
        await kv.set('saved_scripts', savedScripts);
        
        return res.status(200).json({
            success: true,
            message: 'Script saved successfully!'
        });
    } catch (error) {
        console.error('Error saving script:', error.message);
        return res.status(500).json({ error: 'Failed to save script' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message, apiKey, chatHistory, isRetry } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
        return res.status(401).json({
            error: 'Invalid API key format',
            details: 'API key must start with "sk-ant-"'
        });
    }

    await loadProjectFiles();

    try {
        const writingStyleSample = getRandomTextSegment(projectData.writingStyle, 1500);
        const databaseSamples = getRandomItems(projectData.database, 3);

        const systemPrompt = `${projectData.guidelines}

        WRITING STYLE SAMPLE:
        ${writingStyleSample}
        
        DATABASE SAMPLES:
        ${JSON.stringify(databaseSamples, null, 2)}`;

        let messages = [];

        if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
            const recentHistory = chatHistory.slice(-3);
            recentHistory.forEach(msg => {
                if ((msg.role === 'user' || msg.role === 'assistant') && msg.content) {
                    messages.push({
                        role: msg.role,
                        content: msg.content
                    });
                } else if ((msg.type === 'user' || msg.type === 'ai') && msg.content) {
                    messages.push({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    });
                }
            });
        }

        messages.push({ role: 'user', content: message });

        const API_TIMEOUT = 15000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
            console.log(`Sending request to Claude API${isRetry ? ' (retry)' : ''}`);

            const response = await axios.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 3000,
                temperature: 0.7,
                system: systemPrompt,
                messages: messages
            }, {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                signal: controller.signal,
                timeout: API_TIMEOUT
            });

            clearTimeout(timeoutId);

            let aiResponse = '';
            if (response.data && response.data.content && response.data.content.length > 0) {
                aiResponse = response.data.content[0].text || '';
            }

            return res.status(200).json({
                response: aiResponse,
                chatHistory: [...messages, { role: 'assistant', content: aiResponse }]
            });
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    } catch (error) {
        console.error('Error calling Claude API:', error.message);

        const statusCode = error.response?.status || 500;
        const errorDetails = error.response?.data?.error?.message || error.message;

        if (error.code === 'ECONNABORTED' || error.name === 'AbortError') {
            return res.status(504).json({
                error: 'Request timed out',
                details: 'The request took too long',
                retryable: true
            });
        }

        return res.status(statusCode).json({
            error: 'Failed to get response from Claude',
            details: errorDetails,
            retryable: statusCode === 429 || statusCode >= 500
        });
    }
});

// Endpoint to get saved scripts
app.get('/api/saved-scripts', async (req, res) => {
    try {
        const savedScripts = await kv.get('saved_scripts') || [];
        return res.status(200).json({ scripts: savedScripts });
    } catch (error) {
        console.error('Error fetching saved scripts:', error.message);
        return res.status(500).json({ error: 'Failed to fetch saved scripts' });
    }
});

// Endpoint to clear saved scripts
app.post('/api/clear-saved-scripts', async (req, res) => {
    try {
        // Initialize with empty array instead of setting null
        const result = await kv.set('saved_scripts', []);
        console.log('Clear saved scripts result:', result);
        
        // Verify the scripts were cleared
        const verifyEmpty = await kv.get('saved_scripts');
        console.log('Verification after clearing:', verifyEmpty);
        
        return res.status(200).json({ 
            success: true,
            message: 'All scripts cleared successfully' 
        });
    } catch (error) {
        console.error('Error clearing saved scripts:', error.message, error.stack);
        return res.status(500).json({ error: 'Failed to clear saved scripts' });
    }
});

// Endpoint to delete a specific saved script
app.post('/api/delete-saved-script', async (req, res) => {
    const { timestamp } = req.body;
    
    if (!timestamp) {
        return res.status(400).json({ error: 'Timestamp is required to identify the script' });
    }
    
    try {
        let savedScripts = await kv.get('saved_scripts');
        if (!savedScripts || !Array.isArray(savedScripts)) {
            return res.status(404).json({ error: 'No saved scripts found' });
        }
        
        const initialLength = savedScripts.length;
        savedScripts = savedScripts.filter(script => script.timestamp !== timestamp);
        
        if (savedScripts.length === initialLength) {
            return res.status(404).json({ error: 'Script with specified timestamp not found' });
        }
        
        await kv.set('saved_scripts', savedScripts);
        
        return res.status(200).json({ 
            success: true,
            message: 'Script deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting script:', error.message);
        return res.status(500).json({ error: 'Failed to delete script' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    return res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        filesLoaded: projectData.lastLoaded > 0
    });
});

// Initialize with a small delay
setTimeout(() => {
    loadProjectFiles(true).catch(err => {
        console.error('Error during initialization:', err.message);
    });
}, 1000);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

server.timeout = 60000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Promise Rejection:', reason);
});

module.exports = app;