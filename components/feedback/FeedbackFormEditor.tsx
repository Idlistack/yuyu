"use client";

import { useState, useTransition } from "react";
import type { RegistrationFieldType } from "@prisma/client";
import { RegistrationFieldType as FieldType } from "@prisma/client";
import { Copy, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field as FormField, Input, NativeSelect } from "@/components/ui/field";
import { applyFeedbackTemplate, deleteFeedbackField, saveFeedbackField, saveFeedbackSettings } from "@/app/actions/feedback-form";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import { feedbackTemplates, type FeedbackTemplate } from "@/lib/feedbackTemplates";

import { CertificateBuilder } from "./CertificateBuilder";
import { parseCertificateTemplate } from "@/lib/certificateTemplate";

type Field = { id: string; key: string; label: string; type: RegistrationFieldType; required: boolean; options: string[] };

export function FeedbackFormEditor(props: {
  organisationSlug: string;
  eventId: string;
  feedbackUrl: string;
  form: { isOpen: boolean; title: string; thankYouMessage: string; certificateEnabled: boolean; certificateTemplate?: unknown } | null;
  fields: Field[];
}) {
  const [isOpen, setIsOpen] = useState(props.form?.isOpen ?? false);
  const [title, setTitle] = useState(props.form?.title ?? "Event feedback");
  const [thankYouMessage, setThankYouMessage] = useState(props.form?.thankYouMessage ?? "Thanks for sharing your feedback.");
  const [certificateEnabled, setCertificateEnabled] = useState(props.form?.certificateEnabled ?? false);
  const [certificateTemplate, setCertificateTemplate] = useState(() => parseCertificateTemplate(props.form?.certificateTemplate));
  const [certificateBusy, setCertificateBusy] = useState(false);
  const [fields, setFields] = useState(props.fields);
  const [dialog, setDialog] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<RegistrationFieldType>("TEXTAREA");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteField, setDeleteField] = useState<Field | null>(null);
  const [pending, startTransition] = useTransition();
  useUnsavedChangesGuard((dirty || certificateBusy) && !pending);

  const saveSettings = () => startTransition(async () => {
    const result = await saveFeedbackSettings({
      organisationSlug: props.organisationSlug,
      eventId: props.eventId,
      isOpen,
      title,
      thankYouMessage,
      certificateEnabled,
      certificateTemplate,
    });
    setMessageIsError(!result.ok);
    setMessage(result.ok ? "Feedback settings saved." : result.error);
    if (result.ok) setDirty(false);
  });

  const openFieldDialog = (field?: Field) => {
    setEditingField(field ?? null);
    setLabel(field?.label ?? "");
    setType(field?.type ?? "TEXTAREA");
    setRequired(field?.required ?? false);
    setOptions(field?.options.join(", ") ?? "");
    setDialog(true);
  };

  const saveField = () => {
    const values = options.split(",").map((value) => value.trim()).filter(Boolean);
    const key = editingField?.key ?? (label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "feedback");
    startTransition(async () => {
      const result = await saveFeedbackField({ organisationSlug: props.organisationSlug, eventId: props.eventId, fieldId: editingField?.id, key, label, type, required, options: values });
      if (!result.ok) {
        setMessageIsError(true);
        setMessage(result.error);
        return;
      }
      const savedField = { id: result.data!.fieldId, key, label, type, required, options: values };
      setFields((current) => editingField
        ? current.map((field) => field.id === editingField.id ? savedField : field)
        : [...current, savedField]);
      setDialog(false);
      setEditingField(null);
      setLabel("");
      setOptions("");
      setMessageIsError(false);
      setMessage(editingField ? "Feedback question updated." : "Feedback question added.");
    });
  };

  const confirmDelete = () => {
    if (!deleteField) return;
    const target = deleteField;
    setDeleteField(null);
    startTransition(async () => {
      const result = await deleteFeedbackField({ organisationSlug: props.organisationSlug, eventId: props.eventId, fieldId: target.id });
      if (result.ok) {
        setFields((current) => current.filter((item) => item.id !== target.id));
        setMessageIsError(false);
        setMessage("Feedback question removed.");
      } else {
        setMessageIsError(true);
        setMessage(result.error);
      }
    });
  };

  const markDirty = () => setDirty(true);
  const applyTemplate = (template: FeedbackTemplate) => {
    startTransition(async () => {
      const result = await applyFeedbackTemplate({ organisationSlug: props.organisationSlug, eventId: props.eventId, templateId: template.id });
      if (!result.ok) {
        setMessageIsError(true);
        setMessage(result.error);
        return;
      }
      setFields(result.data!.fields);
      setTitle(template.title);
      setThankYouMessage(template.thankYouMessage);
      setIsOpen(false);
      setDirty(false);
      setTemplateDialog(false);
      setMessageIsError(false);
      setMessage(`${template.name} template applied. Review and customize it before opening the form.`);
    });
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-h3 text-ink">Feedback form</h2>
          <p className="mt-1 text-body-ui text-ink-muted">Share this link manually. It never sends system email.</p>
        </div>
        <Button variant="secondary" startIcon={<Copy />} onClick={() => void navigator.clipboard.writeText(props.feedbackUrl).then(() => { setMessageIsError(false); setMessage("Feedback link copied."); }, () => { setMessageIsError(true); setMessage("Could not copy the feedback link."); })}>Copy feedback link</Button>
      </div>
      {message ? <Callout tone={messageIsError ? "danger" : "info"} role={messageIsError ? "alert" : "status"} action={<Button size="sm" variant="quiet" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Callout> : null}
      <section className="flex flex-col items-start gap-3 rounded-lg border border-line bg-canvas p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-h4 text-ink">Start with a template</h3>
          <p className="mt-1 text-body-ui text-ink-muted">Use a ready-made question set, then tailor it to this event. Applying a template replaces unanswered questions and closes the form for review.</p>
        </div>
        <Button variant="secondary" startIcon={<LayoutTemplate />} onClick={() => setTemplateDialog(true)} disabled={pending} className="shrink-0">Browse feedback templates</Button>
      </section>
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-5">
        <FormField label="Form title">
          <Input value={title} onChange={(event) => { setTitle(event.target.value); markDirty(); }} />
        </FormField>
        <FormField label="Thank-you message">
          <Input value={thankYouMessage} onChange={(event) => { setThankYouMessage(event.target.value); markDirty(); }} />
        </FormField>
        <CheckboxField label="Open this feedback link" checked={isOpen} onCheckedChange={(checked) => { setIsOpen(checked === true); markDirty(); }} />
        <CheckboxField label="Offer a JPEG certificate after submission" checked={certificateEnabled} onCheckedChange={(checked) => { setCertificateEnabled(checked === true); markDirty(); }} />
        {certificateEnabled && <CertificateBuilder organisationSlug={props.organisationSlug} eventId={props.eventId} value={certificateTemplate} onChange={(value) => { setCertificateTemplate(value); markDirty(); }} disabled={pending} onBusyChange={setCertificateBusy} />}
        <Button variant="primary" onClick={saveSettings} disabled={pending || certificateBusy || !dirty} className="self-start">{pending ? "Saving…" : "Save settings"}</Button>
      </section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-h4 text-ink">Questions</h3>
        <Button variant="primary" startIcon={<Plus />} onClick={() => openFieldDialog()} disabled={pending}>Add question</Button>
      </div>
      {fields.length === 0 ? <EmptyState>Add at least one question before opening the form.</EmptyState> : (
        <ul className="flex flex-col gap-2.5">
          {fields.map((field) => (
            <li key={field.id} className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-label text-ink">{field.label}{field.required ? " *" : ""}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
                  <Chip size="sm">{field.type}</Chip>
                  {field.options.length ? <span>{field.options.join(", ")}</span> : null}
                </p>
              </div>
              <IconButton label={`Edit ${field.label}`} size="sm" disabled={pending} onClick={() => openFieldDialog(field)}><Pencil /></IconButton>
              <IconButton label={`Delete ${field.label}`} size="sm" variant="danger" disabled={pending} onClick={() => setDeleteField(field)}><Trash2 /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={dialog} onOpenChange={(next) => { if (!next && !pending) setDialog(false); }}>
        <DialogContent size="md">
          <DialogHeader title={editingField ? "Edit feedback question" : "Add feedback question"} />
          <DialogBody className="flex flex-col gap-4">
            <FormField label="Question">
              <Input value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
            </FormField>
            <FormField label="Answer type">
              <NativeSelect value={type} onChange={(event) => setType(event.target.value as RegistrationFieldType)}>
                {Object.values(FieldType).filter((item) => item !== "EMAIL" && item !== "PHONE" && item !== "DATE").map((item) => <option key={item} value={item}>{item}</option>)}
              </NativeSelect>
            </FormField>
            {["SELECT", "MULTI_SELECT", "RADIO"].includes(type) ? (
              <FormField label="Options (comma separated)">
                <Input value={options} onChange={(event) => setOptions(event.target.value)} />
              </FormField>
            ) : null}
            <CheckboxField label="Required" checked={required} onCheckedChange={(checked) => setRequired(checked === true)} />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(false)} disabled={pending}>Cancel</Button>
            <Button variant="primary" onClick={saveField} disabled={pending || !label.trim()}>{editingField ? "Save question" : "Add question"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={templateDialog} onOpenChange={(next) => { if (!next && !pending) setTemplateDialog(false); }}>
        <DialogContent size="lg">
          <DialogHeader title="Choose a feedback template" />
          <DialogBody>
            <ul className="flex flex-col gap-2.5">
              {feedbackTemplates.map((template) => (
                <li key={template.id} className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[16px] font-bold text-ink">{template.name}</p>
                    <p className="text-body-ui text-ink-secondary">{template.description}</p>
                    <p className="text-caption text-ink-muted">{template.fields.length} questions · {template.title}</p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => applyTemplate(template)} disabled={pending} className="shrink-0">Use template</Button>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTemplateDialog(false)} disabled={pending}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={Boolean(deleteField)}
        title="Delete feedback question?"
        message={`Delete “${deleteField?.label ?? "this question"}”? Existing answers may prevent removal.`}
        confirmLabel="Delete question"
        loading={pending}
        onCancel={() => setDeleteField(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
