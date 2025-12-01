

import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { getPool } from './db/pool.js';
import verificationRoutes from './routes/verification.js';
import { storachaService } from './services/storacha.js';
import zkVerificationRoutes from './routes/zk-verification.js';
import { zkProver } from './services/zk-prover.js';

const app = express();
 

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});


app.use('/api', verificationRoutes);
app.use('/api/zk', zkVerificationRoutes);

console.log('🔐 ZK verification routes mounted at /api/zk');

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


app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined
  });
});


const PORT = config.port;

app.listen(PORT, async () => {
  console.log('\n🚀 ================================');
  console.log(`🔐 Verification Oracle Starting...`);
  console.log('🚀 ================================\n');
  
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Base URL: http://localhost:${PORT}\n`);
  
  
  try {
    const pool = getPool();
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message, '\n');
  }

  try {
    await zkProver.initialize();
    console.log('✅ ZK Prover initialized\n');
  } catch (error) {
    console.error('❌ ZK Prover initialization failed:', error.message);
    console.error('   Make sure circuits are compiled (nargo compile)\n');
  }
  
  
  try {
    await storachaService.initialize();
    console.log('✅ Storacha initialized\n');
  } catch (error) {
    console.error('❌ Storacha initialization failed:', error.message);
    console.error('   Proofs will not be stored. Check STORACHA_EMAIL in .env\n');
  }
  
  console.log('🚀 ================================');
  console.log('✅ Verification Oracle Ready!');
  console.log('🚀 ================================\n');
});


process.on('SIGTERM', () => {
  console.log('\n📴 Shutting down gracefully...');
  process.exit(0);
});
