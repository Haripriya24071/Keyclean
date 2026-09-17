import numpy as np
import librosa

def ensure_mono(audio: np.ndarray) -> np.ndarray:
    """
    Converts multi-channel (stereo) audio signal to a 1D mono float32 array.
    """
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim > 1:
        return np.mean(audio, axis=1)
    return audio

def normalize_audio(audio: np.ndarray, target_peak: float = 0.95) -> np.ndarray:
    """
    Normalizes a 1D float32 audio array to a target peak magnitude.
    """
    audio = np.nan_to_num(np.asarray(audio, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    max_val = np.max(np.abs(audio))
    if max_val > 1e-7:
        return audio * (target_peak / max_val)
    return audio

def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int = 16000) -> tuple[np.ndarray, int]:
    """
    Resamples a 1D audio array to target_sr Hz using librosa if sample rates differ.
    """
    audio = ensure_mono(audio)
    if orig_sr != target_sr and len(audio) > 0:
        resampled = librosa.resample(audio, orig_sr=orig_sr, target_sr=target_sr)
        return resampled.astype(np.float32), target_sr
    return audio, orig_sr
