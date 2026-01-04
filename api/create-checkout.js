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
    // Endpoint powinien być na Store URL zgodnie z dokumentacją
    const apiEndpoint = `${cleanStoreUrl}/api/session/create-checkout-session`;
    
    console.log('Sellhub API Endpoint:', apiEndpoint);
    console.log('Store ID:', SELLHUB_STORE_ID);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));
    
    const sellhubResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SELLHUB_API_KEY}`,
        'X-Store-ID': SELLHUB_STORE_ID,
        'Accept': 'application/json'
      },
      body: JSON.stringify(checkoutPayload)
    });

    if (!sellhubResponse.ok) {
      const errorData = await sellhubResponse.text();
      const errorStatus = sellhubResponse.status;
      console.error('Sellhub API error:', {
        status: errorStatus,
        statusText: sellhubResponse.statusText,
        endpoint: apiEndpoint,
        responsePreview: errorData.substring(0, 500)
      });
      
      // Jeśli to 404, może endpoint jest nieprawidłowy
      if (errorStatus === 404) {
        return res.status(500).json({ 
          error: 'Sellhub API endpoint not found',
          message: 'The checkout endpoint does not exist. Please verify the Store URL and API endpoint in Sellhub documentation.',
          endpoint: apiEndpoint,
          storeUrl: SELLHUB_STORE_URL
        });
      }
      
      return res.status(errorStatus).json({ 
        error: 'Failed to create checkout session',
        status: errorStatus,
        details: errorData.substring(0, 500)
      });
    }

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

