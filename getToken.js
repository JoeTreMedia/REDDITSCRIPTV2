const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

// Load client secrets from your JSON file
const CREDENTIALS_PATH = '/Users/alontreitel/backend/client_secret.json'; // Update if path differs

async function getToken() {
    // Read the client secret file
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).web;

    const { client_secret, client_id, redirect_uris } = credentials;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Generate an auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.force-ssl']
    });
    console.log('Authorize this app by visiting this URL:', authUrl);

    // Get the authorization code from user input
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const code = await new Promise(resolve => {
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            resolve(code);
        });
    });

    // Exchange code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    console.log('Access Token:', tokens.access_token);
}

getToken().catch(err => console.error('Error:', err));