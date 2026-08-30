import { ProfileSettings } from "@/components/profile-settings";

export const dynamic = "force-dynamic";

export default function ProfileSettingsPage() {
  return (
    <section className="space-y-2">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal details and account security.
        </p>
      </div>
      <ProfileSettings />
    </section>
  );
}
