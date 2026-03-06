import { GameSource, GameStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUserFromRequest } from "@/lib/auth";
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

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const games = await prisma.game.findMany({
    where: { userId: user.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json(games);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        where: { userId_psnTitleId: { userId: user.id, psnTitleId } },
        update: {
          userId: user.id,
          ...data,
          storyPlusHours: resolvedStoryPlusHours,
          source: source ?? GameSource.PLAYSTATION,
          psnTitleId
        },
        create: {
          userId: user.id,
          ...data,
          storyPlusHours: resolvedStoryPlusHours,
          source: source ?? GameSource.PLAYSTATION,
          psnTitleId
        }
      })
    : steamAppId
      ? await prisma.game.upsert({
          where: { userId_steamAppId: { userId: user.id, steamAppId } },
          update: {
            userId: user.id,
            ...data,
            storyPlusHours: resolvedStoryPlusHours,
            source: source ?? GameSource.STEAM,
            steamAppId
          },
          create: {
            userId: user.id,
            ...data,
            storyPlusHours: resolvedStoryPlusHours,
            source: source ?? GameSource.STEAM,
            steamAppId
          }
        })
      : nintendoGameId
        ? await prisma.game.upsert({
            where: { userId_nintendoGameId: { userId: user.id, nintendoGameId } },
            update: {
              userId: user.id,
              ...data,
              storyPlusHours: resolvedStoryPlusHours,
              source: source ?? GameSource.NINTENDO,
              nintendoGameId
            },
            create: {
              userId: user.id,
              ...data,
              storyPlusHours: resolvedStoryPlusHours,
              source: source ?? GameSource.NINTENDO,
              nintendoGameId
            }
          })
        : await prisma.game.create({
            data: {
              userId: user.id,
              ...data,
              storyPlusHours: resolvedStoryPlusHours
            }
          });
  await syncLowestPriceHistoryForGame(user.id, game.id);
  await syncWantBaselineForGame(user.id, game.id);
  await evaluateWantPriceAlerts(user.id);
  return NextResponse.json(game, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const updateResult = await prisma.game.updateMany({
    where: { id, userId: user.id },
    data: {
      ...data,
      ...(title !== undefined ? { title } : {}),
      ...(resolvedStoryPlusHours !== undefined ? { storyPlusHours: resolvedStoryPlusHours } : {})
    }
  });
  if (updateResult.count === 0) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  const game = await prisma.game.findFirst({
    where: { id, userId: user.id }
  });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  await syncLowestPriceHistoryForGame(user.id, game.id);
  await syncWantBaselineForGame(user.id, game.id);
  await evaluateWantPriceAlerts(user.id);

  return NextResponse.json(game);
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.game.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
