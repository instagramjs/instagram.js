import { Chance } from "chance";

export type DeviceConfig = {
  androidVersion: number;
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
  adId: string;
};

export function generateDeviceConfig(seed: string): DeviceConfig {
  const chance = new Chance(seed);
  return {
    androidVersion: 35,
    androidRelease: "15.0.0",
    dpi: "480dpi",
    resolution: "1280x2856",
    manufacturer: "Google",
    deviceName: "Pixel 9 Pro",
    model: "pixel_9_pro",
    cpu: "qcom",
    uuid: chance.guid(),
    phoneId: chance.guid(),
    deviceId: chance.guid(),
    adId: chance.guid(),
  };
}
