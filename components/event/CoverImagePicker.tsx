"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Crop, ImageIcon, RotateCcw, RotateCw, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 1200;

export function CoverImagePicker(props: {
  initialUrl?: string | null;
  disabled?: boolean;
  onChange: (file: File | null, previewUrl: string) => void;
}) {
  const { initialUrl = "", disabled = false, onChange } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !imageLoaded) return;

    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#111";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const radians = (rotation * Math.PI) / 180;
    const baseScale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    context.save();
    context.translate(OUTPUT_SIZE / 2 + offset.x, OUTPUT_SIZE / 2 + offset.y);
    context.rotate(radians);
    context.drawImage(
      image,
      (-image.naturalWidth * scale) / 2,
      (-image.naturalHeight * scale) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    context.restore();
  }, [imageLoaded, offset, rotation, zoom]);

  function selectImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_COVER_IMAGE_BYTES) {
      setError("Choose an image that is 5 MB or smaller.");
      return;
    }
    setSourceUrl(URL.createObjectURL(file));
    setImageLoaded(false);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setEditorOpen(true);
  }

  function startDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function moveDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    setOffset({
      x: drag.offsetX + ((event.clientX - drag.x) * OUTPUT_SIZE) / rect.width,
      y: drag.offsetY + ((event.clientY - drag.y) * OUTPUT_SIZE) / rect.height,
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function applyEdit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not process that image.");
          return;
        }
        if (blob.size > MAX_COVER_IMAGE_BYTES) {
          setError("The processed image is too large. Try a smaller source image.");
          return;
        }
        const file = new File([blob], "event-cover.webp", { type: "image/webp" });
        const nextPreviewUrl = URL.createObjectURL(file);
        setPreviewUrl(nextPreviewUrl);
        onChange(file, nextPreviewUrl);
        setEditorOpen(false);
      },
      "image/webp",
      0.88,
    );
  }

  const resetEdits = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex max-w-[260px] flex-col gap-3">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="relative grid aspect-square w-[220px] max-w-full place-items-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-line-strong bg-subtle">
        {previewUrl ? (
          // Local object URLs and managed uploads are previewed directly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Cover image preview" className="size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-4 text-center">
            <ImageIcon aria-hidden className="size-7 text-ink-muted" />
            <p className="text-sm text-ink-muted">Your event cover will appear here.</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {previewUrl ? "Replace image" : "Choose image"}
        </Button>
        {previewUrl ? (
          <Button variant="quiet" size="sm" disabled={disabled} onClick={() => { setPreviewUrl(""); onChange(null, ""); }}>
            Remove
          </Button>
        ) : null}
      </div>
      <p className="text-caption text-ink-muted">JPEG, PNG, or WebP · up to 5 MB · cropped to a square cover.</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => selectImage(event.target.files?.[0])} />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent size="sm" hideClose>
          <div className="flex min-h-14 items-center justify-between border-b border-line px-2">
            <IconButton label="Cancel photo edit" onClick={() => setEditorOpen(false)}>
              <X />
            </IconButton>
            <DialogPrimitive.Title className="text-h4 text-ink">Edit photo</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Drag to position, zoom, or rotate the cover image.</DialogPrimitive.Description>
            <IconButton label="Use cropped image" variant="primary" onClick={applyEdit} disabled={!imageLoaded}>
              <Check />
            </IconButton>
          </div>
          <div className="bg-[#111113] p-3">
            <div className="relative mx-auto aspect-square max-w-[360px] overflow-hidden bg-[#111113]">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Cover image crop area. Drag to reposition."
                className="block size-full cursor-grab touch-none active:cursor-grabbing"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 border-2 border-white/80"
                style={{
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
                  backgroundImage: "linear-gradient(to right, transparent 33.2%, rgba(255,255,255,0.3) 33.2%, rgba(255,255,255,0.3) 33.6%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,0.3) 66.4%, rgba(255,255,255,0.3) 66.8%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,0.3) 33.2%, rgba(255,255,255,0.3) 33.6%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,0.3) 66.4%, rgba(255,255,255,0.3) 66.8%, transparent 66.8%)",
                }}
              />
            </div>
          </div>
          {/* A native image element is required as the canvas source for client-side cropping. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageRef} src={sourceUrl} alt="" hidden onLoad={() => setImageLoaded(true)} />
          <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
            <div className="flex flex-col gap-2">
              <p className="text-center text-label text-ink">{Math.round(zoom * 100)}%</p>
              <SliderPrimitive.Root
                value={[zoom]}
                min={1}
                max={3}
                step={0.05}
                onValueChange={([value]) => setZoom(value ?? 1)}
                className="relative flex h-6 w-full touch-none select-none items-center"
              >
                <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-track">
                  <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb aria-label="Zoom" className="block size-5 rounded-full border-2 border-primary bg-canvas shadow-raised" />
              </SliderPrimitive.Root>
            </div>
            <div className="flex items-center justify-around">
              {[
                { label: "Crop", aria: "Reset crop", icon: <Crop />, onClick: resetEdits },
                { label: "Rotate", aria: "Rotate image", icon: <RotateCw />, onClick: () => setRotation((current) => current + 90) },
                { label: "Reset", aria: "Reset image edits", icon: <RotateCcw />, onClick: resetEdits },
              ].map((tool) => (
                <div key={tool.label} className="flex flex-col items-center gap-0.5">
                  <IconButton label={tool.aria} onClick={tool.onClick}>
                    {tool.icon}
                  </IconButton>
                  <span aria-hidden className="text-caption text-ink-muted">{tool.label}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
