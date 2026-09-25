# Chaos Arena — Public deployment

This package is ready for Render.

1. Upload/push this folder to a GitHub repository.
2. In Render, choose New > Blueprint and select the repository.
3. Render reads `render.yaml`, installs dependencies, and starts `npm start`.
4. Open the generated `https://...onrender.com` URL.

The `/health` endpoint returns a simple JSON health check.
