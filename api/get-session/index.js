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
    // Spróbuj różnych możliwych endpointów dla pobierania sesji
    const possibleEndpoints = [
      `${cleanStoreUrl}/api/checkout/${sessionId}`, // Najbardziej prawdopodobne
      `${cleanStoreUrl}/api/session/${sessionId}`,
      `https://store.sellhub.cx/api/checkout/${sessionId}`,
      `https://store.sellhub.cx/api/session/${sessionId}`
    ];
    
    console.log('=== Sellhub Get Session Request ===');
    console.log('Session ID:', sessionId);
    
    let sellhubResponse = null;
    let lastError = null;
    let successfulEndpoint = null;
    
    // Spróbuj każdego endpointu po kolei
    for (const endpoint of possibleEndpoints) {
      console.log(`Trying endpoint: ${endpoint}`);
      
      try {
        sellhubResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': SELLHUB_API_KEY, // Bez "Bearer"
            'Accept': 'application/json'
          }
        });
        
        console.log(`Endpoint ${endpoint} - Status: ${sellhubResponse.status} ${sellhubResponse.statusText}`);
        
        // Jeśli odpowiedź jest OK, użyj tego endpointu
        if (sellhubResponse.ok) {
          successfulEndpoint = endpoint;
          console.log(`✓ Success with endpoint: ${endpoint}`);
          break;
        }
        
        // Jeśli to nie 404, zapisz błąd i kontynuuj
        if (sellhubResponse.status !== 404) {
          try {
            const errorData = await sellhubResponse.text();
            let errorMessage;
            
            try {
              const errorJson = JSON.parse(errorData);
              errorMessage = errorJson.message || errorJson.error || errorData;
            } catch (e) {
              errorMessage = errorData.substring(0, 500);
            }
            
            lastError = {
              endpoint: endpoint,
              status: sellhubResponse.status,
              statusText: sellhubResponse.statusText,
              error: errorMessage
            };
          } catch (e) {
            lastError = {
              endpoint: endpoint,
              status: sellhubResponse.status,
              statusText: sellhubResponse.statusText,
              error: 'Could not read error response'
            };
          }
          console.log(`Endpoint ${endpoint} returned ${sellhubResponse.status}, trying next...`);
          continue;
        }
        
        // Jeśli to 404, spróbuj następnego endpointu
        console.log(`Endpoint ${endpoint} returned 404, trying next...`);
        lastError = {
          endpoint: endpoint,
          status: 404,
          statusText: 'Not Found',
          error: 'Endpoint not found'
        };
        
      } catch (error) {
        console.error(`Error with endpoint ${endpoint}:`, error.message);
        lastError = {
          endpoint: endpoint,
          error: error.message
        };
        continue;
      }
    }
    
    // Jeśli żaden endpoint nie zadziałał
    if (!sellhubResponse || !sellhubResponse.ok) {
      const errorStatus = sellhubResponse ? sellhubResponse.status : 0;
      
      console.error('=== All Endpoints Failed ===');
      console.error('Last error:', lastError);
      console.error('Response status:', errorStatus);
      
      return res.status(500).json({ 
        error: 'Sellhub API endpoint not found',
        message: 'None of the attempted endpoints worked. Please verify your Sellhub configuration.',
        triedEndpoints: possibleEndpoints,
        lastError: lastError,
        storeUrl: cleanStoreUrl,
        suggestion: 'Please check your Sellhub dashboard for the correct API endpoint to retrieve session data.'
      });
    }
    
    // Odczytaj odpowiedź (nawet jeśli błąd) dla debugowania
    const responseText = await sellhubResponse.text();
    console.log('=== SELLHUB RAW RESPONSE ===');
    console.log(responseText);
    
    // Parsuj odpowiedź JSON
    const sessionData = JSON.parse(responseText);
    
    console.log('=== Sellhub API Success ===');
    console.log('Successful endpoint:', successfulEndpoint);
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
    console.error('Error getting session:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
};

