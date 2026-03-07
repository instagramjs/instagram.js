// Echo bot — repeats back whatever text message it receives.
// Run: npx tsx examples/echo-bot.ts

import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client({ reconnect: true });

client.on('ready', () => {
  console.log(`Echo bot online as ${client.user?.username}`);
});

client.on('message', async (message) => {
  if (message.author.id === client.user?.id) return;
  if (message.type === 'text') await message.reply(message.text);
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

await client.login(cookies);
