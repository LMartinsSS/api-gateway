export class Metrics {
  private requests = 0;
  private errors = 0;
  private totalDurationMs = 0;

  record(statusCode: number, durationMs: number): void {
    this.requests += 1;
    this.totalDurationMs += durationMs;
    if (statusCode >= 500) this.errors += 1;
  }

  render(): string {
    return [
      '# HELP gateway_http_requests_total Total HTTP requests.',
      '# TYPE gateway_http_requests_total counter',
      `gateway_http_requests_total ${this.requests}`,
      '# HELP gateway_http_errors_total Total 5xx responses.',
      '# TYPE gateway_http_errors_total counter',
      `gateway_http_errors_total ${this.errors}`,
      '# HELP gateway_http_request_duration_ms_sum Sum of request durations.',
      '# TYPE gateway_http_request_duration_ms_sum counter',
      `gateway_http_request_duration_ms_sum ${this.totalDurationMs.toFixed(3)}`,
      ''
    ].join('\n');
  }
}
