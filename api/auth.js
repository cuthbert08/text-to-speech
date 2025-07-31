// api/auth.js

// Import necessary libraries
const bcrypt = require('bcryptjs'); // For hashing passwords
const jwt = require('jsonwebtoken'); // For generating JSON Web Tokens


const UPSTASH_KV_REST_API_URL = process.env.KV_REST_API_URL;
const UPSTASH_KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET; // Secret key for signing JWTs

// Helper function to interact with Upstash KV
async function kvRequest(method, path, body = null) {
    const headers = {
        'Authorization': `Bearer ${UPSTASH_KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
    };
    const url = `${UPSTASH_KV_REST_API_URL}${path}`;

    const options = {
        method: method,
        headers: headers,
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'KV operation failed');
    }
    return data;
}

// Main handler for API requests
module.exports = async (req, res) => {
    // Ensure it's a POST request for authentication operations
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        if (action === 'register') {
            // --- User Registration Logic ---
            const userKey = `users:${username}`;
            const existingUser = await kvRequest('GET', `/${userKey}`);

            if (existingUser.result) { // Upstash KV returns { result: value } or { result: null }
                return res.status(409).json({ error: 'User already exists.' });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

            // Generate a unique user ID
            const userId = require('crypto').randomUUID(); // Node.js built-in UUID

            // Store user in Upstash KV
            await kvRequest('SET', `/${userKey}`, { userId, hashedPassword });

            return res.status(201).json({ message: 'User registered successfully.', userId });

        } else if (action === 'login') {
            // --- User Login Logic ---
            const userKey = `users:${username}`;
            const userData = await kvRequest('GET', `/${userKey}`);

            if (!userData.result) {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }

            const { userId, hashedPassword } = userData.result;

            // Compare provided password with hashed password
            const isPasswordValid = await bcrypt.compare(password, hashedPassword);

            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }

            // Generate JWT
            // The token payload contains non-sensitive user info (like userId)
            const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' }); // Token expires in 1 hour

            return res.status(200).json({ message: 'Login successful.', token, userId });

        } else {
            return res.status(400).json({ error: 'Invalid action specified. Use "register" or "login".' });
        }
    } catch (error) {
        console.error('Authentication API error:', error);
        return res.status(500).json({ error: 'Internal server error during authentication.', details: error.message });
    }
};
