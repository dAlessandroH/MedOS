import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileSection } from "@/features/settings/ProfileSection";
import { SubjectsSection } from "@/features/settings/SubjectsSection";
import { StorageSection } from "@/features/settings/StorageSection";
import { ExamsSection } from "@/features/settings/ExamsSection";
import { StudyPrefsSection } from "@/features/settings/StudyPrefsSection";
import { BackupSection } from "@/features/settings/BackupSection";
import { SCHEMA_VERSION } from "@/db/version";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" description="Materias, exámenes, respaldos y preferencias." />
      <div className="space-y-4">
        <SubjectsSection />
        <ExamsSection />
        <BackupSection />
        <StudyPrefsSection />
        <ProfileSection />
        <StorageSection />
        <p className="px-1 text-xs text-muted">MedOS v1.0.0 · esquema de datos v{SCHEMA_VERSION} · todo se guarda en este dispositivo</p>
      </div>
    </>
  );
}
