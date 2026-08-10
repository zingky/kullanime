"use client";

import { useState } from "react";

interface PhotoGalleryProps {
  photos: string[] | null;
  coverImage?: string | null;
}

export default function PhotoGallery({ photos, coverImage }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Đảm bảo cover_image nằm ở vị trí đầu tiên
  const allPhotos = [
    coverImage || null,
    ...(photos || [])
  ].filter((p): p is string => Boolean(p) && p !== coverImage); // Bỏ cover trùng

  // Nếu chỉ có 1 ảnh, hiển thị đơn giản
  if (allPhotos.length <= 1) {
    if (!allPhotos[0]) return null;

    return (
      <div className="overflow-hidden rounded-xl border border-dark-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={allPhotos[0]}
          alt="Anime"
          className="h-64 w-full object-cover sm:h-96"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {allPhotos.map((photo, index) => (
          <button
            key={index}
            onClick={() => setLightboxIndex(index)}
            className={`group relative overflow-hidden rounded-xl border border-dark-700 transition-all hover:border-primary-500/50 ${
              index === 0 ? "sm:col-span-2" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={`Ảnh ${index + 1}`}
              className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                index === 0 ? "h-64 sm:h-96" : "h-48"
              }`}
            />
            {index === 0 && (
              <span className="absolute left-3 top-3 rounded bg-primary-600 px-2 py-1 text-xs font-bold text-white">
                Ảnh bìa
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-dark-950/40 opacity-0 transition-opacity group-hover:opacity-100">
              <svg
                className="h-10 w-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6"
                />
              </svg>
            </span>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dark-950/95 p-4 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-dark-700 p-2 text-gray-300 transition-colors hover:bg-dark-600"
            onClick={() => setLightboxIndex(null)}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <button
            className="absolute left-4 rounded-full bg-dark-700 p-2 text-gray-300 transition-colors hover:bg-dark-600 disabled:opacity-30"
            disabled={lightboxIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((lightboxIndex - 1 + allPhotos.length) % allPhotos.length);
            }}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={allPhotos[lightboxIndex]}
            alt={`Ảnh ${lightboxIndex + 1}`}
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            className="absolute right-4 rounded-full bg-dark-700 p-2 text-gray-300 transition-colors hover:bg-dark-600 disabled:opacity-30"
            disabled={lightboxIndex === allPhotos.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((lightboxIndex + 1) % allPhotos.length);
            }}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <p className="mt-4 text-sm text-gray-400">
            {lightboxIndex + 1} / {allPhotos.length}
          </p>
        </div>
      )}
    </div>
  );
}