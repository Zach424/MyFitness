import { Injectable } from '@nestjs/common'

const durationBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const
const supportedMethods = new Set([
  'CONNECT',
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
  'TRACE',
])

type RequestCounter = { method: string; route: string; status: number; count: number }
type DurationMetric = {
  method: string
  route: string
  count: number
  sum: number
  buckets: number[]
}

const escapeLabel = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

export const operationalHttpMethod = (value: string) => {
  const normalized = value.toUpperCase()
  return supportedMethods.has(normalized) ? normalized : 'OTHER'
}

export const operationalHttpStatus = (value: number) =>
  Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0

@Injectable()
export class OperationalMetricsService {
  private readonly startedAt = Date.now() / 1_000
  private readonly requestCounters = new Map<string, RequestCounter>()
  private readonly durations = new Map<string, DurationMetric>()
  private readonly rateLimitRejections = new Map<string, number>()
  private rateLimitBackendFailures = 0

  observeRequest(method: string, route: string, status: number, durationSeconds: number) {
    const stableMethod = operationalHttpMethod(method)
    const stableStatus = operationalHttpStatus(status)
    const requestKey = `${stableMethod}\u0000${route}\u0000${stableStatus}`
    const requestCounter = this.requestCounters.get(requestKey) ?? {
      method: stableMethod,
      route,
      status: stableStatus,
      count: 0,
    }
    requestCounter.count += 1
    this.requestCounters.set(requestKey, requestCounter)

    const durationKey = `${stableMethod}\u0000${route}`
    const duration = this.durations.get(durationKey) ?? {
      method: stableMethod,
      route,
      count: 0,
      sum: 0,
      buckets: durationBuckets.map(() => 0),
    }
    duration.count += 1
    duration.sum += durationSeconds
    durationBuckets.forEach((bucket, index) => {
      if (durationSeconds <= bucket) duration.buckets[index]! += 1
    })
    this.durations.set(durationKey, duration)
  }

  recordRateLimitRejection(policy: string) {
    this.rateLimitRejections.set(policy, (this.rateLimitRejections.get(policy) ?? 0) + 1)
  }

  recordRateLimitBackendFailure() {
    this.rateLimitBackendFailures += 1
  }

  render() {
    const lines = [
      '# HELP myfitness_process_start_time_seconds Start time of the API process.',
      '# TYPE myfitness_process_start_time_seconds gauge',
      `myfitness_process_start_time_seconds ${this.startedAt.toFixed(3)}`,
      '# HELP myfitness_http_requests_total Completed HTTP requests.',
      '# TYPE myfitness_http_requests_total counter',
    ]
    for (const metric of [...this.requestCounters.values()].sort((left, right) =>
      `${left.method}${left.route}${left.status}`.localeCompare(
        `${right.method}${right.route}${right.status}`,
      ),
    )) {
      lines.push(
        `myfitness_http_requests_total{method="${escapeLabel(metric.method)}",route="${escapeLabel(metric.route)}",status="${metric.status}"} ${metric.count}`,
      )
    }

    lines.push(
      '# HELP myfitness_http_request_duration_seconds Request duration by stable route template.',
      '# TYPE myfitness_http_request_duration_seconds histogram',
    )
    for (const metric of [...this.durations.values()].sort((left, right) =>
      `${left.method}${left.route}`.localeCompare(`${right.method}${right.route}`),
    )) {
      const labels = `method="${escapeLabel(metric.method)}",route="${escapeLabel(metric.route)}"`
      durationBuckets.forEach((bucket, index) => {
        lines.push(
          `myfitness_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${metric.buckets[index]}`,
        )
      })
      lines.push(
        `myfitness_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`,
        `myfitness_http_request_duration_seconds_sum{${labels}} ${metric.sum.toFixed(6)}`,
        `myfitness_http_request_duration_seconds_count{${labels}} ${metric.count}`,
      )
    }

    lines.push(
      '# HELP myfitness_rate_limit_rejections_total Requests rejected by an abuse policy.',
      '# TYPE myfitness_rate_limit_rejections_total counter',
    )
    for (const [policy, count] of [...this.rateLimitRejections.entries()].sort()) {
      lines.push(`myfitness_rate_limit_rejections_total{policy="${escapeLabel(policy)}"} ${count}`)
    }
    lines.push(
      '# HELP myfitness_rate_limit_backend_failures_total Redis failures that failed requests closed.',
      '# TYPE myfitness_rate_limit_backend_failures_total counter',
      `myfitness_rate_limit_backend_failures_total ${this.rateLimitBackendFailures}`,
    )
    return `${lines.join('\n')}\n`
  }
}
