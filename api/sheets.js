// Vercel Serverless Function: Google Sheets CSV proxy with server-side caching and validation

const SHEET_URLS = {
  clientAdsPerformance: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=964722332&single=true&output=csv',
  setupTiming: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=646836237&single=true&output=csv',
  closerForm: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=986050898&single=true&output=csv',
  fanbasis: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=102644999&single=true&output=csv',
  cashflow: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=787866349&single=true&output=csv',
};

const REQUIRED_COLUMNS = {
  clientAdsPerformance: ['Client', 'Ad Account Name', 'Status', 'State', 'Total Ad Spend', 'Lifetime Seller Leads', 'Lifetime Buyer Leads', 'Daily Set Ad Spend'],
  setupTiming: ['VAM', 'CSM', 'Status', 'Paid date', 'Ad Live date', 'Billing cycle', 'MRR'],
};

// Fallback header row hints (used if auto-detect fails)
const HEADER_ROW_HINTS = {
  clientAdsPerformance: 1, // row index 1 (row 2)
  setupTiming: 0,          // row index 0 (row 1)
};

// Rows to skip after header row
const SKIP_AFTER_HEADER = {
  clientAdsPerformance: 0, // data starts immediately after header
  setupTiming: 1,          // skip 1 row (sub-header) after header
};

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const cache = new Map();

// --- CSV Parser ---
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      let value = '';
      // Skip leading whitespace (but not newlines)
      while (i < len && text[i] === ' ') i++;

      if (i < len && text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              // Escaped quote
              value += '"';
              i += 2;
            } else {
              // End of quoted field
              i++; // skip closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
        // Skip anything until comma or end of line
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
      } else {
        // Unquoted field
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          value += text[i];
          i++;
        }
      }

      row.push(value);

      if (i < len && text[i] === ',') {
        i++; // skip comma, continue to next field
      } else {
        // End of row
        break;
      }
    }

    // Skip line endings
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;

    // Only add non-empty rows
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

// --- Header normalization ---
function normalizeHeader(h) {
  return (h || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// --- Auto-detect header row ---
function detectHeaderRow(rows, sheetName) {
  const required = REQUIRED_COLUMNS[sheetName];
  if (!required || rows.length === 0) {
    // No required columns defined; use hint or default to 0
    return HEADER_ROW_HINTS[sheetName] || 0;
  }

  const normalizedRequired = required.map(normalizeHeader);
  let bestRow = HEADER_ROW_HINTS[sheetName] || 0;
  let bestScore = 0;
  const scanLimit = Math.min(5, rows.length);

  for (let r = 0; r < scanLimit; r++) {
    const normalizedCells = rows[r].map(normalizeHeader);
    let score = 0;
    for (const req of normalizedRequired) {
      if (normalizedCells.includes(req)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  return bestRow;
}

// --- Validate headers ---
function validateHeaders(headers, sheetName) {
  const required = REQUIRED_COLUMNS[sheetName];
  if (!required) return { warnings: [], errors: [], headerMap: {} };

  const warnings = [];
  const errors = [];
  const headerMap = {}; // required name -> actual header name

  const normalizedHeaders = headers.map(normalizeHeader);

  for (const req of required) {
    // Exact match first
    const exactIdx = headers.indexOf(req);
    if (exactIdx !== -1) {
      headerMap[req] = req;
      continue;
    }

    // Fuzzy match
    const normalizedReq = normalizeHeader(req);
    const fuzzyIdx = normalizedHeaders.indexOf(normalizedReq);
    if (fuzzyIdx !== -1) {
      const actualHeader = headers[fuzzyIdx];
      headerMap[req] = actualHeader;
      warnings.push(`Column "${req}" matched via fuzzy match to "${actualHeader}"`);
    } else {
      errors.push(`Required column "${req}" not found in headers`);
    }
  }

  return { warnings, errors, headerMap };
}

// --- Fetch and parse a single sheet ---
async function fetchSheet(sheetName) {
  const url = SHEET_URLS[sheetName];
  if (!url) throw new Error(`Unknown sheet: ${sheetName}`);

  // Check cache
  const cached = cache.get(sheetName);
  const now = Date.now();
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
    return { ...cached.result, fromCache: true };
  }

  // Fetch CSV
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sheetName}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();

  // Parse CSV
  const allRows = parseCSV(text);
  if (allRows.length === 0) {
    return { data: [], headers: [], rowCount: 0, cachedAt: now, fromCache: false, warnings: [], errors: ['Sheet returned no data'], headerRow: 0 };
  }

  // Detect header row
  const headerRow = detectHeaderRow(allRows, sheetName);
  const headers = allRows[headerRow].map(h => h.trim());

  // Validate headers
  const { warnings, errors, headerMap } = validateHeaders(headers, sheetName);

  // Determine data start row
  const skipAfter = SKIP_AFTER_HEADER[sheetName] || 0;
  const dataStartRow = headerRow + 1 + skipAfter;

  // Build row objects
  const data = [];
  for (let r = dataStartRow; r < allRows.length; r++) {
    const row = allRows[r];
    // Skip completely empty rows
    const hasContent = row.some(cell => cell.trim() !== '');
    if (!hasContent) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (header) {
        obj[header] = (row[c] || '').trim();
      }
    }
    data.push(obj);
  }

  const result = {
    data,
    headers,
    rowCount: data.length,
    cachedAt: now,
    fromCache: false,
    warnings,
    errors,
    headerRow,
  };

  // Store in cache
  cache.set(sheetName, { cachedAt: now, result });

  return result;
}

// --- Handler ---
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // In-memory cache handles caching; don't cache POST at CDN level
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const { action, sheet } = req.body || {};

    if (action === 'fetchAll') {
      const [clientAdsPerformance, setupTiming] = await Promise.all([
        fetchSheet('clientAdsPerformance'),
        fetchSheet('setupTiming'),
      ]);
      return res.status(200).json({ clientAdsPerformance, setupTiming });
    }

    if (action === 'fetchSheet') {
      if (!sheet || !SHEET_URLS[sheet]) {
        return res.status(400).json({ error: `Invalid sheet name. Valid options: ${Object.keys(SHEET_URLS).join(', ')}` });
      }
      const result = await fetchSheet(sheet);
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Invalid action. Use "fetchAll" or "fetchSheet".' });
  } catch (err) {
    console.error('sheets API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
