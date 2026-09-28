const express = require('express');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const logger = require('./lib/logger');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/content-assets', express.static(path.resolve(__dirname, '..', 'content', 'aulas', 'assets')));
app.use(routes);

// Simple health route
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Centralized error handler — any thrown errors will be logged
// and return a generic 500 response. Route-level handlers may
// still return custom statuses when appropriate.
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});