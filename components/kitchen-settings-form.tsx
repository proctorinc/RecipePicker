"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Camera, Loader2, Pencil, Soup } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  updateKitchenNameAction,
  uploadKitchenLogoAction,
} from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";

const initialState: ActionState = { status: "idle", message: "" };

export function KitchenSettingsForm({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  const [state, nameAction] = useActionState(
    updateKitchenNameAction,
    initialState,
  );
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      setIsNameDialogOpen(false);
      router.refresh();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [router, state]);

  function uploadLogo(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.set("logo", file);
    startUpload(async () => {
      const result = await uploadKitchenLogoAction(formData);
      if (result.status === "success") {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="relative flex flex-col items-center rounded-[28px] border border-border/60 bg-secondary/20 px-5 py-7 text-center sm:px-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          uploadLogo(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 disabled:cursor-wait"
        aria-label="Upload kitchen logo"
      >
        {logoUrl ? (
          // Blob uploads are public kitchen assets.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Kitchen logo"
            className="h-28 w-28 rounded-full object-cover shadow-soft sm:h-32 sm:w-32"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft sm:h-32 sm:w-32">
            <Soup className="h-12 w-12" />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
        </span>
      </button>
      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-2 rounded-lg px-2 py-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight transition hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Edit kitchen name: ${name}`}
          >
            <span>{name}</span>
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit kitchen name</DialogTitle>
          </DialogHeader>
          <form action={nameAction} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="kitchen-name"
                className="mb-2 text-sm font-medium hidden"
              >
                Kitchen name
              </label>
              <Input
                id="kitchen-name"
                name="name"
                defaultValue={name}
                maxLength={80}
                required
                autoFocus
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
