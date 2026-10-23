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
