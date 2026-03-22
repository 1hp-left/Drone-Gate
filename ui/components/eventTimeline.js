export class EventTimeline {
  constructor(root) {
    this.root = root;
  }

  render(state) {
    this.root.innerHTML = state.event_log
      .slice(0, 80)
      .map(
        (event) => `
          <div class="event-row ${event.severity}">
            <div class="event-time">${event.ts}</div>
            <div class="event-message">${event.message}</div>
          </div>
        `
      )
      .join("");
  }
}
