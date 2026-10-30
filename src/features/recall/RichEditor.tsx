"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Bold, Heading3, Highlighter, Italic, List, ListOrdered, Underline } from "lucide-react";

/**
 * Editor de texto enriquecido (Tiptap). Se carga de forma diferida
 * solo cuando abres el editor de tarjetas.
 */
export default function RichEditor({
  value,
  onChange,
  label,
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3] }, codeBlock: false, link: false }),
      Highlight,
    ],
    content: value || "",
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "rich px-3 py-2.5 text-base sm:text-sm",
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  const tools = editor
    ? [
        { icon: Bold, label: "Negritas", active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
        { icon: Italic, label: "Cursiva", active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
        { icon: Underline, label: "Subrayado", active: editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run() },
        { icon: Highlighter, label: "Resaltar", active: editor.isActive("highlight"), run: () => editor.chain().focus().toggleHighlight().run() },
        { icon: Heading3, label: "Subtítulo", active: editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
        { icon: List, label: "Lista", active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
        { icon: ListOrdered, label: "Lista numerada", active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
      ]
    : [];

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-canvas focus-within:border-primary">
      <div className="flex flex-wrap gap-0.5 border-b border-line px-1.5 py-1" role="toolbar" aria-label={`Formato de ${label}`}>
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
            aria-label={t.label}
            aria-pressed={t.active}
            title={t.label}
            className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${t.active ? "bg-primary/20 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <t.icon size={15} aria-hidden />
          </button>
        ))}
      </div>
      {editor ? <EditorContent editor={editor} /> : <div className="h-[5.5rem] animate-pulse bg-surface" />}
    </div>
  );
}
