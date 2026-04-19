const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// --- Compression (gzip/brotli) for all responses ---
app.use(compression());

// Middleware
app.use(express.json({ limit: '50kb' })); // cap request body size
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Mount routes
const transactions = require('./routes/transactions');
app.use('/api/transactions', transactions);
const auth = require('./routes/auth');
app.use('/api/auth', auth);

// Fallback for unhandled routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
