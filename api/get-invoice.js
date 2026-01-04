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
    const storeHost = (() => {
      try {
        return new URL(cleanStoreUrl).hostname;
      } catch {
        return '';
      }
    })();
    // e.g. visiondevelopment.sellhub.cx -> visiondevelopment
    const storeSlug = storeHost.split('.').filter(Boolean)[0] || '';

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
    console.log('Filter email:', email || '(none)');
    console.log('createdAtFrom:', fromIso);
    console.log('createdAtTo:', toIso);
    console.log('Derived storeSlug:', storeSlug || '(unknown)');

    // Some Sellhub endpoints are served under different base URLs.
    // We try multiple and only accept JSON.
    const listCandidates = [
      // store subdomain API (works for checkout create on your store)
      `${cleanStoreUrl}/api/invoices?createdAtFrom=${encodeURIComponent(fromIso)}&createdAtTo=${encodeURIComponent(toIso)}`,
      // global store API base (docs often show this)
      `https://store.sellhub.cx/api/invoices?createdAtFrom=${encodeURIComponent(fromIso)}&createdAtTo=${encodeURIComponent(toIso)}`,
      // global store API base with store slug hint
      storeSlug
        ? `https://store.sellhub.cx/api/invoices?createdAtFrom=${encodeURIComponent(fromIso)}&createdAtTo=${encodeURIComponent(toIso)}&store=${encodeURIComponent(storeSlug)}`
        : null,
      // dashboard API base (some resources are exposed here)
      `https://dash.sellhub.cx/api/sellhub/invoices?createdAtFrom=${encodeURIComponent(fromIso)}&createdAtTo=${encodeURIComponent(toIso)}`
    ].filter(Boolean);

    const fetchJson = async (url, extraHeaders = {}) => {
      const r = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': SELLHUB_API_KEY,
          'Accept': 'application/json',
          ...extraHeaders
        }
      });
      const ct = r.headers.get('content-type') || '';
      const text = await r.text();
      return { r, ct, text };
    };

    let payload = null;
    let usedListEndpoint = null;
    let lastNonJson = null;
    let lastJsonError = null;

    for (const url of listCandidates) {
      console.log('Trying invoices list endpoint:', url);
      const extraHeaders = (url.startsWith('https://store.sellhub.cx') && storeSlug)
        ? { 'X-Store': storeSlug, 'Store': storeSlug }
        : {};

      const { r, ct, text } = await fetchJson(url, extraHeaders);

      if (!ct.toLowerCase().includes('application/json')) {
        lastNonJson = { endpoint: url, status: r.status, statusText: r.statusText, contentType: ct, preview: text.substring(0, 200) };
        continue;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        lastNonJson = { endpoint: url, status: r.status, statusText: r.statusText, contentType: ct, preview: text.substring(0, 200) };
        continue;
      }

      if (!r.ok) {
        lastJsonError = { endpoint: url, status: r.status, statusText: r.statusText, message: json.message || json.error || 'Sellhub error' };
        continue;
      }

      payload = json;
      usedListEndpoint = url;
      break;
    }

    if (!payload) {
      return res.status(502).json({
        error: 'Sellhub returned non-JSON response',
        triedEndpoints: listCandidates,
        lastNonJson,
        lastJsonError
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
    console.log('Invoices list endpoint used:', usedListEndpoint);
    console.log('Fetching invoice details for id:', invoiceId);

    const detailCandidates = [
      `${cleanStoreUrl}/api/invoices/${encodeURIComponent(invoiceId)}`,
      `https://store.sellhub.cx/api/invoices/${encodeURIComponent(invoiceId)}`,
      storeSlug ? `https://store.sellhub.cx/api/invoices/${encodeURIComponent(invoiceId)}?store=${encodeURIComponent(storeSlug)}` : null,
      `https://dash.sellhub.cx/api/sellhub/invoices/${encodeURIComponent(invoiceId)}`
    ].filter(Boolean);

    let invPayload = null;
    let usedDetailEndpoint = null;
    let lastDetailNonJson = null;
    let lastDetailJsonError = null;

    for (const url of detailCandidates) {
      console.log('Trying invoice detail endpoint:', url);
      const extraHeaders = (url.startsWith('https://store.sellhub.cx') && storeSlug)
        ? { 'X-Store': storeSlug, 'Store': storeSlug }
        : {};

      const { r, ct, text } = await fetchJson(url, extraHeaders);

      if (!ct.toLowerCase().includes('application/json')) {
        lastDetailNonJson = { endpoint: url, status: r.status, statusText: r.statusText, contentType: ct, preview: text.substring(0, 200) };
        continue;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        lastDetailNonJson = { endpoint: url, status: r.status, statusText: r.statusText, contentType: ct, preview: text.substring(0, 200) };
        continue;
      }

      if (!r.ok) {
        lastDetailJsonError = { endpoint: url, status: r.status, statusText: r.statusText, message: json.message || json.error || 'Sellhub error' };
        continue;
      }

      invPayload = json;
      usedDetailEndpoint = url;
      break;
    }

    if (!invPayload) {
      return res.status(502).json({
        error: 'Sellhub returned non-JSON invoice response',
        triedEndpoints: detailCandidates,
        lastNonJson: lastDetailNonJson,
        lastJsonError: lastDetailJsonError
      });
    }

    // Normalize output for frontend
    const invoiceDetails = invPayload.invoice || invPayload;

    return res.status(200).json({
      success: true,
      invoice: invoiceDetails,
      debug: {
        usedListEndpoint,
        usedDetailEndpoint
      }
    });
  } catch (error) {
    console.error('Get Invoice error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};


