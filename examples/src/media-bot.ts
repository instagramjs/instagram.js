// Media bot — demonstrates sending photos, links, and GIFs.
// Responds to !photo, !link, and !gif commands.
// Run: npx tsx examples/media-bot.ts

import { readFile } from 'node:fs/promises';
import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client({ reconnect: true });

client.on('ready', () => {
  console.log(`Media bot online as ${client.user?.username}`);
});

client.on('message', async (message) => {
  if (message.author.id === client.user?.id) return;
  if (message.type !== 'text') return;

  const text = message.text.trim().toLowerCase();
  const thread = client.threads.get(message.threadId);
  if (!thread) return;

  switch (text) {
    case '!photo': {
      // Send a photo from disk. Replace with any image path.
      const photo = await readFile('./examples/sample.jpg').catch(() => null);
      if (!photo) {
        await message.reply('Put a sample.jpg in the examples/ directory to test photo sending.');
        break;
      }
      await thread.send({ photo, filename: 'sample.jpg' });
      break;
    }

    case '!link': {
      // Send a link with optional text.
      await thread.send({ link: 'https://github.com/instagramjs/instagram.js', text: 'Check out instagram.js' });
      break;
    }

    case '!gif': {
      // Send a GIF by its GIPHY ID.
      // You can find GIF IDs on giphy.com — the ID is the last path segment of the URL.
      await thread.send({ gif: 'l0MYt5jPR6QX5pnqM' });
      break;
    }

    default:
      break;
  }
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

await client.login(cookies);
