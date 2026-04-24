import { C, GUIDE_DATA } from "../constants";

interface GuideModalProps {
  category: typeof GUIDE_DATA[0];
  onClose: () => void;
}

export default function GuideModal({ category, onClose }: GuideModalProps) {
  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-warm-white w-full max-w-[620px] max-h-[88vh] overflow-y-auto p-10 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-5 bg-none border-none text-xl cursor-pointer text-muted">✕</button>
        <p className="text-[0.62rem] tracking-widest uppercase text-clay mb-1.5 font-sans">Helsinki Guide</p>
        <h2 className="font-serif text-3xl font-light mb-6">{category.icon} {category.title}</h2>
        <div className="flex flex-col gap-0.5 bg-mist">
          {category.places.map((p, i) => (
            <div key={i} className="bg-warmWhite p-4 px-5 flex gap-3">
              <div className="font-serif text-2xl font-light text-mist min-w-[28px] text-right pt-0.5">{i + 1}</div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="font-serif text-lg font-light text-charcoal">{p.name}</span>
                  <span className="text-[0.75rem] text-clay font-sans">★ {p.rating}</span>
                </div>
                <div className="text-[0.7rem] text-muted mb-1 font-sans">{p.addr}</div>
                <div className="text-[0.8rem] text-muted leading-relaxed font-light">{p.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
