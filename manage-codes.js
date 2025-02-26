require('dotenv').config();
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');
const readline = require('readline');

// Set up Upstash client with REST API URL and token from .env
const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Generate a random 8-character code
function generateCode() {
    return crypto.randomBytes(4).toString('hex'); // e.g., "a1b2c3d4"
}

// Add a new code
async function addCode() {
    const code = generateCode();
    await redis.set(`code:${code}`, 'valid', { ex: 86400 }); // Expires in 24 hours
    console.log(`Added new code: ${code}`);
}

// Remove a code
async function removeCode(code) {
    const result = await redis.del(`code:${code}`);
    if (result === 1) {
        console.log(`Removed code: ${code}`);
    } else {
        console.log(`Code not found: ${code}`);
    }
}

// Main menu
function showMenu() {
    console.log('\nWhat do you want to do?');
    console.log('1. Add a new code (like adding a friend)');
    console.log('2. Remove a code (like unfriending someone)');
    console.log('3. Exit');
    rl.question('Enter your choice (1-3): ', async (choice) => {
        switch (choice) {
            case '1':
                await addCode();
                showMenu();
                break;
            case '2':
                rl.question('Enter the code to remove: ', async (code) => {
                    await removeCode(code);
                    showMenu();
                });
                break;
            case '3':
                console.log('Goodbye!');
                rl.close(); // Just close readline, no redis.quit()
                break;
            default:
                console.log('Invalid choice. Try again.');
                showMenu();
        }
    });
}

// Start the script
console.log('Welcome to your code manager!');
showMenu();