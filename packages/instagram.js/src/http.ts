import { BASE_URL, DEFAULT_DOC_IDS, GRAPHQL_ENDPOINT } from './constants';
import { ApiError, AuthError, RateLimitError } from './errors';
import { buildGraphQLBody, buildGraphQLHeaders, buildRestHeaders } from './session';
import type { DocIdMap, SessionData } from './types';
import { isRecord } from './utils';

export class HttpClient {
  private readonly session: SessionData;
  private readonly docIds: DocIdMap;

  constructor(session: SessionData, docIdOverrides?: Partial<DocIdMap>) {
    this.session = session;
    const merged: DocIdMap = { ...DEFAULT_DOC_IDS };
    if (docIdOverrides) {
      for (const [key, val] of Object.entries(docIdOverrides)) {
        if (val !== undefined) {
          merged[key] = val;
        }
      }
    }
    this.docIds = merged;
  }

  /**
   * Make a GraphQL request using a persisted query.
   *
   * The generic parameter `T` is trusted from the caller. The response
   * JSON is not validated at runtime since the shapes come from
   * Instagram's internal API and full validation would be impractical.
   */
  async graphql<T>(queryName: string, variables: Record<string, unknown>): Promise<T> {
    const body = buildGraphQLBody({
      session: this.session,
      queryName,
      variables,
      docIds: this.docIds,
    });
    const headers = buildGraphQLHeaders(this.session);

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    return this.handleResponse<T>(response, queryName);
  }

  /** Make a REST API request. */
  async rest<T>(
    path: string,
    options?: {
      method?: string;
      body?: Record<string, string>;
      query?: Record<string, string>;
    },
  ): Promise<T> {
    const method = options?.method ?? 'GET';
    const headers = buildRestHeaders(this.session);

    let url = `${BASE_URL}${path}`;
    if (options?.query) {
      const params = new URLSearchParams(options.query);
      url += `?${params.toString()}`;
    }

    const fetchOptions: RequestInit = { method, headers };

    if (options?.body) {
      const formBody = new URLSearchParams(options.body);
      fetchOptions.body = formBody.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await fetch(url, fetchOptions);
    return this.handleResponse<T>(response);
  }

  /** Upload a file to /ajax/mercury/upload.php. Returns the upload ID. */
  async upload(
    fileData: Buffer,
    filename: string,
    extraFields?: Record<string, string>,
  ): Promise<{ id: string }> {
    const headers = buildRestHeaders(this.session);

    const params = new URLSearchParams();
    params.set('__d', 'www');
    params.set('__user', '0');
    params.set('__a', '1');
    params.set('__rev', this.session.spinR);
    params.set('__hs', this.session.hs);
    params.set('fb_dtsg', this.session.fbDtsg);
    params.set('lsd', this.session.lsd);
    params.set('__spin_r', this.session.spinR);
    params.set('__spin_b', this.session.spinB);
    params.set('__spin_t', this.session.spinT);
    params.set('__ccg', 'EXCELLENT');
    params.set('__comet_req', '7');

    const url = `${BASE_URL}/ajax/mercury/upload.php?${params.toString()}`;

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileData)]);
    formData.append('farr', blob, filename);

    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        formData.append(key, value);
      }
    }

    delete headers['Content-Type'];
    headers['X-FB-LSD'] = this.session.lsd;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      this.throwForStatus(response.status);
    }

    let text = await response.text();

    if (text.startsWith('for (;;);')) {
      text = text.slice(9);
    }

    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      throw new ApiError('Upload response is not an object');
    }

    const payload = parsed['payload'];
    if (!isRecord(payload)) {
      throw new ApiError('Upload response missing payload');
    }

    const metadata = payload['metadata'];
    if (!isRecord(metadata)) {
      throw new ApiError('Upload response missing metadata');
    }

    const firstEntry = Object.values(metadata)[0];
    if (!isRecord(firstEntry)) {
      throw new ApiError('Upload response missing file metadata');
    }

    const id = firstEntry['image_id'] ?? firstEntry['video_id'] ?? firstEntry['audio_id'];
    if (id === undefined) {
      throw new ApiError('Upload response missing file ID');
    }

    return { id: String(id) };
  }

  // The generic `T` is caller-specified and not validated at runtime.
  // This is standard for HTTP client wrappers where the caller knows the shape.
  private async handleResponse<T>(response: Response, queryName?: string): Promise<T> {
    if (!response.ok) {
      this.throwForStatus(response.status, queryName);
    }

    const data: T = await response.json();
    return data;
  }

  private throwForStatus(status: number, queryName?: string): never {
    if (status === 401 || status === 403) {
      throw new AuthError(`Authentication failed (HTTP ${status})`);
    }
    if (status === 429) {
      throw new RateLimitError(`Rate limited (HTTP ${status})`);
    }
    throw new ApiError(
      `Request failed (HTTP ${status})${queryName ? ` for ${queryName}` : ''}`,
    );
  }
}
