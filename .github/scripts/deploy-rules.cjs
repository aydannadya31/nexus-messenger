/**
 * Deploy Firestore security rules using google-auth-library + curl-style REST.
 * Uses GOOGLE_APPLICATION_CREDENTIALS set by google-github-actions/auth.
 */
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const PROJECT = process.env.FIREBASE_PROJECT || 'genel-a189b';
const REGION = 'us-west2';  // Firestore database location

async function authHeaders() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase',
             'https://www.googleapis.com/auth/cloud-platform',
             'https://www.googleapis/auth/datastore']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return {
    'Authorization': `Bearer ${token.token}`,
    'Content-Type': 'application/json'
  };
}

async function fetchJson(url, method, body) {
  const headers = await authHeaders();
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${method} ${url}: ${text.substring(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const rulesContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'
  );

  // Step 1: Create ruleset
  console.log('Creating ruleset...');
  const ruleset = await fetchJson(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    'POST',
    { source: { files: [{ name: 'firestore.rules', content: rulesContent }] } }
  );
  console.log('Ruleset created:', ruleset.name);

  // Step 2: Try multiple approaches to release
  const rulesetName = ruleset.name;
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;

  // Approach A: PATCH with release name in URL, no name in body
  console.log('\n--- Approach A: PATCH with URL-based name ---');
  try {
    const r = await fetchJson(
      `https://firebaserules.googleapis.com/v1/${releaseName}`,
      'PATCH',
      { rulesetName }
    );
    console.log('SUCCESS:', r);
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  // Approach B: PATCH via releases.create (upsert)
  console.log('\n--- Approach B: POST to releases (upsert) ---');
  try {
    const r = await fetchJson(
      `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
      'POST',
      { name: releaseName, rulesetName }
    );
    console.log('SUCCESS:', r);
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  // Approach C: PUT
  console.log('\n--- Approach C: PUT on release ---');
  try {
    const r = await fetchJson(
      `https://firebaserules.googleapis.com/v1/${releaseName}`,
      'PUT',
      { name: releaseName, rulesetName }
    );
    console.log('SUCCESS:', r);
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  // Approach D: PATCH with v1beta1 API
  console.log('\n--- Approach D: PATCH v1beta1 ---');
  try {
    const r = await fetchJson(
      `https://firebaserules.googleapis.com/v1beta1/${releaseName}`,
      'PATCH',
      { rulesetName }
    );
    console.log('SUCCESS:', r);
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  // Approach E: POST v1beta1 releases
  console.log('\n--- Approach E: POST v1beta1 releases ---');
  try {
    const r = await fetchJson(
      `https://firebaserules.googleapis.com/v1beta1/projects/${PROJECT}/releases`,
      'POST',
      { name: releaseName, rulesetName }
    );
    console.log('SUCCESS:', r);
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  // Approach F: Use firestore.googleapis.com admin interface 
  console.log('\n--- Approach F: firestore v1 admin databases patch ---');
  try {
    const r = await fetchJson(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`,
      'PATCH',
      { securityPolicy: { rules: rulesContent } }
    );
    console.log('SUCCESS:', r);
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  console.log('\nAll approaches failed.');
  process.exit(1);
}

main().catch(err => {
  console.error('Deploy failed:', err.message.substring(0, 500));
  process.exit(1);
});
