"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrganisation } from "@/app/actions/org";
import { uploadOrganisationLogo } from "@/app/actions/media";
import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";
import { useToast } from "@/components/feedback/ToastProvider";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Callout, SettingsRow } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";

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
    <form
      className="flex flex-col"
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
      {error ? <Callout tone="danger" role="alert" className="mb-2">{error}</Callout> : null}

      <SettingsRow title="Logo" description="Add a logo for a more recognizable presence.">
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
      </SettingsRow>

      <SettingsRow title="Name & description" description="Update how your organisation appears on public pages.">
        <div className="flex flex-col gap-4">
          <Field label="Name" required>
            <Input name="name" defaultValue={initial.name} />
          </Field>
          <Field label="Description" helperText="Shown on your organisation page.">
            <Textarea name="description" rows={4} defaultValue={initial.description} />
          </Field>
        </div>
      </SettingsRow>

      <div className="flex justify-end border-t border-line pt-5">
        <Button type="submit" variant="primary" disabled={pending} loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
