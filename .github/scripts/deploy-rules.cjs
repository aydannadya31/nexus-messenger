/**
 * Deploy Firestore security rules using google-auth-library + REST API.
 * Workflow: create new ruleset, delete old release, create new release.
 */
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const PROJECT = process.env.FIREBASE_PROJECT || 'genel-a189b';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/firebase',
           'https://www.googleapis.com/auth/cloud-platform',
           'https://www.googleapis.com/auth/datastore']
});

let _client = null;
async function getClient() {
  if (!_client) _client = await auth.getClient();
  return _client;
}

async function api(method, url, body) {
  const client = await getClient();
  const hdrs = await client.getRequestHeaders(url);
  hdrs['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers: hdrs,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new Error(`${method} ${url}\n${res.status}: ${text.substring(0, 400)}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const rulesContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'
  );

  // Step 1: Create new ruleset
  console.log('Creating ruleset...');
  const ruleset = await api('POST',
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    { source: { files: [{ name: 'firestore.rules', content: rulesContent }] } }
  );
  console.log('Ruleset created:', ruleset.name);

  // Step 2: Delete existing release (404 = doesn't exist yet, that's fine)
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  console.log('Deleting old release...');
  await api('DELETE', `https://firebaserules.googleapis.com/v1/${releaseName}`);
  console.log('Old release deleted (or did not exist)');

  // Step 3: Create new release pointing to our ruleset
  console.log('Creating new release...');
  const release = await api('POST',
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
    {
      name: releaseName,
      rulesetName: ruleset.name
    }
  );
  console.log('Release created:', release.name);
  console.log('\n--- FIREBASE SECURITY RULES DEPLOYED SUCCESSFULLY! ---');
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
