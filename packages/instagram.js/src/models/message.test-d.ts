import { describe, expectTypeOf, it } from 'vitest';
import type { Message } from './message';
import {
  TextMessage,
  MediaMessage,
  LinkMessage,
  ActionLogMessage,
  UnknownMessage,
} from './message';

describe('Message discriminated union', () => {
  it('narrows to TextMessage via type field', () => {
    const msg = {} as Message;
    if (msg.type === 'text') {
      expectTypeOf(msg).toEqualTypeOf<TextMessage>();
      expectTypeOf(msg.text).toEqualTypeOf<string>();
    }
  });

  it('narrows to MediaMessage via type field', () => {
    const msg = {} as Message;
    if (msg.type === 'media') {
      expectTypeOf(msg).toEqualTypeOf<MediaMessage>();
      expectTypeOf(msg.mediaUrl).toEqualTypeOf<string>();
      expectTypeOf(msg.mediaType).toEqualTypeOf<'image' | 'video'>();
    }
  });

  it('narrows to LinkMessage via type field', () => {
    const msg = {} as Message;
    if (msg.type === 'link') {
      expectTypeOf(msg).toEqualTypeOf<LinkMessage>();
      expectTypeOf(msg.url).toEqualTypeOf<string>();
    }
  });

  it('narrows to ActionLogMessage via type field', () => {
    const msg = {} as Message;
    if (msg.type === 'actionLog') {
      expectTypeOf(msg).toEqualTypeOf<ActionLogMessage>();
      expectTypeOf(msg.actionText).toEqualTypeOf<string>();
    }
  });

  it('narrows to UnknownMessage via type field', () => {
    const msg = {} as Message;
    if (msg.type === 'unknown') {
      expectTypeOf(msg).toEqualTypeOf<UnknownMessage>();
      expectTypeOf(msg.rawValue).toEqualTypeOf<unknown>();
    }
  });

  it('reactions are readonly', () => {
    const msg = {} as Message;
    expectTypeOf(msg.reactions).toEqualTypeOf<readonly import('../types').Reaction[]>();
  });
});
