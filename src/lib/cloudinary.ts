const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload ảnh lên Cloudinary (unsigned preset)
 */
export async function uploadToCloudinary(file: File): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Thiếu cấu hình Cloudinary. Vui lòng kiểm tra .env.local"
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error(`Upload thất bại: ${res.status}`);
  }

  const data = await res.json();
  return data.secure_url as string;
}

/**
 * Upload nhiều ảnh lên Cloudinary
 */
export async function uploadMultipleToCloudinary(
  files: File[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const url = await uploadToCloudinary(file);
    urls.push(url);
  }
  return urls;
}

/**
 * Kiểm tra chuỗi có phải URL hợp lệ
 */
export function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Xử lý danh sách ảnh từ link URL dán vào
 */
export function parseImageUrls(raw: string): string[] {
  if (!raw.trim()) return [];

  const parts = raw.split(/[\n,]+/);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && isUrl(p));
}