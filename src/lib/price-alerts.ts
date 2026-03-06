import { GameStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function parsePrice(value?: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/\s/g, "").replace(/^EUR/i, "").replace(/^€/i, "");
  const numeric = cleaned.match(/[0-9]+(?:[.,][0-9]{1,2})?/);
  if (!numeric) return null;
  const normalized = numeric[0].replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export async function syncLowestPriceHistoryForGame(userId: string, gameId: string) {
  const game = await prisma.game.findFirst({
    where: { id: gameId, userId },
    select: { id: true, currentPrice: true, lowestPrice30Days: true }
  });
  if (!game) return;

  const currentNum = parsePrice(game.currentPrice);
  if (currentNum == null) return;

  const lowestNum = parsePrice(game.lowestPrice30Days);
  const shouldUpdate = lowestNum == null || currentNum < lowestNum - 0.001;
  if (!shouldUpdate) return;

  await prisma.game.update({
    where: { id: game.id },
    data: { lowestPrice30Days: game.currentPrice }
  });
}

export async function syncLowestPriceHistoryForAllGames(userId: string) {
  const rows = await prisma.game.findMany({
    where: { userId, currentPrice: { not: null } },
    select: { id: true, currentPrice: true, lowestPrice30Days: true }
  });

  for (const row of rows) {
    const currentNum = parsePrice(row.currentPrice);
    if (currentNum == null) continue;
    const lowestNum = parsePrice(row.lowestPrice30Days);
    const shouldUpdate = lowestNum == null || currentNum < lowestNum - 0.001;
    if (!shouldUpdate) continue;
    await prisma.game.update({
      where: { id: row.id },
      data: { lowestPrice30Days: row.currentPrice }
    });
  }
}

export async function evaluateWantPriceAlerts(userId: string) {
  const wantGames = await prisma.game.findMany({
    where: { userId, status: GameStatus.WANT_TO_PLAY },
    select: {
      id: true,
      title: true,
      currentPrice: true,
      lowestPrice30Days: true,
      wantBaselinePrice: true,
      priceAlertActive: true,
      lastAlertPrice: true
    }
  });

  for (const game of wantGames) {
    const current = parsePrice(game.currentPrice);
    const low30 = parsePrice(game.lowestPrice30Days);
    const baseline = game.wantBaselinePrice ?? low30;

    if (baseline == null) continue;

    if (game.wantBaselinePrice == null) {
      await prisma.game.update({
        where: { id: game.id },
        data: { wantBaselinePrice: baseline }
      });
    }

    if (current == null) continue;

    if (current < baseline) {
      const shouldNotify =
        !game.priceAlertActive ||
        game.lastAlertPrice == null ||
        current < game.lastAlertPrice - 0.001;

      if (shouldNotify) {
        await prisma.notification.create({
          data: {
            userId,
            gameId: game.id,
            title: "Price Drop",
            message: `${game.title} dropped to €${current.toFixed(2).replace(".", ",")} (baseline: €${baseline.toFixed(2).replace(".", ",")}).`
          }
        });
      }

      await prisma.game.update({
        where: { id: game.id },
        data: {
          priceAlertActive: true,
          lastAlertPrice: current,
          lastAlertAt: new Date()
        }
      });
      continue;
    }

    if (game.priceAlertActive) {
      await prisma.game.update({
        where: { id: game.id },
        data: {
          priceAlertActive: false
        }
      });
    }
  }
}

export async function syncWantBaselineForGame(userId: string, gameId: string) {
  const game = await prisma.game.findFirst({
    where: { id: gameId, userId },
    select: {
      id: true,
      status: true,
      lowestPrice30Days: true,
      wantBaselinePrice: true,
      priceAlertActive: true,
      lastAlertPrice: true
    }
  });
  if (!game) return;

  if (game.status !== GameStatus.WANT_TO_PLAY) return;
  const low30 = parsePrice(game.lowestPrice30Days);
  if (low30 == null) return;

  const updateData: {
    wantBaselinePrice?: number;
    priceAlertActive?: boolean;
    lastAlertPrice?: number | null;
  } = {};

  if (game.wantBaselinePrice == null) {
    updateData.wantBaselinePrice = low30;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.game.update({
      where: { id: game.id },
      data: updateData
    });
  }
}
