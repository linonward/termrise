import { isAllowedUpload } from "./upload-rules";

export class UploadImageError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export type PutFile = (
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
) => Promise<boolean>;

// XHR because fetch cannot report upload progress.
const xhrPut: PutFile = (url, headers, file, onProgress) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers))
      xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });

export function fileExtension(name: string) {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

// Browser → POST /api/uploads → PUT the file straight to R2 (never through our server).
export async function uploadImage(
  file: File,
  {
    fetcher = fetch,
    put = xhrPut,
    onProgress = () => {},
  }: {
    fetcher?: typeof fetch;
    put?: PutFile;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<string> {
  const extension = fileExtension(file.name);
  if (!isAllowedUpload(file.type, extension, file.size))
    throw new UploadImageError("INVALID_INPUT");
  const response = await fetcher("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentType: file.type,
      size: file.size,
      extension,
    }),
  }).catch(() => null);
  const body = await response?.json().catch(() => null);
  if (!response?.ok)
    throw new UploadImageError(body?.error?.code ?? "NETWORK_ERROR");
  const ok = await put(body.uploadUrl, body.headers, file, onProgress);
  if (!ok) throw new UploadImageError("STORAGE_ERROR");
  onProgress(1);
  return body.objectKey;
}
