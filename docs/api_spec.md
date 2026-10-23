# KeyClean REST API Specification

The FastAPI backend exposes the following endpoints on port 8000:

- GET /: Serves the Single Page Application UI.
- POST /api/clean: Processes uploaded audio file and returns clean audio.
- POST /api/synth: Runs synthetic signal benchmark.
- GET /docs: Interactive Swagger UI.

## HTTP Error Status Codes
| Status | Meaning | Reason |
|:---:|:---|:---|
| 400 | Bad Request | Unsupported audio format or corrupted WAV header |
| 413 | Payload Too Large | Uploaded file exceeds maximum 50MB limit |
| 422 | Unprocessable Entity | Invalid DSP numeric parameters (e.g. negative threshold) |
