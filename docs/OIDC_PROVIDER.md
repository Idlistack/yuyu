# OpenID Connect provider ("Sign in with Yuyu")

[Documentation index](README.md)

Yuyu is a minimal, first-party OpenID Connect provider so that companion apps
run by the same operator, first of all **People's Gallery** (event photos),
can sign people in with their Yuyu account. It implements only what those
apps need: the authorization code flow with mandatory PKCE, refresh tokens,
UserInfo, revocation, discovery and a JWKS, plus a client-credentials grant
for first-party machine scopes (the [People's Gallery integration
API](PG_INTEGRATION.md)). There is no dynamic client registration, implicit or
hybrid flow, or email claim.

Relying parties are registered by the operator with a command-line tool;
nobody can register a client from the web.

## Endpoints

The issuer is `NEXT_PUBLIC_BASE_URL` (falling back to `AUTH_URL`, then
`http://localhost:3000` in development), without a trailing slash. It never
comes from request headers.

| Method and route | Authentication | Purpose |
| --- | --- | --- |
| `GET /.well-known/openid-configuration` | Public | Provider metadata (OIDC Discovery 1.0) |
| `GET /oauth/jwks` | Public | ID-token verification keys (ES256): the active key and keys retired in the last 7 days |
| `GET /oauth/authorize` | Yuyu session (redirects to `/login` when signed out) | Authorization endpoint (code flow only) |
| `GET /oauth/consent` | Yuyu session | The one-time authorisation screen; Allow and Cancel are Server Actions |
| `POST /oauth/token` | Client authentication | `authorization_code` and `refresh_token` grants; `client_credentials` for machine scopes |
| `GET`/`POST /oauth/userinfo` | Bearer access token (header only) | `sub`, `name`, `picture` |
| `POST /oauth/revoke` | Client authentication | RFC 7009 revocation of an access or refresh token |

Token, UserInfo, revocation and the authorization pages are `no-store`; the
authorization and consent pages are `noindex` and `no-referrer`, and
`/oauth/` is disallowed in `robots.txt`.

### Authorization request

```
GET /oauth/authorize?response_type=code
  &client_id=yyc_…
  &redirect_uri=<exactly as registered>
  &scope=openid profile yuyu.events
  &state=<opaque, ≤512>
  &nonce=<opaque, ≤256>
  &code_challenge=<BASE64URL(SHA256(verifier))>
  &code_challenge_method=S256
  [&prompt=none|consent]
```

- `state`, `nonce` and PKCE with `S256` are **required**. `plain` is refused.
- `redirect_uri` must equal a registered URI byte for byte: no prefix,
  trailing-slash, case, query or port leniency.
- A parameter sent twice makes the request invalid.
- An unknown or disabled client, or an unregistered redirect URI, is shown
  as an error on Yuyu and **never** redirected anywhere. Every other error is
  returned to the registered redirect URI as `error`, `error_description`,
  `state` and `iss` (RFC 9207).
- Signed out: Yuyu sign-in, then back to the authorization request. With
  `prompt=none`: `error=login_required`.
- First time for this client (or more scopes than approved, or after the
  person disconnected the app, or `prompt=consent`): the authorisation screen.
  With `prompt=none`: `error=consent_required`.
- Otherwise: straight back with `code`, `state` and `iss`.

### Scopes and consent

| Scope | Consent line | Gives |
| --- | --- | --- |
| `openid` (required) | "Know who you are" | Pairwise `sub` |
| `profile` | "Know who you are" | `name`, `picture` |
| `yuyu.events` | "See events you're part of" | Reserved for the People's Gallery integration API (event roles and registrations by pairwise `sub`); grants nothing on these endpoints by itself |

**Machine scope `yuyu.integration`.** Not a user scope: it is never accepted
at `/oauth/authorize` and never shown on the consent screen. A confidential,
first-party client whose allowed scopes include it (added by `npm run
pg:integration -- configure`) can call `POST /oauth/token` with
`grant_type=client_credentials` and receives only an opaque 10-minute access
token (`yoi_…`, stored as a SHA-256 digest in `OAuthClientToken`): no refresh
token, no ID token, no user. UserInfo refuses it. Other clients get
`unauthorized_client`. See [People's Gallery integration](PG_INTEGRATION.md).

The screen reads "People's Gallery wants to: Know who you are · See events
you're part of" and states that the app never sees the email address.
Approval is stored once per person and client in `OAuthGrant` and widened
only by a later approval. **Account → Security → Connected apps** lists
grants with **Disconnect**, which revokes the grant and every token minted
under it; the next sign-in asks again.

### Token request

`application/x-www-form-urlencoded`, client authentication by
`client_secret_basic` (preferred), `client_secret_post`, or `none` for a
public client (PKCE then carries the proof). Using two methods at once, a
secret for a public client, or no secret for a confidential client is
`invalid_client` (401).

```
grant_type=authorization_code&code=yoc_…&redirect_uri=…&code_verifier=…
grant_type=refresh_token&refresh_token=yor_…[&scope=<subset>]
```

Response (`no-store`):

```json
{ "access_token": "yoa_…", "token_type": "Bearer", "expires_in": 600,
  "refresh_token": "yor_…", "id_token": "<ES256 JWT>", "scope": "openid profile yuyu.events" }
```

| Item | Lifetime and rules |
| --- | --- |
| Authorization code | 60 s, single use, bound to client, exact redirect URI, PKCE challenge, nonce and the user's `sessionVersion`. Failed PKCE or redirect checks do not burn it; a second redemption is `invalid_grant` **and revokes the tokens the code issued** |
| Access token | 10 min, opaque (`yoa_`), for UserInfo |
| Refresh token | 30 days, opaque (`yor_`), rotates on every use. Replaying the previous token within 30 s (a lost response) is refused without revoking; after that it revokes the session. `scope` may narrow, never widen |
| ID token | 5 min, ES256, `kid` header |

### ID token and UserInfo claims

| Claim | Value |
| --- | --- |
| `iss` | The issuer |
| `aud` | The `client_id` |
| `sub` | Pairwise subject: `base64url(HMAC-SHA256(client salt, "yuyu-oidc-sub-v1|" + userId))` |
| `iat`, `exp` | Issue time, +300 s |
| `auth_time` | When the person signed in to Yuyu |
| `nonce` | From the authorization request (code exchange only) |
| `name`, `picture` | With `profile`, when set. `picture` is an absolute URL (uploaded photo or the Google picture), never a Gravatar, which would leak a hash of the email |

UserInfo returns `{ sub, name?, picture? }`. **No email address, email
verification flag, Yuyu user id, organisation membership or role is ever
returned** (People's Gallery decisions D-Mail/D-3: Yuyu sends every attendee
notification itself). The DTOs are strict Zod schemas, and tests pin the
claim list. A `yy_orgs` claim was considered and left out: PG resolves roles
through the integration API, not the ID token.

Each client has its own random 256-bit salt, so two clients see unrelated
`sub` values for the same person, and neither learns Yuyu's internal id. The
salt never changes, so `sub` is stable for the client's lifetime.

## Revocation

Tokens are valid only while all of these hold: the session row is not
revoked, the user's `sessionVersion` equals the one recorded when the code
was issued, the grant is not revoked, and the client is `ACTIVE`.

| Event | Effect |
| --- | --- |
| Password change, password reset, MFA enable/disable, **Sign out everywhere** | `sessionVersion` changes; in the same transaction every `OAuthSession` of the user is marked revoked (`revokeUserOAuthSessions`). Codes issued earlier stop working. The grant stays, so signing in again does not ask for consent |
| **Disconnect** in Connected apps | Grant and its sessions revoked |
| `POST /oauth/revoke` by the client | That session revoked |
| Client disabled (CLI) | All its sessions revoked; its tokens and authorization requests refused |
| Account deleted | Cascades |

People's Gallery keeps its own session after sign-in. Each event above also
queues `user.sessions_revoked { subject, reason }` for PG in the same
transaction (database triggers on `User.sessionVersion`, `OAuthGrant.revokedAt`
and `OAuthClient.status`; [People's Gallery integration](PG_INTEGRATION.md)),
so PG ends its session within a minute; account deletion queues
`user.deleted`. PG also notices at its next refresh or UserInfo call.

## Storage

| Model | What is stored |
| --- | --- |
| `OAuthClient` | `clientId` (`yyc_` + 22), name, SHA-256 of the secret (`yys_` + 43; null for a public client), exact redirect URIs (≤10; `https`, or `http` on loopback for development), allowed scopes, encrypted pairwise salt, `firstParty`, status |
| `OAuthAuthorizationCode` | SHA-256 of the code and its bindings; DB CHECKs force `S256` and `expiresAt ≤ createdAt + 60 s` |
| `OAuthGrant` | Person × client consent with scopes, `revokedAt` |
| `OAuthSession` | SHA-256 of the current access and refresh tokens and the previous refresh token, `sessionVersion`, scopes, expiries, `revokedAt` |
| `OAuthSigningKey` | `kid` (JWK thumbprint), public JWK, AES-256-GCM encrypted private JWK, `retiredAt`/`expiresAt`; a partial unique index allows one active key |

Signing keys and pairwise salts are encrypted under their own HKDF label
(`yuyu-oidc-provider-secrets-v1`) of `MFA_ENCRYPTION_KEY`.
`scripts/check-instance-secrets.mjs` checks that the current key can decrypt
them. **Losing or rotating `MFA_ENCRYPTION_KEY` without re-encryption changes
nothing visible until it is needed, then breaks every app sign-in and would
change every pairwise `sub`.** Keep the key stable, as for MFA seeds.

Raw codes, tokens and secrets are never logged or audited. Retention removes
codes a day after expiry and sessions once they can no longer be refreshed
or 30 days after revocation.

## Registering a client

No new environment variables are needed. Run the CLI with the application's
environment (`DATABASE_URL`, `MFA_ENCRYPTION_KEY`), for example in the
migrator image or job:

```bash
npm run oauth:client -- register \
  --name "People's Gallery" \
  --redirect-uri https://photos.example.org/api/v2/auth/yuyu/callback \
  --scopes "openid profile yuyu.events" \
  --first-party
```

It prints `client_id` and `client_secret` **once**; only the secret's
SHA-256 is stored. Put both in the relying party's secret store. For local
development, People's Gallery uses
`http://localhost:8080/api/v2/auth/yuyu/callback`. Add `--public` for a
client that cannot keep a secret (it then authenticates with PKCE alone).

| Command | Effect (each is audited) |
| --- | --- |
| `list` | Clients, status, scopes and redirect URIs (no secrets) |
| `rotate-secret --client-id yyc_…` | New secret, shown once; the old one stops working at once |
| `set-redirect-uris --client-id yyc_… --redirect-uri … [--redirect-uri …]` | Replace the exact-match list |
| `disable` / `enable --client-id yyc_…` | Disabling revokes every session of the client |
| `rotate-key` | New active signing key; the previous key stays in the JWKS for 7 days |

The first signing key is created automatically on first use. Rotate it
deliberately (for example yearly, or at once after a suspected leak of
`MFA_ENCRYPTION_KEY` or a database dump together with the key).

## Relying-party checklist (People's Gallery)

- Discovery: `<issuer>/.well-known/openid-configuration`.
- Send `state`, `nonce` and PKCE `S256` on every request; keep the verifier
  server-side or in an encrypted, short-lived cookie.
- Exchange the code with `client_secret_basic` from the backend.
- Verify the ID token with the JWKS: `alg=ES256`, `iss`, `aud=client_id`,
  `exp`, `nonce`; check `iss` in the redirect too.
- Key the local account on `sub` (pairwise; never expect an email).
- Treat `invalid_grant` on refresh as "signed out of Yuyu".

## Abuse protection

| Bucket | Limit | Key |
| --- | --- | --- |
| `oauthAuthorize` | 60/min | Client address (authorize); user (consent decisions) |
| `oauthToken` | 600/min | Client id (token, revoke); address for unidentifiable requests |
| `oauthUserinfo` | 120/min | OAuth session; address for invalid tokens |

Like other limits, these fail closed in production when Redis is
unavailable.

## Audit events

`OAUTH_CLIENT_REGISTERED`, `OAUTH_CLIENT_UPDATED`,
`OAUTH_CLIENT_SECRET_ROTATED`, `OAUTH_CLIENT_DISABLED`,
`OAUTH_CLIENT_ENABLED`, `OAUTH_SIGNING_KEY_CREATED`,
`OAUTH_SIGNING_KEY_ROTATED`, `OAUTH_GRANT_APPROVED`, `OAUTH_GRANT_REVOKED`,
`OAUTH_CONSENT_DENIED`, `OAUTH_TOKENS_ISSUED`, `OAUTH_TOKEN_REVOKED`,
`OAUTH_CODE_REUSED`, `OAUTH_REFRESH_TOKEN_REUSED`. Metadata holds the public
client id, scopes and counts only. The person sees grant approvals and
disconnections in **Recent security activity**.

## Tests

`tests/unit/oidc-provider.test.ts` (PKCE vectors, exact redirect matching,
pairwise stability and separation, scopes, credential shapes, encryption
shared with the CLI, signing-key rotation verified against the JWKS,
forbidden fields, and a check that every `sessionVersion` bump also revokes
OAuth sessions) and `tests/integration/oidc-provider.db.test.ts` (the full
flow against PostgreSQL). See [Testing](TESTING.md).
