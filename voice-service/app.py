import io
import os
import threading
import wave
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from huggingface_hub import hf_hub_download
from piper.voice import PiperVoice
from pydantic import BaseModel

APP_NAME = "GID Jarvis Voice"
MODEL_REPO = os.getenv("JARVIS_MODEL_REPO", "jgkawell/jarvis")
MODEL_FILE = os.getenv(
    "JARVIS_MODEL_FILE",
    "en/en_GB/jarvis/medium/jarvis-medium.onnx",
)
CONFIG_FILE = os.getenv(
    "JARVIS_CONFIG_FILE",
    "en/en_GB/jarvis/medium/jarvis-medium.onnx.json",
)
MODEL_DIR = Path(os.getenv("MODEL_DIR", "/models"))
SERVICE_SECRET = os.getenv("JARVIS_VOICE_SECRET", "")
MAX_CHARS = int(os.getenv("MAX_CHARS", "1800"))

app = FastAPI(title=APP_NAME)
voice = None
voice_lock = threading.Lock()


class SpeakRequest(BaseModel):
    text: str


def ensure_model():
    global voice
    if voice is not None:
        return voice

    with voice_lock:
        if voice is not None:
            return voice

        MODEL_DIR.mkdir(parents=True, exist_ok=True)

        model_path = hf_hub_download(
            repo_id=MODEL_REPO,
            filename=MODEL_FILE,
            local_dir=str(MODEL_DIR),
        )
        config_path = hf_hub_download(
            repo_id=MODEL_REPO,
            filename=CONFIG_FILE,
            local_dir=str(MODEL_DIR),
        )

        voice = PiperVoice.load(model_path, config_path)
        return voice


@app.on_event("startup")
def startup():
    # Warm model at container boot so first greeting is not a cold load.
    ensure_model()


@app.get("/health")
def health():
    v = ensure_model()
    return {
        "ok": True,
        "service": APP_NAME,
        "repo": MODEL_REPO,
        "model": MODEL_FILE,
        "sample_rate": getattr(getattr(v, "config", None), "sample_rate", None),
    }


@app.post("/speak")
def speak(payload: SpeakRequest, x_jarvis_secret: str | None = Header(default=None)):
    if SERVICE_SECRET and x_jarvis_secret != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid service secret.")

    text = " ".join((payload.text or "").strip().split())
    if not text:
        raise HTTPException(status_code=400, detail="No text supplied.")
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    v = ensure_model()
    buf = io.BytesIO()

    # Piper writes a normal WAV container.
    with wave.open(buf, "wb") as wav_file:
        v.synthesize(text, wav_file)

    audio = buf.getvalue()
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
            "X-GID-Voice": "community-piper-jarvis",
        },
    )
