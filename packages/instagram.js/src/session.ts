import { APP_ID, DEFAULT_DOC_IDS, INBOX_URL, USER_AGENT, X_ASBD_ID } from './constants';
import { DocIdError, SessionError, ValidationError } from './errors';
import type { Cookies, DocIdMap, SessionData } from './types';
import { parseCookies } from './utils';

/** Validate that required cookies are present and non-empty. */
export function validateCookies(cookies: Cookies): void {
  const missing: string[] = [];
  if (!cookies.sessionid) {
    missing.push('sessionid');
  }
  if (!cookies.csrftoken) {
    missing.push('csrftoken');
  }
  if (!cookies.ds_user_id) {
    missing.push('ds_user_id');
  }
  if (missing.length > 0) {
    throw new ValidationError(`Missing required cookies: ${missing.join(', ')}`);
  }
}

/** Generate a 6-character random alphanumeric nonce. */
export function generateRequestNonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return result;
}

function extractValue(body: string, pattern: RegExp, name: string): string {
  const match = body.match(pattern);
  if (!match?.[1]) {
    throw new SessionError(`Failed to extract ${name} from page response`);
  }
  return match[1];
}

/** Build a cookie header string from typed cookies. */
export function buildCookieString(cookies: Cookies): string {
  const parts = [
    `sessionid=${cookies.sessionid}`,
    `csrftoken=${cookies.csrftoken}`,
    `ds_user_id=${cookies.ds_user_id}`,
  ];
  if (cookies.mid) {
    parts.push(`mid=${cookies.mid}`);
  }
  return parts.join('; ');
}

/**
 * Fetch the Instagram inbox page and extract session values from the HTML.
 */
export async function bootstrapSession(cookies: Cookies): Promise<SessionData> {
  const cookieHeader = buildCookieString(cookies);

  const response = await fetch(INBOX_URL, {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new SessionError(`Bootstrap fetch failed with status ${response.status}`);
  }

  const body = await response.text();

  const fbDtsg = extractValue(
    body,
    /\["DTSGInitData",\[\],\{"token":"([^"]+)"/,
    'fb_dtsg',
  );

  const lsd = extractValue(
    body,
    /\["LSD",\[\],\{"token":"([^"]+)"/,
    'lsd',
  );

  const spinR = extractValue(
    body,
    /"__spin_r":(\d+)/,
    '__spin_r',
  );

  const spinB = extractValue(
    body,
    /"__spin_b":"([^"]+)"/,
    '__spin_b',
  );

  const spinT = extractValue(
    body,
    /"__spin_t":(\d+)/,
    '__spin_t',
  );

  const hs = extractValue(
    body,
    /"__hs":"([^"]+)"/,
    '__hs',
  );

  const bloksVersion = extractValue(
    body,
    /"bloks_version":"([^"]+)"/,
    'bloks_version',
  );

  const igScopedId = extractValue(
    body,
    /"NON_FACEBOOK_USER_ID":"(\d+)"/,
    'IG scoped ID',
  );

  const deviceId = crypto.randomUUID();
  const sessionId = Math.floor(Math.random() * 9_000_000_000_000_000 + 1_000_000_000_000_000).toString();

  return {
    cookies,
    fbDtsg,
    lsd,
    rolloutHash: spinR,
    spinR,
    spinB,
    spinT,
    hs,
    bloksVersion,
    deviceId,
    sessionId,
    igScopedId,
    seqId: 0,
  };
}

type GraphQLBodyInput = {
  session: SessionData;
  queryName: string;
  variables: Record<string, unknown>;
  docIds: DocIdMap;
};

/** Build the form body for a GraphQL request. */
export function buildGraphQLBody(input: GraphQLBodyInput): URLSearchParams {
  const { session, queryName, variables, docIds } = input;
  const docId = docIds[queryName];
  if (!docId) {
    throw new DocIdError(`Unknown query name: ${queryName}. No doc_id mapping found.`);
  }

  const params = new URLSearchParams();
  params.set('av', session.igScopedId);
  params.set('__user', '0');
  params.set('__a', '1');
  params.set('__d', 'www');
  params.set('__comet_req', '7');
  params.set('__ccg', 'EXCELLENT');
  params.set('__rev', session.spinR);
  params.set('__s', generateRequestNonce());
  params.set('__hs', session.hs);
  params.set('lsd', session.lsd);
  params.set('fb_dtsg', session.fbDtsg);
  params.set('fb_api_caller_class', 'RelayModern');
  params.set('fb_api_req_friendly_name', queryName);
  params.set('doc_id', docId);
  params.set('variables', JSON.stringify(variables));

  return params;
}

/** Build standard headers for GraphQL requests. */
export function buildGraphQLHeaders(session: SessionData): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': buildCookieString(session.cookies),
    'User-Agent': USER_AGENT,
    'X-CSRFToken': session.cookies.csrftoken,
    'X-IG-App-ID': APP_ID,
    'X-Instagram-AJAX': session.spinR,
    'X-FB-LSD': session.lsd,
    'X-ASBD-ID': X_ASBD_ID,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/** Build standard headers for REST API requests. */
export function buildRestHeaders(session: SessionData): Record<string, string> {
  return {
    'Cookie': buildCookieString(session.cookies),
    'User-Agent': USER_AGENT,
    'X-CSRFToken': session.cookies.csrftoken,
    'X-IG-App-ID': APP_ID,
    'X-Instagram-AJAX': session.spinR,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/** Build the MQTT username JSON string for the CONNECT packet. */
export function buildMqttUsername(session: SessionData): string {
  return JSON.stringify({
    a: USER_AGENT,
    aid: Number(APP_ID),
    asi: { 'Accept-Language': 'en' },
    chat_on: false,
    cp: 1,
    ct: 'cookie_auth',
    d: session.deviceId,
    dc: '',
    ecp: 0,
    fg: true,
    gas: null,
    mqtt_sid: '',
    no_auto_fg: true,
    p: null,
    pack: [],
    php_override: '',
    pm: [],
    s: Number(session.sessionId),
    st: [],
    u: session.cookies.ds_user_id,
  });
}

/**
 * Parse a raw cookie string and return typed Cookies.
 * Wraps parseCookies from utils.
 */
export function parseAndValidateCookies(cookieString: string): Cookies {
  const parsed = parseCookies(cookieString);
  const cookies: Cookies = {
    sessionid: parsed['sessionid'] ?? '',
    csrftoken: parsed['csrftoken'] ?? '',
    ds_user_id: parsed['ds_user_id'] ?? '',
    mid: parsed['mid'] ?? '',
  };
  validateCookies(cookies);
  return cookies;
}
