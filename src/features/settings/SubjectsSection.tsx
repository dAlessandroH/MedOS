"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ArchiveRestore, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import {
  SUBJECT_COLORS,
  SUBJECT_NAME_MAX,
  SubjectError,
  createSubject,
  deleteSubject,
  listSubjects,
  setSubjectArchived,
  updateSubject,
} from "@/db/repos/subjects";
import type { Subject } from "@/db/types";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { ColorPicker } from "./ColorPicker";

function messageFrom(err: unknown): string {
  return err instanceof SubjectError ? err.message : "Algo salió mal. Intenta de nuevo.";
}

function codeFrom(err: unknown) {
  return err instanceof SubjectError ? err.code : null;
}

function AddSubjectForm({ nextColor }: { nextColor: string }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSubject({ name, color: color ?? nextColor });
      setName("");
      setColor(null);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Nueva materia">
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="new-subject" className="sr-only">
            Nombre de la materia
          </label>
          <Input
            id="new-subject"
            placeholder="Ej. Fisiología II"
            value={name}
            maxLength={SUBJECT_NAME_MAX}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-subject-error" : undefined}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={saving || !name.trim()}>
          <Plus size={16} aria-hidden />
          Agregar
        </Button>
      </div>
      <ColorPicker name="new-subject-color" value={color ?? nextColor} onChange={setColor} />
      {error && (
        <p id="new-subject-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function EditSubjectDialog({ subject, onClose }: { subject: Subject | null; onClose: () => void }) {
  return (
    <Dialog open={subject !== null} onClose={onClose} title="Editar materia">
      {subject && <EditSubjectForm key={subject.id} subject={subject} onClose={onClose} />}
    </Dialog>
  );
}

function EditSubjectForm({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const [name, setName] = useState(subject.name);
  const [color, setColor] = useState(subject.color);
  const [error, setError] = useState<string | null>(null);
  const [canArchiveInstead, setCanArchiveInstead] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateSubject(subject.id, { name, color });
      onClose();
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteSubject(subject.id);
      onClose();
    } catch (err) {
      setError(messageFrom(err));
      setCanArchiveInstead(codeFrom(err) === "has_content");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await setSubjectArchived(subject.id, true);
      onClose();
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(false);
    }
  }

  if (confirmDelete) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          ¿Eliminar <strong className="text-fg">{subject.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            <Trash2 size={16} aria-hidden />
            Eliminar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label htmlFor="edit-subject-name">Nombre</Label>
        <Input
          id="edit-subject-name"
          value={name}
          maxLength={SUBJECT_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
        />
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Color</span>
        <ColorPicker name="edit-subject-color" value={color} onChange={setColor} />
      </div>
      {error && (
        <div role="alert" className="space-y-2 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          <p>{error}</p>
          {canArchiveInstead && (
            <Button variant="secondary" size="sm" onClick={archive} disabled={busy}>
              <Archive size={14} aria-hidden />
              Archivar en su lugar
            </Button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy} className="text-danger hover:text-danger">
          <Trash2 size={16} aria-hidden />
          Eliminar
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            Guardar
          </Button>
        </div>
      </div>
    </form>
  );
}

function SubjectRow({
  subject,
  onEdit,
}: {
  subject: Subject;
  onEdit: (s: Subject) => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
      <span className={`min-w-0 flex-1 truncate text-sm ${subject.archived ? "text-muted" : "text-fg"}`}>
        {subject.name}
      </span>
      {subject.archived ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSubjectArchived(subject.id, false)}
          aria-label={`Restaurar ${subject.name}`}
        >
          <ArchiveRestore size={15} aria-hidden />
          Restaurar
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSubjectArchived(subject.id, true)}
          aria-label={`Archivar ${subject.name}`}
          title="Archivar"
        >
          <Archive size={15} aria-hidden />
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onEdit(subject)} aria-label={`Editar ${subject.name}`} title="Editar">
        <Pencil size={15} aria-hidden />
      </Button>
    </li>
  );
}

export function SubjectsSection() {
  const all = useLiveQuery(() => listSubjects({ includeArchived: true }), []);
  const [editing, setEditing] = useState<Subject | null>(null);

  const active = all?.filter((s) => !s.archived) ?? [];
  const archived = all?.filter((s) => s.archived) ?? [];
  const nextColor = SUBJECT_COLORS[active.length % SUBJECT_COLORS.length];

  return (
    <Card id="materias" className="scroll-mt-24">
      <CardTitle>Materias</CardTitle>
      <CardDescription>Todo en MedOS se organiza por materia. Archivar oculta una materia sin borrar nada.</CardDescription>

      <div className="mt-5">
        <AddSubjectForm nextColor={nextColor} />
      </div>

      {all === undefined ? (
        <div className="mt-5 h-10 animate-pulse rounded-lg bg-surface-2" />
      ) : active.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          <BookOpen size={18} aria-hidden />
          Agrega tu primera materia arriba.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line" aria-label="Materias activas">
          {active.map((s) => (
            <SubjectRow key={s.id} subject={s} onEdit={setEditing} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-muted hover:text-fg">
            Archivadas ({archived.length})
          </summary>
          <ul className="mt-2 divide-y divide-line" aria-label="Materias archivadas">
            {archived.map((s) => (
              <SubjectRow key={s.id} subject={s} onEdit={setEditing} />
            ))}
          </ul>
        </details>
      )}

      <EditSubjectDialog subject={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
