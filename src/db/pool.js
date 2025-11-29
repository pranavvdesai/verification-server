// src/db/pool.js

import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10, // Max connections for verification server
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: config.nodeEnv === 'production' ? {
        rejectUnauthorized: false
      } : false
    });

    pool.on('error', (err) => {
      console.error('💥 Unexpected database error:', err);
      process.exit(-1);
    });

    pool.on('connect', () => {
      console.log('🔗 Database connection established');
    });

    console.log('✅ Database pool initialized');
  }

  return pool;
}

// Helper function for queries
export async function query(text, params = []) {
  const pool = getPool();
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (config.nodeEnv === 'development') {
      console.log('📊 Query executed', { duration: `${duration}ms`, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error.message);
    throw error;
  }
}

// Transaction helper
export async function transaction(callback) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction rolled back:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Closing database connections...');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});