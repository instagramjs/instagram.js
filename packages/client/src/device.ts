import { Chance } from "chance";

export type DeviceConfig = {
  androidVersion: string;
  androidRelease: string;
  dpi: string;
  resolution: string;
  manufacturer: string;
  deviceName: string;
  model: string;
  cpu: string;
  uuid: string;
  phoneId: string;
  deviceId: string;
  androidId: string;
  adId: string;
};

export function generateDeviceConfig(
  seed: string,
  overrides?: Partial<DeviceConfig>,
): DeviceConfig {
  const chance = new Chance(seed);
  return {
    androidVersion: "13",
    androidRelease: "13",
    dpi: "280dpi",
    resolution: "720x1471",
    manufacturer: "samsung",
    deviceName: "SM-S134DL",
    model: "a03su",
    cpu: "mt6765",
    uuid: chance.guid(),
    phoneId: chance.guid(),
    deviceId: chance.guid(),
    androidId: `android-${chance.string({ pool: "abcdef0123456789", length: 16 })}`,
    adId: chance.guid(),
    ...overrides,
  };
}
