/**
 * OpenCV Browser Integration Module
 * Provides hand contour analysis, HSV color processing,
 * image enhancement, and edge detection.
 */

export class OpenCVProcessor {
  constructor() {
    this.ready = false;
    this.cv = null;
    this._handCanvas = null;
    this._handCtx = null;
    this._prevHandFrame = null;
  }

  async init() {
    if (this.ready) return true;
    try {
      if (typeof cv !== 'undefined') {
        this.cv = cv;
        this.ready = true;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  _ensureCanvas(w, h) {
    if (!this._handCanvas) {
      this._handCanvas = document.createElement('canvas');
      this._handCtx = this._handCanvas.getContext('2d', { willReadFrequently: true });
    }
    this._handCanvas.width = w;
    this._handCanvas.height = h;
    return this._handCanvas;
  }

  /**
   * Analyze hand openness using contour analysis.
   * Returns { isOpen, contourArea, hullArea, ratio, solidity }
   */
  analyzeHandOpenness(videoElement, handBbox) {
    if (!this.ready || !this.cv || !videoElement) {
      return { isOpen: null, contourArea: 0, hullArea: 0, ratio: 0, solidity: 0 };
    }

    try {
      const vw = videoElement.videoWidth || 640;
      const vh = videoElement.videoHeight || 480;
      const canvas = this._ensureCanvas(vw, vh);
      const ctx = this._handCtx;
      ctx.drawImage(videoElement, 0, 0, vw, vh);

      let x = 0, y = 0, w = vw, h = vh;
      if (handBbox) {
        x = Math.max(0, Math.floor(handBbox.x * vw));
        y = Math.max(0, Math.floor(handBbox.y * vh));
        w = Math.min(vw - x, Math.floor(handBbox.w * vw));
        h = Math.min(vh - y, Math.floor(handBbox.h * vh));
        if (w < 20 || h < 20) return { isOpen: null, contourArea: 0, hullArea: 0, ratio: 0, solidity: 0 };
      }

      const imgData = ctx.getImageData(x, y, w, h);
      const mat = this.cv.matFromImageData(imgData);
      const gray = new this.cv.Mat();
      this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY);
      this.cv.threshold(gray, gray, 40, 255, this.cv.THRESH_BINARY_INV);

      const contours = new this.cv.MatVector();
      const hierarchy = new this.cv.Mat();
      this.cv.findContours(gray, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let maxIdx = -1;
      for (let i = 0; i < contours.size(); i++) {
        const area = this.cv.contourArea(contours.get(i));
        if (area > maxArea) { maxArea = area; maxIdx = i; }
      }

      let result = { isOpen: null, contourArea: 0, hullArea: 0, ratio: 0, solidity: 0 };

      if (maxIdx >= 0 && maxArea > 500) {
        const handContour = contours.get(maxIdx);
        const contourArea = maxArea;

        const hull = new this.cv.Mat();
        this.cv.convexHull(handContour, hull);
        const hullArea = this.cv.contourArea(hull);

        const solidity = hullArea > 0 ? contourArea / hullArea : 0;
        const isOpen = solidity > 0.6;

        result = { isOpen, contourArea, hullArea, ratio: contourArea / (w * h), solidity };

        hull.delete();
        handContour.delete();
      }

      mat.delete();
      gray.delete();
      contours.delete();
      hierarchy.delete();

      return result;
    } catch (e) {
      return { isOpen: null, contourArea: 0, hullArea: 0, ratio: 0, solidity: 0 };
    }
  }

  /**
   * Get HSV color at a normalized X position from the video frame.
   * Used for color strip position mapping.
   */
  getColorAtPosition(videoElement, xNorm) {
    if (!this.ready || !this.cv || !videoElement) return null;

    try {
      const vw = videoElement.videoWidth || 640;
      const vh = videoElement.videoHeight || 480;
      const canvas = this._ensureCanvas(vw, vh);
      const ctx = this._handCtx;
      ctx.drawImage(videoElement, 0, 0, vw, vh);

      const px = Math.floor(xNorm * vw);
      const py = Math.floor(vh / 2);
      const sampleSize = 5;
      const sx = Math.max(0, px - sampleSize);
      const sy = Math.max(0, py - sampleSize);
      const sw = Math.min(vw - sx, sampleSize * 2);
      const sh = Math.min(vh - sy, sampleSize * 2);
      if (sw <= 0 || sh <= 0) return null;

      const imgData = ctx.getImageData(sx, sy, sw, sh);
      const mat = this.cv.matFromImageData(imgData);
      const hsv = new this.cv.Mat();
      this.cv.cvtColor(mat, hsv, this.cv.COLOR_RGBA2HSV);

      let hSum = 0, sSum = 0, vSum = 0, count = 0;
      for (let r = 0; r < hsv.rows; r++) {
        for (let c = 0; c < hsv.cols; c++) {
          const pixel = hsv.ucharAt(r, c * 3);
          hSum += hsv.ucharAt(r, c * 3);
          sSum += hsv.ucharAt(r, c * 3 + 1);
          vSum += hsv.ucharAt(r, c * 3 + 2);
          count++;
        }
      }

      mat.delete();
      hsv.delete();

      if (count === 0) return null;
      return { h: hSum / count, s: sSum / count, v: vSum / count };
    } catch {
      return null;
    }
  }

  /**
   * Detect edges using Canny edge detection.
   * Returns edge intensity (0-1) for the given region.
   */
  detectEdges(videoElement, region) {
    if (!this.ready || !this.cv || !videoElement) return 0;

    try {
      const vw = videoElement.videoWidth || 640;
      const vh = videoElement.videoHeight || 480;
      const canvas = this._ensureCanvas(vw, vh);
      const ctx = this._handCtx;
      ctx.drawImage(videoElement, 0, 0, vw, vh);

      let x = 0, y = 0, w = vw, h = vh;
      if (region) {
        x = Math.max(0, Math.floor(region.x * vw));
        y = Math.max(0, Math.floor(region.y * vh));
        w = Math.min(vw - x, Math.floor(region.w * vw));
        h = Math.min(vh - y, Math.floor(region.h * vh));
        if (w < 10 || h < 10) return 0;
      }

      const imgData = ctx.getImageData(x, y, w, h);
      const mat = this.cv.matFromImageData(imgData);
      const gray = new this.cv.Mat();
      this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY);
      this.cv.GaussianBlur(gray, gray, new this.cv.Size(5, 5), 0);

      const edges = new this.cv.Mat();
      this.cv.Canny(gray, edges, 50, 150);

      let nonZero = 0;
      const totalPixels = edges.rows * edges.cols;
      nonZero = this.cv.countNonZero(edges);

      const intensity = totalPixels > 0 ? nonZero / totalPixels : 0;

      mat.delete();
      gray.delete();
      edges.delete();

      return intensity;
    } catch {
      return 0;
    }
  }

  /**
   * Process image: brightness, contrast, saturation, sharpen.
   * Returns a processed ImageData.
   */
  processImage(videoElement, options = {}) {
    const { brightness = 0, contrast = 0, saturation = 1.0, sharpen = 0 } = options;
    if (!this.ready || !this.cv || !videoElement) return null;

    try {
      const vw = videoElement.videoWidth || 640;
      const vh = videoElement.videoHeight || 480;
      const canvas = this._ensureCanvas(vw, vh);
      const ctx = this._handCtx;
      ctx.drawImage(videoElement, 0, 0, vw, vh);

      const imgData = ctx.getImageData(0, 0, vw, vh);
      const mat = this.cv.matFromImageData(imgData);

      if (brightness !== 0) {
        const scalar = new this.cv.Mat(mat.rows, mat.cols, mat.type(), [brightness * 255, brightness * 255, brightness * 255, 0]);
        this.cv.add(mat, scalar, mat);
        scalar.delete();
      }

      if (contrast !== 0) {
        const alpha = 1 + contrast;
        const beta = -contrast * 128;
        mat.convertTo(mat, -1, alpha, beta);
      }

      const result = new ImageData(new Uint8ClampedArray(mat.data), vw, vh);
      mat.delete();
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Skin detection in HSV space for hand region isolation.
   * Returns a binary mask Mat (caller must delete).
   */
  detectSkin(videoElement, region) {
    if (!this.ready || !this.cv || !videoElement) return null;

    try {
      const vw = videoElement.videoWidth || 640;
      const vh = videoElement.videoHeight || 480;
      const canvas = this._ensureCanvas(vw, vh);
      const ctx = this._handCtx;
      ctx.drawImage(videoElement, 0, 0, vw, vh);

      let x = 0, y = 0, w = vw, h = vh;
      if (region) {
        x = Math.max(0, Math.floor(region.x * vw));
        y = Math.max(0, Math.floor(region.y * vh));
        w = Math.min(vw - x, Math.floor(region.w * vw));
        h = Math.min(vh - y, Math.floor(region.h * vh));
        if (w < 10 || h < 10) return null;
      }

      const imgData = ctx.getImageData(x, y, w, h);
      const mat = this.cv.matFromImageData(imgData);
      const hsv = new this.cv.Mat();
      this.cv.cvtColor(mat, hsv, this.cv.COLOR_RGBA2HSV);

      const mask = new this.cv.Mat();
      const lower = new this.cv.Mat(h, w, hsv.type(), [0, 20, 70, 0]);
      const upper = new this.cv.Mat(h, w, hsv.type(), [50, 255, 255, 255]);
      this.cv.inRange(hsv, lower, upper, mask);

      mat.delete();
      hsv.delete();
      lower.delete();
      upper.delete();

      return mask;
    } catch {
      return null;
    }
  }

  destroy() {
    this._handCanvas = null;
    this._handCtx = null;
    this._prevHandFrame = null;
    this.ready = false;
  }
}
