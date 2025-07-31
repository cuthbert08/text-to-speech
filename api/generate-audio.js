/**
 * Vercel Serverless Function: api/generate-audio.js
 * * This function is a secure backend endpoint for generating audio from text.
 * It receives a text chunk and a selected voice from the frontend, then securely
 * calls the OpenAI Text-to-Speech (TTS) API to create the audio.
 * * Security:
 * - The OpenAI API Key is read from a secure environment variable on the server.
 * - It is never exposed to the user's browser.
 * * Enhancements:
 * - Added detailed logging for better debugging in the Vercel dashboard.
 * - Added more specific error handling to identify common issues like input length.
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
        console.log("Handling OPTIONS preflight request for generate-audio.");
        return response.status(200).end();
    }

    // This endpoint should only accept POST requests.
    if (request.method !== 'POST') {
        console.warn(`Method Not Allowed: Received a ${request.method} request.`);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }
    
    console.log("--- [api/generate-audio] Function Invoked ---");

    try {
        // --- 1. Securely Retrieve the API Key ---
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error("FATAL: OPENAI_API_KEY environment variable not set.");
            return response.status(500).json({ error: 'API key is not configured on the server.' });
        }
        console.log("Successfully loaded OPENAI_API_KEY.");

        // --- 2. Get and Validate Input from the Frontend ---
        const { text, voice } = request.body;
        if (!text || !voice) {
            console.warn("Bad Request: Missing text or voice parameter.");
            return response.status(400).json({ error: 'Missing required parameters: text and voice.' });
        }
        
        // OpenAI's TTS API has a character limit (currently 4096 characters).
        if (text.length > 4096) {
            console.warn(`Bad Request: Input text is too long (${text.length} characters).`);
            return response.status(400).json({ error: `Input text is too long. The maximum is 4096 characters, but this chunk has ${text.length}.` });
        }
        
        console.log(`Received request to generate audio for text chunk (length: ${text.length}) with voice: ${voice}`);

        // --- 3. Construct the Request for the OpenAI TTS API ---
        const openaiApiUrl = 'https://api.openai.com/v1/audio/speech';
        
        const requestBody = {
            model: 'tts-1',
            input: text,
            voice: voice,
            response_format: 'mp3'
        };
        console.log("Constructed request for OpenAI TTS API. Preparing to send...");

        // --- 4. Call the OpenAI API ---
        const openaiResponse = await fetch(openaiApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        console.log(`Received response from OpenAI API with status: ${openaiResponse.status}`);

        // --- 5. Handle the Response from OpenAI ---
        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json();
            console.error("OpenAI API Error Response:", JSON.stringify(errorData, null, 2));
            const errorMessage = errorData.error?.message || 'An unknown error occurred with the OpenAI API.';
            return response.status(openaiResponse.status).json({ error: `OpenAI API request failed: ${errorMessage}` });
        }

        // --- 6. Stream the Successful Audio Result Back to the Frontend ---
        const audioData = await openaiResponse.arrayBuffer();
        console.log(`Successfully received audio data (size: ${audioData.byteLength} bytes). Sending to frontend.`);
        
        response.setHeader('Content-Type', 'audio/mpeg');
        return response.status(200).send(Buffer.from(audioData));

    } catch (error) {
        console.error('Internal Server Error in generate-audio function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
