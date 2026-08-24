const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { connectDB } = require('./db/connection');
const storageController = require('./controllers/storage');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'data-storage' });
});

// Connect to MongoDB
connectDB();

// Routes
app.post('/api/pages', storageController.storePage);
app.get('/api/pages/:id', storageController.getPageById);
app.get('/api/pages', storageController.getPages);
app.get('/api/page', storageController.getPageByUrl);
app.post('/api/urls', storageController.storeUrl);
app.get('/api/urls/pending', storageController.getPendingUrls);
app.put('/api/urls/:id', storageController.updateUrlStatus);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Data Storage Service running on port ${PORT}`);
});

module.exports = app;
