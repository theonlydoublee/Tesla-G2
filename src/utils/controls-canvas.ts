/**
 * Offscreen canvas renderer for Tesla controls (8 icons + selector).
 * Draws 400x100 canvas, splits into 2 images for glasses display.
 */

import {
  CONTROL_ACTIONS,
  SELECTOR_ICON,
  ICON_SIZE_MAP,
  type IconSizeKey,
} from '../controls-config';

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 100;
const HALF_WIDTH = 200;
const ICON_GAP = 9;
const LABEL_FONT = '16px verdana';
const LABEL_Y = 92;

/** Load image from URL and return ImageBitmap. */
async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * Render controls canvas and split into left/right PNG bytes.
 * @param iconSizePx - Icon dimension (20-40)
 * @param selectedIndex - Index of selected control (0-7)
 * @returns Left and right half as PNG bytes for SDK, or null on failure
 */
export async function renderControlsCanvas(
  iconSizePx: number,
  selectedIndex: number
): Promise<{ leftPngBytes: number[]; rightPngBytes: number[] } | null> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const totalIconWidth = CONTROL_ACTIONS.length * iconSizePx + (CONTROL_ACTIONS.length - 1) * ICON_GAP;
  const startX = Math.max(0, (CANVAS_WIDTH - totalIconWidth) / 2);
  const centerY = CANVAS_HEIGHT / 2;

  // Load all icons and selector
  const iconBitmaps: (ImageBitmap | null)[] = [];
  for (const action of CONTROL_ACTIONS) {
    iconBitmaps.push(await loadImage(action.icon));
  }
  const selectorBitmap = await loadImage(SELECTOR_ICON);

  // Compute icon positions (left to right, index 0 = leftmost)
  let x = startX;
  const iconCenters: number[] = [];
  for (let i = 0; i < CONTROL_ACTIONS.length; i++) {
    iconCenters.push(x + iconSizePx / 2);
    x += iconSizePx + ICON_GAP;
  }

  // Draw selector BEHIND icons (first, so icons render on top)
  if (selectorBitmap && selectedIndex >= 0 && selectedIndex < iconCenters.length) {
    const selCenterX = iconCenters[selectedIndex];
    const selSize = Math.min(iconSizePx + 16, 48);
    const selX = selCenterX - selSize / 2;
    const selY = centerY - selSize / 2;
    ctx.drawImage(selectorBitmap, selX, selY, selSize, selSize);
    selectorBitmap.close();
  } else if (selectorBitmap) {
    selectorBitmap.close();
  }

  // Draw icons on top (left to right: index 0 = Lock, 1 = Unlock, ... 7 = Horn)
  x = startX;
  for (let i = 0; i < CONTROL_ACTIONS.length; i++) {
    const bitmap = iconBitmaps[i];
    if (bitmap) {
      const y = centerY - iconSizePx / 2;
      ctx.drawImage(bitmap, x, y, iconSizePx, iconSizePx);
      bitmap.close();
    }
    x += iconSizePx + ICON_GAP;
  }

  // Draw selected action label at bottom, horizontally centered
  const selectedAction = CONTROL_ACTIONS[selectedIndex];
  if (selectedAction && selectedIndex >= 0 && selectedIndex < CONTROL_ACTIONS.length) {
    const label = selectedAction.id.charAt(0).toUpperCase() + selectedAction.id.slice(1);
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, CANVAS_WIDTH / 2, LABEL_Y);
  }

  // Split canvas into left and right halves, convert to PNG bytes
  const leftBytes = await canvasRegionToPngBytes(ctx, 0, 0, HALF_WIDTH, CANVAS_HEIGHT);
  const rightBytes = await canvasRegionToPngBytes(ctx, HALF_WIDTH, 0, HALF_WIDTH, CANVAS_HEIGHT);

  if (!leftBytes || !rightBytes) return null;

  return { leftPngBytes: leftBytes, rightPngBytes: rightBytes };
}

/** Extract canvas region and return PNG as number[]. */
async function canvasRegionToPngBytes(
  sourceCtx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): Promise<number[] | null> {
  const temp = document.createElement('canvas');
  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext('2d');
  if (!tctx) return null;

  tctx.drawImage(sourceCtx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob | null>((resolve) => {
    temp.toBlob(resolve, 'image/png');
  });
  if (!blob) return null;

  const buffer = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buffer));
}

/** Resolve icon size key to pixels. */
export function iconSizeToPx(key: IconSizeKey): number {
  return ICON_SIZE_MAP[key] ?? 30;
}
