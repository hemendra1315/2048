import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Converts a base64 Data URL to a native Blob for storage upload.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Uploads an image or voice note to the public 'chat-media' Supabase storage bucket.
 * Returns the public CDN URL to be stored in the message record.
 */
export async function uploadChatMedia(
  media: File | Blob | string,
  conversationId: string,
  suggestedExt?: string
): Promise<string> {
  if (!isSupabaseConfigured()) {
    // Return direct data URL / string in mock mode
    if (typeof media === 'string') return media;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(media);
    });
  }

  let blob: Blob;
  let ext = suggestedExt || 'jpg';
  let mimeType = 'image/jpeg';

  if (typeof media === 'string') {
    blob = dataUrlToBlob(media);
    mimeType = blob.type || 'image/jpeg';
    ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || suggestedExt || 'jpg';
  } else {
    blob = media;
    mimeType = media.type || 'image/jpeg';
    if (media instanceof File) {
      ext = media.name.split('.').pop() || ext;
    } else {
      ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || suggestedExt || 'jpg';
    }
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const filePath = `${conversationId}/${timestamp}_${randomSuffix}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('chat-media')
    .upload(filePath, blob, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[storage] Chat media upload failed:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Uploads a photo to the private 'gallery' Supabase storage bucket.
 */
export async function uploadGalleryMedia(
  media: File | Blob | string,
  userId: string,
  suggestedExt?: string
): Promise<{ publicUrl: string; filePath: string }> {
  if (!isSupabaseConfigured()) {
    let preview = typeof media === 'string' ? media : '';
    if (typeof media !== 'string') {
      preview = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(media);
      });
    }
    return { publicUrl: preview, filePath: `${userId}/mock_${Date.now()}.jpg` };
  }

  let blob: Blob;
  let ext = suggestedExt || 'jpg';
  let mimeType = 'image/jpeg';

  if (typeof media === 'string') {
    blob = dataUrlToBlob(media);
    mimeType = blob.type || 'image/jpeg';
    ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || suggestedExt || 'jpg';
  } else {
    blob = media;
    mimeType = media.type || 'image/jpeg';
    if (media instanceof File) {
      ext = media.name.split('.').pop() || ext;
    } else {
      ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || suggestedExt || 'jpg';
    }
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const filePath = `${userId}/${timestamp}_${randomSuffix}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('gallery')
    .upload(filePath, blob, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('[storage] Gallery media upload failed:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from('gallery').getPublicUrl(filePath);
  return { publicUrl: data.publicUrl, filePath };
}
