import { describe, expectTypeOf, it } from 'vitest';
import { Client } from './client';
import type { Message } from './models/message';
import type {
  DisconnectEvent,
  MessageDeleteEvent,
  MessageEditEvent,
  ReactionEvent,
  ReadReceiptEvent,
  ThreadDeleteEvent,
  ThreadUpdateEvent,
  TypingEvent,
} from './types';
import type { RawDelta } from './types';

describe('Client.send() return types', () => {
  it('send with text returns Promise<void>', () => {
    const client = new Client();
    const result = client.send('t', 'text');
    expectTypeOf(result).toEqualTypeOf<Promise<void>>();
  });

  it('send with media returns Promise<Message>', () => {
    const client = new Client();
    const result = client.send('t', { photo: Buffer.from('x') });
    expectTypeOf(result).toEqualTypeOf<Promise<Message>>();
  });

  it('sendText returns Promise<void>', () => {
    const client = new Client();
    const result = client.sendText('t', 'text');
    expectTypeOf(result).toEqualTypeOf<Promise<void>>();
  });
});

describe('Client event emitter types', () => {
  it('message event provides Message', () => {
    const client = new Client();
    client.on('message', (msg) => {
      expectTypeOf(msg).toEqualTypeOf<Message>();
    });
  });

  it('messageDelete event provides MessageDeleteEvent', () => {
    const client = new Client();
    client.on('messageDelete', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<MessageDeleteEvent>();
    });
  });

  it('messageEdit event provides MessageEditEvent', () => {
    const client = new Client();
    client.on('messageEdit', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<MessageEditEvent>();
    });
  });

  it('typingStart event provides TypingEvent', () => {
    const client = new Client();
    client.on('typingStart', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<TypingEvent>();
    });
  });

  it('reaction event provides ReactionEvent', () => {
    const client = new Client();
    client.on('reaction', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<ReactionEvent>();
    });
  });

  it('readReceipt event provides ReadReceiptEvent', () => {
    const client = new Client();
    client.on('readReceipt', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<ReadReceiptEvent>();
    });
  });

  it('threadUpdate event provides ThreadUpdateEvent', () => {
    const client = new Client();
    client.on('threadUpdate', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<ThreadUpdateEvent>();
    });
  });

  it('threadDelete event provides ThreadDeleteEvent', () => {
    const client = new Client();
    client.on('threadDelete', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<ThreadDeleteEvent>();
    });
  });

  it('disconnect event provides DisconnectEvent', () => {
    const client = new Client();
    client.on('disconnect', (evt) => {
      expectTypeOf(evt).toEqualTypeOf<DisconnectEvent>();
    });
  });

  it('rawDelta event provides RawDelta', () => {
    const client = new Client();
    client.on('rawDelta', (delta) => {
      expectTypeOf(delta).toEqualTypeOf<RawDelta>();
    });
  });

  it('error event provides Error', () => {
    const client = new Client();
    client.on('error', (err) => {
      expectTypeOf(err).toEqualTypeOf<Error>();
    });
  });
});
