import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CIRCLE_BACKGROUND, drawCircleBackgroundImage } from "../lib/circle-background";

function fakeImage(width: number, height: number) {
  return { naturalWidth: width, naturalHeight: height } as HTMLImageElement;
}

function recorder() {
  const calls: unknown[][] = [];
  const ctx = { drawImage: (...args: unknown[]) => { calls.push(args); } } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

test("uploaded background covers a square canvas without distortion", () => {
  const { ctx, calls } = recorder();
  const image = fakeImage(200, 100);
  const drew = drawCircleBackgroundImage(ctx, 700, {
    ...DEFAULT_CIRCLE_BACKGROUND, mode: "image", image,
  });
  assert.equal(drew, true);
  assert.deepEqual(calls[0], [image, -350, 0, 1400, 700]);
});

test("zoom and pan keep the background fully covering the canvas", () => {
  const { ctx, calls } = recorder();
  const image = fakeImage(200, 100);
  drawCircleBackgroundImage(ctx, 700, {
    ...DEFAULT_CIRCLE_BACKGROUND,
    mode: "image", image, zoom: 2, positionX: 100, positionY: -100,
  });
  assert.deepEqual(calls[0], [image, -2100, 0, 2800, 1400]);
});

test("without a valid uploaded image nothing is drawn", () => {
  const { ctx, calls } = recorder();
  assert.equal(drawCircleBackgroundImage(ctx, 700, DEFAULT_CIRCLE_BACKGROUND), false);
  assert.equal(drawCircleBackgroundImage(ctx, 700, {
    ...DEFAULT_CIRCLE_BACKGROUND, image: fakeImage(0, 100), mode: "image",
  }), false);
  assert.equal(calls.length, 0);
});
