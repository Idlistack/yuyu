"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import MuiLink from "@mui/material/Link";
import {
  requestPasswordReset,
  confirmPasswordReset,
} from "@/app/actions/password-reset";
import { PasswordTextField } from "@/components/forms/PasswordTextField";

const inputSx = {
  "& .MuiInputLabel-root": { color: "text.secondary" },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "text.primary",
  },
  "& .MuiOutlinedInput-root": {
    borderRadius: 2,
    backgroundColor: "action.hover",
    color: "text.primary",
    "& fieldset": { borderColor: "divider" },
    "&:hover fieldset": { borderColor: "text.secondary" },
    "&.Mui-focused fieldset": {
      borderColor: "rgba(124, 245, 182, 0.65)",
    },
  },
};

const primaryButtonSx = {
  textTransform: "none",
  borderRadius: 999,
  py: 1.1,
  color: "rgba(6,18,14,0.92)",
  fontWeight: 600,
  background:
    "linear-gradient(90deg, rgba(124, 245, 182, 0.92), rgba(67, 214, 170, 0.92))",
  boxShadow: "0 10px 30px rgba(124, 245, 182, 0.18)",
  "&:hover": {
    background:
      "linear-gradient(90deg, rgba(124, 245, 182, 1), rgba(67, 214, 170, 1))",
  },
};

export function ResetPasswordForm(props: { token: string; email: string }) {
  const { token, email: initialEmail } = props;
  const router = useRouter();
  const theme = useTheme();
  const hasToken = Boolean(token && initialEmail);

  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    startTransition(async () => {
      let res;
      try { res = await requestPasswordReset({ email }); }
      catch { setError("Password reset is temporarily unavailable. Please try again."); return; }
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setSuccess(
        "If an account exists with that email, we've sent a password reset link. Check your inbox.",
      );
    });
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    startTransition(async () => {
      let res;
      try { res = await confirmPasswordReset({
        email: initialEmail,
        token,
        password,
      }); } catch { setError("Password reset is temporarily unavailable. Please try again."); return; }
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setPassword("");
      setSuccess("Password reset successfully! Redirecting to sign in…");
      setTimeout(() => router.replace("/login"), 2000);
    });
  }

  return (
    <Box
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
        background:
          theme.palette.mode === "dark"
            ? "radial-gradient(1000px 600px at 18% 18%, rgba(124, 245, 182, 0.18), transparent 55%), radial-gradient(900px 600px at 88% 22%, rgba(185, 174, 255, 0.12), transparent 55%), linear-gradient(135deg, rgba(6,18,14,1) 0%, rgba(8,26,20,1) 55%, rgba(10,30,24,1) 120%)"
            : "radial-gradient(1000px 600px at 18% 18%, rgba(10,132,255,0.10), transparent 55%), radial-gradient(900px 600px at 88% 22%, rgba(94,92,230,0.10), transparent 55%), #f2f2f7",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "min(480px, 100%)",
          overflow: "hidden",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "background.paper",
          backdropFilter: "blur(10px)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.45)",
        }}
      >
        <Box sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography
                variant="overline"
                sx={{
                  letterSpacing: 1.4,
                  color: "text.secondary",
                }}
              >
                YUYU
              </Typography>
              <Typography
                variant="h4"
                component="h1"
                sx={{ fontWeight: 700, color: "text.primary" }}
              >
                {hasToken ? "Set new password" : "Reset password"}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mt: 0.75 }}
              >
                {hasToken
                  ? "Enter your new password below."
                  : "Enter your email and we'll send you a link to reset your password."}
              </Typography>
            </Box>

            <Box
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "action.hover",
                p: { xs: 2.25, sm: 2.75 },
              }}
            >
              {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
              {success ? <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert> : null}

              {hasToken ? (
                <Stack
                  component="form"
                  spacing={2}
                  onSubmit={handleReset}
                >
                  <PasswordTextField
                    label="New Password"
                    required
                    fullWidth
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
                    error={!!fieldErrors.password}
                    helperText={
                      fieldErrors.password?.[0] ?? "At least 12 characters."
                    }
                    sx={inputSx}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={pending}
                    fullWidth
                    sx={primaryButtonSx}
                  >
                    {pending ? "Resetting…" : "Reset password"}
                  </Button>
                </Stack>
              ) : (
                <Stack
                  component="form"
                  spacing={2}
                  onSubmit={handleRequest}
                >
                  <TextField
                    label="Email"
                    type="email"
                    required
                    fullWidth
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    error={!!fieldErrors.email}
                    helperText={fieldErrors.email?.[0]}
                    sx={inputSx}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={pending}
                    fullWidth
                    sx={primaryButtonSx}
                  >
                    {pending ? "Sending…" : "Send reset link"}
                  </Button>
                </Stack>
              )}
            </Box>

            <Box sx={{ textAlign: "center" }}>
              <MuiLink
                component={Link}
                href="/login"
                underline="hover"
                sx={{
                  color: "text.secondary",
                  fontSize: "0.875rem",
                  "&:hover": { color: "text.primary" },
                }}
              >
                Back to sign in
              </MuiLink>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
