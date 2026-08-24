const logger = require('../../../../shared/logger');

/**
 * Parse and clean extracted content
 * @param {string} content - The raw content to parse
 * @returns {string} - Cleaned content
 */
const parseContent = (content) => {
  if (!content) return '';

  try {
    // Remove extra whitespace
    let parsed = content.replace(/\s+/g, ' ');

    // Remove non-printable characters
    parsed = parsed.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Trim the content
    parsed = parsed.trim();

    return parsed;
  } catch (error) {
    logger.error(`Content parsing error: ${error.message}`, { error });
    return content; // Return original content on error
  }
};

/**
 * Extract specific data pattern from text
 * @param {string} text - The text to search
 * @param {RegExp} pattern - The pattern to match
 * @returns {Array} - Array of matches
 */
const extractPattern = (text, pattern) => {
  if (!text || !pattern) return [];

  try {
    const matches = text.match(pattern) || [];
    return matches;
  } catch (error) {
    logger.error(`Pattern extraction error: ${error.message}`, { error });
    return [];
  }
};

/**
 * Extract metadata from HTML
 * @param {Object} $ - Cheerio object
 * @returns {Object} - Extracted metadata
 */
const extractMetadata = ($) => {
  if (!$) return {};

  try {
    const metadata = {};

    // Extract meta tags
    $('meta').each((i, el) => {
      const name = $(el).attr('name') || $(el).attr('property');
      const content = $(el).attr('content');

      if (name && content) {
        metadata[name] = content;
      }
    });

    return metadata;
  } catch (error) {
    logger.error(`Metadata extraction error: ${error.message}`, { error });
    return {};
  }
};

module.exports = {
  parseContent,
  extractPattern,
  extractMetadata
};
