export interface StorageFormat {
  extension: 'jpg' | 'png' | 'gif' | 'webp' | 'bmp';
  contentType: string;
}

const CONTENT_TYPES: Record<StorageFormat['extension'], string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

function supportedExtension(value?: string): StorageFormat['extension'] | null {
  const normalized = value?.toLowerCase();
  if (normalized === 'jpeg') return 'jpg';
  if (normalized && normalized in CONTENT_TYPES) {
    return normalized as StorageFormat['extension'];
  }
  return null;
}

export function storageFormatFor(uri: string, mime: string): StorageFormat {
  const mimeExtension = supportedExtension(mime.split(';', 1)[0]?.split('/')[1]);
  const cleanUri = uri.split(/[?#]/, 1)[0];
  const pathExtension = supportedExtension(cleanUri.split('.').pop());
  const extension = mimeExtension ?? pathExtension ?? 'jpg';
  return { extension, contentType: CONTENT_TYPES[extension] };
}
