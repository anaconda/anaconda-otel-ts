# How to Determine Desired OTel Signal Usage

OpenTelemetry (OTel) provides four core signal types to give you comprehensive observability into your applications. As a software engineering team, choosing the right combination of signals is crucial for effective monitoring, debugging, and performance optimization. This guide helps you understand each signal type and make informed decisions about which ones your team needs.

## Understanding the Four Core Signals

### 1. **Traces** - Following Request Journeys

**What it is:** Traces capture the complete path a request takes through your distributed application, showing how different services interact and how long each step takes.

**When to use Traces:**
- **Distributed systems**: When your application spans multiple services, containers, or data centers
- **Performance debugging**: To identify slow components in complex request flows
- **Service dependency mapping**: Understanding how your services communicate
- **Root cause analysis**: Tracking down issues that span multiple system components

**When NOT to use Traces:**
- **Single-service applications**: If your app runs as a monolith, traces provide limited value over basic logging
- **Fire-and-forget operations**: Asynchronous tasks without clear correlation paths are difficult to trace effectively
- **High-volume, low-value operations**: Don't trace every database query or cache hit—focus on meaningful business operations

**Example scenario:** Your e-commerce checkout process involves user service → payment service → inventory service → shipping service. Traces help you see the entire journey and identify if the payment service is causing slowdowns.

### 2. **Metrics** - Measuring System Health

**What it is:** Metrics record quantifiable measurements like CPU usage, request counts, response times, and error rates over time.

**When to use Metrics:**
- **System monitoring**: CPU, memory, disk usage, and network performance
- **Business KPIs**: Request rates, conversion rates, revenue per minute
- **Alerting and SLA monitoring**: Setting thresholds for automated notifications
- **Capacity planning**: Understanding usage trends and growth patterns
- **Dashboard creation**: Creating executive and operational dashboards

**When NOT to use Metrics:**
- **Individual event details**: Metrics aggregate data—they won't tell you why a specific request failed
- **Debugging specific incidents**: Use traces and logs instead for investigation
- **High-cardinality data**: Avoid creating metrics with too many unique label combinations (e.g., metrics per user ID)

**Example scenario:** You need to monitor your API's health with response time percentiles, error rates, and throughput. These metrics help you set up alerts when response times exceed 500ms or error rates go above 1%.

### 3. **Logs** - Recording Discrete Events

**What it is:** Logs capture specific events and state changes in your application, providing detailed context about what happened when.

**When to use Logs:**
- **Application events**: User logins, order completions, configuration changes
- **Error details**: Full stack traces and context for failures
- **Business events**: Audit trails and compliance requirements
- **Debugging context**: Detailed information to support incident investigation
- **Security monitoring**: Authentication attempts, access patterns, suspicious activities

**When NOT to use Logs:**
- **High-frequency operational data**: Don't log every cache hit or routine database query
- **Statistical information**: Use metrics instead for aggregatable data
- **Performance monitoring**: Logs alone won't give you trends and patterns
- **Sensitive information**: Never log passwords, credit card numbers, or personal data

**Example scenario:** When a payment fails, your logs should capture the user ID, transaction amount, payment method, error code, and timestamp. This gives your support team everything needed to help the customer.

### 4. **Baggage** - Propagating Context

**What it is:** [Baggage](./Baggage.md) carries contextual information (like user ID, feature flags, or correlation IDs) across service boundaries throughout a request's lifetime.

**When to use Baggage:**
- **Cross-service context**: Maintaining user identity across microservices
- **Feature flag propagation**: Ensuring consistent feature behavior across services
- **A/B testing**: Carrying experiment context through the entire request flow
- **Correlation identifiers**: Linking related operations across services

**When NOT to use Baggage:**
- **Large data payloads**: Baggage travels with every request—keep it lightweight
- **Sensitive information**: Baggage can be logged or transmitted insecurely
- **Frequently changing data**: Static context works best
- **Performance-critical paths**: Extra overhead may not be worth the benefits

**Example scenario:** A user with premium features makes a request. Baggage carries their "premium_user: true" flag to all services, ensuring they receive premium treatment throughout the request chain.

## Decision Framework for Your Team

### Start Simple: The 80/20 Approach

**For new teams or simple applications:**
1. **Begin with Logs** - Easiest to implement and provides immediate debugging value
2. **Add Metrics** - Essential for monitoring trends and setting up alerts
3. **Consider Traces** - If you have multiple services or performance concerns
4. **Evaluate Baggage** - Only if you need cross-service context

### Scaling Up: Multi-Signal Strategy

**For mature teams with complex systems:**
- **Use all signals together** - They complement each other for complete observability
- **Correlate signals** - Link traces, metrics, and logs using common identifiers
- **Different audiences** - Metrics for dashboards, traces for debugging, logs for incident response

### Resource Considerations

**Implementation costs to consider:**
- **Development time**: Instrumenting code and configuring backends
- **Infrastructure overhead**: Storage, processing, and network costs
- **Operational complexity**: Managing multiple telemetry systems
- **Performance impact**: CPU, memory, and network overhead from instrumentation

### Why Start with Logs?

Logs are the most accessible entry point because:
- **Low barrier to entry**: Most applications already have some logging
- **Immediate value**: Helps with debugging from day one
- **Minimal performance impact**: Simple structured logging has low overhead
- **Easy to understand**: Developers are already familiar with logging concepts
- **Foundation for other signals**: Logs can be enhanced with trace context later

### Common Team Scenarios

**Small team with microservices:** Start with structured logs, then add basic metrics. Consider traces as you grow.

**Enterprise application:** Implement all signals with proper governance. Establish sampling strategies and retention policies.

**Performance-critical system:** Begin with minimal logging, focus on metrics, use traces selectively to minimize overhead.

**Compliance-heavy environment:** Prioritize structured logs with proper retention. Ensure baggage doesn't carry sensitive data.

## Getting Started Recommendations

1. **Start with one signal** - Don't try to implement everything at once
2. **Choose meaningful operations** - Instrument business-critical paths first
3. **Establish baselines** - Collect data before you need it for comparisons
4. **Plan for growth** - Consider sampling and retention strategies early
5. **Train your team** - Ensure everyone understands how to use the observability data

Remember: The goal isn't perfect instrumentation—it's actionable insights that help you build better software and resolve issues faster. Choose the signals that best support your team's specific needs and operational maturity.