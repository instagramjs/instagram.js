import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_DOC_IDS } from './constants';
import { DocIdError, SessionError, ValidationError } from './errors';
import type { Cookies, SessionData } from './types';
import {
  bootstrapSession,
  buildGraphQLBody,
  buildGraphQLHeaders,
  buildMqttUsername,
  buildRestHeaders,
  generateRequestNonce,
  parseAndValidateCookies,
  validateCookies,
} from './session';

const validCookies: Cookies = {
  sessionid: 'abc123',
  csrftoken: 'csrf456',
  ds_user_id: '12345678',
  mid: 'mid789',
};

function makeSession(overrides?: Partial<SessionData>): SessionData {
  return {
    cookies: validCookies,
    fbDtsg: 'dtsg_token_value',
    lsd: 'lsd_token_value',
    rolloutHash: '1034695662',
    spinR: '1034695662',
    spinB: 'trunk',
    spinT: '1772859074',
    hs: '20519.HYP:instagram_web_pkg',
    bloksVersion: '60648760d1b9abc123',
    deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sessionId: '1573652938096639',
    igScopedId: '17841455700157674',
    username: 'testuser',
    seqId: 0,
    ...overrides,
  };
}

function makeFakePageBody(): string {
  return [
    '<!DOCTYPE html><html><head>',
    '<script type="application/json">["DTSGInitData",[],{"token":"dtsg_token_value"},123]</script>',
    '<script type="application/json">["LSD",[],{"token":"lsd_token_value"},456]</script>',
    '<script>{"__spin_r":1034695662,"__spin_b":"trunk","__spin_t":1772859074}</script>',
    '<script>{"haste_session":"20519.HYP:instagram_web_pkg"}</script>',
    '<script>{"bloks_version\\":\\"60648760d1b9abc123"}</script>',
    '<script>{"NON_FACEBOOK_USER_ID":"17841455700157674"}</script>',
    '<script>{"full_name":"Test","id":"12345678","username":"testuser","is_private":false}</script>',
    '</head><body></body></html>',
  ].join('\n');
}

describe('validateCookies', () => {
  it('passes with all required cookies', () => {
    expect(() => validateCookies(validCookies)).not.toThrow();
  });

  it('throws for missing sessionid', () => {
    expect(() => validateCookies({ ...validCookies, sessionid: '' })).toThrow(ValidationError);
    expect(() => validateCookies({ ...validCookies, sessionid: '' })).toThrow('sessionid');
  });

  it('throws for missing csrftoken', () => {
    expect(() => validateCookies({ ...validCookies, csrftoken: '' })).toThrow(ValidationError);
    expect(() => validateCookies({ ...validCookies, csrftoken: '' })).toThrow('csrftoken');
  });

  it('throws for missing ds_user_id', () => {
    expect(() => validateCookies({ ...validCookies, ds_user_id: '' })).toThrow(ValidationError);
    expect(() => validateCookies({ ...validCookies, ds_user_id: '' })).toThrow('ds_user_id');
  });

  it('throws listing all missing cookies', () => {
    expect(() =>
      validateCookies({ sessionid: '', csrftoken: '', ds_user_id: '', mid: '' }),
    ).toThrow('sessionid, csrftoken, ds_user_id');
  });

  it('passes without mid (optional)', () => {
    expect(() => validateCookies({ ...validCookies, mid: '' })).not.toThrow();
  });
});

describe('generateRequestNonce', () => {
  it('produces a 6-character string', () => {
    const nonce = generateRequestNonce();
    expect(nonce).toHaveLength(6);
  });

  it('produces alphanumeric characters only', () => {
    for (let i = 0; i < 20; i++) {
      const nonce = generateRequestNonce();
      expect(nonce).toMatch(/^[a-z0-9]{6}$/);
    }
  });

  it('produces different values', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateRequestNonce()));
    expect(nonces.size).toBeGreaterThan(1);
  });
});

describe('bootstrapSession', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('extracts all session values from page body', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(makeFakePageBody(), { status: 200 }),
    );

    const session = await bootstrapSession(validCookies);

    expect(session.fbDtsg).toBe('dtsg_token_value');
    expect(session.lsd).toBe('lsd_token_value');
    expect(session.spinR).toBe('1034695662');
    expect(session.spinB).toBe('trunk');
    expect(session.spinT).toBe('1772859074');
    expect(session.hs).toBe('20519.HYP:instagram_web_pkg');
    expect(session.bloksVersion).toBe('60648760d1b9abc123');
    expect(session.igScopedId).toBe('17841455700157674');
    expect(session.username).toBe('testuser');
    expect(session.rolloutHash).toBe('1034695662');
    expect(session.cookies).toEqual(validCookies);
    expect(session.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(session.sessionId).toMatch(/^\d+$/);
    expect(session.seqId).toBe(0);
  });

  it('throws SessionError when fb_dtsg is missing', async () => {
    const body = makeFakePageBody().replace(/DTSGInitData.*?\n/, '\n');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status: 200 }));

    await expect(bootstrapSession(validCookies)).rejects.toThrow(SessionError);
  });

  it('throws SessionError on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }));

    await expect(bootstrapSession(validCookies)).rejects.toThrow(SessionError);
  });

  it('includes mid in cookie header when present', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(makeFakePageBody(), { status: 200 }),
    );

    await bootstrapSession(validCookies);

    const call = vi.mocked(fetch).mock.calls[0]!;
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers['Cookie']).toContain('mid=mid789');
  });
});

describe('buildGraphQLBody', () => {
  const session = makeSession();

  it('produces URLSearchParams with all required fields', () => {
    const params = buildGraphQLBody({ session, queryName: 'IGDInboxTrayQuery', variables: { foo: 'bar' }, docIds: DEFAULT_DOC_IDS });

    expect(params.get('av')).toBe('17841455700157674');
    expect(params.get('__user')).toBe('0');
    expect(params.get('__a')).toBe('1');
    expect(params.get('__d')).toBe('www');
    expect(params.get('__comet_req')).toBe('7');
    expect(params.get('__rev')).toBe('1034695662');
    expect(params.get('__hs')).toBe('20519.HYP:instagram_web_pkg');
    expect(params.get('lsd')).toBe('lsd_token_value');
    expect(params.get('fb_dtsg')).toBe('dtsg_token_value');
    expect(params.get('fb_api_caller_class')).toBe('RelayModern');
    expect(params.get('fb_api_req_friendly_name')).toBe('IGDInboxTrayQuery');
    expect(params.get('doc_id')).toBe('26487037210884987');
    expect(params.get('variables')).toBe('{"foo":"bar"}');
    expect(params.get('__s')).toMatch(/^[a-z0-9]{6}$/);
  });

  it('throws DocIdError for unknown query name', () => {
    expect(() =>
      buildGraphQLBody({ session, queryName: 'NonexistentQuery', variables: {}, docIds: DEFAULT_DOC_IDS }),
    ).toThrow(DocIdError);
  });
});

describe('buildGraphQLHeaders', () => {
  it('includes all required headers', () => {
    const session = makeSession();
    const headers = buildGraphQLHeaders(session);

    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers['X-CSRFToken']).toBe('csrf456');
    expect(headers['X-IG-App-ID']).toBe('936619743392459');
    expect(headers['X-Instagram-AJAX']).toBe('1034695662');
    expect(headers['X-FB-LSD']).toBe('lsd_token_value');
    expect(headers['Cookie']).toContain('sessionid=abc123');
    expect(headers['Cookie']).toContain('csrftoken=csrf456');
    expect(headers['Cookie']).toContain('ds_user_id=12345678');
    expect(headers['Cookie']).toContain('mid=mid789');
  });
});

describe('buildRestHeaders', () => {
  it('includes required REST headers', () => {
    const session = makeSession();
    const headers = buildRestHeaders(session);

    expect(headers['X-CSRFToken']).toBe('csrf456');
    expect(headers['X-IG-App-ID']).toBe('936619743392459');
    expect(headers['X-Instagram-AJAX']).toBe('1034695662');
    expect(headers['Cookie']).toContain('sessionid=abc123');
  });

  it('omits mid when empty', () => {
    const session = makeSession({ cookies: { ...validCookies, mid: '' } });
    const headers = buildRestHeaders(session);

    expect(headers['Cookie']).not.toContain('mid=');
  });
});

describe('buildMqttUsername', () => {
  it('produces valid JSON with correct fields', () => {
    const session = makeSession();
    const username = buildMqttUsername(session);
    const parsed = JSON.parse(username);

    expect(parsed.aid).toBe(936619743392459);
    expect(parsed.ct).toBe('cookie_auth');
    expect(parsed.d).toBe(session.deviceId);
    expect(parsed.u).toBe('12345678');
    expect(parsed.s).toBe(Number(session.sessionId));
    expect(parsed.cp).toBe(1);
    expect(parsed.ecp).toBe(0);
    expect(parsed.fg).toBe(false);
    expect(parsed.no_auto_fg).toBe(true);
    expect(parsed.chat_on).toBe(false);
    expect(parsed.asi).toEqual({ 'Accept-Language': 'en' });
    expect(parsed.aids).toBeNull();
  });
});

describe('parseAndValidateCookies', () => {
  it('parses and validates a cookie string', () => {
    const cookies = parseAndValidateCookies(
      'sessionid=abc; csrftoken=def; ds_user_id=123; mid=xyz',
    );
    expect(cookies.sessionid).toBe('abc');
    expect(cookies.csrftoken).toBe('def');
    expect(cookies.ds_user_id).toBe('123');
    expect(cookies.mid).toBe('xyz');
  });

  it('throws ValidationError for missing required cookies', () => {
    expect(() => parseAndValidateCookies('mid=xyz')).toThrow(ValidationError);
  });
});
