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
    // Endpoint: użyj endpointu specyficznego dla Twojego Store
    const apiEndpoint = `${cleanStoreUrl}/api/checkout/${sessionId}`;
    
    console.log('=== Sellhub Get Session Request ===');
    console.log('Endpoint:', apiEndpoint);
    console.log('Session ID:', sessionId);
    
    try {
      const sellhubResponse = await fetch(apiEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': SELLHUB_API_KEY, // Bez "Bearer"
          'Accept': 'application/json'
        }
      });
      
      console.log(`Response Status: ${sellhubResponse.status} ${sellhubResponse.statusText}`);
      
      // Odczytaj odpowiedź (nawet jeśli błąd) dla debugowania
      const responseText = await sellhubResponse.text();
      console.log('=== SELLHUB RAW RESPONSE ===');
      console.log(responseText);
      
      // Jeśli odpowiedź nie jest OK, zwróć błąd
      if (!sellhubResponse.ok) {
        let errorMessage;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.message || errorJson.error || responseText;
        } catch (e) {
          errorMessage = responseText.substring(0, 500);
        }
        
        console.error('=== Sellhub API Error ===');
        console.error('Status:', sellhubResponse.status);
        console.error('Error:', errorMessage);
        
        return res.status(sellhubResponse.status).json({ 
          error: 'Sellhub API error',
          message: errorMessage,
          status: sellhubResponse.status
        });
      }
      
      // Parsuj odpowiedź JSON
      const sessionData = JSON.parse(responseText);
      
      console.log('=== Sellhub API Success ===');
      console.log('Status:', sellhubResponse.status);
      console.log('Session Data:', JSON.stringify(sessionData, null, 2));

      // Sellhub zwraca strukturę: { status: "success", session: { ... } } lub bezpośrednio session
      const session = sessionData.session || sessionData;
      const status = sessionData.status || session?.status;

      // Return session data to frontend
      return res.status(200).json({
        success: true,
        session: session,
        status: status
      });
      
    } catch (error) {
      console.error('=== Fetch Error ===');
      console.error('Error:', error.message);
      return res.status(500).json({ 
        error: 'Network error',
        message: error.message
      });
    }

  } catch (error) {
    console.error('Error getting session:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
};

