import { Suspense } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { connection } from "next/server";
import { LoginForm } from "./ui";
import { getGoogleSsoSettings, isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  // The public registration policy is an instance setting and must be read
  // only for a real request, never from a build-time database.
  await connection();
  const [accountCreationEnabled, googleSsoConfigured] = await Promise.all([
    isNewUserRegistrationEnabled(),
    getGoogleSsoSettings().then(Boolean),
  ]);
  return (
    <Box
      data-login-page
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 3, md: 4 },
        overflow: "auto",
        background: "var(--login-page-background)",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "min(1180px, 100%)",
          minHeight: { md: 640 },
          overflow: "hidden",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "var(--login-surface-border)",
          backgroundColor: "background.paper",
          backdropFilter: "blur(10px)",
          boxShadow: "var(--login-surface-shadow)",
        }}
      >
        <Grid container>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box sx={{ p: { xs: 3, sm: 4 } }}>
              <Stack spacing={2.5}>
                <Box>
                  <Typography
                    variant="overline"
                    sx={{
                      letterSpacing: 1.4,
                      color: "var(--login-muted-text)",
                    }}
                  >
                    YUYU
                  </Typography>
                  <Typography
                    variant="h4"
                    component="h1"
                    sx={{ fontWeight: 700, color: "var(--login-heading-text)" }}
                  >
                    Get started now
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "var(--login-muted-text)", mt: 0.75 }}
                  >
                    Sign in with Google or your email and password. New here?
                    Create an account in seconds.
                  </Typography>
                </Box>

                <Box
                  sx={{
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "var(--login-form-border)",
                    backgroundColor: "var(--login-form-background)",
                    p: { xs: 2.25, sm: 2.75 },
                  }}
                >
                  <Suspense fallback={<Typography color="text.secondary">Loading sign in…</Typography>}>
                    <LoginForm accountCreationEnabled={accountCreationEnabled} googleSsoConfigured={googleSsoConfigured} />
                  </Suspense>
                </Box>
              </Stack>
            </Box>
          </Grid>

          <Grid
            size={{ xs: 12, md: 7 }}
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Box
              sx={{
                height: "100%",
                minHeight: 640,
                backgroundColor: "var(--login-hero-background)",
                position: "relative",
              }}
            >
              <Box
                component="img"
                src="/login-hero.svg"
                alt=""
                sx={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--login-hero-overlay)",
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
