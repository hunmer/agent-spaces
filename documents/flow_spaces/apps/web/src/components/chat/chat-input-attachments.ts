import type { Attachment as MessageAttachment } from "@agent-spaces/shared";
import { sdk } from '@/lib/sdk';
import type { AttachmentData } from "./attachments";

export type LocalAttachment = {
  file: File;
  preview: string;
};

/**
 * 编辑消息时回填的附件：来自已上传的 MessageAttachment，
 * 无原始 File，发送时无需再次上传，直接复用已上传信息。
 */
export type RestoredAttachment = {
  uploaded: MessageAttachment;
  preview: string;
};

export type ComposerAttachment = LocalAttachment | RestoredAttachment;

export function isRestoredAttachment(item: ComposerAttachment): item is RestoredAttachment {
  return (item as RestoredAttachment).uploaded !== undefined;
}

export async function uploadComposerAttachment(item: ComposerAttachment): Promise<MessageAttachment> {
  if (isRestoredAttachment(item)) return item.uploaded;
  return uploadAttachment(item);
}

export async function uploadAttachment(item: LocalAttachment): Promise<MessageAttachment> {
  const formData = new FormData();
  formData.append("file", item.file);
  const uploaded = await sdk.http.upload<{ name: string; size: number; type: string; url: string }>("/api/upload", formData);
  return {
    name: uploaded.name,
    path: uploaded.url,
    url: uploaded.url,
    type: uploaded.type,
    size: uploaded.size,
  };
}

export function composerAttachmentToData(item: ComposerAttachment): AttachmentData {
  if (isRestoredAttachment(item)) {
    return {
      id: `${item.uploaded.name}-${item.uploaded.size ?? 0}`,
      type: "file",
      filename: item.uploaded.name,
      mediaType: item.uploaded.type,
      url: item.preview,
    };
  }
  return localAttachmentToData(item);
}

export function localAttachmentToData(item: LocalAttachment): AttachmentData {
  return {
    id: `${item.file.name}-${item.file.lastModified}`,
    type: "file",
    filename: item.file.name,
    mediaType: item.file.type,
    url: item.preview,
  };
}

/** 将已上传的消息附件还原为可编辑的回填附件。 */
export function restoreAttachments(items: MessageAttachment[] | undefined): RestoredAttachment[] {
  if (!items || items.length === 0) return [];
  return items.map((uploaded) => ({
    uploaded,
    preview: uploaded.url || uploaded.path,
  }));
}
