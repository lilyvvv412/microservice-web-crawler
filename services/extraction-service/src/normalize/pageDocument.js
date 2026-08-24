/**
 * Normalize extraction output into the Storage/Search Page DTO.
 */
const toPageDocument = ({ url, statusCode, headers = {}, content, urls = [] }) => {
  const title = (content.title || '').trim() || url;
  const body = (content.mainContent || '').trim() || title;
  const description = (content.description || '').trim();

  const keywordsMeta =
    typeof content.keywords === 'string'
      ? content.keywords.split(',').map((k) => k.trim()).filter(Boolean)
      : Array.isArray(content.keywords)
        ? content.keywords
        : [];

  const safeHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value == null) continue;
    safeHeaders[String(key).toLowerCase()] = Array.isArray(value)
      ? value.map(String).join('; ')
      : String(value);
  }

  return {
    url,
    title,
    content: body,
    statusCode: Number(statusCode) || 0,
    metadata: {
      description,
      keywords: keywordsMeta,
      author: content.author || undefined,
      publishedDate: content.publishedDate || undefined,
    },
    headers: safeHeaders,
    links: (urls || []).map((link) => ({
      url: link.url,
      text: link.text || '',
      isInternal: Boolean(link.internal ?? link.isInternal),
    })),
    images: (content.images || [])
      .map((img) => ({
        url: img.url || img.src,
        alt: img.alt || '',
      }))
      .filter((img) => img.url),
    lastCrawled: new Date().toISOString(),
  };
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

module.exports = { toPageDocument, isHttpUrl };
