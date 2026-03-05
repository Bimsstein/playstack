import { GameSource, GameStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchStoryPlusHoursFromHltb } from "@/lib/hltb";
import {
  evaluateWantPriceAlerts,
  syncLowestPriceHistoryForGame,
  syncWantBaselineForGame
} from "@/lib/price-alerts";
import { prisma } from "@/lib/prisma";

const gameSchema = z.object({
  source: z.nativeEnum(GameSource).optional(),
  psnTitleId: z.string().min(1).max(64).optional(),
  steamAppId: z.number().int().positive().optional(),
  nintendoGameId: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(120),
  platform: z.string().max(60).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  currentPrice: z.string().max(40).optional().nullable(),
  lowestPrice30Days: z.string().max(40).optional().nullable(),
  psnStoreRating: z.number().min(0).max(5).optional().nullable(),
  status: z.nativeEnum(GameStatus),
  rating: z.number().int().min(1).max(10).optional().nullable(),
  trophyCompletion: z.number().int().min(0).max(100).optional().nullable(),
  earnedTrophies: z.number().int().min(0).optional().nullable(),
  totalTrophies: z.number().int().min(0).optional().nullable(),
  storyPlusHours: z.number().int().min(1).max(1000).optional().nullable()
});

const updateSchema = z.object({
  id: z.string().min(1),
  source: z.nativeEnum(GameSource).optional(),
  title: z.string().min(1).max(120).optional(),
  platform: z.string().max(60).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  steamAppId: z.number().int().positive().optional().nullable(),
  nintendoGameId: z.string().min(1).max(120).optional().nullable(),
  currentPrice: z.string().max(40).optional().nullable(),
  lowestPrice30Days: z.string().max(40).optional().nullable(),
  psnStoreRating: z.number().min(0).max(5).optional().nullable(),
  storyPlusHours: z.number().int().min(1).max(1000).optional().nullable(),
  status: z.nativeEnum(GameStatus).optional(),
  rating: z.number().int().min(1).max(10).optional().nullable()
});

export async function GET() {
  const games = await prisma.game.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
  return NextResponse.json(games);
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const parsed = gameSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { psnTitleId, steamAppId, nintendoGameId, source, storyPlusHours, ...data } = parsed.data;
  let resolvedStoryPlusHours = storyPlusHours ?? null;
  if (resolvedStoryPlusHours == null) {
    try {
      resolvedStoryPlusHours = await fetchStoryPlusHoursFromHltb(parsed.data.title);
    } catch {
      resolvedStoryPlusHours = null;
    }
  }
  const game = psnTitleId
    ? await prisma.game.upsert({
        where: { psnTitleId },
        update: {
          ...data,
          storyPlusHours: resolvedStoryPlusHours,
          source: source ?? GameSource.PLAYSTATION,
          psnTitleId
        },
        create: {
          ...data,
          storyPlusHours: resolvedStoryPlusHours,
          source: source ?? GameSource.PLAYSTATION,
          psnTitleId
        }
      })
    : steamAppId
      ? await prisma.game.upsert({
          where: { steamAppId },
          update: {
            ...data,
            storyPlusHours: resolvedStoryPlusHours,
            source: source ?? GameSource.STEAM,
            steamAppId
          },
          create: {
            ...data,
            storyPlusHours: resolvedStoryPlusHours,
            source: source ?? GameSource.STEAM,
            steamAppId
          }
        })
      : nintendoGameId
        ? await prisma.game.upsert({
            where: { nintendoGameId },
            update: {
              ...data,
              storyPlusHours: resolvedStoryPlusHours,
              source: source ?? GameSource.NINTENDO,
              nintendoGameId
            },
            create: {
              ...data,
              storyPlusHours: resolvedStoryPlusHours,
              source: source ?? GameSource.NINTENDO,
              nintendoGameId
            }
          })
        : await prisma.game.create({
            data: {
              ...data,
              storyPlusHours: resolvedStoryPlusHours
            }
          });
  await syncLowestPriceHistoryForGame(game.id);
  await syncWantBaselineForGame(game.id);
  await evaluateWantPriceAlerts();
  return NextResponse.json(game, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json();
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, title, storyPlusHours, ...data } = parsed.data;
  let resolvedStoryPlusHours = storyPlusHours;
  if ((resolvedStoryPlusHours === undefined || resolvedStoryPlusHours === null) && title) {
    try {
      resolvedStoryPlusHours = await fetchStoryPlusHoursFromHltb(title);
    } catch {
      // keep unchanged if fetch fails
    }
  }
  const game = await prisma.game.update({
    where: { id },
    data: {
      ...data,
      ...(title !== undefined ? { title } : {}),
      ...(resolvedStoryPlusHours !== undefined ? { storyPlusHours: resolvedStoryPlusHours } : {})
    }
  });
  await syncLowestPriceHistoryForGame(game.id);
  await syncWantBaselineForGame(game.id);
  await evaluateWantPriceAlerts();

  return NextResponse.json(game);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.game.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
