// src/server.js

import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { getPool } from './db/pool.js';
import verificationRoutes from './routes/verification.js';

const app = express();
 
// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', verificationRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Verification Oracle',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      verify: 'POST /api/verify',
      health: 'GET /api/health',
      networkInfo: 'GET /api/network-info',
      verifyAttestation: 'GET /api/verify-attestation/:signature'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = config.port;

app.listen(PORT, async () => {
  console.log('\n🚀 ================================');
  console.log(`🔐 Verification Oracle Starting...`);
  console.log('🚀 ================================\n');
  
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Base URL: http://localhost:${PORT}\n`);
  
  // Test database connection
  try {
    const pool = getPool();
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message, '\n');
  }
  
  console.log('🚀 ================================');
  console.log('✅ Verification Oracle Ready!');
  console.log('🚀 ================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📴 Shutting down gracefully...');
  process.exit(0);
});