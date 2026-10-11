import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE, loadStyleConfig, saveStyleConfig } from "../lib/style";
import { renderToCanvas } from "../components/CircleChart";
import { DEFAULT_SCORING_WEIGHTS, type AnalysisResult } from "../lib/circle-convert";

test("website watermark preference survives reload independently of the existing ID setting", (t) => {
  let stored: string | null = null;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    for (const [key, descriptor] of [["window", originalWindow], ["localStorage", originalStorage]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  // Browser storage is the only dependency of the preference loader.
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => stored,
    setItem: (_key: string, value: string) => { stored = value; },
  },
  });
  assert.equal(loadStyleConfig().showWatermark, true);
  stored = JSON.stringify({ showCircleId: false });
  assert.equal(loadStyleConfig().showWatermark, true);
  for (const showCircleId of [true, false]) {
    saveStyleConfig({ ...DEFAULT_STYLE, showWatermark: false, showCircleId });
    const reloaded = loadStyleConfig();
    assert.equal(reloaded.showWatermark, false);
    assert.equal(reloaded.showCircleId, showCircleId);
    saveStyleConfig({ ...reloaded, showWatermark: true });
    assert.equal(loadStyleConfig().showWatermark, true);
  }
});

test("preview and high-resolution transparent download omit both website lines when disabled", () => {
  const result: AnalysisResult = {
    targetUser: { id: "1", userName: "sample", name: "Sample", profilePicture: "", followers: 0, isBlueVerified: false, isProtected: false },
    topUsers: [], tweetCount: 0, analyzedAt: "2026-10-12", weights: DEFAULT_SCORING_WEIGHTS,
  };
  for (const exportScale of [1, 4]) {
    for (const showWatermark of [true, false]) {
      const drawnText: string[] = [];
      const ctx = new Proxy<Record<string, unknown>>({}, {
        get: (target, key: string) => {
          if (key === "fillText") return (text: string) => drawnText.push(text);
          if (key === "measureText") return (text: string) => ({ width: text.length * 7 });
          return target[key] ?? (() => {});
        },
        set: (target, key: string, value) => { target[key] = value; return true; },
      });
      const canvas = { style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement;
      renderToCanvas(canvas, result, { ...DEFAULT_STYLE, showWatermark }, new Map(), {
        exportScale, transparent: true, flat: true, circleId: "test1234",
      });
      assert.equal(canvas.width, 700 * exportScale);
      assert.equal(drawnText.includes("NekoCircle"), showWatermark);
      assert.equal(drawnText.includes("circle.catsuki.cc"), showWatermark);
      assert.equal(drawnText.includes("test1234"), true);
    }
  }
});
