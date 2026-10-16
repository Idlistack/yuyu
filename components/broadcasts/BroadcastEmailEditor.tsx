"use client";

import { useEffect, useState, type ReactNode } from "react";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import RedoIcon from "@mui/icons-material/Redo";
import SmartButtonOutlinedIcon from "@mui/icons-material/SmartButtonOutlined";
import TitleIcon from "@mui/icons-material/Title";
import UndoIcon from "@mui/icons-material/Undo";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { BROADCAST_PLACEHOLDERS, BROADCAST_URL_PLACEHOLDERS } from "@/lib/broadcastTemplate";

const URL_PLACEHOLDER = new RegExp(`^\\{\\{\\s*(${BROADCAST_URL_PLACEHOLDERS.join("|")})\\s*\\}\\}$`);

function isAcceptableHref(href: string) {
  if (URL_PLACEHOLDER.test(href)) return true;
  try {
    const protocol = href.startsWith("mailto:") ? "mailto:" : new URL(href).protocol;
    return ["http:", "https:", "mailto:"].includes(protocol);
  } catch {
    return false;
  }
}

/** Links carry an optional `cta` class so a paragraph link can render as a button in the email. */
const EmailLink = Link.extend({
  // Tiptap makes links inclusive whenever autolink is on, so text typed after
  // an inserted link or button would silently join it.
  inclusive() {
    return false;
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute("class"),
        renderHTML: (attributes) => (attributes.class ? { class: attributes.class } : {}),
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
  isAllowedUri: (url, context) => URL_PLACEHOLDER.test(url) || context.defaultValidate(url),
});

const BUTTON_PRESETS = [
  { label: "View your ticket", href: "{{ticketLink}}" },
  { label: "Open the event page", href: "{{eventUrl}}" },
  { label: "Share your feedback", href: "{{feedbackUrl}}" },
] as const;

export function BroadcastEmailEditor(props: { value: string; onChange: (html: string) => void; disabled?: boolean }) {
  const { value, onChange, disabled = false } = props;
  const [placeholderAnchor, setPlaceholderAnchor] = useState<HTMLElement | null>(null);
  const [buttonAnchor, setButtonAnchor] = useState<HTMLElement | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ mode: "link" | "button"; text: string; href: string; error: string } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false, heading: { levels: [2, 3] }, link: false, horizontalRule: false }),
      EmailLink,
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  // Keep the editor in sync when a template or a previous email is loaded.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value);
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const button = (label: string, active: boolean, action: () => void, icon: ReactNode) => (
    <Button aria-label={label} title={label} aria-pressed={active} size="small" variant={active ? "contained" : "text"} onClick={action} disabled={disabled} sx={{ minWidth: 36, px: 0.75 }}>
      {icon}
    </Button>
  );

  const insertPlaceholder = (token: string) => {
    editor?.chain().focus().insertContent({ type: "text", text: token }).run();
    setPlaceholderAnchor(null);
  };

  const insertButton = (text: string, href: string) => {
    editor?.chain().focus().insertContent({
      type: "paragraph",
      content: [{ type: "text", text, marks: [{ type: "link", attrs: { href, class: "cta" } }] }],
    }).run();
    setButtonAnchor(null);
  };

  const openLinkDialog = (mode: "link" | "button") => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setLinkDialog({
      mode,
      text: editor.state.doc.textBetween(from, to, " "),
      href: mode === "link" ? (editor.getAttributes("link").href ?? "") : "",
      error: "",
    });
    setButtonAnchor(null);
  };

  const applyLinkDialog = () => {
    if (!editor || !linkDialog) return;
    const href = linkDialog.href.trim();
    if (!isAcceptableHref(href)) {
      setLinkDialog({ ...linkDialog, error: "Enter an http(s) URL, a mailto: address, or one of the link placeholders." });
      return;
    }
    if (linkDialog.mode === "button") {
      if (!linkDialog.text.trim()) {
        setLinkDialog({ ...linkDialog, error: "Enter the button text." });
        return;
      }
      insertButton(linkDialog.text.trim(), href);
    } else if (editor.state.selection.empty) {
      if (!linkDialog.text.trim()) {
        setLinkDialog({ ...linkDialog, error: "Enter the text to display for this link." });
        return;
      }
      editor.chain().focus().insertContent({ type: "text", text: linkDialog.text.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDialog(null);
  };

  return (
    <Stack spacing={0.75}>
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          opacity: disabled ? 0.7 : 1,
          "& .ProseMirror": {
            minHeight: 280,
            p: 2,
            outline: "none",
            fontSize: "1rem",
            lineHeight: 1.6,
            "& p": { my: 0.75 },
            "& h2": { fontSize: "1.35rem", mt: 2, mb: 1 },
            "& h3": { fontSize: "1.1rem", mt: 1.5, mb: 0.75 },
            "& ul, & ol": { pl: 3 },
            "& blockquote": { borderLeft: 3, borderColor: "primary.main", bgcolor: "action.hover", pl: 1.5, py: 0.5, ml: 0, borderRadius: 1 },
            "& a": { color: "primary.main", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "text" },
            "& a.cta": {
              display: "inline-block",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              px: 2.5,
              py: 1,
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: 600,
            },
          },
        }}
      >
        <Stack direction="row" spacing={0.25} useFlexGap sx={{ p: 0.5, borderBottom: 1, borderColor: "divider", flexWrap: "wrap", alignItems: "center" }}>
          {button("Bold", editor?.isActive("bold") ?? false, () => editor?.chain().focus().toggleBold().run(), <FormatBoldIcon fontSize="small" />)}
          {button("Italic", editor?.isActive("italic") ?? false, () => editor?.chain().focus().toggleItalic().run(), <FormatItalicIcon fontSize="small" />)}
          {button("Heading", editor?.isActive("heading") ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), <TitleIcon fontSize="small" />)}
          {button("Bulleted list", editor?.isActive("bulletList") ?? false, () => editor?.chain().focus().toggleBulletList().run(), <FormatListBulletedIcon fontSize="small" />)}
          {button("Numbered list", editor?.isActive("orderedList") ?? false, () => editor?.chain().focus().toggleOrderedList().run(), <FormatListNumberedIcon fontSize="small" />)}
          {button("Quote", editor?.isActive("blockquote") ?? false, () => editor?.chain().focus().toggleBlockquote().run(), <FormatQuoteIcon fontSize="small" />)}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {button("Add or edit link", editor?.isActive("link") ?? false, () => openLinkDialog("link"), <InsertLinkIcon fontSize="small" />)}
          {button("Remove link", false, () => editor?.chain().focus().unsetLink().run(), <LinkOffIcon fontSize="small" />)}
          <Button size="small" startIcon={<SmartButtonOutlinedIcon fontSize="small" />} onClick={(event) => setButtonAnchor(event.currentTarget)} disabled={disabled} sx={{ textTransform: "none" }}>
            Button
          </Button>
          <Button size="small" startIcon={<DataObjectOutlinedIcon fontSize="small" />} onClick={(event) => setPlaceholderAnchor(event.currentTarget)} disabled={disabled} sx={{ textTransform: "none" }}>
            Placeholder
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {button("Undo", false, () => editor?.chain().focus().undo().run(), <UndoIcon fontSize="small" />)}
          {button("Redo", false, () => editor?.chain().focus().redo().run(), <RedoIcon fontSize="small" />)}
          {button("Clear formatting", false, () => editor?.chain().focus().clearNodes().unsetAllMarks().run(), <FormatClearIcon fontSize="small" />)}
        </Stack>
        <EditorContent editor={editor} aria-label="Message" />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Formatting, links, and buttons are kept in the email. Placeholders are filled in for each recipient.
      </Typography>

      <Menu open={Boolean(placeholderAnchor)} anchorEl={placeholderAnchor} onClose={() => setPlaceholderAnchor(null)} disableRestoreFocus>
        {BROADCAST_PLACEHOLDERS.map((placeholder) => (
          <MenuItem key={placeholder.token} onClick={() => insertPlaceholder(placeholder.token)}>
            <ListItemText primary={placeholder.label} secondary={placeholder.token} />
          </MenuItem>
        ))}
      </Menu>

      <Menu open={Boolean(buttonAnchor)} anchorEl={buttonAnchor} onClose={() => setButtonAnchor(null)} disableRestoreFocus>
        {BUTTON_PRESETS.map((preset) => (
          <MenuItem key={preset.href} onClick={() => insertButton(preset.label, preset.href)}>
            <ListItemText primary={preset.label} secondary={preset.href} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => openLinkDialog("button")}>
          <ListItemText primary="Custom button…" secondary="Your own text and link" />
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(linkDialog)} onClose={() => setLinkDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>{linkDialog?.mode === "button" ? "Add button" : "Add link"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {linkDialog?.error ? <Alert severity="error">{linkDialog.error}</Alert> : null}
            {linkDialog?.mode === "button" || editor?.state.selection.empty ? (
              <TextField label={linkDialog?.mode === "button" ? "Button text" : "Link text"} value={linkDialog?.text ?? ""} onChange={(event) => setLinkDialog((current) => current && { ...current, text: event.target.value })} fullWidth autoFocus />
            ) : null}
            <TextField
              label="URL or placeholder"
              value={linkDialog?.href ?? ""}
              onChange={(event) => setLinkDialog((current) => current && { ...current, href: event.target.value })}
              placeholder="https://example.com or {{ticketLink}}"
              helperText="HTTP(S), mailto:, {{ticketLink}}, {{eventUrl}}, or {{feedbackUrl}}."
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialog(null)}>Cancel</Button>
          <Button onClick={applyLinkDialog} variant="contained">{linkDialog?.mode === "button" ? "Add button" : "Add link"}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
