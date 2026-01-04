module.exports = async (req, res) => {

  console.log('Checkout API called:', req.method, req.url);
  

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');


  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }


  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, variantId, variantPrice, variantName, quantity = 1, productId } = req.body;


    if (!email || !variantId || !variantPrice) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Email, variantId, and variantPrice are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format'
      });
    }

    const SELLHUB_API_KEY = process.env.SELLHUB_API_KEY;
    const SELLHUB_STORE_ID = process.env.SELLHUB_STORE_ID;

    const SELLHUB_PRODUCT_ID = productId || process.env.SELLHUB_PRODUCT_ID || 'ac3ab96d-c3d5-4ebd-b9a2-d380def5adbb';
    const SELLHUB_STORE_URL = process.env.SELLHUB_STORE_URL || 'https://visiondevelopment.sellhub.cx';
  
    const cleanStoreUrl = SELLHUB_STORE_URL.replace(/\/$/, '');
    const RETURN_URL = process.env.RETURN_URL || `${req.headers.origin || 'https://shxdowcheats.net'}/purchase-success`;

    if (!SELLHUB_API_KEY || !SELLHUB_STORE_ID || !SELLHUB_PRODUCT_ID) {
      console.error('Missing Sellhub configuration');
      return res.status(500).json({ 
        error: 'Server configuration error'
      });
    }


    const checkoutPayload = {
      email: email,
      currency: 'USD',
      returnUrl: RETURN_URL,
      methodName: "", // WYMAGANE przez Sellhub (może być pusty string)
      customFieldValues: [], // WYMAGANE przez Sellhub (może być pusta tablica)
      cart: {
        items: [
          {
            id: SELLHUB_PRODUCT_ID, // Product ID - sprawdź czy jest poprawny!
            variant: {
              id: variantId, // Variant ID - sprawdź czy jest poprawny i należy do tego Product!
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
    

    console.log('=== ID Verification ===');
    console.log('Product ID:', SELLHUB_PRODUCT_ID);
    console.log('Variant ID:', variantId);
    console.log('Store ID:', SELLHUB_STORE_ID);
    console.log('⚠️  Jeśli błąd "Cart is empty", sprawdź czy:');
    console.log('   1. Product ID jest poprawny i należy do Store ID:', SELLHUB_STORE_ID);
    console.log('   2. Variant ID jest poprawny i należy do Product ID:', SELLHUB_PRODUCT_ID);
    console.log('   3. Oba ID są aktywne w panelu Sellhub');


    const apiEndpoint = `${cleanStoreUrl}/api/checkout`;
    
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
          'Authorization': SELLHUB_API_KEY, 
          'Accept': 'application/json'
        },
        body: JSON.stringify(checkoutPayload)
      });
      
      console.log(`Response Status: ${sellhubResponse.status} ${sellhubResponse.statusText}`);
      

      const responseText = await sellhubResponse.text();
      console.log('=== SELLHUB RAW RESPONSE ===');
      console.log(responseText);
      

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
      

      const checkoutData = JSON.parse(responseText);
      
      console.log('=== Sellhub API Success ===');
      console.log('Status:', sellhubResponse.status);
      console.log('Checkout Data:', JSON.stringify(checkoutData, null, 2));

      // Sellhub zwraca strukturę: { status: "success", session: { id: "..." } }
      // Musimy zbudować checkout URL z session.id
      const sessionId = checkoutData.session?.id || checkoutData.id;
      
      if (!sessionId) {
        console.error('No session ID in response:', checkoutData);
        return res.status(500).json({ 
          error: 'Invalid response from Sellhub',
          message: 'Session ID not found in response'
        });
      }
      

      const checkoutUrl = `${cleanStoreUrl}/checkout/${sessionId}/`;
      
      console.log('Generated checkout URL:', checkoutUrl);


      return res.status(200).json({
        success: true,
        checkoutUrl: checkoutUrl,
               sessionId: sessionId,
               // Useful for mapping to invoices later (Sellhub invoices API uses createdAtFrom/To)
               createdAt: checkoutData.session?.createdAt || new Date().toISOString(),
               email: checkoutData.session?.email || email,
               visitorAnalyticsId: checkoutData.session?.visitorAnalyticsId || null
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

