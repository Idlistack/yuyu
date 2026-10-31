import { ID_TOKEN_ALG, OIDC_SCOPES, oidcIssuer } from "@/lib/oidc/config";

/** OpenID Provider Metadata (OIDC Discovery 1.0 §3); only what Yuyu implements. */
export function discoveryDocument(issuer = oidcIssuer()) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...OIDC_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    subject_types_supported: ["pairwise"],
    id_token_signing_alg_values_supported: [ID_TOKEN_ALG],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: ["iss", "aud", "sub", "exp", "iat", "auth_time", "nonce", "name", "picture"],
    prompt_values_supported: ["none", "consent"],
    authorization_response_iss_parameter_supported: true,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    claims_parameter_supported: false,
  };
}
