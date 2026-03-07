import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, AuthError, DocIdError, RateLimitError } from './errors';
import { HttpClient } from './http';
import type { Cookies, SessionData } from './types';

const cookies: Cookies = {
  sessionid: 'abc123',
  csrftoken: 'csrf456',
  ds_user_id: '12345678',
  mid: 'mid789',
};

const session: SessionData = {
  cookies,
  fbDtsg: 'dtsg_tok',
  lsd: 'lsd_tok',
  rolloutHash: '1034695662',
  spinR: '1034695662',
  spinB: 'trunk',
  spinT: '1772859074',
  hs: '20519.HYP:ig',
  bloksVersion: 'abc123',
  deviceId: 'dev-uuid',
  sessionId: '123456',
  igScopedId: '178414557',
  seqId: 0,
};

describe('HttpClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('graphql', () => {
    it('sends correct form body and parses response', async () => {
      const mockResponse = { data: { viewer: { threads: [] } } };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.graphql('IGDInboxTrayQuery', { limit: 20 });

      expect(result).toEqual(mockResponse);

      const call = vi.mocked(fetch).mock.calls[0]!;
      expect(call[0]).toBe('https://www.instagram.com/api/graphql');
      expect(call[1]?.method).toBe('POST');

      const body = call[1]?.body as string;
      expect(body).toContain('doc_id=26487037210884987');
      expect(body).toContain('fb_api_req_friendly_name=IGDInboxTrayQuery');
      expect(body).toContain('fb_dtsg=dtsg_tok');
    });

    it('throws DocIdError for unknown query name', async () => {
      const client = new HttpClient(session);
      await expect(client.graphql('FakeQuery', {})).rejects.toThrow(DocIdError);
    });

    it('throws AuthError on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(AuthError);
    });

    it('throws AuthError on 403', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(AuthError);
    });

    it('throws RateLimitError on 429', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Too many requests', { status: 429 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(RateLimitError);
    });

    it('throws ApiError on 500', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Server error', { status: 500 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(ApiError);
    });

    it('uses overridden doc_ids', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('{}', { status: 200 }),
      );

      const client = new HttpClient(session, { IGDInboxTrayQuery: '99999' });
      await client.graphql('IGDInboxTrayQuery', {});

      const body = vi.mocked(fetch).mock.calls[0]![1]?.body as string;
      expect(body).toContain('doc_id=99999');
    });

    it('throws DocIdError when response contains doc_id error', async () => {
      const errorResponse = {
        errors: [{ message: 'Invalid doc_id provided', code: 1675030 }],
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(errorResponse), { status: 200 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(DocIdError);
    });

    it('throws DocIdError when response contains document error', async () => {
      const errorResponse = {
        errors: [{ message: 'Unknown document' }],
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(errorResponse), { status: 200 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(DocIdError);
    });

    it('throws DocIdError when response contains query_id error', async () => {
      const errorResponse = {
        errors: [{ message: 'Bad query_id' }],
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(errorResponse), { status: 200 }),
      );

      const client = new HttpClient(session);
      await expect(client.graphql('IGDInboxTrayQuery', {})).rejects.toThrow(DocIdError);
    });

    it('passes through unrelated GraphQL errors', async () => {
      const errorResponse = {
        errors: [{ message: 'Rate limit exceeded' }],
        data: { viewer: null },
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(errorResponse), { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.graphql('IGDInboxTrayQuery', {});
      expect(result).toEqual(errorResponse);
    });

    it('returns normal responses without errors field', async () => {
      const normalResponse = { data: { viewer: { threads: [] } } };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(normalResponse), { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.graphql('IGDInboxTrayQuery', {});
      expect(result).toEqual(normalResponse);
    });
  });

  describe('rest', () => {
    it('sends GET with query params', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('{"status":"ok"}', { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.rest('/api/v1/direct_v2/inbox/', {
        query: { limit: '20' },
      });

      expect(result).toEqual({ status: 'ok' });

      const call = vi.mocked(fetch).mock.calls[0]!;
      const url = call[0] as string;
      expect(url).toContain('/api/v1/direct_v2/inbox/?');
      expect(url).toContain('limit=20');
      expect(call[1]?.method).toBe('GET');
    });

    it('sends POST with form body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('{"status":"ok"}', { status: 200 }),
      );

      const client = new HttpClient(session);
      await client.rest('/api/v1/direct_v2/create_group_thread/', {
        method: 'POST',
        body: { recipient_users: '["123"]' },
      });

      const call = vi.mocked(fetch).mock.calls[0]!;
      expect(call[1]?.method).toBe('POST');
      const body = call[1]?.body as string;
      expect(body).toContain('recipient_users');
    });

    it('includes auth headers', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('{}', { status: 200 }),
      );

      const client = new HttpClient(session);
      await client.rest('/api/v1/test/');

      const headers = vi.mocked(fetch).mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers['X-CSRFToken']).toBe('csrf456');
      expect(headers['X-IG-App-ID']).toBe('936619743392459');
    });

    it('throws AuthError on 403', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('', { status: 403 }),
      );

      const client = new HttpClient(session);
      await expect(client.rest('/api/v1/test/')).rejects.toThrow(AuthError);
    });
  });

  describe('upload', () => {
    it('strips for (;;); prefix and extracts image_id', async () => {
      const uploadResponse = 'for (;;);{"payload":{"metadata":{"0":{"image_id":765009319708802,"filename":"photo.jpg"}}}}';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(uploadResponse, { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.upload(Buffer.from('fake-image'), 'photo.jpg');

      expect(result.id).toBe('765009319708802');
    });

    it('extracts video_id', async () => {
      const uploadResponse = 'for (;;);{"payload":{"metadata":{"0":{"video_id":891234567890123,"filename":"clip.mp4"}}}}';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(uploadResponse, { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.upload(Buffer.from('fake-video'), 'clip.mp4');

      expect(result.id).toBe('891234567890123');
    });

    it('extracts audio_id', async () => {
      const uploadResponse = 'for (;;);{"payload":{"metadata":{"0":{"audio_id":1481286150303438,"filename":"audio.ogg"}}}}';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(uploadResponse, { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.upload(Buffer.from('fake-audio'), 'audio.ogg');

      expect(result.id).toBe('1481286150303438');
    });

    it('handles response without for (;;); prefix', async () => {
      const uploadResponse = '{"payload":{"metadata":{"0":{"image_id":123,"filename":"a.jpg"}}}}';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(uploadResponse, { status: 200 }),
      );

      const client = new HttpClient(session);
      const result = await client.upload(Buffer.from('fake'), 'a.jpg');

      expect(result.id).toBe('123');
    });

    it('throws ApiError when metadata is missing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('for (;;);{"payload":{}}', { status: 200 }),
      );

      const client = new HttpClient(session);
      await expect(client.upload(Buffer.from('x'), 'f.jpg')).rejects.toThrow(ApiError);
    });

    it('throws AuthError on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('', { status: 401 }),
      );

      const client = new HttpClient(session);
      await expect(client.upload(Buffer.from('x'), 'f.jpg')).rejects.toThrow(AuthError);
    });

    it('sends extra fields in form data', async () => {
      const uploadResponse = 'for (;;);{"payload":{"metadata":{"0":{"audio_id":999}}}}';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(uploadResponse, { status: 200 }),
      );

      const client = new HttpClient(session);
      await client.upload(Buffer.from('audio'), 'clip.ogg', {
        voice_clip: 'true',
      });

      const call = vi.mocked(fetch).mock.calls[0]!;
      const body = call[1]?.body as FormData;
      expect(body.get('voice_clip')).toBe('true');
    });
  });
});
