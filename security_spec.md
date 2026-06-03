# Security Specification for Nexus Messenger

## Data Invariants
1. A message cannot exist without being part of a chat.
2. A chat must have exactly 2 participants (for 1v1 messaging as a baseline).
3. Only participants of a chat can read or write messages in that chat.
4. Users can only update their own user profile.
5. Users can only see profiles of other users (list users) to initiate chats.

## The Dirty Dozen Payloads

1. **Identity Spoofing**: Attempt to create a message with `senderId` of another user.
2. **Unauthorized Access**: Attempt to read messages in a chat where the user is not a participant.
3. **Shadow Update**: Attempt to add an `isAdmin` field to a user profile.
4. **Orphaned Message**: Attempt to create a message in a non-existent chat.
5. **PII Leak**: Attempt to list all users' private emails (if we had private fields).
6. **Malicious ID**: Use a 1MB string as a message ID.
7. **Bypassing Invariants**: Create a chat with only 1 participant.
8. **Impersonation**: Update another user's `displayName`.
9. **Spamming**: Send a message with a 1MB text body.
10. **State Corruption**: Update the `updatedAt` field of a chat to a past date.
11. **Query Scraping**: List all chats in the system without filtering by participant.
12. **Double Delete**: Attempt to delete a chat the user doesn't own (though we don't have explicit ownership, only participation).

## Test Runner (Draft)
```typescript
// firestore.rules.test.ts (Conceptual)
// We would use the Firebase Security Rules emulator to verify these deny blocks.
```
