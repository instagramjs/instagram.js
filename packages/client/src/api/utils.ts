import {
  APP_VERSION,
  APP_VERSION_CODE,
  BLOKS_IS_LAYOUT_RTL,
  BLOKS_PRISM_AX_BASE_COLORS_ENABLED,
  BLOKS_PRISM_BUTTON_VERSION,
  BLOKS_PRISM_COLORS_ENABLED,
  BLOKS_PRISM_FONT_ENABLED,
  BLOKS_VERSION_ID,
  CAPABILITIES_HEADER,
  CONNECTION_TYPE,
  FB_ANALYTICS_APP_ID,
  LOCALE,
  PIGEON_SESSION_ID_LIFETIME,
  TIMEZONE_OFFSET,
} from "~/const";
import { type DeviceConfig } from "~/device";
import { temporaryGuid } from "~/utils";

export function generateUserAgent(deviceConfig: DeviceConfig) {
  return (
    `Instagram ${APP_VERSION} Android` +
    `(${deviceConfig.androidVersion}/${deviceConfig.androidRelease}; ` +
    `${deviceConfig.dpi}; ${deviceConfig.resolution}; ${deviceConfig.manufacturer}; ` +
    `${deviceConfig.deviceName}; ${deviceConfig.model}; ${deviceConfig.cpu}; ` +
    `${LOCALE}; ${APP_VERSION_CODE})`
  );
}

export function generateBaseHeaders(deviceConfig: DeviceConfig) {
  const pigeonSessionGuid = temporaryGuid(
    `pigeon-session-id${deviceConfig.deviceId}`,
    PIGEON_SESSION_ID_LIFETIME,
  );

  return {
    "x-ig-app-locale": LOCALE,
    "x-ig-device-locale": LOCALE,
    "x-ig-mapped-locale": LOCALE,
    "x-pigeon-session-id": `UFS-${pigeonSessionGuid}-1`,
    "x-pigeon-rawclienttime": `${Date.now() / 1000}`,
    "x-ig-bandwidth-speed-kbps": "-1.000",
    "x-ig-bandwidth-totalbytes-b": "0",
    "x-ig-bandwidth-totaltime-ms": "0",
    "x-bloks-version-id": BLOKS_VERSION_ID,
    "x-ig-www-claim": "0",
    "x-bloks-prism-button-version": BLOKS_PRISM_BUTTON_VERSION,
    "x-bloks-prism-colors-enabled": BLOKS_PRISM_COLORS_ENABLED,
    "x-bloks-prism-ax-base-colors-enabled": BLOKS_PRISM_AX_BASE_COLORS_ENABLED,
    "x-bloks-prism-font-enabled": BLOKS_PRISM_FONT_ENABLED,
    "x-bloks-is-layout-rtl": BLOKS_IS_LAYOUT_RTL,
    "x-ig-device-id": deviceConfig.deviceId,
    "x-ig-android-id": deviceConfig.androidId,
    "x-ig-timezone-offset": TIMEZONE_OFFSET,
    "x-fb-connection-type": CONNECTION_TYPE,
    "x-ig-connection-type": CONNECTION_TYPE,
    "x-ig-capabilities": CAPABILITIES_HEADER,
    "x-ig-app-id": FB_ANALYTICS_APP_ID,
    priority: "u=3",
    "user-agent": generateUserAgent(deviceConfig),
    "accept-language": LOCALE.replace("_", "-"),
    "ig-intended-user-id": "0",
    "accept-encoding": "gzip, deflate",
    "x-fb-http-engine": "Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
  } as const;
}
