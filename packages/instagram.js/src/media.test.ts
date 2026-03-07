import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from './errors';
import type { HttpClient } from './http';
import {
  detectContentType,
  sendGif,
  sendLink,
  sendPhoto,
  sendVideo,
  sendVoice,
} from './media';

function makeMockHttp(): HttpClient & { upload: ReturnType<typeof vi.fn>; rest: ReturnType<typeof vi.fn> } {
  return {
    upload: vi.fn().mockResolvedValue({ id: '123456' }),
    rest: vi.fn().mockResolvedValue({
      item_id: 'sent-1',
      user_id: '0',
      timestamp: '1700000000000000',
      item_type: 'text',
    }),
  } as unknown as HttpClient & { upload: ReturnType<typeof vi.fn>; rest: ReturnType<typeof vi.fn> };
}

describe('detectContentType', () => {
  it('detects photo', () => {
    expect(detectContentType({ photo: Buffer.from('x') })).toBe('photo');
  });

  it('detects video', () => {
    expect(detectContentType({ video: Buffer.from('x') })).toBe('video');
  });

  it('detects gif', () => {
    expect(detectContentType({ gif: 'abc123' })).toBe('gif');
  });

  it('detects voice', () => {
    expect(detectContentType({ voice: Buffer.from('x'), duration: 1000 })).toBe('voice');
  });

  it('detects link', () => {
    expect(detectContentType({ link: 'https://example.com' })).toBe('link');
  });

  it('throws for empty object', () => {
    expect(() => detectContentType({} as never)).toThrow(ValidationError);
  });

  it('returns first matching type when multiple fields present', () => {
    // TypeScript prevents this at compile time via the SendContent union.
    // At runtime, we return the first match rather than throwing.
    expect(detectContentType({ photo: Buffer.from('x'), video: Buffer.from('y') } as never)).toBe('photo');
  });
});

describe('sendPhoto', () => {
  it('uploads then broadcasts', async () => {
    const http = makeMockHttp();
    await sendPhoto({ http, threadId: 'thread-1', photo: Buffer.from('img') });

    expect(http.upload).toHaveBeenCalledWith(Buffer.from('img'), 'photo.jpg');
    expect(http.rest).toHaveBeenCalledWith(
      '/api/v1/direct_v2/threads/broadcast/configure_photo/',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          action: 'send_item',
          content_type: 'photo',
          thread_id: 'thread-1',
          upload_id: '123456',
        }),
      }),
    );
  });

  it('uses custom filename', async () => {
    const http = makeMockHttp();
    await sendPhoto({ http, threadId: 'thread-1', photo: Buffer.from('img'), filename: 'custom.png' });

    expect(http.upload).toHaveBeenCalledWith(Buffer.from('img'), 'custom.png');
  });
});

describe('sendVideo', () => {
  it('uploads then broadcasts', async () => {
    const http = makeMockHttp();
    await sendVideo({ http, threadId: 'thread-1', video: Buffer.from('vid') });

    expect(http.upload).toHaveBeenCalledWith(Buffer.from('vid'), 'video.mp4');
    expect(http.rest).toHaveBeenCalledWith(
      '/api/v1/direct_v2/threads/broadcast/configure_photo/',
      expect.objectContaining({
        body: expect.objectContaining({
          content_type: 'video',
          upload_id: '123456',
        }),
      }),
    );
  });
});

describe('sendGif', () => {
  it('sends GIF by ID', async () => {
    const http = makeMockHttp();
    await sendGif({ http, threadId: 'thread-1', gifId: 'xT9IgzoKnwFNmISR8I' });

    expect(http.rest).toHaveBeenCalledWith(
      '/api/v1/direct_v2/threads/broadcast/animated_media/',
      expect.objectContaining({
        body: expect.objectContaining({
          id: 'xT9IgzoKnwFNmISR8I',
          is_sticker: 'false',
        }),
      }),
    );
  });

  it('sets is_sticker flag', async () => {
    const http = makeMockHttp();
    await sendGif({ http, threadId: 'thread-1', gifId: 'abc', isSticker: true });

    const body = http.rest.mock.calls[0]![1].body;
    expect(body.is_sticker).toBe('true');
  });
});

describe('sendVoice', () => {
  it('uploads with voice clip fields then broadcasts', async () => {
    const http = makeMockHttp();
    await sendVoice({ http, threadId: 'thread-1', voice: Buffer.from('audio'), duration: 3200, waveform: [0.1, 0.5] });

    expect(http.upload).toHaveBeenCalledWith(
      Buffer.from('audio'),
      expect.stringContaining('audioclip-'),
      {
        voice_clip: 'true',
        voice_clip_waveform_data: JSON.stringify({ amplitudes: [0.1, 0.5] }),
      },
    );
    expect(http.rest).toHaveBeenCalled();
  });

  it('generates flat waveform when none provided', async () => {
    const http = makeMockHttp();
    await sendVoice({ http, threadId: 'thread-1', voice: Buffer.from('audio'), duration: 1000 });

    const extraFields = http.upload.mock.calls[0]![2];
    const parsed = JSON.parse(extraFields.voice_clip_waveform_data);
    expect(parsed.amplitudes).toHaveLength(20);
    expect(parsed.amplitudes.every((v: number) => v === 0)).toBe(true);
  });
});

describe('sendLink', () => {
  it('sends link with text', async () => {
    const http = makeMockHttp();
    await sendLink({ http, threadId: 'thread-1', url: 'https://example.com', text: 'Check this' });

    expect(http.rest).toHaveBeenCalledWith(
      '/api/v1/direct_v2/threads/broadcast/link/',
      expect.objectContaining({
        body: expect.objectContaining({
          link_text: 'Check this',
          link_urls: '["https://example.com"]',
        }),
      }),
    );
  });

  it('sends link without text', async () => {
    const http = makeMockHttp();
    await sendLink({ http, threadId: 'thread-1', url: 'https://example.com' });

    const body = http.rest.mock.calls[0]![1].body;
    expect(body.link_text).toBe('');
  });
});
