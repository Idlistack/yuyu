"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h6">Feedback responses</Typography>
          <Typography variant="body2" color="text.secondary">
            Responses are shown without attendee identity or certificate information.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {exportHref ? <Button component="a" href={exportHref} variant="outlined" size="small">Download full CSV</Button> : null}
          <Chip label={`${responses.length}${truncated ? "+" : ""} responses`} size="small" />
        </Stack>
      </Stack>
      {responses.length === 0 ? (
        <Typography color="text.secondary">No feedback responses yet.</Typography>
      ) : responses.map((response, index) => (
        <Accordion key={response.id} variant="outlined" disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Response {responses.length - index} · {new Date(response.submittedAt).toLocaleString()}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.25}>
              {response.answers.length === 0 ? <Typography color="text.secondary">No answers were submitted.</Typography> : response.answers.map((answer) => (
                <Box key={`${answer.label}:${answer.value}`}>
                  <Typography variant="subtitle2">{answer.label}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{answer.value}</Typography>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
      {truncated ? <Typography variant="caption" color="text.secondary">Showing the 250 most recent responses.</Typography> : null}
    </Stack>
  );
}
