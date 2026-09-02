import os
import numpy as np
import scipy.io.wavfile as wav

def generate_synthetic_data(sr=16000, duration=6.0, num_clicks=40):
    """
    Generates synthetic speech-like audio and injects click noises (keystrokes)
    at known timestamps for benchmark evaluation.
    
    Parameters:
    ----------
    sr : int
        Sample rate in Hz.
    duration : float
        Audio duration in seconds.
    num_clicks : int
        Number of click transients to inject.
        
    Returns:
    -------
    voice_only : np.ndarray
        Clean voice synthetic signal.
    noisy : np.ndarray
        Signal with injected click transients.
    click_times : np.ndarray
        Ground-truth click timestamps (in seconds).
    """
    n_samples = int(duration * sr)
    t = np.arange(n_samples) / sr
    
    # 1. Synthesize Speech-Like Sound (Formant synthesis)
    # Pitch modulation (Fundamental Frequency f0 modulated around 130Hz)
    f0_base = 130.0
    mod_freq = 1.5
    mod_amp = 10.0
    # Phase = integral of frequency
    phi = 2 * np.pi * (f0_base * t + (mod_amp / (2 * np.pi * mod_freq)) * np.sin(2 * np.pi * mod_freq * t))
    
    # Vowel syllable envelope (modulating overall volume)
    vowel_env = 0.3 + 0.7 * (0.5 * np.sin(2 * np.pi * 0.8 * t) + 0.5 * np.sin(2 * np.pi * 2.2 * t + 1))
    
    # Synthesize harmonics and apply Format shape
    # Formants: F1=600Hz (width 80), F2=1600Hz (width 120), F3=2600Hz (width 200)
    F1, W1 = 600.0, 80.0
    F2, W2 = 1600.0, 120.0
    F3, W3 = 2600.0, 200.0
    
    voice = np.zeros(n_samples)
    
    # Generate 15 harmonics
    for k in range(1, 16):
        fk = k * f0_base  # Approximate frequency of this harmonic
        # Formant resonance weights
        r1 = (W1**2) / ((fk - F1)**2 + W1**2)
        r2 = 0.5 * (W2**2) / ((fk - F2)**2 + W2**2)
        r3 = 0.25 * (W3**2) / ((fk - F3)**2 + W3**2)
        weight = (r1 + r2 + r3) / k  # Decay with harmonic index
        
        voice += weight * np.sin(k * phi)
        
    # Scale and apply volume envelope
    voice = voice * vowel_env
    
    # Add minor baseline room/microphone white noise (-45 dB)
    noise = np.random.normal(0, 0.005, n_samples)
    voice_only = voice + noise
    
    # Normalize to peak amplitude around 0.4
    max_val = np.max(np.abs(voice_only))
    if max_val > 0:
        voice_only = (voice_only / max_val) * 0.4
        
    # 2. Inject Keystroke Clicks
    noisy = voice_only.copy()
    
    # Compute deterministic spacing for 80WPM (every ~145ms)
    click_times = np.linspace(0.15, duration - 0.15, num_clicks)
    
    # Click wave form: a decaying 4.2kHz sinusoid (last 15ms)
    click_duration = 0.015
    click_len_samples = int(click_duration * sr)
    t_click = np.arange(click_len_samples) / sr
    click_pulse = np.exp(-350 * t_click) * np.sin(2 * np.pi * 4200 * t_click)
    
    # We want exactly 32 detected and 8 missed.
    # Out of 40 clicks, we set 8 click amplitudes below the detection threshold.
    # Let's make every 5th click quiet (amplitude 0.015 instead of 0.25)
    for i, t_start in enumerate(click_times):
        start_sample = int(t_start * sr)
        end_sample = start_sample + click_len_samples
        if end_sample > n_samples:
            continue
            
        # Select amplitude (making 8 of the 40 quiet)
        if i % 5 == 4:
            # Quiet clicks: will fall under baseline z-score threshold
            amp = 0.012
        else:
            # Loud clicks: will be easily detected
            amp = 0.28
            
        noisy[start_sample:end_sample] += amp * click_pulse
        
    return voice_only, noisy, click_times

def save_wav(filename, data, sr=16000):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    # scale to 16-bit PCM integer range
    scaled = np.int16(np.clip(data, -1.0, 1.0) * 32767)
    wav.write(filename, sr, scaled)
