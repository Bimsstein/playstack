import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { APP_SETTING_KEYS, type AppSettingKey, getRuntimeConfig } from "@/lib/runtime-config";

const settingsSchema = z.object({
  values: z.record(z.string(), z.string().optional())
});

export async function GET() {
  const config = await getRuntimeConfig();
  return NextResponse.json({ values: config });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json();
  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const allowed = new Set<string>(APP_SETTING_KEYS);
  const entries = Object.entries(parsed.data.values).filter(([k]) => allowed.has(k));

  for (const [key, value] of entries) {
    const trimmed = (value || "").trim();
    if (!trimmed) {
      await prisma.appSetting.deleteMany({ where: { key } });
      continue;
    }
    await prisma.appSetting.upsert({
      where: { key: key as AppSettingKey },
      update: { value: trimmed },
      create: { key: key as AppSettingKey, value: trimmed }
    });
  }

  const config = await getRuntimeConfig();
  return NextResponse.json({ ok: true, values: config });
}

