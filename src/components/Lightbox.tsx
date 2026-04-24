import { useState } from "react";
import { resolveImageUrl } from "../lib/imageUtils";

interface LightboxProps {
  imgs: string[];
  startIdx: number;
  onClose: () => void;
}

export default function Lightbox({ imgs, startIdx, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIdx);
  return (
    <div className="fixed inset-0 bg-black/92 z-[3000] flex items-center justify-center" onClick={onClose}>
      <button
        onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length); }}
        className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/10 border-none text-white text-3xl cursor-pointer p-3 px-4.5"
      >
        ‹
      </button>
      <img src={resolveImageUrl(imgs[idx])} alt="" className="max-w-[80vw] max-h-[80vh] object-contain" onClick={e => e.stopPropagation()} />
      <button
        onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length); }}
        className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/10 border-none text-white text-3xl cursor-pointer p-3 px-4.5"
      >
        ›
      </button>
      <button onClick={onClose} className="absolute top-5 right-6 bg-none border-none text-white text-2xl cursor-pointer">✕</button>
      <div className="absolute bottom-5 flex gap-2">
        {imgs.map((_, i) => (
          <div
            key={i}
            onClick={e => { e.stopPropagation(); setIdx(i); }}
            className={`w-2 h-2 rounded-full cursor-pointer ${i === idx ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
