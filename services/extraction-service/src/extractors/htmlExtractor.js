const cheerio = require('cheerio');
const { parseContent } = require('../utils/parser');
const logger = require('../../../../shared/logger');

/**
 * Extracts structured content from HTML
 * @param {string} html - The HTML content to extract data from
 * @returns {Object} - Extracted content
 */
const htmlExtractor = async (html) => {
  try {
    const $ = cheerio.load(html);

    // Remove script tags, style tags, and comments
    $('script, style, comment').remove();

    // Extract basic page information
    const title = $('title').text().trim();
    const description = $('meta[name="description"]').attr('content') || '';
    const keywords = $('meta[name="keywords"]').attr('content') || '';
    const canonical = $('link[rel="canonical"]').attr('href') || '';

    // Extract main content
    const mainContent = parseContent($('body').text());

    // Extract headings
    const headings = {
      h1: $('h1').map((i, el) => $(el).text().trim()).get(),
      h2: $('h2').map((i, el) => $(el).text().trim()).get(),
      h3: $('h3').map((i, el) => $(el).text().trim()).get(),
    };

    // Extract images
    const images = $('img').map((i, el) => ({
      src: $(el).attr('src'),
      alt: $(el).attr('alt') || '',
      width: $(el).attr('width') || null,
      height: $(el).attr('height') || null
    })).get().filter(img => img.src);

    // Extract structured data if available
    let structuredData = [];
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html());
        structuredData.push(data);
      } catch (e) {
        logger.warn(`Failed to parse JSON-LD: ${e.message}`);
      }
    });

    return {
      title,
      description,
      keywords,
      canonical,
      mainContent,
      headings,
      images,
      structuredData,
      extractedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`HTML extraction error: ${error.message}`, { error });
    throw new Error(`HTML extraction failed: ${error.message}`);
  }
};

module.exports = { htmlExtractor };
