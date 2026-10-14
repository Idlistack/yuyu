"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Accordion, AccordionItem } from "@/components/ui/tabs";

export type FeedbackResponseRow = {
  id: string;
  submittedAt: string;
  answers: Array<{ label: string; value: string }>;
};

export function FeedbackResponsesPanel(props: {
  responses: FeedbackResponseRow[];
  truncated: boolean;
  exportHref?: string;
}) {
  const { responses, truncated, exportHref } = props;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h3 text-ink">Feedback responses</h2>
          <p className="mt-1 text-body-ui text-ink-muted">Responses are shown without attendee identity or certificate information.</p>
        </div>
        <div className="flex items-center gap-2">
          {exportHref ? <Button asChild variant="secondary" size="sm"><a href={exportHref}><Download aria-hidden className="size-4" />Download full CSV</a></Button> : null}
          <Chip size="sm">{`${responses.length}${truncated ? "+" : ""} responses`}</Chip>
        </div>
      </div>
      {responses.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No feedback responses yet.</p>
      ) : (
        <Accordion type="multiple" className="rounded-lg border border-line bg-canvas px-4 [&>*:last-child]:border-b-0">
          {responses.map((response, index) => (
            <AccordionItem key={response.id} value={response.id} title={<span className="text-[15px]">Response {responses.length - index} · {new Date(response.submittedAt).toLocaleString()}</span>}>
              <div className="flex flex-col gap-3">
                {response.answers.length === 0 ? <p className="text-body-ui text-ink-muted">No answers were submitted.</p> : response.answers.map((answer) => (
                  <div key={`${answer.label}:${answer.value}`}>
                    <p className="text-label text-ink">{answer.label}</p>
                    <p className="whitespace-pre-wrap text-body-ui text-ink-secondary [overflow-wrap:anywhere]">{answer.value}</p>
                  </div>
                ))}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {truncated ? <p className="text-caption text-ink-muted">Showing the 250 most recent responses.</p> : null}
    </section>
  );
}
