module.exports = async (req, res) => {
  // Log request for debugging
  console.log('Checkout API called:', req.method, req.url);
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { email, variantId, quantity = 1 } = req.body;

    // Validate required fields
    if (!email || !variantId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Email and variantId are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format'
      });
    }

    // Sellhub API configuration
    const SELLHUB_API_KEY = process.env.SELLHUB_API_KEY;
    const SELLHUB_STORE_ID = process.env.SELLHUB_STORE_ID;
    const SELLHUB_PRODUCT_ID = process.env.SELLHUB_PRODUCT_ID || 'ac3ab96d-c3d5-4ebd-b9a2-d380def5adbb';
    const SELLHUB_STORE_URL = process.env.SELLHUB_STORE_URL || 'https://visiondevelopment.sellhub.cx';
    // Usuń końcowy slash z Store URL jeśli istnieje
    const cleanStoreUrl = SELLHUB_STORE_URL.replace(/\/$/, '');
    const RETURN_URL = process.env.RETURN_URL || `${req.headers.origin || 'https://shxdowcheats.net'}/purchase-success`;

    if (!SELLHUB_API_KEY || !SELLHUB_STORE_ID || !SELLHUB_PRODUCT_ID) {
      console.error('Missing Sellhub configuration');
      return res.status(500).json({ 
        error: 'Server configuration error'
      });
    }

    // Prepare checkout session payload
    const checkoutPayload = {
      email: email,
      currency: 'USD',
      returnUrl: RETURN_URL,
      cart: {
        items: [
          {
            id: SELLHUB_PRODUCT_ID,
            variant: {
              id: variantId
            },
            quantity: parseInt(quantity) || 1
          }
        ],
        bundles: []
      }
    };

    // Create checkout session with Sellhub API
    // Zgodnie z dokumentacją Sellhub: https://docs.sellhub.cx/api/session/create-checkout-session
    // Na podstawie przykładu: checkout jest tworzony na Store URL (subdomenie)
    // Przykład: https://vanish-.sellhub.cx/checkout/{session-id}/
    // Endpoint: /api/session/create-checkout-session na Store URL
    // Authorization: <token> (bez "Bearer")
    // Endpoint potwierdzony przez użytkownika
    // Główny endpoint: https://store.sellhub.cx/api/checkout
    const possibleEndpoints = [
      'https://store.sellhub.cx/api/checkout', // Potwierdzony endpoint
      // Fallback warianty (na wypadek, gdyby główny nie zadziałał)
      `${cleanStoreUrl}/api/checkout`,
      'https://dash.sellhub.cx/api/sellhub/checkout',
      `${cleanStoreUrl}/api/session/create-checkout-session`,
      `${cleanStoreUrl}/api/${SELLHUB_STORE_ID}/session/create-checkout-session`
    ];
    
    let apiEndpoint = possibleEndpoints[0];
    
    console.log('=== Sellhub API Request ===');
    console.log('Store ID:', SELLHUB_STORE_ID);
    console.log('Product ID:', SELLHUB_PRODUCT_ID);
    console.log('Variant ID:', variantId);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));
    
    let sellhubResponse = null;
    let lastError = null;
    let successfulEndpoint = null;
    
    // Spróbuj każdego endpointu po kolei
    for (const endpoint of possibleEndpoints) {
      console.log(`Trying endpoint: ${endpoint}`);
      
      try {
        sellhubResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': SELLHUB_API_KEY, // Zgodnie z dokumentacją: bez "Bearer"
            'Accept': 'application/json'
          },
          body: JSON.stringify(checkoutPayload)
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
        storeId: SELLHUB_STORE_ID,
        suggestion: 'Please check your Sellhub dashboard for the correct API endpoint.'
      });
    }
    
    console.log('=== Sellhub API Success ===');
    console.log('Successful endpoint:', successfulEndpoint);
    console.log('Status:', sellhubResponse.status);

    const checkoutData = await sellhubResponse.json();

    // Return checkout URL to frontend
    return res.status(200).json({
      success: true,
      checkoutUrl: checkoutData.url || checkoutData.checkoutUrl,
      sessionId: checkoutData.id || checkoutData.sessionId
    });

  } catch (error) {
    console.error('Error creating checkout:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
};

