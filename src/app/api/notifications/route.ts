import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const [unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where: { readAt: null } }),
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        gameId: true,
        title: true,
        message: true,
        createdAt: true,
        readAt: true
      }
    })
  ]);

  return NextResponse.json({ unreadCount, notifications });
}

export async function PATCH() {
  await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}

