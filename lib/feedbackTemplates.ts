import type { RegistrationFieldType } from "@prisma/client";

export type FeedbackTemplate = {
  id: "QUICK_PULSE" | "EVENT_REVIEW" | "CONTENT_REVIEW";
  name: string;
  description: string;
  title: string;
  thankYouMessage: string;
  fields: Array<{
    key: string;
    label: string;
    type: RegistrationFieldType;
    required: boolean;
    options: string[];
  }>;
};

/** Server-owned starter forms that organisers can tailor after applying. */
export const feedbackTemplates: FeedbackTemplate[] = [
  {
    id: "QUICK_PULSE",
    name: "Quick pulse",
    description: "A short satisfaction rating and one optional comment.",
    title: "How was the event?",
    thankYouMessage: "Thanks for sharing your feedback.",
    fields: [
      { key: "overall_experience", label: "How would you rate your overall experience?", type: "RADIO", required: true, options: ["Excellent", "Good", "Okay", "Poor"] },
      { key: "comments", label: "Is there anything else you’d like to share?", type: "TEXTAREA", required: false, options: [] },
    ],
  },
  {
    id: "EVENT_REVIEW",
    name: "Event review",
    description: "Gather practical feedback on value, logistics, and improvements.",
    title: "Event feedback",
    thankYouMessage: "Thank you — your feedback helps us make future events better.",
    fields: [
      { key: "overall_experience", label: "How would you rate your overall experience?", type: "RADIO", required: true, options: ["Excellent", "Good", "Okay", "Poor"] },
      { key: "most_valuable", label: "What was most valuable for you?", type: "TEXTAREA", required: true, options: [] },
      { key: "organisation", label: "How was the event organisation?", type: "RADIO", required: true, options: ["Excellent", "Good", "Okay", "Poor"] },
      { key: "recommend", label: "Would you recommend a future event to a friend or colleague?", type: "RADIO", required: true, options: ["Definitely", "Probably", "Not sure", "Probably not"] },
      { key: "improvements", label: "What could we improve next time?", type: "TEXTAREA", required: false, options: [] },
    ],
  },
  {
    id: "CONTENT_REVIEW",
    name: "Session & speaker review",
    description: "Learn how useful the content was and what attendees want next.",
    title: "Session feedback",
    thankYouMessage: "Thanks — we’ll use this to improve future sessions.",
    fields: [
      { key: "content_quality", label: "How would you rate the session content?", type: "RADIO", required: true, options: ["Excellent", "Good", "Okay", "Poor"] },
      { key: "speaker_clarity", label: "How clear and engaging were the speakers?", type: "RADIO", required: true, options: ["Excellent", "Good", "Okay", "Poor"] },
      { key: "key_takeaway", label: "What is one key takeaway?", type: "TEXTAREA", required: true, options: [] },
      { key: "future_topics", label: "What topics would you like us to cover next?", type: "TEXTAREA", required: false, options: [] },
    ],
  },
];

export function getFeedbackTemplate(id: string) {
  return feedbackTemplates.find((template) => template.id === id) ?? null;
}
