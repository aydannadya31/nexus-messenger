/**
 * Deploy Firestore security rules using firebase-admin SDK.
 * Uses GOOGLE_APPLICATION_CREDENTIALS set by google-github-actions/auth.
 */
const admin = require('firebase-admin');
const { getSecurityRules } = require('firebase-admin/security-rules');
const fs = require('fs');
const path = require('path');

async function main() {
  const projectId = process.env.FIREBASE_PROJECT || 'genel-a189b';
  admin.initializeApp({ projectId });

  const rulesContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'
  );

  // Approach 1: Release from source (handles create + release atomically)
  console.log('\n--- Approach 1: releaseFirestoreRulesetFromSource ---');
  try {
    const sr = getSecurityRules();
    if (typeof sr.releaseFirestoreRulesetFromSource === 'function') {
      await sr.releaseFirestoreRulesetFromSource(rulesContent);
      console.log('SUCCESS: Rules released via releaseFirestoreRulesetFromSource');
      process.exit(0);
    } else {
      console.log('Method not available in this SDK version');
    }
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  // Approach 2: Create with source, then release
  console.log('\n--- Approach 2: createRuleset + release ---');
  try {
    const sr = getSecurityRules();
    let ruleset;
    if (typeof sr.createRulesetFromSource === 'function') {
      ruleset = await sr.createRulesetFromSource(rulesContent);
    } else {
      ruleset = await sr.createRuleset({
        source: {
          files: [{
            name: 'firestore.rules',
            content: rulesContent
          }]
        }
      });
    }
    console.log('Ruleset created:', ruleset.name);
    await sr.release('cloud.firestore', ruleset.name);
    console.log('SUCCESS: Rules released!');
    process.exit(0);
  } catch (e) {
    console.log('Failed:', e.message.substring(0, 200));
  }

  console.log('\nAll approaches failed.');
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message.substring(0, 500));
  process.exit(1);
});
