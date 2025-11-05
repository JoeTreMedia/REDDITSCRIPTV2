require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const readline = require('readline');

// Set up Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

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
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expires in 24 hours

    const { data, error } = await supabase
        .from('access_codes')
        .insert([{
            code: code,
            expires_at: expiresAt.toISOString()
        }]);

    if (error) {
        console.error(`Error adding code: ${error.message}`);
    } else {
        console.log(`Added new code: ${code}`);
    }
}

// Remove a code
async function removeCode(code) {
    const { data, error } = await supabase
        .from('access_codes')
        .delete()
        .eq('code', code);

    if (error) {
        console.error(`Error removing code: ${error.message}`);
    } else {
        console.log(`Removed code: ${code}`);
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