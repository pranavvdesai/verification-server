

import { create } from '@web3-storage/w3up-client';
import * as DID from '@ipld/dag-ucan/did';
import * as Delegation from '@ucanto/core/delegation';






const SESSION_TIMEOUT_MS = 15 * 60 * 1000; 

let client = null;
let spaceDid = process.env.STORACHA_SPACE_DID ?? null;
let lastInitAt = 0;
let initialized = false;

const DEFAULT_STEP_TIMEOUT = Number(process.env.STORACHA_STEP_TIMEOUT_MS || 45000);

function nowTs() {
  return new Date().toISOString();
}

function isExpired() {
  if (!initialized) return true;
  return Date.now() - lastInitAt > SESSION_TIMEOUT_MS;
}

async function withTimeout(label, promise, timeoutMs = DEFAULT_STEP_TIMEOUT) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`[Storacha] ${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(timeout);
  }
}

async function initClient() {
  console.log(`[Storacha] initClient start @ ${nowTs()}`);

  const email = process.env.STORACHA_EMAIL;
  const savedSpaceDid = process.env.STORACHA_SPACE_DID ?? null;

  if (!email) {
    throw new Error('STORACHA_EMAIL not set in .env');
  }

  client = await create();
  console.log('[Storacha] Client created');

  
  console.log('[Storacha] login() starting for', email);
  const account = await withTimeout('client.login', client.login(email));
  console.log('[Storacha] login() resolved; waiting on plan...');

  const skipPlanWait = process.env.STORACHA_SKIP_PLAN_WAIT === 'true';
  if (!skipPlanWait) {
    await withTimeout('account.plan.wait', account.plan.wait());
    console.log('[Storacha] Plan ready');
  } else {
    console.log('[Storacha] Skipping plan.wait because STORACHA_SKIP_PLAN_WAIT=true');
  }

  
  if (savedSpaceDid) {
    spaceDid = savedSpaceDid;
    console.log('[Storacha] Reusing saved spaceDid from env:', spaceDid);
    await client.setCurrentSpace(spaceDid);
    initialized = true;
    lastInitAt = Date.now();
    return spaceDid;
  }

  
  const existingSpaces = [];
  for await (const space of client.spaces()) {
    existingSpaces.push(space);
  }

  const zkSpace = existingSpaces.find((s) => s.name === 'zk-proofs');

  if (zkSpace) {
    spaceDid = zkSpace.did();
    console.log('[Storacha] Found existing "zk-proofs" space:', spaceDid);
    await client.setCurrentSpace(spaceDid);
  } else {
    
    console.log('[Storacha] Creating space "zk-proofs" …');
    const space = await client.createSpace('zk-proofs', { account });
    spaceDid = space.did();
    console.log('[Storacha] Created space:', spaceDid);
    await client.setCurrentSpace(spaceDid);

    
    const agentDid = client.agent.did();
    console.log('[Storacha] Creating delegation for agent:', agentDid);

    const delegation = await client.createDelegation(
      DID.parse(agentDid),
      ['space/blob/add', 'space/index/add', 'upload/add', 'store/add'],
      { expiration: Infinity }
    );

    console.log('[Storacha] Delegation CID:', delegation.cid);
    const { ok: archiveBytes } = await delegation.archive();
    const { ok: proof } = await Delegation.extract(new Uint8Array(archiveBytes));

    if (!proof) {
      throw new Error('[Storacha] Failed to extract delegation proof');
    }

    await client.addSpace(proof);
    console.log('[Storacha] Shared space with agent');

    console.log('\n[Storacha] ⚠️ Add this to your .env file:\n');
    console.log(`STORACHA_SPACE_DID=${spaceDid}\n`);
    console.log('[Storacha] Then restart the server to skip space creation next time.');
  }

  initialized = true;
  lastInitAt = Date.now();
  console.log('[Storacha] initClient complete, spaceDid =', spaceDid);

  return spaceDid;
}

async function ensureClientReady() {
  console.log('[Storacha] ensureClientReady');
  if (client && spaceDid && !isExpired()) {
    console.log('[Storacha] Reusing cached client/space');
    return;
  }
  await initClient();
}

class StorachaService {
    async initialize() {
        await ensureClientReady();
    }
  isReady() {
    return !!client && !!spaceDid && !isExpired();
  }

    async uploadJSON(data, filename = 'proof.json') {
    try {
      await ensureClientReady();

      console.log(`[Storacha] Uploading ${filename} to zk-proofs space...`);

      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], filename, { type: 'application/json' });

      const cid = await client.uploadFile(file);
      const cidStr = cid.toString();
      const url = `https://${cidStr}.ipfs.w3s.link`;

      console.log('[Storacha] Upload complete →', cidStr);

      return {
        cid: cidStr,
        url,
        filename,
        size: jsonString.length,
      };
    } catch (err) {
      console.error('[Storacha] Upload failed:', err);
      throw err;
    }
  }

    async retrieveJSON(cid) {
    try {
      const url = `https://${cid}.ipfs.w3s.link`;
      console.log('[Storacha] Fetching proof from', url);

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch JSON: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      console.error('[Storacha] Retrieval failed:', err);
      throw err;
    }
  }
}

export const storachaService = new StorachaService();
