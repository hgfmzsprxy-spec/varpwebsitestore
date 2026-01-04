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
    // Spróbuj różnych możliwych endpointów Sellhub
    const possibleEndpoints = [
      `${cleanStoreUrl}/api/session/create-checkout-session`,
      `${cleanStoreUrl}/api/${SELLHUB_STORE_ID}/session/create-checkout-session`,
      `https://api.sellhub.cx/api/session/create-checkout-session`,
      `https://api.sellhub.cx/api/${SELLHUB_STORE_ID}/session/create-checkout-session`
    ];
    
    console.log('=== Sellhub API Request ===');
    console.log('Store URL:', cleanStoreUrl);
    console.log('Store ID:', SELLHUB_STORE_ID);
    console.log('Product ID:', SELLHUB_PRODUCT_ID);
    console.log('Variant ID:', variantId);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));
    
    let sellhubResponse = null;
    let lastError = null;
    let successfulEndpoint = null;
    
    // Spróbuj każdego endpointu po kolei
    for (const apiEndpoint of possibleEndpoints) {
      console.log(`Trying endpoint: ${apiEndpoint}`);
      
      try {
        sellhubResponse = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SELLHUB_API_KEY}`,
            'X-Store-ID': SELLHUB_STORE_ID,
            'Accept': 'application/json'
          },
          body: JSON.stringify(checkoutPayload)
        });
        
        console.log(`Endpoint ${apiEndpoint} - Status: ${sellhubResponse.status}`);
        
        // Jeśli odpowiedź jest OK, użyj tego endpointu
        if (sellhubResponse.ok) {
          successfulEndpoint = apiEndpoint;
          console.log(`✓ Success with endpoint: ${apiEndpoint}`);
          break;
        }
        
        // Jeśli to nie 404, zapisz błąd i kontynuuj
        if (sellhubResponse.status !== 404) {
          const errorData = await sellhubResponse.text();
          lastError = {
            endpoint: apiEndpoint,
            status: sellhubResponse.status,
            statusText: sellhubResponse.statusText,
            error: errorData.substring(0, 500)
          };
          console.log(`Endpoint ${apiEndpoint} returned ${sellhubResponse.status}, trying next...`);
          continue;
        }
        
        // Jeśli to 404, spróbuj następnego endpointu
        console.log(`Endpoint ${apiEndpoint} returned 404, trying next...`);
        
      } catch (error) {
        console.error(`Error with endpoint ${apiEndpoint}:`, error.message);
        lastError = {
          endpoint: apiEndpoint,
          error: error.message
        };
        continue;
      }
    }
    
    // Jeśli żaden endpoint nie zadziałał
    if (!sellhubResponse || !sellhubResponse.ok) {
      const errorData = sellhubResponse ? await sellhubResponse.text() : 'No response';
      const errorStatus = sellhubResponse ? sellhubResponse.status : 0;
      
      console.error('=== All Endpoints Failed ===');
      console.error('Last error:', lastError);
      console.error('Response status:', errorStatus);
      console.error('Response preview:', errorData.substring(0, 1000));
      
      return res.status(500).json({ 
        error: 'Sellhub API endpoint not found',
        message: 'None of the attempted endpoints worked. Please verify your Sellhub configuration.',
        triedEndpoints: possibleEndpoints,
        lastError: lastError,
        storeUrl: cleanStoreUrl,
        storeId: SELLHUB_STORE_ID,
        suggestion: 'Please check your Sellhub dashboard:',
        checklist: [
          '1. Is API access enabled for your store?',
          '2. What is the correct API endpoint format?',
          '3. Should the endpoint include Store ID in the path?',
          '4. Is the API on a different domain?',
          '5. Are your API Key and Store ID correct?'
        ]
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

