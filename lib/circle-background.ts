export type CircleBackgroundMode = "color" | "transparent" | "image";

/** Browser-local background options. Uploaded images are never stored in the database. */
export type CircleBackground = {
  mode: CircleBackgroundMode;
  image: HTMLImageElement | null;
  fileName: string;
  zoom: number;
  positionX: number;
  positionY: number;
};

export const DEFAULT_CIRCLE_BACKGROUND: CircleBackground = {
  mode: "color",
  image: null,
  fileName: "",
  zoom: 1,
  positionX: 0,
  positionY: 0,
};

/** Cover a square canvas; positions from -100 (start) to 100 (end). */
export function drawCircleBackgroundImage(
  ctx: CanvasRenderingContext2D,
  size: number,
  background: CircleBackground,
) {
  const image = background.image;
  if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

  const zoom = Math.max(1, Math.min(3, background.zoom));
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (size - width) * ((Math.max(-100, Math.min(100, background.positionX)) + 100) / 200);
  const y = (size - height) * ((Math.max(-100, Math.min(100, background.positionY)) + 100) / 200);
  ctx.drawImage(image, x || 0, y || 0, width, height);
  return true;
}
