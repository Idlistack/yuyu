"use client";

import type { ManualRsvpField } from "@/components/attendees/ManualRsvpDialog";
import { CheckboxField, Radio, RadioGroup } from "@/components/ui/choice";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";

/** One registration question in the organiser's add/edit attendee dialogs. */
export function AttendeeAnswerField({ field, value, onChange }: { field: ManualRsvpField; value: unknown; onChange: (value: unknown) => void }) {
  const label = field.required ? `${field.label} *` : field.label;
  if (field.type === "CHECKBOX") {
    return <CheckboxField label={label} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />;
  }
  if (field.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-label text-ink">{label}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {field.options.map((option) => (
            <CheckboxField
              key={option}
              label={option}
              checked={selected.includes(option)}
              onCheckedChange={(checked) => onChange(checked === true ? [...selected, option] : selected.filter((item) => item !== option))}
            />
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.type === "RADIO") {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-label text-ink">{label}</legend>
        <RadioGroup value={typeof value === "string" ? value : ""} onValueChange={onChange} required={field.required}>
          {field.options.map((option) => <Radio key={option} value={option} label={option} />)}
        </RadioGroup>
      </fieldset>
    );
  }
  if (field.type === "SELECT") {
    return (
      <Field label={label} required={field.required}>
        <NativeSelect value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose one</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </NativeSelect>
      </Field>
    );
  }
  const textValue = typeof value === "string" || typeof value === "number" ? value : "";
  if (field.type === "TEXTAREA") {
    return (
      <Field label={label} required={field.required}>
        <Textarea rows={3} value={textValue} onChange={(event) => onChange(event.target.value)} />
      </Field>
    );
  }
  return (
    <Field label={label} required={field.required}>
      <Input
        type={field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
        value={textValue}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
