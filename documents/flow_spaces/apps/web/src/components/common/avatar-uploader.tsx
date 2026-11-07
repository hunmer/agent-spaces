"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { AgentIcon } from "@/components/common/agent-icon";
import { AvatarPicker } from "@/components/sidebar/settings/avatar-picker";
import { ImagePickerDialog } from "@/components/ui/image-picker-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, ImagePlus, Smile } from "lucide-react";
import EmojiPicker from "emoji-picker-react";

export interface AvatarUploaderProps {
  name: string;
  avatarUrl: string;
  icon?: string;
  apiBase?: string;
  onAvatarUrlChange: (url: string) => void;
  onIconChange: (icon: string) => void;
  className?: string;
  hideUploadLabel?: boolean;
  /** Custom upload handler. Receives cropped dataUrl, returns the final URL to display. */
  onUploadDataUrl?: (dataUrl: string) => Promise<string>;
}

export function AvatarUploader({
  name,
  avatarUrl,
  icon,
  apiBase,
  onAvatarUrlChange,
  onIconChange,
  className,
  hideUploadLabel,
  onUploadDataUrl,
}: AvatarUploaderProps) {
  const t = useTranslations("agent");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState("");
  const [tab, setTab] = useState<"emoji" | "image">("emoji");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarSrc(reader.result as string);
      setAvatarPickerOpen(true);
      setPopoverOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className={`relative flex flex-col items-center gap-1.5 ${className ?? ""}`}>
      {avatarUrl ? (
        <div className="relative">
          <AgentIcon
            name={name}
            avatarUrl={avatarUrl}
            icon={icon}
            apiBase={apiBase}
            className="size-16 rounded-xl border border-input"
          />
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 cursor-pointer"
            onClick={() => onAvatarUrlChange("")}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="relative size-16 rounded-xl border border-input bg-muted flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              />
            }
          >
            <AgentIcon
              name={name}
              avatarUrl={avatarUrl}
              icon={icon}
              apiBase={apiBase}
              className="size-16 rounded-xl border border-input"
              bordered={false}
            />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-auto p-0">
            {/* Tab header */}
            <div className="flex border-b border-border">
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                  tab === "emoji"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setTab("emoji")}
              >
                <Smile className="size-3.5" />
                Emoji
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                  tab === "image"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setTab("image")}
              >
                <ImagePlus className="size-3.5" />
                {t("detail.uploadAvatar")}
              </button>
            </div>

            {/* Tab content */}
            {tab === "emoji" ? (
              <EmojiPicker
                onEmojiClick={(emoji) => {
                  onIconChange(emoji.emoji);
                  setPopoverOpen(false);
                }}
                width={280}
                height={300}
                previewConfig={{ showPreview: false }}
                skinTonesDisabled
              />
            ) : (
              <div className="p-3 flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  {t("detail.uploadAvatar")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}

      {!hideUploadLabel && !avatarUrl && (
        <label className="text-[10px] text-primary cursor-pointer hover:underline">
          {t("detail.uploadAvatar")}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                setAvatarSrc(reader.result as string);
                setAvatarPickerOpen(true);
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {onUploadDataUrl ? (
        <ImagePickerDialog
          src={avatarSrc}
          open={avatarPickerOpen}
          onOpenChange={setAvatarPickerOpen}
          onCropComplete={async (dataUrl) => {
            try {
              const url = await onUploadDataUrl(dataUrl);
              onIconChange("");
              onAvatarUrlChange(url);
            } catch { /* ignore */ }
            setAvatarPickerOpen(false);
          }}
        />
      ) : (
        <AvatarPicker
          src={avatarSrc}
          open={avatarPickerOpen}
          onOpenChange={setAvatarPickerOpen}
          onUploaded={(url) => {
            onIconChange("")
            onAvatarUrlChange(url)
          }}
          skipUserSettings
        />
      )}
    </div>
  );
}
