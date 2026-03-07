// Command bot — parses a prefix and dispatches commands.
// Supports !ping, !whoami, !thread, !search <query>, and !members.
// Run: npx tsx examples/command-bot.ts

import { Client } from 'instagram.js';

const PREFIX = '!';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client({ reconnect: true, syncOnConnect: true });

client.on('ready', () => {
  console.log(`Command bot online as ${client.user?.username}`);
});

client.on('message', async (message) => {
  if (message.author.id === client.user?.id) return;
  if (message.type !== 'text') return;
  if (!message.text.startsWith(PREFIX)) return;

  const [command, ...args] = message.text.slice(PREFIX.length).split(' ');

  switch (command) {
    case 'ping': {
      await message.reply('Pong!');
      break;
    }

    case 'whoami': {
      const user = message.author;
      await message.reply(
        `User ID: ${user.id}\n` +
        `Username: ${user.username ?? 'unknown'}\n` +
        `Name: ${user.fullName ?? 'unknown'}`,
      );
      break;
    }

    case 'thread': {
      const thread = client.threads.get(message.threadId);
      if (!thread) {
        await message.reply('Thread not in cache. Try sending another message first.');
        break;
      }
      await message.reply(
        `Thread ID: ${thread.id}\n` +
        `Name: ${thread.name ?? '(none)'}\n` +
        `Group: ${thread.isGroup}\n` +
        `Participants: ${thread.participants.length}\n` +
        `Unread: ${thread.unreadCount}`,
      );
      break;
    }

    case 'search': {
      const query = args.join(' ');
      if (!query) {
        await message.reply('Usage: !search <username>');
        break;
      }
      const results = await client.searchUsers(query);
      if (results.users.length === 0) {
        await message.reply('No users found.');
        break;
      }
      const lines = results.users.slice(0, 5).map(
        (u) => `@${u.username} — ${u.fullName}${u.isVerified ? ' (verified)' : ''}`,
      );
      await message.reply(lines.join('\n'));
      break;
    }

    case 'members': {
      const thread = client.threads.get(message.threadId);
      if (!thread) {
        await message.reply('Thread not in cache.');
        break;
      }
      const lines = thread.participants.map(
        (p) => `${p.user.username ?? p.user.id}${p.isAdmin ? ' (admin)' : ''}`,
      );
      await message.reply(lines.join('\n'));
      break;
    }

    default: {
      await message.reply(`Unknown command: ${command}`);
    }
  }
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

await client.login(cookies);
