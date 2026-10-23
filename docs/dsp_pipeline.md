# KeyClean Digital Signal Processing Pipeline Guide

This guide details the mathematical foundations and signal processing steps utilized across src/detector.py and src/inpaint.py.

## Table of Contents
1. Short-Time Fourier Transform (STFT) Analysis
2. High-Frequency Spectral Flux
3. Dynamic Energy Ratio Metric
4. Rolling Median Absolute Deviation (MAD)
5. Hysteresis State Machine
6. S-Curve Crossfade Inpainting

## 1. STFT Windowing & Hann Tapering
KeyClean uses an analysis window length of  = 512$ samples (11.6 ms at 44.1 kHz) and a hop length of  = 128$ samples (2.9 ms, 75% frame overlap).
Hann window tapering reduces spectral leakage:
w[n] = 0.5 \left(1 - \cos\left(\frac{2\pi n}{N-1}\right)\right)

## 2. High-Frequency Energy Ratio
Mechanical key switches produce substantial acoustic acoustic emissions between 3 kHz and 8 kHz.
KeyClean calculates the ratio of energy in this frequency band relative to total spectral frame energy:
R_{HF}(t) = \frac{\sum_{f \ge 3000\text{Hz}} |X(f, t)|^2}{\sum_{f} |X(f, t)|^2 + \delta}

## 3. Hysteresis Double Threshold State Machine
To capture the full acoustic envelope (initial switch strike through keybed rebound):
- **Trigger Condition**: State transitions to ACTIVE when (t) \ge T_{high}$.
- **Release Condition**: State returns to IDLE when (t) < T_{low}$ for at least $ frames.
This prevents premature cutoff of key release sound tails.

## 4. Raised-Cosine S-Curve Inpainting
Detected regions $[t_{start}, t_{end}]$ are bridged using a raised cosine transition:
w_{cross}(k) = 0.5 \left(1 - \cos\left(\frac{\pi k}{L-1}\right)\right), \quad k \in [0, L-1]
y[t_{start} + k] = (1 - w_{cross}(k)) \cdot y_{pre}[k] + w_{cross}(k) \cdot y_{post}[k]
This maintains ^1$ derivative continuity at the gap borders, completely eliminating audible discontinuity clicks.
