import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Yuyu event-management deployments handle personal information.",
};

const sections: LegalSection[] = [
  {
    id: "who-is-responsible",
    title: "Who is responsible",
    body: "Yuyu is self-hosted software. The organisation that operates this Yuyu instance is responsible for its use of personal information and for providing its own contact details, retention rules, and any notices required in its jurisdiction. Each event organiser is responsible for the information it collects from attendees through its events and registration forms.",
  },
  {
    id: "information-we-process",
    title: "Information we process",
    body: "Depending on how you use the service, this may include account details such as your name and email address; organisation and event details; RSVP details such as attendee name, email address, registration answers, ticket and check-in status; and feedback submitted through an event form. The service also processes technical and security information needed to operate accounts, prevent abuse, and maintain an audit trail.",
  },
  {
    id: "how-it-is-used",
    title: "How it is used",
    body: "Information is used to provide and secure the event service: to authenticate users, create and manage events, accept and manage registrations, issue tickets, support check-in, send transactional email, and investigate security or operational issues. Event organisers may use attendee information to run their events and communicate with registered attendees. Yuyu does not sell personal information.",
  },
  {
    id: "analytics",
    title: "Analytics",
    body: "This instance uses Plausible Analytics to understand aggregated page use. Analytics receives page origins and paths without query strings; ticket, invitation, password-reset, and email-verification routes are excluded. It does not receive attendee details, registration answers, or feedback content.",
  },
  {
    id: "sharing-and-providers",
    title: "Sharing and providers",
    body: "Information is shared only as needed to deliver the service or where required by law. A deployment operator may use infrastructure providers for hosting, private object storage, email delivery, backups, or monitoring. Organisers can access information for events and organisations they are authorised to manage. Public event pages expose only the details the organiser chooses to publish.",
  },
  {
    id: "security",
    title: "Security",
    body: "Yuyu is designed with tenant isolation, role-based access controls, private object storage, encrypted secrets, rate limits, and security logging. No system can guarantee absolute security. Deployment operators remain responsible for securely configuring their hosting, databases, email, backups, and access controls.",
  },
  {
    id: "retention-and-deletion",
    title: "Retention and deletion",
    body: "Retention is determined by the hosting organisation and, where applicable, the relevant event organiser. Some short-lived operational records are automatically cleaned up by the service, but broader retention, backup, and deletion practices are set by the deployment operator. Ask the relevant organiser or instance operator about its retention schedule.",
  },
  {
    id: "your-choices",
    title: "Your choices",
    body: "To request access, correction, deletion, or other action concerning your information, contact the organisation that hosted the event or operates this instance. It will assess and handle requests under the laws that apply to it. Account holders can also update basic profile details through their account settings.",
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to this policy",
    body: "The operator may update this policy when the service or its data practices change. The current version is published on this page. Material changes should be communicated by the operator where required by applicable law.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy"
      updated="15 September 2026"
      notice="This policy explains the privacy practices built into Yuyu. It is a general product notice and must be reviewed and supplemented by each deployment operator for its legal jurisdiction, contact details, and actual hosting arrangements."
      sections={sections}
    />
  );
}
