"use client";

import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ImageUploadPicker(props: {
  initialUrl?: string | null;
  label: string;
  placeholder: string;
  disabled?: boolean;
  objectFit?: "contain" | "cover";
  onChange: (file: File | null, previewUrl: string) => void;
}) {
  const {
    initialUrl = "",
    label,
    placeholder,
    disabled = false,
    objectFit = "contain",
    onChange,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      setError("Choose an image that is 5 MB or smaller.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onChange(file, url);
  }

  return (
    <Stack spacing={1.25}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box
        sx={{
          width: 180,
          height: 140,
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          p: 1,
          bgcolor: "rgba(255,255,255,0.025)",
        }}
      >
        {previewUrl ? (
          <Box
            component="img"
            src={previewUrl}
            alt={`${label} preview`}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "100%",
              height: "100%",
              objectFit,
              borderRadius: 1,
            }}
          />
        ) : (
          <Stack
            spacing={0.5}
            sx={{ alignItems: "center", textAlign: "center", px: 1 }}
          >
            <ImageOutlinedIcon color="disabled" />
            <Typography variant="caption" color="text.secondary">
              {placeholder}
            </Typography>
          </Stack>
        )}
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button
          component="label"
          variant="outlined"
          size="small"
          disabled={disabled}
        >
          {previewUrl ? "Replace image" : `Choose ${label.toLowerCase()}`}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </Button>
        {previewUrl ? (
          <Button
            size="small"
            color="inherit"
            disabled={disabled}
            onClick={() => {
              setPreviewUrl("");
              onChange(null, "");
            }}
          >
            Remove
          </Button>
        ) : null}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        JPEG, PNG, or WebP · up to 5 MB
      </Typography>
    </Stack>
  );
}
