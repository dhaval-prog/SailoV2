import * as THREE from "three";
import { throwFont, throwNightColor } from "./tokens.js";
import paperTextureAsset from "./paper-texture.jpg";
let cachedBase = null;
function loadBaseImage() {
  if (cachedBase) return Promise.resolve(cachedBase);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cachedBase = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = paperTextureAsset;
  });
}
function loadPhotoImage(uri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(uri)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = uri;
  });
}
const PHOTO_TOP = 16;
const PHOTO_RIGHT = 14;
const PHOTO_SIZE = 100;
const PHOTO_ROTATE_RAD = -4 * Math.PI / 180;
function drawPhoto(ctx, img, sx, sy, canvasWidth) {
  const scale = (sx + sy) / 2;
  const size = PHOTO_SIZE * scale;
  const pad = 6 * scale;
  const x = canvasWidth - PHOTO_RIGHT * sx - size;
  const y = PHOTO_TOP * sy;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(PHOTO_ROTATE_RAD);
  ctx.fillStyle = "#FBF6EC";
  ctx.fillRect(-size / 2 - pad, -size / 2 - pad, size + pad * 2, size + pad * 2);
  let sW = img.naturalWidth || img.width;
  let sH = img.naturalHeight || img.height;
  let sX0 = 0;
  let sY0 = 0;
  if (sW > sH) {
    sX0 = (sW - sH) / 2;
    sW = sH;
  } else if (sH > sW) {
    sY0 = (sH - sW) / 2;
    sH = sW;
  }
  ctx.drawImage(img, sX0, sY0, sW, sH, -size / 2, -size / 2, size, size);
  ctx.restore();
}
function drawContent(ctx, content, sx, sy, canvasWidth) {
  if (content.strokes && content.strokes.length > 0) {
    const scale = (sx + sy) / 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of content.strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(1, stroke.width * scale);
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        const x = p.x * sx;
        const y = p.y * sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  } else if (content.messageText) {
    const fontSize = Math.round(42 * sy);
    ctx.fillStyle = content.penColor;
    ctx.font = `${fontSize}px "${throwFont.hand500}"`;
    ctx.textBaseline = "top";
    const padX = 44 * sx;
    const padY = 44 * sy;
    const maxWidth = canvasWidth - padX * 2;
    const lineHeight = fontSize * 1.2;
    let y = padY;
    for (const paragraph of content.messageText.split("\n")) {
      const words = paragraph.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
          ctx.fillText(line, padX, y);
          line = word;
          y += lineHeight;
        } else {
          line = test;
        }
      }
      ctx.fillText(line, padX, y);
      y += lineHeight;
    }
  }
}
async function bakeLetterTexture(content, sourceSize) {
  const base = await loadBaseImage();
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth || base.width || 1024;
  canvas.height = base.naturalHeight || base.height || 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = content.isNight ? throwNightColor.planePaper : "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sx = sourceSize.width > 0 ? canvas.width / sourceSize.width : 1;
  const sy = sourceSize.height > 0 ? canvas.height / sourceSize.height : 1;
  const overlay = document.createElement("canvas");
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const octx = overlay.getContext("2d");
  drawContent(octx, content, sx, sy, overlay.width);
  if (content.photoUri) {
    try {
      const photo = await loadPhotoImage(content.photoUri);
      drawPhoto(octx, photo, sx, sy, overlay.width);
    } catch (err) {
      console.warn("[Throw] failed to load attached photo for the plane texture:", err);
    }
  }
  const half = { w: canvas.width / 2, h: canvas.height / 2 };
  const quadrants = [
    { x: 0, y: 0, w: canvas.width, h: canvas.height },
    // full-scale, natural position
    { x: half.w, y: 0, w: half.w, h: half.h },
    { x: 0, y: half.h, w: half.w, h: half.h },
    { x: half.w, y: half.h, w: half.w, h: half.h }
  ];
  for (const q of quadrants) {
    ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, q.x, q.y, q.w, q.h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
export {
  bakeLetterTexture
};
