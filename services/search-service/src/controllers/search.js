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

exports.search = async (req, res) => {
  try {
    const q = req.query.q || req.query.query;
    const {
      domain, // filter by domain
      from = 0,
      size = 10,
      sort = 'relevance', // relevance, date
    } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Try to get from cache first
    const cacheKey = `search:${q}:${domain || 'all'}:${from}:${size}:${sort}`;
    const cachedResults = await redisClient.get(cacheKey);

    if (cachedResults) {
      return res.json(JSON.parse(cachedResults));
    }

    const client = getClient();

    // Build search query
    const searchQuery = {
      index: 'pages',
      body: {
        from: parseInt(from),
        size: parseInt(size),
        _source: {
          excludes: ['content'] // Exclude full content for performance
        },
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: q,
                  fields: ['title^2', 'content', 'metadata.description^1.5'],
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: []
          }
        },
        highlight: {
          fields: {
            title: {},
            content: {
              fragment_size: 150,
              number_of_fragments: 3
            },
            'metadata.description': {}
          }
        }
      }
    };

    // Add domain filter if provided
    if (domain) {
      searchQuery.body.query.bool.filter.push({
        term: { domain }
      });
    }

    // Add sorting
    if (sort === 'date') {
      searchQuery.body.sort = [{ lastCrawled: 'desc' }];
    } else {
      // Default is relevance sort provided by Elasticsearch
    }

    const response = await client.search(searchQuery);

    // Format results
    const results = {
      total: response.body.hits.total.value,
      took: response.body.took,
      hits: response.body.hits.hits.map(hit => ({
        id: hit._id,
        score: hit._score,
        url: hit._source.url,
        title: hit._source.title,
        description: hit._source.metadata?.description || '',
        domain: hit._source.domain,
        lastCrawled: hit._source.lastCrawled,
        highlights: hit.highlight || {}
      }))
    };

    // Cache results for 10 minutes
    await redisClient.set(cacheKey, JSON.stringify(results), {
      EX: 600
    });

    res.json(results);
  } catch (error) {
    console.error('Error searching pages:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.suggest = async (req, res) => {
  try {
    const { q, size = 5 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Try to get from cache first
    const cacheKey = `suggest:${q}:${size}`;
    const cachedResults = await redisClient.get(cacheKey);

    if (cachedResults) {
      return res.json(JSON.parse(cachedResults));
    }

    const client = getClient();

    const response = await client.search({
      index: 'pages',
      body: {
        size: 0,
        suggest: {
          text: q,
          title_suggestions: {
            term: {
              field: 'title.keyword',
              suggest_mode: 'popular',
              sort: 'frequency',
              size: parseInt(size)
            }
          },
          content_suggestions: {
            completion: {
              field: 'content',
              size: parseInt(size)
            }
          }
        },
        // Also get popular search terms containing the query
        aggs: {
          popular_titles: {
            terms: {
              field: 'title.keyword',
              include: `.*${q}.*`,
              size: parseInt(size)
            }
          }
        }
      }
    });

    // Combine suggestions from different sources
    const titleSuggestions = response.body.suggest.title_suggestions[0].options.map(option => option.text);
    const popularTitles = response.body.aggregations.popular_titles.buckets.map(bucket => bucket.key);

    // Combine and deduplicate
    const allSuggestions = [...new Set([...titleSuggestions, ...popularTitles])].slice(0, parseInt(size));

    // Cache results for 1 hour
    await redisClient.set(cacheKey, JSON.stringify(allSuggestions), {
      EX: 3600
    });

    res.json(allSuggestions);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: error.message });
  }
};
