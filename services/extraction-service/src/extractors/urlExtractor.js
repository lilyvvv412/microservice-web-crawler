const cheerio = require('cheerio');
const logger = require('../../../../shared/logger');

/**
 * Extracts and normalizes URLs from HTML.
 * Deduplicates by normalized URL string (Set of objects cannot dedupe).
 */
const urlExtractor = async (html, baseUrl) => {
  try {
    const $ = cheerio.load(html);
    const byUrl = new Map();
    const parsedBaseUrl = new URL(baseUrl);
    const domain = parsedBaseUrl.hostname;

    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const resolvedUrl = new URL(href, baseUrl);

        if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
          return;
        }

        let normalizedUrl = resolvedUrl.toString().replace(/#.*$/, '');
        if (normalizedUrl.endsWith('/') && normalizedUrl !== `${resolvedUrl.protocol}//${resolvedUrl.host}/`) {
          normalizedUrl = normalizedUrl.slice(0, -1);
        }

        if (byUrl.has(normalizedUrl)) {
          return;
        }

        byUrl.set(normalizedUrl, {
          url: normalizedUrl,
          internal: resolvedUrl.hostname === domain,
          text: $(el).text().trim().substring(0, 200) || '',
          nofollow: Boolean($(el).attr('rel') && $(el).attr('rel').includes('nofollow')),
        });
      } catch (e) {
        logger.warn(`Failed to parse URL: ${href}`, { error: e.message });
      }
    });

    return Array.from(byUrl.values());
  } catch (error) {
    logger.error(`URL extraction error: ${error.message}`, { error });
    throw new Error(`URL extraction failed: ${error.message}`);
  }
};

module.exports = { urlExtractor };
