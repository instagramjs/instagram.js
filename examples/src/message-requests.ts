// Message requests — fetch, approve, and decline pending threads.
// Run: npx tsx examples/message-requests.ts

import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client();

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.username}`);

  // Fetch all pending message requests.
  const pending = await client.fetchPendingThreads();
  console.log(`${pending.length} pending message request(s)`);

  for (const thread of pending) {
    const names = thread.participants.map((p) => p.user.username ?? p.user.id);
    console.log(`  ${thread.id}: ${names.join(', ')}`);

    // Show the latest message in the request.
    const lastMessage = thread.messages.last();
    if (lastMessage && lastMessage.type === 'text') {
      console.log(`    Latest: "${lastMessage.text}"`);
    }
  }

  // Approve specific threads by ID.
  // Uncomment and replace with real thread IDs:
  //
  // const toApprove = pending.filter((t) =>
  //   t.participants.some((p) => p.user.isVerified),
  // );
  // if (toApprove.length > 0) {
  //   await client.approveThreads(toApprove.map((t) => t.id));
  //   console.log(`Approved ${toApprove.length} thread(s)`);
  // }

  // Decline specific threads.
  // await client.declineThreads(['thread-id-1', 'thread-id-2']);

  // Or decline all pending requests at once.
  // await client.declineAllThreads();

  await client.destroy();
  console.log('Done');
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

await client.login(cookies);
