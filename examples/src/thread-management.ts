// Thread management — creating threads, renaming, muting, nicknames, and cleanup.
// Run: npx tsx examples/thread-management.ts

import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client({ reconnect: true, syncOnConnect: true });

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.username}`);

  // Fetch the inbox to populate threads cache.
  const threads = await client.fetchInbox();
  console.log(`Inbox has ${threads.length} threads`);

  for (const thread of threads) {
    const names = thread.participants.map((p) => p.user.username ?? p.user.id);
    console.log(`  ${thread.id}: ${thread.name ?? names.join(', ')} (${thread.isGroup ? 'group' : '1:1'})`);
  }

  // Create a 1:1 thread with a user by their ID.
  // Uncomment and replace with a real user ID to test:
  //
  // const thread = await client.createThread('12345678');
  // await thread.send('Hello from the bot!');
  // console.log(`Created thread: ${thread.id}`);

  // Create a group thread with multiple users.
  // Uncomment and replace with real user IDs to test:
  //
  // const group = await client.createGroupThread(['12345678', '87654321'], 'Bot Test Group');
  // await group.send('Welcome to the group!');
  // console.log(`Created group: ${group.id}`);

  // Thread operations on an existing thread:
  const firstThread = threads[0];
  if (firstThread) {
    // Fetch older messages.
    const messages = await firstThread.fetchMessages({ limit: 10 });
    console.log(`Fetched ${messages.length} messages from ${firstThread.name ?? firstThread.id}`);

    // Mark as read.
    await firstThread.markAsRead();

    // Rename a group thread (only works on group threads).
    // await firstThread.rename('New Name');

    // Mute / unmute.
    // await firstThread.mute();
    // await firstThread.unmute();

    // Set a nickname for a participant.
    // const participant = firstThread.participants[0];
    // if (participant) {
    //   await firstThread.setNickname(participant.user.id, 'Nickname');
    //   await firstThread.setNickname(participant.user.id, null); // remove
    // }
  }

  // Clean up and disconnect.
  await client.destroy();
  console.log('Done');
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

await client.login(cookies);
