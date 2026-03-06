import { prisma } from "@/lib/prisma";

export const APP_SETTING_KEYS = [
  "PSN_NPSSO",
  "PSN_ACCOUNT_ID",
  "PSN_STORE_LOCALE",
  "STEAM_API_KEY",
  "STEAM_STEAMID",
  "RAWG_API_KEY"
] as const;

export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];
export type RuntimeConfig = Record<AppSettingKey, string>;

const DEFAULTS: RuntimeConfig = {
  PSN_NPSSO: "",
  PSN_ACCOUNT_ID: "me",
  PSN_STORE_LOCALE: "en-us",
  STEAM_API_KEY: "",
  STEAM_STEAMID: "",
  RAWG_API_KEY: ""
};

export async function getRuntimeConfig(userId?: string): Promise<RuntimeConfig> {
  const scopedKeys = userId ? APP_SETTING_KEYS.map((k) => `${userId}:${k}`) : [...APP_SETTING_KEYS];
  const keysToRead = [...scopedKeys];
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: keysToRead } }
  });
  const dbMap = new Map(rows.map((row) => [row.key, row.value]));

  const read = (key: AppSettingKey) => {
    const dbKey = userId ? `${userId}:${key}` : key;
    const dbVal = dbMap.get(dbKey)?.trim();
    if (dbVal) return dbVal;
    // Authenticated users must never inherit global/env secrets.
    // Unauthenticated/system reads (no userId) can still use env fallback.
    if (!userId) {
      const envVal = process.env[key]?.trim();
      if (envVal) return envVal;
    }
    return DEFAULTS[key];
  };

  return {
    PSN_NPSSO: read("PSN_NPSSO"),
    PSN_ACCOUNT_ID: read("PSN_ACCOUNT_ID"),
    PSN_STORE_LOCALE: read("PSN_STORE_LOCALE"),
    STEAM_API_KEY: read("STEAM_API_KEY"),
    STEAM_STEAMID: read("STEAM_STEAMID"),
    RAWG_API_KEY: read("RAWG_API_KEY")
  };
}
