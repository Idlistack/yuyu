"use client";

import { useMemo, useState, useTransition } from "react";
import type { RegistrationFieldType } from "@prisma/client";
import { RegistrationFieldType as RegistrationFieldTypeEnum } from "@prisma/client";
import { ArrowDown, ArrowUp, Eye, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { CheckboxField, Radio, RadioGroup } from "@/components/ui/choice";
import { Chip, EmptyState, SectionHeading } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";

import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import {
  deleteEventRegistrationField,
  reorderEventRegistrationFields,
  upsertEventRegistrationField,
} from "@/app/actions/registration-form";

export type RegistrationFieldRow = {
  id: string;
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  sortOrder: number;
  options: string[];
};

function makeKeyFromLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function uniqueKey(base: string, existing: Set<string>, current?: string) {
  const normalized = base || "field";
  if ((current && normalized === current) || !existing.has(normalized)) return normalized;
  for (let i = 1; i < 1000; i++) {
    const suffix = `_${i}`;
    const next = (normalized + suffix).slice(0, 64);
    if (next === current) return next;
    if (!existing.has(next)) return next;
  }
  return `${normalized}_${Date.now()}`.slice(0, 64);
}

function needsOptions(t: RegistrationFieldType) {
  return (
    t === RegistrationFieldTypeEnum.SELECT ||
    t === RegistrationFieldTypeEnum.MULTI_SELECT ||
    t === RegistrationFieldTypeEnum.RADIO
  );
}

const FIELD_PRESETS = [
  {
    label: "Phone Number",
    type: "PHONE" as RegistrationFieldType,
    required: false,
    optionsCsv: "",
  },
  {
    label: "Company / Organisation",
    type: "TEXT" as RegistrationFieldType,
    required: false,
    optionsCsv: "",
  },
  {
    label: "Job Title",
    type: "TEXT" as RegistrationFieldType,
    required: false,
    optionsCsv: "",
  },
  {
    label: "Food Preference",
    type: "MULTI_SELECT" as RegistrationFieldType,
    required: false,
    optionsCsv: "None, Vegetarian, Vegan, Gluten Free, Dairy Free, Halal, Kosher",
  },
  {
    label: "T-Shirt Size",
    type: "SELECT" as RegistrationFieldType,
    required: false,
    optionsCsv: "XS, S, M, L, XL, XXL, 3XL",
  },
  {
    label: "LinkedIn Profile",
    type: "TEXT" as RegistrationFieldType,
    required: false,
    optionsCsv: "",
  },
  {
    label: "How did you hear about us?",
    type: "SELECT" as RegistrationFieldType,
    required: false,
    optionsCsv: "Social Media, Friend / Word of Mouth, Search Engine, Newsletter, Community Slack, Other",
  },
];

export function EventRegistrationFormEditor(props: {
  organisationSlug: string;
  eventId: string;
  fields: RegistrationFieldRow[];
}) {
  const { organisationSlug, eventId } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [localFields, setLocalFields] = useState<RegistrationFieldRow[]>(props.fields);

  const fields = useMemo(() => {
    return [...localFields].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [localFields]);

  const existingKeys = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RegistrationFieldRow | null>(null);
  const [deleteConfirmField, setDeleteConfirmField] = useState<RegistrationFieldRow | null>(null);

  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<RegistrationFieldType>("TEXT");
  const [required, setRequired] = useState(false);
  const [optionsCsv, setOptionsCsv] = useState("");
  useUnsavedChangesGuard(open && !pending);

  const previewFields = useMemo(() => {
    if (!open || !label.trim()) return fields;

    const draft: RegistrationFieldRow = {
      id: editing?.id ?? "draft-preview-field",
      key,
      label: label.trim(),
      type,
      required,
      options: optionsCsv.split(",").map((option) => option.trim()).filter(Boolean),
      sortOrder: editing?.sortOrder ?? fields.length + 1,
    };

    return editing
      ? fields.map((field) => field.id === editing.id ? draft : field)
      : [...fields, draft];
  }, [editing, fields, key, label, open, optionsCsv, required, type]);

  function openCreate() {
    setEditing(null);
    setLabel("");
    setKey(uniqueKey("field", existingKeys));
    setType("TEXT");
    setRequired(false);
    setOptionsCsv("");
    setOpen(true);
  }

  function openEdit(f: RegistrationFieldRow) {
    setEditing(f);
    setLabel(f.label);
    setKey(f.key);
    setType(f.type);
    setRequired(f.required);
    setOptionsCsv(f.options.join(", "));
    setOpen(true);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= fields.length) return;
    const next = [...fields];
    const tmp = next[idx]!;
    next[idx] = next[nextIdx]!;
    next[nextIdx] = tmp;
    const reordered = next.map((field, order) => ({ ...field, sortOrder: order + 1 }));
    const previousFields = localFields;
    setLocalFields(reordered);
    startTransition(async () => {
      const res = await reorderEventRegistrationFields({
        organisationSlug,
        eventId,
        fieldIds: reordered.map((f) => f.id),
      });
      if (!res.ok) {
        setLocalFields(previousFields);
        showToast(res.error, "error");
      } else router.refresh();
    });
  }

  function saveField() {
    startTransition(async () => {
      const options = optionsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await upsertEventRegistrationField({
        organisationSlug,
        eventId,
        fieldId: editing?.id,
        key,
        label,
        type,
        required,
        options,
      });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      const savedField: RegistrationFieldRow = {
        id: res.data!.fieldId,
        key,
        label,
        type,
        required,
        options,
        sortOrder: editing?.sortOrder ?? fields.length + 1,
      };
      setLocalFields((current) =>
        editing
          ? current.map((field) => field.id === editing.id ? savedField : field)
          : [...current, savedField],
      );
      showToast("Saved field config", "success");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Registration Form Editor"
        description="Add custom input fields to collect guest information. Name and Email are always collected."
        action={
          <Button variant="primary" startIcon={<Plus />} onClick={openCreate} disabled={pending}>
            Add Custom Field
          </Button>
        }
      />

      {/* ── TWO COLUMN BUILDER / PREVIEW LAYOUT ── */}
      <div className="grid gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Left Column: Visual Builder Cards */}
        <section aria-labelledby="form-structure-title" className="flex flex-col gap-4">
          <h3 id="form-structure-title" className="text-title text-ink">Form Structure</h3>

          {/* Default Fields Panel */}
          <div className="rounded-lg border border-line bg-subtle p-4">
            <p className="mb-2 text-overline text-ink-muted">Standard Fields (Always Collected)</p>
            <ul className="divide-y divide-line">
              {[
                { name: "Name", description: "Collected from all registered attendees." },
                { name: "Email", description: "Used for sending ticket confirmation and QR codes." },
              ].map((item) => (
                <li key={item.name} className="flex items-center gap-3 py-2.5">
                  <GripVertical aria-hidden className="size-4 text-ink-disabled" />
                  <div className="min-w-0 flex-1">
                    <p className="text-label text-ink">{item.name}</p>
                    <p className="text-caption text-ink-muted">{item.description}</p>
                  </div>
                  <Chip size="sm" tone="outline">Required</Chip>
                </li>
              ))}
            </ul>
          </div>

          {/* Custom Fields List */}
          {fields.length === 0 ? (
            <EmptyState>No custom fields configured. Click &quot;Add Custom Field&quot; to capture dietary needs, phone numbers, or sizes.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {fields.map((f, idx) => (
                <li key={f.id} className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-4 transition-colors hover:border-line-strong sm:flex-row sm:items-center">
                  <GripVertical aria-hidden className="hidden size-4 text-ink-muted sm:block" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-label text-ink [overflow-wrap:anywhere]">{f.label}</p>
                      {f.required ? <Chip size="sm" tone="warning">Required</Chip> : null}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">key: {f.key} · type: {f.type.toLowerCase()}</p>
                    {needsOptions(f.type) ? <p className="mt-1 text-caption text-ink-muted [overflow-wrap:anywhere]">Options: {f.options.join(", ")}</p> : null}
                  </div>
                  <div className="flex items-center gap-0.5 self-end sm:self-auto">
                    <IconButton label="Move up" size="sm" disabled={pending || idx === 0} onClick={() => move(f.id, -1)}><ArrowUp /></IconButton>
                    <IconButton label="Move down" size="sm" disabled={pending || idx === fields.length - 1} onClick={() => move(f.id, 1)}><ArrowDown /></IconButton>
                    <IconButton label="Edit" size="sm" disabled={pending} onClick={() => openEdit(f)}><Pencil /></IconButton>
                    <IconButton label="Delete" size="sm" variant="danger" disabled={pending} onClick={() => setDeleteConfirmField(f)}><Trash2 /></IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right Column: Live Interactive Preview */}
        <section aria-labelledby="form-preview-title" className="flex flex-col gap-4 md:sticky md:top-6 md:self-start">
          <h3 id="form-preview-title" className="flex items-center gap-2 text-title text-ink">
            <Eye aria-hidden className="size-5 text-ink-muted" />
            Live Form Preview
          </h3>
          <div className="rounded-xl border border-line bg-canvas p-6 shadow-raised">
            <p className="text-h4 text-ink">Register for Event</p>
            <p className="mb-5 mt-1 text-caption text-ink-muted">Fill out the form below to secure your spot.</p>
            <div className="flex flex-col gap-4">
              {/* Standard Name / Email fields */}
              <Field label="Full Name *"><Input placeholder="Enter full name" /></Field>
              <Field label="Email Address *"><Input type="email" placeholder="you@domain.com" /></Field>

              {/* Render Custom Configured Fields */}
              {previewFields.map((f) => {
                const fullLabel = `${f.label}${f.required ? " *" : ""}`;
                if (f.type === "TEXT") return <Field key={f.id} label={fullLabel}><Input placeholder="Enter answer..." /></Field>;
                if (f.type === "EMAIL") return <Field key={f.id} label={fullLabel}><Input type="email" placeholder="you@example.com" /></Field>;
                if (f.type === "PHONE") return <Field key={f.id} label={fullLabel} helperText="Include country code"><Input type="tel" inputMode="tel" placeholder="Phone number" /></Field>;
                if (f.type === "TEXTAREA") return <Field key={f.id} label={fullLabel}><Textarea rows={3} placeholder="Enter answer..." /></Field>;
                if (f.type === "NUMBER") return <Field key={f.id} label={fullLabel}><Input type="number" placeholder="0" /></Field>;
                if (f.type === "DATE") return <Field key={f.id} label={fullLabel}><Input type="date" /></Field>;
                if (f.type === "CHECKBOX") return <CheckboxField key={f.id} label={fullLabel} />;
                if (f.type === "SELECT") {
                  return (
                    <Field key={f.id} label={fullLabel}>
                      <NativeSelect defaultValue="">
                        <option value="" disabled>Choose…</option>
                        {f.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </NativeSelect>
                    </Field>
                  );
                }
                if (f.type === "RADIO") {
                  return (
                    <fieldset key={f.id}>
                      <legend className="mb-2 text-label text-ink">{fullLabel}</legend>
                      <RadioGroup className="flex-row flex-wrap gap-x-4">
                        {f.options.map((opt) => <Radio key={opt} value={opt} label={opt} />)}
                      </RadioGroup>
                    </fieldset>
                  );
                }
                if (f.type === "MULTI_SELECT") {
                  return (
                    <fieldset key={f.id} className="flex flex-col gap-2">
                      <legend className="mb-2 text-label text-ink">{fullLabel}</legend>
                      {f.options.map((opt) => <CheckboxField key={opt} label={opt} />)}
                    </fieldset>
                  );
                }
                return null;
              })}

              <Button variant="primary" fullWidth className="mt-1">Submit RSVP</Button>
            </div>
          </div>
        </section>
      </div>

      {/* ── CREATE / EDIT DIALOG (presets at top) ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader title={editing ? "Edit custom field" : "Add custom field"} />
          <DialogBody className="flex flex-col gap-4">
            {!editing && (
              <div className="border-b border-line pb-4">
                <p className="mb-2.5 text-overline text-ink-muted">Quick preset templates</p>
                <div className="flex flex-wrap gap-1.5">
                  {FIELD_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setLabel(preset.label);
                        setKey(uniqueKey(makeKeyFromLabel(preset.label), existingKeys));
                        setType(preset.type);
                        setRequired(preset.required);
                        setOptionsCsv(preset.optionsCsv);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Field Label">
              <Input
                value={label}
                onChange={(e) => {
                  const next = e.target.value;
                  setLabel(next);
                  if (!editing) {
                    setKey(uniqueKey(makeKeyFromLabel(next), existingKeys));
                  }
                }}
                placeholder="e.g. Phone Number, Food Preference"
              />
            </Field>
            <Field
              label="Field Key (System Identifier)"
              helperText={editing ? "Unique key for CSV exports (locked)." : "Auto-generated database key. Used in custom field metrics."}
            >
              <Input value={key} disabled className="font-mono" />
            </Field>
            <Field label="Field Type">
              <NativeSelect value={type} onChange={(e) => setType(e.target.value as RegistrationFieldType)}>
                {Object.values(RegistrationFieldTypeEnum).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </NativeSelect>
            </Field>
            <CheckboxField label="Make this field required" checked={required} onCheckedChange={(checked) => setRequired(checked === true)} />
            {needsOptions(type) ? (
              <Field label="Options List" helperText="Type options separated by commas (e.g. Small, Medium, Large)">
                <Input value={optionsCsv} onChange={(e) => setOptionsCsv(e.target.value)} placeholder="Option 1, Option 2, Option 3" />
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="primary" disabled={pending} onClick={saveField}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DELETE DIALOG ── */}
      <ConfirmationDialog
        open={!!deleteConfirmField}
        title="Delete Custom Field"
        message={`Are you sure you want to delete the field "${deleteConfirmField?.label}"? This will permanently delete all guest answers collected for this field.`}
        confirmLabel="Delete"
        loading={pending}
        onCancel={() => setDeleteConfirmField(null)}
        onConfirm={() => {
          if (!deleteConfirmField) return;
          const targetField = { ...deleteConfirmField };
          const previousFields = localFields;
          setDeleteConfirmField(null);
          setLocalFields((current) => current.filter((field) => field.id !== targetField.id));
          startTransition(async () => {
            const res = await deleteEventRegistrationField({
              organisationSlug,
              eventId,
              fieldId: targetField.id,
            });
            if (!res.ok) {
              setLocalFields(previousFields);
              showToast(res.error, "error");
            } else {
              showToast(
                `Field "${targetField.label}" deleted`,
                "success",
                {
                  label: "Undo",
                  onClick: () => {
                    startTransition(async () => {
                      const restoreRes = await upsertEventRegistrationField({
                        organisationSlug,
                        eventId,
                        key: targetField.key,
                        label: targetField.label,
                        type: targetField.type,
                        required: targetField.required,
                        options: targetField.options,
                      });
                      if (restoreRes.ok) {
                        setLocalFields((current) => [
                          ...current,
                          {
                            ...targetField,
                            id: restoreRes.data!.fieldId,
                          },
                        ]);
                        showToast("Field restored", "success");
                        router.refresh();
                      } else {
                        showToast(restoreRes.error, "error");
                      }
                    });
                  },
                },
                10000
              );
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}
