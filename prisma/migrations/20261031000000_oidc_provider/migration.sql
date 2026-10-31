-- First-party OpenID Connect provider (docs/OIDC_PROVIDER.md). Additive only:
-- new tables, one enum and constraints; no existing table is altered, so every
-- statement takes locks only on the new, empty tables (plus a SHARE ROW
-- EXCLUSIVE lock on "User" for the foreign keys, briefly, while it validates
-- against empty tables).

-- CreateEnum
CREATE TYPE "OAuthClientStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretHash" TEXT,
    "redirectUris" TEXT[],
    "allowedScopes" TEXT[],
    "pairwiseSaltEncrypted" TEXT NOT NULL,
    "firstParty" BOOLEAN NOT NULL DEFAULT false,
    "status" "OAuthClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "nonce" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "authTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopes" TEXT[],
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "codeId" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "scopes" TEXT[],
    "authTime" TIMESTAMP(3) NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "previousRefreshTokenHash" TEXT,
    "rotatedAt" TIMESTAMP(3),
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthSigningKey" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "alg" TEXT NOT NULL,
    "publicJwk" JSONB NOT NULL,
    "privateJwkEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "OAuthSigningKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_codeHash_key" ON "OAuthAuthorizationCode"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_userId_idx" ON "OAuthAuthorizationCode"("userId");

-- CreateIndex
CREATE INDEX "OAuthGrant_clientId_idx" ON "OAuthGrant"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_userId_clientId_key" ON "OAuthGrant"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_codeId_key" ON "OAuthSession"("codeId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_accessTokenHash_key" ON "OAuthSession"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_refreshTokenHash_key" ON "OAuthSession"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_previousRefreshTokenHash_key" ON "OAuthSession"("previousRefreshTokenHash");

-- CreateIndex
CREATE INDEX "OAuthSession_userId_revokedAt_idx" ON "OAuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "OAuthSession_grantId_idx" ON "OAuthSession"("grantId");

-- CreateIndex
CREATE INDEX "OAuthSession_refreshExpiresAt_idx" ON "OAuthSession"("refreshExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSigningKey_kid_key" ON "OAuthSigningKey"("kid");

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "OAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "OAuthAuthorizationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity backstops for the application rules.
ALTER TABLE "OAuthClient"
  ADD CONSTRAINT "OAuthClient_clientId_shape" CHECK ("clientId" ~ '^yyc_[A-Za-z0-9_-]{22}$'),
  ADD CONSTRAINT "OAuthClient_secretHash_shape" CHECK ("secretHash" IS NULL OR "secretHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "OAuthClient_redirectUris_nonempty" CHECK (cardinality("redirectUris") BETWEEN 1 AND 10),
  ADD CONSTRAINT "OAuthClient_allowedScopes_openid" CHECK ('openid' = ANY ("allowedScopes")),
  ADD CONSTRAINT "OAuthClient_name_shape" CHECK (char_length("name") BETWEEN 1 AND 80);

ALTER TABLE "OAuthAuthorizationCode"
  ADD CONSTRAINT "OAuthAuthorizationCode_codeHash_shape" CHECK ("codeHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "OAuthAuthorizationCode_pkce_s256" CHECK ("codeChallengeMethod" = 'S256' AND "codeChallenge" ~ '^[A-Za-z0-9_-]{43}$'),
  ADD CONSTRAINT "OAuthAuthorizationCode_short_lived" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '60 seconds');

ALTER TABLE "OAuthSession"
  ADD CONSTRAINT "OAuthSession_hash_shape" CHECK (
    "accessTokenHash" ~ '^[a-f0-9]{64}$'
    AND "refreshTokenHash" ~ '^[a-f0-9]{64}$'
    AND ("previousRefreshTokenHash" IS NULL OR "previousRefreshTokenHash" ~ '^[a-f0-9]{64}$')
  );

ALTER TABLE "OAuthSigningKey"
  ADD CONSTRAINT "OAuthSigningKey_alg_known" CHECK ("alg" IN ('ES256', 'RS256')),
  ADD CONSTRAINT "OAuthSigningKey_retirement_shape" CHECK (("retiredAt" IS NULL AND "expiresAt" IS NULL) OR ("retiredAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" >= "retiredAt"));

-- At most one active signing key, so two replicas creating the first key at
-- the same time cannot both win.
CREATE UNIQUE INDEX "OAuthSigningKey_one_active" ON "OAuthSigningKey" ((true)) WHERE "retiredAt" IS NULL;
