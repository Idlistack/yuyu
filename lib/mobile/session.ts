import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { IssuedMobileSession } from "@/lib/mobileAuth";
import { mobileUserSelect, toUserDto } from "@/lib/mobile/dto";
import { sessionDtoSchema } from "@/lib/mobile/schemas";

export const deviceFieldsSchema = {
  deviceName: z.string().trim().max(120).optional(),
  platform: z.enum(["android", "ios"]).optional(),
};

export async function sessionDto(issued: IssuedMobileSession, userId: string, baseUrl: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: mobileUserSelect });
  return sessionDtoSchema.parse({
    accessToken: issued.accessToken,
    accessTokenExpiresAt: issued.accessTokenExpiresAt.toISOString(),
    refreshToken: issued.refreshToken,
    refreshTokenExpiresAt: issued.refreshTokenExpiresAt.toISOString(),
    user: toUserDto(user, baseUrl),
  });
}
