// Basic bot — logs in, listens for messages, and replies to text messages.
// Run: npx tsx examples/basic-bot.ts

import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable (sessionid, csrftoken, ds_user_id, mid)');
  process.exit(1);
}

const client = new Client({ reconnect: true });

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.username}`);
});

client.on('message', async (message) => {
  if (message.author.id === client.user?.id) return;

  if (message.type === 'text') {
    await message.reply(`Hey ${message.author.username ?? 'there'}! You said: "${message.text}"`);
  }
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

client.on('disconnect', (event) => {
  console.log('Disconnected:', event.reason);
  if (!event.willReconnect) process.exit(1);
});

await client.login(cookies);
