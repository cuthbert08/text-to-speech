/**
 * Vercel Serverless Function: api/analyze-text.js
 * * This function is a secure backend endpoint for interacting with the Gemini Language Model.
 * It receives a text prompt from the frontend (e.g., for summarization or explanation),
 * securely calls the Google Gemini API, and returns the model's text response.
 * * Security:
 * - The Google API Key is read from a secure environment variable on the server.
 * - It is never exposed to the user's browser.
 * * Enhancements:
 * - Added detailed logging for better debugging in the Vercel dashboard.
 * - Added more specific error handling for Gemini API responses.
 */
import dotenv from 'dotenv';
dotenv.config();

export default async function handler(request, response) {
    // Set CORS headers to allow requests from any origin.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS requests for CORS.
    if (request.method === 'OPTIONS') {
        console.log("Handling OPTIONS preflight request for analyze-text.");
        return response.status(200).end();
    }

    // Only allow POST requests.
    if (request.method !== 'POST') {
        console.warn(`Method Not Allowed: Received a ${request.method} request.`);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    console.log("--- [api/analyze-text] Function Invoked ---");

    try {
        // --- 1. Securely Retrieve the API Key ---
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.error("FATAL: GOOGLE_API_KEY environment variable not set.");
            return response.status(500).json({ error: 'API key is not configured on the server.' });
        }
        console.log("Successfully loaded GOOGLE_API_KEY.");

        // --- 2. Get and Validate the Prompt from the Frontend ---
        const { prompt } = request.body;
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            console.warn("Bad Request: No valid prompt was provided.");
            return response.status(400).json({ error: 'A valid text prompt is required.' });
        }
        // Log the beginning of the prompt for context, avoiding overly long log entries.
        console.log(`Received prompt starting with: "${prompt.substring(0, 80)}..."`);

        // --- 3. Construct the Request for the Google Gemini API ---
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };
        console.log("Constructed request for Gemini API. Preparing to send...");

        // --- 4. Call the Gemini API ---
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        console.log(`Received response from Gemini API with status: ${geminiResponse.status}`);

        // --- 5. Handle the Response from Google ---
        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error("Gemini API Error Response:", JSON.stringify(errorData, null, 2));
            const errorMessage = errorData.error?.message || 'An unknown error occurred with the Gemini API.';
            return response.status(geminiResponse.status).json({ error: `Gemini API request failed: ${errorMessage}` });
        }

        const geminiData = await geminiResponse.json();

        // --- 6. Extract the Text and Send to the Frontend ---
        const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            console.error("Gemini API returned no text content. Full Response:", JSON.stringify(geminiData, null, 2));
            const blockReason = geminiData.promptFeedback?.blockReason || 'Unknown reason (check server logs)';
            return response.status(500).json({ error: `The model's response was empty or blocked. Reason: ${blockReason}` });
        }
        
        console.log(`Successfully received Gemini response. Sending text (length: ${generatedText.length}) to frontend.`);
        return response.status(200).json({ text: generatedText });

    } catch (error) {
        console.error('Internal Server Error in analyze-text function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
