# UI Dashboard

Static operator dashboard for quick mission playback and telemetry monitoring.

## Run locally

```bash
python -m http.server 8080 --directory ui
```

Open <http://127.0.0.1:8080/>.

## Notes

- No build step required.
- Uses a lightweight in-browser mission simulation (`main.js`).
- Safe to serve from any static web server.
