import os
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from inference_sdk import InferenceHTTPClient

MODEL_ID = os.getenv("ROBOFLOW_MODEL_ID", "dection_fish-jcecx/1")
API_KEY = os.getenv("ROBOFLOW_API_KEY")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "https://ribirdchoi.github.io")
MAX_UPLOAD_BYTES = 8 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
CORS(app, resources={r"/infer": {"origins": [ALLOWED_ORIGIN, "http://localhost:8080"]}})


def jellyfish_result(result):
    predictions = result.get("predictions", []) if isinstance(result, dict) else []
    jellyfish_predictions = [
        item for item in predictions
        if "jelly" in str(item.get("class", "")).lower()
        or "해파리" in str(item.get("class", ""))
    ]
    confidence = max((float(item.get("confidence", 0)) for item in jellyfish_predictions), default=0)
    return {"is_jellyfish": bool(jellyfish_predictions), "confidence": confidence, "predictions": predictions, "model_id": MODEL_ID}


@app.get("/health")
def health():
    return jsonify({"ok": True, "model_id": MODEL_ID, "configured": bool(API_KEY)})


@app.post("/infer")
def infer():
    if not API_KEY:
        return jsonify({"error": "ROBOFLOW_API_KEY 환경 변수가 설정되지 않았습니다."}), 503
    image = request.files.get("image")
    if not image or not image.filename:
        return jsonify({"error": "image 파일을 첨부해 주세요."}), 400
    if image.mimetype and not image.mimetype.startswith("image/"):
        return jsonify({"error": "이미지 파일만 업로드할 수 있습니다."}), 400

    suffix = Path(image.filename).suffix or ".jpg"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            image.save(temp_path)
        client = InferenceHTTPClient(api_url="https://serverless.roboflow.com", api_key=API_KEY)
        result = client.infer(temp_path, model_id=MODEL_ID)
        return jsonify(jellyfish_result(result))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "이미지 파일은 8MB 이하만 업로드할 수 있습니다."}), 413
