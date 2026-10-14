"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Upload } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { cn } from "@/lib/cn";
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
  const busyOrDisabled = disabled || busy;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-subtle p-4 md:p-6">
      <div>
        <h3 className="text-h4 text-ink">Certificate designer</h3>
        <p className="mt-1 text-body-ui text-ink-secondary">Upload your finished certificate artwork with a blank space for the attendee name. Drag the name area or resize it from the corner. Names are automatically reduced to fit.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={cn(buttonClasses({ variant: "secondary" }), busyOrDisabled ? "pointer-events-none opacity-60" : "cursor-pointer")} aria-disabled={busyOrDisabled || undefined}>
          <Upload aria-hidden className="size-[18px]" />
          {busy ? "Working…" : value ? "Replace background" : "Upload background"}
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busyOrDisabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </label>
        {value && <Button variant="quiet" disabled={busyOrDisabled} onClick={() => update(null)}>Use default certificate</Button>}
      </div>
      <p className="text-caption text-ink-muted">JPEG, PNG or WebP · up to 5 MB · landscape or portrait. For sharp printing, upload original artwork at least 3508 pixels on its longest side, preferably PNG. Blank backgrounds are shareable images; do not include attendee data.</p>
      {error && <Callout tone="danger" role="alert">{error}</Callout>}
      {!value ? <Callout tone="info">The standard Yuyu certificate will be used until you upload a background.</Callout> : <>
        <fieldset disabled={busyOrDisabled} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Font">
              <NativeSelect value={value.font} onChange={(e) => change({ font: e.target.value as CertificateTemplate["font"] })}>
                {Object.entries(certificateFonts).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Font size" helperText="Relative to a 1000 px image width">
              <Input type="number" value={value.fontSize} onChange={(e) => change({ fontSize: Math.max(12, Math.min(120, Math.round(Number(e.target.value)))) })} />
            </Field>
            <Field label="Name color">
              <Input type="color" value={value.color} onChange={(e) => change({ color: e.target.value })} className="h-11 cursor-pointer p-1" />
            </Field>
            <Field label="Alignment">
              <NativeSelect value={value.align} onChange={(e) => change({ align: e.target.value as CertificateTemplate["align"] })}>
                {["left", "center", "right"].map((a) => <option key={a} value={a}>{a}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <CheckboxField label="Bold name" checked={value.bold} onCheckedChange={(bold) => change({ bold: bold === true })} />
          <Field label="Preview attendee name" helperText="For preview only. Downloads use the attendee’s registered name.">
            <Input value={name} maxLength={200} onChange={(e) => { setName(e.target.value); setPreview(null); }} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <Field key={key} label={{ x: "Left (%)", y: "Top (%)", width: "Width (%)", height: "Height (%)" }[key]}>
                <Input type="number" value={value[key]} onChange={(e) => {
                  const max = key === "x" ? 100 - value.width : key === "y" ? 100 - value.height : key === "width" ? 100 - value.x : 100 - value.y;
                  change({ [key]: Math.max(key === "width" ? 5 : key === "height" ? 3 : 0, Math.min(max, Number(e.target.value))) });
                }} />
              </Field>
            ))}
          </div>
        </fieldset>
        <div className="overflow-hidden rounded-lg border border-line bg-[#eee]">
          {/* Hidden measurement image avoids distorting portrait uploads. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="hidden" onLoad={(e) => setDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => setError("Background could not load. Try uploading it again.")} />
          <svg ref={canvas} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} role="img" aria-label="Certificate layout preview. Use the position and size fields to adjust the name area." style={{ display: "block", width: "100%", touchAction: "none" }}>
            <image href={imageUrl} width={dimensions.width} height={dimensions.height} />
            <svg x={value.x * unit} y={value.y * dimensions.height / 100} width={value.width * unit} height={value.height * dimensions.height / 100}>
              <text x={value.align === "left" ? "0%" : value.align === "right" ? "100%" : "50%"} y="50%" dominantBaseline="central" textAnchor={value.align === "left" ? "start" : value.align === "right" ? "end" : "middle"} fontFamily={certificateFonts[value.font].css} fontSize={value.fontSize * unit / 10} fontWeight={value.bold ? 700 : 400} fill={value.color}>{name}</text>
            </svg>
            <rect x={value.x * unit} y={value.y * dimensions.height / 100} width={value.width * unit} height={value.height * dimensions.height / 100} fill="#2563eb0a" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" style={{ cursor: "move" }} onPointerDown={(e) => start(e, "move")} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />
            <rect x={(value.x + value.width) * unit - unit * 1.5} y={(value.y + value.height) * dimensions.height / 100 - unit * 1.5} width={unit * 3} height={unit * 3} rx={unit / 2} fill="#2563eb" style={{ cursor: "nwse-resize" }} onPointerDown={(e) => start(e, "resize")} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />
          </svg>
        </div>
        <p className="text-caption text-ink-muted">Layout preview uses your browser’s fonts. Generate a preview to check the exact font and fit used in the downloaded JPEG.</p>
        <Button variant="secondary" className="self-start" disabled={busyOrDisabled || !name.trim()} onClick={async () => {
          setWorking(true); setError("");
          try {
            const result = await previewCertificate({ organisationSlug: props.organisationSlug, eventId: props.eventId, template: value, name });
            if (result.ok) setPreview(result.data!.image); else setError(result.error);
          } catch { setError("Preview failed. Please try again."); }
          finally { setWorking(false); }
        }}>Generate exact preview</Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Generated certificate preview with the sample attendee name" className="w-full rounded-lg" />}
        <Callout tone="info">Save feedback settings below to apply this design. It is used automatically after an eligible attendee completes feedback.</Callout>
      </>}
    </div>
  );
}
