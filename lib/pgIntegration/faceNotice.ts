/*
 * The face-matching notice shown before the camera (plan §4.1, DPDP s.5-6).
 * Versioned: changing any wording means a new FACE_NOTICE_VERSION, and people
 * who agreed to an older version are asked again before their next selfie.
 * Shared by the web step, the mobile API and the help article.
 */

export const FACE_NOTICE_VERSION = "pg-face-2026-11-v1";

export const FACE_NOTICE = {
  title: "Find your photos with a selfie",
  summary: "You add it here; only People's Gallery keeps it, for matching.",
  points: [
    "Purpose: People's Gallery compares your selfie with this event's photos so it can show you the ones you appear in. Nothing else.",
    "Yuyu sends your selfie straight to People's Gallery and never keeps a copy.",
    "Who sees the results: only you see the photos matched to you. The event's organisers can see that you added a selfie.",
    "How long: People's Gallery deletes your selfie and your matches 180 days after the event ends, or sooner if you stop face matching.",
    "Your choice: this is optional. Your registration works the same without it, and you can stop face matching at any time from your ticket or Account → Privacy. Stopping deletes your selfie and your matches.",
    "Face matching is only for people aged 18 or older.",
  ],
  consentLabel: "Match me in this event's photos",
  ageLabel: "I am 18 or older",
} as const;
