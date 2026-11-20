import {MAX_ID_CARD_BYTES} from '../types';
import {proofTypes} from './proof';

export const noFileMessage = 'No file received. Try again, or choose from Files instead of Gallery.';
const photoLimit = 1_000_000;

async function compressPhoto(file: File): Promise<File> {
  const image = await createImageBitmap(file, {imageOrientation:'from-image'});
  try {
    // Keep document aspect ratio and enough pixels for text. Prefer quality over tiny thumbnails.
    for (const edge of [2560, 2048, 1600]) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.78, 0.68]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve,'image/jpeg',quality));
        if (blob && blob.size > 0 && blob.size < photoLimit) return new File([blob],'verification.jpg',{type:'image/jpeg'});
      }
    }
    throw new Error('Photo is too large');
  } finally { image.close(); }
}

export async function prepareReviewProof(file?: File, compress = compressPhoto): Promise<File> {
  if (!file) throw new Error(noFileMessage);
  if (!file.size || !proofTypes.includes(file.type)) throw new Error('Choose a nonempty JPEG, PNG, WebP or PDF.');
  if (file.type === 'application/pdf') {
    if (file.size > MAX_ID_CARD_BYTES) throw new Error('PDF exceeds the 3 MB limit. Choose a smaller PDF.');
    return file;
  }
  if (file.size < photoLimit) return file;
  try {
    const result = await compress(file);
    if (result.size && result.size < photoLimit) return result;
  } catch { /* Show an actionable message, not a decoder error. */ }
  throw new Error('Could not prepare a legible photo under 1 MB. Choose a smaller photo or PDF.');
}
