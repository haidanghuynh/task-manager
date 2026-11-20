export const DEVICE_CATEGORIES = ["LAPTOP", "DESKTOP", "PHONE", "TABLET", "OTHER"] as const;
export const DEVICE_STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE", "RETIRED"] as const;
export const DEVICE_CODE_PATTERN = /^[A-Z0-9._-]{2,50}$/;

export function isDeviceCategory(value: string): value is (typeof DEVICE_CATEGORIES)[number] {
  return (DEVICE_CATEGORIES as readonly string[]).includes(value);
}

export function isDeviceStatus(value: string): value is (typeof DEVICE_STATUSES)[number] {
  return (DEVICE_STATUSES as readonly string[]).includes(value);
}
