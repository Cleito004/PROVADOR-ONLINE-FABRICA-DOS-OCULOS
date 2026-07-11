"""
OpenCV Backend - Análise de Screenshots do Provador Virtual
Endpoint Flask para análise de imagens capturadas pelo site.
Usa Haar Cascades + DNN SSD para detecção facial (OpenCV 4.x).
"""

import cv2
import numpy as np
import base64
import os
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── Haar Cascades pré-carregados ────────────────────────────────────────
FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
EYE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
SMILE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_smile.xml')

# ─── DNN SSD Face Detector (mais robusto que Haar) ──────────────────────
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
DNN_PROTOTXT = os.path.join(MODEL_DIR, 'deploy.prototxt')
DNN_CAFFEMODEL = os.path.join(MODEL_DIR, 'res10_300x300_ssd_iter_140000.caffemodel')

dnn_net = None
if os.path.exists(DNN_PROTOTXT) and os.path.exists(DNN_CAFFEMODEL):
    try:
        dnn_net = cv2.dnn.readNetFromCaffe(DNN_PROTOTXT, DNN_CAFFEMODEL)
        print("[OpenCV Backend] DNN SSD face detector carregado")
    except Exception as e:
        print(f"[OpenCV Backend] Falha ao carregar DNN: {e}")

# ─── Glasses style configs ──────────────────────────────────────────────
GLASSES_STYLES = {
    "round":   {"min_face_ratio": 0.8, "ideal_ratio": 1.0, "desc": "Redondo"},
    "square":  {"min_face_ratio": 0.85, "ideal_ratio": 1.05, "desc": "Quadrado"},
    "aviator": {"min_face_ratio": 0.9, "ideal_ratio": 1.1, "desc": "Aviador"},
    "cateye":  {"min_face_ratio": 0.75, "ideal_ratio": 0.95, "desc": "Gatinho"},
    "sport":   {"min_face_ratio": 0.85, "ideal_ratio": 1.0, "desc": "Esportivo"},
}


def decode_image(data_url):
    """Decodifica imagem base64 (data URL ou puro base64) para OpenCV array."""
    if ',' in data_url:
        data_url = data_url.split(',')[1]
    img_bytes = base64.b64decode(data_url)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return img


def detect_faces_dnn(img):
    """Detecta rostos usando DNN SSD (mais preciso que Haar)."""
    h, w = img.shape[:2]
    blob = cv2.dnn.blobFromImage(cv2.resize(img, (300, 300)), 1.0,
                                 (300, 300), (104.0, 177.0, 123.0))
    dnn_net.setInput(blob)
    detections = dnn_net.forward()

    faces = []
    for i in range(detections.shape[2]):
        confidence = detections[0, 0, i, 2]
        if confidence > 0.5:
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            x1, y1, x2, y2 = box.astype("int")
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            fw, fh = x2 - x1, y2 - y1
            if fw > 10 and fh > 10:
                faces.append((x1, y1, fw, fh, float(confidence)))
    return faces


def detect_faces_haar(gray):
    """Fallback: detecta rostos usando Haar Cascade."""
    faces_raw = FACE_CASCADE.detectMultiScale(gray, 1.3, 5)
    return [(x, y, w, h, 0.9) for (x, y, w, h) in faces_raw]


def detect_faces(img):
    """Detecta rostos usando DNN (preferido) ou Haar (fallback)."""
    if dnn_net is not None:
        return detect_faces_dnn(img)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return detect_faces_haar(gray)


def analyze_skin_tone(img, face_region=None):
    """Analisa o tom de pele na região do rosto."""
    if face_region is not None:
        x, y, w, h = face_region[:4]
        x, y = max(0, x), max(0, y)
        roi = img[y:y+h, x:x+w]
    else:
        roi = img

    if roi.size == 0:
        return {"hue": 0, "saturation": 0, "brightness": 0, "classification": "desconhecido"}

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    h_mean = float(np.mean(hsv[:,:,0]))
    s_mean = float(np.mean(hsv[:,:,1]))
    v_mean = float(np.mean(hsv[:,:,2]))

    if h_mean < 15 or h_mean > 165:
        tone = "claro"
    elif s_mean < 60:
        tone = "neutro"
    else:
        tone = "moreno"

    return {
        "hue": round(h_mean, 1),
        "saturation": round(s_mean, 1),
        "brightness": round(v_mean, 1),
        "classification": tone
    }


def analyze_lighting(img):
    """Analisa as condições de iluminação da imagem."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    if brightness < 80:
        condition = "escuro"
    elif brightness > 180:
        condition = "claro demais"
    else:
        condition = "bom"

    return {
        "brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "condition": condition
    }


def analyze_face_orientation(img, face_rect):
    """Estima a orientação do rosto."""
    x, y, w, h = face_rect[:4]
    img_h, img_w = img.shape[:2]

    center_x = (x + w / 2) / img_w
    center_y = (y + h / 2) / img_h

    horizontal = "esquerda" if center_x < 0.35 else ("direita" if center_x > 0.65 else "centro")
    vertical = "cima" if center_y < 0.35 else ("baixo" if center_y > 0.65 else "centro")

    return {
        "horizontal": horizontal,
        "vertical": vertical,
        "center_x_pct": round(center_x * 100, 1),
        "center_y_pct": round(center_y * 100, 1)
    }


def estimate_face_shape(face_w, face_h):
    """Estima o formato do rosto baseado nas proporções."""
    ratio = face_h / face_w if face_w > 0 else 1.0

    if ratio > 1.2:
        return "longo"
    elif ratio > 1.05:
        return "oval"
    elif ratio < 0.85:
        return "redondo"
    elif ratio < 0.95:
        return "quadrado"
    else:
        return "coracao"


def analyze_glasses_fit(face_shape, face_w, face_h, img_w, img_h):
    """Recomenda estilos de óculos baseado no formato do rosto."""
    recommendations = []
    ratio = face_h / face_w if face_w > 0 else 1.0

    style_scores = {}

    if face_shape == "redondo":
        style_scores = {"square": 0.9, "aviator": 0.85, "cateye": 0.7, "round": 0.5, "sport": 0.6}
    elif face_shape == "oval":
        style_scores = {"round": 0.9, "square": 0.85, "aviator": 0.8, "cateye": 0.75, "sport": 0.7}
    elif face_shape == "longo":
        style_scores = {"aviator": 0.9, "square": 0.85, "round": 0.8, "sport": 0.75, "cateye": 0.6}
    elif face_shape == "quadrado":
        style_scores = {"round": 0.9, "aviator": 0.85, "cateye": 0.8, "square": 0.5, "sport": 0.6}
    elif face_shape == "coracao":
        style_scores = {"aviator": 0.9, "round": 0.85, "cateye": 0.8, "square": 0.7, "sport": 0.65}
    else:
        style_scores = {"round": 0.8, "square": 0.8, "aviator": 0.8, "cateye": 0.8, "sport": 0.8}

    sorted_styles = sorted(style_scores.items(), key=lambda x: x[1], reverse=True)

    for style, score in sorted_styles:
        recommendations.append({
            "style": style,
            "description": GLASSES_STYLES[style]["desc"],
            "score": round(score * 100),
            "match": "excelente" if score >= 0.85 else ("bom" if score >= 0.7 else "regular")
        })

    return recommendations


def detect_faces_and_features(img):
    """Detecta rostos, olhos e sorriso na imagem."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    faces = detect_faces(img)

    results = []
    for face_data in faces:
        x, y, w, h = face_data[:4]
        confidence = face_data[4] if len(face_data) > 4 else 0.9

        face_info = {
            "position": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
            "center": {"x": int(x + w/2), "y": int(y + h/2)},
            "size_ratio": round(float(w * h) / (img.shape[0] * img.shape[1]), 4),
            "aspect_ratio": round(float(h) / w, 2) if w > 0 else 1.0,
            "confidence": round(confidence, 3),
            "eyes_detected": 0,
            "smile_detected": False,
            "orientation": None,
            "skin_tone": None,
            "face_shape": None,
            "glasses_fit": None
        }

        roi_gray = gray[y:y+h, x:x+w]

        eyes = EYE_CASCADE.detectMultiScale(roi_gray)
        face_info["eyes_detected"] = len(eyes)

        if len(eyes) >= 2:
            eye_centers = [(int(ex + ew/2), int(ey + eh/2)) for (ex, ey, ew, eh) in eyes[:2]]
            face_info["eye_distance"] = int(abs(eye_centers[0][0] - eye_centers[1][0]))

        smiles = SMILE_CASCADE.detectMultiScale(roi_gray, 1.7, 20)
        face_info["smile_detected"] = len(smiles) > 0

        face_info["orientation"] = analyze_face_orientation(img, (x, y, w, h))
        face_info["skin_tone"] = analyze_skin_tone(img, (x, y, w, h))

        face_info["face_shape"] = estimate_face_shape(w, h)
        face_info["glasses_fit"] = analyze_glasses_fit(
            face_info["face_shape"], w, h, img.shape[1], img.shape[0]
        )

        results.append(face_info)

    return {
        "faces_count": len(results),
        "faces": results,
        "detector": "dnn" if dnn_net else "haar"
    }


def analyze_glasses_position(img, face_data):
    """Analisa se os óculos estão posicionados corretamente e gera recomendações."""
    recommendations = []

    for face in face_data.get("faces", []):
        size = face["size_ratio"]
        if size < 0.03:
            recommendations.append({
                "type": "warning",
                "message": "Rosto muito pequeno. Aproxime-se da câmera."
            })
        elif size > 0.3:
            recommendations.append({
                "type": "warning",
                "message": "Rosto muito grande. Afaste-se da câmera."
            })
        else:
            recommendations.append({
                "type": "success",
                "message": f"Tamanho do rosto adequado ({size*100:.1f}% da imagem)."
            })

        orient = face.get("orientation", {})
        if orient.get("horizontal") != "centro":
            recommendations.append({
                "type": "info",
                "message": f"Rosto inclinado para {orient['horizontal']}. Centralize o rosto."
            })

        if orient.get("vertical") == "baixo":
            recommendations.append({
                "type": "info",
                "message": "Cabeça abaixada. Levante levemente para melhor encaixe dos óculos."
            })

        if face.get("eyes_detected", 0) < 2:
            recommendations.append({
                "type": "warning",
                "message": "Olhos não detectados claramente. Olhe diretamente para a câmera."
            })
        else:
            recommendations.append({
                "type": "success",
                "message": f"{face['eyes_detected']} olho(s) detectado(s). Posicionamento OK."
            })

        if face.get("smile_detected"):
            recommendations.append({
                "type": "success",
                "message": "Sorriso detectado! Óculos combinam bem com um sorriso."
            })

        skin = face.get("skin_tone", {})
        if skin.get("brightness", 128) < 60:
            recommendations.append({
                "type": "info",
                "message": "Iluminação fraca no rosto. Melhore a iluminação."
            })

        face_shape = face.get("face_shape", "desconhecido")
        fit = face.get("glasses_fit", [])
        if fit:
            best = fit[0]
            recommendations.append({
                "type": "success",
                "message": f"Formato: {face_shape}. Melhor estilo: {best['description']} ({best['score']}% match)."
            })

    if face_data.get("faces_count", 0) == 0:
        recommendations.append({
            "type": "error",
            "message": "Nenhum rosto detectado. Posicione o rosto na frente da câmera."
        })

    return recommendations


@app.route('/api/analyze', methods=['POST'])
def analyze_screenshot():
    """Endpoint principal: recebe screenshot e retorna análise completa."""
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({"error": "Nenhuma imagem fornecida"}), 400

        img = decode_image(data['image'])
        if img is None:
            return jsonify({"error": "Falha ao decodificar imagem"}), 400

        face_data = detect_faces_and_features(img)
        lighting = analyze_lighting(img)
        recommendations = analyze_glasses_position(img, face_data)

        return jsonify({
            "success": True,
            "image_size": {
                "width": img.shape[1],
                "height": img.shape[0]
            },
            "faces": face_data,
            "lighting": lighting,
            "recommendations": recommendations
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Verifica se o serviço está rodando."""
    return jsonify({
        "status": "ok",
        "opencv_version": cv2.__version__,
        "dnn_loaded": dnn_net is not None,
        "service": "OpenCV Screenshot Analyzer"
    })


if __name__ == '__main__':
    print("[OpenCV Backend] Iniciando servidor na porta 5050...")
    print(f"[OpenCV Backend] OpenCV {cv2.__version__} carregado")
    print(f"[OpenCV Backend] Detector: {'DNN SSD' if dnn_net else 'Haar Cascade'}")
    print("[OpenCV Backend] Haar Cascades: face, olhos, sorriso prontos")
    app.run(host='0.0.0.0', port=5050, debug=False)
