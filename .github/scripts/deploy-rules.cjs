/**
 * Deploy Firestore security rules using Google Auth Library + REST API.
 * Uses GOOGLE_APPLICATION_CREDENTIALS set by google-github-actions/auth.
 */
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

async function main() {
  const projectId = process.env.FIREBASE_PROJECT || 'genel-a189b';
  const rulesPath = path.join(__dirname, '..', '..', 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  console.log('Authenticating with Google Cloud...');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  // Step 1: Create ruleset
  console.log('Creating ruleset...');
  const createResponse = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          files: [{
            name: 'firestore.rules',
            content: rulesContent
          }]
        }
      })
    }
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create ruleset: ${createResponse.status} - ${errorText}`);
  }

  const ruleset = await createResponse.json();
  console.log('Ruleset created:', ruleset.name);

  // Step 2: Release ruleset to cloud.firestore
  console.log('Releasing ruleset...');
  const releaseResponse = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rulesetName: ruleset.name
      })
    }
  );

  if (!releaseResponse.ok) {
    const errorText = await releaseResponse.text();
    throw new Error(`Failed to release ruleset: ${releaseResponse.status} - ${errorText}`);
  }

  const release = await releaseResponse.json();
  console.log('Release successful:', release.name);
  console.log('\n--- FIREBASE SECURITY RULES DEPLOYED SUCCESSFULLY ---');
}

main().catch(err => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
