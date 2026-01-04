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
    // Base URL: https://dash.sellhub.cx/api/sellhub/
    // Endpoint: session/create-checkout-session
    // Authorization: <token> (bez "Bearer")
    const apiEndpoint = 'https://dash.sellhub.cx/api/sellhub/session/create-checkout-session';
    
    console.log('=== Sellhub API Request ===');
    console.log('Endpoint:', apiEndpoint);
    console.log('Store ID:', SELLHUB_STORE_ID);
    console.log('Product ID:', SELLHUB_PRODUCT_ID);
    console.log('Variant ID:', variantId);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));
    
    let sellhubResponse;
    
    try {
      sellhubResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': SELLHUB_API_KEY, // Zgodnie z dokumentacją: bez "Bearer"
          'Accept': 'application/json'
        },
        body: JSON.stringify(checkoutPayload)
      });
      
      console.log(`Response Status: ${sellhubResponse.status} ${sellhubResponse.statusText}`);
      
      // Jeśli odpowiedź nie jest OK, odczytaj błąd
      if (!sellhubResponse.ok) {
        const errorData = await sellhubResponse.text();
        let errorMessage;
        
        try {
          const errorJson = JSON.parse(errorData);
          errorMessage = errorJson.message || errorJson.error || errorData;
        } catch (e) {
          errorMessage = errorData.substring(0, 500);
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
      
      console.log('=== Sellhub API Success ===');
      console.log('Status:', sellhubResponse.status);

      const checkoutData = await sellhubResponse.json();

      // Return checkout URL to frontend
      return res.status(200).json({
        success: true,
        checkoutUrl: checkoutData.url || checkoutData.checkoutUrl,
        sessionId: checkoutData.id || checkoutData.sessionId
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
    console.error('Error creating checkout:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
};

