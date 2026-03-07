// Event listeners — subscribes to all event types and logs them.
// Useful for exploring what data the library surfaces.
// Run: npx tsx examples/event-listeners.ts

import { Client } from 'instagram.js';

const cookies = process.env['IG_COOKIES'];
if (!cookies) {
  console.error('Set the IG_COOKIES environment variable');
  process.exit(1);
}

const client = new Client({ reconnect: true, syncOnConnect: true });

client.on('ready', () => {
  console.log(`Connected as ${client.user?.username}`);
});

client.on('message', (message) => {
  const author = message.author.username ?? message.author.id;
  switch (message.type) {
    case 'text':
      console.log(`[message] ${author}: ${message.text}`);
      break;
    case 'media':
      console.log(`[message] ${author} sent a ${message.mediaType} (${message.width}x${message.height})`);
      break;
    case 'like':
      console.log(`[message] ${author} sent a like`);
      break;
    case 'link':
      console.log(`[message] ${author} sent a link: ${message.url}`);
      break;
    case 'mediaShare':
      console.log(`[message] ${author} shared a post: ${message.post.code}`);
      break;
    case 'reelShare':
      console.log(`[message] ${author} shared a reel: ${message.reel.id}`);
      break;
    case 'storyShare':
      console.log(`[message] ${author} shared a story${message.story.isExpired ? ' (expired)' : ''}`);
      break;
    case 'voiceMedia':
      console.log(`[message] ${author} sent a voice message (${message.duration}ms)`);
      break;
    case 'animatedMedia':
      console.log(`[message] ${author} sent a GIF`);
      break;
    case 'ravenMedia':
      console.log(`[message] ${author} sent a disappearing ${message.mediaType} (${message.viewMode})`);
      break;
    case 'clip':
      console.log(`[message] ${author} shared a clip: ${message.clip.id}`);
      break;
    case 'actionLog':
      console.log(`[message] action: ${message.actionText}`);
      break;
    case 'placeholder':
      console.log(`[message] placeholder: ${message.placeholderText}`);
      break;
    case 'unknown':
      console.log(`[message] unknown type from ${author}: ${message.rawType}`);
      break;
  }
});

client.on('messageDelete', (event) => {
  console.log(`[delete] Message ${event.messageId} deleted in thread ${event.thread.id}`);
});

client.on('messageEdit', (event) => {
  const newText = event.message.type === 'text' ? event.message.text : '(non-text)';
  console.log(`[edit] "${event.oldText}" -> "${newText}" in thread ${event.thread.id}`);
});

client.on('typingStart', (event) => {
  console.log(`[typing] ${event.participant.user.username ?? event.participant.user.id} started typing in ${event.thread.id}`);
});

client.on('typingStop', (event) => {
  console.log(`[typing] ${event.participant.user.username ?? event.participant.user.id} stopped typing in ${event.thread.id}`);
});

client.on('reaction', (event) => {
  console.log(`[reaction] ${event.participant.user.username ?? event.participant.user.id} reacted ${event.emoji} to ${event.messageId}`);
});

client.on('reactionRemove', (event) => {
  console.log(`[reaction] ${event.participant.user.username ?? event.participant.user.id} removed reaction from ${event.messageId}`);
});

client.on('readReceipt', (event) => {
  console.log(`[read] ${event.participant.user.username ?? event.participant.user.id} read up to ${event.messageId}`);
});

client.on('threadUpdate', (event) => {
  const changes = [];
  if (event.changes.name !== undefined) changes.push(`name="${event.changes.name}"`);
  if (event.changes.muted !== undefined) changes.push(`muted=${event.changes.muted}`);
  if (event.changes.adminChange) {
    const { participant, isAdmin } = event.changes.adminChange;
    changes.push(`${participant.user.username ?? participant.user.id} ${isAdmin ? 'promoted' : 'demoted'}`);
  }
  console.log(`[threadUpdate] ${event.thread.id}: ${changes.join(', ')}`);
});

client.on('threadDelete', (event) => {
  console.log(`[threadDelete] ${event.threadId}`);
});

client.on('disconnect', (event) => {
  console.log(`[disconnect] reason=${event.reason} willReconnect=${event.willReconnect}`);
});

client.on('reconnect', () => {
  console.log('[reconnect] Reconnected');
});

client.on('resync', () => {
  console.log('[resync] Full resync performed');
});

client.on('error', (error) => {
  console.error('[error]', error);
});

client.on('rawDelta', (delta) => {
  // Uncomment to see every raw MQTT delta:
  // console.log('[rawDelta]', JSON.stringify(delta, null, 2));
});

await client.login(cookies);
