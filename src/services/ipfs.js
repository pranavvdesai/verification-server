// src/services/ipfs.js

import { create } from 'ipfs-http-client';
import { config } from '../config/index.js';

class IPFSService {
  constructor() {
    this.client = null;
    this.initialize();
  }

  initialize() {
    try {
      // Option 1: Using Infura IPFS (recommended)
      if (config.ipfs.projectId && config.ipfs.projectSecret) {
        const auth = 'Basic ' + Buffer.from(
          config.ipfs.projectId + ':' + config.ipfs.projectSecret
        ).toString('base64');

        this.client = create({
          host: 'ipfs.infura.io',
          port: 5001,
          protocol: 'https',
          headers: {
            authorization: auth,
          },
        });
        
        console.log('✅ IPFS client initialized (Infura)');
      } 
      // Option 2: Using Pinata or other provider
      else {
        this.client = create({
          url: config.ipfs.apiUrl
        });
        
        console.log('✅ IPFS client initialized (Custom)');
      }
    } catch (error) {
      console.error('❌ Failed to initialize IPFS client:', error.message);
      // Don't exit - IPFS is optional for basic testing
    }
  }

  /**
   * Upload JSON data to IPFS
   */
  async upload(data) {
    try {
      if (!this.client) {
        console.warn('⚠️ IPFS client not initialized, skipping upload');
        return null;
      }

      const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      
      console.log('📤 Uploading to IPFS...');
      
      const result = await this.client.add(jsonString);
      const cid = result.path; // Content ID (hash)
      
      console.log(`✅ Uploaded to IPFS: ${cid}`);
      
      return {
        cid,
        url: `${config.ipfs.gateway}${cid}`,
        size: result.size
      };
    } catch (error) {
      console.error('❌ IPFS upload failed:', error.message);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  /**
   * Retrieve data from IPFS
   */
  async retrieve(cid) {
    try {
      if (!this.client) {
        throw new Error('IPFS client not initialized');
      }

      console.log(`📥 Retrieving from IPFS: ${cid}`);
      
      const chunks = [];
      for await (const chunk of this.client.cat(cid)) {
        chunks.push(chunk);
      }
      
      const data = Buffer.concat(chunks).toString();
      
      console.log(`✅ Retrieved from IPFS: ${cid}`);
      
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ IPFS retrieval failed:', error.message);
      throw new Error(`IPFS retrieval failed: ${error.message}`);
    }
  }

  /**
   * Generate gateway URL for a CID
   */
  getGatewayUrl(cid) {
    return `${config.ipfs.gateway}${cid}`;
  }

  /**
   * Check if IPFS is available
   */
  isAvailable() {
    return this.client !== null;
  }
}

export const ipfsService = new IPFSService();