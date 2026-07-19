import { describe, expect, it } from 'vitest'

import { OperationalMetricsService } from './operational-metrics.service'

describe('OperationalMetricsService', () => {
  it('renders bounded route/status metrics without actor labels', () => {
    const metrics = new OperationalMetricsService()
    metrics.observeRequest('GET', '/v1/health-records/:recordId', 200, 0.024)
    metrics.observeRequest('GET', '/v1/health-records/:recordId', 404, 0.31)
    metrics.observeRequest('attacker-controlled-method', '/unmatched', 999, 0.01)
    metrics.recordRateLimitRejection('privacy_export')
    metrics.recordRateLimitBackendFailure()

    const output = metrics.render()
    expect(output).toContain(
      'myfitness_http_requests_total{method="GET",route="/v1/health-records/:recordId",status="200"} 1',
    )
    expect(output).toContain('myfitness_http_request_duration_seconds_count')
    expect(output).toContain(
      'myfitness_http_requests_total{method="OTHER",route="/unmatched",status="0"} 1',
    )
    expect(output).not.toContain('attacker-controlled-method')
    expect(output).toContain('myfitness_rate_limit_rejections_total{policy="privacy_export"} 1')
    expect(output).toContain('myfitness_rate_limit_backend_failures_total 1')
    expect(output).not.toContain('user_id')
    expect(output).not.toContain('request_id')
  })
})
