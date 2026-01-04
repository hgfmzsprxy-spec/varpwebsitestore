module.exports = async (req, res) => {
  // Log request for debugging
  console.log('Checkout API called:', req.method, req.url);
  
  // CORS headers (ustaw przed sprawdzaniem metody)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request FIRST (przed sprawdzaniem POST)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, variantId, variantPrice, variantName, quantity = 1 } = req.body;

    // Validate required fields
    if (!email || !variantId || !variantPrice) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Email, variantId, and variantPrice are required'
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
    // WYMAGANE: variant musi mieć id, name i price (string!)
    // WYMAGANE: methodName i customFieldValues (nawet jeśli puste)
    const checkoutPayload = {
      email: email,
      currency: 'USD',
      returnUrl: RETURN_URL,
      methodName: "", // WYMAGANE przez Sellhub (może być pusty string)
      customFieldValues: [], // WYMAGANE przez Sellhub (może być pusta tablica)
      cart: {
        items: [
          {
            id: SELLHUB_PRODUCT_ID,
            variant: {
              id: variantId,
              name: variantName || 'Default',
              price: variantPrice // Musi być string, np. "24.99"
            },
            quantity: parseInt(quantity) || 1,
            addons: []
          }
        ],
        bundles: []
      }
    };

    // Create checkout session with Sellhub API
    // Endpoint: https://store.sellhub.cx/api/checkout (JEDYNY PRAWIDŁOWY)
    const apiEndpoint = 'https://store.sellhub.cx/api/checkout';
    
    console.log('=== Sellhub API Request ===');
    console.log('Endpoint:', apiEndpoint);
    console.log('Store ID:', SELLHUB_STORE_ID);
    console.log('Product ID:', SELLHUB_PRODUCT_ID);
    console.log('Variant ID:', variantId);
    console.log('Variant Price:', variantPrice);
    console.log('Variant Name:', variantName);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));
    
    try {
      const sellhubResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': SELLHUB_API_KEY, // Bez "Bearer"
          'Accept': 'application/json'
        },
        body: JSON.stringify(checkoutPayload)
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
      const checkoutData = JSON.parse(responseText);
      
      console.log('=== Sellhub API Success ===');
      console.log('Status:', sellhubResponse.status);
      console.log('Checkout Data:', JSON.stringify(checkoutData, null, 2));

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

