# KeyClean REST API Specification

The FastAPI backend exposes the following endpoints on port 8000:

- GET /: Serves the Single Page Application UI.
- POST /api/clean: Processes uploaded audio file and returns clean audio.
- POST /api/synth: Runs synthetic signal benchmark.
- GET /docs: Interactive Swagger UI.
