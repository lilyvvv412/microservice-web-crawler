const { getClient } = require('./connection');

exports.updateMappings = async () => {
  const client = getClient();

  try {
    await client.indices.putMapping({
      index: 'pages',
      body: {
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
    });

    console.log('Mappings updated successfully');
  } catch (error) {
    console.error(`Error updating mappings: ${error.message}`);
    throw error;
  }
};
