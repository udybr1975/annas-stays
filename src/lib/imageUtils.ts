import { supabase } from "./supabase";

export const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80";

/**
 * Resolves an image URL or path to a valid public URL.
 * If the input is a full URL (starts with http), it returns it as is.
 * If it's a path, it resolves it using the 'apartment-images' bucket.
 * If empty, returns a fallback image.
 */
export const resolveImageUrl = (url: string | undefined | null) => {
  if (!url) return FALLBACK_IMAGE;
  
  // If it's already a full URL (http/https), return it
  if (url.startsWith('http')) return url;
  
  // Otherwise, assume it's a path in the 'apartment-images' bucket
  const { data } = supabase.storage.from('apartment-images').getPublicUrl(url);
  return data.publicUrl;
};
