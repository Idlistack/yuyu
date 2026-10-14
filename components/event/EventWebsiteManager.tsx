"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, Plus, Upload } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card, Chip, type ChipTone } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { ACCENT_PRESETS, DEFAULT_EVENT_ACCENT, normalizeAccentHex } from "@/lib/theme/accent";
import { cn } from "@/lib/cn";
import { useRouter } from "next/navigation";
import {
  deleteWebsiteContent,
  saveEventPage,
  saveFaq,
  saveHighlight,
  saveResource,
  saveSpeaker,
  saveSponsor,
  uploadEventSpeakerPhoto,
  uploadEventSponsorLogo,
} from "@/app/actions/event-website";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";

const sectionTypes = [
  "HERO",
  "ABOUT",
  "HIGHLIGHTS",
  "SCHEDULE",
  "SPEAKERS",
  "SPONSORS",
  "VENUE",
  "FAQ",
  "RESOURCES",
] as const;
const sectionLabels: Record<(typeof sectionTypes)[number], string> = {
  HERO: "Hero",
  ABOUT: "About",
  HIGHLIGHTS: "Highlights",
  SCHEDULE: "Programme",
  SPEAKERS: "Speakers",
  SPONSORS: "Sponsors",
  VENUE: "Venue",
  FAQ: "FAQ",
  RESOURCES: "Resources",
};
type ContentKind = "highlight" | "speaker" | "sponsor" | "resource" | "faq";
type ContentRow = {
  id: string;
  title: string;
  description: string;
  visibility: string;
  values: Record<string, string | number | null>;
};
type Section = { type: string; isVisible: boolean; sortOrder: number };
type SaveAction = (input: unknown) => Promise<{ ok: boolean; error?: string }>;
type Props = {
  organisationSlug: string;
  eventId: string;
  eventSlug: string;
  page: {
    tagline: string;
    logoUrl: string | null;
    accentColor: string | null;
    aboutHtml: string;
    sections: Section[];
  } | null;
  highlights: ContentRow[];
  speakers: ContentRow[];
  sponsors: ContentRow[];
  resources: ContentRow[];
  faqs: ContentRow[];
};

function contentInput(
  kind: ContentKind,
  target: { organisationSlug: string; eventId: string },
  values: Record<string, string | number | null>,
  id: string | undefined,
  form: FormData,
) {
  const title = String(form.get("title") ?? "");
  const description = String(form.get("description") ?? "");
  const visibility = String(form.get("visibility") ?? "PUBLISHED");
  const shared = { ...target, ...values, ...(id ? { id } : {}), visibility };
  if (kind === "faq")
    return { ...shared, question: title, answerHtml: description };
  if (kind === "speaker")
    return {
      ...shared,
      title,
      bioHtml: description,
      headline: String(form.get("headline") ?? ""),
      organisation: String(form.get("organisation") ?? ""),
      websiteUrl: String(form.get("websiteUrl") ?? ""),
      linkedinUrl: String(form.get("linkedinUrl") ?? ""),
      xUrl: String(form.get("xUrl") ?? ""),
    };
  if (kind === "sponsor")
    return {
      ...shared,
      title,
      description,
      websiteUrl: String(form.get("websiteUrl") ?? ""),
      tier: String(form.get("tier") ?? "PARTNER"),
    };
  if (kind === "resource")
    return {
      ...shared,
      title,
      description,
      externalUrl: String(form.get("externalUrl") ?? ""),
    };
  return {
    ...shared,
    title,
    description,
    ...(kind === "highlight" ? { icon: String(form.get("icon") ?? "") } : {}),
  };
}

const visibilityTones: Record<string, ChipTone> = { PUBLISHED: "success", DRAFT: "neutral", HIDDEN: "outline" };
const visibilityLabels: Record<string, string> = { PUBLISHED: "Published", DRAFT: "Draft", HIDDEN: "Hidden" };

function VisibilitySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Visibility">
      <NativeSelect name="visibility" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="PUBLISHED">Published</option>
        <option value="DRAFT">Draft</option>
        <option value="HIDDEN">Hidden</option>
      </NativeSelect>
    </Field>
  );
}

function ContentCollection({
  title,
  kind,
  rows,
  action,
  target,
  pending,
  onSave,
  onDelete,
  onError,
}: {
  title: string;
  kind: ContentKind;
  rows: ContentRow[];
  action: SaveAction;
  target: { organisationSlug: string; eventId: string };
  pending: boolean;
  onSave: (action: SaveAction, input: unknown) => void;
  onDelete: (row: ContentRow) => void;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newItemFormKey, setNewItemFormKey] = useState(0);
  const [formVisibility, setFormVisibility] = useState("PUBLISHED");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const itemName = title === "FAQs" ? "FAQ" : title.slice(0, -1);
  const supportsRichText = kind === "faq" || kind === "speaker";
  const openNewItemForm = () => {
    setNewItemFormKey((key) => key + 1);
    setPhotoFile(null);
    setFormVisibility("PUBLISHED");
    setEditing(null);
    setAdding(true);
  };
  const submit = async (
    event: FormEvent<HTMLFormElement>,
    row?: ContentRow,
  ) => {
    const formElement = event.currentTarget;
    event.preventDefault();
    let values = row?.values ?? { sortOrder: rows.length };
    if ((kind === "speaker" || kind === "sponsor") && photoFile) {
      setUploadingPhoto(true);
      const photo = new FormData();
      photo.set("organisationSlug", target.organisationSlug);
      photo.set("eventId", target.eventId);
      photo.set("file", photoFile);
      const upload =
        kind === "speaker"
          ? await uploadEventSpeakerPhoto(photo)
          : await uploadEventSponsorLogo(photo);
      setUploadingPhoto(false);
      const assetLabel = kind === "speaker" ? "speaker photo" : "sponsor logo";
      if (!upload.ok) {
        onError(upload.error);
        return;
      }
      if (!upload.data) {
        onError(`Could not upload the ${assetLabel}.`);
        return;
      }
      values = {
        ...values,
        [kind === "speaker" ? "photoUrl" : "logoUrl"]: upload.data.url,
      };
      setPhotoFile(null);
    }
    onSave(
      action,
      contentInput(kind, target, values, row?.id, new FormData(formElement)),
    );
    setAdding(false);
    setEditing(null);
  };
  const clearPhotoDraft = () => setPhotoFile(null);
  const photoPicker =
    kind === "speaker" || kind === "sponsor" ? (
      <div className="flex flex-wrap items-center gap-2.5">
        <label className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-canvas px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--yy-focus)]", (pending || uploadingPhoto) && "pointer-events-none opacity-50")}>
          <Upload aria-hidden className="size-4" />
          Choose {kind === "speaker" ? "speaker photo" : "sponsor logo"}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending || uploadingPhoto}
            onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <span className="text-caption text-ink-muted">
          {photoFile ? photoFile.name : "JPEG, PNG, or WebP · up to 5 MB"}
        </span>
      </div>
    ) : null;
  const destinationUrlField = (row?: ContentRow) =>
    kind === "speaker" || kind === "sponsor" ? (
      <Field label="Destination URL" helperText={`Where guests go when they select the ${kind === "speaker" ? "speaker photo" : "sponsor logo"}.`}>
        <Input name="websiteUrl" type="url" defaultValue={String(row?.values.websiteUrl ?? "")} placeholder="https://example.com" />
      </Field>
    ) : null;
  const metadataFields = (row?: ContentRow) => (
    <>
      {kind === "highlight" ? (
        <Field label="Icon" helperText="Optional short icon or emoji shown with this highlight.">
          <Input name="icon" defaultValue={String(row?.values.icon ?? "")} />
        </Field>
      ) : null}
      {kind === "speaker" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headline"><Input name="headline" defaultValue={String(row?.values.headline ?? "")} /></Field>
          <Field label="Organisation"><Input name="organisation" defaultValue={String(row?.values.organisation ?? "")} /></Field>
          <Field label="LinkedIn URL"><Input name="linkedinUrl" type="url" defaultValue={String(row?.values.linkedinUrl ?? "")} /></Field>
          <Field label="X URL"><Input name="xUrl" type="url" defaultValue={String(row?.values.xUrl ?? "")} /></Field>
        </div>
      ) : null}
      {kind === "sponsor" ? (
        <Field label="Sponsor tier">
          <NativeSelect name="tier" defaultValue={String(row?.values.tier ?? "PARTNER")}>
            <option value="PLATINUM">Platinum</option>
            <option value="GOLD">Gold</option>
            <option value="SILVER">Silver</option>
            <option value="PARTNER">Partner</option>
            <option value="COMMUNITY_PARTNER">Community partner</option>
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
  const itemForm = (row?: ContentRow) => (
    <>
      <Field label={kind === "faq" ? "Question" : "Name"} required>
        <Input name="title" defaultValue={row?.title} />
      </Field>
      {photoPicker}
      {destinationUrlField(row)}
      {metadataFields(row)}
      {kind === "resource" ? (
        <Field label="Resource link" required helperText="Paste the public URL guests should open.">
          <Input name="externalUrl" defaultValue={row ? String(row.values.externalUrl ?? "") : undefined} />
        </Field>
      ) : null}
      {supportsRichText ? (
        <RichTextEditor
          name="description"
          label={kind === "faq" ? "Answer" : "Description"}
          defaultValue={row?.description}
          minHeight={88}
        />
      ) : (
        <Field label="Description">
          <Textarea name="description" rows={2} defaultValue={row?.description} />
        </Field>
      )}
      <VisibilitySelect value={formVisibility} onChange={setFormVisibility} />
    </>
  );
  return (
    <Card as="section" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-h4 text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{rows.length} added</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          startIcon={adding ? undefined : <Plus />}
          aria-expanded={adding}
          onClick={() => {
            if (adding) {
              clearPhotoDraft();
              setAdding(false);
            } else {
              openNewItemForm();
            }
          }}
        >
          {adding ? "Close" : `Add ${itemName}`}
        </Button>
      </div>
      <form
        key={newItemFormKey}
        data-event-page-form="true"
        hidden={!adding}
        onSubmit={(event) => void submit(event)}
        className="mt-4 flex flex-col gap-4 rounded-lg border border-line bg-subtle p-4"
      >
        {itemForm()}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pending || uploadingPhoto}>
            Add {itemName}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setPhotoFile(null);
              setAdding(false);
            }}
            disabled={uploadingPhoto}
          >
            Cancel
          </Button>
        </div>
      </form>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{row.title}</span>
                  <Chip size="sm" tone={visibilityTones[row.visibility] ?? "neutral"}>{visibilityLabels[row.visibility] ?? row.visibility.toLowerCase()}</Chip>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="quiet"
                    aria-expanded={editing === row.id}
                    onClick={() => {
                      const nextEditing = editing === row.id ? null : row.id;
                      setEditing(nextEditing);
                      setAdding(false);
                      clearPhotoDraft();
                      if (nextEditing) setFormVisibility(row.visibility);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="dangerQuiet" onClick={() => onDelete(row)} disabled={pending}>
                    Remove
                  </Button>
                </div>
              </div>
              <form
                data-event-page-form="true"
                hidden={editing !== row.id}
                onSubmit={(event) => void submit(event, row)}
                className="mt-3 flex flex-col gap-4 rounded-lg border border-line bg-subtle p-4"
              >
                {itemForm(row)}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" disabled={pending || uploadingPhoto}>
                    Save changes
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      clearPhotoDraft();
                      setEditing(null);
                    }}
                    disabled={pending || uploadingPhoto}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-body-ui text-ink-muted">Nothing has been added yet.</p>
      )}
    </Card>
  );
}

export function EventWebsiteManager(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: ContentKind;
    row: ContentRow;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !pending);
  useEffect(() => {
    const markPageDirty = (event: Event) => {
      const node = event.target;
      if (!(node instanceof HTMLElement)) return;
      const form = node.closest("form");
      if (form?.dataset.eventPageForm === "true") {
        setDirty(true);
        setSaved(false);
      }
    };
    document.addEventListener("input", markPageDirty, true);
    document.addEventListener("change", markPageDirty, true);
    return () => {
      document.removeEventListener("input", markPageDirty, true);
      document.removeEventListener("change", markPageDirty, true);
    };
  }, []);
  const [sections, setSections] = useState<Section[]>(() =>
    sectionTypes.map(
      (type, sortOrder) =>
        props.page?.sections.find((section) => section.type === type) ?? {
          type,
          isVisible: true,
          sortOrder,
        },
    ),
  );
  const target = {
    organisationSlug: props.organisationSlug,
    eventId: props.eventId,
  };
  const save = (action: SaveAction, input: unknown, clearDirty = false) =>
    startTransition(async () => {
      const result = await action(input);
      if (!result.ok) {
        setSaved(false);
        setError(result.error || "Could not save your changes.");
      } else {
        setError("");
        setSaved(true);
        if (clearDirty) setDirty(false);
        router.refresh();
      }
    });
  const moveSection = (index: number, direction: -1 | 1) => {
    setDirty(true);
    setSaved(false);
    setSections((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((section, sortOrder) => ({ ...section, sortOrder }));
    });
  };
  const savePage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(
      saveEventPage,
      {
        ...target,
        tagline: props.page?.tagline ?? "",
        logoUrl: props.page?.logoUrl ?? "",
        accentColor: String(form.get("accentColor") ?? ""),
        aboutHtml: props.page?.aboutHtml ?? "",
        sections,
      },
      true,
    );
  };
  const remove = (kind: ContentKind) => (row: ContentRow) =>
    setDeleteTarget({ kind, row });
  const [accentColor, setAccentColor] = useState(props.page?.accentColor ?? "");
  const accentPreview = normalizeAccentHex(accentColor);
  return (
    <div className="flex flex-col gap-5">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {saved ? <Callout tone="success" role="status">Changes saved.</Callout> : null}
      <Card>
        <form data-event-page-form="true" onSubmit={savePage} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-h3 text-ink">Event page</h2>
              <p className="mt-1 max-w-[560px] text-body-ui text-ink-muted">
                Choose what visitors see, arrange the sections, and preview the
                result. Edit the event introduction in Details.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button asChild variant="secondary">
                <a href={`/${props.organisationSlug}/${props.eventSlug}`} target="_blank" rel="noopener noreferrer">
                  Preview
                  <ArrowUpRight aria-hidden className="size-4" />
                </a>
              </Button>
              <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…">
                Save all changes
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-end gap-2.5">
              <Field label="Accent colour" className="flex-1">
                <Input name="accentColor" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} placeholder={DEFAULT_EVENT_ACCENT} className="font-mono" />
              </Field>
              <span aria-hidden className="size-[50px] shrink-0 rounded-md border border-line" style={{ backgroundColor: accentPreview }} />
            </div>
            <div role="group" aria-label="Accent presets" className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((preset) => {
                const selected = accentPreview === preset.hex;
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAccentColor(preset.hex);
                      setDirty(true);
                      setSaved(false);
                    }}
                    className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border bg-canvas px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle", selected ? "border-[1.5px] border-primary" : "border-line-strong")}
                  >
                    <span aria-hidden className="size-4 rounded-full" style={{ backgroundColor: preset.hex }} />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-line pt-5">
            <h3 className="text-h4 text-ink">Page sections</h3>
            <p className="mt-1 text-body-ui text-ink-muted">
              Turn sections on or off, then arrange them in the order guests
              should see.
            </p>
            <ol className="mt-3 divide-y divide-line rounded-lg border border-line">
              {sections.map((section, index) => (
                <li key={section.type} className="flex items-center justify-between gap-2 px-3.5 py-2">
                  <CheckboxField
                    label={sectionLabels[section.type as keyof typeof sectionLabels] ?? section.type}
                    checked={section.isVisible}
                    onCheckedChange={(checked) => {
                      const isVisible = checked === true;
                      setDirty(true);
                      setSaved(false);
                      setSections((current) =>
                        current.map((item) =>
                          item.type === section.type
                            ? { ...item, isVisible }
                            : item,
                        ),
                      );
                    }}
                  />
                  <div className="flex gap-0.5">
                    <IconButton label={`Move ${section.type} up`} size="sm" disabled={index === 0} onClick={() => moveSection(index, -1)}>
                      <ChevronUp />
                    </IconButton>
                    <IconButton label={`Move ${section.type} down`} size="sm" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>
                      <ChevronDown />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </form>
      </Card>
      <ContentCollection
        title="Highlights"
        kind="highlight"
        rows={props.highlights}
        action={saveHighlight}
        target={target}
        pending={pending}
        onSave={(action, input) => save(action, input, true)}
        onDelete={remove("highlight")}
        onError={setError}
      />
      <ContentCollection
        title="Speakers"
        kind="speaker"
        rows={props.speakers}
        action={saveSpeaker}
        target={target}
        pending={pending}
        onSave={(action, input) => save(action, input, true)}
        onDelete={remove("speaker")}
        onError={setError}
      />
      <ContentCollection
        title="Sponsors"
        kind="sponsor"
        rows={props.sponsors}
        action={saveSponsor}
        target={target}
        pending={pending}
        onSave={(action, input) => save(action, input, true)}
        onDelete={remove("sponsor")}
        onError={setError}
      />
      <ContentCollection
        title="Resources"
        kind="resource"
        rows={props.resources}
        action={saveResource}
        target={target}
        pending={pending}
        onSave={(action, input) => save(action, input, true)}
        onDelete={remove("resource")}
        onError={setError}
      />
      <ContentCollection
        title="FAQs"
        kind="faq"
        rows={props.faqs}
        action={saveFaq}
        target={target}
        pending={pending}
        onSave={(action, input) => save(action, input, true)}
        onDelete={remove("faq")}
        onError={setError}
      />
      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        title="Remove event-page content?"
        message={`Remove “${deleteTarget?.row.title ?? "this item"}” from the event page? This cannot be undone.`}
        confirmLabel="Remove"
        loading={pending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const current = deleteTarget;
          setDeleteTarget(null);
          save(deleteWebsiteContent, {
            ...target,
            kind: current.kind,
            id: current.row.id,
          });
        }}
      />
    </div>
  );
}
