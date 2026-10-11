"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { CircleBackground, CircleBackgroundMode } from "@/lib/circle-background";

type Props = {
  value: CircleBackground;
  onChange: Dispatch<SetStateAction<CircleBackground>>;
};

const MODES: CircleBackgroundMode[] = ["color", "transparent", "image"];

export default function BackgroundPanel({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const uploadVersion = useRef(0);

  useEffect(() => () => { uploadVersion.current += 1; }, []);

  const update = (changes: Partial<CircleBackground>) => {
    onChange((previous) => ({ ...previous, ...changes }));
  };

  const loadFile = (file?: File) => {
    if (!file) return;
    setError("");
    const version = ++uploadVersion.current;
    if (!/^image\/(png|jpeg|webp|avif|gif)$/.test(file.type) || file.size > 30 * 1024 * 1024) {
      setError(t("background.invalidFile"));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (version !== uploadVersion.current) return;
      update({ mode: "image", image: img, fileName: file.name, zoom: 1, positionX: 0, positionY: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (version === uploadVersion.current) setError(t("background.invalidFile"));
    };
    img.src = url;
  };

  return (
    <section className="card rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">{t("background.title")}</h3>
      <p className="text-xs text-gray-400">{t("background.description")}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={mode === "image" && !value.image}
            aria-pressed={value.mode === mode}
            onClick={() => update({ mode })}
            className={`rounded-lg border px-2 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${value.mode === mode
              ? "border-[#bec2ff] bg-[#3c4278] text-white"
              : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"}`}
          >
            {t(`background.mode.${mode}`)}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/25 bg-white/5 px-3 py-2.5 text-center text-xs text-gray-200 transition hover:border-[#bec2ff] hover:bg-white/10">
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          onChange={(e) => { loadFile(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }}
        />
        {t("background.upload")}
      </label>
      {value.image && (
        <p className="truncate text-xs text-gray-400" title={value.fileName}>{value.fileName}</p>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {value.mode === "image" && value.image && (
        <div className="space-y-3">
          <label className="block text-xs text-gray-300">
            <span className="mb-1 flex justify-between"><span>{t("background.zoom")}</span><span>{Math.round(value.zoom * 100)}%</span></span>
            <input type="range" className="w-full accent-[#bec2ff]" min={1} max={3} step={0.05} value={value.zoom}
              onChange={(e) => update({ zoom: Number(e.target.value) })} />
          </label>
          {(["positionX", "positionY"] as const).map((axis) => (
            <label key={axis} className="block text-xs text-gray-300">
              <span className="mb-1 flex justify-between"><span>{t(`background.${axis}`)}</span><span>{value[axis]}%</span></span>
              <input type="range" className="w-full accent-[#bec2ff]" min={-100} max={100} step={1} value={value[axis]}
                onChange={(e) => update({ [axis]: Number(e.target.value) })} />
            </label>
          ))}
          <button type="button" onClick={() => update({ zoom: 1, positionX: 0, positionY: 0 })}
            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10">
            {t("background.reset")}
          </button>
        </div>
      )}
      <p className="text-xs leading-relaxed text-gray-500">{t("background.localOnly")}</p>
    </section>
  );
}
