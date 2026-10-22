import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const express = require('express');
const cors = require('cors');

// Load environment variables from .env if present
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

console.log(`[API] Initializing server on port ${PORT}...`);

app.use(cors());
app.use(express.json());

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const tmdbCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour memory cache
const CACHE_DIR = path.join(__dirname, '.cache');
const MAX_TMDB_PAGES = 500;

if (!fs.existsSync(CACHE_DIR)) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
}

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  timeout: 10000
});

const FEATURED_CAMPAIGN_IDS = [
  693134, // Dune: Part Two
  346698, // Barbie
  872585, // Oppenheimer
  856289, // Jawan
  569094, // Spider-Man: Across the Spider-Verse
  545611, // Everything Everywhere All at Once
  787699, // Animal
  533535  // Deadpool & Wolverine
];

const CAMPAIGN_LABELS = {
  693134: 'DISTRIBUTION ANALYSIS',
  346698: 'CULTURAL IMPACT',
  872585: 'MARKETING CASE STUDY',
  856289: 'CAMPAIGN BREAKDOWN',
  569094: 'DISTRIBUTION ANALYSIS',
  545611: 'CULTURAL IMPACT',
  787699: 'CAMPAIGN BREAKDOWN',
  533535: 'MARKETING CASE STUDY'
};

const TMDB_DEFAULT_KEY = '4f2cf009f072ced9e20e584803d8400e';
const TMDB_DEFAULT_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0ZjJjZjAwOWYwNzJjZWQ5ZTIwZTU4NDgwM2Q4NDAwZSIsIm5iZiI6MTc4OTE0NjEyOS42NjYsInN1YiI6IjZhYTQzNDExNTUwMWRmZjhiZjI4OWNmYyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.MDPNXL50yjs5FXCTDFh-PPg_AmPlxkf_8C16mVB8XG8';

function getTMDBAuth() {
  const token = (typeof process !== 'undefined' && (process.env?.VITE_TMDB_ACCESS_TOKEN || process.env?.TMDB_ACCESS_TOKEN)) || TMDB_DEFAULT_TOKEN;
  const key = (typeof process !== 'undefined' && (process.env?.VITE_TMDB_API_KEY || process.env?.TMDB_API_KEY)) || TMDB_DEFAULT_KEY;

  if (token && token.startsWith('eyJ')) {
    return { type: 'bearer', token };
  }
  return { type: 'key', key };
}

function getDiskCache(key) {
  try {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const file = path.join(CACHE_DIR, `${hash}.json`);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) { // 24hr disk TTL
        return parsed.data;
      }
    }
  } catch (_) {}
  return null;
}

function setDiskCache(key, data) {
  try {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const file = path.join(CACHE_DIR, `${hash}.json`);
    fs.writeFileSync(file, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (_) {}
}

function nativeHttpsRequest(urlStr, headers = {}, retries = 3) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const u = new URL(urlStr);
      const req = https.request(u, {
        method: 'GET',
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          ...headers
        },
        timeout: 9000
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(e);
            }
          } else if (res.statusCode === 429 && n > 0) {
            setTimeout(() => attempt(n - 1), 400);
          } else {
            const err = new Error(`TMDB error ${res.statusCode}: ${raw.slice(0, 150)}`);
            err.statusCode = res.statusCode;
            if (n > 0 && res.statusCode >= 500) {
              setTimeout(() => attempt(n - 1), 300);
            } else {
              reject(err);
            }
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (n > 0) setTimeout(() => attempt(n - 1), 200);
        else reject(new Error('TMDB connection timed out'));
      });

      req.on('error', (err) => {
        if (n > 0) setTimeout(() => attempt(n - 1), 200);
        else reject(err);
      });

      req.end();
    }
    attempt(retries);
  });
}

async function fetchFromTMDB(endpoint, params = {}) {
  const auth = getTMDBAuth();
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  const headers = {};

  if (auth.type === 'bearer') {
    headers['Authorization'] = `Bearer ${auth.token}`;
  } else {
    url.searchParams.set('api_key', auth.key);
  }

  url.searchParams.set('language', 'en-US');
  if (!Object.prototype.hasOwnProperty.call(params, 'include_adult')) {
    url.searchParams.set('include_adult', 'false');
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const cacheKey = url.toString();
  const memoryCached = tmdbCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < CACHE_TTL_MS) {
    return memoryCached.data;
  }

  const diskCached = getDiskCache(cacheKey);
  if (diskCached) {
    tmdbCache.set(cacheKey, { data: diskCached, timestamp: Date.now() });
    return diskCached;
  }

  try {
    const data = await nativeHttpsRequest(url.toString(), headers, 3);
    tmdbCache.set(cacheKey, { data, timestamp: Date.now() });
    setDiskCache(cacheKey, data);
    return data;
  } catch (err) {
    // If request fails but disk cache has any previous version, fallback to it
    if (diskCached) {
      console.warn(`[TMDB] Serving stale cache for ${endpoint} due to error: ${err.message}`);
      return diskCached;
    }
    throw err;
  }
}

async function mapConcurrent(items, fn, concurrency = 2) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

function enrichMovie(movie) {
  if (!movie) return null;
  const id = Number(movie.id);
  const isFeatured = FEATURED_CAMPAIGN_IDS.includes(id);
  return {
    ...movie,
    hasCampaign: isFeatured,
    campaignLabel: isFeatured ? (CAMPAIGN_LABELS[id] || 'CAMPAIGN BREAKDOWN') : null
  };
}

function filterAdultContent(movies) {
  if (!Array.isArray(movies)) return [];
  return movies.filter(movie => movie && movie.adult !== true);
}

function capTotalResults(totalResults, limit) {
  return Math.min(Math.max(0, totalResults), MAX_TMDB_PAGES * limit);
}

function capTotalPages(totalResults, limit) {
  return Math.max(1, Math.ceil(capTotalResults(totalResults, limit) / limit));
}

// Helper function to read config
const readConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading config:', err);
  }
  return { googleSheetsUrl: '' };
};

// Helper function to write config
const writeConfig = (config) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error writing config:', err);
  }
};

const LEADS_FILE = path.join(__dirname, 'leads.json');

// Helper to read leads
const readLeads = () => {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading leads.json:', err);
  }
  return [];
};

// Helper to save leads
const saveLeadLocally = (lead) => {
  try {
    const leads = readLeads();
    leads.unshift({ ...lead, receivedAt: new Date().toISOString() });
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error('Error saving lead locally:', err);
  }
};

// GET /api/config - Retrieve current configuration
app.get('/api/config', (req, res) => {
  const config = readConfig();
  res.json(config);
});

// POST /api/config - Save configuration (like Google Sheets URL)
app.post('/api/config', (req, res) => {
  const { googleSheetsUrl } = req.body;
  
  if (googleSheetsUrl !== undefined) {
    const config = readConfig();
    config.googleSheetsUrl = googleSheetsUrl.trim();
    writeConfig(config);
    console.log(`[Config] Google Sheets Webhook URL updated: ${config.googleSheetsUrl}`);
    return res.json({ success: true, config });
  }
  
  res.status(400).json({ error: 'googleSheetsUrl is required' });
});

// GET /api/leads - View all leads stored locally
app.get('/api/leads', (req, res) => {
  res.json({ leads: readLeads() });
});

// POST /api/enquiry - Forward form submission to Google Sheet & backup locally
app.post('/api/enquiry', async (req, res) => {
  const incomingPayload = req.body || {};
  const payload = {
    ...incomingPayload,
    position: String(incomingPayload.position || '').trim(),
    otherPosition: String(incomingPayload.otherPosition || '').trim()
  };
  const isJoinUsApplication = ['Join Us Application', 'Editor Application'].includes(payload.type);

  if (isJoinUsApplication && !payload.position) {
    return res.status(400).json({ error: 'A position is required for Join Us applications.' });
  }
  if (isJoinUsApplication && payload.position === 'Other' && !payload.otherPosition) {
    return res.status(400).json({ error: 'Please specify the role when selecting Other.' });
  }

  console.log(`[Enquiry] New submission received:`, {
    name: payload.name,
    contact: payload.contact,
    handle: payload.handle,
    position: payload.position || '—'
  });

  // 1. Always back up lead locally so data is never lost
  saveLeadLocally(payload);

  const config = readConfig();
  const googleSheetsUrl = (payload.googleSheetsUrl && payload.googleSheetsUrl.trim()) ||
    config.googleSheetsUrl ||
    process.env.GOOGLE_SHEETS_URL ||
    'https://script.google.com/macros/s/AKfycbzJnIoBHmIqo8JnNz9TYHjFszW1d9mdCNIXuCsYV3g-SFLMxOs19-cijUJfaQwPK1Pvsw/exec';

  if (!googleSheetsUrl || googleSheetsUrl.includes('testing/exec')) {
    console.warn('[Enquiry] Google Sheets URL is not set or using placeholder.');
    return res.json({
      success: true,
      backedUpLocally: true,
      sheetSynced: false,
      message: 'Lead saved locally. Provide real Google Sheets URL to sync automatically.'
    });
  }

  try {
    // Forward payload to Google Sheets Web App
    const response = await fetch(googleSheetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const responseText = await response.text();
    console.log(`[Google Sheets] Status: ${response.status} | Response:`, responseText.substring(0, 150));

    res.json({
      success: true,
      backedUpLocally: true,
      sheetSynced: response.ok,
      status: response.status
    });
  } catch (error) {
    console.error('[Google Sheets Error] Failed to forward:', error.message);
    // Still return success: true because lead was saved locally
    res.json({
      success: true,
      backedUpLocally: true,
      sheetSynced: false,
      error: error.message
    });
  }
});

// ─── GET /api/movies - Paginated movies and debounced search ───
app.get('/api/movies', async (req, res) => {
  try {
    // Enable browser-level HTTP caching (5 min max-age, 10 min stale-while-revalidate)
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const query = (req.query.query || '').trim();
    const filter = (req.query.filter || 'all').toLowerCase();
    const genre = (req.query.genre || 'all').trim();
    const year = (req.query.year || 'all').trim();
    const sortBy = (req.query.sortBy || 'popularity.desc').trim();

    // Helper: filter a list of movies by genre and year in-memory
    const applyInMemoryFilters = (movies) => {
      let filtered = movies;
      if (genre !== 'all' && !isNaN(Number(genre))) {
        const gNum = Number(genre);
        filtered = filtered.filter(m => 
          (Array.isArray(m.genre_ids) && m.genre_ids.includes(gNum)) ||
          (Array.isArray(m.genres) && m.genres.some(g => g.id === gNum))
        );
      }
      if (year !== 'all') {
        if (/^\d{4}$/.test(year)) {
          filtered = filtered.filter(m => m.release_date?.startsWith(year));
        } else if (year === '2015-2018') {
          filtered = filtered.filter(m => {
            const y = parseInt(m.release_date?.substring(0, 4), 10);
            return y >= 2015 && y <= 2018;
          });
        } else if (year === '2010-2014') {
          filtered = filtered.filter(m => {
            const y = parseInt(m.release_date?.substring(0, 4), 10);
            return y >= 2010 && y <= 2014;
          });
        } else if (year === '2000-2009') {
          filtered = filtered.filter(m => {
            const y = parseInt(m.release_date?.substring(0, 4), 10);
            return y >= 2000 && y <= 2009;
          });
        } else if (year === 'pre-2000') {
          filtered = filtered.filter(m => {
            const y = parseInt(m.release_date?.substring(0, 4), 10);
            return y < 2000;
          });
        }
      }
      return filtered;
    };

    // 1. Search Query Mode
    if (query.length > 0) {
      const searchParams = { query };
      if (year !== 'all' && /^\d{4}$/.test(year)) {
        searchParams.primary_release_year = year;
      }

      // Calculate TMDB page offsets
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const tmdbStartPage = Math.floor(startIndex / 20) + 1;
      const tmdbEndPage = Math.floor((endIndex - 1) / 20) + 1;

      const pagesToFetch = tmdbStartPage === tmdbEndPage ? [tmdbStartPage] : [tmdbStartPage, tmdbEndPage];
      const results = await Promise.all(
        pagesToFetch.map(p =>
          fetchFromTMDB('/search/movie', { ...searchParams, page: p, include_adult: false }).catch(() => ({ results: [], total_results: 0 }))
        )
      );

      let totalResults = results[0]?.total_results || 0;
      let combined = [];
      results.forEach(r => {
        if (Array.isArray(r.results)) combined.push(...r.results);
      });

      // Apply genre / year range in memory if selected
      if (genre !== 'all' || (year !== 'all' && !/^\d{4}$/.test(year))) {
        combined = applyInMemoryFilters(combined);
        totalResults = combined.length;
      }

      combined = filterAdultContent(combined);

      const sliceStart = startIndex - (tmdbStartPage - 1) * 20;
      const sliced = combined.slice(sliceStart, sliceStart + limit).map(enrichMovie);

      return res.json({
        success: true,
        page,
        limit,
        total_results: capTotalResults(totalResults, limit),
        total_pages: capTotalPages(totalResults, limit),
        results: page > capTotalPages(totalResults, limit) ? [] : sliced
      });
    }

    // 2. Featured Filter
    if (filter === 'campaigns' || sortBy === 'campaigns') {
      let featuredList = (await mapConcurrent(FEATURED_CAMPAIGN_IDS, id =>
        fetchFromTMDB(`/movie/${id}`).catch(() => null), 3
      )).filter(Boolean).map(enrichMovie);

      featuredList = filterAdultContent(applyInMemoryFilters(featuredList));
      const totalResults = featuredList.length;
      const startIndex = (page - 1) * limit;
      const sliced = featuredList.slice(startIndex, startIndex + limit);

      return res.json({
        success: true,
        page,
        limit,
        total_results: capTotalResults(totalResults, limit),
        total_pages: capTotalPages(totalResults, limit),
        results: page > capTotalPages(totalResults, limit) ? [] : sliced
      });
    }

    // 3. Discover Mode with Active Filters (Genre, Year, or custom Sort)
    const hasActiveFilters = (genre !== 'all') || (year !== 'all') || (sortBy !== 'popularity.desc');

    if (hasActiveFilters) {
      const discoverParams = {
        sort_by: sortBy === 'campaigns' ? 'popularity.desc' : sortBy,
        'vote_count.gte': 40
      };

      if (genre !== 'all' && !isNaN(Number(genre))) {
        discoverParams.with_genres = genre;
      }

      if (year !== 'all') {
        if (/^\d{4}$/.test(year)) {
          discoverParams.primary_release_year = year;
        } else if (year === '2015-2018') {
          discoverParams['primary_release_date.gte'] = '2015-01-01';
          discoverParams['primary_release_date.lte'] = '2018-12-31';
        } else if (year === '2010-2014') {
          discoverParams['primary_release_date.gte'] = '2010-01-01';
          discoverParams['primary_release_date.lte'] = '2014-12-31';
        } else if (year === '2000-2009') {
          discoverParams['primary_release_date.gte'] = '2000-01-01';
          discoverParams['primary_release_date.lte'] = '2009-12-31';
        } else if (year === 'pre-2000') {
          discoverParams['primary_release_date.lte'] = '1999-12-31';
        }
      }

      // Calculate TMDB page offsets
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const tmdbStartPage = Math.floor(startIndex / 20) + 1;
      const tmdbEndPage = Math.floor((endIndex - 1) / 20) + 1;

      const pagesToFetch = tmdbStartPage === tmdbEndPage ? [tmdbStartPage] : [tmdbStartPage, tmdbEndPage];
      const results = await Promise.all(
        pagesToFetch.map(p =>
          fetchFromTMDB('/discover/movie', { ...discoverParams, page: p, include_adult: false }).catch(() => ({ results: [], total_results: 0 }))
        )
      );

      const totalResults = results[0]?.total_results || 0;
      let combined = [];
      results.forEach(r => {
        if (Array.isArray(r.results)) combined.push(...r.results);
      });
      combined = filterAdultContent(combined);

      const sliceStart = startIndex - (tmdbStartPage - 1) * 20;
      const sliced = combined.slice(sliceStart, sliceStart + limit).map(enrichMovie);

      return res.json({
        success: true,
        page,
        limit,
        total_results: capTotalResults(totalResults, limit),
        total_pages: capTotalPages(totalResults, limit),
        results: page > capTotalPages(totalResults, limit) ? [] : sliced
      });
    }

    // 4. Default Discovery (Featured Campaigns Priority on Page 1 + Trending)
    const tmdbPage = page;
    const trendingData = await fetchFromTMDB('/trending/movie/week', { page: Math.min(tmdbPage, MAX_TMDB_PAGES), include_adult: false }).catch(() => ({ results: [], total_results: 0 }));
    let list = filterAdultContent(trendingData.results || []).map(enrichMovie);

    if (page === 1) {
      const featuredMovies = filterAdultContent((await mapConcurrent(FEATURED_CAMPAIGN_IDS, id =>
        fetchFromTMDB(`/movie/${id}`).catch(() => null), 3
      )).filter(Boolean)).map(enrichMovie);
      const featuredMap = new Map();
      featuredMovies.forEach(m => featuredMap.set(m.id, m));
      list.forEach(m => {
        if (!featuredMap.has(m.id)) {
          featuredMap.set(m.id, m);
        }
      });
      list = Array.from(featuredMap.values());
    }

    const totalResults = trendingData.total_results || 100;
    const sliced = list.slice(0, limit);

    return res.json({
      success: true,
      page,
      limit,
      total_results: capTotalResults(totalResults, limit),
      total_pages: capTotalPages(totalResults, limit),
      results: page > capTotalPages(totalResults, limit) ? [] : sliced
    });
  } catch (err) {
    console.error('[API /api/movies error]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to load movies from backend',
      details: err.message
    });
  }
});

// ─── GET /api/movies/:id - Full details with trailers & credits ───
app.get('/api/movies/:id', async (req, res) => {
  try {
    // Enable browser-level HTTP caching for dossiers (30 min max-age, 1 hr stale-while-revalidate)
    res.set('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');

    const movieId = parseInt(req.params.id, 10);
    if (!movieId) {
      return res.status(400).json({ error: 'Valid movie ID required' });
    }

    const movie = await fetchFromTMDB(`/movie/${movieId}`, {
      append_to_response: 'videos,credits'
    });

    const enriched = enrichMovie(movie);
    return res.json({
      success: true,
      movie: enriched
    });
  } catch (err) {
    console.error(`[API /api/movies/${req.params.id} error]:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to load movie details',
      details: err.message
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Backend Server] Port ${PORT} already in use. Continuing gracefully.`);
  } else {
    console.error('[Backend Server error]:', err);
  }
});
