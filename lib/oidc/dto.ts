import { z } from "zod";
import { CLIENT_ID_PATTERN, CODE_CHALLENGE_PATTERN } from "@/lib/oidc/primitives";

/*
 * Strict boundary schemas for the OIDC provider. Inputs list only the
 * parameters Yuyu acts on (OAuth requires unknown parameters to be ignored);
 * outputs are `.strict()` so a new field can never reach a relying party by
 * accident. Email is deliberately absent everywhere (People's Gallery D-Mail).
 */

const printable = (max: number) => z.string().min(1).max(max).regex(/^[\x20-\x7e]+$/);

export const authorizeRequestSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().regex(CLIENT_ID_PATTERN),
  redirect_uri: z.string().min(1).max(2000),
  scope: z.string().min(1).max(200),
  state: printable(512),
  nonce: printable(256),
  code_challenge: z.string().regex(CODE_CHALLENGE_PATTERN),
  code_challenge_method: z.literal("S256"),
  prompt: z.enum(["none", "consent"]).optional(),
});
export type AuthorizeRequestInput = z.infer<typeof authorizeRequestSchema>;

/** Parameters forwarded from /oauth/authorize to the consent screen. */
export const AUTHORIZE_PARAMS = ["response_type", "client_id", "redirect_uri", "scope", "state", "nonce", "code_challenge", "code_challenge_method", "prompt"] as const;

export const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1).max(256),
    redirect_uri: z.string().min(1).max(2000),
    code_verifier: z.string().min(1).max(256),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1).max(256),
    scope: z.string().min(1).max(200).optional(),
  }),
  z.object({
    grant_type: z.literal("client_credentials"),
    scope: z.string().min(1).max(200).optional(),
  }),
]);

export const revokeRequestSchema = z.object({
  token: z.string().min(1).max(256),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
});

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  refresh_token: z.string(),
  id_token: z.string(),
  scope: z.string(),
}).strict();

/** client_credentials: an access token only (no refresh or ID token: there is no user). */
export const clientCredentialsResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string(),
}).strict();

export const userInfoSchema = z.object({
  sub: z.string().min(1),
  name: z.string().optional(),
  picture: z.string().url().optional(),
}).strict();
export type UserInfo = z.infer<typeof userInfoSchema>;

/** Every claim an ID token may carry. Tests pin that nothing else appears. */
export const ID_TOKEN_CLAIMS = ["iss", "aud", "sub", "exp", "iat", "auth_time", "nonce", "name", "picture"] as const;

export const oauthErrorSchema = z.object({
  error: z.enum([
    "invalid_request", "invalid_client", "invalid_grant", "unauthorized_client",
    "unsupported_grant_type", "invalid_scope", "invalid_token", "temporarily_unavailable", "server_error",
  ]),
  error_description: z.string().optional(),
}).strict();
export type OAuthErrorBody = z.infer<typeof oauthErrorSchema>;
