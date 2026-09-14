"use client";

import { useEffect, useState, type ReactNode } from "react";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import RedoIcon from "@mui/icons-material/Redo";
import TitleIcon from "@mui/icons-material/Title";
import UndoIcon from "@mui/icons-material/Undo";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

type Props = { name: string; label: string; defaultValue?: string; helperText?: string; minHeight?: number };

export function RichTextEditor({ name, label, defaultValue = "", helperText, minHeight = 120 }: Props) {
  const [html, setHtml] = useState(defaultValue);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https:" }),
    ],
    content: defaultValue,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => setHtml(currentEditor.getHTML()),
  });
  useEffect(() => { if (editor && editor.getHTML() !== defaultValue) editor.commands.setContent(defaultValue); }, [defaultValue, editor]);
  const button = (label: string, active: boolean, action: () => void, icon: ReactNode) => <Button aria-label={label} aria-pressed={active} size="small" variant={active ? "contained" : "text"} onClick={action} sx={{ minWidth: 36, px: 0.75 }}>{icon}</Button>;
  const openLinkDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setLinkText(editor.state.doc.textBetween(from, to, " "));
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkError("");
    setLinkDialogOpen(true);
  };
  const applyLink = () => {
    if (!editor) return;
    const href = linkUrl.trim();
    try {
      const protocol = href.startsWith("mailto:") ? "mailto:" : new URL(href).protocol;
      if (!href || !["http:", "https:", "mailto:"].includes(protocol)) throw new Error();
    } catch {
      setLinkError("Enter a valid http(s) URL or mailto: address.");
      return;
    }
    if (editor.state.selection.empty) {
      if (!linkText.trim()) {
        setLinkError("Enter the text to display for this link.");
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: linkText.trim(), marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDialogOpen(false);
  };
  return <Stack spacing={0.75}><Typography component="label" variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography><input type="hidden" name={name} value={html} readOnly />
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", "& .ProseMirror": { minHeight, p: 1.5, outline: "none", "& p": { my: 0.5 }, "& ul, & ol": { pl: 3 }, "& blockquote": { borderLeft: 3, borderColor: "divider", pl: 1.5, ml: 0 }, "& a": { color: "primary.main", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "pointer", "&:hover": { color: "primary.dark" } } } }}>
      <Stack direction="row" spacing={0.25} sx={{ p: 0.5, borderBottom: 1, borderColor: "divider", flexWrap: "wrap" }}>{button("Heading", editor?.isActive("heading") ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), <TitleIcon fontSize="small" />)}{button("Bold", editor?.isActive("bold") ?? false, () => editor?.chain().focus().toggleBold().run(), <FormatBoldIcon fontSize="small" />)}{button("Italic", editor?.isActive("italic") ?? false, () => editor?.chain().focus().toggleItalic().run(), <FormatItalicIcon fontSize="small" />)}{button("Bulleted list", editor?.isActive("bulletList") ?? false, () => editor?.chain().focus().toggleBulletList().run(), <FormatListBulletedIcon fontSize="small" />)}{button("Numbered list", editor?.isActive("orderedList") ?? false, () => editor?.chain().focus().toggleOrderedList().run(), <FormatListNumberedIcon fontSize="small" />)}{button("Quote", editor?.isActive("blockquote") ?? false, () => editor?.chain().focus().toggleBlockquote().run(), <FormatQuoteIcon fontSize="small" />)}{button("Add or edit link", editor?.isActive("link") ?? false, openLinkDialog, <InsertLinkIcon fontSize="small" />)}{button("Remove link", false, () => editor?.chain().focus().unsetLink().run(), <LinkOffIcon fontSize="small" />)}{button("Undo", false, () => editor?.chain().focus().undo().run(), <UndoIcon fontSize="small" />)}{button("Redo", false, () => editor?.chain().focus().redo().run(), <RedoIcon fontSize="small" />)}{button("Clear formatting", false, () => editor?.chain().focus().clearNodes().unsetAllMarks().run(), <FormatClearIcon fontSize="small" />)}</Stack>
      <EditorContent editor={editor} />
    </Box>{helperText ? <Typography variant="caption" color="text.secondary">{helperText}</Typography> : null}
    <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Add link</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{linkError ? <Alert severity="error">{linkError}</Alert> : null}{editor?.state.selection.empty ? <TextField label="Link text" value={linkText} onChange={(event) => setLinkText(event.target.value)} fullWidth autoFocus /> : null}<TextField label="URL" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.com" helperText="HTTP(S) and mailto: links are supported." fullWidth autoFocus={!editor?.state.selection.empty} /></Stack></DialogContent>
      <DialogActions><Button onClick={() => setLinkDialogOpen(false)}>Cancel</Button><Button onClick={applyLink} variant="contained">Add link</Button></DialogActions>
    </Dialog>
  </Stack>;
}
