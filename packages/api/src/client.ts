import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import axiosCookieJar from "axios-cookiejar-support";
import { Chance } from "chance";
import { createHmac, randomInt, randomUUID } from "crypto";
import EventEmitter from "eventemitter3";
import pino, { type Logger } from "pino";
import { type ParsedUrlQueryInput, stringify } from "querystring";
import { CookieJar, type SerializedCookieJar } from "tough-cookie";

import { AccountApi } from "./api/account";
import { DirectApi } from "./api/direct/api";
import { QeApi } from "./api/qe";
import {
  API_HOST,
  API_URL,
  BLOKS_VERSION_ID,
  CAPABILITIES_HEADER,
  CONNECTION_TYPE_HEADER,
  DEFAULT_APP_VERSION,
  DEFAULT_APP_VERSION_CODE,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_LOCALE,
  FB_ANALYTICS_APPLICATION_ID,
  PIGEON_SESSION_ID_LIFETIME,
  SIGNATURE_KEY,
  SIGNATURE_VERSION,
} from "./constants";
import { type DeviceConfig, generateDeviceConfig } from "./device";
import {
  type ApiState,
  type ExportedApiState,
  exportedApiStateSchema,
} from "./state";

export type ApiClientOpts = {
  appVersion?: string;
  appVersionCode?: string;
  language?: string;
  countryCode?: string;
  device?: DeviceConfig;
  logger?: Logger;
};

export class ApiClient extends EventEmitter<{
  response: (response: AxiosResponse) => void;
}> {
  logger: Logger;

  appVersion: string;
  appVersionCode: string;
  language: string;
  countryCode: string;
  device: DeviceConfig;

  state: ApiState = {
    wwwClaim: null,
    mid: null,
    directRegionHint: null,
    shbid: null,
    shbts: null,
    rur: null,
    auth: null,
    passwordEncryptionPubKey: null,
    passwordEncryptionKeyId: null,
  };
  cookieJar = new CookieJar();
  axiosClient = axiosCookieJar.wrapper(
    axios.create({
      jar: this.cookieJar,
      baseURL: API_URL,
    }),
  );

  qe = new QeApi(this);
  account = new AccountApi(this);
  direct = new DirectApi(this);

  constructor(opts?: ApiClientOpts) {
    super();
    this.logger = opts?.logger ?? createSilentLogger();
    this.appVersion = opts?.appVersion ?? DEFAULT_APP_VERSION;
    this.appVersionCode = opts?.appVersionCode ?? DEFAULT_APP_VERSION_CODE;
    this.language = opts?.language ?? DEFAULT_LOCALE;
    this.countryCode = opts?.countryCode ?? DEFAULT_COUNTRY_CODE;
    this.device = opts?.device ?? generateDeviceConfig(randomUUID());
  }

  #generateTemporaryGuid(seed: string, lifetimeMs: number) {
    return new Chance(
      `${seed}${this.device.deviceId}${Math.round(Date.now() / lifetimeMs)}`,
    ).guid();
  }

  #generatePigeonSessionId() {
    return (
      "UFS-" +
      this.#generateTemporaryGuid(
        "pigeon-session-id",
        PIGEON_SESSION_ID_LIFETIME,
      ) +
      "-1"
    );
  }

  generateUserAgent() {
    const { appVersion, appVersionCode, device, language } = this;
    return (
      `Instagram ${appVersion} ` +
      `Android (${device.androidVersion}/${device.androidRelease}; ` +
      `${device.dpi}; ${device.resolution}; ${device.manufacturer}; ` +
      `${device.model}; ${device.deviceName}; ${device.cpu}; ` +
      `${language}; ${appVersionCode})`
    );
  }

  isAuthenticated() {
    return !!this.state.auth;
  }

  extractCookie(key: string) {
    return this.cookieJar.getCookiesSync(API_URL).find((c) => c.key === key);
  }

  extractCookieValue(key: string) {
    const cookie = this.extractCookie(key);
    return cookie?.value ?? null;
  }

  getUserId() {
    return this.state.auth?.userId ?? this.extractCookieValue("ds_user_id");
  }

  getCsrfToken() {
    return this.extractCookieValue("csrftoken");
  }

  signFormData(data: Record<string, unknown> | string) {
    const json = typeof data === "object" ? JSON.stringify(data) : data;
    const signature = createHmac("sha256", SIGNATURE_KEY)
      .update(json)
      .digest("hex");
    return {
      ig_sig_key_version: SIGNATURE_VERSION,
      signed_body: `${signature}.${json}`,
    };
  }

  exportState(): ExportedApiState {
    return exportedApiStateSchema.parse({
      ...structuredClone(this.state),
      cookieJar: this.cookieJar.serializeSync(),
    });
  }

  importState(state: ExportedApiState) {
    const parsedState = exportedApiStateSchema.parse(state);
    this.state = parsedState;
    try {
      this.cookieJar = CookieJar.deserializeSync(
        parsedState.cookieJar as SerializedCookieJar,
      );
    } catch {
      this.cookieJar = new CookieJar();
    }
    this.axiosClient = axiosCookieJar.wrapper(
      axios.create({
        jar: this.cookieJar,
        baseURL: API_URL,
      }),
    );
  }

  #getBaseHeaders() {
    const { countryCode, language, device } = this;
    const headers: Record<string, string> = {
      "X-IG-App-Locale": language,
      "X-IG-Device-Locale": language,
      "X-IG-Mapped-Locale": language,
      "X-Pigeon-Session-Id": this.#generatePigeonSessionId(),
      "X-Pigeon-Rawclienttime": (Date.now() / 1000).toString(),
      "X-IG-Bandwidth-Speed-KBPS": (
        randomInt(2500000, 3000000) / 1000
      ).toString(),
      "X-IG-Bandwidth-TotalBytes-B": randomInt(5000000, 90000000).toString(),
      "X-IG-Bandwidth-TotalTime-MS": randomInt(2000, 9000).toString(),
      "X-IG-App-Startup-Country": countryCode.toUpperCase(),
      "X-Bloks-Version-Id": BLOKS_VERSION_ID,
      "X-IG-WWW-Claim": "0",
      "X-Bloks-Is-Layout-RTL": "false",
      "X-Bloks-Is-Panorama-Enabled": "true",
      "X-IG-Device-ID": device.uuid,
      "X-IG-Family-Device-ID": device.phoneId,
      // "X-IG-Android-ID": device.androidDeviceId,
      // "X-IG-Timezone-Offset": str(self.timezone_offset),
      "X-IG-Connection-Type": CONNECTION_TYPE_HEADER,
      "X-IG-Capabilities": CAPABILITIES_HEADER,
      "X-IG-App-ID": FB_ANALYTICS_APPLICATION_ID,
      Priority: "u=3",
      "User-Agent": this.generateUserAgent(),
      "Accept-Language": language,
      "X-MID": this.state.mid ?? "",
      "Accept-Encoding": "gzip, deflate",
      Host: API_HOST,
      "X-FB-HTTP-Engine": "Liger",
      Connection: "keep-alive",
      "X-FB-Client-IP": "True",
      "X-FB-Server-Cluster": "True",
      "IG-INTENDED-USER-ID": "0",
      "X-IG-Nav-Chain":
        "9MV:self_profile:2,ProfileMediaTabFragment:self_profile:3,9Xf:self_following:4",
      "X-IG-SALT-IDS": randomInt(1061162222, 1061262222).toString(),
    };

    const userId = this.state.auth?.userId;
    if (userId) {
      const nextYear = Date.now() + 1000 * 60 * 60 * 24 * 365;
      headers["IG-U-DS-USER-ID"] = userId;
      headers["IG-INTENDED-USER-ID"] = userId;
      headers["IG-U-IG-DIRECT-REGION-HINT"] =
        this.state.directRegionHint ??
        `LLA,${userId},${nextYear}:01f7bae7d8b131877d8e0ae1493252280d72f6d0d554447cb1dc9049b6b2c507c08605b7`;
      headers["IG-U-SHBID"] =
        this.state.shbid ??
        `12695,${userId},${nextYear}:01f778d9c9f7546cf3722578fbf9b85143cd6e5132723e5c93f40f55ca0459c8ef8a0d9f`;
      headers["IG-U-SHBTS"] =
        this.state.shbts ??
        `${Date.now() / 1000},${userId},${nextYear}:01f778d9c9f7546cf3722578fbf9b85143cd6e5132723e5c93f40f55ca0459c8ef8a0d9f`;
      headers["IG-U-RUR"] =
        this.state.rur ??
        `RVA,${userId},${nextYear}:01f7f627f9ae4ce2874b2e04463efdb184340968b1b006fa88cb4cc69a942a04201e544c`;
    }

    return headers;
  }

  #updateAuthState(response: AxiosResponse) {
    const {
      "x-ig-set-www-claim": wwwClaim,
      "ig-set-x-mid": mid,
      "ig-set-ig-u-ig-direct-region-hint": directRegionalHint,
      "ig-set-ig-u-shbid": shbid,
      "ig-set-ig-u-shbts": shbts,
      "ig-set-ig-u-rur": rur,
      "ig-set-authorization": authToken,
      "ig-set-password-encryption-key-id": pwKeyId,
      "ig-set-password-encryption-pub-key": pwPubKey,
    } = response.headers;

    if (typeof wwwClaim === "string") {
      this.state.wwwClaim = wwwClaim || null;
    }
    if (typeof mid === "string") {
      this.state.mid = mid || null;
    }
    if (typeof directRegionalHint === "string") {
      this.state.directRegionHint = directRegionalHint || null;
    }
    if (typeof shbid === "string") {
      this.state.shbid = shbid || null;
    }
    if (typeof shbts === "string") {
      this.state.shbts = shbts || null;
    }
    if (typeof rur === "string") {
      this.state.rur = rur || null;
    }
    if (typeof authToken === "string") {
      if (authToken) {
        try {
          const parsedAuth = parseAuthToken(authToken);
          this.state.auth = {
            token: authToken,
            userId: parsedAuth.ds_user_id,
            sessionId: parsedAuth.sessionid,
            shouldUserHeaderOverCookie:
              parsedAuth.should_user_header_over_cookie,
          };
        } catch {
          throw new Error(`Failed to parse auth token: ${authToken}`);
        }
      } else {
        this.state.auth = null;
      }
    }
    if (typeof pwPubKey === "string") {
      this.state.passwordEncryptionPubKey = pwPubKey || null;
    }
    if (typeof pwKeyId === "string") {
      this.state.passwordEncryptionKeyId = pwKeyId || null;
    }
  }

  async makeRequest<R = unknown>(
    opts?: AxiosRequestConfig & {
      form?: ParsedUrlQueryInput;
    },
  ) {
    const baseHeaders = this.#getBaseHeaders();
    const response = await this.axiosClient.request<R>({
      ...opts,
      headers: {
        ...baseHeaders,
        ...opts?.headers,
      },
      data: opts?.form ? stringify(opts.form) : (opts?.data as unknown),
    });
    this.#updateAuthState(response);
    this.emit("response", response);

    return response.data;
  }
}

function parseAuthToken(token: string) {
  return JSON.parse(
    Buffer.from(token.substring("Bearer IGT:2:".length), "base64").toString(),
  ) as {
    ds_user_id: string;
    sessionid: string;
    should_user_header_over_cookie: string;
  };
}

function createSilentLogger() {
  return pino({
    level: "silent",
  });
}
