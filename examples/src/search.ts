// Search — find users and search through message history.
// Run: npx tsx examples/search.ts

import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client({ syncOnConnect: true });

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.username}`);

  // Search for users by username or name.
  const userResults = await client.searchUsers('instagram');
  console.log(`\nUser search results for "instagram":`);
  for (const user of userResults.users.slice(0, 5)) {
    console.log(`  @${user.username} — ${user.fullName}${user.isVerified ? ' (verified)' : ''}`);
    console.log(`    Following: ${user.friendship.following}, Follows you: ${user.friendship.followedBy}`);
  }

  // The search also returns matching threads.
  if (userResults.threads.length > 0) {
    console.log(`\nMatching threads:`);
    for (const thread of userResults.threads) {
      console.log(`  ${thread.title} (${thread.isGroup ? 'group' : '1:1'})`);
    }
  }

  // Search across all message history.
  const messageResults = await client.searchMessages('hello');
  console.log(`\nMessage search results for "hello" (${messageResults.results.length} found):`);
  for (const result of messageResults.results.slice(0, 5)) {
    console.log(`  [${result.thread.title}] ${result.text}`);
    console.log(`    Thread: ${result.threadId}, Message: ${result.messageId}`);
  }

  // Paginate through more results.
  if (messageResults.hasMore && messageResults.nextOffset !== null) {
    const nextPage = await client.searchMessages('hello', { offset: messageResults.nextOffset });
    console.log(`  ... and ${nextPage.results.length} more results on the next page`);
  }

  // Search within a specific thread.
  const threads = await client.fetchInbox();
  const firstThread = threads[0];
  if (firstThread) {
    const threadResults = await client.searchInThread(firstThread.id, 'hello');
    console.log(`\nSearch in "${firstThread.name ?? firstThread.id}" for "hello": ${threadResults.results.length} result(s)`);
  }

  await client.destroy();
  console.log('\nDone');
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

await client.login(cookies);
