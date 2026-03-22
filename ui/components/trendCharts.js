function drawSparkline(canvas, values, color) {
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  canvas.width = Math.floor(width * window.devicePixelRatio);
  canvas.height = Math.floor(height * window.devicePixelRatio);
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!values.length) return;

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(1e-6, maxV - minV);

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1 || 1)) * width;
    const y = height - ((v - minV) / range) * (height - 6) - 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export class TrendCharts {
  constructor(speedCanvas, confidenceCanvas) {
    this.speedCanvas = speedCanvas;
    this.confidenceCanvas = confidenceCanvas;
    this.speedHistory = [];
    this.confidenceHistory = [];
  }

  render(state) {
    this.speedHistory.push(state.telemetry.speed);
    this.confidenceHistory.push(state.telemetry.gateDetectionConfidence * 100);
    if (this.speedHistory.length > 100) this.speedHistory.shift();
    if (this.confidenceHistory.length > 100) this.confidenceHistory.shift();

    drawSparkline(this.speedCanvas, this.speedHistory, "#38bdf8");
    drawSparkline(this.confidenceCanvas, this.confidenceHistory, "#f59e0b");
  }

  reset() {
    this.speedHistory = [];
    this.confidenceHistory = [];
  }
}
