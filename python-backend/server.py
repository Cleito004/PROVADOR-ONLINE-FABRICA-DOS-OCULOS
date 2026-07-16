import asyncio
import base64
import json
import time
from io import BytesIO
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Provador Virtual - OpenCV Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frame_counter = 0
last_process_time = time.time()


def decode_image(b64_data: str) -> Optional[np.ndarray]:
    try:
        if "," in b64_data:
            b64_data = b64_data.split(",")[1]
        img_bytes = base64.b64decode(b64_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def detect_hand_contour(img: np.ndarray) -> dict:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 40, 255, cv2.THRESH_BINARY_INV)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return {"detected": False, "area": 0, "solidity": 0, "isOpen": None}

    max_contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(max_contour)

    if area < 500:
        return {"detected": False, "area": area, "solidity": 0, "isOpen": None}

    hull = cv2.convexHull(max_contour)
    hull_area = cv2.contourArea(hull)
    solidity = area / hull_area if hull_area > 0 else 0

    hull_indices = cv2.convexHull(max_contour, returnPoints=False)
    if len(hull_indices) > 3 and len(max_contour) > 3:
        defects = cv2.convexityDefects(max_contour, hull_indices)
        finger_count = 0
        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                if d > 10000:
                    finger_count += 1
        is_open = finger_count >= 2
    else:
        is_open = solidity > 0.6

    return {
        "detected": True,
        "area": float(area),
        "solidity": float(solidity),
        "isOpen": is_open,
        "hullArea": float(hull_area),
    }


def analyze_skin_color(img: np.ndarray) -> dict:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_skin = np.array([0, 20, 70], dtype=np.uint8)
    upper_skin = np.array([50, 255, 255], dtype=np.uint8)
    mask = cv2.inRange(hsv, lower_skin, upper_skin)

    skin_pixels = cv2.countNonZero(mask)
    total_pixels = img.shape[0] * img.shape[1]
    coverage = skin_pixels / total_pixels if total_pixels > 0 else 0

    return {
        "skinCoverage": float(coverage),
        "meanH": float(np.mean(hsv[:, :, 0][mask > 0])) if skin_pixels > 0 else 0,
        "meanS": float(np.mean(hsv[:, :, 1][mask > 0])) if skin_pixels > 0 else 0,
        "meanV": float(np.mean(hsv[:, :, 2][mask > 0])) if skin_pixels > 0 else 0,
    }


def detect_edges(img: np.ndarray) -> dict:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edge_density = cv2.countNonZero(edges) / (edges.shape[0] * edges.shape[1])
    return {"edgeDensity": float(edge_density)}


def enhance_frame(img: np.ndarray, brightness=0, contrast=0) -> np.ndarray:
    if brightness != 0:
        img = cv2.convertScaleAbs(img, alpha=1, beta=brightness * 255)
    if contrast != 0:
        alpha = 1.0 + contrast
        img = cv2.convertScaleAbs(img, alpha=alpha, beta=0)
    return img


def process_frame(img: np.ndarray) -> dict:
    hand = detect_hand_contour(img)
    skin = analyze_skin_color(img)
    edges = detect_edges(img)
    return {
        "hand": hand,
        "skin": skin,
        "edges": edges,
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "opencv_version": cv2.__version__,
        "timestamp": time.time(),
    }


@app.post("/api/analyze")
async def analyze_frame(data: dict):
    global frame_counter, last_process_time
    frame_counter += 1

    image_data = data.get("image", "")
    if not image_data:
        return {"success": False, "error": "No image data"}

    img = decode_image(image_data)
    if img is None:
        return {"success": False, "error": "Failed to decode image"}

    result = process_frame(img)

    last_process_time = time.time()

    return {
        "success": True,
        "frame": frame_counter,
        **result,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "frame":
                image_data = msg.get("image", "")
                if image_data:
                    img = decode_image(image_data)
                    if img is not None:
                        result = process_frame(img)
                        await websocket.send_json({
                            "type": "frame-result",
                            "frame": msg.get("frame", 0),
                            **result,
                        })
                    else:
                        await websocket.send_json({
                            "type": "frame-result",
                            "error": "Failed to decode",
                        })

            elif msg.get("type") == "hand-analyze":
                image_data = msg.get("image", "")
                bbox = msg.get("bbox")
                if image_data:
                    img = decode_image(image_data)
                    if img is not None:
                        hand = detect_hand_contour(img)
                        await websocket.send_json({
                            "type": "hand-result",
                            **hand,
                        })

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050)
