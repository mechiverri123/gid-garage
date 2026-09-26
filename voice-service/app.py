import io
import os
import threading
import wave
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from huggingface_hub import hf_hub_download
from piper import PiperVoice, SynthesisConfig
from pydantic import BaseModel

APP_NAME = "GID Jarvis Voice"

MODEL_REPO = os.getenv("JARVIS_MODEL_REPO", "jgkawell/jarvis")
MODEL_REVISION = os.getenv(
    "JARVIS_MODEL_REVISION",
    "04a96f92731d73cad3b6026ec5f839afa90f8cd9",
)
MODEL_FILE = os.getenv(
    "JARVIS_MODEL_FILE",
    "en/en_GB/jarvismk1/medium/en_GB-jarvis-medium.onnx",
)
CONFIG_FILE = os.getenv(
    "JARVIS_CONFIG_FILE",
    "en/en_GB/jarvismk1/medium/en_GB-jarvis-medium.onnx.json",
)

MODEL_DIR = Path(os.getenv("MODEL_DIR", "/models"))
SERVICE_SECRET = os.getenv("JARVIS_VOICE_SECRET", "")
MAX_CHARS = int(os.getenv("MAX_CHARS", "1800"))

# Higher = slower in Piper.
# MK1's own model config uses 1.15.
LENGTH_SCALE = float(os.getenv("JARVIS_LENGTH_SCALE", "1.35"))

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
            revision=MODEL_REVISION,
            filename=MODEL_FILE,
            local_dir=str(MODEL_DIR),
        )

        config_path = hf_hub_download(
            repo_id=MODEL_REPO,
            revision=MODEL_REVISION,
            filename=CONFIG_FILE,
            local_dir=str(MODEL_DIR),
        )

        # piper-tts 1.3.x API
        voice = PiperVoice.load(
            model_path,
            config_path=config_path,
        )
        return voice


@app.on_event("startup")
def startup():
    # Warm model on Railway startup.
    ensure_model()


@app.get("/health")
def health():
    v = ensure_model()

    return {
        "ok": True,
        "service": APP_NAME,
        "repo": MODEL_REPO,
        "revision": MODEL_REVISION,
        "model": MODEL_FILE,
        "length_scale": LENGTH_SCALE,
        "sample_rate": getattr(getattr(v, "config", None), "sample_rate", None),
        "piper_api": "1.3.x synthesize_wav",
    }


@app.post("/speak")
def speak(
    payload: SpeakRequest,
    x_jarvis_secret: str | None = Header(default=None),
):
    if SERVICE_SECRET and x_jarvis_secret != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid service secret.")

    text = " ".join((payload.text or "").strip().split())

    if not text:
        raise HTTPException(status_code=400, detail="No text supplied.")

    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    try:
        v = ensure_model()

        syn_config = SynthesisConfig(
            length_scale=LENGTH_SCALE,
        )

        buf = io.BytesIO()

        with wave.open(buf, "wb") as wav_file:
            # IMPORTANT:
            # piper-tts 1.3.x uses synthesize_wav(..., syn_config=...).
            # The previous service used the older Piper API signature:
            # voice.synthesize(text, wav_file, length_scale=...)
            # which can load successfully for /health but fail when /speak runs.
            v.synthesize_wav(
                text,
                wav_file,
                syn_config=syn_config,
            )

        audio = buf.getvalue()

        if len(audio) <= 44:
            raise RuntimeError("Piper returned an empty WAV.")

        return Response(
            content=audio,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-GID-Voice": "community-piper-jarvis-mk1",
                "X-GID-Model": "jarvismk1-medium",
            },
        )

    except HTTPException:
        raise
    except Exception as exc:
        # Expose the actual Railway synthesis error while debugging.
        raise HTTPException(
            status_code=500,
            detail=f"Piper synthesis failed: {type(exc).__name__}: {exc}",
        ) from exc
