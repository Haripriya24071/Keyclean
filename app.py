import os
import shutil
import numpy as np
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
                "onset_strength": info["onset_strength"]
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
    # Validate WAV file extension
    if not file.filename.endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only standard WAV files (.wav) are supported.")
        
    upload_path = "data/noisy_upload.wav"
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        y, sr = load_wav(upload_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading WAV file: {str(e)}")
        
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
        
        # Save output
        cleaned_path = "data/cleaned_upload.wav"
        save_wav(cleaned_path, cleaned, sr)
        
        detected_gaps_sec = [{"start": float(start / sr), "end": float(end / sr)} for start, end in gaps]
        
        return JSONResponse(content={
            "detected_gaps": detected_gaps_sec,
            "count": len(gaps),
            "plot_data": {
                "times": info["frames_t"],
                "z_scores": info["z_scores"]
            },
            "audio_urls": {
                "noisy": "/data/noisy_upload.wav?t=" + str(np.random.randint(100000)),
                "cleaned": "/data/cleaned_upload.wav?t=" + str(np.random.randint(100000))
            }
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static folder for CSS, JS assets. 
# We mount it AFTER root endpoint definition so that app.get("/") overrides any static/index.html.
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
