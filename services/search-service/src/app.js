const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { connectToElasticsearch } = require('./elastic/connection');
const searchController = require('./controllers/search');
const indexController = require('./controllers/index');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

// Connect to Elasticsearch
connectToElasticsearch();

// Routes
app.post('/api/index', indexController.indexPage);
app.post('/api/bulk-index', indexController.bulkIndex);
app.delete('/api/index/:id', indexController.deletePage);
app.get('/api/search', searchController.search);
app.get('/api/suggest', searchController.suggest);
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Search Indexing Service running on port ${PORT}`);
});

module.exports = app;
