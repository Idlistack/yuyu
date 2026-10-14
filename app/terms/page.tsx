import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms for using a Yuyu event-management deployment.",
};

const sections: LegalSection[] = [
  {
    id: "acceptance-and-scope",
    title: "Acceptance and scope",
    body: "By creating an account, joining an organisation, registering for an event, or otherwise using this Yuyu instance, you agree to these Terms of Use. The organisation operating this instance may publish additional terms that apply to its events or community. Where those terms conflict with these terms, the operator's additional terms apply to the extent permitted by law.",
  },
  {
    id: "accounts-and-access",
    title: "Accounts and access",
    body: "Keep your account credentials confidential and notify the operator if you believe your account has been used without permission. You are responsible for activity carried out through your account. The operator may suspend or restrict access to protect the service, users, or the integrity of an event.",
  },
  {
    id: "event-organisers",
    title: "Event organisers",
    body: "Organisation owners and administrators are responsible for the events, invitations, registration forms, attendee communications, and content they create. They must obtain any required permissions or notices for the personal information they collect and must not use the service to process unlawful, misleading, infringing, or harmful content.",
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: "Do not attempt to bypass security controls, access another organisation's data, send unsolicited or abusive communications, introduce malware, interfere with the service, or use the service in violation of applicable law or another person's rights. Ticket links, invitation links, password-reset links, and similar access links are personal capabilities and must not be shared or misused.",
  },
  {
    id: "content-and-data",
    title: "Content and data",
    body: "You retain responsibility for the content and data you submit. You grant the operator the limited permission needed to host, process, display, and transmit that content solely to operate the service and the events you participate in. The operator may remove content or restrict access where reasonably necessary to protect the service or comply with law.",
  },
  {
    id: "availability-and-third-party-services",
    title: "Availability and third-party services",
    body: "Yuyu is provided on an as-available basis. The operator may change, maintain, or discontinue features and may rely on third-party infrastructure such as hosting, email, or storage providers. The operator should give reasonable notice of material planned changes where practical, but cannot guarantee uninterrupted or error-free operation.",
  },
  {
    id: "disclaimers-and-liability",
    title: "Disclaimers and liability",
    body: "To the maximum extent permitted by applicable law, the service is provided without warranties of merchantability, fitness for a particular purpose, or non-infringement. The operator's liability is limited as permitted by applicable law. Nothing in these terms excludes liability that cannot legally be excluded or limited.",
  },
  {
    id: "termination-and-changes",
    title: "Termination and changes",
    body: "You may stop using the service at any time. The operator may suspend or terminate access for a breach of these terms, to meet a legal obligation, or to protect users and the service. The operator may update these terms from time to time; continued use after the updated terms take effect means you accept them where permitted by law.",
  },
  {
    id: "questions-and-governing-terms",
    title: "Questions and governing terms",
    body: "For questions about an event, account, these terms, or the privacy policy, contact the organisation that operates this instance using its published contact details. The operator must add its legal entity name, contact information, governing law, and dispute process where required for its deployment.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="terms"
      title="Terms of use"
      updated="28 August 2026"
      notice="These terms are a general starting point for a self-hosted Yuyu deployment. They are not legal advice and should be reviewed by the operator's legal counsel before relying on them in a particular jurisdiction."
      sections={sections}
    />
  );
}
