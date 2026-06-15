/**
 * Deploy Firestore security rules using google-auth-library + REST API.
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
  if (!res.ok) throw new Error(`${method} ${url}\n${res.status}: ${text.substring(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const rulesContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'
  );

  // Step 1: Create ruleset
  console.log('Creating ruleset...');
  const ruleset = await api('POST',
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    { source: { files: [{ name: 'firestore.rules', content: rulesContent }] } }
  );
  console.log('Ruleset created:', ruleset.name);

  // Step 2: Release to cloud.firestore
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  console.log('Releasing ruleset to', releaseName);
  const release = await api('PATCH',
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    { rulesetName: ruleset.name }
  );
  console.log('Release successful:', release.name);
  console.log('\n--- FIREBASE SECURITY RULES DEPLOYED SUCCESSFULLY ---');
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
