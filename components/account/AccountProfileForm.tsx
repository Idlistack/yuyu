"use client";

import { useState, useTransition } from "react";
import { Info } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Callout, SettingsRow } from "@/components/ui/display";
import { Field, Input, ReadOnlyValue } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/menu";
import { updateAccountProfile } from "@/app/actions/account";
import { uploadAccountProfileImage } from "@/app/actions/media";
import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";
import { useToast } from "@/components/feedback/ToastProvider";

export function AccountProfileForm(props: {
  initialName: string;
  email: string | null;
  image: string | null;
  profileImageUrl: string | null;
  gravatarUrl: string | null;
  createdAtLabel: string;
}) {
  const {
    email,
    image,
    profileImageUrl: initialProfileImageUrl,
    gravatarUrl,
    createdAtLabel,
  } = props;
  const [name, setName] = useState(props.initialName);
  const [profileImageUrl, setProfileImageUrl] = useState(
    initialProfileImageUrl ?? "",
  );
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const avatarSource =
    profileImageUrl.trim() || image || gravatarUrl || undefined;
  const avatarSourceDescription = profileImageUrl.trim()
    ? "Custom profile image."
    : image
      ? "Profile image from your sign-in provider."
      : "Uses your Gravatar when available, otherwise your initials.";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          let uploadedUrl = profileImageUrl;
          if (profileImageFile) {
            const upload = new FormData();
            upload.set("file", profileImageFile);
            const response = await uploadAccountProfileImage(upload);
            if (!response.ok) {
              setError(response.error);
              showToast(response.error, "error");
              return;
            }
            if (!response.data) {
              setError("Could not upload the profile image.");
              showToast("Could not upload the profile image.", "error");
              return;
            }
            uploadedUrl = response.data.url;
          }
          const result = await updateAccountProfile({
            name,
            profileImageUrl: uploadedUrl,
          });
          if (!result.ok) {
            setError(result.error);
            showToast(result.error, "error");
            return;
          }
          setName(result.data?.name ?? name.trim());
          setProfileImageUrl(result.data?.profileImageUrl ?? "");
          setProfileImageFile(null);
          showToast("Profile saved", "success");
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert" className="mb-2">{error}</Callout> : null}
      <SettingsRow title="Photo" description="Remove your uploaded image to use your provider image or Gravatar when available.">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={name || email} src={avatarSource} className="size-[72px] text-2xl" />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold text-ink">{name || "Your profile"}</p>
              <div className="flex items-center gap-1">
                <p className="truncate text-sm text-ink-muted">{email ?? "No email address"}</p>
                <Tooltip content={avatarSourceDescription}>
                  <IconButton label="Profile image source" size="sm" className="size-7 [&_svg]:size-4"><Info /></IconButton>
                </Tooltip>
              </div>
            </div>
          </div>
          <ImageUploadPicker
            initialUrl={initialProfileImageUrl}
            label="Profile image"
            placeholder="Your uploaded profile image will appear here."
            disabled={pending}
            objectFit="cover"
            onChange={(file, previewUrl) => {
              setProfileImageFile(file);
              setProfileImageUrl(previewUrl);
            }}
          />
        </div>
      </SettingsRow>
      <SettingsRow title="Display name">
        <Field label="Display name" hideLabel required>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} />
        </Field>
      </SettingsRow>
      <SettingsRow title="Email" description="Changing email is coming in a future update.">
        <ReadOnlyValue value={email ?? ""} />
      </SettingsRow>
      <div className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-ui text-ink-muted">Member since {createdAtLabel}</p>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
