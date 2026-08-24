const { Client } = require('@elastic/elasticsearch');

let client;

const connectToElasticsearch = async () => {
  try {
    client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200',
      maxRetries: 5,
      requestTimeout: 60000,
    });

    const { body } = await client.ping();
    console.log('Elasticsearch connected successfully');

    // Create index if it doesn't exist
    const indexExists = await client.indices.exists({ index: 'pages' });

    if (!indexExists.body) {
      await createPagesIndex();
    }

  } catch (error) {
    console.error(`Error connecting to Elasticsearch: ${error.message}`);
    // Retry connection after delay
    setTimeout(connectToElasticsearch, 5000);
  }
};

const createPagesIndex = async () => {
  try {
    const { body } = await client.indices.create({
      index: 'pages',
      body: {
        settings: {
          analysis: {
            analyzer: {
              html_strip_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                char_filter: ['html_strip'],
                filter: ['lowercase', 'stop', 'snowball']
              }
            }
          },
          number_of_shards: 1,
          number_of_replicas: 0
        },
        mappings: {
          properties: {
            url: { type: 'keyword' },
            title: {
              type: 'text',
              analyzer: 'html_strip_analyzer',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            content: {
              type: 'text',
              analyzer: 'html_strip_analyzer'
            },
            metadata: {
              properties: {
                description: { type: 'text' },
                keywords: { type: 'keyword' },
                author: { type: 'keyword' },
                publishedDate: { type: 'date' }
              }
            },
            links: {
              type: 'nested',
              properties: {
                url: { type: 'keyword' },
                text: { type: 'text' },
                isInternal: { type: 'boolean' }
              }
            },
            images: {
              type: 'nested',
              properties: {
                url: { type: 'keyword' },
                alt: { type: 'text' }
              }
            },
            domain: { type: 'keyword' },
            lastCrawled: { type: 'date' },
            statusCode: { type: 'integer' }
          }
        }
      }
    });

    console.log('Pages index created successfully');
  } catch (error) {
    console.error(`Error creating index: ${error.message}`);
    throw error;
  }
};

const getClient = () => {
  if (!client) {
    throw new Error('Elasticsearch client not initialized');
  }
  return client;
};

module.exports = {
  connectToElasticsearch,
  getClient,
  createPagesIndex
};
