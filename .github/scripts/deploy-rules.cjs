/**
 * Deploy Firestore security rules using firebase-admin SDK.
 * Called from GitHub Actions workflow after google-github-actions/auth.
 * Uses GOOGLE_APPLICATION_CREDENTIALS set by the auth action.
 */
const admin = require('firebase-admin');
const { getSecurityRules } = require('firebase-admin/security-rules');
const fs = require('fs');
const path = require('path');

async function main() {
  // firebase-admin will pick up GOOGLE_APPLICATION_CREDENTIALS automatically
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT || 'genel-a189b' });

  const rulesPath = path.join(__dirname, '..', '..', 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  console.log('Creating ruleset from firestore.rules...');
  const ruleset = await getSecurityRules().createRuleset({
    source: {
      files: [{
        name: 'firestore.rules',
        content: rulesContent
      }]
    }
  });
  console.log('Ruleset created:', ruleset.name);

  // Release to the (default) Firestore database
  console.log('Releasing ruleset to cloud.firestore...');
  const release = await getSecurityRules().release('cloud.firestore', ruleset.name);
  console.log('Release successful:', release.name);

  console.log('\n--- FIREBASE SECURITY RULES DEPLOYED SUCCESSFULLY ---');
}

main().catch(err => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
