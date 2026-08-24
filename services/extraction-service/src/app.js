const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { htmlExtractor } = require('./extractors/htmlExtractor');
const { urlExtractor } = require('./extractors/urlExtractor');
const { authenticateRequest } = require('./auth/oauth');
const { toPageDocument, isHttpUrl } = require('./normalize/pageDocument');
const logger = require('../../../shared/logger');

const app = express();
const PORT = process.env.PORT || 3001;
const FETCH_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT || 30000);
const DATA_STORAGE_URL = process.env.DATA_STORAGE_URL || 'http://data-storage:3002/api';
const SEARCH_INDEXING_URL = process.env.SEARCH_INDEXING_URL || 'http://search-indexing:3003/api';

app.use(bodyParser.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'data-extraction' });
});

const normalizeHeaderValue = (value) => {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(String).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** MongoDB Page.headers is Map of String — coerce arrays like set-cookie. */
const headersToObject = (headers) => {
  const result = {};
  if (!headers) return result;

  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      result[String(key).toLowerCase()] = normalizeHeaderValue(value);
    });
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    result[String(key).toLowerCase()] = normalizeHeaderValue(value);
  }
  return result;
};

const persistAndIndex = async (pageDocument) => {
  const storageResponse = await axios.post(`${DATA_STORAGE_URL}/pages`, pageDocument, {
    timeout: FETCH_TIMEOUT_MS,
  });
  const storedPage = storageResponse.data;

  const indexPayload = {
    ...pageDocument,
    _id: storedPage._id,
    id: storedPage._id,
    domain: new URL(pageDocument.url).hostname,
  };

  const indexResponse = await axios.post(`${SEARCH_INDEXING_URL}/index`, indexPayload, {
    timeout: FETCH_TIMEOUT_MS,
  });

  return { storedPage, indexResult: indexResponse.data };
};

app.post('/extract', async (req, res) => {
  try {
    const { url, requiresAuth, persist = true } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!isHttpUrl(url)) {
      return res.status(400).json({ error: 'Only http and https URLs are supported' });
    }

    logger.info(`Processing extraction request for URL: ${url}`);

    let html;
    let statusCode = 200;
    let responseHeaders = {};

    if (requiresAuth) {
      const authResult = await authenticateRequest(url, req.body.authConfig);
      if (!authResult.success) {
        return res.status(401).json({ error: 'Authentication failed', details: authResult.error });
      }
      html = authResult.html;
      statusCode = authResult.statusCode || 200;
    } else {
      const response = await axios.get(url, {
        timeout: FETCH_TIMEOUT_MS,
        maxRedirects: 5,
        responseType: 'text',
        headers: {
          'User-Agent': process.env.USER_AGENT || 'web-crawler-bot/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        validateStatus: () => true,
      });

      statusCode = response.status;
      responseHeaders = headersToObject(response.headers);
      html = typeof response.data === 'string' ? response.data : String(response.data);

      if (statusCode >= 400) {
        return res.status(502).json({
          error: 'Failed to fetch URL',
          message: `Upstream responded with ${statusCode}`,
          statusCode,
        });
      }
    }

    const content = await htmlExtractor(html);
    const urls = await urlExtractor(html, url);
    const pageDocument = toPageDocument({
      url,
      statusCode,
      headers: responseHeaders,
      content,
      urls,
    });

    let storedPage = null;
    let indexResult = null;

    if (persist !== false) {
      ({ storedPage, indexResult } = await persistAndIndex(pageDocument));
    }

    return res.status(200).json({
      url,
      page: storedPage || pageDocument,
      content,
      urls,
      indexed: Boolean(indexResult),
      indexResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error.response?.data?.error || error.message;
    logger.error(`Extraction error: ${message}`, { error: message });
    return res.status(500).json({
      error: 'Extraction failed',
      message,
    });
  }
});

app.listen(PORT, () => {
  logger.info(`Data extraction service running on port ${PORT}`);
});

module.exports = app;
