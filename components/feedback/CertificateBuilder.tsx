"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { certificateFonts, defaultNameArea, type CertificateTemplate } from "@/lib/certificateTemplate";
import { previewCertificate, uploadCertificateBackground } from "@/app/actions/certificate";

type Props = {
  organisationSlug: string; eventId: string;
  value: CertificateTemplate | null;
  onChange: (value: CertificateTemplate | null) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
};
export function CertificateBuilder(props: Props) {
  const { value, onChange, disabled } = props;
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; original: CertificateTemplate } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 1130 });
  const [name, setName] = useState("Alex Morgan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const update = (next: CertificateTemplate | null) => { setPreview(null); onChange(next); };
  const change = (patch: Partial<CertificateTemplate>) => { if (value) update({ ...value, ...patch }); };
  const imageUrl = value ? `/api/uploads/${value.backgroundKey}` : "";
  const setWorking = (working: boolean) => { setBusy(working); props.onBusyChange(working); };
  async function upload(file: File) {
    setError(""); setWorking(true);
    try {
      const form = new FormData();
      form.set("file", file); form.set("organisationSlug", props.organisationSlug); form.set("eventId", props.eventId);
      const result = await uploadCertificateBackground(form);
      if (!result.ok) { setError(result.error); return; }
      update({ ...defaultNameArea, backgroundKey: result.data!.key });
    } catch { setError("Upload failed. Please try again."); }
    finally { setWorking(false); }
  }
  function start(event: PointerEvent<SVGElement>, mode: "move" | "resize") {
    if (!value || disabled || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, original: value };
  }
  function move(event: PointerEvent<SVGElement>) {
    const current = drag.current, bounds = canvas.current?.getBoundingClientRect();
    if (!current || !bounds) return;
    const dx = (event.clientX - current.x) / bounds.width * 100;
    const dy = (event.clientY - current.y) / bounds.height * 100;
    const v = current.original;
    const clamp = (n: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
    update(current.mode === "move"
      ? { ...v, x: clamp(v.x + dx, 0, 100 - v.width), y: clamp(v.y + dy, 0, 100 - v.height) }
      : { ...v, width: clamp(v.width + dx, 5, 100 - v.x), height: clamp(v.height + dy, 3, 100 - v.y) });
  }
  const stop = () => { drag.current = null; };
  const unit = dimensions.width / 100;
  return (
    <Stack spacing={2} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: { xs: 2, md: 3 } }}>
      <Typography variant="h6">Certificate designer</Typography>
      <Typography variant="body2" color="text.secondary">Upload your finished certificate artwork with a blank space for the attendee name. Drag the name area or resize it from the corner. Names are automatically reduced to fit.</Typography>
      <Stack direction="row" spacing={1}>
        <Button component="label" variant="outlined" disabled={disabled || busy}>
          {busy ? "Working…" : value ? "Replace background" : "Upload background"}
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </Button>
        {value && <Button disabled={disabled || busy} onClick={() => update(null)}>Use default certificate</Button>}
      </Stack>
      <Typography variant="caption" color="text.secondary">JPEG, PNG or WebP · up to 5 MB · landscape or portrait. For sharp printing, upload original artwork at least 3508 pixels on its longest side, preferably PNG. Blank backgrounds are shareable images; do not include attendee data.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {!value ? <Alert severity="info">The standard Yuyu certificate will be used until you upload a background.</Alert> : <>
        <Box component="fieldset" disabled={disabled || busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select label="Font" value={value.font} onChange={(e) => change({ font: e.target.value as CertificateTemplate["font"] })} fullWidth>
                {Object.entries(certificateFonts).map(([key, font]) => <MenuItem key={key} value={key}>{font.label}</MenuItem>)}
              </TextField>
              <TextField label="Font size" type="number" value={value.fontSize} helperText="Relative to a 1000 px image width" onChange={(e) => change({ fontSize: Math.max(12, Math.min(120, Math.round(Number(e.target.value)))) })} fullWidth />
              <TextField label="Name color" type="color" value={value.color} onChange={(e) => change({ color: e.target.value })} fullWidth />
              <TextField select label="Alignment" value={value.align} onChange={(e) => change({ align: e.target.value as CertificateTemplate["align"] })} fullWidth>
                {["left", "center", "right"].map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </TextField>
            </Stack>
            <FormControlLabel control={<Checkbox checked={value.bold} onChange={(_, bold) => change({ bold })} />} label="Bold name" />
            <TextField label="Preview attendee name" value={name} onChange={(e) => { setName(e.target.value); setPreview(null); }} slotProps={{ htmlInput: { maxLength: 200 } }} helperText="For preview only. Downloads use the attendee’s registered name." />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {(["x", "y", "width", "height"] as const).map((key) => <TextField key={key} label={{ x: "Left (%)", y: "Top (%)", width: "Width (%)", height: "Height (%)" }[key]} type="number" value={value[key]} fullWidth onChange={(e) => {
                const max = key === "x" ? 100 - value.width : key === "y" ? 100 - value.height : key === "width" ? 100 - value.x : 100 - value.y;
                change({ [key]: Math.max(key === "width" ? 5 : key === "height" ? 3 : 0, Math.min(max, Number(e.target.value))) });
              }} />)}
            </Stack>
          </Stack>
        </Box>
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "#eee" }}>
          {/* Hidden measurement image avoids distorting portrait uploads. */}
          <Box component="img" src={imageUrl} alt="" sx={{ display: "none" }} onLoad={(e) => setDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => setError("Background could not load. Try uploading it again.")} />
          <svg ref={canvas} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} role="img" aria-label="Certificate layout preview. Use the position and size fields to adjust the name area." style={{ display: "block", width: "100%", touchAction: "none" }}>
            <image href={imageUrl} width={dimensions.width} height={dimensions.height} />
            <svg x={value.x * unit} y={value.y * dimensions.height / 100} width={value.width * unit} height={value.height * dimensions.height / 100}>
              <text x={value.align === "left" ? "0%" : value.align === "right" ? "100%" : "50%"} y="50%" dominantBaseline="central" textAnchor={value.align === "left" ? "start" : value.align === "right" ? "end" : "middle"} fontFamily={certificateFonts[value.font].css} fontSize={value.fontSize * unit / 10} fontWeight={value.bold ? 700 : 400} fill={value.color}>{name}</text>
            </svg>
            <rect x={value.x * unit} y={value.y * dimensions.height / 100} width={value.width * unit} height={value.height * dimensions.height / 100} fill="#2563eb0a" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" style={{ cursor: "move" }} onPointerDown={(e) => start(e, "move")} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />
            <rect x={(value.x + value.width) * unit - unit * 1.5} y={(value.y + value.height) * dimensions.height / 100 - unit * 1.5} width={unit * 3} height={unit * 3} rx={unit / 2} fill="#2563eb" style={{ cursor: "nwse-resize" }} onPointerDown={(e) => start(e, "resize")} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />
          </svg>
        </Box>
        <Typography variant="caption" color="text.secondary">Layout preview uses your browser’s fonts. Generate a preview to check the exact font and fit used in the downloaded JPEG.</Typography>
        <Button disabled={disabled || busy || !name.trim()} variant="outlined" onClick={async () => {
          setWorking(true); setError("");
          try {
            const result = await previewCertificate({ organisationSlug: props.organisationSlug, eventId: props.eventId, template: value, name });
            if (result.ok) setPreview(result.data!.image); else setError(result.error);
          } catch { setError("Preview failed. Please try again."); }
          finally { setWorking(false); }
        }}>Generate exact preview</Button>
        {preview && <Box component="img" src={preview} alt="Generated certificate preview with the sample attendee name" sx={{ width: "100%", borderRadius: 2 }} />}
        <Alert severity="info">Save feedback settings below to apply this design. It is used automatically after an eligible attendee completes feedback.</Alert>
      </>}
    </Stack>
  );
}
