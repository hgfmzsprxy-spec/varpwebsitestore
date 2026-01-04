module.exports = async (req, res) => {
  console.log('Get Invoice API called:', req.method, req.url);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { createdAtMs, email } = req.query;

    if (!createdAtMs) {
      return res.status(400).json({
        error: 'Missing required field',
        details: 'createdAtMs query parameter is required'
      });
    }

    const createdMs = Number(createdAtMs);
    if (!Number.isFinite(createdMs) || createdMs <= 0) {
      return res.status(400).json({
        error: 'Invalid createdAtMs',
        details: 'createdAtMs must be a unix timestamp in milliseconds'
      });
    }

    const SELLHUB_API_KEY = process.env.SELLHUB_API_KEY;
    const SELLHUB_STORE_URL = process.env.SELLHUB_STORE_URL || 'https://visiondevelopment.sellhub.cx';
    const cleanStoreUrl = SELLHUB_STORE_URL.replace(/\/$/, '');

    if (!SELLHUB_API_KEY) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Sellhub Docs (Invoices):
    // - GET /invoices
    // - Query: createdAtFrom, createdAtTo
    // Source: https://docs.sellhub.cx/api/invoices/get-invoices
    const windowMs = 2 * 60 * 60 * 1000; // +/- 2h
    const fromIso = new Date(createdMs - windowMs).toISOString();
    const toIso = new Date(createdMs + windowMs).toISOString();

    const apiEndpoint = `${cleanStoreUrl}/api/invoices?createdAtFrom=${encodeURIComponent(fromIso)}&createdAtTo=${encodeURIComponent(toIso)}`;

    console.log('=== Sellhub Get Invoices Request ===');
    console.log('Endpoint:', apiEndpoint);
    console.log('Filter email:', email || '(none)');
    console.log('createdAtFrom:', fromIso);
    console.log('createdAtTo:', toIso);

    const sellhubResponse = await fetch(apiEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': SELLHUB_API_KEY,
        'Accept': 'application/json'
      }
    });

    const contentType = sellhubResponse.headers.get('content-type') || '';
    const raw = await sellhubResponse.text();

    if (!contentType.toLowerCase().includes('application/json')) {
      return res.status(502).json({
        error: 'Sellhub returned non-JSON response',
        status: sellhubResponse.status,
        contentType,
        preview: raw.substring(0, 200)
      });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return res.status(502).json({
        error: 'Sellhub returned invalid JSON',
        preview: raw.substring(0, 200)
      });
    }

    if (!sellhubResponse.ok) {
      return res.status(sellhubResponse.status).json({
        error: 'Sellhub API error',
        message: payload.message || payload.error || 'Failed to fetch invoices',
        status: sellhubResponse.status
      });
    }

    // Be defensive about structure: could be { invoices: [...] } or { data: [...] } etc.
    const invoices = payload.invoices || payload.data || payload.items || payload.results || [];

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(404).json({
        error: 'No invoices found in time window',
        createdAtFrom: fromIso,
        createdAtTo: toIso
      });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const filtered = normalizedEmail
      ? invoices.filter(inv => String(inv.email || inv.customerEmail || '').toLowerCase() === normalizedEmail)
      : invoices;

    // Prefer newest invoice
    const pickFrom = filtered.length ? filtered : invoices;
    pickFrom.sort((a, b) => {
      const ta = Date.parse(a.createdAt || a.created_at || '') || 0;
      const tb = Date.parse(b.createdAt || b.created_at || '') || 0;
      return tb - ta;
    });

    const invoice = pickFrom[0];
    const invoiceId = invoice?.id;

    if (!invoice || !invoiceId) {
      return res.status(404).json({
        error: 'Invoice not found',
        note: 'Invoices were returned but none matched the expected structure.'
      });
    }

    // Fetch full invoice details: GET /invoices/{id}
    // Source: https://docs.sellhub.cx/api/invoices/get-invoice
    const invoiceEndpoint = `${cleanStoreUrl}/api/invoices/${encodeURIComponent(invoiceId)}`;
    console.log('Fetching invoice details:', invoiceEndpoint);

    const invRes = await fetch(invoiceEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': SELLHUB_API_KEY,
        'Accept': 'application/json'
      }
    });

    const invType = invRes.headers.get('content-type') || '';
    const invRaw = await invRes.text();

    if (!invType.toLowerCase().includes('application/json')) {
      return res.status(502).json({
        error: 'Sellhub returned non-JSON invoice response',
        status: invRes.status,
        contentType: invType,
        preview: invRaw.substring(0, 200)
      });
    }

    const invPayload = JSON.parse(invRaw);

    if (!invRes.ok) {
      return res.status(invRes.status).json({
        error: 'Sellhub API error (invoice)',
        message: invPayload.message || invPayload.error || 'Failed to fetch invoice',
        status: invRes.status
      });
    }

    // Normalize output for frontend
    const invoiceDetails = invPayload.invoice || invPayload;

    return res.status(200).json({
      success: true,
      invoice: invoiceDetails
    });
  } catch (error) {
    console.error('Get Invoice error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};


