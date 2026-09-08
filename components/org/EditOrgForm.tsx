"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { updateOrganisation } from "@/app/actions/org";
import { uploadOrganisationLogo } from "@/app/actions/media";
import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";
import { useToast } from "@/components/feedback/ToastProvider";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";

export function EditOrgForm(props: {
  organisationSlug: string;
  initial: { name: string; description: string; logoUrl: string | null };
}) {
  const { organisationSlug, initial } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(initial.logoUrl ?? "");
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !pending);

  return (
    <Stack
      component="form"
      spacing={2.5}
      onChangeCapture={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          let logoUrl = logoFile ? "" : logoPreviewUrl;
          if (logoFile) {
            const upload = new FormData();
            upload.set("organisationSlug", organisationSlug);
            upload.set("file", logoFile);
            const result = await uploadOrganisationLogo(upload);
            if (!result.ok) {
              setError(result.error);
              showToast(result.error, "error");
              return;
            }
            if (!result.data) {
              setError("Could not upload the logo.");
              showToast("Could not upload the logo.", "error");
              return;
            }
            logoUrl = result.data.url;
          }
          const res = await updateOrganisation({
            organisationSlug,
            name: String(fd.get("name") ?? ""),
            description: String(fd.get("description") ?? ""),
            logoUrl,
          });
          if (!res.ok) {
            setError(res.error);
            showToast(res.error, "error");
            return;
          }
          showToast("Organisation saved", "success");
          setDirty(false);
          router.refresh();
        });
      }}
    >
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: "16px",
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <SettingsOutlinedIcon color="primary" />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Organisation settings
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Update how your organisation appears on public pages.
              </Typography>
            </Box>
          </Stack>
          <Divider />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                name="name"
                label="Organisation name"
                required
                fullWidth
                defaultValue={initial.name}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                name="description"
                label="Description"
                fullWidth
                multiline
                minRows={4}
                defaultValue={initial.description}
                helperText="Shown on your organisation page."
              />
            </Grid>
          </Grid>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: "16px",
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <ImageOutlinedIcon sx={{ color: "text.secondary" }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Logo
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Add a logo for a more recognizable presence.
              </Typography>
            </Box>
          </Stack>
          <Divider />
          <ImageUploadPicker
            initialUrl={initial.logoUrl}
            label="Logo"
            placeholder="Your logo will appear here."
            disabled={pending}
            onChange={(file, previewUrl) => {
              setLogoFile(file);
              setLogoPreviewUrl(previewUrl);
              setDirty(true);
            }}
          />
        </Stack>
      </Paper>

      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          sx={{ textTransform: "none", borderRadius: 2, px: 2.5 }}
        >
          Save changes
        </Button>
      </Stack>
    </Stack>
  );
}
