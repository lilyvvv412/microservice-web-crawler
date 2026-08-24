const { getClient } = require('../elastic/connection');
const { createClient } = require('redis');

// Redis client for caching
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  await redisClient.connect();
})();

/** ES rejects metadata fields like _id inside the document body. */
const toIndexDocument = (pageData = {}) => {
  const {
    _id,
    id,
    __v,
    ...document
  } = pageData;

  if (!document.domain && document.url) {
    document.domain = new URL(document.url).hostname;
  }

  return {
    docId: String(_id || id || ''),
    document,
  };
};

exports.indexPage = async (req, res) => {
  try {
    const { docId, document } = toIndexDocument(req.body);
    const client = getClient();

    if (!docId) {
      return res.status(400).json({ error: 'Document id (_id or id) is required' });
    }

    if (!document.url) {
      return res.status(400).json({ error: 'url is required' });
    }

    const result = await client.index({
      index: 'pages',
      id: docId,
      body: document,
      refresh: 'wait_for'
    });

    res.status(201).json({
      message: 'Page indexed successfully',
      result
    });
  } catch (error) {
    console.error('Error indexing page:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.bulkIndex = async (req, res) => {
  try {
    const { pages } = req.body;
    const client = getClient();

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty pages array' });
    }

    const operations = pages.flatMap((page) => {
      const { docId, document } = toIndexDocument(page);
      return [
        { index: { _index: 'pages', _id: docId || undefined } },
        document
      ];
    });

    // Execute bulk operation
    const result = await client.bulk({
      refresh: 'wait_for',
      body: operations
    });

    // Check for errors
    const hasErrors = result.body.errors;
    const errorItems = hasErrors
      ? result.body.items.filter(item => item.index.error)
      : [];

    res.status(hasErrors ? 207 : 200).json({
      message: hasErrors
        ? 'Bulk indexing completed with some errors'
        : 'Bulk indexing completed successfully',
      totalProcessed: pages.length,
      successful: pages.length - errorItems.length,
      failed: errorItems.length,
      errors: errorItems.map(item => ({
        id: item.index._id,
        reason: item.index.error.reason
      }))
    });
  } catch (error) {
    console.error('Error bulk indexing pages:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const { id } = req.params;
    const client = getClient();

    const result = await client.delete({
      index: 'pages',
      id,
      refresh: 'wait_for'
    });

    res.json({
      message: 'Page deleted successfully',
      result
    });
  } catch (error) {
    // Check if document not found
    if (error.meta && error.meta.statusCode === 404) {
      return res.status(404).json({ error: 'Page not found' });
    }

    console.error('Error deleting page:', error);
    res.status(500).json({ error: error.message });
  }
};
