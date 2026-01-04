module.exports = async (req, res) => {
  // Log request for debugging
  console.log('Get Session API called:', req.method, req.url);
  
  // CORS headers (ustaw przed sprawdzaniem metody)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request FIRST
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'Missing required field',
        details: 'sessionId query parameter is required'
      });
    }

    // Sellhub API configuration
    const SELLHUB_API_KEY = process.env.SELLHUB_API_KEY;
    const SELLHUB_STORE_URL = process.env.SELLHUB_STORE_URL || 'https://visiondevelopment.sellhub.cx';
    // Usuń końcowy slash z Store URL jeśli istnieje
    const cleanStoreUrl = SELLHUB_STORE_URL.replace(/\/$/, '');

    if (!SELLHUB_API_KEY) {
      console.error('Missing Sellhub API Key');
      return res.status(500).json({ 
        error: 'Server configuration error'
      });
    }

    // Get checkout session from Sellhub API
    // WAŻNE: Sellhub czasem zwraca HTML (Next.js 404 page) zamiast JSON — tego NIE przepuszczamy do frontu.
    const possibleEndpoints = [
      `${cleanStoreUrl}/api/checkout/${sessionId}`,
      `${cleanStoreUrl}/api/session/${sessionId}`,
      `https://store.sellhub.cx/api/checkout/${sessionId}`,
      `https://store.sellhub.cx/api/session/${sessionId}`
    ];

    console.log('=== Sellhub Get Session Request ===');
    console.log('Session ID:', sessionId);

    let lastError = null;

    for (const endpoint of possibleEndpoints) {
      console.log(`Trying endpoint: ${endpoint}`);

      let sellhubResponse;
      try {
        sellhubResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': SELLHUB_API_KEY, // Bez "Bearer"
            'Accept': 'application/json'
          }
        });
      } catch (error) {
        console.error(`Network error for endpoint ${endpoint}:`, error.message);
        lastError = { endpoint, error: error.message };
        continue;
      }

      const contentType = sellhubResponse.headers.get('content-type') || '';
      console.log(`Endpoint ${endpoint} - Status: ${sellhubResponse.status} ${sellhubResponse.statusText} - Content-Type: ${contentType}`);

      // Jeśli to nie jest JSON, bardzo często jest to HTML 404 z aplikacji Sellhub — traktujemy jako nietrafiony endpoint.
      if (!contentType.toLowerCase().includes('application/json')) {
        // dla diagnostyki weź tylko krótki fragment, żeby nie spamować logów
        try {
          const preview = (await sellhubResponse.text()).substring(0, 200);
          lastError = { endpoint, status: sellhubResponse.status, statusText: sellhubResponse.statusText, contentType, preview };
        } catch (e) {
          lastError = { endpoint, status: sellhubResponse.status, statusText: sellhubResponse.statusText, contentType, preview: 'Could not read body' };
        }
        continue;
      }

      const responseText = await sellhubResponse.text();

      if (!sellhubResponse.ok) {
        let errorMessage = responseText.substring(0, 500);
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {}

        lastError = {
          endpoint,
          status: sellhubResponse.status,
          statusText: sellhubResponse.statusText,
          error: errorMessage
        };
        continue;
      }

      let sessionData;
      try {
        sessionData = JSON.parse(responseText);
      } catch (e) {
        lastError = { endpoint, status: sellhubResponse.status, statusText: sellhubResponse.statusText, error: 'Invalid JSON returned from Sellhub' };
        continue;
      }

      console.log('✓ Sellhub session fetched successfully');
      console.log('Successful endpoint:', endpoint);

      const session = sessionData.session || sessionData;
      const status = sessionData.status || session?.status;

      return res.status(200).json({
        success: true,
        session,
        status
      });
    }

    console.error('=== All Sellhub Get Session Endpoints Failed ===');
    console.error('Last error:', lastError);

    return res.status(502).json({
      error: 'Could not retrieve checkout session from Sellhub',
      triedEndpoints: possibleEndpoints,
      lastError,
      storeUrl: cleanStoreUrl
    });

  } catch (error) {
    console.error('Error getting session:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
};

