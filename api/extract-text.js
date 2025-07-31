/**
 * Vercel Serverless Function: api/extract-text.js
 * * This function acts as a secure backend endpoint to process PDF files.
 * It receives a base64-encoded PDF from the frontend, sends it to the 
 * Google Cloud Vision API for text extraction (OCR), and returns the 
 * structured text and coordinate data back to the frontend.
 * * Security:
 * - The Google API Key is read from a secure environment variable on the server.
 * - It is never exposed to the user's browser.
 * * Enhancements:
 * - Added detailed logging for better debugging in the Vercel dashboard.
 */
import dotenv from 'dotenv';
dotenv.config();

export default async function handler(request, response) {
    // Set CORS headers to allow requests from any origin
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS requests for CORS
    if (request.method === 'OPTIONS') {
        console.log("Handling OPTIONS preflight request.");
        return response.status(200).end();
    }

    // We only allow POST requests for this endpoint
    if (request.method !== 'POST') {
        console.warn(`Method Not Allowed: Received a ${request.method} request.`);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    console.log("--- [api/extract-text] Function Invoked ---");

    try {
        // --- 1. Securely retrieve the API Key ---
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.error("FATAL: GOOGLE_API_KEY environment variable not set.");
            return response.status(500).json({ error: 'API key is not configured on the server.' });
        }
        console.log("Successfully loaded GOOGLE_API_KEY.");

        // --- 2. Get the PDF data from the frontend's request ---
        const { pdfData } = request.body;
        if (!pdfData) {
            console.warn("Bad Request: No PDF data was provided in the request body.");
            return response.status(400).json({ error: 'No PDF data provided.' });
        }
        // We log the size of the data, not the data itself, to avoid cluttering logs.
        console.log(`Received PDF data of length: ${pdfData.length} characters.`);

        // --- 3. Construct the request for the Google Vision API ---
        const visionApiUrl = `https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`;
        
        const requestBody = {
            requests: [{
                inputConfig: {
                    content: pdfData,
                    mimeType: 'application/pdf'
                },
                features: [{
                    type: 'DOCUMENT_TEXT_DETECTION'
                }]
            }]
        };
        console.log("Constructed request for Google Vision API. Preparing to send...");

        // --- 4. Call the Google Vision API ---
        const visionResponse = await fetch(visionApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        console.log(`Received response from Google Vision API with status: ${visionResponse.status}`);

        // --- 5. Handle the response from Google ---
        if (!visionResponse.ok) {
            const errorData = await visionResponse.json();
            // Log the detailed error from Google for easier debugging.
            console.error("Google Vision API Error Response:", JSON.stringify(errorData, null, 2));
            const errorMessage = errorData.error?.message || 'An unknown error occurred with the Vision API.';
            return response.status(visionResponse.status).json({ error: `Vision API request failed: ${errorMessage}` });
        }

        const visionData = await visionResponse.json();
        console.log("Successfully parsed Vision API response. Sending data to frontend.");

        // --- 6. Send the successful result back to the frontend ---
        return response.status(200).json(visionData);

    } catch (error) {
        // Handle any unexpected server errors (e.g., network issues, JSON parsing failures)
        console.error('Internal Server Error in extract-text function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
