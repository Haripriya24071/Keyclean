import os
import shutil
import numpy as np
import soundfile as sf
import librosa
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn

from src.detector import detect_keystrokes
from src.inpaint import inpaint_gaps
from demo.synth import generate_synthetic_data, save_wav
from demo.run_demo import load_wav, evaluate_detections

app = FastAPI(title="KeyClean API", description="Interactive Keystroke Noise Removal Dashboard API")

# Ensure folders exist
os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)

# Mount directories
app.mount("/data", StaticFiles(directory="data"), name="data")

SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
HAS_FFMPEG = shutil.which("ffmpeg") is not None

if not HAS_FFMPEG:
    print("[KeyClean Startup] WARNING: ffmpeg not detected in system PATH. MP3/M4A processing via pydub will require ffmpeg.")

def load_any_audio(filepath: str, ext: str):
    """
    Loads audio file (.wav, .mp3, .m4a, .flac, .ogg), converts to mono float32 
    normalized to [-1.0, 1.0], and resamples to 16kHz if necessary.
    """
    ext = ext.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported format '{ext}'. Supported formats: .wav, .mp3, .m4a, .flac, .ogg")

    data = None
    sr = None

    # Try soundfile first (works natively for WAV, FLAC, OGG, and modern libsndfile MP3)
    try:
        data, sr = sf.read(filepath, dtype="float32")
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)  # Convert stereo to mono
    except Exception as sf_err:
        # If soundfile fails, try pydub
        if not HAS_FFMPEG:
            raise ValueError(
                "ffmpeg is required to process MP3/M4A audio files on this system. "
                "Please install ffmpeg or upload a .wav, .flac, or .ogg file."
            ) from sf_err
        
        try:
            from pydub import AudioSegment
            sound = AudioSegment.from_file(filepath)
            sound = sound.set_channels(1)
            sr = sound.frame_rate
            raw_samples = np.array(sound.get_array_of_samples(), dtype=np.float32)
            
            if sound.sample_width == 2:
                data = raw_samples / 32768.0
            elif sound.sample_width == 4:
                data = raw_samples / 2147483648.0
            elif sound.sample_width == 1:
                data = (raw_samples - 128.0) / 128.0
            else:
                max_v = np.max(np.abs(raw_samples)) or 1.0
                data = raw_samples / max_v
        except Exception as pydub_err:
            raise ValueError(f"Could not decode audio file ({ext}): {str(pydub_err)}") from pydub_err

    # Resample to 16kHz if needed for consistent DSP analysis
    if sr != 16000 and len(data) > 0:
        data = librosa.resample(data, orig_sr=sr, target_sr=16000)
        sr = 16000

    return data, sr

def downsample_waveform(y: np.ndarray, target_points: int = 1000) -> list:
    """Downsample 1D numpy audio array y to ~target_points for canvas rendering."""
    if len(y) == 0:
        return []
    if len(y) <= target_points:
        return [float(v) for v in y]
    step = len(y) / target_points
    return [float(y[int(i * step)]) for i in range(target_points)]

@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = "static/index.html"
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found under static/")
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/synth")
async def run_synth(
    threshold: float = Form(12.0),
    low_threshold: float = Form(2.5),
    mode: str = Form("standard"),
    pre_pad_sec: float = Form(0.005),
    post_pad_sec: float = Form(0.015),
    rolling_window: int = Form(150)
):
    try:
        sr = 16000
        duration = 6.0
        num_clicks = 40
        
        # 1. Generate Voice and Clicks
        voice_ref, noisy, gt_times = generate_synthetic_data(sr, duration, num_clicks)
        
        # Save inputs
        save_wav("data/voice_only_reference.wav", voice_ref, sr)
        save_wav("data/noisy.wav", noisy, sr)
        
        # 2. Detect
        gaps, info = detect_keystrokes(
            noisy, sr, 
            threshold=threshold, 
            low_threshold=low_threshold,
            mode=mode,
            rolling_window=rolling_window, 
            pre_pad_sec=pre_pad_sec, 
            post_pad_sec=post_pad_sec
        )
        
        # 3. Evaluate results
        metrics = evaluate_detections(gaps, gt_times, sr)
        
        # 4. Inpaint noise
        cleaned = inpaint_gaps(noisy, gaps)
        save_wav("data/cleaned.wav", cleaned, sr)
        
        detected_gaps_sec = [{"start": float(start / sr), "end": float(end / sr)} for start, end in gaps]
        
        return JSONResponse(content={
            "metrics": {
                "tp": metrics["tp"],
                "fp": metrics["fp"],
                "fn": metrics["fn"],
                "precision": float(metrics["precision"]),
                "recall": float(metrics["recall"]),
                "f1": float(metrics["f1"]),
                "total_injected": num_clicks
            },
            "gt_times": gt_times.tolist(),
            "detected_gaps": detected_gaps_sec,
            "plot_data": {
                "times": info["frames_t"],
                "z_scores": info["z_scores"],
                "onset_strength": info["onset_strength"],
                "waveform": downsample_waveform(noisy, 1000)
            },
            "audio_urls": {
                "noisy": "/data/noisy.wav?t=" + str(np.random.randint(100000)),
                "cleaned": "/data/cleaned.wav?t=" + str(np.random.randint(100000)),
                "reference": "/data/voice_only_reference.wav?t=" + str(np.random.randint(100000))
            }
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clean")
async def clean_audio(
    file: UploadFile = File(...),
    threshold: float = Form(12.0),
    low_threshold: float = Form(2.5),
    mode: str = Form("standard"),
    pre_pad_sec: float = Form(0.005),
    post_pad_sec: float = Form(0.015),
    rolling_window: int = Form(150)
):
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ".wav"
    if not ext:
        ext = ".wav"

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported formats: .wav, .mp3, .m4a, .flac, .ogg"
        )
        
    upload_path = f"data/noisy_upload{ext}"
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        y, sr = load_any_audio(upload_path, ext)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading audio file: {str(e)}")

    # Always save a standard WAV version for frontend HTML5 <audio> player compatibility
    wav_upload_path = "data/noisy_upload.wav"
    save_wav(wav_upload_path, y, sr)

    try:
        # Detect clicks
        gaps, info = detect_keystrokes(
            y, sr, 
            threshold=threshold, 
            low_threshold=low_threshold,
            mode=mode,
            rolling_window=rolling_window, 
            pre_pad_sec=pre_pad_sec, 
            post_pad_sec=post_pad_sec
        )
        
        # Clean audio
        cleaned = inpaint_gaps(y, gaps)
        
        # Save output as WAV
        cleaned_path = "data/cleaned_upload.wav"
        save_wav(cleaned_path, cleaned, sr)
        
        detected_gaps_sec = [{"start": float(start / sr), "end": float(end / sr)} for start, end in gaps]
        
        return JSONResponse(content={
            "detected_gaps": detected_gaps_sec,
            "count": len(gaps),
            "plot_data": {
                "times": info["frames_t"],
                "z_scores": info["z_scores"],
                "onset_strength": info["onset_strength"],
                "waveform": downsample_waveform(y, 1000)
            },
            "audio_urls": {
                "noisy": "/data/noisy_upload.wav?t=" + str(np.random.randint(100000)),
                "cleaned": "/data/cleaned_upload.wav?t=" + str(np.random.randint(100000))
            }
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel
from typing import List, Optional

class PCMRecordRequest(BaseModel):
    pcm: List[float]
    sr: Optional[int] = 16000
    threshold: Optional[float] = 12.0
    low_threshold: Optional[float] = 2.5
    mode: Optional[str] = "standard"
    pre_pad_sec: Optional[float] = 0.005
    post_pad_sec: Optional[float] = 0.015
    rolling_window: Optional[int] = 150

@app.post("/api/record")
async def record_audio(req: PCMRecordRequest):
    try:
        y = np.array(req.pcm, dtype=np.float32)
        sr = req.sr or 16000
        
        # Save raw recording
        save_wav("data/recorded_noisy.wav", y, sr)
        
        # Detect clicks
        gaps, info = detect_keystrokes(
            y, sr, 
            threshold=req.threshold, 
            low_threshold=req.low_threshold,
            mode=req.mode,
            rolling_window=req.rolling_window, 
            pre_pad_sec=req.pre_pad_sec, 
            post_pad_sec=req.post_pad_sec
        )
        
        # Clean audio
        cleaned = inpaint_gaps(y, gaps)
        
        # Save output
        save_wav("data/recorded_cleaned.wav", cleaned, sr)
        
        detected_gaps_sec = [{"start": float(start / sr), "end": float(end / sr)} for start, end in gaps]
        
        return JSONResponse(content={
            "detected_gaps": detected_gaps_sec,
            "count": len(gaps),
            "plot_data": {
                "times": info["frames_t"],
                "z_scores": info["z_scores"],
                "onset_strength": info["onset_strength"],
                "waveform": downsample_waveform(y, 1000)
            },
            "audio_urls": {
                "noisy": "/data/recorded_noisy.wav?t=" + str(np.random.randint(100000)),
                "cleaned": "/data/recorded_cleaned.wav?t=" + str(np.random.randint(100000))
            }
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static folder for CSS, JS assets. 
# We mount it AFTER root endpoint definition so that app.get("/") overrides any static/index.html.
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
